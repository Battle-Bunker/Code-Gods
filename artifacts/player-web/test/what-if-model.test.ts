/**
 * The what-if pane's model (integration plan §1.6): a mutator and its arguments tried on the focused line in the
 * browser, priced and scored by the same engine host the server's `object.quote` and `object.score` use. What would
 * break: the pane offering moves the board does not have, a wrong argument form, scores or prices that disagree with
 * the server's answer, points that ignore the others' want.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, type Score } from "@workspace/v2-core";
import { lineType, lineQ, lineQLenses, lineZ } from "@workspace/v2-linear";
import { familyOf } from "../src/sdk/rule.ts";
import { argError, formError, mutatorChoices, whatIf, wireArgs } from "../src/panes/what-if-model.ts";

const rule = (family: string, _tieBreaker: string | null, variant = lineZ) => ({ type: lineType, family: familyOf(family)!, params: familyOf(family)!.dealable(lineQ)[0], variant, tieBreaker: null });

test("the choices are the board's mutators, grouped by the representation they belong to first, with their arguments", () => {
  const cs = mutatorChoices(lineZ);
  assert.deepEqual(cs.map(c => c.id).sort(), [...lineZ.mutators].sort());
  const shift = cs.find(c => c.id === "si.shift")!;
  assert.equal(shift.rep, "si");
  const bare = (a: object) => { const { label: _l, hint: _h, choiceWords: _c, ...r } = a as Record<string, unknown>; return r; };
  assert.deepEqual(shift.args.map(bare), [{ name: "k", kind: "number", fractions: false, start: "1" }]);
  // Said for a person (round 23), from the move's own help: never the raw name alone.
  assert.equal(shift.args[0]!.label, "How far up");
  const pivot = cs.find(c => c.id === "cart.pivot")!;
  assert.deepEqual(pivot.args.map(a => [a.name, a.start]), [["x0", "0"], ["k", "1"]]);
  const mirror = cs.find(c => c.id === "cart.mirror")!;
  assert.deepEqual(mirror.args.map(bare), [{ name: "axis", kind: "choice", choices: ["x", "y", "origin", "diagonal"], start: "y" }]);
  assert.equal(mirror.args[0]!.choiceWords?.diagonal, "the diagonal y = x");
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
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-4,1,-2"), call: { mutator: "mach.stretch", args: { f: "1/2" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  assert.equal(lineType.encode(out.after), "-2,1,-1");
});

test("an unknown move is a refusal, never a crash", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "no.such", args: {} }, value: null, want: null });
  assert.equal(out.ok, false);
});

test("moving y = 2x + 3 up 1 under Power Hug (powers of 3): the line, the price and the score match the engine's own answers", () => {
  // y = 2x + 3 is the wire -2,1,-3. Up 1: y = 2x + 4, off the power 3 (worse).
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(lineType.encode(out.after), "-2,1,-4");
  assert.ok(out.price > 0 && out.charge > out.price, "the charge is the price plus the radical surcharge");
  assert.equal(compareScores(out.to.score, out.from.score), -1, "a worse main part is a worse score");
  assert.match(out.what, /up/);
});

test("a dynamic rule's worth is the line's energy, estimated afresh (energy.md), and points are it times the want", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-8"), call: { mutator: "si.shift", args: { k: "1" } }, value: null, want: 4 });
  assert.ok(out.ok);
  // y = 2x + 9: 9 = 3², a power of 3.
  assert.equal(compareScores(out.to.score, out.from.score), 1, "on a power of 3: a better utility");
  assert.ok(typeof out.to.rarity === "number" && out.to.rarity >= 0 && typeof out.from.rarity === "number");
  assert.equal(out.to.points, out.to.rarity! * 4);
});

test("without a want (a spectator, or none yet) there are no points", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(out.to.points, null);
});

test("a move the board refuses says why in words, without the mutator's code name", () => {
  const zero = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "0" } }, value: null, want: null });
  assert.deepEqual(zero, { ok: false, reason: "k must not be 0" });
  const frac = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1/2" } }, value: null, want: null });
  assert.equal(frac.ok, false);
  assert.match((frac as { reason: string }).reason, /^k .*whole numbers/);
});

test("the lens moves: a number or a word (a turn about the origin), and a move with two shapes (a fold in a crease or a mirror)", () => {
  const cs = mutatorChoices(lineQLenses);
  const turn = cs.find(c => c.id === "rot.turn")!;
  const centre = turn.args.find(a => a.name === "centre")!;
  assert.equal(centre.kind, "number");
  assert.deepEqual((centre as { words?: string[] }).words, ["origin"]);
  assert.deepEqual((turn.args.find(a => a.name === "turn") as { words?: string[] }).words, ["left", "right"]);
  assert.equal(formError(turn.args, { centre: "origin", turn: "3/4" }), null);
  assert.match(formError(turn.args, { centre: "here", turn: "1" })![1], /origin/);
  const fold = cs.find(c => c.id === "fold")!;
  assert.deepEqual(fold.args.map(a => [a.name, a.kind, a.start, a.optional ?? false]), [["x0", "number", "0", true], ["s", "number", "0", true], ["mirror", "text", "", true]]);
  // A crease leaves the mirror out; a mirror leaves the crease out.
  assert.deepEqual(wireArgs(fold.args, { x0: "0", s: "1", mirror: "" }), { x0: "0", s: "1" });
  assert.deepEqual(wireArgs(fold.args, { x0: "", s: "", mirror: "0,1,0" }), { mirror: "0,1,0" });
  const out = whatIf({ rule: rule("power-hug", null, lineQLenses), state: { lines: [{ a: -2n, b: 1n, c: -1n }] }, call: { mutator: "fold", args: { mirror: "0,1,0" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  if (out.ok) assert.equal(lineType.encode(out.after as never), "2,1,1");
  assert.equal(argError("left", true, ["left", "right"]), null);
});
