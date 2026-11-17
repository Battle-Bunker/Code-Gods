/**
 * The what-if pane's pure part (integration plan §1.6; unit-tested): which moves the board offers (as `rep.mutators`
 * lists them), and what one move would do to a line, worked out in the browser by the same engine host the server's
 * `object.quote` and `object.score` answer with (lib/v2-agents EngineHost). Nothing is sent and nothing changes.
 *
 * Points after the move assume the others want the line as much as now: their rules are secret, so their want after a
 * move is unknowable. Both sides of a move read the same value function (bits at any score), so before and after compare.
 */
import { EngineHost } from "@workspace/v2-agents/pure";
import { energyOf, evaluateObject, Qn, representation, variantMutators, type Q, type Score, type Variant } from "@workspace/v2-core";
import { objectTypeOf } from "../sdk/object-types.ts";
import { typesetNumbers } from "@workspace/v2-views/format";
import type { GameRule } from "../sdk/rule.ts";
import { expandAdd, LENSES, type LineState } from "@workspace/v2-linear";

/**
 * One argument: a number (`fractions`: whether it may be a fraction; a stretch factor may be one even on a
 * whole-number board; `words`: words it also takes, a turn's "origin"), one of a few words, or free text (a mirror line
 * "a,b,c"). `start` is its cheapest value, the form's first. `optional`: the move has another shape without it (a fold
 * in a crease takes x0 and s, a fold in a mirror line takes mirror), so it is left out of the call when empty.
 */
/** How the form says an argument (the mutator's own `argHelp`, round 23): never only its wire name. */
interface Said { label: string; hint: string; choiceWords?: Readonly<Record<string, string>> }
export type ArgField = Said & (
  | { name: string; kind: "number"; fractions: boolean; start: string; words?: string[]; optional?: true }
  | { name: string; kind: "choice"; choices: string[]; start: string; optional?: true }
  | { name: string; kind: "text"; start: string; optional?: true });
export interface MutatorChoice {
  id: string;
  /** The representation the move is made through (its first), and that representation's short title. */
  rep: string;
  repTitle: string;
  /** What the move does, in words ("move the line up or down"). */
  title: string;
  args: ArgField[];
}

/** A typed number with a true minus sign or a hyphen, as the wire wants it. */
export const wireNumber = (text: string) => text.trim().replace(/[−–]/g, "-");
const shown = (v: Q | string) => (typeof v === "string" ? v : Qn.toWire(v).replace("-", "−"));
/** More words than this, and none of them said in plain words, and an argument is typed, not picked. */
const MAX_CHOICES = 12;

/** The board's moves, in the line type's order, each with its arguments. */
export function mutatorChoices(variant: Variant): MutatorChoice[] {
  const type = objectTypeOf(variant.id);
  const out: MutatorChoice[] = variantMutators(type, variant).map(m => {
    const rep = m.reps.find(r => type.representations.some(x => x.id === r)) ?? m.reps[0]!;
    // Every argument costing at most 12 bits, cheapest first: enough to tell numbers from words and to see fractions.
    const combos = [...(m.args(variant).enumerate?.(12) ?? [])] as Record<string, Q | string>[];
    const first = combos[0] ?? {};
    const help = m.argHelp?.(variant) ?? {};
    // A move whose code cannot list its arguments (the lens moves) names them in its help.
    const names = combos.length ? [...new Set(combos.flatMap(c => Object.keys(c)))] : Object.keys(help);
    const args = names.map((name): ArgField => {
      const values = combos.filter(c => name in c).map(c => c[name]!);
      const h = help[name];
      const optional = combos.some(c => !(name in c)) ? { optional: true as const } : {};
      // The move's own example to start from, else its cheapest value; an argument its cheapest shape leaves out (a
      // fold's mirror, beside its crease) starts empty.
      const start = !combos.length ? h?.example ?? "" : !(name in first) ? "" : h?.example ? h.example.replace(/^-/, "−") : shown(first[name]!);
      const said: Said = { label: h?.label ?? name, hint: h?.hint ?? "", ...(h?.choices ? { choiceWords: h.choices } : {}) };
      const words = [...new Set(values.filter((v): v is string => typeof v === "string"))];
      const numbers = values.filter((v): v is Q => typeof v !== "string");
      // Words the move names in plain words (a 4×4 board's 16 cells) are always picked, however many: typing "r0c0"
      // is not for a person. Unnamed words past MAX_CHOICES are typed.
      const all = h?.choices ? [...new Set([...words, ...Object.keys(h.choices)])] : words;
      if (!numbers.length && all.length) return h?.choices || all.length <= MAX_CHOICES ? { name, kind: "choice", choices: all, start, ...optional, ...said } : { name, kind: "text", start, ...optional, ...said };
      const fractions = numbers.some(v => v.d !== 1n);
      return words.length ? { name, kind: "number", fractions, start, words, ...optional, ...said } : { name, kind: "number", fractions, start, ...optional, ...said };
    });
    const known = type.representations.some(x => x.id === rep);
    return { id: m.id, rep, repTitle: known ? representation(type, rep).title.split(":")[0]!.trim() : "other moves", title: m.title, args };
  });
  if (type.id !== "line") return out;
  // A convenience, not a move: add a fraction p/q to a parameter, made and priced as the whole-number mutations it
  // expands into (v2-linear expandAdd: multiply the bottom, then add to the top).
  const pairLenses = LENSES.filter(l => l.pairs.length > 0);
  out.push({
    id: ADD_FRACTION, rep: "si", repTitle: "slope-intercept", title: "add a fraction p/q to a parameter (made as whole-number moves)",
    args: [
      { name: "lens", kind: "choice", choices: pairLenses.map(l => l.id), start: "mc", label: "Which lens", hint: "a lens with fractions", choiceWords: Object.fromEntries(pairLenses.map(l => [l.id, l.title])) },
      { name: "param", kind: "number", fractions: false, start: "2", label: "Which fraction (1 = the first)", hint: "a whole number from 1" },
      { name: "p", kind: "number", fractions: false, start: "1", label: "Top p", hint: "a whole number, e.g. 1 or −2" },
      { name: "q", kind: "number", fractions: false, start: "3", label: "Bottom q", hint: "a whole number of 1 or more" },
    ],
  });
  return out;
}

/** The id of the "add p/q" convenience (What if only; it is made as the moves it expands into). */
export const ADD_FRACTION = "add-fraction";
/**
 * The whole-number calls "add p/q to fraction `param` of `lens`" expands into on a line (v2-linear expandAdd), or why
 * not. `site` is the line.
 */
export function expandAddFraction(state: LineState, site: number, args: Record<string, string>): { mutator: string; site: number; args: Record<string, string> }[] | string {
  const lens = LENSES.find(l => l.id === args.lens);
  if (!lens || !lens.pairs.length) return "pick a lens with fractions";
  const j = Number(args.param) - 1, pair = lens.pairs[j];
  if (!pair) return `the ${lens.id} lens has fractions 1 to ${lens.pairs.length}`;
  let p: bigint, qq: bigint;
  try { p = BigInt(wireNumber(args.p ?? "")); qq = BigInt(wireNumber(args.q ?? "")); } catch { return "p and q are whole numbers"; }
  if (qq < 1n) return "q is 1 or more";
  const ns = lens.numbers(state.lines[site]!);
  if (!ns) return `the ${lens.id} lens cannot read this line`;
  const [t, b] = pair;
  return expandAdd(ns[t]!, ns[b]!, p, qq).map(st => ({
    mutator: st.kind, site, args: { lens: lens.id, at: String((st.on === "top" ? t : b) + 1), k: String(st.k) },
  }));
}

/** Why a typed number is not one this argument takes, or null when it is (`words`: words it takes instead of a number). */
export function argError(text: string, fractions: boolean, words: readonly string[] = []): string | null {
  const t = wireNumber(text);
  if (words.includes(t)) return null;
  let x: Q | null;
  try { x = t ? Qn.parse(t) : null; } catch { x = null; }
  const or = words.length ? ` or ${words.join(", ")}` : "";
  if (!x) return fractions ? `Type a number, like 2, −3 or 1/2${or}.` : `Type a number, like 2 or −3${or}.`;
  if (!fractions && x.d !== 1n) return "This board takes whole numbers here.";
  return null;
}

/** The call's wire arguments from the form: numbers as the wire writes them, empty optional arguments left out. */
export function wireArgs(fields: readonly ArgField[], typed: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(fields.flatMap(a => {
    const t = typed[a.name] ?? "";
    if (a.optional && t.trim() === "") return [];
    return [[a.name, a.kind === "number" ? wireNumber(t) : t.trim()]];
  }));
}

/** The first argument the form cannot send as typed, with why. */
export function formError(fields: readonly ArgField[], typed: Readonly<Record<string, string>>): readonly [string, string] | null {
  for (const a of fields) {
    const t = typed[a.name] ?? "";
    if (a.optional && t.trim() === "") continue;
    if (a.kind === "number") { const e = argError(t, a.fractions, a.words); if (e) return [a.name, e]; }
  }
  return null;
}

export interface Standing {
  /** The rule's score of the line (its utility). */
  score: Score;
  /**
   * What the line is worth to the rule: for a rule scored by the dynamic measure (docs/engine-v2/energy.md), its energy,
   * estimated afresh (it jitters); otherwise rarity in bits at the score, from the value function (null without one).
   */
  rarity: number | null;
  /** rarity × the others' want (null without a want). */
  points: number | null;
}
export type WhatIf =
  | { ok: false; reason: string }
  | { ok: true; after: unknown; what: string; price: number; charge: number; naming: number; surprise: number; from: Standing; to: Standing };

export interface WhatIfInput {
  rule: GameRule;
  state: unknown;
  call: { mutator: string; site?: number; args: Record<string, string> };
  /** Moves already in this turn, made before `call` (a turn is a list of moves on one lens). */
  steps?: readonly { mutator: string; site?: number; args: Record<string, string> }[];
  /** The rule's worth in bits at a score (owner decision 23), null when unknown. */
  value: ((u: Score) => number) | null;
  /** How much the others want this line now (null for a spectator, or before any value). */
  want: number | null;
}

const CONTEXT = { hostCallsLeft: 64 } as never;
/** A mutator of the rule's object type. */
const mutatorOf = (rule: GameRule, id: string) => rule.type.mutators.find(x => x.id === id)!;

const hostOn = (rule: GameRule, state: unknown) =>
  new EngineHost({ type: rule.type, variant: rule.variant, state, rule: { family: rule.family.id, params: rule.params as Record<string, unknown>, tieBreaker: rule.tieBreaker ?? undefined }, energy: 0 });

/** The rule's verdict on a line: its score, rarity in bits and points (the "before" of every move tried on it). */
export function standing(rule: GameRule, state: unknown, value: ((u: Score) => number) | null, want: number | null): Standing {
  const score = evaluateObject(rule.type, rule.family, rule.params, state, rule.variant, rule.tieBreaker ?? undefined).score;
  const rarity = rule.family.dynamic ? energyOf(rule.type, rule.family, rule.params, state, rule.variant).energy : value ? value(score) : null;
  return { score, rarity, points: rarity !== null && want !== null ? rarity * want : null };
}

/**
 * What one move would do to the line: the line after, its price and an agent's charge, and the rule's verdict before
 * (`from`, when the caller already has it) and after. Never throws: what the engine refuses comes back as a reason.
 */
export function whatIf(i: WhatIfInput, from?: Standing): WhatIf {
  try {
    const raw = [...(i.steps ?? []), i.call].map(c => ({ mutator: c.mutator, site: c.site ?? 0, args: c.args }));
    // Expand each "add p/q" against the line as the moves before it leave it.
    const calls: { mutator: string; site: number; args: Record<string, string> }[] = [];
    for (const c of raw) {
      if (c.mutator !== ADD_FRACTION) { calls.push(c); continue; }
      const now = calls.length ? hostOn(i.rule, i.state).price(calls) : { valid: true as const, result: i.state };
      if (!now.valid) return { ok: false, reason: now.reason };
      const ex = expandAddFraction(now.result as LineState, c.site, c.args);
      if (typeof ex === "string") return { ok: false, reason: ex };
      if (!ex.length) return { ok: false, reason: "adding 0 changes nothing" };
      calls.push(...ex);
    }
    const host = hostOn(i.rule, i.state);
    const q = host.handle({ op: "quote", calls } as never, CONTEXT);
    if (!q.ok) return { ok: false, reason: q.error };
    const quote = q.result as { valid: boolean; reason?: string; total: number; charge: number };
    const priced = host.price(calls);
    if (!quote.valid || !priced.valid) return { ok: false, reason: (quote.reason ?? "this move is not allowed").replace(/^[\w.]+: /, "") };
    const say = (c: { mutator: string; args: Record<string, string> }) => { const m = mutatorOf(i.rule, c.mutator); return m.describe(m.args(i.rule.variant).decode(c.args)); };
    return {
      ok: true, after: priced.result, what: typesetNumbers(calls.map(say).join(", then ")), price: quote.total, charge: quote.charge,
      naming: priced.prices.reduce((t, p) => t + p.total, 0), surprise: quote.total - priced.prices.reduce((t, p) => t + p.total, 0),
      from: from ?? standing(i.rule, i.state, i.value, i.want), to: standing(i.rule, priced.result, i.value, i.want),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
