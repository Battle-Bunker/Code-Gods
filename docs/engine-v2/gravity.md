# Gravity: a size-based potential for line-q, and the price of height (measured 16 November)

**Status: measurement (step 1).** The owner, 16 November (verbatim in `owner-decisions.md`): "We want gravity towards
smaller numbers to be a configurable force size ... scaled up considerably so that it really behaves like a force of
gravity ... strong gravity so that it becomes increasingly rare and energy expensive to reach bigger solutions and they
score commensurately more in energy/bits", and, on exact hits: "the difference in energy score between states near to
the integer and exactly on it should be modest. Is there anything about our current scoring system that prevents this
intuitive behaviour from actually occurring?"

**Answer: yes, two things, and the data supports both of the coordinator's readings. Each is needed; neither alone is
enough.**

- **(A) The number code.** Line-q's φ codes a and c by their prime factorisation (half a bit per prime unit): 64 costs
  6 bits, 101 costs 50. So φ is not a function of size: a big smooth number is cheap and its prime neighbour dear. Measured:
  Prime Intercept's level is worth 0 → 5.1 bits from the prime 11 to the prime 191, points do not rise with the level in
  4 of 6 families, and greedy climbs run to y-intercepts of 10⁵ to 10⁶ at φ ≈ 40 (smooth numbers). Under a size code
  the level carries the bits: Prime Intercept 0, 5.3, 9.2, 13.1, 16.9, 21.2, 29.5, 35.2 bits for the primes 11 … 151
  (g = 0.25), and points rise with the level in every family whose reading is a coefficient's size.
- **(B) The exchange rate.** A rise in φ is charged 1⚡ per bit, against about 3,100⚡ of income per seat per game. With a
  size code and that rate, a greedy climber with one seat's income reaches 45 to 340 bits in every family (Prime
  Intercept 220–260): bits now track height, but height is nearly free. At 100⚡ per bit of height, the same climbers
  stop at 8 to 44 bits (most 20 to 35), for 150 to 2,000⚡ a level. Under the factorisation code the rate barely matters
  (9 to 17 bits at any rate): there is little height to buy. The fix is both.
- **Exact hits.** With the tree's inner parts capped at 2 bits (`TREE_INNER_BITS`, decision 38), exact, one off and a
  tenth off differ by at most half a bit under every code. Uncapped, even under gravity, the exact hit is worth up to 7.5
  bits more than one off (Prime Intercept at 101, g 0.25: 37.8 against 34.9 … 30.7 at g 0.5), because closeness is
  rarity within the level's basin (about log2 of the basin's width), not height. **The cap is still needed.**
- **Shortcuts** (stretch, mirror, swap, turn) from climbed lines: every one pays its height through its surcharge, and
  none gains more bits than its price, under every code and rate (0 of 21–33 calls per cell).

## The physics

- **Height and potential.** A line y = mx + c is a point at heights |m| and |c| (for a fraction line, |a|/b and |c|/b).
  Its potential is φ = g·height + the bits of its bottom number, g the field strength in bits per unit of height.
- **The still atmosphere.** The law π ∝ 2^−φ is an isothermal atmosphere (the barometric formula): density halves every
  1/g units of height. In a constant field the law is exponential in height, so it is memoryless:
  −log2 P(height ≥ h) = g·h exactly. **The rarity of being at least this high is the potential of this height.** That
  is the deep alignment with the information lens: a rule's level bits (the rarity of reaching its target) equal the
  work done against gravity to lift the line there, whatever the rule.
- **Work and weight.** Climbing costs the height gained, falling is free (the surcharge max(0, Δφ)). The exchange rate
  w (⚡ per bit of height) is the weight: the work to lift a line by Δh is w·g·Δh. A seat's income I buys about I / w
  bits of height in a game, so I / w is the temperature of play against par (about 25 bits): at w = 1 it is ~3,000 bits
  (boiling: anything is reachable); at w ≈ 120 it is ~25 (par).
- **Fine structure.** Within a level, closeness to the target is a separate, small term (the cap): being exactly on the
  target is about log2(basin width) rarer in the law, but costs only a step (a shift, a nudge); the cap keeps its points
  to the price of that step, which is the owner's intuition for floor-like moves.
- **Fractions.** The bottom number pays twice: in its own code (half a bit per unit) and as the finer grid it sits on
  (about log2 b: a position to precision 1/b). So 100½ costs about 2½ bits more than 100 or 101 (g 0.25), never tens of bits, and
  rationals stay first-class (principle 13): their φ is smooth in their value.

## The code (lib/v2-linear gravity.ts)

φ(a, b, c) = B(b) + H(a | b) + H(c | b), H(n | b) = g·(|n|/d)^α + log2 Z(d), d = max(b, 1),
Z(d) = Σ_n 2^(−g(|n|/d)^α), B the steps code on b (p(0) = 1/16, half a bit per unit, as now). Complete for each b, so
the law is a sub-probability on canonical lines; draws are exact (a closed form for α = 1); bits ≤ φ holds and prices
stay an exact potential (Δφ telescopes). The factorisation term is **dropped**: it is exactly what makes neighbours differ
by tens of bits (the cause of (A)); keeping any of it brings back cheap smooth plateaus and dear prime peaks.

Shapes compared: α = 1, a constant field (each unit of height costs g bits); α = 1.5, a field that steepens with height
(the k-th level up costs more than the last: Prime Intercept's increments 6, 6, 8, 10, 14 bits at g 0.05 against 5, 4,
4, 4, 4 at g 0.25, α 1). Both behave; α = 1 is memoryless (level bits = g·Δh), has closed-form draws and normaliser, and
its value tails are sampled well; α > 1 needs lower tilts to sample its top (its tables reach 90 bits, then stop).

## Measurements

Method (`lib/v2-agents/scripts/gravity-measure.ts`, simulation: law draws and a greedy climber, not play): each family's
first dealable parameters and first two tie-breakers, valued as a tree from 50,000 importance-weighted draws per tilt
(tilts 1 … 0.07 for gravity; 1 … 0.3 now), bits clamped at φ (an exact bound: the state itself has its score). Level
bits: the level term at the first eight targets. Exact / ±1 / ±1/10: the line at the sixth target and one unit or a
tenth off in the reading. Greedy: three law-drawn starts, the energy gate's menu (`v2-no-straight-hill.test.ts`), one
seat's income (3,115⚡), each call priced fee + rate × surcharge; "Nb ML k" = best N bits, M levels up, k⚡ per level.
Kept: median (worst) share of bits after a cheap move from the climbed line. The gate fails past 35 bits.

Two defects found on the way (reported to the spec lead, who owns tree-value.ts): the level tail summed W minus a
running sum, which cancels at the rare top and read up to 1,013 bits (fix: sums from the top); and the level estimate at
the top of the sampled range can pass φ (fix: clamp at φ).


### prime-intercept

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 0.0 3.0 3.5 3.9 4.1 4.4 4.6 4.8 | NO | 101: 7.1 / 8.4 / 7.1 | 101: 15.6 / 9.5 / 13.3 | 17b 7L 190; 14b 5L 532; 14b 8L 177 | 12b 3L 296; 13b 4L 697; 14b 5L 249 | 12b 3L 739; 12b 3L 153; 14b 5L 605 | 99% (98%) | 0/33 |
| g 0.1 | -0.0 2.1 3.6 5.2 6.6 8.6 11.6 14.2 | yes | 101: 12.6 / 12.6 / 12.6 | 101: 19.5 / 18.7 / 19.5 | 219b 24L 75; 217b 14L 23; 216b 19L 157 | 50b 6L 459; 95b 8L 377; 51b 6L 466 | 30b 3L 957; 32b 6L 486; 24b 3L 812 | 100% (99%) | 0/33 |
| g 0.25 | -0.0 5.3 9.2 13.1 16.9 21.2 29.5 35.2 | yes | 101: 25.2 / 25.2 / 25.2 | 101: 37.8 / 34.9 / 40.0 | 221b 19L 63; 257b 11L 191; 221b 18L 66 | 57b 5L 391; 73b 5L 575; 73b 5L 588 | 34b 3L 998; 34b 3L 1020; 21b 1L 2081 | 100% (100%) | 0/33 |
| g 0.5 | -0.0 10.9 18.0 27.4 36.3 46.1 61.6 72.8 | yes | 101: 50.1 / 49.9 / 50.1 | 101: 61.2 / 53.7 / 62.2 | 261b 13L 146; 260b 9L 284; 261b 7L 169 | 50b 1L 1900; 76b 3L 926; 50b 1L 1817 | 22b 1L 2756; 31b 2L 1153; 22b 2L 1046 | 100% (99%) | 0/33 |
| steep g 0.05 α 1.5 | 0.0 6.1 12.2 20.2 30.3 44.2 88.7 88.7 | yes | 101: 48.2 / 48.2 / 48.2 | 101: 55.4 / 56.8 / 55.4 | 91b 6L 101; 93b 5L 131; 93b 3L 205 | 48b 1L 2142; 48b 3L 610; 48b 1L 1757 | 24b 2L 1398; 24b 2L 1423; 24b 2L 867 | 100% (99%) | 0/33 |

### landing-tuple

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 0.0 3.4 3.9 4.2 4.5 4.7 4.9 5.2 | NO | 101: 8.7 / 8.3 / 8.7 | 101: 17.0 / 9.6 / 17.0 | 9b 2L 270; 25b 12L 253; 9b 3L 183 | 9b 2L 403; 25b 9L 337; 9b 3L 297 | 9b 2L 781; 11b 4L 777; 9b 3L 591 | 100% (81%) | 0/32 |
| g 0.1 | -0.0 4.9 6.1 6.9 7.5 8.3 9.3 10.0 | yes | 101: 12.3 / 12.3 / 12.3 | 101: 19.5 / 17.6 / 19.5 | 46b 8L 298; 75b 16L 69; 44b 13L 148 | 29b 6L 518; 30b 7L 281; 28b 8L 314 | 23b 7L 425; 26b 5L 516; 23b 6L 482 | 99% (18%) | 0/33 |
| g 0.25 | -0.0 5.6 7.1 8.1 8.8 9.8 10.9 11.9 | yes | 101: 13.8 / 13.8 / 13.8 | 101: 18.1 / 19.0 / 18.1 | 62b 10L 296; 45b 8L 320; 45b 8L 321 | 27b 3L 815; 23b 6L 473; 30b 3L 924 | 22b 2L 1496; 13b 4L 526; 15b 2L 1549 | 99% (35%) | 0/33 |
| g 0.5 | -0.0 6.7 8.2 9.5 10.8 11.9 13.4 14.3 | yes | 101: 15.6 / 15.9 / 15.6 | 101: 18.3 / 19.6 / 18.3 | 70b 11L 151; 70b 10L 175; 70b 8L 313 | 19b 3L 723; 19b 3L 719; 34b 5L 489 | 23b 5L 609; 23b 5L 607; 28b 7L 442 | 98% (32%) | 0/33 |
| steep g 0.05 α 1.5 | -0.0 6.1 7.7 8.7 9.4 10.3 11.8 12.6 | yes | 101: 14.3 / 14.3 / 14.3 | 101: 18.0 / 18.2 / 20.6 | 35b 4L 267; 37b 4L 319; 48b 4L 271 | 35b 3L 700; 28b 5L 384; 37b 6L 369 | 28b 9L 267; 35b 11L 276; 28b 11L 250 | 96% (35%) | 0/33 |

### treasure-tuple

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 0.4 0.7 1.0 1.3 1.6 1.8 2.0 2.2 | NO | 28: 3.9 / 3.5 / 4.0 | 28: 5.7 / 3.5 / 5.7 | 9b 4L 623; 10b 7L 92; 13b 6L 205 | 17b 9L 304; 12b 7L 424; 12b 5L 278 | 13b 6L 499; 9b 6L 445; 12b 5L 572 | 100% (100%) | 0/33 |
| g 0.1 | 0.1 0.1 0.2 0.3 0.5 0.7 0.9 1.2 | NO | 28: 3.0 / 2.5 / 3.0 | 28: 4.9 / 2.5 / 4.9 | 174b 14L 65; 372b 4L 264; 262b 35L 83 | 51b 7L 423; 49b 6L 437; 82b 6L 459 | 23b 2L 1099; 23b 3L 832; 23b 6L 339 | 100% (100%) | 0/33 |
| g 0.25 | 0.1 0.3 0.6 0.9 1.4 1.9 2.5 3.2 | NO | 28: 3.9 / 3.6 / 3.9 | 28: 6.0 / 3.6 / 6.0 | 238b 7L 62; 238b 5L 143; 238b 5L 149 | 71b 5L 552; 67b 7L 391; 67b 5L 414 | 23b 5L 395; 30b 2L 1508; 26b 3L 996 | 100% (99%) | 0/33 |
| g 0.5 | 0.3 0.7 1.2 1.9 2.8 3.9 5.2 6.6 | yes | 28: 5.9 / 5.6 / 5.9 | 28: 7.8 / 5.6 / 7.8 | 340b 5L 174; 340b 14L 35; 340b 13L 38 | 67b 3L 732; 67b 4L 576; 95b 7L 436 | 27b 3L 896; 26b 4L 677; 35b 3L 1022 | 100% (99%) | 0/33 |
| steep g 0.05 α 1.5 | 0.1 0.2 0.5 0.8 1.2 1.7 2.4 3.2 | NO | 28: 3.7 / 3.2 / 3.7 | 28: 5.7 / 3.2 / 5.7 | 74b 2L 271; 74b 6L 30; 74b 3L 184 | 74b 4L 582; 50b 2L 966; 45b 5L 610 | 29b 6L 464; 28b 6L 461; 29b 5L 569 | 100% (99%) | 0/33 |

### rulers-tuple

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 2.0 2.4 2.7 2.9 4.7 5.3 5.4 5.4 | yes | 111: 7.3 / 7.1 / 7.3 | 111: 13.2 / 7.1 / 11.6 | 11b 14L 32; 11b 4L 118; 10b 2L 46 | 9b 3L 370; 11b 5L 234; 9b 1L 2639 | 9b 3L 628; 10b 5L 387; 8b 1L 641 | 63% (31%) | 0/33 |
| g 0.1 | 1.9 2.6 3.1 3.5 7.1 8.9 9.2 9.5 | yes | 111: 10.9 / 10.9 / 10.9 | 111: 15.7 / 14.6 / 15.7 | 21b 21L 22; 21b 7L 144; 74b 11L 85 | 21b 14L 117; 21b 21L 44; 19b 8L 332 | 19b 13L 233; 21b 22L 114; 16b 11L 277 | 98% (12%) | 0/33 |
| g 0.25 | 2.0 2.7 3.3 3.8 8.5 10.8 11.3 11.7 | yes | 111: 12.8 / 12.8 / 12.8 | 111: 19.8 / 16.0 / 19.8 | 27b 6L 161; 29b 11L 15; 29b 11L 15 | 22b 10L 306; 22b 9L 339; 22b 9L 338 | 16b 4L 760; 16b 3L 1014; 16b 3L 1006 | 64% (16%) | 0/33 |
| g 0.5 | 2.2 3.1 3.8 4.4 10.2 14.0 14.4 14.9 | yes | 111: 16.0 / 16.0 / 16.0 | 111: 20.6 / 19.6 / 20.6 | 36b 7L 225; 36b 16L 84; 36b 11L 239 | 24b 12L 259; 36b 11L 120; 23b 8L 369 | 8b 5L 68; 28b 14L 222; 8b 3L 27 | 100% (45%) | 0/33 |
| steep g 0.05 α 1.5 | 2.0 2.9 3.5 4.0 8.7 11.4 12.1 12.6 | yes | 111: 13.4 / 13.4 / 13.4 | 111: 18.7 / 17.6 / 18.7 | 32b 9L 32; 32b 9L 72; 32b 9L 20 | 19b 10L 283; 32b 12L 54; 19b 9L 333 | 8b 6L 19; 32b 12L 141; 7b 4L 8 | 44% (15%) | 0/33 |

### fraction-gradient

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 0.0 0.7 1.1 1.4 1.6 1.8 1.9 2.1 | yes | 11/2: 5.8 / 5.9 / 5.8 | 11/2: 8.3 / 9.0 / 7.1 | 8b 6L 24; 14b 8L 236; 8b 4L 37 | 12b 8L 343; 11b 4L 575; 11b 5L 509 | 9b 5L 530; 9b 2L 1427; 9b 6L 495 | 100% (100%) | 0/33 |
| g 0.1 | 0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 | NO | 11/2: 4.5 / 4.4 / 4.5 | 11/2: 5.7 / 5.2 / 5.1 | 258b 7L 69; 256b 6L 121; 95b 20L 148 | 120b 15L 208; 103b 7L 438; 85b 8L 352 | 39b 12L 257; 38b 15L 207; 31b 20L 156 | 100% (100%) | 0/33 |
| g 0.25 | 0.0 0.2 0.4 0.7 0.9 1.2 1.5 1.7 | yes | 11/2: 4.6 / 4.8 / 4.8 | 11/2: 5.5 / 5.7 / 5.1 | 269b 5L 138; 268b 12L 93; 269b 13L 118 | 85b 17L 182; 95b 18L 173; 92b 11L 275 | 27b 5L 612; 39b 19L 153; 39b 10L 309 | 100% (100%) | 0/33 |
| g 0.5 | -0.0 0.4 0.9 1.4 1.9 2.4 2.9 3.4 | yes | 11/2: 5.8 / 6.2 / 5.8 | 11/2: 6.6 / 7.1 / 6.2 | 330b 9L 85; 328b 12L 79; 330b 16L 65 | 90b 21L 148; 90b 13L 239; 92b 18L 173 | 37b 10L 309; 29b 10L 309; 37b 7L 436 | 100% (100%) | 0/33 |
| steep g 0.05 α 1.5 | 0.0 0.1 0.3 0.5 0.7 1.0 1.2 1.5 | NO | 11/2: 4.5 / 4.7 / 4.5 | 11/2: 5.3 / 5.4 / 4.9 | 76b 6L 23; 78b 5L 37; 78b 5L 44 | 76b 10L 263; 76b 5L 359; 76b 2L 1239 | 33b 20L 156; 44b 7L 441; 31b 12L 258 | 100% (100%) | 0/33 |

### mixed-intercept

| code | level bits (first 8 targets) | rise | exact / ±1 / ±1/10 at 6th target (cap 2) | same, uncapped | greedy rate 1: bits, levels, ⚡/level | rate 30 | rate 100 | kept (r1) | shortcuts gain > price |
|---|---|---|---|---|---|---|---|---|---|
| now (factorisation) | 0.0 0.7 1.1 1.4 1.8 2.2 2.6 3.0 | NO | 17/2: 5.6 / 6.3 / 6.2 | 17/2: 10.2 / 10.8 / 10.8 | 16b 15L 155; 17b 9L 251; 16b 10L 302 | 16b 14L 198; 16b 8L 266; 16b 11L 192 | 14b 11L 263; 13b 6L 461; 13b 9L 324 | 100% (87%) | 0/33 |
| g 0.1 | 0.0 0.1 0.2 0.3 0.5 0.8 1.3 2.1 | NO | 17/2: 3.9 / 4.0 / 4.8 | 17/2: 4.7 / 4.7 / 5.3 | 282b 19L 23; 282b 19L 28; 282b 19L 27 | 94b 18L 168; 74b 9L 346; 84b 10L 300 | 30b 24L 129; 29b 4L 749; 28b 16L 194 | 100% (99%) | 0/33 |
| g 0.25 | 0.0 0.2 0.4 0.7 1.2 1.9 3.2 5.2 | yes | 17/2: 5.4 / 5.3 / 5.9 | 17/2: 6.2 / 6.0 / 6.7 | 238b 19L 20; 238b 14L 32; 238b 21L 24 | 92b 14L 222; 92b 13L 236; 92b 17L 177 | 30b 15L 206; 33b 10L 286; 32b 14L 222 | 100% (99%) | 0/33 |
| g 0.5 | -0.0 0.4 0.9 1.4 2.4 3.9 6.4 10.5 | yes | 17/2: 7.2 / 7.7 / 7.9 | 17/2: 8.3 / 8.8 / 8.9 | 277b 26L 17; 277b 12L 30; 275b 22L 19 | 87b 11L 283; 94b 12L 259; 95b 18L 172 | 30b 8L 383; 32b 10L 296; 32b 16L 171 | 100% (100%) | 0/33 |
| steep g 0.05 α 1.5 | -0.0 0.1 0.3 0.5 1.0 1.7 3.1 5.9 | yes | 17/2: 4.9 / 5.3 / 5.7 | 17/2: 5.9 / 6.3 / 6.5 | 72b 10L 17; 70b 6L 96; 70b 16L 13 | 72b 7L 380; 70b 5L 473; 70b 7L 396 | 44b 19L 162; 38b 14L 222; 37b 8L 389 | 100% (100%) | 0/33 |

## Readings that amplify a coefficient

Treasure (y at x = 3, i.e. 3m + c), Fraction Gradient (m) and Mixed Intercept (c, levels 1 apart) gain few bits per
level under gravity (0.2 to 0.7 bits at g 0.25), because their targets are close together in height: that is the field
working as meant (a level is worth the height it takes). Their ladders are long, which is fine with the price of height
in place; without it (rate 1) they are the fastest runaways (238 to 340 bits).

## Row 10 under gravity

Landing and Same on Both Rulers keep a median 64 to 99% after a cheap move from the climbed line, but their worst cheap
move (a tilt or mirror that throws the crossing or the meeting point far) keeps 12 to 45%, worse than now (81%,
31%). Their readings divide by the gradient, so a small move can carry the line a long way in height. To watch in play.

## The exchange rate with the real act charge

The tables above price a call at fee + w × surcharge. The game charges an act W + 0.05·W² (v2-economy charge.ts), so
the superlinear term multiplies the price of height too. Re-measured with it (g 0.25, three starts, greedy, one seat's
3,115⚡; best bits each):

| w (⚡ per bit of height) | Prime Intercept | Prime Landing | Treasure | Same on Both Rulers |
|--:|---|---|---|---|
| 1 | 699, 21, 1,015 | 34, 27, 27 | 51, 51, 51 | 7, 30, 30 |
| 10 | 21, 21, 21 | 26, 25, 25 | 26, 24, 46 | 7, 22, 23 |
| 30 | 13, 13, 13 | 16, 11, 11 | 17, 13, 13 | 7, 12, 13 |
| 60 | 13, 13, 4 | 11, 10, 6 | 12, 9, 7 | 7, 8, 8 |

At w = 10 a seat's whole income buys about par (21 to 26 bits) in the intercept and crossing families, 100 to 350⚡ a
level; small steps stay cheap (W + βW² is near W for small W) and a big jump pays the square. (The 1,015 at w = 1 is
the tree's top-tail defect above, not a real value.)

## What was built (step 2)

1. φ on line-q (and line-q-lenses, which shares its values): the constant field (α = 1),
   `params.gravity = { g: 0.25, alpha: 1 }` (`LINE_Q_GRAVITY`, lib/v2-linear type.ts). A preset picks it with its
   variant; another g is another law and needs its own value files, so a lighter or stronger gravity is a new variant
   with its values, not a free room setting.
2. The price of height: `Variant.heightPrice` (lib/v2-core contracts.ts), the surcharge w·max(0, Δφ), default
   `HEIGHT_PRICE` = 10 on line-q. Exact potential (w·Δφ telescopes); falling free; the walk and the law unchanged.
3. The swap's floor reads the variant's code for one coefficient (`coefficientBits`).
4. Line-q's value files regenerated under the new law (same draws as before).
5. `TREE_INNER_BITS` stays 2. The two tree defects are with the spec lead.

Not yet: pair-q (two lines; its own codes, the same field to follow), grids (the grid-rules session's uncapped cells
should use the same g: a cell of value n costs g·|n| bits), and α > 1 (needs lower tilts to sample its tops).
