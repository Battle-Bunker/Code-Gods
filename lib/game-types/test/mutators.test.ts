import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, INT, MAX_CALLS, MIN_FAILED_ACT_BITS, STRING, availableOf, seededRng } from "../src/index.ts";
import { applyCalls, DEFAULT_COST_KNOBS, decisionBits } from "../src/mutators.ts";

const inst = GRID.instantiate({ size: 5, symbols: "base10", colours: "rgby" });
const g = GRID.codec(inst).encode(GRID.spawn(inst, seededRng("generic"))) as string;
const act = (calls: unknown, knobs = DEFAULT_COST_KNOBS) =>
  applyCalls(GRID, inst, g, typeof calls === "string" ? calls : JSON.stringify(calls), knobs);
const PAINT_ROW = ["paint", { kind: "line", region: [0, 2], colour: 0 }];
const PAINT_ROW_DECISION = Math.log2(23) + 3 + Math.log2(10) + 2;

test("a successful act: new wire value, the calls, decision and erasure summed over calls, motion on the net change", () => {
  const one = act([PAINT_ROW]), turn = act([["turn_grid", { move: "rot90" }]]);
  assert.ok(one.ok && turn.ok);
  assert.ok(Math.abs(one.cost.decision - PAINT_ROW_DECISION) < 1e-12);
  assert.ok(Math.abs(one.cost.total - (one.cost.decision + one.cost.erasure + one.cost.motion)) < 1e-12);
  assert.equal(one.cost.erasure, 10);
  assert.deepEqual(one.calls, [PAINT_ROW]);
  assert.ok(GRID.codec(inst).isValid(one.value) && one.value !== g);
  // decision and erasure add up over calls; motion is charged once, on before -> final
  const both = act([PAINT_ROW, ["turn_grid", { move: "rot90" }]]);
  const second = applyCalls(GRID, inst, one.value, JSON.stringify([["turn_grid", { move: "rot90" }]]));
  assert.ok(both.ok && second.ok);
  assert.equal(both.value, second.value);
  assert.ok(Math.abs(both.cost.decision - one.cost.decision - second.cost.decision) < 1e-9);
  assert.ok(Math.abs(both.cost.erasure - one.cost.erasure - second.cost.erasure) < 1e-9);
  const net = GRID.changedBits(GRID.codec(inst).decode(g), GRID.codec(inst).decode(both.value), inst);
  const totals = GRID.layerBits(inst);
  const want = 0.35 * Object.keys(net).reduce((s, L) => s + net[L] ** 2 / totals[L], 0);
  assert.ok(Math.abs(both.cost.motion - want) < 1e-12);
});

test("splitting a move into small calls cannot dodge motion (open-agents.md §4.1)", () => {
  const row = act([PAINT_ROW]);
  const byHand = act(Array.from({ length: 5 }, (_, c) => ["paint", { kind: "cell", region: [2, c], colour: 0 }]));
  assert.ok(row.ok && byHand.ok && row.value === byHand.value);
  assert.ok(Math.abs(byHand.cost.motion - row.cost.motion) < 1e-12, `${byHand.cost.motion} vs ${row.cost.motion}`);
  assert.ok(byHand.cost.total > row.cost.total);
  // Grid Lab's form: 0.35 · (d_col² log2 C + d_sym² log2 S) / N²
  const before = GRID.codec(inst).decode(g), after = GRID.codec(inst).decode(row.value);
  const dcol = before.col.filter((v, i) => v !== after.col[i]).length;
  assert.ok(Math.abs(row.cost.motion - 0.35 * dcol ** 2 * Math.log2(4) / 25) < 1e-12);
  // a change undone later in the same act moved nothing
  const there = act([PAINT_ROW, ["turn_grid", { move: "rot180" }], ["turn_grid", { move: "rot180" }]]);
  assert.ok(there.ok && there.value === row.value && Math.abs(there.cost.motion - row.cost.motion) < 1e-12);
});

test("a call that changes nothing pays decision only; an act that changes nothing fails", () => {
  const twice = act([PAINT_ROW, PAINT_ROW]), once = act([PAINT_ROW]);
  assert.ok(twice.ok && once.ok);
  assert.ok(Math.abs(twice.cost.erasure - once.cost.erasure) < 1e-12 && Math.abs(twice.cost.motion - once.cost.motion) < 1e-12);
  assert.ok(Math.abs(twice.cost.decision - 2 * once.cost.decision) < 1e-12);
  const there = act([PAINT_ROW, ["turn_grid", { move: "rot180" }], ["turn_grid", { move: "rot180" }]]);
  const back = applyCalls(GRID, inst, g, JSON.stringify([["turn_grid", { move: "rot180" }], ["turn_grid", { move: "rot180" }]]));
  assert.ok(there.ok);
  assert.ok(!back.ok && back.reason === "no change");
  assert.ok(Math.abs(back.cost.total - 2 * decisionBits(GRID.mutators.find(m => m.id === "turn_grid")!, { move: "rot180" }, inst, 23)) < 1e-12);
  const empty = act([]);
  assert.ok(!empty.ok && empty.cost.total === MIN_FAILED_ACT_BITS);
});

test("junk fails and pays the decision bits parsed so far (at least MIN_FAILED_ACT_BITS)", () => {
  const junk: unknown[] = [
    "not json", "{}", '"x"', "[1]", '[["paint"]]', '[["paint", []]]', '[[1, {}]]', "[[\"paint\", {\"colour\": \"é\"}]]",
    "x".repeat(70000), [["nope", {}]], [["paint", { kind: "line", region: [0, 9], colour: 0 }]],
  ];
  for (const j of junk) {
    const o = act(j);
    assert.ok(!o.ok, JSON.stringify(j).slice(0, 80));
    assert.equal(o.cost.total, MIN_FAILED_ACT_BITS);
    assert.equal(o.cost.erasure, 0);
  }
  // unavailable here: tally needs Numeral, blend needs Mixable
  const cards = GRID.instantiate({ size: 5, symbols: "cards", colours: "rgb" });
  const cg = GRID.codec(cards).encode(GRID.spawn(cards, seededRng(1)));
  for (const c of [["tally", { kind: "all", colour: 0 }], ["blend", { kind: "all", recipe: [1, 3, 2] }]]) {
    const o = applyCalls(GRID, cards, cg, JSON.stringify([c]));
    assert.ok(!o.ok && /not available/.test(o.reason), JSON.stringify(o));
  }
  // a failure after good calls pays their decision bits, and the failing call's if it parsed
  const late = act([PAINT_ROW, PAINT_ROW, ["paint", { kind: "line", region: [0, 2], colour: 9 }]]);
  assert.ok(!late.ok && Math.abs(late.cost.total - 2 * PAINT_ROW_DECISION) < 1e-12);
  const tooMany = act(Array.from({ length: MAX_CALLS + 1 }, () => PAINT_ROW));
  assert.ok(!tooMany.ok && Math.abs(tooMany.cost.total - MAX_CALLS * PAINT_ROW_DECISION) < 1e-9);
  // a bad stored value is reported, not thrown
  assert.ok(!applyCalls(GRID, inst, "garbage", JSON.stringify([PAINT_ROW])).ok);
  const s = STRING.instantiate({ maxLength: 4 });
  const nul = applyCalls(STRING, s, "ab", JSON.stringify([["set_char", { i: 3, c: "x" }]]));
  assert.ok(!nul.ok && /cannot apply/.test(nul.reason) && nul.cost.total > 1);
});

test("knobs weight the terms", () => {
  const base = act([PAINT_ROW]), noMove = act([PAINT_ROW], { ...DEFAULT_COST_KNOBS, move: 0 });
  const dear = act([PAINT_ROW], { ...DEFAULT_COST_KNOBS, kind: { bijective: 1, overwrite: 2 } });
  const freeLines = act([PAINT_ROW], { ...DEFAULT_COST_KNOBS, scope: { ...DEFAULT_COST_KNOBS.scope, line: 0 } });
  assert.ok(base.ok && noMove.ok && dear.ok && freeLines.ok);
  assert.equal(noMove.cost.motion, 0);
  // scope/kind multiply each call's decision and erasure; whole-act motion carries none
  assert.ok(Math.abs(dear.cost.total - (2 * (base.cost.decision + base.cost.erasure) + base.cost.motion)) < 1e-9);
  assert.ok(freeLines.cost.decision === 0 && freeLines.cost.erasure === 0 && freeLines.cost.motion === base.cost.motion);
});

test("every object type prices acts through the same model", () => {
  const i = INT.instantiate({ min: 0, max: 9999 }), s = STRING.instantiate({ maxLength: 16 });
  const a = applyCalls(INT, i, 1234, '[["add",{"k":1}],["set_digit",{"place":3,"digit":9}]]');
  assert.ok(a.ok && a.value === 9235 && a.cost.erasure > 3 && a.cost.decision > 0);
  const b = applyCalls(STRING, s, "hello", '[["shift_chars",{"k":1}]]');
  assert.ok(b.ok && b.value === "ifmmp" && b.cost.erasure === 0 && b.cost.motion > 0);
  assert.equal(availableOf(INT.mutators, INT.instantiate({ min: 3, max: 3 })).length, 0);
  assert.ok(!applyCalls(INT, INT.instantiate({ min: 3, max: 3 }), 3, '[["add",{"k":1}]]').ok);
});
