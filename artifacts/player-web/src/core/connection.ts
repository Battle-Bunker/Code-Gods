/**
 * How this client reaches the engine. Two modes, detected at startup, and in both the client holds only a
 * room-scoped player token: the same public paths any app on any origin uses (docs/external-clients.md).
 *
 *  "devserver": a player's own app, run as a Vite dev server in any environment. The dev server holds the
 *               room credential (CODE_GODS_CREDENTIAL, from the environment's secret store or .env.local)
 *               and answers GET /__codegods/token with a 10-minute player JWT; the browser never sees the
 *               credential. The room is the credential's room.
 *  "hosted"   : any other page: the reference client the engine serves at /client/, or a build of this app on
 *               another origin (VITE_CODE_GODS_ENGINE_URL names the engine). It is an OAuth client of the engine
 *               (lib/player-client/src/browser.ts): one connection per room, approved on the engine's /connect
 *               page, which approves the engine's own client without a click. It never uses the engine site's
 *               Google session, so it can do exactly what an external client can, no more.
 *
 * The Convex client is kept on globalThis, so hot updates of any module (core included) never open a
 * second connection or drop subscriptions.
 */
import { ConvexReactClient } from "convex/react";
import { createPlayerAuth, type PlayerAuth } from "@workspace/player-client/browser";

export type Mode = "devserver" | "hosted";
export type Connection = {
  mode: Mode;
  convexUrl: string;
  /** Dev-server mode: the credential's room (Convex id) and permission. */
  roomId?: string;
  permission?: "read" | "act" | "owner";
  /** The engine's site URL (hosted mode; a dev server's token endpoint reports it too). */
  siteUrl?: string;
};

type TokenResponse = { token: string; expiresAt: number; convexUrl: string; siteUrl?: string; roomId: string; permission: Connection["permission"] };
type Global = typeof globalThis & { __cgConnection?: Promise<Connection>; __cgConvex?: ConvexReactClient; __cgAuth?: PlayerAuth };
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

/** The engine this page talks to in hosted mode: VITE_CODE_GODS_ENGINE_URL, else the page's own origin. */
export function engineUrl(): string {
  return (import.meta.env.VITE_CODE_GODS_ENGINE_URL as string | undefined) || location.origin;
}

/** The engine's site URL once the connection is known (links to the engine UI: routes.ts enginePageHref). */
let site: string | undefined;
export const engineSite = () => site;

async function detect(): Promise<Connection> {
  const app = await fetchAppToken();
  if (app) {
    site = app.siteUrl;
    return { mode: "devserver", convexUrl: app.convexUrl, roomId: app.roomId, permission: app.permission, ...(app.siteUrl ? { siteUrl: app.siteUrl } : {}) };
  }
  site = playerAuth().engineUrl;
  const configured = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (configured) return { mode: "hosted", convexUrl: configured, siteUrl: playerAuth().engineUrl };
  return { mode: "hosted", convexUrl: await playerAuth().convexUrl(), siteUrl: playerAuth().engineUrl };
}

/** The connection, detected once per page (and kept across hot updates). */
export function connection(): Promise<Connection> {
  return g.__cgConnection ??= detect().catch(error => { delete g.__cgConnection; throw error; });
}

export function convexClient(url: string): ConvexReactClient {
  // No "changes may not be saved" prompt on leaving: layout saves and commands are sent before the page unloads,
  // and the browser's generic dialog only alarms (the engine UI disables it too, for its sign-in redirect).
  return g.__cgConvex ??= new ConvexReactClient(url, { unsavedChangesWarning: false });
}

/** The page's Convex client, once `convexClient` has made it (the SDK's host transport reaches the engine with it). */
export function existingConvexClient(): ConvexReactClient | undefined {
  return g.__cgConvex;
}

/** Dev-server mode: a fresh player JWT for the Convex client's fetchAccessToken (null = refused). */
export async function fetchAppAccessToken(): Promise<string | null> {
  return (await fetchAppToken())?.token ?? null;
}

/**
 * Hosted mode: the engine's OAuth flow for this client. The redirect URI is the app's root (BASE_URL), registered
 * once per browser; the page the human started from comes back as `returnTo`.
 */
export function playerAuth(): PlayerAuth {
  return g.__cgAuth ??= createPlayerAuth({
    engineUrl: engineUrl(), clientName: "Code Gods player client", redirectUri: `${location.origin}${import.meta.env.BASE_URL}`,
  });
}

/** Hosted mode: leave for the engine's /connect page to get (or upgrade) this room's connection. */
export function connectRoom(room: string, permission: "read" | "act" | "owner" = "act"): Promise<void> {
  return playerAuth().signInWithRedirect({ room, permission, returnTo: location.pathname + location.search });
}
