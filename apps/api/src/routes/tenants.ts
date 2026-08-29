import {
  type TenantAccess,
  type TenantListResponse,
  createTenantRequestSchema,
} from "@bher/contracts";
import type { TenantPersistence } from "@bher/db";
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

export function createTenantRoutes(
  auth: AuthService,
  persistence: TenantPersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use("*", createRequireAuthentication(auth));
  routes.post("/", createRequireTrustedOrigin(auth), (context) =>
    handleCreateTenant(context, persistence),
  );
  routes.get("/", (context) => handleListTenants(context, persistence));
  routes.get(
    "/:tenantId",
    createRequireTenantMembership(persistence),
    (context) => createJsonResponse(context.get("tenantAccess"), OK_STATUS),
  );
  return routes;
}

async function handleCreateTenant(
  context: Context<ApiBindings>,
  persistence: TenantPersistence,
): Promise<Response> {
  const request = createTenantRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createJsonResponse(
      { error: "Tenant request is invalid." },
      BAD_REQUEST_STATUS,
    );
  }
  const userId = context.get("authenticatedSession").user.id;
  const access: TenantAccess = await persistence.createTenantWithOwner(
    userId,
    request.data.name,
  );
  return createJsonResponse(access, CREATED_STATUS);
}

async function handleListTenants(
  context: Context<ApiBindings>,
  persistence: TenantPersistence,
): Promise<Response> {
  const userId = context.get("authenticatedSession").user.id;
  const body: TenantListResponse = {
    tenants: await persistence.listTenantAccess(userId),
  };
  return createJsonResponse(body, OK_STATUS);
}
