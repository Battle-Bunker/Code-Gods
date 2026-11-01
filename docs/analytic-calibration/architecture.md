# Analytic calibration: architecture

**Status.** Phase A (the family-side interface, the probability toolkit and the verification harness) is merged
(PR #51, `lib/game-utilities/src/analytic.ts`, `analytic-verify.ts`, `test/analytic.test.ts`), with six families
solved and verified on 48 shapes (PR #54). Phase B1 (the computed-table cache, the per-table compute action,
`resolveTables` and the `prepare` entry point, with measured first-use latency, §9) is merged, and so is Phase B2 (the
two-half start with the room's preparing state, retries and the coordinator, `playableInstantiations`, the UI, and the
cloud latencies of §9), and so is Phase B3 (each slow table split across replicate actions with an unbiased merge, the
per-owner rate limit, progress by pieces: §3.2, §9.2); C–D below are the design the engine converges on; each names the
code it touches. The mathematics lives in `tail-toolkit.md`
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
5. **Compute.** Every missing key is planned (§3.2: its cost measured where it runs, split into replicate pieces when it
   is slow) and claimed in one mutation, `calibration.cache.claimMany`, which inserts `{ key, status: "computing",
   pieces }` (a second starter is told to wait; a failed row is retried; a computing row older than 11 minutes is a
   crashed action and is restarted, a split key keeping its ready pieces), applies the owner's rate limit (§3.2) and
   schedules the work in the same transaction (`compute.run` for a one-piece table, `compute.piece` per piece,
   costliest first); the draw is reported pending.

### 3.2 Fan-out

- **Per draw** (always): one Node action per missing key, scheduled together (`ctx.scheduler.runAfter(0, …)`), each
  running `buildTable` with the type's default budget and writing its result row. A game deals 3–8 reward draws plus up
  to 8 defence draws; a first game on a fresh shape therefore runs ≤ 16 actions in parallel, each 13–30 s for a Grid
  (the offline pipeline's measured 13–30 µs per evaluation × ~1M evaluations), 1–3 s for Int and string. Node actions
  have 10 minutes and 512 MiB (docs/convex-migration-plan.md §4); a single table fits with a wide margin.
- **Within a draw** (built in B3). The wall of a first use is its slowest table (§9.1: one family sets it, 258 s for a
  7×7 shape), so a slow table is computed as **R replicate pieces**, R ≤ 8, each an independent run of the estimator on
  1/R of the budget (nMc/R spawns, minMcCount/R, particles/R, seed `sha256(key, r, R)`), and merged.
  - *Plan* (`engine/calibration.ts planDraws`, game-utilities `estimateCost`, `planSplit`): the planning action times a
    few hundred evaluations of the draw's own evaluator (spawns and proposals, after a warm-up; tens of milliseconds) at
    the speed of the machine the pieces will run on, multiplies by the budget's expected evaluations, and picks
    R = ⌈seconds / PIECE_TARGET_SECONDS (20 s)⌉, capped by `maxReplicates` (particles / 62). A table under 20 s stays
    one action (`run`, byte-identical to the offline single run); an enumerated Int range is never split.
  - *Pieces are unbiased on their own.* The single run chooses each stage's level from its own particles; that adaptive
    choice biases the product of survival fractions by O(1/particles) (positive in probability), small at 500
    particles but R times larger at 500/R. Measured with plain replicates (§9.2), the merge then read 0.1–0.9 bits low
    from 8 bits down, growing with R. So a replicate's climb passes through **fixed levels** chosen by its own **pilot**
    climb (16 particles, half the sweeps, an independent Rng, from the same start): with levels that do not depend on
    the particles, multilevel splitting is an unbiased estimate of G for any population (a Feynman–Kac normalising
    constant, whatever the kernel's mixing). A fixed level no particle reaches is an *extinction*: the replicate
    estimates 0 beyond it. The climb starts *just above* the body's m-th largest sample with the count there (m − 1
    without ties), since starting at the m-th largest with m/n overestimates what follows by m/(m − 1) (11 % at m = 11).
    Past the pilot's last level a replicate climbs adaptively, as the single run does.
  - *Merge* (`mergeReplicates`, `mergeCurves`; the `merge` action): each replicate's points define a step function
    Ĝ_r(t); the merge is the probability average Ĝ(t) = Σ w_r Ĝ_r(t) (w_r = the replicate's share of the spawns) at
    every sampled ordinal up to the shallowest top of the replicates that did not go extinct (extinct ones count 0 past
    their top), with var(log2 Ĝ) = Σ (w_r Ĝ_r se_r)² / Ĝ² (R replicates of 1/R the particles: the single run's nominal
    variance). Where every replicate is in its body the merge *is* the single run's body on all nMc spawns (the counts
    add). Then the single run's clean-up. Replicates climb `REPLICATE_MARGIN_BITS` (4) past targetBits, so the merged
    table still reaches it.
  - *Identity.* The key does not change: a split table estimates the same quantity with the same (measured, §9.2)
    statistics, so the shipped v3 tables stay a valid warm cache, which bumping the estimator version would have
    discarded. The table records how it was made, `estimator.split = { replicates }`, and is byte-deterministic from
    the key and the plan, wherever its pieces ran (`test/split.test.ts`, and the engine test that merges a piece
    retried by the engine with pieces computed in the test process).
  - *Coordination.* Pieces are rows of `calibrationPieces` (key, index, status, result: the replicate's points as
    JSON, a few KB). `compute.piece` reports through `cache.pieceFinished`, which advances every waiting room's
    progress and, when the last piece is ready, schedules `compute.merge`; a failed piece is retried alone with the
    same backoff (5 s, 15 s) up to 3 attempts, the other pieces untouched; then the key fails as before. A claim that
    restarts a crashed split key restarts only its pieces that are neither ready nor in flight (or the merge). The
    merge writes the table through `finished`, which keeps each piece's build time (`pieceMs`) and drops the piece rows.
- **Rate limit** (built in B3). New computation is limited per owner, in the same `claimMany` transaction (a refused
  start claims nothing): at most `MAX_PREPARATIONS` (2) of the owner's other rooms may be preparing tables the owner's
  starts are computing, and a bucket of `PIECE_BUCKET` (200) pieces refilled at `PIECES_PER_MINUTE` (60) must hold the
  start's new pieces (a start larger than the bucket is admitted when it is full). Waiting on keys someone else computes
  costs nothing. The owner reads `RATE_LIMITED`: "This game needs 36 new rule-table computations, and this server allows
  each owner about 60 a minute (12 available now): you have started several new shapes recently. Try again in about 24
  s, or choose a shape whose tables are ready." or "2 of your rooms are already preparing rule tables for a new shape;
  this server prepares at most 2 at a time per owner. …". So cycling Int ranges costs an owner about a game's tables a
  minute, never the deployment.
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
   memberIds, deals, pending: key[], total, estimateSeconds, dealer, startedAt, error?, pieces?: { done, total } }`
   (`pieces` when some table is split: progress by computation pieces, advanced by each landed piece; keys that landed or failed
   between the action's check and the mutation are settled there, so no landing is missed) and the start returns
   `{ status: "preparing", ready, total, estimateSeconds, dealtAs, message }`. Clients already subscribe to the room;
   `rooms.get` projects `preparing` as progress only (`lib/projection.ts preparingView`: never the deal), and the room
   page, the player client's overview and results panels and the assistant's briefing show "The game is preparing its
   rule tables, 12 of 18 ready…" (with split tables, "…, 2 of 3 ready (17 of 24 parts computed)"). When the last key lands, `finished` schedules `owner.completeStart(roomId,
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
| B2 (done) | two-half `start`, room `preparing`, coordinator with retries, lobby UI progress, `playableInstantiations`, first-use note, pruning cron, cloud latencies | `owner.ts`, `game/lobby.ts`, `calibration/cache.ts`, `engine/node.ts`, `lib/game-utilities calibration.ts`, `artifacts/code-gods`, `artifacts/player-web` panels, the briefing | PRs #63, #66 |
| B3 (done) | within-draw split: replicate pieces with pilot-fixed levels and an unbiased merge (same key, `estimator.split` recorded), cost-measured planner, piece coordinator with per-piece retries, per-owner rate limit, progress by pieces, fidelity and cloud latencies (§9.2) | `scripts/estimator.ts`, `scripts/verify-split.ts`, `calibration/{cache,compute,tables}.ts`, `engine/calibration.ts`, `owner.ts`, `game/lobby.ts`, room and panel progress | this PR |
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

Confirmed after the B2 deploy through the engine's own scheduled fan-out (`calibration/compute:prepare` on the dev
deployment, claims and scheduled `run` actions, polled every ~17 s): Int(0,2147483647) with digit-devotee (analytic,
5 ms), two smooth-operator tables (7.9 s, 9.3 s), many-faced (89.2 s) and truncation-saint (236.7 s): all four
scheduled actions ran concurrently and every table was ready after 252 s wall (warm resolution afterwards: 0.3 s).
One slow family sets an Int range's first use, so `FIRST_USE_SECONDS.Int` is 250 s.

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

## 9.2 Phase B3: the split estimator, measured

**Fidelity** (`lib/game-utilities/scripts/verify-split.ts --replicates 8 --instances …`): every family with a verified
analytic, every canonical params it covers, built as 8 replicates and merged (`exact: false`, keyed like the archived
references), against the formula; the single run is the archived v3 reference of the same key. Mean Δ / RMS Δ (bits) /
RMS z by depth band:

| shape (tables) | estimate | 8–16 bits | 16–32 | 32–48 | 48–64 |
|---|---|---|---|---|---|
| Grid(4,base10,rgby) (45) | split, R = 8 | +0.06 / 0.22 / 0.77 | +0.08 / 0.36 / 0.79 | +0.34 / 0.78 / 1.24 | +0.77 / 0.93 / 1.25 |
| | single run (v3) | +0.01 / 0.22 / 0.82 | +0.11 / 0.34 / 0.78 | +0.19 / 0.70 / 1.12 | +0.07 / 0.79 / 1.09 |
| Grid(6,base10,rgb) (48) | split, R = 8 | −0.09 / 0.20 / 0.71 | −0.00 / 0.30 / 0.67 | +0.21 / 0.47 / 0.77 | +0.33 / 0.64 / 0.86 |
| | single run (v3) | −0.03 / 0.18 / 0.62 | −0.16 / 0.36 / 0.80 | −0.34 / 0.60 / 0.97 | −0.42 / 0.78 / 1.06 |
| Grid(7,base16,rgby) (50) | split, R = 8 | −0.01 / 0.22 / 0.75 | −0.03 / 0.33 / 0.75 | +0.04 / 0.60 / 0.96 | −0.01 / 0.85 / 1.14 |
| | single run (v3) | −0.04 / 0.19 / 0.64 | −0.07 / 0.29 / 0.64 | +0.14 / 0.46 / 0.74 | +0.35 / 0.78 / 1.04 |

Every split table is within the reference bands (`tableViolations`, RMS z ≤ 1.5 per family below 32 bits) on all three
shapes; below 4 bits and at 4–8 the two agree to the hundredth. The split is as good as the single run to 32 bits and
comparable beyond: better on 6×6, on par on 7×7, somewhat noisier on 4×4 past 48 bits (few levels there). Merged
against the single run directly, on 7×7 (common ordinals, z with both nominal se): RMS Δ 0.26 / 0.42 / 0.80 / 1.23
bits and RMS z 0.62 / 0.66 / 0.90 / 1.17 in the four bands, max |Δ| 1.0 / 1.6 / 4.0 / 5.7. The merged top is on
average 1.9 bits shallower (a replicate that goes extinct at a fixed level ends early, and the merge stops at the
shallowest replicate that did not); the extrapolation slope covers the rest, as for any table.

What did not work, for the record. *Plain replicates* (each an adaptive single run on 1/R of the budget, merged the
same way) read low: on 6×6 at R = 6, −0.12 / −0.30 / −0.41 / −0.70 bits in the four bands (one family's RMS z 1.53
below 32 bits, over the bound); on 4×4 at R = 12, −0.21 / −0.41 / −0.86 / −0.65. More sweeps per replicate halve it
at twice the cost; starting each replicate from more distinct body samples does not help. The cause is the adaptive
level choice (§3.2), which pilot-fixed levels remove: on 4×4 at R = 12 they bring 16–32 and 32–48 to +0.00 and −0.09.
Past 8 replicates (41 particles each) extinctions make the deepest levels noisy (48–64 bits RMS z 2.0 on 4×4 at
R = 12), hence the cap of 8.

The unit tests (`test/split.test.ts`) build split tables for three exactly solved families at the cap and hold them to
the same bands.
