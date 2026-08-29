import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

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
      <App />
    </StrictMode>,
  );
}
