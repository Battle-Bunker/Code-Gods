# Analytic calibration: architecture

**Status.** Phase A (the family-side interface, the probability toolkit and the verification harness) is merged
(PR #51, `lib/game-utilities/src/analytic.ts`, `analytic-verify.ts`, `test/analytic.test.ts`), with six families
solved and verified on 48 shapes (PR #54). Phase B1 (the computed-table cache, the per-table compute action,
`resolveTables` and the `prepare` entry point, with measured first-use latency, §9) is merged; B2–D below are the
design the engine converges on; each names the code it touches. The mathematics lives in `tail-toolkit.md`
(rare-event tools, the trustworthiness of the sampling estimator) and `playbook.md` (the catalogue of solved
families, by the Opus session). This document stands alone: a future agent adding a rule, or wiring the engine, should
need nothing else to know *where* a probability comes from and *what to do when there is none yet*.

## 0. The owner's requirements, restated as constraints

1. **Every rule may carry its own probabilities.** A family optionally exports a function that computes, for any
   instantiation and canonical params it supports, the survival function the engine scores with. Exact, or an
   approximation with a stated error bound.
2. **The engine asks the family first.** When the family has no answer for a draw, the fallback is the existing
   Monte Carlo + adaptive-multilevel-splitting estimator, run **on demand for that draw only**, inside Convex node
   actions, fanned out, and **cached forever** per (family, canonical params, instantiation, code version).
3. **Transparent.** No deploy step, no precomputation, no "offered shapes": a room picks any shape; dealing computes
   what is missing; the UI shows a "preparing" state with progress; the cost is paid once per deployment per key.
4. **Zero cognitive load for a new rule.** A rule is its ordinal, sampler, canonical params and exemplar, plus the
   optional analytic. Everything else, including per-pair quantities (synergy), is computed and cached by the
   application.
5. **The offline tables become a warm cache**, never a prerequisite.
6. **Every analytic claim is verified against the empirical tables** before it ships (§6).

## 1. What a table is

Scoring turns a god's ordinal `u(x)` into bits: `s(x) = −log2 G(u(x))`, `G(t) = μ{u ≥ t}` under the type's uniform
spawn prior μ (`lib/game-utilities/src/calibration.ts`, `lib/game-core/src/scoring.ts`). A `CalibrationTable` holds
`levels: [ordinal, bits][]` strictly increasing in both, an extrapolation `slope` above the top, and for penalty
families `penaltyMeanBits = E_μ[softHinge(s)]`. Lookup interpolates linearly in ordinal distance between levels, so
listing *every attainable ordinal* with its exact bits makes a table exact.

A table is identified by `tableKey` = sha256 of (`family`, canonical `params`, `instance`, the sha256 of the family's
TypeScript card for those params, the instantiation's read-prelude hash, `spawn: "uniform"`, the estimator id and
version, the analytic id when the family has one, the prior when not uniform). **Freshness is the key**: a table whose
key is not the current code's is never served (`tableFor`), so nothing can be scored with a stale table, and a changed
card, prelude, estimator or formula invalidates exactly the tables it affects.

## 2. The family-side API (merged)

```ts
// lib/game-utilities/src/analytic.ts
export type AnalyticLevels = readonly (readonly [Ordinal, number])[];   // [t, log2 μ{u ≥ t}], t strictly increasing

export interface AnalyticSurvival {
  /** Formula id and version, "binomial-cells@1": part of the table key. Bump the version when the formula changes. */
  readonly id: string;
  /** Every attainable ordinal (a superset is fine) with log2 G ≤ 0, non-increasing; the first entry is 0. */
  readonly levels: AnalyticLevels;
  /** "exact": closed form, exact enumeration or exact dynamic programme. "approx": every level within maxErrorBits. */
  readonly kind: "exact" | "approx";
  readonly maxErrorBits?: number;
}
export const ANALYTIC_MAX_ERROR_BITS = 0.25;   // an approximation is used for scoring only within this bound

// lib/game-utilities/src/types.ts
export interface UtilityFamily<P> {
  // … id, support, sample, canonical, card, exemplar …
  /** null when there is no analytic answer for these params on this instantiation: the estimator then runs. */
  analytic?(params: P, ctx: FamilyContext): AnalyticSurvival | null;
}
```

Rules of the contract:

- **Deterministic and cheap to key.** The call itself must be instant: it is made whenever a key is computed
  (`coverage`, `tableKey`, every `tableFor`). A law that takes longer than a few milliseconds is returned through
  `lazySurvival(id, () => law)`: the key needs only the id, and the levels are computed once, when a table is built
  (up to about a second is fine there). `analyticFor` memoises per process by (instance, family, params) and checks the
  id, kind and bound; the estimator checks the levels (`assertAnalytic`) when it reads them.
- **Canonical params only.** The engine canonicalises a draw (`family.canonical`) before asking.
- **Partial coverage is fine.** Return null for shapes or params the formula does not cover (e.g. a transfer matrix
  whose state space is too large there); the fallback handles the rest. The key then carries no analytic id for that
  draw, so nothing goes stale.
- **The id is a promise.** Bumping `@n` regenerates every table built from the formula and nothing else; the archived
  Monte Carlo reference tables (`data/analytic-reference/<family>.json`, keyed by `mcTableKey`) stay valid as long as
  the card does, so a corrected formula is re-verified against the same evidence.
- **Approximations** are accepted only with `maxErrorBits ≤ ANALYTIC_MAX_ERROR_BITS` (0.25 bits, well below the
  sampling estimator's own error beyond 16 bits, §6). State the bound honestly; the harness measures it.
- **The toolkit** (`analytic.ts`, second half) is the vocabulary: `Dist` (finite law over scalar or lexicographic
  tuple ordinals), `combine`, `mapDist`, `iidSum`, `binomial`, `multinomial`, `lineChainCount`,
  `maxOfEqualMultinomial`, `rowTransferCount`, `poissonTail`, `survivalLevels` (refuses lost mass), `exactSurvival`,
  `lazySurvival`.
  Grid helpers: `gridSpec(ctx)` gives N, S, C, the per-symbol value list, and `valueLaw(g)` the law of a cell's value.

How the estimator consumes it (`scripts/estimator.ts buildTable`): analytic levels verbatim, no sampling, no thinning,
budget label `exact:<id>` or `approx:<id>`, `meta.topReached` from the exemplar as before. `buildTable(…, { exact:
false })` forces the sampling path and keys the result by `mcTableKey` (the current key minus the analytic id): that is
how reference tables are built.

## 3. The engine flow (Phase B, to build)

Today (`artifacts/engine/convex/owner.ts start`, `engine/node.ts deal`, `engine/calibration.ts tablesFor`): the
instantiation's file is loaded from Convex storage, the selector deals only draws with a fresh table (`hasTable`), and
settings are rejected unless *every* dealable draw of the shape has a table (`offeredInstantiations`). The new flow
removes the last two constraints.

### 3.1 Resolution order for one draw

`resolveTables(ctx, inst, draws, prior)` in `artifacts/engine/convex/engine/calibration.ts` (merged), for each draw:

1. **Process memory** (`InstanceTables` already loaded, plus a per-process map of analytic and computed tables).
2. **Analytic.** `analyticFor` non-null → build the table in process (`buildTable`, milliseconds). Analytic tables are
   never persisted: recomputing is cheaper than a storage read and they cannot go stale independently of the key.
3. **Warm cache.** The instantiation's shipped file (`calibrationFiles` rows + storage), as today.
4. **Computed cache.** A row of the `calibrationComputed` table (§3.3) with this key and `status: "ready"`: parse its
   JSON (and check its key).
5. **Compute.** `calibration.cache.claim` inserts `{ key, status: "computing" }` (a second starter is told to wait;
   a failed row is retried once; a computing row older than 15 minutes is a crashed action and is restarted),
   `calibration.compute.run` is scheduled for the key (§3.2), and the draw is reported pending.

### 3.2 Fan-out

- **Per draw** (always): one Node action per missing key, scheduled together (`ctx.scheduler.runAfter(0, …)`), each
  running `buildTable` with the type's default budget and writing its result row. A game deals 3–8 reward draws plus up
  to 8 defence draws; a first game on a fresh shape therefore runs ≤ 16 actions in parallel, each 13–30 s for a Grid
  (the offline pipeline's measured 13–30 µs per evaluation × ~1M evaluations), 1–3 s for Int and string. Node actions
  have 10 minutes and 512 MiB (docs/convex-migration-plan.md §4); a single table fits with a wide margin.
- **Within a draw** (optional, for latency): `replicates: K` climbs of `particles / K` particles each, in K actions with
  seeds `sha256(key, r)`, plus the Monte Carlo body split in K chunks of `nMc / K` spawns. The merge is the estimator's
  existing clean-up applied to the **union** of all replicate points with weights `1/se²` (weighted isotonic regression
  then `MIN_STEP_BITS`): each replicate point is an estimate of `log2 G` at its own adaptive level, and pooling them in
  the isotonic fit is the same operation the single climb already performs on its own stages. Nominal variance per
  level is unchanged (K replicates of variance ×K, averaged); latency drops ≈ K×. This is a different estimator and
  must say so: `ESTIMATOR = { id: "mc-ams", version: 4 }` with `budget.replicates` in the key, and its fidelity is
  measured with the harness against the K = 1 tables before it becomes the default (expected: within the K = 1 nominal
  se at every depth band, §6). Until measured, K = 1 and the per-draw fan-out alone keep first use inside the planning
  window (60 s default) for a 5×5 Grid.
- **Coordinator.** No long-running coordinator: every compute action ends by calling one mutation,
  `calibration.cache.finished(key, table | error, buildMs)`, which marks the row (merged). B2 adds: for every room
  waiting on that key (§3.4), check whether its pending set is empty and if so schedule the start's second half. Failure: the row gets
  `status: "failed", error, attempts`; the starter retries once, then the room's start fails with a message naming the
  draw. Nothing is left half-written: the table JSON is written in the same mutation that flips the status.

### 3.3 The computed cache

```ts
// artifacts/engine/convex/calibration/tables.ts (merged)
calibrationComputed: {
  key: string,            // tableKey (unique by construction: claim checks before inserting)
  instance: string, family: string, paramsKey: string, prior: string,   // for listing and pruning
  status: "computing" | "ready" | "failed",
  table?: string,         // CalibrationTable JSON (≈ 2.4 KB; analytic tables are never stored)
  startedAt: number, finishedAt?: number, attempts: number, error?: string, buildMs?: number, lastUsedAt: number,
}  // .index("by_key", ["key"]).index("by_instance", ["instance"]).index("by_status", ["status"])
```

A table is a document, not a storage blob: a Convex document holds 1 MiB, lookups by key are a single indexed read,
and the row doubles as the job record. The existing per-instance files in storage stay as the warm layer and are
re-exported from the cache on demand (`scripts/export-cache.ts`, §5). **Pruning** (B2): a nightly cron drops `ready`
rows not used for 90 days; stale `computing` rows are already restarted by `claim`.

### 3.4 Dealing and the "preparing" state

`owner.start` becomes two halves:

1. **Deal.** The selector no longer takes `hasTable`: every available family is dealable (`availableFamilies`). The deal
   is fixed first (so the preparing state cannot change what a god gets), then `resolveTable` runs for every reward and
   defence draw. If every table resolved synchronously (analytic, warm or cached: the common case after the first game
   on a shape), the start continues exactly as today.
2. **Prepare.** Otherwise the room records `preparing: { requestId, deals, pending: key[], total, startedAt }` and the
   start returns `{ status: "preparing" }`. Clients already subscribe to the room; the lobby shows "Preparing n of m
   rule tables for Grid(7,cards,rainbow6)… (first time on this server)" from `total − pending.length`. When the last
   key lands, `finished` schedules `game.lobby.completeStart(roomId, requestId)`, which loads the tables, spawns the
   starting objects and commits the game as today (`commitStart`). The planning clock starts then, not during
   preparation.

Scoring ticks (`engine/tick.ts`) and the agent's own-table action (`calibration/node.ts tables`) use the same
`resolveTable`; by construction every draw of a started game has a table, so they never wait.

### 3.5 What "offered" becomes

`offeredInstantiations(manifest, type)` currently hides every shape with a missing table. It becomes
`playableInstantiations(type)`: every non-retired instantiation (3×3 stays retired by `RETIRED_GRID_SIZES`), and
`coverage` becomes informational: `{ ready, analytic, toCompute }` counts shown as a badge on the settings page
("All 169 rule tables ready" / "140 ready, 29 prepared on first use"). `assertOffered` becomes `assertPlayable`
(valid type args only). `excludedFamilies` keeps its meaning (never dealt) and no longer affects what is offered.

## 4. Per-pair quantities: synergy on demand (Phase C)

The Aligned Lottery (`selectors.ts fairAligned`) scores 32 candidate deals by a family-pair matrix `W_ij` (depth-averaged
PMI of the two families' upper contour sets; `lib/grid-lab/docs/explore/synergy.md`), shipped for three shapes. The
atlas costs ~11,000 joint splitting climbs (3 CPU-hours) per shape: not an on-demand quantity. The requirement is that a
new rule, or a new shape, needs no thought about it. Design:

1. **Structural zeros are exact and free.** Under the product prior a colour-only family and a symbol-only family are
   independent, so `W_ij = 0` exactly (the atlas measured 0.0 ± 0.5 bits for these pairs). Families declare their
   layer through their tags/lenses (`colour`, `symbol`, `both`); the dealer uses 0 for cross-layer pairs without
   measuring.
2. **Warm cache, then on demand per pair.** `synergyPairs` rows keyed by `sha256(instance, prior, family_i, family_j,
   estimator)` hold the measured `W_ij` with its se. A room's dealer reads only the pairs its 32 candidate deals need;
   missing pairs count as 0 **for this deal** (the Divine Lottery's behaviour, which never breaks a game) and are
   queued for computation (one joint climb per pair on `φ = min(s_i, s_j)`, 3–5 s each at 300 particles, fanned out
   like tables). Later deals in the room, and every later room on that shape, see them.
3. **A cheaper on-demand substitute, measured before use.** A shared pool of 2^15 spawns per shape scores every available
   family once (~80 × 32k evaluations ≈ 60 s, one action per family); from it, `PMI_ij(b)` at a shallow depth
   b = 4–5 bits has ~30–60 joint hits (se ≈ 0.2 bits) for *all* pairs at once. Its fidelity as a proxy for the
   depth-averaged `W_ij` is a measurement to make against the three shipped atlases (rank correlation and the
   paired-game gain of synergy.md §5) before it is used; if it correlates well it is the default and the joint climbs
   become the refinement. Until then, 1 + 2.

A new rule therefore needs nothing: its layer tag gives the structural zeros, and every other pair is measured on
demand and cached.

## 5. The offline pipeline as a warm cache (Phase D)

`pnpm --filter @workspace/game-utilities calibrate` keeps working unchanged and remains the fastest way to warm a
deployment for the curated shapes; `scripts/upload-calibration.mjs` uploads the files at deploy as today. Two additions:

- `scripts/export-cache.ts`: pulls every `ready` row of a deployment's `calibrationTables` into instance files, so
  tables first computed on demand in one deployment can be committed and shipped to the next.
- The freshness test (`test/calibration.test.ts "every shipped table's key matches"`) and `coverage` keep checking
  whatever *is* shipped; shipping nothing for a shape is no longer an error.

The data-only branches `claude/calib*` (48 Grid shapes) are the first warm cache. Note: each analytic that lands
changes the key of its family's tables on every shape, and one `calibrate` run rebuilds them exactly in about a second
(it did so for `hate_colour` in PR #51).

## 6. Verification: how an analytic earns its place

Three independent checks, all in `lib/game-utilities/src/analytic-verify.ts` and run by `test/analytic.test.ts` for
every family with an `analytic`:

1. **Fresh spawns** (`compareWithSpawns`): 2000 spawns per shipped shape; every sampled ordinal must be a listed level
   and every level with mass ≥ 2^-9 must agree with the sample frequency within 5 sd. This catches a wrong formula at
   once, independently of any table.
2. **Exact enumeration** (`compareWithEnumeration`): Int domains of ≤ 2^20 values are enumerated and must match to
   1e-9 bits at every attainable ordinal. (Small grids can be enumerated the same way in a one-off script: a 3×3 grid
   with base10/rgb has 30^9 ≈ 2·10^13 values, so only rows/columns or 2×2 patches are enumerable; `rowTransferCount`
   is exact enumeration organised by rows.)
3. **The archived Monte Carlo tables** (`compareWithTable`): `scripts/analytic-reference.ts <family> --from <dir>`
   archives the sampling estimator's tables of the family (every shape available: today 48 Grid shapes from develop
   and the `claude/calib*` branches) into `data/analytic-reference/<family>.json`, keyed by `mcTableKey` so they stay
   valid exactly as long as the card does. The test compares level by level: Δ = table − analytic bits, z = Δ / se
   with the nominal se reconstructed from the budget (an MC level with survival G has var(bits) = (1−G)/(G·nMc)/ln²2;
   each splitting stage adds (1−p0)/(p0·particles)/ln²2, inflated ×1.6; floor 0.02 bits). It fails on any table level
   the analytic calls unattainable, on |Δ| > 1.2 bits below 16 bits, > 2.5 below 32, > 5 below 64, > 10 above, and on
   RMS z > 1.5 over the levels below 32 bits. `scripts/verify-analytic.ts` prints the per-shape and depth-band
   markdown that each formula's write-up records (`tail-toolkit.md`, `playbook.md`).

The thresholds come from measuring the estimator itself against 13 exactly solved families on all 48 shapes (about
36,000 levels; tail-toolkit.md §8): the sampling tables are unbiased to ~0.1 bits up to 64 bits, with RMS error 0.07
bits at 4–8 bits, 0.2 at 8–16, 0.4 at 16–32, 0.6 at 32–48, 0.8 at 48–64 and 1.2 above 64, and the nominal se is honest
(RMS z ≈ 0.7–1.1) up to 48 bits and ~1.4× optimistic above 64. A formula that disagrees with the tables inside these
bands is wrong; one that disagrees only above 48 bits on a tuple family whose first component is a rare rigid event
(e.g. Rainbow Road's whole lines, bias +1 bit at 48–64) is more likely right than the table, and the write-up must say
which and why (tail-toolkit.md §8.2 lists the known failure modes of the splitting kernel).

## 7. Adding a rule, end to end (the zero-cognitive-load check)

1. Write the family: ordinal (both cards), `support`, `canonical`, `exemplar`, summary. Run the parity tests.
2. If the survival function has a closed form or an exact dynamic programme (`playbook.md` §"recognise the shape";
   `tail-toolkit.md` for the tools), add `analytic`. Archive the reference first if Monte Carlo tables exist
   (`scripts/analytic-reference.ts <family> --from lib/game-utilities/data/calibration/v1`), then run
   `pnpm --filter @workspace/game-utilities test`. If no tables exist yet, build a few with
   `scripts/analytic-reference.ts <family> --instances "Grid(5,base10,rgby)"` (30 s each) so the formula is still
   checked against sampling, not only against spawns.
3. Nothing else. Tables for shapes nobody precomputed are prepared on first use; synergy pairs likewise. Optionally run
   `calibrate` to warm the curated shapes.

## 8. Migration plan and sizes

| Phase | Lands | Touches | Size |
|---|---|---|---|
| A (done) | family `analytic`, toolkit, harness, references, six solved families | `lib/game-utilities` only | PRs #51, #54 |
| B1 (done) | `calibrationComputed` schema, `resolveTables`, per-table compute action, `claim`/`finished`, `prepare`, latency test | `convex/calibration/{tables,cache,compute}.ts`, `engine/calibration.ts`, `test/game-ondemand.test.ts` | PR (this) |
| B2 | two-half `start`, room `preparing`, lobby UI progress, `playableInstantiations`, settings badge | `owner.ts`, `game/lobby.ts`, `engine/node.ts`, `lib/game-utilities calibration.ts`, `artifacts/code-gods` settings | medium |
| B3 | within-draw replicates (estimator v4) after measuring fidelity with the harness | `scripts/estimator.ts`, compute action | small |
| C | structural zeros, `synergyPairs` cache + per-pair climb action, shallow-PMI measurement | `selectors.ts`, `convex/calibration/synergy.ts` | medium |
| D | `export-cache.ts`; docs and README say "warm cache" | scripts | small |

Measured numbers to record as each phase lands: first-use latency per draw (Grid 4/5/6/7, Int, string), cold-start
overhead of a Node action in the dev deployment, cache hit latency, and the harness bands for estimator v4 against v3.

## 9. Measured (Phase B1, local Convex backend, this container)

`artifacts/engine/test/game-ondemand.test.ts` and an ad-hoc probe of `calibration.compute.prepare` on shapes with no
shipped tables, default budgets, polling every second:

| shape | sampled tables | per-table build | wall to all ready | notes |
|---|---|---|---|---|
| Grid(4,base10,rgby) | 3 (snap, odds_evens, hate_blob) | 1.9–3.0 s | 9.3 s | plus `hate_colour` analytic in 4 ms |
| Grid(5,base12,rgb) | 3 (snap, hate_blob, kingdom) | 5.5–6.7 s | 19.6 s | |
| Grid(7,base16,rgby) | 4 (snap, odds_evens, hate_blob, kingdom) | 19–36 s | 110.8 s | |

Warm resolution of four draws (file, analytic or cache): 2 ms.

**The local backend runs the scheduled Node actions one after another**: the recorded action start offsets on the 7×7
run were 0.0, 19.1, 40.3 and 75.9 s, each starting as the previous finished, so the wall time is the *sum* of the
builds, not their maximum. The Convex cloud runs scheduled actions concurrently; the same probe on the dev deployment
(`npx convex run calibration/compute:prepare '{"settings": …, "draws": …}'` with the deploy key) should give about the
largest single build plus scheduling, i.e. ≈ 3 s for a 4×4, ≈ 7 s for a 5×5 and ≈ 36 s for a 7×7 game's draws. That
measurement is the first thing to record when B2 lands; until it is, treat 7×7 first use as needing either the warm
cache (the 48 shipped shapes) or the within-draw split of §3.2.

What this says for the design: the per-draw fan-out is sufficient for 4×4 and 5×5 inside a 60 s planning window even
with local-style serialisation; 6×6 and 7×7 want either cloud concurrency or the replicate split (B3), and every shape
is instant the second time.
