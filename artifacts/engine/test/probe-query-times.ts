/**
 * Times the public queries a page subscribes to against a live local game (not a test: run by hand).
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning test/probe-query-times.ts [seconds-to-run]
 * Each query is called 15 times over HTTP; the report is its median minus the median of a trivial query
 * (version:current), i.e. roughly the server-side cost, plus the size of its answer.
 */
import { admin, api, internal, gods, roomWith, startGame, sleep } from "./game-helpers.ts";

const runFor = Number(process.argv[2] ?? 45) * 1000;
const [alice, bob, carol] = await gods("Alice", "Bob", "Carol");
const objects0 = Number(process.env.OBJECTS ?? 0);
const { roomId, shortCode } = await roomWith([alice, bob, carol], objects0 ? { startingObjectCount: objects0 } : undefined);
const game = await startGame(alice, roomId);
console.log(`# game ${game.shortCode} in room ${shortCode}; letting it run ${runFor / 1000} s`);
await sleep(runFor);

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(label: string, call: () => Promise<unknown>) {
  const ms: number[] = [];
  let size = 0, error = "";
  for (let i = 0; i < 15; i++) {
    const t = performance.now();
    try { size = JSON.stringify(await call()).length; } catch (e) { error = String((e as Error).message).split("\n")[0].slice(0, 120); }
    ms.push(performance.now() - t);
  }
  return { label, median: median(ms), max: Math.max(...ms), size, error };
}

const c = alice.c;
const g = game.gameId;
// Polled while the game runs: each tick invalidates what it touched, so most of these calls execute (uncached); the
// server's own timings come from `npx convex logs --jsonl` (scripts aggregate them).
const polls: (() => Promise<unknown>)[] = [
  () => c.query(api.games.view, { code: game.shortCode }), () => c.query(api.rooms.get, { room: roomId }),
  () => c.query(api.player.observation, { roomId }), () => c.query(api.player.game, { roomId, gameId: g }),
  () => c.query(api.player.events, { roomId }), () => c.query(api.player.history, { roomId, gameId: g }),
  () => c.query(api.player.trajectories, { roomId }), () => c.query(api.player.objectsPage, { roomId }),
  () => c.query(api.player.series, { roomId }), () => c.query(api.player.board, { roomId }), () => c.query(api.layout.current, { roomId }),
  () => c.query(api.player.myUtility, { roomId }), () => c.query(api.rooms.list, {}),
];
const pollUntil = Date.now() + 30_000;
while (Date.now() < pollUntil) { await Promise.all(polls.map(p => p().catch(() => undefined))); await sleep(250); }
console.log(`# polled until ${new Date().toISOString()}`);
// Pieces of games.view, each uncached (a fresh n), 10 times (TEMPORARY profiling queries in convex/testing.ts).
for (const piece of ["profGameOnly", "profObjects", "profStandings", "profPublicGame", "profInstance", "profCatalog", "profChat"] as const)
  for (let n = 0; n < 10; n++) await admin.query((internal.testing as any)[piece], { code: game.shortCode, n: Date.now() + n });
console.log("# profiled the pieces");
const base = await time("version:current (baseline)", () => c.query(api.version.current, {}));
const rows = [
  await time("games:view", () => c.query(api.games.view, { code: game.shortCode })),
  await time("games:resolve", () => c.query(api.games.resolve, { code: game.shortCode })),
  await time("rooms:get", () => c.query(api.rooms.get, { room: roomId })),
  await time("rooms:list", () => c.query(api.rooms.list, {})),
  await time("rooms:history", () => c.query(api.rooms.history, { room: roomId })),
  await time("rooms:chatHistory", () => c.query(api.rooms.chatHistory, { roomId: roomId as never })),
  await time("player:observation", () => c.query(api.player.observation, { roomId })),
  await time("player:game", () => c.query(api.player.game, { roomId, gameId: g })),
  await time("player:events", () => c.query(api.player.events, { roomId })),
  await time("player:history", () => c.query(api.player.history, { roomId, gameId: g })),
  await time("player:trajectories", () => c.query(api.player.trajectories, { roomId })),
  await time("player:objectsPage", () => c.query(api.player.objectsPage, { roomId })),
  await time("player:myUtility", () => c.query(api.player.myUtility, { roomId })),
  await time("player:series", () => c.query(api.player.series, { roomId })),
  await time("player:board", () => c.query(api.player.board, { roomId })),
  await time("layout:current", () => c.query(api.layout.current, { roomId })),
  await time("panels:list", () => c.query(api.panels.list, {})),
  await time("assistant:status", () => c.query(api.assistant.status, { roomId: roomId as never })),
  await time("assistant:threads", () => c.query(api.assistant.threads, { roomId: roomId as never, gameId: g })),
  await time("setups:list", () => c.query(api.setups.list, {})),
  await time("aiTemplates:catalog", () => c.query(api.aiTemplates.catalog, {})),
  await time("auth/user:me", () => c.query(api.auth.user.me, {})),
  await time("activity:status", () => c.query(api.activity.status, {})),
  await time("code/runs:list", () => c.query(api.code.runs.list, { roomId })),
  await time("code/objects:list", () => c.query(api.code.objects.list, {})),
];
const objects = await admin.query(api.games.view, { code: game.shortCode }).then((v: any) => v.objects?.length ?? v.salience?.length ?? "?", () => "?");
console.log(`# baseline ${base.median.toFixed(1)} ms; objects in the world: ${objects}`);
for (const r of rows.sort((a, b) => b.median - a.median)) {
  const net = r.median - base.median;
  console.log(`${net > 50 ? "SLOW" : "    "} ${r.label.padEnd(22)} net ${net.toFixed(1).padStart(7)} ms  (median ${r.median.toFixed(1)}, max ${r.max.toFixed(1)})  ${(r.size / 1024).toFixed(1)} KiB${r.error ? `  ERROR ${r.error}` : ""}`);
}
await c.mutation(api.rooms.endActiveGame, { roomId: roomId as never }).catch(() => undefined);
// An ended game: the replay and the final view.
const ended = [
  await time("games:view (ended)", () => c.query(api.games.view, { code: game.shortCode })),
  await time("player:game (ended)", () => c.query(api.player.game, { roomId, gameId: g })),
  await time("player:replay (page 1)", () => c.query(api.player.replay, { roomId, gameId: g })),
];
for (const r of ended) console.log(`${r.median - base.median > 50 ? "SLOW" : "    "} ${r.label.padEnd(22)} net ${(r.median - base.median).toFixed(1).padStart(7)} ms  (max ${r.max.toFixed(1)})  ${(r.size / 1024).toFixed(1)} KiB${r.error ? `  ERROR ${r.error}` : ""}`);
