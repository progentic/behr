import { createSitePageUrl, requestPagePreview, requestPagePublication, StalePublicationError } from "./PagePublicationControls";
declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect(value: unknown): { toBe(expected: unknown): void; toEqual(expected: unknown): void };

test("site links preserve scheme/port and remove unrelated query/fragment", () => {
  expect(createSitePageUrl("http://localhost:3000/?q=old#old", "site.example.test", "about")).toBe("http://site.example.test:3000/about");
  expect(createSitePageUrl("https://admin.example.test", "site.example.test", "")).toBe("https://site.example.test/");
});

test("preview and publication send bodyless POSTs and parse strict responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const preview = { token: "a".repeat(43), expiresAt: "2026-09-19T01:00:00Z" };
  globalThis.fetch = async (path, init) => {
    calls.push({ path: String(path), init });
    return Response.json(String(path).endsWith("preview-tokens") ? preview : { status: "published" });
  };
  try {
    expect(await requestPagePreview("t", "s", "p")).toEqual(preview);
    expect(await requestPagePublication("t", "s", "p")).toEqual({ status: "published" });
    expect(calls.map(({ path }) => path)).toEqual(["/tenants/t/sites/s/pages/p/preview-tokens", "/tenants/t/sites/s/pages/p/publish"]);
    for (const { init } of calls) {
      expect(init?.method).toBe("POST"); expect(init?.body).toBe(undefined); expect(init?.credentials).toBe("include");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("publication conflict is distinct from generic failure with no retry", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [409, 500]) {
      let count = 0;
      globalThis.fetch = async () => { count++; return new Response(null, { status }); };
      let failure: unknown;
      try { await requestPagePublication("t", "s", "p"); } catch (error) { failure = error; }
      expect(failure instanceof StalePublicationError).toBe(status === 409);
      expect(count).toBe(1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects malformed preview and publication success payloads", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ token: "invalid", expiresAt: "invalid" });
    let previewRejected = false;
    try { await requestPagePreview("t", "s", "p"); } catch { previewRejected = true; }
    expect(previewRejected).toBe(true);
    globalThis.fetch = async () => Response.json({ status: "published", history: [] });
    let publishRejected = false;
    try { await requestPagePublication("t", "s", "p"); } catch { publishRejected = true; }
    expect(publishRejected).toBe(true);
  } finally { globalThis.fetch = originalFetch; }
});
