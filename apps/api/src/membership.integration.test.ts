import { expect, test } from "bun:test";
import {
  type MemberProvisioningResult,
  type TenantAccess,
  memberProvisioningResultSchema,
  tenantAccessSchema,
  tenantMemberListSchema,
} from "@bher/contracts";
import {
  type DatabaseClient,
  InvitationCompletionRejectedError,
  createDatabaseClient,
  createMembershipPersistence,
  loadDatabaseConfig,
  membershipInvitations,
  memberships,
} from "@bher/db";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";
import {
  generateMembershipInvitationCredential,
  hashMembershipInvitationToken,
} from "./lib/invitation-token";

const OWNER_PASSWORD = "membership-owner-password";
const EXISTING_PASSWORD = "membership-existing-password";
const MEMBER_PASSWORD = "membership-member-password";
const OUTSIDER_PASSWORD = "membership-outsider-password";
const INVITED_PASSWORD = "membership-invited-password";
const JSON_CONTENT_TYPE = "application/json";

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

test("enforces multi-user membership onboarding", verifyMembershipLifecycle);

async function verifyMembershipLifecycle(): Promise<void> {
  const environment = process.env;
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const persistence = createMembershipPersistence(observer);
  const origin = loadApiConfig(environment).auth.baseUrl;
  const ownerIdentity = createIdentity("Owner", OWNER_PASSWORD);
  const existingIdentity = createIdentity("Existing", EXISTING_PASSWORD);
  const memberIdentity = createIdentity("Member", MEMBER_PASSWORD);
  const outsiderIdentity = createIdentity("Outsider", OUTSIDER_PASSWORD);
  const createdUserIds: string[] = [];
  let tenantId: string | undefined;

  try {
    await observer.connect();
    const owner = await registerIdentity(application, origin, ownerIdentity);
    const existing = await registerIdentity(
      application,
      origin,
      existingIdentity,
    );
    const member = await registerIdentity(application, origin, memberIdentity);
    const outsider = await registerIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    createdUserIds.push(owner.id, existing.id, member.id, outsider.id);

    const ownerCookie = await authenticateIdentity(
      application,
      origin,
      ownerIdentity,
    );
    const memberCookie = await authenticateIdentity(
      application,
      origin,
      memberIdentity,
    );
    const outsiderCookie = await authenticateIdentity(
      application,
      origin,
      outsiderIdentity,
    );
    const tenant = await createTenant(application, origin, ownerCookie);
    tenantId = tenant.id;
    await observer.drizzle.insert(memberships).values({
      tenantId,
      userId: member.id,
      role: "member",
    });

    const ownerList = await application.app.request(
      `/tenants/${tenantId}/members`,
      { headers: { cookie: ownerCookie } },
    );
    expect(ownerList.status).toBe(200);
    expect(
      tenantMemberListSchema.parse(await ownerList.json()).members,
    ).toHaveLength(2);
    expect(
      (await application.app.request(`/tenants/${tenantId}/members`, {
        headers: { cookie: memberCookie },
      })).status,
    ).toBe(403);
    expect(
      (await application.app.request(`/tenants/${tenantId}/members`, {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
        body: JSON.stringify({ email: existing.email }),
      })).status,
    ).toBe(403);
    expect(
      (await application.app.request(`/tenants/${tenantId}/members`, {
        headers: { cookie: outsiderCookie },
      })).status,
    ).toBe(404);
    expect(
      (await application.app.request(`/tenants/${tenantId}/members`, {
        method: "POST",
        headers: { cookie: ownerCookie, "content-type": JSON_CONTENT_TYPE },
        body: JSON.stringify({ email: existing.email }),
      })).status,
    ).toBe(403);

    const obsoleteCredential = await generateMembershipInvitationCredential();
    await persistence.createOrRotateInvitation(
      tenantId,
      existing.email,
      obsoleteCredential.tokenHash,
      obsoleteCredential.expiresAt,
    );
    const existingResult = await provisionMember(
      application,
      origin,
      ownerCookie,
      tenantId,
      existing.email.toUpperCase(),
    );
    expect(existingResult.status).toBe("member_added");
    expect(
      await persistence.resolveInvitation(obsoleteCredential.tokenHash),
    ).toBeNull();
    expect(
      (await provisionMemberResponse(
        application,
        origin,
        ownerCookie,
        tenantId,
        existing.email,
      )).status,
    ).toBe(409);

    const invitedEmail = `invited-${crypto.randomUUID()}@example.com`;
    const firstInvitation = await provisionMember(
      application,
      origin,
      ownerCookie,
      tenantId,
      invitedEmail,
    );
    if (firstInvitation.status !== "invitation_created") {
      throw new Error("Expected invitation creation.");
    }
    const firstHash = await hashMembershipInvitationToken(
      firstInvitation.invitation.token,
    );
    const stored = await observer.native<Array<{ tokenHash: string }>>`
      SELECT token_hash AS "tokenHash"
      FROM membership_invitations
      WHERE tenant_id = ${tenantId} AND email = ${invitedEmail}
    `;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(firstHash);
    expect(stored[0]?.tokenHash).not.toBe(firstInvitation.invitation.token);
    expect(stored[0]?.tokenHash).toHaveLength(64);

    const secondInvitation = await provisionMember(
      application,
      origin,
      ownerCookie,
      tenantId,
      invitedEmail,
    );
    if (secondInvitation.status !== "invitation_created") {
      throw new Error("Expected invitation rotation.");
    }
    const secondHash = await hashMembershipInvitationToken(
      secondInvitation.invitation.token,
    );
    expect(secondInvitation.invitation.token).not.toBe(
      firstInvitation.invitation.token,
    );
    expect(await persistence.resolveInvitation(firstHash)).toBeNull();
    expect(await persistence.resolveInvitation(secondHash)).not.toBeNull();
    expect(
      (await registerInvitation(
        application,
        origin,
        firstInvitation.invitation.token,
        "Invited User",
        INVITED_PASSWORD,
      )).status,
    ).toBe(400);

    let tokenHashConstraintRejected = false;
    try {
      await observer.drizzle.insert(membershipInvitations).values({
        tenantId,
        email: `other-${crypto.randomUUID()}@example.com`,
        tokenHash: secondHash,
        expiresAt: new Date(Date.now() + 60_000),
      });
    } catch {
      tokenHashConstraintRejected = true;
    }
    expect(tokenHashConstraintRejected).toBe(true);

    let tenantEmailConstraintRejected = false;
    try {
      await observer.drizzle.insert(membershipInvitations).values({
        tenantId,
        email: invitedEmail,
        tokenHash: "f".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      });
    } catch {
      tenantEmailConstraintRejected = true;
    }
    expect(tenantEmailConstraintRejected).toBe(true);

    const expiredResult = await provisionMember(
      application,
      origin,
      ownerCookie,
      tenantId,
      `expired-${crypto.randomUUID()}@example.com`,
    );
    if (expiredResult.status !== "invitation_created") {
      throw new Error("Expected expired invitation setup.");
    }
    await observer.native`
      UPDATE membership_invitations
      SET expires_at = ${new Date(0)}
      WHERE token_hash = ${await hashMembershipInvitationToken(
        expiredResult.invitation.token,
      )}
    `;
    expect(
      (await registerInvitation(
        application,
        origin,
        expiredResult.invitation.token,
        "Expired User",
        INVITED_PASSWORD,
      )).status,
    ).toBe(400);

    const rollbackCredential = await generateMembershipInvitationCredential();
    const rollbackInvitation = await persistence.createOrRotateInvitation(
      tenantId,
      `rollback-${crypto.randomUUID()}@example.com`,
      rollbackCredential.tokenHash,
      rollbackCredential.expiresAt,
    );
    await expect(
      persistence.completeInvitation(
        rollbackInvitation.id,
        rollbackCredential.tokenHash,
        owner.id,
      ),
    ).rejects.toBeInstanceOf(InvitationCompletionRejectedError);
    expect(
      await persistence.resolveInvitation(rollbackCredential.tokenHash),
    ).not.toBeNull();

    const registration = await registerInvitation(
      application,
      origin,
      secondInvitation.invitation.token,
      "Invited User",
      INVITED_PASSWORD,
    );
    expect(registration.status).toBe(201);
    expect(registration.headers.getSetCookie()).toHaveLength(0);
    expect(await registration.json()).toEqual({ status: "registered" });
    expect(await persistence.resolveInvitation(secondHash)).toBeNull();
    expect(
      (await registerInvitation(
        application,
        origin,
        secondInvitation.invitation.token,
        "Invited User",
        INVITED_PASSWORD,
      )).status,
    ).toBe(400);
    expect(
      (await application.app.request("/auth/session")).status,
    ).toBe(401);

    const registeredIdentity = await persistence.resolveIdentityByEmail(
      invitedEmail,
    );
    if (!registeredIdentity) {
      throw new Error("Expected authoritative invited identity.");
    }
    createdUserIds.push(registeredIdentity.id);
    const invitedCookie = await authenticateIdentity(application, origin, {
      name: "Invited User",
      email: invitedEmail,
      password: INVITED_PASSWORD,
    });
    expect(
      (await application.app.request(`/tenants/${tenantId}`, {
        headers: { cookie: invitedCookie },
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request(`/tenants/${tenantId}/members`, {
        headers: { cookie: invitedCookie },
      })).status,
    ).toBe(403);

    const existingInviteCredential =
      await generateMembershipInvitationCredential();
    await persistence.createOrRotateInvitation(
      tenantId,
      outsider.email,
      existingInviteCredential.tokenHash,
      existingInviteCredential.expiresAt,
    );
    const existingRegistration = await registerInvitation(
      application,
      origin,
      existingInviteCredential.token,
      "Existing Attempt",
      "replacement-password",
    );
    expect(existingRegistration.status).toBe(409);
    expect(JSON.stringify(await existingRegistration.json())).not.toContain(
      outsider.id,
    );

    expect(
      (await application.app.request("/auth/register", {
        method: "POST",
        headers: createRequestHeaders(origin),
        body: JSON.stringify({
          name: "Missing",
          password: INVITED_PASSWORD,
        }),
      })).status,
    ).toBe(400);
    expect(
      (await application.app.request("/auth/register", {
        method: "POST",
        headers: createRequestHeaders(origin),
        body: JSON.stringify({
          token: "missing",
          name: "Substitute",
          password: INVITED_PASSWORD,
          email: "substitute@example.com",
          tenantId,
        }),
      })).status,
    ).toBe(400);
    expect(
      (await application.app.request("/auth/sign-up/email", {
        method: "POST",
      })).status,
    ).toBe(404);
  } finally {
    await removeTestRecords(observer, tenantId, createdUserIds);
    await application.close();
    await observer.close();
  }
}

function createIdentity(label: string, password: string): TestIdentity {
  return {
    name: `Membership ${label}`,
    email: `membership-${label.toLowerCase()}-${crypto.randomUUID()}@example.com`,
    password,
  };
}

async function registerIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
) {
  return await application.auth.registerIdentity(
    identity,
    new Headers({ origin }),
  );
}

async function authenticateIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<string> {
  const response = await application.app.request("/auth/login", {
    method: "POST",
    headers: createRequestHeaders(origin),
    body: JSON.stringify({ email: identity.email, password: identity.password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!cookie) {
    throw new Error("Expected session cookie.");
  }
  return cookie.split(";", 1)[0] ?? "";
}

async function createTenant(
  application: ApiApplication,
  origin: string,
  cookie: string,
): Promise<TenantAccess> {
  const response = await application.app.request("/tenants", {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ name: "Membership Tenant" }),
  });
  expect(response.status).toBe(201);
  return tenantAccessSchema.parse(await response.json());
}

async function provisionMember(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  email: string,
): Promise<MemberProvisioningResult> {
  const response = await provisionMemberResponse(
    application,
    origin,
    cookie,
    tenantId,
    email,
  );
  expect(response.status).toBe(201);
  return memberProvisioningResultSchema.parse(await response.json());
}

async function provisionMemberResponse(
  application: ApiApplication,
  origin: string,
  cookie: string,
  tenantId: string,
  email: string,
): Promise<Response> {
  return await application.app.request(`/tenants/${tenantId}/members`, {
    method: "POST",
    headers: createRequestHeaders(origin, cookie),
    body: JSON.stringify({ email }),
  });
}

async function registerInvitation(
  application: ApiApplication,
  origin: string,
  token: string,
  name: string,
  password: string,
): Promise<Response> {
  return await application.app.request("/auth/register", {
    method: "POST",
    headers: createRequestHeaders(origin),
    body: JSON.stringify({ token, name, password }),
  });
}

function createRequestHeaders(origin: string, cookie?: string): Headers {
  const headers = new Headers({
    "content-type": JSON_CONTENT_TYPE,
    origin,
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return headers;
}

async function removeTestRecords(
  observer: DatabaseClient,
  tenantId: string | undefined,
  userIds: string[],
): Promise<void> {
  if (tenantId) {
    await observer.native`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  for (const userId of userIds) {
    await observer.native`DELETE FROM "user" WHERE id = ${userId}`;
  }
}
