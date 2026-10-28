/**
 * Information scoring (docs/clean-implementation-plan.md §4.4, lib/grid-lab/docs/defence-goals.md,
 * reference implementation lib/grid-lab/gridlab/defence.py, "floored" mode).
 *
 * For god i on object x:
 *   s⁺_i(x)  reward bits: surprisal of the reward ordinal under the spawn prior μ (calibration table)
 *   h_i(x)   penalty bits: softHinge(surprisal of the defence goal's badness ordinal), defence goal only
 *   n_i(x)   = s⁺_i − w (h_i − E_μ h_i), or s⁺_i without a defence goal          (signed net bits)
 *   π_i(x)   = n_i · max(0, Σ_{j≠i} n_j)                                            (payoff)
 *
 * With no defence goal in the game n = s⁺ ≥ 0 and π_i is exactly s_i · Σ_{j≠i} s_j.
 *
 * Disclosure: the per-god map of net bits is server-private. A god may see only its own numbers and
 * aggregates over its peers (`personalView`); the public sees `salience` and the leaderboard.
 */

/** The median: half of all objects are at least this bad. */
export const HINGE_BITS = 1;
const H0 = Math.log2(1 + 2 ** -HINGE_BITS);

function assertFinite(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} must be a finite number`);
}

/** log2(2^a + 2^b), numerically stable (numpy.logaddexp2). */
function logAddExp2(a: number, b: number): number {
  const hi = Math.max(a, b);
  return hi + Math.log2(1 + 2 ** -Math.abs(a - b));
}

/**
 * Penalty bits from badness surprisal: a soft hinge at the median,
 *   h(s) = log2(1 + 2^(s − 1)) − log2(1 + 2^−1),
 * strictly increasing, h(0) = 0, h(1) ≈ 0.415 and h(s) ≈ s − 1.585 for bad objects.
 */
export function softHinge(bits: number): number {
  assertFinite(bits, "Penalty surprisal");
  return logAddExp2(0, bits - HINGE_BITS) - H0;
}

export interface NetBitsInput {
  /** ✨ s⁺: reward surprisal, ≥ 0. */
  readonly rewardBits: number;
  /** ⚠️ h = softHinge(badness surprisal), ≥ 0; present only with a defence goal. */
  readonly penaltyBits?: number;
  /** E_μ h for this god's defence goal (from its calibration table); required with penaltyBits. */
  readonly penaltyMeanBits?: number;
}

/** Signed net bits n = s⁺ − w (h − E_μ h), or s⁺ without a defence goal. */
export function netBits(input: NetBitsInput, weight: number): number {
  assertFinite(input.rewardBits, "rewardBits");
  if (input.rewardBits < 0) throw new Error("rewardBits must be nonnegative");
  assertFinite(weight, "penaltyWeight");
  if (weight < 0) throw new Error("penaltyWeight must be nonnegative");
  if (input.penaltyBits === undefined) {
    if (input.penaltyMeanBits !== undefined) throw new Error("penaltyMeanBits given without penaltyBits");
    return input.rewardBits;
  }
  assertFinite(input.penaltyBits, "penaltyBits");
  if (input.penaltyMeanBits === undefined) throw new Error("A defence goal needs penaltyMeanBits");
  assertFinite(input.penaltyMeanBits, "penaltyMeanBits");
  if (input.penaltyBits < 0 || input.penaltyMeanBits < 0) throw new Error("Penalty bits must be nonnegative");
  return input.rewardBits - weight * (input.penaltyBits - input.penaltyMeanBits);
}

/** Net bits of every god in the game on one object (server-private). */
export type NetByGod = ReadonlyMap<string, number>;

function sumNet(netById: NetByGod): number {
  let total = 0;
  for (const n of netById.values()) {
    assertFinite(n, "Net bits");
    total += n;
  }
  return total;
}

function ownNet(netById: NetByGod, godId: string): number {
  const own = netById.get(godId);
  if (own === undefined) throw new Error("God is not in this game's roster");
  return own;
}

export interface PersonalView {
  /** n_i: this god's own signed bits. */
  netBits: number;
  /** Σ_{j≠i} n_j: an aggregate over all peers, never an individual peer's number. */
  peerNetBits: number;
  /** max(0, Σ_{j≠i} n_j): how much the other gods, overall, care about this object. */
  peerCare: number;
  /** n_i · peerCare. */
  payoff: number;
}

/** What one god may be told about one object: its own numbers and peer aggregates only. */
export function personalView(netById: NetByGod, godId: string): PersonalView {
  const own = ownNet(netById, godId);
  let peerNetBits = 0;
  for (const [id, n] of netById) {
    assertFinite(n, "Net bits");
    if (id !== godId) peerNetBits += n;
  }
  const peerCare = Math.max(0, peerNetBits);
  // peerCare = 0 pays exactly 0 (not −0) whatever the sign of the god's own bits.
  return { netBits: own, peerNetBits, peerCare, payoff: peerCare === 0 ? 0 : own * peerCare };
}

/** π_i = n_i · max(0, Σ_{j≠i} n_j). */
export function payoff(netById: NetByGod, godId: string): number {
  return personalView(netById, godId).payoff;
}

/** Public: Σ_i n_i, how notable an object is to the gods collectively. */
export function salience(netById: NetByGod): number {
  return sumNet(netById);
}

export interface LeaderboardRow {
  godId: string;
  /** Σ over live objects of this god's payoff. */
  totalPayoff: number;
  /** 1-based; equal totals share a rank. */
  rank: number;
}

export function leaderboard(roster: readonly string[], objects: readonly NetByGod[]): LeaderboardRow[] {
  if (new Set(roster).size !== roster.length) throw new Error("Duplicate god in roster");
  const rows = roster.map(godId => ({
    godId,
    totalPayoff: objects.reduce((sum, netById) => sum + payoff(netById, godId), 0),
    rank: 0,
  })).sort((a, b) => b.totalPayoff - a.totalPayoff || a.godId.localeCompare(b.godId));
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i > 0 && rows[i].totalPayoff === rows[i - 1].totalPayoff ? rows[i - 1].rank : i + 1;
  }
  return rows;
}
