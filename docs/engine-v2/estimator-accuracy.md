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
