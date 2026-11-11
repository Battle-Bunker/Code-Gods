/**
 * The pages of the preview-only sign-in (auth/preview.ts; docs/preview-deployments.md). Every route answers a JSON 404
 * unless the deployment has a preview passphrase (identity.ts previewSignInCode), which only a preview deployment has.
 *
 *   GET  /api/preview-auth/start?returnTo=/path   begins a Better Auth sign-in with provider "preview" (the app's
 *                                                 "Sign in" button goes here in a preview build) and moves on to:
 *   GET  /api/preview-auth/authorize?…            the form: passphrase + which test player to be
 *   POST /api/preview-auth/authorize?…            checks the passphrase and returns to Better Auth's callback with a
 *                                                 signed ticket as the authorization code
 */
import type { HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { json, readBody } from "../lib/http";
import { siteUrl } from "./config";
import { constantTimeEqual } from "./crypto";
import { previewSignInCode } from "./identity";
import { PREVIEW_CLIENT_ID, PREVIEW_IDENTITIES, PREVIEW_PROVIDER_ID, isPreviewIdentity, issueTicket, safeReturnTo, ticketSecret } from "./preview";

const MAX_BODY_BYTES = 4 * 1024;
const WRONG_CODE_DELAY_MS = 1000;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
  `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:10vh auto;padding:0 1rem}label{display:block;margin:.4rem 0}` +
  `input[type=password]{font:inherit;padding:.4rem;width:100%;box-sizing:border-box}button{font:inherit;padding:.5rem 1.2rem;margin-top:1rem}` +
  `.error{color:#b00020}.note{color:#555;font-size:.9rem}</style></head><body>${body}</body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
const notFound = () => json({ error: "Not found" }, 404);

const start = httpAction(async (_ctx, request) => {
  if (!previewSignInCode(process.env)) return notFound();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  // JSON inside a script: "<" escaped so the value can never close the element.
  const body = JSON.stringify({ providerId: PREVIEW_PROVIDER_ID, callbackURL: returnTo }).replace(/</g, "\\u003c");
  return page("Preview sign-in", `<p id="status">Starting the preview sign-in…</p><script>
fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(${body}) })
  .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.url) throw new Error(j.message || ("HTTP " + r.status)); location.replace(j.url); }); })
  .catch(function (e) { document.getElementById("status").textContent = "The preview sign-in could not start: " + e.message; });
</script>`);
});

/** The authorization request Better Auth built, or null when it is not one of ours. */
function authorizationRequest(url: URL) {
  const p = url.searchParams;
  const redirect = `${siteUrl()}/api/auth/oauth2/callback/${PREVIEW_PROVIDER_ID}`;
  const challenge = p.get("code_challenge") ?? "", state = p.get("state") ?? "";
  if (p.get("client_id") !== PREVIEW_CLIENT_ID || p.get("response_type") !== "code" || p.get("redirect_uri") !== redirect) return null;
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 2048) return null;
  return { redirect, challenge, state };
}

function form(error = "") {
  const players = Object.entries(PREVIEW_IDENTITIES).map(([id, who], i) =>
    `<label><input type="radio" name="identity" value="${id}"${i === 0 ? " checked" : ""}> ${escapeHtml(`${who.given_name} ${who.family_name}`)}${id === "admin" ? " (admin: sees the Lab setups)" : ""}</label>`).join("");
  return page("Preview sign-in", `<h1>Preview sign-in</h1>
<p class="note">This is a preview deployment: test players only, no Google. Use a second browser profile or a private window to be another player.</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
<form method="post"><label>Passphrase <input type="password" name="code" autocomplete="current-password" required autofocus></label>
<fieldset><legend>Sign in as</legend>${players}</fieldset><button type="submit">Sign in</button></form>`, error ? 403 : 200);
}

const authorizePage = httpAction(async (_ctx, request) => {
  if (!previewSignInCode(process.env)) return notFound();
  return authorizationRequest(new URL(request.url)) ? form() : page("Preview sign-in", `<p>This sign-in link is not valid. <a href="/api/preview-auth/start">Start again</a>.</p>`, 400);
});

const authorizeSubmit = httpAction(async (_ctx, request) => {
  const passphrase = previewSignInCode(process.env);
  if (!passphrase) return notFound();
  const asked = authorizationRequest(new URL(request.url));
  if (!asked) return page("Preview sign-in", `<p>This sign-in link is not valid. <a href="/api/preview-auth/start">Start again</a>.</p>`, 400);
  const body = await readBody(request, MAX_BODY_BYTES, { form: true });
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!constantTimeEqual(code, passphrase)) {
    await new Promise(resolve => setTimeout(resolve, WRONG_CODE_DELAY_MS));   // slows guessing
    return form("That passphrase is not right.");
  }
  if (!isPreviewIdentity(body?.identity)) return form("Pick a player.");
  const ticket = await issueTicket(ticketSecret(process.env.BETTER_AUTH_SECRET ?? "", passphrase),
    { id: body.identity, challenge: asked.challenge, redirect: asked.redirect });
  const target = new URL(asked.redirect);
  target.searchParams.set("code", ticket);
  target.searchParams.set("state", asked.state);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
});

export function registerPreviewAuthRoutes(http: HttpRouter) {
  http.route({ path: "/api/preview-auth/start", method: "GET", handler: start });
  http.route({ path: "/api/preview-auth/authorize", method: "GET", handler: authorizePage });
  http.route({ path: "/api/preview-auth/authorize", method: "POST", handler: authorizeSubmit });
}
