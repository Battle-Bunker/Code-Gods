/**
 * The what-if pane's model (integration plan §1.6): a mutator and its arguments tried on the focused line in the
 * browser, priced and scored by the same engine host the server's `object.quote` and `object.score` use. What would
 * break: the pane offering moves the board does not have, a wrong argument form, scores or prices that disagree with
 * the server's answer, points that ignore the others' want.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, type Score } from "@workspace/v2-core";
import { lineType, lineQ, lineZ } from "@workspace/v2-linear";
import { familyOf } from "../src/sdk/rule.ts";
import { argError, mutatorChoices, whatIf } from "../src/panes/what-if-model.ts";

const rule = (family: string, _tieBreaker: string | null, variant = lineZ) => ({ type: lineType, family: familyOf(family)!, params: familyOf(family)!.dealable(lineQ)[0], variant, tieBreaker: null });

test("the choices are the board's lens moves, each with a lens, a number and (where it takes one) an amount", () => {
  const cs = mutatorChoices(lineZ);
  assert.deepEqual(cs.map(c => c.id).sort(), [...lineZ.mutators].sort());
  const add = cs.find(c => c.id === "add")!;
  assert.deepEqual(add.args.map(a => [a.name, a.kind]), [["lens", "choice"], ["at", "number"], ["k", "number"]]);
  assert.equal((add.args[0] as { choiceWords?: Record<string, string> }).choiceWords?.mc?.startsWith("gradient and y-intercept"), true);
  assert.deepEqual(cs.find(c => c.id === "neg")!.args.map(a => a.name), ["lens", "at"]);
});

test("a typed number is checked before anything is worked out", () => {
  assert.equal(argError("3", false), null);
  assert.equal(argError("−3", false), null);
  assert.match(argError("1/2", false)!, /whole numbers/);
  assert.equal(argError("1/2", true), null);
  assert.match(argError("", false)!, /Type a number/);
  assert.match(argError("abc", true)!, /Type a number/);
});

test("halving the gradient's top of y = 4x + 2 on a whole-number board gives y = 2x + 2", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-4,1,-2"), call: { mutator: "div", args: { lens: "mc", at: "1", k: "2" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  assert.equal(lineType.encode(out.after), "-2,1,-2");
});

test("an unknown move is a refusal, never a crash", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "no.such", args: {} }, value: null, want: null });
  assert.equal(out.ok, false);
});

test("moving y = 2x + 3 up 1 under Power Hug (powers of 3): the line, the price and the score match the engine's own answers", () => {
  // y = 2x + 3 is the wire -2,1,-3. Up 1: y = 2x + 4, off the power 3 (worse).
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "add", args: { lens: "mc", at: "3", k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(lineType.encode(out.after), "-2,1,-4");
  assert.ok(out.price > 0 && out.charge >= out.price, "energy is bits: the charge is the turn's price");
  assert.equal(compareScores(out.to.score, out.from.score), -1, "a worse main part is a worse score");
  assert.match(out.what, /add 1/);
});

test("a dynamic rule's worth is the line's energy, estimated afresh (energy.md), and points are it times the want", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-8"), call: { mutator: "add", args: { lens: "mc", at: "3", k: "1" } }, value: null, want: 4 });
  assert.ok(out.ok);
  // y = 2x + 9: 9 = 3², a power of 3.
  assert.equal(compareScores(out.to.score, out.from.score), 1, "on a power of 3: a better utility");
  assert.ok(typeof out.to.rarity === "number" && out.to.rarity >= 0 && typeof out.from.rarity === "number");
  assert.equal(out.to.points, out.to.rarity! * 4);
});

test("without a want (a spectator, or none yet) there are no points", () => {
  const out = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "add", args: { lens: "mc", at: "3", k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(out.to.points, null);
});

test("a move the board refuses says why in words", () => {
  const zero = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "add", args: { lens: "mc", at: "3", k: "0" } }, value: null, want: null });
  assert.equal(zero.ok, false);
  assert.match((zero as { reason: string }).reason, /adding 0/);
  const bottom = whatIf({ rule: rule("power-hug", null), state: lineType.decode("-2,1,-3"), call: { mutator: "add", args: { lens: "mc", at: "2", k: "-1" } }, value: null, want: null });
  assert.equal(bottom.ok, false);
});

test("a turn is a list of moves on one lens: What if prices them together, and refuses a second lens", () => {
  // The owner's example: 1/2 + 1/3 is made by multiplying the bottom by 3 (1/6), then adding 4 to the top (5/6).
  const state = lineType.decode("-4,2,-1");   // y = 2x + 1/2
  const two = whatIf({ rule: rule("power-hug", null, lineQ), state, steps: [{ mutator: "mul", args: { lens: "mc", at: "4", k: "3" } }], call: { mutator: "add", args: { lens: "mc", at: "3", k: "4" } }, value: null, want: null });
  assert.ok(two.ok, two.ok ? "" : two.reason);
  if (two.ok) { assert.equal(lineType.encode(two.after), "-12,6,-5"); assert.match(two.what, /then/); assert.ok(two.naming > 0 && two.surprise > 0); }
  const mixed = whatIf({ rule: rule("power-hug", null), state, steps: [{ mutator: "add", args: { lens: "abc", at: "3", k: "1" } }], call: { mutator: "add", args: { lens: "mc", at: "3", k: "1" } }, value: null, want: null });
  assert.equal(mixed.ok, false);
});
