import type { PageSummary } from "@bher/contracts";

import {
  createPageCreationRequest,
  requestPageCreation,
} from "./PageCreateForm";
import {
  type PageListState,
  applyCreatedPage,
  applyPageListResult,
  requestPageList,
  selectPage,
} from "./PageList";

declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect<T>(actual: T): {
  not: { toBe(expected: unknown): void };
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const SITE_X = "33333333-3333-4333-8333-333333333333";
const SITE_Y = "44444444-4444-4444-8444-444444444444";
const PAGE_A: PageSummary = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "About",
  slug: "about",
};

test("rejects late page-list results from another site or tenant", () => {
  const currentSite: PageListState = {
    status: "loading",
    tenantId: TENANT_A,
    siteId: SITE_Y,
  };
  expect(applyPageListResult(currentSite, TENANT_A, SITE_X, [PAGE_A])).toBe(
    currentSite,
  );
  const currentTenant: PageListState = {
    status: "loading",
    tenantId: TENANT_B,
    siteId: SITE_Y,
  };
  expect(applyPageListResult(currentTenant, TENANT_A, SITE_X, [PAGE_A])).toBe(
    currentTenant,
  );
});

test("applies creation and selection only to the initiating site", () => {
  const matching: PageListState = {
    status: "loaded",
    tenantId: TENANT_A,
    siteId: SITE_X,
    pages: [],
    selectedPageId: null,
  };
  const created = applyCreatedPage(matching, TENANT_A, SITE_X, PAGE_A);
  expect(created).toEqual({
    ...matching,
    pages: [PAGE_A],
    selectedPageId: PAGE_A.id,
  });
  const otherSite: PageListState = {
    status: "loaded",
    tenantId: TENANT_A,
    siteId: SITE_Y,
    pages: [],
    selectedPageId: null,
  };
  expect(applyCreatedPage(otherSite, TENANT_A, SITE_X, PAGE_A)).toBe(
    otherSite,
  );
  expect(selectPage(created, PAGE_A.id)).not.toBe(created);
  expect(selectPage(matching, PAGE_A.id)).toBe(matching);
});

test("builds canonical normalized page creation input", () => {
  expect(createPageCreationRequest("  About  ", "ABOUT-US")).toEqual({
    title: "About",
    slug: "about-us",
    document: { schemaVersion: 1, sections: [] },
  });
  expect(createPageCreationRequest("", "invalid slug")).toBe(null);
});

test("uses existing page list and creation request boundaries", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith("/pages") && init?.method === "POST") {
      return Response.json({
        page: PAGE_A,
        draft: {
          id: "66666666-6666-4666-8666-666666666666",
          document: { schemaVersion: 1, sections: [] },
          createdAt: "2026-08-31T00:00:00.000Z",
        },
      });
    }
    return Response.json({ pages: [PAGE_A] });
  };
  try {
    expect(await requestPageList(TENANT_A, SITE_X)).toEqual([PAGE_A]);
    const request = createPageCreationRequest("About", "about");
    if (!request) {
      throw new Error("Expected valid creation request.");
    }
    expect(await requestPageCreation(TENANT_A, SITE_X, request)).toEqual(
      PAGE_A,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(requests.map(({ url }) => url)).toEqual([
    `/tenants/${TENANT_A}/sites/${SITE_X}/pages`,
    `/tenants/${TENANT_A}/sites/${SITE_X}/pages`,
  ]);
  expect(requests[0]?.init?.credentials).toBe("include");
  expect(requests[1]?.init?.credentials).toBe("include");
  expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
    title: "About",
    slug: "about",
    document: { schemaVersion: 1, sections: [] },
  });
});
