/**
 * The rule check (docs/engine-v2/design-principles.md) on every preset's dealt pool, lines, grids and pairs alike, for
 * the rows that read a family's declarations and its law draws:
 *
 * - 3a: at least three dealt secondaries per dealt family, of different forms (any depth may be dealt, beginner
 *   included: design-principles.md principle 3b);
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
  // The coloured boards' original-rules baseline (lib/v2-grid-boards, "Grids · original colours"; coordinator's call 37):
  // v1's colour families as v1 had them, with v1's secondaries (one or none) and v1's parameters. To be redesigned with
  // the owner later, not by a session.
  "chessmaster 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "chessmaster 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "parity-painter 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "colour-mirror 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "colour-mirror 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "picture-frame 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "picture-frame 4": "16 Nov, boards worker: grid baseline (call 37); one symbol dealt for equal opportunity, 0–2 fail the energy gate",
  "colour-bonds 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "colour-bonds 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "honest-minesweeper 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "honest-minesweeper 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "kingdom 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "kingdom 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "set-spotter 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "set-spotter 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  // v1's number families on the same board, as v1 had them (lib/v2-grid-boards v1-numbers-*.ts): v1's one secondary
  // (or none) and v1's one parameter set (Magic Accountant: one target of v1's seven, presets.ts UNDEALT).
  "original-magic-eighteen 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-magic-eighteen 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-opposite-nines 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-opposite-nines 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-two-pair 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-two-pair 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-spread-three 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-spread-three 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-strangers 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-strangers 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-leapfrog 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-leapfrog 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-crosswise-threes 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-crosswise-threes 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-magic-accountant 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-magic-accountant 4": "16 Nov, boards worker: grid baseline (call 37); one target dealt: 16 and 20 have one-digit tops, the rest are not peers",
  "original-stepping-stones 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-stepping-stones 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-kings-and-subjects 3a": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "original-kings-and-subjects 4": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  // v1's secondaries on these were mostly a distance from the main part's target (6 families).
  "grids-original-colours 7-form:distance": "16 Nov, boards worker: grid baseline: ported as v1 (call 37)",
  "grids-original-colours 5-unmeasured":"16 Nov, boards worker: no PMI table for board-4-base10-rgb yet (baseline, call 37)",

  // Row 3a: one or two dealt secondaries. The owner's instruction (15 Nov): at least three per family. Grids-arithmetic
  // withdrawn 16 Nov (pairs: three or more since trial 37). Lines have no secondaries since 17 Nov (decision 50).
  "opposite-nines 3a": "15 Nov, grids session: big-on-top undealt for a cheap peak (#902); grid repertoires after the deadline",
  "strangers 3a": "15 Nov, grids session: ones and prime-strangers undealt for cheap peaks (#902); grid repertoires after the deadline",
  // Row 1 (not checked here for grids): every beginner grid main part has a global top on the 0–9 board, as v1's did.
  // Leapfrog and Two Pair reached theirs in real games within 10 minutes (round 34, baseline 2); kept dealt as the v1
  // baseline by the coordinator (16 Nov). See docs/engine-v2/grid-v1-v2-compare.md, "Known reachable tops".
  "looking-glass 3a": "16 Nov, grids session: grid baseline: ported as v1",
  "pinwheel 3a": "16 Nov, grids session: grid baseline: ported as v1",
  "constellation 3a": "16 Nov, grids session: grid baseline: ported as v1",
  // Row 4: one dealt parameter set.
  "mirrormancer 4": "15 Nov, grids session", "magic-eighteen 4": "15 Nov, grids session", "opposite-nines 4": "15 Nov, grids session",
  "two-pair 4": "15 Nov, grids session", "spread-of-three 4": "15 Nov, grids session", "strangers 4": "15 Nov, grids session",
  "leapfrog 4": "15 Nov, grids session", "crosswise-threes 4": "15 Nov, grids session",
  "kings-and-subjects 4": "15 Nov, grids session", "stepping-stones 4": "15 Nov, grids session", "mountain-climb 4": "15 Nov, grids session",
  "uphill 4": "15 Nov, grids session", "staircase 4": "15 Nov, grids session", "magic-accountant 4": "15 Nov, grids session",
  "fillomino 4": "15 Nov, grids session",
  "round-numbers 4": "16 Nov, grids session: grid baseline: ported as v1",
  "column-addition 4": "16 Nov, grids session: grid baseline: ported as v1",
  "full-house 4": "16 Nov, grids session: grid baseline: ported as v1", "snap 4": "16 Nov, grids session: grid baseline: ported as v1",
  "looking-glass 4": "16 Nov, grids session: grid baseline: ported as v1",
  "pinwheel 4": "16 Nov, grids session: grid baseline: ported as v1",
  "constellation 4": "16 Nov, grids session: grid baseline: ported as v1 (one star dealt: the stars are not peers on v2's law)",
  "bingo-caller 4": "16 Nov, grids session: grid baseline: ported as v1",
  // Row 7: forms repeated within a family, kinds and forms shared by more than three families.
  "far-crossing 7-repeat": "15 Nov, pairs session: both secondaries are near-multiples",
  "high-start 7-repeat": "15 Nov, pairs session: both secondaries are near-multiples",
  "lines-pairs 7-kind:base-ladder": "15 Nov, pairs session: every pair family climbs a base's ladder",
  "lines-pairs 7-form:shares-factor": "15 Nov, pairs session",
  "lines-pairs 7-form:near-multiple": "16 Nov, pairs session: tie-breakers tied to the level (trial 37) favour near-multiples; spread after the deadline",
  "lines-pairs 7-form:factor-size": "16 Nov, pairs session: as near-multiple",
  "grids-beginner 7-form:second-axis": "15 Nov, grids session",
  "grids-more-rules 7-form:all-different": "16 Nov, grids session: grid baseline: ported as v1",
  "grids-more-rules 7-form:distance": "16 Nov, grids session: grid baseline: ported as v1",
  "grids-more-rules 7-form:big-values": "16 Nov, grids session: grid baseline: ported as v1",
  "grids-more-rules 7-form:count": "16 Nov, grids session: grid baseline: ported as v1",
  "grids-more-rules 7-form:reach": "16 Nov, grids session: grid baseline: ported as v1",
  // Row 5: no PMI table for the variant yet (lib/v2-agents scripts/pmi.ts).
  "lines-beginner 5-unmeasured": "16 Nov, implementation session: PMI is measured from value tables; the dynamic measure has none (energy.md)",
  "lines-lenses 5-unmeasured": "15 Nov, spec lead: PMI table for line-q-lenses",
  "grids-beginner 5-unmeasured": "15 Nov, grids session: PMI table for grid-4-d10",
  "grids-more-rules 5-unmeasured": "15 Nov, grids session: PMI table for grid-4-d10",
  "lines-pairs 5-unmeasured": "15 Nov, pairs session: PMI table for pair-q",
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
      // A family scored by the dynamic energy measure has no tie-breakers (precision is in its utility) and a large
      // parameter space dealt as peers: rows 3a, 4 and 7 read layers and tables it does not have. Its check table is
      // docs/engine-v2/energy.md.
      if (fam.dynamic) continue;
      const tbs = [...new Set(rs.map(r => r.tieBreaker))];
      // Row 3a.
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

/**
 * Defence goals (v1, restored; owner-decisions call 1): the penalties a grid preset could deal beside the rules, on the
 * rows a penalty can be held to: 1 (an unbounded main part: a badness that keeps growing), 3a (dealt secondaries) and 4
 * (dealt parameter sets). v1's penalties are counts of cells on a fixed board, with no tie-breaker: they fail as v1's
 * did, and are ported as v1 had them (off by default, as in v1), listed here with the date.
 */
const DEFENCE_EXEMPT: Readonly<Record<string, string>> = {
  "hated-number 1": "16 Nov, rules worker: ported as v1 (a count of cells, at most the board's 16)",
  "hated-number 3a": "16 Nov, rules worker: ported as v1 (no tie-breaker)",
  "number-crowd 1": "16 Nov, rules worker: ported as v1 (a count of cells, at most the board's 16)",
  "number-crowd 3a": "16 Nov, rules worker: ported as v1 (no tie-breaker)",
  "number-crowd 4": "16 Nov, rules worker: ported as v1 (one parameter set)",
};

test("defence goals pass rows 1, 3a and 4, or are listed in DEFENCE_EXEMPT as ported from v1", () => {
  const found = new Set<string>();
  for (const preset of PRESETS) {
    const { type, variant } = findVariant(preset.variant);
    for (const pf of type.penalties ?? []) {
      const sets = pf.dealable(variant) as unknown[];
      if (!sets.length) continue;
      if (pf.tieBreakers.length < MIN_SECONDARIES) found.add(`${pf.id} 3a`);
      if (sets.length < MIN_INSTANCES) found.add(`${pf.id} 4`);
      // Row 1: a main part that keeps growing. A count of cells tops out on a board of one number: the badness there is
      // the board's size, and nothing passes it.
      const T = type as ObjectType<unknown>, [born] = births(T, variant, `rule-check-${pf.id}`, 1);
      const size = (born as { cells?: unknown[] }).cells?.length;
      if (size !== undefined) for (const p of sets) {
        const v = (p as { value?: number }).value ?? 0, full = { cells: Array.from({ length: size }, () => v) };
        const main = evaluateSite(T, pf as never, p, full, variant, 0, null).terms[0]?.value as { n: bigint; d: bigint } | undefined;
        if (main && Number(main.n) / Number(main.d) === size) { found.add(`${pf.id} 1`); break; }
      }
    }
  }
  assert.deepEqual([...found].filter(k => !(k in DEFENCE_EXEMPT)).sort(), [], "new failures: fix them, or list them");
  assert.deepEqual(Object.keys(DEFENCE_EXEMPT).filter(k => !found.has(k)), [], "exemptions that now pass: remove them");
});
