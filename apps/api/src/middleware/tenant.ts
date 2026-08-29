import { type TenantAccess, tenantIdSchema } from "@bher/contracts";
import type { TenantPersistence } from "@bher/db";
import type { MiddlewareHandler } from "hono";

import { createJsonResponse } from "../lib/http";
import type { ApiBindings } from "../types";

const NOT_FOUND_STATUS = 404;

export function createRequireTenantMembership(
  persistence: TenantPersistence,
): MiddlewareHandler<ApiBindings> {
  return async (context, next) => {
    const tenantId = tenantIdSchema.safeParse(context.req.param("tenantId"));
    if (!tenantId.success) {
      return createTenantNotFoundResponse();
    }
    const userId = context.get("authenticatedSession").user.id;
    const access: TenantAccess | null = await persistence.resolveTenantAccess(
      userId,
      tenantId.data,
    );
    if (!access) {
      return createTenantNotFoundResponse();
    }
    context.set("tenantAccess", access);
    await next();
  };
}

function createTenantNotFoundResponse(): Response {
  return createJsonResponse({ error: "Tenant not found." }, NOT_FOUND_STATUS);
}
