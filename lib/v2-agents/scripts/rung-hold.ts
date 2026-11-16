/**
 * Rung geometry (the coordinator's order after #856): from rung starts (a law draw moved by the cheapest shift or tilt
 * onto level 1, as scripts/pair-climb.ts), the share of single moves that keep the main part's level, and the share that
 * keep it and change the tie-breaker (tie-breaker work on the rung), and that raise the level (a next step). Per dealt
 * rule, over the first dealt numbers. Analysis only.
 *
 *   node --experimental-strip-types scripts/rung-hold.ts [--starts 8]
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, rng } from "@workspace/v2-core";
import { pairLaw, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { poolOf } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: { starts: { type: "string", default: "8" }, family: { type: "string" } } });
const STARTS = Number(o.starts);
const FACTORS = ["2", "3", "5", "7", "1/2", "1/3", "-1"];
const AMOUNTS = ["1", "-1", "2", "-2", "1/2", "-1/2"];
const CALLS = ["1", "2"].flatMap(line => [
  ...FACTORS.map(f => ({ mutator: "mach.stretch", args: { line, f } })),
  { mutator: "pair.reflect", args: { line } }, { mutator: "pair.quarter", args: { line } },
  ...AMOUNTS.flatMap(k => [{ mutator: "si.shift", args: { line, k } }, { mutator: "si.tilt", args: { line, k } }, { mutator: "pair.turn", args: { line, k } }]),
  ...["1", "-1", "2", "-2"].flatMap(k => [{ mutator: "pair.slide", args: { line, k } }, { mutator: "pair.combine", args: { line, k } }]),
]).concat(["2", "3", "5", "7", "11", "1/2", "1/3", "1/5", "1/7"].map(f => ({ mutator: "sys.zoom", args: { f } }))).concat(["1", "-1"].flatMap(u => [{ mutator: "sys.translate", args: { u, v: "0" } }, { mutator: "sys.translate", args: { u: "0", v: u } }]));
const apply = (s: PairState, c: { mutator: string; args: Record<string, string> }) => {
  const a = applyCall(pairType, pairQ, s, { mutator: c.mutator, site: 0, args: c.args });
  return isInvalid(a) ? null : { s: a.result, fee: a.price.total };
};
const only = o.family ? new Set(o.family.split(",")) : null;
const seen = new Set<string>(), law = pairLaw(pairQ);
console.log("| rule | starts | moves | keep the level | keep it and change the tie-breaker | raise the level | starts with a next step by zoom then slide |");
console.log("|---|--:|--:|--:|--:|--:|--:|");
for (const rule of poolOf("pair-q").rules) {
  const key = `${rule.family}/${rule.tieBreaker}`;
  if (seen.has(key) || (only && !only.has(rule.family))) continue;
  seen.add(key);
  const fam = pairType.families.find(f => f.id === rule.family)!;
  const p = rule.params as { q?: number; k?: number }, base = p.q ?? p.k ?? 2;
  const score = (s: PairState) => evaluateSite(pairType, fam as never, rule.params, s, pairQ, 0, rule.tieBreaker).terms;
  const num = (t: { value: unknown } | undefined) => { const v = t?.value as { n: bigint; d: bigint } | undefined; return v && typeof v === "object" && "n" in v ? Number(v.n) / Number(v.d) : NaN; };
  const level = (s: PairState) => { const v = num(score(s)[0]); return v > 0 ? Math.floor(Math.log(v) / Math.log(base) + 1e-9) : -Infinity; };
  const r = rng("rung-hold", key);
  let starts = 0, moves = 0, keep = 0, work = 0, up = 0, two = 0;
  for (let k = 0; starts < STARTS && k < 200; k++) {
    const d = law.draw(r, 1);
    if (!d.state) continue;
    let best: { s: PairState; fee: number } | null = null;
    for (const m of ["si.shift", "si.tilt"]) for (const line of ["1", "2"]) for (let j = -60; j <= 60; j++) {
      if (!j) continue;
      const x = apply(d.state, { mutator: m, args: { line, k: String(j) } });
      if (x && level(x.s) >= 1 && (!best || x.fee < best.fee)) best = x;
    }
    if (!best) continue;
    starts++;
    const s = best.s, L = level(s), tb = num(score(s)[1]);
    for (const c of CALLS) {
      const x = apply(s, c);
      if (!x) continue;
      moves++;
      const L2 = level(x.s);
      if (L2 === L) { keep++; if (num(score(x.s)[1]) !== tb) work++; } else if (L2 > L) up++;
    }
    // The next step in two shortcut moves: zoom by the base, then slide the plane by the remainder (either way, either axis).
    const z = apply(s, { mutator: "sys.zoom", args: { f: String(base) } }), rr = String((p as { r?: number }).r ?? 0);
    const nexts = z ? [z, ...["u", "v"].flatMap(ax => [rr, `-${rr}`].map(k => apply(z.s, { mutator: "sys.translate", args: ax === "u" ? { u: k, v: "0" } : { u: "0", v: k } })))] : [];
    if (nexts.some(x => x && level(x.s) > L)) two++;
  }
  const pc = (n: number) => `${moves ? Math.round((100 * n) / moves) : 0}%`;
  console.log(`| ${key} ${JSON.stringify(rule.params)} | ${starts} | ${moves} | ${pc(keep)} | ${pc(work)} | ${pc(up)} | ${two}/${starts} |`);
}
