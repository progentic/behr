import type { AuthenticatedUser } from "@bher/contracts";
import type { ReactNode } from "react";

type LayoutProps = Readonly<{
  children: ReactNode;
  error: string | null;
  onLogout: () => Promise<void>;
  user: AuthenticatedUser;
}>;

export function Layout({ children, error, onLogout, user }: LayoutProps) {
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
      <main>{children}</main>
    </>
  );
}
