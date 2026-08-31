import { and, eq, isNotNull } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import {
  assets,
  domains,
  pages,
  pageVersionAssets,
  pageVersions,
  sites,
} from "./schema";

export type PublicPageRecord = Readonly<{
  title: string;
  slug: string;
  document: unknown;
}>;

export type PublicAssetRecord = Readonly<{
  storageKey: string;
  contentType: string;
}>;

export type PublicPagePersistence = Readonly<{
  resolvePublishedPage: (
    hostname: string,
    slug: string,
  ) => Promise<PublicPageRecord | null>;
  resolvePublishedAsset: (
    hostname: string,
    assetId: string,
  ) => Promise<PublicAssetRecord | null>;
}>;

export function createPublicPagePersistence(
  client: DatabaseClient,
): PublicPagePersistence {
  return Object.freeze({
    resolvePublishedPage: (hostname, slug) =>
      resolvePublishedPage(client, hostname, slug),
    resolvePublishedAsset: (hostname, assetId) =>
      resolvePublishedAsset(client, hostname, assetId),
  });
}

async function resolvePublishedAsset(
  client: DatabaseClient,
  hostname: string,
  assetId: string,
): Promise<PublicAssetRecord | null> {
  const records = await client.drizzle
    .select({
      storageKey: assets.storageKey,
      contentType: assets.contentType,
    })
    .from(domains)
    .innerJoin(sites, eq(sites.id, domains.siteId))
    .innerJoin(assets, eq(assets.siteId, sites.id))
    .innerJoin(pages, eq(pages.siteId, sites.id))
    .innerJoin(
      pageVersions,
      and(
        eq(pageVersions.id, pages.publishedVersionId),
        eq(pageVersions.pageId, pages.id),
      ),
    )
    .innerJoin(
      pageVersionAssets,
      and(
        eq(pageVersionAssets.pageVersionId, pageVersions.id),
        eq(pageVersionAssets.assetId, assets.id),
      ),
    )
    .where(
      and(
        eq(domains.hostname, hostname),
        eq(assets.id, assetId),
        isNotNull(pages.publishedVersionId),
      ),
    )
    .limit(1);
  return records[0] ?? null;
}

async function resolvePublishedPage(
  client: DatabaseClient,
  hostname: string,
  slug: string,
): Promise<PublicPageRecord | null> {
  const records = await client.drizzle
    .select({
      title: pages.title,
      slug: pages.slug,
      document: pageVersions.document,
    })
    .from(domains)
    .innerJoin(sites, eq(sites.id, domains.siteId))
    .innerJoin(pages, eq(pages.siteId, sites.id))
    .innerJoin(
      pageVersions,
      and(
        eq(pageVersions.id, pages.publishedVersionId),
        eq(pageVersions.pageId, pages.id),
      ),
    )
    .where(
      and(
        eq(domains.hostname, hostname),
        eq(pages.slug, slug),
        isNotNull(pages.publishedVersionId),
      ),
    )
    .limit(1);
  return records[0] ?? null;
}
