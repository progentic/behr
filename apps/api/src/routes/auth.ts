import {
  type AuthErrorResponse,
  type SessionResponse,
  loginRequestSchema,
} from "@bher/contracts";
import type { Context } from "hono";
import { Hono } from "hono";

import {
  type AuthService,
  AuthenticationRejectedError,
} from "../lib/auth";
import { createJsonResponse, readJsonBody } from "../lib/http";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const BAD_REQUEST_STATUS = 400;

export function createAuthRoutes(auth: AuthService): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  const requireAuthentication = createRequireAuthentication(auth);
  const requireTrustedOrigin = createRequireTrustedOrigin(auth);
  routes.post("/login", requireTrustedOrigin, (context) =>
    handleLogin(context, auth),
  );
  routes.get("/session", requireAuthentication, handleSession);
  routes.post(
    "/logout",
    requireTrustedOrigin,
    requireAuthentication,
    (context) => handleLogout(context, auth),
  );
  return routes;
}

async function handleLogin(
  context: Context<ApiBindings>,
  auth: AuthService,
): Promise<Response> {
  const request = loginRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createInvalidLoginRequestResponse();
  }
  try {
    const result = await auth.login(request.data, context.req.raw.headers);
    return createJsonResponse(result.session, OK_STATUS, result.headers);
  } catch (error) {
    if (error instanceof AuthenticationRejectedError) {
      return createAuthenticationRejectedResponse(error.statusCode);
    }
    throw error;
  }
}

function handleSession(context: Context<ApiBindings>): Response {
  const body: SessionResponse = context.get("authenticatedSession");
  return createJsonResponse(body, OK_STATUS);
}

async function handleLogout(
  context: Context<ApiBindings>,
  auth: AuthService,
): Promise<Response> {
  const result = await auth.logout(context.req.raw.headers);
  return createJsonResponse(result.session, OK_STATUS, result.headers);
}

function createInvalidLoginRequestResponse(): Response {
  const body: AuthErrorResponse = { error: "Login request is invalid." };
  return createJsonResponse(body, BAD_REQUEST_STATUS);
}

function createAuthenticationRejectedResponse(status: number): Response {
  const body: AuthErrorResponse = { error: "Invalid email or password." };
  return createJsonResponse(body, status);
}
