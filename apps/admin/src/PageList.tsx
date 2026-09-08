import {
  type PageSummary,
  pageListResponseSchema,
} from "@bher/contracts";
import { useEffect, useState } from "react";

import { PageCreateForm } from "./PageCreateForm";
import { PageEditor } from "./PageEditor";
import { requestApi } from "./lib/api";

export type PageListState =
  | Readonly<{ status: "loading"; tenantId: string; siteId: string }>
  | Readonly<{
      status: "loaded";
      tenantId: string;
      siteId: string;
      pages: PageSummary[];
      selectedPageId: string | null;
    }>
  | Readonly<{ status: "error"; tenantId: string; siteId: string }>;

type PageListProperties = Readonly<{
  tenantId: string;
  siteId: string;
}>;

export function PageList({ tenantId, siteId }: PageListProperties) {
  const [state, setState] = useState<PageListState>({
    status: "loading",
    tenantId,
    siteId,
  });

  useEffect(() => {
    const requestedTenantId = tenantId;
    const requestedSiteId = siteId;
    let active = true;
    setState({
      status: "loading",
      tenantId: requestedTenantId,
      siteId: requestedSiteId,
    });
    void requestPageList(requestedTenantId, requestedSiteId)
      .then((pages) => {
        if (active) {
          setState((current) =>
            applyPageListResult(
              current,
              requestedTenantId,
              requestedSiteId,
              pages,
            ),
          );
        }
      })
      .catch(() => {
        if (active) {
          setState((current) =>
            applyPageListError(current, requestedTenantId, requestedSiteId),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [tenantId, siteId]);

  if (!matchesPageListIdentity(state, tenantId, siteId)) {
    return <p role="status">Loading pages…</p>;
  }
  if (state.status === "loading") {
    return <p role="status">Loading pages…</p>;
  }
  if (state.status === "error") {
    return <p role="alert">Pages could not be loaded.</p>;
  }

  return (
    <section className="pages-surface" aria-labelledby="pages-title">
      <h2 id="pages-title">Pages</h2>
      {state.pages.length === 0 ? (
        <p>No pages yet.</p>
      ) : (
        <ul>
          {state.pages.map((page) => (
            <li key={page.id}>
              <button
                type="button"
                aria-pressed={state.selectedPageId === page.id}
                onClick={() => setState((current) => selectPage(current, page.id))}
              >
                {page.title} — /{page.slug}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PageCreateForm
        tenantId={tenantId}
        siteId={siteId}
        onCreated={(page) =>
          setState((current) =>
            applyCreatedPage(current, tenantId, siteId, page),
          )
        }
      />
      {state.selectedPageId ? (
        <PageEditor
          key={`${tenantId}:${siteId}:${state.selectedPageId}`}
          tenantId={tenantId}
          siteId={siteId}
          pageId={state.selectedPageId}
        />
      ) : null}
    </section>
  );
}

export function applyPageListResult(
  state: PageListState,
  tenantId: string,
  siteId: string,
  pages: PageSummary[],
): PageListState {
  if (!matchesPageListIdentity(state, tenantId, siteId)) {
    return state;
  }
  return {
    status: "loaded",
    tenantId,
    siteId,
    pages,
    selectedPageId: null,
  };
}

export function applyCreatedPage(
  state: PageListState,
  tenantId: string,
  siteId: string,
  page: PageSummary,
): PageListState {
  if (
    state.status !== "loaded" ||
    !matchesPageListIdentity(state, tenantId, siteId)
  ) {
    return state;
  }
  return {
    ...state,
    pages: [...state.pages, page],
    selectedPageId: page.id,
  };
}

export function selectPage(
  state: PageListState,
  pageId: string,
): PageListState {
  if (state.status !== "loaded" || !state.pages.some(({ id }) => id === pageId)) {
    return state;
  }
  return { ...state, selectedPageId: pageId };
}

function applyPageListError(
  state: PageListState,
  tenantId: string,
  siteId: string,
): PageListState {
  return matchesPageListIdentity(state, tenantId, siteId)
    ? { status: "error", tenantId, siteId }
    : state;
}

function matchesPageListIdentity(
  state: PageListState,
  tenantId: string,
  siteId: string,
): boolean {
  return state.tenantId === tenantId && state.siteId === siteId;
}

export async function requestPageList(
  tenantId: string,
  siteId: string,
): Promise<PageSummary[]> {
  const response = await requestApi(`/tenants/${tenantId}/sites/${siteId}/pages`);
  if (!response.ok) {
    throw new Error("Page list loading failed.");
  }
  return pageListResponseSchema.parse(await response.json()).pages;
}
