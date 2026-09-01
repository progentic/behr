import {
  type SiteSettingsResponse,
  type SiteSummary,
  type UpdateSiteSettingsRequest,
  siteSettingsResponseSchema,
  updateSiteSettingsRequestSchema,
} from "@bher/contracts";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { requestApi } from "./lib/api";

type SiteSettingsProperties = Readonly<{
  tenantId: string;
  siteId: string;
  onUpdated: (site: SiteSummary) => void;
}>;

type SaveStatus = "idle" | "saving" | "saved" | "invalid" | "error";

type SiteSettingsState =
  | Readonly<{ status: "loading"; tenantId: string; siteId: string }>
  | Readonly<{ status: "error"; tenantId: string; siteId: string }>
  | Readonly<{
      status: "loaded";
      tenantId: string;
      siteId: string;
      site: SiteSummary;
      name: string;
      colorScheme: string;
      fontFamily: string;
      saveStatus: SaveStatus;
    }>;

export function SiteSettings({
  tenantId,
  siteId,
  onUpdated,
}: SiteSettingsProperties) {
  const [state, setState] = useState<SiteSettingsState>({
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
    void requestSiteSettings(requestedTenantId, requestedSiteId)
      .then((settings) => {
        if (active) {
          setState(createLoadedState(requestedTenantId, requestedSiteId, settings));
        }
      })
      .catch(() => {
        if (active) {
          setState({
            status: "error",
            tenantId: requestedTenantId,
            siteId: requestedSiteId,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [tenantId, siteId]);

  async function submitSettings(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (
      state.status !== "loaded" ||
      !matchesSettingsIdentity(state, tenantId, siteId) ||
      state.saveStatus === "saving"
    ) {
      return;
    }
    const request = createSiteSettingsUpdateRequest(
      state.name,
      state.colorScheme,
      state.fontFamily,
    );
    if (!request) {
      setState({ ...state, saveStatus: "invalid" });
      return;
    }
    const initiatingTenantId = tenantId;
    const initiatingSiteId = siteId;
    setState({ ...state, saveStatus: "saving" });
    try {
      const settings = await requestSiteSettingsUpdate(
        initiatingTenantId,
        initiatingSiteId,
        request,
      );
      setState((current) =>
        matchesLoadedSettingsIdentity(
          current,
          initiatingTenantId,
          initiatingSiteId,
        )
          ? createLoadedState(
              initiatingTenantId,
              initiatingSiteId,
              settings,
              "saved",
            )
          : current,
      );
      onUpdated(settings.site);
    } catch {
      setState((current) =>
        matchesLoadedSettingsIdentity(
          current,
          initiatingTenantId,
          initiatingSiteId,
        )
          ? { ...current, saveStatus: "error" }
          : current,
      );
    }
  }

  if (!matchesSettingsIdentity(state, tenantId, siteId)) {
    return <p role="status">Loading site settings…</p>;
  }
  if (state.status === "loading") {
    return <p role="status">Loading site settings…</p>;
  }
  if (state.status === "error") {
    return <p role="alert">Site settings could not be loaded.</p>;
  }

  const saving = state.saveStatus === "saving";
  return (
    <section aria-labelledby="site-settings-title">
      <h2 id="site-settings-title">Site settings</h2>
      <form onSubmit={(event) => void submitSettings(event)}>
        <label htmlFor="site-settings-name">Site name</label>
        <input
          id="site-settings-name"
          name="name"
          maxLength={200}
          required
          disabled={saving}
          value={state.name}
          onChange={(event) =>
            setState({
              ...state,
              name: event.currentTarget.value,
              saveStatus: "idle",
            })
          }
        />
        <dl>
          <dt>Hostname</dt>
          <dd>{state.site.hostname}</dd>
        </dl>
        <label htmlFor="site-settings-color-scheme">Color scheme</label>
        <select
          id="site-settings-color-scheme"
          name="colorScheme"
          disabled={saving}
          value={state.colorScheme}
          onChange={(event) =>
            setState({
              ...state,
              colorScheme: event.currentTarget.value,
              saveStatus: "idle",
            })
          }
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <label htmlFor="site-settings-font-family">Font family</label>
        <select
          id="site-settings-font-family"
          name="fontFamily"
          disabled={saving}
          value={state.fontFamily}
          onChange={(event) =>
            setState({
              ...state,
              fontFamily: event.currentTarget.value,
              saveStatus: "idle",
            })
          }
        >
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
        </select>
        {state.saveStatus === "invalid" ? (
          <p role="alert">Site settings are invalid.</p>
        ) : null}
        {state.saveStatus === "error" ? (
          <p role="alert">Site settings could not be saved.</p>
        ) : null}
        {state.saveStatus === "saving" ? (
          <p role="status">Saving site settings…</p>
        ) : null}
        {state.saveStatus === "saved" ? (
          <p role="status">Site settings saved.</p>
        ) : null}
        <button type="submit" disabled={saving}>
          Save settings
        </button>
      </form>
    </section>
  );
}

export async function requestSiteSettings(
  tenantId: string,
  siteId: string,
): Promise<SiteSettingsResponse> {
  const response = await requestApi(readSiteSettingsPath(tenantId, siteId));
  if (!response.ok) {
    throw new Error("Site settings loading failed.");
  }
  return siteSettingsResponseSchema.parse(await response.json());
}

export function createSiteSettingsUpdateRequest(
  name: string,
  colorScheme: string,
  fontFamily: string,
): UpdateSiteSettingsRequest | null {
  const request = updateSiteSettingsRequestSchema.safeParse({
    name,
    theme: { colorScheme, fontFamily },
  });
  return request.success ? request.data : null;
}

export async function requestSiteSettingsUpdate(
  tenantId: string,
  siteId: string,
  request: UpdateSiteSettingsRequest,
): Promise<SiteSettingsResponse> {
  const response = await requestApi(readSiteSettingsPath(tenantId, siteId), {
    method: "PUT",
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error("Site settings update failed.");
  }
  return siteSettingsResponseSchema.parse(await response.json());
}

function createLoadedState(
  tenantId: string,
  siteId: string,
  settings: SiteSettingsResponse,
  saveStatus: SaveStatus = "idle",
): SiteSettingsState {
  return {
    status: "loaded",
    tenantId,
    siteId,
    site: settings.site,
    name: settings.site.name,
    colorScheme: settings.theme.colorScheme,
    fontFamily: settings.theme.fontFamily,
    saveStatus,
  };
}

function matchesLoadedSettingsIdentity(
  state: SiteSettingsState,
  tenantId: string,
  siteId: string,
): state is Extract<SiteSettingsState, { status: "loaded" }> {
  return state.status === "loaded" && matchesSettingsIdentity(state, tenantId, siteId);
}

function matchesSettingsIdentity(
  state: SiteSettingsState,
  tenantId: string,
  siteId: string,
): boolean {
  return state.tenantId === tenantId && state.siteId === siteId;
}

function readSiteSettingsPath(tenantId: string, siteId: string): string {
  return `/tenants/${tenantId}/sites/${siteId}/settings`;
}
