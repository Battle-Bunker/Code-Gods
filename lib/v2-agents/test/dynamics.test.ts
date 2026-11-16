/**
 * "An optimum found is a bug" (CLAUDE.md), as a gate rather than a nightly report: four fixed-seed beginner line games
 * (scripts/pool-dynamics.ts defaults: 600 s, 3 objects, a birth every 240 s, drift 120 s, the Simple starters) must
 * keep moving to the end. The bounds are a floor against collapse (a frozen board or a pure two-state tug), set at the
 * measured present level, not a target to tune. Measured on develop after Divisibility Ladder left the deal (16 Nov,
 * #904): the last third changes 1.2 objects a minute, 68% of its moves are on objects cycling between two states, 81
 * main-part levels are stepped. Two games were too few: one deal moved the two-state share from 54% to 94%.
 * The target is at most 80% two-state (the tug is real and known); the dynamics work (turnover, pricing, the tuple
 * rules) owns bringing it down, and MAX_TWO_STATE_SHARE is lowered as it falls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LATE_OBJECTS_PER_MINUTE = 0.75, MAX_TWO_STATE_SHARE = 0.85, MIN_LEVELS = 40;

test("four fixed-seed beginner line games keep moving in their last third, and not only between two states", { timeout: 900_000 }, () => {
  const out = join(mkdtempSync(join(tmpdir(), "dynamics-")), "d.json");
  execFileSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "scripts/pool-dynamics.ts", "--games", "4", "--json", out],
    { cwd: join(import.meta.dirname, ".."), stdio: ["ignore", "ignore", "inherit"] });
  const d = JSON.parse(readFileSync(out, "utf8")) as { _objectsPerMinute: number[][]; _tug: { lateMoves: number; lateOnTwoState: number; levels: number } };
  const late = d._objectsPerMinute[2]!, perMinute = late.reduce((a, b) => a + b, 0) / late.length;
  const twoState = d._tug.lateOnTwoState / Math.max(1, d._tug.lateMoves);
  assert.ok(perMinute >= LATE_OBJECTS_PER_MINUTE, `the last third changes ${perMinute.toFixed(2)} objects a minute (at least ${LATE_OBJECTS_PER_MINUTE})`);
  assert.ok(twoState <= MAX_TWO_STATE_SHARE, `${(100 * twoState).toFixed(0)}% of the last third's moves cycle between two states (at most ${100 * MAX_TWO_STATE_SHARE}%)`);
  assert.ok(d._tug.levels >= MIN_LEVELS, `${d._tug.levels} main-part levels stepped (at least ${MIN_LEVELS})`);
});
