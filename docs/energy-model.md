# The energy model: power, reads, mutators and selection (2026-11-05)

The owner's decisions of 3 Nov 2026, recorded in `docs/coordination/status.md` (branch `claude/jolly-hamilton-iuxff1`), as
one economy. This document is the specification; the code cites its sections. All numbers below are for the
"First steps" board, Grid(4, base10, rgb): 16 cells, S = 10 symbols, C = 3 colours.

## 1. Principles

1. **An act pays only for what it does.** It pays for the bits it reads (§3) and for the change it makes (§4). There is
   no per-act floor and no per-act charge for the agent's code. Code complexity is priced once, at summon (the
   ast-bits description length, unchanged).
2. **Change is priced by operations, superlinearly.** Every object type has a few *elementary mutators*, each with its own
   information cost w. A *composite* mutator (paint a row, ×2401) is priced as its decomposition into elementary ones.
   An act's W is the sum of its elementary costs, and its change cost is W + β·W². Small incremental acts are cheap.
   Radical acts are very expensive, so every object becomes an incremental battleground.
3. **Power, not batteries.** Each deity has a fixed power budget (bits per world second). They split it between their
   agents and themselves, and can re-allocate at will (§6). There is no per-agent energy cap.
4. **Selection by energy.** The chance that an agent gets the next mutation opportunity is proportional to its current
   energy (§7). An agent that reads a little and skips saves energy, so it is offered more opportunities.

## 2. The act charge

```
charge = R + (the change commits ? C : 0)
R = Σ distinct reads' information (§3)        C = W + β·W²,  W = Σ elementary costs (§4)
```

| Outcome | What happened | Charge | Futility memo | Failure breakdown |
|---|---|---|---|---|
| transform | a change committed | R + C | — | — |
| **skipped** | returned no calls (`[]` / `None`) | R | not recorded | not counted |
| no change | calls whose net effect is nothing | R | recorded (deterministic) | counted |
| invalid / error | a bad call, a raise, the step limit | R (reads made before it stopped) | recorded | counted |
| collision | the result is another object's value | R | recorded | counted |
| commit clause kept it | `only_if_better` and no improvement | R | recorded | counted |

A change that does not commit pays no change cost: the world did not change. A skip is a choice, not a failure. Calls
that cancel out are still "no change", a failure, because the agent asked for a change and nothing happened.

## 3. Read metering

An agent reads the board only through the prelude's accessors. Each accessor charges the information its value can carry,
the first time in the act. Repeat reads of the same value are free within one act.

### 3.1 Grid

A cell has two layers: its symbol (S values) and its colour (C values). The bits charged per accessor are:

| Accessor | Bits (first read in the act) |
|---|---|
| `cell.colour` | log2 C |
| `cell.symbol` | log2 S |
| `cell.value` | log2 (number of distinct values) |
| `cell.suit` | log2 4 |
| `cell.is_picture` / `isPicture` | 1 |
| `cell.row`, `.col`, neighbours, `on_edge`, `grid.size`, `grid.palette`, `grid.cells`/`rows`/`columns`/… | 0: where cells are, not what is on them |

The symbol-layer accessors of one cell share a cap. Together they never charge more than log2 S for that cell, since
the symbol determines its value, suit and picture flag. So reading `value` and then `symbol` costs log2 S in total.
Whole-grid helpers cost what they read. `grid.regions(same)` and `grid.reachable(start, through)` pay for the cells
their callback reads. `repr(grid)` / `String(grid)` read every cell's two layers: 16 · (log2 10 + log2 3) = 78.5 bits.

Worked examples (4×4, base10, rgb):

| Agent | Reads | R (bits) |
|---|---|---|
| Looks at one random cell's colour, skips unless it is red | 1 colour | 1.58 |
| Scans one row's colours | 4 colours | 6.34 |
| Scans every colour | 16 colours | 25.4 |
| Scans every symbol and colour | 32 values | 78.5 |
| Never looks (always `paint(cell(0,0), "red")`) | — | 0 |

### 3.2 Int and string

The agent receives a metered view of the value, not the raw value.

- **Int:** `n.value` reads the whole number: log2 W bits, where W = max − min + 1 (32 bits for a 32-bit range).
  `n.digit(p)` reads one decimal place: log2 10 bits. `n.negative` reads the sign: 1 bit (free when the range has one sign). The total for one act is
  capped at log2 W.
  - In Python the view also behaves as a number (`n + 1`, `n % 2`, `n > 5`, `range(n)`, `str(n)`); any such use reads
    the whole number.
  - In TypeScript, use `n.value` (a `number`) or `n.digit(p)`.
- **string:** `s.length` costs log2(maxLength + 1). `s.char(i)` costs log2 A = 7 bits (ASCII). `s.text`
  reads all of it: length + length · log2 A, capped as above.
  - In Python, `len(s)`, `s[i]`, iteration, `in` and `str(s)` work and are charged the same way.

### 3.3 Keeping the meter honest

The meter is guest code, so the guest must not be able to read the board or reset the meter past it.

- **TypeScript (QuickJS):** cells hold no data. Each accessor is a closure over the decoded board and a meter that uses
  only primitive arithmetic and typed arrays. The agent can replace any `prototype` method without effect, and a
  closure's state is unreachable from JS. The host takes its handle on the meter's reader before the agent's program
  runs, so redefining it changes nothing. No source rule is needed.
- **Python:** introspection reaches into closures and frames. The meter's state lives in a closure, and the cells hold
  only their position. Agent source is checked at validate and summon (and again at every act, as part of
  compilation). It is refused if it:
  - uses a name or attribute that starts with `_` (this covers `__closure__`, `__dict__`, `__globals__`,
    `__builtins__` and the prelude's private names);
  - uses an attribute in the introspection list (`gi_frame`, `gi_code`, `cr_frame`, `ag_frame`, `f_back`, `f_globals`,
    `f_locals`, `f_builtins`, `f_code`, `tb_frame`, `tb_next`, `cell_contents`, `format`, `format_map`);
  - uses the dynamic-attribute names `getattr`, `setattr`, `delattr`, `attrgetter` or `methodcaller`.

  `format` and `format_map` are on the list because a format string can follow attribute paths (`"{0.__closure__}"`).
  The rule is checked on the AST, so the message names the line. Why this and not host-side metering: the host never
  sees attribute reads, and moving the board out of the guest would mean a host call per read. That costs more than
  the whole act. Ordinary agents never need these names.

### 3.4 Where it runs

- The prelude defines `__read_bits()`. The runtime (`lib/game-runtime`) captures it after decoding the input and calls
  it after the act, including after a raise or a step-limit stop.
- `act` returns `{calls, usedRandom, steps, readBits}`, and a runtime error carries `readBits` too.
- The engine charges `readBits` as R.

## 4. Change cost

### 4.1 Elementary mutators and their information cost w

w is the surprisal of the call's parameters under the maximum-entropy prior on them, plus, for an overwrite, the bits
it erases (pointwise: log2 of the preimage size). There is one op-choice bit per call (log2 of the number of elementary
ops for the type, which is 2 for each type below).

| Type | Elementary mutator | w |
|---|---|---|
| Grid | set one cell's colour | 1 + log2 N² + log2 C (new) + log2 C (erased) |
| Grid | set one cell's symbol | 1 + log2 N² + log2 S + log2 S |
| Int | add d·10ᵖ (one digit place, d ∈ ±1…±9) | 1 + log2 P + log2 18 |
| Int | multiply by m (\|m\| ≥ 2, out of range fails) | 1 + 1 (sign) + Σ over m's prime factors p (with multiplicity) of (log2 p + 1) |
| string | set one character | log2 3 + log2(L + 1) + 2 log2 A |
| string | insert / delete one character | log2 3 + log2(L + 1) + log2 A |

Int's digit adds wrap, so they are bijections, and multiplying either fails or is injective, so neither erases.
Multiplying by a prime is the elementary step, so w(×ab) = w(×a) + w(×b) − 2 (the op and sign bits are paid once).
There is no "set the number" mutator. Setting a number means a sequence of digit adds.

### 4.2 Composite mutators

Every existing mutator stays, priced by the decomposition of its *net effect on this value* into elementary ones:

- **Grid:** W(call) = Σ over cells whose colour changed of w_colour + Σ over cells whose symbol changed of w_symbol.
  This is exact: a cell that changed needs at least one set, and one set suffices. `paint(cell, c)` and
  `write(cell, s)` are the elementary mutators. `paint(row(2), "red")` on a row with no red is 4 sets.
- **Int:** W(call) = the cheaper of:
  - the minimal signed-digit (base 10) decomposition of Δ = after − before, taken over Δ and Δ ± W because adds
    wrap;
  - the prime decomposition of m, when after = before · m.

  `add(k)` is now composite: `add(1000)` is one digit add, and `add(999)` is two (+1000, −1).
- **string:** W(call) = the cost of the edit script that keeps the common prefix and suffix and edits the middle with
  sets, then inserts or deletes for the length difference. This is an upper bound on the cheapest decomposition;
  documented as such.

A call that changes nothing has W = 0. W of the act is the sum over its calls in order, so a change undone later in
the act still paid for both steps.

### 4.3 β, and why 0.05

C = W + β·W² is the code length under the maximum-entropy prior on W with a fixed mean and mean square: P(W) ∝
2^−(W + βW²). β sets the scale 1/β at which the quadratic term equals the linear one: 20 bits, about two cell
colour changes on a 4×4 board.

- Below that scale an act costs about its information. Above it, cost grows with the square of the information.
  Ten small acts are cheaper than one big one, and each needs its own selection.
- A larger β makes even two-cell acts expensive and pushes agents to one cell per act. A smaller β barely separates
  a row from four cells.

`CHANGE_BETA = 0.05` is a constant in `lib/game-types`, not a room setting, so every room prices change alike.

### 4.4 Worked examples (β = 0.05)

| Board | Act | W | C = W + βW² | × one cell |
|---|---|---|---|---|
| 4×4×rgb | one cell's colour | 8.17 | 11.5 | 1 |
| 4×4×rgb | a row's colour (all 4 change) | 32.7 | 86.1 | 7.5 |
| 4×4×rgb | the whole grid's colour | 130.7 | 985 | 86 |
| 4×4×rgb | one cell's symbol | 11.6 | 18.4 | — |
| Int 32-bit | ×7 | 5.81 | 7.5 | — |
| Int 32-bit | ×7⁴ (= ×2401) | 17.2 | 32.0 | 4.3 × (×7) |
| Int 32-bit | +100 (digit 3 up by one) | 8.49 | 12.1 | — |
| Int 32-bit | +10101 (digits 1, 3 and 5) | 25.5 | 58.0 | 4.8 × (digit 3) |

The owner's checks hold:

- ×7 is cheap, however many digits change;
- ×7⁴ costs more than 4 × (×7);
- digit 3 costs less than ⅓ of digits 1, 3 and 5;
- a row costs more than 4 × a cell.

They are unit tests (`lib/game-types/test/mutators.test.ts`).

## 5. What the agent is told at summon

- Validation and summon run the agent on the reference mixture, as today. They report:
  - the summon price (description bits);
  - the estimated cost per act: the mixture mean of R + C over runs that would commit, with R alone for the rest;
  - the read/change split;
  - the skip, change and failure rates.
- These are estimates for the UI and the assistant. Nothing is charged or scheduled from them.
- The decision information I(X; A) is no longer estimated or charged; its estimators are deleted.

## 6. Power (PR 3)

- `settings.powerPerSecond` (P, bits per world second) is each deity's fixed budget. Defaults: 8; Grid 64 (two agents
  at the former 32 bits/s); the "Low income" seed 32.
- Each agent has a `powerShare` s ∈ [0, 1]. A deity's shares sum to at most 1 (`deities.allocated`).
- An agent earns s·P per world second. The deity earns (1 − Σs)·P into its own world-time account (`deities.account`),
  which starts at `startingEnergy` (default 200) and pays summon prices.
- A summon may name the new agent's share (`powerShare`); by default it gets half of what is unallocated
  (`defaultShare`), so the deity keeps the other half for later summons. The agent starts with 0 energy.
- `allocatePower(agentId, share)` (MCP `allocate_power`) settles both accounts at the current world time and then
  changes the share. Destroying an agent returns its share to the deity. Every share is in the event log (schema 6:
  the summon's `powerShare`, a `power` event per re-allocation).
- Duplicate agents gain nothing, because they divide the same power.
- Both incomes run on world time, so power is conserved: the deity's total income is P whatever the split. World
  time stops in planning and pauses, so planning summons are paid from `startingEnergy`.
- Replaced settings: `energyPerSecond`, `agentEnergyPerSecond`, `agentBatteryActs` and `perActFloorBits` are removed,
  and `powerPerSecond` is added. `migrations.powerV1*` migrates stored data (agents and deities first, since they read
  their game's old settings):
  - P = energyPerSecond + 2 · agentEnergyPerSecond (the deity's old income plus two agents at the old rate);
  - each existing agent's share = agentEnergyPerSecond / P, scaled down so an owner's shares total at most 1;
  - each deity's account = its energy at the migration, and `allocated` = its agents' shares.

## 7. Selection (PR 1)

- Opportunities stay a room-wide stream of `interactionRateHz` per world second.
- Each opportunity picks an object as today ("uniform" or "shelter"). It then picks an agent with probability
  proportional to max(0, energy). An agent with no positive energy is not picked, and the opportunity passes if no agent
  has positive energy. Balances may go negative, because spend varies per object.
- There is no eligibility threshold and no battery.
- **Sanity cap:** an agent is offered at most `MAX_AGENT_OPPORTUNITY_HZ` = 4 opportunities per world second (a
  constant in `lib/game-core/src/energy.ts`, not a room setting; the observation's `economy.maxAgentOpportunityHz` reports
  it). It is skipped while less than 1/cap world seconds have passed since its last opportunity.
  - Without the cap, an agent that reads nothing and always skips pays 0 per act. It would keep all its energy and,
    as the richest agent, take nearly every opportunity.
  - Four a second is far more than any agent needs to contest an object, and it bounds the sandbox work one agent can
    cause.
  - The futility memo still keeps agents off pairs where they can only fail.
- A cheap skipper therefore runs more often than an expensive actor with the same income: its balance stays high.
  This is a unit test (`lib/game-core/test/energy.test.ts`).

## 8. Hold rarity (PR 5)

- Payoff bits = −log2 P(U(x) ≥ u ∧ U(x′) ≥ u) = static(u) + hold(u, m). Here x ~ prior, and x′ is x after m = (number
  of other players) random mutations. One player gives m = 0: static rarity, no correction.
- **The noise** (`lib/game-types/src/noise.ts`, `NOISE_VERSION`): one mutation is drawn with probability ∝ 2^−C over
  the type's single calls, C the change cost of §4. Only the elementary mutators, and every Int multiplier up to 1024,
  are enumerated. A composite call costs far more (a two-cell call 29.7 bits against one cell's 11.5: 2^−18 per call), so
  its mass is negligible. A mutation that cannot apply leaves the value as it is.
- **The estimator** (`lib/game-utilities/scripts/hold.ts`, `hold-ams` v1): adaptive multilevel splitting over U with
  the calibration kernel. After each stage the particles are draws from μ | U ≥ ℓ, and the share whose m-mutation noise
  still scores ≥ ℓ is P(hold | ≥ ℓ) at that level (floored at 1/(2N)). A hold table is [level, hold bits] for one draw
  and one m. The lookup interpolates between levels, is 0 below the lowest and flat above the top.
- **Where tables come from** (owner, 5 Nov: option A): on demand. They are computed during planning, alongside the
  sandbox warm-up, for the dealt families at the game's m, and cached by (static table key, m, NOISE_VERSION). Planning
  waits for them as it waits for sandboxes, and a post-deploy job warms the Annotated basics families on the default
  shape for m = 1..3. The shipped static tables are untouched.
- **In the engine** (PR 5b). A game with more than one player needs its corrections (rooms start with at least three
  players today, so in practice m ≥ 2; the engine and the warm-up also cover m = 1).
  - The start (`game/lobby.ts commitStart`) sets `games.holdState = "computing"` and schedules `engine/hold.ts start`.
    It looks up each god's table in `holdTables` (key = sha256(static table key, `holdKeyPart(m)`)) and fans out one
    action per missing one; each stores its table and, the last, schedules `finish`.
  - `finish` adds the tables to the game's pinned file (`engine/pinned.ts`, per god `hold`), re-scores the starting
    objects with it, and `holdData.apply` writes the objects, the per-object history rows (same version: the state
    index) and one `rescore` event per object (log schema 7; projected as `object.rescored`). `holdState` is then
    `ready`; on any error `failed` (`holdError`), and the game scores on static rarity.
  - The tick (`engine/tick.ts`) holds planning while `holdState` is `computing`, as for a warming sandbox, and world time
    starts no earlier than `holdReadyAt`. Actions run at most once, so a computation that died silently would hold
    planning for ever: ten minutes after the start the tick marks it `failed`. The observation's `holdRarity` is the
    readiness item the header shows.
  - `apply` also republishes the totals and the scoreboard (and so the standings) from the re-scored objects. The
    replaced pinned file is deleted ten minutes later, for readers that loaded the game before the swap.
  - The client scores the same way: the seat's calibration download (`calibration/mine.ts`) carries the `hold` table once
    it is in (not cached while it is computing), and the SDK evaluator and the score workings add `holdBits` (the
    lookup lives in `game-utilities/src/hold.ts`).
  - Scoring (`engine/node.ts score`) adds `holdBits(table, ordinal)` to the reward's surprisal.
  - The deploy workflow runs `engine/holdData:scheduleWarm` (one scheduled action per table, two seconds apart; about
    264 tables of about 2 s each for the default board).
- **The check** (`scripts/hold-check.ts`; a check, not a gate). On 4×4 base10 rgb, with 120 particles, at matched static
  rarity:

  | Family | static | hold, n = 2 | n = 3 | n = 4 | geometric average over m (q = 1/n), n = 2 / 3 / 4 |
  |---|---|---|---|---|---|
  | Line Painter (one colour's lines) | ≈ 16 bits | 1.4 | 2.4 | 2.8 | 0.7 / 1.1 / 1.4 |
  | Chessmaster (2×2 chessboards, a lattice) | ≈ 16.5 bits | 2.4 | 3.3 | 5.6 | 0.8 / 1.3 / 1.7 |
  | Head Count (more of yours than the enemy's) | ≈ 15.5–18 bits | 2.7 | 2.7 | 4.1 | 0.9 / 1.3 / 1.6 |

  - The lattice gets about one more bit than the line at the same static rarity, which is the brittleness the owner
    saw in play-tests.
  - The geometric average is about half the m = n − 1 figure, because it gives the owner's own turns (m = 0, sure to
    hold) probability q. That is expected; the owner decided on m = n − 1.
  - The small contest simulation (40 events, owner's best single edit with probability 1/n, else one noise mutation) is
    too noisy at this size to rank the rules, but it shows the same order on average.

## 9. Stored data (widen → migrate → narrow)

| PR | Widen | Migrate | Narrow (a later PR, once dev and prod report `migrations:status` done) |
|---|---|---|---|
| 1 | agents: `decisionBits`, `perActFloorBits` optional; `breakdown` a union with {read, change}; `lastOpportunityWorld`, `skips` optional; events: `skip`, charge a union with {read, change, total} | `agentPricesV2`: drop decision/floor from `expectedActCost` and `breakdown` | require the new fields; drop the old ones. `perActFloorBits` and `agentBatteryActs` stay in settings (unused) until PR 3's settings migration |
| 3 | games: `settings.powerPerSecond` optional; agents: `powerShare` optional; deities: `account` optional | `powerV1`: as §6 | drop the old settings fields |

- Readers use the new shape with `??` fallbacks until the narrowing.
- A live game keeps ticking across each deploy. The tick reads only fields that exist in both shapes, and the
  migration runs after `convex deploy`.
- The event log bumps `EVENT_LOG_SCHEMA` to 5 for the new cost shape (`{read, change, total}`) and the `skip` event.
  Replay reads both shapes by schema.

## 10. PR plan

1. No fixed cost. Read metering (preludes and runtime, both languages), the Python source rule, the "skipped"
   outcome, selection by energy with the cap, and the UI, docs and assistant text for these.
2. Mutator costs: elementary and composite pricing, W + βW², Int `multiply` and digit adds, removing Int `set`, and
   the AI-facing incentive text ("prefer small incremental acts").
3. Power: shares, deity income, `allocatePower` (engine, MCP and UI), and the migration.
4. The My agents panel redesign (owner, 3 Nov):
   - label every number: power share, energy, read vs change spend, average per act;
   - drop the battery bar;
   - give the timeline a legend and row labels, name unnamed agents, and add hover Terms;
   - add a power slider.
5. Hold rarity.
