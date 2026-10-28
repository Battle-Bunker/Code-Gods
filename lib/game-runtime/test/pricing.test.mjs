import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameRuntime, COMPLEXITY_IDS, MOVE_FLAG_BITS } from "../index.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixture-prelude.json", import.meta.url), "utf8"));
const ints = { ...fixture, interactionComputeMs: 50 };
const sum = parts => parts.structure + parts.names + parts.literals + parts.moveFlags;

for (const language of ["python", "typescript"]) {
  test(`${language} summon price: ${COMPLEXITY_IDS[language]}`, { timeout: 120000 }, async () => {
    const r = new GameRuntime({ language });
    const py = language === "python";
    try {
      const literal = py ? "def agent(grid):\n    return [add(3)]\n" : "function agent(grid) { return [add(3)]; }";
      const priced = await r.inspect(literal, ints);
      assert.equal(priced.complexityFunctionId, COMPLEXITY_IDS[language]);
      assert.deepEqual(priced.literalMoves, [["add", { k: 3 }]]);
      assert.equal(priced.literalMoveFallbackBits.length, 1);
      assert.ok(priced.literalMoveFallbackBits[0] > 0);
      assert.ok(Math.abs(priced.cost - sum(priced.parts)) < 1e-9);
      assert.equal(priced.parts.moveFlags, 0, "a literal move's flag is the host's");
      assert.equal(MOVE_FLAG_BITS, 3);
      // Renaming never changes the price.
      const a = py ? "def agent(grid):\n    best = grid + 1\n    return [add(best)]\n"
        : "function agent(grid) { const best = grid + 1; return [add(best)]; }";
      const b = py ? "def agent(g):\n    zz = g + 1\n    return [add(zz)]\n"
        : "function agent(g) { const zz = g + 1; return [add(zz)]; }";
      const pa = await r.inspect(a, ints), pb = await r.inspect(b, ints);
      assert.ok(Math.abs(pa.cost - pb.cost) < 1e-9);
      assert.deepEqual(pa.literalMoves, []);
      assert.ok(pa.parts.moveFlags > 0);
      // A computed argument is not a literal move; a shadowed constructor is not a mutator.
      const shadow = py ? "def add(k):\n    return {'__m': 'add', 'k': k}\ndef agent(grid):\n    return [add(3)]\n"
        : "function agent(grid) { const add = (k: number) => ({ __m: 'add', k }); return [add(3)]; }";
      assert.deepEqual((await r.inspect(shadow, ints)).literalMoves, []);
      // More code costs more; the prelude is never priced.
      assert.ok(pa.cost > (await r.inspect(py ? "def agent(grid):\n    return []\n" : "function agent(grid) { return []; }", ints)).cost);
      const bigger = { ...ints, prelude: { ...ints.prelude, key: "bigger",
        python: ints.prelude.python + "\nEXTRA = [1, 2, 3]\n", js: ints.prelude.js + "\nconst EXTRA = [1, 2, 3];\n",
        dts: ints.prelude.dts + "\ndeclare const EXTRA: number[];\n" } };
      assert.equal((await r.inspect(a, bigger)).cost, pa.cost);
      // The pricing vocabulary comes with the prelude and is part of the cache key.
      const noApi = { ...ints, prelude: { ...ints.prelude, key: ints.prelude.key,
        pricing: { python: { ...ints.prelude.pricing.python, mutators: [] } } } };
      assert.deepEqual((await r.inspect(literal, noApi)).literalMoves, []);
      assert.deepEqual((await r.inspect(literal, ints)).literalMoves, [["add", { k: 3 }]]);
      await assert.rejects(r.inspect(literal, { ...ints, prelude: { ...ints.prelude, pricing: undefined } }), { code: "CONFIG" });
      await assert.rejects(r.inspect(literal, { ...ints, prelude: { ...ints.prelude, pricing: { python: { api: [] } } } }), { code: "CONFIG" });
    } finally { r.close(); }
  });
}
