import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, Qn, q, type Call } from "@workspace/v2-core";
import { encodePair, facts, pairQ, pairType, type PairState } from "../src/index.ts";
import { L, Y, sys } from "./helpers.ts";

const call = (mutator: string, args: Record<string, string>): Call => ({ mutator, site: 0, args });
function apply(s: PairState, mutator: string, args: Record<string, string>) {
  const r = applyCall(pairType, pairQ, s, call(mutator, args));
  if (isInvalid(r)) throw new Error(r.invalid);
  return r;
}
const P = (s: PairState) => { const p = facts(s).P!; return `${Qn.toWire(p.x)},${Qn.toWire(p.y)}`; };
const absD = (s: PairState) => { const d = facts(s).D; return d < 0n ? -d : d; };
const school = sys(L(2, 3, -12), L(1, -1, -1));   // 2x + 3y = 12 and x − y = 1, crossing at (3, 2)

test("elimination (pair.combine) keeps the answer and the number you divide by", () => {
  for (const line of ["1", "2"]) for (const k of ["1", "-2", "3"]) {
    const r = applyCall(pairType, pairQ, school, call("pair.combine", { line, k }));
    if (isInvalid(r)) continue;   // refused: a common factor
    assert.equal(P(r.result), "3,2");
    assert.equal(absD(r.result), absD(school));
  }
});

test("pair.combine is refused when the result has a common factor (it would be divided through: one-way)", () => {
  // (1, 1, 0) + 1·(1, −1, 0) = (2, 0, 0): a common factor 2.
  const r = applyCall(pairType, pairQ, sys(L(1, 1, 0), L(1, -1, 0)), call("pair.combine", { line: "1", k: "1" }));
  assert.ok(isInvalid(r));
});

test("turning a line about the crossing keeps the answer and changes the angle", () => {
  const r = apply(school, "pair.turn", { line: "2", k: "1" });
  assert.equal(P(r.result), "3,2");
  assert.notEqual(facts(r.result).dot, facts(school).dot);
});

test("reflecting in the other line keeps the answer and undoes itself", () => {
  const r = apply(school, "pair.reflect", { line: "1" });
  assert.equal(P(r.result), "3,2");
  const moved = r.result.lines.findIndex(l => !school.lines.some(m => m.a === l.a && m.b === l.b && m.c === l.c));
  const back = apply(r.result, "pair.reflect", { line: String(moved + 1) });
  assert.equal(encodePair(back.result), encodePair(school));
});

test("a quarter turn about the crossing keeps the answer and turns the angle into its complement (tan ↔ cot)", () => {
  const s = sys(Y(2, 0), Y(-1, 3));   // cross at (1, 2)
  const r = apply(s, "pair.quarter", { line: "1" });
  assert.equal(P(r.result), "1,2");
  const f0 = facts(s), f1 = facts(r.result);
  assert.equal(f1.D * f0.D + f1.dot * f0.dot === 0n || f1.D * f0.D - f1.dot * f0.dot === 0n, true);
  assert.equal(f1.D * f1.D * f0.D * f0.D, f0.dot * f0.dot * f1.dot * f1.dot);   // |tan'| = |cot|
});

test("sliding along the other line moves the answer along it; translating moves it by (u, v)", () => {
  const s = sys(L(0, 1, 0), Y(1, 0));   // y = 0 and y = x, crossing at (0, 0)
  const a = apply(s, "pair.slide", { line: "1", k: "2" });   // line 1 is y = x (a = −1 sorts first); slide along y = 0
  assert.equal(P(a.result), "2,0");
  const b = apply(s, "sys.translate", { u: "3", v: "-1" });
  assert.equal(P(b.result), "3,-1");
  assert.equal(facts(b.result).D, facts(s).D);
});

test("a move on one line re-sorts the pair, and a move onto the other line is refused", () => {
  const s = sys(Y(1, 0), Y(1, 2));   // parallel; line 1 is y = x + 2 (c sorts −2 before 0), line 2 is y = x
  const r = applyCall(pairType, pairQ, s, call("si.shift", { line: "1", k: "-2" }));
  assert.ok(isInvalid(r));
  assert.match(r.invalid, /different/);
});

test("a far move costs exactly its path of unit moves (whole amounts; before the surcharge)", () => {
  for (const [mutator, extra] of [["pair.combine", {}], ["pair.slide", {}], ["si.shift", {}], ["pair.turn", {}]] as const) {
    const one = pairType.mutators.find(m => m.id === mutator)!.args(pairQ);
    const fee = (k: string) => { const a = one.decode({ line: "1", k, ...extra }); return one.bits(a) + Math.log2(pairQ.mutators.length); };
    assert.ok(Math.abs(fee("3") - 3 * fee("1")) < 1e-9, `${mutator}: ${fee("3")} vs 3 × ${fee("1")}`);
  }
});

test("representation shortcuts are priced as choices: reflect and quarter cost which + the line", () => {
  const r = apply(school, "pair.reflect", { line: "2" });
  // which: a uniform choice of the menu's moves (19 since #1153 gave every representation its moves); arg: the line (1 bit).
  assert.ok(Math.abs(r.price.which + r.price.arg - (Math.log2(pairQ.mutators.length) + 1)) < 1e-9);
  assert.equal(q(1).n, 1n);
});

test("a shortcut on a big line pays more (trial 29 for pairs): a stretch, a reflection and a quarter turn floor at fee × 2^((Φ − 21)/3.5)", async () => {
  const { applyCall, isInvalid } = await import("@workspace/v2-core");
  const { pairShortcutFactor, pairLineBits } = await import("../src/index.ts");
  const price = (s: ReturnType<typeof sys>, mutator: string, args: Record<string, string>) => {
    const a = applyCall(pairType, pairQ, s, { mutator, site: 0, args });
    assert.ok(!isInvalid(a), mutator);
    return a.price;
  };
  const small = sys(Y(2, 3), Y(-1, 6)), big = sys(Y(2, 300001), Y(-1, 6));
  for (const [m, args] of [["mach.stretch", { line: "1", f: "3" }], ["pair.quarter", { line: "1" }], ["pair.reflect", { line: "1" }]] as const) {
    const p0 = price(small, m, args), p1 = price(big, m, args);
    assert.ok(p1.which + p1.arg > 2 * (p0.which + p0.arg), `${m}: ${p0.which + p0.arg} → ${p1.which + p1.arg}`);
  }
  assert.equal(pairShortcutFactor(21), 1);
  assert.ok(pairLineBits(big.lines.find(l => l.c !== -6n && l.c !== 6n) ?? big.lines[0]!) > 30);
  // An additive move is not floored.
  const s0 = price(small, "si.shift", { line: "1", k: "1" }), s1 = price(big, "si.shift", { line: "1", k: "1" });
  assert.equal(s0.which + s0.arg, s1.which + s1.arg);
});
