import { expect, test } from "bun:test";
import {
  type DatabaseClient,
  type Environment,
  createDatabaseClient,
  loadDatabaseConfig,
  memberships,
} from "@bher/db";
import {
  type LoginRequest,
  tenantAccessSchema,
  tenantListResponseSchema,
} from "@bher/contracts";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const OWNER_PASSWORD = "phase-d-owner-password";
const MEMBER_PASSWORD = "phase-d-member-password";
const JSON_CONTENT_TYPE = "application/json";

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

test("enforces the tenant membership lifecycle", verifyTenantLifecycle);

async function verifyTenantLifecycle(): Promise<void> {
  const environment = process.env;
  const application = createApiApplication(environment);
  const observer = createDatabaseClient(loadDatabaseConfig(environment));
  const origin = loadApiConfig(environment).auth.baseUrl;
  const ownerIdentity: TestIdentity = {
    name: "Phase D Owner",
    email: `phase-d-owner-${crypto.randomUUID()}@example.com`,
    password: OWNER_PASSWORD,
  };
  const memberIdentity: TestIdentity = {
    name: "Phase D Member",
    email: `phase-d-member-${crypto.randomUUID()}@example.com`,
    password: MEMBER_PASSWORD,
  };
  const createdUserIds: string[] = [];
  let tenantId: string | undefined;

  try {
    await observer.connect();
    expect((await application.app.request("/tenants")).status).toBe(401);

    const owner = await application.auth.registerIdentity(
      ownerIdentity,
      new Headers({ origin }),
    );
    const member = await application.auth.registerIdentity(
      memberIdentity,
      new Headers({ origin }),
    );
    createdUserIds.push(owner.id, member.id);
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

    const invalidCreate = await application.app.request("/tenants", {
      method: "POST",
      headers: createRequestHeaders(origin, ownerCookie),
      body: JSON.stringify({ name: "   " }),
    });
    expect(invalidCreate.status).toBe(400);

    const create = await application.app.request("/tenants", {
      method: "POST",
      headers: createRequestHeaders(origin, ownerCookie),
      body: JSON.stringify({ name: "  Phase D Tenant  " }),
    });
    const ownerAccess = tenantAccessSchema.parse(await create.json());
    tenantId = ownerAccess.id;
    expect(create.status).toBe(201);
    expect(ownerAccess).toEqual({
      id: tenantId,
      name: "Phase D Tenant",
      role: "owner",
    });

    const counts = await observer.native<
      Array<{ membershipCount: number; tenantCount: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM tenants WHERE id = ${tenantId})
          AS "tenantCount",
        (SELECT count(*)::int FROM memberships
          WHERE tenant_id = ${tenantId} AND user_id = ${owner.id}
            AND role = 'owner') AS "membershipCount"
    `;
    expect(counts[0]).toEqual({ membershipCount: 1, tenantCount: 1 });

    const ownerList = await application.app.request("/tenants", {
      headers: { cookie: ownerCookie },
    });
    expect(ownerList.status).toBe(200);
    expect(tenantListResponseSchema.parse(await ownerList.json())).toEqual({
      tenants: [ownerAccess],
    });

    const emptyMemberList = await application.app.request("/tenants", {
      headers: { cookie: memberCookie },
    });
    expect(emptyMemberList.status).toBe(200);
    expect(tenantListResponseSchema.parse(await emptyMemberList.json())).toEqual({
      tenants: [],
    });

    const denied = await application.app.request(`/tenants/${tenantId}`, {
      headers: {
        cookie: memberCookie,
        "x-user-id": owner.id,
      },
    });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual({ error: "Tenant not found." });
    expect(
      (await application.app.request("/tenants/not-a-uuid", {
        headers: { cookie: ownerCookie },
      })).status,
    ).toBe(404);

    await observer.drizzle.insert(memberships).values({
      tenantId,
      userId: member.id,
      role: "member",
    });
    let duplicateRejected = false;
    try {
      await observer.drizzle.insert(memberships).values({
        tenantId,
        userId: member.id,
        role: "member",
      });
    } catch {
      duplicateRejected = true;
    }
    expect(duplicateRejected).toBe(true);

    const memberAccessResponse = await application.app.request(
      `/tenants/${tenantId}`,
      { headers: { cookie: memberCookie } },
    );
    const memberAccess = tenantAccessSchema.parse(
      await memberAccessResponse.json(),
    );
    expect(memberAccessResponse.status).toBe(200);
    expect(memberAccess).toEqual({ ...ownerAccess, role: "member" });

    const memberList = await application.app.request("/tenants", {
      headers: { cookie: memberCookie },
    });
    expect(tenantListResponseSchema.parse(await memberList.json())).toEqual({
      tenants: [memberAccess],
    });

    expect((await application.app.request("/health")).status).toBe(200);
    expect(
      (await application.app.request("/auth/session", {
        headers: { cookie: ownerCookie },
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request("/auth/logout", {
        method: "POST",
        headers: createRequestHeaders(origin, ownerCookie),
      })).status,
    ).toBe(200);
    expect(
      (await application.app.request("/auth/logout", {
        method: "POST",
        headers: createRequestHeaders(origin, memberCookie),
      })).status,
    ).toBe(200);
  } finally {
    await removeTestRecords(observer, tenantId, createdUserIds);
    await application.close();
    await observer.close();
  }
}

async function authenticateIdentity(
  application: ApiApplication,
  origin: string,
  identity: TestIdentity,
): Promise<string> {
  const request: LoginRequest = {
    email: identity.email,
    password: identity.password,
  };
  const response = await application.app.request("/auth/login", {
    method: "POST",
    headers: createRequestHeaders(origin),
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!setCookie) {
    throw new Error("Expected an authenticated session cookie.");
  }
  return setCookie.split(";", 1)[0] ?? "";
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
