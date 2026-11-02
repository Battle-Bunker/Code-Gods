/**
 * How the app reaches the engine (docs/unify-apps-plan.md §3). Rights come from the human's Google identity, never from
 * which app they run; the app only chooses how it proves that identity:
 *
 *  "site"     : the app served by the engine itself (or a dev server proxying /api to it: CODE_GODS_SITE_URL). It
 *               signs in with the site's Google session (Better Auth cookie, same origin) and is the human everywhere.
 *  "account"  : the app on any other origin (localhost, a Replit dev URL, a static host), built or run with
 *               VITE_CODE_GODS_ENGINE_URL naming the engine's site. The human approves an account grant on
 *               the engine's /connect page (OAuth + PKCE; lib/player-client/src/browser.ts) and the app is then the
 *               human everywhere, as on the site, except the consent pages and admin, which stay on the engine's site.
 *  "devserver": a player's own app, run as a Vite dev server in any environment. The dev server holds a room
 *               credential (CODE_GODS_CREDENTIAL, from the environment's secret store or .env.local) and answers
 *               GET /__codegods/token with a 10-minute player JWT; the browser never sees the credential. The app is
 *               then that human in the credential's room, with its permission.
 *
 * The Convex client is kept on globalThis, so hot updates of any module never open a second connection or drop
 * subscriptions.
 */
import { ConvexReactClient } from "convex/react";
import { createPlayerAuth, isAccountSession, type AccountSession, type PlayerAuth } from "@workspace/player-client/browser";
import { keepCurrent } from "./updates";

export type Mode = "devserver" | "site" | "account";
export type Connection =
  | { mode: "site"; convexUrl: string }
  | {
      mode: "account"; convexUrl: string; siteUrl: string; auth: PlayerAuth;
      /** The stored account grant; null until the human signs in (the app then shows its sign-in screen). */
      session: AccountSession | null;
    }
  | {
      mode: "devserver"; convexUrl: string;
      /** The credential's room (Convex id) and permission. */
      roomId: string; permission: "read" | "act" | "owner";
      /** The engine's site URL (its consent and admin pages live there). */
      siteUrl?: string;
    };

type TokenResponse = { token: string; expiresAt: number; convexUrl: string; siteUrl?: string; roomId: string; permission: "read" | "act" | "owner" };
type Global = typeof globalThis & { __cgConnection?: Promise<Connection>; __cgConvex?: ConvexReactClient };
const g = globalThis as Global;

const appTokenUrl = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/__codegods/token`;

async function fetchAppToken(): Promise<TokenResponse | null> {
  const response = await fetch(appTokenUrl(), { cache: "no-store", credentials: "same-origin" });
  // No player-app dev server here: a 404, or (on the engine's static site) the SPA fallback's index.html.
  if (response.status === 404 || !response.headers.get("content-type")?.includes("application/json")) return null;
  const body = await response.json().catch(() => ({})) as Partial<TokenResponse> & { error?: string };
  if (!response.ok || !body.token) throw new Error(body.error ?? `The player app could not get an engine token (${response.status}). Run \`pnpm player status\`.`);
  return body as TokenResponse;
}

/** The engine site's URL: this origin, or the one a dev server's credential names. */
let site: string | undefined;
export const engineSite = () => site ?? location.origin;

/** The Convex client URL of the engine serving this page: build-time VITE_CONVEX_URL, else its /api/config. */
async function siteConvexUrl(): Promise<string> {
  const fromBuild = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (fromBuild) return fromBuild;
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error(`Engine configuration unavailable (${response.status})`);
  const body = (await response.json()) as { convexUrl?: string };
  if (!body.convexUrl) throw new Error("Engine configuration has no Convex URL");
  return body.convexUrl;
}

/** The engine an account-mode app signs in to (build time, or the dev server's environment), if any. */
export const accountEngineUrl = () => (import.meta.env.VITE_CODE_GODS_ENGINE_URL as string | undefined)?.replace(/\/+$/, "") || undefined;

async function accountConnection(engineUrl: string): Promise<Connection> {
  // Back from the engine's /connect page with ?code&state: the answer is redeemed here, on whatever path it lands.
  const auth = createPlayerAuth({ engineUrl, clientName: "Code Gods app" });
  const done = await auth.completeSignIn();
  const session = done && isAccountSession(done.session) ? done.session : auth.account();
  // Where the sign-in started: a path on this origin only.
  if (done?.returnTo && /^\/(?!\/)/.test(done.returnTo)) history.replaceState(history.state, "", done.returnTo);
  site = auth.engineUrl;
  return { mode: "account", convexUrl: session?.convexUrl ?? await auth.convexUrl(), siteUrl: auth.engineUrl, auth, session };
}

async function detect(): Promise<Connection> {
  const engine = accountEngineUrl();
  if (engine) return accountConnection(engine);
  const app = await fetchAppToken();
  if (app) {
    site = app.siteUrl;
    return { mode: "devserver", convexUrl: app.convexUrl, roomId: app.roomId, permission: app.permission, ...(app.siteUrl ? { siteUrl: app.siteUrl } : {}) };
  }
  return { mode: "site", convexUrl: await siteConvexUrl() };
}

/** The connection, detected once per page (and kept across hot updates). */
export function connection(): Promise<Connection> {
  return g.__cgConnection ??= detect().catch(error => { delete g.__cgConnection; throw error; });
}

export function convexClient(url: string): ConvexReactClient {
  // No "changes may not be saved" prompt on leaving: layout saves and commands are sent before the page unloads,
  // and the browser's generic dialog fired on the sign-in redirect whenever an action was still in flight.
  if (!g.__cgConvex) {
    g.__cgConvex = new ConvexReactClient(url, { unsavedChangesWarning: false });
    keepCurrent(g.__cgConvex);   // a deploy updates this page (./updates.ts)
  }
  return g.__cgConvex;
}

/** The page's Convex client, once `convexClient` has made it (the SDK's host transport reaches the engine with it). */
export function existingConvexClient(): ConvexReactClient | undefined {
  return g.__cgConvex;
}

/** Dev-server mode: a fresh player JWT for the Convex client's fetchAccessToken (null = refused). */
export async function fetchAppAccessToken(): Promise<string | null> {
  return (await fetchAppToken())?.token ?? null;
}
