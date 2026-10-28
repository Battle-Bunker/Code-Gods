import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, objectType, type Instantiation } from "@workspace/game-types";
import {
  FAMILIES, GRID_LENSES, assertOrdinal, available, canonicalSupport, card, compareOrdinals, context, divineLottery,
  evaluator, family, familiesFor, paramsKey, publicCatalog, readDescriptor, selector, type UtilityFamily,
} from "../src/index.ts";
import { allGrids, coveringGrids, familiesOf, intInsts, sampleObjects, seededRng, stringInsts } from "./support.ts";

const ALL: Instantiation[] = [...allGrids(), ...intInsts(), ...stringInsts()];
const MAX_CANONICAL = 24;
const MAX_LINES = 60, MAX_WIDTH = 110;

test("catalog: unique ids, 31 shortlisted grid families, 8 penalties, Int and string families", () => {
  assert.equal(new Set(FAMILIES.map(f => f.id)).size, FAMILIES.length);
  const grid = familiesFor("Grid");
  assert.equal(grid.filter(f => f.tags.includes("shortlist")).length, 31);
  assert.equal(familiesFor("Grid", "penalty").length, 8);
  assert.ok(familiesFor("Int").length >= 14 && familiesFor("string").length >= 14);
  assert.equal(Object.values(GRID_LENSES).flat().length, grid.length);
  for (const f of FAMILIES) {
    assert.ok(f.name && f.emoji && f.theme, f.id);
    assert.ok(f.role === "reward" || f.role === "penalty", f.id);
  }
});

function lint(src: string, lang: "python" | "typescript", f: UtilityFamily<any>, where: string) {
  const lines = src.split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
  const c = lang === "python" ? "#" : "//";
  assert.match(lines[0], lang === "python" ? /^# \S+ .+/ : /^\/\/ \S+ .+/, `${where}: header must be '${c} <emoji> <name>'`);
  assert.ok(lines[0].includes(f.name) || lines[0].includes("King of the Valley") || lines[0].includes("Sandwich Maker"), `${where}: header names the family`);
  assert.ok(lines.filter(l => l.startsWith(c)).length <= 5, `${where}: header longer than 4 lines of explanation`);
  const arg = f.objectType === "Grid" ? "grid" : "x", entry = f.role === "penalty" ? "penalty" : "utility";
  assert.ok(src.includes(lang === "python" ? `def ${entry}(${arg}):` : `function ${entry}(${arg}) {`), `${where}: no ${entry}(${arg})`);
  const code = lines.map(l => l.replace(lang === "python" ? /#.*$/ : /\/\/.*$/, "")).join("\n");
  const banned = lang === "python" ? /\b(import|numpy|lambda|global|random|time|exec|eval|open)\b|np\./
    : /\b(import|require|eval|Function|globalThis|process|Date|setTimeout|async|await)\b|Math\.random/;
  assert.doesNotMatch(code, banned, `${where}: card uses a banned word`);
  if (lang === "typescript") assert.doesNotMatch(code, /\)\s*:\s*\w|\w\s*:\s*(number|string|boolean|Cell|Grid)\b/, `${where}: type annotation`);
  assert.ok(lines.length <= MAX_LINES, `${where}: card has ${lines.length} lines`);
  const wide = lines.find(l => l.length > MAX_WIDTH);
  assert.equal(wide, undefined, `${where}: line wider than ${MAX_WIDTH}`);
}

test("every family × every instantiation: support, sample ∈ support, canonical idempotent and small, cards, shape, determinism", () => {
  let largest = { n: 0, at: "" };
  for (const inst of ALL) {
    const ctx = context(inst), rng = seededRng(`laws:${inst.key}`), def = objectType(inst.objectType);
    const objs = Array.from({ length: 4 }, () => def.codec(inst).encode(def.spawn(inst, rng)));
    for (const f of familiesOf(inst)) {
      const where = `${f.id} ${inst.key}`;
      const support = f.support(ctx);
      assert.ok(support.length > 0, `${where}: empty support`);
      const keys = new Set(support.map(paramsKey));
      for (let i = 0; i < 20; i++) {
        const p = f.sample(rng, ctx);
        assert.ok(keys.has(paramsKey(p)), `${where}: sample ${paramsKey(p)} is not in the support`);
      }
      for (const p of support) {
        const c = f.canonical(p, ctx);
        assert.equal(paramsKey(f.canonical(c, ctx)), paramsKey(c), `${where}: canonical is not idempotent on ${paramsKey(p)}`);
      }
      const n = canonicalSupport(f, ctx).length;
      assert.ok(n <= MAX_CANONICAL, `${where}: ${n} canonical params`);
      if (n > largest.n) largest = { n, at: where };
      const p = f.sample(rng, ctx);
      lint(f.card.python(p, ctx), "python", f, `${where} python`);
      lint(f.card.typescript(p, ctx), "typescript", f, `${where} typescript`);
      const u = evaluator({ familyId: f.id, params: p }, inst), shape = f.shape(ctx);
      for (const w of objs) {
        const o = u(w); // the evaluator asserts the shape
        assert.deepEqual(u(w), o, `${where}: not deterministic`);
        assert.equal(typeof o === "number" ? 0 : o.length, shape.kind === "scalar" ? 0 : shape.arity);
      }
      for (const c of canonicalSupport(f, ctx).slice(0, 3)) evaluator({ familyId: f.id, params: c }, inst)(objs[0]);
    }
  }
  console.log(`largest canonical support: ${largest.n} (${largest.at})`);
});

test("exemplars are legal and reach the top of every sampled ordinal", () => {
  for (const inst of [...coveringGrids(), ...intInsts(), ...stringInsts()]) {
    const ctx = context(inst), rng = seededRng(`exemplar:${inst.key}`), codec = objectType(inst.objectType).codec(inst);
    const objs = sampleObjects(inst, rng, 60);
    for (const f of familiesOf(inst)) {
      if (!f.exemplar) continue;
      for (let k = 0; k < 2; k++) {
        const p = f.sample(rng, ctx), where = `${f.id} ${inst.key} ${paramsKey(p)}`;
        const ex = f.exemplar(p, ctx);
        assert.ok(codec.isValid(ex), `${where}: exemplar ${String(ex)} is not legal`);
        const u = evaluator({ familyId: f.id, params: p }, inst), top = u(ex);
        for (const w of objs) {
          assert.ok(compareOrdinals(u(w), top) <= 0, `${where}: ${JSON.stringify(w)} scores ${JSON.stringify(u(w))} above the exemplar's ${JSON.stringify(top)}`);
        }
      }
    }
  }
});

test("ordinals: lexicographic comparison and shape checks", () => {
  assert.equal(compareOrdinals(3, 2), 1);
  assert.equal(compareOrdinals([1, 5], [2, 0]), -1);
  assert.equal(compareOrdinals([2, 5], [2, 5]), 0);
  assert.equal(compareOrdinals([2, 6], [2, 5]), 1);
  assert.throws(() => compareOrdinals([1], [1, 2]));
  assert.equal(assertOrdinal({ kind: "scalar" }, -0), 0);
  assert.deepEqual(assertOrdinal({ kind: "tuple", arity: 2 }, [1, -3]), [1, -3]);
  for (const bad of [1.5, NaN, "1", true, [1, 2]]) assert.throws(() => assertOrdinal({ kind: "scalar" }, bad));
  for (const bad of [[1], [1, 2, 3], [1, 0.5], 3]) assert.throws(() => assertOrdinal({ kind: "tuple", arity: 2 }, bad));
});

test("availability and the public catalog follow the constraints", () => {
  const plain = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const entries = publicCatalog(plain);
  assert.equal(entries.length, familiesFor("Grid").length);
  const windmill = entries.find(e => e.id === "card_windmill")!;
  assert.equal(windmill.available, false);
  assert.match(windmill.locked!.reason, /\w/);
  assert.ok(windmill.locked!.unlock && "symbols" in windmill.locked!.unlock);
  assert.equal(entries.find(e => e.id === "royal_court")!.available, false); // needs cards and an odd size
  assert.equal(entries.find(e => e.id === "colour_mixer")!.available, false); // rgb does not mix
  const road = entries.find(e => e.id === "rainbow_road")!;
  assert.equal(road.available, true);
  assert.ok(road.badges.some(b => b.id === "Spectral"));
  const castle = entries.find(e => e.id === "castle_keeper")!;
  assert.equal(castle.available, true);
  assert.equal(available(family("castle_keeper"), instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" })).ok, false);
  assert.equal(available(family("digit-devotee"), plain).ok, false);
});

test("cards: summary, both sources, shape, and the defence goal", () => {
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rainbow6" }), ctx = context(inst);
  const d = readDescriptor({ familyId: "seed3_green_ones", params: { colour: 3, value: 1 }, penalty: { familyId: "hate_colour", params: { colour: 0 } } });
  const c = card(d, ctx);
  assert.equal(c.name, "Green Ones");
  assert.deepEqual(c.shape, { kind: "tuple", arity: 2 });
  assert.match(c.source.python, /MY_COLOUR = "green"/);
  assert.match(c.source.typescript, /const MY_COLOUR = "green";/);
  assert.equal(c.penalty!.comparative, "redder");
  assert.match(c.penalty!.source.python, /def penalty\(grid\):/);
  assert.throws(() => readDescriptor({ familyId: "hate_colour", params: {} }));
  assert.throws(() => readDescriptor({ familyId: "nope", params: {} }));
  assert.equal(evaluator(d, inst), evaluator({ familyId: d.familyId, params: { value: 1, colour: 3 } }, inst), "cached by params");
  assert.deepEqual(evaluator(d, inst)("1G,1G,1G,1G,1G/1G,1G,1G,1G,1G/1G,1G,1G,1G,1G/1G,1G,1G,1G,1G/1G,1G,1G,1G,1R"), [24, 1]);
});

test("Divine Lottery: available rewards only, distinct, deterministic, defence goals and table filter", () => {
  assert.equal(selector("divine-lottery"), divineLottery);
  for (const inst of [instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), instantiate("Int", {}), instantiate("string", { maxLength: 16 })]) {
    const deal = divineLottery.select(inst, 12, seededRng(1));
    assert.deepEqual(divineLottery.select(inst, 12, seededRng(1)), deal);
    assert.equal(new Set(deal.map(paramsKey)).size, 12);
    for (const d of deal) {
      const f = family(d.familyId);
      assert.equal(f.role, "reward");
      assert.ok(available(f, inst).ok, `${f.id} dealt in ${inst.key}`);
      assert.equal(d.penalty, undefined);
    }
  }
  const inst = instantiate("Grid", { size: 5, symbols: "cards", colours: "rainbow6" });
  const defended = divineLottery.select(inst, 8, seededRng(2), { defenceRate: 1 });
  for (const d of defended) assert.equal(family(d.penalty!.familyId).role, "penalty");
  const half = divineLottery.select(inst, 40, seededRng(3), { defenceRate: 0.5 }).filter(d => d.penalty).length;
  assert.ok(half > 8 && half < 32, `${half}/40 defence goals at rate 0.5`);
  const only = divineLottery.select(inst, 6, seededRng(4), { hasTable: d => d.familyId === "conqueror" || d.familyId === "hate_colour", defenceRate: 1 });
  assert.ok(only.every(d => d.familyId === "conqueror" && d.penalty!.familyId === "hate_colour"));
  assert.throws(() => divineLottery.select(inst, 2, seededRng(5), { hasTable: () => false }));
});
