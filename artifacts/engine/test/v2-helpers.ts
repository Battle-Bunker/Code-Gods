/**
 * Helpers for engine v2's live tests (the local backend of `pnpm --filter @workspace/engine dev`). Humans are
 * impersonated with the deployment's admin key and a browser identity (issuer = the site, plus a live session id),
 * seeded by `v2/testing:seedUser`. Nothing here imports the v1 engine or its libraries.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = JSON.parse(readFileSync(`${root}/.convex/local/default/config.json`, "utf8"));
export const URL_ = process.env.CONVEX_URL ?? `http://127.0.0.1:${config.ports?.cloud ?? 3210}`;
export const SITE_ = process.env.CG_TEST_SITE_URL ?? `http://127.0.0.1:${config.ports?.site ?? 3211}`;
const ADMIN_KEY: string = config.adminKey;

const adminAuth = (c: ConvexHttpClient, identity?: Record<string, unknown>) =>
  (c as unknown as { setAdminAuth(key: string, identity?: unknown): void }).setAdminAuth(ADMIN_KEY, identity);

type Kind = "query" | "mutation" | "action";
const call = (c: ConvexHttpClient, kind: Kind, name: string, args: Record<string, unknown>) =>
  kind === "query" ? c.query(makeFunctionReference<"query">(name), args)
    : kind === "mutation" ? c.mutation(makeFunctionReference<"mutation">(name), args)
      : c.action(makeFunctionReference<"action">(name), args);

export interface Caller {
  query(name: string, args?: Record<string, unknown>): Promise<any>;
  mutation(name: string, args?: Record<string, unknown>): Promise<any>;
  action(name: string, args?: Record<string, unknown>): Promise<any>;
}
function caller(c: ConvexHttpClient): Caller {
  return {
    query: (n, a = {}) => call(c, "query", n, a), mutation: (n, a = {}) => call(c, "mutation", n, a), action: (n, a = {}) => call(c, "action", n, a),
  };
}

/** The deployment admin (internal functions, fixtures). */
export const admin: Caller = (() => { const c = new ConvexHttpClient(URL_); adminAuth(c); return caller(c); })();
/** A caller with no identity (sign-in is required everywhere). */
export const anonymous: Caller = caller(new ConvexHttpClient(URL_));

export interface Human extends Caller { userId: string; name: string }
/** Seeds humans with fresh user ids; each is a signed-in browser caller. */
export async function humans(...names: string[]): Promise<Human[]> {
  const out: Human[] = [];
  for (const name of names) {
    const userId = `test|${randomUUID()}`;
    const sessionId = await admin.mutation("v2/testing:seedUser", { subject: userId, name });
    const c = new ConvexHttpClient(URL_);
    adminAuth(c, { subject: userId, issuer: SITE_, sessionId });
    out.push({ userId, name, ...caller(c) });
  }
  return out;
}

/** ConvexError data's code of a rejected call, or "no error". */
export async function errorCode(p: Promise<unknown>): Promise<string> {
  try { await p; return "no error"; } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `untyped: ${(e as Error).message}`;
  }
}

/** Runs a server affordance as the app does (`v2/ops/<ns>:<verb>`), with the room or game in view. */
export const perform = (who: Caller, id: string, args: Record<string, unknown>, scope: { roomId?: string; gameId?: string } = {}, kind: Kind = "mutation") => {
  const [ns, verb] = id.split(".") as [string, string];
  return (who as any)[kind](`v2/ops/${ns}:${verb}`, { args, ...scope });
};
