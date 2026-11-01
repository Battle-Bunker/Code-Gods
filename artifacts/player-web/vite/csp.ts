/**
 * Content Security Policies of the player client:
 *
 *   /client/ (a build)          pageCsp: connect-src only this origin and the Convex deployment (https + wss);
 *                               'unsafe-eval' because the utility evaluator compiles kid cards with new Function;
 *                               frame-src 'self', so a panel's frame cannot navigate itself to another origin.
 *   the dev server's page       devPageCsp: only frame-src 'self' (and object-src 'none'), so HMR keeps working.
 *   panel-frame.html            frameCsp: a stored panel's sandboxed frame. No fetch, XHR or WebSocket (connect-src
 *                               'none'), images and fonts only from data:/blob:, scripts and styles only from the
 *                               frame URL's origin and the deployment. A frame's own CSP cannot stop it navigating
 *                               itself (a URL can carry data out); the embedding page's frame-src does.
 *
 * The deployment comes from VITE_CONVEX_URL (scripts/deploy-static.mjs sets it, and VITE_CONVEX_SITE_URL).
 */
type Env = Record<string, string | undefined>;

/** https://<dep>.convex.cloud → https://<dep>.convex.site; otherwise VITE_CONVEX_SITE_URL decides. */
export function siteOrigin(env: Env): string | undefined {
  if (env.VITE_CONVEX_SITE_URL) return new URL(env.VITE_CONVEX_SITE_URL).origin;
  if (!env.VITE_CONVEX_URL) return undefined;
  const cloud = new URL(env.VITE_CONVEX_URL);
  return cloud.hostname.endsWith(".convex.cloud") ? `${cloud.protocol}//${cloud.hostname.replace(/\.convex\.cloud$/, ".convex.site")}` : undefined;
}

/**
 * Where a hosted frame's runtime may load from besides 'self': the deployment's site origin and, when the client
 * is served from a custom domain, CODE_GODS_SITE_URL's origin (set it in the build environment), so the frame
 * works even in a browser that does not match 'self' in an opaque, sandboxed document.
 */
export function frameOrigins(env: Env): string[] {
  const origins = [siteOrigin(env), env.CODE_GODS_SITE_URL ? new URL(env.CODE_GODS_SITE_URL).origin : undefined];
  return [...new Set(origins.filter((o): o is string => !!o))];
}

/** The Convex client URL as connect-src sources: its origin and the WebSocket twin. */
export function convexSources(env: Env): string[] {
  if (!env.VITE_CONVEX_URL) return ["https://*.convex.cloud", "wss://*.convex.cloud"];
  const url = new URL(env.VITE_CONVEX_URL);
  return [url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`];
}

export function pageCsp(env: Env): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-eval'",
    // The display fonts come from Google Fonts (index.html).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${convexSources(env).join(" ")}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * `origin`: the deployment's site origin, where panel-runtime.js and panel-frame.css are served from. The frame's own
 * origin is opaque (sandboxed), but Chromium matches 'self' against its document URL, so 'self' also admits the
 * runtime when the client is served from a custom domain (CODE_GODS_SITE_URL) instead of the deployment's .convex.site.
 */
export function frameCsp(origin: string | readonly string[]): string {
  const sources = [...new Set(["'self'", ...[origin].flat()])].join(" ");
  return [
    "default-src 'none'",
    `script-src ${sources} 'unsafe-eval'`,
    `style-src ${sources} 'unsafe-inline'`,
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
  ].join("; ");
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The frame document. Relative URLs resolve against /client/panel-frame.html (or /panel-frame.html in dev). */
export function frameHtml(origin: string | readonly string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escape(frameCsp(origin))}">
<meta name="referrer" content="no-referrer">
<link rel="stylesheet" href="panel-frame.css">
<style>html,body{margin:0;background:transparent}body::before{display:none}</style>
</head>
<body>
<div id="root"></div>
<script src="panel-runtime.js"></script>
</body>
</html>
`;
}

/**
 * The dev server's page CSP: only what keeps stored-panel frames contained. `frame-src 'self'` governs every
 * navigation of a child frame, so a panel cannot navigate its own frame to another origin (and carry data out in
 * the URL). Nothing else is restricted: Vite's inline preamble, its HMR socket and the token endpoint keep working.
 */
export function devPageCsp(): string {
  return ["frame-src 'self'", "object-src 'none'"].join("; ");
}

/** Insert a CSP meta tag as the first element of <head> (before any script or stylesheet). */
export function injectCsp(html: string, policy: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escape(policy)}" />`;
  return html.replace(/<head>/i, `<head>\n    ${meta}`);
}
export const injectPageCsp = (html: string, env: Env): string => injectCsp(html, pageCsp(env));
