import { and, eq, gt } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import {
  domains,
  pages,
  pageVersions,
  previewTokens,
  sites,
} from "./schema";

type PreviewTokenRecord = Readonly<{
  expiresAt: Date;
}>;

export type PreviewPageRecord = Readonly<{
  title: string;
  slug: string;
  document: unknown;
}>;

export type PreviewPersistence = Readonly<{
  createOrRotatePreviewToken: (
    tenantId: string,
    siteId: string,
    pageId: string,
    tokenHash: string,
    expiresAt: Date,
  ) => Promise<PreviewTokenRecord | null>;
  resolvePreviewPage: (
    hostname: string,
    slug: string,
    tokenHash: string,
    now: Date,
  ) => Promise<PreviewPageRecord | null>;
}>;

export function createPreviewPersistence(
  client: DatabaseClient,
): PreviewPersistence {
  return Object.freeze({
    createOrRotatePreviewToken: (
      tenantId,
      siteId,
      pageId,
      tokenHash,
      expiresAt,
    ) =>
      createOrRotatePreviewToken(
        client,
        tenantId,
        siteId,
        pageId,
        tokenHash,
        expiresAt,
      ),
    resolvePreviewPage: (hostname, slug, tokenHash, now) =>
      resolvePreviewPage(client, hostname, slug, tokenHash, now),
  });
}

async function createOrRotatePreviewToken(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  pageId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<PreviewTokenRecord | null> {
  return await client.drizzle.transaction(async (transaction) => {
    const [page] = await transaction
      .select({ id: pages.id, versionId: pageVersions.id })
      .from(pages)
      .innerJoin(sites, eq(sites.id, pages.siteId))
      .innerJoin(
        pageVersions,
        and(
          eq(pageVersions.id, pages.draftVersionId),
          eq(pageVersions.pageId, pages.id),
        ),
      )
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
    const [persistedToken] = await transaction
      .insert(previewTokens)
      .values({
        pageId: page.id,
        versionId: page.versionId,
        tokenHash,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: previewTokens.pageId,
        set: {
          versionId: page.versionId,
          tokenHash,
          expiresAt,
          createdAt: new Date(),
        },
      })
      .returning({ expiresAt: previewTokens.expiresAt });
    if (!persistedToken) {
      throw new Error("Preview token persistence returned no record.");
    }
    return persistedToken;
  });
}

async function resolvePreviewPage(
  client: DatabaseClient,
  hostname: string,
  slug: string,
  tokenHash: string,
  now: Date,
): Promise<PreviewPageRecord | null> {
  const records = await client.drizzle
    .select({
      title: pages.title,
      slug: pages.slug,
      document: pageVersions.document,
    })
    .from(domains)
    .innerJoin(sites, eq(sites.id, domains.siteId))
    .innerJoin(pages, eq(pages.siteId, sites.id))
    .innerJoin(previewTokens, eq(previewTokens.pageId, pages.id))
    .innerJoin(
      pageVersions,
      and(
        eq(pageVersions.id, previewTokens.versionId),
        eq(pageVersions.pageId, previewTokens.pageId),
      ),
    )
    .where(
      and(
        eq(domains.hostname, hostname),
        eq(pages.slug, slug),
        eq(previewTokens.tokenHash, tokenHash),
        gt(previewTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return records[0] ?? null;
}
