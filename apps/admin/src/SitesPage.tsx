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
import { requestApi } from "./lib/api";

type TenantState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "loaded"; tenants: TenantAccess[] }>;

export type SiteState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; tenantId: string }>
  | Readonly<{ status: "error"; tenantId: string }>
  | Readonly<{ status: "loaded"; tenantId: string; sites: SiteSummary[] }>;

export function SitesPage() {
  const [tenantState, setTenantState] = useState<TenantState>({
    status: "loading",
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteState, setSiteState] = useState<SiteState>({ status: "idle" });

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

  if (tenantState.status === "loading") {
    return <p role="status">Loading tenants…</p>;
  }
  if (tenantState.status === "error") {
    return <p role="alert">Tenants could not be loaded.</p>;
  }
  if (tenantState.tenants.length === 0) {
    return (
      <section>
        <h1>Sites</h1>
        <p>You do not belong to any tenants yet.</p>
      </section>
    );
  }

  const selectedTenant =
    tenantState.tenants.find((tenant) => tenant.id === selectedTenantId) ??
    tenantState.tenants[0];
  if (!selectedTenant) {
    return <p role="alert">The selected tenant is unavailable.</p>;
  }
  const formTenantId = selectedTenant.id;
  const selectedSite =
    siteState.status === "loaded" &&
    siteState.tenantId === selectedTenant.id &&
    selectedSiteId !== null
      ? siteState.sites.find(({ id }) => id === selectedSiteId) ?? null
      : null;

  return (
    <section>
      <h1>Sites</h1>
      {tenantState.tenants.length > 1 ? (
        <>
          <label htmlFor="tenant-selector">Tenant</label>
          <select
            id="tenant-selector"
            value={selectedTenant.id}
            onChange={(event) => {
              const nextTenantId = event.currentTarget.value;
              setSelectedTenantId(nextTenantId);
              setSelectedSiteId(null);
              setSiteState({ status: "loading", tenantId: nextTenantId });
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
        <h2>{selectedTenant.name}</h2>
      )}

      <SiteList
        selectedSiteId={selectedSiteId}
        selectedTenantId={selectedTenant.id}
        state={siteState}
        onSelect={setSelectedSiteId}
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
      {selectedTenant.role === "owner" ? (
        <TenantMembers key={selectedTenant.id} tenantId={selectedTenant.id} />
      ) : null}
      {selectedTenant.role === "owner" && selectedSite ? (
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
      {selectedSite ? (
        <PageList
          key={`${selectedTenant.id}:${selectedSite.id}`}
          tenantId={selectedTenant.id}
          siteId={selectedSite.id}
        />
      ) : null}
    </section>
  );
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
    return <p role="status">Loading sites…</p>;
  }
  if (state.status === "error") {
    return <p role="alert">Sites could not be loaded.</p>;
  }
  if (state.sites.length === 0) {
    return <p>No sites yet.</p>;
  }
  return (
    <ul>
      {state.sites.map((site) => (
        <li key={site.id}>
          <button
            type="button"
            aria-pressed={selectedSiteId === site.id}
            onClick={() => onSelect(site.id)}
          >
            <strong>{site.name}</strong> — {site.hostname}
          </button>
        </li>
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
