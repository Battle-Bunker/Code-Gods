/** The hosted client's CSPs (vite/csp.ts), derived from the deployment URL that deploy-static passes. */
import test from "node:test";
import assert from "node:assert/strict";
import { devPageCsp, frameCsp, frameHtml, injectCsp, injectPageCsp, pageCsp, siteOrigin } from "../vite/csp.ts";

const directive = (csp: string, name: string) => csp.split(/;\s*/).find(d => d.startsWith(`${name} `));

test("a cloud deployment: connect-src is this origin plus the deployment over https and wss; the frame loads from .convex.site", () => {
  const env = { VITE_CONVEX_URL: "https://happy-otter-123.convex.cloud" };
  const csp = pageCsp(env);
  assert.equal(directive(csp, "connect-src"), "connect-src 'self' https://happy-otter-123.convex.cloud wss://happy-otter-123.convex.cloud");
  assert.equal(directive(csp, "script-src"), "script-src 'self' 'unsafe-eval'");
  assert.equal(directive(csp, "default-src"), "default-src 'none'");
  assert.equal(directive(csp, "frame-src"), "frame-src 'self'");
  assert.equal(siteOrigin(env), "https://happy-otter-123.convex.site");
});

test("a local deployment: ws:// for the client URL, and the site URL from VITE_CONVEX_SITE_URL", () => {
  const env = { VITE_CONVEX_URL: "http://127.0.0.1:4410", VITE_CONVEX_SITE_URL: "http://127.0.0.1:4411/" };
  assert.equal(directive(pageCsp(env), "connect-src"), "connect-src 'self' http://127.0.0.1:4410 ws://127.0.0.1:4410");
  assert.equal(siteOrigin(env), "http://127.0.0.1:4411");
  assert.equal(siteOrigin({ VITE_CONVEX_URL: "http://127.0.0.1:4410" }), undefined, "no guess for a non-cloud URL");
});

test("the frame has no network: connect-src 'none', images and fonts only from data:/blob:", () => {
  const csp = frameCsp("https://x.convex.site");
  assert.equal(directive(csp, "connect-src"), "connect-src 'none'");
  assert.equal(directive(csp, "img-src"), "img-src data: blob:");
  assert.equal(directive(csp, "script-src"), "script-src 'self' https://x.convex.site 'unsafe-eval'");
  assert.equal(directive(csp, "default-src"), "default-src 'none'");
  const html = frameHtml("https://x.convex.site");
  assert.match(html, /<script src="panel-runtime\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/, "a classic script: module scripts would need CORS from an opaque origin");
});

test("the frame also loads from its own URL's origin ('self'), so a custom domain (CODE_GODS_SITE_URL) works", () => {
  // Chromium matches 'self' against the frame document's URL even though its sandboxed origin is opaque.
  const csp = frameCsp("https://x.convex.site");
  assert.equal(directive(csp, "style-src"), "style-src 'self' https://x.convex.site 'unsafe-inline'");
  assert.equal(directive(frameCsp("'self'"), "script-src"), "script-src 'self' 'unsafe-eval'", "no duplicate when only 'self' is known");
});

test("the page CSP is the first thing in <head>", () => {
  const out = injectPageCsp(`<html><head><script src="/x.js"></script></head></html>`, { VITE_CONVEX_URL: "https://a.convex.cloud" });
  assert.ok(out.indexOf("Content-Security-Policy") < out.indexOf("<script"));
});

test("a dev server page also gets frame-src 'self' (a panel frame cannot navigate off-origin) and nothing that would break HMR", () => {
  const csp = devPageCsp();
  assert.equal(directive(csp, "frame-src"), "frame-src 'self'");
  for (const name of ["default-src", "script-src", "connect-src", "style-src"]) assert.equal(directive(csp, name), undefined, `${name} would block Vite's inline preamble or HMR socket`);
  const out = injectCsp(`<html><head><script type="module" src="/@vite/client"></script></head></html>`, csp);
  assert.ok(out.indexOf("frame-src 'self'") > 0 && out.indexOf("Content-Security-Policy") < out.indexOf("<script"));
});
