/**
 * The what-if pane's pure part (integration plan §1.6; unit-tested): which moves the board offers (as `rep.mutators`
 * lists them), and what one move would do to a line, worked out in the browser by the same engine host the server's
 * `object.quote` and `object.score` answer with (lib/v2-agents EngineHost). Nothing is sent and nothing changes.
 *
 * Points after the move assume the others want the line as much as now: their rules are secret, so their want after a
 * move is unknowable.
 */
import { EngineHost } from "@workspace/v2-agents/pure";
import { Qn, representation, variantMutators, type Variant } from "@workspace/v2-core";
import { lineParams, lineType, type LineState } from "@workspace/v2-linear";
import type { LineRule } from "../sdk/rule.ts";

export interface ArgField { name: string; kind: "number" | "choice"; choices?: string[] }
export interface MutatorChoice {
  id: string;
  /** The representation the move is made through (its first), and that representation's short title. */
  rep: string;
  repTitle: string;
  /** What the move does, in words ("move the line up or down"). */
  title: string;
  args: ArgField[];
}

/** The board's moves, in the line type's order, each with its arguments (a number, or one of a few words). */
export function mutatorChoices(variant: Variant): MutatorChoice[] {
  return variantMutators(lineType, variant).map(m => {
    const rep = m.reps.find(r => lineType.representations.some(x => x.id === r)) ?? m.reps[0]!;
    const combos = [...(m.args(variant).enumerate?.(12) ?? [])] as Record<string, unknown>[];
    const names = Object.keys(combos[0] ?? {});
    const args = names.map((name): ArgField => {
      const words = [...new Set(combos.map(c => c[name]).filter((v): v is string => typeof v === "string"))];
      return words.length ? { name, kind: "choice", choices: words } : { name, kind: "number" };
    });
    const known = lineType.representations.some(x => x.id === rep);
    return { id: m.id, rep, repTitle: known ? representation(lineType, rep).title.split(":")[0]!.trim() : "other moves", title: m.title, args };
  });
}

/** A typed number with a true minus sign or a hyphen, as the wire wants it. */
export const wireNumber = (text: string) => text.trim().replace(/[−–]/g, "-");

/** Why a typed argument is not a number this board takes, or null when it is. */
export function argError(text: string, variant: Variant): string | null {
  const t = wireNumber(text);
  let x;
  try { x = t ? Qn.parse(t) : null; } catch { x = null; }
  if (!x) return lineParams(variant).argDomain === "Z" ? "Type a number, like 2 or −3." : "Type a number, like 2, −3 or 1/2.";
  if (lineParams(variant).argDomain === "Z" && x.d !== 1n) return "This board takes whole numbers only.";
  return null;
}

export interface Standing {
  /** The rule's step and its top (the joint ladder, as the goal card counts it). */
  level: number;
  top: number;
  /** ✨ rarity at that step, as the server calibrated the dealt ladder (null when unknown). */
  rarity: number | null;
  /** rarity × the others' want (null without a want). */
  points: number | null;
}
export type WhatIf =
  | { ok: false; reason: string }
  | { ok: true; after: LineState; what: string; price: number; charge: number; from: Standing; to: Standing };

export interface WhatIfInput {
  rule: LineRule;
  state: LineState;
  call: { mutator: string; site?: number; args: Record<string, string> };
  /** ✨ rarity per step of the dealt ladder (index = step). */
  rarities: readonly number[];
  /** How much the others want this line now (null for a spectator, or before any value). */
  want: number | null;
}

const CONTEXT = { hostCallsLeft: 64 } as never;
const hostOn = (rule: LineRule, state: LineState) =>
  new EngineHost({ type: lineType, variant: rule.variant, state, rule: { family: rule.family.id, params: rule.params as Record<string, unknown>, tieBreaker: rule.tieBreaker ?? undefined }, energy: 0 });

function standing(rule: LineRule, state: LineState, rarities: readonly number[], want: number | null): Standing {
  const r = hostOn(rule, state).handle({ op: "myScore" } as never, CONTEXT);
  if (!r.ok) throw new Error(r.error);
  const { level, top } = r.result as { level: number; top: number };
  const rarity = rarities.length ? rarities[Math.min(level, rarities.length - 1)]! : null;
  return { level, top, rarity, points: rarity !== null && want !== null ? rarity * want : null };
}

/** What one move would do to the line: the line after, its price and an agent's charge, and the rule's verdict before and after. */
export function whatIf(i: WhatIfInput): WhatIf {
  const calls = [{ mutator: i.call.mutator, site: i.call.site ?? 0, args: i.call.args }];
  const host = hostOn(i.rule, i.state);
  const q = host.handle({ op: "quote", calls } as never, CONTEXT);
  if (!q.ok) return { ok: false, reason: q.error };
  const quote = q.result as { valid: boolean; reason?: string; total: number; charge: number };
  const priced = host.price(calls);
  if (!quote.valid || !priced.valid) return { ok: false, reason: (quote.reason ?? "this move is not allowed").replace(/^[\w.]+: /, "") };
  const m = lineType.mutators.find(x => x.id === i.call.mutator)!;
  const what = m.describe(m.args(i.rule.variant).decode(i.call.args));
  return {
    ok: true, after: priced.result, what, price: quote.total, charge: quote.charge,
    from: standing(i.rule, i.state, i.rarities, i.want), to: standing(i.rule, priced.result, i.rarities, i.want),
  };
}
