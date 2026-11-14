/**
 * The goal card and the act log's move line (integration plan §3.3, §3.4 storyboards). Both are compositions of the
 * annotation and the faces; neither computes a score of its own.
 */
import type { ReactElement } from "react";
import { representation, type ObjectType, type Score, type Variant } from "@workspace/v2-core";
import { annotate, type RuleRef } from "./annotate.ts";
import { ExpandedFace } from "./faces.tsx";
import { chanceText, fmtBits, fmtNum, fmtValue } from "./format.ts";
import { nounOf } from "./refs.ts";
import { chipRep, labelOf, repText, shownRefs, valuesOf } from "./rep-view.tsx";

export interface GoalCardProps<S, P> {
  readonly rule: RuleRef<S, P>;
  /** The worked example: an object under the rule (the family's example, or one the caller found). */
  readonly example: S;
  /** The rule's value function (bits of a utility). */
  readonly value?: (u: Score) => number;
  /** The player's own object to explain first (the one in focus, or their best), with its name: "Line 7". */
  readonly mine?: { readonly state: S; readonly name: string } | null;
}

/**
 * The rule's card: its name and sentence; the player's own object explained (its parts on their rulers, its bits, the
 * moves that would make it rarer), when there is one; then the worked example. No steps (owner decision 23).
 */
export function GoalCard<S, P>({ rule, example, value, mine }: GoalCardProps<S, P>): ReactElement {
  const f = rule.family;
  const noun = nounOf(rule.type);
  return (
    <article className="v2v v2v-goal">
      <header>
        <h3 className="v2v-goal-title">{f.title}</h3>
        <p className="v2v-goal-card">{f.card(rule.params, rule.tieBreaker === undefined ? (f.tieBreakers[0]?.id ?? null) : rule.tieBreaker)}</p>
      </header>
      {mine && (
        <section className="v2v-goal-mine" aria-label={mine.name}>
          <h4 className="v2v-goal-sub">{mine.name}: why it scores what it does for you</h4>
          <ExpandedFace rule={rule} state={mine.state} value={value} />
        </section>
      )}
      <details className="v2v-goal-example" open={!mine}>
        <summary className="v2v-goal-sub">A worked example</summary>
        <p className="v2v-goal-hint">Tap a part to see only its marks; point at a number to find it in every view.</p>
        <ExpandedFace rule={rule} state={example} value={value} improvement={!mine} />
      </details>
      {!mine && <p className="v2v-goal-hint">Open one of your {noun}s to see it explained here.</p>}
    </article>
  );
}

export interface MovePoints {
  readonly before: number;
  readonly after: number;
  /** How much the others want this line now, and before when it changed. */
  readonly want: number;
  readonly wantBefore?: number;
}

export interface MoveLineProps<S, P> {
  readonly rule: RuleRef<S, P>;
  readonly before: S;
  readonly after: S;
  /** Who moved it: "Your agent Tank-1", "Ada's agent". */
  readonly who: string;
  /** The call's own words ("move the line down 1"), when known. */
  readonly what?: string;
  /** The rule's value function (bits of a utility). */
  readonly value?: (u: Score) => number;
  readonly points?: MovePoints;
}

/** The written form of a line in the representation that changed, or its equation. */
function form<S>(type: ObjectType<S>, state: S, rep: string): string {
  return repText(type, state, representation(type, rep).scene === "equation" ? rep : chipRep(type, state, rep));
}

/** Changed elements listed at most this many; the rest counted. */
const CHANGES_SHOWN = 2;

/**
 * The change in words. An object with an equation is written before → after ("y = −3x + 10 → y = −3x + 9"); one without
 * (a grid) names the elements of its chip's view that changed: "row 1, column 1: 3 → 7; and 2 more".
 */
function changeText<S>(type: ObjectType<S>, variant: Variant, before: S, after: S, rep: string): string {
  if (representation(type, rep).scene === "equation") return `${form(type, before, rep)} → ${form(type, after, rep)}`;
  const sites = Math.min(type.sites(before, variant), type.sites(after, variant));
  const changed = Array.from({ length: sites }, (_, site) => {
    const b = valuesOf(type, before, site), a = valuesOf(type, after, site);
    return shownRefs(type, after, rep, site).filter(r => fmtValue(b(r)) !== fmtValue(a(r))).map(r => ({ r, was: fmtValue(b(r)), now: fmtValue(a(r)) }));
  }).flat();
  if (!changed.length) return "no change";
  const said = changed.slice(0, CHANGES_SHOWN).map(c => `${labelOf(type, c.r)}: ${c.was} → ${c.now}`);
  const more = changed.length - said.length;
  return said.join("; ") + (more ? `; and ${more} more` : "");
}

/**
 * One act log line (ux-lessons 2.2–2.3; owner decision 23): the change, what it did to the rule's quantities
 * ("y-intercept 25 → 24"), rarity in bits before → after with its reason, and the points with the want (both values
 * when it changed; "because …" when points move against the rarity).
 */
export function MoveLine<S, P>(props: MoveLineProps<S, P>): ReactElement {
  const { rule, before, after } = props;
  const a0 = annotate(rule, before, { value: props.value });
  const a1 = annotate(rule, after, { value: props.value });
  const rep = chipRep(rule.type, after);
  const noun = nounOf(rule.type);
  const p0 = a0.sites[0]?.parts ?? [], p1 = a1.sites[0]?.parts ?? [];
  const changes = p0.flatMap((p, i) => {
    const q = p1[i];
    if (!q) return [];
    const s0 = p.source.find(s => s.value), s1 = q.source.find(s => s.value && s.label === s0?.label);
    if (p.sense === "min" && s0 && s1 && s0.text !== s1.text) return [`${s0.label} ${s0.text} → ${s1.text}${q.distance?.startsWith("on ") ? ` (${q.distance})` : ""}`];
    if (p.sense === "max" && p.valueText !== q.valueText) return [`${p.title} ${p.valueText} → ${q.valueText}`];
    return [];
  });
  const up = (a1.bits ?? 0) > (a0.bits ?? 0) + 1e-9, down = (a1.bits ?? 0) < (a0.bits ?? 0) - 1e-9;
  const scoring = a0.score === null && a1.score !== null ? "Now it scores" : a0.score !== null && a1.score === null ? "It no longer scores" : null;
  const rarity = a0.bits !== null && a1.bits !== null && fmtNum(a0.bits) !== fmtNum(a1.bits)
    ? `Rarity ${fmtNum(a0.bits)} → ${fmtBits(a1.bits)}, ${chanceText(a1.bits)} by chance (${a1.bits > a0.bits ? "fewer" : "more"} random ${noun}s are this good)`
    : null;
  let points: string | null = null;
  if (props.points) {
    const p = props.points;
    const want = p.wantBefore !== undefined && fmtNum(p.wantBefore) !== fmtNum(p.want) ? `${fmtNum(p.want)}, was ${fmtNum(p.wantBefore)}` : fmtNum(p.want);
    points = `Points on this ${noun} ${fmtNum(p.before)} → ${fmtNum(p.after)} (the others want it ${want})`;
    // Points fell while the rarity did not, or the others' want fell too: say why (ux-lessons 2.3).
    const wantFell = p.wantBefore !== undefined && p.want < p.wantBefore;
    if (p.after < p.before && (!down || wantFell)) points += `: because the others want this ${noun} less now`;
  }
  return (
    <p className="v2v v2v-move" data-dir={up ? "up" : down ? "down" : "same"}>
      <span className="v2v-move-who">{props.who} changed a {noun}:</span>{" "}
      <span className="v2v-move-change" data-scene={representation(rule.type, rep).scene}>{changeText(rule.type, rule.variant, before, after, rep)}</span>
      {props.what && <> ({props.what})</>}.
      {changes.length > 0 && <> <span className="v2v-move-parts">{changes.join("; ")}</span>.</>}
      {scoring && <> {scoring}.</>}
      {rarity && <> {rarity}.</>}
      {points && <> {points}.</>}
    </p>
  );
}
