import { and, asc, eq, gt } from "drizzle-orm";

import type { DatabaseClient } from "./client";
import { membershipInvitations, memberships, user } from "./schema";

type IdentityRecord = Readonly<{
  id: string;
  email: string;
  displayName: string;
}>;

type TenantMemberRecord = Readonly<{
  email: string;
  displayName: string;
  role: "owner" | "member";
}>;

type InvitationRecord = Readonly<{
  id: string;
  tenantId: string;
  email: string;
  expiresAt: Date;
}>;

export type MembershipPersistence = Readonly<{
  listMembers: (tenantId: string) => Promise<TenantMemberRecord[]>;
  resolveIdentityByEmail: (email: string) => Promise<IdentityRecord | null>;
  addExistingMember: (
    tenantId: string,
    identity: IdentityRecord,
  ) => Promise<TenantMemberRecord>;
  createOrRotateInvitation: (
    tenantId: string,
    email: string,
    tokenHash: string,
    expiresAt: Date,
  ) => Promise<InvitationRecord>;
  resolveInvitation: (tokenHash: string) => Promise<InvitationRecord | null>;
  completeInvitation: (
    invitationId: string,
    tokenHash: string,
    userId: string,
  ) => Promise<void>;
}>;

export class MembershipAlreadyExistsError extends Error {
  constructor() {
    super("Membership already exists.");
    this.name = "MembershipAlreadyExistsError";
  }
}

export class InvitationCompletionRejectedError extends Error {
  constructor() {
    super("Invitation cannot be completed.");
    this.name = "InvitationCompletionRejectedError";
  }
}

export function createMembershipPersistence(
  client: DatabaseClient,
): MembershipPersistence {
  return Object.freeze({
    listMembers: (tenantId) => listMembers(client, tenantId),
    resolveIdentityByEmail: (email) => resolveIdentityByEmail(client, email),
    addExistingMember: (tenantId, identity) =>
      addExistingMember(client, tenantId, identity),
    createOrRotateInvitation: (tenantId, email, tokenHash, expiresAt) =>
      createOrRotateInvitation(client, tenantId, email, tokenHash, expiresAt),
    resolveInvitation: (tokenHash) => resolveInvitation(client, tokenHash),
    completeInvitation: (invitationId, tokenHash, userId) =>
      completeInvitation(client, invitationId, tokenHash, userId),
  });
}

async function listMembers(
  client: DatabaseClient,
  tenantId: string,
): Promise<TenantMemberRecord[]> {
  return await client.drizzle
    .select({
      email: user.email,
      displayName: user.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.tenantId, tenantId))
    .orderBy(asc(memberships.createdAt), asc(user.email));
}

async function resolveIdentityByEmail(
  client: DatabaseClient,
  email: string,
): Promise<IdentityRecord | null> {
  const records = await client.drizzle
    .select({ id: user.id, email: user.email, displayName: user.name })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return records[0] ?? null;
}

async function addExistingMember(
  client: DatabaseClient,
  tenantId: string,
  identity: IdentityRecord,
): Promise<TenantMemberRecord> {
  return await client.drizzle.transaction(async (transaction) => {
    const [inserted] = await transaction
      .insert(memberships)
      .values({ tenantId, userId: identity.id, role: "member" })
      .onConflictDoNothing({
        target: [memberships.tenantId, memberships.userId],
      })
      .returning({ userId: memberships.userId });
    if (!inserted) {
      throw new MembershipAlreadyExistsError();
    }
    await transaction
      .delete(membershipInvitations)
      .where(
        and(
          eq(membershipInvitations.tenantId, tenantId),
          eq(membershipInvitations.email, identity.email),
        ),
      );
    return {
      email: identity.email,
      displayName: identity.displayName,
      role: "member",
    };
  });
}

async function createOrRotateInvitation(
  client: DatabaseClient,
  tenantId: string,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<InvitationRecord> {
  const [invitation] = await client.drizzle
    .insert(membershipInvitations)
    .values({ tenantId, email, tokenHash, expiresAt })
    .onConflictDoUpdate({
      target: [membershipInvitations.tenantId, membershipInvitations.email],
      set: { tokenHash, expiresAt, createdAt: new Date() },
    })
    .returning({
      id: membershipInvitations.id,
      tenantId: membershipInvitations.tenantId,
      email: membershipInvitations.email,
      expiresAt: membershipInvitations.expiresAt,
    });
  if (!invitation) {
    throw new Error("Invitation persistence returned no record.");
  }
  return invitation;
}

async function resolveInvitation(
  client: DatabaseClient,
  tokenHash: string,
): Promise<InvitationRecord | null> {
  const records = await client.drizzle
    .select({
      id: membershipInvitations.id,
      tenantId: membershipInvitations.tenantId,
      email: membershipInvitations.email,
      expiresAt: membershipInvitations.expiresAt,
    })
    .from(membershipInvitations)
    .where(eq(membershipInvitations.tokenHash, tokenHash))
    .limit(1);
  return records[0] ?? null;
}

async function completeInvitation(
  client: DatabaseClient,
  invitationId: string,
  tokenHash: string,
  userId: string,
): Promise<void> {
  await client.drizzle.transaction(async (transaction) => {
    const [claimed] = await transaction
      .delete(membershipInvitations)
      .where(
        and(
          eq(membershipInvitations.id, invitationId),
          eq(membershipInvitations.tokenHash, tokenHash),
          gt(membershipInvitations.expiresAt, new Date()),
        ),
      )
      .returning({ tenantId: membershipInvitations.tenantId });
    if (!claimed) {
      throw new InvitationCompletionRejectedError();
    }
    const [membership] = await transaction
      .insert(memberships)
      .values({ tenantId: claimed.tenantId, userId, role: "member" })
      .onConflictDoNothing({
        target: [memberships.tenantId, memberships.userId],
      })
      .returning({ userId: memberships.userId });
    if (!membership) {
      throw new InvitationCompletionRejectedError();
    }
  });
}
