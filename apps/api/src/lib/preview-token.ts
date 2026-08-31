const PREVIEW_TOKEN_BYTES = 32;
const PREVIEW_TOKEN_LIFETIME_MS = 15 * 60 * 1_000;

export type PreviewCredential = Readonly<{
  token: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export async function generatePreviewCredential(): Promise<PreviewCredential> {
  const bytes = crypto.getRandomValues(new Uint8Array(PREVIEW_TOKEN_BYTES));
  const token = Buffer.from(bytes).toString("base64url");
  return {
    token,
    tokenHash: await hashPreviewToken(token),
    expiresAt: new Date(Date.now() + PREVIEW_TOKEN_LIFETIME_MS),
  };
}

export async function hashPreviewToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Buffer.from(digest).toString("hex");
}
