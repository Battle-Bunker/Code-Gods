/**
 * The goal card and the act log's move line (integration plan §3.3, §3.4 storyboards). Both are compositions of the
 * annotation and the faces; neither computes a score of its own.
 */
import type { ReactElement } from "react";
import { representation, type ObjectType } from "@workspace/v2-core";
import { annotate, type RuleRef } from "./annotate.ts";
import { ExpandedFace, levelText } from "./faces.tsx";
import { fmtRarity } from "./format.ts";
import { chipRep, repText } from "./rep-view.tsx";

export interface GoalCardProps<S, P> {
  readonly rule: RuleRef<S, P>;
  /** The worked example: a line under the rule (the family's example, or one the caller found). */
  readonly example: S;
  readonly rarities?: readonly number[];
}

/** The rule's card: its name and sentence, a worked example on the expanded face, the ladder and the next step. */
export function GoalCard<S, P>({ rule, example, rarities }: GoalCardProps<S, P>): ReactElement {
  const f = rule.family;
  return (
    <article className="v2v v2v-goal">
      <header>
        <h3 className="v2v-goal-title">{f.title}</h3>
        <p className="v2v-goal-card">{f.card(rule.params)}</p>
        <p className="v2v-goal-hint">A worked example. Point at a part to see why; point at a number to find it in every view.</p>
      </header>
      <ExpandedFace rule={rule} state={example} rarities={rarities} />
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
  readonly rarities?: readonly number[];
  readonly points?: MovePoints;
}

const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** The written form of a line in the representation that changed, or its equation. */
function form<S>(type: ObjectType<S>, state: S, rep: string): string {
  return repText(type, state, representation(type, rep).scene === "equation" ? rep : chipRep(type, state, rep));
}

/**
 * One act log line (ux-lessons 2.2–2.3): the change, the rule's step before → after, ✨ rarity before → after with its
 * reason, and the points with the want (both values when it changed; "because …" when points move against the score).
 */
export function MoveLine<S, P>(props: MoveLineProps<S, P>): ReactElement {
  const { rule, before, after } = props;
  const a0 = annotate(rule, before, { rarities: props.rarities });
  const a1 = annotate(rule, after, { rarities: props.rarities });
  const rep = chipRep(rule.type, after);
  const up = a1.level > a0.level, down = a1.level < a0.level;
  const step = a0.level === a1.level
    ? `Still ${levelText(a1)}`
    : `${up ? "Up" : "Down"}: step ${a0.level} → ${a1.level} of ${a1.top}`;
  const rarity = a0.rarity !== null && a1.rarity !== null && a0.rarity !== a1.rarity
    ? `${fmtRarity(a0.rarity).replace("✨", "✨ rarity")} → ${one(a1.rarity)} (${a1.rarity > a0.rarity ? "fewer" : "more"} random lines score this well)`
    : null;
  let points: string | null = null;
  if (props.points) {
    const p = props.points;
    const want = p.wantBefore !== undefined && p.wantBefore !== p.want ? `${one(p.want)}, was ${one(p.wantBefore)}` : one(p.want);
    points = `Points on this line ${one(p.before)} → ${one(p.after)} (the others want it ${want})`;
    // Points fell while the rule score did not, or the others' want fell too: say why (ux-lessons 2.3).
    const wantFell = p.wantBefore !== undefined && p.want < p.wantBefore;
    if (p.after < p.before && (!down || wantFell)) points += ": because the others want this line less now";
  }
  return (
    <p className="v2v v2v-move" data-dir={up ? "up" : down ? "down" : "same"}>
      <span className="v2v-move-who">{props.who} changed a line:</span>{" "}
      <span className="v2v-move-change">{form(rule.type, before, rep)} → {form(rule.type, after, rep)}</span>
      {props.what && <> ({props.what})</>}. <span className="v2v-move-step">{step}</span>.
      {rarity && <> {rarity}.</>}
      {points && <> {points}.</>}
    </p>
  );
}
