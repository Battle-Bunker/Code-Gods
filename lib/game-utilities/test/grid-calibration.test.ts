import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridData, SHIPPED_GRID_TYPES } from "../src/grid/data.ts";
import { surprisal, compareOrdinals, hinge, ordinalDistance } from "../src/grid/calibration.ts";

const fixture = (module: string) => JSON.parse(readFileSync(new URL(`./fixtures/grid/${module}.json`, import.meta.url), "utf8"));
const slug = (t: { size: number; symbols: string; colours: string }) => `${t.size}_${t.symbols}_${t.colours}`;

test("the four default GridTypes ship tables", () => {
  assert.deepEqual(SHIPPED_GRID_TYPES.map(t => t.key).sort(),
    ["Grid(3,base10,rgb)", "Grid(4,base12,rgb)", "Grid(5,base10,rgby)", "Grid(6,cards,rainbow6)"]);
});

test("every draw's tables exist; levels strictly increase; bits strictly increase", () => {
  for (const t of SHIPPED_GRID_TYPES) {
    const data = gridData(t);
    assert.ok(data.draws.length > 100, t.key);
    for (const d of data.draws) {
      assert.ok(data.tables[d.table], `${t.key} ${d.family} reward table`);
      assert.equal(!!d.penaltyTable, !!d.penalty);
      if (d.penaltyTable) assert.equal(typeof data.tables[d.penaltyTable].hbar, "number");
      assert.match(d.card, /def utility\(grid\):/);
    }
    for (const [key, tab] of Object.entries(data.tables)) {
      for (let i = 1; i < tab.levels.length; i++) {
        assert.equal(compareOrdinals(tab.levels[i - 1], tab.levels[i]), -1, `${key} level order`);
        assert.ok(tab.bits[i] > tab.bits[i - 1], `${key} bits order`);
      }
    }
  }
});

test("surprisal lookups equal Grid Lab's on sampled grids (non-exact tables exactly, exact tables at levels)", () => {
  let checked = 0;
  for (const t of SHIPPED_GRID_TYPES) {
    const data = gridData(t), fx = fixture(slug(t));
    for (const c of fx.cases) {
      const tab = data.tables[c.table];
      c.ordinals.forEach((o: number | number[], i: number) => {
        const onLevel = tab.levels.some(l => compareOrdinals(l, o) === 0);
        if (tab.exact && !onLevel) return;
        const got = surprisal(tab, o);
        assert.ok(Math.abs(got - c.bits[i]) <= 1e-8 * Math.max(1, c.bits[i]), `${t.key} ${c.table} ${JSON.stringify(o)}: ${got} vs ${c.bits[i]}`);
        checked++;
      });
    }
  }
  assert.ok(checked > 3000, `only ${checked} lookups checked`);
});

test("lookups are strictly increasing off the table too", () => {
  const data = gridData(SHIPPED_GRID_TYPES[0]);
  for (const tab of Object.values(data.tables)) {
    if (tab.tuple) {
      const a = tab.levels[0] as number[], z = tab.levels[tab.levels.length - 1] as number[];
      const below = a.map((x, i) => i === 0 ? x - 1 : x), aboveTop = z.map((x, i) => i === 0 ? x + 1 : x);
      assert.ok(surprisal(tab, below) < surprisal(tab, a) && surprisal(tab, aboveTop) > surprisal(tab, z));
    } else {
      const a = tab.levels[0] as number, z = tab.levels[tab.levels.length - 1] as number;
      assert.ok(surprisal(tab, a - 1) < surprisal(tab, a) && surprisal(tab, a - 1) > 0);
      assert.ok(surprisal(tab, z + 1) > surprisal(tab, z));
    }
  }
  assert.ok(ordinalDistance([5, 0], [6, 0]) > ordinalDistance([5, 0], [5, 9]));
  assert.ok(Math.abs(hinge(1.0) - (1 - Math.log2(1.5))) < 1e-12 && hinge(0) === 0);
});
