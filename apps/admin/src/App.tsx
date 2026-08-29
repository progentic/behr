import { AuthGuard } from "./components/AuthGuard";
import { Layout } from "./components/Layout";
import { useAuthentication } from "./lib/auth";
import { DashboardPage } from "./routes/DashboardPage";
import { LoginPage } from "./routes/LoginPage";

export function App() {
  const authentication = useAuthentication();
  if (authentication.loading) {
    return <p role="status">Checking your BeHR session…</p>;
  }
  return (
    <AuthGuard
      session={authentication.session}
      unauthenticated={
        <LoginPage error={authentication.error} onLogin={authentication.login} />
      }
    >
      {(user) => (
        <Layout
          error={authentication.error}
          onLogout={authentication.logout}
          user={user}
        >
          <DashboardPage user={user} />
        </Layout>
      )}
    </AuthGuard>
  );
}
