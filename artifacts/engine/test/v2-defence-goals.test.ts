/**
 * Defence goals (v1, restored by call 1) value badness through value tables. Every dealt rule is now scored by energy
 * (owner decision 50), so until a defence goal is restated in energy the room refuses the setting, on every preset
 * (docs/engine-v2/v1-audit.md §1.5). What would break: a room turning on a setting that silently does nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { humans, perform } from "./v2-helpers.ts";

test("defence goals: refused on every preset while every rule is scored by energy", { timeout: 120_000 }, async () => {
  const [ada] = await humans("Defence Ada");
  for (const preset of ["lines-beginner", "grids-beginner"]) {
    const roomId = (await perform(ada!, "room.create", { name: `Defence ${preset}`, preset })).result.roomId;
    await assert.rejects(perform(ada!, "room.settings", { overrides: { defenceGoals: true } }, { roomId }), /Defence goals are off for now/);
  }
});
