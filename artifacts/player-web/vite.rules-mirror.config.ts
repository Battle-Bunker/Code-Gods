/**
 * The Line Rules Mirror as a standalone static page (src/gallery/rules-mirror/main.tsx): one script and one stylesheet
 * with fixed names and relative URLs, so a republish replaces the same paths. `pnpm --filter @workspace/player-web
 * build:rules-mirror` writes them to RULES_MIRROR_OUT (default dist-rules-mirror) and scripts/rules-mirror-html.mjs adds
 * the content-only rules-mirror.html beside them.
 */
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") }, dedupe: ["react", "react-dom"] },
  root: path.resolve(import.meta.dirname),
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, process.env.RULES_MIRROR_OUT || "dist-rules-mirror"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/gallery/rules-mirror/main.tsx"),
      output: { format: "es", inlineDynamicImports: true, entryFileNames: "rules-mirror.js", assetFileNames: "rules-mirror[extname]" },
    },
  },
});
