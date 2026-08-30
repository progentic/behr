import {
  type AuthenticatedSession,
  type LoginRequest,
  type SessionResponse,
  authErrorResponseSchema,
  loginRequestSchema,
  sessionResponseSchema,
} from "@bher/contracts";
import { useCallback, useEffect, useState } from "react";

import { requestApi } from "./api";

const UNAUTHORIZED_STATUS = 401;
const GENERIC_AUTH_ERROR = "Authentication request failed.";

export type AuthenticationView =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "unauthenticated" }>
  | Readonly<{ status: "authenticated"; session: AuthenticatedSession }>
  | Readonly<{
      status: "error";
      message: string;
      previous: SessionResponse;
    }>;

export type AuthenticationState = Readonly<{
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  view: AuthenticationView;
}>;

export class AuthApiError extends Error {
  constructor(message = GENERIC_AUTH_ERROR) {
    super(message);
    this.name = "AuthApiError";
  }
}

export function useAuthentication(): AuthenticationState {
  const [view, setView] = useState<AuthenticationView>({ status: "loading" });

  useEffect(() => createSessionRefreshEffect(setView), []);

  const login = useCallback(async (request: LoginRequest) => {
    try {
      setView(createSessionView(await authenticate(request)));
    } catch (failure) {
      setView({
        status: "error",
        message: readAuthError(failure),
        previous: { status: "unauthenticated" },
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setView(createSessionView(await invalidateSession()));
    } catch (failure) {
      setView((current) => ({
        status: "error",
        message: readAuthError(failure),
        previous: readPreviousSession(current),
      }));
    }
  }, []);

  return { login, logout, view };
}

async function authenticate(request: LoginRequest): Promise<SessionResponse> {
  const body = loginRequestSchema.parse(request);
  const response = await requestApi("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return await readSessionResponse(response);
}

async function resolveSession(): Promise<SessionResponse> {
  const response = await requestApi("/auth/session");
  if (response.status === UNAUTHORIZED_STATUS) {
    return { status: "unauthenticated" };
  }
  return await readSessionResponse(response);
}

async function invalidateSession(): Promise<SessionResponse> {
  const response = await requestApi("/auth/logout", { method: "POST" });
  return await readSessionResponse(response);
}

function createSessionRefreshEffect(
  setView: (view: AuthenticationView) => void,
): () => void {
  let active = true;
  void resolveSession()
    .then((session) => updateActiveView(active, setView, createSessionView(session)))
    .catch((failure) =>
      updateActiveView(active, setView, {
        status: "error",
        message: readAuthError(failure),
        previous: { status: "unauthenticated" },
      }),
    );
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

function createSessionView(session: SessionResponse): AuthenticationView {
  return session.status === "authenticated"
    ? { status: "authenticated", session }
    : { status: "unauthenticated" };
}

function readPreviousSession(view: AuthenticationView): SessionResponse {
  if (view.status === "authenticated") {
    return view.session;
  }
  return view.status === "error"
    ? view.previous
    : { status: "unauthenticated" };
}

function updateActiveView(
  active: boolean,
  setView: (view: AuthenticationView) => void,
  view: AuthenticationView,
): void {
  if (active) {
    setView(view);
  }
}
