/**
 * The harness: players' agents act on shared lines for a fixed energy budget, so rule families can be compared for
 * difficulty (how far an agent climbs, what it spends and through which views, and the value it gains). One player
 * is a solo run; several players with different rules show how their agents help or spoil each other.
 *
 * The world is simplified: no births, no power or accrual. Each player starts with `budget` energy and the players
 * take turns; on its turn a player's agent is offered a line drawn uniformly (seeded), acts, and is charged. A player
 * stops when its energy is spent. Value is each line's energy on each player's rule (the dynamic measure, owner decision
 * 50); a rule without it reports utilities only.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { energyOf, evaluateSite, hashHex, rng, ruleLayers, type ObjectType, type Score, type Variant, familyById } from "@workspace/v2-core";
import type { Sandbox } from "@workspace/v2-sandbox";
import { runAct, type Program } from "./act.ts";
import { births } from "./births.ts";
import { SPEC_ECONOMY, type RuleRef } from "./host.ts";
import type { Sandboxes } from "./sandboxes.ts";

export interface HarnessPlayer {
  readonly name: string;
  readonly rule: Required<Pick<RuleRef, "family" | "params">> & { readonly tieBreaker: string };
  readonly program: Program;
}

export interface HarnessInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly players: readonly HarnessPlayer[];
  /** Energy each player may spend. */
  readonly budget: number;
  readonly lines: number;
  readonly seed: string;
  /** A cap on acts per player, in case an agent spends nothing. */
  readonly maxActs?: number;
}

/** How one rule fares on the shared lines (every player's rule is measured on every line). */
export interface RuleOutcome {
  readonly player: string;
  readonly rule: string;
  /**
   * Mean utility of each dealt layer (main part, tie-breaker; a distance negated) over the lines where it is defined, at
   * the start and the end (null where no line has one).
   */
  readonly utilities: { readonly start: readonly (number | null)[]; readonly end: readonly (number | null)[] };
  /** Mean energy per object at the start and the end (0 for a rule without the dynamic measure). */
  readonly bits: { readonly start: number; readonly end: number } | null;
  /** The sum over objects of the rule's energy, end minus start. */
  readonly bitsGained: number | null;
}

export interface PlayerSpend {
  readonly player: string;
  readonly acts: { readonly committed: number; readonly skipped: number; readonly failed: number };
  readonly spent: number;
  /** Energy on reads, by view (bits / κ; the offer's under "offer"). */
  readonly reads: Readonly<Record<string, number>>;
  /** Energy on changes, by the view each was made through (each call's share of W + βW²). */
  readonly changes: Readonly<Record<string, number>>;
  readonly firstFailure?: string;
}

/** What a player's agents did to the player's points (spec §8: π_i = n_i · Σ_{j≠i} n_j per line, summed). */
export interface PlayerPoints {
  readonly player: string;
  /** Σ over lines of π_i at the start and at the end, and the difference (what the server's running total counts). */
  readonly start: number;
  readonly end: number;
  readonly gained: number;
  /** Energy spent on moves that raised the player's points on a line, which another player's move then took back. */
  readonly reversalEnergy: number;
  /** How often another player's move took back one of this player's gains. */
  readonly reversals: number;
  /**
   * The share of the others' summed rarity this player's moves kept, on lines where the others had some (mean of
   * Σn_j after / Σn_j before over those moves; 1 = no harm, above 1 = helped them); null when it made no such move.
   */
  readonly othersKept: number | null;
  /** Notes the player's agents left (first few kept). */
  readonly notes: number;
  readonly sampleNotes: readonly string[];
}

export interface HarnessReport {
  readonly rules: readonly RuleOutcome[];
  readonly spend: readonly PlayerSpend[];
  readonly points: readonly PlayerPoints[];
}

// ---------------------------------------------------------------- energy

/**
 * A player's value of an object: `bits(s)` is n_i, the rule's energy at the state (a dynamic rule, docs/engine-v2/
 * energy.md; seeded by the state, so one state reads one number in a run), 0 for a rule without the measure.
 */
export function valuer<S>(type: ObjectType<S>, variant: Variant, rule: HarnessPlayer["rule"]) {
  const family = familyById(type, rule.family)!;
  const scoreOf = (s: S): Score => evaluateSite(type, family, rule.params, s, variant, 0, rule.tieBreaker).score;
  const bits = (s: S) => (family.dynamic ? energyOf(type, family as never, rule.params, s, variant, { seed: `harness:${type.encode(s)}` }).energy : 0);
  return { scoreOf, layers: ruleLayers(family, rule.tieBreaker).length, bits };
}

// ---------------------------------------------------------------- the run

export async function runHarness<S>(boxes: Sandboxes, input: HarnessInput<S>): Promise<HarnessReport> {
  const { type, variant, players, budget } = input;
  const maxActs = input.maxActs ?? 400;
  let lines = births(type, variant, input.seed, input.lines);
  const start = lines.slice();
  const r = rng("harness", input.seed);
  const energy = players.map(() => budget);
  const spend = players.map(p => ({ player: p.name, acts: { committed: 0, skipped: 0, failed: 0 }, spent: 0, reads: {} as Record<string, number>, changes: {} as Record<string, number>, firstFailure: undefined as string | undefined }));
  const sandboxOf = new Map<string, Sandbox>();
  for (const p of players) sandboxOf.set(p.program.language, await boxes.get(p.program.language));

  const valuers = players.map(p => valuer(type, variant, p.rule));
  /** Every player's points on a state: π_i = n_i · Σ_{j≠i} n_j. */
  const pointsOf = (s: S) => { const n = valuers.map(v => v.bits(s)); const total = n.reduce((a, b) => a + b, 0); return n.map(x => x * (total - x)); };
  const bitsAll = (s: S) => valuers.map(v => v.bits(s));
  let points = lines.map(pointsOf);
  const startPoints = points.map(x => x.slice());
  // Each line's moves (who moved; every player's points before and after), and each player's latest gain per line.
  const log = lines.map(() => [] as { by: number; before: number[]; after: number[] }[]);
  const gains = lines.map(() => new Map<number, { charge: number; pointsAfter: number }>());
  const reversal = players.map(() => ({ energy: 0, count: 0, notes: [] as string[], noteCount: 0, kept: [] as number[] }));

  for (let turn = 0; ; turn++) {
    const live = players.map((_, i) => i).filter(i => energy[i]! > 0 && spend[i]!.acts.committed + spend[i]!.acts.skipped + spend[i]!.acts.failed < maxActs);
    if (!live.length) break;
    const i = live[turn % live.length]!, p = players[i]!, s = spend[i]!;
    const object = r.below(lines.length);
    const n = bitsAll(lines[object]!), total = n.reduce((a, b) => a + b, 0);
    const history = log[object]!.filter(m => m.by === i || m.before[i] !== m.after[i]).slice(-8)
      .map(m => ({ mine: m.by === i, pointsBefore: m.before[i]!, pointsAfter: m.after[i]! }));
    const { record, state } = await runAct(sandboxOf.get(p.program.language)!, {
      type, variant, state: lines[object]!, rule: p.rule, program: p.program, seed: BigInt(`0x${hashHex(`${input.seed}:${turn}`).slice(0, 15)}`),
      energy: energy[i]!, object, liveObjects: lines.length,
      value: { mine: n[i]!, others: total - n[i]!, points: n[i]! * (total - n[i]!) }, history,
      others: players.flatMap((p, j) => (j === i ? [] : [{ rule: p.rule }])),
    });
    reversal[i]!.noteCount += record.notes.length;
    for (const t of record.notes) if (reversal[i]!.notes.length < 3 && !reversal[i]!.notes.includes(t)) reversal[i]!.notes.push(t);
    energy[i]! -= record.charge;
    s.spent += record.charge;
    s.acts[record.outcome]++;
    if (record.outcome === "failed" && !s.firstFailure) s.firstFailure = record.reason;
    const add = (into: Record<string, number>, view: string, e: number) => { if (e > 0) into[view] = (into[view] ?? 0) + e; };
    for (const [view, bits] of Object.entries(record.readsByRep)) add(s.reads, view, bits / SPEC_ECONOMY.kappa);
    if (record.outcome === "committed") {
      lines = lines.map((l, j) => (j === object ? state : l));
      const before = points[object]!, after = pointsOf(state);
      const othersBefore = n.reduce((t, x, j) => (j === i ? t : t + x), 0);
      if (othersBefore > 0) {
        const nAfter = bitsAll(state);
        reversal[i]!.kept.push(nAfter.reduce((t, x, j) => (j === i ? t : t + x), 0) / othersBefore);
      }
      points[object] = after;
      log[object]!.push({ by: i, before, after });
      // A gain someone else's move took back: the energy the gain cost was burnt in a tug-of-war.
      for (let q = 0; q < players.length; q++) {
        const g = gains[object]!.get(q);
        if (q !== i && g && after[q]! < g.pointsAfter) { reversal[q]!.energy += g.charge; reversal[q]!.count++; gains[object]!.delete(q); }
      }
      // The mover's own move starts a new gain, or ends the old one (a drop it made itself is not a tug-of-war).
      if (after[i]! > before[i]!) gains[object]!.set(i, { charge: record.charge, pointsAfter: after[i]! }); else gains[object]!.delete(i);
      const change = record.charge - record.readBits / SPEC_ECONOMY.kappa;
      if (record.changeBits > 0) { const named = record.calls.reduce((t, c) => t + c.price.total, 0); for (const c of record.calls) add(s.changes, c.rep, named > 0 ? change * c.price.total / named : change / record.calls.length); }   // the turn's surprise shared like its naming bits
    }
  }

  const rules = players.map((p, i) => {
    const v = valuers[i]!;
    const num = (x: { n: bigint; d: bigint } | null | undefined) => (x ? Number(x.n) / Number(x.d) : null);
    const utilities = (ls: S[]) => Array.from({ length: v.layers }, (_, j) => {
      const xs = ls.map(s => num(v.scoreOf(s)?.[j])).filter((x): x is number => x !== null);
      return xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
    });
    const total = (ls: S[]) => ls.reduce((t, s) => t + v.bits(s), 0);
    const n = Math.max(1, lines.length);
    return {
      player: p.name, rule: `${p.rule.family}/${p.rule.tieBreaker}`,
      utilities: { start: utilities(start), end: utilities(lines) },
      bits: { start: total(start) / n, end: total(lines) / n },
      bitsGained: total(lines) - total(start),
    };
  });
  const sum = (rows: number[][], j: number) => rows.reduce((t, x) => t + x[j]!, 0);
  const pointsReport = players.map((p, j) => ({
    player: p.name, start: sum(startPoints, j), end: sum(points, j), gained: sum(points, j) - sum(startPoints, j),
    reversalEnergy: reversal[j]!.energy, reversals: reversal[j]!.count,
    othersKept: reversal[j]!.kept.length ? reversal[j]!.kept.reduce((a, b) => a + b, 0) / reversal[j]!.kept.length : null, notes: reversal[j]!.noteCount, sampleNotes: reversal[j]!.notes,
  }));
  return { rules, spend: spend.map(({ firstFailure, ...s }) => (firstFailure ? { ...s, firstFailure } : s)), points: pointsReport };
}

// ---------------------------------------------------------------- printing

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
/** "si 12.3, cart 4.0", biggest first. */
export const byView = (m: Readonly<Record<string, number>>): string =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, e]) => `${v} ${f1(e)}`).join(", ") || "–";

const fu = (x: number | null | undefined) => (x === null || x === undefined ? "–" : f1(x));
/** One layer's mean utility, start → end. */
export const utilityCell = (x: RuleOutcome, j: number): string =>
  x.utilities.start[j] === undefined ? "–" : `${fu(x.utilities.start[j])} → ${fu(x.utilities.end[j])}`;

/** A report as Markdown: the rules' progress, then each player's spending by view. */
export function formatReport(r: HarnessReport): string {
  const out = [
    "| Player | Rule | Main part (mean utility, start → end) | Tie-breaker | Energy an object (start → end) | Energy gained |",
    "|---|---|---|---|---|--:|",
    ...r.rules.map(x => `| ${x.player} | ${x.rule} | ${utilityCell(x, 0)} | ${utilityCell(x, 1)} | ${x.bits ? `${f1(x.bits.start)} → ${f1(x.bits.end)}` : "–"} | ${x.bitsGained === null ? "–" : f1(x.bitsGained)} |`),
    "",
    "| Player | Points gained (start → end) | energy lost to reversals (times) | Others' rarity kept by its moves | Notes |",
    "|---|--:|--:|--:|--:|",
    ...r.points.map(x => `| ${x.player} | ${f1(x.gained)} (${f1(x.start)} → ${f1(x.end)}) | ${f1(x.reversalEnergy)} (${x.reversals}) | ${x.othersKept === null ? "–" : `${Math.round(100 * x.othersKept)}%`} | ${x.notes} |`),
    "",
    "| Player | Acts (made / skipped / failed) | energy spent | energy on reads, by view | energy on changes, by view |",
    "|---|---|--:|---|---|",
    ...r.spend.map(s => `| ${s.player} | ${s.acts.committed} / ${s.acts.skipped} / ${s.acts.failed} | ${f1(s.spent)} | ${byView(s.reads)} | ${byView(s.changes)}${s.firstFailure ? ` (first failure: ${s.firstFailure})` : ""} |`),
  ];
  return out.join("\n");
}
