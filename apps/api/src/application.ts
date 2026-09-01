import {
  type Environment,
  createAssetPersistence,
  createAuthPersistence,
  createDatabaseClient,
  createMembershipPersistence,
  createPagePersistence,
  createPublicPagePersistence,
  createPreviewPersistence,
  createPublishPersistence,
  createSitePersistence,
  createTenantPersistence,
  loadDatabaseConfig,
  type TenantPersistence,
  type SitePersistence,
  type MembershipPersistence,
  type PagePersistence,
  type PublicPagePersistence,
  type PreviewPersistence,
  type PublishPersistence,
  type AssetPersistence,
} from "@bher/db";
import { Hono } from "hono";

import { loadApiConfig } from "./env";
import { type AuthService, createAuthService } from "./lib/auth";
import { type AssetStorage, createAssetStorage } from "./lib/asset-storage";
import { createJsonResponse } from "./lib/http";
import { createApiRoutes } from "./routes";
import type { ApiBindings } from "./types";

const HEALTH_ROUTE = "/health";
const ROUTE_ROOT = "/";
const PRODUCTION_HOSTNAME = "127.0.0.1";
const INTERNAL_ERROR_STATUS = 500;
const SAFE_ERROR_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

export type ApiApplication = Readonly<{
  app: Hono<ApiBindings>;
  auth: AuthService;
  close: () => Promise<void>;
  server: Readonly<{
    hostname: string;
    port: number;
    fetch: Hono<ApiBindings>["fetch"];
    error: (error: Error) => Response;
  }>;
}>;

export function createApiApplication(environment: Environment): ApiApplication {
  const apiConfig = loadApiConfig(environment);
  const databaseConfig = loadDatabaseConfig(environment);
  const database = createDatabaseClient(databaseConfig);
  const authPersistence = createAuthPersistence(database);
  const auth = createAuthService(apiConfig.auth, authPersistence);
  const tenantPersistence = createTenantPersistence(database);
  const sitePersistence = createSitePersistence(database);
  const membershipPersistence = createMembershipPersistence(database);
  const pagePersistence = createPagePersistence(database);
  const publicPagePersistence = createPublicPagePersistence(database);
  const previewPersistence = createPreviewPersistence(database);
  const publishPersistence = createPublishPersistence(database);
  const assetPersistence = createAssetPersistence(database);
  const assetStorage = createAssetStorage(apiConfig.assets.storageRoot);
  const app = createHttpApplication(
    auth,
    tenantPersistence,
    sitePersistence,
    membershipPersistence,
    pagePersistence,
    publicPagePersistence,
    previewPersistence,
    publishPersistence,
    assetPersistence,
    assetStorage,
    apiConfig.auth.adminOrigin,
  );
  return Object.freeze({
    app,
    auth,
    close: () => database.close(),
    server: Object.freeze({
      hostname: PRODUCTION_HOSTNAME,
      port: apiConfig.port,
      fetch: app.fetch,
      error: handleUnhandledServerError,
    }),
  });
}

function createHttpApplication(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  sitePersistence: SitePersistence,
  membershipPersistence: MembershipPersistence,
  pagePersistence: PagePersistence,
  publicPagePersistence: PublicPagePersistence,
  previewPersistence: PreviewPersistence,
  publishPersistence: PublishPersistence,
  assetPersistence: AssetPersistence,
  assetStorage: AssetStorage,
  adminOrigin: string,
): Hono<ApiBindings> {
  const app = new Hono<ApiBindings>();
  app.get(HEALTH_ROUTE, (context) => context.json({ status: "ok" }));
  app.route(
    ROUTE_ROOT,
    createApiRoutes(
      auth,
      tenantPersistence,
      sitePersistence,
      membershipPersistence,
      pagePersistence,
      publicPagePersistence,
      previewPersistence,
      publishPersistence,
      assetPersistence,
      assetStorage,
      adminOrigin,
    ),
  );
  app.onError((error, context) => {
    writeUnhandledRequestError(
      error,
      context.req.method,
      context.req.url,
    );
    return createInternalErrorResponse();
  });
  return app;
}

function handleUnhandledServerError(error: Error): Response {
  writeUnhandledServerError(error);
  return createInternalErrorResponse();
}

function createInternalErrorResponse(): Response {
  return createJsonResponse(
    { error: "Internal server error." },
    INTERNAL_ERROR_STATUS,
  );
}

function writeUnhandledRequestError(
  error: Error,
  method: string,
  requestUrl: string,
): void {
  try {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "unhandled_request_error",
        method,
        pathname: new URL(requestUrl).pathname,
        errorType: readErrorType(error),
      }),
    );
  } catch {
    // Error reporting must not break the fail-closed response.
  }
}

function writeUnhandledServerError(error: Error): void {
  try {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "unhandled_server_error",
        errorType: readErrorType(error),
      }),
    );
  } catch {
    // Error reporting must not break the fail-closed response.
  }
}

function readErrorType(error: Error): string {
  const name: unknown = error.name;
  return typeof name === "string" && SAFE_ERROR_TYPE_PATTERN.test(name)
    ? name
    : "Error";
}
