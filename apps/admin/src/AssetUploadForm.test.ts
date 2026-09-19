import { ASSET_MAX_BYTE_SIZE } from "@bher/contracts";
import { validateImageUpload, createAssetUploadBody, requestAssetUpload } from "./AssetUploadForm";
declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect(value: unknown): { toBe(expected: unknown): void; toEqual(expected: unknown): void; not: { toBe(expected: unknown): void } };

test("accepts bounded renderable metadata and rejects unsupported files", () => {
  const file = new File(["bytes"], "image.png", { type: "image/png" });
  expect(validateImageUpload(file)).toBe(null);
  expect(validateImageUpload(null)).not.toBe(null);
  expect(validateImageUpload(new File([], "empty.png", { type: "image/png" }))).not.toBe(null);
  expect(validateImageUpload(new File(["x"], "note.txt", { type: "text/plain" }))).not.toBe(null);
  expect(validateImageUpload(new File(["x"], "bad/name.png", { type: "image/png" }))).not.toBe(null);
  expect(validateImageUpload(new File([new Uint8Array(ASSET_MAX_BYTE_SIZE + 1)], "large.png", { type: "image/png" }))).not.toBe(null);
  expect([...createAssetUploadBody(file).keys()]).toEqual(["file"]);
});

test("uploads one file using the existing site route and strict response", async () => {
  const originalFetch = globalThis.fetch;
  const asset = { id: "11111111-1111-4111-8111-111111111111", originalFilename: "a.png", contentType: "image/png", byteSize: 1, createdAt: "2026-09-19T00:00:00Z" };
  let path: unknown, sent: RequestInit | undefined;
  globalThis.fetch = async (input, init) => { path = input; sent = init; return Response.json(asset); };
  try {
    expect(await requestAssetUpload("tenant", "site", new File(["x"], "a.png", { type: "image/png" }))).toEqual(asset);
    expect(path).toBe("/tenants/tenant/sites/site/assets");
    expect(sent?.method).toBe("POST");
    expect(sent?.credentials).toBe("include");
    expect(new Headers(sent?.headers).has("content-type")).toBe(false);
    expect([...(sent?.body as FormData).keys()]).toEqual(["file"]);
    globalThis.fetch = async () => Response.json({ ...asset, storageKey: "private" });
    let invalidRejected = false;
    try { await requestAssetUpload("tenant", "site", new File(["x"], "a.png", { type: "image/png" })); } catch { invalidRejected = true; }
    expect(invalidRejected).toBe(true);
  } finally { globalThis.fetch = originalFetch; }
});
