/**
 * Fixture builder for the Python parity tests (output in test/fixtures/, gitignored).
 *
 *   node --experimental-strip-types test/fixtures.ts cards [out.json]     cases for test/parity.py
 *   node --experimental-strip-types test/fixtures.ts gridlab [out.json]   grid families × instantiations for test/gridlab_parity.py
 *   node --experimental-strip-types test/fixtures.ts eval in.json out.json
 *        in: [{key, args, family, params, wires}] -> out: [[ordinal, ...], ...] (the host evaluator)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { instantiate, objectType, type ObjectValue } from "@workspace/game-types";
import { FAMILIES, available, canonicalSupport, context, entryPoint, evaluator, paramsKey } from "../src/index.ts";
import { allGrids, coveringGrids, familiesOf, intInsts, sampleObjects, seededRng, stringInsts } from "./support.ts";

const here = dirname(new URL(import.meta.url).pathname);

export function cardsFixture() {
  const preludes: Record<string, string> = {};
  const cases: unknown[] = [];
  for (const inst of [...coveringGrids(), ...intInsts(), ...stringInsts()]) {
    preludes[inst.key] = objectType(inst.objectType).prelude(inst).python;
    const ctx = context(inst), rng = seededRng(`cards:${inst.key}`);
    const base = sampleObjects(inst, rng, inst.objectType === "Grid" ? 24 : 40);
    for (const f of familiesOf(inst)) {
      const canon = canonicalSupport(f, ctx);
      const draws = [f.sample(rng, ctx), f.sample(rng, ctx), canon[rng.int(canon.length)]];
      for (const params of draws) {
        const ex = f.exemplar ? [f.exemplar(params, ctx)] : [];
        const wires = [...base, ...ex];
        const u = evaluator({ familyId: f.id, params }, inst);
        cases.push({
          key: inst.key, family: f.id, entry: entryPoint(f), params, source: f.card.python(params, ctx),
          wires, ordinals: wires.map(w => u(w)),
        });
      }
    }
  }
  return { preludes, cases };
}

/** Per grid family: availability on all 60 GridTypes, and support, canonical forms and two draws per covering type. */
export function gridlabFixture() {
  const grids = allGrids(), covering = new Set(coveringGrids().map(i => i.key));
  return FAMILIES.filter(f => f.objectType === "Grid").map(f => ({
    family: f.id, role: f.role, tags: f.tags,
    availability: Object.fromEntries(grids.map(inst => [inst.key, available(f, inst).ok])),
    types: grids.filter(inst => covering.has(inst.key) && available(f, inst).ok).map(inst => {
      const ctx = context(inst), rng = seededRng(`gridlab:${f.id}:${inst.key}`);
      const support = f.support(ctx);
      return {
        key: inst.key, args: inst.args, support, canonical: support.map(p => f.canonical(p, ctx)),
        canonicalCount: canonicalSupport(f, ctx).length, draws: [f.sample(rng, ctx), f.sample(rng, ctx)],
      };
    }),
  }));
}

export function evalRequests(reqs: { key: string; args: Record<string, number | string>; family: string; params: any; wires: ObjectValue[] }[]) {
  return reqs.map(r => {
    const inst = instantiate(objectType(r.key.startsWith("Grid") ? "Grid" : r.key.startsWith("Int") ? "Int" : "string").id, r.args);
    const u = evaluator({ familyId: r.family, params: r.params }, inst);
    return r.wires.map(w => u(w));
  });
}

function write(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "cards") write(a ?? `${here}/fixtures/cards.json`, cardsFixture());
  else if (mode === "gridlab") write(a ?? `${here}/fixtures/gridlab.json`, gridlabFixture());
  else if (mode === "eval") write(b, evalRequests(JSON.parse(readFileSync(a, "utf8"))));
  else throw new Error("usage: fixtures.ts cards|gridlab|eval ...");
  void paramsKey;
}
