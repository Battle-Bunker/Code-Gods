import { test } from "node:test";
import assert from "node:assert/strict";
import { q, rng } from "@workspace/v2-core";
import {
  closeness, drawLine, fromMC, mcOf, rarityBits, rarityHeight, rarityRules, READINGS, survivalOf, targetsPowersOf2,
  targetsPrimesEnding, targetsSmooth, type MC, type Targets,
} from "../src/index.ts";

// One shared sample of the law (300,000 lines); the script scripts/trial-rarity-check.ts runs the same check at 2M.
const N = 300_000, r = rng("rarity-test", 3);
const LINES: MC[] = Array.from({ length: N }, () => drawLine(r));
const sorted = (id: string) => LINES.map(l => READINGS[id]!.read(l)).filter((v): v is number => v !== null).sort((a, b) => a - b);
const atLeast = (vals: number[], x: number) => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m]! < x) lo = m + 1; else hi = m; } return (vals.length - lo) / N; };
const cellOf = (T: Targets, x: number) => { const t = T.around(x); return { t, lo: t.prev === 0 ? 0 : (t.prev + t.T) / 2, hi: (t.T + t.next) / 2 }; };
const SETS = [targetsPrimesEnding("13"), targetsPowersOf2, targetsSmooth([3, 17])];

test("the law's height is a function of the line (prices on it are an exact potential)", () => {
  const a = mcOf(fromMC(q(101), q(867)))!, b = mcOf(fromMC(q(202), q(1734)))!;
  assert.equal(rarityHeight(a), rarityHeight(mcOf(fromMC(q(101), q(867)))!));
  // a doubling of each of two tops costs about g = 2 bits each
  assert.ok(Math.abs(rarityHeight(b) - rarityHeight(a) - 4) < 0.05, `${rarityHeight(b) - rarityHeight(a)}`);
});

test("a coefficient's level: the summed survival matches direct samples within 0.35 bits (three target sets)", () => {
  const vals = sorted("c"), S = survivalOf(READINGS.c!);
  for (const T of SETS) for (const x of [17, 81, 113, 128]) {
    const { lo } = cellOf(T, x), emp = atLeast(vals, lo);
    if (emp * N < 300) continue;
    assert.ok(Math.abs(-Math.log2(S(lo)) + Math.log2(emp)) < 0.35, `${T.label} at ${x}: ${-Math.log2(S(lo))} vs ${-Math.log2(emp)}`);
  }
});

test("a coefficient's closeness (exact hit, one unit off) matches samples within 0.5 bits where the cell is well sampled", () => {
  const vals = sorted("c"), S = survivalOf(READINGS.c!);
  for (const T of SETS) for (const x of [16, 17, 81, 113]) {
    const { t, lo, hi } = cellOf(T, x), inCell = vals.filter(v => v >= lo && v < hi);
    if (inCell.length < 5000) continue;
    for (const d of [0, 1]) {
      const emp = inCell.filter(v => Math.abs(v - t.T) <= d + 0.5).length / inCell.length;
      assert.ok(Math.abs(closeness(t.T + d, t, S) + Math.log2(emp)) < 0.5, `${T.label} T=${t.T} d=${d}: ${closeness(t.T + d, t, S)} vs ${-Math.log2(emp)}`);
    }
  }
});

test("composite readings: a fitted power law, its slope as the theory says, its level within 0.45 bits from size 16 up", () => {
  const expect: Record<string, [number, number]> = { area: [0.4, 0.5], crossing: [0.65, 0.95], y3: [0.85, 1.0], dist2: [0.4, 0.5] };
  for (const [id, [a, b]] of Object.entries(expect)) {
    const S = survivalOf(READINGS[id]!) as ReturnType<typeof survivalOf> & { slope: number; maxErr: number };
    assert.ok(S.slope > a && S.slope < b, `${id} slope ${S.slope}`);
    const vals = sorted(id);
    for (const T of SETS) for (const x of [16, 81, 128, 613]) {
      const { lo } = cellOf(T, x), emp = atLeast(vals, lo);
      if (lo < 16 || emp * N < 300) continue;
      assert.ok(Math.abs(-Math.log2(S(lo)) + Math.log2(emp)) < 0.45, `${id} ${T.label} at ${x}: ${-Math.log2(S(lo))} vs ${-Math.log2(emp)}`);
    }
  }
});

test("a rule's bits lie between its level and the next level up: an exact hit is worth at most one level step", () => {
  for (const [m, c] of [[101, 867], [101, 866], [202, 1734], [1010, 8670]]) {
    const l = mcOf(fromMC(q(m), q(c)))!;
    for (const rule of rarityRules()) {
      const b = rarityBits(rule, l), S = survivalOf(rule.reading), t = rule.targets.around(rule.reading.read(l)!);
      const hi = (t.T + t.next) / 2;
      assert.ok(b.bits >= b.level - 1e-9 && b.bits <= -Math.log2(S(hi)) + 1e-9, `${rule.label} at ${m}, ${c}`);
    }
  }
});
