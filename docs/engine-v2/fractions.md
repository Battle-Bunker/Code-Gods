# Why fraction lines play as whole numbers, and what to change (playtest round 10)

Finding: on the rational beginner preset (`lines-beginner`, variant `line-q`) "fraction lines show almost only whole
numbers (y = 59x, 5x − 25, 17x + 3 …)". The owner wants players to live in the rationals. Coordinator's follow-up: the
share of **vertical lines** is the bigger finding. §1–7 are analysis only: no game logic, law, code or value changed
(§8 records the C3 trial that followed). Numbers come from `lib/v2-agents/scripts/fractions.ts` (about 10 minutes; `--parts law,prices,rules,play`).

A line on `line-q` is the primitive triple (a, b, c) of a·x + b·y + c = 0, b ≥ 0. b = 0 is a vertical line, b = 1 a
whole line (whole m and c), b ≥ 2 a line with a fraction in m or c. φ = mixedInt(a) + mixedInt(b) + mixedInt(c).

## 1. In play: fractions are gone within a minute

`runTable`, the played mixed table (prime-landing/big-prime, treasure/prime-terms, whole-crossing/k-spf; collapse-check
test 4), 10 objects, 0.05 births/s, 300 s, 3 seeds, unique objects, β = 0.05. Shares over all objects on the board at
each time (newborns included; "0" is the first act, 1.5 s in).

| agents | t = 0 | 60 s | 120 s | 300 s | committed moves | fraction → whole | whole → fraction |
|---|---|---|---|---|---|---|---|
| plain (Simple starter; summon 344–450 ⚡) | 41.9% | 8.9% | 8.0% | 8.5% | 727 | 21 | 0 |
| shortcut (scripts/freeze.ts: stretch, pivot, mirror when stuck) | 41.9% | 7.5% | 4.4% | 5.6% | 2761 | 246 | 220 |
| fractional (Simple + ±1/2, ±1/3, ±2/3 steps, stretch by 1/2, 3/2, 2/3) | 41.9% | 22.2% | 19.1% | 19.2% | 842 | 49 | 32 |

Share of objects with a fraction in m or c (vertical lines: 19.4% at the start, 20–28% later in every run; whole: the
rest). Objects summed over the three seeds: 31 at the start, 71–78 at the end.

Class changes by the act's first call:

| agents | fraction → whole | whole → fraction |
|---|---|---|
| plain | mach.stretch by d 10, si.tilt by a fraction 6, si.shift by a fraction 5 | none |
| shortcut | mach.stretch by d 228, si.tilt 13, si.shift 4, cart.mirror 1 | mach.stretch by 1/2 or 1/3 215, cart.mirror 5 |
| fractional | mach.stretch 35, si.tilt 10, si.shift 4 | si.tilt by a fraction 23, mach.stretch 7, si.shift 2 |

**Which acts remove denominators:** stretch by the denominator, and fractional shifts and tilts to the nearest whole
number: exactly the three kinds of step the shipped `rounding(m, c)` helper offers. **With the shipped starters no act ever made
a whole line fractional**, and in no run did any act tip a vertical line (every starter returns `null` on a vertical
line before looking at a move). The 8.5% left at 300 s is what births (0.05/s, 42% of them fractional) add faster than
play removes. The shortcut climber's stretches by 1/2 make fractions, but its stretches by 2 undo them as often (220
against 246: churn on the same lines), so it ends lower than plain.

## 2. Why: four causes, in order of weight

**(1) The starters can only remove fractions (a one-way door).** Every shipped starter tries whole steps (shift and
tilt by ±1 … ±FAR, Thorough's stretch by a whole f), which keep a line's denominator, plus `rounding(m, c)`, whose moves
all go toward whole numbers (to the whole number below or above, ±1/d, stretch by d). No shipped program contains a move
that introduces a denominator. Once a line is whole it stays whole for the rest of the game.

**(2) The rules reward whole numbers.** Of the 43 dealable rules, 19 have top states that are 100% whole (against 9.8%
of the enumeration): every rule built on primes, prime factors (a fraction "counts as 1"), divisibility or the sequence
y(0), y(1), …. Two of the three played rules are of this kind (Prime Landing/big-prime and Treasure/prime-terms: 100%).
Fraction-friendly rules exist: Whole Crossing (8% whole at the top: the crossing −c/m lands on a whole number most
easily with fractional m and c), Ruler (8%), Pythagorean Area (8–12%), Same on Both Rulers (12–16%).

| rule group | rules | top-100 share whole |
|---|---|---|
| prime/factor/sequence rules (Prime Landing big-prime, m-spf, m-gpf; Divisibility Ladder ×4; Treasure ×5; Prime Gradient prime, c-spf, c-gpf; Prime Staircase first-prime, last-prime, step-back; Whole Crossing m-spf) | 19 | 100% |
| Prime Landing prime-gradient / next-prime, Square Area ×3, Prime Gradient cPrime, Exact Change ×3, Prime Staircase near-miss | 10 | 38–78% |
| Whole Crossing k-spf / k-gpf, Ruler ×3, Pythagorean Area ×3, Same on Both Rulers ×6 | 14 | 8–16% |

**(3) The price of a fraction: a half step costs 2.5–4× a whole step**, from two sources (applyPriced, y = 3x + 5):

| call | result | arg | surcharge | W | charge W + 0.05W² |
|---|---|---|---|---|---|
| si.shift k=1 | y = 3x + 6 | 1.15 | 0 | 4.32 | 5.25 |
| si.tilt k=1 | y = 4x + 5 | 1.15 | 0.5 | 4.82 | 5.98 |
| si.shift k=1/2 | y = 3x + 11/2 | 5.47 | 5.0 | 13.64 | 22.93 |
| si.shift k=−1/2 | y = 3x + 9/2 | 5.47 | 2.5 | 11.14 | 17.34 |
| si.tilt k=1/2 | y = 7/2x + 5 | 5.47 | 4.0 | 12.64 | 20.62 |
| si.shift k=1/3 | y = 3x + 16/3 | 9.78 | 4.5 | 17.45 | 32.69 |
| mach.stretch f=1/2 | y = 3/2x + 5/2 | 2.22 | 1.0 | 6.39 | 8.43 |
| cart.pivot x0=1/2 k=1 | y = 4x + 9/2 | 7.05 | 3.0 | 13.22 | 21.95 |
| cart.slide u=1/2 | y = 3x + 7/2 | 7.40 | 3.0 | 13.57 | 22.77 |
| gen.nudge b +1 | y = 3/2x + 5/2 | 2.61 | 1.0 | 6.78 | 9.08 |

(which + where is 3.17 bits on every call.) The amount code gives 1/2 the size |p| + q − 1 = 2, so a half step pays the
argument of a step of 2 (5.47 bits); the surcharge (φ's rise) adds 2.5–5 bits. Leaving a fraction pays no surcharge
(φ falls): from y = 3x + 5/2, shift ±1/2 to a whole c is W 8.64 (charge 12.37), stretch ×2 W 5.39 (6.84). The cheapest
way into halves today is a stretch by 1/2 (charge 8.43) or a nudge of b (9.08), neither of which any starter tries.

**(4) The law: fractions are born, but mostly ugly ones, and a quarter of births are vertical.** Under π (today's code,
p(0) = ½ on each of a, b, c): 26.9% vertical, 29.3% whole, 15.3% with b in 2..4 (halves, thirds, quarters), 28.5% with
b ≥ 5 (y = 7/13x + 37/13 …); 27.1% horizontal and 34.5% through the origin. The denominator itself is cheap (b = 2 costs
1 bit more than b = 1), but in the triple it multiplies a and c: y = 3x + 11/2 is (−6, 2, −11), and 11 is a prime
numerator the factorisation code prices like any odd number (φ 16.3 → 21.3). A fraction k + ½ always has an odd
numerator 2k + 1, so a half next to a smooth whole number is 3–5 bits dearer than the whole number. The law is the
smallest of the four causes: 41.9% of starting objects were fractional, and play removed them.

## 3. Vertical lines (the coordinator's questions)

**(a) Who scores a vertical line.** Of the 11 dealt families, **only Whole Crossing** (x = k crosses the x-axis at k;
its k-spf and k-gpf are defined, its m-spf tie-breaker is not). The other 10 families' main layers are undefined on
x = k, so the score is null (worst, 0 bits) for every rule of theirs. Share of lines scoring null, over 4000 draws from
π:

| rules | null today (π) | null under C3 | null under C9 |
|---|---|---|---|
| Prime Landing, Treasure, Prime Gradient, Prime Staircase (18 rules) | 26.4% | 4.1% | 1.3% |
| Same on Both Rulers (6) | 28.1% | 8.9% | 7.5% |
| Whole Crossing (3) | 28.7% | 10.3% | 15.4% |
| Divisibility Ladder (4) | 52.8% | 13.6% | 17.9% |
| Ruler (3) | 55.1% | 14.4% | 16.7% |
| Square Area (3), Pythagorean Area (3) | 73.7% | 23.1% | 30.4% |
| Exact Change (3) | 77.3% | 57.8% | 62.8% |
| null for every rule but Whole Crossing | **26.4%** | 4.1% | 1.3% |

Today a quarter of all newborn lines are dead for 10 of 11 families, and on Square Area or Pythagorean Area three
quarters of newborns score null (vertical, horizontal or through the origin all lack the triangle).

**(b) Tipping one.** Every call (arguments ≤ 14 bits) on x = 3, x = 1/2, x = 0 and x = 17, cheapest with a gradient:
`cart.mirror axis=diagonal` (to y = k, horizontal) W 5.17, surcharge 0, charge 6.51; `gen.nudge b +1` (to y = −x + k)
W 8.88, surcharge 3.10, charge 12.82; `gen.nudge b +2` W 15.66, charge 27.92. Shift, tilt, step, pivot and stretch are
invalid on a vertical line, and `int.move` needs both intercepts. So tipping is cheap (a whole step costs 5.25), but
**play never does it**: 0 tips in all nine games, because the starters skip vertical lines before trying anything, and
a mirror lands on a horizontal line that most rules also score badly.

**(c) Options, ranked by what keeps the game dynamic and calibration exact.**

1. **Rules that read vertical lines through another lens** (the owner's likely preference: x = k is a line a
   12-year-old knows). Natural readings exist for some families only:
   Same on Both Rulers: x = k crosses y = x at (k, k), so its fixed number is k (defined today in the cart view);
   Treasure: "when x is k, y should be close to T" can be read as "the line passes close to (k, T)", e.g. the horizontal
   distance |x(T) − k|, defined for every non-horizontal line, x = k included;
   Prime Landing: "where the line meets the y-axis, or the x-axis if it never does";
   Whole Crossing already does it. Gradient, sequence, table and area families (Prime Gradient, Divisibility Ladder,
   Prime Staircase, Ruler, Exact Change, Square and Pythagorean Area) have no honest reading of x = k: null is right
   there. Value effect: only the changed rules' value files are regenerated; π is untouched, calibration stays exact.
   Reach: 4 of 11 families, about a third of the pool's rules.
2. **Lower p(0) in the code** (C1–C3 in §4): vertical 26.9% → 2.4% (b only) or 4.0–8.6% (all coefficients). Lowering
   it for b only leaves horizontal and through-origin lines at 36–37% (the freed mass goes to them); lowering it for a,
   b and c cuts all three to 4–10% and the null share for the area families from 74% to 23%. Value effect: π changes,
   so every line-q value file is regenerated (exactly as today: same sampler, same sums). Calibration stays exact.
3. **Conditioning the law away from degenerate lines** (π' = π restricted to b ≠ 0, renormalised): the walk must then
   never visit a vertical line, i.e. vertical lines leave the board's domain (as `line-z` refuses b ≠ 1). Every value
   changes; exact. It removes a real line from the game, against (1).
4. **A birth filter** (refuse vertical newborns, keep π): births stop being draws from π, which the value functions
   assume (a value is −log2 of the chance a newborn scores at least as well). For a rule that scores verticals null,
   the chance of beating any non-null score rises by 1/(1 − 0.269), so every value is off by a constant 0.45 bits; for
   Whole Crossing (which scores verticals) the error is not constant. Calibration is no longer exact: ranked last.

## 4. Code candidates (owner decision 26: a complete code, φ unbounded)

Monte Carlo (400,000 raw draws each; exact per-coordinate draws kept when canonical, as `law.ts` does). Σπ² is the
chance two newborns are the same line; −log2 Σπ² its bits (bigger: a more spread-out board). Every candidate keeps a
Kraft sum of 1 and no cap.

| code | vertical | horizontal | through origin | b = 1 (whole) | b 2..4 | b ≥ 5 | Σπ² | −log2 Σπ² |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C0 today: mixed(a), mixed(b), mixed(c), p(0) = ½ | 26.9% | 27.1% | 34.5% | 29.3% | 15.3% | 28.5% | 1.18e-2 | 6.40 |
| C1 p(0) = 1/16 for b only (fewer vertical lines) | 2.4% | 36.1% | 37.0% | 39.4% | 20.3% | 37.9% | 1.09e-2 | 6.52 |
| C2 p(0) = 1/8 for a, b and c | 8.6% | 8.4% | 9.0% | 27.2% | 22.0% | 42.2% | 3.37e-4 | 11.54 |
| C3 C2 with b by steps (2^−½ per unit) | 4.0% | 9.6% | 9.7% | 34.3% | 38.7% | 23.0% | 5.14e-4 | 10.93 |
| C4 (m, c) as rationals: vertical 1/16, p(0) = ¼, P(den 1) = ½ | 15.8% | 14.8% | 18.2% | 43.4% | 12.7% | 28.1% | 2.57e-3 | 8.61 |
| C5 as C4 with P(den 1) = ⅓ | 18.4% | 11.4% | 14.4% | 26.1% | 15.1% | 40.3% | 1.57e-3 | 9.31 |
| C6 (m, c): vertical 1/64, p(0) = ¼, den 1 ½ then ¼, ⅛, … (by steps) | 4.3% | 16.8% | 17.7% | 47.6% | 37.0% | 11.1% | 2.04e-3 | 8.94 |
| C7 as C6 with P(den 1) = ⅔ | 3.8% | 19.8% | 20.8% | 65.9% | 24.6% | 5.8% | 3.52e-3 | 8.15 |
| C8 (m, c) as mixed numbers w + r/q: vertical 1/64, w mixed p(0) = ¼, den 1 ½ then ¼, ⅛, … | 1.5% | 12.4% | 12.5% | 24.6% | 54.2% | 19.7% | 7.69e-4 | 10.35 |
| C9 as C8 with P(den 1) = ⅔ | 1.6% | 16.4% | 16.8% | 43.9% | 43.1% | 11.4% | 1.68e-3 | 9.22 |

The rise in φ from y = 3x + 5 (the surcharge a move there pays on top of its argument):

| code | y = 3x + 6 (whole step) | y = 3x + 11/2 | y = 7/2x + 5 | y = 3/2x + 5/2 | y = 10/3x + 5 | y = 13/4x + 5 | y = 3x + 37/7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C0 | 0.00 | 5.00 | 4.00 | 1.00 | 5.00 | 9.00 | 23.00 |
| C1 | 0.00 | 5.00 | 4.00 | 1.00 | 5.00 | 9.00 | 23.00 |
| C2 | 0.00 | 5.00 | 4.00 | 1.00 | 5.00 | 9.00 | 23.00 |
| C3 | 0.00 | 4.50 | 3.50 | 0.50 | 4.50 | 8.50 | 22.50 |
| C4 | 0.00 | 5.71 | 4.71 | 5.43 | 5.21 | 8.71 | 21.21 |
| C5 | 0.00 | 4.71 | 3.71 | 3.43 | 4.21 | 7.71 | 20.21 |
| C6 | 0.00 | 4.00 | 3.00 | 2.00 | 4.00 | 8.00 | 22.00 |
| C7 | 0.00 | 5.00 | 4.00 | 4.00 | 5.00 | 9.00 | 23.00 |
| C8 | 0.00 | 1.00 | 1.00 | -1.00 | 3.00 | 4.00 | 8.58 |
| C9 | 0.00 | 2.00 | 2.00 | 1.00 | 4.00 | 5.00 | 9.58 |

- **C3** (the smallest change that keeps today's triple: `mixedInt` with p(0) = 1/8 on a and c, b by steps with
  p(0) = 1/16, i.e. b = 1, 2, 3, 4 cost 0, ½, 1, 1½ bits more): halves, thirds and quarters 15% → 39%, vertical 27% → 4%,
  horizontal 27% → 10%, through-origin 34% → 10%. It changes births, **not prices**: a half step still pays 4.5 bits of
  surcharge (5.0 today), because in the triple the denominator multiplies a and c.
- **C9** (m and c each a *mixed number* w + r/q, as a 12-year-old writes 5½: whole part w by `mixedInt` with
  p(0) = ¼, denominator q = 1 with ⅔ then halving per step (q = 2: 1/6, 3: 1/12, …), numerator r uniform over the φ(q)
  residues; vertical x = k a separate class of mass 1/64): 44% whole, 43% halves to quarters, 11% b ≥ 5, vertical 1.6%,
  horizontal 16%. A half next to a whole costs 2 bits of φ (5 today), so it changes **prices as well as births**.
  C8 (P(q = 1) = ½) pushes fractions to 54% halves–quarters and 25% whole. Cost: φ on `line-q` is no longer a function of
  the triple's coefficients, so `lineBits` (Q branch), `lineLaw`, the exact sums for line-q and the uniqueness table are
  rewritten, and every line-q value file regenerated. Detailed balance is unaffected (any φ works: the surcharge is
  max(0, Δφ) and every mutator's inverse has the same argument price).
- C4–C7 (m and c as independent fractions p/q) do worse than C9: a fraction's numerator is still priced by its
  factorisation, so y = 3x + 11/2 stays 4–5.7 bits dearer than y = 3x + 6.

## 5. Mutator prices (no value change)

The argument codes do not enter π (the walk's law is 2^−φ whatever the argument code, as long as a move and its inverse
cost the same), so repricing fractional amounts leaves every value file valid. Today an amount p/q has size |p| + q − 1:
1/2 costs like 2, 1/3 like 3. Giving 1/q the size of a unit step (σ(1/q) = 1, and σ(p/q) = |p| + ⌈log2 q⌉ in general,
rate recomputed so the code stays complete) would bring shift k=1/2 from W 11.1–13.6 to about 7–9 (arg 1.15 plus
surcharge). The surcharge (2.5–5 bits) remains and is the larger part once the argument is cheap, so this helps most
together with C9.

## 6. Starters (agent design, no mechanic change)

Measured above: the Simple starter plus fractional steps (±1/2, ±1/3, ±2/3 shift and tilt) and stretches by 1/2, 3/2
and 2/3, chosen by the same `climb`, keeps **19% of objects fractional at 300 s against 8.5%** (2.3×), with 32 acts
making whole lines fractional (plain: 0). Fractional tilts are what introduce them (23 of 32): on Whole Crossing a
fractional gradient puts the crossing −c/m on a whole number. Proposed shipped changes, no mechanic change and no value
change:

- a `fractions(m, c)` helper beside `rounding`: the steps ±1/2, ±1/3, ±1/q for small q and the stretches by 1/2, 2/3,
  3/2, each [plan, m after, c after]; Simple and Thorough push it into `tries` like `rounding`;
- a stretch-by-denominator lens (f = 1/2, 1/3, 2/3) in `LENSES` for the rules whose top states are fraction-friendly
  (Whole Crossing, Ruler, Pythagorean Area, Same on Both Rulers);
- the starters stop skipping vertical lines: try `cart.mirror` diagonal and `gen.nudge` b ±1 (charge 6.5 and 12.8),
  scored through the rule like any other step.

Cost: the fractional variant's programs are 108–109 ⚡ dearer to summon (513 / 559 / 452 against 405 / 450 / 344, out of
a 600 ⚡ store), so a helper in the prelude (free to summon) is better than code in the starter.

## 7. Ranking: how much each makes fractions ordinary per unit of change

| rank | proposal | what changes | values | effect measured or computed |
|---|---|---|---|---|
| 1 | Starters: a fractional-steps helper and stretch-by-denominator lens (§6) | prelude helper + catalogue | none | fractional share at 300 s 8.5% → 19.2%; first introductions (0 → 32) |
| 2 | Rules read vertical lines where a reading is natural (§3c.1: Same on Both Rulers, Treasure, Prime Landing) | 3 families' layers | regenerate those rules only | vertical lines stop being dead for 4 of 11 families (today 1); 26.4% of births |
| 3 | Code C3: p(0) = 1/8 on a, c; b by steps (§4) | `mixedInt` parameters in `lineBits` / `lineLaw` | regenerate every line-q value | births: halves–quarters 15% → 39%, vertical 27% → 4%, horizontal 27% → 10%, through origin 34% → 10%; null for 10 of 11 families 26% → 4%; prices of a half step barely change (5 → 4.5 bits surcharge) |
| 4 | Code C9: m and c as mixed numbers w + r/q (§4) | a new φ for line-q (lineBits, lineLaw, exact sums, uniqueness) | regenerate every line-q value | births 43% halves–quarters, 1.6% vertical; a half step's surcharge 5 → 2 bits; the largest change to fraction play of any option, at the largest cost |
| 5 | Amount code: σ(1/q) = 1 (§5) | `amountSize` + rate | none | half step W 11–13.6 → about 7–9 (charge ~17–23 → ~10–13); most useful together with 4 |

1 is cheapest and was measured to work: do it first. 2 and 3 address the vertical-line finding; 3 also fixes the
horizontal and through-origin lines that make Square Area, Pythagorean Area, Ruler and Exact Change score null on
55–77% of newborns. 4 and 5 are what make fractions *cheap to move through*, not just common at birth; worth doing only
if 1–3 leave play still whole-number heavy, since the rules themselves (19 of 43 with 100%-whole tops, two of three at
the played table) keep pulling toward integers whatever the law. A board of mostly fraction-friendly rules (Whole
Crossing, Ruler, Pythagorean Area, Same on Both Rulers) is the other lever, at the deal.

## 8. C3 applied (trial)

The coordinator's trial of rank 3. Motive: a quarter of newborn lines were vertical (dead for 10 of the 11 families), and
a fraction cost 2.5–4× a whole step, which does not match the owner's intent that lines live fully in the rationals.

**The code** (`LINE_Q_CODES` in `lib/v2-linear/src/line.ts`; the codes `mixedIntCode` and `stepsIntCode` in
`lib/v2-core/src/codes.ts`). On `line-q`, φ(a, b, c) = mixed⅛(a) + steps¹⁄₁₆(b) + mixed⅛(c) on the primitive triple:

- mixed⅛(0) = 3 bits; mixed⅛(±n) = 1 − log2(7/8) + mixedPos(n) (mixedPos the factorisation code, STEP·Σ e·p + log2 Z);
- steps¹⁄₁₆(0) = 4 bits; steps¹⁄₁₆(±n) = 1 − log2(15/16) + GEO + STEP·(|n| − 1), GEO = −log2(1 − 2^−½), so b = 1, 2, 3,
  4 cost 0, ½, 1, 1½ bits more.

Each is complete (Kraft sum 1, tested) and unbounded. `line-z`, `line-z4` and the grids keep their codes. The law's
direct draws (`lineLaw(lineQ)`) draw each coordinate from its own code, and the importance weights use each code's own
normaliser (`Law.log2Norm(t)`); births and the walk's surcharge read φ through `readLength`. Σπ² = 5.14e-4 (the
uniqueness table, regenerated; 1.17e-2 before), so the uniqueness shift at 18 objects is 0.01 bits (0.16 before).
A half step from y = 3x + 5 pays a surcharge of 4.5 bits (5.0 before), a tilt by 1 pays 0.5, a stretch by ½ 0.5 (1.0).

**Births** (`births`, the seeded walk on `line-q`; `scripts/fractions.ts --parts births`, 40,000 newborns over 200
seeds):

| | vertical | horizontal | through origin | b = 1 (whole) | b 2..4 | b ≥ 5 |
| --- | --- | --- | --- | --- | --- | --- |
| before (C0) | 27.4% | 27.3% | 34.0% | 29.3% | 15.5% | 27.9% |
| after (C3) | 4.0% | 9.7% | 10.0% | 34.3% | 38.9% | 22.8% |

Both match the Monte Carlo of §4 (C0 26.9 / 27.1 / 34.5 / 29.3 / 15.3 / 28.5, C3 4.0 / 9.6 / 9.7 / 34.3 / 38.7 / 23.0):
the walk's stationary law is the law the valuation draws from (`lib/v2-linear/test/law.test.ts` checks it).

**Play** (`scripts/fractions.ts --parts play --agents plain`, the mixed table of §1, 3 seeds; share of objects):

| | t = 0 | 60 s | 120 s | 300 s | objects at 300 s | committed moves | fraction → whole |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before: fractional | 41.9% | 8.9% | 8.0% | 8.5% | 71 | 727 | 21 |
| after: fractional | 61.3% | 10.3% | 5.8% | 10.5% | 95 | 1692 | 50 |
| before: vertical | 19.4% | 22.2% | 22.0% | 28.2% | | | |
| after: vertical | 6.5% | 7.7% | 5.8% | 7.4% | | | |

The vertical lines leave the board (28% → 7% at 300 s) and the fractional share at the start rises by half, but play
still clears fractions within a minute: with the shipped starters no act makes a whole line fractional (causes 1 and 2
of §2 are unchanged), so the share at 300 s is again what births add. Caveat: the "after" run valued scores with the
line-q value files computed under C0 (stale until they are regenerated), so the agents' choices, though not the births,
may shift once the values are rebuilt.
