import {
  type Environment,
  createAuthPersistence,
  createDatabaseClient,
  createMembershipPersistence,
  createPagePersistence,
  createPublicPagePersistence,
  createSitePersistence,
  createTenantPersistence,
  loadDatabaseConfig,
  type TenantPersistence,
  type SitePersistence,
  type MembershipPersistence,
  type PagePersistence,
  type PublicPagePersistence,
} from "@bher/db";
import { Hono } from "hono";

import { loadApiConfig } from "./env";
import { type AuthService, createAuthService } from "./lib/auth";
import { createJsonResponse } from "./lib/http";
import { createApiRoutes } from "./routes";
import type { ApiBindings } from "./types";

const HEALTH_ROUTE = "/health";
const ROUTE_ROOT = "/";
const INTERNAL_ERROR_STATUS = 500;

export type ApiApplication = Readonly<{
  app: Hono<ApiBindings>;
  auth: AuthService;
  close: () => Promise<void>;
  server: Readonly<{
    port: number;
    fetch: Hono<ApiBindings>["fetch"];
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
  const app = createHttpApplication(
    auth,
    tenantPersistence,
    sitePersistence,
    membershipPersistence,
    pagePersistence,
    publicPagePersistence,
    apiConfig.auth.adminOrigin,
  );
  return Object.freeze({
    app,
    auth,
    close: () => database.close(),
    server: Object.freeze({ port: apiConfig.port, fetch: app.fetch }),
  });
}

function createHttpApplication(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  sitePersistence: SitePersistence,
  membershipPersistence: MembershipPersistence,
  pagePersistence: PagePersistence,
  publicPagePersistence: PublicPagePersistence,
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
      adminOrigin,
    ),
  );
  app.onError(() =>
    createJsonResponse(
      { error: "Internal server error." },
      INTERNAL_ERROR_STATUS,
    ),
  );
  return app;
}
