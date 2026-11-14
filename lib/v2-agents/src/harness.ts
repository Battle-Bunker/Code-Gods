/**
 * The harness: players' agents act on shared lines for a fixed energy budget, so rule families can be compared for
 * difficulty (how far an agent climbs, what it spends and through which views, and the value it gains). One player
 * is a solo run; several players with different rules show how their agents help or spoil each other.
 *
 * The world is simplified: no births, no power or accrual. Each player starts with `budget` energy and the players
 * take turns; on its turn a player's agent is offered a line drawn uniformly (seeded), acts, and is charged. A player
 * stops when its energy is spent. Value is the calibration's bits (lib/v2-valuation artefacts) of each line's score
 * on each player's rule; a rule without an artefact reports levels only.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evaluateSite, hashHex, layerLadders, levelOf, objectLadder, rng, scoreFromWire, scoreToWire, type ObjectType, type Score, type Variant } from "@workspace/v2-core";
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
  /** A rule with no calibrated artefact is valued at one bit a rung of its own ladder (valuedArtefact). */
  readonly standIn?: boolean;
}

/** How one rule fares on the shared lines (every player's rule is measured on every line). */
export interface RuleOutcome {
  readonly player: string;
  readonly rule: string;
  /** Mean level of each dealt layer (main part, tie-breaker) at the start and the end, and the layers' tops. */
  readonly levels: { readonly start: readonly number[]; readonly end: readonly number[]; readonly top: readonly number[] };
  /** Lines with the main part at its top, at the start and the end. */
  readonly mainTop: { readonly start: number; readonly end: number };
  /** The sum over lines of the rule's bits, end minus start (null without an artefact). */
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
  readonly artefacts: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------- artefacts

interface ArtefactFile { family: string; params: unknown; tieBreaker: string; variant: string; status: string; rungs: { score: (string | null)[] | null; bits: number | null; layer: number; main?: number; label: string }[] }
const ARTEFACTS = join(import.meta.dirname, "..", "..", "v2-valuation", "artefacts");
const canonical = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

/** The committed artefact for a dealt rule, or null. */
export function findArtefact(variant: string, rule: HarnessPlayer["rule"]): ArtefactFile | null {
  const dir = join(ARTEFACTS, variant, rule.family);
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    const a = JSON.parse(readFileSync(join(dir, f), "utf8")) as ArtefactFile;
    if (a.tieBreaker === rule.tieBreaker && canonical(a.params) === canonical(rule.params)) return a;
  }
  return null;
}

/** A score's bits on the artefact's rungs (the highest rung met; no curve between rungs). */
function bitsOf(a: ArtefactFile, score: Score): number {
  const ladder = a.rungs.map(r => ({ score: scoreFromWire(r.score), label: r.label, layer: r.layer, ...(r.main !== undefined ? { main: r.main } : {}) }));
  if (!ladder.length) return 0;
  return a.rungs[levelOf(score, ladder)]!.bits ?? 0;
}

/**
 * The committed artefact for a rule when it has values; else, with `standIn`, the rule's own ladder at one bit a rung
 * (status "stand-in"), so points can be compared before a family is calibrated; else null.
 */
export function valuedArtefact<S>(type: ObjectType<S>, variant: Variant, rule: HarnessPlayer["rule"], standIn = false): ArtefactFile | null {
  const found = findArtefact(variant.id, rule);
  if (found && found.rungs.every(x => x.bits !== null)) return found;
  if (!standIn) return null;
  const family = type.families.find(f => f.id === rule.family)!;
  const rungs = objectLadder(type, family, rule.params, variant, rule.tieBreaker).map((g, i) => ({
    score: scoreToWire(g.score), bits: i, layer: g.layer, label: g.label, ...(g.main !== undefined ? { main: g.main } : {}),
  }));
  return { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker, variant: variant.id, status: "stand-in", rungs };
}

/**
 * A player's value of a line: `bits(s)` is n_i, their rarity on their committed artefact (0 without values); `level(s)`
 * the rung their rule's score reaches; `rungs` the ladder with each rung's rarity, as `runAct`'s `rungs` takes it.
 */
export function valuer<S>(type: ObjectType<S>, variant: Variant, rule: HarnessPlayer["rule"], standIn = false) {
  const family = type.families.find(f => f.id === rule.family)!;
  const a = valuedArtefact(type, variant, rule, standIn);
  const scoreOf = (s: S) => evaluateSite(type, family, rule.params, s, variant, 0, rule.tieBreaker).score;
  const ladder = a ? a.rungs.map(r => ({ score: scoreFromWire(r.score), label: r.label, layer: r.layer, ...(r.main !== undefined ? { main: r.main } : {}) })) : [];
  return {
    scoreOf,
    bits: (s: S) => (ladder.length ? a!.rungs[levelOf(scoreOf(s), ladder)]!.bits ?? 0 : 0),
    level: (s: S) => (ladder.length ? levelOf(scoreOf(s), ladder) : 0),
    labels: a ? a.rungs.map(g => g.label) : [],
    rungs: a ? a.rungs.map(g => ({ score: g.score, bits: g.bits ?? 0, layer: g.layer, ...(g.main !== undefined ? { main: g.main } : {}) })) : [],
  };
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

  const valuers = players.map(p => valuer(type, variant, p.rule, input.standIn));
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
      value: { mine: n[i]!, others: total - n[i]!, points: n[i]! * (total - n[i]!) }, history, rungs: valuers[i]!.rungs,
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
      if (record.changeBits > 0) for (const c of record.calls) add(s.changes, c.rep, change * c.price.total / record.changeBits);
    }
  }

  const artefacts: Record<string, string> = {};
  const rules = players.map(p => {
    const family = type.families.find(f => f.id === p.rule.family)!;
    const ladders = layerLadders(family, p.rule.params, variant, p.rule.tieBreaker);
    const scoreOf = (s: S) => evaluateSite(type, family, p.rule.params, s, variant, 0, p.rule.tieBreaker).score;
    const levels = (s: S) => { const sc = scoreOf(s); return ladders.map((l, j) => levelOf(sc === null ? null : [sc[j] ?? null], l)); };
    const mean = (ls: S[]) => ladders.map((_, j) => ls.reduce((t, s) => t + levels(s)[j]!, 0) / ls.length);
    const tops = ladders.map(l => l.length - 1);
    const atTop = (ls: S[]) => ls.filter(s => levels(s)[0] === tops[0]).length;
    const found = findArtefact(variant.id, p.rule);
    const a = valuedArtefact(type, variant, p.rule, input.standIn);   // an unconverged run may have no values
    const name = `${p.rule.family}/${p.rule.tieBreaker}`;
    if (a) artefacts[name] = a.status;
    else if (found) artefacts[name] = `${found.status}, no values`;
    const bits = (ls: S[]) => ls.reduce((t, s) => t + bitsOf(a!, scoreOf(s)), 0);
    return {
      player: p.name, rule: name,
      levels: { start: mean(start), end: mean(lines), top: tops },
      mainTop: { start: atTop(start), end: atTop(lines) },
      bitsGained: a ? bits(lines) - bits(start) : null,
    };
  });
  const sum = (rows: number[][], j: number) => rows.reduce((t, x) => t + x[j]!, 0);
  const pointsReport = players.map((p, j) => ({
    player: p.name, start: sum(startPoints, j), end: sum(points, j), gained: sum(points, j) - sum(startPoints, j),
    reversalEnergy: reversal[j]!.energy, reversals: reversal[j]!.count,
    othersKept: reversal[j]!.kept.length ? reversal[j]!.kept.reduce((a, b) => a + b, 0) / reversal[j]!.kept.length : null, notes: reversal[j]!.noteCount, sampleNotes: reversal[j]!.notes,
  }));
  return { rules, spend: spend.map(({ firstFailure, ...s }) => (firstFailure ? { ...s, firstFailure } : s)), points: pointsReport, artefacts };
}

// ---------------------------------------------------------------- printing

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
/** "si 12.3, cart 4.0", biggest first. */
export const byView = (m: Readonly<Record<string, number>>): string =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, e]) => `${v} ${f1(e)}`).join(", ") || "–";

/** A report as Markdown: the rules' progress, then each player's spending by view. */
export function formatReport(r: HarnessReport): string {
  const out = [
    "| Player | Rule | Main part level (start → end / top) | Tie-breaker level | Lines at the main top | Bits gained |",
    "|---|---|---|---|---|--:|",
    ...r.rules.map(x => `| ${x.player} | ${x.rule} | ${f1(x.levels.start[0]!)} → ${f1(x.levels.end[0]!)} / ${x.levels.top[0]} | ${x.levels.start[1] === undefined ? "–" : `${f1(x.levels.start[1])} → ${f1(x.levels.end[1]!)} / ${x.levels.top[1]}`} | ${x.mainTop.start} → ${x.mainTop.end} | ${x.bitsGained === null ? `– (${r.artefacts[x.rule] ?? "no artefact"})` : f1(x.bitsGained)} |`),
    "",
    "| Player | Points gained (start → end) | ⚡ lost to reversals (times) | Others' rarity kept by its moves | Notes |",
    "|---|--:|--:|--:|--:|",
    ...r.points.map(x => `| ${x.player} | ${f1(x.gained)} (${f1(x.start)} → ${f1(x.end)}) | ${f1(x.reversalEnergy)} (${x.reversals}) | ${x.othersKept === null ? "–" : `${Math.round(100 * x.othersKept)}%`} | ${x.notes} |`),
    "",
    "| Player | Acts (made / skipped / failed) | ⚡ spent | ⚡ on reads, by view | ⚡ on changes, by view |",
    "|---|---|--:|---|---|",
    ...r.spend.map(s => `| ${s.player} | ${s.acts.committed} / ${s.acts.skipped} / ${s.acts.failed} | ${f1(s.spent)} | ${byView(s.reads)} | ${byView(s.changes)}${s.firstFailure ? ` (first failure: ${s.firstFailure})` : ""} |`),
  ];
  return out.join("\n");
}
