/**
 * Owner decision 21: replacing an agent's program costs only the change. The edit price is the description length
 * of a token-level edit script from the old program to the new (summon.ts), never more than the new program's full
 * price, and zero for an identical program.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { editBits, startersFor, summonBits } from "../src/index.ts";

const simple = startersFor("treasure", "typescript").find(a => a.kind === "simple")!.source;
const simplePy = startersFor("treasure", "python").find(a => a.kind === "simple")!.source;
const keepOff = (s: string) => s.replace("function agent(offer) {", "function agent(offer) {\n  if ([2, 9].includes(offer.object)) return null;   // the deal with Bo");
const keepOffPy = (s: string) => s.replace("def agent(offer):\n", "def agent(offer):\n    if offer.object in (2, 9):   # the deal with Bo\n        return None\n");

test("an identical program, or one that only changes comments and layout, costs nothing", () => {
  assert.equal(editBits("typescript", simple, simple).bits, 0);
  assert.equal(editBits("typescript", simple, simple.replace(/\/\/[^\n]*/g, "// changed") + "\n\n").bits, 0);
});

test("a one-line change (keep off two lines) costs a small fraction of the full price, in both languages", () => {
  for (const [lang, src, edit] of [["typescript", simple, keepOff], ["python", simplePy, keepOffPy]] as const) {
    const full = summonBits(lang, edit(src)).bits, change = editBits(lang, src, edit(src)).bits;
    assert.ok(change > 0, `${lang}: a change is not free`);
    assert.ok(change < full / 8, `${lang}: ${change.toFixed(1)} bits against a full ${full.toFixed(1)}`);
  }
  const ts = editBits("typescript", simple, keepOff(simple)).bits, py = editBits("python", simplePy, keepOffPy(simplePy)).bits;
  assert.ok(ts / py > 0.7 && ts / py < 1.4, `the same change costs about the same in both (${ts.toFixed(1)} vs ${py.toFixed(1)})`);
});

test("never more than the new program's full price; more change costs more", () => {
  const other = startersFor("square-area", "typescript").find(a => a.kind === "bold")!.source;
  const all = editBits("typescript", simple, other);
  assert.ok(all.bits <= summonBits("typescript", other).bits + 1e-9);
  const one = editBits("typescript", simple, keepOff(simple)).bits;
  const two = editBits("typescript", simple, keepOff(simple).replace("const FAR = 3;", "const FAR = 5;")).bits;
  assert.ok(two > one, "a second change adds to the price");
  assert.ok(editBits("typescript", simple, simple.replace("const FAR = 3;", "const FAR = 4;")).bits > 0);
  assert.equal(editBits("typescript", "", simple).bits, summonBits("typescript", simple).bits, "from nothing: the summon price");
});

test("deleting costs where and how much, not what is deleted; the price is in energy at the summon rate", () => {
  const without = simple.replace(/\n  contested\(offer, 3\);/, "");
  assert.notEqual(without, simple);
  const del = editBits("typescript", simple, without);
  assert.ok(del.bits > 0 && del.bits < 30, `${del.bits}`);
  assert.equal(del.energy, del.bits * summonBits("typescript", "x").energy / summonBits("typescript", "x").bits);
});

test("a rewrite too big to diff in bounded memory is priced as a new program; a shared start and end cost nothing", () => {
  const a = Array.from({ length: 2500 }, (_, i) => `const a${i} = ${i};`).join("\n");
  const b = Array.from({ length: 2500 }, (_, i) => `const b${i} = ${i + 1};`).join("\n");
  assert.equal(editBits("typescript", a, b).bits, summonBits("typescript", b).bits);
  const big = a + "\nconst middle = 1;\n" + a.replace(/a(\d)/g, "z$1");
  assert.ok(editBits("typescript", big, big.replace("const middle = 1;", "const middle = 2;")).bits < 30, "only the middle is diffed");
});
