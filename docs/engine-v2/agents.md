# Engine v2: agents (what W3 and W5 build against)

Owner: workstream W2. Code: `lib/v2-agents` (the host and one act), `lib/v2-sandbox` (the sandbox and the guest
libraries). Spec: [spec.md](spec.md) §6.

## One act: `runAct`

```ts
import { runAct, sandboxes } from "@workspace/v2-agents";
const pool = sandboxes("worker");                      // one sandbox per language, started on first use
const { record, state } = await runAct(await pool.get(program.language), {
  type: lineType, variant, state, rule: { family, params, tieBreaker },   // the player's dealt rule (tieBreaker: an id, or null)
  program: { language: "python" | "typescript" | "javascript", source },
  seed, energy,                                        // the agent's energy, as budget() reports it
  object, liveObjects,                                 // the offer: log2(liveObjects) read bits
  value, history, rungs,                               // optional, the points reads (below): what the player may see of this line
  limits, economy,                                     // optional: sandbox limits; { kappa, beta } (default v2-economy's KAPPA, BETA)
});
```

`record: ActRecord` is plain JSON (store it as the `act` event):

| Field | Meaning |
|---|---|
| `outcome` | `committed`, `skipped` (returned nothing) or `failed` |
| `reason`, `code` | why it failed; `code` is the sandbox's (`COMPILE`, `EXECUTION`, `LIMIT`) when the program itself failed |
| `calls` | the applied moves: `{ mutator, site, args, rep, price }`; `rep` is the view the mutator belongs to (the lens), `price` v2-core's `Price` |
| `changeBits` | W, the sum of the calls' prices (0 unless committed) |
| `readBits`, `offerBits`, `readsByRep` | R (offer included) and its split by view (`offer` for the offer's bits) |
| `charge` | R/κ + (committed ? W + βW² : 0), in energy |
| `before`, `after` | the state, encoded by the object type |
| `transcript`, `steps` | every host request and reply; sandbox steps used. The server stores the transcript only on acts that moved or failed (a skipped act's event omits it; any act can be re-run from its seed and inputs) |
| `notes` | up to 3 short notes the agent left its owner this act (e.g. why it left a line); show them in the act log, folding repeats |

`state` is the new state (the old one unless committed). A failed or skipped act is still charged its reads. All
prices come from v2-core's `applyCalls` and the object type's `readLength`, so a new price list in `v2-linear` needs no
change here.

**The points reads** (all optional; without them an agent still runs, `worth` is null and `rarity` 0). They carry only
what the player may see (spec §8 disclosure):

- `value: { mine, others, points }`: the player's rarity on the offered line, the other players' rarity added up,
  and the player's points there (mine × others).
- `history: { mine, pointsBefore, pointsAfter }[]`: the latest moves on the offered line, newest last: the player's
  own, and others' that changed the player's points (the server's per-line point deltas). The host passes the last 8.
- `rungs: { score, bits, layer?, main? }[]`: the player's rule's committed ladder (the artefact's rungs), so that
  `rarity(score)` prices a score the agent computed. `worth()` is answered only when rungs are given.

`others: { rule, values }[]` (the other players' rules and value functions) lets the host answer `othersAfter(plan)`: the others' rarity on the line, added up, before and after the plan; the agent never sees their rules. `worth` costs 6 read bits, `recent` 2 per move, `rarity` and `note` nothing (`WORTH_BITS`, `RECENT_BITS_PER_MOVE`).

The engine host is `EngineHost` (`lib/v2-agents/src/host.ts`); its read accounting is spec §3.1 with one addition: a
view with no coordinates (`tri`) is charged its static elements, or it would be a free full read.

## The helpers agents are written with

Every act's prelude defines these, with the same names and behaviour in both languages
(`lib/v2-sandbox/guest/helpers.{js,py}`; parity test `lib/v2-agents/test/parity.test.ts`). Words for a twelve-year-old:

| Helper | In plain words | Host calls |
|---|---|---|
| `look(offer, view)` | what the line looks like in one view: `look(offer, "si").m` is the gradient | 1, costs a little ⚡ once per act |
| `peek(offer, view, name, args)` | one number of a view: `peek(offer, "seq", "term", {n: 3})` | 1 |
| `goal(offer)` | your rule: `family`, `params`, `tieBreaker`, `card` (its sentences), `layers` (id, title, sense) | 1, free |
| `progress(offer)` | how well the line does on your rule now: `main`, `tiebreak` (the score's parts, bigger is better), `layers` (each part's own `level` and `top`), and `level`, `top` on the whole ladder | 1, costs reading your rule's views |
| `move(mutator, args)` | one change: `move("si.tilt", {k: 1})`, Python `move("si.tilt", k=1)`. A plan is a list of moves | 0 |
| `price(offer, plan)` | the ⚡ the plan would cost, or null/None if it is not allowed; nothing changes | 1; free, except that an act's first price costs a look at the move's view if the agent has not looked yet |
| `cheapest(offer, plans)` | the cheapest allowed plan, as a list of moves (null/None if none): the same change through different views costs different amounts | 1 per plan |
| `energy(offer)` | the ⚡ your agent has | 1, free |
| `prime(n)`, `square(n)` | is n a whole number that is prime / a perfect square (anything else: false) | 0 |
| `near(x, test)` | the whole number nearest x that passes the test: `near(m, prime)`; the test gets a plain whole number; on a tie the smaller | 0 |
| `whole(x)`, `root(n)` | the whole number nearest x (a half rounds up); the whole square root of n, rounded down | 0 |
| `factors(n)` | n's prime factors, smallest first, with repeats: `factors(12)` is `[2, 2, 3]` | 0 |
| `better(a, b)` | is score a better than score b (lists of parts compared in order, bigger is better; null is worst) | 0 |
| `worth(offer)` | what this line is worth to you now: `mine` (your rarity), `others` (the other players' rarity added up), `points` (mine × others); null/None when the game does not say | 1, a small read |
| `rarity(offer, score)` | the rarity your rule gives a score your own score function computed; 0 when the game does not say | 1, free |
| `recent(offer)` | the latest moves on this line you may see, newest last: `mine`, `pointsBefore`, `pointsAfter` (Python `points_before`, `points_after`) | 1, a small read per move |
| `pushback(offer)` | how many times lately another player's move took back points your agent had just won here (a tug-of-war) | as `recent` |
| `contested(offer, times)` | true once `pushback` reaches `times`; it then leaves the owner a note naming the tug-of-war | as `recent` |
| `fair(offer, plan)` | true when the plan would not lower the other players' rarity on this line, added up (true when the game does not say) | 1, a small read each time (`OTHERS_AFTER_BITS`, 6) |
| `note(offer, text)` | leave your owner a short note in the act log (at most 3 an act, 200 characters) | 1, free |

An agent is `agent(offer)` returning a plan (a list of moves) or null/None to skip. The lower-level guest API
(`offer.view`, `offer.quote`, `call`, `Q`, `Fraction`) stays available.

## Examples and starters (for the forge, practice partners and the assistant)

```ts
import { exampleFor, startersFor, shippedAgents, summonBits, check, BEGINNER_STARTING_ENERGY } from "@workspace/v2-agents";
exampleFor(family, tieBreaker, "python")   // what "Summon my first agent" opens with for the player's dealt rule
startersFor(family, "typescript")          // [Simple, Thorough, Bold, Naive]: "Other starting points", each a Replace
// each: { family, kind, tieBreaker, language, title, summary, source }
```

- One **example** per family and tie-breaker, and three **starters** per family (Simple, Thorough, Bold) that read the
  dealt tie-breaker themselves, in TypeScript and Python. Each has exactly one "Try this:" comment. They are generated
  from one description per family (`lib/v2-agents/src/catalogue.ts`: the family's score in both languages, and the
  moves that can raise each tie-breaker); the rendered copies are in `lib/v2-agents/agents/<family>/` (regenerate with
  `pnpm --filter @workspace/v2-agents render`; a test fails when they are stale).
- **Playing for points.** Points on a line are the owner's rarity times the others' rarity, so the example and the
  three starters note a tug-of-war to their owner (`contested(offer, 3)`: another player took back their gains three
  times lately), so the owner can make a deal, and leave every line in their `LEAVE` list. (A cap of a quarter of their energy per
  move was dropped: on a compatible table it cost 30% of their points, 9,937 against 13,967 without it.) They
  keep playing the line: on the server's economy, walking away from contested lines gave them up (2,015–2,346 points a
  seat against 2,728 for staying, over six 300 s seats; docs/engine-v2/ai-table-results.md). They only take changes that make the line better for their rule, so they never lower their owner's rarity.
  **Naive (for learning)** is the same search without any of this, labelled as a teaching example: show it beside
  Simple so a player can see why. On 18 harness seats (three 3-player beginner tables, two seeds, 1,500 ⚡ each, 24
  lines) Simple scored 19,236 points against Naive's 18,285; neither went negative.
- Tests check that every family and tie-breaker in `v2-linear` has them, that each agent's own score equals the
  engine's on whole-number and fraction lines, that both languages make the same moves, that each example raises
  both the main part (to its top) and the tie-breaker on newborn lines, and that every one fits the starting energy.
- A practice partner summons its family's example for its dealt tie-breaker (or Simple).
- They cover all eleven v2-linear families: the beginner pool (Prime Staircase, Square Area, Treasure, Ruler, Exact
  Change, Prime Landing, Same on Both Rulers, Pythagorean Area) and the owner's first rules. Exact Change's agents read
  the line as coins a·x + 1·y = N, so they are for whole-number lines (a fraction line reads as no score). On whole-number lines Ruler's distance² is never a
  square (m = 0 is refused), so its main part cannot reach its top and the "far" tie-breaker never decides anything: a
  rule design finding, reported to the spec session.

**Summon price** (`summonBits(language, source)` → `{ bits, energy, tokens }`): the program's description length over
its tokens, the same code for both languages. Comments and layout are free, so plain-words comments cost nothing; a
vocabulary word (keywords, operators, the helpers) costs log2 of the vocabulary; a name of the agent's own costs its
spelling once and little after; `Q.add(a, b)` costs what `a + b` does. Energy = bits × `SUMMON_ENERGY_PER_BIT`
(⅙, chosen so the dearest shipped agent, 588 ⚡ after the points-aware lines, fits the beginner preset's 600 ⚡ and leaves the first agent its ≈70% share; v2-economy may own the constant). Python and
TypeScript prices of the same agent are within 15% (test). This replaces game-runtime's AST bits.

**Price range** (⅙ ⚡ a bit kept, owner 2026-11-14; in seconds of full power at 64 power):

| Program | ⚡ | Seconds of full power |
|---|--:|--:|
| A 3-line agent (one shift a turn) | 18 | 0.3 |
| A Simple starter (min, median, max) | 300, 347, 555 | 4.7, 5.4, 8.7 |
| A Thorough starter (median, max) | 431, 574 | 6.7, 9.0 |
| 16 KiB of starter code (names reused) | 1,216 | 19 |
| 16 KiB of distinct logic (154 functions) | 5,729 | 90 |

**The store's ceiling** (not changed; the owner is deciding between a larger store, instalments, or keeping the
ceiling). A player's own store holds at most `fullChargeSeconds` × its income, so at full power (no agents) it never
holds more than P·T: 64 × 30 = 1,920 ⚡ on the beginner settings. Pulling power back from agents moves their energy,
but never past that cap, and a summon is paid at once (`pay` in convex/v2/agents.ts). So **a program priced above
1,920 ⚡ can never be summoned**. Today the engine refuses it with "That program costs X ⚡; you have Y.". Its hint,
"Energy accrues while the game runs; a shorter program costs less.", is half wrong for such a program: waiting never
helps. `lib/v2-economy/test/ceiling.test.ts` pins this. Edits are not affected: they pay only the change.

**Edit price** (owner decision 21; `editBits(language, oldSource, newSource)` → `{ bits, energy, tokens }`): replacing
an agent's program costs only the change, at the same ⚡ per bit. The change is the shortest token-level edit script
from the old program's priced tokens to the new one's (a longest common subsequence over the tokens the summon price
counts, so comments and layout stay free). The script is coded as its number of hunks, then per hunk where it starts
in the old program (log2 of the old length + 1 bits), how many tokens it deletes and how many it inserts (integer
codes, spec §2.3), and the inserted tokens at their summon bits, with the old program's names already spelled. An
identical program costs 0, and an edit never costs more than the new program's full summon price (sending it whole is
always possible). A change of language is a full summon. Example: adding `if ([2, 9].includes(offer.object)) return null;`
to Treasure's Simple starter costs about 18 ⚡; the whole program costs 404 ⚡. A new agent still pays the full summon
price. **Not on the server yet:** `reprogram` (agent.replace, agent.putBack) still charges the full summon price; W3
switches it to `editBits` once this lands. Until then the seat prompt's edit price holds only in tables.

Prices of the shipped agents when this page was written:

| Family | Agent | ⚡ TypeScript | ⚡ Python |
|---|---|--:|--:|
| prime-gradient | example: prime | 207 | 185 |
| prime-gradient | example: cPrime | 244 | 220 |
| prime-gradient | Simple | 280 | 255 |
| prime-gradient | Thorough | 367 | 339 |
| prime-gradient | Bold | 317 | 289 |
| triangle-area | example: legs | 285 | 261 |
| triangle-area | example: even | 279 | 255 |
| triangle-area | Simple | 324 | 298 |
| triangle-area | Thorough | 383 | 355 |
| triangle-area | Bold | 333 | 305 |
| m-meets-c | example: size | 275 | 250 |
| m-meets-c | example: meetPrime | 254 | 230 |
| m-meets-c | Simple | 267 | 241 |
| m-meets-c | Thorough | 354 | 325 |
| m-meets-c | Bold | 303 | 275 |
| crossing-check | example: size | 268 | 250 |
| crossing-check | example: whole | 273 | 254 |
| crossing-check | Simple | 276 | 254 |
| crossing-check | Thorough | 388 | 364 |
| crossing-check | Bold | 313 | 288 |
| whole-intercept | example: spf | 209 | 184 |
| whole-intercept | example: omega | 238 | 213 |
| whole-intercept | Simple | 263 | 234 |
| whole-intercept | Thorough | 350 | 318 |
| whole-intercept | Bold | 300 | 268 |
| square-area | example: omega | 316 | 290 |
| square-area | example: lpf | 285 | 261 |
| square-area | example: spf | 282 | 260 |
| square-area | Simple | 338 | 312 |
| square-area | Thorough | 397 | 369 |
| square-area | Bold | 347 | 320 |
| prime-staircase | example: first-prime | 309 | 264 |
| prime-staircase | example: last-prime | 332 | 283 |
| prime-staircase | example: near-miss | 345 | 301 |
| prime-staircase | example: step-back | 335 | 292 |
| prime-staircase | Simple | 455 | 394 |
| prime-staircase | Thorough | 544 | 480 |
| prime-staircase | Bold | 494 | 429 |
| treasure | example: prime-terms | 296 | 263 |
| treasure | example: prime-gradient | 257 | 238 |
| treasure | example: square-start | 257 | 238 |
| treasure | Simple | 346 | 308 |
| treasure | Thorough | 458 | 419 |
| treasure | Bold | 383 | 343 |
| ruler | example: far | 303 | 276 |
| ruler | example: prime-gradient | 274 | 247 |
| ruler | example: square-area | 297 | 270 |
| ruler | Simple | 365 | 335 |
| ruler | Thorough | 424 | 392 |
| ruler | Bold | 374 | 342 |
| exact-change | example: big-piles | 286 | 254 |
| exact-change | example: big-bill | 317 | 284 |
| exact-change | example: prime-coins | 316 | 284 |
| exact-change | Simple | 354 | 320 |
| exact-change | Thorough | 442 | 405 |
| exact-change | Bold | 392 | 355 |
| prime-landing | example: big-prime | 201 | 180 |
| prime-landing | example: prime-gradient | 227 | 204 |
| prime-landing | example: next-prime | 234 | 211 |
| prime-landing | Simple | 306 | 280 |
| prime-landing | Thorough | 393 | 364 |
| prime-landing | Bold | 342 | 314 |
| same-on-both-rulers | example: steep | 265 | 244 |
| same-on-both-rulers | example: prime-start | 276 | 255 |
| same-on-both-rulers | example: whole-values | 310 | 276 |
| same-on-both-rulers | example: whole-lamp | 277 | 256 |
| same-on-both-rulers | Simple | 389 | 350 |
| same-on-both-rulers | Thorough | 502 | 462 |
| same-on-both-rulers | Bold | 427 | 386 |
| pythagorean-area | example: slanted-square | 294 | 270 |
| pythagorean-area | example: prime-height | 291 | 267 |
| pythagorean-area | example: whole-legs | 286 | 262 |
| pythagorean-area | Simple | 389 | 361 |
| pythagorean-area | Thorough | 448 | 419 |
| pythagorean-area | Bold | 398 | 369 |

The beginner economy (v2-economy `LINES_BEGINNER_ECONOMY`: 600 ⚡ to start, power 64 a second, a 30 s store) pays
for any of them in planning, and a test checks ux-lessons §1.5 and §3.7 on the real prices: after a first summon at
v2-economy's `firstAgentShare` (about 70% of power), the player's own store can still hold the dearest shipped agent.

**`check(sandbox, { type, variant, rule, program, samples, energy })`** returns the `agent.check` affordance's
result (`verdict`, `summary`, `price`, `sample`) plus `acts`, each sample's `ActRecord`. It runs one act per sample
object and spends nothing. `births(type, variant, seed, n)` samples newborn objects for it.

## Agents on the grid

The host, `runAct`, the harness and the primer take the object type: a grid game (`gridType`, variant `grid-4-d10`)
runs through the same `EngineHost` (a board is one site; `look(offer, "cells")` reads its sixteen numbers
`r0c0` … `r3c3`; any view or one element is priced as for lines; quotes are v2-grid's prices, charged through the
move's own view), and `agentPrimer(gridType)` is the grids primer (board words, the grid's views and moves, a grid
example).

- **Shipped agents.** A second description beside the line's: `GRID_CATALOGUE` (`src/grid-catalogue.ts`: each
  family's score of the board `b`, in both languages, and the moves that can raise each tie-breaker) and its
  generator `src/grid-starters.ts`. `exampleFor`, `startersFor`, `shippedAgents` and `scoreSource` choose by family
  (grid family ids differ from line ids), so callers need no change. Moves are simulated in the agent's own head with
  one helper, `edit(b, cells, f)`; `GRID_LENSES` has adding to a cell, moving an amount between two cells ("trade"),
  adding to two cells ("twin"), swapping, a row or column, a step tilt, an opposite pair, a corner box.
- **`hasStarters(family)`** (pure) says whether a family of any type has shipped agents; the deal should use it in
  place of `CATALOGUE.some(...)`, which knows lines only. **`gridUndescribed()`** lists grid families with none, and
  `test/grid.test.ts` reports them as a todo, so a new family in v2-grid shows up as missing rather than silently.
- **Described:** the beginner pool's eight families (Mirrormancer, Magic Eighteen, Opposite Nines, Two Pair, Spread
  of Three, Strangers, Leapfrog, Crosswise Threes) and Box Totals from the second pool; Steady Steps and Prime Cells
  are todos.
- **Starters are written per tie-breaker.** `startersFor(family, language, tieBreaker)`: for a grid family pass the
  dealt tie-breaker. A board's scores take more code than a line's, and a starter scoring all three tie-breakers costs
  more than the starting energy (up to about 720 ⚡); without a tie-breaker `startersFor` still returns those
  (they read the dealt one themselves; tested to run, not shipped). Server and app callers should pass
  `rule.tieBreaker`. Line starters ignore the argument.
- **Tug-of-wars** are handled as the line starters now do: `contested(offer, 3)` leaves the owner a note to make a
  deal, and the agent carries on.
- **Playing for points.** The grid starters (Simple, Thorough, Bold) find the cheapest change to the best board, as
  the examples do; below `RESERVE` (300 ⚡) they pay only for a change worth a point per ⚡: (the bits it gains + 1)
  × (the others' bits + 1), read with `worth` and `rarity` (the +1s: a better board is a step towards the next rung; a
  board nobody else wants yet is worth a little). Above the reserve they climb: energy left idle is lost to the store's
  cap, and a game where every agent waits for the others never starts. When the game does not say what boards are
  worth they climb. This is the smallest additive design on the points reads that exist (`worth`, `rarity`, `recent`);
  the line starters do not weigh points this way (they climb, note tug-of-wars and leave the lines in LEAVE), so
  the two are to be unified.
- **Prices and steps are tight.** Every grid agent costs at most 600 ⚡ to summon (the dearest, Magic Eighteen's Bold,
  588 in TypeScript), and every one fits the 500,000 steps an act may take: a board has many more possible moves than
  a line, so pair moves look 2 steps either way and Simple 2.
  The summon vocabulary now counts the points helpers (`worth`, `rarity`, `recent`, `pushback`, `note`, `contested`)
  and a few built-ins (`every`, `some`, `includes`, `reduce`, `Object.keys`; Python `all`, `any`, `count`, `keys`) as
  words, as it already did the older helpers; line agents got a little cheaper with it.

## The harness: comparing families for difficulty

```
pnpm --filter @workspace/v2-agents harness -- --rule m-meets-c/size                      # one player, its example
pnpm --filter @workspace/v2-agents harness -- --rule m-meets-c/size --rule prime-gradient/prime --agent bold
pnpm --filter @workspace/v2-agents harness -- --rule triangle-area/legs --source my-agent.py --budget 300
pnpm --filter @workspace/v2-agents harness -- --pool docs/engine-v2/agent-harness-results.md
pnpm --filter @workspace/v2-agents harness -- --variant grid-4-d10 --stand-in --pool grids.md   # the grid; --stand-in: 1 bit a rung where no artefact
```

Players take turns on shared newborn lines with a fixed energy budget each (no births, power or accrual). It prints,
per rule, the mean level of the main part and the tie-breaker at the start and the end, the lines at the main top, and
the bits gained (the committed artefact's rungs; "–" when the rule has no values yet), and per player the acts made,
skipped and failed and the energy on reads and on changes by view. When the rules have values it also prints each player's
points (start, end, gained), the energy their gains cost that another player then took back (`reversalEnergy`), how
much the others' rarity kept on the lines they moved (`othersKept`), and their agents' notes. `runHarness` (`@workspace/v2-agents/harness`) is
the same as a function. The pool run is in [agent-harness-results.md](agent-harness-results.md); what it shows, at
500 ⚡ on line-z:

- **Easiest:** Prime Gradient (every agent puts 7–8 of 8 lines at the main top; with the prime-size tie-breaker it
  gains about 17–20 bits per 100 ⚡), Whole Intercept/spf (the main part is free on whole lines; 13–16 bits per
  100 ⚡) and m Meets c/meetPrime (14 per 100 ⚡).
- **Middle:** Triangle Area (the main part climbs from about 0.4 to 6.6 of 7, but only 2–7 lines reach its top), Square
  Area (Bold does best: two moves at once find squares) and m Meets c/size.
- **Hardest:** Crossing Check (2–6 bits per 100 ⚡, 0–3 lines at the main top: y(k) = x(q) needs m and c to fit
  together, and single small moves rarely land it), and the count tie-breakers (Whole Intercept/omega, Square
  Area/factors) whose levels climb slowly.
- The lens matters: Thorough often spends most of its change energy through `seq` or `mach` (step, stretch) rather
  than `si`. Simple, with only small shifts and tilts, often finds no better line and skips; on some rules a third to
  half of its energy goes on reading (skips are still charged their reads).
- **The beginner pool** (examples, 500 ⚡): Prime Landing/big-prime gains most per ⚡ (≈18 bits per 100 ⚡); Square Area
  puts its main part near the top (1.0 → 8.3 of 9) but its prime-factor tie-breakers barely move; Prime Staircase reaches
  runs of 3–4 primes (6 is far: y = 30x + 7); Exact Change is the slowest (1.9–2.3 of 6, most turns skipped: with a coin of
  1 the ways are ⌊N/a⌋ + 1, which few single moves keep at 6); Ruler's main part climbs but cannot be exact on
  whole-number lines.
- On shared lines rules interfere: with Prime Gradient/prime tilting the same lines, m Meets c's main part fell from
  2.6 to 1.8 while its tie-breaker rose. The table is the material for negotiation.

## Tables: comparing players, model-backed seats included

```
pnpm --filter @workspace/v2-agents table -- --games 2 --seconds 300 --usd 1 --out docs/engine-v2/ai-table-results.md
```

`runTable` (`@workspace/v2-agents/table`) plays a whole game in memory on the server's economy, with the same
v2-economy functions as the tick:
- every 1.5 s tick's act opportunities (25 a second) go to agents drawn by energy (`pickByEnergy`);
- agents and players accrue at their power share up to their capacity;
- a change commits only on credit;
- every seat summons its starter at the first-agent share from its 600 ⚡;
- summons pay the full price, edits pay the edit price;
- `movePower` moves energy with power.

`power.allocate` takes absolute shares (each a fraction of the player's power; the rest stays in the player's own
store), as on the server. A model-backed seat takes a turn every 20 s with the
server AI seat's system prompt (`aiSeatSystemPrompt`, `STRATEGY` included) and the affordance directory's assistant
tools (`TABLE_TOOLS`: the game, standings, rule, objects, moves, chat, agents, programs, check, summon, replace and
power), answered from the table's state; every result is
checked against the tool's declared result schema. Chat is public and rules stay secret. It reports per seat the points
gained, the energy its gains cost that another seat took back, messages, proposals, replaced programs and tool calls,
and per table the deals read from the chat (`deals`: a proposal names a line and offers something, another seat accepts,
and it is kept when neither side then lowers the other's points on a named line). The script compares naive starters,
the new starters, model-backed seats and a mix (each rule playing each kind once), with the cheapest Anthropic model in
v2-ai's list when a key is set, within `--usd` dollars (default 1), and the mock provider otherwise. Results:
[ai-table-results.md](ai-table-results.md).

## Deals as commitments (the AI player's scaffold)

`lib/v2-ai/src/commitments.ts` turns chat into commitments for an AI player.
- `findDeals` reads proposals and acceptances.
- `commitmentsOf(me, chat, moves, programs)` lists every deal `me` is a side of, with a status:
  - pending until every one of its agents' programs skips the named lines (`skipsLines`: the code reads `offer.object`
    and names each line, outside comments);
  - enacted once they do;
  - retracted by a later message with retraction words.

  It also lists each side's breaks: moves on a named line that lowered the other side's points.
- `commitmentBriefing` writes the turn's "YOUR DEALS" section. It names the exact edit and its price, and asks the seat
  to settle every pending deal first: enact it or retract it.

It is derived from what happened, so a host needs no storage. The table appends the briefing to each model turn's
message; the server's AI turn can do the same (W3). Nothing is enforced by the game.

## The primer for the AI assistant

`AGENT_PRIMER` (or `agentPrimer(type)`) from `@workspace/v2-agents` (`src/primer.ts`) is the text the embedded and
remote assistants load to write and explain v2 agents: the game in one paragraph, the player's words, what costs ⚡
(looks, moves priced by the view they are made through, steps and digits, W + 0.05·W², free but capped thinking,
summon by length), every view and move (read from the object type), the helpers (`HELPERS`, checked against both guest
libraries), the starting points and an example. It has a "Playing for points" paragraph (the scoring identity, tug-of-wars, deals honoured by changing the agent).
About 9,800 characters; a test keeps it under 10,000 and true to the code. W6's assistant skill for writing agents loads it in place of v1's `PRIMER_AGENTS`.
