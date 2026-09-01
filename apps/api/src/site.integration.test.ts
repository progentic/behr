import { expect, test } from "bun:test";
import {
  DEFAULT_THEME_TOKENS,
  type SiteSummary,
  type TenantAccess,
  siteListResponseSchema,
  siteSettingsResponseSchema,
  siteSummarySchema,
  tenantAccessSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  createDatabaseClient,
  createSitePersistence,
  loadDatabaseConfig,
  memberships,
} from "@bher/db";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const OWNER_PASSWORD = "phase-e-owner-password";
const MEMBER_PASSWORD = "phase-e-member-password";
const JSON_CONTENT_TYPE = "application/json";

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

type StoredSiteSettings = Readonly<{
  name: string;
  hostname: string;
  themeCount: number;
  colorScheme: string | null;
  fontFamily: string | null;
}>;

test("enforces the site and hostname lifecycle", verifySiteLifecycle);

async function verifySiteLifecycle(): Promise<void> {
  const environment = process.env;
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const origin = loadApiConfig(environment).auth.baseUrl;
  const ownerIdentity: TestIdentity = {
    name: "Phase E Owner",
    email: `phase-e-owner-${crypto.randomUUID()}@example.com`,
    password: OWNER_PASSWORD,
  };
  const memberIdentity: TestIdentity = {
    name: "Phase E Member",
    email: `phase-e-member-${crypto.randomUUID()}@example.com`,
    password: MEMBER_PASSWORD,
  };
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    await observer.connect();
    const owner = await application.auth.registerIdentity(
      ownerIdentity,
      new Headers({ origin }),
    );
    const member = await application.auth.registerIdentity(
      memberIdentity,
      new Headers({ origin }),
    );
    createdUserIds.push(owner.id, member.id);
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

    const ownerTenant = await createTenant(
      application,
      origin,
      ownerCookie,
      "Owner Tenant",
    );
    const memberTenant = await createTenant(
      application,
      origin,
      memberCookie,
      "Member Tenant",
    );
    createdTenantIds.push(ownerTenant.id, memberTenant.id);
    await observer.drizzle.insert(memberships).values({
      tenantId: ownerTenant.id,
      userId: member.id,
      role: "member",
    });

    expect(
      (await application.app.request(
        `/tenants/${ownerTenant.id}/sites`,
      )).status,
    ).toBe(401);
    expect(
      (await application.app.request(`/tenants/${memberTenant.id}/sites`, {
        headers: { cookie: ownerCookie },
      })).status,
    ).toBe(404);

    const emptyOwnerList = await application.app.request(
      `/tenants/${ownerTenant.id}/sites`,
      { headers: { cookie: ownerCookie } },
    );
    expect(emptyOwnerList.status).toBe(200);
    expect(siteListResponseSchema.parse(await emptyOwnerList.json())).toEqual({
      sites: [],
    });

    const memberCreate = await application.app.request(
      `/tenants/${ownerTenant.id}/sites`,
      {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
        body: JSON.stringify({ name: "Denied", hostname: "denied.example.com" }),
      },
    );
    expect(memberCreate.status).toBe(403);

    const ownerCreate = await application.app.request(
      `/tenants/${ownerTenant.id}/sites`,
      {
        method: "POST",
        headers: createRequestHeaders(origin, ownerCookie),
        body: JSON.stringify({
          name: "  Main Site  ",
          hostname: "WWW.Example.COM",
        }),
      },
    );
    const ownerSite = siteSummarySchema.parse(await ownerCreate.json());
    expect(ownerCreate.status).toBe(201);
    expect(ownerSite).toEqual({
      id: ownerSite.id,
      name: "Main Site",
      hostname: "www.example.com",
    });

    const atomicCounts = await observer.native<
      Array<{ domainCount: number; siteCount: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM sites
          WHERE id = ${ownerSite.id} AND tenant_id = ${ownerTenant.id})
          AS "siteCount",
        (SELECT count(*)::int FROM domains
          WHERE hostname = ${ownerSite.hostname} AND site_id = ${ownerSite.id})
          AS "domainCount"
    `;
    expect(atomicCounts[0]).toEqual({ domainCount: 1, siteCount: 1 });

    const ownerList = await listSites(
      application,
      ownerTenant.id,
      ownerCookie,
    );
    const memberList = await listSites(
      application,
      ownerTenant.id,
      memberCookie,
    );
    expect(ownerList).toEqual([ownerSite]);
    expect(memberList).toEqual([ownerSite]);

    const duplicate = await application.app.request(
      `/tenants/${memberTenant.id}/sites`,
      {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
        body: JSON.stringify({
          name: "Duplicate Host",
          hostname: "www.EXAMPLE.com",
        }),
      },
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "Hostname is already assigned.",
    });
    const rejectedCounts = await observer.native<
      Array<{ domainCount: number; siteCount: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM sites
          WHERE tenant_id = ${memberTenant.id}) AS "siteCount",
        (SELECT count(*)::int FROM domains
          WHERE hostname = 'www.example.com') AS "domainCount"
    `;
    expect(rejectedCounts[0]).toEqual({ domainCount: 1, siteCount: 0 });

    const memberTenantCreate = await application.app.request(
      `/tenants/${memberTenant.id}/sites`,
      {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
        body: JSON.stringify({
          name: "Member Tenant Site",
          hostname: "member.example.com",
        }),
      },
    );
    const memberTenantSite = siteSummarySchema.parse(
      await memberTenantCreate.json(),
    );
    expect(memberTenantCreate.status).toBe(201);
    expect(
      await listSites(application, memberTenant.id, memberCookie),
    ).toEqual([memberTenantSite]);
    expect(
      await listSites(application, ownerTenant.id, ownerCookie),
    ).toEqual([ownerSite]);

    const settingsPath = `/tenants/${ownerTenant.id}/sites/${ownerSite.id}/settings`;
    expect((await application.app.request(settingsPath)).status).toBe(401);

    const defaultSettingsResponse = await application.app.request(
      settingsPath,
      { headers: { cookie: ownerCookie } },
    );
    expect(defaultSettingsResponse.status).toBe(200);
    expect(
      siteSettingsResponseSchema.parse(await defaultSettingsResponse.json()),
    ).toEqual({ site: ownerSite, theme: DEFAULT_THEME_TOKENS });
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: ownerSite.name,
      hostname: ownerSite.hostname,
      themeCount: 0,
      colorScheme: null,
      fontFamily: null,
    });

    const memberSettingsGet = await application.app.request(settingsPath, {
      headers: { cookie: memberCookie },
    });
    expect(memberSettingsGet.status).toBe(403);
    expect(await memberSettingsGet.json()).toEqual({
      error: "Site settings are not allowed.",
    });
    const memberSettingsPut = await requestSiteSettingsUpdate(
      application,
      settingsPath,
      origin,
      memberCookie,
      {
        name: "Member Mutation",
        theme: { colorScheme: "dark", fontFamily: "serif" },
      },
    );
    expect(memberSettingsPut.status).toBe(403);
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: ownerSite.name,
      hostname: ownerSite.hostname,
      themeCount: 0,
      colorScheme: null,
      fontFamily: null,
    });

    const invalidUpdate = await requestSiteSettingsUpdate(
      application,
      settingsPath,
      origin,
      ownerCookie,
      {
        name: "Changed",
        hostname: "attacker.example.com",
        theme: { colorScheme: "dark", fontFamily: "serif" },
      },
    );
    expect(invalidUpdate.status).toBe(400);
    expect(await invalidUpdate.json()).toEqual({
      error: "Site settings request is invalid.",
    });
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: ownerSite.name,
      hostname: ownerSite.hostname,
      themeCount: 0,
      colorScheme: null,
      fontFamily: null,
    });

    const untrustedUpdate = await application.app.request(settingsPath, {
      method: "PUT",
      headers: new Headers({
        "content-type": JSON_CONTENT_TYPE,
        cookie: ownerCookie,
      }),
      body: JSON.stringify({
        name: "Untrusted Mutation",
        theme: { colorScheme: "dark", fontFamily: "serif" },
      }),
    });
    expect(untrustedUpdate.status).toBe(403);
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: ownerSite.name,
      hostname: ownerSite.hostname,
      themeCount: 0,
      colorScheme: null,
      fontFamily: null,
    });

    const firstUpdateResponse = await requestSiteSettingsUpdate(
      application,
      settingsPath,
      origin,
      ownerCookie,
      {
        name: "  Renamed Site  ",
        theme: { colorScheme: "dark", fontFamily: "serif" },
      },
    );
    expect(firstUpdateResponse.status).toBe(200);
    const firstUpdate = siteSettingsResponseSchema.parse(
      await firstUpdateResponse.json(),
    );
    expect(firstUpdate).toEqual({
      site: { ...ownerSite, name: "Renamed Site" },
      theme: { colorScheme: "dark", fontFamily: "serif" },
    });
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: "Renamed Site",
      hostname: ownerSite.hostname,
      themeCount: 1,
      colorScheme: "dark",
      fontFamily: "serif",
    });
    expect(
      await listSites(application, ownerTenant.id, ownerCookie),
    ).toEqual([firstUpdate.site]);

    const secondUpdateResponse = await requestSiteSettingsUpdate(
      application,
      settingsPath,
      origin,
      ownerCookie,
      {
        name: "Final Site Name",
        theme: { colorScheme: "light", fontFamily: "sans" },
      },
    );
    expect(secondUpdateResponse.status).toBe(200);
    const secondUpdate = siteSettingsResponseSchema.parse(
      await secondUpdateResponse.json(),
    );
    expect(secondUpdate).toEqual({
      site: { ...ownerSite, name: "Final Site Name" },
      theme: DEFAULT_THEME_TOKENS,
    });
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: "Final Site Name",
      hostname: ownerSite.hostname,
      themeCount: 1,
      colorScheme: "light",
      fontFamily: "sans",
    });

    const wrongTenantSettings = await application.app.request(
      `/tenants/${memberTenant.id}/sites/${ownerSite.id}/settings`,
      { headers: { cookie: memberCookie } },
    );
    expect(wrongTenantSettings.status).toBe(404);
    expect(await wrongTenantSettings.json()).toEqual({
      error: "Site not found.",
    });
    const missingSiteSettings = await application.app.request(
      `/tenants/${ownerTenant.id}/sites/${crypto.randomUUID()}/settings`,
      { headers: { cookie: ownerCookie } },
    );
    expect(missingSiteSettings.status).toBe(404);
    expect(await missingSiteSettings.json()).toEqual({
      error: "Site not found.",
    });
    const malformedSiteSettings = await application.app.request(
      `/tenants/${ownerTenant.id}/sites/not-a-uuid/settings`,
      { headers: { cookie: ownerCookie } },
    );
    expect(malformedSiteSettings.status).toBe(404);
    expect(await malformedSiteSettings.json()).toEqual({
      error: "Site not found.",
    });

    const sitePersistence = createSitePersistence(observer);
    await expect(
      sitePersistence.updateSiteSettings(
        ownerTenant.id,
        ownerSite.id,
        "Rolled Back Name",
        {
          colorScheme: null as unknown as string,
          fontFamily: "serif",
        },
      ),
    ).rejects.toThrow();
    expect(await readStoredSiteSettings(observer, ownerSite.id)).toEqual({
      name: "Final Site Name",
      hostname: ownerSite.hostname,
      themeCount: 1,
      colorScheme: "light",
      fontFamily: "sans",
    });

    await observer.native`
      UPDATE themes SET color_scheme = 'neon' WHERE site_id = ${ownerSite.id}
    `;
    const malformedThemeResponse = await application.app.request(
      settingsPath,
      { headers: { cookie: ownerCookie } },
    );
    expect(malformedThemeResponse.status).toBe(500);
    const malformedThemeBody = await malformedThemeResponse.json();
    expect(malformedThemeBody).toEqual({ error: "Internal server error." });
    expect(JSON.stringify(malformedThemeBody)).not.toContain("neon");
    expect(JSON.stringify(malformedThemeBody)).not.toContain("Zod");
    expect((await readStoredSiteSettings(observer, ownerSite.id)).colorScheme).toBe(
      "neon",
    );
    await observer.native`
      UPDATE themes SET color_scheme = 'light' WHERE site_id = ${ownerSite.id}
    `;

    expect((await application.app.request("/health")).status).toBe(200);
    expect(
      (await application.app.request("/auth/session", {
        headers: { cookie: ownerCookie },
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request("/tenants", {
        headers: { cookie: ownerCookie },
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request("/auth/logout", {
        method: "POST",
        headers: createRequestHeaders(origin, ownerCookie),
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request("/auth/logout", {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
      })).status,
    ).toBe(200);
  } finally {
    await removeTestRecords(observer, createdTenantIds, createdUserIds);
    await application.close();
    await observer.close();
  }
}

async function createTenant(
  application: ApiApplication,
  origin: string,
  cookie: string,
  name: string,
): Promise<TenantAccess> {
  const response = await application.app.request("/tenants", {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return tenantAccessSchema.parse(await response.json());
}

async function listSites(
  application: ApiApplication,
  tenantId: string,
  cookie: string,
): Promise<SiteSummary[]> {
  const response = await application.app.request(`/tenants/${tenantId}/sites`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return siteListResponseSchema.parse(await response.json()).sites;
}

async function requestSiteSettingsUpdate(
  application: ApiApplication,
  path: string,
  origin: string,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return await application.app.request(path, {
    method: "PUT",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify(body),
  });
}

async function readStoredSiteSettings(
  observer: DatabaseClient,
  siteId: string,
): Promise<StoredSiteSettings> {
  const [record] = await observer.native<StoredSiteSettings[]>`
    SELECT
      sites.name,
      domains.hostname,
      count(themes.site_id)::int AS "themeCount",
      max(themes.color_scheme) AS "colorScheme",
      max(themes.font_family) AS "fontFamily"
    FROM sites
    INNER JOIN domains ON domains.site_id = sites.id
    LEFT JOIN themes ON themes.site_id = sites.id
    WHERE sites.id = ${siteId}
    GROUP BY sites.id, domains.hostname
  `;
  if (!record) {
    throw new Error("Expected stored site settings.");
  }
  return record;
}

async function authenticateIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<string> {
  const response = await application.app.request("/auth/login", {
    method: "POST",
    headers: createRequestHeaders(origin),
    body: JSON.stringify({
      email: identity.email,
      password: identity.password,
    }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!setCookie) {
    throw new Error("Expected an authenticated session cookie.");
  }
  return setCookie.split(";", 1)[0] ?? "";
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
