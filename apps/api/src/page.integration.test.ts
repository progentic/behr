import { expect, test } from "bun:test";
import {
  type PageDocument,
  type PageDraft,
  pageDraftSchema,
  pageListResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  createDatabaseClient,
  loadDatabaseConfig,
  memberships,
  pages,
} from "@bher/db";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

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
        pageCount: number;
        versionCount: number;
        versionId: string;
        documentType: string;
      }>
    >`
      SELECT
        page.draft_version_id AS "draftVersionId",
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
      Array<{ draftVersionId: string }>
    >`
      SELECT draft_version_id AS "draftVersionId"
      FROM pages
      WHERE id = ${pageA.page.id}
    `;
    expect(currentPointer?.draftVersionId).toBe(saved.draft.id);

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
    await observer.native`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  for (const userId of userIds) {
    await observer.native`DELETE FROM "user" WHERE id = ${userId}`;
  }
}
