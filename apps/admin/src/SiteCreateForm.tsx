import { ActionButton, AlertMessage } from "@bher/ui";
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

type SiteFieldErrors = Readonly<{ name?: string; hostname?: string }>;

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
  const [fieldErrors, setFieldErrors] = useState<SiteFieldErrors>({});

  async function submitSite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const preparation = prepareSiteCreation(name, hostname);
    setFieldErrors(preparation.fieldErrors);
    if (!preparation.request) {
      return;
    }
    setSubmitting(true);
    try {
      const site = await requestSiteCreation(tenantId, preparation.request);
      setName("");
      setHostname("");
      onCreated(site);
    } catch (failure) {
      if (failure instanceof SiteHostnameConflictResponseError) {
        setFieldErrors({ hostname: "That hostname is already assigned." });
      } else {
        setError("The site could not be created.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="create-site-title">
      <h1 id="create-site-title">Create site</h1>
      <form onSubmit={(event) => void submitSite(event)}>
        <label htmlFor="site-name">Name</label>
        <input
          id="site-name"
          autoFocus
          name="name"
          maxLength={200}
          required
          value={name}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? "site-name-error" : undefined}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setFieldErrors((current) => ({ ...current, name: undefined }));
          }}
        />
        {fieldErrors.name ? <p className="field-error" id="site-name-error">{fieldErrors.name}</p> : null}
        <label htmlFor="site-hostname">Hostname</label>
        <input
          id="site-hostname"
          name="hostname"
          maxLength={253}
          placeholder="www.example.com"
          required
          value={hostname}
          aria-invalid={fieldErrors.hostname ? true : undefined}
          aria-describedby={fieldErrors.hostname ? "site-hostname-error" : undefined}
          onChange={(event) => {
            setHostname(event.currentTarget.value);
            setFieldErrors((current) => ({ ...current, hostname: undefined }));
          }}
        />
        {fieldErrors.hostname ? <p className="field-error" id="site-hostname-error">{fieldErrors.hostname}</p> : null}
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <ActionButton variant="primary" type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create site"}
        </ActionButton>
      </form>
    </section>
  );
}

export function prepareSiteCreation(
  name: string,
  hostname: string,
): Readonly<{ request: CreateSiteRequest | null; fieldErrors: SiteFieldErrors }> {
  const parsed = createSiteRequestSchema.safeParse({ name, hostname });
  if (parsed.success) {
    return { request: parsed.data, fieldErrors: {} };
  }
  const fieldErrors: { name?: string; hostname?: string } = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === "name") fieldErrors.name = "Enter a valid site name.";
    if (issue.path[0] === "hostname") fieldErrors.hostname = "Enter a valid hostname.";
  }
  return { request: null, fieldErrors };
}

export class SiteHostnameConflictResponseError extends Error {}

export async function requestSiteCreation(
  tenantId: string,
  request: CreateSiteRequest,
): Promise<SiteSummary> {
  const response = await requestApi(`/tenants/${tenantId}/sites`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  if (response.status === CONFLICT_STATUS) {
    throw new SiteHostnameConflictResponseError();
  }
  if (!response.ok) {
    throw new Error("Site creation failed.");
  }
  return siteSummarySchema.parse(await response.json());
}
