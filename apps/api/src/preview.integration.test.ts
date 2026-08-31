import { expect, test } from "bun:test";
import {
  PREVIEW_TOKEN_HEADER,
  type PageDocument,
  type PageDraft,
  pageDraftSchema,
  previewTokenResponseSchema,
  previewTokenSchema,
  publicPageResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  assets,
  createDatabaseClient,
  loadDatabaseConfig,
  memberships,
} from "@bher/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";
import { createAssetStorage } from "./lib/asset-storage";

const OWNER_PASSWORD = "preview-owner-password";
const MEMBER_PASSWORD = "preview-member-password";
const OUTSIDER_PASSWORD = "preview-outsider-password";
const EXPECTED_HOSTNAME = "preview.example.com";
const SECOND_HOSTNAME = "preview-second.example.com";
const JSON_CONTENT_TYPE = "application/json";
const PREVIEW_LIFETIME_MS = 15 * 60 * 1_000;
const PREVIEW_LIFETIME_TOLERANCE_MS = 5_000;
const UNKNOWN_VALID_TOKEN = "Z".repeat(43);
const DOCUMENT_A = createParagraphDocument("Preview document A");
const DOCUMENT_B = createParagraphDocument("Preview document B");
const OTHER_DOCUMENT = createParagraphDocument("Other page document");

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

type StoredPreviewToken = Readonly<{
  pageId: string;
  versionId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}>;

test("enforces the immutable preview credential lifecycle", verifyPreviewLifecycle);

async function verifyPreviewLifecycle(): Promise<void> {
  const storageRoot = await mkdtemp(join(tmpdir(), "behr-preview-assets-"));
  const environment = { ...process.env, ASSET_STORAGE_ROOT: storageRoot };
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const origin = loadApiConfig(environment).auth.baseUrl;
  const ownerIdentity = createIdentity("Owner", OWNER_PASSWORD);
  const memberIdentity = createIdentity("Member", MEMBER_PASSWORD);
  const outsiderIdentity = createIdentity("Outsider", OUTSIDER_PASSWORD);
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    await observer.connect();
    const owner = await registerIdentity(application, origin, ownerIdentity);
    const member = await registerIdentity(application, origin, memberIdentity);
    const outsider = await registerIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    createdUserIds.push(owner.id, member.id, outsider.id);
    const ownerCookie = await authenticateIdentity(
      application,
      origin,
      ownerIdentity,
    );
    const memberCookie = await authenticateIdentity(
      application,
      origin,
      memberIdentity,
    );
    const outsiderCookie = await authenticateIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    const tenant = await createTenant(application, origin, ownerCookie);
    createdTenantIds.push(tenant.id);
    await observer.drizzle.insert(memberships).values({
      tenantId: tenant.id,
      userId: member.id,
      role: "member",
    });
    const site = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Preview Site",
      EXPECTED_HOSTNAME,
    );
    const secondSite = await createSite(
      application,
      origin,
      ownerCookie,
      tenant.id,
      "Second Preview Site",
      SECOND_HOSTNAME,
    );
    await verifyPreviewAssetDelivery(
      application,
      observer,
      createAssetStorage(storageRoot),
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      secondSite.id,
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
    const memberPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Member Preview",
      "member-preview",
      DOCUMENT_A,
    );
    const secondAboutPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      secondSite.id,
      "Second About",
      "about",
      OTHER_DOCUMENT,
    );
    await assignPublishedFixture(
      observer,
      aboutPage.page.id,
      aboutPage.draft.id,
    );
    const publishedBefore = await readPublishedVersionId(
      observer,
      aboutPage.page.id,
    );

    const missingSession = await issuePreviewToken(
      application,
      origin,
      undefined,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    expect(missingSession.status).toBe(401);
    const missingOrigin = await issuePreviewToken(
      application,
      undefined,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    expect(missingOrigin.status).toBe(403);
    expect(missingOrigin.headers.get("cache-control")).toBe("no-store");
    const outsiderIssue = await issuePreviewToken(
      application,
      origin,
      outsiderCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    expect(outsiderIssue.status).toBe(404);

    const memberIssue = await issuePreviewToken(
      application,
      origin,
      memberCookie,
      tenant.id,
      site.id,
      memberPage.page.id,
    );
    expect(memberIssue.status).toBe(201);
    const memberCredential = previewTokenResponseSchema.parse(
      await memberIssue.json(),
    );
    expect(memberCredential.token).toHaveLength(43);
    expect(
      (
        await requestPublicPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=member-preview",
          { [PREVIEW_TOKEN_HEADER]: memberCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=member-preview",
          { [PREVIEW_TOKEN_HEADER]: memberCredential.token },
        )
      ).status,
    ).toBe(200);

    const issuedAt = Date.now();
    const ownerIssue = await issuePreviewToken(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    const issuedAfter = Date.now();
    expect(ownerIssue.status).toBe(201);
    expect(ownerIssue.headers.get("cache-control")).toBe("no-store");
    const firstCredential = previewTokenResponseSchema.parse(
      await ownerIssue.json(),
    );
    expect(previewTokenSchema.parse(firstCredential.token)).toBe(
      firstCredential.token,
    );
    expect(Object.keys(firstCredential).sort()).toEqual(["expiresAt", "token"]);
    const expiresAt = new Date(firstCredential.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(
      issuedAt + PREVIEW_LIFETIME_MS - PREVIEW_LIFETIME_TOLERANCE_MS,
    );
    expect(expiresAt).toBeLessThanOrEqual(
      issuedAfter + PREVIEW_LIFETIME_MS + PREVIEW_LIFETIME_TOLERANCE_MS,
    );

    const storedFirst = await readPreviewToken(observer, aboutPage.page.id);
    expect(storedFirst?.versionId).toBe(aboutPage.draft.id);
    expect(storedFirst?.expiresAt.toISOString()).toBe(firstCredential.expiresAt);
    expect(storedFirst?.tokenHash).not.toBe(firstCredential.token);
    expect(storedFirst?.tokenHash).toBe(
      await independentlyHashToken(firstCredential.token),
    );
    expect(await countPreviewTokens(observer, aboutPage.page.id)).toBe(1);
    expect(await readPageAndPreviewPointers(observer, aboutPage.page.id)).toEqual(
      {
        draftVersionId: aboutPage.draft.id,
        publishedVersionId: publishedBefore,
        previewVersionId: aboutPage.draft.id,
      },
    );
    expect(await readPublishedVersionId(observer, aboutPage.page.id)).toBe(
      publishedBefore,
    );

    await expectPageUniqueness(observer, storedFirst, aboutPage.draft.id);
    await expectHashUniqueness(
      observer,
      storedFirst,
      secondAboutPage.page.id,
      secondAboutPage.draft.id,
    );

    const missingHeader = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
    );
    expect(missingHeader.status).toBe(404);
    expect(missingHeader.headers.get("cache-control")).toBe("no-store");
    expect(
      (
        await requestPreviewPage(application, EXPECTED_HOSTNAME, "slug=about", {
          [PREVIEW_TOKEN_HEADER]: UNKNOWN_VALID_TOKEN,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(application, EXPECTED_HOSTNAME, "", {
          [PREVIEW_TOKEN_HEADER]: firstCredential.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=about&slug=other",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=about/team",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    const firstPreview = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
    );
    expect(firstPreview.status).toBe(200);
    expect(firstPreview.headers.get("cache-control")).toBe("no-store");
    expect(
      publicPageResponseSchema.parse(await firstPreview.json()).document,
    ).toEqual(DOCUMENT_A);

    await expectMalformedTokensRejected(application);
    await expectAlternateTransportsRejected(
      application,
      firstCredential.token,
    );
    const inertQuery = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      `slug=about&token=${UNKNOWN_VALID_TOKEN}&preview=${UNKNOWN_VALID_TOKEN}`,
      { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
    );
    expect(inertQuery.status).toBe(200);
    expect(
      publicPageResponseSchema.parse(await inertQuery.json()).document,
    ).toEqual(DOCUMENT_A);
    expect(
      (
        await requestPreviewPage(
          application,
          SECOND_HOSTNAME,
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=member-preview",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          "preview%2Eexample.com",
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await requestPreviewPage(
          application,
          `${EXPECTED_HOSTNAME.toUpperCase()}:3000`,
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(200);

    const savedDraft = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
      DOCUMENT_B,
    );
    expect(await readPageAndPreviewPointers(observer, aboutPage.page.id)).toEqual(
      {
        draftVersionId: savedDraft.draft.id,
        publishedVersionId: publishedBefore,
        previewVersionId: aboutPage.draft.id,
      },
    );
    const snapshotPreview = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
    );
    const snapshotBody = await snapshotPreview.json();
    expect(snapshotPreview.status).toBe(200);
    expect(publicPageResponseSchema.parse(snapshotBody).document).toEqual(
      DOCUMENT_A,
    );
    expect(JSON.stringify(snapshotBody)).not.toContain("Preview document B");

    const rotatedIssue = await issuePreviewToken(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    expect(rotatedIssue.status).toBe(201);
    const secondCredential = previewTokenResponseSchema.parse(
      await rotatedIssue.json(),
    );
    expect(secondCredential.token).not.toBe(firstCredential.token);
    const storedSecond = await readPreviewToken(observer, aboutPage.page.id);
    expect(await countPreviewTokens(observer, aboutPage.page.id)).toBe(1);
    expect(storedSecond?.versionId).toBe(savedDraft.draft.id);
    expect(storedSecond?.tokenHash).not.toBe(storedFirst?.tokenHash);
    expect(storedSecond?.createdAt.getTime()).toBeGreaterThanOrEqual(
      storedFirst?.createdAt.getTime() ?? 0,
    );
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: firstCredential.token },
        )
      ).status,
    ).toBe(404);
    const rotatedPreview = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: secondCredential.token },
    );
    expect(rotatedPreview.status).toBe(200);
    expect(
      publicPageResponseSchema.parse(await rotatedPreview.json()).document,
    ).toEqual(DOCUMENT_B);

    await expirePreviewToken(observer, aboutPage.page.id);
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: secondCredential.token },
        )
      ).status,
    ).toBe(404);
    expect(await countPreviewTokens(observer, aboutPage.page.id)).toBe(1);

    const mismatchIssue = await issuePreviewToken(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    const mismatchCredential = previewTokenResponseSchema.parse(
      await mismatchIssue.json(),
    );
    await assignPreviewVersionFixture(
      observer,
      aboutPage.page.id,
      secondAboutPage.draft.id,
    );
    expect(
      (
        await requestPreviewPage(
          application,
          EXPECTED_HOSTNAME,
          "slug=about",
          { [PREVIEW_TOKEN_HEADER]: mismatchCredential.token },
        )
      ).status,
    ).toBe(404);

    const malformedIssue = await issuePreviewToken(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      aboutPage.page.id,
    );
    const malformedCredential = previewTokenResponseSchema.parse(
      await malformedIssue.json(),
    );
    const malformedDocument = {
      schemaVersion: 1,
      sections: [],
      unexpected: true,
    };
    await observer.native`
      UPDATE page_versions
      SET document = ${malformedDocument}
      WHERE id = ${savedDraft.draft.id}
    `;
    const malformedPreview = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: malformedCredential.token },
    );
    expect(malformedPreview.status).toBe(500);
    expect(await malformedPreview.json()).toEqual({
      error: "Internal server error.",
    });
    expect(await readVersionDocument(observer, savedDraft.draft.id)).toEqual(
      malformedDocument,
    );
    const publicResponse = await requestPublicPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: malformedCredential.token },
    );
    expect(publicResponse.status).toBe(200);
    expect(
      publicPageResponseSchema.parse(await publicResponse.json()).document,
    ).toEqual(DOCUMENT_A);
    expect(await readPublishedVersionId(observer, aboutPage.page.id)).toBe(
      publishedBefore,
    );
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
    await rm(storageRoot, { recursive: true, force: true });
  }
}

async function verifyPreviewAssetDelivery(
  application: ApiApplication,
  observer: DatabaseClient,
  storage: ReturnType<typeof createAssetStorage>,
  origin: string,
  ownerCookie: string,
  tenantId: string,
  siteId: string,
  secondSiteId: string,
): Promise<void> {
  const bytesA = new Uint8Array([10, 11]);
  const bytesB = new Uint8Array([12, 13, 14]);
  const assetA = await createAssetFixture(
    observer,
    storage,
    siteId,
    "preview-a.png",
    "image/png",
    bytesA,
  );
  const assetB = await createAssetFixture(
    observer,
    storage,
    siteId,
    "preview-b.webp",
    "image/webp",
    bytesB,
  );
  const wrongSiteAsset = await createAssetFixture(
    observer,
    storage,
    secondSiteId,
    "wrong-site.png",
    "image/png",
    new Uint8Array([15]),
  );
  const unsupportedAsset = await createAssetFixture(
    observer,
    storage,
    siteId,
    "unsupported.svg",
    "image/svg+xml",
    new Uint8Array([16]),
  );
  const page = await createPage(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    "Preview Asset",
    "preview-asset",
    createImageDocument(assetA),
  );
  const firstIssue = await issuePreviewToken(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    page.page.id,
  );
  const first = previewTokenResponseSchema.parse(await firstIssue.json());
  const firstAsset = await requestPreviewAsset(
    application,
    EXPECTED_HOSTNAME,
    assetA,
    first.token,
  );
  expect(firstAsset.status).toBe(200);
  expect(firstAsset.headers.get("content-type")).toBe("image/png");
  expect(firstAsset.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Array.from(new Uint8Array(await firstAsset.arrayBuffer()))).toEqual(
    Array.from(bytesA),
  );
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetB, first.token))
      .status,
  ).toBe(404);
  expect(
    (
      await requestPreviewAsset(
        application,
        EXPECTED_HOSTNAME,
        wrongSiteAsset,
        first.token,
      )
    ).status,
  ).toBe(404);
  expect(
    (await requestPreviewAsset(application, SECOND_HOSTNAME, assetA, first.token))
      .status,
  ).toBe(404);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, "invalid", first.token))
      .status,
  ).toBe(404);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetA)).status,
  ).toBe(404);

  const secondDraft = await saveDraft(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    page.page.id,
    createImageDocument(assetB),
  );
  expect(secondDraft.draft.id).not.toBe(page.draft.id);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetA, first.token))
      .status,
  ).toBe(200);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetB, first.token))
      .status,
  ).toBe(404);

  const secondIssue = await issuePreviewToken(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    page.page.id,
  );
  const second = previewTokenResponseSchema.parse(await secondIssue.json());
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetA, first.token))
      .status,
  ).toBe(404);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetB, first.token))
      .status,
  ).toBe(404);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetA, second.token))
      .status,
  ).toBe(404);
  const secondAsset = await requestPreviewAsset(
    application,
    EXPECTED_HOSTNAME,
    assetB,
    second.token,
  );
  expect(secondAsset.status).toBe(200);
  expect(secondAsset.headers.get("content-type")).toBe("image/webp");
  expect(Array.from(new Uint8Array(await secondAsset.arrayBuffer()))).toEqual(
    Array.from(bytesB),
  );

  const unsupportedPage = await createPage(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    "Unsupported Preview Asset",
    "unsupported-preview-asset",
    createImageDocument(unsupportedAsset),
  );
  const unsupportedIssue = await issuePreviewToken(
    application,
    origin,
    ownerCookie,
    tenantId,
    siteId,
    unsupportedPage.page.id,
  );
  const unsupportedToken = previewTokenResponseSchema.parse(
    await unsupportedIssue.json(),
  ).token;
  expect(
    (
      await requestPreviewAsset(
        application,
        EXPECTED_HOSTNAME,
        unsupportedAsset,
        unsupportedToken,
      )
    ).status,
  ).toBe(404);

  await expirePreviewToken(observer, page.page.id);
  expect(
    (await requestPreviewAsset(application, EXPECTED_HOSTNAME, assetB, second.token))
      .status,
  ).toBe(404);
}

function createParagraphDocument(text: string): PageDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: crypto.randomUUID(),
        blocks: [
          { id: crypto.randomUUID(), type: "paragraph", text },
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
            alt: "Preview image",
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
  bytes: Uint8Array,
): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await storage.writeOriginal(siteId, id, bytes);
  await observer.drizzle.insert(assets).values({
    id,
    siteId,
    storageKey: stored.storageKey,
    originalFilename,
    contentType,
    byteSize: bytes.byteLength,
  });
  return id;
}

function createIdentity(label: string, password: string): TestIdentity {
  return {
    name: `Preview ${label}`,
    email: `preview-${label.toLowerCase()}-${crypto.randomUUID()}@example.com`,
    password,
  };
}

async function registerIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
) {
  return await application.auth.registerIdentity(
    identity,
    new Headers({ origin }),
  );
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
    body: JSON.stringify({ name: "Preview Tenant" }),
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

async function issuePreviewToken(
  application: ApiApplication,
  origin: string | undefined,
  cookie: string | undefined,
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<Response> {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/preview-tokens`,
    { method: "POST", headers },
  );
}

async function requestPreviewPage(
  application: ApiApplication,
  hostname: string,
  query: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await application.app.request(`/preview/page?${query}`, {
    headers: { host: hostname, ...headers },
  });
}

async function requestPreviewAsset(
  application: ApiApplication,
  hostname: string,
  assetId: string,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { host: hostname };
  if (token) {
    headers[PREVIEW_TOKEN_HEADER] = token;
  }
  return await application.app.request(`/preview/assets/${assetId}`, {
    headers,
  });
}

async function requestPublicPage(
  application: ApiApplication,
  hostname: string,
  query: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await application.app.request(`/public/page?${query}`, {
    headers: { host: hostname, ...headers },
  });
}

async function expectMalformedTokensRejected(
  application: ApiApplication,
): Promise<void> {
  const tokens = ["", "invalid%", "A".repeat(42), "A".repeat(44), "%41".repeat(43)];
  for (const token of tokens) {
    const response = await requestPreviewPage(
      application,
      EXPECTED_HOSTNAME,
      "slug=about",
      { [PREVIEW_TOKEN_HEADER]: token },
    );
    expect(response.status).toBe(404);
  }
}

async function expectAlternateTransportsRejected(
  application: ApiApplication,
  token: string,
): Promise<void> {
  expect(
    (
      await requestPreviewPage(
        application,
        EXPECTED_HOSTNAME,
        `slug=about&token=${token}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await requestPreviewPage(application, EXPECTED_HOSTNAME, "slug=about", {
        authorization: `Bearer ${token}`,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await requestPreviewPage(application, EXPECTED_HOSTNAME, "slug=about", {
        cookie: `preview=${token}`,
      })
    ).status,
  ).toBe(404);
}

async function independentlyHashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Buffer.from(digest).toString("hex");
}

async function readPreviewToken(
  observer: DatabaseClient,
  pageId: string,
): Promise<StoredPreviewToken | undefined> {
  const [row] = await observer.native<StoredPreviewToken[]>`
    SELECT
      page_id AS "pageId",
      version_id AS "versionId",
      token_hash AS "tokenHash",
      expires_at AS "expiresAt",
      created_at AS "createdAt"
    FROM preview_tokens
    WHERE page_id = ${pageId}
  `;
  return row;
}

async function countPreviewTokens(
  observer: DatabaseClient,
  pageId: string,
): Promise<number> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM preview_tokens WHERE page_id = ${pageId}
  `;
  return row?.count ?? 0;
}

async function expectPageUniqueness(
  observer: DatabaseClient,
  token: StoredPreviewToken | undefined,
  versionId: string,
): Promise<void> {
  if (!token) {
    throw new Error("Expected persisted preview token.");
  }
  let rejected = false;
  try {
    await observer.native`
      INSERT INTO preview_tokens (page_id, version_id, token_hash, expires_at)
      VALUES (${token.pageId}, ${versionId}, ${"1".repeat(64)}, ${token.expiresAt})
    `;
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

async function expectHashUniqueness(
  observer: DatabaseClient,
  token: StoredPreviewToken | undefined,
  pageId: string,
  versionId: string,
): Promise<void> {
  if (!token) {
    throw new Error("Expected persisted preview token.");
  }
  let rejected = false;
  try {
    await observer.native`
      INSERT INTO preview_tokens (page_id, version_id, token_hash, expires_at)
      VALUES (${pageId}, ${versionId}, ${token.tokenHash}, ${token.expiresAt})
    `;
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

async function readPageAndPreviewPointers(
  observer: DatabaseClient,
  pageId: string,
) {
  const [row] = await observer.native<
    Array<{
      draftVersionId: string;
      publishedVersionId: string | null;
      previewVersionId: string;
    }>
  >`
    SELECT
      pages.draft_version_id AS "draftVersionId",
      pages.published_version_id AS "publishedVersionId",
      preview_tokens.version_id AS "previewVersionId"
    FROM pages
    INNER JOIN preview_tokens ON preview_tokens.page_id = pages.id
    WHERE pages.id = ${pageId}
  `;
  return row;
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

async function expirePreviewToken(
  observer: DatabaseClient,
  pageId: string,
): Promise<void> {
  await observer.native`
    UPDATE preview_tokens
    SET expires_at = now() - interval '1 minute'
    WHERE page_id = ${pageId}
  `;
}

async function assignPreviewVersionFixture(
  observer: DatabaseClient,
  pageId: string,
  versionId: string,
): Promise<void> {
  await observer.native`
    UPDATE preview_tokens
    SET version_id = ${versionId}
    WHERE page_id = ${pageId}
  `;
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
