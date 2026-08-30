import { and, asc, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { pages, pageVersions, sites } from "./schema";

type PageSummaryRecord = Readonly<{
  id: string;
  title: string;
  slug: string;
}>;

type PageDraftRecord = Readonly<{
  page: PageSummaryRecord;
  draft: Readonly<{
    id: string;
    document: unknown;
    createdAt: Date;
  }>;
}>;

export type PagePersistence = Readonly<{
  listPages: (tenantId: string, siteId: string) => Promise<PageSummaryRecord[]>;
  createPage: (
    tenantId: string,
    siteId: string,
    title: string,
    slug: string,
    document: unknown,
  ) => Promise<PageDraftRecord>;
  resolvePageDraft: (
    tenantId: string,
    siteId: string,
    pageId: string,
  ) => Promise<PageDraftRecord | null>;
  saveDraftVersion: (
    tenantId: string,
    siteId: string,
    pageId: string,
    document: unknown,
  ) => Promise<PageDraftRecord | null>;
}>;

export class PageScopeNotFoundError extends Error {
  constructor() {
    super("Page scope was not found.");
    this.name = "PageScopeNotFoundError";
  }
}

export class PageSlugConflictError extends Error {
  constructor() {
    super("Page slug already exists in the site.");
    this.name = "PageSlugConflictError";
  }
}

export function createPagePersistence(client: DatabaseClient): PagePersistence {
  return Object.freeze({
    listPages: (tenantId, siteId) => listPages(client, tenantId, siteId),
    createPage: (tenantId, siteId, title, slug, document) =>
      createPageRecord(client, tenantId, siteId, title, slug, document),
    resolvePageDraft: (tenantId, siteId, pageId) =>
      resolvePageDraft(client, tenantId, siteId, pageId),
    saveDraftVersion: (tenantId, siteId, pageId, document) =>
      saveDraftVersion(client, tenantId, siteId, pageId, document),
  });
}

async function listPages(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
): Promise<PageSummaryRecord[]> {
  const [scopedSite] = await client.drizzle
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  if (!scopedSite) {
    throw new PageScopeNotFoundError();
  }
  return await client.drizzle
    .select({ id: pages.id, title: pages.title, slug: pages.slug })
    .from(pages)
    .where(eq(pages.siteId, scopedSite.id))
    .orderBy(asc(pages.createdAt), asc(pages.id));
}

async function createPageRecord(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  title: string,
  slug: string,
  document: unknown,
): Promise<PageDraftRecord> {
  return await client.drizzle.transaction(async (transaction) => {
    const [scopedSite] = await transaction
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);
    if (!scopedSite) {
      throw new PageScopeNotFoundError();
    }
    const [page] = await transaction
      .insert(pages)
      .values({ siteId: scopedSite.id, title, slug })
      .onConflictDoNothing({ target: [pages.siteId, pages.slug] })
      .returning({ id: pages.id, title: pages.title, slug: pages.slug });
    if (!page) {
      throw new PageSlugConflictError();
    }
    const [draft] = await transaction
      .insert(pageVersions)
      .values({ pageId: page.id, document })
      .returning({
        id: pageVersions.id,
        document: pageVersions.document,
        createdAt: pageVersions.createdAt,
      });
    if (!draft) {
      throw new Error("Initial page version returned no record.");
    }
    const [updatedPage] = await transaction
      .update(pages)
      .set({ draftVersionId: draft.id, updatedAt: new Date() })
      .where(eq(pages.id, page.id))
      .returning({ id: pages.id });
    if (!updatedPage) {
      throw new Error("Initial draft pointer was not persisted.");
    }
    return { page, draft };
  });
}

async function resolvePageDraft(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<PageDraftRecord | null> {
  const records = await client.drizzle
    .select({
      page: { id: pages.id, title: pages.title, slug: pages.slug },
      draft: {
        id: pageVersions.id,
        document: pageVersions.document,
        createdAt: pageVersions.createdAt,
      },
    })
    .from(pages)
    .innerJoin(sites, eq(sites.id, pages.siteId))
    .innerJoin(pageVersions, eq(pageVersions.id, pages.draftVersionId))
    .where(
      and(
        eq(sites.tenantId, tenantId),
        eq(sites.id, siteId),
        eq(pages.id, pageId),
      ),
    )
    .limit(1);
  return records[0] ?? null;
}

async function saveDraftVersion(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  pageId: string,
  document: unknown,
): Promise<PageDraftRecord | null> {
  return await client.drizzle.transaction(async (transaction) => {
    const [page] = await transaction
      .select({ id: pages.id, title: pages.title, slug: pages.slug })
      .from(pages)
      .innerJoin(sites, eq(sites.id, pages.siteId))
      .where(
        and(
          eq(sites.tenantId, tenantId),
          eq(sites.id, siteId),
          eq(pages.id, pageId),
        ),
      )
      .limit(1);
    if (!page) {
      return null;
    }
    const [draft] = await transaction
      .insert(pageVersions)
      .values({ pageId: page.id, document })
      .returning({
        id: pageVersions.id,
        document: pageVersions.document,
        createdAt: pageVersions.createdAt,
      });
    if (!draft) {
      throw new Error("Draft version returned no record.");
    }
    const [updatedPage] = await transaction
      .update(pages)
      .set({ draftVersionId: draft.id, updatedAt: new Date() })
      .where(eq(pages.id, page.id))
      .returning({ id: pages.id });
    if (!updatedPage) {
      throw new Error("Draft pointer update failed.");
    }
    return { page, draft };
  });
}
