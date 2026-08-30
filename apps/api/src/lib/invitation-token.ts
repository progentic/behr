const INVITATION_TOKEN_BYTES = 32;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export type MembershipInvitationCredential = Readonly<{
  token: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export async function generateMembershipInvitationCredential(): Promise<
  MembershipInvitationCredential
> {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITATION_TOKEN_BYTES));
  const token = Buffer.from(bytes).toString("base64url");
  return {
    token,
    tokenHash: await hashMembershipInvitationToken(token),
    expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
  };
}

export async function hashMembershipInvitationToken(
  token: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Buffer.from(digest).toString("hex");
}
