/** The build id's meta tag in a hosted build's index.html (stamped by the engine's scripts/deploy-static.mjs, read by ./update). */
export const BUILD_META = "code-gods-build";

/** The build id in an index.html's text, or null (a dev server, or a build from before build ids). */
export function readBuildMeta(html: string): string | null {
  return new RegExp(`<meta name="${BUILD_META}" content="([^"]+)"`).exec(html)?.[1] ?? null;
}
