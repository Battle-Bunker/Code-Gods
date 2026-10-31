# Playbook: finding the analytic survival function of a rule

For an agent adding or changing a rule (a "family") who wants its calibration probabilities computed exactly instead
of by Monte Carlo. Read [survey.md](survey.md) first to see whether a similar family is already solved; worked
derivations with their verification results are in [solutions.md](solutions.md). The code is
`lib/game-utilities/src/analytic/`.

An analytic solution is **optional**. A rule with none falls back to the Monte Carlo + splitting estimator
(scripts/estimator.ts), which is computed and cached automatically. Write one when the rule's structure makes it cheap,
because exact answers are both faster and, in the deep tail, much more accurate than the estimator
(solutions.md §1: the estimator is off by 5–14 bits on several all-or-nothing tails).

## 1. What you must produce

For a draw (family, canonical params, instantiation) return **every attainable ordinal t in increasing order, each
with log2 μ{u ≥ t}**, where μ is the uniform spawn prior. This is the `Levels` format
(`src/analytic/kit.ts`; the same as `AnalyticSurvival.levels` in src/analytic.ts):

```ts
type Levels = readonly (readonly [Ordinal, number])[];   // [[t0, 0], [t1, log2 G(t1)], …], strictly decreasing log2
```

Requirements:

- **exact** (or a bound you prove and document), deterministic, in TypeScript, pure;
- **fast**: milliseconds to about a second at deal time (Grid 7×7, string(128), Int32 are the largest shapes);
- **all levels**, including the top. Penalty families get E_μ[softHinge(s)] for free from the full level list
  (`priorMeanBits` in src/calibration.ts is exact for a complete step table);
- **numerically safe**: see §5.

Write the solver in `src/analytic/{grid,int,string}.ts` (`SOLVERS`, or `CELL_ADDITIVE` for Grid sum-over-cells rules).
`test/analytic-solutions.test.ts` then checks it against every shipped table automatically, and against exhaustive
enumeration for Int and string. Run `scripts/analytic-verify.ts` over every table you can find (§6) before you call it
done. To make the engine USE it, add `analytic: solvedAnalytic("<family id>")` to the family definition
(src/analytic/hook.ts wraps the levels as src/analytic.ts `AnalyticSurvival` with the formula id `<family-id>@1`, part of
the table key; bump its version in `FORMULA_VERSIONS` whenever the solution changes), archive the family's Monte Carlo tables as its reference
(`scripts/analytic-reference.ts <family> --from <dirs>`), and regenerate its tables (`calibrate`); §7.

## 2. Step 0: canonical params, symmetry, and the reduced alphabet

1. **Read the TypeScript card, not the summary.** The card is the evaluated truth (`family.card.typescript(params,
   ctx)`; print it for each canonical params and for a digits shape and a cards shape, because cards often differ).
   Real traps found so far: `pinwheel` with `attr: "symbol"` compares the **suit** on cards but the symbol on digits;
   `mirrormancer`/`looking_glass` "symbol" compare the **value** (cards: rank, 13 values, not 52 symbols);
   `sudoku_scholar` changes semantics at N ≤ 4; `bingo_caller` has a free middle cell only for odd N.
2. **Solve only the canonical params.** `family.canonical` already maps every draw in a symmetry orbit (colour
   relabelling, reflections, …) to one representative; tables and solutions are keyed by it.
3. **Reduce the alphabet.** Under μ a cell is a uniform letter (symbol, colour). Keep only the distinctions the rule
   makes, with their probabilities: "my colour or not" is a 2-letter alphabet (1/C, 1 − 1/C); a "two colours" rule is
   3 letters; a value rule needs the value law (digits: uniform over S; cards: uniform over 13 ranks); suits are 4
   equally likely letters. The cost of every DP below is a power of this alphabet size, so this step decides
   feasibility.
4. **Use symmetry inside the DP.** If the rule only asks whether a colour *differs* from the previous one, carry a
   flag, not the colour: P(differs | both one-coloured) = (C − 1)/C regardless of history (`bullseye`,
   `stripe_painter`). If a cyclic successor map is involved (`nextColour` is cyclic), P(next = succ(prev) | prev) =
   1/C for every prev, which makes the step indicators iid (`rainbow_steps`).

## 3. Decision tree

Ask, in order:

1. **Is u a sum over cells of a per-cell score (scalar or tuple)?** → independent cells: convolution. For Grid you do
   not even need to read the rule: add the family id to `CELL_ADDITIVE`, and `cellAdditive` reads each cell's score
   off the card with the host evaluator and checks additivity on random grids (it throws if the rule is not
   additive). Examples: `conqueror`, `homebody`, `treasure_map`, `lucky_token`, `hate_colour`.
2. **Is u a function of the letter counts only (the multiset)?** → occupancy / multinomial DP over boxes
   (`maxOccupancy`, distinct counts, Σ C(n_v, 2)). Examples: `hate_takeover`, `full_house` (per row).
3. **Does the grid split into DISJOINT blocks, with u a sum (or a short chain) over blocks?** → per-block law, then
   `power`/`sumAll` (sum) or a chain over blocks (sequential rules). Blocks seen so far: rows, columns, mirror pairs,
   quarter-turn orbits (4 cells, plus the centre), rings, anti-diagonals, the 4 corners, one row. Check disjointness
   on the card: a rule over `[...grid.rows, ...grid.columns]` is NOT block-separable (lines share cells).
4. **Is u read along one line (a path, a row, the border cycle, a carry chain)?** → a Markov chain / transfer matrix
   along the line with the smallest state that determines the future (`chain` in kit.ts). Cycles: fix the first
   letter (by symmetry), chain, then close the last edge (`colour_carousel`). Longest runs: `longestRun` when the
   indicators are iid, otherwise a chain over (state, current run, best).
5. **Are there equality constraints only?** → think in graphs. Equalities on the edges of a **forest** are
   independent Bernoulli(1/K) (root each tree; every edge fixes one new letter): `wallpaper_weaver`, `echo`,
   `mirror`, `last-word`. "All k constraints hold" then has probability K^−k exactly. With cycles (grid neighbours,
   knight moves) they are not independent: see §4 T8/T10.
6. **Int: is u computed by reading the digits (decimal of |x| or two's-complement bits)?** → digit DP over the
   interval with exact integer counts (T6). **Does u depend on x mod L?** → count one period (T6).
7. **string: is u computed by one left-to-right pass?** → chain over positions with a reduced alphabet, read off at
   every length and mixed with the length law (T7). Substring presence → KMP automaton.
8. **Is u a sum of local window indicators on the 2D grid with a small reduced alphabet (2–3 letters)?** → exact 2D
   transfer matrix (T8), feasible for K^N ≤ ~10^4 states. Otherwise:
9. **Rows AND columns, connectivity, global paths, maxima over overlapping windows** → no cheap exact method here.
   Either derive an approximation **and measure its error against the tables** (T10), or leave the family to the
   Monte Carlo fallback. Never ship an approximation as if it were exact.

## 4. The tools (with formulas and code)

All in `src/analytic/kit.ts` unless noted. A `Dist` is a finite law over integer vectors; vectors carry the ordinal
plus any DP state, and equal vectors are merged (this merging is what turns enumeration into dynamic programming).

**T1 Combine independent pieces.** `combine(a, b, f)` is the law of f(X, Y) for independent X ~ a, Y ~ b. With f = +
it is convolution (`sum`, `power` by binary powering, `sumAll`); with f = a state update it is one Markov step
(`chain`). Everything below is built from it.

**T2 Survival levels.** `levels(d)` sorts the outcomes lexicographically and accumulates mass **from the top**:
G(t_k) = Σ_{j ≥ k} P(u = t_j). Tuples work unchanged: for (a, b) ordered lexicographically,
G((a, b)) = P(A > a) + P(A = a, B ≥ b), which is exactly the cumulative sum over the sorted joint support. So **a
tuple ordinal needs the joint law of its components**, never only the marginals: carry every component in the DP
vector (`mirrormancer`: [mirrors, pairs]; `colour_carousel`: [lap, moves, fine]).

**T3 Closed forms.**
- Binomial(n, p) (`binomial`, computed in logs): counts of independent hits.
- Max occupancy of n balls in K equal boxes (`maxOccupancy`): DP over boxes with weights Π 1/c_i!, times n!/K^n.
  P(max ≤ m) = n!/K^n · [x^n] (Σ_{j ≤ m} x^j/j!)^K. Distinct values (occupancy): a chain where the count stays w.p.
  d/K and grows w.p. (K − d)/K. Pairs Σ C(n_v, 2): the same box DP carrying the pair count.
- Largest multiplicity among b iid keys: the same law as max occupancy (`maxOccupancy(b, K)`).
- Longest run of successes in n iid Bernoulli(q) (`longestRun`): chain over (run, best).
- Truncated geometric: a column's bottom run of one colour has P(h ≥ k) = C^−k (`gravity`, `connect_four`).

**T4 Lemmas that create independence.**
- *Forest lemma*: equality indicators on the edges of a forest of iid uniform letters (K values) are mutually
  independent Bernoulli(1/K).
- *Constant-conditional lemma*: along a path x_0, x_1, … of iid letters, the indicators I_i = R(x_{i−1}, x_i) are iid
  whenever P(R(x, Y) | x) is the same for every x (a symmetric relation under a uniform law, e.g. "same colour or
  same value", "next colour" with a cyclic successor). `uno_snake` (longest run), `rainbow_steps`, `rainbow_road`.
  When the conditional probability depends on x (value = previous + 1 has no successor at the top value), keep x in
  the state instead (`staircase_climber`).
- *Disjoint blocks*: functions of disjoint sets of cells are independent; the product measure does the rest.

**T5 Chains over blocks with shared state.** Sequential rules ("alive while every ring so far …", "a new stripe
unless the row above is the same colour") become a chain over the blocks whose state is the minimal memory (alive
flag, previous-was-mono flag, the last three column heights in `connect_four`). Keep the state small by symmetry
(§2.4).

**T6 Int: exact counting over [min, max]** (`src/analytic/int.ts`).
- Work with **integer counts**, not probabilities, until the end: counts up to 2^32 are exact doubles, so
  count([a, b]) = count([0, b]) − count([0, a − 1]) is exact. Never subtract probabilities.
- *Digit DP* (`digitCounts`): a finite automaton reads the base-b digits of y most significant first. Count y ∈ [0, B]
  by walking B's digits: at each position every smaller digit leads to a free suffix (memoised on (position, started,
  state)), then follow B's digit. `digits(x)` in the prelude is the decimal digits of |x|, so count |x| over the
  positive and the negative part separately (x = −2^31 has |x| = 2^31). Two's-complement bits: map negative x to
  x + 2^32 and use fixed width 32. Keep the automaton state canonical (a dead state forgets everything else,
  `refrain`), or the memo explodes.
- *Residues*: anything depending on x mod L is counted over one period: each residue r occurs ⌊span/L⌋ times plus
  once if it falls in the leftover window (`residue-oracle`, L up to 7.4·10^6 is still fast).
- *Divisibility*: #{x ∈ [a, b]: m | x} = ⌊b/m⌋ − ⌊(a − 1)/m⌋; exclusion of exact divisibility by inclusion–exclusion on
  these integer counts (`smooth-operator`, `power-hoarder`).
- *Suffix rules* are residue classes mod 10^k plus a "has ≥ k digits" floor (`tailwright`); *two-ended rules*
  (palindromes) enumerate the high half and count the free middle against the bound (`palindromist`).

**T7 string: length mixture** (`src/analytic/string.ts`). μ is uniform over all strings of length ≤ L over 128
codes, so P(len = n) = 128^n / Σ_m 128^m (`lengthLaw`, computed as 2^(7(n−L)) to avoid overflow) and, given n,
characters are iid uniform. Run ONE chain over positions with a reduced alphabet (`sweep` reads the law off at every
length and mixes); do not restart a DP per length (that cost 2.5 s for `streaker`, 0.08 s as a sweep). Substring
presence: the largest KMP state reached = the longest pattern prefix present (`incantor`). Equality chains: 128^−k.
Order rules (`ascender`): an absorbing chain per threshold with prefix sums over the code.

**T8 2D transfer matrix (broken profile)** — not yet in kit.ts. For local rules on the grid with a reduced alphabet of
K letters: scan cells in raster order, the state is the last N cells (the frontier) plus whatever pending
contributions the window needs; each cell multiplies the state count by K. Cost ≈ N² · K^(N+1) · (ordinal range). With
K = 2 and N = 7 that is trivial; K = 3 is fine (3^8 = 6561); K ≥ 4 or value alphabets (S = 10–16) are not. Candidates:
`best_friends`, `odds_evens`, `othello_sandwich`, `chessmaster`. Row-coupled lines with small per-column memory
(`bingo_caller`: which columns are still full; `lantern_lighter`: per-column counts 0/1/≥2; `rooks_watch`: covered
columns) are the same idea with a row-sized step and are cheap.

**T9 Connectivity** (components, largest cluster, reachability). Exact via a transfer matrix whose state is the
connectivity partition of the frontier (non-crossing partitions; Catalan-many). Feasible offline for N ≤ 7 with a
2-letter alphabet, too heavy for deal time. Families: `kingdom`, `archipelago`, `hate_blob`, `castle_keeper`, ….

**T10 Approximations (when nothing exact is cheap).** Ship none as exact. Measure against the tables first.
- *Independent lines*: rows and columns treated as 2N independent lines (`gridApproxLevels` in grid.ts). Measured
  (solutions.md §4): RMS 0.05–0.7 bits for `sudoku_scholar`, up to 2–3 bits for `magic_accountant`/`seesaw` in the
  tail. Useful as a cross-check, not a replacement.
- *Rare equality patterns on a graph with cycles* (`knight_riders`, `snap`): Binomial(#edges, p) is right in the body
  and catastrophically wrong in the tail (67 bits at 24–64 bits), because the tail is driven by the densest witness:
  to get m equal edges cheaply, make a small vertex set spanning m edges all equal, which costs K^−(k−1) for k
  vertices. The *cheapest-witness bound* G(m) ≥ max over subgraphs with m edges of (#placements · K^−(k−1)) is the
  right tail shape; a matching upper bound needs a union bound over witnesses.
- *Sums of many weakly dependent local terms*: normal or saddlepoint (exponentially tilted) approximations with exact
  mean and variance are good in the body and degrade beyond ~20 bits; large deviations need the tilted transfer
  matrix of T8.

## 5. Numerics and pitfalls

- **Positive sums only.** Every probability is a sum of positive terms accumulated from the top of the ordinal
  (`levels`), so tails at 2^−64 or 2^−400 keep full relative precision. Subtract only exact integers (T6). The
  one exception (`ascender`: P(best = t) = P(≥ t) − P(≥ t+1)) is safe because consecutive tails differ by large
  factors.
- **−0.** `-Math.abs(0)` is −0; `add` in kit.ts normalises it, since ordinals are compared with `Object.is` in tests.
- **Exact zeros.** Omit impossible ordinals (p = 0); the table lookup treats every listed level as attainable.
- **Initial values and empty objects.** Read the card's initial `best`/`run` (often 1, not 0), the empty string, x =
  0 (`digits(0)` is [0]; palindromist's base loop gives no digits), and early returns (`column_addition` scores
  [0, 0] when the top row is all zeros).
- **Rows vs both.** Many families take an axis param; solve the rows variant exactly and return null (`NoSolution`)
  for the others, so they fall back to the estimator.
- **Performance.** `Dist` keys are strings; a DP with more than ~10^5 live states × 10^2 transitions per step needs
  typed arrays (`bingo` in grid.ts, `scale-keeper`, `ascender`). Measure on the largest shape (Grid 7×7 cards
  rainbow6 / base16 rgb, string(128), Int32): the slowest shipped solutions take 0.4 s (Grid), 1.5 s (`refrain`),
  1 s (`ascender`).

## 6. Verification (mandatory before shipping)

1. **Exhaustive enumeration wherever the domain is small.** Int: any range of ~10^4–10^5 values, including negative
   ones and both Int32 ends; string: every string of length ≤ 2 or 3 (16k / 2.1M strings). `test/analytic-solutions.test.ts`
   does this for every registered Int and string solution, to 1e-9 bits.
2. **Every empirical table.** `node --experimental-strip-types lib/game-utilities/scripts/analytic-verify.ts
   [dirs…] [--family ids] [--md] [--verbose]` compares each solution with each table level by level. Gather every
   table: data/calibration/v1 on develop plus any data-only branches (`git fetch origin
   'refs/heads/claude/calib*:refs/remotes/origin/claude/calib*'` and `git show <branch>:<path>`). Agreement across
   all sizes, symbol sets and colour sets is the test of generality.
3. **Read the comparison in two regions.** The table records bits only, so `src/analytic/compare.ts` reconstructs each
   level's standard error from the recorded budget: Monte Carlo body (≤ log2(nMc/minMcCount) bits: 8 for Grid, 13
   Int, 11 string) se = sqrt((1 − p)/(p·nMc))/ln 2; splitting tail adds 1/(particles·ln²2) per bit, ×1.6. Then:
   - **body max |z| ≤ ~4.5** (with thousands of levels; the test asserts < 5.5): a wrong formula fails here at once
     (the `pinwheel` suit/value slip gave z ≈ 200 000);
   - **tail**: expect |Δ| ≈ the estimator's own error (solutions.md §1: RMS 0.2 bits at 10 bits growing to 0.8 bits at
     60 bits, with 5σ outliers). A tail Δ of many bits on an all-or-nothing or coordinated pattern is the
     estimator failing, not the formula: confirm with a case you can compute by hand (e.g. `bullseye` outer ring one
     colour: 4·4^−20 = 2^−38 exactly; the table says 50.1).
4. **Record the result** in solutions.md (the per-family verification table) and keep the test green.

## 7. Where the hook is

- The family-side hook is `analytic(params, ctx): AnalyticSurvival | null` on the family definition (src/analytic.ts,
  validated by `assertAnalytic`, looked up by calibration.ts `analyticFor`); the estimator then builds the table from it
  instead of sampling, and the formula id is part of the table key (bump the version when the formula changes).
  Engine flow and freshness rules: [architecture.md](architecture.md). `picture_frame`, `lone_peak` and `hate_colour`
  are wired this way.
- `analyticLevels(familyId, canonicalParams, inst)` (src/analytic/index.ts) returns the `Levels` of every solution in
  this folder (or null); a family's hook wraps it with its formula id. src/analytic.ts has a smaller toolkit over plain
  ordinals (`binomial`, `multinomial`, `lineChainCount`, `maxOfEqualMultinomial`, `rowTransferCount`, `poissonTail`);
  kit.ts here generalises its `Dist` to vectors that carry DP state alongside the ordinal.
