import {
  type CreatePageRequest,
  type PageSummary,
  createPageRequestSchema,
  pageDraftSchema,
} from "@bher/contracts";
import { createEmptyPageDocument } from "@bher/editor";
import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { requestApi } from "./lib/api";

const CONFLICT_STATUS = 409;
const TITLE_ERROR_ID = "page-title-error";
const SLUG_ERROR_ID = "page-slug-error";

type PageCreationFieldErrors = Readonly<{
  title?: string;
  slug?: string;
}>;

type PageCreationPreparation = Readonly<{
  request: CreatePageRequest | null;
  fieldErrors: PageCreationFieldErrors;
}>;

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
  const [touched, setTouched] = useState({ title: false, slug: false });
  const [fieldErrors, setFieldErrors] = useState<PageCreationFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const slugInput = useRef<HTMLInputElement>(null);

  async function submitPage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setTouched({ title: true, slug: true });
    const preparation = preparePageCreation(title, slug);
    setFieldErrors(preparation.fieldErrors);
    if (!preparation.request) {
      if (preparation.fieldErrors.title) {
        titleInput.current?.focus();
      } else if (preparation.fieldErrors.slug) {
        slugInput.current?.focus();
      }
      return;
    }
    setSubmitting(true);
    try {
      const page = await requestPageCreation(
        tenantId,
        siteId,
        preparation.request,
      );
      setTitle("");
      setSlug("");
      setTouched({ title: false, slug: false });
      setFieldErrors({});
      onCreated(page);
    } catch (failure) {
      if (failure instanceof PageSlugConflictResponseError) {
        setTouched((current) => ({ ...current, slug: true }));
        setFieldErrors((current) => ({
          ...current,
          slug: "That slug already exists in this site.",
        }));
        slugInput.current?.focus();
      } else {
        setFormError("The page could not be created.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function validatePageCreationField(field: "title" | "slug"): void {
    setTouched((current) => ({ ...current, [field]: true }));
    const nextError = preparePageCreation(title, slug).fieldErrors[field];
    setFieldErrors((current) => ({ ...current, [field]: nextError }));
  }

  return (
    <section aria-labelledby="create-page-title">
      <h3 id="create-page-title">Create page</h3>
      <form onSubmit={(event) => void submitPage(event)}>
        <label htmlFor="page-title">Title</label>
        <input
          ref={titleInput}
          id="page-title"
          maxLength={200}
          value={title}
          aria-invalid={fieldErrors.title ? true : undefined}
          aria-describedby={fieldErrors.title ? TITLE_ERROR_ID : undefined}
          onBlur={() => validatePageCreationField("title")}
          onChange={(event) => {
            const nextTitle = event.currentTarget.value;
            setTitle(nextTitle);
            if (touched.title) {
              setFieldErrors((current) => ({
                ...current,
                title: preparePageCreation(nextTitle, slug).fieldErrors.title,
              }));
            }
          }}
        />
        {fieldErrors.title ? (
          <p id={TITLE_ERROR_ID}>{fieldErrors.title}</p>
        ) : null}
        <label htmlFor="page-slug">Slug</label>
        <input
          ref={slugInput}
          id="page-slug"
          maxLength={200}
          placeholder="about-us"
          value={slug}
          aria-invalid={fieldErrors.slug ? true : undefined}
          aria-describedby={fieldErrors.slug ? SLUG_ERROR_ID : undefined}
          onBlur={() => validatePageCreationField("slug")}
          onChange={(event) => {
            const nextSlug = event.currentTarget.value;
            setSlug(nextSlug);
            if (touched.slug) {
              setFieldErrors((current) => ({
                ...current,
                slug: preparePageCreation(title, nextSlug).fieldErrors.slug,
              }));
            }
          }}
        />
        {fieldErrors.slug ? (
          <p id={SLUG_ERROR_ID}>{fieldErrors.slug}</p>
        ) : null}
        {formError ? <p role="alert">{formError}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create page"}
        </button>
      </form>
    </section>
  );
}

export function preparePageCreation(
  title: string,
  slug: string,
): PageCreationPreparation {
  const parsed = createPageRequestSchema.safeParse({
    title,
    slug,
    document: createEmptyPageDocument(),
  });
  if (parsed.success) {
    return { request: parsed.data, fieldErrors: {} };
  }
  const fieldErrors: { title?: string; slug?: string } = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === "title") {
      fieldErrors.title = "Enter a valid page title.";
    }
    if (issue.path[0] === "slug") {
      fieldErrors.slug = "Enter a valid page slug.";
    }
  }
  return { request: null, fieldErrors };
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

export class PageSlugConflictResponseError extends Error {}
