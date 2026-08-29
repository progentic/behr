import type { AuthenticatedUser, SessionResponse } from "@bher/contracts";

import type { ProviderUser } from "./auth-provider";

export function createAuthenticatedSession(user: ProviderUser): SessionResponse {
  return {
    status: "authenticated",
    user: toAuthenticatedUser(user),
  };
}

export function createUnauthenticatedSession(): SessionResponse {
  return { status: "unauthenticated" };
}

export function toAuthenticatedUser(user: ProviderUser): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.name,
  };
}
