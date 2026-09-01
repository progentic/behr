import { and, asc, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { domains, sites, themes } from "./schema";

type SiteRecord = Readonly<{
  id: string;
  name: string;
  hostname: string;
}>;

type SiteThemeValues = Readonly<{
  colorScheme: string;
  fontFamily: string;
}>;

type SiteSettingsRecord = Readonly<{
  site: SiteRecord;
  theme: SiteThemeValues | null;
}>;

export type SitePersistence = Readonly<{
  createSite: (
    tenantId: string,
    name: string,
    hostname: string,
  ) => Promise<SiteRecord>;
  listSites: (tenantId: string) => Promise<SiteRecord[]>;
  resolveSiteSettings: (
    tenantId: string,
    siteId: string,
  ) => Promise<SiteSettingsRecord | null>;
  updateSiteSettings: (
    tenantId: string,
    siteId: string,
    name: string,
    theme: SiteThemeValues,
  ) => Promise<SiteSettingsRecord | null>;
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
    resolveSiteSettings: (tenantId, siteId) =>
      resolveSiteSettings(client, tenantId, siteId),
    updateSiteSettings: (tenantId, siteId, name, theme) =>
      updateSiteSettings(client, tenantId, siteId, name, theme),
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

async function resolveSiteSettings(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
): Promise<SiteSettingsRecord | null> {
  const [record] = await client.drizzle
    .select({
      site: {
        id: sites.id,
        name: sites.name,
        hostname: domains.hostname,
      },
      theme: {
        colorScheme: themes.colorScheme,
        fontFamily: themes.fontFamily,
      },
    })
    .from(sites)
    .innerJoin(domains, eq(domains.siteId, sites.id))
    .leftJoin(themes, eq(themes.siteId, sites.id))
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  return record ?? null;
}

async function updateSiteSettings(
  client: DatabaseClient,
  tenantId: string,
  siteId: string,
  name: string,
  theme: SiteThemeValues,
): Promise<SiteSettingsRecord | null> {
  return await client.drizzle.transaction(async (transaction) => {
    const [currentSite] = await transaction
      .select({ id: sites.id, hostname: domains.hostname })
      .from(sites)
      .innerJoin(domains, eq(domains.siteId, sites.id))
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1)
      .for("update");
    if (!currentSite) {
      return null;
    }
    const [updatedSite] = await transaction
      .update(sites)
      .set({ name })
      .where(and(eq(sites.id, currentSite.id), eq(sites.tenantId, tenantId)))
      .returning({ id: sites.id, name: sites.name });
    if (!updatedSite) {
      throw new Error("Site settings update returned no site record.");
    }
    const [updatedTheme] = await transaction
      .insert(themes)
      .values({ siteId: currentSite.id, ...theme })
      .onConflictDoUpdate({ target: themes.siteId, set: theme })
      .returning({
        colorScheme: themes.colorScheme,
        fontFamily: themes.fontFamily,
      });
    if (!updatedTheme) {
      throw new Error("Site settings update returned no theme record.");
    }
    return {
      site: { ...updatedSite, hostname: currentSite.hostname },
      theme: updatedTheme,
    };
  });
}
