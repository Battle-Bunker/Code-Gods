/**
 * The 247k case and an adversary (coordinator, 14 November 2026; owner decision 30: unbounded hills are wanted, and
 * collapse is prevented by adversaries and diversity of goals). Analysis only: nothing here changes game behaviour.
 *
 *   node --experimental-strip-types scripts/adversary.ts [--games 2] [--seconds 300] [--objects 10] [--births 0.05] [--beta 0.05]
 *
 * 1. Plays Prime Landing/big-prime, Square Area/spf and Whole Crossing/k-spf on line-q with the shortcut climber.
 * 2. Ranks every other rule of the pool by how its bits move as c/(−m) and the root √(c²/2|m|) grow (lines
 *    y = mx + c, m ∈ {−3, −2, −1, 1, 2, 3}, c from 20 to 800): an adversary's bits fall along that direction.
 * 3. Plays the table again with the most adverse rule in place of Square Area/spf.
 * Reports per table: points per seat, the shortcut moves' share of the gains, the best line, and whether lines like
 * y = −2x + 734 (|m| ≤ 3, |c| ≥ 300) are reached.
 */
import { parseArgs } from "node:util";
import { q } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import { sandboxes } from "../src/index.ts";
import { lineStarter, playTable, SHORTCUT } from "./climbers.ts";
import { corr, poolOf, ruleName, spaceOf, type Rule } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  games: { type: "string", default: "2" }, seconds: { type: "string", default: "300" }, objects: { type: "string", default: "10" },
  births: { type: "string", default: "0.05" }, beta: { type: "string", default: "0.05" },
} });
const space = spaceOf("line-q");
const pool = poolOf("line-q").rules;
const find = (id: string) => { const r = pool.find(x => ruleName(x) === id); if (!r) throw new Error(`line-q's pool has no ${id}`); return r; };
const TABLE = ["prime-landing/big-prime", "square-area/spf", "whole-crossing/k-spf"].map(find);
const say = (s = "") => console.log(s);
const f1 = (x: number) => x.toFixed(1), pct = (x: number) => `${Math.round(100 * x)}%`;

// ---------------------------------------------------------------- the direction and the adversaries

const sweep: { s: LineState; k: number; root: number }[] = [];
for (const m of [-3, -2, -1, 1, 2, 3]) for (let c = 20; c <= 800; c++) sweep.push({ s: { lines: [fromMC(q(m), q(c))] }, k: Math.log2(Math.abs(c / m)), root: Math.log2(Math.sqrt((c * c) / (2 * Math.abs(m)))) });
const slope = (xs: number[], ys: number[]) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; } return sxy / sxx; };
const along = (rule: Rule) => {
  const b = space.bits(rule), ys = sweep.map(p => b(p.s));
  const lo = ys.slice(0, 60).reduce((a, x) => a + x, 0), hi = sweep.map((p, i) => (p.k >= 8 ? ys[i]! : NaN)).filter(Number.isFinite);
  return { rule, slopeK: slope(sweep.map(p => p.k), ys), corrK: corr(sweep.map(p => p.k), ys), corrRoot: corr(sweep.map(p => p.root), ys), meanSmall: lo / 60, meanLarge: hi.reduce((a, x) => a + x, 0) / Math.max(1, hi.length) };
};
const ranked = pool.map(along).sort((a, b) => a.slopeK - b.slopeK);
say("## Bits along the table's direction (c/(−m) and the root growing; lines y = mx + c, |m| ≤ 3, 20 ≤ c ≤ 800)");
say("");
say("| Rule | Slope (bits per doubling of c/m) | Corr with log c/m | Corr with log root | Mean bits, c/m small → ≥ 256 |");
say("|---|--:|--:|--:|---|");
for (const r of [...ranked.slice(0, 8), ...TABLE.map(along)]) say(`| ${ruleName(r.rule)}${TABLE.includes(r.rule) ? " (seated)" : ""} | ${f1(r.slopeK)} | ${r.corrK.toFixed(2)} | ${r.corrRoot.toFixed(2)} | ${f1(r.meanSmall)} → ${f1(r.meanLarge)} |`);
say("");
const adversary = ranked.find(r => !TABLE.includes(r.rule))!;
say(`Most adverse rule outside the table: ${ruleName(adversary.rule)} (slope ${f1(adversary.slopeK)} bits a doubling${adversary.slopeK < 0 ? "" : ": none falls, so the pool has no adversary for this direction"}).`);
say("");

// ---------------------------------------------------------------- the tables

const boxes = sandboxes();
async function play(label: string, rules: Rule[]) {
  say(`## ${label}: ${rules.map(ruleName).join(", ")} (line-q, ${o.objects} objects, ${o.births} births/s, shortcut climbers, β ${o.beta}, ${o.games} games)`);
  say("");
  say("| Game | Objects | Points gained per seat | Table total gained | Shortcut moves' share of gains | Idle (last minute) | Best line (table total on it) | Lines with \\|m\\| ≤ 3, \\|c\\| ≥ 300 |");
  say("|--:|---|---|--:|--:|--:|---|--:|");
  for (let g = 0; g < Number(o.games); g++) {
    const p = await playTable(boxes, {
      type: lineType, variant: lineQ, seats: rules.map(rule => ({ rule, program: lineStarter(rule.family, SHORTCUT) })), bits: r => space.bits(r), beta: Number(o.beta),
      objects: Number(o.objects), birthsPerSecond: Number(o.births), seconds: Number(o.seconds), seed: `adversary-g${g}`, economy: E, summonCap: E.startingEnergy,
    });
    const bs = rules.map(r => space.bits(r));
    const F = (s: LineState) => { const n = bs.map(b => b(s)), t = n.reduce((a, b) => a + b, 0); return n.reduce((a, x) => a + x * (t - x), 0); };
    const best = p.final.reduce((a, s) => (F(s) > F(a) ? s : a));
    const mc = (s: LineState) => { const l = s.lines[0]!; return l.b === 0n ? null : { m: -Number(l.a) / Number(l.b), c: -Number(l.c) / Number(l.b) }; };
    const far = p.final.filter(s => { const x = mc(s); return x && Math.abs(x.m) <= 3 && Math.abs(x.c) >= 300; }).length;
    const all = Object.values(p.byMutator).reduce((t, x) => t + x.points, 0);
    const sc = Object.entries(p.byMutator).filter(([k]) => /stretch|pivot|mirror/.test(k)).reduce((t, [, x]) => t + x.points, 0);
    const b = mc(best);
    say(`| ${g} | ${p.objects.start} → ${p.objects.end} | ${p.seats.map(s => `${s.rule} ${Math.round(s.gained).toLocaleString("en")}`).join("; ")} | ${Math.round(p.seats.reduce((t, s) => t + s.gained, 0)).toLocaleString("en")} | ${all ? pct(sc / all) : "–"} | ${pct(p.idle)} | ${b ? `y = ${+b.m.toFixed(3)}x + ${+b.c.toFixed(3)}` : lineType.encode(best)} (${Math.round(F(best)).toLocaleString("en")}) | ${far} of ${p.final.length} |`);
  }
  say("");
}
await play("The 247k table", TABLE);
await play("With an adversary", [TABLE[0]!, adversary.rule, TABLE[2]!]);
await boxes.close();
