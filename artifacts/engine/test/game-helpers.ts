/**
 * Helpers for the engine's integration tests against the LIVE local backend (npx convex dev on 3210).
 * Identities are impersonated with the deployment admin key (ConvexHttpClient.setAdminAuth with an
 * acting-as identity carrying `subject` and the issuer of the token kind, which convex/auth/access.ts reads); `users` rows
 * and player credentials are seeded with test-only internal mutations (convex/testing.ts).
 */
import assert from "node:assert/strict";
import { after } from "node:test";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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

/**
 * Seed administrators: a verified ADMIN_EMAILS address (scripts/dev.mjs allows admin@example.test) on the test-only
 * "fake" provider (auth/identity.ts isAdminUser). AI seats and the assistant work only in rooms an admin owns.
 */
export async function adminGods(...names: string[]): Promise<God[]> {
  const out: God[] = [];
  for (const name of names) {
    const subject = `test|${randomUUID()}`;
    const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" });
    out.push({ subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) });
  }
  return out;
}

/** Make an existing god an administrator (its sessions stay valid): its rooms may then use AI. */
export async function makeAdmin(god: God): Promise<void> {
  await admin.mutation(internal.testing.seedUser, { subject: god.subject, name: god.name, email: "admin@example.test", emailVerified: true, provider: "fake" });
}

/** A player-scope client for `god` bound to `roomId` with a seeded credential of `permission`. */
export async function playerClient(god: God, roomId: string, permission: "read" | "act" | "owner") {
  const credentialId = await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission });
  return clientFor(god.subject, "player", { cred: credentialId });
}

/**
 * A real Convex JWT for `god` over HTTP (what a client sends to an engine route that checks `Authorization: Bearer`):
 * a player JWT minted by /api/device/token from a seeded `cgc_` credential bound to `roomId`. (Admin impersonation,
 * which the other tests use, does not reach HTTP actions.)
 */
export async function httpJwt(god: God, roomId: string): Promise<string> {
  const credential = `cgc_${randomBytes(32).toString("base64url")}`;
  await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission: "read", tokenHash: createHash("sha256").update(credential).digest("hex") });
  const response = await fetch(`${SITE_}/api/device/token`, { method: "POST", headers: { authorization: `Bearer ${credential}` } });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json() as { token: string }).token;
}

export const envelope = (command: Record<string, unknown>, gameId?: string) =>
  ({ version: VERSION, commandId: randomUUID(), ...(gameId ? { gameId } : {}), command });

export async function touch(god: God) { await god.c.mutation(api.activity.touch, {}); }

/** A room with these gods (first is owner); settings applied directly by the test helper when given. */
/**
 * Every agent sandbox of the deployment warm (runtime/readiness.ts): a start never waits for one, so a test that
 * validates right after its start needs them booted first. Once per test process; manifest.node.warm schedules the boots.
 */
let warm: Promise<void> | undefined;
export function sandboxesWarm(): Promise<void> {
  return warm ??= (async () => {
    // The manifest is for signed-in callers (the admin key alone carries no identity).
    const [warmer] = await gods("Sandbox Warmer");
    const sandboxes: { language: string; state: string; reason?: string }[] = (await warmer.c.action(api.manifest.node.warm, {})).sandboxes;
    const undeployed = sandboxes.find(s => s.state === "failed");
    if (undeployed) throw new Error(`The ${undeployed.language} sandbox cannot boot: ${undeployed.reason}`);
    const languages = sandboxes.map(s => s.language);
    await waitFor(async () => {
      const rows = (await admin.query(internal.testing.sandboxes, {})).filter((r: any) => languages.includes(r.language));
      const failed = rows.find((r: any) => r.state === "failed");
      if (failed) throw new Error(`The ${failed.language} sandbox failed to boot: ${failed.reason}`);
      return rows.length === languages.length && rows.every((r: any) => r.state === "ready") || undefined;
    }, "every agent sandbox ready", 120_000, 100);
  })().catch(error => { warm = undefined; throw error; });
}

export async function roomWith(members: God[], settings?: Record<string, unknown>) {
  await sandboxesWarm();
  const [owner, ...rest] = members;
  const { roomId, shortCode } = await owner.c.mutation(api.rooms.create, {});
  // The owner starts as a spectator (docs/unify-apps-plan.md §2); these rooms seat every member given.
  await owner.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  for (const m of rest) await m.c.mutation(api.rooms.join, { room: shortCode });
  // The default setup charges for looking (paid observation, convex/lib/knowledge.ts); these rooms see the world for
  // free, as every suite written before it assumes, unless the test asks for "paid" (game-paid-observation).
  const room = await owner.c.query(api.rooms.get, { room: roomId });
  await owner.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { observation: "free", ...settings } });
  return { roomId: roomId as string, shortCode: shortCode as string };
}

/** The whole setup catalogue as the app pages it (setups.page, 30 a page): entries {id, name, summary, system, seedId?, mine}. */
export async function setupEntries(c: { query(ref: any, args: any): Promise<any> }, search?: string): Promise<any[]> {
  const out: any[] = [];
  for (let cursor: string | null = null; ;) {
    const page: any = await c.query(api.setups.page, { paginationOpts: { numItems: 50, cursor }, ...(search ? { search } : {}) });
    out.push(...page.page);
    if (page.isDone) return out;
    cursor = page.continueCursor;
  }
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

/** What a begun game is known by (convex/owner.ts `Started`). */
export type Started = { gameId: string; shortCode: string; guid: string };

/**
 * Start the room's game and return its id, short code and guid. A start whose random deal draws a table this
 * deployment has not computed yet returns `{ status: "preparing" }` with no gameId (convex/owner.ts startGame); the game then
 * begins by itself once the tables land, so wait for it. Never read `.gameId` off `api.owner.start` directly
 * (test/unit/start-result-guard.test.ts enforces this).
 */
export async function startGame(owner: God, roomId: string, args: { requestId?: string; holdSettled?: boolean } = {}, ms = 120_000): Promise<Started> {
  const { holdSettled, ...start } = args;
  return startedGame(owner, roomId, await owner.c.action(api.owner.start, { roomId, ...start }), ms, holdSettled);
}

/**
 * The game a start result (from `api.owner.start` or the MCP `start_game` tool) begins, waiting out `preparing` and
 * then hold rarity's corrections (engine/hold.ts): they re-score the starting objects once during planning, so a test
 * reading scores right after the start would otherwise race them. `holdSettled: false` returns without waiting
 * (game-hold.test.ts watches the computing state itself).
 */
export async function startedGame(owner: God, roomId: string, started: any, ms = 120_000, holdSettled = true): Promise<Started> {
  const settled = async (g: Started) => {
    if (!holdSettled) return g;
    await waitFor(async () => (await admin.query(internal.testing.rawGameDoc, { gameId: g.gameId }))?.holdState !== "computing" || undefined,
      "hold rarity's corrections are in", ms, 100);
    return g;
  };
  if (started?.status !== "preparing") {
    assert.ok(started?.gameId, `the start began a game: ${JSON.stringify(started)}`);
    return settled({ gameId: started.gameId, shortCode: started.shortCode, guid: started.guid });
  }
  const game = await waitFor(async () => {
    const room = await owner.c.query(api.rooms.get, { room: roomId });
    if (room.preparing?.error) throw new Error(`the game in ${roomId} failed to prepare: ${room.preparing.error}`);
    return room.activeGame;
  }, `the prepared game in ${roomId} starts`, ms, 500);
  const { guid } = await owner.c.query(api.games.header, { code: game.shortCode });
  return settled({ gameId: game.id, shortCode: game.shortCode, guid });
}

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
