import type { TenantPersistence } from "@bher/db";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthService } from "../lib/auth";
import type { ApiBindings } from "../types";
import { createAuthRoutes } from "./auth";
import { createTenantRoutes } from "./tenants";

const AUTH_ROUTE = "/auth";
const AUTH_ROUTE_PATTERN = "/auth/*";
const TENANT_ROUTE = "/tenants";

export function createApiRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  adminOrigin: string,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  routes.use(
    AUTH_ROUTE_PATTERN,
    cors({
      origin: adminOrigin,
      credentials: true,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );
  routes.route(AUTH_ROUTE, createAuthRoutes(auth));
  routes.route(TENANT_ROUTE, createTenantRoutes(auth, tenantPersistence));
  return routes;
}
