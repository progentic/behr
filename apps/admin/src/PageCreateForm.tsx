import {
  type CreatePageRequest,
  type PageSummary,
  createPageRequestSchema,
  pageDraftSchema,
} from "@bher/contracts";
import { createEmptyPageDocument } from "@bher/editor";
import type { FormEvent } from "react";
import { useState } from "react";

import { requestApi } from "./lib/api";

const CONFLICT_STATUS = 409;

type PageCreateFormProperties = Readonly<{
  tenantId: string;
  siteId: string;
  onCreated: (page: PageSummary) => void;
}>;

export function PageCreateForm({
  tenantId,
  siteId,
  onCreated,
}: PageCreateFormProperties) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const request = createPageCreationRequest(title, slug);
    if (!request) {
      setError("Enter a valid page title and slug.");
      return;
    }
    setSubmitting(true);
    try {
      const page = await requestPageCreation(tenantId, siteId, request);
      setTitle("");
      setSlug("");
      onCreated(page);
    } catch (failure) {
      setError(
        failure instanceof PageSlugConflictResponseError
          ? "That slug already exists in this site."
          : "The page could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="create-page-title">
      <h3 id="create-page-title">Create page</h3>
      <form onSubmit={(event) => void submitPage(event)}>
        <label htmlFor="page-title">Title</label>
        <input
          id="page-title"
          maxLength={200}
          required
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <label htmlFor="page-slug">Slug</label>
        <input
          id="page-slug"
          maxLength={200}
          placeholder="about-us"
          value={slug}
          onChange={(event) => setSlug(event.currentTarget.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create page"}
        </button>
      </form>
    </section>
  );
}

export function createPageCreationRequest(
  title: string,
  slug: string,
): CreatePageRequest | null {
  const parsed = createPageRequestSchema.safeParse({
    title,
    slug,
    document: createEmptyPageDocument(),
  });
  return parsed.success ? parsed.data : null;
}

export async function requestPageCreation(
  tenantId: string,
  siteId: string,
  request: CreatePageRequest,
): Promise<PageSummary> {
  const response = await requestApi(
    `/tenants/${tenantId}/sites/${siteId}/pages`,
    { method: "POST", body: JSON.stringify(request) },
  );
  if (response.status === CONFLICT_STATUS) {
    throw new PageSlugConflictResponseError();
  }
  if (!response.ok) {
    throw new Error("Page creation failed.");
  }
  return pageDraftSchema.parse(await response.json()).page;
}

class PageSlugConflictResponseError extends Error {}
