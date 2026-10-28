import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeGrid, encodeGrid, type GridTypeArgs } from "@workspace/game-core";
import { SHIPPED_GRID_TYPES, canonicalJson } from "../src/grid/data.ts";
import { gridEnv } from "../src/grid/env.ts";
import {
  applyCall, applyCalls, describeCall, mutatorCatalog, mutatorSpace, parseCalls, priceCall,
  MutatorCallError, type MutatorCall,
} from "../src/grid/mutators.ts";
import * as pkg from "../src/index.ts";

type Fixture = {
  gridType: GridTypeArgs & { key: string };
  pool: string[];
  apply: Record<string, [number, Record<string, unknown>, string | null][]>;
  describe: Record<string, [Record<string, unknown>, string, number][]>;
  spaceCounts: Record<string, number>;
  sequences: [number, MutatorCall[], string | null][];
};
const slug = (t: { size: number; symbols: string; colours: string }) => `${t.size}_${t.symbols}_${t.colours}`;
const fixture = (t: GridTypeArgs): Fixture =>
  JSON.parse(readFileSync(new URL(`./fixtures/grid/mutators_${slug(t)}.json`, import.meta.url), "utf8"));
const TYPES = SHIPPED_GRID_TYPES;
const G5 = TYPES.find(t => t.key === "Grid(5,base10,rgby)")!;
const CARDS = TYPES.find(t => t.symbols === "cards")!;
const RGB3 = TYPES.find(t => t.key === "Grid(3,base10,rgb)")!;

/** Same params, keys in reverse order (wire order must not matter). */
const shuffled = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).reverse());
const code = (e: unknown) => (e instanceof MutatorCallError ? e.code : `not a MutatorCallError: ${e}`);
function throwsCode(fn: () => unknown, expected: string, index?: number | null) {
  try { fn(); } catch (e) {
    assert.equal(code(e), expected);
    if (index !== undefined) assert.equal((e as MutatorCallError).index, index);
    return;
  }
  assert.fail(`expected ${expected}`);
}

test("the package exports the mutator engine", () => {
  for (const name of ["mutatorCatalog", "priceCall", "applyCall", "applyCalls", "describeCall", "parseCalls", "MutatorCallError"]) {
    assert.equal(typeof (pkg as Record<string, unknown>)[name], "function", name);
  }
});

test("every shipped GridType has a mutator table matching Grid Lab's available set", () => {
  for (const t of TYPES) {
    const fx = fixture(t), cat = mutatorCatalog(t);
    assert.deepEqual(cat.map(m => m.id), Object.keys(fx.spaceCounts), t.key);
    for (const m of cat) assert.ok(m.name && m.summary && m.layer && m.fields.length, `${t.key} ${m.id}`);
  }
  const ids = (t: GridTypeArgs) => new Set(mutatorCatalog(t).map(m => m.id));
  assert.ok(!ids(CARDS).has("tally") && ids(CARDS).has("suit_set") && ids(CARDS).has("blend"));
  assert.ok(!ids(RGB3).has("blend") && !ids(RGB3).has("suit_swap") && ids(RGB3).has("tally"));
});

test("cost tables hold every Mutator.space setting, with positive costs", () => {
  let total = 0;
  for (const t of TYPES) {
    const fx = fixture(t);
    for (const m of mutatorCatalog(t)) {
      const space = mutatorSpace(t, m.id);
      assert.equal(space.length, fx.spaceCounts[m.id], `${t.key} ${m.id} count`);
      assert.equal(space.length, m.count);
      assert.equal(new Set(space.map(p => canonicalJson(p))).size, space.length, "distinct canonical keys");
      for (const p of space) {
        const c = priceCall(t, { m: m.id, p: p as MutatorCall["p"] });
        assert.ok(c.decision > 0 && c.physical >= 0 && c.total > 0, `${t.key} ${m.id} ${canonicalJson(p)}`);
        assert.equal(c.total, c.decision + c.physical);
        total++;
      }
    }
  }
  assert.equal(total, 2218 + 4936 + 7822 + 36305);
});

test("prices equal Grid Lab's Mutator.cost (to 1e-5), whatever the key order", () => {
  for (const t of TYPES) {
    for (const [id, cases] of Object.entries(fixture(t).describe)) {
      for (const [p, , cost] of cases) {
        const c = priceCall(t, { m: id, p: shuffled(p) as MutatorCall["p"] });
        assert.ok(Math.abs(c.total - cost) <= 1e-5, `${t.key} ${id}: ${c.total} vs ${cost}`);
      }
    }
  }
  // sanity ratios from docs/mutators.md (Grid(5,base10,rgby))
  const fill = priceCall(G5, { m: "paint", p: { kind: "all", region: [], colour: 0 } }).total;
  const cell = priceCall(G5, { m: "paint", p: { kind: "cell", region: [0, 0], colour: 0 } }).total;
  assert.ok(Math.abs(fill - 69.4) < 0.1 && Math.abs(cell - 16.2) < 0.1, `${fill} ${cell}`);
  assert.ok(priceCall(G5, { m: "paint", p: { kind: "line*", region: [], colour: 2 } }).decision >
    priceCall(G5, { m: "paint", p: { kind: "line", region: [0, 2], colour: 2 } }).decision - 1e-9);
});

test("apply parity with Grid Lab for every mutator × GridType", () => {
  let checked = 0, noops = 0;
  for (const t of TYPES) {
    const fx = fixture(t), env = gridEnv(t);
    assert.deepEqual(Object.keys(fx.apply), mutatorCatalog(t).map(m => m.id));
    for (const [id, cases] of Object.entries(fx.apply)) {
      assert.ok(cases.length >= 50, `${t.key} ${id} cases`);
      for (const [i, p, want] of cases) {
        const before = fx.pool[i], g = decodeGrid(before, t);
        const call = { m: id, p: (checked % 2 ? shuffled(p) : p) as MutatorCall["p"] };
        const got = applyCall(g, call, env);
        assert.equal(got === null ? null : encodeGrid(got, t), want, `${t.key} ${id} ${JSON.stringify(p)} on #${i}`);
        assert.equal(encodeGrid(g, t), before, "applyCall must not mutate its input");
        const r = applyCalls(before, [call], t);
        assert.equal(r.after, want);
        assert.equal(r.steps[0].changed, want !== null);
        checked++;
        if (want === null) noops++;
      }
    }
  }
  assert.ok(checked > 5000 && noops > 200, `${checked} cases, ${noops} no-ops`);
});

test("describe parity with Grid Lab's text_fn", () => {
  let n = 0;
  for (const t of TYPES) {
    for (const [id, cases] of Object.entries(fixture(t).describe)) {
      for (const [p, text] of cases) {
        assert.equal(describeCall(t, { m: id, p: p as MutatorCall["p"] }), text, `${t.key} ${id}`);
        n++;
      }
    }
  }
  assert.ok(n >= 900);
  assert.equal(describeCall(G5, { m: "paint", p: { kind: "line", region: [0, 2], colour: 1 } }), "paint row 3 yellow");
});

test("applyCalls matches Grid Lab call sequences (no-ops skipped, null when back at the start)", () => {
  for (const t of TYPES) {
    const fx = fixture(t);
    for (const [i, calls, want] of fx.sequences) {
      const r = applyCalls(fx.pool[i], calls, t);
      assert.equal(r.after, want, `${t.key} ${JSON.stringify(calls)}`);
      assert.equal(r.steps.length, calls.length);
      const sum = calls.reduce((a, c) => a + priceCall(t, c).decision, 0);
      assert.ok(Math.abs(r.decisionBits - sum) < 1e-9);
    }
  }
});

test("applyCalls applies in order, reports no-ops, and is all-or-nothing", () => {
  const g = "1R,2R,3R,4R,5R/6Y,7Y,8Y,9Y,0Y/1G,2G,3G,4G,5G/6B,7B,8B,9B,0B/1R,1R,1R,1R,1R";
  const paintRow = { m: "paint", p: { kind: "line", region: [0, 0], colour: 3 } };
  const swapRows = { m: "swap_lines", p: { axis: 0, pair: [0, 1] } };
  const a = applyCalls(g, [paintRow, swapRows], G5), b = applyCalls(g, [swapRows, paintRow], G5);
  assert.equal(a.after, "6Y,7Y,8Y,9Y,0Y/1B,2B,3B,4B,5B/1G,2G,3G,4G,5G/6B,7B,8B,9B,0B/1R,1R,1R,1R,1R");
  assert.equal(b.after, "6B,7B,8B,9B,0B/1R,2R,3R,4R,5R/1G,2G,3G,4G,5G/6B,7B,8B,9B,0B/1R,1R,1R,1R,1R");

  // painting row 1 red is a no-op here; the step is reported, skipped and still paid for
  const noop = { m: "paint", p: { kind: "line", region: [0, 0], colour: 0 } };
  const r = applyCalls(g, [noop, swapRows, swapRows], G5);
  assert.deepEqual(r.steps.map(s => s.changed), [false, true, true]);
  assert.equal(r.after, null, "swapping twice ends where it started");
  const price = priceCall(G5, noop);
  assert.ok(Math.abs(r.decisionBits - (price.decision + 2 * priceCall(G5, swapRows).decision)) < 1e-9);
  assert.deepEqual(r.steps[0].params, { kind: "line", region: [0, 0], colour: 0 });
  assert.ok(Object.isFrozen(r.steps[0].params));

  // line*: the line where the symbol is already most common (column 4 holds two 9s) ...
  assert.equal(applyCalls(g, [{ m: "write", p: { kind: "line*", region: [], symbol: 9 } }], G5).after,
    "1R,2R,3R,9R,5R/6Y,7Y,8Y,9Y,0Y/1G,2G,3G,9G,5G/6B,7B,8B,9B,0B/1R,1R,1R,9R,1R");
  // ... and on a tie (no 5s anywhere) the lowest index, row 1, as numpy argmax
  const zeros = Array(5).fill("0R,0R,0R,0R,0R").join("/");
  assert.equal(applyCalls(zeros, [{ m: "write", p: { kind: "line*", region: [], symbol: 5 } }], G5).after,
    "5R,5R,5R,5R,5R/" + Array(4).fill("0R,0R,0R,0R,0R").join("/"));
  const bad = { m: "paint", p: { kind: "line", region: [0, 9], colour: 3 } };
  throwsCode(() => applyCalls(g, [paintRow, bad, swapRows], G5), "invalid_params", 1);
  throwsCode(() => applyCalls(g, [paintRow, { m: "tally", p: { kind: "all", region: [], colour: 0 } }], CARDS), "unavailable_mutator", 1);
  throwsCode(() => applyCalls(g, Array(9).fill(paintRow), G5), "too_many_calls");
  assert.equal(applyCalls(g, Array(9).fill(paintRow), G5, { maxCalls: 9 }).steps.length, 9);
  throwsCode(() => applyCalls("1R,2R", [paintRow], G5), "bad_grid");
  assert.equal(applyCalls(g, [], G5).after, null);
});

test("invalid calls: unknown ids, out-of-space params, extra or missing keys, wrong types", () => {
  const ok = { kind: "line", region: [0, 2], colour: 1 };
  assert.ok(priceCall(G5, { m: "paint", p: ok }).total > 0);
  const bad: [unknown, string][] = [
    [{ m: "fill", p: ok }, "unavailable_mutator"],
    [{ m: "__proto__", p: ok }, "unavailable_mutator"],
    [{ m: "toString", p: ok }, "unavailable_mutator"],
    [{ m: "blend", p: { kind: "all", region: [], recipe: [0, 1, 2] } }, "invalid_params"],
    [{ m: "suit_set", p: { kind: "all", region: [], suit: 0 } }, "unavailable_mutator"],
    [{ m: "paint", p: { ...ok, colour: 4 } }, "invalid_params"],
    [{ m: "paint", p: { ...ok, colour: "1" } }, "invalid_params"],
    [{ m: "paint", p: { ...ok, colour: 1.5 } }, "invalid_params"],
    [{ m: "paint", p: { ...ok, extra: 1 } }, "invalid_params"],
    [{ m: "paint", p: { kind: "line", colour: 1 } }, "invalid_params"],
    [{ m: "paint", p: { kind: "line", region: [2, 0], colour: 1 } }, "invalid_params"],
    [{ m: "paint", p: { kind: "line*", region: [0, 2], colour: 1 } }, "invalid_params"],
    [{ m: "paint", p: [] }, "bad_shape"],
    [{ m: "paint" }, "bad_shape"],
    [null, "bad_shape"],
  ];
  for (const [call, want] of bad) throwsCode(() => priceCall(G5, call as MutatorCall), want);
  throwsCode(() => priceCall({ size: 7, symbols: "base16", colours: "rgb" }, { m: "paint", p: ok }), "unsupported_grid");
});

test("parseCalls accepts the wire shape and rejects hostile input cleanly", () => {
  const good = '[{"m":"paint","p":{"kind":"line","region":[0,2],"colour":1}},{"p":{"axis":0,"pair":[0,1]},"m":"swap_lines"}]';
  const calls = parseCalls(good);
  assert.deepEqual(calls[0], { m: "paint", p: { kind: "line", region: [0, 2], colour: 1 } });
  assert.equal(applyCalls("1R,2R,3R,4R,5R/6Y,7Y,8Y,9Y,0Y/1G,2G,3G,4G,5G/6B,7B,8B,9B,0B/1R,1R,1R,1R,1R", calls, G5).steps.length, 2);
  assert.deepEqual(parseCalls("[]"), []);

  const deep = "[".repeat(5000) + "]".repeat(5000);
  const deepP = `[{"m":"paint","p":{"region":${"[".repeat(50)}${"]".repeat(50)}}}]`;
  const hostile: [unknown, string][] = [
    ["", "bad_json"], ["nope", "bad_json"], ["[NaN]", "bad_json"], ["[{\"m\":\"paint\",\"p\":{\"k\":NaN}}]", "bad_json"],
    ["{\"m\":\"paint\",\"p\":{}}", "bad_shape"], ["null", "bad_shape"], ["7", "bad_shape"], ["\"[]\"", "bad_shape"],
    [deep, "bad_json"], [deepP, "bad_shape"],
    [`[${Array(9).fill('{"m":"paint","p":{}}').join(",")}]`, "too_many_calls"],
    [`[${Array(100000).fill("1").join(",")}]`, "bad_json"],
    [`[{"m":"paint","p":{"region":[${Array(100).fill(0).join(",")}]}}]`, "bad_shape"],
    ["[1]", "bad_shape"], ["[[]]", "bad_shape"], ["[null]", "bad_shape"], ['["paint"]', "bad_shape"],
    ['[{"m":"paint"}]', "bad_shape"], ['[{"p":{}}]', "bad_shape"],
    ['[{"m":"paint","p":{},"x":1}]', "bad_shape"],
    ['[{"m":"paint","p":{},"__proto__":{}}]', "bad_shape"],
    ['[{"m":"paint","p":{"__proto__":{"polluted":1}}}]', "bad_shape"],
    ['[{"m":"paint","p":{"constructor":1}}]', "bad_shape"],
    ['[{"m":7,"p":{}}]', "bad_shape"], ['[{"m":"","p":{}}]', "bad_shape"],
    [`[{"m":"${"x".repeat(100)}","p":{}}]`, "bad_shape"],
    ['[{"m":"paint","p":null}]', "bad_shape"], ['[{"m":"paint","p":[1]}]', "bad_shape"],
    ['[{"m":"paint","p":{"colour":true}}]', "bad_shape"], ['[{"m":"paint","p":{"colour":null}}]', "bad_shape"],
    ['[{"m":"paint","p":{"colour":{"a":1}}}]', "bad_shape"],
    ['[{"m":"paint","p":{"colour":1e999}}]', "bad_shape"],
    ['[{"m":"paint","p":{"a":1,"b":1,"c":1,"d":1,"e":1,"f":1,"g":1,"h":1,"i":1}}]', "bad_shape"],
    ['[{"m":"paint","p":{"bad key":1}}]', "bad_shape"],
    [`[{"m":"paint","p":{"kind":"${"x".repeat(1000)}"}}]`, "bad_shape"],
    ["x".repeat(1 << 20), "bad_json"],
    [42, "bad_json"], [null, "bad_json"], [{ toString: () => "[]" }, "bad_json"],
  ];
  for (const [input, want] of hostile) throwsCode(() => parseCalls(input as string), want);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(parseCalls(`[${Array(9).fill('{"m":"paint","p":{}}').join(",")}]`, { maxCalls: 9 }).length, 9);
});

test("applyCalls is fast enough for 100 Hz agent acts", () => {
  const t = CARDS, fx = fixture(t);
  const calls = Object.entries(fx.apply).slice(0, 8).map(([m, cases]) => ({ m, p: cases[0][1] as MutatorCall["p"] }));
  applyCalls(fx.pool[0], calls, t);
  const t0 = performance.now();
  for (let i = 0; i < 2000; i++) applyCalls(fx.pool[i % fx.pool.length], calls, t);
  const ms = (performance.now() - t0) / 2000;
  assert.ok(ms < 1, `${ms.toFixed(3)} ms per 8-call act`);
});
