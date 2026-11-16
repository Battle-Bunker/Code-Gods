/**
 * Two of the owner's guarantees, checked offline on every CI run (the live suites that also hold them, v2-disclosure
 * and v2-settings, need a local backend and run only when a session runs them):
 * - a player's object read carries the player's own value and the others' total, never a per-player value of anyone
 *   else (decision 32's disclosure; v1's "a player sees only their own utility");
 * - the beginner presets are 3 objects, a 600-second game and exact readings (decisions 31, 34; call 17).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { playObjectV } from "../../convex/v2/validators.ts";
import { PRESETS } from "../../convex/v2/presets.ts";

/** The field names an object validator allows, through unions and optionals. */
function fieldsOf(json: any): string[] {
  if (json.type === "union") return [...new Set<string>(json.value.flatMap(fieldsOf))];
  if (json.type === "object") return Object.keys(json.value);
  return [];
}

test("a player's object read carries their own value and the others' total, nothing per other player", () => {
  const json = (playObjectV as any).json;
  assert.deepEqual(Object.keys(json.value).sort(), ["bornAt", "changedAt", "changesSince", "knownAt", "lookPrice", "number", "objectId", "retiredAt", "state", "value", "version"].sort(),
    "a new top-level field on the object read needs a look at what it discloses (retiredAt: when the line retired, public like its birth)");
  // `parts` is the caller's OWN bits split by their own rule's layers (a tree-valued rule's points tree): still nothing per
  // other player.
  assert.deepEqual(fieldsOf(json.value.value.fieldType).sort(), ["parts", "points", "rarityBits", "score", "version", "want"].sort(),
    "the value is the caller's own: score, bits (and their own layers' parts), points, and `want` (the others' total), never a per-player breakdown");
});

test("the beginner presets: 3 objects, a 600-second game, exact readings", () => {
  const beginner = PRESETS.filter(p => p.id.includes("beginner"));
  assert.ok(beginner.length >= 2, "lines and grids beginner presets exist");
  for (const p of beginner) assert.deepEqual([p.id, p.startingObjects, p.worldSeconds, p.peerNoiseVariance], [p.id, 3, 600, 0]);
});

test("the default setup is the beginner lines on line-q, rational coefficients (owner decision 2; v1-audit §1.4)", async () => {
  const { DEFAULT_PRESET, presetOf } = await import("../../convex/v2/presets.ts");
  assert.deepEqual([DEFAULT_PRESET, presetOf(DEFAULT_PRESET).variant], ["lines-beginner", "line-q"]);
});
