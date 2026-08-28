import { createRoot } from "react-dom/client";

function App() {
  return <p>The BeHR CMS admin experience is not implemented in Phase A.</p>;
}

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(<App />);
}
