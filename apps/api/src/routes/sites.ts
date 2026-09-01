import {
  DEFAULT_THEME_TOKENS,
  type SiteListResponse,
  type SiteSettingsResponse,
  type SiteSummary,
  createSiteRequestSchema,
  siteIdSchema,
  siteSettingsResponseSchema,
  updateSiteSettingsRequestSchema,
} from "@bher/contracts";
import {
  type SitePersistence,
  SiteHostnameConflictError,
  type TenantPersistence,
} from "@bher/db";
import type { Context } from "hono";
import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import { createJsonResponse, readJsonBody } from "../lib/http";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import { createRequireTenantMembership } from "../middleware/tenant";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const CREATED_STATUS = 201;
const BAD_REQUEST_STATUS = 400;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;

type ResolvedSiteSettings = NonNullable<
  Awaited<ReturnType<SitePersistence["resolveSiteSettings"]>>
>;

export function createSiteRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  sitePersistence: SitePersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use("*", createRequireAuthentication(auth));
  routes.use("*", createRequireTenantMembership(tenantPersistence));
  routes.post("/", createRequireTrustedOrigin(auth), (context) =>
    handleCreateSite(context, sitePersistence),
  );
  routes.get("/", (context) => handleListSites(context, sitePersistence));
  routes.get("/:siteId/settings", (context) =>
    handleResolveSiteSettings(context, sitePersistence),
  );
  routes.put(
    "/:siteId/settings",
    createRequireTrustedOrigin(auth),
    (context) => handleUpdateSiteSettings(context, sitePersistence),
  );
  return routes;
}

async function handleResolveSiteSettings(
  context: Context<ApiBindings>,
  persistence: SitePersistence,
): Promise<Response> {
  const tenantAccess = context.get("tenantAccess");
  if (tenantAccess.role !== "owner") {
    return createSiteSettingsNotAllowedResponse();
  }
  const siteId = siteIdSchema.safeParse(context.req.param("siteId"));
  if (!siteId.success) {
    return createSiteNotFoundResponse();
  }
  const record = await persistence.resolveSiteSettings(
    tenantAccess.id,
    siteId.data,
  );
  if (!record) {
    return createSiteNotFoundResponse();
  }
  return createJsonResponse(toSiteSettingsResponse(record), OK_STATUS);
}

async function handleUpdateSiteSettings(
  context: Context<ApiBindings>,
  persistence: SitePersistence,
): Promise<Response> {
  const tenantAccess = context.get("tenantAccess");
  if (tenantAccess.role !== "owner") {
    return createSiteSettingsNotAllowedResponse();
  }
  const siteId = siteIdSchema.safeParse(context.req.param("siteId"));
  if (!siteId.success) {
    return createSiteNotFoundResponse();
  }
  const request = updateSiteSettingsRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createInvalidSiteSettingsResponse();
  }
  const record = await persistence.updateSiteSettings(
    tenantAccess.id,
    siteId.data,
    request.data.name,
    request.data.theme,
  );
  if (!record) {
    return createSiteNotFoundResponse();
  }
  return createJsonResponse(toSiteSettingsResponse(record), OK_STATUS);
}

function toSiteSettingsResponse(
  record: ResolvedSiteSettings,
): SiteSettingsResponse {
  return siteSettingsResponseSchema.parse({
    site: record.site,
    theme: record.theme ?? DEFAULT_THEME_TOKENS,
  });
}

function createSiteSettingsNotAllowedResponse(): Response {
  return createJsonResponse(
    { error: "Site settings are not allowed." },
    FORBIDDEN_STATUS,
  );
}

function createSiteNotFoundResponse(): Response {
  return createJsonResponse({ error: "Site not found." }, NOT_FOUND_STATUS);
}

function createInvalidSiteSettingsResponse(): Response {
  return createJsonResponse(
    { error: "Site settings request is invalid." },
    BAD_REQUEST_STATUS,
  );
}

async function handleCreateSite(
  context: Context<ApiBindings>,
  persistence: SitePersistence,
): Promise<Response> {
  const tenantAccess = context.get("tenantAccess");
  if (tenantAccess.role !== "owner") {
    return createJsonResponse(
      { error: "Site creation is not allowed." },
      FORBIDDEN_STATUS,
    );
  }
  const request = createSiteRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createJsonResponse(
      { error: "Site request is invalid." },
      BAD_REQUEST_STATUS,
    );
  }
  try {
    const site: SiteSummary = await persistence.createSite(
      tenantAccess.id,
      request.data.name,
      request.data.hostname,
    );
    return createJsonResponse(site, CREATED_STATUS);
  } catch (error) {
    if (error instanceof SiteHostnameConflictError) {
      return createJsonResponse(
        { error: "Hostname is already assigned." },
        CONFLICT_STATUS,
      );
    }
    throw error;
  }
}

async function handleListSites(
  context: Context<ApiBindings>,
  persistence: SitePersistence,
): Promise<Response> {
  const body: SiteListResponse = {
    sites: await persistence.listSites(context.get("tenantAccess").id),
  };
  return createJsonResponse(body, OK_STATUS);
}
