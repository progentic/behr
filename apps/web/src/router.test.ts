import { resolvePublicSlug } from "./router";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
};

test("translates supported public pathnames", () => {
  expect(resolvePublicSlug("/")).toBe("");
  expect(resolvePublicSlug("/about")).toBe("about");
  expect(resolvePublicSlug("/about-us")).toBe("about-us");
  expect(resolvePublicSlug("/About-US")).toBe("about-us");
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
