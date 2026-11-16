/**
 * Players that play to win, and what they do to the game (docs/engine-v2/competitive-play.md). Each game is a beginner
 * preset as the server deals it to three people (convex/v2/deal.ts freshDeal on the preset's dealable pool; the preset's
 * board, economy, births and drift, as artifacts/engine/test/v2-pace.test.ts plays them), with seats given kinds:
 *
 *   naive     the shipped Simple starter (acts only when a move raises its own points now)
 *   mixed     builds, and knocks when damage to a rival per energy beats building (scripts/competitive-agents.ts)
 *   vandal    only knocks: the cheapest large damage on objects the others hold many bits on
 *   defender  the starter, preferring states a single step cannot knock far down
 *   rank      mixed, whose player reads the public standings every 10 s and turns RIVAL up when behind, down when ahead
 *             (an edit, paid at the edit price)
 *   lookahead the agents session's two-move climber (lines only)
 *
 * Rows are compositions (e.g. `naive,naive,naive`, `vandal,naive,naive`); the special seat rotates over the three dealt
 * rules game by game, and every row plays the same seeds, so rows differ only in who plays how.
 *
 *   node --experimental-strip-types scripts/competitive.ts --preset lines-beginner --games 12
 *     [--rows naive,naive,naive;mixed,naive,naive;...] [--seconds 600] [--cap 5 --cap-every 30] [--pool rules.json] [--json out.json]
 */
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { evaluateSite, rng, type ObjectType, type Variant } from "@workspace/v2-core";
import { gridType, grid4 } from "@workspace/v2-grid";
import { lineQ, lineType } from "@workspace/v2-linear";
import { valuer } from "../src/harness.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable, type PlayerApi } from "../src/table.ts";
import { dealablePool, freshDeal } from "../../../artifacts/engine/convex/v2/deal.ts";
import { presetOf } from "../../../artifacts/engine/convex/v2/presets.ts";
import { competitive, KNOBS, knobLines, type CompetitiveKind } from "./competitive-agents.ts";

type Kind = "naive" | CompetitiveKind;
const { values: o } = parseArgs({ options: {
  preset: { type: "string", default: "lines-beginner" }, games: { type: "string", default: "12" }, from: { type: "string", default: "0" },
  rows: { type: "string" }, seconds: { type: "string" }, json: { type: "string" },
  cap: { type: "string" }, "cap-every": { type: "string" }, pool: { type: "string" },
} });

const preset = presetOf(o.preset!);
if (preset.id !== o.preset) throw new Error(`no preset ${o.preset}`);
const grid = preset.variant === grid4.id;
const type = (grid ? gridType : lineType) as ObjectType<unknown>;
const variant: Variant = grid ? grid4 : lineQ;
if (preset.variant !== variant.id) throw new Error(`${o.preset} is on ${preset.variant}`);
const seconds = Number(o.seconds ?? preset.worldSeconds);
const economy = { ...preset.economy, startingEnergy: preset.startingEnergy };
const pool = dealablePool(preset);
const rows: Kind[][] = (o.rows ?? "naive,naive,naive;mixed,naive,naive;vandal,naive,naive;defender,naive,naive;rank,naive,naive;mixed,mixed,mixed;vandal,vandal,vandal;rank,rank,rank")
  .split(";").map(r => r.split(",") as Kind[]);
const boxes = sandboxes();
const SCORE_INTERVAL = 10;
/** A seat "holds" an object once its bits there reach this: the episodes timed for "time above half its peak". */
const HIGH_BITS = 6;

const mean = (x: readonly number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const median = (x: readonly number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
const f = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "-");
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");

interface KindStat { seats: number; wins: number; rankSum: number; gained: number[]; spentShare: number[]; dealt: number[]; dealtEnergy: number[] }
interface RowStat {
  row: string; games: number; byKind: Map<Kind, KindStat>; byFamily: Map<string, number[]>;
  holds: number[]; censored: number; heldBits: number; keptBits: number; perMinute: number[]; upByThird: number[];
  lateMoves: number; lateTwoState: number; twoStateObjects: number;
  knocks: { damage: number; energy: number; repairEnergy: number[]; repaired: number; n: number };
  tops: Map<string, { seats: number; reached: number; heldSeconds: number[] }>;
  edits: number; editEnergy: number;
}

/** Each game's seats: the deal's three rules, in the deal's order. */
// --pool rules.json: [{ family, params, tieBreaker }], seated three distinct families a game (rules no preset deals yet).
const custom = o.pool ? JSON.parse(readFileSync(o.pool, "utf8")) as { family: string; params: Record<string, unknown>; tieBreaker: string }[] : null;
const deals = Array.from({ length: Number(o.games) }, (_, k) => {
  const g = Number(o.from) + k;
  if (custom) {
    const r = rng("competitive-pool", String(g)), picks: typeof custom = [];
    while (picks.length < 3) { const x = custom[r.below(custom.length)]!; if (!picks.some(p => p.family === x.family)) picks.push(x); }
    return picks;
  }
  return freshDeal(pool, 3, `competitive:${preset.id}:${g}`, preset.variant).map(d => ({ family: d.family, params: d.params as Record<string, unknown>, tieBreaker: d.tieBreaker }));
});

function programFor(family: string, kind: Kind) {
  const a = startersFor(family, "typescript").find(x => x.kind === "simple")!;
  return { language: "typescript" as const, source: kind === "naive" ? a.source : competitive(a.source, kind, 2) };
}

/** The rank player's policy: the margin over its best rival decides how much a rival's loss is worth to it. */
function rankTurn(seat: number, api: PlayerApi, edits: { n: number; energy: number }) {
  const mine = api.standings[seat]!, best = Math.max(...api.standings.filter((_, j) => j !== seat));
  const rival = mine > best * 1.1 ? 0.25 : mine < best ? 2 : 1;
  for (const a of api.agents) {
    const line = a.source.split("\n")[0]!;
    if (!line.startsWith("const OWN")) continue;
    const want = knobLines({ ...KNOBS.rank, rival }, 2);
    if (line.startsWith(want)) continue;
    const price = api.replace(a.id, a.source.replace(/^const OWN[^\n]*;/, want));
    if (price !== null) { edits.n++; edits.energy += price; }
  }
}

async function runRow(kinds: Kind[]): Promise<RowStat> {
  const st: RowStat = {
    row: kinds.join(","), games: 0, byKind: new Map(), byFamily: new Map(), holds: [], censored: 0, heldBits: 0, keptBits: 0, perMinute: [], upByThird: [0, 0, 0],
    lateMoves: 0, lateTwoState: 0, twoStateObjects: 0, knocks: { damage: 0, energy: 0, repairEnergy: [], repaired: 0, n: 0 }, tops: new Map(), edits: 0, editEnergy: 0,
  };
  for (const [g, deal] of deals.entries()) {
    // The special seats rotate over the dealt rules, so a kind is not tied to a family.
    const rot = g % 3, seatKinds = deal.map((_, i) => kinds[(i - rot + 3) % 3]!);
    if (seatKinds.includes("lookahead") && grid) throw new Error("lookahead is for lines");
    const seats = deal.map((r, i) => ({ name: `P${i}`, kind: "starter" as const, rule: r, program: programFor(r.family, seatKinds[i]!) }));
    const vals = seats.map(s => valuer(type, variant, s.rule));
    const fams = seats.map(s => type.families.find(x => x.id === s.rule.family)!);
    const mainOf = (i: number, s: unknown) => { const sc = evaluateSite(type, fams[i]!, seats[i]!.rule.params, s, variant, 0, seats[i]!.rule.tieBreaker).score; if (sc === null || sc[0] === null) return -Infinity; const q = sc[0] as unknown as { n: bigint; d: bigint }; return Number(q.n) / Number(q.d); };
    // Per object: the moves (at, seat, bits of every seat after, state), for holds, cycles, knocks and repairs.
    const track = new Map<number, { at: number; by: number; bits: number[]; state: string; s: unknown; charge: number }[]>();
    const spent = seats.map(() => 0), edits = { n: 0, energy: 0 };
    const rep = await runTable(boxes, {
      type, variant, seats, lines: preset.startingObjects, seed: `competitive:${preset.id}:${Number(o.from) + g}`, seconds, unique: true, economy,
      birthsPerSecond: preset.economy.birthsPerSecond, summonCap: preset.startingEnergy, ...(preset.regularBirths ? { regularBirths: true } : {}),
      ...(preset.driftSeconds ? { driftSeconds: preset.driftSeconds } : {}),
      ...(o.cap ? { objectCap: Number(o.cap) } : {}), ...(o["cap-every"] ? { birthsPerSecond: 1 / Number(o["cap-every"]), regularBirths: true } : {}),
      ...(seatKinds.includes("rank") ? { playerTurns: { every: SCORE_INTERVAL, seats: seatKinds.flatMap((k, i) => (k === "rank" ? [i] : [])), turn: (i: number, api: PlayerApi) => rankTurn(i, api, edits) } } : {}),
      onAct: e => {
        spent[e.seat]! += e.charge;
        if (!e.committed) return;
        const list = track.get(e.object) ?? (track.set(e.object, [{ at: e.born, by: -1, bits: vals.map(v => v.bits(e.before)), state: type.encode(e.before), s: e.before, charge: 0 }]), track.get(e.object)!);
        list.push({ at: e.at, by: e.seat, bits: vals.map(v => v.bits(e.state)), state: type.encode(e.state), s: e.state, charge: e.charge });
      },
    });
    st.games++; st.edits += edits.n; st.editEnergy += edits.energy;
    // Who wins.
    const order = rep.seats.map((s, i) => [s.end, i] as const).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const budget = preset.startingEnergy + economy.powerPerSecond * seconds;
    rep.seats.forEach((s, i) => {
      const k = seatKinds[i]!, ks = st.byKind.get(k) ?? (st.byKind.set(k, { seats: 0, wins: 0, rankSum: 0, gained: [], spentShare: [], dealt: [], dealtEnergy: [] }), st.byKind.get(k)!);
      ks.seats++; ks.rankSum += order.indexOf(i) + 1; if (order[0] === i) ks.wins++;
      ks.gained.push(s.end);
      ks.spentShare.push((spent[i]! + s.spent.summons + s.spent.edits) / budget);
      const fam = st.byFamily.get(s.rule.split("/")[0]!) ?? (st.byFamily.set(s.rule.split("/")[0]!, []), st.byFamily.get(s.rule.split("/")[0]!)!);
      fam.push(s.end);
    });
    // Dynamics, per object.
    const end = seconds;
    for (const [, list] of track) {
      for (let k = 1; k < list.length; k++) {
        const m = list[k]!, prev = list[k - 1]!;
        // Survival: of the bits other seats held just before this move, the share they still hold after it.
        prev.bits.forEach((b, j) => { if (j !== m.by && b > 0) { st.heldBits += b; st.keptBits += Math.min(b, m.bits[j]!); } });
        // Levels by third: a move raising its own seat by at least a bit.
        if (m.bits[m.by]! >= prev.bits[m.by]! + 1) st.upByThird[Math.min(2, Math.floor((3 * m.at) / end))]!++;
        // Knocks: a move that lowered the others' points there; its damage (others' points lost), its energy, and the
        // energy the victims spent on this object until they were back (each victim's bits at least as before).
        const pts = (b: number[]) => { const t = b.reduce((x, y) => x + y, 0); return b.map(x => x * (t - x)); };
        const before = pts(prev.bits), after = pts(m.bits);
        const lost = before.reduce((t, p, j) => (j === m.by ? t : t + Math.max(0, p - after[j]!)), 0);
        if (lost >= 1 && after[m.by]! <= before[m.by]! + 1e-9) {   // damage with no gain of its own: a knock
          st.knocks.n++; st.knocks.damage += lost; st.knocks.energy += m.charge;
          const victims = prev.bits.map((b, j) => j).filter(j => j !== m.by && m.bits[j]! < prev.bits[j]! - 0.5);
          let repair = 0, back = false;
          for (let q = k + 1; q < list.length && !back; q++) {
            if (victims.includes(list[q]!.by)) repair += list[q]!.charge;
            if (victims.every(j => list[q]!.bits[j]! >= prev.bits[j]! - 1e-9)) back = true;
          }
          if (back) { st.knocks.repaired++; st.knocks.repairEnergy.push(repair); }
        }
      }
      // Holds: per seat, each time its bits reach a new high ≥ HIGH_BITS, how long until they fall below half of it.
      for (let i = 0; i < seats.length; i++) {
        let peak = 0, since = -1;
        for (let k = 0; k < list.length; k++) {
          const b = list[k]!.bits[i]!;
          if (since >= 0 && b < peak / 2) { st.holds.push(list[k]!.at - since); since = -1; peak = b; }
          if (b >= HIGH_BITS && b > peak) { if (since < 0) since = list[k]!.at; peak = b; }
          if (since < 0 && b > peak) peak = b;
        }
        if (since >= 0) { st.holds.push(end - since); st.censored++; }
      }
      // Two-state cycles in the last third.
      const late = list.filter(m => m.by >= 0 && m.at >= (2 * end) / 3);
      st.lateMoves += late.length;
      if (late.length >= 6 && new Set(late.map(m => m.state)).size <= 2) { st.twoStateObjects++; st.lateTwoState += late.length; }
    }
    // Objects changed per minute.
    for (let mnt = 0; mnt < Math.ceil(end / 60); mnt++) {
      let n = 0;
      for (const [, list] of track) if (list.some(m => m.by >= 0 && m.at >= 60 * mnt && m.at < 60 * (mnt + 1))) n++;
      st.perMinute.push(n);
    }
    // Grid tops: Leapfrog's main part at 0 (every leap exactly one apart), Two Pair's at its best seen; reached, and seconds held.
    for (let i = 0; i < seats.length; i++) {
      const fam = seats[i]!.rule.family;
      if (fam !== "leapfrog" && fam !== "two-pair") continue;
      const t = st.tops.get(fam) ?? (st.tops.set(fam, { seats: 0, reached: 0, heldSeconds: [] }), st.tops.get(fam)!);
      t.seats++;
      const top = fam === "leapfrog" ? 0 : TWO_PAIR_TOP;
      let reached = false, held = 0;
      for (const [, list] of track) for (let k = 0; k < list.length; k++) {
        if (mainOf(i, list[k]!.s) >= top) { reached = true; held += (list[k + 1]?.at ?? end) - list[k]!.at; }
      }
      if (reached) t.reached++;
      t.heldSeconds.push(held);
    }
    process.stderr.write(`${st.row} game ${g}: ${rep.seats.map((s, i) => `${seatKinds[i]} ${s.rule.split("/")[0]} ${f(s.end)}`).join(" | ")}\n`);
  }
  return st;
}
/** Two Pair's main part at its top (docs/engine-v2/grid-v1-v2-compare.md "Known reachable tops": "exactly"). */
const TWO_PAIR_TOP = 0;

const results: RowStat[] = [];
for (const kinds of rows) results.push(await runRow(kinds));
boxes.close();

console.log(`\n${preset.id}: ${deals.length} games of ${seconds} s per row, the same deals and seeds in every row${o.cap ? `; turnover board: cap ${o.cap}, a birth every ${o["cap-every"] ?? "?"} s` : ""}\n`);
console.log("| Row | Kind | Seats | Win share | Mean rank | Mean points | Energy used |");
console.log("|---|---|---|---|---|---|---|");
for (const r of results) for (const [k, s] of r.byKind) console.log(`| ${r.row} | ${k} | ${s.seats} | ${pct(s.wins, s.seats)} | ${f(s.rankSum / s.seats, 2)} | ${f(mean(s.gained))} | ${pct(mean(s.spentShare), 1)} |`);
console.log("\n| Row | Hold ≥ half peak, median s (censored) | Others' bits kept per move | Objects changed / min | Levels up by third | Last-third moves on 2-state cycles | Knocks: n, damage / energy | Repaired, median repair energy | Rank edits |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const k = r.knocks;
  console.log(`| ${r.row} | ${f(median(r.holds))} (${pct(r.censored, r.holds.length)}) | ${pct(r.keptBits, r.heldBits)} | ${f(mean(r.perMinute), 2)} | ${r.upByThird.join(" / ")} | ${pct(r.lateTwoState, r.lateMoves)} (${r.twoStateObjects} obj) | ${k.n}, ${f(k.energy ? k.damage / k.energy : NaN, 2)} | ${pct(k.repaired, k.n)}, ${f(median(k.repairEnergy), 1)} (knock ${f(k.n ? k.energy / k.n : NaN, 1)}) | ${r.edits} (${f(r.editEnergy)} energy) |`);
}
if (grid) {
  console.log("\n| Row | Family | Seats | Top reached | Seconds at the top (median) |");
  console.log("|---|---|---|---|---|");
  for (const r of results) for (const [fam, t] of r.tops) console.log(`| ${r.row} | ${fam} | ${t.seats} | ${pct(t.reached, t.seats)} | ${f(median(t.heldSeconds))} |`);
}
console.log("\n| Row | " + [...new Set(results.flatMap(r => [...r.byFamily.keys()]))].sort().join(" | ") + " |");
const famKeys = [...new Set(results.flatMap(r => [...r.byFamily.keys()]))].sort();
console.log("|---|" + famKeys.map(() => "---").join("|") + "|");
for (const r of results) console.log(`| ${r.row} | ${famKeys.map(k => f(mean(r.byFamily.get(k) ?? []))).join(" | ")} |`);
if (o.json) writeFileSync(o.json, JSON.stringify(results.map(r => ({ ...r, byKind: Object.fromEntries(r.byKind), byFamily: Object.fromEntries(r.byFamily), tops: Object.fromEntries(r.tops) })), null, 1));
