# Analytic calibration: architecture

**Status.** Phase A (the family-side interface, the probability toolkit and the verification harness) is merged
(PR #51, `lib/game-utilities/src/analytic.ts`, `analytic-verify.ts`, `test/analytic.test.ts`), with six families
solved and verified on 48 shapes (PR #54). Phase B1 (the computed-table cache, the per-table compute action,
`resolveTables` and the `prepare` entry point, with measured first-use latency, §9) is merged, and so is Phase B2 (the
two-half start with the room's preparing state, retries and the coordinator, `playableInstantiations`, the UI, and the
cloud latencies of §9); B3–D below are the design the engine converges on; each names the code it touches. The mathematics lives in `tail-toolkit.md`
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

## 3. The engine flow (Phase B, built in B1 and B2)

Before B2 the selector dealt only draws with a fresh shipped table (`hasTable`) and settings were rejected unless
*every* dealable draw of the shape had one (`offeredInstantiations`). B2 removed both: `owner.ts startGame` deals from
every available family and resolves the deal's tables as below; `engine/node.ts assertShape` refuses only invalid or
retired shapes (and a non-uniform prior without shipped tables, which are never computed).

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
- **Coordinator** (built). No long-running coordinator: every compute action ends by calling one mutation,
  `calibration.cache.finished(key, table | error, buildMs)`, which marks the row and then, for every room waiting on
  that key (`calibrationWaits` rows, written by `game.lobby.beginPreparing`), removes the key from the room's
  `preparing.pending` and, when it was the last, schedules `owner.completeStart`. A failure that a room waits for is
  retried with backoff (`retryDelayMs`: 5 s, then 15 s) up to `MAX_ATTEMPTS = 3`; then the row is `failed` and every
  waiting room's `preparing.error` names the draw ("The rule table for snap {} on Grid(…) could not be prepared after 3
  attempts (…). Start again to retry, or choose another shape."). A failed key gets a fresh round of attempts after
  `FAILED_COOLDOWN_MS` (10 min). A computing row older than `STALE_COMPUTING_MS` (11 min: Node actions stop at 10) is a
  crashed action and is restarted by the next claim; `completeStart` runs as a watchdog every minute while a room
  prepares (its claims restart such keys) and reports a preparation older than 30 minutes. Nothing is left
  half-written: the table JSON is written in the same mutation that flips the status.

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
re-exported from the cache on demand (`scripts/export-cache.ts`, §5). **Pruning** (built in B2): a daily cron
(`calibration.cache.prune`, index `by_status_used`) drops `ready` and `failed` rows not used for 90 days; stale
`computing` rows are restarted by `claim`. A process keeps the computed tables it has read in memory for the hot paths
of a started game (scoring ticks, a player's own score); a start always reads the rows, which marks them used.

### 3.4 Dealing and the "preparing" state (built in B2)

`owner.start` becomes two halves:

1. **Deal.** The selector no longer takes `hasTable`: every available family is dealable (`availableFamilies`). The deal
   is fixed first (so the preparing state cannot change what a god gets), then `resolveTable` runs for every reward and
   defence draw. If every table resolved synchronously (analytic, warm or cached: the common case after the first game
   on a shape), the start continues exactly as today.
2. **Prepare.** Otherwise `game.lobby.beginPreparing` records on the room `preparing: { requestId, ownerId, revision,
   memberIds, deals, pending: key[], total, estimateSeconds, dealer, startedAt, error? }` (keys that landed or failed
   between the action's check and the mutation are settled there, so no landing is missed) and the start returns
   `{ status: "preparing", ready, total, estimateSeconds, dealtAs, message }`. Clients already subscribe to the room;
   `rooms.get` projects `preparing` as progress only (`lib/projection.ts preparingView`: never the deal), and the room
   page, the player client's overview and results panels and the assistant's briefing show "The game is preparing its
   rule tables, 12 of 18 ready…". When the last key lands, `finished` schedules `owner.completeStart(roomId,
   requestId)`, which resolves the tables, spawns the starting objects and commits the game (`commitStart` with
   `prepared`: no caller identity, the preparation must still be the room's, and the dealt gods must all still be
   members; anyone who joined meanwhile spectates). The planning clock starts then, not during preparation. Settings
   are frozen while a room prepares; `rooms.endActiveGame` with no game ends the preparation; a repeated start reports
   it (and, with the same requestId, the game once started).

Scoring ticks (`engine/tick.ts`) and the agent's own-table action (`calibration/node.ts tables`) use the same
`resolveTable`; by construction every draw of a started game has a table, so they never wait.

### 3.5 What "offered" becomes (built in B2)

`playableInstantiations(type)` (game-utilities) lists every combination of the type's parameter choices (component
options, integer presets), the default first, minus `RETIRED_GRID_SIZES` (3×3); `isPlayableInstantiation` accepts
any other valid arguments too (a custom Int range). The settings model's domain (`SettingsDomain.playable`,
`isPlayable`) is built from them on the engine and the configure page alike. `manifest.get` lists `playable` shapes
with `prepare: { toCompute, seconds } | null` (draws neither shipped nor analytic, and `firstUseSeconds`, the measured
cloud wall of §9) and `synergy`; the configure page enables every playable value and shows "The first game on this shape
on this server prepares up to 12 rule tables (about 4 min 20 s) before planning starts; later games start at once."
`offeredInstantiations` and `coverage` stay, for diagnostics (`manifest.get offered`). `assertOffered` became
`assertShape`. `excludedFamilies` keeps its meaning (never dealt) and no longer affects what is playable.

Synergy for the Aligned Lottery (Phase C not built): where no matrix exists the dealer deals exactly like the Divine
Lottery, as before; `engine/node.ts dealerOf` says so, and the configure page, the room's preparing state and the
start result show "No synergy has been measured for … : the Aligned Lottery deals like the Divine Lottery".

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
| B1 (done) | `calibrationComputed` schema, `resolveTables`, per-table compute action, `claim`/`finished`, `prepare`, latency test | `convex/calibration/{tables,cache,compute}.ts`, `engine/calibration.ts`, `test/calibration-ondemand.test.ts` | PR #56 |
| B2 (done) | two-half `start`, room `preparing`, coordinator with retries, lobby UI progress, `playableInstantiations`, first-use note, pruning cron, cloud latencies | `owner.ts`, `game/lobby.ts`, `calibration/cache.ts`, `engine/node.ts`, `lib/game-utilities calibration.ts`, `artifacts/code-gods`, `artifacts/player-web` panels, the briefing | this PR |
| B3 | within-draw replicates (estimator v4) after measuring fidelity with the harness | `scripts/estimator.ts`, compute action | small |
| C | structural zeros, `synergyPairs` cache + per-pair climb action, shallow-PMI measurement | `selectors.ts`, `convex/calibration/synergy.ts` | medium |
| D | `export-cache.ts`; docs and README say "warm cache" | scripts | small |

Measured numbers to record as each phase lands: first-use latency per draw (Grid 4/5/6/7, Int, string), cold-start
overhead of a Node action in the dev deployment, cache hit latency, and the harness bands for estimator v4 against v3.

## 9. Measured (Phase B1, local Convex backend, this container)

`artifacts/engine/test/calibration-ondemand.test.ts` (`pnpm --filter @workspace/engine test:calibration`) and an ad-hoc probe of `calibration.compute.prepare` on shapes with no
shipped tables, default budgets, polling every second:

| shape | sampled tables | per-table build | wall to all ready | notes |
|---|---|---|---|---|
| Grid(4,base10,rgby) | 3 (snap, odds_evens, hate_blob) | 1.9–3.0 s | 9.3 s | plus `hate_colour` analytic in 4 ms |
| Grid(5,base12,rgb) | 3 (snap, hate_blob, kingdom) | 5.5–6.7 s | 19.6 s | |
| Grid(7,base16,rgby) | 4 (snap, odds_evens, hate_blob, kingdom) | 19–36 s | 110.8 s | |

Warm resolution of four draws (file, analytic or cache): 2 ms.

**The local backend runs the scheduled Node actions one after another**: the recorded action start offsets on the 7×7
run were 0.0, 19.1, 40.3 and 75.9 s, each starting as the previous finished, so the wall time is the *sum* of the
builds, not their maximum.

## 9.1 Measured on the cloud (Phase B2, dev deployment)

`artifacts/engine/scripts/first-use-probe.ts` on the dev deployment (2026-11-01): for each shape it deals a 6-god game
(Divine Lottery, defence goals on for Grid), keeps the draws without an analytic answer and runs one
`calibration/compute:run` per table **concurrently** (default budgets, no computed cache: `run` writes nothing without a
claim row, so the probe is repeatable). "Call" is the client-side round trip, about 2–5 s above the build (CLI start,
action cold start).

| shape | draws (analytic) | sampled tables | per-table build | wall to all ready |
|---|---|---|---|---|
| Grid(4,base10,rgby) | 12 (5) | 6 | 10.7–28.6 s (sum 99 s) | 34.2 s |
| Grid(5,base12,rgb) | 12 (6) | 5 | 21.1–66.8 s (sum 165 s) | 70.1 s |
| Grid(6,base10,rgb) | 12 (7) | 4 | 43.9–125.7 s (sum 290 s) | 128.1 s |
| Grid(7,base16,rgby) | 12 (9) | 3 | 137.4–258.0 s (sum 537 s) | 260.4 s |
| Int(0,2147483647) | 6 (3) | 3 | 8.1–94.9 s (`many-faced` the slow one) | 98.9 s |
| string(16) | 6 (2) | 4 | 7.4–9.2 s | 11.7 s |

What this says:

- **The cloud runs the fan-out concurrently**: the wall is the slowest table plus a few seconds, never the sum (7×7:
  260 s wall for 537 s of builds).
- **A cloud Node action builds a table about 5× slower than this container's local backend** (4×4 tables: 11–29 s
  against 2–3 s; 7×7: 137–258 s against 19–36 s). The prediction of §9 (the largest local build) was therefore
  optimistic by that factor.
- With the planning clock starting only once the tables are ready, a first game waits ≈ 35 s on a 4×4, ≈ 70 s on a
  5×5, ≈ 2 min on a 6×6 and ≈ 4–5 min on a 7×7 shape; one slow family dominates (`straight_shooter` 67 s on 5×5,
  `swiss_cheese` 258 s on 7×7). That is acceptable as a one-off with the preparing state, and every Grid shape is
  shipped today (PR #57), so it only applies to new rules, a changed card, or a new type's shapes. **B3** (the
  within-draw replicate split of §3.2) is what brings 6×6 and 7×7 first use under a minute; the slowest table is the
  one to split. `FIRST_USE_SECONDS` (game-utilities calibration.ts) holds these walls for the UI's estimate.
