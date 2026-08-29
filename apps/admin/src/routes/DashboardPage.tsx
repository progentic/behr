import type { AuthenticatedUser } from "@bher/contracts";

type DashboardPageProps = Readonly<{
  user: AuthenticatedUser;
}>;

export function DashboardPage({ user }: DashboardPageProps) {
  return (
    <section aria-labelledby="dashboard-title">
      <h1 id="dashboard-title">Welcome, {user.displayName}</h1>
      <p>Your authenticated BeHR workspace is ready.</p>
    </section>
  );
}
