import test from "node:test";
import assert from "node:assert/strict";
import { SHIPPED_GRID_TYPE_KEYS, spawnGrid, DEFAULT_SETTINGS } from "@workspace/game-core";
import {
  SHIPPED_GRID_TYPES, dealGrid, evaluateGrid, gridCard, gridFeedback, gridCatalog, gridData,
  divineLottery, readDescriptor, publicCatalog,
} from "../src/index.ts";
import { seeded } from "./support.ts";

const below = (rng: (n: number) => number) => (b: bigint) => BigInt(rng(Number(b)));

test("game-core's shipped GridType list equals the shipped data", () => {
  assert.deepEqual([...SHIPPED_GRID_TYPE_KEYS].sort(), SHIPPED_GRID_TYPES.map(t => t.key).sort());
});

test("dealing, evaluation, cards and feedback on every shipped GridType", () => {
  for (const t of SHIPPED_GRID_TYPES) {
    const rng = seeded(t.size);
    const dealt = dealGrid(t, 8, rng);
    assert.equal(new Set(dealt.map(d => JSON.stringify(d))).size, 8);
    const settings = { ...DEFAULT_SETTINGS, objectType: "Grid" as const, gridSize: t.size, gridSymbols: t.symbols, gridColours: t.colours };
    assert.equal(divineLottery.select(settings, 3, rng).length, 3);
    assert.ok(publicCatalog("Grid", settings).length >= 30);
    for (const d of dealt) assert.doesNotThrow(() => readDescriptor(d, settings));
    assert.throws(() => readDescriptor({ familyId: "digit-lover", params: {} }, settings));
    // every family can be dealt
    const fams = new Set(Array.from({ length: 2000 }, () => dealGrid(t, 1, rng)[0].familyId));
    assert.equal(fams.size, gridCatalog(t).length, t.key);
    for (const d of dealt) {
      const card = gridCard(d, t);
      assert.ok(card.emoji && card.name && card.summary && card.source.includes("def utility(grid):"));
      for (let i = 0; i < 20; i++) {
        const e = evaluateGrid(d, spawnGrid(t, below(rng)), t);
        assert.ok(Number.isFinite(e.bits) && e.bits > 0 && Number.isFinite(e.net));
        assert.equal(e.penaltyBits === null, card.penalty === null);
        const fb = gridFeedback(e, d, t);
        assert.match(fb.text, /^Rarer than [\d,]+ of 1,000 random grids \(1 in [\d,]+\)$/);
      }
    }
  }
});

test("random spawns are typically worth about a bit; the median is small", () => {
  const t = SHIPPED_GRID_TYPES.find(x => x.key === "Grid(5,base10,rgby)")!;
  const rng = seeded(99), data = gridData(t), bits: number[] = [];
  for (const f of data.families) {
    const d = data.drawsOf(f.id)[0];
    for (let i = 0; i < 40; i++) bits.push(evaluateGrid({ familyId: d.family, params: d.params as never }, spawnGrid(t, below(rng)), t).bits);
  }
  bits.sort((a, b) => a - b);
  assert.ok(bits[bits.length >> 1] < 2, `median ${bits[bits.length >> 1]}`);
});

test("evaluation is fast enough for the interaction loop", () => {
  const t = SHIPPED_GRID_TYPES.find(x => x.key === "Grid(6,cards,rainbow6)")!;
  const rng = seeded(5), data = gridData(t);
  const draws = data.families.map(f => data.drawsOf(f.id)[0]);
  const grids = Array.from({ length: 50 }, () => spawnGrid(t, below(rng)));
  const start = performance.now();
  let n = 0;
  for (const g of grids) for (const d of draws) { evaluateGrid({ familyId: d.family, params: d.params as never }, g, t); n++; }
  const perEval = (performance.now() - start) / n;
  assert.ok(perEval < 0.5, `${perEval.toFixed(3)} ms per evaluation`);
});
