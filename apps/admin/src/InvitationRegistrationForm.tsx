import {
  inviteRegistrationRequestSchema,
  inviteRegistrationResponseSchema,
} from "@bher/contracts";
import type { FormEvent } from "react";
import { useState } from "react";

import { requestApi } from "./lib/api";

export function InvitationRegistrationForm() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function registerInvitation(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setMessage(null);
    const request = inviteRegistrationRequestSchema.safeParse({
      token,
      name,
      password,
    });
    if (!request.success) {
      setMessage("Enter a valid invitation token, name, and password.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await requestApi("/auth/register", {
        method: "POST",
        body: JSON.stringify(request.data),
      });
      if (!response.ok) {
        throw new Error("Invitation registration failed.");
      }
      inviteRegistrationResponseSchema.parse(await response.json());
      setToken("");
      setPassword("");
      setMessage("Account created. Sign in normally to continue.");
    } catch {
      setMessage(
        "Registration could not be completed. The invitation may be invalid, expired, or already used.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="auth-invitation"
      aria-labelledby="invitation-registration-title"
    >
      <h2 id="invitation-registration-title">Register with an invitation</h2>
      <form onSubmit={(event) => void registerInvitation(event)}>
        <label htmlFor="invitation-token">Invitation token</label>
        <input
          id="invitation-token"
          name="token"
          required
          value={token}
          onChange={(event) => setToken(event.currentTarget.value)}
        />
        <label htmlFor="invited-display-name">Display name</label>
        <input
          id="invited-display-name"
          name="name"
          maxLength={200}
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <label htmlFor="invited-password">Password</label>
        <input
          id="invited-password"
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Registering…" : "Create account"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
