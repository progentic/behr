import {
  PREVIEW_TOKEN_HEADER,
  previewTokenResponseSchema,
  previewTokenSchema,
} from "./preview";

declare function test(name: string, body: () => void): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const VALID_TOKEN = "A".repeat(43);

test("validates exact opaque preview credentials", () => {
  expect(PREVIEW_TOKEN_HEADER).toBe("X-BeHR-Preview-Token");
  expect(previewTokenSchema.parse(VALID_TOKEN)).toBe(VALID_TOKEN);
  expect(previewTokenSchema.safeParse(VALID_TOKEN.slice(1)).success).toBe(false);
  expect(previewTokenSchema.safeParse(`${VALID_TOKEN}A`).success).toBe(false);
  expect(previewTokenSchema.safeParse(`${VALID_TOKEN.slice(1)}%`).success).toBe(
    false,
  );
  expect(previewTokenSchema.safeParse(` ${VALID_TOKEN}`).success).toBe(false);
});

test("validates a strict preview issuance response", () => {
  const response = {
    token: VALID_TOKEN,
    expiresAt: "2026-08-30T12:15:00.000Z",
  };
  expect(previewTokenResponseSchema.parse(response)).toEqual(response);
  expect(
    previewTokenResponseSchema.safeParse({
      ...response,
      pageId: "11111111-1111-4111-8111-111111111111",
    }).success,
  ).toBe(false);
});
