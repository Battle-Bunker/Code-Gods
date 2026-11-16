/**
 * Do seats climb a tie-breaker again after a rung? (The coordinator, 15 Nov: the owner's design is that stepping up the
 * main part restarts the tie-breaker's climb; pool-dynamics' "recovered" counts only a tie-breaker brought back to its
 * old value, which a new rung may never allow.) Plays dealt tables with the shipped simple starters and, at every
 * restart (a seat's own move that raised its main part and lowered its tie-breaker), asks:
 *
 * - exists: is there a move within a full charge that keeps the main part at least where it is and raises the
 *   tie-breaker (searched over every call priced at most --wide bits and the line shortcut climber's moves)?
 * - pays: does the best such move raise the seat's points (its bits times the others' bits on the object)? Its bits,
 *   price and kind are kept for examples;
 * - taken: did the seat later raise its tie-breaker on that object while the main part held (any rise, not only back to
 *   the old value), before the main part moved again or the game ended?
 *
 *   node --experimental-strip-types scripts/retie.ts [--tables 10] [--seconds 600] [--wide 12] [--per 40]
 */
import { parseArgs } from "node:util";
import { applyCall, compareScores, evaluateSite, isInvalid, type Score } from "@workspace/v2-core";
import { KAPPA, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { callsUpTo, lineShortcutMoves } from "./climbers.ts";
import { deal, poolOf, spaceOf, type Rule, type Space } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  tables: { type: "string", default: "10" }, seconds: { type: "string", default: "600" }, wide: { type: "string", default: "12" }, per: { type: "string", default: "40" },
}, args: process.argv.slice(2).filter(a => a !== "--") });
const v = "line-q" as const, space = spaceOf(v) as Space<any>, T = space.type, variant = space.variant;
const pool = poolOf(v).rules, economy = LINES_BEGINNER_ECONOMY, fullCharge = economy.powerPerSecond * economy.fullChargeSeconds;
const wide = callsUpTo(T, variant, Number(o.wide));
const boxes = sandboxes();
const famOf = (id: string) => T.families.find((f: { id: string }) => f.id === id)!;
const scoreOf = (r: Rule, s: unknown): Score => evaluateSite(T, famOf(r.family), r.params, s as never, variant, 0, r.tieBreaker).score;
const head = (s: Score) => (s ? s.slice(0, 1) : null) as Score, tail = (s: Score) => (s ? s.slice(1) : null) as Score;
const plain = (rule: Rule) => { const a = startersFor(rule.family, "typescript").find(x => x.kind === "simple")!; return { language: a.language, source: a.source }; };

type Stat = { restarts: number; searched: number; exists: number; pays: number; taken: number; gain: number[]; price: number[]; kinds: Map<string, number>; examples: string[] };
const per = new Map<string, Stat>();
const stat = (r: Rule) => { const k = `${r.family}/${r.tieBreaker}`; let s = per.get(k); if (!s) per.set(k, s = { restarts: 0, searched: 0, exists: 0, pays: 0, taken: 0, gain: [], price: [], kinds: new Map(), examples: [] }); return s; };

const tables = deal(pool, Number(o.tables), v);
for (const [ti, table] of tables.entries()) {
  const bits = table.map(r => space.bits(r));
  // Open restarts: seat:object → the main part held and the tie-breaker it fell to.
  const open = new Map<string, { main: Score; tb: Score; st: Stat }>();
  await runTable(boxes, {
    type: T, variant, lines: 3, birthsPerSecond: 1 / 240, seed: `retie-${ti}`, seconds: Number(o.seconds), unique: true,
    seats: table.map((r, k) => ({ name: `P${k}`, kind: "starter", rule: r, program: plain(r) })),
    actEconomy: { kappa: KAPPA, beta: 0.05 }, economy, summonCap: economy.startingEnergy,
    onAct: e => {
      if (!e.committed) return;
      const r = table[e.seat]!, key = `${e.seat}:${e.object}`;
      const b = scoreOf(r, e.before), a = scoreOf(r, e.state);
      // Close or follow an open restart of this seat on this object.
      const op = open.get(key);
      if (op) {
        if (compareScores(head(a), op.main) !== 0) open.delete(key);   // the main part moved: this restart is over
        else if (compareScores(head(a), op.main) === 0 && compareScores(tail(a), op.tb) > 0) { op.st.taken++; open.delete(key); }
      }
      // Other seats' moves that move this seat's main part end its open restart there.
      for (const [k2, o2] of open) if (k2.endsWith(`:${e.object}`) && k2 !== key) { const j = Number(k2.split(":")[0]); if (compareScores(head(scoreOf(table[j]!, e.state)), o2.main) !== 0) open.delete(k2); }
      if (!(compareScores(head(a), head(b)) > 0 && compareScores(tail(a), tail(b)) < 0)) return;
      const st = stat(r);
      st.restarts++;
      open.set(key, { main: head(a), tb: tail(a), st });
      if (st.searched >= Number(o.per)) return;
      st.searched++;
      // The best move that holds the main part and raises the tie-breaker, within a full charge.
      const s = e.state, others = (x: unknown) => bits.reduce((t, f, j) => t + (j === e.seat ? 0 : f(x)), 0);
      const p0 = bits[e.seat]!(s) * others(s);
      let best: { gain: number; price: number; kind: string; points: number } | null = null;
      for (const c of [...wide, ...lineShortcutMoves(variant, r, s)]) {
        const x = applyCall(T, variant, s, c);
        if (isInvalid(x) || x.price.total > fullCharge) continue;
        const u = scoreOf(r, x.result);
        if (compareScores(head(u), head(a)) < 0 || compareScores(tail(u), tail(a)) <= 0) continue;
        const gain = bits[e.seat]!(x.result) - bits[e.seat]!(s), points = bits[e.seat]!(x.result) * others(x.result) - p0;
        if (!best || points > best.points) best = { gain, price: x.price.total, kind: c.mutator, points };
      }
      if (!best) return;
      st.exists++;
      if (best.points > 0) st.pays++;
      st.gain.push(best.gain); st.price.push(best.price); st.kinds.set(best.kind, (st.kinds.get(best.kind) ?? 0) + 1);
      if (st.examples.length < 2) st.examples.push(`${T.encode(s)}: ${best.kind} for ${best.price.toFixed(1)}⚡, own +${best.gain.toFixed(2)} bits, points ${best.points >= 0 ? "+" : ""}${best.points.toFixed(1)}`);
    },
  });
  console.error(`table ${ti + 1}/${tables.length}: ${table.map(r => `${r.family}/${r.tieBreaker}`).join(", ")}`);
}
await boxes.close();
const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : NaN; };
const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : "-");
console.log(`Restarts: a seat's own move that raised its main part and lowered its tie-breaker. Searched: up to ${o.per} per rule, every call ≤ ${o.wide} bits and the shortcut climber's moves, within a full charge (${fullCharge}⚡).`);
console.log("| rule | restarts | searched | a re-climbing move exists | it raises the seat's points | the seat later raised its tie-breaker, main held | best move: own bits gained (median) | its price (median) | its kinds |");
console.log("|---|--:|--:|--:|--:|--:|--:|--:|---|");
for (const [k, s] of [...per].sort((a, b) => b[1].restarts - a[1].restarts)) {
  console.log(`| ${k} | ${s.restarts} | ${s.searched} | ${pct(s.exists, s.searched)} | ${pct(s.pays, s.searched)} | ${pct(s.taken, s.restarts)} | ${med(s.gain).toFixed(2)} | ${med(s.price).toFixed(1)} | ${[...s.kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${m} ${n}`).join(", ")} |`);
}
console.log("\nExamples (the line after the restart, a, b, c of ax + by + c = 0; the best re-climbing move):");
for (const [k, s] of per) for (const x of s.examples) console.log(`- ${k}, ${x}`);
