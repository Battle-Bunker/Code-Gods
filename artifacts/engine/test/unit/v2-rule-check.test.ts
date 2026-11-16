/**
 * The rule check (docs/engine-v2/design-principles.md) on every preset's dealt pool, lines, grids and pairs alike, for
 * the rows that read a family's declarations and its law draws:
 *
 * - 3a: at least three dealt secondaries per dealt family, of different forms; no beginner preset deals more than two
 *   layers (main and one secondary);
 * - 4: at least four dealt parameter sets per dealt family;
 * - 7: every dealt family declares its kind and every dealt secondary its form (v2-rule-forms.ts); at most
 *   MAX_PER_KIND dealt families of one preset share a kind and at most MAX_PER_FORM share a form; no family deals one
 *   form twice;
 * - 5: on a variant with a PMI table (lib/v2-agents pmi.gen.ts), its dealt pairs from different families are close to
 *   perpendicular: at most a fifth aligned (PMI > 2 bits), none above 4 bits, mean at most 1 bit;
 * - decision 13: over law draws every dealt layer takes at least three distinct values (no on/off layer; a grid count
 *   over four boxes has at most five).
 *
 * Row 10 (a cheap move keeps most of the bits) on line families: the second test below. Rows 1 and 3 on line families:
 * lib/v2-linear test/design-principles.test.ts. The energy gate: v2-no-straight-hill.
 *
 * A failure that is known and reported is listed in EXEMPT with its date and owner. The test fails for any failure not
 * listed, for a listed entry that now passes (remove it), and for a listed entry about a family no preset deals.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateObject, evaluateSite, isInvalid, type ObjectType } from "@workspace/v2-core";
import { births, pairPmi, PMI_TABLES } from "@workspace/v2-agents/pure";
import { findVariant, valueLookup } from "@workspace/v2-valuation";
import { dealablePool, familyOf } from "../../convex/v2/deal.ts";
import { PRESETS, type Preset } from "../../convex/v2/presets.ts";
import { valueRecord } from "../../convex/v2/values.ts";
import { MAX_PER_FORM, MAX_PER_KIND, RULE_FORMS } from "./v2-rule-forms.ts";

const MIN_SECONDARIES = 3, MIN_INSTANCES = 4, DRAWS = 2000, MIN_DISTINCT = 3;
const PMI_ALIGNED = 2, PMI_ALIGNED_SHARE = 0.2, PMI_MAX = 4, PMI_MEAN = 1;

/**
 * Known failures: key → since when, who owns it, and what is planned. Keys: "<family> <row>" for a family's own rows
 * (3a, 4, 13:<layer>), "<preset> <row>" for a pool's (5, 7-kind:<kind>, 7-form:<form>).
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // Row 3a: one or two dealt secondaries. The owner's instruction (15 Nov): at least three per family. Lines: the spec
  // lead's repertoire work; pairs: the pairs session; grids-arithmetic: the grids session.
  "prime-landing 3a": "15 Nov, spec lead: repertoire in progress",
  "smooth-intercept 3a": "15 Nov, spec lead: repertoire in progress",
  "square-area 3a": "15 Nov, grids session: Square Area redesign",
  "opposite-nines 3a": "15 Nov, grids session: big-on-top undealt for a cheap peak (#902); grid repertoires after the deadline",
  "strangers 3a": "15 Nov, grids session: ones and prime-strangers undealt for cheap peaks (#902); grid repertoires after the deadline",
  "whole-crossing 3a": "15 Nov, spec lead: repertoire in progress",
  "treasure 3a": "15 Nov, spec lead: repertoire in progress",
  "same-on-both-rulers 3a": "15 Nov, spec lead: repertoire in progress",
  "prime-gradient 3a": "15 Nov, spec lead: repertoire in progress",
  "prime-staircase 3a": "15 Nov, spec lead: repertoire in progress",
  "ruler 3a": "15 Nov, grids session",
  "pythagorean-area 3a": "15 Nov, grids session",
  "whole-answer 3a": "15 Nov, pairs session",
  "no-fractions 3a": "15 Nov, pairs session",
  "right-angle 3a": "15 Nov, pairs session",
  "forty-five 3a": "15 Nov, pairs session",
  "double-gap 3a": "15 Nov, pairs session",
  "far-crossing 3a": "15 Nov, pairs session",
  "high-start 3a": "15 Nov, pairs session",
  "steep-ratio 3a": "15 Nov, pairs session",
  "divisibility 3a": "15 Nov, grids session",
  "leading-digits 3a": "15 Nov, grids session",
  // Row 4: one dealt parameter set.
  "square-area 4": "15 Nov, grids session: Square Area redesign",
  "mirrormancer 4": "15 Nov, grids session", "magic-eighteen 4": "15 Nov, grids session", "opposite-nines 4": "15 Nov, grids session",
  "two-pair 4": "15 Nov, grids session", "spread-of-three 4": "15 Nov, grids session", "strangers 4": "15 Nov, grids session",
  "leapfrog 4": "15 Nov, grids session", "crosswise-threes 4": "15 Nov, grids session",
  "kings-and-subjects 4": "15 Nov, grids session", "stepping-stones 4": "15 Nov, grids session", "mountain-climb 4": "15 Nov, grids session",
  "uphill 4": "15 Nov, grids session", "staircase 4": "15 Nov, grids session", "magic-accountant 4": "15 Nov, grids session",
  "fillomino 4": "15 Nov, grids session",
  // Row 7: forms repeated within a family, kinds and forms shared by more than three families.
  "square-area 7-repeat": "15 Nov, grids session: spf and lpf are both prime-factor sizes (Square Area redesign)",
  "far-crossing 7-repeat": "15 Nov, pairs session: both secondaries are near-multiples",
  "high-start 7-repeat": "15 Nov, pairs session: both secondaries are near-multiples",
  "lines-beginner 7-kind:large-prime": "15 Nov, spec lead: proposal #28 (two of the prime-ending families change kind)",
  "lines-lenses 7-kind:large-prime": "15 Nov, spec lead: proposal #28",
  "lines-beginner 7-form:shares-factor": "15 Nov, spec lead: the repertoire adds other forms",
  "lines-lenses 7-form:shares-factor": "15 Nov, spec lead: the repertoire adds other forms",
  "lines-pairs 7-kind:base-ladder": "15 Nov, pairs session: every pair family climbs a base's ladder",
  "lines-pairs 7-form:shares-factor": "15 Nov, pairs session",
  "grids-beginner 7-form:second-axis": "15 Nov, grids session",
  // Row 5: no PMI table for the variant yet (lib/v2-agents scripts/pmi.ts).
  "lines-lenses 5-unmeasured": "15 Nov, spec lead: PMI table for line-q-lenses",
  "grids-beginner 5-unmeasured": "15 Nov, grids session: PMI table for grid-4-d10",
  "grids-more-rules 5-unmeasured": "15 Nov, grids session: PMI table for grid-4-d10",
  "grids-arithmetic 5-unmeasured": "15 Nov, grids session: PMI table for grid-4-d10",
  "lines-pairs 5-unmeasured": "15 Nov, pairs session: PMI table for pair-q",
  // Decision 13. Prime Staircase's shared factor needs a run of two primes, which law draws do not reach: it reads 0
  // on all of them. Whether it takes many values on the rungs is not measured here.
  "prime-staircase 13:shared-factor": "15 Nov, spec lead: measure on rungs; trial 30 replaces it with near-miss",
};

interface Problem { key: string; why: string }

/** Presets with the same variant and pool are one pool (the bidding presets). */
function pools(): { preset: Preset; rules: ReturnType<typeof dealablePool> }[] {
  const seen = new Set<string>();
  return PRESETS.flatMap(preset => {
    const rules = dealablePool(preset), key = `${preset.variant}|${rules.map(r => r.ruleKey).join()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ preset, rules }];
  });
}

function problems(): { found: Problem[]; families: Set<string>; presets: Set<string> } {
  const found: Problem[] = [], families = new Set<string>(), presets = new Set<string>();
  const once = new Set<string>();
  const add = (key: string, why: string) => { if (!once.has(key)) { once.add(key); found.push({ key, why }); } };
  for (const { preset, rules } of pools()) {
    presets.add(preset.id);
    const { type, variant } = findVariant(preset.variant);
    const byFamily = new Map<string, typeof rules>();
    for (const r of rules) byFamily.set(r.family, [...(byFamily.get(r.family) ?? []), r]);
    const kinds = new Map<string, string[]>(), forms = new Map<string, string[]>();
    const draws = births(type as ObjectType<unknown>, variant, `rule-check-${preset.variant}`, DRAWS);
    for (const [id, rs] of byFamily) {
      families.add(id);
      const fam = familyOf(id);
      const tbs = [...new Set(rs.map(r => r.tieBreaker))];
      // Row 3a.
      if (tbs.some(t => (t ?? "").split(">").length > 1) && preset.id.includes("beginner")) add(`${preset.id} 3a-depth`, `${id} deals more than one secondary in a beginner preset`);
      if (tbs.filter(t => t !== null).length < MIN_SECONDARIES) add(`${id} 3a`, `${tbs.filter(t => t !== null).length} dealt secondaries (${tbs.join(", ")})`);
      // Row 4.
      const instances = new Set(rs.map(r => JSON.stringify(r.params))).size;
      if (instances < MIN_INSTANCES) add(`${id} 4`, `${instances} dealt parameter sets`);
      // Row 7: declared kind and forms.
      const decl = RULE_FORMS[id];
      if (!decl) { add(`${id} 7-declared`, "no entry in v2-rule-forms.ts"); continue; }
      kinds.set(decl.kind, [...(kinds.get(decl.kind) ?? []), id]);
      const famForms: string[] = [];
      for (const tb of tbs) for (const layer of (tb ?? "").split(">").filter(Boolean)) {
        const form = decl.forms[layer];
        if (!form) { add(`${id} 7-declared`, `no form for ${layer} in v2-rule-forms.ts`); continue; }
        if (!famForms.includes(form)) famForms.push(form);
        else add(`${id} 7-repeat`, `deals the form ${form} twice`);
      }
      for (const f of famForms) forms.set(f, [...(forms.get(f) ?? []), id]);
      // Decision 13: every dealt layer takes many values over law draws (one parameter set per secondary).
      for (const tb of tbs) {
        const r = rs.find(x => x.tieBreaker === tb)!;
        const parts = new Map<number, Set<string>>();
        for (const s of draws) {
          const score = evaluateObject(type as ObjectType<unknown>, fam, r.params, s, variant, tb).score;
          score?.forEach((x, i) => { if (x !== null) { const set = parts.get(i) ?? new Set(); set.add(`${x.n}/${x.d}`); parts.set(i, set); } });
        }
        const layers = [fam.main.id, ...(tb ?? "").split(">").filter(Boolean)];
        layers.forEach((l, i) => { const n = parts.get(i)?.size ?? 0; if (n < MIN_DISTINCT) add(`${id} 13:${l}`, `${n} distinct values over ${DRAWS} law draws on ${preset.variant}`); });
      }
    }
    for (const [k, ids] of kinds) if (ids.length > MAX_PER_KIND) add(`${preset.id} 7-kind:${k}`, `${ids.length} families reward ${k}: ${ids.join(", ")}`);
    for (const [f, ids] of forms) if (ids.length > MAX_PER_FORM) add(`${preset.id} 7-form:${f}`, `${ids.length} families deal the form ${f}: ${ids.join(", ")}`);
    // Row 5.
    if (PMI_TABLES[preset.variant]) {
      const keys = [...new Set(rules.map(r => `${r.family}/${r.tieBreaker}`))];
      const vals: number[] = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (keys[i]!.split("/")[0] === keys[j]!.split("/")[0]) continue;
        const x = pairPmi(preset.variant, keys[i]!, keys[j]!);
        if (x) vals.push(x.pmi); else add(`${preset.id} 5-unmeasured`, `${keys[i]} × ${keys[j]} has no PMI: regenerate the table`);
      }
      const aligned = vals.filter(v => v > PMI_ALIGNED).length / Math.max(vals.length, 1), max = Math.max(...vals), mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
      if (aligned > PMI_ALIGNED_SHARE || max > PMI_MAX || mean > PMI_MEAN) add(`${preset.id} 5`, `aligned ${(100 * aligned).toFixed(0)}%, max ${max.toFixed(2)}, mean ${mean.toFixed(2)} bits over ${vals.length} pairs`);
    } else add(`${preset.id} 5-unmeasured`, `no PMI table for ${preset.variant}`);
  }
  return { found, families, presets };
}

test("every preset's dealt pool passes rows 3a, 4, 5 and 7 and decision 13, or the failure is listed in EXEMPT", () => {
  const { found, families, presets } = problems();
  console.log(found.map(p => `${p.key}: ${p.why}${p.key in EXEMPT ? " (exempt)" : ""}`).join("\n"));
  const failing = new Set(found.map(p => p.key));
  assert.deepEqual(found.filter(p => !(p.key in EXEMPT)).map(p => `${p.key}: ${p.why}`), [], "new failures: fix them, or list them in EXEMPT with a date and an owner");
  const subject = (k: string) => k.split(" ")[0]!;
  assert.deepEqual(Object.keys(EXEMPT).filter(k => !families.has(subject(k)) && !presets.has(subject(k))), [], "exemptions about a family or preset nothing deals: remove them");
  assert.deepEqual(Object.keys(EXEMPT).filter(k => !failing.has(k)), [], "exemptions that now pass: remove them");
});

/**
 * Row 10 (principle 11: "Rules should still keep some of their value when modest sized perturbations occur"), on the
 * line presets: from each ladder family's good states (its witnesses for rungs 2 and 3: cheap lines on a rung), every
 * cheap move (a unit shift or tilt, a nudge of a, b or c by 1, each reflection) keeps on the median at least half the
 * rule's bits, and none leaves less than half the first rung's bits. Known failures are listed in ROW10_EXEMPT.
 */
const CHEAP: readonly { mutator: string; args: Record<string, string> }[] = [
  ...["1", "-1"].flatMap(k => [{ mutator: "si.shift", args: { k } }, { mutator: "si.tilt", args: { k } }]),
  ...["a", "b", "c"].flatMap(which => ["1", "-1"].map(k => ({ mutator: "gen.nudge", args: { which, k } }))),
  ...["x", "y", "origin", "diagonal"].map(axis => ({ mutator: "cart.mirror", args: { axis } })),
];
const ROW10_EXEMPT: Readonly<Record<string, string>> = {
  "prime-landing": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "smooth-intercept": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "whole-crossing": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "treasure": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "same-on-both-rulers": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "prime-staircase": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "ruler": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
  "pythagorean-area": "16 Nov, spec lead: the shoulder remedy (pool-plan.md)",
};

test("row 10: a cheap move from a rung keeps most of a line rule's bits, or the family is listed in ROW10_EXEMPT", () => {
  const found = new Map<string, string>();
  for (const { preset, rules } of pools()) {
    const { type, variant } = findVariant(preset.variant);
    if (type.id !== "line") continue;
    const T = type as ObjectType<unknown>;
    for (const r of rules) {
      const fam = familyOf(r.family), rec = valueRecord(r.ruleKey);
      if (!fam.witness || !rec) continue;
      const look = valueLookup(rec);
      const bits = (s: unknown) => { const e = evaluateSite(T, fam as never, r.params, s as never, variant, 0, r.tieBreaker); return e.score === null ? 0 : look(e.score).bits; };
      const first = Math.max(0, ...fam.witness(r.params, 1).map(bits));
      const kept: number[] = [];
      let worst = Infinity;
      for (const n of [2, 3]) for (const s of fam.witness(r.params, n)) {
        const b0 = bits(s);
        if (!(b0 > first)) continue;
        for (const c of CHEAP) {
          const a = applyCall(T, variant, s, { mutator: c.mutator, site: 0, args: c.args });
          if (isInvalid(a)) continue;
          const b1 = bits(a.result);
          kept.push(b1 / b0);
          worst = Math.min(worst, b1);
        }
      }
      if (!kept.length) continue;
      kept.sort((x, y) => x - y);
      const median = kept[kept.length >> 1]!;
      if (median < 0.5 || worst < first / 2) {
        const why = `median ${(100 * median).toFixed(0)}% of the bits kept after a cheap move; the worst leaves ${worst.toFixed(1)} bits (first rung ${first.toFixed(1)})`;
        const prev = found.get(r.family);
        if (!prev) found.set(r.family, why);
      }
    }
  }
  console.log([...found].map(([k, v]) => `${k}: ${v}${k in ROW10_EXEMPT ? " (exempt)" : ""}`).join("\n"));
  assert.deepEqual([...found.keys()].filter(k => !(k in ROW10_EXEMPT)), [], "new failures: fix them, or list them in ROW10_EXEMPT with a date and an owner");
  assert.deepEqual(Object.keys(ROW10_EXEMPT).filter(k => !found.has(k)), [], "exemptions that now pass: remove them");
});
