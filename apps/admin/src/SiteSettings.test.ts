import type { SiteSettingsResponse, SiteSummary } from "@bher/contracts";

import { type SiteState, applyUpdatedSite } from "./SitesPage";
import {
  createSiteSettingsUpdateRequest,
  requestSiteSettings,
  requestSiteSettingsUpdate,
} from "./SiteSettings";

declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect<T>(actual: T): {
  not: { toBe(expected: unknown): void };
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SITE_A: SiteSummary = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Site A",
  hostname: "a.example.com",
};
const SITE_B: SiteSummary = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Site B",
  hostname: "b.example.com",
};

test("uses strict credentialed site settings request boundaries", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const settings: SiteSettingsResponse = {
    site: SITE_A,
    theme: { colorScheme: "dark", fontFamily: "serif" },
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json(settings);
  };
  try {
    expect(await requestSiteSettings(TENANT_A, SITE_A.id)).toEqual(settings);
    const request = createSiteSettingsUpdateRequest(
      "  Normalized Name  ",
      "dark",
      "serif",
    );
    if (!request) {
      throw new Error("Expected valid settings request.");
    }
    expect(
      await requestSiteSettingsUpdate(TENANT_A, SITE_A.id, request),
    ).toEqual(settings);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const path = `/tenants/${TENANT_A}/sites/${SITE_A.id}/settings`;
  expect(requests.map(({ url }) => url)).toEqual([path, path]);
  expect(requests[0]?.init?.credentials).toBe("include");
  expect(requests[1]?.init?.credentials).toBe("include");
  expect(requests[1]?.init?.method).toBe("PUT");
  expect(new Headers(requests[1]?.init?.headers).get("content-type")).toBe(
    "application/json",
  );
  expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
    name: "Normalized Name",
    theme: { colorScheme: "dark", fontFamily: "serif" },
  });
});

test("normalizes bounded settings and rejects invalid local input", () => {
  expect(
    createSiteSettingsUpdateRequest("  Name  ", "dark", "serif"),
  ).toEqual({
    name: "Name",
    theme: { colorScheme: "dark", fontFamily: "serif" },
  });
  expect(createSiteSettingsUpdateRequest(" ", "dark", "serif")).toBe(null);
  expect(createSiteSettingsUpdateRequest("Name", "neon", "serif")).toBe(
    null,
  );
});

test("applies returned sites only to matching loaded tenant state", () => {
  const loadedA: SiteState = {
    status: "loaded",
    tenantId: TENANT_A,
    sites: [SITE_A, SITE_B],
  };
  const updatedA = { ...SITE_A, name: "Updated A" };
  const applied = applyUpdatedSite(loadedA, TENANT_A, updatedA);
  expect(applied).not.toBe(loadedA);
  expect(applied).toEqual({
    ...loadedA,
    sites: [updatedA, SITE_B],
  });

  const loadedB: SiteState = {
    status: "loaded",
    tenantId: TENANT_B,
    sites: [SITE_B],
  };
  expect(applyUpdatedSite(loadedB, TENANT_A, updatedA)).toBe(loadedB);

  const unknownSite = {
    ...updatedA,
    id: "55555555-5555-4555-8555-555555555555",
  };
  expect(applyUpdatedSite(loadedA, TENANT_A, unknownSite)).toBe(loadedA);

  const loading: SiteState = { status: "loading", tenantId: TENANT_A };
  expect(applyUpdatedSite(loading, TENANT_A, updatedA)).toBe(loading);
});
