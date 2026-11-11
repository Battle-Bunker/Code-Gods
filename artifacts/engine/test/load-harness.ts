/**
 * A load harness for the engine loop: N rooms created, all started at the same moment, each game short (a fixed
 * lifetime), every human god summoning one or two cheap agents during planning, optional mock AI seats. It measures
 * what the "tick livelock" (docs/production-readiness-backlog.md §1 items 1–2) looks like from outside: how long a
 * start takes to become a running game, whether each game's commits keep advancing, how often a lease was taken
 * without a commit (the watchdog restarting a tick that outlived its 30 s lease), and how late each game ends.
 *
 * Used by test/game-load.test.ts (quick mode, in the game suite) and scripts/load.ts (manual mode, any size).
 * Self-contained on purpose (its own clients from a `target`): the script must not import test/game-helpers.ts, whose
 * `after` hook ends EVERY live game of the deployment, which would be wrong on a shared dev deployment. This harness
 * ends only the games it started.
 *
 * What is exact and what is inferred (per game):
 *   exact     commits, discarded, acts, the final seq, createdAt, endedAt (the engine's own counters, `testing:loadProbe`);
 *   polled    start→running, the longest gap between commits, the game's due time: sampled every `pollMs` (1 s), so each
 *             is within one poll interval (plus the probe's own latency under load, recorded as `probeMs`);
 *   inferred  `seqExtraRunning`: lease bumps while running that were neither a commit nor a discard. Every commit and
 *             discard takes exactly one lease (engine/loop.ts scheduleTick), so the rest are watchdog restarts or failed
 *             ticks (tickFailed; `tickFailuresMax` tells them apart). A restarted tick's own commit returns "stale" and
 *             is counted nowhere by the engine, so this is the per-game count of ticks whose work was thrown away;
 *   logs      "watchdog: restarted N", "Queue wait expired", "act skipped (host)" and each function's execution times come
 *             from the backend's execution log (the admin stream `npx convex logs` reads). The backend keeps its last
 *             1,000 executions; a pull that returns that many may have lost some (`logOverruns` counts those pulls: the
 *             log numbers are then lower bounds). A dev.log file, when given, is counted too, but the local `convex dev`
 *             does not print function logs to its stdout, so those counts are 0 there whatever happened.
 */
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { VERSION } from "@workspace/player-client";

const api = anyApi as any, internal = anyApi as any;

export type Target = { url: string; siteUrl: string; adminKey: string };
export type LoadOptions = {
  games: number;
  /** Mock AI seats per game (rooms then need an admin owner: local deployments only). */
  aiSeats?: number;
  /** Human gods per game, each summoning `agentsPerHuman` agents right after the start (default 3 − aiSeats, at least 1). */
  humans?: number;
  /** Agents each human summons during planning (1 or 2; default alternates 1, 2 by seat). */
  humanAgents?: number;
  /** The game's fixed length in world seconds (settings.halfLifeSeconds with durationMode "fixed": `endAtWorld`). */
  lifetimeSeconds?: number;
  planningSeconds?: number;
  language?: "typescript" | "python";
  /** Extra room settings (interactionRateHz, startingObjectCount, …). */
  settings?: Record<string, unknown>;
  /** Stop waiting this long after the start call; unfinished games are reported as such and ended. */
  capMs?: number;
  pollMs?: number;
  target?: Target;
  /** The dev engine's log file (stdout of `pnpm --filter @workspace/engine dev`), counted between run start and end. */
  devLog?: string;
  log?: (line: string) => void;
};

type Sample = { t: number; phase: string; seq: number; commits: number; discarded: number; world: number };
export type GameMetrics = {
  index: number; roomId: string; gameId: string | null; humans: number; aiSeats: number;
  startError: string | null; preparing: boolean;
  /** ms from the start call: the start action returning, the game doc existing (its createdAt), phase "running". */
  startReturnedMs: number | null; gameCreatedMs: number | null; runningMs: number | null;
  /** ms phase "running" was first seen after planning was due to end (createdAt + planningSeconds). */
  runningLateMs: number | null;
  summons: { ok: number; failed: number; maxMs: number; errors: string[] };
  commits: number; discarded: number; acts: number; seq: number;
  /** Leases taken before the game ran (waits for a hold or a sandbox, and watchdog restarts of a planning tick that never came). */
  seqBeforeRunning: number | null;
  /** World seconds the first running sample already showed: a first window that swallowed the wait for a late tick. */
  firstWindowWorldSeconds: number | null;
  /** Inferred (see the header): leases taken while running without a commit or discard. */
  seqExtraRunning: number | null;
  tickFailuresMax: number; engineErrors: string[];
  longestCommitGapMs: number | null;
  ended: boolean; endReason: string | null; worldSeconds: number;
  /** endedAt − (createdAt + planning + lifetime): how late against the schedule the players were given. */
  endVsScheduleMs: number | null;
  /** endedAt − the due wall time (the first running sample's lastTick + the world seconds left then). */
  endLateMs: number | null;
  agentCount: number;
  samples: Sample[];
};
export type FunctionTimes = { count: number; errors: number; meanMs: number; p50Ms: number; p95Ms: number; maxMs: number; peakConcurrent: number };
export type LoadResult = {
  options: Required<Pick<LoadOptions, "games" | "aiSeats" | "humans" | "lifetimeSeconds" | "planningSeconds" | "language" | "capMs" | "pollMs">> & { settings: Record<string, unknown> };
  target: string; startedAt: string; wallMs: number; setupMs: number; capped: boolean;
  games: GameMetrics[];
  summary: Summary;
  logs: { source: string; watchdogRestarts: number; watchdogRuns: number; queueWaitExpired: number; actSkippedHost: number; tickFailed: number;
    /** Executions that met the backend's refusal "Too many concurrent requests … limited to N concurrent actions". */
    tooManyConcurrent: number; logOverruns: number; functions: Record<string, FunctionTimes>;
    /** Executions completed in each 5 s of the run (from the start call), by function. */
    timeline: Record<string, number[]>; errors: Record<string, number> };
  devLog: null | { file: string; watchdogRestarts: number; queueWaitExpired: number; actSkippedHost: number; tickFailed: number; lines: number };
  probe: { polls: number; p50Ms: number; maxMs: number };
};
export type Summary = {
  games: number; started: number; startFailed: number; reachedRunning: number;
  startToGameP50Ms: number | null; startToGameMaxMs: number | null;
  startToRunningP50Ms: number | null; startToRunningMaxMs: number | null;
  runningLateP50Ms: number | null; runningLateMaxMs: number | null;
  commits: number; discarded: number; seqExtraRunning: number; gamesRestarted: number;
  longestStallMaxMs: number | null; longestStallP50Ms: number | null;
  ended: number; endedOnTime: number; endLateP50Ms: number | null; endLateMaxMs: number | null;
  endVsScheduleP50Ms: number | null; endVsScheduleMaxMs: number | null;
  seqBeforeRunning: number; firstWindowWorldMaxSeconds: number | null;
  summonsFailed: number;
};

/** A game that ends within this of its due time ended "on time". */
export const ON_TIME_MS = 15_000;

export function localTarget(): Target {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const config = JSON.parse(readFileSync(`${root}/.convex/local/default/config.json`, "utf8"));
  return {
    url: `http://127.0.0.1:${config.ports?.cloud ?? 3210}`,
    siteUrl: process.env.CG_TEST_SITE_URL ?? `http://127.0.0.1:${config.ports?.site ?? 3211}`,
    adminKey: config.adminKey,
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const max = (values: number[]) => (values.length ? Math.max(...values) : null);
const message = (error: unknown) => {
  const data = (error as { data?: unknown })?.data as { message?: string } | string | undefined;
  return String(typeof data === "object" && data ? data.message ?? JSON.stringify(data) : data ?? (error as Error)?.message ?? error).slice(0, 240);
};
/** A few at a time: `fn` over `items`, at most `width` in flight. */
async function pooled<T, R>(items: T[], width: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const SOURCES = {
  typescript: "function agent(x) { return [add(1)]; }",
  python: "def agent(x):\n    return [add(1)]",
} as const;

type God = { subject: string; c: ConvexHttpClient };

/** The functions whose executions the result lists per 5 s bucket (`logs.timeline`). */
const TIMELINE = ["engine/tick:run", "engine/loop:commit", "runtime/acts:run", "runtime/compile:compile", "commands:submit", "ai/turn:run", "engine/hold:computeOne", "engine/loop:watchdog"];

/** The backend's execution log from now on: log lines and execution times by function, pulled continuously. */
function executionLog(target: Target) {
  const page = async (cursor: number) => {
    const response = await fetch(`${target.url}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${target.adminKey}` } });
    if (!response.ok) throw new Error(`the admin log stream answered ${response.status}`);
    return response.json() as Promise<{ entries: any[]; newCursor: number }>;
  };
  const times = new Map<string, { ms: number[]; errors: number; action: boolean; spans: [number, number][] }>();
  const counts = { watchdogRestarts: 0, watchdogRuns: 0, queueWaitExpired: 0, actSkippedHost: 0, tickFailed: 0, tooManyConcurrent: 0, logOverruns: 0 };
  const errors = new Map<string, number>();
  let cursor = 0, stopped = false, failure: string | undefined;
  const scan = (text: string) => {
    for (const m of text.matchAll(/watchdog: restarted (\d+)/g)) { counts.watchdogRestarts += Number(m[1]); counts.watchdogRuns++; }
    counts.queueWaitExpired += text.match(/Queue wait expired/gi)?.length ?? 0;
    counts.actSkippedHost += text.match(/act skipped \(host\)/g)?.length ?? 0;
    counts.tickFailed += text.match(/tick \S+#\d+ failed/g)?.length ?? 0;
    // Once per execution: the refusal is both its error and, where a caller caught it, a logged line.
    if (/TooManyConcurrentRequests|Too many concurrent requests/.test(text)) counts.tooManyConcurrent++;
  };
  const pull = async () => {
    const { entries, newCursor } = await page(cursor);
    cursor = newCursor;
    if (entries.length >= 1000) counts.logOverruns++;
    for (const e of entries) {
      if (e.kind !== undefined && e.kind !== "Completion") continue;
      const lines = (e.logLines ?? []).map((l: any) => {
        const text = typeof l === "string" ? l : (l.messages ?? []).join(" ");
        // Warnings and errors the functions logged, by function and (normalised) text.
        if (typeof l !== "string" && (l.level === "ERROR" || l.level === "WARN")) {
          const key = `${e.identifier} [${l.level}] ${text.replace(/[0-9a-z]{28,}|[0-9a-f-]{20,}|\d{3,}/g, "…").slice(0, 200)}`;
          errors.set(key, (errors.get(key) ?? 0) + 1);
        }
        return text;
      }).join("\n");
      const error = typeof e.error === "string" ? e.error : e.error ? JSON.stringify(e.error) : "";
      scan(`${lines}\n${error}`);
      if (!e.identifier) continue;
      const row = times.get(e.identifier) ?? { ms: [], errors: 0, action: e.udfType === "Action", spans: [] };
      const ms = (e.executionTime ?? 0) * 1000;
      row.ms.push(ms);
      // The entry's timestamp is its completion (measured: a 50 s summon sent at 1 s is stamped at 51 s).
      row.spans.push([e.timestamp * 1000 - ms, e.timestamp * 1000]);
      if (error) {
        row.errors++;
        const key = `${e.identifier}: ${error.replace(/[0-9a-f-]{20,}|\d{4,}/g, "…").slice(0, 160)}`;
        errors.set(key, (errors.get(key) ?? 0) + 1);
      }
      times.set(e.identifier, row);
    }
  };
  const loop = (async () => {
    cursor = (await page(0)).newCursor;
    while (!stopped) { try { await pull(); } catch (error) { failure ??= message(error); } await sleep(150); }
    try { await pull(); } catch { /* the last pull is best effort */ }
  })();
  /** The most executions of one function in flight at once (from each execution's start and duration). */
  const peak = (spans: [number, number][]) => {
    const edges = spans.flatMap(([from, to]) => [[from, 1], [to, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0, most = 0;
    for (const [, d] of edges) { now += d; most = Math.max(most, now); }
    return most;
  };
  return {
    /** `t0`: the start call's wall time, the origin of the timeline's buckets. */
    async stop(t0: number) {
      stopped = true; await loop;
      const functions: Record<string, FunctionTimes> = {};
      for (const [id, row] of [...times].sort((a, b) => b[1].ms.reduce((s, x) => s + x, 0) - a[1].ms.reduce((s, x) => s + x, 0)).slice(0, 25)) {
        functions[id] = {
          count: row.ms.length, errors: row.errors, meanMs: Math.round(row.ms.reduce((s, x) => s + x, 0) / row.ms.length),
          p50Ms: Math.round(quantile(row.ms, 0.5)!), p95Ms: Math.round(quantile(row.ms, 0.95)!), maxMs: Math.round(Math.max(...row.ms)), peakConcurrent: row.action ? peak(row.spans) : 0,
        };
      }
      // Executions completed per 5 s of the run, for the functions the loop is made of: where the work was and was not.
      const timeline: Record<string, number[]> = {};
      for (const id of TIMELINE) {
        const row = times.get(id);
        if (!row) continue;
        const buckets: number[] = [];
        for (const [, to] of row.spans) { const b = Math.floor((to - t0) / 5000); if (b >= 0) buckets[b] = (buckets[b] ?? 0) + 1; }
        timeline[id] = Array.from(buckets, n => n ?? 0);
      }
      return { timeline, source: `stream_function_logs${failure ? ` (a pull failed: ${failure})` : ""}`, ...counts, functions, errors: Object.fromEntries([...errors].sort((a, b) => b[1] - a[1]).slice(0, 20)) };
    },
  };
}

/** The dev log's lines written from now on, counted at `stop`. */
function devLogTail(file: string | undefined) {
  if (!file || !existsSync(file)) return { stop: () => null };
  const from = statSync(file).size;
  return {
    stop() {
      const fd = openSync(file, "r");
      try {
        const size = fstatSync(fd).size, buffer = Buffer.alloc(Math.max(0, size - from));
        readSync(fd, buffer, 0, buffer.length, from);
        const text = buffer.toString("utf8");
        return {
          file, lines: text.split("\n").length - 1,
          watchdogRestarts: [...text.matchAll(/watchdog: restarted (\d+)/g)].reduce((s, m) => s + Number(m[1]), 0),
          queueWaitExpired: text.match(/Queue wait expired/gi)?.length ?? 0,
          actSkippedHost: text.match(/act skipped \(host\)/g)?.length ?? 0,
          tickFailed: text.match(/tick \S+#\d+ failed/g)?.length ?? 0,
        };
      } finally { closeSync(fd); }
    },
  };
}

export async function runLoad(options: LoadOptions): Promise<LoadResult> {
  const target = options.target ?? localTarget();
  const aiSeats = options.aiSeats ?? 0, humans = options.humans ?? Math.max(1, 3 - aiSeats);
  const lifetimeSeconds = options.lifetimeSeconds ?? 75, planningSeconds = options.planningSeconds ?? 12;
  const language = options.language ?? "typescript", pollMs = options.pollMs ?? 1000;
  const capMs = options.capMs ?? (planningSeconds + lifetimeSeconds) * 1000 + 240_000;
  const say = options.log ?? (() => {});
  const settings = {
    languages: [language], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 0.2,
    planningSeconds, durationMode: "fixed", halfLifeSeconds: lifetimeSeconds, ...options.settings,
  };

  const adminAuth = (c: ConvexHttpClient, identity?: Record<string, unknown>) =>
    (c as unknown as { setAdminAuth(key: string, identity?: unknown): void }).setAdminAuth(target.adminKey, identity);
  // The clients do not echo the functions' log lines (a dev deployment sends them back): the execution log counts them.
  const admin = new ConvexHttpClient(target.url, { logger: false });
  adminAuth(admin);
  const seed = async (name: string, asAdmin: boolean): Promise<God> => {
    const subject = `test|${randomUUID()}`;
    const sid = await admin.mutation(internal.testing.seedUser, asAdmin
      ? { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" }
      : { subject, name, email: `${subject.slice(5, 13)}@test.local`, emailVerified: true });
    const c = new ConvexHttpClient(target.url, { logger: false });
    adminAuth(c, { subject, issuer: target.siteUrl, sessionId: sid });
    return { subject, c };
  };

  // Every sandbox warm first, so no start waits for one (as test/game-helpers.ts sandboxesWarm).
  const setupFrom = Date.now();
  const warmer = await seed("Load Warmer", false);
  const warm: { language: string; state: string; reason?: string }[] = (await warmer.c.action(api.manifest.node.warm, {})).sandboxes;
  for (const deadline = Date.now() + 120_000; ;) {
    const rows: any[] = (await admin.query(internal.testing.sandboxes, {})).filter((r: any) => warm.some(s => s.language === r.language));
    const failed = rows.find(r => r.state === "failed") ?? warm.find(s => s.state === "failed");
    if (failed) throw new Error(`The ${failed.language} sandbox cannot boot: ${failed.reason}`);
    if (rows.length === warm.length && rows.every(r => r.state === "ready")) break;
    if (Date.now() > deadline) throw new Error("Timed out: every agent sandbox ready");
    await sleep(250);
  }
  if (aiSeats) await admin.mutation(internal.aiTemplates.ensureSeeded, {});

  // All the rooms first (a few at a time: this is setup, not the load).
  type Room = { index: number; roomId: string; host: God; humans: God[]; aiSeats: number };
  const rooms = await pooled(Array.from({ length: options.games }, (_, i) => i), 4, async (i): Promise<Room> => {
    const members: God[] = [];
    for (let h = 0; h < humans; h++) members.push(await seed(`Load ${i}${"abcdefgh"[h]}`, aiSeats > 0 && h === 0));
    const [host, ...rest] = members;
    const { roomId, shortCode } = await host.c.mutation(api.rooms.create, {});
    await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
    for (const m of rest) await m.c.mutation(api.rooms.join, { room: shortCode });
    const room = await host.c.query(api.rooms.get, { room: roomId });
    await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings });
    for (let a = 0; a < aiSeats; a++) await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
    return { index: i, roomId, host, humans: members, aiSeats };
  });
  await rooms[0].host.c.mutation(api.activity.touch, {});
  const setupMs = Date.now() - setupFrom;
  say(`${rooms.length} rooms ready in ${Math.round(setupMs / 1000)} s; starting them all`);

  const games: GameMetrics[] = rooms.map(r => ({
    index: r.index, roomId: r.roomId, gameId: null, humans: r.humans.length, aiSeats: r.aiSeats, startError: null, preparing: false,
    startReturnedMs: null, gameCreatedMs: null, runningMs: null, runningLateMs: null, summons: { ok: 0, failed: 0, maxMs: 0, errors: [] },
    commits: 0, discarded: 0, acts: 0, seq: 0, seqBeforeRunning: null, firstWindowWorldSeconds: null, endVsScheduleMs: null, seqExtraRunning: null, tickFailuresMax: 0, engineErrors: [], longestCommitGapMs: null,
    ended: false, endReason: null, worldSeconds: 0, endLateMs: null, agentCount: 0, samples: [],
  }));
  const log = executionLog(target), devLog = devLogTail(options.devLog);
  await sleep(300);

  // The scripted humans: each summons one or two cheap agents as soon as its game exists (during planning).
  const summonAll = async (room: Room, gameId: string) => {
    const m = games[room.index];
    await Promise.all(room.humans.flatMap((god, seat) => Array.from({ length: options.humanAgents ?? 1 + seat % 2 }, async (_, k) => {
      const from = Date.now();
      try {
        const result = await god.c.action(api.commands.submit, { roomId: room.roomId, envelope: {
          version: VERSION, commandId: randomUUID(), gameId, command: { type: "summon", name: `Load agent ${seat}.${k}`, language, source: SOURCES[language] },
        } });
        if (result?.accepted) m.summons.ok++;
        else { m.summons.failed++; m.summons.errors.push(JSON.stringify(result?.error ?? result).slice(0, 200)); }
      } catch (error) { m.summons.failed++; m.summons.errors.push(message(error)); }
      m.summons.maxMs = Math.max(m.summons.maxMs, Date.now() - from);
    })));
  };

  // Every start at the same moment.
  const t0 = Date.now();
  const pending: Promise<void>[] = [];
  const begun = (room: Room, gameId: string) => { games[room.index].gameId = gameId; pending.push(summonAll(room, gameId)); };
  const starts = Promise.allSettled(rooms.map(async room => {
    const m = games[room.index];
    try {
      const started = await room.host.c.action(api.owner.start, { roomId: room.roomId });
      m.startReturnedMs = Date.now() - t0;
      if (started?.status === "preparing") m.preparing = true;
      else if (started?.gameId) begun(room, started.gameId);
      else m.startError = `no game: ${JSON.stringify(started).slice(0, 200)}`;
    } catch (error) { m.startReturnedMs = Date.now() - t0; m.startError = message(error); }
  }));

  // The poll: one probe for every known game each `pollMs`; a preparing room is asked for its game.
  type Track = { runningAt?: number; dueAt?: number; base?: { seq: number; commits: number; discarded: number }; lastChange?: number; lastCommits?: number; gap: number; live?: { seq: number; commits: number; discarded: number } };
  const tracks: Track[] = games.map(() => ({ gap: 0 }));
  const probeMs: number[] = [];
  let capped = false, startsDone = false;
  void starts.then(() => { startsDone = true; });
  for (;;) {
    const tick = Date.now();
    await Promise.all(rooms.filter(r => games[r.index].preparing && !games[r.index].gameId && !games[r.index].startError).map(async r => {
      try {
        const room = await r.host.c.query(api.rooms.get, { room: r.roomId });
        if (room.preparing?.error) games[r.index].startError = `preparing failed: ${room.preparing.error}`;
        else if (room.activeGame) begun(r, room.activeGame.id);
      } catch { /* asked again at the next poll */ }
    }));
    const known = games.filter(g => g.gameId && !g.ended);
    if (known.length) {
      try {
        const probe = await admin.query(internal.testing.loadProbe, { gameIds: known.map(g => g.gameId) });
        const at = Date.now();
        probeMs.push(at - tick);
        known.forEach((m, k) => {
          const g = probe.games[k], track = tracks[m.index];
          if (!g) return;
          m.gameCreatedMs ??= g.createdAt - t0;
          m.samples.push({ t: at - t0, phase: g.phase, seq: g.seq, commits: g.commits, discarded: g.discarded, world: Math.round(g.worldSeconds * 10) / 10 });
          Object.assign(m, { commits: g.commits, discarded: g.discarded, acts: g.acts, seq: g.seq, worldSeconds: g.worldSeconds, agentCount: g.agentCount });
          m.tickFailuresMax = Math.max(m.tickFailuresMax, g.tickFailures);
          if (g.engineError && !m.engineErrors.includes(g.engineError.reason)) m.engineErrors.push(g.engineError.reason);
          const live = g.phase === "running" || g.phase === "ended";
          if (live && track.runningAt === undefined) {
            track.runningAt = at; track.lastChange = at; track.lastCommits = g.commits;
            track.base = { seq: g.seq, commits: g.commits, discarded: g.discarded };
            // The world runs from lastTick: what is left of it then is when the game is due, with no downtime.
            track.dueAt = g.lastTick + (g.endAtWorld - g.worldSeconds) * 1000;
            m.runningMs = at - t0;
            m.seqBeforeRunning = g.seq - g.commits - g.discarded;
            m.firstWindowWorldSeconds = Math.round(g.worldSeconds * 10) / 10;
            m.runningLateMs = at - (g.createdAt + planningSeconds * 1000);
          }
          if (track.runningAt !== undefined) {
            if (g.commits !== track.lastCommits) { track.gap = Math.max(track.gap, at - track.lastChange!); track.lastChange = at; track.lastCommits = g.commits; }
            else if (g.phase === "running") track.gap = Math.max(track.gap, at - track.lastChange!);
            track.live = { seq: g.seq, commits: g.commits, discarded: g.discarded };
            m.longestCommitGapMs = track.gap;
            m.seqExtraRunning = (g.seq - track.base!.seq) - (g.commits - track.base!.commits) - (g.discarded - track.base!.discarded);
          }
          if (g.phase === "ended") {
            m.ended = true; m.endReason = g.endReason;
            if (g.endReason === "lifetime") m.endVsScheduleMs = g.endedAt - (g.createdAt + (planningSeconds + lifetimeSeconds) * 1000);
            if (g.endReason === "lifetime" && track.dueAt !== undefined) m.endLateMs = g.endedAt - track.dueAt;
          }
        });
      } catch (error) { say(`probe failed: ${message(error)}`); }
    }
    const waiting = games.filter(g => !g.startError && !g.ended);
    if (startsDone && !waiting.length) break;
    if (Date.now() - t0 > capMs) { capped = true; break; }
    if (probeMs.length % 15 === 0) {
      say(`${Math.round((Date.now() - t0) / 1000)} s: ${games.filter(g => g.gameId).length} games exist, ${games.filter(g => g.runningMs !== null).length} reached running, ` +
        `${games.filter(g => g.ended).length} ended, ${games.reduce((s, g) => s + g.commits, 0)} commits`);
    }
    await sleep(Math.max(0, pollMs - (Date.now() - tick)));
  }
  const wallMs = Date.now() - t0;
  // End what this run started (and only that), then let the summons settle so no call outlives the run.
  const mine = games.flatMap(g => (g.gameId && !g.ended ? [g.gameId] : []));
  if (mine.length) await admin.mutation(internal.testing.endGames, { gameIds: mine }).catch(error => say(`ending the unfinished games failed: ${message(error)}`));
  await Promise.race([Promise.allSettled([starts, ...pending]), sleep(20_000)]);
  for (const r of rooms) if (!games[r.index].gameId) await r.host.c.mutation(api.rooms.endActiveGame, { roomId: r.roomId }).catch(() => {});
  const logs = await log.stop(t0);

  const of = (pick: (g: GameMetrics) => number | null) => games.flatMap(g => { const v = pick(g); return v === null ? [] : [v]; });
  const summary: Summary = {
    games: games.length, started: games.filter(g => g.gameId).length, startFailed: games.filter(g => g.startError).length,
    reachedRunning: games.filter(g => g.runningMs !== null).length,
    startToGameP50Ms: quantile(of(g => g.gameCreatedMs), 0.5), startToGameMaxMs: max(of(g => g.gameCreatedMs)),
    startToRunningP50Ms: quantile(of(g => g.runningMs), 0.5), startToRunningMaxMs: max(of(g => g.runningMs)),
    runningLateP50Ms: quantile(of(g => g.runningLateMs), 0.5), runningLateMaxMs: max(of(g => g.runningLateMs)),
    commits: games.reduce((s, g) => s + g.commits, 0), discarded: games.reduce((s, g) => s + g.discarded, 0),
    seqExtraRunning: games.reduce((s, g) => s + (g.seqExtraRunning ?? 0), 0), gamesRestarted: games.filter(g => (g.seqExtraRunning ?? 0) > 0).length,
    longestStallMaxMs: max(of(g => g.longestCommitGapMs)), longestStallP50Ms: quantile(of(g => g.longestCommitGapMs), 0.5),
    ended: games.filter(g => g.ended && g.endReason === "lifetime").length,
    endedOnTime: games.filter(g => g.endLateMs !== null && g.endLateMs <= ON_TIME_MS).length,
    endLateP50Ms: quantile(of(g => g.endLateMs), 0.5), endLateMaxMs: max(of(g => g.endLateMs)),
    endVsScheduleP50Ms: quantile(of(g => g.endVsScheduleMs), 0.5), endVsScheduleMaxMs: max(of(g => g.endVsScheduleMs)),
    seqBeforeRunning: games.reduce((s, g) => s + (g.seqBeforeRunning ?? 0), 0), firstWindowWorldMaxSeconds: max(of(g => g.firstWindowWorldSeconds)),
    summonsFailed: games.reduce((s, g) => s + g.summons.failed, 0),
  };
  return {
    options: { games: options.games, aiSeats, humans, lifetimeSeconds, planningSeconds, language, capMs, pollMs, settings },
    target: target.url, startedAt: new Date(t0).toISOString(), wallMs, setupMs, capped, games, summary, logs, devLog: devLog.stop(),
    probe: { polls: probeMs.length, p50Ms: quantile(probeMs, 0.5) ?? 0, maxMs: max(probeMs) ?? 0 },
  };
}

const s1 = (ms: number | null) => (ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`);

/** One line per run (and a header): the summary table. */
export function table(results: LoadResult[]): string {
  const header = ["games", "ai", "started", "start→game p50/max", "start→running p50/max", "running late p50/max", "first window max", "commits", "discarded", "leases before running", "seq w/o commit running (games)", "watchdog restarts", "longest stall p50/max", "queue-wait-expired", "too-many-concurrent", "act skipped", "ended on time", "end late max", "end vs schedule p50/max"];
  const rows = results.map(r => {
    const s = r.summary;
    return [
      String(s.games), String(r.options.aiSeats), `${s.started}/${s.games}`, `${s1(s.startToGameP50Ms)}/${s1(s.startToGameMaxMs)}`,
      `${s1(s.startToRunningP50Ms)}/${s1(s.startToRunningMaxMs)} (${s.reachedRunning})`, `${s1(s.runningLateP50Ms)}/${s1(s.runningLateMaxMs)}`,
      s.firstWindowWorldMaxSeconds === null ? "-" : `${s.firstWindowWorldMaxSeconds}s world`,
      String(s.commits), String(s.discarded), String(s.seqBeforeRunning), `${s.seqExtraRunning} (${s.gamesRestarted})`,
      `${r.logs.watchdogRestarts}${r.devLog ? ` [dev.log ${r.devLog.watchdogRestarts}]` : ""}${r.logs.logOverruns ? "+" : ""}`,
      `${s1(s.longestStallP50Ms)}/${s1(s.longestStallMaxMs)}`,
      `${r.logs.queueWaitExpired}${r.devLog ? ` [dev.log ${r.devLog.queueWaitExpired}]` : ""}`,
      String(r.logs.tooManyConcurrent),
      `${r.logs.actSkippedHost}${r.devLog ? ` [dev.log ${r.devLog.actSkippedHost}]` : ""}`,
      `${s.endedOnTime}/${s.games} (${s.ended} ended)`, s1(s.endLateMaxMs), `${s1(s.endVsScheduleP50Ms)}/${s1(s.endVsScheduleMaxMs)}`,
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(" | ");
  return [line(header), widths.map(w => "-".repeat(w)).join("-|-"), ...rows.map(line)].join("\n");
}

/** One line per game: where each one got to. */
export function gameLines(result: LoadResult): string {
  return result.games.map(g =>
    `#${String(g.index).padStart(2)} ${g.startError ? `START FAILED: ${g.startError}` : `game ${s1(g.gameCreatedMs)} running ${s1(g.runningMs)} commits ${g.commits} disc ${g.discarded} ` +
      `first-window ${g.firstWindowWorldSeconds ?? "-"}s leases-before ${g.seqBeforeRunning ?? "-"} seq-extra ${g.seqExtraRunning ?? "-"} stall ${s1(g.longestCommitGapMs)} world ${g.worldSeconds.toFixed(0)}s agents ${g.agentCount} summons ${g.summons.ok}/${g.summons.ok + g.summons.failed} ` +
      `${g.ended ? `ended(${g.endReason}) late ${s1(g.endLateMs)} vs-schedule ${s1(g.endVsScheduleMs)}` : "NOT ENDED"}${g.engineErrors.length ? ` engineError: ${g.engineErrors.join("; ")}` : ""}`}`).join("\n");
}
