import {
  type LoginRequest,
  type SessionResponse,
  authErrorResponseSchema,
  loginRequestSchema,
  sessionResponseSchema,
} from "@bher/contracts";
import { useCallback, useEffect, useState } from "react";

import { requestAuthApi } from "./api";

const UNAUTHORIZED_STATUS = 401;
const GENERIC_AUTH_ERROR = "Authentication request failed.";

export type AuthenticationState = Readonly<{
  error: string | null;
  loading: boolean;
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  session: SessionResponse;
}>;

export class AuthApiError extends Error {
  constructor(message = GENERIC_AUTH_ERROR) {
    super(message);
    this.name = "AuthApiError";
  }
}

export function useAuthentication(): AuthenticationState {
  const [session, setSession] = useState<SessionResponse>({
    status: "unauthenticated",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => createSessionRefreshEffect(setSession, setLoading, setError), []);

  const login = useCallback(async (request: LoginRequest) => {
    setError(null);
    try {
      setSession(await authenticate(request));
    } catch (failure) {
      setError(readAuthError(failure));
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      setSession(await invalidateSession());
    } catch (failure) {
      setError(readAuthError(failure));
    }
  }, []);

  return { error, loading, login, logout, session };
}

async function authenticate(request: LoginRequest): Promise<SessionResponse> {
  const body = loginRequestSchema.parse(request);
  const response = await requestAuthApi("/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return await readSessionResponse(response);
}

async function resolveSession(): Promise<SessionResponse> {
  const response = await requestAuthApi("/session");
  if (response.status === UNAUTHORIZED_STATUS) {
    return { status: "unauthenticated" };
  }
  return await readSessionResponse(response);
}

async function invalidateSession(): Promise<SessionResponse> {
  const response = await requestAuthApi("/logout", { method: "POST" });
  return await readSessionResponse(response);
}

function createSessionRefreshEffect(
  setSession: (session: SessionResponse) => void,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
): () => void {
  let active = true;
  void resolveSession()
    .then((session) => updateActiveSession(active, setSession, session))
    .catch((failure) => updateActiveError(active, setError, failure))
    .finally(() => updateActiveLoading(active, setLoading));
  return () => {
    active = false;
  };
}

async function readSessionResponse(response: Response): Promise<SessionResponse> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = authErrorResponseSchema.safeParse(body);
    throw new AuthApiError(error.success ? error.data.error : undefined);
  }
  return sessionResponseSchema.parse(body);
}

function readAuthError(error: unknown): string {
  return error instanceof AuthApiError ? error.message : GENERIC_AUTH_ERROR;
}

function updateActiveSession(
  active: boolean,
  setSession: (session: SessionResponse) => void,
  session: SessionResponse,
): void {
  if (active) {
    setSession(session);
  }
}

function updateActiveError(
  active: boolean,
  setError: (error: string | null) => void,
  error: unknown,
): void {
  if (active) {
    setError(readAuthError(error));
  }
}

function updateActiveLoading(
  active: boolean,
  setLoading: (loading: boolean) => void,
): void {
  if (active) {
    setLoading(false);
  }
}
