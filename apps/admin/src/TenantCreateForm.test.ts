import type { TenantAccess } from "@bher/contracts";

import { applyCreatedTenant, type TenantState } from "./SitesPage";
import { prepareTenantCreation, requestTenantCreation } from "./TenantCreateForm";

declare function test(name: string, body: () => void | Promise<void>): void;
declare function expect<T>(actual: T): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  rejects: { toThrow(message?: string): Promise<void> };
};

const TENANT_A: TenantAccess = {
  id: "11111111-1111-4111-8111-111111111111", name: "Tenant A", role: "member",
};
const TENANT_B: TenantAccess = {
  id: "22222222-2222-4222-8222-222222222222", name: "Tenant B", role: "owner",
};

test("prepares only the shared normalized name and rejects invalid input", () => {
  expect(prepareTenantCreation("  Coastal Publishing  ")).toEqual({ name: "Coastal Publishing" });
  expect(prepareTenantCreation(" ")).toBeNull();
  expect(prepareTenantCreation("x".repeat(201))).toBeNull();
});

test("uses the existing credentialed POST and authoritative access response", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  globalThis.fetch = async (path, init) => {
    requests.push({ path: String(path), init });
    return Response.json(TENANT_B);
  };
  try {
    const request = prepareTenantCreation("  Tenant B  ");
    if (!request) throw new Error("Expected valid preparation.");
    expect(await requestTenantCreation(request)).toEqual(TENANT_B);
    expect(requests[0]?.path).toBe("/tenants");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.credentials).toBe("include");
    expect(new Headers(requests[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ name: "Tenant B" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps request failures generic and rejects invalid access responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("untrusted field diagnosis", { status: 500 });
    await expect(requestTenantCreation({ name: "Tenant" })).rejects.toThrow("Tenant creation failed.");
    globalThis.fetch = async () => Response.json({ ...TENANT_B, role: "admin" });
    await expect(requestTenantCreation({ name: "Tenant" })).rejects.toThrow();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inserts returned access without duplicates, role fabrication or stale-list overwrite", () => {
  const empty: TenantState = { status: "loaded", tenants: [] };
  expect(applyCreatedTenant(empty, TENANT_A)).toEqual({ status: "loaded", tenants: [TENANT_A] });
  const latest: TenantState = { status: "loaded", tenants: [TENANT_A] };
  expect(applyCreatedTenant(latest, TENANT_B)).toEqual({ status: "loaded", tenants: [TENANT_A, TENANT_B] });
  expect(applyCreatedTenant(latest, TENANT_A)).toBe(latest);
  expect(latest.tenants).toEqual([TENANT_A]);
  const loading: TenantState = { status: "loading" };
  expect(applyCreatedTenant(loading, TENANT_B)).toBe(loading);
});
