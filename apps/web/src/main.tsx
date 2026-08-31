import {
  type PublicPageResponse,
  PREVIEW_TOKEN_HEADER,
  publicPageResponseSchema,
} from "@bher/contracts";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { PageRenderer } from "./renderer";
import {
  type PreviewFragmentResolution,
  resolvePreviewFragment,
  resolvePublicSlug,
} from "./router";

const PUBLIC_PAGE_ENDPOINT = "/public/page";
const PREVIEW_PAGE_ENDPOINT = "/preview/page";
const NOT_FOUND_STATUS = 404;

type PublicPageState =
  | Readonly<{ status: "loading"; requestId: string }>
  | Readonly<{ status: "not-found"; requestId: string }>
  | Readonly<{ status: "unavailable"; requestId: string }>
  | Readonly<{
      status: "loaded";
      requestId: string;
      page: PublicPageResponse;
    }>;

function App() {
  const slug = resolvePublicSlug(window.location.pathname);
  const [fragment, setFragment] = useState(window.location.hash);
  const preview = resolvePreviewFragment(fragment);
  const previewToken = preview.status === "preview" ? preview.token : null;
  const requestId = createPageRequestId(slug, preview);
  const [state, setState] = useState<PublicPageState>(
    createInitialPageState(requestId, slug, preview),
  );
  useEffect(() => {
    const updateFragment = () => setFragment(window.location.hash);
    window.addEventListener("hashchange", updateFragment);
    return () => window.removeEventListener("hashchange", updateFragment);
  }, []);
  useEffect(() => {
    if (slug === null || preview.status === "invalid") {
      setState({ status: "not-found", requestId });
      return;
    }
    setState({ status: "loading", requestId });
    let active = true;
    requestRenderablePage(slug, previewToken)
      .then((page) => {
        if (active) {
          setState(
            page
              ? { status: "loaded", requestId, page }
              : { status: "not-found", requestId },
          );
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "unavailable", requestId });
        }
      });
    return () => {
      active = false;
    };
  }, [requestId, slug, preview.status, previewToken]);
  const visibleState =
    state.requestId === requestId
      ? state
      : createInitialPageState(requestId, slug, preview);
  return renderPublicPageState(visibleState);
}

function createPageRequestId(
  slug: string | null,
  preview: PreviewFragmentResolution,
): string {
  const token = preview.status === "preview" ? preview.token : "";
  return `${slug ?? "invalid"}:${preview.status}:${token}`;
}

function createInitialPageState(
  requestId: string,
  slug: string | null,
  preview: PreviewFragmentResolution,
): PublicPageState {
  return slug === null || preview.status === "invalid"
    ? { status: "not-found", requestId }
    : { status: "loading", requestId };
}

function requestRenderablePage(
  slug: string,
  previewToken: string | null,
): Promise<PublicPageResponse | null> {
  return previewToken === null
    ? requestPublicPage(slug)
    : requestPreviewPage(slug, previewToken);
}

async function requestPublicPage(
  slug: string,
): Promise<PublicPageResponse | null> {
  const query = new URLSearchParams({ slug });
  const response = await fetch(`${PUBLIC_PAGE_ENDPOINT}?${query}`, {
    credentials: "omit",
  });
  if (response.status === NOT_FOUND_STATUS) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Public page request failed.");
  }
  return publicPageResponseSchema.parse(await response.json());
}

async function requestPreviewPage(
  slug: string,
  token: string,
): Promise<PublicPageResponse | null> {
  const query = new URLSearchParams({ slug });
  const response = await fetch(`${PREVIEW_PAGE_ENDPOINT}?${query}`, {
    credentials: "omit",
    headers: { [PREVIEW_TOKEN_HEADER]: token },
  });
  if (response.status === NOT_FOUND_STATUS) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Preview page request failed.");
  }
  return publicPageResponseSchema.parse(await response.json());
}

function renderPublicPageState(state: PublicPageState) {
  switch (state.status) {
    case "loading":
      return <main>Loading page…</main>;
    case "not-found":
      return <main>Page not found.</main>;
    case "unavailable":
      return <main>Page unavailable.</main>;
    case "loaded":
      return (
        <main>
          <PageRenderer document={state.page.document} />
        </main>
      );
  }
}

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(<App />);
}
