import { expect, test } from "bun:test";
import {
  type DatabaseClient,
  type Environment,
  createDatabaseClient,
  loadDatabaseConfig,
} from "@bher/db";
import { sessionResponseSchema } from "@bher/contracts";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const AUTH_APPLICATION_NAME = "behr_auth_integration";
const OBSERVER_APPLICATION_NAME = "behr_auth_observer";
const EXPIRER_APPLICATION_NAME = "behr_auth_expirer";
const TEST_PASSWORD = "correct-phase-c-password";
const INVALID_PASSWORD = "incorrect-phase-c-password";
const JSON_CONTENT_TYPE = "application/json";
const NO_CONNECTIONS = 0;

type AuthIntegrationContext = Readonly<{
  application: ApiApplication;
  authBaseUrl: string;
  environment: Environment;
  observer: DatabaseClient;
}>;

test("verifies the complete identity and session lifecycle", verifyAuthLifecycle);

async function verifyAuthLifecycle(): Promise<void> {
  const context = await createAuthIntegrationContext(process.env);
  try {
    const identity = await registerIdentity(context);
    await verifyMissingAndInvalidSessions(context);
    await verifyInvalidCredentials(context, identity.email);
    const firstCookie = await verifyValidLogin(context, identity);
    await verifyServerAuthoritativeSession(context, firstCookie, identity);
    await expireIdentitySessions(context, identity.id);
    await verifyRejectedSession(context, firstCookie);
    const secondCookie = await verifyValidLogin(context, identity);
    await verifyLogoutInvalidation(context, secondCookie);
  } finally {
    await closeAuthIntegrationContext(context);
  }
}

async function createAuthIntegrationContext(
  environment: Environment,
): Promise<AuthIntegrationContext> {
  const applicationEnvironment = createAuthEnvironment(
    environment,
    AUTH_APPLICATION_NAME,
  );
  const authBaseUrl = loadApiConfig(applicationEnvironment).auth.baseUrl;
  const observer = createNamedDatabaseClient(
    environment,
    OBSERVER_APPLICATION_NAME,
  );
  await observer.connect();
  return {
    application: createApiApplication(applicationEnvironment),
    authBaseUrl,
    environment,
    observer,
  };
}

async function closeAuthIntegrationContext(
  context: AuthIntegrationContext,
): Promise<void> {
  await context.application.close();
  expect(
    await countConnectionsByApplicationName(
      context.observer,
      AUTH_APPLICATION_NAME,
    ),
  ).toBe(NO_CONNECTIONS);
  await context.observer.close();
}

async function registerIdentity(context: AuthIntegrationContext) {
  const email = `phase-c-${crypto.randomUUID()}@example.com`;
  const user = await context.application.auth.registerIdentity(
    { name: "Phase C User", email, password: TEST_PASSWORD },
    createAuthHeaders(context.authBaseUrl),
  );
  expect(user.email).toBe(email);
  return user;
}

async function verifyMissingAndInvalidSessions(
  context: AuthIntegrationContext,
): Promise<void> {
  expect((await requestSession(context)).status).toBe(401);
  expect((await requestSession(context, "behr.session_token=invalid")).status).toBe(
    401,
  );
}

async function verifyInvalidCredentials(
  context: AuthIntegrationContext,
  email: string,
): Promise<void> {
  const response = await requestLogin(context, email, INVALID_PASSWORD);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Invalid email or password." });
}

async function verifyValidLogin(
  context: AuthIntegrationContext,
  identity: Readonly<{ id: string; email: string; displayName: string }>,
): Promise<string> {
  const response = await requestLogin(context, identity.email, TEST_PASSWORD);
  const body = sessionResponseSchema.parse(await response.json());
  const setCookie = requireSessionSetCookie(response);

  expect(response.status).toBe(200);
  expect(body).toEqual({ status: "authenticated", user: identity });
  expect(JSON.stringify(body)).not.toContain("token");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
  return readCookiePair(setCookie);
}

async function verifyServerAuthoritativeSession(
  context: AuthIntegrationContext,
  cookie: string,
  identity: Readonly<{ id: string; email: string; displayName: string }>,
): Promise<void> {
  const response = await requestSession(context, cookie, {
    "x-user-id": "client-forged-id",
  });
  expect(response.status).toBe(200);
  expect(sessionResponseSchema.parse(await response.json())).toEqual({
    status: "authenticated",
    user: identity,
  });
}

async function expireIdentitySessions(
  context: AuthIntegrationContext,
  userId: string,
): Promise<void> {
  const client = createNamedDatabaseClient(
    context.environment,
    EXPIRER_APPLICATION_NAME,
  );
  try {
    await client.connect();
    await client.native`
      UPDATE "session"
      SET "expires_at" = ${new Date(0)}
      WHERE "user_id" = ${userId}
    `;
  } finally {
    await client.close();
  }
}

async function verifyRejectedSession(
  context: AuthIntegrationContext,
  cookie: string,
): Promise<void> {
  const response = await requestSession(context, cookie);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ status: "unauthenticated" });
}

async function verifyLogoutInvalidation(
  context: AuthIntegrationContext,
  cookie: string,
): Promise<void> {
  const logout = await context.application.app.request("/api/auth/logout", {
    method: "POST",
    headers: createAuthHeaders(context.authBaseUrl, cookie),
  });
  expect(logout.status).toBe(200);
  expect(await logout.json()).toEqual({ status: "unauthenticated" });
  expect(requireSessionSetCookie(logout)).toContain("Max-Age=0");
  await verifyRejectedSession(context, cookie);
}

async function requestLogin(
  context: AuthIntegrationContext,
  email: string,
  password: string,
): Promise<Response> {
  return await context.application.app.request("/api/auth/login", {
    method: "POST",
    headers: createAuthHeaders(context.authBaseUrl),
    body: JSON.stringify({ email, password }),
  });
}

async function requestSession(
  context: AuthIntegrationContext,
  cookie?: string,
  additionalHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = createAuthHeaders(context.authBaseUrl, cookie);
  for (const [name, value] of Object.entries(additionalHeaders ?? {})) {
    headers.set(name, value);
  }
  return await context.application.app.request("/api/auth/session", { headers });
}

function createAuthEnvironment(
  environment: Environment,
  applicationName: string,
): Environment {
  const config = withApplicationName(
    loadDatabaseConfig(environment),
    applicationName,
  );
  return {
    ...environment,
    DATABASE_URL: config.databaseUrl,
  };
}

function createNamedDatabaseClient(
  environment: Environment,
  applicationName: string,
): DatabaseClient {
  const config = withApplicationName(
    loadDatabaseConfig(environment),
    applicationName,
  );
  return createDatabaseClient(config);
}

function withApplicationName(
  config: Readonly<{ databaseUrl: string }>,
  applicationName: string,
) {
  const url = new URL(config.databaseUrl);
  url.searchParams.set("application_name", applicationName);
  return { databaseUrl: url.toString() };
}

function createAuthHeaders(origin: string, cookie?: string): Headers {
  const headers = new Headers({
    "content-type": JSON_CONTENT_TYPE,
    origin,
    "user-agent": "BeHR Phase C integration test",
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return headers;
}

function requireSessionSetCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("behr.session_token="));
  if (!cookie) {
    throw new Error("Expected a BeHR session cookie.");
  }
  return cookie;
}

function readCookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

async function countConnectionsByApplicationName(
  client: DatabaseClient,
  applicationName: string,
): Promise<number> {
  const rows = await client.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM pg_stat_activity
    WHERE application_name = ${applicationName}
  `;
  return rows[0]?.count ?? NO_CONNECTIONS;
}
