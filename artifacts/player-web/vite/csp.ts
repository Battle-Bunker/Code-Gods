/**
 * Content Security Policies of the hosted player client (build time; there is no CSP in dev):
 *
 *   /player/                    pageCsp: connect-src only this origin and the Convex deployment (https + wss);
 *                               'unsafe-eval' because the utility evaluator compiles kid cards with new Function.
 *   /player/panel-frame.html    frameCsp: a stored panel's sandboxed frame; no network at all (connect-src 'none',
 *                               images and fonts only from data:/blob:), scripts and styles only from the deployment.
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

/** `origin`: where panel-runtime.js and panel-frame.css are served from (the frame's own origin is opaque). */
export function frameCsp(origin: string): string {
  return [
    "default-src 'none'",
    `script-src ${origin} 'unsafe-eval'`,
    `style-src ${origin} 'unsafe-inline'`,
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
  ].join("; ");
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The frame document. Relative URLs resolve against /player/panel-frame.html (or /panel-frame.html in dev). */
export function frameHtml(origin: string): string {
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

/** Insert the page CSP as the first element of <head> (before any script or stylesheet). */
export function injectPageCsp(html: string, env: Env): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escape(pageCsp(env))}" />`;
  return html.replace(/<head>/i, `<head>\n    ${meta}`);
}
