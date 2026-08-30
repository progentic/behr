import {
  type CreateSiteRequest,
  type SiteSummary,
  createSiteRequestSchema,
  siteSummarySchema,
} from "@bher/contracts";
import type { FormEvent } from "react";
import { useState } from "react";

import { requestApi } from "./lib/api";

const CONFLICT_STATUS = 409;

type SiteCreateFormProps = Readonly<{
  onCreated: (site: SiteSummary) => void;
  tenantId: string;
}>;

export function SiteCreateForm({
  onCreated,
  tenantId,
}: SiteCreateFormProps) {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const request = createSiteRequestSchema.safeParse({ name, hostname });
    if (!request.success) {
      setError("Enter a valid site name and hostname.");
      return;
    }
    setSubmitting(true);
    try {
      const site = await createSite(tenantId, request.data);
      setName("");
      setHostname("");
      onCreated(site);
    } catch (failure) {
      setError(
        failure instanceof HostnameConflictError
          ? "That hostname is already assigned."
          : "The site could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="create-site-title">
      <h2 id="create-site-title">Create site</h2>
      <form onSubmit={(event) => void submitSite(event)}>
        <label htmlFor="site-name">Name</label>
        <input
          id="site-name"
          name="name"
          maxLength={200}
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <label htmlFor="site-hostname">Hostname</label>
        <input
          id="site-hostname"
          name="hostname"
          maxLength={253}
          placeholder="www.example.com"
          required
          value={hostname}
          onChange={(event) => setHostname(event.currentTarget.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create site"}
        </button>
      </form>
    </section>
  );
}

class HostnameConflictError extends Error {}

async function createSite(
  tenantId: string,
  request: CreateSiteRequest,
): Promise<SiteSummary> {
  const response = await requestApi(`/tenants/${tenantId}/sites`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  if (response.status === CONFLICT_STATUS) {
    throw new HostnameConflictError();
  }
  if (!response.ok) {
    throw new Error("Site creation failed.");
  }
  return siteSummarySchema.parse(await response.json());
}
