/**
 * The stored-panel frame: a second build of the SDK with the bridge transport, as one classic IIFE script
 * (panel-runtime.js, plus panel-frame.css) and the frame document panel-frame.html with its own CSP. Written
 * next to the player client's build (dist/public, served at /player/). The dev server builds the same thing in
 * memory (vite.config.ts, framePlugin).
 *
 * A classic script, not a module: the frame's origin is opaque, so a module script would need CORS.
 * No calibration tables are bundled (the engine serves them); the host sends the player's own over the bridge.
 */
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { frameHtml, frameOrigins } from "./vite/csp";

const dir = import.meta.dirname;

export default defineConfig(({ mode }) => ({
  root: dir,
  publicDir: false,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "code-gods-panel-frame-html",
      apply: "build",
      generateBundle() {
        const origins = frameOrigins(process.env);
        if (!origins.length) this.warn("Neither VITE_CONVEX_SITE_URL nor a *.convex.cloud VITE_CONVEX_URL is set: the frame CSP falls back to 'self'.");
        this.emitFile({ type: "asset", fileName: "panel-frame.html", source: frameHtml(origins) });
      },
    },
  ],
  define: { "process.env.NODE_ENV": JSON.stringify(mode === "development" ? "development" : "production") },
  resolve: {
    alias: [
      { find: "@sdk-transport", replacement: path.resolve(dir, "src/frame/transport.ts") },
      { find: "@sdk", replacement: path.resolve(dir, "src/sdk/index.ts") },
      { find: "@", replacement: path.resolve(dir, "src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(dir, "dist/public"),
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(dir, "src/frame/runtime.tsx"),
      formats: ["iife"],
      name: "CodeGodsPanelRuntime",
      fileName: () => "panel-runtime.js",
      cssFileName: "panel-frame",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}));
