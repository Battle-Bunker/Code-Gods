/**
 * Knocks against the law's code length (the coordinator's question, 16 Nov: "repair should always be more expensive
 * than damage"). Plays beginner games as scripts/competitive.ts does and, for every committed move that lowered another
 * seat's bits on the object (a knock), records the change in φ (type.readLength), the move kind (its mutators), its change
 * price W (bits) and the repair's: the cheapest inverse that puts the object back exactly (the same mutator with the
 * opposite argument, or the same one again for an involution; multi-call moves undone call by call in reverse), priced
 * by the same applyCalls. Classes: down (Δφ ≤ −1), sideways (|Δφ| < 1), up (Δφ ≥ 1). Also: of the states where a seat
 * holds at least HIGH bits, the share whose φ is above the median φ of its one-step neighbours (is "high score" high
 * energy?).
 *
 *   node --experimental-strip-types scripts/knock-phi.ts --preset lines-beginner --games 4 [--rows naive,naive,naive;mixed,naive,naive]
 */
import { parseArgs } from "node:util";
import { applyCalls, isInvalid, type Call, type ObjectType, type Variant } from "@workspace/v2-core";
import { gridType, grid4 } from "@workspace/v2-grid";
import { lineQ, lineType } from "@workspace/v2-linear";
import { changeCharge } from "../src/host.ts";
import { valuer } from "../src/harness.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { dealablePool, freshDeal } from "../../../artifacts/engine/convex/v2/deal.ts";
import { presetOf } from "../../../artifacts/engine/convex/v2/presets.ts";
import { competitive, type CompetitiveKind } from "./competitive-agents.ts";

const { values: o } = parseArgs({ options: { preset: { type: "string", default: "lines-beginner" }, games: { type: "string", default: "4" }, rows: { type: "string", default: "naive,naive,naive;mixed,naive,naive" } } });
const preset = presetOf(o.preset!), grid = preset.variant === grid4.id;
const type = (grid ? gridType : lineType) as ObjectType<unknown>, variant: Variant = grid ? grid4 : lineQ;
const pool = dealablePool(preset), boxes = sandboxes();
const HIGH = 6;
const phi = (s: unknown) => type.readLength(s, variant);
const median = (x: number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "-");

const neg = (v: string) => (v.startsWith("-") ? v.slice(1) : v === "0" ? v : `-${v}`);
const inv = (v: string) => { const sign = v.startsWith("-") ? "-" : "", [n, d] = v.replace(/^-/, "").split("/"); return d ? `${sign}${d}/${n}` : `${sign}1/${n}`; };
/** The inverse of one call at a state: the candidate whose result is `back`, with its price (bits). */
function undo(c: Call, at: unknown, back: string): { calls: Call[]; w: number } | null {
  const cands: Record<string, string>[] = [
    Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, /^-?\d+(\/\d+)?$/.test(v) ? neg(v) : v])),
    { ...c.args },
    Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, /^-?\d+(\/\d+)?$/.test(v) && k === "f" ? inv(v) : v])),
  ];
  let best: { calls: Call[]; w: number } | null = null;
  for (const args of cands) {
    const r = applyCalls(type, variant, at, [{ mutator: c.mutator, site: c.site, args }]);
    if (isInvalid(r) || type.encode(r.result) !== back) continue;
    if (!best || r.total < best.w) best = { calls: [{ mutator: c.mutator, site: c.site, args }], w: r.total };
  }
  return best;
}
/** One-step neighbours (the cheapest additive steps of the menu). */
function neighbours(s: unknown): unknown[] {
  const calls: Call[] = grid
    ? Array.from({ length: 16 }, (_, i) => [-1, 1].map(k => ({ mutator: "cells.add", site: 0, args: { cell: `r${Math.floor(i / 4)}c${i % 4}`, k: String(k) } }))).flat()
    : ["si.shift", "si.tilt"].flatMap(m => [-1, 1].map(k => ({ mutator: m, site: 0, args: { k: String(k) } })));
  return calls.flatMap(c => { const r = applyCalls(type, variant, s, [c]); return isInvalid(r) ? [] : [r.result]; });
}

interface Knock { cls: "down" | "sideways" | "up"; kind: string; dphi: number; w: number; repair: number | null; destroyed: number }
const knocks: Knock[] = [];
let high = 0, highAbove = 0, highBits = 0, highAboveBits = 0;
for (const row of o.rows!.split(";")) {
  const kinds = row.split(",") as ("naive" | CompetitiveKind)[];
  for (let g = 0; g < Number(o.games); g++) {
    const deal = freshDeal(pool, 3, `competitive:${preset.id}:${g}`, preset.variant);
    const rot = g % 3;
    const seats = deal.map((d, i) => {
      const k = kinds[(i - rot + 3) % 3]!, a = startersFor(d.family, "typescript").find(x => x.kind === "simple")!;
      return { name: `P${i}`, kind: "starter" as const, rule: { family: d.family, params: d.params as Record<string, unknown>, tieBreaker: d.tieBreaker }, program: { language: "typescript" as const, source: k === "naive" ? a.source : competitive(a.source, k, 2) } };
    });
    const vals = seats.map(s => valuer(type, variant, s.rule));
    await runTable(boxes, {
      type, variant, seats, lines: preset.startingObjects, seed: `competitive:${preset.id}:${g}`, seconds: preset.worldSeconds, unique: true,
      economy: { ...preset.economy, startingEnergy: preset.startingEnergy }, birthsPerSecond: preset.economy.birthsPerSecond, summonCap: preset.startingEnergy,
      ...(preset.regularBirths ? { regularBirths: true } : {}), ...(preset.driftSeconds ? { driftSeconds: preset.driftSeconds } : {}),
      onAct: e => {
        if (!e.committed) return;
        const b = vals.map(v => v.bits(e.before)), a = vals.map(v => v.bits(e.state));
        // High states: is a high-bits state above its neighbours in φ?
        a.forEach((x, j) => { if (x >= HIGH) {
          const nb = neighbours(e.state).map(phi);
          high++; highBits += x;
          if (nb.length && phi(e.state) > median(nb)) { highAbove++; highAboveBits += x; }
        } });
        const destroyed = b.reduce((t, x, j) => (j === e.seat ? t : t + Math.max(0, x - a[j]!)), 0);
        if (destroyed < 0.5) return;
        const dphi = phi(e.state) - phi(e.before);
        // Undo call by call, last first, from the state after.
        let at: unknown = e.state, w = 0, ok = true;
        const states = [e.before];
        { let s: unknown = e.before; for (const c of e.calls) { const r = applyCalls(type, variant, s, [{ mutator: c.mutator, site: c.site, args: c.args }]); if (isInvalid(r)) { ok = false; break; } s = r.result; states.push(s); } }
        for (let k = e.calls.length - 1; ok && k >= 0; k--) {
          const u = undo({ mutator: e.calls[k]!.mutator, site: e.calls[k]!.site, args: e.calls[k]!.args }, at, type.encode(states[k]!));
          if (!u) { ok = false; break; }
          w += u.w; at = states[k]!;
        }
        knocks.push({ cls: dphi <= -1 ? "down" : dphi >= 1 ? "up" : "sideways", kind: e.calls.map(c => c.mutator).join("+"), dphi, w: e.calls.reduce((t, c) => t + c.price.total, 0), repair: ok ? w : null, destroyed });
      },
    });
    process.stderr.write(`${row} game ${g}: ${knocks.length} knocks so far\n`);
  }
}
boxes.close();

console.log(`\n${preset.id}: ${knocks.length} knocks (moves lowering another seat's bits by ≥ 0.5) in ${o.games} games per row (${o.rows})\n`);
console.log("| Class | Share | Mean Δφ | Knock W, median (energy) | Exact undo W, median (energy) | Undo found | Undo − knock, median | Bits destroyed, median |");
console.log("|---|---|---|---|---|---|---|---|");
for (const cls of ["down", "sideways", "up"] as const) {
  const k = knocks.filter(x => x.cls === cls), r = k.filter(x => x.repair !== null);
  console.log(`| ${cls} | ${f((100 * k.length) / knocks.length, 0)}% (${k.length}) | ${f(mean(k.map(x => x.dphi)))} | ${f(median(k.map(x => x.w)))} (${f(changeCharge(median(k.map(x => x.w))))}) | ${f(median(r.map(x => x.repair!)))} (${f(changeCharge(median(r.map(x => x.repair!))))}) | ${f((100 * r.length) / Math.max(1, k.length), 0)}% | ${f(median(r.map(x => x.repair! - x.w)))} | ${f(median(k.map(x => x.destroyed)))} |`);
}
console.log("\n| Class | Move kinds (share of the class's knocks) |\n|---|---|");
for (const cls of ["down", "sideways", "up"] as const) {
  const k = knocks.filter(x => x.cls === cls), by = new Map<string, number>();
  for (const x of k) by.set(x.kind, (by.get(x.kind) ?? 0) + 1);
  console.log(`| ${cls} | ${[...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, n]) => `${m} ${f((100 * n) / k.length, 0)}%`).join(", ")} |`);
}
console.log(`\nHigh states (a seat holds ≥ ${HIGH} bits): ${high}; φ above the median of its one-step neighbours: ${f((100 * highAbove) / Math.max(1, high), 0)}% of states, ${f((100 * highAboveBits) / Math.max(1, highBits), 0)}% of their bits.`);
