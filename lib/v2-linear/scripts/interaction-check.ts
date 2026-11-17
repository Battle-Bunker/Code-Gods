// Probe: how the dealt line rules interact under the live estimator (beginner physics). Not a test.
// For every pair (and a sample of triples), a few parameter draws, from newborn lines (the game's newborn law):
//   a joint climb: each turn takes the option with the best gain in joint points per bit of the turn's cost, where joint
//   points J = Σ over pairs of seats E_i·E_j (a seat's points are its energy × the others' sum) and the options are each
//   rule's candidates (at its utility + 1, 4, 12) and the single mutations in the mc lens and the rules' lenses (the 12
//   best by utility, energy-estimated). Up to TURNS turns, stopping when nothing gains.
// It reports, per pair: the best joint line found (its energies, the cost and turns from the newborn), how many distinct
// lines were good for both (min energy ≥ GOOD bits), the cheapest one-turn route to a good-for-both line, and the pull:
// from the best line, how much each rule's own best one-turn candidate costs the other rule's energy.
// Usage: node --experimental-strip-types scripts/interaction-check.ts [pairs|triples|approach] [DRAWS] [NEWBORNS] [FROM]
import { physicsOf, rng as makeRng, type Rng } from "@workspace/v2-core";
import { lineQ as V } from "../test/config.ts";
import { dynamicFamilies, estimateLine, isVertical, lensById, lensMoves, lineRule, routePrice, type Line, type LineRule } from "../src/index.ts";
import { newbornLine } from "../src/lens-moves.ts";

const lambda = physicsOf(V).gravity;
const mode = process.argv[2] ?? "pairs", DRAWS = Number(process.argv[3] ?? 2), NEWBORNS = Number(process.argv[4] ?? 3);
const TURNS = 8, GOOD = 12, MAX_TURN = 120;
const keyOf = (l: Line) => `${l.a},${l.b},${l.c}`;
type Seat = { id: string; title: string; p: unknown; rule: LineRule; memo: Map<string, number> };
function seat(F: (typeof dynamicFamilies)[number], r: Rng): Seat {
  const all = F.dealable(V as never) as unknown[], p = all[r.below(all.length)];
  return { id: F.id, title: F.title, p, rule: lineRule(F.dynamic as never, p as never), memo: new Map() };
}
const E = (s: Seat, l: Line): number => {
  const k = keyOf(l); let v = s.memo.get(k);
  if (v === undefined) { v = estimateLine(l, s.rule, V, { seed: `ix:${k}` }).energy; s.memo.set(k, v); }
  return v;
};
const U = (s: Seat, l: Line) => { const v = s.rule.u(l); return Number.isNaN(v) ? -Infinity : v; };
const J = (seats: Seat[], l: Line) => { const e = seats.map(s => E(s, l)); let j = 0; for (let i = 0; i < e.length; i++) for (let k = i + 1; k < e.length; k++) j += e[i]! * e[k]!; return j; };
const cost = (x: Line, t: Line) => routePrice(lambda, x, t).total;

/** One-turn options from x: each seat's candidates, and the single mutations best by utility. */
function options(seats: Seat[], x: Line): Line[] {
  const out = new Map<string, Line>();
  const put = (t: Line) => { if (!isVertical(t) && keyOf(t) !== keyOf(x)) out.set(keyOf(t), t); };
  for (const s of seats) { const u0 = U(s, x); for (const d of [1, 4, 12]) for (const t of s.rule.candidates(x, Number.isFinite(u0) ? u0 + d : d).slice(0, 6)) put(t); }
  const moves: Line[] = [];
  for (const id of new Set(["mc", ...seats.map(s => s.rule.lens === "mA" ? "mc" : s.rule.lens)])) {
    const lens = lensById(id as never), xs = lens.numbers(x); if (!xs) continue;
    for (const mv of lensMoves(lens, x, xs)) moves.push(mv.to);
  }
  // The single mutations whose summed utility gain over the seats is largest (utility is cheap; energy is not).
  const gain = (t: Line) => seats.reduce((a, s) => a + Math.max(-50, Math.min(50, U(s, t) - U(s, x))), 0);
  moves.sort((a, b) => gain(b) - gain(a)).slice(0, 12).forEach(put);
  return [...out.values()].filter(t => cost(x, t) <= MAX_TURN);
}

/** The joint climb from x0: the best line found, its turns and the cost paid to reach it. */
function climb(seats: Seat[], x0: Line) {
  let x = x0, jx = J(seats, x), paid = 0;
  let best = { line: x, j: jx, paid: 0, turns: 0 };
  const firstTurns: { line: Line; c: number }[] = [];
  for (let t = 0; t < TURNS; t++) {
    let pick: { line: Line; j: number; c: number; rate: number } | null = null;
    for (const y of options(seats, x)) {
      const c = cost(x, y), jy = J(seats, y);
      if (t === 0) firstTurns.push({ line: y, c });
      const rate = (jy - jx) / Math.max(c, 1);
      if (jy > jx && (!pick || rate > pick.rate)) pick = { line: y, j: jy, c, rate };
    }
    if (!pick) break;
    x = pick.line; jx = pick.j; paid += pick.c;
    if (jx > best.j) best = { line: x, j: jx, paid, turns: t + 1 };
  }
  return { best, firstTurns };
}

const r = makeRng("interaction", mode);
const fams = [...dynamicFamilies];
const show = (n: number) => n.toFixed(1);

if (mode === "pairs" || mode === "triples") {
  const groups: (typeof fams)[] = [];
  if (mode === "pairs") for (let i = 0; i < fams.length; i++) for (let k = i + 1; k < fams.length; k++) groups.push([fams[i]!, fams[k]!]);
  else for (let n = 0; n < 24; n++) { const pick = new Set<number>(); while (pick.size < 3) pick.add(r.below(fams.length)); groups.push([...pick].sort((a, b) => a - b).map(i => fams[i]!)); }
  console.log(`| rules | good-for-all lines (distinct / runs) | best joint line: energies | its cost, turns | cheapest good-for-all turn from a newborn: energies / cost | pull: own move's loss to the other(s), bits |`);
  console.log("|---|---|---|---|---|---|");
  // Resume: skip the first FROM groups (their parameter draws then differ from an unbroken run).
  const FROM = Number(process.argv[5] ?? 0);
  for (const G of groups.slice(FROM)) {
    const good = new Set<string>(); let runs = 0, bestAll: { e: number[]; paid: number; turns: number; j: number } | null = null;
    let cheapest: { e: number[]; c: number; ratio: number } | null = null;
    const pulls: number[][] = G.map(() => []);
    for (let d = 0; d < DRAWS; d++) {
      const seats = G.map(F => seat(F, r));
      for (let n = 0; n < NEWBORNS; n++) {
        runs++;
        const x0 = newbornLine(r, V), { best, firstTurns } = climb(seats, x0);
        const e = seats.map(s => E(s, best.line));
        if (Math.min(...e) >= GOOD) good.add(keyOf(best.line));
        if (!bestAll || best.j > bestAll.j) bestAll = { e, paid: best.paid, turns: best.turns, j: best.j };
        for (const { line, c } of firstTurns) {
          const ey = seats.map(s => E(s, line));
          if (Math.min(...ey) < GOOD) continue;
          const ratio = ey.reduce((a, b) => a + b, 0) / Math.max(c, 1);
          if (!cheapest || ratio > cheapest.ratio) cheapest = { e: ey, c, ratio };
        }
        // The pull: from the best line, each seat's own best one-turn candidate, and what it costs the others.
        seats.forEach((s, i) => {
          const u0 = U(s, best.line), cands = s.rule.candidates(best.line, Number.isFinite(u0) ? u0 + 1 : 1).filter(t => !isVertical(t)).slice(0, 8);
          if (!cands.length) return;
          const mine = cands.reduce((a, b) => (E(s, b) > E(s, a) ? b : a));
          const loss = seats.filter((_, k) => k !== i).reduce((a, o) => a + (E(o, best.line) - E(o, mine)), 0);
          pulls[i]!.push(loss);
        });
      }
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const flag = cheapest && cheapest.ratio >= 1.5 ? " **cheap**" : "";
    console.log(`| ${G.map(F => F.title).join(" + ")} | ${good.size} / ${runs} | ${bestAll!.e.map(show).join(", ")} | ${show(bestAll!.paid)}, ${bestAll!.turns} | ${cheapest ? `${cheapest.e.map(show).join(", ")} / ${show(cheapest.c)} (${cheapest.ratio.toFixed(2)})${flag}` : "none"} | ${pulls.map(p => show(mean(p))).join(", ")} |`);
    console.error(JSON.stringify({ rules: G.map(F => F.id), good: good.size, runs, bestAll, cheapest, pulls: pulls.map(mean) }));
  }
}

if (mode === "approach") {
  // Does any single approach raise most rules at once? From newborns, every one-turn option of every rule's candidates
  // and the mc lens's single mutations: how many of the twelve rules' energies rise by at least 2 bits.
  const seats = fams.map(F => seat(F, r)), counts: number[] = [];
  let top: { n: number; line: string; from: string; c: number; raised: string[]; sum: number } = { n: -1, line: "", from: "", c: 0, raised: [], sum: 0 };
  let pump = { ratio: -Infinity, sum: 0, c: 0, line: "", from: "", n: 0 };
  for (let n = 0; n < Number(process.argv[3] ?? 12); n++) {
    const x = newbornLine(r, V), base = seats.map(s => E(s, x));
    for (const y of options(seats, x)) {
      const raised = seats.filter((s, i) => E(s, y) - base[i]! >= 2).map(s => s.title);
      const sum = seats.reduce((a, s, i) => a + (E(s, y) - base[i]!), 0), c = cost(x, y);
      counts.push(raised.length);
      if (sum / c > pump.ratio) pump = { ratio: sum / c, sum, c, line: keyOf(y), from: keyOf(x), n: raised.length };
      if (raised.length > top.n || (raised.length === top.n && sum > top.sum)) top = { n: raised.length, line: keyOf(y), from: keyOf(x), c, raised, sum };
    }
  }
  const hist = Array.from({ length: 13 }, (_, k) => counts.filter(c => c === k).length);
  console.log(`options: ${counts.length}; rules raised ≥ 2 bits by one option (count: options): ${hist.map((h, k) => `${k}: ${h}`).filter(s => !s.endsWith(": 0")).join(", ")}`);
  console.log(`most: ${top.n} rules (${top.raised.join(", ")}), line ${top.line} from ${top.from} (a, b, c), turn cost ${show(top.c)} bits, the twelve energies' summed change ${show(top.sum)}`);
  console.log(`best summed change per bit: ${pump.ratio.toFixed(2)} (${show(pump.sum)} over ${show(pump.c)} bits, ${pump.n} rules ≥ 2 bits), line ${pump.line} from ${pump.from}`);
}
