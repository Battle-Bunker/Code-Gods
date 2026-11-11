/**
 * The plain score lines (pure, so they are unit tested): "Your points now", and one sentence for what an act of your
 * agent did: the change in plain words, what it did to your rule score on that object, and to the object's points.
 * The words are the one score vocabulary (ui-kit glossary.ts SCORE_WORDS): "rule score" is what your goal card counts on
 * one object; "points" are what the leaderboard adds up.
 *
 * What the client knows about an act (no query of its own): the recent events (player.events) carry your own agents'
 * transformations with the object before and after and its points after; the points BEFORE the act are known only when
 * the object's previous event is still among the recent events. The rule score before and after is computed here, by
 * your own goal program (the goal explainer), from the two values.
 */
import { COLOUR_LETTERS, glyphForCode, parseGridForDisplay } from "@workspace/game-types";

export type RuleScore = number | readonly number[] | null | undefined;
type Value = number | string;

const minus = (text: string) => text.replace("-", "−");
/** One decimal below 1,000, none above; whole numbers stay whole only for rule scores (ruleScoreText). */
const amount = (x: number) => {
  const v = Number.isFinite(x) ? x : 0;
  const d = Math.abs(v) >= 999.95 ? 0 : 1;
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return minus((r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
};
const whole = (x: number) => minus((Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }));

/** "+1", "−2.3", "+0": a change, always with its sign. */
export function signed(x: number): string {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return r === 0 ? "+0" : `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
}

/** The big figure: "12.3", "1,235", "–" while unknown. */
export const pointsNowText = (score: number | undefined | null): string => (typeof score === "number" && Number.isFinite(score) ? amount(score) : "–");

/** A rule score as the card counts it: "3", or "(3, −5)" for a rule with several parts. */
export function ruleScoreText(score: RuleScore): string {
  if (score === null || score === undefined) return "–";
  return typeof score === "number" ? whole(score) : `(${score.map(whole).join(", ")})`;
}

/** "your rule score +1 (4 → 5)", "your rule score stayed 5", or null when either side is unknown. */
export function ruleScoreChange(before: RuleScore, after: RuleScore): string | null {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  if (typeof before === "number" && typeof after === "number") {
    return before === after ? `your rule score stayed ${ruleScoreText(after)}` : `your rule score ${signed(after - before)} (${ruleScoreText(before)} → ${ruleScoreText(after)})`;
  }
  const a = ruleScoreText(before), b = ruleScoreText(after);
  return a === b ? `your rule score stayed ${b}` : `your rule score ${a} → ${b}`;
}

const article = (noun: string) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

/** What changed between two values of an object, in plain words: one grid cell by its place, else the size of the change. */
export function describeChange(before: Value, after: Value, noun = "object"): string {
  const a = parseGridForDisplay(before), b = parseGridForDisplay(after);
  if (a && b && a.length === b.length) {
    const changed: [number, number][] = [];
    a.forEach((row, r) => row.forEach((c, k) => { if (c.code !== b[r][k].code || c.letter !== b[r][k].letter) changed.push([r, k]); }));
    if (!changed.length) return `left ${article(noun)} as it was`;
    if (changed.length > 1) return `changed ${changed.length} cells of ${article(noun)}`;
    const [r, k] = changed[0], from = a[r][k], to = b[r][k];
    const at = `at row ${r + 1}, column ${k + 1}`;
    const colour = (letter: string) => COLOUR_LETTERS[letter]?.name ?? letter;
    if (from.letter === to.letter) return `changed ${glyphForCode(from.code)} to ${glyphForCode(to.code)} ${at}`;
    if (from.code === to.code) return `changed the ${glyphForCode(from.code)} ${at} from ${colour(from.letter)} to ${colour(to.letter)}`;
    return `changed ${colour(from.letter)} ${glyphForCode(from.code)} to ${colour(to.letter)} ${glyphForCode(to.code)} ${at}`;
  }
  if (before === after) return `left ${article(noun)} as it was`;
  if (typeof before === "number" && typeof after === "number") return `changed ${whole(before)} to ${whole(after)}`;
  const short = (v: Value) => String(v).length <= 24;
  return short(before) && short(after) && !a && !b ? `changed “${before}” to “${after}”` : `changed ${article(noun)}`;
}

export interface ActLineInput {
  agent: string;
  before: Value;
  after: Value;
  noun?: string;
  /** Your rule score on the object before and after the act (your goal program on the two values). */
  ruleBefore?: RuleScore;
  ruleAfter?: RuleScore;
  /** The object's points for you before the act (when known) and after it. */
  pointsBefore?: number;
  pointsAfter?: number;
}

/** "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), points +12.3 (10.1 → 22.4)." */
export function actLine({ agent, before, after, noun = "object", ruleBefore, ruleAfter, pointsBefore, pointsAfter }: ActLineInput): string {
  const head = `Your agent ${agent} ${describeChange(before, after, noun)}`;
  const rule = ruleScoreChange(ruleBefore, ruleAfter);
  const known = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x);
  let points: string | null = null, joint = ", ";
  if (known(pointsBefore) && known(pointsAfter)) {
    points = pointsBefore === 0 && pointsAfter === 0 ? `points +0 (the others do not want this ${noun})`
      : `points ${signed(pointsAfter - pointsBefore)} (${amount(pointsBefore)} → ${amount(pointsAfter)})`;
  } else if (known(pointsAfter)) {
    points = `this ${noun} now gives you ${amount(pointsAfter)} points`; joint = "; ";
  }
  const tail = [rule, points].filter((x): x is string => !!x);
  return tail.length ? `${head}: ${tail.join(joint)}.` : `${head}.`;
}

export interface OwnAct {
  agentId: string;
  objectId: string;
  before: Value;
  after: Value;
  world: number;
  /** The object's points for you just before this act: only when its previous event is among the events given. */
  pointsBefore?: number;
  pointsAfter?: number;
}
type EventLike = {
  type: string; objectId?: string; agentId?: string; mine?: boolean; before?: unknown; value?: unknown; worldSeconds?: number; payoff?: number;
};

/**
 * The latest transformation by each of your agents among `events` (oldest first, as player.events gives them), and the
 * latest of all (`latest`). An object's points before an act are its points after its previous event, when that event
 * is among them.
 */
export function latestOwnActs(events: readonly EventLike[]): Map<string, OwnAct> & { latest?: OwnAct } {
  const out: Map<string, OwnAct> & { latest?: OwnAct } = new Map();
  const points = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "object.spawned" && e.type !== "object.rescored" && e.type !== "object.transformed") continue;
    if (!e.objectId) continue;
    const before = points.get(e.objectId);
    if (typeof e.payoff === "number") points.set(e.objectId, e.payoff); else points.delete(e.objectId);
    if (e.type !== "object.transformed" || !e.mine || !e.agentId) continue;
    const act: OwnAct = {
      agentId: e.agentId, objectId: e.objectId, before: e.before as Value, after: e.value as Value, world: e.worldSeconds ?? 0,
      ...(before !== undefined ? { pointsBefore: before } : {}), ...(typeof e.payoff === "number" ? { pointsAfter: e.payoff } : {}),
    };
    out.set(e.agentId, act);
    out.latest = act;
  }
  return out;
}
