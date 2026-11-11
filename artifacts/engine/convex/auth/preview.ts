/**
 * Sign-in for PREVIEW DEPLOYMENTS ONLY (docs/preview-deployments.md): Better Auth's generic OAuth provider "preview",
 * whose "provider" is this deployment itself. Google cannot sign anyone in on a preview: its redirect URIs are fixed
 * per client and every preview has its own hostname. So a preview offers a page that asks for the owner's passphrase
 * and which test player to be (previewRoutes.ts), and this file turns that choice into a Better Auth user.
 *
 * It exists only while the deployment env var PREVIEW_SIGN_IN_CODE holds a passphrase of at least
 * PREVIEW_CODE_MIN_LENGTH characters (identity.ts previewSignInCode). Only .github/workflows/preview.yml sets it, on
 * the preview it creates, from the repository secret of the same name; the dev and production deploys refuse to run
 * while it is set (deploy.yml "Check the deployment's env vars"). Whoever knows the passphrase and a preview's URL
 * can be any of the players below, admin included, on that preview.
 *
 * No endpoint is fetched and nothing is stored: the page hands Better Auth a ticket (identity, PKCE challenge,
 * redirect URI, expiry) signed with HMAC-SHA256 under BETTER_AUTH_SECRET + the passphrase; `getToken` checks it.
 * Pure Web Crypto, no Convex imports (unit-tested in test/unit/preview-sign-in.test.ts).
 */
import { base64url, constantTimeEqual, pkceChallenge } from "./crypto.ts";

export const PREVIEW_PROVIDER_ID = "preview";
export const PREVIEW_CLIENT_ID = "code-gods-preview";
const TICKET_TTL_MS = 60_000;

/**
 * The test players a preview offers. `admin` is on ADMIN_EMAILS (set by scripts/preview-setup.mjs), so it is an admin.
 * Their own email domain: never the same account as a local test identity (scripts/fake-oidc.mjs).
 */
export const PREVIEW_IDENTITIES = {
  admin: { sub: "preview-admin", given_name: "Ada", family_name: "Admin", email: "admin@preview.test" },
  alice: { sub: "preview-alice", given_name: "Alice", family_name: "Liddell", email: "alice@preview.test" },
  bob: { sub: "preview-bob", given_name: "Bob", family_name: "Okafor", email: "bob@preview.test" },
  carol: { sub: "preview-carol", given_name: "Carol", family_name: "Nguyen", email: "carol@preview.test" },
  dan: { sub: "preview-dan", given_name: "Dan", family_name: "Petrov", email: "dan@preview.test" },
  erin: { sub: "preview-erin", given_name: "Erin", family_name: "Sato", email: "erin@preview.test" },
} as const;
export type PreviewIdentity = keyof typeof PREVIEW_IDENTITIES;
export const isPreviewIdentity = (value: unknown): value is PreviewIdentity =>
  typeof value === "string" && Object.hasOwn(PREVIEW_IDENTITIES, value);

type Ticket = { id: PreviewIdentity; challenge: string; redirect: string; exp: number };
const encoder = new TextEncoder();

async function mac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));
}
const encode = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
function decode(body: string): unknown {
  try { return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
}

/** The authorization code the sign-in page hands back to Better Auth: valid for a minute, for one redirect URI and one PKCE challenge. */
export async function issueTicket(secret: string, ticket: Omit<Ticket, "exp">, now = Date.now()): Promise<string> {
  const body = encode({ ...ticket, exp: now + TICKET_TTL_MS } satisfies Ticket);
  return `${body}.${await mac(secret, body)}`;
}

/** The identity a ticket names, or null unless its signature, expiry, redirect URI and PKCE verifier all hold. */
export async function redeemTicket(
  secret: string, code: string, { redirectURI, codeVerifier }: { redirectURI: string; codeVerifier?: string }, now = Date.now(),
): Promise<PreviewIdentity | null> {
  const [body, signature, ...rest] = code.split(".");
  if (!body || !signature || rest.length || !constantTimeEqual(signature, await mac(secret, body))) return null;
  const ticket = decode(body) as Partial<Ticket> | null;
  if (!ticket || !isPreviewIdentity(ticket.id) || typeof ticket.exp !== "number" || ticket.exp < now) return null;
  if (ticket.redirect !== redirectURI) return null;
  if (!codeVerifier || typeof ticket.challenge !== "string" || !constantTimeEqual(ticket.challenge, await pkceChallenge(codeVerifier))) return null;
  return ticket.id;
}

/** The profile Better Auth stores for a preview player (the email is "verified": the passphrase holder vouches for it). */
export function previewProfile(id: PreviewIdentity) {
  const who = PREVIEW_IDENTITIES[id];
  return { id: who.sub, email: who.email, emailVerified: true, name: `${who.given_name} ${who.family_name}`, given_name: who.given_name, family_name: who.family_name };
}

/** The HMAC key: bound to this deployment (its Better Auth secret) and to the passphrase. */
export const ticketSecret = (betterAuthSecret: string, passphrase: string) => `${betterAuthSecret}\npreview-sign-in\n${passphrase}`;

/** A path on this site (never another origin): where sign-in returns to. */
export const safeReturnTo = (value: string | null) => value && /^\/(?![/\\])[^\u0000-\u001f]*$/.test(value) ? value : "/";
