import { expect, test } from "bun:test";
import {
  createTenantRequestSchema,
  tenantAccessSchema,
  tenantListResponseSchema,
} from "@bher/contracts";

const TENANT_ID = "4edb083c-b28a-4db7-919d-e31cbbab19cb";

test("validates the tenant creation contract", () => {
  expect(createTenantRequestSchema.parse({ name: "  Acme  " })).toEqual({
    name: "Acme",
  });
  expect(createTenantRequestSchema.safeParse({ name: "   " }).success).toBe(
    false,
  );
  expect(
    createTenantRequestSchema.safeParse({ name: "Acme", userId: "forged" })
      .success,
  ).toBe(false);
  expect(
    createTenantRequestSchema.safeParse({ name: "a".repeat(201) }).success,
  ).toBe(false);
});

test("parses only the public tenant access contract", () => {
  const access = { id: TENANT_ID, name: "Acme", role: "owner" } as const;
  expect(tenantAccessSchema.parse(access)).toEqual(access);
  expect(tenantListResponseSchema.parse({ tenants: [access] })).toEqual({
    tenants: [access],
  });
  expect(
    tenantAccessSchema.safeParse({ ...access, userId: "internal" }).success,
  ).toBe(false);
  expect(tenantAccessSchema.safeParse({ ...access, id: "invalid" }).success).toBe(
    false,
  );
});
