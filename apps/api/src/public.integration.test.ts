import { expect, test } from "bun:test";
import {
  type PageDocument,
  type PageDraft,
  pageDraftSchema,
  publicPageResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  assets,
  createDatabaseClient,
  loadDatabaseConfig,
} from "@bher/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";
import { createAssetStorage } from "./lib/asset-storage";

const OWNER_PASSWORD = "public-owner-password";
const EXPECTED_HOSTNAME = "published.example.com";
const SECOND_HOSTNAME = "second.example.com";
const JSON_CONTENT_TYPE = "application/json";
const DOCUMENT_A = createParagraphDocument("Published document A");
const DOCUMENT_B = createParagraphDocument("Unpublished document B");
const SECOND_SITE_DOCUMENT = createParagraphDocument("Second site document");

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

test("resolves only authoritative published page state", verifyPublicReadLifecycle);

async function verifyPublicReadLifecycle(): Promise<void> {
  const storageRoot = await mkdtemp(join(tmpdir(), "behr-public-assets-"));
  const environment = { ...process.env, ASSET_STORAGE_ROOT: storageRoot };
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const origin = loadApiConfig(environment).auth.baseUrl;
  const identity = createIdentity();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    await observer.connect();
    const owner = await application.auth.registerIdentity(
      identity,
      new Headers({ origin }),
    );
    createdUserIds.push(owner.id);
    const ownerCookie = await authenticateIdentity(
      application,
      origin,
      identity,
    );
    const tenant = await createTenant(application, origin, ownerCookie);
    createdTenantIds.push(tenant.id);
    const site = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Published Site",
      EXPECTED_HOSTNAME,
    );
    const secondSite = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Second Site",
      SECOND_HOSTNAME,
    );
    const storage = createAssetStorage(storageRoot);
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const assetA = await createAssetFixture(
      observer,
      storage,
      site.id,
      "published.png",
      "image/png",
      imageBytes,
    );
    const wrongSiteAsset = await createAssetFixture(
      observer,
      storage,
      secondSite.id,
      "wrong-site.png",
      "image/png",
      new Uint8Array([5]),
    );
    const unsupportedAsset = await createAssetFixture(
      observer,
      storage,
      site.id,
      "unsupported.svg",
      "image/svg+xml",
      new Uint8Array([6]),
    );
    const unusedAsset = await createAssetFixture(
      observer,
      storage,
      site.id,
      "unused.png",
      "image/png",
      new Uint8Array([7]),
    );
    const missingFileAsset = await createAssetFixture(
      observer,
      storage,
      site.id,
      "missing.png",
      "image/png",
      null,
    );

    const imagePage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Published Image",
      "published-image",
      createImageDocument(assetA),
    );
    expect(
      (await requestPublicAsset(application, EXPECTED_HOSTNAME, assetA)).status,
    ).toBe(404);
    expect(await countVersionAssetUsage(observer, imagePage.draft.id, assetA)).toBe(
      1,
    );
    expect(
      (
        await publishPage(
          application,
          origin,
          ownerCookie,
          tenant.id,
          site.id,
          imagePage.page.id,
        )
      ).status,
    ).toBe(200);
    const publishedAsset = await requestPublicAsset(
      application,
      EXPECTED_HOSTNAME,
      assetA,
    );
    expect(publishedAsset.status).toBe(200);
    expect(publishedAsset.headers.get("content-type")).toBe("image/png");
    expect(publishedAsset.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await publishedAsset.arrayBuffer()))).toEqual(
      Array.from(imageBytes),
    );

    const imageRemoved = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      imagePage.page.id,
      DOCUMENT_A,
    );
    expect(
      (
        await publishPage(
          application,
          origin,
          ownerCookie,
          tenant.id,
          site.id,
          imagePage.page.id,
        )
      ).status,
    ).toBe(200);
    expect(
      (await requestPublicAsset(application, EXPECTED_HOSTNAME, assetA)).status,
    ).toBe(404);
    expect(await countVersionAssetUsage(observer, imagePage.draft.id, assetA)).toBe(
      1,
    );
    expect(await countVersionAssetUsage(observer, imageRemoved.draft.id, assetA)).toBe(
      0,
    );

    const sharedPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Shared Image",
      "shared-image",
      createImageDocument(assetA),
    );
    await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      sharedPage.page.id,
    );
    expect(
      (await requestPublicAsset(application, EXPECTED_HOSTNAME, assetA)).status,
    ).toBe(200);
    expect(
      (await requestPublicAsset(application, SECOND_HOSTNAME, assetA)).status,
    ).toBe(404);
    expect(
      (
        await requestPublicAsset(
          application,
          EXPECTED_HOSTNAME,
          wrongSiteAsset,
        )
      ).status,
    ).toBe(404);
    expect(
      (await requestPublicAsset(application, EXPECTED_HOSTNAME, "invalid")).status,
    ).toBe(404);
    expect(
      (
        await requestPublicAsset(
          application,
          EXPECTED_HOSTNAME,
          unusedAsset,
        )
      ).status,
    ).toBe(404);

    const unsupportedPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Unsupported Image",
      "unsupported-image",
      createImageDocument(unsupportedAsset),
    );
    await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      unsupportedPage.page.id,
    );
    expect(
      (
        await requestPublicAsset(
          application,
          EXPECTED_HOSTNAME,
          unsupportedAsset,
        )
      ).status,
    ).toBe(404);

    const missingFilePage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Missing File",
      "missing-file",
      createImageDocument(missingFileAsset),
    );
    await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      missingFilePage.page.id,
    );
    const missingFileResponse = await requestPublicAsset(
      application,
      EXPECTED_HOSTNAME,
      missingFileAsset,
    );
    expect(missingFileResponse.status).toBe(500);
    expect(await missingFileResponse.json()).toEqual({
      error: "Internal server error.",
    });

    const draftOnly = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Draft Only",
      "draft-only",
      DOCUMENT_A,
    );
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, "slug=draft-only"))
        .status,
    ).toBe(404);
    expect(await readPublishedVersionId(observer, draftOnly.page.id)).toBe(null);

    expect(
      (await requestPublicPage(application, "unknown.example.com", "slug=about"))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, "slug=unknown"))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, "https://published.example.com", "slug=about"))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, "published%2Eexample.com", "slug=about"))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, "slug=about/team"))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, ""))
        .status,
    ).toBe(404);
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, "slug=about&slug=other"))
        .status,
    ).toBe(404);

    const rootPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Home",
      "",
      DOCUMENT_A,
    );
    await assignPublishedFixture(observer, rootPage.page.id, rootPage.draft.id);
    const rootResponse = await requestPublicPage(
      application,
      `${EXPECTED_HOSTNAME.toUpperCase()}:3000`,
      "slug=",
    );
    expect(rootResponse.status).toBe(200);
    expect(publicPageResponseSchema.parse(await rootResponse.json()).slug).toBe(
      "",
    );

    const aboutPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "About",
      "about",
      DOCUMENT_A,
    );
    await assignPublishedFixture(observer, aboutPage.page.id, aboutPage.draft.id);
    const secondAboutPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      secondSite.id,
      "Second About",
      "about",
      SECOND_SITE_DOCUMENT,
    );
    await assignPublishedFixture(
      observer,
      secondAboutPage.page.id,
      secondAboutPage.draft.id,
    );

    const publicAboutResponse = await requestPublicPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
    );
    expect(publicAboutResponse.status).toBe(200);
    const publicAbout = publicPageResponseSchema.parse(
      await publicAboutResponse.json(),
    );
    expect(publicAbout).toEqual({
      title: "About",
      slug: "about",
      document: DOCUMENT_A,
    });
    expect(Object.keys(publicAbout).sort()).toEqual([
      "document",
      "slug",
      "title",
    ]);

    const secondAboutResponse = await requestPublicPage(
      application,
      SECOND_HOSTNAME,
      "slug=about",
    );
    expect(secondAboutResponse.status).toBe(200);
    expect(
      publicPageResponseSchema.parse(await secondAboutResponse.json()).document,
    ).toEqual(SECOND_SITE_DOCUMENT);

    const inertParametersResponse = await requestPublicPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about&hostname=attacker.example.com&tenantId=attacker&siteId=attacker&pageId=attacker&versionId=attacker&publishedVersionId=attacker",
    );
    expect(inertParametersResponse.status).toBe(200);
    expect(await inertParametersResponse.json()).toEqual(publicAbout);

    const savedDraft = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
      DOCUMENT_B,
    );
    const pointers = await readPagePointers(observer, aboutPage.page.id);
    expect(pointers).toEqual({
      draftVersionId: savedDraft.draft.id,
      publishedVersionId: aboutPage.draft.id,
    });
    const isolatedDraftResponse = await requestPublicPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
    );
    expect(isolatedDraftResponse.status).toBe(200);
    const isolatedDraftBody = await isolatedDraftResponse.json();
    expect(publicPageResponseSchema.parse(isolatedDraftBody).document).toEqual(
      DOCUMENT_A,
    );
    expect(JSON.stringify(isolatedDraftBody)).not.toContain(
      "Unpublished document B",
    );

    const mismatchPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Mismatch",
      "mismatch",
      DOCUMENT_A,
    );
    await assignPublishedFixture(
      observer,
      mismatchPage.page.id,
      secondAboutPage.draft.id,
    );
    expect(
      (await requestPublicPage(application, EXPECTED_HOSTNAME, "slug=mismatch"))
        .status,
    ).toBe(404);

    const malformedPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Malformed",
      "malformed",
      DOCUMENT_A,
    );
    await assignPublishedFixture(
      observer,
      malformedPage.page.id,
      malformedPage.draft.id,
    );
    const malformedDocument = {
      schemaVersion: 1,
      sections: [],
      unexpected: true,
    };
    await observer.native`
      UPDATE page_versions
      SET document = ${malformedDocument}
      WHERE id = ${malformedPage.draft.id}
    `;
    const malformedResponse = await requestPublicPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=malformed",
    );
    expect(malformedResponse.status).toBe(500);
    expect(await malformedResponse.json()).toEqual({
      error: "Internal server error.",
    });
    expect(
      await readVersionDocument(observer, malformedPage.draft.id),
    ).toEqual(malformedDocument);

    const sessionResponse = await application.app.request("/auth/session");
    expect(sessionResponse.status).toBe(401);
    const healthResponse = await application.app.request("/health");
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: "ok" });
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
    await rm(storageRoot, { recursive: true, force: true });
  }
}

function createParagraphDocument(text: string): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: crypto.randomUUID(),
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "paragraph",
            text,
          },
        ],
      },
    ],
  };
}

function createImageDocument(assetId: string): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: crypto.randomUUID(),
        blocks: [
          {
            id: crypto.randomUUID(),
            type: "image",
            assetId,
            alt: "Image",
          },
        ],
      },
    ],
  };
}

async function createAssetFixture(
  observer: DatabaseClient,
  storage: ReturnType<typeof createAssetStorage>,
  siteId: string,
  originalFilename: string,
  contentType: string,
  bytes: Uint8Array | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const storageKey = `${siteId}/${id}`;
  if (bytes !== null) {
    await storage.writeOriginal(siteId, id, bytes);
  }
  await observer.drizzle.insert(assets).values({
    id,
    siteId,
    storageKey,
    originalFilename,
    contentType,
    byteSize: bytes?.byteLength ?? 1,
  });
  return id;
}

function createIdentity(): TestIdentity {
  return {
    name: "Public Owner",
    email: `public-owner-${crypto.randomUUID()}@example.com`,
    password: OWNER_PASSWORD,
  };
}

async function authenticateIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<string> {
  const response = await application.app.request("/auth/login", {
    method: "POST",
    headers: createRequestHeaders(origin),
    body: JSON.stringify({ email: identity.email, password: identity.password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!cookie) {
    throw new Error("Expected session cookie.");
  }
  return cookie.split(";", 1)[0] ?? "";
}

async function createTenant(
  application: ApiApplication,
  origin: string,
  cookie: string,
) {
  const response = await application.app.request("/tenants", {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name: "Published Tenant" }),
  });
  expect(response.status).toBe(201);
  return tenantAccessSchema.parse(await response.json());
}

async function createSite(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  name: string,
  hostname: string,
) {
  const response = await application.app.request(`/tenants/${tenantId}/sites`, {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name, hostname }),
  });
  expect(response.status).toBe(201);
  return siteSummarySchema.parse(await response.json());
}

async function createPage(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  title: string,
  slug: string,
  document: PageDocument,
): Promise<PageDraft> {
  const response = await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages`,
    {
      method: "POST",
      headers: createRequestHeaders(origin, cookie),
      body: JSON.stringify({ title, slug, document }),
    },
  );
  expect(response.status).toBe(201);
  return pageDraftSchema.parse(await response.json());
}

async function saveDraft(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  pageId: string,
  document: PageDocument,
): Promise<PageDraft> {
  const response = await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/versions`,
    {
      method: "POST",
      headers: createRequestHeaders(origin, cookie),
      body: JSON.stringify({ document }),
    },
  );
  expect(response.status).toBe(201);
  return pageDraftSchema.parse(await response.json());
}

async function assignPublishedFixture(
  observer: DatabaseClient,
  pageId: string,
  versionId: string,
): Promise<void> {
  await observer.native`
    UPDATE pages
    SET published_version_id = ${versionId}
    WHERE id = ${pageId}
  `;
}

async function requestPublicPage(
  application: ApiApplication,
  hostname: string,
  query: string,
): Promise<Response> {
  const suffix = query.length > 0 ? `?${query}` : "";
  return await application.app.request(`/public/page${suffix}`, {
    headers: { host: hostname },
  });
}

async function requestPublicAsset(
  application: ApiApplication,
  hostname: string,
  assetId: string,
): Promise<Response> {
  return await application.app.request(`/public/assets/${assetId}`, {
    headers: { host: hostname },
  });
}

async function publishPage(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<Response> {
  return await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/publish`,
    { method: "POST", headers: createRequestHeaders(origin, cookie) },
  );
}

async function countVersionAssetUsage(
  observer: DatabaseClient,
  versionId: string,
  assetId: string,
): Promise<number> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM page_version_assets
    WHERE page_version_id = ${versionId}
      AND asset_id = ${assetId}
  `;
  return row?.count ?? 0;
}

async function readPublishedVersionId(
  observer: DatabaseClient,
  pageId: string,
): Promise<string | null> {
  const [row] = await observer.native<Array<{ publishedVersionId: string | null }>>`
    SELECT published_version_id AS "publishedVersionId"
    FROM pages
    WHERE id = ${pageId}
  `;
  return row?.publishedVersionId ?? null;
}

async function readPagePointers(observer: DatabaseClient, pageId: string) {
  const [row] = await observer.native<
    Array<{ draftVersionId: string; publishedVersionId: string | null }>
  >`
    SELECT
      draft_version_id AS "draftVersionId",
      published_version_id AS "publishedVersionId"
    FROM pages
    WHERE id = ${pageId}
  `;
  return row;
}

async function readVersionDocument(
  observer: DatabaseClient,
  versionId: string,
): Promise<unknown> {
  const [row] = await observer.native<Array<{ document: unknown }>>`
    SELECT document FROM page_versions WHERE id = ${versionId}
  `;
  return row?.document;
}

function createRequestHeaders(origin: string, cookie?: string): Headers {
  const headers = new Headers({
    "content-type": JSON_CONTENT_TYPE,
    origin,
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return headers;
}

async function removeTestRecords(
  observer: DatabaseClient,
  tenantIds: string[],
  userIds: string[],
): Promise<void> {
  for (const tenantId of tenantIds) {
    await observer.native`
      DELETE FROM page_publications
      WHERE page_id IN (
        SELECT page.id
        FROM pages AS page
        INNER JOIN sites AS site ON site.id = page.site_id
        WHERE site.tenant_id = ${tenantId}
      )
    `;
    await observer.native`
      DELETE FROM pages
      WHERE site_id IN (SELECT id FROM sites WHERE tenant_id = ${tenantId})
    `;
    await observer.native`
      DELETE FROM assets
      WHERE site_id IN (SELECT id FROM sites WHERE tenant_id = ${tenantId})
    `;
    await observer.native`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  for (const userId of userIds) {
    await observer.native`DELETE FROM "user" WHERE id = ${userId}`;
  }
}
