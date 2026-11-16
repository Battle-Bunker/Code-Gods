# Locks: defending a predicate with energy (16 November 2026)

Status: the spec to build from, behind the room setting `locks` (off by default until it has been played; the
coordinator decides the default). Each choice is marked **[owner]** (the owner's words, 16 November, quoted in
`CLAUDE.md`) or **[default]** (settled here; the owner or the coordinator can change it). The law, every value function
and every price list are untouched: a lock changes which moves are allowed and what defending or attacking costs in
energy, never what a state is worth.

## 0. The owner's latest direction (16 November, relayed by the coordinator): supersedes §2–§3

The owner's words, verbatim, which override this document where they differ (the work resumed on 16 November, and §2,
§3, §5 and §7 now follow them):

- On predicates (owner decision 48): "I don't think we already have a predicate DSL and I don't want to add complexity to build one just for this use case. Predicates should just be programs with the same degrees of freedom as agents and the same complexity scoring rules in terms of information read and program description length. The upkeep rate should be a config param proportional to predicate complexity that we will find the balanced level for with experience of playing the game."
- On upkeep (owner decision 47, about a lock draining its own energy at a rate proportional to its predicate's
  complexity and vanishing at zero): "Ok happy with this mechanic for making more complex locks more expensive".

So, when the work resumes: there is no predicate language. A predicate is a program in the agent runtime (the same
guest languages, host calls, sandbox, step limits and determinism as agents), given the object's state, returning true
or false. Its complexity is measured by the rules agents are measured by (program description length plus information
read), not by the law-mass estimate of §3. Creation cost and upkeep are proportional to that complexity, each at a rate
that is a room configuration parameter, tuned by play. Everything else in this document stands: a lock holds energy; a
call whose result makes the predicate false is refused until the lock is drained; anyone offered the object can list
the locks, read their programs and add or subtract energy; upkeep is settled lazily; events and replay are exact; locks
are unattributed while the game is live. To settle then: the step cap of a check, what an erroring predicate means, how
its reads are charged (once into the complexity, or per check), and ready-made example predicates for the owner's
examples.

Built: `lib/v2-core` locks.ts (the lock arithmetic and the order of an act under locks, pure), `lib/v2-agents`
predicates.ts (running a predicate program, its complexity) and ready-predicates.ts (§11), the agent API, and the server
(`artifacts/engine/convex/v2` locks.ts, lockNode.ts, ops/lock.ts; the tick and the commit in tick.ts and loop.ts). Live
tests: `artifacts/engine/test/v2-locks.test.ts`. The screens follow (§7). The hand-over that resumed the work is
`docs/engine-v2/handover/locks.md`.

How the server runs it: the tick (Node) runs every check, in act order, on its running view of each offered object's
locks, and records on the act which locks its calls were checked against (`lockChecked`) and what the act's lock
changes measured. The commit (a mutation) runs no program: it applies the funds, drains and new locks again
(`commitLocks`), clips drains to what is left, renumbers a new lock if another was made first, refuses a move if a lock
it was not checked against is live by then (made or refilled since), and refuses a new lock if the object moved since
it was measured. A player's `lock.create` measures the program in an action and writes through the same path, refused
if the object moved meanwhile. An act's record carries the locks it saw without their programs (`lockSeen`); a replay
joins each program from the lock's `create` event and re-executes the act exactly (tested).

## 1. What a lock is

- A **lock** sits on one object and holds an **amount of energy** and a **predicate** the object's state meets when the
  lock is made. **[owner]** ("create locks on an object with an attached predicate"; "a predicate which matches the
  current object").
- Many locks may sit on one object, made by anyone. **[default]** At most `LOCKS_PER_OBJECT = 8` live at once, so the
  move check stays a few documents; a ninth is refused until one ends.
- Locks are numbered per object in order of creation (`#1`, `#2`, …); a number is never reused.

## 2. Predicates are programs **[owner, decision 48]**

There is no predicate language (the one first built here is deleted). A predicate is a program in the agent runtime
(`lib/v2-agents` predicates.ts): the same guest languages (TypeScript, Python), guest library, sandbox and determinism
as an agent. It defines `predicate(offer)` and returns `true` or `false`.

- **What it may do** **[default]**: read the offered object, through `look` and `peek` (the host's `view` and
  `element`), each read priced exactly as an agent's. Nothing else: no rule, energy, quotes, moves, notes or randomness
  (the seed is fixed and a run that draws a random number fails). So a check is a function of the program and the
  object's state alone, and replay re-executes it exactly.
- **Limits of one check** **[default]**: 20,000 steps, 8 host calls, a 250 ms wall backstop (`PREDICATE_LIMITS`; an
  act has 500,000 steps and 64 calls); source at most 1,024 characters (`MAX_LOCK_SOURCE`); a one-line description by
  its author at most 120 characters, never verified (the program is the predicate). The step limit binds first; a check
  that hits the wall backstop is not replay-exact, so the step limit is set to bind well before it.
- **How it runs**: a check runs inside another act (an agent's `quote` must say truthfully whether a move breaks a lock),
  so it is synchronous, in an inline sandbox of its own per language (`predicateBoxes`): the Python engine is one WASM
  instance and is not re-entrant. Tested: a TypeScript agent checking a TypeScript lock and a Python agent a Python lock
  inside their acts, and each crossed.
- **A program that fails** (throws, passes its step or call limit, returns something other than true or false, draws a
  random number, asks for more than the object) **[default]**:
  - at creation: no lock is made and the act fails, naming the error;
  - on a later check: it counts as **not met**, so the move is refused, naming the lock and the error.
  This can neither free nor trap an object. Not free: whoever moves picks the state, so "an error passes" would let any
  state through on which the program happens to crash. Not trap: a drain runs no program, so the lock can always be
  emptied and the move then passes; a crash refuses no more than a `false` would.
- **Bounds on the move path** **[default]**: at most 8 live locks an object (`LOCKS_PER_OBJECT`) and 8 lock changes an
  act; each distinct (program, state) runs once an act, and at most 64 such checks an act, quotes included
  (`LOCK_CHECKS_PER_ACT`; it counts checks asked for, not programs run, so it is the same on every machine; past it a
  check fails and the move is refused); results are memoised by (program, state) for the life of a runner. The worst
  act therefore runs 64 checks of 20,000 steps.

## 3. Complexity and prices **[owner, decisions 47, 48]**

- **Complexity** of a lock, in bits = the program's **description length** (`summonBits`, the function that prices an
  agent's program, on the author's source) + the **bits it read** (the read price of the views it looked at, as an
  agent pays them) on the state the lock is made on. Fixed on the lock when it is made. The entry name `predicate` is
  not in the vocabulary that prices agents (adding it would shift every agent's price), so it costs its spelling, about
  47 bits, on every lock.
- **Creating** a lock burns `lockCreatePerBit × bits`, and the opening amount goes in on top. **Upkeep** is
  `lockUpkeepPerBit × bits` energy per world second, drawn from the lock's own energy; at zero the lock ends. Both are
  room settings, tuned by play **[owner]**. Starting values **[default]**: `lockCreatePerBit` = power ÷ 64 (the summon
  price's scale: 0.0625 at power 4), `lockUpkeepPerBit` = `lockCreatePerBit` ÷ the full-charge seconds (a lock re-pays
  its fee once per full-charge period).
- **Funding and draining** **[owner]**: adding x puts x in the lock and costs the funder x; taking x out (at most what
  it holds) costs the drainer x. Energy put in or taken out is spent, never refunded **[coordinator default (d)]**, and
  comes from the actor's available balance.

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

## 5. What a player and an agent see: costly signalling **[owner, 16 November]**

The owner: "Locks are a key mechanic for costly signalling because one can see whether extra energy is going into a
lock we agreed to share with an ally beyond what we've invested." So everything a lock is, is public on the object:

- the **program** and its author's one-line description; its complexity (description bits + read bits);
- the **energy now** in it, its **upkeep a second** and **the time left** at that rate;
- its **history**: every addition and withdrawal, as an amount and a world time (creation, funds, drains, the end). Who
  did each is not shown while the game is live, as with moves **[coordinator default (f)]**; a player is told which of
  the entries were their own, so "more went in than I put in" is the history's total of additions minus the player's
  own.

An agent sees the same through `offer.locks()` (a read: each listed lock costs the read bits of the views its program
reads) and the history through the same reply. `quote(calls)` reports a call that breaks a lock as invalid, with the
reason `breaks lock #k (<description>), holding E: drain it first`; a quote does not charge for the locks it checks.

## 6. Disclosure, events and replay

- Locks are public on the object, like moves: predicate, energy, upkeep, information content. During a live game they
  are **unattributed** (no creator, no funder, no drainer); after the end, fully attributed. **[coordinator default (f)]**
- Events (append-only, in the game's event log): `lockCreated {objectId, lock, predicate, info, energy, rate, world,
  by}`, `lockFunded {…, amount, by}`, `lockDrained {…, amount, by}`, `lockEnded {…, why: "drained" | "decayed" |
  "retired" | "game ended"}`. `by` is stored and disclosed only after the end. Replay folds them; the move check is a pure
  function of the state and the live locks, so replay re-executes exactly.

## 7. Operations (affordances, `lib/v2-affordances`)

`lock.list` (an object's live locks with their history), `lock.check` (object, program or a ready-made predicate:
does the object meet it now, its bits, fee and upkeep, spending nothing), `lock.create` (the same, with the opening
amount), `lock.fund` and `lock.drain` (object, lock, amount; a drain larger than the lock holds takes all of it),
`lock.test` (object, calls: which locks they would break). All hidden when the setting is off. Each generates the assistant tool, MCP, CLI, palette entry and
buttons. The agent API (both guest languages): `offer.locks()`, `offer.lock(source, amount, words)` (in the agent's own
language), `offer.fund(n, amount)`, `offer.drain(n, amount)`, queued and applied at commit in the order of §4.

Screens: One line shows the focused object's locks (`object-locks.tsx`): the description, energy, upkeep and time
left, the program folded, the share line ("12 energy went in, 5 of it yours: the others put in 7"), the history, an
Energy… form to add or take energy, and "Lock this line…" (a ready-made predicate or one written in the code editor,
checked on the line before paying). What if offers, when the line has locks, one press that says which lock the
composed change would break and what draining it costs (`lock-warning.tsx`). The room's configure page has the setting
and the two prices. Browser test: `pnpm --filter @workspace/player-web e2e:locks` (on and off).

## 8. The life of a lock **[default unless marked]**

| Event | Locks |
|---|---|
| Birth | A new object has no locks. |
| Uniqueness (decision 24) | Unchanged: a move onto a state another object holds is refused whatever the locks say. |
| Retirement (turnover) | A retiring object's locks end (`why: "retired"`); their energy is lost. [coordinator default (g)] |
| Drift | Drift redraws rules' parameters, not objects: locks are untouched. |
| Pause | World time stops, so upkeep stops. |
| End of the game | Locks stop decaying and end (`why: "game ended"`); the final record attributes them. |
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

## 11. Ready-made predicates for shared defence

Shipped as examples (`READY_PREDICATES`, both languages, tested), offered by the create form; each takes its numbers.
Complexity measured on a line y = −2x + 13 (y = 2x + 13 for the relation); read bits are capped at one full look of
the object, as an agent's are, so they are about 16 for every program that reads a small line.

| Predicate | What it is for | TypeScript bits (description + read) | Python bits |
|---|---|---|---|
| `floor` (reading ≥ k), k = 10 | the owner's floor on a reading | 145 + 16 | 131 + 16 |
| `floor`, k = 1,000,000 (on c = 1,000,003) | the same, a million times higher | 170 + 48 | 163 + 48 |
| `floors`: si.c ≥ 10 and tri.area ≥ 20 | one clause per ally's reading: one lock all allies fund, so nobody defends only their own part | 363 + 16 | 307 + 16 |
| `floors`, three clauses | the same, three allies | 400 + 16 | 337 + 16 |
| `keeps-pace`: c ≥ 3·m | a relation that leaves the object free to climb along it | 235 + 16 | 214 + 16 |
| `sign`: m stays negative | blocks the cheap mirror (a reflection flips the gradient's sign) | 135 + 16 | 116 + 16 |
| `prime-intercept`, `gradient-equals` | the owner's first examples | 117 + 16, 136 + 16 | 114 + 16, 134 + 16 |

Strategy for a cabal (conjecture, unplayed): write one `floors` lock whose clauses are each ally's reading at a level
all of them have reached, so every ally gains from funding it and an outsider's move that hurts any one of them is
refused; each ally watches the history and sees whether the others' additions match their own (the costly signal). A
`keeps-pace` lock lets the allies keep climbing together while refusing a move that serves one reading at the other's
cost; a `sign` lock removes the cheap representation shortcut (the mirror) from outsiders without fixing a value.

## 12. Two consequences, stated openly (from an adversarial analysis, 16 November)

- **A lock can attack.** Anyone may make a lock on any object. An outsider can knock an object off a high state and
  lock it where it fell (for example `sign` or a `floor` on a reading of the fallen state that excludes the way back),
  so climbing back first costs the drain. This is true by construction of the owner's mechanic ("any agent that gets
  offered interaction with that object" may create and drain). What limits it: the attacker pays the fee and the
  opening amount, and upkeep, while any defender drains it at par (taking x costs x). So an attack lock is a bet that
  the defenders will not pay to drain it. Not patched; to watch in play.
- **Upkeep by complexity alone defends any height at nearly a flat fee.** "c ≥ 1,000,000" is barely longer than
  "c ≥ 10": 218 bits against 161 above (its description grows with the digits of the floor and its read bits with the
  logarithm of the state). So a lock at a great height costs about what a lock at a modest one costs, while the state
  it defends may be worth far more. This follows from the owner's rule (upkeep proportional to the predicate's
  complexity), which is kept. An option within the owner's words, not built: upkeep as a **rate on the energy held**,
  that rate proportional to complexity (a lock decays by a fraction a second, so holding more costs more, and a large
  defence needs continual funding). Conjecture until played; what would show it is needed: locks on high-value states
  outliving play while their funders' income barely notices.
