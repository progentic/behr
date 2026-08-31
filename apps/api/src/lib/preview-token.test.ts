import { expect, test } from "bun:test";
import { previewTokenSchema } from "@bher/contracts";

import { generatePreviewCredential, hashPreviewToken } from "./preview-token";

const EXPECTED_LIFETIME_MS = 15 * 60 * 1_000;
const LIFETIME_TOLERANCE_MS = 1_000;

test("generates a bounded preview credential", async () => {
  const before = Date.now();
  const credential = await generatePreviewCredential();
  const after = Date.now();
  expect(previewTokenSchema.parse(credential.token)).toBe(credential.token);
  expect(credential.token).toHaveLength(43);
  expect(credential.token).not.toContain("=");
  expect(credential.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(credential.expiresAt.getTime()).toBeGreaterThanOrEqual(
    before + EXPECTED_LIFETIME_MS - LIFETIME_TOLERANCE_MS,
  );
  expect(credential.expiresAt.getTime()).toBeLessThanOrEqual(
    after + EXPECTED_LIFETIME_MS + LIFETIME_TOLERANCE_MS,
  );
});

test("hashes the exact opaque token deterministically", async () => {
  const token = "A".repeat(43);
  expect(await hashPreviewToken(token)).toBe(await hashPreviewToken(token));
  expect(await hashPreviewToken(token)).not.toBe(
    await hashPreviewToken(token.toLowerCase()),
  );
});
