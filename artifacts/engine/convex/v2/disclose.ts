/**
 * Disclosure noise on the others' sums: measurement error (owner decision 32, 15 Nov). While a game is live, every
 * reading of the other players' summed bits of an object is the exact sum plus an independent Gaussian draw of variance
 * `peerNoiseVariance` bits² (0 allowed; 0 on the beginner presets), and every number built on it follows the reading:
 * points shown are own × max(0, others shown), v1's floor.
 *
 * The owner: "add noise independently for every query of an object such that it's never shared across players and
 * never accumulates through decisions." It replaces v1's keyed per-state draw (one draw for everyone, so agents climbing
 * on it walked into its peaks and every shown figure read high: playtest round 10) and the coordinator's per-player
 * key (B1).
 * - An agent's read, an agent's telling and a paid look are each a fresh draw (`freshNoise`): asking again measures again.
 * - A player's reactive reads (the object, its sorts, the scatter, the log, a quote) are their own measurement of that
 *   object at that version (`readingNoise`): a Convex query must be deterministic, so one reading per player per object
 *   version (a new version is a new reading). Never shared: another player reads an independent draw. Stored on the
 *   player's own value row (`shownWant`, `shownPoints`) so the sorts can index it.
 * - The exact standings are published every scoreIntervalSeconds (call 15, now the rule); after the end everything is
 *   exact and replays are exact.
 * Pure: any runtime (queries, mutations, the Node tick).
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** The variance, in bits², of a game that does not set one: exact. */
export const DEFAULT_PEER_NOISE_VARIANCE = 0;

/** A fresh per-game key (PRIVATE: `v2Games.noiseKey`, never returned by any query while live). */
export function newNoiseKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** What the noise depends on: the game's key and variance, and whether the game is still live. */
export interface NoiseGame { noiseKey?: string; phase: string; settings: { peerNoiseVariance?: number } }

/** The variance a game's live readings carry, bits² (0 without a key: games stored before the noise read exact). */
export const peerNoiseVarianceOf = (game: Pick<NoiseGame, "noiseKey" | "settings">) =>
  game.noiseKey ? Math.max(0, game.settings.peerNoiseVariance ?? DEFAULT_PEER_NOISE_VARIANCE) : 0;
/** Its standard deviation, bits (what "about ± σ" shows). */
export const peerNoiseSigmaOf = (game: Pick<NoiseGame, "noiseKey" | "settings">) => Math.sqrt(peerNoiseVarianceOf(game));

const encoder = new TextEncoder();
const uniform48 = (b: Uint8Array, at: number) => {
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + b[at + i]!;
  return (n + 0.5) / 2 ** 48;
};
/** A standard normal from 12 random bytes (two 48-bit uniforms in (0, 1), Box–Muller). */
const normal = (b: Uint8Array) => Math.sqrt(-2 * Math.log(uniform48(b, 0))) * Math.cos(2 * Math.PI * uniform48(b, 6));

/** A fresh independent draw, bits: an agent's read, an agent's telling, a paid look. */
export function freshNoise(game: Pick<NoiseGame, "noiseKey" | "settings">): number {
  const sigma = peerNoiseSigmaOf(game);
  if (!(sigma > 0)) return 0;
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return sigma * normal(b);
}

/**
 * A player's reading of an object at a version (or of a quoted state: `what` names it), bits: deterministic so a query
 * stays deterministic, independent across players, objects, versions and quotes (HMAC under the game's private key).
 */
export function readingNoise(game: Pick<NoiseGame, "noiseKey" | "settings">, memberId: string, what: string): number {
  const sigma = peerNoiseSigmaOf(game);
  if (!(sigma > 0) || !game.noiseKey) return 0;
  return sigma * normal(hmac(sha256, encoder.encode(game.noiseKey), encoder.encode(`${memberId}|${what}`)));
}
/**
 * An act's reads (the tick, and replay from the record): each read of an others' sum an agent makes is a new
 * measurement, keyed on its owner, the act's seed and the read's count within the act, so the tick stays deterministic
 * given its inputs and asking again measures again. `value` is the act's reading of its own value now.
 */
export function actReadings(game: Pick<NoiseGame, "noiseKey" | "settings">, memberId: string, seed: string) {
  let k = 0;
  return {
    disclosed: (encoded: string) => readingNoise(game, memberId, `act:${seed}:${k++}:${encoded}`),
    value: (v: { mine: number; others: number }) => {
      const m = shownAt({ rarityBits: v.mine, want: v.others }, readingNoise(game, memberId, `act:${seed}:value`));
      return { mine: v.mine, others: m.shownWant, points: m.shownPoints };
    },
  };
}
/** What a player's reading of an object at a version is keyed on. */
export const objectReading = (objectId: string, version: number) => `object:${objectId}:${version}`;

/** The others' sum and the points as read with this noise (points floored at 0, as v1's payoff). */
export function shownAt(v: { rarityBits: number; want: number }, noise: number): { shownWant: number; shownPoints: number } {
  const shownWant = v.want + noise;
  return { shownWant, shownPoints: v.rarityBits * Math.max(0, shownWant) };
}

/** A fresh measurement of an exact value (an agent's telling, a paid look), as a telling carries it. */
export function measured(game: Pick<NoiseGame, "noiseKey" | "settings">, v: { rarityBits: number; want: number }): { want: number; points: number } {
  const m = shownAt(v, freshNoise(game));
  return { want: m.shownWant, points: m.shownPoints };
}

/**
 * What an agent saw of an object, as its owner is told it (decision 36): the others' sum as the agent read it, and the
 * points from it and the owner's rarity now (the value row's), never the points the agent's input carried, which were
 * worked out with the rarity it had then (rounds 21 to 23: a card said 129.94 points beside "14.75 × 8.59 ≈ 126.64").
 */
export function agentSeen(row: { rarityBits: number }, seen: { others: number; mine?: number; points?: number }): { want: number; points: number } {
  return { want: seen.others, points: row.rarityBits * Math.max(0, seen.others) };
}

/**
 * Live anonymity (v1's public log, docs/public-log-design.md §1): while a game is live, nothing a player reads about
 * another player's transformation says who made it: no mover, agent, calls or cost. A player's own moves keep them, and
 * an ended game is fully transparent.
 */
export const attributed = (game: Pick<NoiseGame, "phase">, mine: boolean) => mine || game.phase === "ended";

/** Whether reads disclose the noisy values (the game is not over). */
export const disclosesNoise = (game: Pick<NoiseGame, "phase">) => game.phase !== "ended";

/** A stored value as a read discloses it: the shown fields while live (exact for rows written before them), exact after. */
export function disclosed<V extends { want: number; points: number; shownWant?: number; shownPoints?: number }>(game: Pick<NoiseGame, "phase">, v: V): { want: number; points: number } {
  return disclosesNoise(game) ? { want: v.shownWant ?? v.want, points: v.shownPoints ?? v.points } : { want: v.want, points: v.points };
}

/**
 * The objects pane's filters (v1's quadrants, lib/views quadrantOf): contested when the player's own bits and the
 * others' sum as disclosed to them are both positive (exactly the objects whose shown points are positive: v1's
 * "positive" and "contested" were the same set), chips when the others care and the player's own bits are 0, else other.
 */
export type Quadrant = "contested" | "chips" | "other";
export const quadrantOf = (own: number, others: number): Quadrant => (others > 0 ? (own > 0 ? "contested" : "chips") : "other");
