/**
 * "An optimum found is a bug" (CLAUDE.md), as a gate rather than a nightly report: two fixed-seed beginner line games
 * (scripts/pool-dynamics.ts defaults: 600 s, 3 objects, a birth every 240 s, drift 120 s, the Simple starters) must
 * keep moving to the end. The bounds are a floor against collapse (a frozen board or a pure two-state tug), not a
 * target to tune: on develop (15 Nov) these two games change 1.8 objects a minute in the last third, and 58% of the
 * last third's moves are on objects cycling between two states (the 20-game pool: 2.4 and 54%).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LATE_OBJECTS_PER_MINUTE = 0.75, MAX_TWO_STATE_SHARE = 0.8, MIN_LEVELS = 10;

test("two fixed-seed beginner line games keep moving in their last third, and not only between two states", { timeout: 600_000 }, () => {
  const out = join(mkdtempSync(join(tmpdir(), "dynamics-")), "d.json");
  execFileSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "scripts/pool-dynamics.ts", "--games", "2", "--json", out],
    { cwd: join(import.meta.dirname, ".."), stdio: ["ignore", "ignore", "inherit"] });
  const d = JSON.parse(readFileSync(out, "utf8")) as { _objectsPerMinute: number[][]; _tug: { lateMoves: number; lateOnTwoState: number; levels: number } };
  const late = d._objectsPerMinute[2]!, perMinute = late.reduce((a, b) => a + b, 0) / late.length;
  const twoState = d._tug.lateOnTwoState / Math.max(1, d._tug.lateMoves);
  assert.ok(perMinute >= LATE_OBJECTS_PER_MINUTE, `the last third changes ${perMinute.toFixed(2)} objects a minute (at least ${LATE_OBJECTS_PER_MINUTE})`);
  assert.ok(twoState <= MAX_TWO_STATE_SHARE, `${(100 * twoState).toFixed(0)}% of the last third's moves cycle between two states (at most ${100 * MAX_TWO_STATE_SHARE}%)`);
  assert.ok(d._tug.levels >= MIN_LEVELS, `${d._tug.levels} main-part levels stepped (at least ${MIN_LEVELS})`);
});
