import type { SiteSummary, TenantAccess } from "@bher/contracts";
import { AlertMessage, StatusMessage } from "@bher/ui";
import { useEffect, useState } from "react";

import { requestPageList } from "./PageList";
import { requestSiteAssets } from "./PageEditor";

type SiteContent = Readonly<{ site: SiteSummary; pages: number; images: number; bytes: number }>;
type OverviewState =
  | Readonly<{ status: "loading" | "error"; sites: readonly SiteSummary[] }>
  | Readonly<{ status: "loaded"; sites: readonly SiteSummary[]; content: SiteContent[] }>;

export function DashboardOverview({ tenant, sites, onOpenSite, onNewSite, onMembers }: Readonly<{
  tenant: TenantAccess;
  sites: readonly SiteSummary[];
  onOpenSite: (siteId: string) => void;
  onNewSite: () => void;
  onMembers: () => void;
}>) {
  const [state, setState] = useState<OverviewState>({ status: "loading", sites });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: "loading", sites });
    void loadDashboardSites(tenant.id, sites).then((content) => {
      if (active) setState({ status: "loaded", sites, content });
    }).catch(() => {
      if (active) setState({ status: "error", sites });
    });
    return () => { active = false; };
  }, [tenant.id, sites, attempt]);

  const content = state.status === "loaded" && state.sites === sites ? state.content : null;
  const failed = state.status === "error" && state.sites === sites;
  const totals = content ? getDashboardTotals(content) : null;

  return (
    <section className="dashboard-overview" aria-labelledby="overview-title">
      <div className="overview-heading">
        <div><h1 id="overview-title">Overview</h1><p>{tenant.name}</p></div>
        <span className="field-help">Current tenant · All sites</span>
      </div>
      <dl className="overview-metrics" aria-label="Tenant content totals">
        <div><dt>Sites</dt><dd>{formatCount(sites.length)}</dd><dd className="metric-description">In this workspace</dd></div>
        <div><dt>Pages</dt><dd>{totals ? formatCount(totals.pages) : "—"}</dd><dd className="metric-description">Across all sites</dd></div>
        <div><dt>Images</dt><dd>{totals ? formatCount(totals.images) : "—"}</dd><dd className="metric-description">Uploaded assets</dd></div>
        <div><dt>Image storage</dt><dd>{totals ? formatBytes(totals.bytes) : "—"}</dd><dd className="metric-description">Original image files</dd></div>
      </dl>
      {!content && !failed ? <StatusMessage>Loading content overview…</StatusMessage> : null}
      {failed ? <div className="overview-error"><AlertMessage>Content totals could not be loaded. Your sites are still available below.</AlertMessage>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry overview</button></div> : null}
      <div className="overview-columns">
        <section className="overview-panel" aria-labelledby="overview-sites-title">
          <div className="overview-panel-heading"><h2 id="overview-sites-title">Your sites</h2>
            {tenant.role === "owner" ? <button type="button" onClick={onNewSite}>New site</button> : null}</div>
          {sites.length === 0 ? <div className="overview-empty"><h3>No sites yet</h3><p>{tenant.role === "owner" ? "Create a site to start writing and publishing." : "Sites will appear here when an owner creates them."}</p></div> : (
            <ul className="overview-site-list">
              {sites.map((site) => {
                const summary = content?.find((item) => item.site.id === site.id);
                return <li key={site.id}>
                  <button className="overview-site-link" type="button" onClick={() => onOpenSite(site.id)}><span>{site.name}</span><span>{site.hostname}</span></button>
                  <dl className="overview-site-totals"><div><dt>Pages</dt><dd>{summary ? formatCount(summary.pages) : "—"}</dd></div><div><dt>Images</dt><dd>{summary ? formatCount(summary.images) : "—"}</dd></div></dl>
                </li>;
              })}
            </ul>
          )}
        </section>
        <aside className="overview-panel overview-workspace" aria-labelledby="overview-workspace-title">
          <h2 id="overview-workspace-title">Workspace</h2>
          <dl><div><dt>Tenant</dt><dd>{tenant.name}</dd></div><div><dt>Your role</dt><dd>{tenant.role === "owner" ? "Owner" : "Member"}</dd></div></dl>
          <p>{tenant.role === "owner" ? "Manage sites and people, write content, and publish when it is ready." : "Write content, upload images, and preview saved drafts. An owner handles publication."}</p>
          {tenant.role === "owner" ? <button type="button" onClick={onMembers}>Manage members</button> : null}
          <p className="field-help">Choose a site to open its pages.</p>
        </aside>
      </div>
    </section>
  );
}

export async function loadDashboardSites(tenantId: string, sites: readonly SiteSummary[]): Promise<SiteContent[]> {
  const content: SiteContent[] = [];
  // Bound concurrent work to one site's two existing list requests.
  for (const site of sites) {
    const [pages, assets] = await Promise.all([requestPageList(tenantId, site.id), requestSiteAssets(tenantId, site.id)]);
    content.push({ site, pages: pages.length, images: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0) });
  }
  return content;
}

export function getDashboardTotals(content: readonly SiteContent[]) {
  return content.reduce((total, item) => ({ pages: total.pages + item.pages, images: total.images + item.images, bytes: total.bytes + item.bytes }), { pages: 0, images: 0, bytes: 0 });
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(value);
}
