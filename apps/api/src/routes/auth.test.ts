import { expect, test } from "bun:test";
import type { AuthenticatedUser } from "@bher/contracts";

import {
  type AuthService,
  AuthenticationRejectedError,
} from "../lib/auth";
import { createAuthRoutes } from "./auth";

const TRUSTED_ORIGIN = "https://behr.example";
const AUTHENTICATED_USER: AuthenticatedUser = {
  id: "auth-route-user",
  email: "route@example.com",
  displayName: "Route User",
};
const AUTHENTICATED_SESSION = {
  status: "authenticated" as const,
  user: AUTHENTICATED_USER,
  expiresAt: "2026-09-05T00:00:00.000Z",
};

test("rejects login bodies that assert a user identity", async () => {
  const routes = createAuthRoutes(createSuccessfulAuthService());
  const response = await routes.request("/login", {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({
      email: "route@example.com",
      password: "correct-password",
      userId: "client-forged-id",
    }),
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Login request is invalid." });
});

test("maps rejected credentials to a generic response", async () => {
  const routes = createAuthRoutes(createRejectedAuthService());
  const response = await routes.request("/login", {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({
      email: "route@example.com",
      password: "incorrect-password",
    }),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Invalid email or password." });
});

test("returns a narrow session response and an HttpOnly cookie", async () => {
  const routes = createAuthRoutes(createSuccessfulAuthService());
  const response = await routes.request("/login", {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({
      email: "route@example.com",
      password: "correct-password",
    }),
  });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual(AUTHENTICATED_SESSION);
  expect(body).not.toHaveProperty("token");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

function createSuccessfulAuthService(): AuthService {
  return createAuthService(async () => ({
    session: AUTHENTICATED_SESSION,
    headers: new Headers({
      "set-cookie": "behr.session_token=opaque; HttpOnly; SameSite=Lax; Path=/",
    }),
  }));
}

function createRejectedAuthService(): AuthService {
  return createAuthService(async () => {
    throw new AuthenticationRejectedError(401);
  });
}

function createAuthService(login: AuthService["login"]): AuthService {
  return {
    login,
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => AUTHENTICATED_SESSION,
    registerIdentity: async () => AUTHENTICATED_USER,
    isTrustedOrigin: (origin) => origin === TRUSTED_ORIGIN,
  };
}

function createJsonHeaders(): Headers {
  return new Headers({
    "content-type": "application/json",
    origin: TRUSTED_ORIGIN,
  });
}
