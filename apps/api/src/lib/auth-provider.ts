import type { LoginRequest } from "@bher/contracts";
import type { AuthPersistenceAdapter } from "@bher/db";
import { isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";

import type { AuthConfig } from "../env";

const APP_NAME = "BeHR";
const AUTH_BASE_PATH = "/api/auth";
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
const GENERAL_RATE_LIMIT_WINDOW_SECONDS = 60;
const GENERAL_RATE_LIMIT_MAXIMUM = 100;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;
const LOGIN_RATE_LIMIT_MAXIMUM = 5;
const LOGIN_PROVIDER_PATH = "/sign-in/email";
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export type IdentityRegistration = Readonly<{
  name: string;
  email: string;
  password: string;
}>;

export type ProviderUser = Readonly<{
  id: string;
  email: string;
  name: string;
}>;

export type ProviderMutation = Readonly<{
  user: ProviderUser;
  headers: Headers;
}>;

export type ProviderSignOut = Readonly<{
  headers: Headers;
}>;

export type ProviderAuthenticationAttempt =
  | Readonly<{ accepted: true; mutation: ProviderMutation }>
  | Readonly<{ accepted: false; statusCode: number }>;

export function constructAuthProvider(
  config: AuthConfig,
  persistence: AuthPersistenceAdapter,
) {
  return betterAuth({
    appName: APP_NAME,
    basePath: AUTH_BASE_PATH,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: [...config.trustedOrigins],
    database: persistence,
    emailAndPassword: createEmailPasswordConfig(),
    session: createSessionConfig(),
    rateLimit: createRateLimitConfig(),
    advanced: createAdvancedConfig(config),
    logger: { level: "error" },
    telemetry: { enabled: false },
  });
}

export type AuthProvider = ReturnType<typeof constructAuthProvider>;

export async function authenticateProviderCredentials(
  provider: AuthProvider,
  request: LoginRequest,
  headers: Headers,
): Promise<ProviderAuthenticationAttempt> {
  try {
    return acceptProviderSignIn(
      await callProviderSignIn(provider, request, headers),
    );
  } catch (error) {
    return rejectProviderSignIn(error);
  }
}

function createEmailPasswordConfig() {
  return {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: MINIMUM_PASSWORD_LENGTH,
    maxPasswordLength: MAXIMUM_PASSWORD_LENGTH,
  } as const;
}

function createSessionConfig() {
  return {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  } as const;
}

function createRateLimitConfig() {
  return {
    enabled: true,
    storage: "memory",
    window: GENERAL_RATE_LIMIT_WINDOW_SECONDS,
    max: GENERAL_RATE_LIMIT_MAXIMUM,
    customRules: {
      [LOGIN_PROVIDER_PATH]: {
        window: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        max: LOGIN_RATE_LIMIT_MAXIMUM,
      },
    },
  } as const;
}

function createAdvancedConfig(config: AuthConfig) {
  return {
    cookiePrefix: "behr",
    useSecureCookies: config.secureCookies,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.secureCookies,
      path: "/",
    },
  } as const;
}

async function callProviderSignIn(
  provider: AuthProvider,
  request: LoginRequest,
  headers: Headers,
) {
  return await provider.api.signInEmail({
    body: request,
    headers,
    returnHeaders: true,
  });
}

function acceptProviderSignIn(
  result: Awaited<ReturnType<typeof callProviderSignIn>>,
): ProviderAuthenticationAttempt {
  return {
    accepted: true,
    mutation: {
      user: toProviderUser(result.response.user),
      headers: result.headers,
    },
  };
}

function rejectProviderSignIn(error: unknown): ProviderAuthenticationAttempt {
  if (isAPIError(error)) {
    return { accepted: false, statusCode: error.statusCode };
  }
  throw error;
}

export async function registerProviderIdentity(
  provider: AuthProvider,
  identity: IdentityRegistration,
  headers: Headers,
): Promise<ProviderUser> {
  const result = await provider.api.signUpEmail({
    body: identity,
    headers,
  });
  return toProviderUser(result.user);
}

export async function resolveProviderSession(
  provider: AuthProvider,
  headers: Headers,
): Promise<ProviderUser | null> {
  const result = await provider.api.getSession({
    headers,
    query: {
      disableCookieCache: true,
      disableRefresh: true,
    },
  });
  return result ? toProviderUser(result.user) : null;
}

export async function signOutProviderSession(
  provider: AuthProvider,
  headers: Headers,
): Promise<ProviderSignOut> {
  const result = await provider.api.signOut({
    headers,
    returnHeaders: true,
  });
  return { headers: result.headers };
}

function toProviderUser(user: ProviderUser): ProviderUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
