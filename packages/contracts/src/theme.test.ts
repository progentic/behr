import {
  DEFAULT_THEME_TOKENS,
  themeTokensSchema,
} from "./theme";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

test("accepts the bounded theme token pairs", () => {
  expect(
    themeTokensSchema.parse({ colorScheme: "light", fontFamily: "sans" }),
  ).toEqual({ colorScheme: "light", fontFamily: "sans" });
  expect(
    themeTokensSchema.parse({ colorScheme: "dark", fontFamily: "serif" }),
  ).toEqual({ colorScheme: "dark", fontFamily: "serif" });
});

test("rejects unknown and structurally expanded theme tokens", () => {
  expect(
    themeTokensSchema.safeParse({ colorScheme: "neon", fontFamily: "sans" })
      .success,
  ).toBe(false);
  expect(
    themeTokensSchema.safeParse({ colorScheme: "light", fontFamily: "comic" })
      .success,
  ).toBe(false);
  expect(
    themeTokensSchema.safeParse({
      colorScheme: "light",
      fontFamily: "sans",
      customCss: "body {}",
    }).success,
  ).toBe(false);
});

test("defines the shared light and sans default", () => {
  expect(DEFAULT_THEME_TOKENS).toEqual({
    colorScheme: "light",
    fontFamily: "sans",
  });
});
