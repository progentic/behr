import { AlertMessage, SelectableResourceItem, StatusMessage } from "@bher/ui";
import {
  type SiteSummary,
  type TenantAccess,
  siteListResponseSchema,
  tenantListResponseSchema,
} from "@bher/contracts";
import { useEffect, useState } from "react";

import { PageList } from "./PageList";
import { SiteCreateForm } from "./SiteCreateForm";
import { SiteSettings } from "./SiteSettings";
import { TenantMembers } from "./TenantMembers";
import { TenantCreateForm } from "./TenantCreateForm";
import { requestApi } from "./lib/api";
import { confirmEditorNavigation } from "./lib/unsaved-navigation";

export type TenantState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "loaded"; tenants: TenantAccess[] }>;

export type SiteState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; tenantId: string }>
  | Readonly<{ status: "error"; tenantId: string }>
  | Readonly<{ status: "loaded"; tenantId: string; sites: SiteSummary[] }>;

type WorkspaceView = "pages" | "settings" | "members";

export function SitesPage({ editorDirty, onDirtyChange }: Readonly<{
  editorDirty: boolean; onDirtyChange: (dirty: boolean) => void;
}>) {
  const [tenantState, setTenantState] = useState<TenantState>({
    status: "loading",
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteState, setSiteState] = useState<SiteState>({ status: "idle" });
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("pages");

  useEffect(() => {
    let active = true;
    void loadTenants()
      .then((tenants) => {
        if (active) {
          setTenantState({ status: "loaded", tenants });
          const initialTenantId = tenants[0]?.id ?? null;
          setSelectedTenantId(initialTenantId);
          setSelectedSiteId(null);
          setSiteState(
            initialTenantId
              ? { status: "loading", tenantId: initialTenantId }
              : { status: "idle" },
          );
        }
      })
      .catch(() => {
        if (active) {
          setTenantState({ status: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      setSiteState({ status: "idle" });
      return;
    }
    const requestedTenantId = selectedTenantId;
    let active = true;
    setSiteState({ status: "loading", tenantId: requestedTenantId });
    void loadSites(requestedTenantId)
      .then((sites) => {
        if (active) {
          setSiteState({
            status: "loaded",
            tenantId: requestedTenantId,
            sites,
          });
        }
      })
      .catch(() => {
        if (active) {
          setSiteState({ status: "error", tenantId: requestedTenantId });
        }
      });
    return () => {
      active = false;
    };
  }, [selectedTenantId]);

  function receiveCreatedTenant(tenant: TenantAccess): void {
    setTenantState((current) => applyCreatedTenant(current, tenant));
    setSelectedTenantId((current) => current ?? tenant.id);
  }

  if (tenantState.status === "loading") {
    return (
      <main className="admin-main">
        <StatusMessage>Loading tenants…</StatusMessage>
      </main>
    );
  }
  if (tenantState.status === "error") {
    return (
      <main className="admin-main">
        <AlertMessage>Tenants could not be loaded.</AlertMessage>
      </main>
    );
  }
  if (tenantState.tenants.length === 0) {
    return (
      <main className="admin-main workspace first-tenant">
        <h1>Create your first tenant</h1>
        <TenantCreateForm onCreated={receiveCreatedTenant} />
      </main>
    );
  }

  const selectedTenant =
    tenantState.tenants.find((tenant) => tenant.id === selectedTenantId) ??
    tenantState.tenants[0];
  if (!selectedTenant) {
    return (
      <main className="admin-main">
        <AlertMessage>The selected tenant is unavailable.</AlertMessage>
      </main>
    );
  }
  const formTenantId = selectedTenant.id;
  const noSites = siteState.status === "loaded" &&
    siteState.tenantId === selectedTenant.id && siteState.sites.length === 0;
  const selectedSite =
    siteState.status === "loaded" &&
    siteState.tenantId === selectedTenant.id &&
    selectedSiteId !== null
      ? siteState.sites.find(({ id }) => id === selectedSiteId) ?? null
      : null;

  return (
    <div className="workspace-shell">
      <nav className="workspace-navigation" aria-label="Workspace">
        <div className="tenant-context">
          {tenantState.tenants.length > 1 ? (
            <>
              <label htmlFor="tenant-selector">Tenant</label>
              <select
                id="tenant-selector"
                value={selectedTenant.id}
                onChange={(event) => {
                  const nextTenantId = event.currentTarget.value;
                  if (nextTenantId === selectedTenant.id || !confirmEditorNavigation(editorDirty)) return;
                  setSelectedTenantId(nextTenantId);
                  setSelectedSiteId(null);
                  setSiteState({ status: "loading", tenantId: nextTenantId });
                  setWorkspaceView("pages");
                }}
              >
                {tenantState.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span>Tenant</span>
              <strong>{selectedTenant.name}</strong>
            </>
          )}
          <details className="tenant-create-disclosure">
            <summary>New tenant</summary>
            <TenantCreateForm onCreated={receiveCreatedTenant} />
          </details>
        </div>
        <h2>Sites</h2>
        <SiteList
          selectedSiteId={selectedSiteId}
          selectedTenantId={selectedTenant.id}
          state={siteState}
          onSelect={(siteId) => {
            if (siteId !== selectedSiteId && !confirmEditorNavigation(editorDirty)) return;
            setSelectedSiteId(siteId);
            setWorkspaceView("pages");
          }}
        />
        {selectedTenant.role === "owner" &&
        siteState.status === "loaded" &&
        siteState.tenantId === selectedTenant.id ? (
          <SiteCreateForm
            key={selectedTenant.id}
            tenantId={formTenantId}
            onCreated={(site) =>
              setSiteState((current) => {
                if (
                  current.status !== "loaded" ||
                  current.tenantId !== formTenantId
                ) {
                  return current;
                }
                return {
                  status: "loaded",
                  tenantId: formTenantId,
                  sites: [...current.sites, site],
                };
              })
            }
          />
        ) : null}
      </nav>
      <main className="workspace workspace-content">
        <div className="workspace-context">
          <span>{workspaceView === "members" ? "Tenant" : "Site"}</span>
          <h1>
            {workspaceView === "members" ? selectedTenant.name : selectedSite?.name ?? "Sites"}
          </h1>
          {workspaceView !== "members" && selectedSite ? (
            <p>{selectedSite.hostname}</p>
          ) : null}
        </div>
        <nav className="workspace-views" aria-label="Workspace views">
          {selectedSite ? (
            <button
              type="button"
              aria-pressed={workspaceView === "pages"}
              onClick={() => setWorkspaceView("pages")}
            >
              Pages
            </button>
          ) : null}
          {selectedTenant.role === "owner" && selectedSite ? (
            <button
              type="button"
              aria-pressed={workspaceView === "settings"}
              onClick={() => { if (confirmEditorNavigation(editorDirty)) setWorkspaceView("settings"); }}
            >
              Site settings
            </button>
          ) : null}
          {selectedTenant.role === "owner" ? (
            <button
              type="button"
              aria-pressed={workspaceView === "members"}
              onClick={() => { if (confirmEditorNavigation(editorDirty)) setWorkspaceView("members"); }}
            >
              Tenant members
            </button>
          ) : null}
        </nav>
        {selectedTenant.role === "owner" && workspaceView === "members" ? (
          <TenantMembers key={selectedTenant.id} tenantId={selectedTenant.id} />
        ) : null}
        {selectedTenant.role === "owner" && selectedSite && workspaceView === "settings" ? (
          <SiteSettings
            key={`${selectedTenant.id}:${selectedSite.id}`}
            tenantId={selectedTenant.id}
            siteId={selectedSite.id}
            onUpdated={(updatedSite) =>
              setSiteState((current) =>
                applyUpdatedSite(current, selectedTenant.id, updatedSite),
              )
            }
          />
        ) : null}
        {selectedSite && workspaceView === "pages" ? (
          <PageList
            key={`${selectedTenant.id}:${selectedSite.id}`}
            tenantId={selectedTenant.id}
            siteId={selectedSite.id}
            hostname={selectedSite.hostname}
            role={selectedTenant.role}
            onDirtyChange={onDirtyChange}
          />
        ) : null}
        {!selectedSite && workspaceView === "pages" ? (
          <p>{noSites ? (selectedTenant.role === "owner" ? "Create a site." : "No sites yet.") : "Choose a site."}</p>
        ) : null}
      </main>
    </div>
  );
}

export function applyCreatedTenant(state: TenantState, tenant: TenantAccess): TenantState {
  if (state.status !== "loaded" || state.tenants.some(({ id }) => id === tenant.id)) {
    return state;
  }
  return { ...state, tenants: [...state.tenants, tenant] };
}

export function applyUpdatedSite(
  state: SiteState,
  tenantId: string,
  updatedSite: SiteSummary,
): SiteState {
  if (
    state.status !== "loaded" ||
    state.tenantId !== tenantId ||
    !state.sites.some(({ id }) => id === updatedSite.id)
  ) {
    return state;
  }
  return {
    ...state,
    sites: state.sites.map((site) =>
      site.id === updatedSite.id ? updatedSite : site,
    ),
  };
}

function SiteList({
  onSelect,
  selectedSiteId,
  selectedTenantId,
  state,
}: Readonly<{
  onSelect: (siteId: string) => void;
  selectedSiteId: string | null;
  selectedTenantId: string;
  state: SiteState;
}>) {
  if (
    state.status === "idle" ||
    state.status === "loading" ||
    state.tenantId !== selectedTenantId
  ) {
    return <StatusMessage>Loading sites…</StatusMessage>;
  }
  if (state.status === "error") {
    return <AlertMessage>Sites could not be loaded.</AlertMessage>;
  }
  if (state.sites.length === 0) {
    return <p>No sites yet.</p>;
  }
  return (
    <ul>
      {state.sites.map((site) => (
        <SelectableResourceItem
          key={site.id}
          selected={selectedSiteId === site.id}
          onSelect={() => onSelect(site.id)}
        >
          <strong>{site.name}</strong>
          <span>{site.hostname}</span>
        </SelectableResourceItem>
      ))}
    </ul>
  );
}

async function loadTenants(): Promise<TenantAccess[]> {
  const response = await requestApi("/tenants");
  if (!response.ok) {
    throw new Error("Tenant loading failed.");
  }
  return tenantListResponseSchema.parse(await response.json()).tenants;
}

async function loadSites(tenantId: string): Promise<SiteSummary[]> {
  const response = await requestApi(`/tenants/${tenantId}/sites`);
  if (!response.ok) {
    throw new Error("Site loading failed.");
  }
  return siteListResponseSchema.parse(await response.json()).sites;
}
