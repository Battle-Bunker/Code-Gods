/**
 * Why objects freeze in play (the coordinator's question, 15 Nov, after the collapse check's test 4): on each object at
 * the end of a played game, for each seat, is there truly no move that raises its rule (the landscape is flat there),
 * are there such moves only dearer than a full charge (priced out), or are there affordable ones the starter did not
 * take? Per family, over every (object, seat) at the end.
 *
 *   node --experimental-strip-types scripts/freeze-breakdown.ts [--tables 8] [--games 1] [--seconds 600] [--objects 3]
 *     [--births 0.0041667] [--beta 0.05] [--wide 12]
 *
 * The moves searched: every call of the variant priced at most --wide bits (v2-core enumerate), and the line shortcut
 * climber's moves (stretch, zoom, turn and the far shifts and tilts, scripts/climbers.ts lineShortcutMoves). Plays the
 * collapse check's dealt tables with the shipped simple starters, as test 4 does.
 */
import { parseArgs } from "node:util";
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { EngineHost, sandboxes, startersFor } from "../src/index.ts";
import { callsUpTo, lineShortcutMoves, playTable } from "./climbers.ts";
import { deal, poolOf, ruleName, spaceOf, type Rule, type Space } from "./landscape-lib.ts";

const { values: o } = parseArgs({
  options: {
    tables: { type: "string", default: "8" }, games: { type: "string", default: "1" }, seconds: { type: "string", default: "600" },
    objects: { type: "string", default: "3" }, births: { type: "string", default: "0.004166666666666667" }, beta: { type: "string", default: "0.05" },
    wide: { type: "string", default: "12" },
  },
  args: process.argv.slice(2).filter(a => a !== "--"),
});
const v = "line-q" as const;
const space = spaceOf(v) as Space<any>;
const pool = poolOf(v).rules;
const tables = deal(pool, Number(o.tables), v);
const economy = LINES_BEGINNER_ECONOMY, fullCharge = economy.powerPerSecond * economy.fullChargeSeconds;
const wide = callsUpTo(space.type, space.variant, Number(o.wide));
const boxes = sandboxes();
type Tally = { n: number; flat: number; pricedOut: number; tension: number; available: number; bestGain: number[]; moving: number[] };
const per = new Map<string, Tally>();
const tally = (f: string) => { let t = per.get(f); if (!t) per.set(f, t = { n: 0, flat: 0, pricedOut: 0, tension: 0, available: 0, bestGain: [], moving: [] }); return t; };
const examples: { family: string; table: string; seat: string; params: string; line: string; call: string; price: number; own: number[]; others: number[]; points: number[] }[] = [];
let objectsSeen = 0, objectsMovingLastMinute = 0, perMinute: number[] = [];

for (const [ti, table] of tables.entries()) for (let g = 0; g < Number(o.games); g++) {
  const plain = (rule: Rule) => { const a = startersFor(rule.family, "typescript").find(x => x.kind === "simple")!; return { language: a.language, source: a.source }; };
  const p = await playTable(boxes, {
    type: space.type, variant: space.variant, seats: table.map(rule => ({ rule, program: plain(rule) })), bits: r => space.bits(r),
    beta: Number(o.beta), objects: Number(o.objects), birthsPerSecond: Number(o.births), seconds: Number(o.seconds), seed: `freeze-${ti}-${g}`,
    economy, summonCap: economy.startingEnergy,
  });
  objectsSeen += p.objects.end; objectsMovingLastMinute += p.movingLastMinute * p.objects.end;
  for (const s of p.final) {
    const host = new EngineHost({ type: space.type, variant: space.variant, state: s, rule: table[0]!, energy: 0 });
    const calls = [...wide, ...lineShortcutMoves(space.variant, table[0]!, s)];
    const priced = calls.map(c => ({ c, x: host.price([c]) })).filter(p => p.x.valid);
    // A seat's points: its bits times the others' bits on the object (the game's product rule).
    const bitsOf = table.map(r => space.bits(r)), at = (x: unknown) => bitsOf.map(b => b(x));
    const before = at(s), points = (v: number[], i: number) => v[i]! * (v.reduce((a, b) => a + b, 0) - v[i]!);
    const after = priced.map(({ c, x }) => ({ total: x.total, v: at(x.result), call: c }));
    for (const [i, rule] of table.entries()) {
      const t = tally(rule.family), p0 = points(before, i);
      t.n++;
      let best = 0, bestCheap = 0, pointsUp = false, bestUp: (typeof after)[number] | null = null;
      for (const x of after) {
        const gain = x.v[i]! - before[i]!;
        if (gain > best) best = gain;
        if (x.total <= fullCharge && gain > bestCheap) bestCheap = gain;
        if (x.total <= fullCharge && gain > 1e-9 && points(x.v, i) > p0 + 1e-9) {
          pointsUp = true;
          if (!bestUp || points(x.v, i) > points(bestUp.v, i)) bestUp = x;
        }
      }
      // The examples the agents session replays with the shipped starter: the move that raises the seat's points most.
      if (pointsUp && bestUp && examples.filter(e => e.family === rule.family).length < 2) {
        const others = (v: number[]) => v.reduce((a, b) => a + b, 0) - v[i]!;
        examples.push({ family: rule.family, table: table.map(ruleName).join(", "), seat: ruleName(rule), params: JSON.stringify(rule.params),
          line: space.type.encode(s), call: JSON.stringify(bestUp.call), price: bestUp.total,
          own: [before[i]!, bestUp.v[i]!], others: [others(before), others(bestUp.v)], points: [p0, points(bestUp.v, i)] });
      }
      if (best <= 1e-9) t.flat++;
      else if (bestCheap <= 1e-9) t.pricedOut++;
      else if (!pointsUp) t.tension++;
      else t.available++;
      t.bestGain.push(bestCheap);
    }
  }
  console.error(`table ${ti} (${table.map(ruleName).join(", ")}) game ${g}: objects ${p.objects.start} → ${p.objects.end}, idle ${(100 * p.idle).toFixed(0)}%, ${(100 * p.movingLastMinute).toFixed(0)}% changed in the last minute`);
}
const pct = (a: number, n: number) => `${n ? Math.round((100 * a) / n) : 0}%`;
const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };
console.log(`Objects at the end: ${objectsSeen}; changed in the last minute: ${pct(objectsMovingLastMinute, objectsSeen)}. Moves searched: every call ≤ ${o.wide} bits (${wide.length}) and the shortcut climber's; a full charge is ${fullCharge}⚡.`);
console.log("| family | (object, seat) pairs | flat: no move raises its bits | priced out: only dearer than a full charge | tension: affordable raises all cut its points (the others' bits fall more) | available: an affordable move raises its points | median best affordable gain (bits) |");
console.log("|---|--:|--:|--:|--:|--:|--:|");
for (const [f, t] of [...per].sort((a, b) => b[1].available / b[1].n - a[1].available / a[1].n)) {
  console.log(`| ${f} | ${t.n} | ${pct(t.flat, t.n)} | ${pct(t.pricedOut, t.n)} | ${pct(t.tension, t.n)} | ${pct(t.available, t.n)} | ${med(t.bestGain).toFixed(2)} |`);
}

console.log("\nExamples (an end object and the affordable move that raises the seat's points most; a, b, c of ax + by + c = 0):");
for (const e of examples) console.log(`- ${e.seat} ${e.params} on [${e.table}], line ${e.line}: ${e.call} for ${e.price.toFixed(1)}⚡; own ${e.own.map(x => x.toFixed(2)).join(" → ")}, others ${e.others.map(x => x.toFixed(2)).join(" → ")}, points ${e.points.map(x => x.toFixed(1)).join(" → ")}`);
