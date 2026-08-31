import { resolvePreviewFragment, resolvePublicSlug } from "./router";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const VALID_PREVIEW_TOKEN = "A".repeat(43);

test("translates supported public pathnames", () => {
  expect(resolvePublicSlug("/")).toBe("");
  expect(resolvePublicSlug("/about")).toBe("about");
  expect(resolvePublicSlug("/about-us")).toBe("about-us");
  expect(resolvePublicSlug("/About-US")).toBe("about-us");
});

test("distinguishes public, valid preview, and invalid preview fragments", () => {
  expect(resolvePreviewFragment("")).toEqual({ status: "public" });
  expect(resolvePreviewFragment("#")).toEqual({ status: "public" });
  expect(resolvePreviewFragment("#section")).toEqual({ status: "public" });
  expect(resolvePreviewFragment(`#preview=${VALID_PREVIEW_TOKEN}`)).toEqual({
    status: "preview",
    token: VALID_PREVIEW_TOKEN,
  });
  expect(resolvePreviewFragment("#preview=")).toEqual({ status: "invalid" });
  expect(resolvePreviewFragment("#preview=invalid%")).toEqual({
    status: "invalid",
  });
  expect(resolvePreviewFragment(`#preview=${VALID_PREVIEW_TOKEN.slice(1)}`)).toEqual(
    { status: "invalid" },
  );
  expect(resolvePreviewFragment(`#preview=${VALID_PREVIEW_TOKEN}A`)).toEqual({
    status: "invalid",
  });
  expect(
    resolvePreviewFragment(
      `#preview=%41${VALID_PREVIEW_TOKEN.slice(1)}`,
    ),
  ).toEqual({ status: "invalid" });
  expect(
    resolvePreviewFragment(`#preview=${VALID_PREVIEW_TOKEN}&section=details`),
  ).toEqual({ status: "invalid" });
});

test("rejects unsupported and malformed public pathnames", () => {
  expect(resolvePublicSlug("/about/")).toBe(null);
  expect(resolvePublicSlug("/about/team")).toBe(null);
  expect(resolvePublicSlug("//")).toBe(null);
  expect(resolvePublicSlug("/%")).toBe(null);
  expect(resolvePublicSlug("/about%2Fteam")).toBe(null);
  expect(resolvePublicSlug("/about%252Fteam")).toBe(null);
  expect(resolvePublicSlug("/about%20team")).toBe(null);
});
