/**
 * Vite plugin: writes the build's id into index.html as `<meta name="code-gods-build" content="…">` (src/update.ts).
 *
 * The id is a SHA-256 over every emitted chunk and asset (name and bytes, sorted by name; index.html itself
 * excluded), so a byte-identical build gets the same id: deploy-static's --if-changed still skips unchanged sites.
 * Dev servers get no id, so they never update themselves.
 */
import { createHash } from "node:crypto";
import { BUILD_META } from "./build-meta.ts";

type Output = { type: "chunk"; fileName: string; code: string } | { type: "asset"; fileName: string; source: string | Uint8Array };

/** The id of a bundle (exported for tests). */
export function bundleBuildId(bundle: Record<string, Output>): string {
  const hash = createHash("sha256");
  for (const name of Object.keys(bundle).filter(n => !n.endsWith(".html")).sort()) {
    const out = bundle[name];
    const bytes = out.type === "chunk" ? out.code : out.source;
    hash.update(`${name}\0${typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length}\0`).update(bytes);
  }
  return hash.digest("hex").slice(0, 16);
}

export function buildIdPlugin() {
  return {
    name: "code-gods-build-id",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: { bundle?: Record<string, unknown> }) {
        if (!ctx.bundle) return html;
        const id = bundleBuildId(ctx.bundle as Record<string, Output>);
        return html.replace(/<\/head>/i, `  <meta name="${BUILD_META}" content="${id}">\n  </head>`);
      },
    },
  };
}
