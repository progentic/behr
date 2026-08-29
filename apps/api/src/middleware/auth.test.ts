import { expect, test } from "bun:test";
import type { AuthenticatedUser } from "@bher/contracts";
import { Hono } from "hono";

import type { AuthService } from "../lib/auth";
import type { ApiBindings } from "../types";
import { createRequireAuthentication } from "./auth";
import { createRequireTrustedOrigin } from "./origin";

const AUTHENTICATED_USER: AuthenticatedUser = {
  id: "server-user-id",
  email: "user@example.com",
  displayName: "Server User",
};
const TRUSTED_ORIGIN = "https://behr.example";

test("rejects a protected request without a server session", async () => {
  const app = createProtectedApplication(createFakeAuthService(null));
  const response = await app.request("/protected");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ status: "unauthenticated" });
});

test("uses server session identity instead of a client assertion", async () => {
  const app = createProtectedApplication(
    createFakeAuthService(AUTHENTICATED_USER),
  );
  const response = await app.request("/protected", {
    headers: { "x-user-id": "client-forged-id" },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: AUTHENTICATED_USER });
});

test("rejects state changes from an untrusted origin", async () => {
  const auth = createFakeAuthService(AUTHENTICATED_USER);
  const app = new Hono<ApiBindings>();
  app.post("/mutation", createRequireTrustedOrigin(auth), (context) =>
    context.json({ accepted: true }),
  );
  const response = await app.request("/mutation", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: "Request origin is not trusted.",
  });
});

function createProtectedApplication(auth: AuthService): Hono<ApiBindings> {
  const app = new Hono<ApiBindings>();
  app.use("/protected", createRequireAuthentication(auth));
  app.get("/protected", (context) =>
    context.json({ user: context.get("authenticatedUser") }),
  );
  return app;
}

function createFakeAuthService(
  resolvedUser: AuthenticatedUser | null,
): AuthService {
  return {
    login: async () => {
      throw new Error("Login is not used by this middleware test.");
    },
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => resolvedUser,
    registerIdentity: async () => AUTHENTICATED_USER,
    isTrustedOrigin: (origin) => origin === TRUSTED_ORIGIN,
  };
}
