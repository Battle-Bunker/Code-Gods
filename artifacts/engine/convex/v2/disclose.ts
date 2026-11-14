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

/** The others' sum and the points as a player is shown them at a state's noise. */
export function shownAt(v: { rarityBits: number; want: number }, noise: number): { shownWant: number; shownPoints: number } {
  const shownWant = v.want + noise;
  return { shownWant, shownPoints: v.rarityBits * Math.max(0, shownWant) };
}

/** The σ a game's live reads carry (0 when it has no key: exact). */
export const peerNoiseBitsOf = (game: Pick<NoiseGame, "noiseKey" | "settings">) => (game.noiseKey ? sigmaOf(game) : 0);

/** Whether reads disclose the noisy values (the game is not over). */
export const disclosesNoise = (game: Pick<NoiseGame, "phase">) => game.phase !== "ended";

/** A stored value as a read discloses it: the shown fields while live (exact for rows written before them), exact after. */
export function disclosed<V extends { want: number; points: number; shownWant?: number; shownPoints?: number }>(game: Pick<NoiseGame, "phase">, v: V): { want: number; points: number } {
  return disclosesNoise(game) ? { want: v.shownWant ?? v.want, points: v.shownPoints ?? v.points } : { want: v.want, points: v.points };
}
