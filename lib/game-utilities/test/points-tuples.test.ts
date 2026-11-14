/**
 * Points tuples in player-facing rule text (owner 2026-11-03; src/tuples.ts): a rule says what earns primary points,
 * then what earns or deducts secondary points (and tertiary…), with the goal first ("Try to…"); it never talks about
 * winning or ties. What would break: a family's summary or card text slipping back to "Most points wins. If that's a
 * tie, …", or a multi-tier rule that leaves a tier unnamed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { available, card, context, familiesFor, impactText, playableInstantiations, tierName, tierPoints, tupleText } from "../src/index.ts";

let seed = 7;
const rng = { int: (b: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % b; }, big: (b: bigint) => BigInt(rng.int(Number(b))) };

/** Every family on every playable shape, with a few sampled params: its card (summary, theme and the card source). */
function* cards() {
  for (const inst of playableInstantiations("Grid")) {
    const ctx = context(inst);
    for (const f of familiesFor(inst.objectType)) {
      if (!available(f, inst).ok) continue;
      for (let i = 0; i < 2; i++) {
        const c = card({ familyId: f.id, params: f.sample(rng, ctx) }, ctx);
        yield { key: `${inst.key} ${f.id}`, c, tiers: c.shape.kind === "tuple" ? c.shape.arity : 1 };
      }
    }
  }
}

/** The source's comments: what a player reads in their card's code (identifiers are not text). */
const comments = (src: string) => src.split("\n").filter(l => /^\s*(#|\/\/|\*|\/\*\*|"""|')/.test(l) || /"""/.test(l)).join("\n");

test("the tuple vocabulary: tier names, impacts and board totals", () => {
  assert.deepEqual([0, 1, 2].map(tierName), ["primary", "secondary", "tertiary"]);
  assert.equal(impactText([1, 0]), "(+1, 0)");
  assert.equal(impactText([0, -3]), "(0, −3)");
  assert.equal(impactText([1]), "(+1)", "a single-tier rule shows a 1-tuple");
  assert.equal(tupleText([4, -10]), "(4, −10)");
  assert.equal(tierPoints(1, 0, 2), "1 primary point");
  assert.equal(tierPoints(3, 1, 2), "3 secondary points");
  assert.equal(tierPoints(2, 0, 1), "2 points", "one tier: plain points");
});

test("no rule text talks about winning or ties, and every multi-tier rule names each tier", () => {
  const bad: string[] = [], unnamed: string[] = [];
  const seen = new Set<string>();
  for (const { key, c, tiers } of cards()) {
    const family = key.split(" ").pop()!;
    const texts = [c.summary, c.theme, comments(c.source.python), comments(c.source.typescript)];
    if (c.penalty) texts.push(c.penalty.summary, comments(c.penalty.source.python), comments(c.penalty.source.typescript));
    const hit = texts.find(t => /\bwins?\b|\btie/i.test(t));
    if (hit && !seen.has(`w:${family}`)) { seen.add(`w:${family}`); bad.push(`${key}: ${/[^.]*(\bwins?\b|\btie)[^.]*/i.exec(hit)![0].trim()}`); }
    const missing = Array.from({ length: tiers }, (_, k) => tierName(k)).filter(n => tiers > 1 && !c.summary.includes(n));
    if (missing.length && !seen.has(`t:${family}`)) { seen.add(`t:${family}`); unnamed.push(`${key}: no ${missing.join(", ")}`); }
  }
  assert.deepEqual(bad, [], "rule text that talks about winning or ties");
  assert.deepEqual(unnamed, [], "multi-tier rules whose summary does not name every tier");
});

test("every rule states its goal first: its summary starts with \"Try to\"", () => {
  const off = new Map<string, string>();
  for (const { key, c } of cards()) {
    const family = key.split(" ").pop()!;
    if (!c.summary.startsWith("Try to") && !off.has(family)) off.set(family, `${key}: ${c.summary.slice(0, 60)}…`);
    if (c.penalty && !c.penalty.summary.startsWith("Try to") && !off.has(c.penalty.familyId)) off.set(c.penalty.familyId, c.penalty.summary.slice(0, 60));
  }
  assert.deepEqual([...off.values()], []);
});
