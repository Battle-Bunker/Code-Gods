/**
 * The what-if pane's model (integration plan §1.6): a mutator and its arguments tried on the focused line in the
 * browser, priced and scored by the same engine host the server's `object.quote` and `object.score` use. What would
 * break: the pane offering moves the board does not have, a wrong argument form, scores or prices that disagree with
 * the server's answer, points that ignore the others' want.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineType, lineQ, lineZ } from "@workspace/v2-linear";
import { familyOf } from "../src/sdk/rule.ts";
import { argError, mutatorChoices, whatIf } from "../src/panes/what-if-model.ts";

const rule = (family: string, tieBreaker: string | null, variant = lineZ) => ({ type: lineType, family: familyOf(family)!, params: {}, variant, tieBreaker });

test("the choices are the board's mutators, grouped by the representation they belong to first, with their arguments", () => {
  const cs = mutatorChoices(lineZ);
  assert.deepEqual(cs.map(c => c.id).sort(), [...lineZ.mutators].sort());
  const shift = cs.find(c => c.id === "si.shift")!;
  assert.equal(shift.rep, "si");
  assert.deepEqual(shift.args, [{ name: "k", kind: "number", fractions: false, start: "1" }]);
  const pivot = cs.find(c => c.id === "cart.pivot")!;
  assert.deepEqual(pivot.args.map(a => [a.name, a.start]), [["x0", "0"], ["k", "1"]]);
  const mirror = cs.find(c => c.id === "cart.mirror")!;
  assert.deepEqual(mirror.args, [{ name: "axis", kind: "choice", choices: ["x", "y", "origin", "diagonal"], start: "x" }]);
});

test("a number may be a fraction where the move takes one: everywhere on a fraction board, a stretch factor on any board", () => {
  const arg = (v: typeof lineZ, id: string) => mutatorChoices(v).find(c => c.id === id)!.args[0]!;
  assert.equal((arg(lineZ, "si.shift") as { fractions: boolean }).fractions, false);
  assert.equal((arg(lineQ, "si.shift") as { fractions: boolean }).fractions, true);
  const f = arg(lineZ, "mach.stretch") as { fractions: boolean; start: string };
  assert.equal(f.fractions, true);
  assert.ok(!["0", "1", "−1"].includes(f.start), `a stretch starts at a factor it accepts, not ${f.start}`);
});

test("a typed number is checked before anything is worked out", () => {
  assert.equal(argError("3", false), null);
  assert.equal(argError("−3", false), null);
  assert.match(argError("1/2", false)!, /whole numbers/);
  assert.equal(argError("1/2", true), null);
  assert.match(argError("", false)!, /Type a number/);
  assert.match(argError("abc", true)!, /Type a number/);
});

test("halving the outputs of y = 4x + 2 on a whole-number board gives y = 2x + 1", () => {
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-4,1,-2"), call: { mutator: "mach.stretch", args: { f: "1/2" } }, rarities: [], want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  assert.equal(lineType.encode(out.after), "-2,1,-1");
});

test("an unknown move is a refusal, never a crash", () => {
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "no.such", args: {} }, rarities: [], want: null });
  assert.equal(out.ok, false);
});

test("moving y = 2x + 3 up 1 under m Meets c: the line, the price and the score match the engine's own answers", () => {
  // y = 2x + 3 is the wire -2,1,-3. Up 1: y = 2x + 4. Main part |m − c|: 1 before, 2 after (worse).
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, rarities: [], want: null });
  assert.ok(out.ok);
  assert.equal(lineType.encode(out.after), "-2,1,-4");
  assert.ok(out.price > 0 && out.charge > out.price, "the charge is the price plus the radical surcharge");
  assert.ok(out.to.level < out.from.level, `step ${out.from.level} → ${out.to.level}: a worse main part is a lower step`);
  assert.equal(out.from.top, out.to.top);
  assert.match(out.what, /up/);
});

test("rarity comes from the dealt ladder at the step reached (capped at its top) and points are rarity times the want", () => {
  const rarities = Array.from({ length: 10 }, (_, i) => i * 1.5);
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.tilt", args: { k: "1" } }, rarities, want: 4 });
  assert.ok(out.ok);
  // y = 3x + 3: m = c, the main part's best; the step is at least the ladder's top here, so the cap applies.
  assert.equal(out.to.rarity, rarities[Math.min(out.to.level, rarities.length - 1)]);
  assert.equal(out.to.points, out.to.rarity! * 4);
  assert.equal(out.from.points, out.from.rarity! * 4);
});

test("without a want (a spectator, or none yet) there are no points; without rarities, no rarity", () => {
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, rarities: [], want: null });
  assert.ok(out.ok);
  assert.equal(out.to.rarity, null);
  assert.equal(out.to.points, null);
});

test("a move the board refuses says why in words, without the mutator's code name", () => {
  const zero = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "0" } }, rarities: [], want: null });
  assert.deepEqual(zero, { ok: false, reason: "k must not be 0" });
  const frac = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1/2" } }, rarities: [], want: null });
  assert.equal(frac.ok, false);
  assert.match((frac as { reason: string }).reason, /^k .*whole numbers/);
});
