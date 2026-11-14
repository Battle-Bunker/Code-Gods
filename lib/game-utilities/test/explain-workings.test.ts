/**
 * "How this scores" (src/explain/workings.ts) is a contract on every lens: for every lens, playable Grid shape, param
 * and seeded board that has a shipped calibration table, the breakdown's items add up to the card's ordinal and the
 * bits equal what the engine computes (convex/engine/node.ts `score`: surprisal(tableFor(...), evaluator(...)(value))).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng, gridArgs, type Instantiation } from "@workspace/game-types";
import { applicable, canonicalSupport, context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { playableInstantiations, surprisal, tableFor } from "../src/calibration.ts";
import { shippedTables } from "../src/calibration-data.ts";
import { LENSES, explainer } from "../src/explain/index.ts";
import type { Params } from "../src/types.ts";

const FIRST_STEPS = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });

function randomWire(inst: Instantiation, seed: string): string {
  const args = gridArgs(inst), rng = seededRng(seed);
  const syms = args.symbols === "cards" ? "A23456789TJQK".split("").flatMap(r => "SHDC".split("").map(s => r + s)) : "0123456789ABCDEF".slice(0, Number(String(args.symbols).slice(4))).split("");
  const letters = ({ mono: "P", rgb: "RGB", rgby: "RGBY", rainbow6: "ROYGBV" } as Record<string, string>)[String(args.colours)] ?? "RGB";
  return Array.from({ length: args.size }, () => Array.from({ length: args.size }, () => syms[rng.int(syms.length)] + letters[rng.int(letters.length)]).join(",")).join("/");
}
const paramsFor = (familyId: string, inst: Instantiation): Params[] => {
  const f = family(familyId), ctx = context(inst), out = new Map<string, Params>();
  for (const p of [...f.support(ctx), ...canonicalSupport(f, ctx)]) out.set(paramsKey(p), p);
  return [...out.values()];
};

test("every lens's breakdown adds up to the ordinal and its bits are the engine's, on every shape with a table", () => {
  const perLens = new Map<string, number>();
  for (const l of LENSES) {
    const f = family(l.familyId);
    for (const inst of playableInstantiations("Grid")) {
      if (!applicable(f, inst).ok) continue;
      const tables = shippedTables(inst.key);
      const params = paramsFor(l.familyId, inst);
      const chosen = inst.key === FIRST_STEPS.key ? params : params.filter((_, i) => i % Math.ceil(params.length / 4) === 0);
      for (const p of chosen) {
        const reward = tableFor(tables, { familyId: l.familyId, params: p }, inst);
        if (!reward) continue;
        const goal = explainer({ familyId: l.familyId, params: p }, inst, { tables: { reward } })!;
        const card = evaluator({ familyId: l.familyId, params: p }, inst);
        const boards = Array.from({ length: inst.key === FIRST_STEPS.key ? 30 : 6 }, (_, i) => randomWire(inst, `workings:${l.familyId}:${paramsKey(p)}:${i}`));
        if (f.exemplar) boards.push(String(f.exemplar(p, context(inst))));
        for (const value of boards) {
          const w = goal.workings(value);
          const where = `${l.familyId} ${inst.key} ${paramsKey(p)} ${value}`;
          assert.ok(w, `workings exist: ${where}`);
          const ordinal = card(value), ord = typeof ordinal === "number" ? [ordinal] : ordinal;
          assert.deepEqual(w.breakdown.total, ord, where);
          for (let k = 0; k < w.components.length; k++) {
            assert.equal(w.breakdown.items.reduce((s, it) => s + it.points[k], 0), ord[k], `breakdown sums to component ${k}: ${where}`);
          }
          assert.ok(w.breakdown.items.every(it => it.text.length > 0 && it.points.length === w.components.length), where);
          // The engine's reward bits (score() in convex/engine/node.ts), exactly; P and the log relate within float error.
          const engine = surprisal(reward, ordinal);
          assert.equal(w.rarity.bits, engine === 0 ? 0 : engine, where);
          assert.ok(Math.abs(-Math.log2(w.rarity.probability) - engine) < 1e-9, where);
          assert.ok(w.rarity.probability > 0 && w.rarity.probability <= 1, where);
          perLens.set(l.familyId, (perLens.get(l.familyId) ?? 0) + 1);
        }
      }
    }
  }
  for (const l of LENSES) assert.ok((perLens.get(l.familyId) ?? 0) > 20, `${l.familyId} was exercised (${perLens.get(l.familyId) ?? 0} boards)`);
});

test("Number Bonds on a hand-counted 4×4 rgb board", () => {
  // 4×4, base 10 (vmax 9, so friends make 10), rgb. Rows: 3 7 5 5 / 1 9 2 8 / 4 6 0 0 / 9 1 5 5 (all red).
  // Touching pairs adding to 10. Right: row 1 has 3+7 and 5+5 (2), row 2 has 1+9 and 2+8 (2), row 3 has 4+6 (1), row 4 has
  // 9+1 and 5+5 (2). Down: no column has two neighbours adding to 10. So 7 best-friend pairs.
  const inst = FIRST_STEPS, p = {} as Params;
  const reward = tableFor(shippedTables(inst.key), { familyId: "number_bonds", params: p }, inst)!;
  const goal = explainer({ familyId: "number_bonds", params: p }, inst, { tables: { reward } })!;
  const value = "3R,7R,5R,5R/1R,9R,2R,8R/4R,6R,0R,0R/9R,1R,5R,5R";
  const w = goal.workings(value)!;
  assert.deepEqual(w.breakdown.total, [7]);
  assert.match(w.breakdown.items[0].text, /^7 best-friend pairs/);
  assert.equal(w.rarity.bits, surprisal(reward, 7));
});
