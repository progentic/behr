import type { AuthenticatedSession, SessionResponse } from "@bher/contracts";
import type { ReactNode } from "react";

type AuthGuardProps = Readonly<{
  children: (session: AuthenticatedSession) => ReactNode;
  session: SessionResponse;
  unauthenticated: ReactNode;
}>;

export function AuthGuard({
  children,
  session,
  unauthenticated,
}: AuthGuardProps): ReactNode {
  if (session.status === "unauthenticated") {
    return unauthenticated;
  }
  return children(session);
}
