import { requestApi } from "./api";
declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect(value: unknown): { toBe(expected: unknown): void };

test("preserves JSON defaults and explicit headers while leaving FormData to fetch", async () => {
  const originalFetch = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_path, init) => { calls.push(init ?? {}); return new Response(); };
  try {
    await requestApi("/json", { method: "POST", body: "{}" });
    await requestApi("/explicit", { method: "POST", body: "{}", headers: { "content-type": "application/example+json" } });
    const body = new FormData(); body.append("file", new File(["x"], "image.png", { type: "image/png" }));
    await requestApi("/upload", { method: "POST", body });
    expect(new Headers(calls[0]?.headers).get("content-type")).toBe("application/json");
    expect(new Headers(calls[1]?.headers).get("content-type")).toBe("application/example+json");
    expect(new Headers(calls[2]?.headers).has("content-type")).toBe(false);
    expect(calls[2]?.body).toBe(body);
    for (const call of calls) expect(call.credentials).toBe("include");
  } finally { globalThis.fetch = originalFetch; }
});
