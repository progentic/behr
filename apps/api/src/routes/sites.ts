import {
  type SiteListResponse,
  type SiteSummary,
  createSiteRequestSchema,
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
const CONFLICT_STATUS = 409;

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
  return routes;
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
