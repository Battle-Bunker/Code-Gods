# Scoring trial: height, friction plus lift, trophies (16 November)

**Status: a trial, declared by the coordinator; not the owner's decision.** Built beside the existing machine in
`lib/v2-linear/src/trial.ts` (tests: `lib/v2-linear/test/trial.test.ts`); nothing existing changes. Labels:
**[built]** true by construction (and tested by enumeration where said), **[narrow]** seen in the worked example only,
**[guess]** conjecture.

## The design

A line y = mx + c with common bottom number b (the triple's b) is the point (|m|, |c|, b) plus the signs of m and c.
Vertical lines are off the trial board.

| | Formula | Dial (my choice) |
|---|---|---|
| Height | H = g·(\|m\| + \|c\| + b − 1) bits. A fraction's top and bottom are both sized: 61/2 costs 30.5 + 1 units. | g = 1/40 bit per unit |
| Friction distance | D(s,t) = α·(Δ\|m\| + Δ\|c\| + Δb) + σ·(sign changes of m and of c) | α = 1/120, σ = 1/40 |
| Lift | L(s,t) = max(0, H(t) − H(s)); falling is never refunded | |
| Price of a call | ν + max(own fee, D(before, after)) + L. Own fee: additive moves α per unit added (slide: \|u\|+\|v\|); stretch/zoom μ·log2(\|p\|·q) of the factor p/q; choices (mirror, swap, turn, fold) 0 | ν = 1/80, μ = 1/40 |
| Energy | w × bits | w = 100 (gravity.md's par rate) |
| Trophy T | a region of (\|m\|, \|c\|, b), b read as a real ≥ 1 (a relaxation: a superset of the lines holding it) | |
| Worth | worth(T) = inf of H over T (the cheapest holder's height) | |
| Price to T | P(s,T) = inf over t in T of D(s,t) + L(s,t) | |
| Score | max(0, max over the rule's trophies of worth(T) − k·P(s,T)) | k = 2 |
| Points | as today: own score × the others' scores summed | |

**What follows [built; the bounds tested on 2,500 states × a fixed list of 43 calls (those valid there) × 4 rules, over 50,000 calls, the area rule on 40 states to 1e−4]:**
d = D + L is a quasi-metric that no call undercuts (the `max` makes every call pay at least the distance it covers), so
a call of price p raises no score by more than k·p and lowers none by more than k × its undo's price; and since
worth(T) ≤ H(t*) ≤ H(s) + P, no score exceeds the line's height (k ≥ 1). No tables, no sampling: worth is a formula of
the family's parameters and the trophy.

**(a) One coefficient.** A trophy is a span of a size, e.g. "|m| rounds to p" is |m| ∈ [p − ½, p + ½). Worth = g × the
span's smallest size: g·(p − ½). P has a closed form (`boxPrice`): move each coordinate to its nearest point in the
box (α a unit); if that leaves the line higher, take height off any coordinate down to the box's floor at α a unit (it
saves g > α of lift) until the lift is gone; pay g a unit for the rest. Exact.

**(b) Composite readings** (area c²/2|m|, crossing −c/m, distance): a trophy is a curve in (|m|, |c|), and holders
must respect "a nonzero fraction with bottom b is at least 1/b", or tiny lines would hold any area for free. Worth and
P are one-dimensional minimisations along the curve (per point, the best b is closed form). Implemented numerically for
area (log grid, then golden section); about 2 ms a trophy. Not closed form: see the last section.

**(c) Layers (trees).** A layer narrows a trophy: (main ∧ second ∧ …) is a smaller region, so its cheapest holder is
no lower: worth(main ∧ second) ≥ worth(main). The rule's trophies are all depths together and the score is still one
max, so there are no cliffs ([built]: same bound), and closeness keeps value because P is a price, not a rank.
Decision 29 holds by the shape of the trophy: the second layer's targets depend on the main target (in the example,
divisors of the intercept's target), so stepping the main part up restarts the second layer's ladder. A second layer is
worth something only where it forces extra height (here g·e for ⌊|m|⌋ = e).

**Locks.** Ignored in worth and in P (the adversary's argument: counting them makes a lock a toll on others' scores).
A lock changes what moving costs, never what a state is worth.

## Worked example (computed by `node --experimental-strip-types lib/v2-linear/scripts/trial-example.ts`, numbers in bits, energy = 100 × bits)

Three seats. **A**: gradient-prime, suffix "1" (|m| rounds to 11, 31, 41, 61, 71, 101, …). **B**: intercept-smooth over
the drawn primes {3, 17} (c rounds to 3, 9, 17, 27, 51, …, 289, 459, 729, 867, …), layered: ⌊|m|⌋ divides that number.
**C**: area-square (axis-triangle area n², n ≤ 300).

| State | H | A | B (trophy) | C (trophy) |
|---|---|---|---|---|
| y = 2x + 9 (start) | 0.28 | 0 | 0.24 (9, ⌊m⌋=3) | 0.21 (100) |
| y = 2x + 867 | 21.73 | 0 | 21.69 (867, 3) | 2.57 (300²) |
| y = 101x + 867 (joint state) | 24.20 | 2.51 (101) | 22.12 (867, 51) | 1.03 (300²) |
| y = (751689/7442)x + 867 (the line asked about) | 210.23 | 2.51 | 22.62 (867, 289) | 1.03 |
| y = 289x + 867 (B's second layer on 289) | 28.90 | 7.05 (311) | 28.89 (867, 289) | 0.61 (36²) |
| y = x/8 + 61/2 (C's cheapest holder of 3721) | 0.94 | 0 | 0.64 | 0.90 (61²) |

| Move from y = 101x + 867 | Price (friction + lift) | Effect |
|---|---|---|
| Big nudge y = 2x+9 → 2x+867 (shift +858) | 7.16 + 21.45 = 28.61 (2,861⚡, more than one seat's game) | B +21.4 |
| Big nudge tilt +99 (m 2 → 101) | 0.84 + 2.48 = 3.31 | A +2.5, B +0.4 |
| Tilt +45/7442 to the exact area 3721 | 62.0 + 186.0 = 248 | nobody gains; C gets 3721 as cheaply on y = x/8 + 61/2 |
| Tilt +188 (m → 289, B's layer) | 1.58 + 4.70 = 6.28 | B +6.8, A +4.5, C −0.4 |
| Refinements: tilt −½, shift ±½, shift −1 | 0.02–0.04 | each score moves ≤ 0.01 (exact vs near miss: modest) |
| Knock: shift −10 / repair +10 | 0.10 / 0.35 | B −0.16 |
| Knock: halve (stretch ½) / repair (stretch 2) | 4.05 / 16.13 | A −1.3, B −10.8, C +0.8 |
| Knock: mirror in the x-axis | 0.06 | nothing (no rule reads a sign) |

Readings [narrow, this example only]: the joint state costs about 32 bits (3,200⚡) to build, so two seats must pool;
the exact three-way coincidence costs 248 bits because exactness here forces a bottom of 7442, and it pays nothing a
near miss does not; A's best trophy is worth 2.5 against B's 22 because B's targets are bigger numbers; C is worth
about one bit on any line because the cheapest holder of an area is small.

## Parameters I chose, and what is load-bearing for the owner

Mine (cheap to change): g, α, σ, ν, μ, k, w above. The constraint between them that matters: **α > g/(2k)** (here
g − 2kα = −g/3), so moving height from one coefficient to another costs more score than it gains: each card then
cares about its own number, not "be high" (the adversary's first objection). With α below that, every card reads "be
high" [built].

Load-bearing (costly to change later):
1. **Shortcuts versus the bound.** Every call pays at least the friction distance it covers, so a stretch, swap or
   diagonal mirror costs by the size it moves, like an add (halving y = 101x + 867 costs 4 bits, its repair 16).
   Decision 25 ("shortcuts priced as choices, never by the unit path") survives only where a shortcut moves no size
   (mirror: 0.06). Keeping shortcuts cheap and the bound together needs the score's distance to know the shortcuts
   (a shortest path over add and halve), which makes distances logarithmic: overshooting a target then costs almost
   nothing and the cards collapse to a staircase of height. One or the other; I chose the bound.
2. **Height is shared across coefficients.** One height per line means stored height anywhere (even in a large bottom
   number) can be converted, at friction, into any reading: B scores more on the line asked about than on y = 101x +
   867 because its 7442 bottom is stored height. Per-reading heights would end that and end the single potential.
3. **Worth = cheapest holder's height makes families unequal by construction**: a coefficient trophy is worth g × its
   size, an area trophy about g·1.9·A^(1/3), a crossing about 2g·√X. Balancing families by rescaling worth breaks
   "score ≤ height"; balancing them by the parameter draw (comparable target sizes) does not.

## What the formula cannot do cleanly (reported, not patched)

- **Composite readings have no closed form** for P: a one-dimensional minimisation with breakpoints per trophy, and
  the bounds hold only to the minimiser's tolerance. Scoring scans trophies one by one (area: maxN as a parameter), so
  it is slow on high lines.
- **Ratio readings are weak** (above, point 3), and their cheapest holders are small lines, so an area or crossing rule
  is in no tension with "be high": a high line sits a cheap trim away from a big area.
- **Rules that want small numbers have no worth**: a trophy's worth is its cheapest holder's height, so "the intercept
  is near 0" is worth about nothing. Adversaries to the climb can only be rules on other coefficients or spoilers;
  "small against big" on one coefficient is gone [built].
- **The trim stays** [built]: lowering an object onto my own trophy costs friction only and drops rivals above me by up
  to k × friction; repair costs friction plus lift (shift −10: 0.10 to cause, 0.35 to repair).
- **Families are unbalanced** unless parameter draws give targets of similar size (A's 101 against B's 867).
- **The relaxation is generous**: b is read as a real, so P can undercount what a real holder needs (the area 3721 near
  y = 101x + 867 is priced as if reachable without the 7442 bottom). Safe for the bounds, loose as a price.

## How this could be wrong

The example is three hand-picked rules on a handful of states; nothing about play follows from it. The bounds are
true by construction; whether play under them stays dynamic is untested. Dials were chosen by reasoning, not
measurement; a different α/g ratio changes which trophy each card prefers.

# Log height: scale-invariant gravity (second trial mode, 16 November, evening)

The owner, on the linear height: "If field strength is just a scalar times number size then it's just linear, which
doesn't match the gravity metaphor, which is intended to create something resembling scale invariant dynamics ... We
want gravity to gradually attenuate so that numbers climb superlinearly with constant investment of energy." Built as
`TRIAL_LOG` beside `TRIAL` (the mirror's Scoring trial panel toggles them; log is the default there).

## The form

- **Force ∝ 1/size, height ∝ log.** Each number's height is g·log2(1 + size): every doubling costs g wherever it
  is, so constant energy buys a constant number of doublings and numbers climb exponentially [built]. The +1 removes
  the singularity at 0 (near zero the height is linear, about 1.44g a unit). A fraction's bottom number pays its own
  doublings, g·log2 b, so 1/1000 costs ten doublings, not nothing. H = g·(log2(1+|m|) + log2(1+|c|) + log2 b).
  The matching rarity law is a power law (scale-free) [built: 2^(−H/g) ∝ (1+size)^(−1)].
- **Why not inverse square.** A force ∝ 1/size² gives a height that levels off: g·(1 − 1/(1 + size)), a finite
  escape energy. Past a modest size every number would be reachable for the same price, so worth would stop growing
  and "bigger is better" would end in a plateau. It would need something else (friction growing with size) to
  confine, which brings back the linear case through the back door [built].
- **Friction is the game's own fees** (adding by the amount, multiplying by the factor's digits, mirror and swap as
  choices), floored by a friction distance in log coordinates X = log2(1+|m|), Y = log2(1+|c|), B = log2 b:
  D = 2·|ΔX + ΔY| (along the size direction: a stretch) + 30·|ΔX − ΔY| (across it: a change of shape, which is the
  crossing) + 30·|ΔB| + 3 per sign change. g = 100⚡ a doubling. A call's price = max(game fee, D) + lift [built: so
  no call undercuts D, and the bounds hold as before].
- **Shortcuts.** A stretch ×2 costs its fee (about 5.5⚡) plus 2g of lift at any size: a short move, as decision 25
  wants. The price to a trophy is the log-distance metric, which includes every shortcut (a prime's multiples sit one
  doubling from it). It is not the exact cheapest route: that is a shortest path over rationals with digit-priced
  factors, not a closed form (see "the staircase" below).
- **Why two frictions.** Under any metric that charges |ΔX| + |ΔY|, doubling both numbers (a stretch) and moving a
  doubling from one number to the other (a swap, a turn) cost the same friction; so either stretches are dear or height
  is fungible between coefficients and every card reads "be high". Splitting the metric into the size direction
  (cheap) and the shape direction (dear, 30 > g/(2k) = 25) separates them [built]. Swapping y = 101x + 867 to
  y = 867x + 101 costs 185⚡, not a choice's 3.

## The tests

The bound tests ran again in both modes: no call moves a score by more than k × its price or its undo's price, and no
score exceeds the height (linear: 2,500 states; log: 250 states with sizes up to 3,000 for three rules and 120 small states for the layered rule, exact; area to 1e−2 in
log mode on 15 states) [built and tested].

## Worked example, log mode (`node --experimental-strip-types lib/v2-linear/scripts/trial-log-example.ts`; ⚡)

| State | H (doublings) | A gradient prime "1" | B 3s and 17s, layered | C square area (n ≤ 400) |
|---|---|---|---|---|
| y = 101x + 867 | 1,643 (16.4) | 667 (101) | 1,582 (729, ⌊m⌋ = 81) | 799 (400²) |
| next good place up y = 131x + 1377 | 1,747 (17.5) | 704 (131) | 1,711 (1377, 153) | 837 |
| ten times the size y = 1010x + 8670 | 2,306 (23.1) | 998 (1021) | 2,264 (7803, 867) | 931 |

| Move at y = 101x + 867 | Price | Effect |
|---|---|---|
| Doubling (stretch ×2) | 5.5 + 199 lift = 205 | A +99, B +194, C +39 |
| Halving (stretch ½) | 34 (the guard: a bottom of 2 is a doubling of shape) | A −103, B −138, C −37 (278 in all, 8× its price) |
| Repair of the halving | 133 | all back |
| Cheapest knock found (step +1) | 5.6 | 1.8 in all |
| Shift −1 / −10 / +100 | 4.4 / 44 / 454 | B −0.1 / −0.9 / +7.7 |
| Swap m and c | 185 | A +309, B −131, C −371 |

Do trophies get rarer in cost terms? A's next rung (line y = px), from 11, 101, 1021 and 10061: lift 142, 37, 1.4 and
0.4⚡, and A gains the same (worth gained = lift, by construction); the additive fee for the step is 88, 132, 44 and
132⚡ (by the gap between primes). So in height the rungs get *denser* with size, not rarer: no practical ceiling, but
also no reward for the next prime that a doubling would not give [seen in this narrow test; the density is a fact of
primes: gaps grow like log p, so log-spacing shrinks like log(p)/p].

## The three load-bearing costs of the linear height, re-checked

1. **Shortcuts must pay distance: dissolved** for scaling (a stretch costs its fee at any size) [built]; it remains for
   changes of shape (swap, turn, a halving that leaves a bottom number), now deliberately dear.
2. **Height fungible across coefficients: dissolved in the shape direction** (moving a doubling from c to m costs
   2·30 friction against g = 100 of worth gained, so k·60 > 100) [built]. It stays fungible in the size direction:
   whoever stretches lifts both numbers, so A and B gain together (cooperation along scale, conflict across shape).
3. **Families unequal; small-is-better worthless: half dissolved.** Area ∝ c²/m, so in log height an area trophy's
   worth is about g·(1 + ½·log2(2A)): the same scale as a coefficient's, not a cube root [built]. Small-is-better rules
   still have no worth (a trophy is worth its cheapest holder) [built].

## New costs

- **The staircase stays, and additive friction does not prevent it** [seen, built in its cause]. B's score at
  m = 101 as c runs 767, 857, 866, 867, 868, 877, 967: 1,572, 1,581, 1,582, 1,582, 1,582, 1,583, 1,590, though the
  direct shift back from 967 costs 438⚡. The score may only charge a lower bound on the cheapest route, and the only
  closed-form lower bound every shortcut respects is the log distance, which makes 967 and 867 nearly the same place.
  So an exact hit is worth almost nothing over a near miss, and each card reads "be high on my number". The exact
  cheapest route (a shortest path over rationals with digit-priced factors) would restore two-sided hills of about one
  shift's fee, but it is a search, not a formula: the by-construction bounds would then hold only for moves the search
  covers. This is the clearest load-bearing choice for the owner now.
- **Layers become as large as the main part.** B's second layer adds a gradient's height (g·log2(1+e)), as much as
  A's whole rule; B's best trophy at y = 101x + 867 is (729, ⌊m⌋ = 81), not (867, ·) [seen].
- **Knocks are levered.** A halving costs 34 and removes 278 points of score across seats (8×); its repair costs 133.
  The owner wants repair dearer than damage; how much leverage is wanted is open.
- **The area trophy's best is its cap** (n ≤ 400 in the example), because a high line sits a cheap trim of shape away
  from big areas; the cap is a parameter, not a property [seen].

# Scale-free rarity (third trial mode, 16 November, late)

The owner, on what the number should mean: "energy level of a state [is] the conversion of a subjective value/utility
map into something meaningfully related to how objectively difficult it is to reach from a random place given our
available mutators and their cost functions", with height "a universal map over object states that keeps parameters
softly bounded". Built in `lib/v2-linear/src/trial-rarity.ts` (tests `test/trial-rarity.test.ts`; checks
`scripts/trial-rarity-check.ts`; example `scripts/trial-rarity-example.ts`); the mirror panel's third button.

## The design as built

- **Law** [built]: m = p₁/q₁ and c = p₂/q₂ are two independent reduced fractions, not the stored triple. Each top |p| and
  each bottom q is an independent discrete power law with exact survival P(|p| ≥ n) = (n+1)^−(g−1), P(q ≥ k) = k^−(g−1)
  (g = 2); a top's sign is a coin; a pair with a common factor is redrawn. I chose two fractions because the triple's
  common bottom couples m and c, which would spoil both independence and closed forms. H = −log2 P is a function of the
  line, so "fee + rise in H" is an exact potential. One doubling of a top costs about g = 2 bits.
- **Bits** [built]: with T the nearest target, lo, hi its cell's edges (midpoints to its neighbours) and S the
  reading's survival P(r ≥ x):
  `bits = −log2( S(hi) + [S(T − δ) − S(T + δ)]·2^−third )`, δ = |r − T| + res/2 (res = 1).
  The three parts are LEVEL = −log2 S(lo); CLOSE = −log2([S(T − δ) − S(T + δ)] / [S(lo) − S(hi)]); THIRD = CLOSE of
  the second reading against its tied targets. This is exact given S, up to treating the third part as independent.
  The coordinator's flat form log2(gap/(2·distance + res)) was off by 1 to 4 bits against samples (the density is
  not flat in a cell, and integers carry most of a coefficient's mass), so closeness reads S instead.
- **S per reading, not per rule** [built]: a reading's survival does not depend on the rule's parameters, which only
  place targets. A coefficient's S is a sum over bottoms (analytic). Any other reading's S is two numbers (slope, offset)
  fitted once from 400,000 direct draws, about 0.3 s. Nothing is tabled per instance.

## Checked against direct samples (2,000,000 draws; `scripts/trial-rarity-check.ts`) [seen]

| Reading | S | Slope (bits a doubling) | Level error, targets ≥ 16 | Level error, small targets | Closeness error |
|---|---|---|---|---|---|
| coefficient c | summed | 0.95 measured (→ 1 = g − 1) | ≤ 0.22 | 0 | ≤ 0.1 where a cell holds ≥ 5,000 draws; ~1 bit on sparse cells (noise) |
| area c²/2m | fitted | 0.452 (½ predicted) | ≤ 0.15 | 0.4–0.5 | **1–4 bits**: exact areas are atoms the fit cannot see |
| crossing c/m | fitted | 0.760 (1 with a log correction: two equal tails) | ≤ 0.3 | 0.5–0.9 | ≤ 0.5 large, 1–2 small |
| y at x = 3 | fitted | 0.910 | ≤ 0.3 | up to 1.0 (powers of 2 at 2) | ≤ 1.3 |
| distance² c²/(1+m²) | fitted | 0.469 (½ predicted) | ≤ 0.12 | 0.5–1.2 | **up to 5 bits**: perfect squares are atoms (m = 0 gives c²) |

The coordinator's Python figures are confirmed in shape: 1 per doubling for a coefficient, about ½ for area, 0.76
for the crossing.

## The example (bits; A gradient prime ending 1, B 3s and 17s with third part |m| near a divisor, C area square)

| Line | A (level, close) | B (level, close, third) | C (level, close) | H |
|---|---|---|---|---|
| y = 101x + 867 | 7.00 (6.59, 4.95) | 10.28 (9.79, 8.09, 0.27) | 7.25 (7.23, 6.38) | 36.9 |
| one unit off, y = 101x + 866 | 7.00 | 10.28 (close 6.50) | 7.25 (close 2.79) | 36.9 |
| one doubling up, y = 202x + 1734 | 7.85 (target 211) | 10.48 (1377) | 7.69 | 40.9 |
| ten times, y = 1010x + 8670 | 10.13 (1021) | 13.31 (7803) | 8.75 | 50.1 |

## What it does to the earlier modes' failures

- **An exact hit is worth at most one level step** [built: bits lie between −log2 S(lo) and −log2 S(hi); tested].
  The step is slope × log2(hi/lo). That is about 0.4 bits for A at 101 (7.00 against a level of 6.59), and up to a
  whole slope where targets are sparse, as with powers of 2. "Exact only modestly above near" holds by construction.
- **Cards still flatten into "be big on my reading"** [built]: the level depends only on the size of the cell edge
  through S, so any two target sets give nearly the same bits at the same size; a target set decides only where the
  steps are. Rarity does not escape the staircase; it makes the stair treads explicit and small.
- **Small-is-better rules work if read as reciprocals** [seen]: 1/|m| has a fitted slope of 0.998 bits a doubling,
  driven by bottom numbers, as many bits as a coefficient. A rule "the gradient small" written as "1/|m| big" earns
  real bits. Read as closeness to 0 with res = 1, it earns none [built].
- **Layered bonuses are small** [built]: the third part multiplies only the within-cell mass, so it can add at most
  the level step (B's third added 0.27 to 1.25 bits). This is the opposite of the log mode's problem.
- **Rarity is not cost** [built]: no by-construction bound ties bits gained to energy spent. Bits do grow about
  (g−1)/g per bit of lift on the reading (a doubling of c: 2 bits of H, about 1 bit of B's level).

## Where the formula fails or needs the fallback

- **Composite readings with atoms** (area, distance², and anything that takes exact whole values on a lattice): the
  fitted continuous S cannot price exact hits (1 to 5 bits wrong). The fallback is direct sampling of the point mass
  in the target's cell for each drawn rule, a few seconds per rule draw. That is not built.
- **Small sizes** (below about 16) for fitted readings: up to 1.2 bits wrong. A one-time per-reading table of S
  would fix it (parameter-free, so still nothing per instance).
- **Crossing**: two equal tails give a log correction, so a straight line in log-log is only an approximation (0.76
  fitted against an asymptotic 1).

## The tree combination (now the rarity mode's default; the coordinator's correction, 16 November)

The section above combined the parts as one lexicographic rarity, "doing at least this well". The owner chose the tree
on 15 November ("level plus closeness ... a tree structure ... with 3 branching levels"), and the tree is now the
default (`RARITY`; the lexicographic form is `RARITY_LEX`). The parts are:
- **level** = −log2 S(lo): this basin or a higher one;
- **closeness** = −log2 of the chance of being at least this close, given the basin;
- **third** = the second reading at least this good, given both;
- **bits** = level + closeness + third [built].

Each part is a ratio of masses read from S, so it is still a formula of the reading and the drawn targets. An exact
hit's closeness is log2(basin mass ÷ the target's own mass), integers included [built]. The third part's conditional
rarity matches samples within 0.4 bits, because under the law the gradient is independent of the intercept's basin
[seen, tested].

The tree is checked against samples by the same tests as before: a coefficient's level is within 0.22 bits and its
closeness within 0.1 bits where cells are well sampled. The atoms still break composite readings: an area or
distance² exact hit is mispriced by 1 to 5 bits, and in the tree that error goes straight into the bits [seen].

| Line (bits; tree = level + close + third) | A gradient prime ending 1 | B 3s and 17s, third: m near a divisor | C area square | lexicographic A / B / C |
|---|---|---|---|---|
| on targets y = 101x + 867 | 11.54 = 6.59 + 4.95 | 18.15 = 9.79 + 8.09 + 0.27 | 13.61 = 7.23 + 6.38 | 7.00 / 10.28 / 7.25 |
| one unit off y = 102x + 866 | 9.96 (close 3.37) | 16.56 (close 6.50) | 7.66 (close 0.43) | 6.97 / 10.28 / 7.24 |
| halfway to the next targets y = 116x + 1122 | 6.59 | 9.97 | 8.04 | 6.59 / 9.84 / 7.49 |
| one doubling up y = 202x + 1734 | 8.18 | 10.90 | 8.55 | 7.85 / 10.48 / 7.69 |
| ten times y = 1010x + 8670 | 10.45 | 14.96 | 11.12 | 10.13 / 13.31 / 8.75 |
| ten times, on targets y = 1021x + 7803 | 14.46 | 25.35 | 9.22 | 10.15 / 13.45 / 8.60 |

**Do the cards matter now? Yes, by several bits** [seen in this example]:
- On a target against halfway to the next one: A 11.5 against 6.6, B 18.2 against 10.0.
- One unit off costs a bit and a half (A 1.6, B 1.6): modest, as principle 11 asks.
- Climbing has temporary losses. Doubling up from the targets lowers A from 11.5 to 8.2 and B from 18.2 to 10.9,
  until new targets are hit at the larger size (ten times, on targets: A 14.5, B 25.4).
- Precision competes with size: A on its target at 101 (11.5) beats A off target at 1010 (10.5). The level staircase
  stays as the common structure.

**New costs** [seen]:
- **Exact hits are now worth a lot**: B's exact hit at 867 is worth 8.1 bits, nearly as much as climbing the whole
  ladder to 867 (9.8). That is log2 of the basin's mass over the target's: wide gaps between targets give big exact
  hits.
- **A rule on a composite reading is fragile to a unit change in the coefficients**: C loses 6 bits when m moves from
  101 to 102 (the area moves by 37). Its closeness is measured in units of area, not of the line.

# Lift + sideways (fourth trial mode, 16 November, evening)

The owner: "if we measure expected distance from a random state at a similar height to the target utility class,
won't that be a proxy for rarity of the utility level class?" Built in `lib/v2-linear/src/trial-sideways.ts` (tests
`test/trial-sideways.test.ts`; numbers `scripts/trial-sideways-example.ts 300`); the mirror panel's fourth button.
Labels: **[built]**, **[seen]** (narrow: 300 starts per cell, three hand-picked rules), **[guess]**.

## As built

- energy(s) = H(s) + sideways(s). H is the log height (g = 100 a doubling). sideways(s) is the mean, over random
  lines at s's height, of the cheapest price into the class {u ≥ u(s)}. I used **the whole utility order**: a higher
  basin, or the same basin at least as close. That was simpler than applying it per tree part.
- **Starts**: the scale-free law conditioned on a height splits the height uniformly (Dirichlet(1,1,1)) between |m|,
  |c| and the bottom number [derived for the continuous law]. Starts are redrawn until within one doubling of h.
  **Routes are not restricted to the band.**
- **(b) Sampled** [built]: up to two shortcuts (stretch ×2, ×3, ×½, ×⅓, ×−1, three mirrors, the m–c swap), then one
  finishing move. The finishing move is an addition (tilt or shift), or a stretch by the exact ratio priced by the
  factor's digits (the "rename"). Prices are the log mode's: game fee floored by the friction distance, plus lift.
  **This is a bounded search, not the exact shortest path.** Without the rename it found routes costing millions,
  so its result depends on what the menu offers.
- **(a) Formula** for one-number readings [built]: the Dirichlet marginal of the reading's doublings, integrated
  against min(one addition with its lift, a ratio stretch with its lift).

## Results [seen]

| Line (energy = H + sideways) | A gradient prime ending 1 | B 3s and 17s | C area square |
|---|---|---|---|
| on targets y = 101x + 867, H 1,643 | 1,985 (sideways 342; formula 262) | 2,467 (824; 518) | 2,921 (1,277) |
| one unit off y = 102x + 866 | 1,968 (324) | 2,418 (773) | 2,937 (1,292) |
| halfway y = 116x + 1122, H 1,700 | 2,013 (313) | 2,377 (677) | 2,992 (1,292) |
| doubled, off targets y = 202x + 1734, H 1,843 | 2,245 (403) | 2,564 (721) | 3,144 (1,302) |
| ten times, on targets y = 1021x + 7803, H 2,293 | 2,831 (538) | 3,375 (1,083) | 3,782 (1,489) |

1. **Exact versus one off: no difference within noise**, and halfway scores the same too (A 342 / 324 / 313).
   **Energy rises with height**, through H and through sideways growing with the read number's size.
2. **Sideways is not a proxy for rarity here.** The share of same-height starts already in the class is 14–39%,
   which is 1.3–2.8 bits, and it barely changes between on-target and halfway. The rarity mode's tree bits change by
   5–8 bits over the same lines. The conjecture "sideways ≥ rarity − 1 bit" cannot be tested as stated: sideways
   comes out in hundreds of energy units, and rarity at height in 1–3 bits.
3. **Sparsity does not show** [seen]. On a target at 12,101, suffix "101" gives sideways 1,738 and suffix "1" gives
   1,684; powers of 2 at 1,024 give 1,064 against 928 for suffix "1" at 1,021. Sideways grows with the size of the
   number, not with how sparse the targets are, and there was no saturation at the rename price.
4. **Bigger-is-better is not about 0** [seen]: 575, 1,150 and 1,730 at c = 100, 1,000 and 10,000, about the same as
   the target rules at the same size. Cause [built]: a same-height start whose height sits in the other number has to
   move height across (dear in log mode: 30 a doubling of shape) or lift. So sideways measures how much shape change
   reaching the reading's size takes, and that is the same for every rule on that number.
5. **Composite readings just work** [seen]: the route search prices area like any other reading (sideways
   1,277–1,489), with no atoms problem, because prices are not probabilities.
- **(a) against (b)**: the formula is 40–50% below the samples, more so at larger sizes. It leaves out the
  shape-change floor and the second number's own height, so it is a lower bound in practice [seen].

## Why, and how this could be wrong

- [built] The class {u ≥ u(s)} contains every higher basin. Most of its volume at any height is "bigger than s's
  reading", so the price into it is dominated by the price of making the number that big. Exactness and sparsity
  change only the thin slot inside s's own basin, which few same-height starts can enter cheaply.
- [guess] Applying sideways per tree part should isolate the slot: closeness measured as the price from random
  states in the same basin to "at least this close". It would then grow with the gap, like the rarity mode's
  closeness. I did not build it.
- How this could be wrong:
  - The route search is bounded at two shortcuts plus one finish. Better routes, such as several halvings or a swap
    then a stretch, could lower some starts' prices.
  - The band is a Dirichlet split rounded to whole numbers, not the exact conditional law.
  - All figures come from three rules and 300 starts per cell.
