import {
  type PublicPageResponse,
  publicPageResponseSchema,
} from "@bher/contracts";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { PageRenderer } from "./renderer";
import { resolvePublicSlug } from "./router";

const PUBLIC_PAGE_ENDPOINT = "/public/page";
const NOT_FOUND_STATUS = 404;

type PublicPageState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "loaded"; page: PublicPageResponse }>;

function App() {
  const slug = resolvePublicSlug(window.location.pathname);
  const [state, setState] = useState<PublicPageState>(
    slug === null ? { status: "not-found" } : { status: "loading" },
  );
  useEffect(() => {
    if (slug === null) {
      return;
    }
    let active = true;
    requestPublicPage(slug)
      .then((page) => {
        if (active) {
          setState(page ? { status: "loaded", page } : { status: "not-found" });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "unavailable" });
        }
      });
    return () => {
      active = false;
    };
  }, [slug]);
  return renderPublicPageState(state);
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
