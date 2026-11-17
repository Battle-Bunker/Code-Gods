# Estimator accuracy by line size (17 Nov)

The owner's question: is the thesis wrong that rule heuristics can tractably find equal-or-better states once objects
get large? This measures, for each dealt line rule, how close the live energy estimate is to what a much larger search
finds, at line sizes of about 5, 10, 20 and 40 binary digits. Labels: **built** (in the code), **seen narrowly** (measured
under the assumptions stated), **guess**.

Script: `lib/v2-linear/scripts/estimator-accuracy.ts` (`<rule> <sizes> <expansions>` writes one JSON line per state;
`report <files>` prints the tables; `recheck <files>` re-runs the live estimate with the code as it stands).

## Method (seen narrowly)

- **States.** For each rule, two parameter draws (the first dealable and the middle one); at each size B, two random
  lines whose gradient and y-intercept tops and bottoms have B binary digits ("newborn"), and for each, the rule's best
  candidate from it that stays within B + 3 digits ("worked"). Up to 8 states per rule and size (fewer where a worked
  state was not found).
- **Live estimate.** `estimateLine` with the beginner physics (gravity 20, 12 starts, band ½ bit, work budget 5,000
  states), seeded so the larger search uses the same 12 starts.
- **Larger search, per start.** The live routes again with no work budget (the direct turn, the rule's candidates, the
  climb of 6 steps in the rule's lens, mc, cf and pe); the greedy climb with 24 steps in all six lenses; a best-first
  search over single mutations in each of the six lenses, cheapest turn first (1,500 expansions a lens for Bearing at
  5 bits and Golden Path, Ring and Archimedes at 5 and 10 bits; 300 elsewhere; 500 at most from 20 bits); and up to
  10 bits, every value of each single number in a box (|v| < 2^min(B + 3, 11)) in the mc, xy, abc and mA lenses
  (exhaustive over single-number changes there). Each route is priced as the live estimator prices it (the cheapest
  of the six lenses). A start's cost is the soft minimum over all distinct targets found, as the estimator's is.
  "Live, no work budget" is the live estimate with the budget lifted (none up to 10 bits; 20 times it from 20 bits).
- **Columns.** "Live over it" is the live energy less the larger search's, mean over states (the worst state in
  brackets). "Starts exact" is the share of starts whose cheapest live route is within 0.01 bit of the cheapest found
  by anything. "Best route found by" names what found each start's cheapest route ("already": the start was as good).

## Headline

- **Built, then fixed (#1218).** Most of the error was not the rules' candidates but the work budget: one pool of 5,000
  states over the 12 starts, so the first starts' climbs spent it and every later start cost the price of reaching
  exactly this line. Before the fix the live estimate read 30–100 % above the larger search at 20 and 40 bits for most
  rules (Ring 127 against 8 bits at 40). Since #1218 each start gets an even share of what is left and a cut climb keeps
  the routes it found.
- **Seen narrowly, after the fix.** Within about 2 bits of the larger search on average at every size for Golden Path,
  Archimedes, Long Run, Prime Balance, Recurrence Pair and Unit Fraction, and for Bearing and Hensel from 20 bits up
  (at most a few per cent of the energy at 40 bits). The rules' own candidates (and the climb) find the larger search's
  best route on most starts at 20 and 40 bits for these rules: the thesis holds for them at these sizes.
- **Where the candidates are not enough (seen narrowly).**
  - **Corner:** 8 to 18 bits over at every size (the live energy is 1.3 to 2.5 times the larger search's);
    its candidates find the best route on 0–38 % of starts, a best-first or longer climb on most of the rest.
  - **Ring:** 5 to 19 bits over (its energies are small, so about 2 and 3.5 times at 20 and 40 bits); the climbs, not its
    tangent candidates, find most best routes.
  - **Stepping Coefficients** from 20 bits: 7 bits over at 20, 23 at 40 (one state 95 over).
  - **Whole Stair** at 10 bits: 12 over (twice the larger search); at 20 and 40 bits 3 to 4 over, but its candidates
    cost about 0.7 s an estimate there (its live time is 20 to 40 times the others').
  - **At 5 bits** every rule reads 1 to 8 bits over: on small lines a best-first turn of two or three mutations, or the
    sum over the many cheap targets, beats the climb. Small energies, so small in points.
- **Bound flag.** About half the 20- and 40-bit states still run out of work on some start and say "bound"; after the
  fix that costs a few bits, not tens.
- **What this means for scores (guess).** Points are own energy × the others' sum. Where a rule's energy is
  overstated by a constant factor, its seats score that factor more on every line, against seats of rules estimated
  well: after the fix Corner, Ring and Stepping Coefficients (large lines) are the overvalued ones. Within one rule the
  overstatement is fairly even across states (the worst state is 2–3 times the mean gap), so rankings by one rule hold
  better than comparisons across rules.

## Candidate fixes (17 Nov, after #1218)

The coordinator asked for the four rules not within about 2 bits to be fixed in their candidates. What the larger
search used that they missed (EXPLAIN=1 in the script prints each start it beat by more than 2 bits): a change to ONE
number in another lens, mostly the intercepts lens, which the estimator prices but does not climb (climbing it too was
tried: within the work budget it helped Corner at 5 and 10 bits only).

- **Corner** (`one-number`): the area 2n·top·bottom is proportional to each number of the gradient-and-intercept,
  intercepts and a, b, c lenses (K·z, K read one step from z, since at z itself shared factors can cancel). For each:
  z = g·w² with g the squarefree part of K (an exact square), and the z near z0 making K·z nearest a square (every z
  within ±128, or the z for each s within ±128 of √A where a step of s moves z by more than 1).
- **Whole Stair** (`one-number`): every number moved by ±128 or multiplied or divided by 2–16, and for n = 1 the exact
  Pythagorean legs: a number scaling one leg α·z with the other leg β fixed is a whole step exactly when
  α·z = (β²/d − d)/2 for a divisor d of β².
- **Stepping Coefficients** (`repair-one`): a's and c's signs kept or flipped, each with one number put back in step
  (a = b − d, b = a + d or c − d, c = b + d), and the single mutations of the intercepts and area lenses (a swap there
  reorders a, b, c).
- **Ring** (`one-number`, candidates only: its utility is the balance session's): every number moved by ±8 or
  multiplied or divided by 2–16, and the single mutations of the intercepts lens.

Rechecked on the same states (seen narrowly; "live then" is before #1218):

| rule | bits | states | live then | live now | bound now (states) | larger search | now over it: mean (worst state) | ms now |
|---|---|---|---|---|---|---|---|---|
| Ring | 5 | 6 | 17.6 | 15.3 | 2/6 | 10.4 | 4.9 (22.4) | 46 |
| Ring | 10 | 6 | 38.1 | 25.5 | 4/6 | 22.1 | 3.4 (8.2) | 56 |
| Ring | 20 | 4 | 30.0 | 6.7 | 2/4 | 6.8 | -0.1 (-2.1) | 101 |
| Ring | 40 | 4 | 127.2 | 9.9 | 4/4 | 7.6 | 2.3 (11.8) | 343 |
| Whole Stair | 5 | 8 | 16.1 | 11.1 | 1/8 | 9.9 | 1.2 (2.9) | 56 |
| Whole Stair | 10 | 8 | 29.7 | 19.1 | 4/8 | 12.0 | 7.1 (25.1) | 120 |
| Whole Stair | 20 | 8 | 49.5 | 25.2 | 5/8 | 24.1 | 1.1 (2.4) | 808 |
| Whole Stair | 40 | 8 | 57.7 | 27.8 | 4/8 | 26.6 | 1.2 (4.7) | 932 |
| Corner | 5 | 8 | 15.9 | 10.7 | 0/8 | 9.3 | 1.4 (4.0) | 56 |
| Corner | 10 | 8 | 19.4 | 9.4 | 2/8 | 8.2 | 1.2 (1.9) | 79 |
| Corner | 20 | 8 | 35.5 | 14.3 | 4/8 | 11.6 | 2.7 (7.9) | 89 |
| Corner | 40 | 8 | 63.7 | 24.8 | 5/8 | 27.9 | -3.0 (-12.3) | 145 |
| Stepping Coefficients | 5 | 8 | 18.8 | 17.1 | 2/8 | 17.0 | 0.1 (0.9) | 28 |
| Stepping Coefficients | 10 | 8 | 16.8 | 15.1 | 3/8 | 14.7 | 0.5 (2.6) | 35 |
| Stepping Coefficients | 20 | 8 | 25.1 | 14.2 | 4/8 | 16.0 | -1.8 (-5.7) | 68 |
| Stepping Coefficients | 40 | 8 | 73.1 | 19.3 | 4/8 | 18.3 | 0.9 (12.6) | 141 |

Corner is within 2.7 bits at every size (below the larger search at 40 bits: its exact squares beat what that search
found); Ring and Stepping Coefficients within 2.3 from 20 bits; Whole Stair within 1.2 except at 10 bits (7.1: the
larger search's routes there change two numbers at once, near misses no one-number move reaches; one deep state is 25
over). Cost: Whole Stair 0.8–0.9 s an estimate at 20 and 40 bits (0.7 s before, its old Pythagorean list), Ring
0.34 s at 40 bits (0.14 s before), the others under 0.15 s.

**The regression test** (`lib/v2-linear/test/estimator-accuracy.test.ts`, 16 s): the 271 states at 5, 10 and 20 bits
with the larger search's energies as a fixture; per rule and size the mean of live less larger must stay within 3 bits
at 20 bits and 2 at 5 and 10, except where a rule was already further over when it was written (held there plus a bit:
Bearing 10, Golden Path 5, Ring 5 and 10, Archimedes 5, Hensel 5 and 10, Whole Stair 10, Long Run 10). Part of the
small-line gap is not a missing heuristic: on a small line the larger search finds many distinct cheap targets and the
soft minimum sums them. Without these fixes the test fails (Corner, Ring, Whole Stair, Stepping Coefficients).

## Time bounded by the work budget (17 Nov, after #1222)

The coordinator: an estimate runs inside a commit's mutation (1 s limit; the energy-cost gate fails at 600 ms), so no
estimate may take more than about 50 ms in Node at any size, and every rule's work, its own search included, must count
against the work budget. Before this, the climbs were bounded but the rules' searches were not: at 40 bits Whole Stair
took 0.8 s an estimate (816 ms of it its search), Ring 0.3 s, Corner and Stepping Coefficients 0.16 s.

What changed (built):
- **A search meter.** Each utility a rule's search scores costs a unit; the estimator fills the meter per start with half
  that start's share of the budget (the rest prices the search's targets and runs the climbs) and adds what the search
  spent to the start's work. Once empty, utilities read worst, the searches stop, and the estimate is flagged a bound.
  The searches try their cheapest moves first, so a cut drops the dear ones.
- **Work by size.** A state costs its largest coefficient's binary length over 80 (at least 1) against the budget, and a
  search's try the same: a 40-bit line's state cost about three times a 5-bit one's in time. Not rounded: a rounded
  cost halved the work at a size threshold and with it the accuracy (Archimedes at 40 bits went 1.3 → 27 bits over).
- **A candidate that runs out prices as worst** instead of ending its start (the start keeps its direct turn).
- **Whole Stair's slowness, the cause:** its Pythagorean search rebuilt the list of every triple below u = 400 (tens of
  thousands) and scored each, on every call (70 ms a start). The list is now built once per n, sorted by ratio, and
  searched outwards from the start's gradient.
- **Rules reading a, b, c** (Ring, Stepping Coefficients) score straight from the line's own a, b, c (`uABC`): the round
  trip through two fractions cost four gcds a state (half of Ring's time). isqrt starts from a float estimate.
- Ring's candidates keep the one-number scan only; Stepping Coefficients' lens moves use the intercepts lens only (the
  area lens's moves cost most of its time).

Per rule and size (seen narrowly: the probe's states, Node on this container, timings vary about ±20 % run to run):

| rule | ms an estimate, 5 / 10 / 20 / 40 bits | before (#1222) | live over the larger search, 5 / 10 / 20 / 40 | before (#1222) |
|---|---|---|---|---|
| Bearing | 33 / 30 / 26 / 38 | 33 / 36 / 38 / 47 | 1.8 / 4.9 / 2.8 / 0.6 | 1.8 / 4.7 / 2.8 / 0.6 |
| Golden Path | 12 / 14 / 17 / 25 | 15 / 17 / 23 / 27 | 3.9 / 0.5 / 0.1 / 1.3 | 3.9 / 0.5 / 0.1 / 1.3 |
| Ring | 26 / 28 / 60 / 96 | 46 / 56 / 101 / 343 | 5.6 / 5.1 / 3.2 / 8.9 | 4.9 / 3.4 / -0.1 / 2.3 |
| Archimedes | 20 / 21 / 22 / 36 | 20 / 22 / 27 / 38 | 3.8 / 1.9 / 0.7 / 1.3 | 3.8 / 1.9 / 0.7 / 1.3 |
| Hensel | 11 / 20 / 23 / 29 | 11 / 19 / 20 / 23 | 3.4 / 4.5 / 1.6 / 0.0 | 3.4 / 4.5 / 1.6 / 0.0 |
| Whole Stair | 38 / 26 / 43 / 55 | 56 / 120 / 808 / 932 | 5.1 / 10.2 / 9.4 / 2.7 | 1.2 / 7.1 / 1.1 / 1.2 |
| Corner | 28 / 27 / 36 / 55 | 56 / 79 / 89 / 145 | 1.5 / 3.0 / 10.2 / 1.8 | 1.4 / 1.2 / 2.7 / -3.0 |
| Long Run | 4 / 10 / 18 / 29 | 3 / 8 / 17 / 29 | 0.6 / 2.6 / 0.0 / 1.9 | 0.6 / 2.6 / 0.0 / 1.9 |
| Prime Balance | 23 / 24 / 25 / 39 | 24 / 30 / 27 / 44 | 1.1 / 0.7 / 0.9 / 1.4 | 1.1 / 0.7 / 0.9 / 1.4 |
| Recurrence Pair | 17 / 23 / 23 / 23 | 16 / 22 / 22 / 25 | 1.2 / 0.4 / 0.6 / 0.8 | 1.2 / 0.4 / 0.6 / 0.8 |
| Unit Fraction | 14 / 26 / 39 / 55 | 13 / 24 / 35 / 56 | 1.2 / 1.4 / 1.7 / 1.8 | 1.2 / 1.4 / 1.7 / 1.8 |
| Stepping Coefficients | 18 / 24 / 33 / 46 | 28 / 35 / 68 / 141 | 0.1 / 1.1 / -1.8 / 2.7 | 0.1 / 0.5 / -1.8 / 0.9 |

So: every rule is within about 65 ms at every size except Ring (60 ms at 20 bits, about 90 at 40); the Convex
runtime was not measured (the local engine's watch step fails here downloading its dashboard through the proxy).
Accuracy gave: Whole Stair 5–10 bits more over at 5–20 bits (its useful search needs about 3,000 tries a start;
unbounded it is within 1.1–1.4 at 5, 20 and 40 bits but costs 280–310 ms), Corner 8 more at 20 bits, Ring 1–7 more at
20–40 bits, Stepping Coefficients 2 more at 40; Bearing, Archimedes, Prime Balance, Unit Fraction and the rest unchanged.
The regression test now also asserts a mean of at most 150 ms an estimate per rule and size (three times the aim, for
slower CI machines) at 5, 10, 20 and 40 bits, and its accuracy ratchet was moved to these values.

How this could be wrong: timings on one machine under load from other work; 4–8 states per cell; the search meter's
half share and the 80-bit unit are my choices (cheap to change; neither is a room setting yet: the work budget itself is, estimatorWork).

## Before and after the fix (seen narrowly)

"Live then" is the live estimate as the probe ran it (before #1218); "live now" the same states and starts rechecked
with #1218 (`recheck`); the larger search's energy is from the probe run. The larger search includes every live route,
so it is never above live. Hensel here is the ungraded rule on develop at the time.

| rule | bits | states | live then | live now | bound now (states) | larger search | now over it: mean (worst state) | ms now |
|---|---|---|---|---|---|---|---|---|
| Bearing | 5 | 8 | 22.1 | 21.0 | 4/8 | 19.1 | 1.8 (5.3) | 42 |
| Bearing | 10 | 8 | 42.0 | 30.2 | 7/8 | 25.5 | 4.7 (18.3) | 34 |
| Bearing | 20 | 8 | 80.9 | 44.3 | 6/8 | 41.5 | 2.8 (15.1) | 33 |
| Bearing | 40 | 8 | 111.3 | 63.4 | 6/8 | 62.8 | 0.6 (3.8) | 44 |
| Golden Path | 5 | 8 | 16.3 | 16.3 | 2/8 | 12.4 | 3.9 (12.2) | 14 |
| Golden Path | 10 | 8 | 28.8 | 22.2 | 4/8 | 21.7 | 0.5 (1.9) | 17 |
| Golden Path | 20 | 8 | 52.5 | 33.3 | 4/8 | 33.2 | 0.1 (0.8) | 19 |
| Golden Path | 40 | 8 | 75.3 | 44.7 | 4/8 | 43.4 | 1.3 (10.1) | 22 |
| Ring | 5 | 6 | 17.6 | 16.1 | 2/6 | 10.4 | 5.7 (22.4) | 30 |
| Ring | 10 | 6 | 38.1 | 26.7 | 4/6 | 22.1 | 4.6 (9.9) | 30 |
| Ring | 20 | 4 | 30.0 | 13.1 | 2/4 | 6.8 | 6.3 (12.9) | 47 |
| Ring | 40 | 4 | 127.2 | 26.9 | 4/4 | 7.6 | 19.3 (48.7) | 137 |
| Archimedes | 5 | 8 | 18.1 | 17.2 | 3/8 | 13.4 | 3.8 (7.6) | 21 |
| Archimedes | 10 | 8 | 38.0 | 25.5 | 4/8 | 23.5 | 1.9 (4.7) | 23 |
| Archimedes | 20 | 8 | 57.9 | 34.6 | 4/8 | 34.0 | 0.7 (2.6) | 27 |
| Archimedes | 40 | 8 | 67.6 | 35.2 | 4/8 | 33.9 | 1.3 (4.6) | 36 |
| Hensel | 5 | 8 | 12.3 | 12.3 | 0/8 | 9.0 | 3.4 (18.4) | 10 |
| Hensel | 10 | 8 | 24.6 | 22.0 | 4/8 | 17.6 | 4.5 (10.3) | 18 |
| Hensel | 20 | 8 | 44.7 | 26.5 | 4/8 | 24.9 | 1.6 (10.7) | 19 |
| Hensel | 40 | 8 | 73.6 | 26.7 | 4/8 | 26.7 | 0.0 (0.0) | 31 |
| Whole Stair | 5 | 8 | 16.1 | 16.1 | 2/8 | 9.9 | 6.3 (20.5) | 20 |
| Whole Stair | 10 | 8 | 29.7 | 23.8 | 4/8 | 12.0 | 11.8 (29.6) | 37 |
| Whole Stair | 20 | 8 | 49.5 | 28.0 | 5/8 | 24.1 | 3.9 (8.5) | 696 |
| Whole Stair | 40 | 8 | 57.7 | 29.7 | 4/8 | 26.6 | 3.1 (7.9) | 636 |
| Corner | 5 | 8 | 15.9 | 17.0 | 1/8 | 9.3 | 7.7 (21.1) | 22 |
| Corner | 10 | 8 | 19.4 | 20.5 | 3/8 | 8.2 | 12.3 (33.5) | 26 |
| Corner | 20 | 8 | 35.5 | 29.4 | 4/8 | 11.6 | 17.9 (38.4) | 35 |
| Corner | 40 | 8 | 63.7 | 36.6 | 5/8 | 27.9 | 8.7 (23.9) | 44 |
| Long Run | 5 | 5 | 4.2 | 4.2 | 0/5 | 3.6 | 0.6 (3.2) | 4 |
| Long Run | 10 | 7 | 10.5 | 10.5 | 0/7 | 7.9 | 2.6 (9.3) | 10 |
| Long Run | 20 | 8 | 46.5 | 35.4 | 4/8 | 35.4 | 0.0 (0.0) | 16 |
| Long Run | 40 | 8 | 74.9 | 39.6 | 4/8 | 37.7 | 1.9 (15.0) | 35 |
| Prime Balance | 5 | 8 | 18.9 | 17.7 | 2/8 | 16.6 | 1.1 (1.6) | 21 |
| Prime Balance | 10 | 8 | 28.2 | 20.2 | 4/8 | 19.5 | 0.7 (1.4) | 22 |
| Prime Balance | 20 | 8 | 19.6 | 12.1 | 4/8 | 11.2 | 0.9 (1.4) | 20 |
| Prime Balance | 40 | 8 | 26.7 | 15.1 | 5/8 | 13.7 | 1.4 (3.0) | 34 |
| Recurrence Pair | 5 | 8 | 14.0 | 14.0 | 1/8 | 12.8 | 1.2 (3.3) | 16 |
| Recurrence Pair | 10 | 8 | 18.8 | 16.3 | 3/8 | 15.9 | 0.4 (1.0) | 23 |
| Recurrence Pair | 20 | 8 | 10.4 | 9.1 | 2/8 | 8.5 | 0.6 (1.8) | 25 |
| Recurrence Pair | 40 | 8 | 8.2 | 8.2 | 1/8 | 7.4 | 0.8 (4.2) | 23 |
| Unit Fraction | 5 | 8 | 9.7 | 9.7 | 0/8 | 8.5 | 1.2 (2.1) | 13 |
| Unit Fraction | 10 | 8 | 12.5 | 12.5 | 0/8 | 11.1 | 1.4 (1.8) | 22 |
| Unit Fraction | 20 | 8 | 16.0 | 14.3 | 5/8 | 12.6 | 1.7 (3.3) | 37 |
| Unit Fraction | 40 | 8 | 14.4 | 14.4 | 4/8 | 12.6 | 1.8 (3.9) | 55 |
| Stepping Coefficients | 5 | 8 | 18.8 | 18.1 | 2/8 | 17.0 | 1.1 (2.1) | 19 |
| Stepping Coefficients | 10 | 8 | 16.8 | 17.1 | 3/8 | 14.7 | 2.5 (7.4) | 23 |
| Stepping Coefficients | 20 | 8 | 25.1 | 23.1 | 4/8 | 16.0 | 7.0 (29.0) | 31 |
| Stepping Coefficients | 40 | 8 | 73.1 | 41.2 | 4/8 | 18.3 | 22.8 (94.8) | 47 |

## The probe run, per rule (before the fix)

"Starts exact" and "best route found by" are from this run (before #1218); the energy columns before the fix.

### Bearing
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 22.1 | 2/8, 5% | 21.0 | 19.1 | 2.9 (7.3) | 69% | candidate 44%, already 21%, long climb 16%, best-first 14%, direct 3%, climb 3% | 97 |
| 10 | 8 | 42.0 | 6/8, 27% | 29.8 | 25.5 | 16.4 (41.1) | 52% | candidate 50%, sweep 15%, already 14%, long climb 13%, climb 5%, best-first 4% | 60 |
| 20 | 8 | 80.9 | 6/8, 52% | 42.2 | 41.5 | 39.3 (70.1) | 45% | candidate 55%, already 24%, climb 15%, best-first 3%, long climb 3% | 52 |
| 40 | 8 | 111.3 | 6/8, 49% | 63.4 | 62.8 | 48.6 (82.1) | 60% | candidate 50%, already 29%, direct 11%, climb 7%, best-first 2% | 77 |

### Golden Path
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 16.3 | 0/8, 0% | 16.3 | 12.4 | 3.9 (12.2) | 61% | already 50%, best-first 34%, candidate 7%, long climb 4%, direct 4% | 53 |
| 10 | 8 | 28.8 | 4/8, 16% | 22.2 | 21.7 | 7.1 (18.6) | 80% | candidate 50%, already 46%, best-first 3%, long climb 1% | 30 |
| 20 | 8 | 52.5 | 4/8, 28% | 33.3 | 33.2 | 19.3 (41.3) | 72% | candidate 50%, already 44%, climb 6% | 31 |
| 40 | 8 | 75.3 | 4/8, 27% | 44.7 | 43.4 | 31.8 (67.3) | 68% | candidate 50%, already 45%, best-first 5% | 74 |

### Ring
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 6 | 17.6 | 2/6, 11% | 16.0 | 10.4 | 7.2 (22.4) | 51% | best-first 32%, already 29%, climb 19%, sweep 7%, long climb 7%, candidate 6% | 137 |
| 10 | 6 | 38.1 | 3/6, 35% | 25.0 | 22.1 | 16.0 (47.6) | 54% | already 26%, best-first 24%, climb 17%, long climb 11%, candidate 10%, direct 10%, sweep 3% | 64 |
| 20 | 4 | 30.0 | 2/4, 15% | 9.6 | 6.8 | 23.2 (62.1) | 65% | climb 40%, already 29%, best-first 19%, long climb 13% | 162 |
| 40 | 4 | 127.2 | 3/4, 42% | 13.6 | 7.6 | 119.7 (220.3) | 54% | climb 38%, already 35%, best-first 23%, long climb 4% | 208 |

### Archimedes
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 18.1 | 1/8, 3% | 17.2 | 13.4 | 4.6 (10.7) | 52% | best-first 30%, already 25%, candidate 24%, long climb 15%, climb 6% | 76 |
| 10 | 8 | 38.0 | 4/8, 29% | 25.5 | 23.5 | 14.5 (28.7) | 52% | candidate 46%, already 23%, long climb 18%, climb 10%, best-first 3% | 50 |
| 20 | 8 | 57.9 | 4/8, 35% | 34.6 | 34.0 | 23.9 (51.2) | 52% | candidate 50%, already 26%, long climb 13%, climb 11% | 51 |
| 40 | 8 | 67.6 | 4/8, 29% | 35.2 | 33.9 | 33.7 (72.0) | 51% | candidate 50%, already 24%, long climb 20%, climb 6% | 71 |

### Hensel
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 12.3 | 0/8, 0% | 12.3 | 9.0 | 3.4 (18.4) | 73% | already 50%, candidate 20%, best-first 19%, long climb 7%, direct 2%, sweep 1%, climb 1% | 20 |
| 10 | 8 | 24.6 | 4/8, 5% | 21.8 | 17.6 | 7.0 (15.5) | 59% | already 39%, best-first 22%, candidate 22%, sweep 8%, long climb 7%, climb 2% | 38 |
| 20 | 8 | 44.7 | 4/8, 23% | 26.5 | 24.9 | 19.8 (59.0) | 70% | candidate 45%, already 40%, best-first 6%, long climb 4%, climb 4%, direct 1% | 37 |
| 40 | 8 | 73.6 | 4/8, 28% | 26.7 | 26.7 | 46.9 (97.8) | 72% | already 50%, candidate 50% | 46 |

### Whole Stair
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 16.1 | 0/8, 0% | 16.1 | 9.9 | 6.3 (20.5) | 44% | already 39%, best-first 36%, long climb 20%, climb 4%, candidate 1% | 24 |
| 10 | 8 | 29.7 | 4/8, 16% | 23.3 | 12.0 | 17.7 (46.3) | 35% | best-first 41%, already 35%, long climb 18%, sweep 5%, candidate 1% | 63 |
| 20 | 8 | 49.5 | 4/8, 30% | 27.6 | 24.1 | 25.4 (63.3) | 39% | candidate 34%, long climb 26%, already 17%, best-first 14%, climb 9% | 875 |
| 40 | 8 | 57.7 | 4/8, 25% | 29.4 | 26.6 | 31.1 (69.1) | 47% | candidate 32%, long climb 25%, already 22%, climb 13%, best-first 8% | 988 |

### Corner
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 15.9 | 0/8, 0% | 15.9 | 9.3 | 6.6 (19.3) | 40% | long climb 34%, already 26%, best-first 26%, climb 13%, direct 1% | 28 |
| 10 | 8 | 19.4 | 3/8, 6% | 17.4 | 8.2 | 11.2 (30.0) | 36% | best-first 33%, long climb 30%, already 26%, climb 10% | 38 |
| 20 | 8 | 35.5 | 4/8, 20% | 22.8 | 11.6 | 23.9 (49.9) | 24% | best-first 48%, long climb 28%, already 23%, climb 1% | 54 |
| 40 | 8 | 63.7 | 4/8, 29% | 31.6 | 27.9 | 35.9 (82.7) | 40% | candidate 38%, long climb 23%, already 22%, best-first 15%, climb 3% | 59 |

### Long Run
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 5 | 4.2 | 0/5, 0% | 4.2 | 3.6 | 0.6 (3.2) | 97% | already 80%, candidate 13%, climb 3%, long climb 2%, best-first 2% | 16 |
| 10 | 7 | 10.5 | 0/7, 0% | 10.5 | 7.9 | 2.6 (9.3) | 79% | already 57%, candidate 18%, best-first 17%, climb 4%, long climb 2%, sweep 2% | 24 |
| 20 | 8 | 46.5 | 4/8, 20% | 35.4 | 35.4 | 11.1 (33.0) | 86% | already 50%, candidate 38%, direct 13% | 38 |
| 40 | 8 | 74.9 | 4/8, 23% | 39.6 | 37.7 | 37.2 (96.0) | 77% | already 50%, candidate 41%, direct 7%, best-first 1%, long climb 1% | 44 |

### Prime Balance
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 18.9 | 2/8, 4% | 17.7 | 16.6 | 2.2 (5.6) | 89% | candidate 43%, climb 42%, already 8%, best-first 7% | 24 |
| 10 | 8 | 28.2 | 4/8, 19% | 20.2 | 19.5 | 8.7 (25.8) | 80% | candidate 48%, climb 38%, already 14%, best-first 1% | 36 |
| 20 | 8 | 19.6 | 2/8, 10% | 12.1 | 11.2 | 8.4 (37.0) | 83% | candidate 45%, already 27%, climb 21%, long climb 6%, best-first 1% | 43 |
| 40 | 8 | 26.7 | 4/8, 10% | 15.0 | 13.7 | 13.0 (37.4) | 68% | candidate 47%, long climb 20%, climb 17%, already 15%, best-first 2% | 54 |

### Recurrence Pair
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 14.0 | 0/8, 0% | 14.0 | 12.8 | 1.2 (3.3) | 82% | candidate 43%, already 25%, climb 15%, best-first 9%, long climb 8% | 18 |
| 10 | 8 | 18.8 | 2/8, 5% | 16.3 | 15.9 | 2.8 (16.0) | 92% | candidate 46%, climb 27%, already 24%, best-first 3% | 30 |
| 20 | 8 | 10.4 | 1/8, 1% | 9.1 | 8.5 | 1.9 (12.1) | 84% | already 38%, candidate 28%, climb 20%, long climb 9%, best-first 5% | 37 |
| 40 | 8 | 8.2 | 0/8, 0% | 8.2 | 7.4 | 0.8 (4.2) | 93% | already 43%, candidate 31%, climb 19%, long climb 5%, best-first 2% | 41 |

### Unit Fraction
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 9.7 | 0/8, 0% | 9.7 | 8.5 | 1.2 (2.1) | 85% | climb 36%, candidate 32%, already 17%, best-first 13%, long climb 2% | 21 |
| 10 | 8 | 12.5 | 0/8, 0% | 12.5 | 11.1 | 1.4 (1.8) | 94% | climb 51%, candidate 43%, best-first 3%, sweep 2%, long climb 1% | 37 |
| 20 | 8 | 16.0 | 1/8, 2% | 14.3 | 12.6 | 3.4 (13.9) | 75% | candidate 46%, climb 30%, long climb 14%, best-first 9%, already 1% | 61 |
| 40 | 8 | 14.4 | 0/8, 0% | 14.4 | 12.6 | 1.8 (3.9) | 79% | candidate 44%, climb 34%, long climb 16%, best-first 5%, already 1% | 79 |

### Stepping Coefficients
| bits | states | live energy | bound (states, starts) | live, no work budget | larger search's energy | live over it: mean (worst state) | starts exact | best route found by | ms live |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 8 | 18.8 | 2/8, 5% | 18.1 | 17.0 | 1.8 (4.9) | 85% | already 35%, candidate 31%, direct 14%, climb 9%, long climb 5%, best-first 5% | 22 |
| 10 | 8 | 16.8 | 1/8, 1% | 16.1 | 14.7 | 2.1 (7.8) | 80% | direct 29%, already 20%, best-first 17%, candidate 17%, climb 15%, long climb 3% | 38 |
| 20 | 8 | 25.1 | 2/8, 4% | 20.6 | 16.0 | 9.1 (45.8) | 81% | direct 29%, already 21%, climb 17%, candidate 17%, best-first 16%, long climb 1% | 57 |
| 40 | 8 | 73.1 | 2/8, 21% | 28.3 | 18.3 | 54.8 (254.1) | 71% | direct 29%, already 19%, climb 18%, candidate 17%, best-first 15%, long climb 3% | 75 |

## How this could be wrong

- The larger search is itself only an upper bound on the cheapest one-turn route: a cleverer route nobody coded could
  be cheaper still, so "live over it" is a lower bound on the live estimate's error.
- 4 to 8 states per rule and size, two parameter draws, one draw of starts per state: noisy. "Worked" states are the
  rule's own candidate from a random line, so they favour states the candidates know how to reach.
- The best-first search ran 1,500 expansions a lens on some rows and 300 (at most 500 from 20 bits) on the rest;
  the box sweep is exhaustive only over single-number changes, and only up to 10 bits.
- Sizes are the gradient's and intercept's digits; a rule that reads another lens (Ring, Stepping Coefficients: a, b,
  c) sees larger numbers on the same line.
- The bound flag and work counts depend on the order of starts and the memo shared between them.
