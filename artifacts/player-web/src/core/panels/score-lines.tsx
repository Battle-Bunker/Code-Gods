/**
 * The score a player can read, drawn from subscriptions the dock already holds (no query of its own):
 *   <PointsNow>          "Your points now: X, counted N s ago": your own total as last counted (the number the leaderboard ranks);
 *   useOwnActLines()     one plain sentence per agent for its latest act (score-line.ts): what it changed, what that did to
 *                        your rule score on that object (your goal program on the two values) and to the object's points
 *                        (the recent events, player.events, the feed's own subscription).
 */
import { useCallback, useMemo } from "react";
import { useDockActions } from "@/dock/actions";
import { runner, useRunner } from "@/core/game/runner";
import { boundaryOf } from "./first-agent";
import { useGoalExplainer } from "@workspace/object-views";
import { SCORE_LINES, scoreMovesLine, Term } from "@workspace/ui-kit";
import { useDockState, useEvents, useGameId, useMyAgents, useMyTotals, useObjectContext } from "@/sdk";
import { useStandings } from "@/sdk/hooks";
import { agentLabel } from "./agent-name";
import { pointsBeforeAgent, actLine, agentEarnings, asOfText, earningsLine, fresherPoints, latestOwnActs, pointsNowText, type AgentEarnings, type OwnAct } from "./score-line";

/**
 * "Your points now": one figure, the same number wherever it is shown, with how old it is. It is your total as the
 * engine last counted it (the fresher of player.totals and your row of the published scoreboard, score-line.ts
 * fresherPoints; dock.state's `self.score` until one loads), never promised to be live.
 */
export function PointsNow({ className = "" }: { className?: string }) {
  const dock = useDockState({ hz: 1 });
  const gameId = useGameId();
  const totals = useMyTotals(gameId);
  // The fresher of the two counts the page holds: your own totals, and your row of the published scoreboard (the
  // leaderboard's own subscription), so this never trails the leaderboard beside it.
  const standings = useStandings(gameId);
  const published = standings?.rows.find(r => r.godId === dock?.self.godId);
  const count = fresherPoints([totals && { score: totals.score, world: totals.world }, published && { score: published.totalPayoff, world: standings?.world }, { score: dock?.self.score }]);
  const score = count?.score;
  const age = dock?.phase === "ended" ? null : asOfText(dock?.economy?.worldSeconds, count?.world);
  const { noun } = useObjectContext();
  // Before the player has an agent: one short clause, on a phone too ("why do I already have points?").
  const { agents, loading } = useMyAgents({ hz: 1 });
  const noAgent = !loading && agents.length === 0 && dock?.phase !== "ended";
  return typeof score === "number" ? <PointsNowView score={score} age={age} noun={noun} noAgent={noAgent} className={className} /> : null;
}

/**
 * The figure without its data hooks (the gallery draws it from fixtures). Two lines at most on a wide screen: the figure
 * with its age, then why it moves while you do nothing (SCORE_LINES.moves: two first-time players asked "why do I
 * already have points?"). On a phone the second line is left to the "points" help (its gloss says the same), so the
 * goal card stays on the first screen.
 */
export function PointsNowView({ score, age, noun = "object", noAgent = false, className = "" }: { score: number; age?: string | null; noun?: string; /** The player has no agent yet: the short clause shows on every screen. */ noAgent?: boolean; className?: string }) {
  const why = scoreMovesLine(noun);
  return (
    <div className={className} title={`${why} ${SCORE_LINES.total}`} data-testid="text-points-now">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold">Your <Term id="payoff">points</Term> now:</span>
        <span className={`font-mono text-2xl font-semibold leading-none tabular-nums ${score < 0 ? "text-destructive" : ""}`} data-testid="value-points-now">{pointsNowText(score)}</span>
        <span className="text-xs text-muted-foreground">{age ?? ""}{age ? "; " : ""}what the leaderboard ranks</span>
      </p>
      {noAgent
        ? <p className="text-xs leading-snug text-muted-foreground" data-testid="text-points-before-agent">{pointsBeforeAgent(noun)}</p>
        : <p className="hidden text-xs leading-snug text-muted-foreground sm:block" data-testid="text-points-why">{why}</p>}
    </div>
  );
}

export interface OwnActLines {
  /** Agent id → the sentence for its latest act among the recent events. */
  byAgent: ReadonlyMap<string, string>;
  /** The sentence for the latest act of any of your agents. */
  latest?: string;
  /** The object each sentence is about (agent id → object id; `latestObject` for `latest`), so the line can open that grid's detail. */
  objects: ReadonlyMap<string, string>;
  latestObject?: string;
  /** Agent id → what its moves among the recent events earned, with the window said (score-line.ts earningsLine). */
  earned: ReadonlyMap<string, string>;
  /** Agent id → the counted moves behind that line (empty where the line is hidden). */
  sums: ReadonlyMap<string, AgentEarnings>;
}

/**
 * The latest act of each of `agents` as a sentence. Empty before any of them has changed an object. `third`: the panel is
 * seen as another player (a replay), so the sentences say "Their agent … their rule score".
 */
export function useOwnActLines(agents: readonly { id: string; name?: string }[], { third = false }: { third?: boolean } = {}): OwnActLines {
  const events = useEvents({ hz: 1, limit: 50 });
  const goal = useGoalExplainer();
  const { noun } = useObjectContext();
  const previous = useRunner().previous;
  return useMemo(() => {
    const acts = latestOwnActs(events);
    const say = (act: OwnAct): string => {
      const index = agents.findIndex(a => a.id === act.agentId);
      const score = (value: OwnAct["before"]) => { try { return goal?.score(value) ?? null; } catch { return null; } };
      const rarity = (value: OwnAct["before"]) => { const s = score(value); try { return s === null ? null : goal?.rarity(s) ?? null; } catch { return null; } };
      return actLine({
        // An act by an agent no longer in the list is never told as a live agent's.
        agent: index < 0 ? "(now destroyed)" : agentLabel(agents[index]?.name, index), before: act.before, after: act.after, noun,
        ruleBefore: score(act.before), ruleAfter: score(act.after), rarityBefore: rarity(act.before), rarityAfter: rarity(act.after), pointsBefore: act.pointsBefore, pointsAfter: act.pointsAfter,
        ownAfter: act.ownAfter, othersAfter: act.othersAfter, ownBefore: act.ownBefore, othersBefore: act.othersBefore, third,
      });
    };
    const byAgent = new Map<string, string>();
    for (const [id, act] of acts) byAgent.set(id, say(act));
    const earned = new Map<string, string>();
    // A replace keeps the agent's id: its figure is its current program's, from its latest replace on.
    const sums = agentEarnings(events, boundaryOf(previous));
    for (const [id, sum] of sums) { const line = earningsLine(sum, noun, { third }); if (line) earned.set(id, line); }
    const objects = new Map<string, string>();
    for (const [id, act] of acts) objects.set(id, act.objectId);
    return { byAgent, latest: acts.latest ? say(acts.latest) : undefined, objects, latestObject: acts.latest?.objectId, earned, sums };
  }, [events, goal, noun, agents, third, previous]);
}

/** The latest act of any of your agents, under "Your points now". */
export function LatestActLine({ line, objectId }: { line?: string; /** The grid the sentence is about: the line opens its detail in Objects. */ objectId?: string }) {
  const open = useOpenObject();
  if (!line) return null;
  return (
    <p className="text-sm leading-snug" aria-live="polite" data-testid="text-latest-act">{line}
      {objectId && <>{" "}<button type="button" data-testid="button-latest-act-object" onClick={() => open(objectId, line)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">show this grid</button></>}
    </p>
  );
}
/**
 * Open one object's detail ("why") in the Objects panel: the panel comes to the front and shows it (an act line names
 * a cell, "row 4, column 2", but not which grid in the list).
 */
export function useOpenObject(): (objectId: string, /** The sentence the press came from: the box it opens carries it, since the latest-act line moves on every second. */ from?: string) => void {
  const dock = useDockActions();
  return useCallback((objectId: string, from?: string) => { dock.show("objects"); setTimeout(() => runner.showObject(objectId, from), 50); }, [dock]);
}
