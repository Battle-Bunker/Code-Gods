/**
 * Helpers for test/auth.test.ts (run by scripts/test-auth.mjs against a live local backend).
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

/** Start a login: returns the provider authorization URL and the flow cookie. */
export async function startLogin(returnTo?: string) {
  const response = await fetch(`${SITE}/api/login${returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`, manual);
  if (response.status !== 302) throw new Error(`login: ${response.status}`);
  return { authorize: new URL(response.headers.get("location")!), flowCookie: setCookies(response).cg_oidc, response };
}

/** Pick an identity at the fake provider: returns the callback URL it redirects to. */
export async function authorize(url: URL, loginHint: string, extra: Record<string, string> = {}) {
  const target = new URL(url);
  target.searchParams.set("login_hint", loginHint);
  for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
  const response = await fetch(target, manual);
  if (response.status !== 302) throw new Error(`authorize: ${response.status} ${await response.text()}`);
  return new URL(response.headers.get("location")!);
}

export async function callback(url: URL, flowCookie: string | undefined) {
  return await fetch(url, { ...manual, headers: flowCookie ? { cookie: `cg_oidc=${flowCookie}` } : {} });
}

/** Full browser login → {session cookie value, final redirect}. */
export async function login(identity: string, returnTo?: string) {
  const { authorize: url, flowCookie } = await startLogin(returnTo);
  const response = await callback(await authorize(url, identity), flowCookie);
  if (response.status !== 302) throw new Error(`callback: ${response.status} ${await response.text()}`);
  const session = setCookies(response).cg_session;
  if (!session) throw new Error("no session cookie");
  return { session, location: response.headers.get("location")!, response };
}

/** The React client's fetchAccessToken equivalent. */
export async function browserToken(session: string, origin: string | null = SITE) {
  return await fetch(`${SITE}/api/auth/token`, {
    method: "POST", headers: { cookie: `cg_session=${session}`, ...(origin ? { origin } : {}) },
  });
}
export async function browserJwt(session: string): Promise<string> {
  const response = await browserToken(session);
  if (response.status !== 200) throw new Error(`token: ${response.status}`);
  return (await response.json() as { token: string }).token;
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
