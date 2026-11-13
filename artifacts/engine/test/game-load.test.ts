/**
 * Many games at once keep ticking (the quick mode of test/load-harness.ts; the manual mode is `pnpm --filter
 * @workspace/engine load`). Eight rooms of three gods start at the same moment, half with a mock AI seat, each human
 * summoning one or two agents during planning; every game is 45 world seconds long. CG_LOAD_GAMES=20 runs the same
 * checks at the size where the local backend (64 concurrent actions, one Node process) stops keeping up.
 *
 * What would break ("tick livelock", docs/production-readiness-backlog.md §1 items 1–2): with many games live, ticks
 * queue behind other actions, the planning tick comes tens of seconds late (or outlives its 30 s lease, the watchdog
 * takes the lease and the tick's work commits as "stale"); games start late, stop advancing and end late or never.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_KEY, SITE_, URL_ } from "./game-helpers.ts";
import { gameLines, ON_TIME_MS, runLoad, table } from "./load-harness.ts";

const GAMES = Number(process.env.CG_LOAD_GAMES ?? 8), PLANNING = 10, LIFETIME = 45;
/** Planning plus this: a game is running by then. */
const RUNNING_WITHIN_MS = 15_000;
/** No running game goes longer than this without a commit (ticks are about a second apart). */
const MAX_COMMIT_GAP_MS = 20_000;
/** The first window of a game whose first tick came on time covers about a second of world time. */
const FIRST_WINDOW_MAX_SECONDS = 5;

test(`${GAMES} games started together all run, keep committing and end on time`, { timeout: 180_000 }, async () => {
  const target = { url: URL_, siteUrl: SITE_, adminKey: ADMIN_KEY };
  const shape = { planningSeconds: PLANNING, lifetimeSeconds: LIFETIME, target, capMs: 75_000 + (PLANNING + LIFETIME) * 1000 };
  // Half the rooms with one mock AI seat (two humans), half with three humans: two runs of the harness started together
  // (their start instants are within the room setup's jitter of each other; each run's own rooms start at one moment).
  const half = Math.ceil(GAMES / 2);
  const [withAi, humansOnly] = await Promise.all([
    runLoad({ ...shape, games: half, aiSeats: 1, humans: 2 }),
    runLoad({ ...shape, games: GAMES - half, aiSeats: 0, humans: 3 }),
  ]);
  const games = [...withAi.games.map(g => ({ ...g, label: `ai#${g.index}` })), ...humansOnly.games.map(g => ({ ...g, label: `humans#${g.index}` }))];
  console.log(`${table([withAi, humansOnly])}\n${gameLines(withAi)}\n${gameLines(humansOnly)}`);

  // Every check runs, so one failing run names everything that is wrong.
  const problems: string[] = [];
  const every = (claim: string, why: (g: typeof games[number]) => string | false | null | undefined) => {
    const failing = games.flatMap(g => { const w = why(g); return w ? [`${g.label}: ${w}`] : []; });
    if (failing.length) problems.push(`NOT ${claim} (${failing.length}/${games.length} games): ${failing.slice(0, 4).join("; ")}${failing.length > 4 ? "; …" : ""}`);
  };
  every("every start succeeds", g => g.startError);
  every("every human's summons are accepted", g => g.summons.failed > 0 && `${g.summons.failed} summons failed: ${g.summons.errors[0]}`);
  every(`every game is running within ${RUNNING_WITHIN_MS / 1000} s of the end of planning`,
    g => (g.runningLateMs === null ? "never ran" : g.runningLateMs > RUNNING_WITHIN_MS && `running ${g.runningLateMs} ms after planning was due to end`));
  every("no game's first tick comes so late that its first window swallows the wait",
    g => (g.firstWindowWorldSeconds ?? 0) > FIRST_WINDOW_MAX_SECONDS && `its first window was already ${g.firstWindowWorldSeconds} world seconds in`);
  every("every game's commits advance", g => g.commits < LIFETIME / 3 && `only ${g.commits} commits`);
  every(`no running game goes ${MAX_COMMIT_GAP_MS / 1000} s without a commit`, g => (g.longestCommitGapMs ?? Infinity) > MAX_COMMIT_GAP_MS && `${g.longestCommitGapMs} ms without a commit`);
  every("no window is discarded", g => g.discarded > 0 && `${g.discarded} windows discarded`);
  every("no running game's lease is taken from a tick in flight",
    g => (g.seqExtraRunning ?? 0) > 0 && `${g.seqExtraRunning} leases taken without a commit (watchdog restarts or failed ticks)`);
  every("no game shows an engine error", g => g.engineErrors.length > 0 && `engine error: ${g.engineErrors.join("; ")}`);
  every(`every game ends within ${ON_TIME_MS / 1000} s of its due time by its own world clock`,
    g => (!g.ended ? "not ended" : g.endReason !== "lifetime" ? `ended by ${g.endReason}` : g.endLateMs! > ON_TIME_MS && `ended ${g.endLateMs} ms late`));
  every(`every game ends within ${ON_TIME_MS / 1000} s of planning + its lifetime after the start`,
    g => g.endVsScheduleMs !== null && g.endVsScheduleMs > ON_TIME_MS && `ended ${g.endVsScheduleMs} ms after planning + lifetime`);
  // Both runs read the same deployment-wide execution log: one count is the whole deployment's.
  if (withAi.logs.watchdogRestarts) problems.push(`NOT the watchdog restarts no game: it logged ${withAi.logs.watchdogRestarts} restarts`);
  if (withAi.logs.tooManyConcurrent) problems.push(`NOT the backend never refuses an action: ${withAi.logs.tooManyConcurrent} executions met "Too many concurrent requests"`);
  assert.deepEqual(problems, []);
});
