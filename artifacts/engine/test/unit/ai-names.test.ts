/**
 * AI seat names (convex/lib/aiNames.ts): pure, no backend. Each test names the break it catches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_NAMES, aiSeatName, renameInRecord } from "../../convex/lib/aiNames.ts";

test("the pool: unique, short, two-word, alliterative titles", () => {
  // Catches: a duplicate or overlong entry slipping into the lists, or a word that breaks the alliteration rule.
  assert.ok(AI_NAMES.length >= 150, `a deep pool: ${AI_NAMES.length}`);
  assert.equal(new Set(AI_NAMES.map(n => n.toLowerCase())).size, AI_NAMES.length, "no duplicates");
  for (const name of AI_NAMES) {
    assert.ok(name.length <= 18, `fits a list row: ${name}`);
    const words = name.split(" ");
    assert.equal(words.length, 2, `two words: ${name}`);
    assert.equal(words[0]![0], words[1]![0], `alliterative: ${name}`);
  }
});

test("deterministic from the seed", () => {
  // Catches: Math.random or iteration-order dependence (replays and tests need stable names).
  assert.equal(aiSeatName("room-1#ai:a", []), aiSeatName("room-1#ai:a", []));
  const spread = new Set(["a", "b", "c", "d", "e", "f"].map(s => aiSeatName(`seed-${s}`, [])));
  assert.ok(spread.size >= 4, `different seeds spread over the pool: ${[...spread].join(", ")}`);
});

test("never repeats a name already in the room, whatever its case", () => {
  // Catches: the two-"Sonnet Strategist" bug, and a case-sensitive comparison.
  const first = aiSeatName("s", []);
  const second = aiSeatName("s", [first.toUpperCase()]);
  assert.notEqual(second.toLowerCase(), first.toLowerCase());
  const room: string[] = ["Ada Lovelace"];
  for (let i = 0; i < 8; i++) room.push(aiSeatName(`seat-${i}`, room));
  assert.equal(new Set(room.map(n => n.toLowerCase())).size, room.length, `eight unique: ${room.join(", ")}`);
});

test("prefers an initial no other seat starts with, so names differ at a glance", () => {
  // Catches: "Binary Bard" beside "Byte Beacon" when fresh letters remain.
  const room: string[] = [];
  for (let i = 0; i < 8; i++) room.push(aiSeatName(`glance-${i}`, room));
  assert.equal(new Set(room.map(n => n[0])).size, 8, room.join(", "));
});

test("stays unique when every pool name is taken", () => {
  // Catches: returning a taken name (or looping forever) once the pool runs out.
  const name = aiSeatName("full", AI_NAMES);
  assert.ok(!AI_NAMES.includes(name));
  assert.match(name, / II$/);
  const next = aiSeatName("full", [...AI_NAMES, name]);
  assert.notEqual(next, name);
});

test("renameInRecord renames a god in a stored game record's roster, leaderboard and winners", () => {
  // Catches: the migration fixing the live room but leaving past results under the old shared name.
  const record = {
    roster: [{ id: "ai:1", name: "Sonnet Strategist", kind: "ai" }, { id: "h", name: "Ada", kind: "human" }],
    leaderboard: [{ deityId: "ai:1", name: "Sonnet Strategist", kind: "ai", totalPayoff: 3, rank: 1 }],
    winners: [{ deityId: "ai:1", name: "Sonnet Strategist", kind: "ai" }],
    other: 7,
  };
  const out = renameInRecord(record, new Map([["ai:1", "Pixel Prophet"]])) as typeof record;
  assert.deepEqual(out.roster.map(r => r.name), ["Pixel Prophet", "Ada"]);
  assert.equal(out.leaderboard[0]!.name, "Pixel Prophet");
  assert.equal(out.winners[0]!.name, "Pixel Prophet");
  assert.equal(out.other, 7);
  assert.equal(record.roster[0]!.name, "Sonnet Strategist", "the input is not mutated");
  assert.equal(renameInRecord(undefined, new Map()), undefined);
});

test("an avoided name is never returned but does not use up its initial", () => {
  // Catches: the template name pushing every seat off its initial (or being returned when it is a pool name).
  const seed = AI_NAMES.map((_, i) => `avoid-${i}`).find(s => aiSeatName(s, [])[0] === "S")!;
  const first = aiSeatName(seed, []);
  assert.equal(aiSeatName(seed, [], ["Sonnet Strategist"]), first, "a non-pool avoided name changes nothing");
  assert.notEqual(aiSeatName(seed, [], [first]), first, "an avoided pool name is skipped");
});
