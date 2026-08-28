import { createRoot } from "react-dom/client";

function App() {
  return <p>The BHeR CMS public renderer is not implemented in Phase A.</p>;
}

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(<App />);
}
