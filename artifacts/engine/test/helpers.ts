/**
 * Helpers for test/auth.test.ts (run by scripts/test-auth.mjs against a live local backend), also used by
 * scripts/seed-players.ts and the player-web e2e. Browser humans sign in through Better Auth's generic OAuth
 * provider "fake" (scripts/fake-oidc.mjs, enabled only under test fixtures) with a small cookie jar.
 * Plain TypeScript that Node's type stripping can run (no enums, no parameter properties).
 */
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const CLOUD = process.env.CG_TEST_CLOUD_URL ?? "http://127.0.0.1:3310";
export const SITE = process.env.CG_TEST_SITE_URL ?? "http://127.0.0.1:3311";
export const OIDC = process.env.CG_TEST_OIDC_URL ?? "http://127.0.0.1:3398";

const adminKey = (JSON.parse(readFileSync(new URL("../.convex/local/default/config.json", import.meta.url), "utf8")) as { adminKey: string }).adminKey;

/** Calls internal functions (test fixtures) with the local deployment's admin key. */
export function admin() {
  const client = new ConvexHttpClient(CLOUD);
  (client as unknown as { setAdminAuth(key: string): void }).setAdminAuth(adminKey);
  return {
    mutation: (name: string, args: Record<string, unknown>) => client.mutation(makeFunctionReference<"mutation">(name), args),
    query: (name: string, args: Record<string, unknown>) => client.query(makeFunctionReference<"query">(name), args),
  };
}

/** A Convex client authenticated with a JWT (or none). */
export function client(token?: string) {
  const c = new ConvexHttpClient(CLOUD);
  if (token) c.setAuth(token);
  return {
    query: (name: string, args: Record<string, unknown> = {}) => c.query(makeFunctionReference<"query">(name), args),
    mutation: (name: string, args: Record<string, unknown> = {}) => c.mutation(makeFunctionReference<"mutation">(name), args),
  };
}

/** ConvexError data of a rejected call (its `code`), or "no error". */
export async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; return "no error"; } catch (error) {
    const data = (error as { data?: { code?: string } }).data;
    return data?.code ?? `untyped: ${(error as Error).message}`;
  }
}

export function setCookies(response: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return jar;
}
export const rawSetCookies = (response: Response) => response.headers.getSetCookie();

const manual = { redirect: "manual" as const };

export type Jar = { jar: Record<string, string>; take(response: Response): Response; header(): string };
/** A browser's cookies for the site: set from responses, sent as one `cookie` header (empty values delete). */
export function cookieJar(): Jar {
  const jar: Record<string, string> = {};
  return {
    jar,
    take(response: Response) {
      for (const [k, v] of Object.entries(setCookies(response))) { if (v) jar[k] = v; else delete jar[k]; }
      return response;
    },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

/** Better Auth's session cookie on the plain-http loopback site (`__Secure-` prefixed on https). */
export const SESSION_COOKIE = "better-auth.session_token";

/**
 * Start a sign-in with the fake provider: returns its authorization URL and the browser's cookies (OAuth state).
 * Throws unless Better Auth answers 200 (use `signInRequest` to inspect a refusal).
 */
export async function startLogin(callbackURL = "/", jar = cookieJar()) {
  const response = await signInRequest("/api/auth/sign-in/oauth2", { providerId: "fake", callbackURL }, jar);
  if (response.status !== 200) throw new Error(`sign-in/oauth2: ${response.status} ${await response.text()}`);
  const { url } = await response.json() as { url: string };
  return { authorize: new URL(url), jar };
}
/** POST a Better Auth sign-in endpoint as the site's own page would (same Origin). */
export async function signInRequest(path: string, body: Record<string, unknown>, jar = cookieJar()) {
  return jar.take(await fetch(`${SITE}${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: SITE, ...(jar.header() ? { cookie: jar.header() } : {}) },
    body: JSON.stringify(body),
  }));
}

/** Pick an identity at the fake provider: returns the callback URL it redirects to. */
export async function authorize(url: URL, loginHint: string) {
  const target = new URL(url);
  target.searchParams.set("login_hint", loginHint);
  const response = await fetch(target, manual);
  if (response.status !== 302) throw new Error(`authorize: ${response.status} ${await response.text()}`);
  return new URL(response.headers.get("location")!);
}

export async function callback(url: URL, jar: Jar) {
  return jar.take(await fetch(url, { ...manual, headers: jar.header() ? { cookie: jar.header() } : {} }));
}

/** The React client's token fetch: session cookie → a Convex JWT from Better Auth (`/api/auth/convex/token`). */
export async function browserToken(session: string) {
  return await fetch(`${SITE}/api/auth/convex/token`, { headers: session ? { cookie: session } : {} });
}
export async function browserJwt(session: string): Promise<string> {
  const response = await browserToken(session);
  if (response.status !== 200) throw new Error(`convex/token: ${response.status} ${await response.text()}`);
  return (await response.json() as { token: string }).token;
}

/**
 * Full browser sign-in → {session: the `cookie` header a browser would send, cookies, jwt, subject (the god
 * id: the Better Auth user id), location (the final redirect)}.
 */
export async function login(identity: string, callbackURL = "/") {
  const { authorize: url, jar } = await startLogin(callbackURL);
  const response = await callback(await authorize(url, identity), jar);
  if (response.status !== 302 || !jar.jar[SESSION_COOKIE]) {
    throw new Error(`callback: ${response.status} ${response.headers.get("location")} ${await response.text()}`);
  }
  const session = jar.header();
  const jwt = await browserJwt(session);
  return { session, cookies: { ...jar.jar }, jwt, subject: decodeJwt(jwt).payload.sub as string, location: response.headers.get("location")!, response };
}

export const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const response = await fetch(`${SITE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, any> };
};

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function deviceRequest(room: string, permission: string, label = "Test assistant") {
  const { verifier, challenge } = pkce();
  const result = await post("/api/device/request", { room, permission, label, challenge });
  if (result.status !== 200) throw new Error(`device/request: ${result.status} ${JSON.stringify(result.body)}`);
  return { ...result.body, verifier } as Record<string, any>;
}
export const poll = (d: Record<string, any>, overrides: Record<string, string> = {}) =>
  post("/api/device/poll", { deviceId: d.deviceId, deviceSecret: d.deviceSecret, verifier: d.verifier, ...overrides });

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const POLL_GAP_MS = 2100;

export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split(".");
  return { header: JSON.parse(Buffer.from(h, "base64url").toString()), payload: JSON.parse(Buffer.from(p, "base64url").toString()) };
}
