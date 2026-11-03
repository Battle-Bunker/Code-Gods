/**
 * Splits a long loop of a test across processes (CI runs one job per shard; CLAUDE.md-style full runs set nothing and
 * run everything). CG_SHARD="k/n" (1-based) runs the items whose position i has i % n === k - 1; unset runs them all.
 * The shards partition the positions, so running k = 1..n covers every item exactly once.
 */
const spec = process.env.CG_SHARD;
const [k, n] = spec ? spec.split("/").map(Number) : [1, 1];
if (spec && !(Number.isInteger(k) && Number.isInteger(n) && n >= 1 && k >= 1 && k <= n)) throw new Error(`CG_SHARD must be "k/n" with 1 ≤ k ≤ n, got "${spec}"`);

/** How many shards the run is split into (1 = everything in one process). */
export const shardCount = n;
/** True when the item at `position` belongs to this process's shard. */
export const inShard = (position: number): boolean => position % n === k - 1;
/** The items of this shard, in order. */
export const shardOf = <T>(items: readonly T[]): T[] => items.filter((_, i) => inShard(i));
