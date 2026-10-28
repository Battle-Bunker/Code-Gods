import { createRoot } from "react-dom/client";
import { App } from "./core/app";
import { ErrorBoundary } from "./components/error-boundary";
import "./index.css";

createRoot(document.getElementById("root")!, {
  // Panel errors are shown inside their frames; keep caught errors off reportError().
  onCaughtError: (error, errorInfo) => console.error(error, errorInfo.componentStack),
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
