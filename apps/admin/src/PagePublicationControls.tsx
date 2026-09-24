import {
  type PreviewTokenResponse, type PublishResponse, type TenantRole,
  previewTokenResponseSchema, publishResponseSchema,
} from "@bher/contracts";
import { ActionButton, AlertMessage } from "@bher/ui";
import { useState } from "react";
import { requestApi } from "./lib/api";

export function PagePublicationControls({ tenantId, siteId, pageId, hostname, slug, role, dirty }: Readonly<{
  tenantId: string; siteId: string; pageId: string; hostname: string; slug: string;
  role: TenantRole; dirty: boolean;
}>) {
  const [preview, setPreview] = useState<PreviewTokenResponse | null>(null);
  const [publication, setPublication] = useState<PublishResponse | null>(null);
  const [pending, setPending] = useState<"preview" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<"preview" | "publish" | null>(null);

  async function preparePreview(): Promise<void> {
    if (dirty || pending) return;
    setPending("preview"); setError(null); setPreview(null); setLatest(null);
    try {
      setPreview(await requestPagePreview(tenantId, siteId, pageId));
      setLatest("preview");
    } catch {
      setError("The preview could not be prepared.");
    } finally { setPending(null); }
  }

  async function publish(): Promise<void> {
    if (dirty || pending || role !== "owner") return;
    setPending("publish"); setError(null); setPublication(null); setLatest(null);
    try {
      setPublication(await requestPagePublication(tenantId, siteId, pageId));
      setLatest("publish");
    } catch (failure) {
      setError(failure instanceof StalePublicationError
        ? "The page changed before publication completed. Reconcile the draft before retrying."
        : "The page could not be published.");
    } finally { setPending(null); }
  }

  const pageUrl = createSitePageUrl(window.location.origin, hostname, slug);
  const previewUrl = new URL(pageUrl);
  if (preview) previewUrl.hash = `preview=${preview.token}`;
  return (
    <div className="page-publication">
      <div className="editor-actions">
        <ActionButton type="button" variant="secondary" aria-describedby={dirty ? "page-save-status" : undefined} disabled={dirty || pending !== null} onClick={() => void preparePreview()}>
          {pending === "preview" ? "Preparing…" : "Prepare preview"}
        </ActionButton>
        {role === "owner" ? (
          <ActionButton type="button" variant="secondary" aria-describedby={dirty ? "page-save-status" : undefined} disabled={dirty || pending !== null} onClick={() => void publish()}>
            {pending === "publish" ? "Publishing…" : "Publish"}
          </ActionButton>
        ) : null}
      </div>
      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {!dirty && (preview || publication) ? <p className="publication-feedback" role="status">
        {latest === "publish" && publication ? <span className="saved">{publication.status === "published" ? "Published." : "Current draft is already published."}</span> : null}
        {latest === "preview" ? <span>Preview ready.</span> : null}
        {preview ? <a href={previewUrl.href} target="_blank" rel="noopener noreferrer"
          title={`Preview expires at ${new Date(preview.expiresAt).toLocaleTimeString()}`}>Open preview</a> : null}
        {publication ? <a href={pageUrl} target="_blank" rel="noopener noreferrer">View published page</a> : null}
      </p> : null}
    </div>
  );
}

export function createSitePageUrl(origin: string, hostname: string, slug: string): string {
  const url = new URL(origin);
  url.hostname = hostname;
  url.pathname = slug ? `/${slug}` : "/";
  url.search = ""; url.hash = "";
  return url.href;
}

export async function requestPagePreview(tenantId: string, siteId: string, pageId: string): Promise<PreviewTokenResponse> {
  const response = await requestApi(`/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/preview-tokens`, { method: "POST" });
  if (!response.ok) throw new Error("Preview preparation failed.");
  return previewTokenResponseSchema.parse(await response.json());
}

export class StalePublicationError extends Error {}

export async function requestPagePublication(tenantId: string, siteId: string, pageId: string): Promise<PublishResponse> {
  const response = await requestApi(`/tenants/${tenantId}/sites/${siteId}/pages/${pageId}/publish`, { method: "POST" });
  if (response.status === 409) throw new StalePublicationError();
  if (!response.ok) throw new Error("Publication failed.");
  return publishResponseSchema.parse(await response.json());
}
