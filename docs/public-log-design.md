# The public transformation log, batched scores and rival inference

The owner's decision (2026-11-01), after the in-game assistant told a player it could not work out another god's goal
because its data held only the player's own changes and the peers' totals:

> I want all object transformation events to be part of the public log during games (without attribution) so that the
> interests of other Gods can be analyzed in realtime during the game. Deity scores should only be updated in unison
> every 10s (configurable) so that it's hard to attribute the "others utility" change on an object following a
> transformation to a particular deity whose score changed by the same amount […]. It should be possible (but hard) to
> gain some predictive power over which other utility functions are in the game using intelligent analytics over many
> instances of exact bit changes in the others score per transformation […]. With clues obtained from conversation
> with other players […] players can give their assistant clues about which utility functions to consider as present
> with high probability and then it can continue doing analysis to try to narrow down which particular rule and
> parameters another God has from the data.

Later rulings the same day, which this design follows:

- **Live only.** Anonymity and batched scores apply while a game is live (planning to recovery). An ended game is
  fully transparent: its replay (owned by the replay work, docs/replay-design.md) shows attribution, every agent's
  source, every deity's utilities and exact per-event scores. The stored log therefore keeps everything exact; hiding
  happens only in the live projections.
- **Data model.** One row per spawn or transformation, holding the object's resulting state and the resulting utility
  of every deity (a per-deity vector), indexed by (game, object, time) and (game, time). The state at time t is each
  object's last row at or before t. Disclosure is enforced purely in the query projection.
- **Every object is an independent universe.** An object's utility depends only on its own state, and a
  transformation changes only its target (§6).

§1–§4 are the contract; §5 is the experiment that checks "possible but hard" and the disclosure noise it led to
(`peerNoiseBits`, default 8 bits, owner-approved); §6 is the independence invariant; §7 the knobs.

## 1. Every transformation is public; while live, nothing in it says who made it

**What every seated player sees, live, for every transformation in the game:** world time, tick batch (`seq`), the
object, its value before and after, its new version, and, as for every event, the viewer's own net bits and the other
gods' summed net bits after it. Spawns likewise. Spectators (room members not seated) see the events without bits.

**What a live projection withholds for another god's transformation:** the agent id, the owner, the mutator calls and
the charge. The viewer's own transformations keep them (`mine: true`).

Attribution channels, and what each does while live (`projectEvent(…, live)`, convex/lib/projection.ts):

| Channel | Before | Live now |
|---|---|---|
| `agentId` on others' transformations | present (a stable pseudonym: clustering by agent splits the log per god) | **withheld** |
| `agent.summoned` / `agent.destroyed` of others' agents | every god's, with world time | **own only**. The game view's live `agentCount` stays public (an aggregate). |
| `agent.failed` | owner only | unchanged |
| Event order inside a batch | opportunity order | unchanged: each opportunity's world time is on an even grid over the window and its agent is drawn uniformly from the eligible ones with a CSPRNG, so the order encodes no agent's schedule. Residual signal: an agent that just acted is ineligible until it recharges. Without agent ids it is not separable from the other agents' acts. |
| Leaderboard totals in the replay of a live game | every scoring batch | **only on batches that published the scoreboard** (§3) |
| Leaderboard everywhere live (observation, game view) | live totals | **the published scoreboard** (§3) |
| Salience on the public game view (Σ net bits per object) | public, exact | with the version's disclosure noise (§5.2), the same draw as every seated player's others' sum |
| The others' sum itself, and everything built on it (care, payoff, own live score, scoreboard) | exact | the exact value plus the version's disclosure noise, σ = `peerNoiseBits` (default 8 bits, §5.2) |

After the end, the projections show what they showed before this change (others' agent ids and summons, every
batch's totals); the replay work extends that to full transparency.

**Tested** (test/game-disclosure.test.ts, test/mcp.test.ts): no live result names another god's agent id or owner;
others' transformations carry no agent, owner, calls or cost; a live replay has only the viewer's own summon and
totals only on published batches; another god's per-object bits never appear in any player-facing result or tool.

## 2. One row per event, a per-deity vector, everything else derived on read

**Table `objectEvents`** (convex/game/tables.ts): one row per spawn and transformation, written in the same commit
mutation as the tick's `tickBatches` doc (and by the game start for its starting objects):

`gameId, objectId, seq, world, kind ("spawn" | "transform"), before?, value, version, calls?, agentId?, ownerId?, net[], noise?`

`net` is every roster god's net bits of the object after the event, in roster order: server-private. Indexes:
`by_game_world` (the series), `by_game_object_world` (the state at t) and `by_game_object_version` (the previous row,
for exact deltas).

Per viewer, everything is derived on read, O(n) per row:

- own = `net[i]`, others = Σ_{j≠i} `net[j]` (+ the row's `noise` while live, §5.2), payoff = own × max(0, others);
- before = the same object's previous row (version − 1): within the page, or one indexed read per object;
- `dOwn`, `dOthers` = after − before, exact differences of the stored doubles;
- the board at world time t = each object's last row at or before t (one indexed read per object).

**Storage, measured** (test game: Int, three gods): a transformation row is about 360 bytes of JSON, of which the
per-deity vector is 34; a Grid(5) row is about 500 (two 75-character values). Alternatives per event, for six gods:

| Representation | Score bytes per event | Why not |
|---|---|---|
| **One absolute per-deity vector (chosen)** | 48 | — |
| The vector as deltas | 48 | the same size; absolute values would then need a fold from the spawn |
| Per-viewer columns (own, others) | 96 | redundant with the vector |
| Per-viewer columns plus deltas | 192 | four times |
| A board snapshot per event | ≈ 100 objects × (id + value + n·8) ≈ 14,000 | 40× the whole row |

A 600 s game at the default economy runs a few acts per second: about 2,000 rows, about 1 MB with Grid values. The
spawn and transform payloads are also in `tickBatches` (the replay's log, owned by the replay work), so the log is
stored twice; the replay could later read the rows instead and drop them from the batches.

(The noise per row is §5.2's.) One insert per event happens inside the tick's single commit mutation (100 Hz is about 100 inserts a commit, far
within Convex's limits); the product rule "one commit mutation per tick" holds.

**The reads.** `player.series` (a paged query over `by_game_world`, at most 4,000 rows a page): columns
`world, seq, objectId, kind, version, before, value, ownBefore, othersBefore, own, others, payoff, mine`.
`player.board({world})`: every object at that world time with value, version, `changedAt`, own, others and payoff.
Both are for the game's seated players (FORBIDDEN otherwise), live and ended.

## 3. Scores are published together every N seconds, live

**Setting.** `scoreIntervalSeconds`, world seconds, one of 5, 10, 20, 30 or 60 (pre-authored choices; default 10).
World time, not wall time: scores change only while the world runs. Stored settings without it get 10
(`upgradeStoredSettings`; the deploy's settings migration writes it).

**What is batched:** every score a player can see for another god while live: the leaderboard in the observation and
in the public game view (`games.view`), and the totals in a live replay. The engine keeps the published scoreboard on
the game (`scoreboard: {totals, world, at}`): published at the start, by the first commit whose window reaches the
next multiple of the interval (`scoreboardDue`), and by the commit that ends the game (the final standings are
exact). That commit's `tickBatches` doc is marked `published` (event log schema 3). Between publications the
leaderboard does not move, for anyone, including the viewer's own row, so ranks agree across viewers. The
observation carries `leaderboardWorldSeconds`.

**The stored totals stay exact** on every scoring batch, so the replay of an ended game steps exactly per event.

**The viewer's own score stays live** (`observation.self.score`): the sum of the payoffs as disclosed (own bits ×
max(0, the noisy others' sum)), equal to the viewer's own row at each publication. It discloses nothing new. It does not help back out another god's
timing: another god's payoff on an object depends on that god's own bits, which no viewer sees.

**Why it serves the owner's purpose.** A transformation changes every god's payoff on that object, so a
per-transformation others-delta was matchable to the god whose total jumped by a matching amount within the same
one-second commit. With ten seconds of transformations folded into one publication, that per-transformation link
is gone.

**What it does not hide:** once a player has identified the set of rules in the game (§5), the published totals let
them test assignments of rules to gods, because each god's total is a known function of the board under an
assignment. Batching removes the cheap path, not the analytic one.

## 4. The analytics surface for assistants

Every assistant surface uses the one tool registry (product rule): four read tools, two `run_code` datasets and a
skill.

| Tool | Reaches | What it returns |
|---|---|---|
| `get_utility_series` | `player.series` | The series with `dOwn, dOthers`, whole rows up to the result bound (`nextCursor` → `offset`); filters `objectId`, `fromWorld`. |
| `get_board_at` | `player.board` | The board at a world time. |
| `list_utility_candidates` | engine-internal (public catalogue) | Every family the dealer could deal in this game (theme, tags, role) with every parameter set, and the number of other gods. The same list for every player. |
| `fit_utility_mixture` | engine-internal (the series and the game's tables) | Hypotheses about the other gods' rules, scored against the observed others' bits. |

**The fit** (`lib/game-utilities/src/inference.ts`). The others' bits at a value are a function of the value alone
(§6), so every distinct value the player has seen (after a spawn, and both sides of every transformation) is one
equation: y(x) = Σ over the k other gods of their rule's bits at x (plus each one's defence goal, −w (h − E h), when
the game deals them), each with coefficient 1. For every candidate draw (family × parameter set) the engine computes
its bits on every observed value with the game's own calibration tables. Then:

1. Candidates whose columns are identical on the data are merged into one class (the data cannot tell them apart;
   the report lists the aliases).
2. **Spectrum** (the owner's Fourier analogy): non-negative least squares of y on every class, the top weights.
3. **Exact structure:** a beam search (width 64) over multisets of k reward classes (plus k defence classes), scored
   by residual and log prior, then a swap polish (each pick swapped for any class while that lowers the score).
4. **Report:** the top hypotheses with RMS residual, R², Gaussian log-likelihood (σ = max(best RMS, 0.05 bits)) and a
   posterior over the beam; each family's probability of being held; `exact` (the best hypothesis explains the data
   to 0.05 bits RMS); candidates skipped for lack of a table.

**Priors.** The default is the dealer's: a uniform family of the role, then a uniform parameter set. A hint
`{familyId, params?, probability}` ("the Owl said they like 2×2 blocks of A") moves the prior mass of the matching
draws (a partial `params` matches every draw agreeing on the given keys) to odds p / (1 − p) against the rest;
`exclude` removes families.

**Datasets for `run_code`:** `utility_series` (the columns, up to 12,000 rows) and `utility_candidates`.

**The assistant's instructions:** the `rival-inference` skill (fit without hints; ask the player for clues others gave;
turn them into hints; refit; report probabilities, never certainties; never claim which god holds which rule) and one
line in the system prompt's skills paragraph.

## 5. "Possible but hard": the experiment and the finding

`lib/game-utilities/scripts/inference-experiment.ts` simulates games with known utilities on a shipped shape: it deals
k + 1 utilities with the Divine Lottery (god 0 is the viewer), and builds what the viewer would see: random spawns plus,
for each god, the objects of a 3,000-object pool that god scores highest (what that god's agents push the board
toward). The observation at each value is the others' summed bits, exactly as the engine projects them. The fit runs
with no hints and with one correct hint (one other god's family, probability 0.8).

### 5.1 Results

Grid(4,base10,rgby) (793 candidate draws, 82 families), 6 trials per row (10 for σ = 0), seeds fixed (rerun with
`node --experimental-strip-types scripts/inference-experiment.ts --noises 0,2,4,8,16`). "observed": random spawns plus
the objects each god's agents pushed; the distinct values seen are about spawns + gods × pushed. Exact draws: the top
hypothesis is exactly the other gods' rules and parameters; recall@k: share of the true families among the k most
probable; spectrum@k: the same for the free-weight fit. Grid(5,base10,rgby) gives the same picture at σ = 0 (100%
exact for 3 and 6 gods from 50 values). Rounding the disclosed sums to 1 bit instead of adding noise changed
nothing (100% exact).

| noise σ (bits) | gods | observed | hint | exact draws | exact families | recall@k | p(true family) | p(best false) | spectrum@k | ms per fit |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 3 | 20 spawns + 10/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 1136 |
| 0 | 3 | 20 spawns + 10/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 1109 |
| 0 | 3 | 60 spawns + 30/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 2634 |
| 0 | 3 | 60 spawns + 30/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 2128 |
| 0 | 3 | 150 spawns + 60/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 3640 |
| 0 | 3 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 3505 |
| 0 | 6 | 60 spawns + 30/god pushed | none | 100% | 100% | 100% | 0.99 | 0.00 | 96% | 2740 |
| 0 | 6 | 60 spawns + 30/god pushed | 1 correct | 100% | 100% | 100% | 0.99 | 0.00 | 96% | 2868 |
| 0 | 6 | 150 spawns + 60/god pushed | none | 100% | 100% | 100% | 0.99 | 0.00 | 96% | 4906 |
| 0 | 6 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 0.99 | 0.00 | 96% | 5172 |
| 1 | 3 | 20 spawns + 10/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 10289 |
| 1 | 3 | 20 spawns + 10/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 100% | 7390 |
| 1 | 3 | 60 spawns + 30/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 19738 |
| 1 | 3 | 60 spawns + 30/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 8611 |
| 1 | 3 | 150 spawns + 60/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 16159 |
| 1 | 3 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 8458 |
| 1 | 6 | 60 spawns + 30/god pushed | none | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 10414 |
| 1 | 6 | 60 spawns + 30/god pushed | 1 correct | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 4765 |
| 1 | 6 | 150 spawns + 60/god pushed | none | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 8022 |
| 1 | 6 | 150 spawns + 60/god pushed | 1 correct | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 6029 |
| 2 | 3 | 20 spawns + 10/god pushed | none | 100% | 100% | 100% | 0.97 | 0.07 | 92% | 9856 |
| 2 | 3 | 20 spawns + 10/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 7570 |
| 2 | 3 | 60 spawns + 30/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 20921 |
| 2 | 3 | 60 spawns + 30/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 6547 |
| 2 | 3 | 150 spawns + 60/god pushed | none | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 16979 |
| 2 | 3 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 11813 |
| 2 | 6 | 60 spawns + 30/god pushed | none | 83% | 83% | 97% | 0.97 | 0.17 | 93% | 7466 |
| 2 | 6 | 60 spawns + 30/god pushed | 1 correct | 83% | 83% | 97% | 0.97 | 0.17 | 93% | 3918 |
| 2 | 6 | 150 spawns + 60/god pushed | none | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 8725 |
| 2 | 6 | 150 spawns + 60/god pushed | 1 correct | 83% | 83% | 97% | 0.97 | 0.17 | 97% | 5688 |
| 4 | 3 | 20 spawns + 10/god pushed | none | 67% | 67% | 83% | 0.81 | 0.20 | 25% | 9585 |
| 4 | 3 | 20 spawns + 10/god pushed | 1 correct | 83% | 83% | 100% | 0.90 | 0.01 | 25% | 7363 |
| 4 | 3 | 60 spawns + 30/god pushed | none | 83% | 100% | 100% | 0.97 | 0.07 | 75% | 19932 |
| 4 | 3 | 60 spawns + 30/god pushed | 1 correct | 83% | 100% | 100% | 1.00 | 0.00 | 75% | 7194 |
| 4 | 3 | 150 spawns + 60/god pushed | none | 100% | 100% | 100% | 0.99 | 0.02 | 92% | 15055 |
| 4 | 3 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 1.00 | 0.00 | 92% | 9808 |
| 4 | 6 | 60 spawns + 30/god pushed | none | 50% | 67% | 93% | 0.92 | 0.35 | 88% | 10112 |
| 4 | 6 | 60 spawns + 30/god pushed | 1 correct | 50% | 67% | 93% | 0.92 | 0.22 | 88% | 3979 |
| 4 | 6 | 150 spawns + 60/god pushed | none | 67% | 67% | 93% | 0.93 | 0.33 | 89% | 9057 |
| 4 | 6 | 150 spawns + 60/god pushed | 1 correct | 83% | 83% | 97% | 0.97 | 0.17 | 89% | 6579 |
| 8 | 3 | 20 spawns + 10/god pushed | none | 33% | 33% | 50% | 0.45 | 0.32 | 0% | 8693 |
| 8 | 3 | 20 spawns + 10/god pushed | 1 correct | 33% | 33% | 75% | 0.66 | 0.16 | 0% | 5683 |
| 8 | 3 | 60 spawns + 30/god pushed | none | 50% | 50% | 75% | 0.67 | 0.23 | 0% | 18827 |
| 8 | 3 | 60 spawns + 30/god pushed | 1 correct | 50% | 50% | 83% | 0.75 | 0.06 | 0% | 5722 |
| 8 | 3 | 150 spawns + 60/god pushed | none | 83% | 83% | 92% | 0.85 | 0.27 | 58% | 17178 |
| 8 | 3 | 150 spawns + 60/god pushed | 1 correct | 100% | 100% | 100% | 0.96 | 0.07 | 58% | 9872 |
| 8 | 6 | 60 spawns + 30/god pushed | none | 17% | 33% | 66% | 0.63 | 0.75 | 31% | 10827 |
| 8 | 6 | 60 spawns + 30/god pushed | 1 correct | 17% | 33% | 76% | 0.67 | 0.64 | 31% | 5428 |
| 8 | 6 | 150 spawns + 60/god pushed | none | 50% | 67% | 93% | 0.91 | 0.41 | 65% | 6746 |
| 8 | 6 | 150 spawns + 60/god pushed | 1 correct | 67% | 83% | 97% | 0.93 | 0.24 | 65% | 9098 |
| 16 | 3 | 20 spawns + 10/god pushed | none | 0% | 0% | 25% | 0.19 | 0.49 | 0% | 1359 |
| 16 | 3 | 20 spawns + 10/god pushed | 1 correct | 0% | 0% | 75% | 0.51 | 0.02 | 0% | 825 |
| 16 | 3 | 60 spawns + 30/god pushed | none | 0% | 0% | 25% | 0.26 | 0.36 | 0% | 3701 |
| 16 | 3 | 60 spawns + 30/god pushed | 1 correct | 0% | 17% | 67% | 0.56 | 0.06 | 0% | 1954 |
| 16 | 3 | 150 spawns + 60/god pushed | none | 33% | 33% | 50% | 0.43 | 0.32 | 0% | 6337 |
| 16 | 3 | 150 spawns + 60/god pushed | 1 correct | 33% | 67% | 83% | 0.65 | 0.10 | 0% | 3568 |
| 16 | 6 | 60 spawns + 30/god pushed | none | 0% | 0% | 42% | 0.42 | 0.67 | 14% | 2916 |
| 16 | 6 | 60 spawns + 30/god pushed | 1 correct | 0% | 0% | 48% | 0.41 | 0.15 | 14% | 2209 |
| 16 | 6 | 150 spawns + 60/god pushed | none | 0% | 0% | 59% | 0.54 | 0.62 | 28% | 4508 |
| 16 | 6 | 150 spawns + 60/god pushed | 1 correct | 0% | 0% | 69% | 0.55 | 0.28 | 28% | 5113 |

### 5.2 Finding, and the disclosure noise

**With exact per-object peer sums and the public calibration tables, identifying the rule set is easy, not hard.**
At σ = 0 the fit names every other god's exact rule and parameters (up to draws the data cannot tell apart) from a
few dozen observed values, for three gods and for six, in about a second; a hint barely matters. This predated the
public log (the per-object peer sums were already live), and anyone with the repository could run the same fit
because the calibration tables ship with it. Rounding to 1 bit does not help.

The owner's ruling (2026-11-01): add a precision setting, on by default, at a level where identification needs many
observations plus correct negotiation hints. **`peerNoiseBits`** (game setting; options 0, 2, 4, 8, 16 bits; default
**8**): while a game is live, every disclosed sum of the other gods' bits is the exact sum plus Gaussian noise of that
standard deviation.

- **A function of the value, stored with each version.** The noise at a value is a keyed hash of (the game's private
  key `games.noiseKey`, the value) turned into a Gaussian (engine/node.ts `disclosureNoise`), written as `noise` on the
  spawn or transform event, the `objectEvents` row and the object. The same value always discloses the same noise,
  whenever it recurs (A → B → A, or a later spawn), so neither repeated queries nor repeated observations average it
  away; the others' sum at a value is a function of the value alone (§6), so its noisy disclosure is too.
- **One draw shared by every viewer.** Each seated player's others' sum and the public salience carry the same draw,
  so own + others = salience stays consistent and no player gets two independent samples of one quantity. (Two
  players pooling their data learn each other's own bits, which they could tell each other anyway.)
- **Everything that depends on the others' sum follows the noisy value, live:** peer care, payoff, the own live score,
  the salience on the public game view, the series and board, trajectories, events, the live replay, the `run_code`
  datasets and the tools (all through the same projection functions), and the **published scoreboard**: each god's
  total is computed from the noisy sums (`disclosedTotalsOf`), so a player's own published row equals their live
  score and the scoreboard leaks nothing beyond the disclosed sums.
- **Exact everywhere server-side** (scoring, the commit clause, stored `net` vectors and batch totals) and in every
  projection of an ended game.
- **The fit knows the noise** (`noiseBits` = the game's setting while live): the likelihood's σ is at least the
  noise, and `exact` means "explains the data to within the noise".

Why 8: at σ = 2 identification is still certain; at 4 it is likely from 100 values; at 8 the top hypothesis is right
in a third of 3-god games after ~50 values and in 17% of 6-god games after ~200, a correct hint raises family recall
noticeably (50% → 75% for three gods at ~50 values), and only long games (hundreds of values) approach certainty;
at 16 even long games rarely pin the set. 8 is "possible but hard". The cost: a player's view of what the others
care about on a single object is ±8 bits uncertain, so cooperation rests more on talk and on trends than on one
object's number.

**Residual channels, stated plainly:** the commit clause (an own agent's `only_if_better`) decides on the exact
payoff, so its success or failure tells the owner one bit about the exact sum on that object; and an agent's
behaviour cannot be blinded. Neither discloses another god's individual bits.

## 6. Every object is an independent universe

Owner's rule: an object's utility depends only on that object's own state, and a transformation changes only its
target. Checked:

- **Scoring** is per object by construction: the host evaluator `evaluator(descriptor, inst)` is a function of one
  wire value; surprisal uses the draw's own table; payoff uses the same object's other gods' bits.
- **Aligned Lottery synergy** only chooses which descriptors are dealt; it never enters scoring.
- **The commit clause** compares the owner's payoff on the target object only.
- **Mutators**: `applyCalls(type, inst, before, calls)` takes one value; the commit patches only the target.
- **Enforced:** `lib/game-utilities/test/independence.test.ts` evaluates every family on every playable shape over a
  set of values in forward order, then in reverse interleaved with other families' calls on other values, and requires
  identical ordinals (no card keeps state across objects).
- **The one stated exception (owner ruling, kept):** uniqueness ("a transformation onto any existing value fails").
  A transformation's success depends on whether another object holds the result; it never changes another object or
  any utility. Shelter targeting weights the choice of target by salience, which is
  scheduling, not state.

## 7. Knobs

| If inference is… | Turn | Effect |
|---|---|---|
| too easy | `peerNoiseBits` up (16) | §5.1: even long games rarely pin the rule set |
| too hard | `peerNoiseBits` down (4, 2, 0) | 2 and 0 identify the set with certainty from tens of values |
| too easy at the god level | `scoreIntervalSeconds` up | hides god-to-rule assignment longer; does not affect identifying the rule set |
| too easy | more gods; `defenceGoals` on | more unknowns per equation |
| too hard | fewer gods, `spawnRateHz` up | more equations per unknown |
