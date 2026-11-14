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
import { evaluateSite, hashHex, layerLadders, levelOf, rng, scoreFromWire, type ObjectType, type Score, type Variant } from "@workspace/v2-core";
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

export interface HarnessReport {
  readonly rules: readonly RuleOutcome[];
  readonly spend: readonly PlayerSpend[];
  readonly artefacts: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------- artefacts

interface ArtefactFile { family: string; params: unknown; tieBreaker: string; variant: string; status: string; rungs: { score: (string | null)[] | null; bits: number | null; layer: number; label: string }[] }
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
  const ladder = a.rungs.map(r => ({ score: scoreFromWire(r.score), label: r.label, layer: r.layer }));
  if (!ladder.length) return 0;
  return a.rungs[levelOf(score, ladder)]!.bits ?? 0;
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

  for (let turn = 0; ; turn++) {
    const live = players.map((_, i) => i).filter(i => energy[i]! > 0 && spend[i]!.acts.committed + spend[i]!.acts.skipped + spend[i]!.acts.failed < maxActs);
    if (!live.length) break;
    const i = live[turn % live.length]!, p = players[i]!, s = spend[i]!;
    const object = r.below(lines.length);
    const { record, state } = await runAct(sandboxOf.get(p.program.language)!, {
      type, variant, state: lines[object]!, rule: p.rule, program: p.program, seed: BigInt(`0x${hashHex(`${input.seed}:${turn}`).slice(0, 15)}`),
      energy: energy[i]!, object, liveObjects: lines.length,
    });
    energy[i]! -= record.charge;
    s.spent += record.charge;
    s.acts[record.outcome]++;
    if (record.outcome === "failed" && !s.firstFailure) s.firstFailure = record.reason;
    const add = (into: Record<string, number>, view: string, e: number) => { if (e > 0) into[view] = (into[view] ?? 0) + e; };
    for (const [view, bits] of Object.entries(record.readsByRep)) add(s.reads, view, bits / SPEC_ECONOMY.kappa);
    if (record.outcome === "committed") {
      lines = lines.map((l, j) => (j === object ? state : l));
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
    const a = found && found.rungs.every(x => x.bits !== null) ? found : null;   // an unconverged run may have no values
    const name = `${p.rule.family}/${p.rule.tieBreaker}`;
    if (found) artefacts[name] = a ? found.status : `${found.status}, no values`;
    const bits = (ls: S[]) => ls.reduce((t, s) => t + bitsOf(a!, scoreOf(s)), 0);
    return {
      player: p.name, rule: name,
      levels: { start: mean(start), end: mean(lines), top: tops },
      mainTop: { start: atTop(start), end: atTop(lines) },
      bitsGained: a ? bits(lines) - bits(start) : null,
    };
  });
  return { rules, spend: spend.map(({ firstFailure, ...s }) => (firstFailure ? { ...s, firstFailure } : s)), artefacts };
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
    "| Player | Acts (made / skipped / failed) | ⚡ spent | ⚡ on reads, by view | ⚡ on changes, by view |",
    "|---|---|--:|---|---|",
    ...r.spend.map(s => `| ${s.player} | ${s.acts.committed} / ${s.acts.skipped} / ${s.acts.failed} | ${f1(s.spent)} | ${byView(s.reads)} | ${byView(s.changes)}${s.firstFailure ? ` (first failure: ${s.firstFailure})` : ""} |`),
  ];
  return out.join("\n");
}
