import type {
  AssetPersistence,
  MembershipPersistence,
  PagePersistence,
  PublicPagePersistence,
  PreviewPersistence,
  PublishPersistence,
  SitePersistence,
  TenantPersistence,
} from "@bher/db";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AuthService } from "../lib/auth";
import type { AssetStorage } from "../lib/asset-storage";
import type { ApiBindings } from "../types";
import { createAuthRoutes } from "./auth";
import { createAssetRoutes } from "./assets";
import { createMembershipRoutes } from "./memberships";
import { createPageRoutes } from "./pages";
import { createPublicRoutes } from "./public";
import { createPreviewRoutes } from "./preview";
import { createSiteRoutes } from "./sites";
import { createTenantRoutes } from "./tenants";

const AUTH_ROUTE = "/auth";
const AUTH_ROUTE_PATTERN = "/auth/*";
const TENANT_ROUTE = "/tenants";
const SITE_ROUTE = "/tenants/:tenantId/sites";
const MEMBERSHIP_ROUTE = "/tenants/:tenantId/members";
const PAGE_ROUTE = "/tenants/:tenantId/sites/:siteId/pages";
const PUBLIC_ROUTE = "/public";
const PREVIEW_ROUTE = "/preview";
const ASSET_ROUTE = "/tenants/:tenantId/sites/:siteId/assets";

export function createApiRoutes(
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
    createPageRoutes(
      auth,
      tenantPersistence,
      pagePersistence,
      previewPersistence,
      publishPersistence,
    ),
  );
  routes.route(PUBLIC_ROUTE, createPublicRoutes(publicPagePersistence));
  routes.route(PREVIEW_ROUTE, createPreviewRoutes(previewPersistence));
  routes.route(
    ASSET_ROUTE,
    createAssetRoutes(
      auth,
      tenantPersistence,
      assetPersistence,
      assetStorage,
    ),
  );
  return routes;
}
