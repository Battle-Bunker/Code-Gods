/**
 * Mirror peers (the agents session's question, 15 Nov): Prime Landing and Prime Gradient deal each ending on both sides
 * (side −1 reads minus the primes), and one cart.mirror (about 5⚡) takes a rung of one to the same rung of the other. The
 * dealer never seats two of one family, so does a seat get rungs it did not climb for 5⚡ in play (lines parked on the
 * other side by births or by another family), and does the peer make its ladder cheaper?
 *
 *   node --experimental-strip-types scripts/mirror-peers.ts [--tables 8] [--seconds 600] [--draws 3000]
 *     [--families prime-landing,prime-gradient] [--play-only] [--without-mirror]
 *
 * Part 1, law draws: how often one mirror raises the seat's bits, and by how much, on side +1 and side −1 (a symmetric
 * law gives both the same: the control). Part 2, play: every dealt instance seated at --tables tables with two other
 * families, the shipped simple starters (which search mirrors since #855); each committed act of the seat that used
 * cart.mirror, its gain, and the share of the seat's own bit gain those acts made. Part 3: on the end lines, how many
 * sit on a rung of the peer (the other side) against on the seat's own. Part 4: a greedy climber's energy to each
 * level from law draws, with and without the mirror move. --without-mirror replays part 2 on the same tables with the
 * seat's starter barred from mirrors (the counterfactual: its points gained against the others'). Results:
 * docs/engine-v2/scripts/mirror-tug.md.
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, rng, variantMutators } from "@workspace/v2-core";
import { KAPPA, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { beginnerPool, lineLaw } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { deal, poolOf, ruleName, spaceOf, type Rule, type Space } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  tables: { type: "string", default: "8" }, seconds: { type: "string", default: "600" }, draws: { type: "string", default: "3000" },
  families: { type: "string", default: "prime-landing,prime-gradient" },
  "without-mirror": { type: "boolean", default: false }, "play-only": { type: "boolean", default: false },
}, args: process.argv.slice(2).filter(a => a !== "--") });
const v = "line-q" as const, space = spaceOf(v) as Space<any>, T = space.type, variant = space.variant;
const pool = poolOf(v).rules, fams = o.families!.split(",");
const AXES = ["x", "y", "origin", "diagonal"];
const mirror = (s: unknown, axis: string) => { const a = applyCall(T, variant, s as never, { mutator: "cart.mirror", site: 0, args: { axis } }); return isInvalid(a) ? null : { s: a.result, fee: a.price.total }; };
const peerOf = (r: Rule) => ({ ...r, params: { ...r.params, side: r.params.side === -1 ? 1 : -1 } });
const name = (r: Rule) => `${r.family} ends ${r.params.ends} side ${r.params.side === -1 ? "−1" : "+1"}`;
const pct = (a: number, n: number) => `${n ? ((100 * a) / n).toFixed(1) : "0"}%`;
const instances = pool.filter(r => fams.includes(r.family));
/** The ladder's level (main term) of a rule at a state: on a rung when at least 1. */
const level = (r: Rule, s: unknown) => {
  const fam = beginnerPool.find(f => f.id === r.family)!;
  const v = evaluateSite(T, fam as never, r.params, s as never, variant, 0, r.tieBreaker).terms[0]?.value as { n: bigint; d: bigint } | undefined;
  return v && typeof v === "object" && "n" in v ? Number(v.n) / Number(v.d) : -Infinity;
};

if (!o["play-only"]) {
console.log("## Part 1: one mirror on law draws (births)\n");
console.log("| instance | draws | a mirror raises bits | by ≥ 2 bits | by ≥ 4 bits | mean gain where it raises | mirror fee (median) |");
console.log("|---|--:|--:|--:|--:|--:|--:|");
for (const rule of instances) {
  const b = space.bits(rule), law = lineLaw(variant), r = rng("mirror-peers", ruleName(rule), JSON.stringify(rule.params));
  let n = 0, up = 0, up2 = 0, up4 = 0, sum = 0; const fees: number[] = [];
  while (n < Number(o.draws)) {
    const d = law.draw(r, 1); if (!d.state) continue; n++;
    const b0 = b(d.state); let best = 0;
    for (const ax of AXES) { const m = mirror(d.state, ax); if (!m) continue; fees.push(m.fee); best = Math.max(best, b(m.s) - b0); }
    if (best > 1e-9) { up++; sum += best; } if (best >= 2) up2++; if (best >= 4) up4++;
  }
  fees.sort((a, c) => a - c);
  console.log(`| ${name(rule)} | ${n} | ${pct(up, n)} | ${pct(up2, n)} | ${pct(up4, n)} | ${up ? (sum / up).toFixed(2) : "–"} | ${fees[fees.length >> 1]!.toFixed(1)} |`);
}

console.log("\n## Part 4: what the mirror does to the ladder's cost\n");
// A greedy climber (the energy gate's: the move with the most bits per energy, never repeating a state) from law draws,
// with the beginner's whole menu and with the same menu less cart.mirror; the energy at which it first reaches each level.
{
  const FACTORS = ["2", "3", "5", "7", "1/2", "1/3", "1/5"], AMOUNTS = ["1", "-1", "2", "-2", "10", "-10", "100", "-100", "1/2", "-1/2"];
  const offered = new Set(variantMutators(T, variant).map(m => m.id));
  const ALL: { mutator: string; args: Record<string, string> }[] = [
    ...FACTORS.map(f => ({ mutator: "mach.stretch", args: { f } })),
    ...AMOUNTS.flatMap(k => [{ mutator: "si.shift", args: { k } }, { mutator: "si.tilt", args: { k } }]),
    ...AXES.map(axis => ({ mutator: "cart.mirror", args: { axis } })),
    ...[["1", "0"], ["-1", "0"], ["0", "1"], ["0", "-1"]].map(([u, w]) => ({ mutator: "cart.slide", args: { u: u!, v: w! } })),
    ...["-2", "-1", "1", "2"].flatMap(x0 => ["1", "-1"].map(k => ({ mutator: "cart.pivot", args: { x0, k } }))),
  ].filter(c => offered.has(c.mutator));
  const LEVELS = [1, 2, 3, 4], START = 40, INCOME = 2500;
  console.log(`| instance | menu | starts | reach level ${LEVELS.join(" / ")} (share of starts) | median energy to reach level ${LEVELS.join(" / ")} | mirror moves in the climbs |`);
  console.log("|---|---|--:|--:|--:|--:|");
  for (const rule of instances) for (const withMirror of [true, false]) {
    const calls = ALL.filter(c => withMirror || c.mutator !== "cart.mirror"), b = space.bits(rule);
    const r = rng("mirror-peers-ladder", ruleName(rule), JSON.stringify(rule.params)), law = lineLaw(variant);
    const at: number[][] = LEVELS.map(() => []); let starts = 0, mirrors = 0;
    while (starts < START) {
      const d = law.draw(r, 1); if (!d.state) continue; starts++;
      let s = d.state as unknown, spent = 0; const seen = new Set([T.encode(s as never)]);
      for (let i = 0; i < 60; i++) {
        const lv = level(rule, s);
        LEVELS.forEach((L, j) => { if (lv >= L && at[j]!.length < starts) at[j]!.push(spent); });
        let pick: { s: unknown; fee: number; g: number; m: string } | null = null; const b0 = b(s);
        for (const c of calls) {
          const a = applyCall(T, variant, s as never, { mutator: c.mutator, site: 0, args: c.args });
          if (isInvalid(a) || spent + a.price.total > INCOME || seen.has(T.encode(a.result))) continue;
          const g = (b(a.result) - b0) / Math.max(a.price.total, 1e-9);
          if (g > 0 && (!pick || g > pick.g)) pick = { s: a.result, fee: a.price.total, g, m: c.mutator };
        }
        if (!pick) break;
        s = pick.s; spent += pick.fee; seen.add(T.encode(s as never)); if (pick.m === "cart.mirror") mirrors++;
      }
      const lv = level(rule, s);
      LEVELS.forEach((L, j) => { if (lv >= L && at[j]!.length < starts) at[j]!.push(spent); });
      LEVELS.forEach((_, j) => { if (at[j]!.length < starts) at[j]!.push(Infinity); });
    }
    const med = (xs: number[]) => { const t = xs.slice().sort((a, c) => a - c); const m = t[t.length >> 1]!; return Number.isFinite(m) ? m.toFixed(0) : "∞"; };
    console.log(`| ${name(rule)} | ${withMirror ? "all" : "no mirror"} | ${starts} | ${at.map(x => pct(x.filter(Number.isFinite).length, x.length)).join(" / ")} | ${at.map(med).join(" / ")} | ${mirrors} |`);
  }
}

}

console.log(`\n## Part 2 and 3: in play${o["without-mirror"] ? " (the seat's starter never mirrors: the counterfactual)" : ""}\n`);
const boxes = sandboxes(), economy = LINES_BEGINNER_ECONOMY;
const plain = (rule: Rule) => { const a = startersFor(rule.family, "typescript").find(x => x.kind === "simple")!; return { language: a.language, source: a.source }; };
/** The seat's own starter, or with --without-mirror the same starter with mirrors taken out of its shortcuts. */
const own = (rule: Rule) => {
  const p = plain(rule);
  if (!o["without-mirror"]) return p;
  const from = "shortcuts(m, c, rule.mutators)";
  if (!p.source.includes(from)) throw new Error(`${rule.family}: the starter's shortcuts call moved`);
  return { ...p, source: p.source.replace(from, `${from}.filter(([plan]) => plan.mutator !== "cart.mirror")`) };
};
console.log("| instance | games | the seat's points gained (end standing − start), mean | the others', mean | seat's acts | acts using a mirror | of which raised its bits | mean gain of those (bits) | share of the seat's own bit gain made by mirrors | repeats (a raising mirror again on the same object) and their gain | most raising mirrors on one object | answering another seat's mirror (tug of war), with whom | end lines on its own rung | end lines on the peer's rung (one mirror away) |");
console.log("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
for (const rule of instances) {
  const others = deal(pool.filter(r => r.family !== rule.family), Number(o.tables), `mirror-${ruleName(rule)}-${JSON.stringify(rule.params)}`);
  const b = space.bits(rule);
  let acts = 0, mir = 0, mirUp = 0, mirGain = 0, ownGain = 0, ends = 0, onOwn = 0, onPeer = 0, repeats = 0, repeatGain = 0, maxOnOne = 0, pingPong = 0, standing = 0, othersStanding = 0;
  const pongWith = new Map<string, number>();
  for (const [ti, t] of others.entries()) {
    // Mirrors by this seat that raised its bits, per object: a second one on the same object is a repeat (a reflection
    // earned again after other seats' moves threw the reading across its sign: income without climbing).
    const perObject = new Map<number, number>();
    // The last committed act on each object: who made it and whether it was a mirror (a mirror answering another
    // seat's mirror is a tug of war, which the end-state score nets to nothing, not income).
    const last = new Map<number, { seat: number; mirror: boolean }>();
    const seats = [rule, t[0]!, t[1]!];
    const report = await runTable(boxes, {
      type: T, variant, lines: 3, birthsPerSecond: 1 / 240, seed: `mirror-${ti}`, seconds: Number(o.seconds), unique: true,
      seats: seats.map((s, k) => ({ name: `P${k}`, kind: "starter", rule: s, program: k === 0 ? own(s) : plain(s) })),
      actEconomy: { kappa: KAPPA, beta: 0.05 }, economy, summonCap: economy.startingEnergy,
      onAct: e => {
        if (!e.committed) return;
        const isMirror = e.calls.some(c => c.mutator === "cart.mirror"), prev = last.get(e.object);
        last.set(e.object, { seat: e.seat, mirror: isMirror });
        if (e.seat !== 0) return;
        acts++;
        const g = b(e.state) - b(e.before);
        if (g > 0) ownGain += g;
        if (e.calls.some(c => c.mutator === "cart.mirror")) {
          mir++;
          if (g > 1e-9) {
            mirUp++; mirGain += g;
            const k = (perObject.get(e.object) ?? 0) + 1;
            perObject.set(e.object, k); maxOnOne = Math.max(maxOnOne, k);
            if (k > 1) { repeats++; repeatGain += g; }
            if (prev && prev.seat !== 0 && prev.mirror) { pingPong++; const w = ruleName(seats[prev.seat]!); pongWith.set(w, (pongWith.get(w) ?? 0) + 1); }
          }
        }
      },
    });
    standing += report.seats[0]!.gained; othersStanding += (report.seats[1]!.gained + report.seats[2]!.gained) / 2;
    for (const s of report.final as unknown[]) {
      ends++;
      if (level(rule, s) >= 1) onOwn++;
      if (level(peerOf(rule), s) >= 1) onPeer++;
    }
  }
  console.log(`| ${name(rule)} | ${others.length} | ${(standing / others.length).toFixed(0)} | ${(othersStanding / others.length).toFixed(0)} | ${acts} | ${mir} | ${mirUp} | ${mirUp ? (mirGain / mirUp).toFixed(2) : "–"} | ${ownGain ? pct(mirGain, ownGain) : "–"} | ${repeats} (${repeatGain.toFixed(1)} bits) | ${maxOnOne} | ${pingPong}${pongWith.size ? ` (${[...pongWith].sort((a, c) => c[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(", ")})` : ""} | ${pct(onOwn, ends)} | ${pct(onPeer, ends)} |`);
}
