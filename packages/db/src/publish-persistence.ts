import { and, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { pagePublications, pages, pageVersions, sites } from "./schema";

export type PublishCandidate = Readonly<{
  versionId: string;
  document: unknown;
}>;

export type PublishCommitResult =
  | "published"
  | "unchanged"
  | "stale"
  | "not-found";

export type PublishPersistence = Readonly<{
  resolvePublishCandidate: (
    tenantId: string,
    siteId: string,
    pageId: string,
  ) => Promise<PublishCandidate | null>;
  commitPublication: (
    tenantId: string,
    siteId: string,
    pageId: string,
    candidateVersionId: string,
    publisherUserId: string,
  ) => Promise<PublishCommitResult>;
}>;

export function createPublishPersistence(
  client: DatabaseClient,
): PublishPersistence {
  return Object.freeze({
    resolvePublishCandidate: (tenantId, siteId, pageId) =>
      resolvePublishCandidate(client, tenantId, siteId, pageId),
    commitPublication: (
      tenantId,
      siteId,
      pageId,
      candidateVersionId,
      publisherUserId,
    ) =>
      commitPublication(
        client,
        tenantId,
        siteId,
        pageId,
        candidateVersionId,
        publisherUserId,
      ),
  });
}

async function resolvePublishCandidate(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  pageId: string,
): Promise<PublishCandidate | null> {
  const records = await client.drizzle
    .select({
      versionId: pageVersions.id,
      document: pageVersions.document,
    })
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
  return records[0] ?? null;
}

async function commitPublication(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  pageId: string,
  candidateVersionId: string,
  publisherUserId: string,
): Promise<PublishCommitResult> {
  return await client.drizzle.transaction(async (transaction) => {
    const [page] = await transaction
      .select({
        id: pages.id,
        draftVersionId: pages.draftVersionId,
        publishedVersionId: pages.publishedVersionId,
      })
      .from(pages)
      .innerJoin(sites, eq(sites.id, pages.siteId))
      .innerJoin(
        pageVersions,
        and(
          eq(pageVersions.id, candidateVersionId),
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
      .limit(1)
      .for("update");
    if (!page) {
      return "not-found";
    }
    if (page.draftVersionId !== candidateVersionId) {
      return "stale";
    }
    if (page.publishedVersionId === candidateVersionId) {
      return "unchanged";
    }
    const [updated] = await transaction
      .update(pages)
      .set({ publishedVersionId: candidateVersionId, updatedAt: new Date() })
      .where(
        and(
          eq(pages.id, page.id),
          eq(pages.draftVersionId, candidateVersionId),
        ),
      )
      .returning({ id: pages.id });
    if (!updated) {
      return "stale";
    }
    await transaction.insert(pagePublications).values({
      pageId: page.id,
      versionId: candidateVersionId,
      publishedByUserId: publisherUserId,
    });
    return "published";
  });
}
