import { asc, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { domains, sites } from "./schema";

type SiteRecord = Readonly<{
  id: string;
  name: string;
  hostname: string;
}>;

export type SitePersistence = Readonly<{
  createSite: (
    tenantId: string,
    name: string,
    hostname: string,
  ) => Promise<SiteRecord>;
  listSites: (tenantId: string) => Promise<SiteRecord[]>;
}>;

export class SiteHostnameConflictError extends Error {
  constructor() {
    super("Hostname is already assigned.");
    this.name = "SiteHostnameConflictError";
  }
}

export function createSitePersistence(client: DatabaseClient): SitePersistence {
  return Object.freeze({
    createSite: (tenantId, name, hostname) =>
      createSite(client, tenantId, name, hostname),
    listSites: (tenantId) => listSites(client, tenantId),
  });
}

async function createSite(
  client: DatabaseClient,
  tenantId: string,
  name: string,
  hostname: string,
): Promise<SiteRecord> {
  return await client.drizzle.transaction(async (transaction) => {
    const [createdSite] = await transaction
      .insert(sites)
      .values({ tenantId, name })
      .returning({ id: sites.id, name: sites.name });
    if (!createdSite) {
      throw new Error("Site creation returned no record.");
    }
    const [createdDomain] = await transaction
      .insert(domains)
      .values({ hostname, siteId: createdSite.id })
      .onConflictDoNothing({ target: domains.hostname })
      .returning({ hostname: domains.hostname });
    if (!createdDomain) {
      throw new SiteHostnameConflictError();
    }
    return { ...createdSite, hostname: createdDomain.hostname };
  });
}

async function listSites(
  client: DatabaseClient,
  tenantId: string,
): Promise<SiteRecord[]> {
  return await client.drizzle
    .select({
      id: sites.id,
      name: sites.name,
      hostname: domains.hostname,
    })
    .from(sites)
    .innerJoin(domains, eq(domains.siteId, sites.id))
    .where(eq(sites.tenantId, tenantId))
    .orderBy(asc(sites.createdAt), asc(sites.id));
}
