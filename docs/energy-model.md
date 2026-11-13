# The energy model: power, reads, mutators and selection (2026-11-05)

The owner's decisions of 3 Nov 2026, recorded in `docs/coordination/status.md` (branch `claude/jolly-hamilton-iuxff1`), as
one economy. This document is the specification; the code cites its sections. All numbers below are for the
"First steps" board, Grid(4, base10, rgb): 16 cells, S = 10 symbols, C = 3 colours.

Cost models (11 Nov 2026): a room prices change by one of two models, §4. "set-v1" (the default, and every number in
this document outside §4.5) charges every changed cell the same; "distance-v1" (§4.5, a room setting) charges a number
by how far it moved. The design behind it is [docs/mutation-cost-design.md](mutation-cost-design.md), which also
proposes dropping the read and summon prices: that part is not shipped, and reads and summons are priced as below.

## 1. Principles

1. **An act pays only for what it does.** It pays for the bits it reads (§3), the offer included (§7.1: being given an
   object is a read of which object it is), and for the change it makes (§4). There is no other per-act charge and no
   per-act charge for the agent's code. Code complexity is priced once, at summon (the
   ast-bits description length, unchanged).
2. **Looking is much cheaper than changing.** A bit read costs 1/κ of a bit changed (κ = `CHANGE_READ_RATIO` = 32,
   §2.1), and computing is free. Careful play (read the board, work out which change serves you without breaking the
   interests of the gods you share objects with, change only then) costs little more than blind play, so it pays.
3. **Change is priced by operations, superlinearly.** Every object type has a few *elementary mutators*, each with its own
   information cost w. A *composite* mutator (paint a row, ×2401) is priced as its decomposition into elementary ones.
   An act's W is the sum of its elementary costs, and its change cost is W + β·W². Small incremental acts are cheap.
   Radical acts are very expensive, so every object becomes an incremental battleground.
4. **Power, and a store in proportion to it.** Each deity has a fixed power budget (bits per world second). They split
   it between their agents and themselves, and can re-allocate at will (§6). Every account holds at most
   `fullChargeSeconds` of its own power (§6.1, 11 Nov 2026): energy fills up and then stops, so it is used or
   re-allocated, never hoarded.
5. **Selection by energy.** The chance that an agent gets the next mutation opportunity is proportional to its current
   energy (§7). An agent that reads a little and skips saves energy, so it is offered more opportunities.

## 2. The act charge

```
charge = R/κ + (the change commits ? C : 0)
R = the offer's bits (§7.1) + Σ distinct reads' information, in bits (§3)        C = W + β·W²,  W = Σ elementary costs (§4)
κ = CHANGE_READ_RATIO = 32                             READ_PRICE = 1/κ energy bits per bit read (§2.1)
```

Two units are kept apart by name in the code (`lib/game-types/src/pricing/measure.ts`): *bits read* (`readBits`, the
meter, `readBound`, `failedReadBits`, `expectedReadBits`) are information; the *read charge* (`readCharge`,
`ActCharge.read`, `expectedRead`, an agent's `breakdown.read` and `spentRead`, an event's `cost.read`) is energy. The
price is applied in exactly one place, `readCharge`, which `actCharge` calls; everything upstream of `actCharge` passes
bits.

| Outcome | What happened | Charge | Futility memo | Failure breakdown |
|---|---|---|---|---|
| transform | a change committed | R/κ + C | — | — |
| **skipped** | returned no calls (`[]` / `None`) | R/κ | not recorded | not counted |
| no change | calls whose net effect is nothing | R/κ | recorded (deterministic) | counted |
| invalid / error | a bad call, a raise, the step limit | R/κ (reads made before it stopped; a trap or the hard wall: the whole object, `readBound`) | recorded | counted |
| collision | the result is another object's value | R/κ | recorded | counted |
| commit clause kept it | `only_if_better` and no improvement | R/κ | recorded | counted |

R always includes the offer's bits (§7.1), so no outcome is free. A change that does not commit pays no change cost: the world did not change. A skip is a choice, not a failure. Calls
that cancel out are still "no change", a failure, because the agent asked for a change and nothing happened.

### 2.1 The read price κ (owner, 11 Nov 2026)

The owner wants analysis to be much cheaper than mutation, so that careful, coordinating strategies (change objects
towards one's goals without breaking the others' interests) are rewarded. Scaling every price together is the same as
scaling power, so the economy has one free dimension of price: the ratio between a bit changed and a bit read. A
committed change's bits stay the unit (so change costs, summon prices and power settings keep their meaning), and reads
are priced at a fraction of it:

- `CHANGE_READ_RATIO` (κ ≥ 1) in `lib/game-types/src/mutators.ts`, beside `CHANGE_BETA`: how many bits an agent may read
  for the price of one bit of change. `READ_PRICE = 1/κ`. κ = 1 was the economy until 11 Nov 2026; κ → ∞ makes looking
  free. It is a constant, not a room setting, so every room prices alike (as β).
- **The rule that sets κ = 32:** a complete look at the board costs less than the smallest change to it, on every
  shipped setup. Then "look at everything, then decide" is never the expensive part of an act. The binding case is
  Master; 32 is the next power of two above it, with margin. `lib/game-core/test/read-price.test.ts` checks the rule over
  `SEED_SETUPS`, so retuning κ or adding a bigger board shows it.

| Setup | Board | Full read R (bits) | Cheapest change C | κ the rule needs | Full read at κ = 32 |
|---|---|---|---|---|---|
| First steps | 4×4, base10, rgb | 78.5 | 11.5 (a colour) | > 6.8 | 2.45 |
| Annotated basics (the default) | 4×4, base10, mono | 53.2 | 16.3 (a symbol: w = 10.64) | > 3.3 | 1.66 |
| Classic, Low income | 5×5, base10, rgby | 133.1 | 14.3 (a colour) | > 9.3 | 4.16 |
| Big board | 6×6, base16, rainbow6 | 237.1 | 17.8 (a colour) | > 13.3 | 7.41 |
| Master | 7×7, cards, rainbow6 | 406.0 | 18.7 (a colour) | > 21.7 | 12.69 |
| (Int, 32-bit; not a seed) | | 32 | 2.2 (×−1) | > 14.5 | 1 |

- The meter, the observation's read helpers and the runtime still count bits of information; only the charge is scaled.
  The observation reports κ as `economy.changeReadRatio`, and the rules, primer, skills and My agents panel say "looking
  is 32× cheaper than changing".
- A game in progress across the deploy that introduced κ pays the new price from its next tick. Its earlier acts keep
  their recorded costs: the event log stores each act's `cost` and replay never recomputes it (schema 8 marks batches
  priced at κ = 32; schemas 5–7 priced reads at κ = 1, so their `cost.read` is also the bits read). Agents summoned
  before it keep their stored estimate (`expectedActCost`, `breakdown`), which overstates their reads until re-summoned;
  nothing is charged or scheduled from it (§5).
- **Selection.** An agent that looks and skips now keeps nearly all its energy, so it stays rich and is offered more
  opportunities. Its store is bounded by the capacity (§6.1) and each offer has a price (§7.1); the per-agent rate cap
  that bounded it when κ was introduced is gone (§7). The futility memo still applies.
- **As a room setting** (if the owner wants per-setup tuning): add an optional `changeReadRatio` to `GameSettings`
  (game-core settings, SETTINGS_DOCS, validation ≥ 1, the setup editor), have `tick.ts` and `pricing.ts` pass
  `readPrice: 1/settings.changeReadRatio` to `actCharge` (it already takes `readPrice`; `measureAgent` would need it
  too), report it in the observation from settings, and make the rules text read it. Existing games' stored settings
  would read it as `?? CHANGE_READ_RATIO` (widen; no migration needed for an optional field with a default), and the
  read-price rule test would check each seed's own κ.
- **Evidence** (`lib/game-core/scripts/balance-settings.ts --kappa κ`, 200 seeded games per row, 3 gods × 3 agents;
  "read" is the share of all energy spent on reading; wins are the share of games each policy won):

| κ | Acts/game, 3 greedy: First steps / Master | First steps wins, random / greedy / greedy | First steps wins, random / greedy / deny | Classic wins, r / g / d | Master wins, r / g / d | Energy on reading, First steps r/g/d / Master r/g/d |
|---|---|---|---|---|---|---|
| 1 (before) | 897 / 144 | 30 / 35 / 35 | 27 / 37 / 36 | 34 / 32 / 35 | 35 / 33 / 32 | 58% / 63% |
| 8 | 3750 / 810 | 25 / 37.5 / 37.5 | 24 / 34 / 43 | 28 / 35 / 37 | 34 / 32 / 35 | 30% / 45% |
| **32** | 5699 / 1642 | 22 / 39.5 / 39.5 | 19 / 36 / 45 | 28 / 35 / 37 | 31 / 36 / 33 | 12% / 23% |
| 128 | 6551 / 2212 | 22 / 39 / 39 | 20 / 36 / 45 | 31 / 35 / 34 | 32 / 35 / 33 | 3% / 8% |

  Win shares are from 1000 games (±1.5 points), acts from 200. Fair is 33. On the small boards the careful policies pull
  away from the blind one as reads get cheaper, and the opponent-aware "deny" policy gains most; the gain is mostly in
  by κ = 8–32 and flat after. On Master (and Classic at κ = 128) the abstract world's edits are too coarse for reading to
  separate the policies much: this harness models a look as all-or-nothing and the goals as random draws, so it bounds
  the effect from below rather than measuring play with real goals. Acts per game rise 4–11×, because agents that look
  and skip keep their energy (the 4 Hz cap of the time and `interactionRateHz` bound it).

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
| Never looks (always `paint(cell(0,0), "red")`) | — | 0 (plus the offer's bits, as every row: §7.1) |

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

One rule holds in every room: **a move costs the changes it makes, cell by cell.** An act's W is the sum, over its
calls, of the work of each site (a cell's number, a cell's colour, an Int's digit place, a string's character) the
call's net effect changed, whatever mutator did it, and the act pays C = W + β·W² (§4.3).

What one changed site costs is the room's **cost model**: the optional room setting `settings.costModel`, shown to
clients as `economy.costModel`. Absent means "set-v1", so games and settings stored before cost models existed read as
before.

- **"set-v1"** (§4.1, §4.2, §4.4): a value is overwritten. Every changed cell costs the same, however far its value
  moved. Every object type supports it.
- **"distance-v1"** (§4.5): a number is moved. It pays for how far it went; a colour or a card's suit pays a flat
  price for having changed. Grid supports it; Int and string rooms stay on set-v1.

A cost model changes what a change costs, never what a call does. `applyCalls(typeDef, inst, value, wire, model)`
prices an act under a model, `objectType(t).costTable?.(inst, model)` lists a type's one-cell moves with their W,
and `changeCost(W)` is C (`lib/game-types/src/structure/index.ts`, `mutators.ts`). The texts that explain cost to
players and AIs take their numbers from these (`lib/game-core/src/change-cost.ts`).

### 4.1 Elementary mutators and their information cost w (set-v1)

w is the surprisal of the call's parameters under the maximum-entropy prior on them, plus, for an overwrite, the bits
it erases (pointwise: log2 of the preimage size). There is one op-choice bit per call (log2 of the number of elementary
ops for the type, which is 2 for each type below).

A **mono** Grid (one colour, numbers only, 11 Nov 2026) has no colour to set, so its only elementary op is "set a
symbol" and naming it costs log2 1 = 0 bits: w_symbol = log2 N² + 2 log2 S, which on 4×4 base10 is 4 + 6.64 = 10.64 bits
(C = 10.64 + 0.05 · 10.64² = 16.3). Its colour layer reads 0 bits, `paint` to its one colour is a no-change (W = 0), and
the mutators that need a choice of colours (recolour, trade colours, majority vote, paint by number, stamp, count the
mines) are not offered.

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

- **Grid (set-v1):** W(call) = Σ over cells whose colour changed of w_colour + Σ over cells whose symbol changed of w_symbol.
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

### 4.4 Worked examples (set-v1, β = 0.05)

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

### 4.5 The distance model (distance-v1, 11 Nov 2026)

Under distance-v1 a mutator is a cost function, not a constant. Each value layer of a site has one *generator*, the
elementary move on it, and the work of moving one site from a to b is

```
w(a → b) = ℓ_where + ℓ_which + λ · d(a, b) + ε
```

- **ℓ_where** = log2(number of sites): on a Grid, log2 of the number of cells.
- **ℓ_which** = log2(number of generator families the type offers here). A family is a kind of thing a cell has that
  can change: a numbers-only board has 1 (its numbers: 0 bits), numbers with colours 2 (1 bit), cards with colours 3
  (rank, suit and colour: 1.585 bits). A layer with one value (a mono board's colour) is no family.
- **d(a, b)** = the fewest generator steps from a to b. Numbers (digits 0–9, base 12 and 16, card ranks A–K) are a
  *slider*: the generator is ±1 without wrap, so d = |b − a|. Colours and suits are *categorical*: any change is one
  step.
- **λ** is the rate at which the generator's argument code is complete with no constant: the Kraft root of
  Σ over every non-identity argument of 2^(−λ·d) = 1 (`kraftRate`). It follows from the argument space and **is not
  tuned**. On a slider it is log2 3 = 1.585 bits per step (each further step is one of three continuations: stop, or
  one further either way). On a categorical layer of n values it is log2(n − 1), the bits to name one of the others.
- **ε** = the bits the move erases (log2 of the preimage size). Every distance-v1 generator is a bijection, so ε = 0:
  nothing is paid for erasure, where set-v1 pays log2 n for the value it overwrites.

So on a Grid, per changed cell:

| Change | w |
|---|---|
| a number moved by k steps | log2 N² + log2 families + 1.585·\|k\| |
| a colour changed (C colours) | log2 N² + log2 families + log2(C − 1) |
| a card's suit changed | log2 N² + log2 families + log2 3 |

**Every mutator is priced by its net effect on each changed cell**, as under set-v1 (§4.2): the sum over cells of the
work of how far each cell's number moved, plus a flat price for each colour or suit that changed.

- `write(cell, 7)` on a 5 costs what `add(cell, 2)` costs.
- `count_on` wraps: taking a 9 round to 0 moves the number 9 steps and pays for 9.
- Rows, slides, reversals and swaps pay for each cell by how far its number moved; a cell whose number did not change
  pays nothing.
- A card whose rank and suit both change pays for both.

**`add`** is a mutator in every Ranked Grid's prelude, under both models: Python `add(where, amount=1)`, TypeScript
`add(where, amount = 1)`. It adds `amount` to every number in a cell, row, column, square, ring or everything. It never
wraps: if any number would leave the range (9 + 1), the act fails. Under set-v1 it is a composite priced like any other
symbol change; under distance-v1 it is the generator the numbers are priced by.

**The beginner board** (4×4, numbers only: 16 cells, 1 family), w = 4 + 1.585·|k|:

| move one number by | ±1 | ±2 | ±3 | ±4 | ±5 | ±6 | ±7 | ±8 | ±9 |
|---|---|---|---|---|---|---|---|---|---|
| W (bits) | 5.58 | 7.17 | 8.75 | 10.34 | 11.92 | 13.51 | 15.09 | 16.68 | 18.26 |
| C = W + 0.05·W² | 7.1 | 9.7 | 12.6 | 15.7 | 19.0 | 22.6 | 26.5 | 30.6 | 34.9 |
| set-v1 (any change) | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 |

A nudge costs 0.44× a set-v1 change, ±4 about the same, and ±5 and beyond more.

**Other boards** (one cell, as an act of its own):

| Board | Change | W | C | set-v1 C |
|---|---|---|---|---|
| 4×4 base10 mono | `add(row(2), 1)`: four numbers by 1 | 22.3 | 47.3 | 133 (4 symbols) |
| 4×4 base10 rgb (2 families) | a number by ±1 | 6.58 | 8.8 | 18.4 |
| 4×4 base10 rgb | a number by ±2 | 8.17 | 11.5 | 18.4 |
| 4×4 base10 rgb | a number by ±9 | 19.26 | 37.8 | 18.4 |
| 4×4 base10 rgb | a colour (4 + 1 + log2 2) | 6.00 | 7.8 | 11.5 |
| 5×5 base10 rgby | a number by ±1 | 7.23 | 9.8 | 19.8 |
| 5×5 base10 rgby | a colour (log2 25 + 1 + log2 3) | 7.23 | 9.8 | 14.3 |
| 6×6 cards rainbow6 (3 families) | a rank by ±1 (5 → 6) | 8.34 | 11.8 | 33.0 |
| 6×6 cards rainbow6 | a suit (♠ → ♥) | 8.34 | 11.8 | 33.0 |
| 6×6 cards rainbow6 | a colour (log2 36 + log2 3 + log2 5) | 9.08 | 13.2 | 17.8 |
| 6×6 cards rainbow6 | 5♠ → 7♥ (rank by 2 and suit) | 18.26 | 34.9 | 33.0 |
| 7×7 cards mono (2 families) | a rank by ±1 | 8.20 | 11.6 | 31.5 |

**Three variants** are declared beside distance-v1 (`COST_MODELS`), each differing from it in one declaration; everything
above holds for them except as said:

- **"dial-v1"**: numbers are a *dial* (cyclic: 9 and 0 are one step apart), so d is the shorter way round and a wrap
  pays one step. λ is the Kraft root of the dial's argument space (1.577 on ten digits). ±5 is the farthest move.
- **"log-v1"**: numbers are a slider, but the argument code grows with log2 d: the maximum-entropy code with a fixed
  mean of log-distance, P(k) ∝ |k|^−2 (w = ℓ_where + ℓ_which + log2 Z + 2·log2 |k|). Each doubling of the distance costs
  2 bits, so a far move costs little more than a middling one (beginner board: ±1 7.2, ±2 10.5, ±9 19.1).
- **"multiply-v1"** (boards of the digits 0–9 only): the number layer has a second generator, multiply modulo the base, and a
  number's move costs the cheaper of the two plus ℓ = 1 bit to say which. ×m is named by its magnitude: λ×·log2 m with
  ×0 read as ×base, λ× = 1.496 on ten digits (the Kraft root over m = 0, 2 … 9), and it erases ε = log2 gcd(m, base)
  bits, since it merges that many numbers into one (×2: 1 bit; ×5: 2.32; ×0: 3.32; ×3, ×7, ×9 erase nothing). The room
  offers `multiply(where, by)` and `divide(where, by)` (÷u is × the inverse of u: only 3, 7, 9 on digits). Beginner
  board: +1 is 6.58 bits (8.8 energy; the extra bit), ×3 is 7.37 (10.1) whatever it moves, ×0 is 13.29 (22.1). The
  price stops being a distance on the number line: 43 of the 90 digit pairs are cheaper than their add (3 → 9 costs a
  ×3, not a +6), and a → b need not cost what b → a costs. A cell pays its cheapest ROUTE (0 → 9 is +1 then ×9, two
  located steps, 16.33 bits, not a +9 at 19.26), so one call never costs more than calls that do the same.

**Where a model is offered.** The rule of §2.1 (a complete look costs less than the smallest change) is kept under every
model: a room may choose a model only where it holds for that board (`supportedCostModels`, checked by
`validateSettings`). Distance pricing makes the cheapest change cheaper, so on the biggest boards, where a look is
dearest, it is not offered (7×7 cards in six colours: a colour change would cost 12.64 against a look of 12.69).

**The noise follows the model.** Hold rarity's mutation noise (§8) is one move drawn with probability ∝ 2^−C. Under
distance-v1 it draws a uniform cell and then one generator argument (a number by ±k, a suit or a colour to one of the
others) with weight 2^−C(w), so a small step is likelier than a far one; a number move that would leave the range leaves
the board as it is, like `add`. Hold tables are cached by `noiseVersion(model)`: set-v1 keeps `NOISE_VERSION`, so its
tables stay valid, and distance-v1 has its own.

The invariants a cost model must keep (docs/mutation-cost-design.md §5.5): the identity costs 0, every generator's
Kraft sum is 1, a composite never costs less than its net effect, and set-v1 prices are unchanged.

## 5. What the agent is told at summon

- Validation and summon run the agent on the reference mixture, as today. They report:
  - the summon price (description bits);
  - the estimated cost per act: the mixture mean of R/κ + C over runs that would commit, with R/κ alone for the rest;
  - the read/change split, in energy (and, in the diagnostics, the bits read behind it);
  - the skip, change and failure rates.
- These are estimates for the UI and the assistant. Nothing is charged or scheduled from them.
- The decision information I(X; A) is no longer estimated or charged; its estimators are deleted.

### 5.1 The summon price is language-fair (13 Nov 2026)

The summon price is the description length of the program's syntax tree: `ast-bits-v1` for Python, `ts-ast-bits-v1-uniform`
for TypeScript (lib/game-runtime). Both code the tree's structure, its names and its literals. Names and literals use
the same codes and agree within about 10%. The structure codes differ: Python's is weighted by a corpus (common nodes
are cheap), TypeScript's is uniform over node kinds, so the same program's structure cost 2.0–2.6× more in TypeScript
and its whole price 1.5–2.1× more. With a 1,920-bit store that put every strategy past plain greedy out of reach in
TypeScript only: an advantage by language, not by program.

**The fix:** an agent's structure bits are multiplied by its language's `structureWeight` (game-core `LANGUAGE_SPECS`,
`fairSummonBits`; the engine's `summonPrice` applies it): Python 1, TypeScript 0.44. The weight is the ratio of the two
structure codes pooled over ten programs written in both languages (four small ones and the six coordination policies:
Python 3,810 structure bits, TypeScript 8,664). It is one number per language, derived from the two grammars' codes on
paired programs; it is not fitted per program. `artifacts/engine/scripts/language-price.ts` prints the table:

| Program | Python | TypeScript before | ratio | TypeScript now | ratio |
|---|---|---|---|---|---|
| skip always | 24.7 | 36.6 | 1.48 | 16.7 | 0.67 |
| one fixed write | 73.1 | 113.9 | 1.56 | 64.3 | 0.88 |
| loop and if | 119.2 | 190.7 | 1.60 | 108.2 | 0.91 |
| sum, then act | 184.6 | 291.5 | 1.58 | 171.3 | 0.93 |
| policy: random | 142.6 | 304.2 | 2.13 | 177.9 | 1.25 |
| policy: greedy | 737.9 | 1319.7 | 1.79 | 774.0 | 1.05 |
| policy: considerate | 1179.2 | 2019.3 | 1.71 | 1203.6 | 1.02 |
| policy: payoff | 1599.4 | 2646.8 | 1.65 | 1651.4 | 1.03 |
| policy: cooperator | 1796.9 | 2916.7 | 1.62 | 1821.8 | 1.01 |
| policy: deny | 1611.7 | 2660.7 | 1.65 | 1659.2 | 1.03 |

Every policy now fits a god's store in either language. What remains: very small TypeScript programs come out cheaper
than Python's (a uniform code has less fixed overhead), and the "random" policy 25% dearer (its TypeScript names cost
more). A corpus-weighted TypeScript code would remove the weight altogether; it needs a corpus of agents that does not
exist yet.

**Stored data and existing rooms.** Nothing stored changes: an agent keeps the price it paid (`agents.summonCost`, the
summon event), replays show recorded prices, and the price function ids are unchanged. From the deploy on, a TypeScript
summon or validation in any room, a game in progress included, is priced with the weight (cheaper than before); Python
prices do not move. The validation's `parts.structure` is the weighted figure, so the parts still add up to the price.

### 5.2 Replacing a program (13 Nov 2026)

One rule: **replacing a program costs what summoning it would; everything else stays.** The command
`{ type: "replace", agentId, language, source, description? }` is examined and priced exactly as a summon of the same
program (the same sandbox runs, the same refusals when the god cannot pay, the same warnings, the same rate limit), and
the god pays that price from its own energy. The agent keeps its id, name, power share and account: its stored energy
or its debt, untouched (the account is not even settled, so no capacity is applied at that moment). Its acts, skips
and spending stay too; no power moves, so no other account changes.

What described the old program is replaced with the new program's: source, language, `summonCost`, `expectedActCost`,
`breakdown`, `randomized`, and the description when one is sent. The counts of how its acts ended (`transforms`,
`failures`, `lastFailures`, which make the owner's diagnosis) start again, and so does the memo of the objects the old
program could only fail on. A tick window in flight is discarded (the execution epoch is bumped), so no act of the old
program is counted against the new one.

Why a command and not destroy-then-summon: the two-step route returned the share to the god, re-allocated it to a new
agent that started empty, and (before energy moved with power, §6.1) threw away the energy the agent held and reset its name; the god paid for a program
change with a full store as well as the price. With one command, code size keeps mattering (the price is the summon
price, no discount), and nothing about power or agent count changes, so agent-count neutrality (§7) and the debt rule
(§7.2) are untouched: the command moves no power and no debt.

The log records it (`replace`, `EVENT_LOG_SCHEMA` 14; the players' event is `agent.replaced`, the owner's own while the
game is live); a replay charges the recorded price to the god and swaps the agent's program at that point.

## 6. Power (PR 3)

- `settings.powerPerSecond` (P, bits per world second) is each deity's fixed budget. Defaults: 8; Grid 64 (two agents
  at the former 32 bits/s); the "Low income" seed 32.
- Each agent has a `powerShare` s ∈ [0, 1]. A deity's shares sum to at most 1 (`deities.allocated`).
- An agent earns s·P per world second. The deity earns (1 − Σs)·P into its own world-time account (`deities.account`),
  which starts at `startingEnergy` (default 200) and pays summon prices.
- A summon may name the new agent's share (`powerShare`); by default it gets half of what is unallocated
  (`defaultShare`), so the deity keeps the other half for later summons. The agent starts with 0 energy.
- Every account holds at most `fullChargeSeconds` of its power (§6.1).
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

### 6.1 Capacity (owner, 11 Nov 2026)

The owner: "If we don't already have an energy capacity cap we need one as a function of power. Let's add a setup
parameter for the time to full energy storage with no spending." Without one, an agent that looks and skips and a god
that keeps power unallocated both grew without bound; the god's balance soon made summon prices, and so program size,
irrelevant.

- **The setting.** `settings.fullChargeSeconds` (T, world seconds; default 30, from 1 to 1,000,000; `SETTINGS_DOCS`, the
  configuration page's energy section).
- **The rule.** An account holds at most its power × T: an agent's capacity is s·P·T, the deity's own (1 − Σs)·P·T. One
  formula for every account, whatever the number of agents: a deity's accounts together hold at most P·T.
- **In the formula, not in a write.** `settleAgentEnergy(account, world, income, capacity)` is
  `min(capacity, balance + income·Δt)` (game-core `energy.ts`; `energyCapacity` gives the capacity). Accounts are settled
  lazily at world time, and every reader goes through that function (`lib/world.ts settledAccount`,
  `lib/power.ts deityAccount`, the replay's `settleAccount`), so nothing is written when an account fills (CLAUDE.md:
  no hot writes).
- **Income past a full store is lost.** It is not kept, and it does not overflow to another account.
- **Energy moves with power (owner, 13 Nov 2026).** Lowering an account's power lowers its capacity, and what it
  holds above the new capacity goes to the account that gained the power: to the deity's own account when an agent's
  share is lowered or the agent is destroyed (all of its power moves, so all it holds does), to the agent when a summon
  or a raised share takes power from the deity. It always fits: the receiver's capacity rises by exactly what the
  giver's falls, and the giver held at most its old capacity. So a re-allocation loses nothing, and a deity's accounts
  together never hold more than P × T, however many agents there are. This is the same rule as debt (§7.2), in one
  sentence: **what an account holds or owes beyond what its power supports goes where the power goes.** Both accounts
  are settled at the old shares first. Game-core `movePower` computes it; the `summon`, `power` and `destroy` events
  record the amount (`held`, `EVENT_LOG_SCHEMA` 15; positive onto the deity, negative onto the agent), the receipt
  carries it, and a replay applies the recorded amount. Batches below 15 lost that energy, and replay them so.
  Until 13 Nov the excess was dropped at once; that behaviour is the variant named in `docs/design-explorations.md`.
  - *Why not keep the excess and only stop filling?* A deity could fill one agent at 100% of its power, move the power
    to the next and fill that: one full store per agent, an advantage from the number of agents (§7).
  - *Funding summons.* An agent's energy can now come back to its deity and pay for a summon, where before only
    unallocated power did. Parking energy in an idle agent is never better than keeping the power unallocated: the idle
    agent pays the offer price (§7.1) on every offer it is given. `balance-settings.ts --parking`, half the power for
    T seconds: kept unallocated the deity has 960 bits in every Grid room; parked and taken back it has between 960
    (the agent was offered nothing) and, if the agent were given every opportunity in the game, 882 (92%) in the 25 Hz
    rooms, 812 (85%) in First steps, 367 (38%) in Classic, Big and Master, and in Low income (where those offers cost more than the
    agent earns) it takes back a debt of 14 where keeping the power gave 480. What is new is only
    that the energy a *working* agent happens to hold comes back when its power does; in the shipped rooms agents
    spend income as it arrives, so that is little. Keeping power unallocated is still the only way to *earn* toward a
    summon without paying for offers.
  - *Balance.* `balance-settings.ts --T 30 --no-cap --offer --debt-bound`, with and without `--moves`, 200 games per
    seed setup, three greedy gods: first-seat win share in Classic 38% before and 34% after, last seat 31% and 33%
    (fair 33%; one seat's share moves about ±3 points between runs of 200); acts per game 3,472 and 3,497. No setup
    moves by more than that noise. The harness models summons only (a god's excess at a summon goes to the new agent);
    its policies never re-allocate.
- **Planning.** World time is stopped, so nothing accrues, but the capacity holds: the deity starts with
  min(`startingEnergy`, P·T), and each planning summon lowers its capacity with its unallocated power (what it holds
  above that goes to the summoned agent). With the default
  shares (half of what is unallocated) a Grid deity (P = 64, T = 30) holds at most 1920, then 960, 480, 240 bits.
- **A summoned agent starts with what its deity held above its lowered capacity**, usually nothing. Destroy and
  re-summon is not a source of energy: the total the deity's accounts hold is unchanged by either.
- **Debt** (a balance below zero after an act that cost more than the agent had) is repaid from income first, as before.
- **Why 30 seconds** (`lib/game-core/scripts/capacity-experiments.ts`; tables in `docs/energy-capacity-evidence.md`).
  - In every shipped room agents spend income as it arrives, so no agent store fills and acts, skips and win shares are
    the same at every T from 5 to 300: T is free to be set by the other concerns.
  - Hoarding: the active gods keep 99% of their acts at T = 30, 98% at 60, 95% at 120, 89% at 300 (§7.1).
  - Code size: the largest program a deity can buy is (unallocated power) × T. At 30 s the owner's 1,137-bit agent needs
    59% of the power kept back (30% at 60 s, 15% at 120 s), and a 400-bit agent 21%: size is a real trade against the
    agents' power. At 120 s and more it is not.
  - Agents can still store a mid-sized change: the smallest default agent (an eighth of the power) holds 240 bits, 2.8
    row repaints on 4×4; a half-share agent 960. At 5 s the eighth holds 40 bits, less than one row.
  - Low power needs longer: with P = 8 (Int and string worlds) a 30-second store holds 240 bits, and after the first
    default summon 120, less than what is left of the 200 starting bits. Those worlds default to 60 s (`TYPE_DEFAULTS`,
    13 Nov 2026); a test checks that every world's defaults keep the starting energy through two default summons.
- **Starting energy on the Grid setups is 600** (13 Nov 2026; it was 200). A new player's first agent must be payable in
  planning, when nothing accrues: the dearest shipped Python example agent for a beginner rule costs 572.2 bits
  (`BEGINNER_AGENT_BUDGET_BITS`, 573). 600 is under the planning store (1,920), and after a first summon at the default half
  share the god's own 32 bits/s pays for the same agent again in 17 s (its store, 960, is full within the first
  minute). Code size still matters: that agent is 15% of the god's whole first minute of power (573 of 3,840 bits), a
  typical 250-bit example 6.5%, and nothing over 960 bits can be bought while half the power is with an agent. Low
  income (P = 32) holds 480 after a first summon, so there the dearest example is a first agent only. Rooms and setups
  already stored keep the starting energy they have.
- **A beginner's first agent from the forge** (13 Nov 2026; the engine's default is unchanged). On a beginner rule on the
  beginner board (game-core `isBeginnerGoal`), the forge summons the first agent with `firstAgentShare`: as close to
  three quarters of the power as still leaves the god's own store able to hold the dearest agent it may want next (the
  dearest starter, 573, or a dearer one being summoned), so a Replace with any starter is never refused for good. On
  Annotated basics that is 0.701562 (store 573). Every other summon, and every other setup, sends no share and takes
  the default half of what is free. `artifacts/engine/test/unit/example-agents.test.ts` derives the bound from the
  starters' real prices.
- **What a deity can afford.** A summon is paid from the deity's own account, so the largest program a deity can ever
  buy costs (unallocated power) × T. With all power allocated the deity's account holds nothing, and a refused summon
  says how much it can hold. Keeping power back for later agents is now a real choice against giving it to agents.

  | Unallocated power (P = 64, T = 30) | The deity's own capacity | Refills from empty in | Programs it can buy |
  |---|---|---|---|
  | 100% | 1920 bits | 30 s | any shipped so far (the owner's 1,137-bit agent included) |
  | 50% | 960 bits | 30 s | up to 960 bits |
  | 25% | 480 bits | 30 s | up to 480 bits |
  | 10% | 192 bits | 30 s | small agents only (a one-move agent is about 60 bits) |

- **Stored data.** `fullChargeSeconds` is one more settings field (`settings` is stored as-is), so nothing reshapes.
  Rooms and setups stored without it get the default when read (`upgradeStoredSettings`). **A game already started
  keeps the economy it was charged with**: `upgradeStoredSettings(settings, played = true)` (the setups migration's
  games phase, command examination) does not fill it, the engine reads the game's own settings, and
  `energyCapacity(income, undefined)` is Infinity. So a game in progress across the deploy plays on without a capacity,
  and an older game's replay shows the balances it had. The observation reports `economy.fullChargeSeconds`,
  `self.capacity` and each agent's `capacity` only when the game has one.
- **Charging the god's account.** `chargeDeityAccount(account, bits, world, power)` (game-core, pure: settle within the
  capacity, then deduct; throws "Insufficient energy") and `chargeGod(ctx, game, deity, bits)` (engine `lib/power.ts`:
  writes `deities.account` and `deities.spent`, returns the new balance or null) are the one way to charge it for
  anything other than a summon.

## 7. Selection: energy only, however many agents hold it (11 Nov 2026)

The owner: "We want agent impact to be a function of power assigned to that agent and for the discrete quantity of
agents to offer no opportunity for advantage."

- Opportunities stay a room-wide stream of `interactionRateHz` per world second.
- Each opportunity picks an object as today ("uniform" or "shelter"). It then picks an agent with probability
  proportional to max(0, energy): **one draw over every agent in the room**. An agent with no positive energy is not
  picked, and the opportunity passes if no agent has positive energy. Balances may go negative, because spend varies
  per object.
- There is no eligibility threshold, no battery and **no limit per agent**. A god's chance of the next opportunity is
  the energy its agents hold together over the room's total, so it does not matter how that energy is split.
- **Agent-count neutrality is an invariant with tests.** For any split of a power budget over n agents running the same
  program, the god's expected offers, acts and energy spent are those of one agent with the whole budget
  (`lib/game-core/test/energy.test.ts`, with capacity binding, with energy binding and with no capacity; six seeds,
  uneven splits included; a companion test re-creates a per-agent limit and checks that the test sees it;
  `artifacts/engine/test/game-energy.test.ts` plays one agent with 80% against four with 20% each on the real tick).
- **What bounds an agent that looks and skips** is the capacity (§6.1), in proportion to its power, and the price of
  each offer (§7.1). Its store cannot exceed s·P·T, so the others need only hold a comparable amount to be offered
  their share; they then act as often as their income allows.
- The futility memo still keeps agents off pairs where they can only fail.
- A cheap skipper runs more often than an expensive actor with the same income: its balance stays high. This is a unit
  test (`lib/game-core/test/energy.test.ts`).

### 7.1 The price of an offer (owner, 11 Nov 2026)

The owner: "Choosing not to mutate after analysing a board should be an approved strategy for gaining higher leverage
impact by spending one's energy more wisely. Although it does seem appropriate for it to cost something so that
arbitrary hoarding of energy can't saturate access to mutation opportunities", and "we want it to cost something (though
much less than mutation) to get exposure to mutation opportunities."

- **The rule.** Being offered an object tells the agent which of the live objects it holds: log2(number of live
  objects) bits (`offerReadBits`, game-core). The tick adds those bits to what the act read, so they are charged at the
  read price like any other read, on every offer, whether the agent then looks at the object, changes it, skips or
  fails. It is not a new kind of charge: it is inside `cost.read` (and `spentRead`), and `EVENT_LOG_SCHEMA` 10 marks it.
  An act the host could not run is not charged, as before.
- **Size.** With 80 objects it is 6.3 bits read, 0.198 energy bits: 1.1–1.7% of the cheapest change on the Grid seeds,
  and 1.6–8% of a full look at the object.

  | Seed | Objects at the start | Offer price | Cheapest change C | Offer ÷ C | Offer ÷ a full look |
  |---|---|---|---|---|---|
  | First steps | 80 | 0.198 | 11.5 | 1.7% | 8.1% |
  | Annotated basics | 10 | 0.104 | 16.3 | 0.6% | 6.3% |
  | Classic, Low income | 80 | 0.198 | 14.3 | 1.4% | 4.8% |
  | Big board | 80 | 0.198 | 17.8 | 1.1% | 2.7% |
  | Master | 80 | 0.198 | 18.7 | 1.1% | 1.6% |

- **The summon-time estimate** (`expectedActCost`, `breakdown.read`) includes the offer, at the number of objects the
  game holds when the agent is validated or summoned (the examination measures the act alone; `game/commands.ts` adds
  it). So an agent that reads nothing and skips is told about 0.2 bits per act, which is what it pays, not 0.
- **Is it enough against hoarding?** With the capacity, yes; and it is the capacity that does the work. The experiment
  (`lib/game-core/scripts/capacity-experiments.ts`, First steps, 100 games per row): one god's three agents read
  nothing and never act; the other two gods play greedy.

  | T | Rate cap | Hoarder's share of the 25 Hz stream | What it pays | Its store | The active gods' acts, against the same room with an ordinary third player |
  |---|---|---|---|---|---|
  | 30 s | none (shipped) | 69% | 4.2 bits/s (7.5% of its agents' income) | 1,679 bits | 99% |
  | 60 s | none | 70% | 4.2 bits/s | 3,359 | 98% |
  | 120 s | none | 70% | 4.2 bits/s | 6,719 | 95% |
  | 300 s | none | 72% | 4.4 bits/s | 16,749 | 89% |
  | no capacity | none | 74% | 4.5 bits/s | 23,252 and growing | 84% |
  | no capacity, no offer price | 4 per agent per second (before) | 48% | 0 | 25,207 and growing | 100% |

  The hoarder takes most of the stream because nobody else can use it: at 25 Hz the active gods can pay for about 6
  acts a second between them, and they still get them. They hold about 370 bits each to stay in the draw (well inside
  their capacity). In a scarce stream (4 Hz) every store is full, the stream splits by power (the hoarder gets its
  34%), and the active gods act as often as against an ordinary third player (98–99%). So a hoarder cannot saturate
  access; what it can do is waste its own share, for a price. Without a capacity it could tax the others 16–18% for
  ever, which is why the rate cap can only go once the capacity is in.
- **If a higher price is ever wanted**, the principled next step is to charge the whole draw (which object and which
  agent: log2 objects + log2 of the room's agents with energy), not a per-agent rule. The measurements above do not call
  for it.

### 7.2 Debt: at most a full store, and it moves with power (13 Nov 2026)

A balance may go negative: an act's cost is known only after it has run. Until this rule the debt had no bound and
was per agent, not per unit of power: an agent with 0.1 bits could commit a 985-bit repaint of a 4×4 grid, n agents
could owe n such acts, and the debt could be left unpaid by destroying the agent (re-summon: about 60 bits) or by
giving its power to another agent. That was free energy, on develop and in production.

One principle: **what an account owes is repaid by the power it holds.** Two consequences, both in terms of power:

- **An account may owe at most what it can hold** (its capacity, s·P·T), so its debt is always repayable within T
  seconds by its own income. A change that would leave the agent owing more does not commit: the act fails as "could
  not afford this change: it costs X bits, the agent had Y and may owe at most Z" (`failures.unaffordable`), pays its
  reads like any change that does not commit, and is not remembered as futile (it commits once the agent holds more).
  game-core `actCredit` and `affordable`; the tick applies them.
- **Debt moves with power** (game-core `movePower`). When power is taken from an agent that owes (its share is
  lowered, or it is destroyed), the same fraction of its debt moves onto its god's own account: a god's own energy can
  therefore be negative, and until its own income has repaid it the god cannot pay for anything (a summon, a look).
  When a god that owes gives an agent power, the agent takes the same fraction of the god's debt as it takes of the
  god's unallocated power. Energy moves by the same rule (§6.1: what an account holds above a lowered capacity goes with
  the power); neither is ever lost. The `power` and `destroy` events record what moved (`owed`, `EVENT_LOG_SCHEMA` 13), the command's
  receipt says it, and the replay applies the recorded amount.

There is no rule about what an agent in debt may not do, and no special state: an agent in debt is simply not in the
draw (its weight is zero), as before.

**What this gives.**

- Destroy and re-summon gains nothing: the debt is the god's, and the god cannot summon until it is repaid.
- Moving power between agents gains nothing: the debt arrives with the power (`lib/game-core/test/energy.test.ts`:
  over random re-allocations the total owed never changes, and no account without power ever owes).
- Credit is a function of power: a god's accounts together can owe at most P·T, however many agents hold it. The
  agent-count property test (§7) now includes a program that acts on credit.
- The largest change an agent can ever make costs its capacity plus what it holds: at most 2·s·P·T. A whole 4×4 grid
  (985 bits) needs a share of at least 26% at P = 64, T = 30.
- Play is unchanged where it was sound: in the balance harness the bound changes no act count or win share on any
  seed (`balance-settings.ts --T 30 --no-cap --offer --debt-bound`, 100 games per row: identical to the unbounded
  rows), because agents there never owe more than a store.

**What it costs.** An agent whose changes cost more than it can hold (more than s·P·T) must save before it can act,
and in a busy room its turns keep coming while it saves, each one costing its reads: it is mostly refused. That is the
agent's impact following its power, and the diagnosis says so ("give it a bigger power share, or make each act change
less"). The same mechanism is why having no credit at all does not work (`variant/no-credit`, #293): there, every
agent that looks before acting is in that position, and the harness shows 0 changes per game in the 100 Hz rooms
(Classic 3,476 → 0, Big 2,416 → 0, Master 1,635 → 0).

**Alternatives kept as branches.** `variant/debt-within-capacity` (#292: the same bound, but an agent in debt cannot
be destroyed or given less power, a rule about a state); `variant/no-credit` (#293).

A game without capacity (started before the setting) keeps its old behaviour. Stored data:
`agents.failures.unaffordable` and the events' `owed` are optional (absent reads as 0 / nothing moved); nothing migrates.

Tests: game-core (`affordable`, `movePower`, conservation under random re-allocation, neutrality with credit); engine
unit (the failure kind and its diagnosis); replay (the recorded amount); `test/game-power.test.ts` on the real tick (a
5% agent is refused a change a 90% agent commits; no account owes more than its capacity; half the power takes half
the debt; a destroyed agent's debt lands on its god, who cannot summon until its income has repaid it).

**What was removed, and why.** Until 11 Nov 2026 two limits were per agent, so a god gained turns by running more
agents with the same power:

| Per-agent limit | Where | Effect |
|---|---|---|
| `MAX_AGENT_OPPORTUNITY_HZ` = 4 offers per world second per agent | game-core `offerable`, `lib/world.ts agentStatus`, `agents.lastOpportunityWorld` | n agents could take 4n offers a second. Measured (balance harness, skippers, 25 Hz): 4.0, 8.0, 12.0, 18.7 offers/s for n = 1, 2, 3, 5 with the same power; now 18.5 at every n |
| An agent with an act in flight was left out of the next draws of the tick's wave (up to 16 concurrent acts) | `engine/tick.ts` | the rest of the wave went to the other agents with probability 1: one rich agent got at most one offer per wave, the same energy over n agents up to n |

The cap was built for the agent that reads nothing and skips ("it would keep all its energy and take nearly every
opportunity"); the capacity now bounds that store in proportion to power instead. The tick still never runs one agent
twice in a wave: an agent in the wave stays in the draw at the energy it had before its act in flight; when it is drawn
again the wave is applied first (so that act is charged), the offer stays with it with probability (its energy now) ÷
(the energy it was drawn at), and otherwise the draw is repeated on the settled world: each agent's chance is its
settled energy over the room's, exactly as if acts ran one at a time. The room's sandbox work is bounded by `interactionRateHz`, as before.
`agents.lastOpportunityWorld` stays in the schema as history (no longer read or written); the observation no longer
reports `economy.maxAgentOpportunityHz` (a replay of an older game still does). `EVENT_LOG_SCHEMA` 10 marks the change.

**Per-agent quantities that remain** (none is an advantage in turns): `maxAgentsPerGod` (a limit); the summon price
(each program is priced by its own description, so n small programs cost what their lengths cost, plus each one's own
boilerplate: never cheaper than one); the futility memo (per agent and object: n copies of a deterministic agent each
fail once on an object before being kept off it, and pay their reads). Debt is bounded by power and moves with it (§7.2).

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

- **Narrowed** (5 Nov, after dev and production reported both done): agents' `powerShare` and `breakdown` {read, change}
  and deities' `account` and `allocated` are required; `decisionBits` and `perActFloorBits` left the agents validator;
  lib/power.ts's fallbacks, game-core's `upgradeLegacyPower` and the two migrations are gone. The event log keeps the
  older shapes (summons' legacy `breakdown`, `decisionBits`, `perActFloorBits`, optional `powerShare`) as history.
- Until then, readers used the new shape with `??` fallbacks.
- A live game keeps ticking across each deploy. The tick reads only fields that exist in both shapes, and the
  migration runs after `convex deploy`.
- The event log bumps `EVENT_LOG_SCHEMA` to 5 for the new cost shape (`{read, change, total}`) and the `skip` event.
  Replay reads both shapes by schema.
- **The read price (§2.1, 11 Nov)** needs no stored-data change: no field is added or reshaped, so nothing widens or
  migrates. `EVENT_LOG_SCHEMA` 8 marks batches whose `cost.read` is priced at κ = 32 (energy, not bits read). Replay
  plays recorded costs back (`lib/player-client/src/replay.ts` sums `cost.total`), so old games replay exactly as they
  were charged. Stored agent estimates (`expectedActCost`, `breakdown`) are display-only.

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

## 11. Paid observation (11 Nov 2026)

The owner, 11 Nov 2026: a god's own energy piles up once its power is given to agents, and summons are too rare to use
it; "create more costly uses of God energy, such as charging the God for reads (querying the world state) … objects
update in the interface whenever either the God or their agents receive information about it (with clear information
staleness indicators) but one has to setup their own process to periodically query the game state". And: "I would rather
keep a principled cost function for reads […] than have to fight an arms race of bespoke fixes."

It is a setup parameter, `observation` (the setup editor, Energy, "Do players pay to look at the world?"), with four
values, so each can be tried on one deployment by duplicating a setup and changing one control:

| Value | A seated god sees | A god can pay to look |
|---|---|---|
| `free` (stored settings without the field) | every object as it is: the game as it was | — |
| `boards` | every board and its own bits live; the others' interest (and the payoff) and the history as last told | yes |
| `paid` (the setup "Basics with paid looks"; the default setup, Annotated basics, is `free`) | every object as last told | yes |
| `agents` | every object as last told | no: its agents are its only eyes |

Two sentences carry it: **an object's birth is public; its life is paid** and **activity is public; content is paid**.
The code is `artifacts/engine/convex/lib/knowledge.ts`. What follows describes `paid`; 11.8 says how the other two differ.

### 11.1 The rule

**Seeing an object's state at one moment costs the object's full read at the read price, whoever asks, and a god knows
what it or its agents were told.** The state of an object is its value, the viewer's own bits on it and the others'
summed bits as disclosed (§8, `peerNoiseBits`). The price is `fullReadCharge` = `readBound × READ_PRICE` (§2.1), the same
number an agent pays to read the whole object:

| Setup | One look | All starting objects | Cheapest change (for scale) |
|---|---|---|---|
| Annotated basics (the default) | 1.66 | 16.6 (10 objects) | 16.3 |
| First steps | 2.45 | 24.5 | 11.5 |
| Classic, Low income | 4.16 | 41.6 | 14.3 |
| Big board | 7.41 | 74.1 | 17.8 |
| Master | 12.69 | 126.9 | 18.7 |

A god's view of an object (its `objectViews` row) is the object as the god was last **told** it, with the world time of
the telling (`learnedAt`; `knownAt` in the API). A god is told an object:

1. **At its birth, free.** The starting world and every spawn. A birth is a draw from the public prior, so it says
   nothing about the other gods' play; and a player who cannot see the board cannot make a first move.
2. **When one of its agents commits a change to it.** The read-price rule (§2.1) already makes the cheapest change cost
   more than a complete look on every setup, so a change has paid for the look.
3. **When one of its agents' acts read the whole object** (`readBits` = `readBound`): the act paid exactly a look.
4. **When the god pays for a look** from its own account (the one that pays summons): one object, or every object
   (the price times the object count). Refused, with the price and the balance, when the account cannot pay.

With the energy capacity (§6.1, `fullChargeSeconds`) a god's own account holds at most what the power it keeps for
itself fills, so a god that gives all its power to agents cannot look; the refusal says "keep some power for yourself
to look". Before the world runs a look is refused: nothing has changed yet.

Free for everyone: the published scoreboard (every `scoreIntervalSeconds`; the god's own score and totals move with it,
not live), the number of objects, and each object's existence, age, number of changes and time of last change.
**Activity is public; content is paid.** So the interface can say "seen 40 s ago, changed 3× since" without showing what
changed, and an object nobody has touched stays exactly known however old the look.

After the game ends everything is open and exact, as before. A viewer without a seat (a spectator) sees the live world
as before; see 11.5.

### 11.2 Granularity: the object

The owner's wording is per object ("objects update … whenever either the God or their agents receive information about
it"), and the host learns only a bit total from the meter (§3.4), not which cells were read. So an agent that reads part
of a board tells its god nothing by reading (only by changing). Telling the god exactly the cells read needs the
preludes' meters (three types, two languages) and both sandbox engines to export a read mask; the knowledge row can then
carry per-cell times without a redesign. Not done here.

### 11.3 Standing queries are processes

There is no "refresh every N seconds" switch. A standing watch is an **observer agent**: an ordinary agent that reads the
whole object and returns no calls (`String(grid); return []` / `repr(grid); return []`). Each object it is offered is
told to its god (rule 3), at one look's price from the agent's own energy, so coverage is a function of the power share
given to it and the number of agents gives nothing (§6, §7). A god that keeps power for itself can also pay for looks
directly: watching closely costs power either way. On the default setup (P = 64 bits/s, 10 objects) looking at
everything once a second costs 16.6 bits/s, a quarter of a god's power.

The forge offers it ready-made where looking costs energy ("An agent that only looks", `player-web`
`core/panels/observer.ts`), with its cost under the offer price of §7.1: one turn costs the whole read plus the offer
(log2 of the live objects, at the read price), 1.76 energy on the default setup with 10 objects, so a 10% share (6.4
bits/s) refreshes about 3.6 objects a second. The observation carries the whole-read price as `economy.fullRead`.

### 11.4 What a seated god can read while the game is live

| Path | Free game | Paid game |
|---|---|---|
| `player.object`, `objectIds`, `objectsTop`, `objectRank`, `objectsPage`, `board` (now), the observation's objects | the object as it is | the object as last told (`knownAt`); `player.object` adds the public `changesSince` |
| `player.totals`, `dock.state` `self.score` | live | as of the last published scoreboard |
| `player.events`, `history`, `trajectories` | every spawn and transformation | births and the god's own agents' acts (and its own looks) |
| `player.series` (`get_utility_series`, `fit_utility_mixture`, the `utility_series` dataset) | every spawn and transformation, with the others' sum | the god's knowledge over time: one row per telling (11.7) |
| `player.board` with a world time (past, present or future) | the board then | refused: the board without a time is the god's knowledge, and the answer never depends on the clock |
| `games.object`, `games.objectIds`, `player.game` objects (the spectator's queries) | the world | nothing for a seated god |
| validate / summon's sample world | 16 live objects | the same objects as the god was last told them |
| the published scoreboard, standings history, chat, own agents, own goal card, the clock | free | free |

Nothing was added to what a look can show: a look reveals exactly the row a free game shows all the time.

### 11.5 Spectators and second accounts

Spectating is unchanged, so a seated player who also watches through a second account (a room member who spectates, or
any signed-in viewer of the room's current game) sees the live world without paying. The existing spectator rules do
nothing about this: the game page is open to any signed-in viewer. Closing it means giving spectators of a paid live game
the free tier only (the scoreboard and activity) until the end; that is one check in `games.ts` (`toldOnly` for every
viewer), left out because the room owner often watches their own room's AI seats play. Among friends the honour system
holds; for a competitive room, close it.

### 11.6 Reads and stored data

- No new page query; one new table (`knowledgeLog`, 11.7), private to its god, written only with a telling. `objectViews` gains an optional `learnedAt` (absent in a free game and after the
  end: no migration; rows of a paid game are written with it).
- The tick tells the commit which gods it told which objects (`told`); the read-model sync rewrites only those gods'
  rows and inserts rows for spawns. A changed object's other rows are not rewritten: each is marked `stale` once, when
  the object first moves past what its god was told (one small write per god per staleness, cleared by the next
  telling). The once-a-minute sweep only adds missing rows. `godTotals` are written at scoreboard publications.
- One new page query, `player.staleCount` (one index page of the god's own stale rows, at most 100): "7 of 12 have
  changed since you last saw them". It has its row in the query-cost gate.
- `player.object` reads one more document in a paid game (the object's own, for `changesSince`).
- A look is the `look` command (`commands.submit`): it settles and charges the deity's account, rewrites the god's row
  (all objects: a paged scheduled mutation, `game/looks.ts`) and logs a `look` event (event-log schema 11; private to its
  god while live; the replay subtracts it from the god's energy).
- The observation reports `economy.observation` and `economy.lookPrice`.


### 11.7 History and analysis at a price

"We could allow higher time resolution data to be accessible in principle but at a high cost, meaning one valid use of
energy would be detailed analysis that could expensively derive the goals of other gods."

- Every telling that brings a god something new (a birth, a version it had not been told, a re-score) is one row of
  that god's `knowledgeLog`: the world time, the object's value, the god's own bits, the others' sum as disclosed and the
  payoff. It is written with the god's row, by the same sync.
- While a paid game is live, the god's utility series (`player.series`, and so `get_utility_series`, the `utility_series`
  dataset and `fit_utility_mixture`) is that log. The rival inference fits the other gods' rules to (value, others' sum)
  pairs; in a paid game it has exactly the pairs the god paid for. The time resolution of the history is the rate the
  god samples at, and each sample costs one look.
- The code-run datasets (`run_code`: `objects`, `observation`, `events`, `game_history`, `trajectories`,
  `utility_series`) have no price of their own: each is read through the same functions as the dock, so in a paid live
  game it holds what the god was told and nothing else. Their descriptions say so (`lib/player-client/src/datasets.ts`).
- There is no purchase of the past: a state nobody paid to see at the time is not for sale later. (It would be a second
  mechanism; the price would be the same, one look per row.)
- What an inference costs on the default setup (look 1.66; cheapest change 16.3; a small agent's summon price is tens of
  bits; a god's power is 64 bits/s and its account starts at 200):

  | Sampling | Looks | Energy | In cheapest changes |
  |---|---|---|---|
  | One look at every object (10) | 10 | 16.6 | 1 |
  | Every object every 10 s for a 10-minute game | 600 | 996 | 61 |
  | Every object once a second for one minute | 600 | 996 | 61 |
  | One object once a second for the whole game | 600 | 996 | 61 |
  | An observer agent with a 10% power share (6.4 bits/s) | about 3.9 objects/s | 6.4/s | 0.4/s |

  The births are free samples (one per object), which is too few to tell rules apart; `fit_utility_mixture` needs tens
  to hundreds of distinct values.

### 11.8 The other two values

- **`boards`** (the mild one): the board is public. An untold god's row still follows the object's value and the god's
  own bits (the sync rewrites it, as in a free game), but the others' sum, the care and the payoff built on it stay as
  last told, with `toldVersion`. A look (same price) tells the others' interest. The history, the series and the
  spectator queries are as in `paid`; validate and summon sample the live objects. Use it if hiding the board proves too
  hard on new players: what is paid for is exactly the information about the other gods.
- **`agents`** (the austere one): as `paid`, but the `look` command is refused and `economy.lookPrice` is absent, so the
  dock shows no Look button. A god's own energy then pays for summons only; watching costs power through observer
  agents. Use it if looks by the god make the god's account matter more than its agents' code.

