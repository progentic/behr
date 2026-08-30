import {
  type MemberProvisioningResult,
  type TenantMember,
  addTenantMemberRequestSchema,
  memberProvisioningResultSchema,
  tenantMemberListSchema,
} from "@bher/contracts";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { requestApi } from "./lib/api";

type MemberState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "loaded"; members: TenantMember[] }>;

type InvitationDisplay = Readonly<{
  email: string;
  token: string;
  expiresAt: string;
}>;

export function TenantMembers({ tenantId }: Readonly<{ tenantId: string }>) {
  const [memberState, setMemberState] = useState<MemberState>({
    status: "loading",
  });
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationDisplay | null>(null);

  useEffect(() => {
    let active = true;
    void loadMembers(tenantId)
      .then((members) => {
        if (active) {
          setMemberState({ status: "loaded", members });
        }
      })
      .catch(() => {
        if (active) {
          setMemberState({ status: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function provisionMember(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setInvitation(null);
    setMessage(null);
    const request = addTenantMemberRequestSchema.safeParse({ email });
    if (!request.success) {
      setMessage("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestMemberProvisioning(tenantId, request.data);
      applyProvisioningResult(result);
    } catch {
      setMessage("The membership request could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  function applyProvisioningResult(result: MemberProvisioningResult): void {
    if (result.status === "member_added") {
      setMemberState((current) => ({
        status: "loaded",
        members:
          current.status === "loaded"
            ? [...current.members, result.member]
            : [result.member],
      }));
      setEmail("");
      setMessage("Member added.");
      setInvitation(null);
      return;
    }
    setInvitation(result.invitation);
    setMessage("Invitation created. Share this token securely.");
  }

  return (
    <section aria-labelledby="tenant-members-title">
      <h2 id="tenant-members-title">Members</h2>
      {memberState.status === "loading" ? (
        <p role="status">Loading members…</p>
      ) : null}
      {memberState.status === "error" ? (
        <p role="alert">Members could not be loaded.</p>
      ) : null}
      {memberState.status === "loaded" ? (
        <ul>
          {memberState.members.map((member) => (
            <li key={member.email}>
              <strong>{member.displayName}</strong> — {member.email} — {member.role}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={(event) => void provisionMember(event)}>
        <label htmlFor="member-email">Member email</label>
        <input
          id="member-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Add member"}
        </button>
      </form>

      {message ? <p role="status">{message}</p> : null}
      {invitation ? (
        <section aria-labelledby="membership-invitation-title">
          <h3 id="membership-invitation-title">Membership invitation</h3>
          <p>For: {invitation.email}</p>
          <p>Expires: {new Date(invitation.expiresAt).toLocaleString()}</p>
          <p>
            Share this token through an appropriately secure external channel.
            Anyone holding it can register the invited account while it is valid.
          </p>
          <output aria-label="Invitation token">{invitation.token}</output>
        </section>
      ) : null}
    </section>
  );
}

async function loadMembers(tenantId: string): Promise<TenantMember[]> {
  const response = await requestApi(`/tenants/${tenantId}/members`);
  if (!response.ok) {
    throw new Error("Membership loading failed.");
  }
  return tenantMemberListSchema.parse(await response.json()).members;
}

async function requestMemberProvisioning(
  tenantId: string,
  request: { email: string },
): Promise<MemberProvisioningResult> {
  const response = await requestApi(`/tenants/${tenantId}/members`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error("Membership provisioning failed.");
  }
  return memberProvisioningResultSchema.parse(await response.json());
}
