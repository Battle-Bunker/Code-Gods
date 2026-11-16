# Locks: defending a predicate with energy (16 November 2026)

Status: the spec to build from, behind the room setting `locks` (off by default until it has been played; the
coordinator decides the default). Each choice is marked **[owner]** (the owner's words, 16 November, quoted in
`CLAUDE.md`) or **[default]** (settled here; the owner or the coordinator can change it). The law, every value function
and every price list are untouched: a lock changes which moves are allowed and what defending or attacking costs in
energy, never what a state is worth.

## 1. What a lock is

- A **lock** sits on one object and holds an **amount of energy** and a **predicate** the object's state meets when the
  lock is made. **[owner]** ("create locks on an object with an attached predicate"; "a predicate which matches the
  current object").
- Many locks may sit on one object, made by anyone. **[default]** At most `LOCKS_PER_OBJECT = 8` live at once, so the
  move check stays a few documents; a ninth is refused until one ends.
- Locks are numbered per object in order of creation (`#1`, `#2`, …); a number is never reused.

## 2. The predicate language

A predicate is a conjunction of at most `MAX_ATOMS = 6` atoms over the object's **readings**. **[default]** It is total,
deterministic and cheap: no loops, no user code, every atom evaluates in bounded time; it has one canonical text and a
plain-words rendering.

- **Readings** are element refs every representation already exposes (`lib/v2-core` `ElementRef`, written
  `rep.name`, `rep.name[site]`, `rep.name(arg=value)`): on lines `si.m` (gradient), `si.c` (y-intercept),
  `tri.area`, `crossing.x`, `si.y(q=3)`; on grids a cell or a row total; on two-line systems either line by site. A
  reading that is not a number, or is undefined (a vertical line's gradient), makes its atom **false**.
- **Functions** on a reading: `digitsum(x)`, `lastdigit(x)` (of |x|), `isqrt(x)` (⌊√x⌋), `abs(x)`. On a non-integer
  or negative argument where it does not apply, the atom is false.
- **Atoms**: `t = k`, `t >= k`, `t <= k` (k a rational literal; ≥ is the owner's "floor"), `t in {k1, k2, …}` (at most
  16 members), `t is prime`, `t is square`, `t is integer`, `t is multiple of k` (k a positive integer).
  Primality is deterministic Miller–Rabin with the first 20 prime bases (exact below 3.3·10^24; the same answer
  everywhere above it).
- **Canonical text**: atoms rendered in one spelling, numbers as reduced rationals, sorted, duplicates removed, joined by
  ` and `. Two predicates are the same lock predicate iff their canonical texts are equal.
- **Plain words**: each reading's label from its representation, each atom in a sentence ("the y-intercept is prime and
  the gradient is −2").

The owner's examples, as predicates:

| Owner's words | Predicate |
|---|---|
| "the y-intercept is prime" | `si.c is prime` |
| "lock gradient at -2" | `si.m = -2` |
| "floor locks on the y-intercept" | `si.c >= 1013` |
| "primes whose digit sum is 7 and final digit is 3" | `si.c is prime and digitsum(si.c) = 7 and lastdigit(si.c) = 3` |
| "perfect square areas whose sqrt digit sum is a multiple of 7" | `tri.area is square and digitsum(isqrt(tri.area)) is multiple of 7` |

## 3. Information content and prices

- **Information content** `I(P) = −log2 π{s : P(s)}`, π the variant's stationary law (π ∝ 2^−φ). **[coordinator
  default (c)]**
- **Computed** by plain draws from π (the object type's direct law: `lineLaw`, `pairLaw`, the grid's independent cells),
  `INFO_DRAWS = 65 536` draws seeded by the variant and the canonical text, so every machine gets the same number. With
  k ≥ 16 hits, `I = −log2(k / N)` (standard error ≤ 0.36 bits). With fewer, the predicate is rarer than the draws see and
  `I` is the **state bound** φ(s), the read length of the state the lock is made on (a predicate the state meets has
  mass at least 2^−φ(s), so φ bounds it; `I` is never more than φ(s)). **[default]** `I` is fixed on the lock when it is made.
- Measured on whole-number lines: `si.m = -2` 5.1 bits, `si.c is prime` 3.9, `si.c >= 100` 5.6, `si.c >= 1013` 7.8,
  `tri.area is square` 5.8, the owner's prime-with-digit-sum-7-ending-in-3 bounded at φ = 30.7. Under π's heavy tail a
  floor on a large value is cheap to state (c ≥ 1013 is 7.8 bits while the state c = 1013 reads in 512): the
  simulation should watch floor locks first.
- **Creating** a lock costs a fee of `I` energy bits (`CREATE_PER_BIT = 1`: one energy bit per bit of predicate, the unit
  of a move's price), burned, plus the opening amount the creator puts in it (at least 1). **[owner]** "the expense of
  creating the lock … proportional to the information content". The constant **[default]**.
- **Sustaining** a lock costs `I / fullChargeSeconds` energy per world second, drawn from the lock's own energy: a lock
  re-pays its creation fee once per full-charge period (240 s on the beginner presets: a 20-bit lock costs 0.083 a
  second, 2% of a seat's income of 4). **[owner]** "and sustaining it proportional to the information content"; the
  rate **[default]**, derived from the room's economy, not tuned per rule. An unfunded lock decays and **ends at zero**.
  Upkeep is settled lazily (energy and the world second it was last settled, like an energy account); the lock's end
  falls at a known world second, and the tick records it when world time passes it.
- **Funding and draining** **[owner]** "any agent that gets offered interaction with that object can query the locks and
  add or subtract energy from any given lock with their available energy balance": adding x puts x in the lock and costs
  the funder x; subtracting x takes x out of the lock (at most what it holds) and costs the drainer x. Energy put in or
  taken out is **spent, never refunded**. **[coordinator default (d)]** It comes from the actor's available balance: an
  agent cannot go into debt for a lock. **[default]**

## 4. Moves and locks

- A call whose result breaks a live lock's predicate is **refused**, like an invalid call: the act fails and pays its
  reads. **[owner]** "to push the line to a state that doesn't meet that predicate, one must pay the energy cost to
  remove the lock".
- **Every call** is checked on the state it produces, not only the act's last state, so "pushing the object to a higher
  prime requires doing so in a single step". **[owner]** (the reading of "step" as one call is **[default]**).
- A call that keeps every predicate true passes freely and pays only its price (§5.2 of the spec).
- **Order inside an act** **[default]**: the act's lock changes to existing locks (fund, drain) first, then its calls in
  order (each checked against the locks left), then its new locks (each must hold on the state the calls reached:
  "committing to lock that state once reached"). An act is atomic: if any part fails, nothing changes and it pays its
  reads. An act may change locks without moving ("or instead of moving").
- The commit re-checks every lock against the lock energies at commit time (another act in the same tick may have
  drained or funded it).
- A player can do everything by hand through the affordances (§7), paid from the player's own store.

## 5. Reading and quoting

- `locks()` lists the offered object's live locks: number, canonical text, plain words, energy now, upkeep a second,
  information content. **[coordinator default (e)]** It is a **read**: each lock costs its `I` read bits (knowing the lock
  holds tells you `I` bits about the state), so at κ = 32 a look at four 20-bit locks costs 2.5 energy. **[default]**
- `quote(calls)` and the host's dry runs report a call that breaks a lock as `valid: false`, `reason: "breaks lock #k
  (<plain words>), holding E: drain it first"`; they see the act's own queued funds and drains. A quote does not charge for the locks it names (they
  are public and the agent could read them). **[default]**
- `whatIf` / `othersAfter` report values at the resulting state as before (valuation is untouched) and add
  `forbidden: true` and the breaking locks; the commit clause (`onlyIfBetter`) refuses a forbidden plan before judging
  it, with the lock's reason.
- `lockAllows(predicateOrCalls)`: the guest can test a predicate against a candidate state it computed itself (pure, in
  the guest library, no host call) or ask the host which locks a list of calls would break (free, as a quote).

## 6. Disclosure, events and replay

- Locks are public on the object, like moves: predicate, energy, upkeep, information content. During a live game they
  are **unattributed** (no creator, no funder, no drainer); after the end, fully attributed. **[coordinator default (f)]**
- Events (append-only, in the game's event log), one kind `lock`: `{op: "create", lock, predicate, info, fee, amount,
  rate, spend}`, `{op: "fund" | "drain", lock, amount, spend}`, `{op: "ended", lock, why: "drained" | "decayed" |
  "retired"}`, each with the object, world second and `memberId`/`agentId` (the actor; the event log is not public during
  a live game). An act's event carries the lock changes it made and, in its inputs, the locks it saw (`lockSeen`), so a
  replay re-executes it exactly (`artifacts/engine/test/v2-locks.test.ts`). An act whose lock changes the commit applied
  differently (another act of the same tick got there first) records what was applied and is marked `charged`.
- Built: `lib/v2-core` locks.ts (language, information content, `lockedAct`), `lib/v2-agents` (host ops, `runAct`,
  `lockInfo`), `artifacts/engine/convex/v2` locks.ts (the `v2Locks` table, the commit's re-check, sweep, retirement, the
  public `v2/locks:ofObject`). The room setting is `locks` (configure page: "May players lock what they have built?").

## 7. Operations (affordances, `lib/v2-affordances`)

`lock.list` (an object's live locks), `lock.create` (object, predicate, amount), `lock.fund` (object, lock, amount),
`lock.drain` (object, lock, amount), `lock.check` (object, predicate: does it hold now, its plain words and its `I` and
fee, without making it). Each generates the assistant tool, MCP, CLI, palette entry and buttons. The agent API (§6 of
the spec, both guest languages): `offer.locks()`, `offer.lock(predicate, amount)`, `offer.fund(n, amount)`,
`offer.drain(n, amount)`, queued and applied at commit in the order of §4, and `allowed(calls)` for starters.

## 8. The life of a lock **[default unless marked]**

| Event | Locks |
|---|---|
| Birth | A new object has no locks. |
| Uniqueness (decision 24) | Unchanged: a move onto a state another object holds is refused whatever the locks say. |
| Retirement (turnover) | A retiring object's locks end (`why: "retired"`); their energy is lost. [coordinator default (g)] |
| Drift | Drift redraws rules' parameters, not objects: locks are untouched. |
| Pause | World time stops, so upkeep stops. |
| End of the game | World time stops, so locks stop decaying and stay as they were; the record attributes every change (`by`). |
| `locks` setting off | No lock can be made; the move path skips the check (no reads); the energy gate is unaffected. |

## 9. What stays fixed

- The law π ∝ 2^−φ and every value function: unchanged. The walk that defines value ignores locks.
- The price lists: an exact potential still (a lock adds no term to a call's price; it only forbids calls). The cycle
  test is unaffected.
- Points: unchanged.

## 10. What to measure (before the setting goes on anywhere)

The competitive simulated players (table option `locks`) report dynamics, not only totals: do locked objects keep
moving (moves per object per minute against the setting off), does locking one state become a dominant strategy (an
optimum found is a bug), what share of energy goes into locks and drains, and how long locks live. If locks freeze the
board, the first knob is the upkeep rate (§3), then the creation fee.
