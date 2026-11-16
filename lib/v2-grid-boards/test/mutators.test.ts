/** Owner decision 19: every price list is an exact potential, so the walk's law is π ∝ 2^−φ (a product over cells). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleDiagnostic, isInvalid, walkStep, rng as makeRng } from "@workspace/v2-core";
import { BOARD_TYPES, board4Type, board5Type, board7Type, decodeBoard, encodeBoard, paletteOf, boardParams, symbolCount, type BoardState } from "../src/index.ts";

for (const type of [board4Type, board5Type]) {
  const v = type.variants[0]!;
  test(`${v.id}: every proposal has a reverse of the same weight (no one-way move, no asymmetric pair, no loop)`, () => {
    const { size: n, symbols } = boardParams(v), pal = paletteOf(v), S = symbolCount(symbols);
    const states: BoardState[] = Array.from({ length: 6 }, (_, i) => {
      const sym = Array.from({ length: n * n }, (_, k) => ((i * 7 + k * k * 3 + k) % Math.min(S, 10)) * (k % (i + 2) === 0 ? 0 : 1));
      const col = Array.from({ length: n * n }, (_, k) => pal[(k * (i + 1) + i) % pal.length]!);
      return symbols === "cards" ? { sym, col, cards: true } : { sym, col };
    });
    const r = cycleDiagnostic(type, v, states, 12, 3);
    assert.deepEqual(r.oneWay, {}, "one-way moves");
    for (const [id, s] of Object.entries(r.perMutator)) assert.equal(s.asymmetric, 0, `${id}: ${s.asymmetric} asymmetric pairs, worst ${s.worst} bits`);
    assert.ok(r.worstEdge < 1e-9 && r.worstCycle < 1e-9, `edge ${r.worstEdge}, loop ${r.worstCycle}`);
    assert.equal(Object.keys(r.perMutator).length, v.mutators.length, "every mutator proposed something");
  });
}

const apply = (type: typeof board4Type, w: string, id: string, args: Record<string, string | number>) => {
  const v = type.variants[0]!, m = type.mutators.find(x => x.id === id)!;
  const out = m.apply(type.decode(w), 0, args, v);
  return isInvalid(out) ? out : encodeBoard(out);
};

test("colour moves: a rainbow step wraps round the board's colours; a trade swaps two colours everywhere", () => {
  const w = "1R,2G,3B,4R/0R,0R,0R,0R/0G,0G,0G,0G/0B,0B,0B,0B";
  assert.equal(apply(board4Type, w, "colours.step", { area: "row0", j: "1" }), "1G,2B,3R,4G/0R,0R,0R,0R/0G,0G,0G,0G/0B,0B,0B,0B");
  assert.equal(apply(board4Type, w, "colours.trade", { a: "red", b: "blue" }), "1B,2G,3R,4B/0B,0B,0B,0B/0G,0G,0G,0G/0R,0R,0R,0R");
  assert.equal(apply(board4Type, w, "cells.swap", { a: "r0c0", b: "r0c1", what: "colours" }), "1G,2R,3B,4R/0R,0R,0R,0R/0G,0G,0G,0G/0B,0B,0B,0B");
  assert.equal(apply(board4Type, w, "lines.swap", { a: "row0", b: "row3" }), "0B,0B,0B,0B/0R,0R,0R,0R/0G,0G,0G,0G/1R,2G,3B,4R");
  assert.ok(isInvalid(apply(board4Type, w, "lines.swap", { a: "row0", b: "col3" })));
});

test("cards: adding moves the rank within ace…king and keeps the suit; a suit move keeps the rank", () => {
  const v = board7Type.variants[0]!;
  const s = board7Type.origin(v);
  const m = (id: string) => board7Type.mutators.find(x => x.id === id)!;
  const kh = m("cards.suit").apply(m("cells.add").apply(s, 0, { cell: "r0c0", k: 12 }, v) as BoardState, 0, { cell: "r0c0", j: "1" }, v) as BoardState;
  assert.ok(encodeBoard(kh).startsWith("KHR,ASR"), encodeBoard(kh));
  assert.ok(isInvalid(m("cells.add").apply(kh, 0, { cell: "r0c0", k: 1 }, v)));
  assert.equal(decodeBoard(encodeBoard(kh)).cards, true);
});

test("the walk keeps every board in its domain", () => {
  for (const type of BOARD_TYPES) {
    const v = type.variants[0]!, rng = makeRng(7);
    let s = type.origin(v);
    for (let i = 0; i < 400; i++) s = walkStep(type, v, s, rng);
    assert.ok(!isInvalid(type.canonical(s, v)), type.id);
  }
});

test("every move on every board is undone by its inverse, and the two cost the same (sampled; the big boards' exhaustive check is too slow)", () => {
  for (const type of BOARD_TYPES) {
    const v = type.variants[0]!, r = makeRng("inverse", type.id);
    let s = type.origin(v);
    for (let i = 0; i < 200; i++) s = walkStep(type, v, s, r);
    for (const m of type.mutators) {
      const code = m.args(v);
      let tried = 0;
      for (let t = 0; t < 300 && tried < 40; t++) {
        const a = code.sample(r);
        if (!a) continue;
        const out = m.apply(s, 0, a, v);
        if (isInvalid(out)) continue;
        tried++;
        const inv = m.inverse.kind === "self" ? { id: m.id, args: a } : { id: m.inverse.id, args: m.inverse.args(a) };
        const back = type.mutators.find(x => x.id === inv.id)!;
        const again = back.apply(out, 0, inv.args, v);
        assert.ok(!isInvalid(again) && encodeBoard(again) === encodeBoard(s), `${type.id} ${m.id} ${JSON.stringify(a)}`);
        assert.ok(Math.abs(code.bits(a) - back.args(v).bits(inv.args)) < 1e-9, `${type.id} ${m.id}: price differs from its inverse's`);
      }
      assert.ok(tried > 0, `${type.id} ${m.id} never applied`);
    }
  }
});
