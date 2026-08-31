import { and, asc, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { assets, sites } from "./schema";

export type NewAssetMetadata = Readonly<{
  id: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
}>;

export type AssetMetadataRecord = Readonly<{
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
}>;

export type AssetPersistence = Readonly<{
  resolveAssetSite: (tenantId: string, siteId: string) => Promise<boolean>;
  createAssetMetadata: (
    tenantId: string,
    siteId: string,
    metadata: NewAssetMetadata,
  ) => Promise<AssetMetadataRecord | null>;
  listSiteAssets: (
    tenantId: string,
    siteId: string,
  ) => Promise<AssetMetadataRecord[]>;
}>;

export function createAssetPersistence(
  client: DatabaseClient,
): AssetPersistence {
  return Object.freeze({
    resolveAssetSite: (tenantId, siteId) =>
      resolveAssetSite(client, tenantId, siteId),
    createAssetMetadata: (tenantId, siteId, metadata) =>
      createAssetMetadata(client, tenantId, siteId, metadata),
    listSiteAssets: (tenantId, siteId) =>
      listSiteAssets(client, tenantId, siteId),
  });
}

async function listSiteAssets(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
): Promise<AssetMetadataRecord[]> {
  return await client.drizzle
    .select({
      id: assets.id,
      originalFilename: assets.originalFilename,
      contentType: assets.contentType,
      byteSize: assets.byteSize,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .innerJoin(sites, eq(sites.id, assets.siteId))
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .orderBy(asc(assets.createdAt), asc(assets.id));
}

async function resolveAssetSite(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
): Promise<boolean> {
  const [site] = await client.drizzle
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  return site !== undefined;
}

async function createAssetMetadata(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  metadata: NewAssetMetadata,
): Promise<AssetMetadataRecord | null> {
  return await client.drizzle.transaction(async (transaction) => {
    const [site] = await transaction
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1)
      .for("update");
    if (!site) {
      return null;
    }
    const [record] = await transaction
      .insert(assets)
      .values({ ...metadata, siteId: site.id })
      .returning({
        id: assets.id,
        originalFilename: assets.originalFilename,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        createdAt: assets.createdAt,
      });
    if (!record) {
      throw new Error("Asset metadata insertion returned no record.");
    }
    return record;
  });
}
