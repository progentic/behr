import { Component, StrictMode, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

type RenderBoundaryState = Readonly<{ failed: boolean }>;

class AdminRenderBoundary extends Component<
  PropsWithChildren,
  RenderBoundaryState
> {
  state: RenderBoundaryState = { failed: false };

  static getDerivedStateFromError(): RenderBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <main>
        <h1>BeHR admin is unavailable.</h1>
        <p>Reload the page to try again.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}

initializeApplication();

function initializeApplication(): void {
  const container = requireApplicationContainer();
  renderApplication(container);
}

function requireApplicationContainer(): HTMLElement {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("BeHR admin root element is missing.");
  }
  return container;
}

function renderApplication(container: HTMLElement): void {
  createRoot(container).render(
    <StrictMode>
      <AdminRenderBoundary>
        <App />
      </AdminRenderBoundary>
    </StrictMode>,
  );
}
