/**
 * How this client reaches the engine. Two modes, detected at startup:
 *
 *  "devserver": a player's own app, run as a Vite dev server in any environment. The dev server holds the
 *               room credential (CODE_GODS_CREDENTIAL, from the environment's secret store or .env.local)
 *               and answers GET /__codegods/token with a 10-minute player JWT; the browser never sees the
 *               credential. The room is the credential's room.
 *  "hosted"   : the default client served by the engine at /player/. The human signs in with Google through
 *               Better Auth on that site (the same session cookie as the engine UI at /), which the Convex
 *               client turns into JWTs at /api/auth/convex/token. The room comes from ?room=.
 *
 * The Convex client is kept on globalThis, so hot updates of any module (core included) never open a
 * second connection or drop subscriptions.
 */
import { ConvexReactClient } from "convex/react";
import { convexClient as betterAuthConvex } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export type Mode = "devserver" | "hosted";
export type Connection = {
  mode: Mode;
  convexUrl: string;
  /** Dev-server mode: the credential's room (Convex id) and permission. */
  roomId?: string;
  permission?: "read" | "act" | "owner";
  /** Hosted mode: the engine site the client is served from (same origin). */
  siteUrl?: string;
};

type TokenResponse = { token: string; expiresAt: number; convexUrl: string; roomId: string; permission: Connection["permission"] };
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

async function detect(): Promise<Connection> {
  const app = await fetchAppToken();
  if (app) return { mode: "devserver", convexUrl: app.convexUrl, roomId: app.roomId, permission: app.permission };
  const configured = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (configured) return { mode: "hosted", convexUrl: configured, siteUrl: location.origin };
  const config = await (await fetch("/api/config", { cache: "no-store" })).json() as { convexUrl: string; siteUrl: string };
  return { mode: "hosted", convexUrl: config.convexUrl, siteUrl: config.siteUrl };
}

/** The connection, detected once per page (and kept across hot updates). */
export function connection(): Promise<Connection> {
  return g.__cgConnection ??= detect().catch(error => { delete g.__cgConnection; throw error; });
}

export function convexClient(url: string): ConvexReactClient {
  return g.__cgConvex ??= new ConvexReactClient(url);
}

/** Dev-server mode: a fresh player JWT for the Convex client's fetchAccessToken (null = refused). */
export async function fetchAppAccessToken(): Promise<string | null> {
  return (await fetchAppToken())?.token ?? null;
}

const makeAuthClient = () => createAuthClient({ baseURL: location.origin, plugins: [betterAuthConvex()] });
type AuthClient = ReturnType<typeof makeAuthClient>;
/** Hosted mode: Better Auth on the engine site (same origin, or the dev server's /api proxy to it). */
export function authClient(): AuthClient {
  const k = g as Global & { __cgAuth?: AuthClient };
  return k.__cgAuth ??= makeAuthClient();
}

/** Hosted mode: start Google sign-in, coming back to this page. */
export function signIn(): void {
  void authClient().signIn.social({ provider: "google", callbackURL: location.pathname + location.search });
}
