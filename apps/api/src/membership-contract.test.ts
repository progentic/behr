import { expect, test } from "bun:test";
import {
  addTenantMemberRequestSchema,
  inviteRegistrationRequestSchema,
} from "@bher/contracts";

test("normalizes a strict add-member request", () => {
  expect(
    addTenantMemberRequestSchema.parse({ email: "  MEMBER@EXAMPLE.COM  " }),
  ).toEqual({ email: "member@example.com" });
  expect(
    addTenantMemberRequestSchema.safeParse({ email: "invalid" }).success,
  ).toBe(false);
  expect(
    addTenantMemberRequestSchema.safeParse({
      email: "member@example.com",
      role: "owner",
    }).success,
  ).toBe(false);
});

test("accepts only invitation-owned registration input", () => {
  const valid = {
    token: "invitation-token",
    name: "  Invited Member  ",
    password: "invited-password",
  };
  expect(inviteRegistrationRequestSchema.parse(valid)).toEqual({
    ...valid,
    name: "Invited Member",
  });
  expect(
    inviteRegistrationRequestSchema.safeParse({
      ...valid,
      email: "substitute@example.com",
    }).success,
  ).toBe(false);
  expect(
    inviteRegistrationRequestSchema.safeParse({
      ...valid,
      tenantId: "11111111-1111-4111-8111-111111111111",
    }).success,
  ).toBe(false);
  expect(
    inviteRegistrationRequestSchema.safeParse({
      ...valid,
      password: "too-short",
    }).success,
  ).toBe(false);
  expect(
    inviteRegistrationRequestSchema.safeParse({
      ...valid,
      password: "a".repeat(129),
    }).success,
  ).toBe(false);
});
