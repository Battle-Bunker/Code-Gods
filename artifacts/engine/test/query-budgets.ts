/**
 * The query-cost gate's budget table (docs/convex-read-architecture.md R8; test/game-query-cost.test.ts measures it,
 * test/unit/query-budgets.test.ts checks it lists every query a page subscribes to).
 *
 * Every public query the app or the player client subscribes to has one row. In a running 1,000-object game each one:
 *   - reads at most LIMITS.docs documents and LIMITS.bytes bytes;
 *   - runs in at most LIMITS.ms of user code (median of 10 uncached runs);
 *   - if `cold` (its answer does not depend on what a tick writes), is still cached after 5 tick commits;
 *   - refuses a caller who is not signed in (sign-in is required everywhere, owner decision 2026-11-02), unless `open`
 *     says why it was decided open.
 *
 * `debt` lists today's offenders with their measured ceilings (a little headroom above the measurement): the gate
 * passes on them, fails on any regression past the ceiling, and the list shrinks PR by PR (read-architecture §6). A
 * row without `debt` is held to the limits. Never raise a ceiling to make a change pass: fix the query.
 */
const KiB = 1024;
export const LIMITS = { docs: 100, bytes: 64 * KiB, ms: 50 } as const;

/** What the measured game provides for the queries' arguments. */
export type Fixture = {
  roomId: string; roomCode: string; gameId: string; gameCode: string; setupId: string; panelSlug: string;
  /** A pending device-flow request for the room (POST /api/device/request). */
  userCode: string;
  /** The commandId of the player's summon in the game (it has a receipt). */
  commandId: string;
  /** An ended game (another room of the same players) whose replay is stored. */
  endedRoomId: string; endedGameId: string;
  /** One object of the running game. */
  objectId: string;
};

export type Debt = {
  docs?: number; bytes?: number; ms?: number;
  /**
   * What it reads grows with stored data up to a cap (not with the world): the ceiling is the cap, and staying under
   * R8 on the measuring deployment does not pay it off.
   */
  capped?: true;
  /** A cold query that a tick commit still invalidates. */
  invalidatedByTick?: true;
  /** The PR of the read-architecture plan (§6) that pays it off, and why it is over. */
  why: string;
};

export type Budget = {
  /** As the backend logs it: "<module path>:<export>", e.g. "auth/credentials:list". */
  query: string;
  /** Where a page subscribes to it. */
  subscribedBy: string;
  /** Its arguments; `run` is unique per call, for a query whose cache is not keyed by the caller (no `ctx.auth`). */
  args: (f: Fixture, run: string) => Record<string, unknown>;
  /** Who calls it in the measurement: a seated player in the game's room (default), or a site admin. */
  as?: "player" | "admin";
  /** Its answer does not depend on what a tick writes, so a tick must not invalidate it. */
  cold: boolean;
  /** Decided open to signed-out callers (owner, 2026-11-02): why. */
  open?: string;
  debt?: Debt;
};

export const BUDGETS: Budget[] = [
  // ---- site shell, home, sheets -------------------------------------------------------------------------------------
  { query: "auth/user:me", subscribedBy: "site/lib/convex.tsx (session)", args: () => ({}), cold: true,
    open: "answers null when signed out: the app asks it to learn whether to show the sign-in screen" },
  { query: "version:current", subscribedBy: "lib/player-client update.ts (deploy auto-update)",
    // It reads no ctx.auth, so one execution serves every caller: each run asks with a build of its own, as each page does.
    args: (_, run) => ({ own: { site: "app", build: `gate-${run}` } }), cold: true,
    open: "the deploy auto-update: names the live builds only" },
  { query: "rooms:list", subscribedBy: "site/pages/home.tsx", args: () => ({}), cold: true },
  { query: "setups:list", subscribedBy: "site/components/layout.tsx, core/palette/use-commands.ts", args: () => ({}), cold: true,
    debt: { capped: true, docs: 1100, bytes: 640 * KiB, ms: 200,
      why: "the whole shared catalogue, capped (setups.ts LIST_CAP 500 + the caller's own + one owner name each): page it (R1). Measured 306 docs, 234 KiB, 51 ms on a dev deployment after one test:game run" } },
  { query: "setups:get", subscribedBy: "site/pages/configure.tsx", args: f => ({ setupId: f.setupId }), cold: true },
  { query: "aiTemplates:catalog", subscribedBy: "site/hooks/use-agents.ts", args: () => ({}), cold: true },
  { query: "aiTemplates:adminList", subscribedBy: "site/hooks/use-agents.ts (admin)", args: () => ({}), as: "admin", cold: true },
  { query: "auth/credentials:list", subscribedBy: "site/components/sheets.tsx", args: () => ({}), cold: true },
  { query: "auth/device:pending", subscribedBy: "site/pages/device.tsx", args: f => ({ userCode: f.userCode }), cold: true },
  { query: "agent/connect:pending", subscribedBy: "site/pages/connect.tsx",
    // An unknown request key: the MCP OAuth flow is not driven here, so this measures the lookup only.
    args: () => ({ request: "gate-unknown-request-key-0000" }), cold: true },
  // ---- room page, game page ----------------------------------------------------------------------------------------
  { query: "rooms:get", subscribedBy: "site/pages/room.tsx, configure.tsx, game.tsx, core/app.tsx, sdk useRoom", args: f => ({ room: f.roomId }), cold: true },
  { query: "rooms:history", subscribedBy: "site/pages/room.tsx, core/game/past-games.ts", args: f => ({ room: f.roomId }), cold: true },
  { query: "games:resolve", subscribedBy: "lib/player-client catalog (game links)", args: f => ({ code: f.gameCode }), cold: true },
  { query: "games:header", subscribedBy: "site/pages/game.tsx (routing, the spectator's header)", args: f => ({ code: f.gameCode }), cold: true },
  { query: "games:standings", subscribedBy: "site/components/game-panels.tsx Leaderboard", args: f => ({ gameId: f.gameId }), cold: false },
  { query: "games:standingsHistory", subscribedBy: "race series (cursor-paged)", args: f => ({ gameId: f.gameId }), cold: false },
  { query: "games:instance", subscribedBy: "site/pages/game.tsx (object type, utility catalog)", args: f => ({ gameId: f.gameId }), cold: true },
  { query: "games:objectIds", subscribedBy: "site/components/game-panels.tsx Objects (skeleton)",
    args: f => ({ gameId: f.gameId, paginationOpts: { numItems: 50, cursor: null } }), cold: false },
  { query: "games:object", subscribedBy: "site/components/game-panels.tsx ObjectRow (one per visible row)", args: f => ({ objectId: f.objectId }), cold: false },
  { query: "rooms:chat", subscribedBy: "site/components/game-panels.tsx Chat (the game's chat)",
    args: f => ({ roomId: f.roomId, gameId: f.gameId, paginationOpts: { numItems: 50, cursor: null } }), cold: true },
  // ---- the dock -----------------------------------------------------------------------------------------------------
  { query: "layout:current", subscribedBy: "dock/shell.tsx", args: f => ({ roomId: f.roomId }), cold: true,
    debt: { ms: 80, why: "its module loads the zod layout schemas (measured 31-42 ms of user code): split the module" } },
  { query: "panels:list", subscribedBy: "dock/panels.tsx", args: () => ({}), cold: true },
  { query: "panels:code", subscribedBy: "shell/stored-frame.tsx", args: f => ({ slug: f.panelSlug }), cold: true },
  { query: "assistant:status", subscribedBy: "core/chat/pane.tsx, core/palette/use-commands.ts", args: f => ({ roomId: f.roomId }), cold: true },
  { query: "assistant:transcript", subscribedBy: "core/chat/pane.tsx", args: f => ({ roomId: f.roomId, gameId: f.gameId }), cold: true },
  { query: "assistant:threads", subscribedBy: "core/palette/use-commands.ts (Past conversations, while the page is open)",
    args: f => ({ roomId: f.roomId, gameId: f.gameId }), cold: true },
  { query: "receipts:get", subscribedBy: "core/palette/use-commands.ts (Check a command's status, while the page is open)",
    args: f => ({ roomId: f.roomId, commandId: f.commandId }), cold: true },
  { query: "replays:stored", subscribedBy: "core/replay/replay-game.tsx (whether an ended game's replay is stored)",
    args: f => ({ roomId: f.endedRoomId, gameId: f.endedGameId }), cold: true },
  { query: "code/runs:get", subscribedBy: "core/panels/code-output.tsx", args: f => ({ roomId: f.roomId }), cold: true },
  { query: "player:myUtility", subscribedBy: "sdk useMyCard/useEvaluator, lib/player-client state.ts", args: f => ({ roomId: f.roomId }), cold: true },
  { query: "player:game", subscribedBy: "core/play.tsx (an ended game's final state)", args: f => ({ roomId: f.roomId, gameId: f.gameId }), cold: false,
    debt: { docs: 1200, bytes: 800 * KiB, ms: 150, why: "PR 3/5: the whole world for an ended game's final state (measured 1,030 docs, 572 KiB, 54 ms)" } },
  { query: "player:observation", subscribedBy: "sdk hooks (every dock panel), lib/player-client state.ts", args: f => ({ roomId: f.roomId }), cold: false,
    debt: { docs: 1250, bytes: 1024 * KiB, ms: 200, why: "PR 5: the whole world for every dock panel (measured 1,051 docs, 724 KiB, 89 ms)" } },
  { query: "player:events", subscribedBy: "sdk useEvents, lib/player-client state.ts", args: f => ({ roomId: f.roomId, limit: 200 }), cold: false,
    debt: { bytes: 480 * KiB, ms: 150, why: "PR 5/6: pages of tickBatches, about 12 KiB each (measured 26 docs, 320 KiB, 60 ms)" } },
  { query: "player:trajectories", subscribedBy: "sdk useTrajectories", args: f => ({ roomId: f.roomId, gameId: f.gameId, limit: 200 }), cold: false,
    debt: { bytes: 480 * KiB, ms: 150, why: "PR 5: pages of tickBatches, about 12 KiB each (measured 27 docs, 331 KiB, 60 ms)" } },
  { query: "player:objectsPage", subscribedBy: "sdk bridge (stored panels' compatibility shape)", args: f => ({ roomId: f.roomId }), cold: false },
  { query: "player:objectIds", subscribedBy: "core/panels/objects.tsx (skeleton), sdk useObjectIds",
    args: f => ({ gameId: f.gameId, sort: "payoff", paginationOpts: { numItems: 50, cursor: null } }), cold: false },
  { query: "player:object", subscribedBy: "core/panels/objects.tsx (one per visible row), sdk useObject", args: f => ({ objectId: f.objectId }), cold: false },
  { query: "player:objectsTop", subscribedBy: "sdk useObjectsTop", args: f => ({ gameId: f.gameId, n: 20 }), cold: false },
  { query: "player:totals", subscribedBy: "core/panels/objects.tsx (footer), sdk useTotals", args: f => ({ gameId: f.gameId }), cold: false },
  { query: "player:objectDigest", subscribedBy: "sdk useObjectDigest (others-care scatter)", args: f => ({ gameId: f.gameId }), cold: false },
];

/** The client reference of a logged identifier: "auth/credentials:list" → api.auth.credentials.list (of `api`). */
export function refOf<T>(api: T, identifier: string): unknown {
  const [path, name] = identifier.split(":");
  return [...path.split("/"), name].reduce((ref: any, part) => ref[part], api);
}

/** "api.auth.credentials.list" (a client reference) → "auth/credentials:list" (the log's identifier). */
export function identifierOf(ref: string): string {
  const parts = ref.replace(/^api\./, "").split(".");
  return `${parts.slice(0, -1).join("/")}:${parts[parts.length - 1]}`;
}
