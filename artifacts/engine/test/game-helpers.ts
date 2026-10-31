/**
 * Helpers for the engine's integration tests against the LIVE local backend (npx convex dev on 3210).
 * Identities are impersonated with the deployment admin key (ConvexHttpClient.setAdminAuth with an
 * acting-as identity carrying `subject` and the issuer of the token kind, which convex/auth/access.ts reads); `users` rows
 * and player credentials are seeded with test-only internal mutations (convex/testing.ts).
 */
import { after } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import { VERSION } from "@workspace/player-client";

export const api = anyApi as any;
export const internal = anyApi as any;

const root = fileURLToPath(new URL("..", import.meta.url));
const config = JSON.parse(readFileSync(`${root}/.convex/local/default/config.json`, "utf8"));
export const URL_ = process.env.CONVEX_URL ?? `http://127.0.0.1:${config.ports?.cloud ?? 3210}`;
export const ADMIN_KEY: string = config.adminKey;

/** ConvexHttpClient.setAdminAuth is untyped (admin-only API): act as the deployment admin, optionally as an identity. */
const adminAuth = (c: ConvexHttpClient, identity?: Record<string, unknown>) =>
  (c as unknown as { setAdminAuth(key: string, identity?: unknown): void }).setAdminAuth(ADMIN_KEY, identity);
export const admin = new ConvexHttpClient(URL_);
adminAuth(admin);
/** Leave no game loops (or AI chains) running after a test file: they would keep acting on the shared backend. */
after(async () => { await admin.mutation(internal.testing.endGames, {}); });

export type God = { subject: string; name: string; sid: string; c: ConvexHttpClient };

/** The deployment's site URL: Better Auth's JWT issuer; player JWTs use `<site>/api/device` (convex/auth/identity.ts). */
export const SITE_ = process.env.CG_TEST_SITE_URL ?? `http://127.0.0.1:${config.ports?.site ?? 3211}`;

/**
 * A client acting as `subject` with the given scope: the issuer of a Better Auth browser JWT (plus `sessionId`)
 * or of a player JWT (plus `cred`), which is how access.ts tells them apart.
 */
export function clientFor(subject: string, scope: "browser" | "player" = "browser", extra: Record<string, unknown> = {}) {
  const c = new ConvexHttpClient(URL_);
  adminAuth(c, { subject, issuer: scope === "browser" ? SITE_ : `${SITE_}/api/device`, ...extra });
  return c;
}

/** Seed users with unique subjects and full names; returns a browser client per god. */
export async function gods(...names: string[]): Promise<God[]> {
  const out: God[] = [];
  for (const name of names) {
    const subject = `test|${randomUUID()}`;
    const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: `${subject.slice(5, 13)}@test.local`, emailVerified: true });
    out.push({ subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) });
  }
  return out;
}

/** A player-scope client for `god` bound to `roomId` with a seeded credential of `permission`. */
export async function playerClient(god: God, roomId: string, permission: "read" | "act" | "owner") {
  const credentialId = await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission });
  return clientFor(god.subject, "player", { cred: credentialId });
}

export const envelope = (command: Record<string, unknown>, gameId?: string) =>
  ({ version: VERSION, commandId: randomUUID(), ...(gameId ? { gameId } : {}), command });

export async function touch(god: God) { await god.c.mutation(api.activity.touch, {}); }

/** A room with these gods (first is owner); settings applied directly by the test helper when given. */
export async function roomWith(members: God[], settings?: Record<string, unknown>) {
  const [owner, ...rest] = members;
  const { roomId, shortCode } = await owner.c.mutation(api.rooms.create, {});
  for (const m of rest) await m.c.mutation(api.rooms.join, { room: shortCode });
  if (settings) {
    const room = await owner.c.query(api.rooms.get, { room: roomId });
    await owner.c.action(api.owner.settings, { roomId, revision: room.revision, settings });
  }
  return { roomId: roomId as string, shortCode: shortCode as string };
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function waitFor<T>(check: () => Promise<T | undefined | false | null>, label: string, ms = 60000, every = 200): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await sleep(every);
  }
}

/** The message of a rejected Convex call. */
export async function rejects(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) {
    if (error instanceof ConvexError) return String((error.data as any)?.message ?? error.data);
    return String((error as Error).message);
  }
  throw new Error("Expected the call to be rejected");
}

export const raw = (gameId: string) => admin.query(internal.testing.rawGame, { gameId });

export const TS = {
  Int: "function agent(x) { return [add(1)]; }",
  string: "function agent(s) { return [rotate(1)]; }",
  Grid: "function agent(grid) { return [slide(row(0), 1)]; }",
} as const;
export const PY = {
  Int: "def agent(x):\n    return [add(1)]",
  string: "def agent(s):\n    return [rotate(1)]",
  Grid: "def agent(grid):\n    return [slide(row(0), 1)]",
} as const;
