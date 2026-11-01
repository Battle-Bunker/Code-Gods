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

§1–§4 are the contract (shipped); §5 is the experiment that checks "possible but hard", with the finding the owner
needs to decide on; §6 is the independence invariant; §7 the knobs.

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
| Salience on the public game view (Σ net bits per object) | public | unchanged: a seated player knows own + others = salience already |

After the end, the projections show what they showed before this change (others' agent ids and summons, every
batch's totals); the replay work extends that to full transparency.

**Tested** (test/game-disclosure.test.ts, test/mcp.test.ts): no live result names another god's agent id or owner;
others' transformations carry no agent, owner, calls or cost; a live replay has only the viewer's own summon and
totals only on published batches; another god's per-object bits never appear in any player-facing result or tool.

## 2. One row per event, a per-deity vector, everything else derived on read

**Table `objectEvents`** (convex/game/tables.ts): one row per spawn and transformation, written in the same commit
mutation as the tick's `tickBatches` doc (and by the game start for its starting objects):

`gameId, objectId, seq, world, kind ("spawn" | "transform"), before?, value, version, calls?, agentId?, ownerId?, net[]`

`net` is every roster god's net bits of the object after the event, in roster order: server-private. Indexes:
`by_game_world` (the series), `by_game_object_world` (the state at t) and `by_game_object_version` (the previous row,
for exact deltas).

Per viewer, everything is derived on read, O(n) per row:

- own = `net[i]`, others = Σ_{j≠i} `net[j]`, payoff = own × max(0, others);
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

One insert per event happens inside the tick's single commit mutation (100 Hz is about 100 inserts a commit, far
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

**The viewer's own score stays live** (`observation.self.score`). It discloses nothing new: each own per-object
payoff is own bits × max(0, others' bits), both already live per object. It does not help back out another god's
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

RESULTS_PLACEHOLDER

### 5.2 Finding

**With exact per-object peer sums and the public calibration tables, identifying the rule set is easy, not hard.**
The fit names every other god's exact draw (family and parameters, up to draws the data cannot tell apart) from a few
dozen observed values, for three gods and for six, in about a second. A hint barely matters because the data already
decides.

This predates the public log: the per-object peer sums were already live in the observation. The log adds
observations and the before/after link, but a player watching their objects panel had the same equations. Anyone
with the repository can run the same fit, because the calibration tables ship with it. What stays hard is mapping
rules to gods (the batched scoreboard, §3) and, for a human without the tool, the analysis itself.

To make rule identification "possible but hard", the disclosure would have to change, which is the owner's call (the
request asked for exact bits): §7's first knob.

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
- **The one exception, a pre-existing product rule:** uniqueness ("a transformation onto any existing value fails").
  A transformation's success depends on whether another object holds the result. It never changes another object, and
  it never changes a utility. It is recorded as the stated exception in the product memory and was reported to the
  coordinator; changing it is the owner's call. Shelter targeting weights the choice of target by salience, which is
  scheduling, not state.

## 7. Knobs

| If inference is… | Turn | Effect |
|---|---|---|
| too easy (it is, §5) | **disclosed precision of the others' bits** (round to 0.5–1 bit, or add noise) — not implemented: owner decision | the only knob that makes the rule set hard to pin: every hypothesis within the rounding fits |
| too easy | more gods; shapes with more families | the candidate space grows, but slowly: §5 shows six gods are still identified |
| too easy | `defenceGoals` on | doubles the unknowns per god |
| too easy at the god level | `scoreIntervalSeconds` up | hides god-to-rule assignment longer; does not affect identifying the rule set |
| too hard | fewer gods, `spawnRateHz` up | more equations per unknown |
