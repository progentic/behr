import { AlertMessage, SelectableResourceItem, StatusMessage } from "@bher/ui";
import {
  type SiteSummary,
  type TenantAccess,
  siteListResponseSchema,
  tenantListResponseSchema,
} from "@bher/contracts";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { AdminShell } from "./AdminShell";
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

export function SitesPage({ editorDirty, onDirtyChange, account, error }: Readonly<{
  editorDirty: boolean; onDirtyChange: (dirty: boolean) => void;
  account: ReactNode; error: string | null;
}>) {
  const [tenantState, setTenantState] = useState<TenantState>({
    status: "loading",
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteState, setSiteState] = useState<SiteState>({ status: "idle" });
  const [creation, setCreation] = useState<{ kind: "tenant" | "site"; result?: string } | null>(null);
  const activeWorkspace = useRef<HTMLDivElement>(null);
  const creationResult = useRef<HTMLDivElement>(null);
  const hadCreation = useRef(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("pages");

  useEffect(() => {
    if (creation?.result) creationResult.current?.focus();
    else if (!creation && hadCreation.current) activeWorkspace.current?.focus();
    hadCreation.current = creation !== null;
  }, [creation]);

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
      <AdminShell account={account} context="Workspace">
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <StatusMessage>Loading tenants…</StatusMessage>
      </AdminShell>
    );
  }
  if (tenantState.status === "error") {
    return (
      <AdminShell account={account} context="Workspace">
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <AlertMessage>Tenants could not be loaded.</AlertMessage>
      </AdminShell>
    );
  }
  if (tenantState.tenants.length === 0) {
    return (
      <AdminShell account={account} context="Getting started"><section className="task-panel first-tenant">
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <h1>Create your first tenant</h1>
        <p className="field-help">A tenant groups your sites and the people who can work on them.</p>
        <TenantCreateForm onCreated={receiveCreatedTenant} />
      </section></AdminShell>
    );
  }

  const selectedTenant =
    tenantState.tenants.find((tenant) => tenant.id === selectedTenantId) ??
    tenantState.tenants[0];
  if (!selectedTenant) {
    return (
      <AdminShell account={account} context="Workspace">
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <AlertMessage>The selected tenant is unavailable.</AlertMessage>
      </AdminShell>
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
    <AdminShell account={account}
      context={<><span>{selectedTenant.name}</span><strong>{workspaceView === "members" ? "Tenant members" : selectedSite?.name ?? "Sites"}</strong></>}
      sidebar={(close) => (
        <nav className="workspace-navigation" aria-label="Workspace">
          <div className="tenant-context">
            <label htmlFor="tenant-selector">Tenant</label>
            <select id="tenant-selector" value={selectedTenant.id} onChange={(event) => {
              const nextTenantId = event.currentTarget.value;
              if (nextTenantId === selectedTenant.id || !confirmEditorNavigation(editorDirty)) return;
              setSelectedTenantId(nextTenantId);
              setSelectedSiteId(null);
              setSiteState({ status: "loading", tenantId: nextTenantId });
              setWorkspaceView("pages");
              setCreation(null);
              close();
            }}>
              {tenantState.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <span className="field-help">{selectedTenant.role === "owner" ? "Owner" : "Member"}</span>
          </div>
          <div className="site-context">
            <h2>Sites</h2>
            <SiteList selectedSiteId={selectedSiteId} selectedTenantId={selectedTenant.id} state={siteState}
              onSelect={(siteId) => {
                if (siteId !== selectedSiteId && !confirmEditorNavigation(editorDirty)) return;
                setSelectedSiteId(siteId);
                setWorkspaceView("pages");
                setCreation(null);
                close();
              }} />
          </div>
          <nav className="workspace-views" aria-label="Workspace views">
            {selectedSite ? <button type="button" aria-pressed={workspaceView === "pages"}
              onClick={() => { setWorkspaceView("pages"); setCreation(null); close(); }}>Pages</button> : null}
            {selectedTenant.role === "owner" && selectedSite ? <button type="button" aria-pressed={workspaceView === "settings"}
              onClick={() => { if (confirmEditorNavigation(editorDirty)) { setWorkspaceView("settings"); setCreation(null); close(); } }}>Site settings</button> : null}
            {selectedTenant.role === "owner" ? <button type="button" aria-pressed={workspaceView === "members"}
              onClick={() => { if (confirmEditorNavigation(editorDirty)) { setWorkspaceView("members"); setCreation(null); close(); } }}>Tenant members</button> : null}
          </nav>
          <div className="workspace-create-actions">
            <button type="button" onClick={() => { setCreation({ kind: "tenant" }); close(); }}>New tenant</button>
            {selectedTenant.role === "owner" ? <button type="button"
              onClick={() => { setCreation({ kind: "site" }); close(); }}>New site</button> : null}
          </div>
        </nav>
      )}>
      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {creation?.result ? <div ref={creationResult} tabIndex={-1} className="creation-result"><StatusMessage tone="success">{creation.result}</StatusMessage></div> : null}
      {creation && !creation.result ? <section className="task-panel" aria-label={creation.kind === "tenant" ? "New tenant" : "New site"}>
        <button type="button" className="task-close" onClick={() => setCreation(null)}>Cancel</button>
        {creation.kind === "tenant" ? <>
          <h1>New tenant</h1>
          <p className="field-help">A tenant groups your sites and members.</p>
          <TenantCreateForm onCreated={(tenant) => {
            receiveCreatedTenant(tenant);
            setCreation((current) => current === creation ? { ...current, result: `Created tenant “${tenant.name}”.` } : current);
          }} />
        </> : selectedTenant.role === "owner" && siteState.status === "loaded" && siteState.tenantId === formTenantId ? (
          <SiteCreateForm key={formTenantId} tenantId={formTenantId} onCreated={(site) => {
            setSiteState((current) => current.status === "loaded" && current.tenantId === formTenantId
              ? { ...current, sites: [...current.sites, site] } : current);
            setCreation((current) => current === creation ? { ...current, result: `Created site “${site.name}”.` } : current);
          }} />
        ) : <StatusMessage>Loading site context…</StatusMessage>}
      </section> : null}
      <div ref={activeWorkspace} tabIndex={-1} hidden={creation !== null && !creation.result} className="active-workspace">
        {workspaceView !== "pages" ? <div className="workspace-context">
          <span>{workspaceView === "members" ? "Tenant" : "Site"}</span>
          <h1>{workspaceView === "members" ? selectedTenant.name : selectedSite?.name ?? "Sites"}</h1>
          {workspaceView === "settings" && selectedSite ? <p>{selectedSite.hostname}</p> : null}
        </div> : null}
        {selectedTenant.role === "owner" && workspaceView === "members" ? (
          <TenantMembers key={selectedTenant.id} tenantId={selectedTenant.id} />
        ) : null}
        {selectedTenant.role === "owner" && selectedSite && workspaceView === "settings" ? (
          <SiteSettings key={`${selectedTenant.id}:${selectedSite.id}`} tenantId={selectedTenant.id} siteId={selectedSite.id}
            onUpdated={(updatedSite) => setSiteState((current) => applyUpdatedSite(current, selectedTenant.id, updatedSite))} />
        ) : null}
        {selectedSite && workspaceView === "pages" ? (
          <PageList key={`${selectedTenant.id}:${selectedSite.id}`} tenantId={selectedTenant.id} siteId={selectedSite.id}
            hostname={selectedSite.hostname} role={selectedTenant.role} onDirtyChange={onDirtyChange} />
        ) : null}
        {!selectedSite && workspaceView === "pages" ? <section className="task-panel">
          <h1>{noSites ? "Your sites" : "Choose a site"}</h1>
          <p>{noSites ? (selectedTenant.role === "owner" ? "Create a site to start publishing." : "No sites yet.") : "Select a site from the workspace menu."}</p>
          {noSites && selectedTenant.role === "owner" ? <button className="button-primary" type="button"
            onClick={() => setCreation({ kind: "site" })}>New site</button> : null}
        </section> : null}
      </div>
    </AdminShell>
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
