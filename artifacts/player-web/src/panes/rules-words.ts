/**
 * How to play, in about 90 seconds of reading (integration plan §1.6 "Rules pane"; the v1 primer rewritten for lines).
 * Pure, from this game's settings (the header) and its preset: player words only (ux-lessons 2.1): points, rarity in bits,
 * energy, power, "line"; never "object", "grid" or "payoff".
 */
import { energyText, powerText } from "../core/words.ts";

export interface RulesInput {
  title: string;
  minPlayers: number;
  planningSeconds: number;
  worldSeconds: number;
  startingEnergy: number;
  powerPerSecond: number;
  /** An account holds at most its power times this many seconds. */
  fullChargeSeconds: number;
  bid?: { seconds: number } | null;
  /** "halfLife": the world ends at a hidden random moment, `worldSeconds` its half-life (absent: fixed). */
  durationMode?: "fixed" | "halfLife";
  /** World seconds between counted totals (absent: 10). */
  scoreIntervalSeconds?: number;
  /** The noise on the others' sums while live, in bits (absent: 8; 0: exact). */
  peerNoiseBits?: number;
  /** Every game pays to look (owner decision 35): the read price's weight (0: looking is free). */
  readPriceWeight?: number;
}

/** "45 seconds", "1 minute", "5 minutes", "2 minutes 30 seconds". */
export function duration(s: number): string {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60), sec = t % 60;
  const mins = m ? `${m} minute${m === 1 ? "" : "s"}` : "";
  const secs = sec || !m ? `${sec} second${sec === 1 ? "" : "s"}` : "";
  return [mins, secs].filter(Boolean).join(" ");
}

/** The explanation, one string per paragraph. */
export function rulesParagraphs(r: RulesInput): string[] {
  return [
    "Code Gods is a game about a shared world and secret wishes.",
    "The world is a crowd of straight lines. Every player has a secret goal card: a short rule that gives every line a score. "
      + "The better a line scores by your rule, the rarer that is among random lines, counted in bits: each bit = twice as rare.",
    "You never move a line yourself. You summon agents: small programs that make moves on lines, like tilting or shifting one. "
      + `Summoning an agent and every move it makes cost energy. You start with ${energyText(r.startingEnergy)}. `
      + `Your power is the energy you earn each second: ${powerText(r.powerPerSecond)}, shared out among your agents. `
      + `Each store of energy, yours and each agent's, is full after ${duration(r.fullChargeSeconds)} of its power and then stops growing: use it or share it out.`,
    "Here is the twist. You score on a line when it's rare for you and rare for someone else at the same time: your bits for it × the others' bits "
      + "for it, added up. So a line only you want gives you 0 points, and a line you all care about gives the most. "
      + "You never see anyone else's rule, only that total. So talk: say what you want in the public chat, find overlaps, strike deals.",
    (r.bid
      ? `First comes ${duration(r.bid.seconds)} of bidding: you may give up a share of your final points to get the kind of rule you want. Then ${duration(r.planningSeconds)} of planning`
      : `Each game starts with ${duration(r.planningSeconds)} of planning`)
      + ", when you write and summon your first agent and nothing moves yet. "
      + (r.durationMode === "halfLife"
        ? `Then the world runs, and it ends at a hidden random moment: half of games end within ${duration(r.worldSeconds)} of the world starting, and the clock never counts down to it. Your final points`
        : `Then the world runs for ${duration(r.worldSeconds)} and the game ends. Your final points`)
      + " are the points of every line alive then, added up: "
      + "the same figure as your points during the game, which rise and fall as the lines change.",
  ];
}

/** This game's settings as a short table: [label, value]. */
export function rulesFacts(r: RulesInput): [string, string][] {
  return [
    ["Game", r.title],
    ["Players", `${r.minPlayers} or more`],
    ...(r.bid ? [["Bidding", duration(r.bid.seconds)] as [string, string]] : []),
    ["Planning", duration(r.planningSeconds)],
    ["The world runs", r.durationMode === "halfLife" ? `a hidden random time (half-life ${duration(r.worldSeconds)})` : duration(r.worldSeconds)],
    ["Starting energy", energyText(r.startingEnergy)],
    ["Power", powerText(r.powerPerSecond)],
    ["Energy fills in", duration(r.fullChargeSeconds)],
    ["Totals counted", `every ${duration(r.scoreIntervalSeconds ?? 10)}`],
    ...(r.readPriceWeight === undefined ? [] : [["Looking", r.readPriceWeight === 0 ? "free: you see everything as it is" : `costs energy (${r.readPriceWeight}× the read price); you see each one as you last looked`] as [string, string]]),
    ["Others' bits", (r.peerNoiseBits ?? 8) === 0 ? "exact" : `blurred while live (about ${r.peerNoiseBits ?? 8} bits); totals exact`],
  ];
}
