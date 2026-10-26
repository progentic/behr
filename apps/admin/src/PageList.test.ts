import type { PageSummary } from "@bher/contracts";
import { getDashboardTotals, loadDashboardSites } from "./DashboardOverview";

import {
  PageSlugConflictResponseError,
  preparePageCreation,
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

test("overview totals use the current tenant's existing page and image lists", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  const site = { id: SITE_X, name: "Journal", hostname: "journal.example.test" };
  try {
    globalThis.fetch = async (input) => {
      const path = String(input);
      paths.push(path);
      return Response.json(path.endsWith("/pages") ? { pages: [PAGE_A] } : { assets: [{
        id: "66666666-6666-4666-8666-666666666666", originalFilename: "cover.png",
        contentType: "image/png", byteSize: 2048, createdAt: "2026-10-26T12:00:00.000Z",
      }] });
    };
    const content = await loadDashboardSites(TENANT_A, [site]);
    expect(content[0]?.site).toBe(site);
    expect(getDashboardTotals(content)).toEqual({ pages: 1, images: 1, bytes: 2048 });
    expect(paths).toEqual([`/tenants/${TENANT_A}/sites/${SITE_X}/pages`, `/tenants/${TENANT_A}/sites/${SITE_X}/assets`]);
    expect(getDashboardTotals(await loadDashboardSites(TENANT_A, []))).toEqual({ pages: 0, images: 0, bytes: 0 });
    expect(paths.length).toBe(2);
  } finally { globalThis.fetch = originalFetch; }
});

test("overview refuses failed content reads rather than reporting false zero totals", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => String(input).endsWith("/pages")
      ? Response.json({ pages: [PAGE_A] }) : new Response(null, { status: 500 });
    let rejected = false;
    try { await loadDashboardSites(TENANT_A, [{ id: SITE_X, name: "Journal", hostname: "journal.example.test" }]); }
    catch { rejected = true; }
    expect(rejected).toBe(true);
  } finally { globalThis.fetch = originalFetch; }
});

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
    editorDirty: false,
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
    editorDirty: false,
  };
  expect(applyCreatedPage(otherSite, TENANT_A, SITE_X, PAGE_A)).toBe(
    otherSite,
  );
  expect(selectPage(created, PAGE_A.id)).not.toBe(created);
  expect(selectPage(matching, PAGE_A.id)).toBe(matching);
});

test("prepares normalized page creation input and isolated field errors", () => {
  expect(preparePageCreation("  About  ", "ABOUT-US")).toEqual({
    request: {
      title: "About",
      slug: "about-us",
      document: { schemaVersion: 1, sections: [] },
    },
    fieldErrors: {},
  });
  expect(preparePageCreation("", "about")).toEqual({
    request: null,
    fieldErrors: { title: "Enter a valid page title." },
  });
  expect(preparePageCreation("About", "invalid slug")).toEqual({
    request: null,
    fieldErrors: { slug: "Enter a valid page slug." },
  });
  expect(preparePageCreation("", "invalid slug")).toEqual({
    request: null,
    fieldErrors: {
      title: "Enter a valid page title.",
      slug: "Enter a valid page slug.",
    },
  });
  expect(preparePageCreation("Root", "").request).toEqual({
    title: "Root",
    slug: "",
    document: { schemaVersion: 1, sections: [] },
  });
});

test("new page creation cannot replace an unsaved current page", () => {
  const state: PageListState = { status: "loaded", tenantId: TENANT_A, siteId: SITE_X,
    pages: [PAGE_A], selectedPageId: PAGE_A.id, editorDirty: true };
  const pageB = { ...PAGE_A, id: "66666666-6666-4666-8666-666666666666", title: "Second" };
  expect(applyCreatedPage(state, TENANT_A, SITE_X, pageB)).toEqual({ ...state, pages: [PAGE_A, pageB] });
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
    const preparation = preparePageCreation("About", "about");
    if (!preparation.request) {
      throw new Error("Expected valid creation request.");
    }
    expect(
      await requestPageCreation(
        TENANT_A,
        SITE_X,
        preparation.request,
      ),
    ).toEqual(PAGE_A);
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

test("distinguishes page slug conflict from generic request failure", async () => {
  const originalFetch = globalThis.fetch;
  const request = preparePageCreation("About", "about").request;
  if (!request) {
    throw new Error("Expected valid creation request.");
  }
  try {
    globalThis.fetch = async () => new Response(null, { status: 409 });
    let conflict: unknown;
    try {
      await requestPageCreation(TENANT_A, SITE_X, request);
    } catch (failure) {
      conflict = failure;
    }
    expect(conflict instanceof PageSlugConflictResponseError).toBe(true);

    globalThis.fetch = async () => new Response(null, { status: 500 });
    let generic: unknown;
    try {
      await requestPageCreation(TENANT_A, SITE_X, request);
    } catch (failure) {
      generic = failure;
    }
    expect(generic instanceof PageSlugConflictResponseError).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
