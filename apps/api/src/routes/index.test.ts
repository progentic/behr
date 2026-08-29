import { expect, test } from "bun:test";

import type { AuthService } from "../lib/auth";
import { createApiRoutes } from "./index";

const ADMIN_ORIGIN = "http://localhost:3001";

test("allows credentialed auth requests only for the configured admin origin", async () => {
  const routes = createApiRoutes(createFakeAuthService(), ADMIN_ORIGIN);
  const response = await routes.request("/auth/login", {
    method: "OPTIONS",
    headers: {
      origin: ADMIN_ORIGIN,
      "access-control-request-method": "POST",
    },
  });

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
});

function createFakeAuthService(): AuthService {
  return {
    login: async () => {
      throw new Error("Login is not used by this CORS test.");
    },
    logout: async () => ({
      session: { status: "unauthenticated" },
      headers: new Headers(),
    }),
    resolveSession: async () => null,
    registerIdentity: async () => ({
      id: "unused",
      email: "unused@example.com",
      displayName: "Unused",
    }),
    isTrustedOrigin: (origin) => origin === ADMIN_ORIGIN,
  };
}
