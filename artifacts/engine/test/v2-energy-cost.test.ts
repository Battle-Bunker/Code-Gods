/**
 * What the dynamic energy measure costs in the Convex runtime (docs/engine-v2/energy.md, step 5 of the cutover): every
 * commit re-estimates each seat's energy on the changed line, and a look estimates the looker's own energy afresh.
 * Read from the backend's execution log, in a short beginner line game with practice partners. Convex stops a mutation
 * at 1 s; the margins below keep each well inside it.
 *
 * What would break: an estimator change (more starts, dearer heuristics) that makes a commit or a look approach the
 * limit, which would fail ticks or looks in real games.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, executionLog, humans, perform } from "./v2-helpers.ts";

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const ms = (e: { executionTime: number; userExecutionTime?: number | null }) => (e.userExecutionTime ?? e.executionTime) * 1000;

test("a commit and a look stay well inside a mutation's second on the beginner lines", { timeout: 300_000 }, async () => {
  const [ada] = await humans("Cost Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Cost room", preset: "lines-beginner" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.equal((await perform(ada!, "room.settings", { overrides: { planningSeconds: 5, worldSeconds: 90 } }, { roomId })).ok, true);
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 3 });
  const log = await executionLog(["Mutation"]);
  try {
    const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
    await perform(ada!, "game.startWorldNow", {}, { gameId });
    let looks = 0;
    const deadline = Date.now() + 240_000;
    while ((await ada!.query("v2/games:header", { gameId })).phase !== "ended") {
      assert.ok(Date.now() < deadline, "the game ends within 4 minutes");
      // Look at every object (the dearest look) a few times while the game runs.
      if (looks < 6 && (await perform(ada!, "object.look", {}, { gameId }).catch(() => null))?.ok) looks++;
      await new Promise(r => setTimeout(r, 2000));
    }
    await log.until(of => of("v2/loop:commit").length >= 10, "ten commits");
    const commits = log.of("v2/loop:commit").map(ms), lookRuns = log.of("v2/ops/object:look").map(ms);
    console.log(`commit: n ${commits.length}, median ${median(commits).toFixed(0)} ms, max ${Math.max(...commits).toFixed(0)} ms; look (every object): n ${lookRuns.length}, median ${lookRuns.length ? median(lookRuns).toFixed(0) : "-"} ms, max ${lookRuns.length ? Math.max(...lookRuns).toFixed(0) : "-"} ms`);
    assert.ok(Math.max(...commits) < 600, `a commit's slowest run: ${Math.max(...commits)} ms`);
    assert.ok(lookRuns.length > 0, "Ada looked");
    assert.ok(Math.max(...lookRuns) < 600, `a look's slowest run: ${Math.max(...lookRuns)} ms`);
  } finally { await log.stop(); }
});
