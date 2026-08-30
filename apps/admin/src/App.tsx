import type { AuthenticatedSession, SessionResponse } from "@bher/contracts";

import { AuthGuard } from "./AuthGuard";
import { LoginPage } from "./LoginPage";
import { SitesPage } from "./SitesPage";
import {
  type AuthenticationState,
  useAuthentication,
} from "./lib/auth";

export function App() {
  const authentication = useAuthentication();
  return renderAuthenticationView(authentication);
}

function renderAuthenticationView(authentication: AuthenticationState) {
  const { view } = authentication;
  switch (view.status) {
    case "loading":
      return <p role="status">Checking your BeHR session…</p>;
    case "unauthenticated":
      return renderSessionView(
        authentication,
        { status: "unauthenticated" },
        null,
      );
    case "authenticated":
      return renderSessionView(authentication, view.session, null);
    case "error":
      return renderSessionView(authentication, view.previous, view.message);
  }
}

function renderSessionView(
  authentication: AuthenticationState,
  session: SessionResponse,
  error: string | null,
) {
  return (
    <AuthGuard
      session={session}
      unauthenticated={<LoginPage error={error} onLogin={authentication.login} />}
    >
      {(authenticatedSession) => (
        <AuthenticatedShell
          error={error}
          onLogout={authentication.logout}
          session={authenticatedSession}
        />
      )}
    </AuthGuard>
  );
}

function AuthenticatedShell({
  error,
  onLogout,
  session,
}: Readonly<{
  error: string | null;
  onLogout: () => Promise<void>;
  session: AuthenticatedSession;
}>) {
  const { user } = session;
  return (
    <>
      <header>
        <strong>BeHR</strong>
        <span>{user.email}</span>
        <button type="button" onClick={() => void onLogout()}>
          Log out
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <main>
        <SitesPage />
      </main>
    </>
  );
}
