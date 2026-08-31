import { publishResponseSchema } from "./publish";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

test("validates strict publication outcomes", () => {
  expect(publishResponseSchema.parse({ status: "published" })).toEqual({
    status: "published",
  });
  expect(publishResponseSchema.parse({ status: "unchanged" })).toEqual({
    status: "unchanged",
  });
  expect(
    publishResponseSchema.safeParse({
      status: "published",
      versionId: "11111111-1111-4111-8111-111111111111",
    }).success,
  ).toBe(false);
});
