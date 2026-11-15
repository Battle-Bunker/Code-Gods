/**
 * Disclosure noise on the others' sums (v1's rule, restored; docs/public-log-design.md §5.2 on archive/engine-v1).
 * While a game is live, every disclosed sum of the other players' bits is the exact sum plus Gaussian noise of standard
 * deviation `peerNoiseBits` (default 8), and every number built on it follows the noisy value: points shown are
 * own × max(0, others shown). The owner's reason: exact sums made the rule set easy to identify; 8 bits makes it
 * possible but hard.
 *
 * - The noise is a keyed function of the STATE alone (HMAC-SHA256 under the game's private `noiseKey`): a state that
 *   recurs shows the same noise, so repeated reads and observations cannot average it away, and every viewer gets the
 *   same draw (own + others shown is the same salience for everyone).
 * - Stored exact; disclosed fields are written beside the exact ones (`shownWant`, `shownPoints`), so a sort, a total
 *   or a history built on them leaks nothing the noisy value does not.
 * - After the end everything is exact (an ended game is fully transparent), and replays are exact.
 * Pure: any runtime (queries, mutations, the Node tick).
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** The default noise, in bits (v1's `peerNoiseBits` default, owner-approved 2026-11-01). */
export const DEFAULT_PEER_NOISE_BITS = 8;

/** A fresh per-game key (PRIVATE: `v2Games.noiseKey`, never returned by any query while live). */
export function newNoiseKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** What the noise depends on: the game's key and σ, and whether the game is still live. */
export interface NoiseGame { noiseKey?: string; phase: string; settings: { peerNoiseBits?: number } }

const sigmaOf = (game: Pick<NoiseGame, "settings">) => game.settings.peerNoiseBits ?? DEFAULT_PEER_NOISE_BITS;
const encoder = new TextEncoder();
const uniform48 = (b: Uint8Array, at: number) => {
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + b[at + i]!;
  return (n + 0.5) / 2 ** 48;
};

/** The noise at a state (its wire encoding), in bits: 0 without a key or with σ = 0. */
export function noiseAt(game: Pick<NoiseGame, "noiseKey" | "settings">, state: string): number {
  const sigma = sigmaOf(game);
  if (!(sigma > 0) || !game.noiseKey) return 0;
  const d = hmac(sha256, encoder.encode(game.noiseKey), encoder.encode(state));
  // Two 48-bit uniforms in (0, 1), Box–Muller.
  return sigma * Math.sqrt(-2 * Math.log(uniform48(d, 0))) * Math.cos(2 * Math.PI * uniform48(d, 6));
}

/**
 * The noise a player's AGENTS see at a state (the coordinator's call B1, after playtest round 10): a draw of its own per
 * player, keyed apart from the shown one. Agents climb by comparing candidates' noisy sums, so on the shown draw they
 * walk into its peaks, and every figure shown on the states they choose reads high (measured +12.8 bits at σ 8), and
 * with one draw shared by all, every player's agents chase the same peaks. On a draw of its own a player's selection
 * says nothing of the shown draw, which stays centred where agents go. Deterministic per (game, player, state), so
 * repeats cannot average it away.
 */
export function agentNoiseAt(game: Pick<NoiseGame, "noiseKey" | "settings">, memberId: string, state: string): number {
  return game.noiseKey ? noiseAt({ noiseKey: `${game.noiseKey}:agents:${memberId}`, settings: game.settings }, state) : 0;
}

/** The others' sum and the points as a player is shown them at a state's noise (points floored at 0, as v1's payoff). */
export function shownAt(v: { rarityBits: number; want: number }, noise: number): { shownWant: number; shownPoints: number } {
  const shownWant = v.want + noise;
  return { shownWant, shownPoints: v.rarityBits * Math.max(0, shownWant) };
}

/** The σ a game's live reads carry (0 when it has no key: exact). */
export const peerNoiseBitsOf = (game: Pick<NoiseGame, "noiseKey" | "settings">) => (game.noiseKey ? sigmaOf(game) : 0);

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
