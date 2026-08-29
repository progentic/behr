import type {
  AuthenticatedUser,
  LoginRequest,
  SessionResponse,
} from "@bher/contracts";
import type { AuthPersistenceAdapter } from "@bher/db";

import type { AuthConfig } from "../env";
import {
  type AuthProvider,
  type IdentityRegistration,
  type ProviderMutation,
  authenticateProviderCredentials,
  constructAuthProvider,
  registerProviderIdentity,
  resolveProviderSession,
  signOutProviderSession,
} from "./auth-provider";
import {
  createAuthenticatedSession,
  createUnauthenticatedSession,
  toAuthenticatedUser,
} from "./session";

const TOO_MANY_REQUESTS_STATUS = 429;
const UNAUTHORIZED_STATUS = 401;

export type AuthMutation = Readonly<{
  session: SessionResponse;
  headers: Headers;
}>;

export type AuthService = Readonly<{
  login: (request: LoginRequest, headers: Headers) => Promise<AuthMutation>;
  logout: (headers: Headers) => Promise<AuthMutation>;
  resolveSession: (headers: Headers) => Promise<AuthenticatedUser | null>;
  registerIdentity: (
    identity: IdentityRegistration,
    headers: Headers,
  ) => Promise<AuthenticatedUser>;
  isTrustedOrigin: (origin: string | undefined) => boolean;
}>;

export class AuthenticationRejectedError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super("Authentication was rejected.");
    this.name = "AuthenticationRejectedError";
    this.statusCode = normalizeRejectionStatus(statusCode);
  }
}

export function createAuthService(
  config: AuthConfig,
  persistence: AuthPersistenceAdapter,
): AuthService {
  const provider = constructAuthProvider(config, persistence);
  const trustedOrigins = new Set(config.trustedOrigins);
  return Object.freeze({
    login: (request, headers) => login(provider, request, headers),
    logout: (headers) => logout(provider, headers),
    resolveSession: (headers) => resolveSession(provider, headers),
    registerIdentity: (identity, headers) =>
      registerIdentity(provider, identity, headers),
    isTrustedOrigin: (origin) => isTrustedOrigin(trustedOrigins, origin),
  });
}

async function login(
  provider: AuthProvider,
  request: LoginRequest,
  headers: Headers,
): Promise<AuthMutation> {
  const attempt = await authenticateProviderCredentials(provider, request, headers);
  if (!attempt.accepted) {
    throw new AuthenticationRejectedError(attempt.statusCode);
  }
  return createAuthenticatedMutation(attempt.mutation);
}

async function logout(
  provider: AuthProvider,
  headers: Headers,
): Promise<AuthMutation> {
  const result = await signOutProviderSession(provider, headers);
  return {
    session: createUnauthenticatedSession(),
    headers: extractCookieHeaders(result.headers),
  };
}

async function resolveSession(
  provider: AuthProvider,
  headers: Headers,
): Promise<AuthenticatedUser | null> {
  const user = await resolveProviderSession(provider, headers);
  return user ? toAuthenticatedUser(user) : null;
}

async function registerIdentity(
  provider: AuthProvider,
  identity: IdentityRegistration,
  headers: Headers,
): Promise<AuthenticatedUser> {
  const user = await registerProviderIdentity(provider, identity, headers);
  return toAuthenticatedUser(user);
}

function createAuthenticatedMutation(result: ProviderMutation): AuthMutation {
  return {
    session: createAuthenticatedSession(result.user),
    headers: extractCookieHeaders(result.headers),
  };
}

function extractCookieHeaders(providerHeaders: Headers): Headers {
  const headers = new Headers();
  for (const cookie of providerHeaders.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}

function isTrustedOrigin(
  trustedOrigins: ReadonlySet<string>,
  origin: string | undefined,
): boolean {
  return origin !== undefined && trustedOrigins.has(origin);
}

function normalizeRejectionStatus(statusCode: number): number {
  return statusCode === TOO_MANY_REQUESTS_STATUS
    ? TOO_MANY_REQUESTS_STATUS
    : UNAUTHORIZED_STATUS;
}
