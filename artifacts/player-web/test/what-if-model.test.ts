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
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-4,1,-2"), call: { mutator: "mach.stretch", args: { f: "1/2" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  assert.equal(lineType.encode(out.after), "-2,1,-1");
});

test("an unknown move is a refusal, never a crash", () => {
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "no.such", args: {} }, value: null, want: null });
  assert.equal(out.ok, false);
});

test("moving y = 2x + 3 up 1 under m Meets c: the line, the price and the score match the engine's own answers", () => {
  // y = 2x + 3 is the wire -2,1,-3. Up 1: y = 2x + 4. Main part |m − c|: 1 before, 2 after (worse).
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(lineType.encode(out.after), "-2,1,-4");
  assert.ok(out.price > 0 && out.charge > out.price, "the charge is the price plus the radical surcharge");
  assert.equal(compareScores(out.to.score, out.from.score), -1, "a worse main part is a worse score");
  assert.match(out.what, /up/);
});

test("rarity is the rule's value function at the score reached (decision 23), and points are rarity times the want", () => {
  // A value function worth 1.5 bits per unit of the main part's score, 0 at the worst.
  const value = (u: Score) => (u === null || u[0] === null ? 0 : 1.5 * (Number(u[0].n) / Number(u[0].d)));
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.tilt", args: { k: "1" } }, value, want: 4 });
  assert.ok(out.ok);
  // y = 3x + 3: m = c, the main part's best.
  assert.equal(out.to.rarity, value(out.to.score));
  assert.ok(out.to.rarity! > out.from.rarity!, "a better score is rarer");
  assert.equal(out.to.points, out.to.rarity! * 4);
  assert.equal(out.from.points, out.from.rarity! * 4);
});

test("without a want (a spectator, or none yet) there are no points; without a value function, no rarity", () => {
  const out = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1" } }, value: null, want: null });
  assert.ok(out.ok);
  assert.equal(out.to.rarity, null);
  assert.equal(out.to.points, null);
});

test("a move the board refuses says why in words, without the mutator's code name", () => {
  const zero = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "0" } }, value: null, want: null });
  assert.deepEqual(zero, { ok: false, reason: "k must not be 0" });
  const frac = whatIf({ rule: rule("m-meets-c", "size"), state: lineType.decode("-2,1,-3"), call: { mutator: "si.shift", args: { k: "1/2" } }, value: null, want: null });
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
  const out = whatIf({ rule: { ...rule("prime-landing", null, lineQLenses), params: { ends: 3 } }, state: { lines: [{ a: -2n, b: 1n, c: -1n }] }, call: { mutator: "fold", args: { mirror: "0,1,0" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  if (out.ok) assert.equal(lineType.encode(out.after as never), "2,1,1");
  assert.equal(argError("left", true, ["left", "right"]), null);
});
