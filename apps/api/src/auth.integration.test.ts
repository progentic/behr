import { expect, test } from "bun:test";
import {
  type DatabaseClient,
  type Environment,
  createDatabaseClient,
  loadDatabaseConfig,
} from "@bher/db";
import {
  type AuthenticatedUser,
  sessionResponseSchema,
} from "@bher/contracts";
import { resolve } from "node:path";

import { type ApiApplication, createApiApplication } from "./application";
import { loadApiConfig } from "./env";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
const AUTH_APPLICATION_NAME = "behr_auth_integration";
const BOOTSTRAP_APPLICATION_NAME = "behr_auth_bootstrap";
const OBSERVER_APPLICATION_NAME = "behr_auth_observer";
const EXPIRER_APPLICATION_NAME = "behr_auth_expirer";
const TEST_PASSWORD = "correct-phase-two-password";
const REPLACEMENT_PASSWORD = "replacement-phase-two-password";
const INVALID_PASSWORD = "incorrect-phase-two-password";
const JSON_CONTENT_TYPE = "application/json";
const NO_CONNECTIONS = 0;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;

type TestIdentity = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

type AuthIntegrationContext = Readonly<{
  application: ApiApplication;
  authBaseUrl: string;
  bootstrapEnvironment: Environment;
  environment: Environment;
  observer: DatabaseClient;
}>;

type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

test("verifies bootstrap, identity, and session lifecycle", verifyAuthLifecycle);

async function verifyAuthLifecycle(): Promise<void> {
  const identity = createTestIdentity();
  const context = await createAuthIntegrationContext(process.env, identity);
  try {
    const user = await verifyBootstrap(context, identity);
    await verifyApprovedRouteSurface(context);
    await verifyMissingAndInvalidSessions(context);
    await verifyMissingAndInvalidCredentials(context, identity.email);
    const firstCookie = await verifyValidLogin(context, identity, user);
    await verifyServerAuthoritativeSession(context, firstCookie, user);
    await expireIdentitySessions(context, user.id);
    await verifyRejectedSession(context, firstCookie);
    const secondCookie = await verifyValidLogin(context, identity, user);
    await verifyLogoutInvalidation(context, secondCookie);
  } finally {
    await closeAuthIntegrationContext(context);
  }
}

async function createAuthIntegrationContext(
  environment: Environment,
  identity: TestIdentity,
): Promise<AuthIntegrationContext> {
  const applicationEnvironment = createNamedEnvironment(
    environment,
    AUTH_APPLICATION_NAME,
  );
  const bootstrapEnvironment = createBootstrapEnvironment(environment, identity);
  const observer = createNamedDatabaseClient(
    environment,
    OBSERVER_APPLICATION_NAME,
  );
  await observer.connect();
  return {
    application: createApiApplication(applicationEnvironment),
    authBaseUrl: loadApiConfig(applicationEnvironment).auth.baseUrl,
    bootstrapEnvironment,
    environment,
    observer,
  };
}

async function closeAuthIntegrationContext(
  context: AuthIntegrationContext,
): Promise<void> {
  await context.application.close();
  await expectNoApplicationConnections(context, AUTH_APPLICATION_NAME);
  await expectNoApplicationConnections(context, BOOTSTRAP_APPLICATION_NAME);
  await expectNoApplicationConnections(context, EXPIRER_APPLICATION_NAME);
  await context.observer.close();
}

async function verifyBootstrap(
  context: AuthIntegrationContext,
  identity: TestIdentity,
): Promise<AuthenticatedUser> {
  const first = await runRootScript("auth:bootstrap", context.bootstrapEnvironment);
  expect(first.exitCode).toBe(SUCCESS_EXIT_CODE);
  expect(first.stdout).toContain("Initial BeHR identity created.");
  expectCommandOutputToExcludeSecrets(first, identity);

  const second = await runRootScript(
    "auth:bootstrap",
    createReplacementBootstrapEnvironment(context.bootstrapEnvironment),
  );
  expect(second.exitCode).toBe(FAILURE_EXIT_CODE);
  expect(second.stderr).toContain("An identity already exists; bootstrap refused.");
  expectCommandOutputToExcludeSecrets(second, identity);

  const user = await readBootstrapUser(context.observer, identity.email);
  expect(user.name).toBe(identity.name);
  await verifyCredentialStorage(context.observer, user.id, identity.password);
  return { id: user.id, email: user.email, displayName: user.name };
}

async function verifyApprovedRouteSurface(
  context: AuthIntegrationContext,
): Promise<void> {
  const requests = [
    context.application.app.request("/auth/sign-up/email", { method: "POST" }),
    context.application.app.request("/auth/request-password-reset", {
      method: "POST",
    }),
    context.application.app.request("/auth/login", { method: "GET" }),
    context.application.app.request("/api/auth/get-session"),
  ];
  for (const response of await Promise.all(requests)) {
    expect([404, 405]).toContain(response.status);
  }
}

async function verifyMissingAndInvalidSessions(
  context: AuthIntegrationContext,
): Promise<void> {
  expect((await requestSession(context)).status).toBe(401);
  expect((await requestSession(context, "behr.session_token=altered")).status).toBe(
    401,
  );
}

async function verifyMissingAndInvalidCredentials(
  context: AuthIntegrationContext,
  email: string,
): Promise<void> {
  const missing = await requestRawLogin(context, {});
  expect(missing.status).toBe(400);

  const invalid = await requestLogin(context, email, INVALID_PASSWORD);
  expect(invalid.status).toBe(401);
  expect(await invalid.json()).toEqual({ error: "Invalid email or password." });
}

async function verifyValidLogin(
  context: AuthIntegrationContext,
  identity: TestIdentity,
  user: AuthenticatedUser,
): Promise<string> {
  const response = await requestLogin(context, identity.email, identity.password);
  const body = sessionResponseSchema.parse(await response.json());
  const setCookie = requireSessionSetCookie(response);

  expect(response.status).toBe(200);
  expect(body.status).toBe("authenticated");
  if (body.status !== "authenticated") {
    throw new Error("Expected an authenticated login response.");
  }
  expect(body.user).toEqual(user);
  expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
  expect(JSON.stringify(body)).not.toContain("token");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
  return readCookiePair(setCookie);
}

async function verifyServerAuthoritativeSession(
  context: AuthIntegrationContext,
  cookie: string,
  user: AuthenticatedUser,
): Promise<void> {
  const response = await requestSession(context, cookie, {
    "x-user-id": "client-forged-id",
  });
  const body = sessionResponseSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(body.status).toBe("authenticated");
  if (body.status !== "authenticated") {
    throw new Error("Expected an authenticated session response.");
  }
  expect(body.user).toEqual(user);
  expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
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
  const logout = await context.application.app.request("/auth/logout", {
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
  return await requestRawLogin(context, { email, password });
}

async function requestRawLogin(
  context: AuthIntegrationContext,
  body: unknown,
): Promise<Response> {
  return await context.application.app.request("/auth/login", {
    method: "POST",
    headers: createAuthHeaders(context.authBaseUrl),
    body: JSON.stringify(body),
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
  return await context.application.app.request("/auth/session", { headers });
}

async function readBootstrapUser(
  client: DatabaseClient,
  email: string,
): Promise<{ id: string; email: string; name: string }> {
  const users = await client.native<
    Array<{ id: string; email: string; name: string }>
  >`
    SELECT id, email, name
    FROM "user"
    WHERE email = ${email}
  `;
  const user = users[0];
  if (!user) {
    throw new Error("Expected the bootstrap identity in PostgreSQL.");
  }
  return user;
}

async function verifyCredentialStorage(
  client: DatabaseClient,
  userId: string,
  password: string,
): Promise<void> {
  const accounts = await client.native<Array<{ password: string | null }>>`
    SELECT password
    FROM account
    WHERE user_id = ${userId}
  `;
  expect(accounts[0]?.password).toBeTruthy();
  expect(accounts[0]?.password).not.toBe(password);
  expect(await countPlaintextOccurrences(client, password)).toBe(0);
}

async function countPlaintextOccurrences(
  client: DatabaseClient,
  password: string,
): Promise<number> {
  const rows = await client.native<Array<{ count: number }>>`
    SELECT (
      (SELECT count(*) FROM "user" WHERE id = ${password} OR name = ${password}
        OR email = ${password} OR image = ${password}) +
      (SELECT count(*) FROM account WHERE id = ${password}
        OR issuer = ${password} OR account_id = ${password}
        OR provider_id = ${password} OR user_id = ${password}
        OR access_token = ${password} OR refresh_token = ${password}
        OR id_token = ${password} OR scope = ${password} OR password = ${password}) +
      (SELECT count(*) FROM session WHERE id = ${password} OR token = ${password}
        OR ip_address = ${password} OR user_agent = ${password}
        OR user_id = ${password}) +
      (SELECT count(*) FROM verification WHERE id = ${password}
        OR identifier = ${password} OR value = ${password})
    )::int AS count
  `;
  return rows[0]?.count ?? 0;
}

function createTestIdentity(): TestIdentity {
  return {
    name: "Phase Two Initial Admin",
    email: `phase-two-${crypto.randomUUID()}@example.com`,
    password: TEST_PASSWORD,
  };
}

function createBootstrapEnvironment(
  environment: Environment,
  identity: TestIdentity,
): Environment {
  return {
    ...createNamedEnvironment(environment, BOOTSTRAP_APPLICATION_NAME),
    BOOTSTRAP_NAME: identity.name,
    BOOTSTRAP_EMAIL: identity.email,
    BOOTSTRAP_PASSWORD: identity.password,
  };
}

function createReplacementBootstrapEnvironment(
  environment: Environment,
): Environment {
  return {
    ...environment,
    BOOTSTRAP_NAME: "Replacement Identity",
    BOOTSTRAP_PASSWORD: REPLACEMENT_PASSWORD,
  };
}

function createNamedEnvironment(
  environment: Environment,
  applicationName: string,
): Environment {
  const config = withApplicationName(
    loadDatabaseConfig(environment),
    applicationName,
  );
  return { ...environment, DATABASE_URL: config.databaseUrl };
}

function createNamedDatabaseClient(
  environment: Environment,
  applicationName: string,
): DatabaseClient {
  return createDatabaseClient(
    withApplicationName(loadDatabaseConfig(environment), applicationName),
  );
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
    "user-agent": "BeHR Phase 2 integration test",
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

async function runRootScript(
  script: string,
  environment: Environment,
): Promise<CommandResult> {
  const subprocess = Bun.spawn(["bun", "run", script], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    readOutput(subprocess.stdout),
    readOutput(subprocess.stderr),
  ]);
  return { exitCode, stdout, stderr };
}

async function readOutput(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

function expectCommandOutputToExcludeSecrets(
  result: CommandResult,
  identity: TestIdentity,
): void {
  const output = `${result.stdout}\n${result.stderr}`;
  expect(output).not.toContain(identity.password);
  expect(output).not.toContain(REPLACEMENT_PASSWORD);
  expect(output).not.toContain("session_token");
}

async function expectNoApplicationConnections(
  context: AuthIntegrationContext,
  applicationName: string,
): Promise<void> {
  const rows = await context.observer.native<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM pg_stat_activity
    WHERE application_name = ${applicationName}
  `;
  expect(rows[0]?.count ?? NO_CONNECTIONS).toBe(NO_CONNECTIONS);
}
