import { AlertMessage, SelectableResourceItem, StatusMessage } from "@bher/ui";
import {
  type PageSummary,
  type TenantRole,
  pageListResponseSchema,
} from "@bher/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageCreateForm } from "./PageCreateForm";
import { PageEditor } from "./PageEditor";
import { requestApi } from "./lib/api";
import { confirmEditorNavigation } from "./lib/unsaved-navigation";

export type PageListState =
  | Readonly<{ status: "loading"; tenantId: string; siteId: string }>
  | Readonly<{
      status: "loaded";
      tenantId: string;
      siteId: string;
      pages: PageSummary[];
      selectedPageId: string | null;
      editorDirty: boolean;
    }>
  | Readonly<{ status: "error"; tenantId: string; siteId: string }>;

type PageListProperties = Readonly<{
  tenantId: string;
  siteId: string;
  hostname: string;
  role: TenantRole;
  onDirtyChange: (dirty: boolean) => void;
}>;

export function PageList({ tenantId, siteId, hostname, role, onDirtyChange }: PageListProperties) {
  const management = useRef<HTMLDetailsElement>(null);
  const newPageAction = useRef<HTMLButtonElement>(null);
  const [creation, setCreation] = useState<{ result?: string } | null>(null);
  useEffect(() => {
    if (creation?.result) newPageAction.current?.focus();
  }, [creation]);
  const [state, setState] = useState<PageListState>({
    status: "loading",
    tenantId,
    siteId,
  });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 75rem)");
    const update = () => { if (management.current) management.current.open = media.matches; };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [state.status]);
  const reportDirty = useCallback((dirty: boolean) => {
    setState((current) => current.status === "loaded" &&
      matchesPageListIdentity(current, tenantId, siteId) && current.editorDirty !== dirty
      ? { ...current, editorDirty: dirty } : current);
    onDirtyChange(dirty);
  }, [tenantId, siteId, onDirtyChange]);

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
    return <StatusMessage>Loading pages…</StatusMessage>;
  }
  if (state.status === "loading") {
    return <StatusMessage>Loading pages…</StatusMessage>;
  }
  if (state.status === "error") {
    return <AlertMessage>Pages could not be loaded.</AlertMessage>;
  }

  return (
    <section className="pages-surface" aria-labelledby="pages-title">
      <div className="pages-heading"><div><h1 id="pages-title">Pages</h1>
        {creation?.result ? <StatusMessage tone="success">{creation.result}</StatusMessage> : null}</div>
        <button ref={newPageAction} type="button" onClick={() => setCreation({})}>New page</button>
      </div>
      {creation && !creation.result ? <div className="task-panel page-creation">
        <button type="button" className="task-close" onClick={() => { setCreation(null); newPageAction.current?.focus(); }}>Cancel</button>
        <PageCreateForm tenantId={tenantId} siteId={siteId} onCreated={(page) => {
          setState((current) => applyCreatedPage(current, tenantId, siteId, page));
          setCreation((current) => current === creation ? { result: `Created page “${page.title}”.` } : current);
        }} />
      </div> : null}
      <details ref={management} className="page-management">
      <summary>Choose page</summary>
      {state.pages.length === 0 ? (
        <p>No pages yet.</p>
      ) : (
        <ul>
          {state.pages.map((page) => (
            <SelectableResourceItem
              key={page.id}
              selected={state.selectedPageId === page.id}
              onSelect={() => {
                if (state.selectedPageId === page.id || !confirmEditorNavigation(state.editorDirty)) return;
                setState((current) => selectPage(current, page.id));
                setCreation((current) => current?.result ? null : current);
                if (!window.matchMedia("(min-width: 75rem)").matches && management.current) management.current.open = false;
              }}
            >
              <strong>{page.title}</strong>
              <span>/{page.slug}</span>
            </SelectableResourceItem>
          ))}
        </ul>
      )}
      </details>
      <div className="page-editor-slot" hidden={creation !== null && !creation.result}>
      {state.selectedPageId ? (
        <PageEditor
          key={`${tenantId}:${siteId}:${state.selectedPageId}`}
          tenantId={tenantId}
          siteId={siteId}
          pageId={state.selectedPageId}
          hostname={hostname}
          role={role}
          onDirtyChange={reportDirty}
        />
      ) : null}
      {!state.selectedPageId ? <p className="empty-workspace">Choose a page to edit, or create a new page.</p> : null}
      </div>
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
    editorDirty: false,
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
    selectedPageId: state.editorDirty ? state.selectedPageId : page.id,
  };
}

export function selectPage(
  state: PageListState,
  pageId: string,
): PageListState {
  if (state.status !== "loaded" || !state.pages.some(({ id }) => id === pageId)) {
    return state;
  }
  return { ...state, selectedPageId: pageId, editorDirty: false };
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
