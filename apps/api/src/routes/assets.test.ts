import { afterEach, describe, expect, test } from "bun:test";
import type { AuthenticatedSession } from "@bher/contracts";
import type {
  AssetPersistence,
  TenantPersistence,
} from "@bher/db";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import { createAssetStorage } from "../lib/asset-storage";
import type { ApiBindings } from "../types";
import { createAssetRoutes, normalizeAssetContentType } from "./assets";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const SITE_ID = "22222222-2222-4222-8222-222222222222";
const TRUSTED_ORIGIN = "https://admin.behr.example";
const ASSET_ROUTE = `/tenants/${TENANT_ID}/sites/${SITE_ID}/assets`;
const AUTHENTICATED_SESSION: AuthenticatedSession = {
  status: "authenticated",
  user: {
    id: "asset-test-user",
    email: "asset-test@example.com",
    displayName: "Asset Test User",
  },
  expiresAt: "2026-09-06T00:00:00.000Z",
};
const createdRoots: string[] = [];

afterEach(async () => {
  for (const root of createdRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("asset upload orchestration", () => {
  test("removes the stored file after metadata failure", async () => {
    const root = await createTemporaryRoot();
    const routes = createTestApplication(
      {
        resolveAssetSite: async () => true,
        createAssetMetadata: async () => {
          throw new Error("simulated metadata failure");
        },
        listSiteAssets: async () => [],
      },
      root,
    );

    const response = await routes.request(
      ASSET_ROUTE,
      createUploadRequest("failure.txt"),
    );

    expect(response.status).toBe(500);
    expect(await listStoredFiles(root)).toEqual([]);
  });

  test("removes the stored file when metadata scope is lost", async () => {
    const root = await createTemporaryRoot();
    const routes = createTestApplication(
      {
        resolveAssetSite: async () => true,
        createAssetMetadata: async () => null,
        listSiteAssets: async () => [],
      },
      root,
    );

    const response = await routes.request(
      ASSET_ROUTE,
      createUploadRequest("scope-loss.txt"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Asset target not found." });
    expect(await listStoredFiles(root)).toEqual([]);
  });

  test("normalizes unusable content-type metadata", () => {
    expect(normalizeAssetContentType("")).toBe("application/octet-stream");
    expect(normalizeAssetContentType("   ")).toBe("application/octet-stream");
    expect(normalizeAssetContentType("a".repeat(256))).toBe(
      "application/octet-stream",
    );
    expect(normalizeAssetContentType("text/plain\u0007")).toBe(
      "application/octet-stream",
    );
    expect(normalizeAssetContentType(" text/plain ")).toBe("text/plain");
  });

  test("translates malformed multipart parsing to HTTP 400", async () => {
    const root = await createTemporaryRoot();
    const routes = createTestApplication(createUnusedAssetPersistence(), root);

    const response = await routes.request(ASSET_ROUTE, {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=missing-boundary",
        origin: TRUSTED_ORIGIN,
      },
      body: "malformed multipart body",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Asset upload is invalid.",
    });
    const missingBoundaryResponse = await routes.request(ASSET_ROUTE, {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data",
        origin: TRUSTED_ORIGIN,
      },
      body: "multipart body without a boundary",
    });
    expect(missingBoundaryResponse.status).toBe(400);
    expect(await missingBoundaryResponse.json()).toEqual({
      error: "Asset upload is invalid.",
    });
    expect(await listStoredFiles(root)).toEqual([]);
  });

  test("propagates an unexpected consumed-body error to HTTP 500", async () => {
    const root = await createTemporaryRoot();
    const routes = createTestApplication(
      createUnusedAssetPersistence(),
      root,
      true,
    );

    const response = await routes.request(
      ASSET_ROUTE,
      createUploadRequest("consumed.txt", true),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error.",
    });
    expect(await listStoredFiles(root)).toEqual([]);
  });

  test("lists only strict renderable site assets without trusted origin", async () => {
    const root = await createTemporaryRoot();
    const createdAt = new Date("2026-08-31T12:00:00.000Z");
    const routes = createTestApplication(
      {
        resolveAssetSite: async () => true,
        createAssetMetadata: async () => null,
        listSiteAssets: async () => [
          {
            id: "33333333-3333-4333-8333-333333333333",
            originalFilename: "photo.jpg",
            contentType: "image/jpeg",
            byteSize: 12,
            createdAt,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            originalFilename: "document.pdf",
            contentType: "application/pdf",
            byteSize: 24,
            createdAt,
          },
        ],
      },
      root,
    );

    const response = await routes.request(ASSET_ROUTE);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assets: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          originalFilename: "photo.jpg",
          contentType: "image/jpeg",
          byteSize: 12,
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });
});

function createTestApplication(
  assetPersistence: AssetPersistence,
  storageRoot: string,
  consumeRequestBody = false,
): Hono<ApiBindings> {
  const app = new Hono<ApiBindings>();
  if (consumeRequestBody) {
    app.use("/tenants/:tenantId/sites/:siteId/assets", async (context, next) => {
      await context.req.raw.text();
      await next();
    });
  }
  app.route(
    "/tenants/:tenantId/sites/:siteId/assets",
    createAssetRoutes(
      createFakeAuthService(),
      createFakeTenantPersistence(),
      assetPersistence,
      createAssetStorage(storageRoot),
    ),
  );
  app.onError(() =>
    new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  );
  return app;
}

function createFakeAuthService(): AuthService {
  return {
    login: async () => {
      throw new Error("Login is not used by this asset route test.");
    },
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => AUTHENTICATED_SESSION,
    registerIdentity: async () => AUTHENTICATED_SESSION.user,
    isTrustedOrigin: (origin) => origin === TRUSTED_ORIGIN,
  };
}

function createFakeTenantPersistence(): TenantPersistence {
  return {
    createTenantWithOwner: async () => {
      throw new Error("Tenant creation is not used by this asset route test.");
    },
    listTenantAccess: async () => [],
    resolveTenantAccess: async () => ({
      id: TENANT_ID,
      name: "Asset Tenant",
      role: "owner",
    }),
  };
}

function createUploadRequest(
  filename: string,
  includeContentLength = false,
): RequestInit {
  const form = new FormData();
  form.append(
    "file",
    new File(["asset bytes"], filename, { type: "text/plain" }),
  );
  const headers = new Headers({ origin: TRUSTED_ORIGIN });
  if (includeContentLength) {
    headers.set("content-length", "1");
  }
  return { method: "POST", headers, body: form };
}

function createUnusedAssetPersistence(): AssetPersistence {
  return {
    resolveAssetSite: async () => true,
    createAssetMetadata: async () => {
      throw new Error("Metadata is not used by multipart error tests.");
    },
    listSiteAssets: async () => [],
  };
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "behr-asset-route-"));
  createdRoots.push(root);
  return root;
}

async function listStoredFiles(root: string): Promise<string[]> {
  const sitePath = join(root, SITE_ID);
  return (await Bun.file(sitePath).exists()) ? await readdir(sitePath) : [];
}
