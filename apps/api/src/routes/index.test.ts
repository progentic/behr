import { expect, test } from "bun:test";

import type { AuthService } from "../lib/auth";
import { createApiRoutes } from "./index";

const ADMIN_ORIGIN = "http://localhost:3001";

test("allows credentialed auth requests only for the configured admin origin", async () => {
  const routes = createApiRoutes(
    createFakeAuthService(),
    {
      createTenantWithOwner: async () => {
        throw new Error("Tenant creation is not used by this CORS test.");
      },
      listTenantAccess: async () => [],
      resolveTenantAccess: async () => null,
    },
    {
      createSite: async () => {
        throw new Error("Site creation is not used by this CORS test.");
      },
      listSites: async () => [],
    },
    {
      listMembers: async () => [],
      resolveIdentityByEmail: async () => null,
      addExistingMember: async () => {
        throw new Error("Membership addition is not used by this CORS test.");
      },
      createOrRotateInvitation: async () => {
        throw new Error("Invitation creation is not used by this CORS test.");
      },
      resolveInvitation: async () => null,
      completeInvitation: async () => undefined,
    },
    {
      listPages: async () => [],
      createPage: async () => {
        throw new Error("Page creation is not used by this CORS test.");
      },
      resolvePageDraft: async () => null,
      saveDraftVersion: async () => null,
    },
    {
      resolvePublishedPage: async () => null,
      resolvePublishedAsset: async () => null,
    },
    {
      createOrRotatePreviewToken: async () => null,
      resolvePreviewPage: async () => null,
      resolvePreviewAsset: async () => null,
    },
    {
      resolvePublishCandidate: async () => null,
      commitPublication: async () => "not-found",
    },
    {
      resolveAssetSite: async () => false,
      createAssetMetadata: async () => null,
      listSiteAssets: async () => [],
    },
    {
      writeOriginal: async () => {
        throw new Error("Asset storage is not used by this CORS test.");
      },
      removeOriginal: async () => undefined,
      readOriginal: async () => new Uint8Array(),
    },
    ADMIN_ORIGIN,
  );
  const response = await routes.request("/auth/login", {
    method: "OPTIONS",
    headers: {
      origin: ADMIN_ORIGIN,
      "access-control-request-method": "POST",
    },
  });

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
});

function createFakeAuthService(): AuthService {
  return {
    login: async () => {
      throw new Error("Login is not used by this CORS test.");
    },
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => null,
    registerIdentity: async () => ({
      id: "unused",
      email: "unused@example.com",
      displayName: "Unused",
    }),
    isTrustedOrigin: (origin) => origin === ADMIN_ORIGIN,
  };
}
