import type {
  MembershipPersistence,
  PagePersistence,
  PublicPagePersistence,
  SitePersistence,
  TenantPersistence,
} from "@bher/db";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthService } from "../lib/auth";
import type { ApiBindings } from "../types";
import { createAuthRoutes } from "./auth";
import { createMembershipRoutes } from "./memberships";
import { createPageRoutes } from "./pages";
import { createPublicRoutes } from "./public";
import { createSiteRoutes } from "./sites";
import { createTenantRoutes } from "./tenants";

const AUTH_ROUTE = "/auth";
const AUTH_ROUTE_PATTERN = "/auth/*";
const TENANT_ROUTE = "/tenants";
const SITE_ROUTE = "/tenants/:tenantId/sites";
const MEMBERSHIP_ROUTE = "/tenants/:tenantId/members";
const PAGE_ROUTE = "/tenants/:tenantId/sites/:siteId/pages";
const PUBLIC_ROUTE = "/public";

export function createApiRoutes(
  auth: AuthService,
  tenantPersistence: TenantPersistence,
  sitePersistence: SitePersistence,
  membershipPersistence: MembershipPersistence,
  pagePersistence: PagePersistence,
  publicPagePersistence: PublicPagePersistence,
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
  routes.route(AUTH_ROUTE, createAuthRoutes(auth, membershipPersistence));
  routes.route(TENANT_ROUTE, createTenantRoutes(auth, tenantPersistence));
  routes.route(
    SITE_ROUTE,
    createSiteRoutes(auth, tenantPersistence, sitePersistence),
  );
  routes.route(
    MEMBERSHIP_ROUTE,
    createMembershipRoutes(auth, tenantPersistence, membershipPersistence),
  );
  routes.route(
    PAGE_ROUTE,
    createPageRoutes(auth, tenantPersistence, pagePersistence),
  );
  routes.route(PUBLIC_ROUTE, createPublicRoutes(publicPagePersistence));
  return routes;
}
