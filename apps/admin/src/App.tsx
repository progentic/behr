import { ActionButton, StatusMessage } from "@bher/ui";
import type { AuthenticatedSession, SessionResponse } from "@bher/contracts";
import { useState } from "react";
import { confirmEditorNavigation } from "./lib/unsaved-navigation";

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
      return <StatusMessage>Checking your BeHR session…</StatusMessage>;
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
  const [editorDirty, setEditorDirty] = useState(false);
  return (
    <SitesPage editorDirty={editorDirty} onDirtyChange={setEditorDirty}
      error={error}
      account={<div className="account-controls">
        <span>{user.email}</span>
        <ActionButton variant="secondary" type="button" onClick={() => {
          if (confirmEditorNavigation(editorDirty)) void onLogout();
        }}>
          Log out
        </ActionButton>
      </div>}
    />
  );
}
