import { expect, test } from "bun:test";
import {
  PREVIEW_TOKEN_HEADER,
  type PageDocument,
  type PageDraft,
  pageDocumentSchema,
  pageDraftSchema,
  previewTokenResponseSchema,
  publishResponseSchema,
  publicPageResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  createDatabaseClient,
  createPublishPersistence,
  loadDatabaseConfig,
  memberships,
} from "@bher/db";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const OWNER_PASSWORD = "publish-owner-password";
const MEMBER_PASSWORD = "publish-member-password";
const OUTSIDER_PASSWORD = "publish-outsider-password";
const HOSTNAME = "publish.example.com";
const JSON_CONTENT_TYPE = "application/json";
const DOCUMENT_A = createParagraphDocument("Published document A");
const DOCUMENT_B = createParagraphDocument("Published document B");
const DOCUMENT_C = createParagraphDocument("Published document C");

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

type PublicationEvent = Readonly<{
  id: string;
  pageId: string;
  versionId: string;
  publishedByUserId: string;
  publishedAt: Date;
}>;

type PreviewRecord = Readonly<{
  versionId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

test("enforces the owner-only publication lifecycle", verifyPublishLifecycle);

async function verifyPublishLifecycle(): Promise<void> {
  const environment = process.env;
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const publishPersistence = createPublishPersistence(observer);
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
    );
    const page = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Publish Page",
      "publish-page",
      DOCUMENT_A,
    );
    const otherPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Other Page",
      "other-page",
      DOCUMENT_B,
    );

    const previewIssue = await issuePreviewToken(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(previewIssue.status).toBe(201);
    const previewCredential = previewTokenResponseSchema.parse(
      await previewIssue.json(),
    );
    const previewBefore = await readPreviewRecord(observer, page.page.id);

    const unauthenticated = await publishPage(
      application,
      origin,
      undefined,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(unauthenticated.status).toBe(401);
    const memberDenied = await publishPage(
      application,
      origin,
      memberCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(memberDenied.status).toBe(403);
    expect(await memberDenied.json()).toEqual({
      error: "Publishing is not allowed.",
    });
    const outsiderDenied = await publishPage(
      application,
      origin,
      outsiderCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(outsiderDenied.status).toBe(404);
    const originDenied = await publishPage(
      application,
      undefined,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(originDenied.status).toBe(403);
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: page.draft.id,
      publishedVersionId: null,
    });
    expect(await countPublicationEvents(observer, page.page.id)).toBe(0);

    const attackerFields = {
      versionId: otherPage.draft.id,
      draftVersionId: otherPage.draft.id,
      publishedVersionId: otherPage.draft.id,
      userId: outsider.id,
      actorId: outsider.id,
      publishedByUserId: outsider.id,
    };
    const initialPublish = await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
      `versionId=${otherPage.draft.id}&publishedByUserId=${outsider.id}`,
      attackerFields,
    );
    expect(initialPublish.status).toBe(200);
    const initialBody = publishResponseSchema.parse(await initialPublish.json());
    expect(initialBody).toEqual({ status: "published" });
    expect(Object.keys(initialBody)).toEqual(["status"]);
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: page.draft.id,
      publishedVersionId: page.draft.id,
    });
    expect(await countPublicationEvents(observer, page.page.id)).toBe(1);
    const firstEvents = await readPublicationEvents(observer, page.page.id);
    expect(firstEvents).toHaveLength(1);
    expect(firstEvents[0]).toMatchObject({
      pageId: page.page.id,
      versionId: page.draft.id,
      publishedByUserId: owner.id,
    });
    expect(firstEvents[0]?.publishedAt).toBeInstanceOf(Date);
    expect(await publicationEventsBelongToPage(observer, page.page.id)).toBe(
      true,
    );
    expect(await readVersionDocument(observer, page.draft.id)).toEqual(
      DOCUMENT_A,
    );
    expect(
      await readPublicDocument(application, HOSTNAME, "publish-page"),
    ).toEqual(DOCUMENT_A);
    expect(await readPreviewRecord(observer, page.page.id)).toEqual(
      previewBefore,
    );
    expect(
      await readPreviewDocument(
        application,
        HOSTNAME,
        "publish-page",
        previewCredential.token,
      ),
    ).toEqual(DOCUMENT_A);

    const savedB = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
      DOCUMENT_B,
    );
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: savedB.draft.id,
      publishedVersionId: page.draft.id,
    });
    expect(await countPublicationEvents(observer, page.page.id)).toBe(1);
    expect(
      await readPublicDocument(application, HOSTNAME, "publish-page"),
    ).toEqual(DOCUMENT_A);

    const secondPublish = await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(secondPublish.status).toBe(200);
    expect(publishResponseSchema.parse(await secondPublish.json())).toEqual({
      status: "published",
    });
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: savedB.draft.id,
      publishedVersionId: savedB.draft.id,
    });
    expect(await countPublicationEvents(observer, page.page.id)).toBe(2);
    expect(
      await readPublicDocument(application, HOSTNAME, "publish-page"),
    ).toEqual(DOCUMENT_B);
    expect(await readVersionDocument(observer, page.draft.id)).toEqual(
      DOCUMENT_A,
    );
    expect(await readVersionDocument(observer, savedB.draft.id)).toEqual(
      DOCUMENT_B,
    );

    const versionCountBeforeRepeat = await countPageVersions(
      observer,
      page.page.id,
    );
    const repeatPublish = await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
    );
    expect(repeatPublish.status).toBe(200);
    expect(publishResponseSchema.parse(await repeatPublish.json())).toEqual({
      status: "unchanged",
    });
    expect(await countPublicationEvents(observer, page.page.id)).toBe(2);
    expect(await countPageVersions(observer, page.page.id)).toBe(
      versionCountBeforeRepeat,
    );
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: savedB.draft.id,
      publishedVersionId: savedB.draft.id,
    });

    const savedC = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      page.page.id,
      DOCUMENT_C,
    );
    const eventsBeforeConcurrent = await countPublicationEvents(
      observer,
      page.page.id,
    );
    const concurrentResponses = await Promise.all([
      publishPage(
        application,
        origin,
        ownerCookie,
        tenant.id,
        site.id,
        page.page.id,
      ),
      publishPage(
        application,
        origin,
        ownerCookie,
        tenant.id,
        site.id,
        page.page.id,
      ),
    ]);
    const concurrentStatuses = await Promise.all(
      concurrentResponses.map(async (response) => {
        expect(response.status).toBe(200);
        return publishResponseSchema.parse(await response.json()).status;
      }),
    );
    expect(concurrentStatuses.sort()).toEqual(["published", "unchanged"]);
    expect(await countPublicationEvents(observer, page.page.id)).toBe(
      eventsBeforeConcurrent + 1,
    );
    expect(await readPagePointers(observer, page.page.id)).toEqual({
      draftVersionId: savedC.draft.id,
      publishedVersionId: savedC.draft.id,
    });
    expect(await readPreviewRecord(observer, page.page.id)).toEqual(
      previewBefore,
    );
    expect(
      await readPreviewDocument(
        application,
        HOSTNAME,
        "publish-page",
        previewCredential.token,
      ),
    ).toEqual(DOCUMENT_A);

    const stalePage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Stale Page",
      "stale-page",
      DOCUMENT_A,
    );
    const staleCandidate = await publishPersistence.resolvePublishCandidate(
      tenant.id,
      site.id,
      stalePage.page.id,
    );
    if (!staleCandidate) {
      throw new Error("Expected stale publication candidate.");
    }
    pageDocumentSchema.parse(staleCandidate.document);
    const staleSavedB = await saveDraft(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      stalePage.page.id,
      DOCUMENT_B,
    );
    const staleEventCount = await countPublicationEvents(
      observer,
      stalePage.page.id,
    );
    expect(
      await publishPersistence.commitPublication(
        tenant.id,
        site.id,
        stalePage.page.id,
        staleCandidate.versionId,
        owner.id,
      ),
    ).toBe("stale");
    expect(await readPagePointers(observer, stalePage.page.id)).toEqual({
      draftVersionId: staleSavedB.draft.id,
      publishedVersionId: null,
    });
    expect(await countPublicationEvents(observer, stalePage.page.id)).toBe(
      staleEventCount,
    );
    expect(
      await publishPersistence.commitPublication(
        tenant.id,
        site.id,
        stalePage.page.id,
        otherPage.draft.id,
        owner.id,
      ),
    ).toBe("not-found");

    const malformedPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Malformed Page",
      "malformed-page",
      DOCUMENT_A,
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
    const malformedPublish = await publishPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      malformedPage.page.id,
    );
    expect(malformedPublish.status).toBe(500);
    expect(await malformedPublish.json()).toEqual({
      error: "Internal server error.",
    });
    expect(await readPublishedVersionId(observer, malformedPage.page.id)).toBe(
      null,
    );
    expect(await countPublicationEvents(observer, malformedPage.page.id)).toBe(
      0,
    );
    expect(
      await readVersionDocument(observer, malformedPage.draft.id),
    ).toEqual(malformedDocument);

    const rollbackPage = await createPage(
      application,
      origin,
      ownerCookie,
      tenant.id,
      site.id,
      "Rollback Page",
      "rollback-page",
      DOCUMENT_A,
    );
    const rollbackCandidate = await publishPersistence.resolvePublishCandidate(
      tenant.id,
      site.id,
      rollbackPage.page.id,
    );
    if (!rollbackCandidate) {
      throw new Error("Expected rollback publication candidate.");
    }
    pageDocumentSchema.parse(rollbackCandidate.document);
    let rollbackRejected = false;
    try {
      await publishPersistence.commitPublication(
        tenant.id,
        site.id,
        rollbackPage.page.id,
        rollbackCandidate.versionId,
        "missing-publisher-user-id",
      );
    } catch {
      rollbackRejected = true;
    }
    expect(rollbackRejected).toBe(true);
    expect(await readPublishedVersionId(observer, rollbackPage.page.id)).toBe(
      null,
    );
    expect(await countPublicationEvents(observer, rollbackPage.page.id)).toBe(
      0,
    );
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
  }
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

function createIdentity(label: string, password: string): TestIdentity {
  return {
    name: `Publish ${label}`,
    email: `publish-${label.toLowerCase()}-${crypto.randomUUID()}@example.com`,
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
    body: JSON.stringify({ name: "Publish Tenant" }),
  });
  expect(response.status).toBe(201);
  return tenantAccessSchema.parse(await response.json());
}

async function createSite(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
) {
  const response = await application.app.request(`/tenants/${tenantId}/sites`, {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name: "Publish Site", hostname: HOSTNAME }),
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

async function publishPage(
  application: ApiApplication,
  origin: string | undefined,
  cookie: string | undefined,
  tenantId: string,
  siteId: string,
  pageId: string,
  query = "",
  body?: unknown,
): Promise<Response> {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (body !== undefined) {
    headers.set("content-type", JSON_CONTENT_TYPE);
  }
  const suffix = query.length > 0 ? `?${query}` : "";
  return await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/publish${suffix}`,
    {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

async function issuePreviewToken(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<Response> {
  return await application.app.request(
    `/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/preview-tokens`,
    {
      method: "POST",
      headers: createRequestHeaders(origin, cookie),
    },
  );
}

async function readPublicDocument(
  application: ApiApplication,
  hostname: string,
  slug: string,
): Promise<PageDocument> {
  const response = await application.app.request(`/public/page?slug=${slug}`, {
    headers: { host: hostname },
  });
  expect(response.status).toBe(200);
  return publicPageResponseSchema.parse(await response.json()).document;
}

async function readPreviewDocument(
  application: ApiApplication,
  hostname: string,
  slug: string,
  token: string,
): Promise<PageDocument> {
  const response = await application.app.request(`/preview/page?slug=${slug}`, {
    headers: { host: hostname, [PREVIEW_TOKEN_HEADER]: token },
  });
  expect(response.status).toBe(200);
  return publicPageResponseSchema.parse(await response.json()).document;
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

async function readPublishedVersionId(
  observer: DatabaseClient,
  pageId: string,
): Promise<string | null> {
  return (await readPagePointers(observer, pageId))?.publishedVersionId ?? null;
}

async function readPublicationEvents(
  observer: DatabaseClient,
  pageId: string,
): Promise<PublicationEvent[]> {
  return await observer.native<PublicationEvent[]>`
    SELECT
      id,
      page_id AS "pageId",
      version_id AS "versionId",
      published_by_user_id AS "publishedByUserId",
      published_at AS "publishedAt"
    FROM page_publications
    WHERE page_id = ${pageId}
    ORDER BY published_at, id
  `;
}

async function countPublicationEvents(
  observer: DatabaseClient,
  pageId: string,
): Promise<number> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM page_publications
    WHERE page_id = ${pageId}
  `;
  return row?.count ?? 0;
}

async function publicationEventsBelongToPage(
  observer: DatabaseClient,
  pageId: string,
): Promise<boolean> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM page_publications
    INNER JOIN page_versions
      ON page_versions.id = page_publications.version_id
    WHERE page_publications.page_id = ${pageId}
      AND page_versions.page_id <> page_publications.page_id
  `;
  return (row?.count ?? 0) === 0;
}

async function countPageVersions(
  observer: DatabaseClient,
  pageId: string,
): Promise<number> {
  const [row] = await observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM page_versions
    WHERE page_id = ${pageId}
  `;
  return row?.count ?? 0;
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

async function readPreviewRecord(
  observer: DatabaseClient,
  pageId: string,
): Promise<PreviewRecord | undefined> {
  const [row] = await observer.native<PreviewRecord[]>`
    SELECT
      version_id AS "versionId",
      token_hash AS "tokenHash",
      expires_at AS "expiresAt"
    FROM preview_tokens
    WHERE page_id = ${pageId}
  `;
  return row;
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
        SELECT pages.id
        FROM pages
        INNER JOIN sites ON sites.id = pages.site_id
        WHERE sites.tenant_id = ${tenantId}
      )
    `;
    await observer.native`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  for (const userId of userIds) {
    await observer.native`DELETE FROM "user" WHERE id = ${userId}`;
  }
}
