/**
 * The plain score lines (pure, so they are unit tested): "Your points now", and one sentence for what an act of your
 * agent did: the change in plain words, what it did to your rule score on that object, and to that object's points
 * (always "this grid's points": bare "points" is the total), with the factor that moved when the two disagree.
 * The words are the one score vocabulary (ui-kit glossary.ts SCORE_WORDS): "rule score" is what your goal card counts on
 * one object; "points" are what the leaderboard adds up.
 *
 * What the client knows about an act (no query of its own): the recent events (player.events) carry your own agents'
 * transformations with the object before and after and its points after; the points BEFORE the act are known only when
 * the object's previous event is still among the recent events. An object's points are your ✨ rarity on it × how much
 * the others want it (the event's own.netBits and peerCare), so a 0 is explained by whichever side is 0. The rule score before and after is computed here, by
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

/**
 * "Your points now" from the counts the page already holds: your own total as last counted for you (player.totals) and
 * your row of the scoreboard as last published (games.standings), each with the world time it was made. The fresher
 * one wins, so the figure never trails the leaderboard beside it (a player saw 2,890 "counted 19 s ago" next to 3,002).
 * A count with no time is used only when no timed one exists.
 */
export function fresherPoints(counts: readonly ({ score: number | undefined | null; world?: number | null } | null | undefined)[]): { score: number; world?: number } | null {
  let best: { score: number; world?: number } | null = null;
  for (const c of counts) {
    if (!c || typeof c.score !== "number" || !Number.isFinite(c.score)) continue;
    const world = typeof c.world === "number" && Number.isFinite(c.world) ? c.world : undefined;
    if (!best || (world !== undefined && (best.world === undefined || world > best.world))) best = { score: c.score, ...(world !== undefined ? { world } : {}) };
  }
  return best;
}

/** The big figure: "12.3", "1,235", "–" while unknown. */
export const pointsNowText = (score: number | undefined | null): string => (typeof score === "number" && Number.isFinite(score) ? amount(score) : "–");

/**
 * How old the figure is, in world seconds: "counted just now", "counted 8 s ago", "counted 3 min ago"; null when either
 * time is unknown. The total is not promised to be live: it is as fresh as the last count the engine made for you.
 */
export function asOfText(worldNow: number | undefined | null, countedAt: number | undefined | null): string | null {
  if (typeof worldNow !== "number" || typeof countedAt !== "number" || !Number.isFinite(worldNow) || !Number.isFinite(countedAt)) return null;
  const age = Math.max(0, worldNow - countedAt);
  return age < 2 ? "counted just now" : age < 90 ? `counted ${Math.round(age)} s ago` : `counted ${Math.round(age / 60)} min ago`;
}

/** A rule score as the card counts it: "3", or "(3, −5)" for a rule with several parts. */
export function ruleScoreText(score: RuleScore): string {
  if (score === null || score === undefined) return "–";
  return typeof score === "number" ? whole(score) : `(${score.map(whole).join(", ")})`;
}

/**
 * "your rule score +1 (4 → 5)", "your rule score stayed 5", "your rule score (primary, secondary) (0, 4) → (1, 3)" for
 * a rule with parts (the part names once, so "(6, −8)" is not jargon), or null when either side is unknown.
 */
export function ruleScoreChange(before: RuleScore, after: RuleScore): string | null {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  if (typeof before === "number" && typeof after === "number") {
    return before === after ? `your rule score stayed ${ruleScoreText(after)}` : `your rule score ${signed(after - before)} (${ruleScoreText(before)} → ${ruleScoreText(after)})`;
  }
  const a = ruleScoreText(before), b = ruleScoreText(after), parts = partNames(after);
  return a === b ? `your rule score${parts} stayed ${b}` : `your rule score${parts} ${a} → ${b}`;
}
/** The names of a rule score's parts, said once: " (primary, secondary)"; nothing for a plain number. */
const PART_NAMES = ["primary", "secondary", "tertiary"];
const partNames = (score: RuleScore): string =>
  typeof score === "object" && score && score.length > 1 && score.length <= PART_NAMES.length ? ` (${PART_NAMES.slice(0, score.length).join(", ")})` : "";

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
  /** After the act: your own ✨ rarity on the object and how much the others want it (the event's own.netBits and peerCare). */
  ownAfter?: number;
  othersAfter?: number;
  /** The same two figures before the act: only when the object's previous event is among the recent events. */
  ownBefore?: number;
  othersBefore?: number;
  /** The ✨ rarity of the rule score before and after, from the player's own table (the goal explainer's `rarity`), when it is loaded. */
  rarityBefore?: number | null;
  rarityAfter?: number | null;
  /** The room blurs the others' side while the game is live (score-lines.tsx liveIsEstimate): see pointsCause. */
  estimate?: boolean;
  /** Seen as another player (a replay): "Their agent … their rule score". */
  third?: boolean;
}

/**
 * Why an object gives 0 points (points = your ✨ rarity × how much the others want it): the others' side is 0, or your
 * own rarity is 0. Each reason is given only when its side is known to be 0; otherwise none.
 */
export function zeroPointsReason(ownAfter: number | undefined, othersAfter: number | undefined, noun = "object"): string | null {
  if (othersAfter === 0) return `the others do not want this ${noun}`;
  if (ownAfter === 0) return `this ${noun} is not rare by your rule yet`;
  return null;
}

/**
 * How much the others want an object, as one short clause for the act line: the same step on two objects pays very
 * differently because of this figure (a player saw +41.6 once and +0.4 another time for the same step). The bands:
 * what shows as 0.0 none, below 1 "barely", 8 and above "a lot", between them the bare figure; below 0 they would rather not have it.
 */
export function othersWantClause(others: number | undefined, noun = "object"): string | null {
  if (typeof others !== "number" || !Number.isFinite(others)) return null;
  // What shows as 0.0 is none.
  if (Math.abs(others) < 0.05) return `the others do not want this ${noun}`;
  if (others < 0) return `the others would rather not have this ${noun}: ${amount(others)}`;
  if (others < 1) return `the others barely want this ${noun}: ${amount(others)}`;
  if (others >= 8) return `the others want this ${noun} a lot: ${amount(others)}`;
  return `how much the others want this ${noun}: ${amount(others)}`;
}

/** Whether a rule score went up (1), down (−1) or stayed (0); parts compare primary first. Null when either is unknown or they differ in shape. */
export function ruleDirection(before: RuleScore, after: RuleScore): -1 | 0 | 1 | null {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  if (typeof before === "number" && typeof after === "number") return after > before ? 1 : after < before ? -1 : 0;
  if (typeof before === "number" || typeof after === "number" || before.length !== after.length) return null;
  for (let i = 0; i < before.length; i++) if (after[i] !== before[i]) return after[i] > before[i] ? 1 : -1;
  return 0;
}

const isKnown = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const span = (a: number, b: number) => (amount(a) === amount(b) ? "" : `${amount(a)} → ${amount(b)}`);

/**
 * Why an object's points moved against (or without) the rule score, from the two factors before and after the act
 * (points = your ✨ rarity × how much the others want it). A factor is named only when its own change pushed the points
 * the way they went; with a figure missing, or when neither explains the move, null (nothing is guessed).
 */
export function pointsCause(i: { rule: -1 | 0 | 1; pointsDelta: number; ownBefore?: number; ownAfter?: number; othersBefore?: number; othersAfter?: number; noun?: string;
  /** The room blurs the others' side (live figures are an estimate): a small move of it may be noise, so it is named only when it accounts for at least half of the points' move. */ estimate?: boolean }): string | null {
  const { ownBefore, ownAfter, othersBefore, othersAfter, noun = "object" } = i;
  if (!isKnown(ownBefore) || !isKnown(ownAfter) || !isKnown(othersBefore) || !isKnown(othersAfter)) return null;
  const way = Math.sign(i.pointsDelta);
  const byOthers = ownBefore * (othersAfter - othersBefore), byOwn = (ownAfter - ownBefore) * othersAfter;
  const causes: string[] = [];
  const figures = (text: string) => (text ? ` (${text})` : "");
  if (way !== 0 && Math.sign(byOthers) === way && (!i.estimate || Math.abs(byOthers) >= Math.abs(i.pointsDelta) / 2)) {
    causes.push(`the others want this ${noun} ${othersAfter > othersBefore ? "more" : "less"} now${figures(span(othersBefore, othersAfter))}`);
  }
  if (way !== 0 && Math.sign(byOwn) === way) {
    const rarity = span(ownBefore, ownAfter), shown = rarity ? ` (your ✨ rarity ${rarity})` : "";
    const rarer = ownAfter > ownBefore;
    causes.push(i.rule === 1 && !rarer ? `a higher rule score is not rarer here${shown}`
      : i.rule === -1 && rarer ? `a lower rule score is rarer here${shown}`
      : `this ${noun} is ${rarer ? "rarer" : "less rare"} by your rule now${shown}`);
  }
  return causes.length ? causes.join(" and ") : null;
}

/**
 * "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), this grid's points +12.3 (10.1 → 22.4)."
 * The per-object figure is always "this grid's points", never bare "points" (that is the total, "Your points now").
 * When the points went the other way than the rule score, or moved while it stayed, the line says so and names the
 * factor that moved (pointsCause); otherwise it carries how much the others want the object, when the event gives it.
 */
export function actLine(input: ActLineInput): string {
  const theirs = (text: string) => input.third ? text.replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/\byou\b/g, "them") : text;
  return theirs(ownActLine(input));
}
function ownActLine({ agent, before, after, noun = "object", ruleBefore, ruleAfter, rarityBefore, rarityAfter, pointsBefore, pointsAfter, ownBefore, othersBefore, ownAfter, othersAfter, estimate }: ActLineInput): string {
  const head = `Your agent ${agent} ${describeChange(before, after, noun)}`;
  // What the move did to the rarity, so its size can be read: only when both sides are known and show differently.
  const rare = (x: number) => minus((Math.round(x * 10) / 10 === 0 ? 0 : Math.round(x * 10) / 10).toFixed(1));
  const rarity = typeof rarityBefore === "number" && typeof rarityAfter === "number" && Number.isFinite(rarityBefore) && Number.isFinite(rarityAfter)
    && rare(rarityBefore) !== rare(rarityAfter) && ruleDirection(ruleBefore, ruleAfter) !== 0 ? `: ✨ ${rare(rarityBefore)} → ${rare(rarityAfter)}` : "";
  const plain = ruleScoreChange(ruleBefore, ruleAfter);
  const rule = plain ? plain + rarity : plain;
  const others = othersWantClause(othersAfter, noun);
  if (isKnown(pointsBefore) && isKnown(pointsAfter)) {
    const delta = pointsAfter - pointsBefore, moved = signed(delta) !== "+0";
    const way = ruleDirection(ruleBefore, ruleAfter);
    if (moved && way !== null && Math.sign(delta) !== way) {
      const told = way === 0 ? rule : `your rule score went ${way > 0 ? "up" : "down"} (${ruleScoreText(ruleBefore)} → ${ruleScoreText(ruleAfter)}${typeof ruleAfter === "object" && ruleAfter && ruleAfter.length > 1 ? ", primary first" : ""}${rarity})`;
      const change = `but this ${noun}'s points ${delta > 0 ? "rose" : "fell"} ${signed(Math.abs(delta)).slice(1)} (${amount(pointsBefore)} → ${amount(pointsAfter)})`;
      const cause = pointsCause({ rule: way, pointsDelta: delta, ownBefore, ownAfter, othersBefore, othersAfter, noun, estimate });
      return cause ? `${head}: ${told}, ${change} because ${cause}.`
        : `${head}: ${told}, ${change}. ${article(noun).replace(/^a/, "A")}'s points are your ✨ rarity for it × how much the others want it, not the rule score alone.`;
    }
    const why = pointsBefore === 0 && pointsAfter === 0 ? zeroPointsReason(ownAfter, othersAfter, noun) : others;
    const figures = [pointsBefore === 0 && pointsAfter === 0 ? null : `${amount(pointsBefore)} → ${amount(pointsAfter)}`, why].filter(Boolean).join("; ");
    const points = `this ${noun}'s points ${signed(delta)}${figures ? ` (${figures})` : ""}`;
    return `${head}: ${[rule, points].filter(Boolean).join(", ")}.`;
  }
  if (isKnown(pointsAfter)) {
    const points = `this ${noun} now gives you ${amount(pointsAfter)} points${others ? ` (${others})` : ""}`;
    return `${head}: ${[rule, points].filter(Boolean).join("; ")}.`;
  }
  return rule ? `${head}: ${rule}.` : `${head}.`;
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
  /** After the act: your own ✨ rarity on the object and how much the others want it, as the event gives them. */
  ownAfter?: number;
  othersAfter?: number;
  /** The same two figures just before this act: only when the object's previous event is among the events given. */
  ownBefore?: number;
  othersBefore?: number;
}
type EventLike = {
  type: string; objectId?: string; agentId?: string; mine?: boolean; before?: unknown; value?: unknown; worldSeconds?: number; payoff?: number;
  own?: { netBits?: number }; peerCare?: number;
};

/**
 * The latest transformation by each of your agents among `events` (oldest first, as player.events gives them), and the
 * latest of all (`latest`). An object's points before an act are its points after its previous event, when that event
 * is among them.
 */
export function latestOwnActs(events: readonly EventLike[]): Map<string, OwnAct> & { latest?: OwnAct } {
  const out: Map<string, OwnAct> & { latest?: OwnAct } = new Map();
  const points = new Map<string, number>(), own = new Map<string, number>(), others = new Map<string, number>();
  const step = (seen: Map<string, number>, id: string, now: unknown): number | undefined => {
    const was = seen.get(id);
    if (typeof now === "number") seen.set(id, now); else seen.delete(id);
    return was;
  };
  for (const e of events) {
    if (e.type !== "object.spawned" && e.type !== "object.rescored" && e.type !== "object.transformed") continue;
    if (!e.objectId) continue;
    const before = step(points, e.objectId, e.payoff);
    const ownBefore = step(own, e.objectId, e.own?.netBits), othersBefore = step(others, e.objectId, e.peerCare);
    if (e.type !== "object.transformed" || !e.mine || !e.agentId) continue;
    const act: OwnAct = {
      agentId: e.agentId, objectId: e.objectId, before: e.before as Value, after: e.value as Value, world: e.worldSeconds ?? 0,
      ...(before !== undefined ? { pointsBefore: before } : {}), ...(typeof e.payoff === "number" ? { pointsAfter: e.payoff } : {}),
      ...(typeof e.own?.netBits === "number" ? { ownAfter: e.own.netBits } : {}), ...(typeof e.peerCare === "number" ? { othersAfter: e.peerCare } : {}),
      ...(ownBefore !== undefined ? { ownBefore } : {}), ...(othersBefore !== undefined ? { othersBefore } : {}),
    };
    out.set(e.agentId, act);
    out.latest = act;
  }
  return out;
}

export interface AgentEarnings {
  /** Its moves among the events whose object's points just before the move are known. */
  moves: number;
  /** What those moves added to the points of the objects they changed (after the move minus just before it). */
  points: number;
  /** How many different objects they changed. */
  objects: number;
}
/**
 * What each of your agents' moves earned, from the same events the act lines read (player.events, no query of its
 * own): for every move of an agent whose object's points just before it are among the events, the points after minus
 * the points before. It is the move's own effect at that moment, not what the object earned later, and it covers only
 * the events held, which the line says.
 */
export function agentEarnings(events: readonly EventLike[]): Map<string, AgentEarnings> {
  const points = new Map<string, number>(), sums = new Map<string, { moves: number; points: number; objects: Set<string> }>();
  for (const e of events) {
    if (e.type !== "object.spawned" && e.type !== "object.rescored" && e.type !== "object.transformed") continue;
    if (!e.objectId) continue;
    const before = points.get(e.objectId);
    if (typeof e.payoff === "number") points.set(e.objectId, e.payoff); else points.delete(e.objectId);
    if (e.type !== "object.transformed" || !e.mine || !e.agentId || before === undefined || typeof e.payoff !== "number") continue;
    const sum = sums.get(e.agentId) ?? { moves: 0, points: 0, objects: new Set<string>() };
    sum.moves += 1; sum.points += e.payoff - before; sum.objects.add(e.objectId);
    sums.set(e.agentId, sum);
  }
  return new Map([...sums].map(([id, s]) => [id, { moves: s.moves, points: s.points, objects: s.objects.size }]));
}
/**
 * "12 of its latest moves, counted here: +648 points on 9 grids (+54 a move). Only the latest events are counted, not
 * the whole game." The number is the moves counted, never the moves made. `estimate`: the room blurs the others' side
 * while the game is live (score-lines.tsx liveIsEstimate), so the figures are "about" and the note says so.
 */
export function earningsLine(earned: AgentEarnings | undefined, noun = "object", { third = false, estimate = false }: { third?: boolean; estimate?: boolean } = {}): string | null {
  if (!earned || earned.moves < 1) return null;
  const count = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
  const about = estimate ? "about " : "";
  const head = `${earned.moves.toLocaleString("en-US")} of ${third ? "their agent's" : "its"} latest moves, counted here`;
  const each = earned.moves > 1 ? ` (${about}${signed(earned.points / earned.moves)} a move)` : "";
  return `${head}: ${about}${signed(earned.points)} points on ${count(earned.objects, noun)}${each}. Only the latest events are counted, not the whole game${estimate ? ", and live points are an estimate" : ""}.`;
}
