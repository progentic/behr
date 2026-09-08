import type { FormEvent } from "react";
import { useState } from "react";

import type { LoginRequest } from "@bher/contracts";
import { InvitationRegistrationForm } from "./InvitationRegistrationForm";

type LoginPageProps = Readonly<{
  error: string | null;
  onLogin: (request: LoginRequest) => Promise<void>;
}>;

export function LoginPage({ error, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin({ email, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <h1>Sign in to BeHR</h1>
      <p>Use your BeHR account to continue to the admin workspace.</p>
      <form onSubmit={(event) => void submitLogin(event)}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <InvitationRegistrationForm />
    </main>
  );
}
