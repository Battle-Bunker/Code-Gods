/**
 * The mono colour set: a Grid whose colour layer has exactly one value ("plain"), i.e. a numbers-only board. Its colour
 * layer carries 0 bits, it has no colour capability, and its only elementary mutator is "set a symbol", so naming the op
 * costs 0 bits (docs/energy-model.md §4.1: the op-choice bits are log2 of the number of elementary ops).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  COLOUR_COMPONENTS, GRID, GRID_COLOUR_SETS, READ_PRICE, changeCost, gridElementaryCosts, instanceInfo, isMonoColours, readBound,
  type GridValue,
} from "../src/index.ts";
import { applyCalls } from "../src/mutators.ts";

const mono = GRID.instantiate({ size: 4, symbols: "base10", colours: "mono" });
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""}: ${a} vs ${b}`);

test("mono is a colour set with one colour, no class, and the wire letter P", () => {
  assert.ok(GRID_COLOUR_SETS.includes("mono"));
  const c = COLOUR_COMPONENTS.mono;
  assert.deepEqual([c.count, [...c.names], [...c.letters], [...c.classes]], [1, ["plain"], ["P"], []]);
  assert.ok(isMonoColours("mono") && !isMonoColours("rgb"));
  assert.equal(mono.key, "Grid(4,base10,mono)");
  assert.equal(mono.terms["colours.count"], 1);
  assert.deepEqual([...mono.classes], ["Valued", "Ranked", "Numeral"]);
  const codec = GRID.codec(mono), g = GRID.spawn(mono, { int: () => 0, big: () => 0n });
  assert.equal(codec.encode(g), "0P,0P,0P,0P/0P,0P,0P,0P/0P,0P,0P,0P/0P,0P,0P,0P");
  assert.throws(() => codec.decode("0R,0P,0P,0P/0P,0P,0P,0P/0P,0P,0P,0P/0P,0P,0P,0P"));
});

test("mono layer bits: the colour layer is log2 1 = 0 bits, so a full look is 16 · log2 10", () => {
  assert.deepEqual(GRID.layerBits(mono), { symbol: 16 * Math.log2(10), colour: 0 });
  near(readBound(mono), 16 * Math.log2(10), "read bound");
});

test("mono elementary costs: one op (set a symbol), so no op-choice bit; colour is no op at all", () => {
  // Hand-derived: log2 4² (which cell) + log2 10 (new digit) + log2 10 (the digit it erases) = 4 + 6.644 = 10.644 bits.
  const w = gridElementaryCosts(mono);
  near(w.symbol, 4 + 2 * Math.log2(10), "w_symbol");
  near(w.symbol, 10.643856189774725);
  assert.equal(w.colour, Infinity);
  // A coloured 4×4 keeps its op-choice bit: 1 + 4 + 2 log2 10.
  near(gridElementaryCosts(GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" })).symbol, 1 + 4 + 2 * Math.log2(10));
  // A full look still costs less than the smallest change (docs/energy-model.md §2.1).
  assert.ok(readBound(mono) * READ_PRICE < changeCost(w.symbol));
});

test("mono calls: write is priced as symbol sets, paint to the only colour is a no-change (W = 0)", () => {
  const codec = GRID.codec(mono), w = gridElementaryCosts(mono);
  const g = codec.encode({ size: 4, sym: new Uint8Array(16), col: new Uint8Array(16) } satisfies GridValue);
  const painted = applyCalls(GRID, mono, g, JSON.stringify([["paint", { kind: "all", colour: 0 }]]));
  assert.deepEqual(painted, { ok: false, reason: "no change", cost: { work: 0, total: 0 } });
  const written = applyCalls(GRID, mono, g, JSON.stringify([["write", { kind: "line", region: [0, 1], symbol: 7 }]]));
  assert.ok(written.ok, JSON.stringify(written));
  near(written.cost.work, 4 * w.symbol, "four symbol sets");
  // A colour-only mutator is not offered on a mono board.
  const recoloured = applyCalls(GRID, mono, g, JSON.stringify([["recolour", { kind: "all", pair: [0, 0] }]]));
  assert.deepEqual(recoloured.ok ? null : recoloured.reason, '"recolour" is not available for Grid(4,base10,mono)');
});

test("mono prelude: the agent cannot name a colour that is not there, and the docs say there are none", () => {
  const p = GRID.prelude(mono);
  assert.throws(() => runInNewContext(`${p.js}\n__encode_calls([paint(row(0), "red")]);`, {}), /unknown colour "red": use one of plain/);
  const helper = (name: string) => p.helpers.find(h => h.name.python === name)!;
  assert.match(helper("cell.colour").kid, /no colours, only numbers\. Reads 0 bits/);
  assert.match(helper("grid.palette").kid, /only "plain"/);
  assert.ok(!p.helpers.some(h => h.name.python === "next_colour" || h.name.python === "mix"), "no colour-order or mixing helpers");
  const info = instanceInfo(mono);
  assert.equal(info.label, "Grid 4×4 · Digits 0–9 · No colour (numbers only)");
  assert.ok(!info.badges.some(b => ["Spectral", "Wheel", "Mixable"].includes(b.id)));
});
