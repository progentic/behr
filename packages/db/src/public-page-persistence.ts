import { and, eq, isNotNull } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { domains, pages, pageVersions, sites } from "./schema";

export type PublicPageRecord = Readonly<{
  title: string;
  slug: string;
  document: unknown;
}>;

export type PublicPagePersistence = Readonly<{
  resolvePublishedPage: (
    hostname: string,
    slug: string,
  ) => Promise<PublicPageRecord | null>;
}>;

export function createPublicPagePersistence(
  client: DatabaseClient,
): PublicPagePersistence {
  return Object.freeze({
    resolvePublishedPage: (hostname, slug) =>
      resolvePublishedPage(client, hostname, slug),
  });
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
