import { expect, test } from "bun:test";
import {
  type AuthenticatedSession,
  type PageDocument,
  type PageDraft,
  pageDraftSchema,
  pageListResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  type PagePersistence,
  type PreviewPersistence,
  type PublishPersistence,
  type TenantPersistence,
  PageAssetReferenceError,
  assets,
  createDatabaseClient,
  loadDatabaseConfig,
  memberships,
  pages,
} from "@bher/db";
import { Hono } from "hono";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";
import type { AuthService } from "./lib/auth";
import { createPageRoutes } from "./routes/pages";
import type { ApiBindings } from "./types";

const OWNER_PASSWORD = "page-owner-password";
const MEMBER_PASSWORD = "page-member-password";
const OUTSIDER_PASSWORD = "page-outsider-password";
const JSON_CONTENT_TYPE = "application/json";
const DOCUMENT_A: PageDocument = { schemaVersion: 1, sections: [] };
const DOCUMENT_B: PageDocument = {
  schemaVersion: 1,
  sections: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      blocks: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "paragraph",
          text: "Updated draft",
        },
      ],
    },
  ],
};

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

test("enforces page persistence and immutable drafts", verifyPageLifecycle);

test("translates only the owned invalid asset-reference error", async () => {
  const invalidReference = createPageRouteTestApplication(
    new PageAssetReferenceError(),
  );
  const invalidResponse = await requestPageRouteTest(invalidReference);
  expect(invalidResponse.status).toBe(400);
  expect(await invalidResponse.json()).toEqual({
    error: "Page request is invalid.",
  });

  const genericFailure = createPageRouteTestApplication(
    new Error("generic persistence failure"),
  );
  const genericResponse = await requestPageRouteTest(genericFailure);
  expect(genericResponse.status).toBe(500);
  expect(await genericResponse.json()).toEqual({
    error: "Internal server error.",
  });
});

async function verifyPageLifecycle(): Promise<void> {
  const environment = process.env;
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

    const tenantA = await createTenant(
      application,
      origin,
      ownerCookie,
      "Page Tenant A",
    );
    const tenantB = await createTenant(
      application,
      origin,
      ownerCookie,
      "Page Tenant B",
    );
    createdTenantIds.push(tenantA.id, tenantB.id);
    await observer.drizzle.insert(memberships).values({
      tenantId: tenantA.id,
      userId: member.id,
      role: "member",
    });
    const siteA = await createSite(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      "Page Site A",
      "page-a.example.com",
    );
    const siteAEmpty = await createSite(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      "Empty Site",
      "page-empty.example.com",
    );
    const siteB = await createSite(
      application,
      origin,
      ownerCookie,
      tenantB.id,
      "Page Site B",
      "page-b.example.com",
    );
    const assetA = crypto.randomUUID();
    const assetB = crypto.randomUUID();
    await observer.drizzle.insert(assets).values([
      {
        id: assetA,
        siteId: siteA.id,
        storageKey: `${siteA.id}/${assetA}`,
        originalFilename: "page-a.png",
        contentType: "image/png",
        byteSize: 3,
      },
      {
        id: assetB,
        siteId: siteB.id,
        storageKey: `${siteB.id}/${assetB}`,
        originalFilename: "page-b.png",
        contentType: "image/png",
        byteSize: 3,
      },
    ]);

    const pageA = await createPage(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteA.id,
      "  About  ",
      "ABOUT-US",
      DOCUMENT_A,
    );
    expect(pageA.page.title).toBe("About");
    expect(pageA.page.slug).toBe("about-us");

    const initialRows = await observer.native<
      Array<{
        document: unknown;
        draftVersionId: string;
        publishedVersionId: string | null;
        pageCount: number;
        versionCount: number;
        versionId: string;
        documentType: string;
      }>
    >`
      SELECT
        page.draft_version_id AS "draftVersionId",
        page.published_version_id AS "publishedVersionId",
        version.id AS "versionId",
        version.document,
        pg_typeof(version.document)::text AS "documentType",
        (SELECT count(*)::int FROM pages WHERE id = ${pageA.page.id})
          AS "pageCount",
        (SELECT count(*)::int FROM page_versions
          WHERE page_id = ${pageA.page.id}) AS "versionCount"
      FROM pages AS page
      INNER JOIN page_versions AS version
        ON version.id = page.draft_version_id
      WHERE page.id = ${pageA.page.id}
    `;
    expect(initialRows[0]).toEqual({
      document: DOCUMENT_A,
      draftVersionId: pageA.draft.id,
      pageCount: 1,
      publishedVersionId: null,
      versionCount: 1,
      versionId: pageA.draft.id,
      documentType: "jsonb",
    });

    const memberPage = await createPage(
      application,
      origin,
      memberCookie,
      tenantA.id,
      siteA.id,
      "Member Page",
      "member-page",
      DOCUMENT_A,
    );
    expect(memberPage.page.slug).toBe("member-page");
    expect(
      (await createPageResponse(
        application,
        ownerCookie,
        tenantA.id,
        siteA.id,
        "Missing Origin",
        "missing-origin",
        DOCUMENT_A,
      )).status,
    ).toBe(403);

    const emptyList = await application.app.request(
      pageCollectionPath(tenantA.id, siteAEmpty.id),
      { headers: { cookie: ownerCookie } },
    );
    expect(emptyList.status).toBe(200);
    expect(pageListResponseSchema.parse(await emptyList.json())).toEqual({
      pages: [],
    });

    const list = await application.app.request(
      pageCollectionPath(tenantA.id, siteA.id),
      { headers: { cookie: ownerCookie } },
    );
    expect(list.status).toBe(200);
    expect(pageListResponseSchema.parse(await list.json()).pages).toEqual([
      pageA.page,
      memberPage.page,
    ]);
    expect(
      (await application.app.request(
        pageCollectionPath(tenantA.id, siteA.id),
        { headers: { cookie: outsiderCookie } },
      )).status,
    ).toBe(404);
    expect(
      (await application.app.request(
        pageCollectionPath(tenantA.id, siteB.id),
        { headers: { cookie: ownerCookie } },
      )).status,
    ).toBe(404);
    expect(
      (await application.app.request(
        pageCollectionPath(tenantA.id, "invalid"),
        { headers: { cookie: ownerCookie } },
      )).status,
    ).toBe(404);
    expect(
      (await application.app.request(
        `${pageCollectionPath(tenantA.id, siteA.id)}/invalid`,
        { headers: { cookie: ownerCookie } },
      )).status,
    ).toBe(404);
    expect(
      (await application.app.request(
        `${pageCollectionPath(tenantA.id, siteAEmpty.id)}/${pageA.page.id}`,
        { headers: { cookie: ownerCookie } },
      )).status,
    ).toBe(404);

    const duplicate = await createPageResponse(
      application,
      ownerCookie,
      tenantA.id,
      siteA.id,
      "Duplicate",
      "ABOUT-US",
      DOCUMENT_A,
      origin,
    );
    expect(duplicate.status).toBe(409);
    const sameSlugOtherSite = await createPage(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteAEmpty.id,
      "Other Site About",
      "about-us",
      DOCUMENT_A,
    );
    expect(sameSlugOtherSite.page.slug).toBe("about-us");
    await createPage(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteA.id,
      "Root",
      "",
      DOCUMENT_A,
    );
    expect(
      (await createPageResponse(
        application,
        ownerCookie,
        tenantA.id,
        siteA.id,
        "Duplicate Root",
        "",
        DOCUMENT_A,
        origin,
      )).status,
    ).toBe(409);

    const [constraintPage] = await observer.drizzle
      .insert(pages)
      .values({ siteId: siteA.id, title: "Constraint", slug: "constraint" })
      .returning({ id: pages.id });
    expect(constraintPage).toBeDefined();
    let databaseDuplicateRejected = false;
    try {
      await observer.drizzle.insert(pages).values({
        siteId: siteA.id,
        title: "Constraint Duplicate",
        slug: "constraint",
      });
    } catch {
      databaseDuplicateRejected = true;
    }
    expect(databaseDuplicateRejected).toBe(true);
    if (constraintPage) {
      await observer.native`DELETE FROM pages WHERE id = ${constraintPage.id}`;
    }

    const saved = await saveDraft(
      application,
      origin,
      memberCookie,
      tenantA.id,
      siteA.id,
      pageA.page.id,
      DOCUMENT_B,
    );
    expect(saved.draft.id).not.toBe(pageA.draft.id);
    const immutableRows = await observer.native<
      Array<{ id: string; document: unknown }>
    >`
      SELECT id, document
      FROM page_versions
      WHERE page_id = ${pageA.page.id}
      ORDER BY created_at, id
    `;
    expect(immutableRows).toHaveLength(2);
    expect(immutableRows.find((row) => row.id === pageA.draft.id)?.document).toEqual(
      DOCUMENT_A,
    );
    expect(immutableRows.find((row) => row.id === saved.draft.id)?.document).toEqual(
      DOCUMENT_B,
    );
    const [currentPointer] = await observer.native<
      Array<{ draftVersionId: string; publishedVersionId: string | null }>
    >`
      SELECT
        draft_version_id AS "draftVersionId",
        published_version_id AS "publishedVersionId"
      FROM pages
      WHERE id = ${pageA.page.id}
    `;
    expect(currentPointer?.draftVersionId).toBe(saved.draft.id);
    expect(currentPointer?.publishedVersionId).toBe(null);

    const currentDraft = await application.app.request(
      `${pageCollectionPath(tenantA.id, siteA.id)}/${pageA.page.id}`,
      { headers: { cookie: memberCookie } },
    );
    expect(currentDraft.status).toBe(200);
    expect(pageDraftSchema.parse(await currentDraft.json())).toEqual(saved);
    expect(
      (await application.app.request(
        `${pageCollectionPath(tenantA.id, siteA.id)}/${pageA.page.id}/versions`,
        {
          method: "POST",
          headers: { cookie: memberCookie, "content-type": JSON_CONTENT_TYPE },
          body: JSON.stringify({ document: DOCUMENT_A }),
        },
      )).status,
    ).toBe(403);

    const versionsBeforeFailedSave = await countPageVersions(
      observer,
      pageA.page.id,
    );
    expect(
      (await saveDraftResponse(
        application,
        origin,
        memberCookie,
        tenantA.id,
        siteAEmpty.id,
        pageA.page.id,
        DOCUMENT_A,
      )).status,
    ).toBe(404);
    expect(await countPageVersions(observer, pageA.page.id)).toBe(
      versionsBeforeFailedSave,
    );

    const imagePage = await createPage(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteA.id,
      "Image Page",
      "image-page",
      createImageDocument(assetA, true),
    );
    expect(
      await countVersionAssetUsage(observer, imagePage.draft.id, assetA),
    ).toBe(1);
    expect(imagePage.draft.document.sections[0]?.blocks).toHaveLength(2);

    const versionCountBeforeWrongSite = await countPageVersions(
      observer,
      imagePage.page.id,
    );
    const pointerBeforeWrongSite = await readDraftPointer(
      observer,
      imagePage.page.id,
    );
    expect(
      (
        await saveDraftResponse(
          application,
          origin,
          ownerCookie,
          tenantA.id,
          siteA.id,
          imagePage.page.id,
          createImageDocument(assetB),
        )
      ).status,
    ).toBe(400);
    expect(await countPageVersions(observer, imagePage.page.id)).toBe(
      versionCountBeforeWrongSite,
    );
    expect(await readDraftPointer(observer, imagePage.page.id)).toBe(
      pointerBeforeWrongSite,
    );
    expect(
      await countVersionAssetUsage(observer, imagePage.draft.id, assetA),
    ).toBe(1);

    expect(
      (
        await saveDraftResponse(
          application,
          origin,
          ownerCookie,
          tenantA.id,
          siteA.id,
          imagePage.page.id,
          createImageDocument(crypto.randomUUID()),
        )
      ).status,
    ).toBe(400);
    expect(await countPageVersions(observer, imagePage.page.id)).toBe(
      versionCountBeforeWrongSite,
    );
    expect(await readDraftPointer(observer, imagePage.page.id)).toBe(
      pointerBeforeWrongSite,
    );

    const withoutImage = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteA.id,
      imagePage.page.id,
      DOCUMENT_A,
    );
    expect(
      await countVersionAssetUsage(observer, imagePage.draft.id, assetA),
    ).toBe(1);
    expect(
      await countVersionAssetUsage(observer, withoutImage.draft.id, assetA),
    ).toBe(0);
    const restoredImage = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenantA.id,
      siteA.id,
      imagePage.page.id,
      createImageDocument(assetA),
    );
    expect(
      await countVersionAssetUsage(observer, restoredImage.draft.id, assetA),
    ).toBe(1);
    expect(await readDraftPointer(observer, imagePage.page.id)).toBe(
      restoredImage.draft.id,
    );
    expect(
      (await saveDraftResponse(
        application,
        origin,
        memberCookie,
        tenantA.id,
        siteA.id,
        pageA.page.id,
        { schemaVersion: 1, sections: [], published: true },
      )).status,
    ).toBe(400);
    expect(await countPageVersions(observer, pageA.page.id)).toBe(
      versionsBeforeFailedSave,
    );

    await observer.native`
      UPDATE page_versions
      SET document = ${{ schemaVersion: 1, sections: [], unexpected: true }}
      WHERE id = ${saved.draft.id}
    `;
    const malformed = await application.app.request(
      `${pageCollectionPath(tenantA.id, siteA.id)}/${pageA.page.id}`,
      { headers: { cookie: memberCookie } },
    );
    expect(malformed.status).toBe(500);
    expect(await malformed.json()).toEqual({ error: "Internal server error." });
    const [malformedStored] = await observer.native<Array<{ document: unknown }>>`
      SELECT document FROM page_versions WHERE id = ${saved.draft.id}
    `;
    expect(malformedStored?.document).toEqual({
      schemaVersion: 1,
      sections: [],
      unexpected: true,
    });
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
  }
}

function createPageRouteTestApplication(error: Error): Hono<ApiBindings> {
  const app = new Hono<ApiBindings>();
  app.route(
    "/tenants/:tenantId/sites/:siteId/pages",
    createPageRoutes(
      createPageRouteAuthService(),
      createPageRouteTenantPersistence(),
      createFailingPagePersistence(error),
      createUnusedPreviewPersistence(),
      createUnusedPublishPersistence(),
    ),
  );
  app.onError(() => Response.json({ error: "Internal server error." }, { status: 500 }));
  return app;
}

async function requestPageRouteTest(app: Hono<ApiBindings>): Promise<Response> {
  return await app.request(
    "/tenants/11111111-1111-4111-8111-111111111111/sites/22222222-2222-4222-8222-222222222222/pages",
    {
      method: "POST",
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        origin: "https://admin.example.com",
      },
      body: JSON.stringify({
        title: "Page",
        slug: "page",
        document: DOCUMENT_A,
      }),
    },
  );
}

function createPageRouteAuthService(): AuthService {
  const session: AuthenticatedSession = {
    status: "authenticated",
    user: {
      id: "page-route-user",
      email: "page-route@example.com",
      displayName: "Page Route User",
    },
    expiresAt: "2026-09-07T00:00:00.000Z",
  };
  return {
    login: async () => {
      throw new Error("Unused login.");
    },
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => session,
    registerIdentity: async () => session.user,
    isTrustedOrigin: (origin) => origin === "https://admin.example.com",
  };
}

function createPageRouteTenantPersistence(): TenantPersistence {
  return {
    createTenantWithOwner: async () => {
      throw new Error("Unused tenant creation.");
    },
    listTenantAccess: async () => [],
    resolveTenantAccess: async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Page Route Tenant",
      role: "owner",
    }),
  };
}

function createFailingPagePersistence(error: Error): PagePersistence {
  return {
    listPages: async () => [],
    createPage: async () => {
      throw error;
    },
    resolvePageDraft: async () => null,
    saveDraftVersion: async () => null,
  };
}

function createUnusedPreviewPersistence(): PreviewPersistence {
  return {
    createOrRotatePreviewToken: async () => null,
    resolvePreviewPage: async () => null,
    resolvePreviewAsset: async () => null,
  };
}

function createUnusedPublishPersistence(): PublishPersistence {
  return {
    resolvePublishCandidate: async () => null,
    commitPublication: async () => "not-found",
  };
}

function createIdentity(label: string, password: string): TestIdentity {
  return {
    name: `Page ${label}`,
    email: `page-${label.toLowerCase()}-${crypto.randomUUID()}@example.com`,
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
  name: string,
) {
  const response = await application.app.request("/tenants", {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name }),
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
  const response = await createPageResponse(
    application,
    cookie,
    tenantId,
    siteId,
    title,
    slug,
    document,
    origin,
  );
  expect(response.status).toBe(201);
  return pageDraftSchema.parse(await response.json());
}

async function createPageResponse(
  application: ApiApplication,
  cookie: string,
  tenantId: string,
  siteId: string,
  title: string,
  slug: string,
  document: unknown,
  origin?: string,
): Promise<Response> {
  const headers = new Headers({
    cookie,
    "content-type": JSON_CONTENT_TYPE,
  });
  if (origin) {
    headers.set("origin", origin);
  }
  return await application.app.request(pageCollectionPath(tenantId, siteId), {
    method: "POST",
    headers,
    body: JSON.stringify({ title, slug, document }),
  });
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
  const response = await saveDraftResponse(
    application,
    origin,
    cookie,
    tenantId,
    siteId,
    pageId,
    document,
  );
  expect(response.status).toBe(201);
  return pageDraftSchema.parse(await response.json());
}

async function saveDraftResponse(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  pageId: string,
  document: unknown,
): Promise<Response> {
  return await application.app.request(
    `${pageCollectionPath(tenantId, siteId)}/${pageId}/versions`,
    {
      method: "POST",
      headers: createRequestHeaders(origin, cookie),
      body: JSON.stringify({ document }),
    },
  );
}

async function countPageVersions(
  observer: DatabaseClient,
  pageId: string,
): Promise<number> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM page_versions WHERE page_id = ${pageId}
  `;
  return row?.count ?? 0;
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

async function readDraftPointer(
  observer: DatabaseClient,
  pageId: string,
): Promise<string | null> {
  const [row] = await observer.native<Array<{ draftVersionId: string | null }>>`
    SELECT draft_version_id AS "draftVersionId"
    FROM pages
    WHERE id = ${pageId}
  `;
  return row?.draftVersionId ?? null;
}

function createImageDocument(
  assetId: string,
  duplicate = false,
): PageDocument {
  const image = () => ({
    id: crypto.randomUUID(),
    type: "image" as const,
    assetId,
    alt: "Image",
  });
  return {
    schemaVersion: 1,
    sections: [
      {
        id: crypto.randomUUID(),
        blocks: duplicate ? [image(), image()] : [image()],
      },
    ],
  };
}

function pageCollectionPath(tenantId: string, siteId: string): string {
  return `/tenants/${tenantId}/sites/${siteId}/pages`;
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
