import {
  type SiteSummary,
  type TenantAccess,
  siteListResponseSchema,
  tenantListResponseSchema,
} from "@bher/contracts";
import { useEffect, useState } from "react";

import { SiteCreateForm } from "./SiteCreateForm";
import { requestApi } from "./lib/api";

type TenantState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "loaded"; tenants: TenantAccess[] }>;

type SiteState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "loaded"; sites: SiteSummary[] }>;

export function SitesPage() {
  const [tenantState, setTenantState] = useState<TenantState>({
    status: "loading",
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [siteState, setSiteState] = useState<SiteState>({ status: "idle" });

  useEffect(() => {
    let active = true;
    void loadTenants()
      .then((tenants) => {
        if (active) {
          setTenantState({ status: "loaded", tenants });
          setSelectedTenantId(tenants[0]?.id ?? null);
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
    let active = true;
    setSiteState({ status: "loading" });
    void loadSites(selectedTenantId)
      .then((sites) => {
        if (active) {
          setSiteState({ status: "loaded", sites });
        }
      })
      .catch(() => {
        if (active) {
          setSiteState({ status: "error" });
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

  return (
    <section>
      <h1>Sites</h1>
      {tenantState.tenants.length > 1 ? (
        <>
          <label htmlFor="tenant-selector">Tenant</label>
          <select
            id="tenant-selector"
            value={selectedTenant.id}
            onChange={(event) => setSelectedTenantId(event.currentTarget.value)}
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

      <SiteList state={siteState} />
      {selectedTenant.role === "owner" ? (
        <SiteCreateForm
          key={selectedTenant.id}
          tenantId={selectedTenant.id}
          onCreated={(site) =>
            setSiteState((current) => ({
              status: "loaded",
              sites:
                current.status === "loaded"
                  ? [...current.sites, site]
                  : [site],
            }))
          }
        />
      ) : null}
    </section>
  );
}

function SiteList({ state }: Readonly<{ state: SiteState }>) {
  if (state.status === "idle" || state.status === "loading") {
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
          <strong>{site.name}</strong> — {site.hostname}
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
