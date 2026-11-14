/**
 * The graded families of line-families.mjs, valued by the v2 estimator (lib/v2-valuation, spec §7) on the spec's
 * priced walk, variant line-q: the "one method" behind docs/engine-v2/layered-line-rules.md §7.
 *
 *   node --experimental-strip-types docs/engine-v2/scripts/layered-v2-valuation.ts --ref graded.json [--cap 24] [--only id,id] [--budget n] [--json out.json]
 *
 * Each family becomes a RuleFamily whose score is its level on the graded ladder (the families' own parts, gated), read
 * from the general form's coordinates; the ladder has one rung per threshold. The ladder is capped at its declared top:
 * the last rung the reference law (layered-graded.mjs --json) puts at or below --cap bits. The estimator finds rungs by
 * climbing from the origin and has no exemplar seeding yet (spec §7.2 step 1 allows `exemplars`; lib/v2-valuation does
 * not implement them), so thin upper sets ("a + b + c = 0 and three prime coefficients") are reported unreachable.
 * Wrapping the origin does not help: the free burn-in walks off a thin set before the climb starts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { q, ref, type RuleFamily, type Rung } from "../../../lib/v2-core/src/index.ts";
import { findVariant } from "../../../lib/v2-valuation/src/registry.ts";
import { calibrate } from "../../../lib/v2-valuation/src/artefact.ts";
// @ts-ignore: a plain ES module beside this script
import { FAMILIES, levels, lineCtx, rungLabels } from "./line-families.mjs";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const only = opt("only")?.split(",");
const budget = opt("budget") ? Number(opt("budget")) : undefined;
const refLaw = JSON.parse(readFileSync(opt("ref") ?? "graded.json", "utf8"));
const cap = Number(opt("cap") ?? "24");
/** How many rungs to keep: up to the last whose reference-law bits are at most the cap. */
function keep(id: string, total: number): number {
  const bits: (number | null)[] = (refLaw[id]?.groups ?? []).flatMap((g: { bits: (number | null)[] }) => g.bits);
  let k = 0;
  bits.forEach((b, i) => { if (b !== null && b <= cap) k = i + 1; });
  return Math.min(total, Math.max(k, 1));
}
const { type, variant } = findVariant("line-q");
type Fam = { id: string; name: string; parts: unknown[] };
function adapt(f: Fam): RuleFamily<any, Record<string, never>> {
  const labels: string[] = rungLabels(f).slice(0, keep(f.id, rungLabels(f).length));
  return {
    id: `graded/${f.id}`, title: f.name, curve: "count",
    card: () => f.name, params: [], dealable: () => [{}], depends: ["gen"], primary: "gen",
    ladder: (): readonly Rung[] => [{ score: null, label: "anything" }, ...labels.map((label, i) => ({ score: [q(i + 1)], label }))],
    evaluate(ctx) {
      const refs = ["a", "b", "c"].map(n => ref("gen", n));
      const [a, b, c] = refs.map(r => {
        const v = ctx.read(r);
        if (v.kind !== "number" || v.q.d !== 1n) throw new Error("gen coordinates are integers");
        return Number(v.q.n);
      });
      const level = Math.min(levels(f, lineCtx(a, b, c))[0], labels.length);
      ctx.term("level", "level on the graded ladder", q(level), refs);
      ctx.score([{ term: "level", sense: "max" }]);
    },
  };
}

const out: Record<string, unknown> = {};
for (const f of (FAMILIES as Fam[]).filter(f => !only || only.includes(f.id))) {
  const t = Date.now();
  const { artefact, estimate } = calibrate(type, variant, adapt(f), {}, { seed: "layered", config: budget ? { computeBudget: budget } : {} });
  const fin = (x: number) => (Number.isFinite(x) ? x : null);
  const rungs = estimate.rungs.slice(1).map(r => ({ label: r.label, bits: fin(r.bits), error: fin(r.error), split: fin(r.split), splitError: fin(r.splitError), empty: r.empty }));
  out[f.id] = { status: artefact.status, reasons: artefact.reasons, steps: estimate.steps, rungs };
  const show = (x: number | null) => (x === null ? "—" : x.toFixed(1));
  console.log(`${f.id}: ${artefact.status}, ${((Date.now() - t) / 1000).toFixed(0)} s, ${rungs.length} rungs; ${artefact.reasons.slice(0, 1).join("")}`);
  console.log("  stationary " + rungs.map(r => show(r.bits)).join(" "));
  console.log("  splitting  " + rungs.map(r => show(r.split)).join(" "));
}
if (opt("json")) writeFileSync(opt("json")!, JSON.stringify(out, null, 1));
