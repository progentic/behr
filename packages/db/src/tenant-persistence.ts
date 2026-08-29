import { and, asc, eq } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { memberships, tenants } from "./schema";

type TenantRecord = Readonly<{
  id: string;
  name: string;
  role: "owner" | "member";
}>;

export type TenantPersistence = Readonly<{
  createTenantWithOwner: (
    userId: string,
    name: string,
  ) => Promise<TenantRecord>;
  listTenantAccess: (userId: string) => Promise<TenantRecord[]>;
  resolveTenantAccess: (
    userId: string,
    tenantId: string,
  ) => Promise<TenantRecord | null>;
}>;

const tenantAccessSelection = {
  id: tenants.id,
  name: tenants.name,
  role: memberships.role,
};

export function createTenantPersistence(
  client: DatabaseClient,
): TenantPersistence {
  return Object.freeze({
    createTenantWithOwner: (userId, name) =>
      createTenantWithOwner(client, userId, name),
    listTenantAccess: (userId) => listTenantAccess(client, userId),
    resolveTenantAccess: (userId, tenantId) =>
      resolveTenantAccess(client, userId, tenantId),
  });
}

async function createTenantWithOwner(
  client: DatabaseClient,
  userId: string,
  name: string,
): Promise<TenantRecord> {
  return await client.drizzle.transaction(async (transaction) => {
    const [createdTenant] = await transaction
      .insert(tenants)
      .values({ name })
      .returning({ id: tenants.id, name: tenants.name });
    if (!createdTenant) {
      throw new Error("Tenant creation returned no record.");
    }
    await transaction.insert(memberships).values({
      tenantId: createdTenant.id,
      userId,
      role: "owner",
    });
    return { ...createdTenant, role: "owner" };
  });
}

async function listTenantAccess(
  client: DatabaseClient,
  userId: string,
): Promise<TenantRecord[]> {
  return await client.drizzle
    .select(tenantAccessSelection)
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(tenants.createdAt), asc(tenants.id));
}

async function resolveTenantAccess(
  client: DatabaseClient,
  userId: string,
  tenantId: string,
): Promise<TenantRecord | null> {
  const records = await client.drizzle
    .select(tenantAccessSelection)
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(
      and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)),
    )
    .limit(1);
  return records[0] ?? null;
}
