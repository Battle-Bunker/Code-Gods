import { defineConfig } from "vite";

// Any origin works: a Replit dev URL, localhost, a static host. Set VITE_CODE_GODS_ENGINE_URL (or type the engine URL
// into the page). `allowedHosts: true` lets Replit's, Codespaces' and Gitpod's preview proxies load the dev server.
export default defineConfig({
  server: { port: Number(process.env.PORT || 5173), host: "0.0.0.0", allowedHosts: true },
  preview: { port: Number(process.env.PORT || 5173), host: "0.0.0.0", allowedHosts: true },
});
