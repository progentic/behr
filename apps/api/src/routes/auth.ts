import {
  type AuthErrorResponse,
  type InviteRegistrationResponse,
  type SessionResponse,
  inviteRegistrationRequestSchema,
  loginRequestSchema,
} from "@bher/contracts";
import {
  type MembershipPersistence,
  InvitationCompletionRejectedError,
} from "@bher/db";
import type { Context } from "hono";
import { Hono } from "hono";

import {
  type AuthService,
  AuthenticationRejectedError,
  IdentityRegistrationConflictError,
} from "../lib/auth";
import { createJsonResponse, readJsonBody } from "../lib/http";
import { hashMembershipInvitationToken } from "../lib/invitation-token";
import { createRequireAuthentication } from "../middleware/auth";
import { createRequireTrustedOrigin } from "../middleware/origin";
import type { ApiBindings } from "../types";

const OK_STATUS = 200;
const CREATED_STATUS = 201;
const BAD_REQUEST_STATUS = 400;
const CONFLICT_STATUS = 409;

export function createAuthRoutes(
  auth: AuthService,
  membershipPersistence: MembershipPersistence,
): Hono<ApiBindings> {
  const routes = new Hono<ApiBindings>();
  const requireAuthentication = createRequireAuthentication(auth);
  const requireTrustedOrigin = createRequireTrustedOrigin(auth);
  routes.post("/login", requireTrustedOrigin, (context) =>
    handleLogin(context, auth),
  );
  routes.post("/register", requireTrustedOrigin, (context) =>
    handleInvitationRegistration(context, auth, membershipPersistence),
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

async function handleInvitationRegistration(
  context: Context<ApiBindings>,
  auth: AuthService,
  persistence: MembershipPersistence,
): Promise<Response> {
  const request = inviteRegistrationRequestSchema.safeParse(
    await readJsonBody(context.req.raw),
  );
  if (!request.success) {
    return createJsonResponse(
      { error: "Registration request is invalid." },
      BAD_REQUEST_STATUS,
    );
  }
  const tokenHash = await hashMembershipInvitationToken(request.data.token);
  const invitation = await persistence.resolveInvitation(tokenHash);
  if (!invitation || invitation.expiresAt <= new Date()) {
    return createInvalidInvitationResponse();
  }
  if (await persistence.resolveIdentityByEmail(invitation.email)) {
    return createExistingIdentityRegistrationResponse();
  }

  let registeredIdentity;
  try {
    registeredIdentity = await auth.registerIdentity(
      {
        email: invitation.email,
        name: request.data.name,
        password: request.data.password,
      },
      context.req.raw.headers,
    );
  } catch (error) {
    if (error instanceof IdentityRegistrationConflictError) {
      if (await persistence.resolveIdentityByEmail(invitation.email)) {
        return createExistingIdentityRegistrationResponse();
      }
    }
    throw error;
  }

  const identity = await persistence.resolveIdentityByEmail(invitation.email);
  if (!identity) {
    throw new Error("Registered identity was not persisted.");
  }
  if (registeredIdentity.id !== identity.id) {
    return createExistingIdentityRegistrationResponse();
  }
  try {
    await persistence.completeInvitation(invitation.id, tokenHash, identity.id);
  } catch (error) {
    if (error instanceof InvitationCompletionRejectedError) {
      return createInvalidInvitationResponse();
    }
    throw error;
  }
  const body: InviteRegistrationResponse = { status: "registered" };
  return createJsonResponse(body, CREATED_STATUS);
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

function createInvalidInvitationResponse(): Response {
  return createJsonResponse(
    { error: "Invitation is invalid or expired." },
    BAD_REQUEST_STATUS,
  );
}

function createExistingIdentityRegistrationResponse(): Response {
  return createJsonResponse(
    {
      error:
        "An account already exists. Sign in and ask the tenant owner to add it.",
    },
    CONFLICT_STATUS,
  );
}
