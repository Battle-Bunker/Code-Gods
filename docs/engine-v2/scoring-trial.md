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

## Per part (the coordinator's follow-up: the band on the reading, not the line)

The whole-order version priced moving height between numbers. The per-part version changes three things
(`sidewaysPerPart`, `partRule`; numbers from `node --experimental-strip-types lib/v2-linear/scripts/trial-sideways-part.ts 200`):
- **energy** = g·log2(1 + reading) + sideways;
- **starts** are lines whose reading is within half a doubling of s's, with the other numbers drawn from the law;
- **the class** is any target at or above s's target, at least as close as s is to its own target.

B is measured without its third part. Results are [seen]: 200 starts, three rules. The additive fee is 4.4 per unit;
"units" below is sideways divided by that fee.

| Line | A: lift + sideways (units); tree closeness bits | B | C |
|---|---|---|---|
| on targets y = 101x + 867 | 667 + 66 (15); 4.95 | 976 + 267 (61); 8.09 | 1,186 + 224 (51); 6.38 |
| one unit off | 669 + 60 (14); 3.37 | 976 + 269 (61); 6.50 | 1,184 + 26 (6); 0.43 |
| halfway | 687 + 1 (0); 0.00 | 1,013 + 0 (0); 0.00 | 1,241 + 26 (6); 0.56 |
| doubled, off targets | 767 + 66 (15); 0.37 | 1,076 + 10 (2); 0.07 | 1,286 + 32 (7); 0.87 |
| ten times, on targets | 1,000 + 118 (27); 4.34 | 1,293 + 767 (175); 11.26 | 1,486 + 27 (6); 0.62 |

- **Bigger-is-better** [seen, tested]: sideways is 38, 62 and 68 at c = 100, 1,000 and 10,000, against lifts of 666 to
  1,329, with about half the starts already in the class. It is small, but not 0: starts half a doubling below pay a
  little to come up.
- **Ordering against conditional rarity** [seen]: the rank correlation of sideways with the tree's closeness bits,
  over offsets 0 to 200 from a target, is 0.97 for B and 0.70 for A. A's dips come from the class definition: a far
  offset that lands near the next prime ending in 1 is close to that target, which is the right answer.
- **Exact against one off**: modest for coefficient rules (A 66 against 60, B 267 against 269, within noise). Not
  modest for the area rule: C drops from 224 to 26 when m moves from 101 to 102, because the area moves by 37.
- **Sparsity** [seen], on target at matched size near 5,000: suffix "1" gives 117, suffix "101" gives 699 and powers
  of 2 give 861. Near 100: 56, 82 and 95. Sideways grows with sparsity.
- **No saturation at the rename price** [seen]: a stretch onto a far target carries lift, so routes to sparse
  targets keep growing.
- **How this could be wrong**:
  - The routes are bounded at two shortcuts plus one finish.
  - The band is half a doubling, and narrowing it would lower bigger-is-better's residue.
  - Rarity and sideways were compared on two rules and eleven offsets, so the 0.97 is narrow evidence.

## Neighbourhood, no lift (the owner's definition, 16 November, late)

Script: `lib/v2-linear/scripts/neighbourhood-trial.ts` (`--pairs 160`). The owner: "If we define the neighbourhood of a
utility level as the states with dependent params for the rule (in whatever representation the rule draws its params
from) within a Gaussian band of height in each of those parameters with matching mean and variance as the distribution
of states within the utility level ... then let's define the expected sideways distance to a utility level as the
expected distance between a state sampled from its neighbourhood distribution and a state sampled uniformly randomly
from its member states." V1 is that; V2 (the coordinator's amendment) prices the way to the NEAREST member.

**Built.** A rule reads one number in its own representation (y-intercept c, x-intercept X = −c/m, signed area
−c²/(2m)); the line's other number is free. A level is an interval of the reading: exact (one point), a target's basin
(midpoints to its neighbours), or one unit off. Members: the reading uniform in the interval, the free number from the
scale-free law. Neighbourhood: log2 of the reading Gaussian with the members' mean and spread, the spread at least 0.5
doublings (the minimum band, so a one-point level is not degenerate); the free number from the law. Prices: the log
mode's callPrice. V1: to the member line exactly (tilt then shift, shift then tilt, or a stretch then a shift). V2: the
single addition (or stretch) solved onto the level, as `finish()` does, with V1's routes as a fallback. One seed.

#### (1) Energy against height, on the y-intercept (pairs 160; σ_min 0.5 doublings)

| target set | h (doublings) | T | exact V1 / V2 | basin V1 / V2 | basin width | retype price |
|---|---|---|---|---|---|---|
| whole numbers ending in 7 | 4 | 17 | 360 / 79 | 927 / 18 | 10.0 | 553 |
| whole numbers ending in 7 | 8 | 257 | 1247 / 880 | 1847 / 475 | 10.0 | 1928 |
| whole numbers ending in 7 | 12 | 4097 | 15762 / 15442 | 22292 / 11517 | 10.0 | 19167 |
| whole numbers ending in 7 | 16 | 65537 | 195639 / 195307 | 361907 / 188868 | 10.0 | 289006 |
| primes ending in 1 | 4 | 11 | 384 / 56 | 582 / 10 | 21.0 | 476 |
| primes ending in 1 | 8 | 251 | 1289 / 1026 | 2180 / 237 | 15.0 | 1898 |
| primes ending in 1 | 12 | 4091 | 14183 / 13957 | 25187 / 9803 | 30.0 | 19141 |
| primes ending in 1 | 16 | 65521 | 204995 / 204782 | 341898 / 170294 | 85.0 | 288936 |
| primes ending in 101 | 4 | 101 | 690 / 365 | 25541 / 19 | 2601.0 | 1110 |
| primes ending in 101 | 8 | 101 | 619 / 354 | 28263 / 20 | 2601.0 | 1110 |
| primes ending in 101 | 12 | 5101 | 20604 / 19854 | 27488 / 48 | 3000.0 | 23602 |
| primes ending in 101 | 16 | 65101 | 184582 / 184398 | 416006 / 26287 | 6000.0 | 287093 |
| squares | 4 | 16 | 289 / 76 | 363 / 22 | 8.0 | 543 |
| squares | 8 | 256 | 1115 / 871 | 2575 / 187 | 32.0 | 1923 |
| squares | 12 | 4096 | 15490 / 15127 | 22787 / 2870 | 128.0 | 19163 |
| squares | 16 | 65536 | 219509 / 219116 | 306869 / 136563 | 512.0 | 289001 |
| powers of 2 | 4 | 16 | 314 / 68 | 1029 / 17 | 12.0 | 543 |
| powers of 2 | 8 | 256 | 1325 / 1027 | 1877 / 46 | 192.0 | 1923 |
| powers of 2 | 12 | 4096 | 14010 / 13651 | 26482 / 81 | 3072.0 | 19163 |
| powers of 2 | 16 | 65536 | 185672 / 185363 | 398631 / 82 | 49152.0 | 289001 |

#### (2) One joint tied condition against its single-number parent (y-intercept on T; joint: and the gradient on the number of T's digits)

| T | parent V1 / V2 | joint V1 / V2 |
|---|---|---|
| 11 | 355 / 59 | 95 / 94 |
| 251 | 1133 / 871 | 879 / 879 |
| 4091 | 14532 / 14055 | 12110 / 11998 |
| 65521 | 219136 / 218814 | 212707 / 212707 |

#### (3) Representation neutrality: the same exact target read in three representations

| T | y-intercept V1 / V2 | x-intercept V1 / V2 | signed area V1 / V2 |
|---|---|---|---|
| 11 | 421 / 58 | 1435 / 116 | 18661369 / 161590 |
| 251 | 1224 / 934 | 7506 / 2019 | 1106234 / 630435 |
| 4091 | 15488 / 14554 | 71093 / 25196 | 29317738 / 14560787 |
| 65521 | 244051 / 243677 | 1690466 / 985313 | 44719980712 / 35756936544 |

#### (4) Exact against one unit off (primes ending in 1, y-intercept)

| T | exact V1 / V2 | one off (T ± 1) V1 / V2 |
|---|---|---|
| 11 | 545 / 59 | 296 / 57 |
| 251 | 1474 / 818 | 1140 / 821 |
| 4091 | 13342 / 13065 | 15384 / 15061 |
| 65521 | 212702 / 212374 | 206417 / 206067 |

### What it says (seen narrowly unless marked)

1. **Energy rises with height at the same rate for every target set, in both variants, on exact levels**, and the rise
   is about proportional to T itself (4,000 → 65,000: ×15), close to the price of retyping the number (the shift from 0
   to T). Built, mostly: an exact level's members are the same whatever the set, so the set cannot matter; and a
   minimum band of 0.5 doublings around T puts the neighbourhood about 40% of T away, a move whose price grows with T.
   So on exact levels the measure reads the band, not rarity. The coordinator's conjecture for V1 holds and extends to
   V2: exact levels do not separate the sets.
2. **On basins, V2 separates the sets sharply; V1 does not.** V2 at h = 16: whole numbers ending in 7 (basin 10 wide)
   about 189,000; primes ending in 101 (basin 6,000) about 26,000; powers of 2 (basin 49,000) 82. A wide basin catches
   most neighbourhood draws, so V2 tracks basin width, which is rarity's direction (a narrow basin is rare). V1 stays
   near 360,000 to 420,000 for all: it measures the spread of the members, as conjectured. V1 also passes the retype
   price on basins (about 1.3 to 1.4 times it), since a random member's free number is far away too.
3. **A joint tied condition is not dearer than its parent** (joint: the y-intercept on T and the gradient on T's number of
   digits): V2 about equal or lower (94 against 59 at T = 11, then 879 against 871, 11,998 against 14,055). Built: the
   neighbourhood matches every dependent parameter, so the tied gradient is drawn near its target too; adding a condition
   narrows the neighbourhood as much as it narrows the level.
4. **Not representation-neutral.** For the same exact T, the x-intercept costs 2 to 7 times the y-intercept (V2) and the
   signed area thousands to a hundred thousand times. The cause is the mutators: shift and tilt act on m and c, so
   putting the x-intercept on T needs a tilt to c/T and the signed area a tilt to c²/(2T), fractions whose size and
   bottom the price charges; there is no move that acts on X or the area directly (a stretch keeps X and scales the
   area by its factor). A representation is neutral only if every representation has its own additions.
5. **Exact and one unit off cost the same** (within the noise: 13,065 against 15,061, 212,374 against 206,067). Built:
   both are one-point levels with the same minimum band; closeness earns nothing under this definition, only which level.

**How this could be wrong.** The minimum band dominates every exact level (results 1, 3 and 5 move with it); one seed
and 160 pairs; routes are one solved addition or two additions, with no other shortcuts (mirror, swap, turn); members are
uniform in the reading, not law-weighted; the neighbourhood rounds readings to bottoms of at most 4; the "retype" price
is a single shift from 0, not a defined operation.

**Guess, for the owner.** The neighbourhood idea separates rarity only where a level has width (basins), and only in V2.
For the owner's wish (sideways alone gives energy, rising faster for some rules than others), the level must be the
rule's basin, not its exact hit, and the mutator set must give each representation its own additions; otherwise one
representation is privileged by price.

## Neighbourhood, pooled (V2; the coordinator's correction of the brief)

Script: `lib/v2-linear/scripts/neighbourhood-pooled.ts` (`--pairs 200`). Built: the level at size T is every trophy of
the rule's set within 0.5 doublings of T (if none, the nearest trophy), all members; the neighbourhood is log2|c|
Gaussian matched to the members (spread at least 0.5 doublings), the gradient from the law; energy is the mean cheapest
price to the NEAREST member (a solved shift either side and either sign, or the stretch by the exact ratio). "Basin":
each member's basin, reached at its nearest edge. On the y-intercept; one seed. Seen narrowly:

| target set | T ≈ 100 exact / basin (members) | T ≈ 1,000 exact / basin (members) | T ≈ 10,000 exact / basin (members) | T ≈ 100,000 exact / basin (members) |
|---|---|---|---|---|
| whole numbers ending in 7 | 130 / 73 (7) | 258 / 195 (70) | 333 / 371 (707) | 496 / 397 (7071) |
| primes ending in 1 | 119 / 68 (3) | 259 / 197 (24) | 467 / 273 (182) | 559 / 460 (1536) |
| primes ending in 101 | 239 / 0 (1) | 251 / 0 (1) | 1089 / 393 (2) | 1376 / 404 (19) |
| squares | 138 / 120 (3) | 338 / 186 (11) | 592 / 377 (34) | 965 / 467 (111) |
| powers of 2 | 249 / 101 (1) | 670 / 212 (1) | 1018 / 290 (1) | 1335 / 404 (1) |
| retype price (a shift from 0 to T) | 1104 | 5382 | 45183 | 440201 |

1. **Pooled, the sets separate, and the rates differ.** From T ≈ 100 to 100,000 (exact): ending in 7 rises 130 → 496,
   primes ending 1 119 → 559, squares 138 → 965, powers of 2 249 → 1,335, primes ending 101 239 → 1,376. Dense sets rise
   slowest, sparse ones fastest: the direction rarity asks for. The guess "ending in 7 flat and tiny" is half right: it
   is the lowest, but it still rises, because the shift to the nearest member costs more lift at a larger height.
2. **All stay far below the retype price** (440,201 at 100,000): no saturation in this range. Energy grows about with
   the number of digits (logarithmically), not with T.
3. **Basins compress the differences** (all about 400 to 470 at 100,000): a sparse set's wide basins catch more
   neighbourhood draws, cancelling its sparsity. Exact pooled levels separate better.
4. **Neutrality with each representation's own additions at the same fee: equal, by construction.** The computation
   above then runs on that representation's own number unchanged, so the x-intercept and the signed area give the same
   table. The non-neutrality of the previous section was the mutator menu (shift and tilt act on m and c), not the measure.

How it could be wrong: one seed; a band of 0.5 doublings fixes how many trophies pool (seven at T = 100 for ending in 7,
one for powers of 2), so the comparison depends on it; routes are one shift or one stretch; prices are the trial's log
mode only.


## Tied conditions (nearest member over pooled levels, no lift; the coordinator, 16 November)

Script: `lib/v2-linear/scripts/tied-conditions.ts` (`--pairs 120`). Question: does a rule's energy rise when it demands
more at once? Built: nested joint levels, every member meeting all parts. Prime Gradient (suffix 1): L1 |m| rounds to a
pooled prime p; L2 also gcd(p + 1, ⌊|c|⌋) ≥ g. Smooth Intercept {3, 7}: L1 |c| a pooled smooth s; L2 also gcd(s + 1,
⌊|m|⌋) ≥ g. Prime Top (ends 13, over 7): L1 the crossing in a pooled fraction's basin; L2 also within δ of p/7; L3 also
||c| − r| ≤ ½ (r the leftover top). Start: the main number log-Gaussian matched to the level's members; the other number
from the law (its members span every size, so there is no size to match). Energy: the mean cheapest route found of up to
two solved moves (si.tilt or mach.stretch onto a gradient; si.shift, cross.shift or mach.stretch onto a y-intercept),
each aimed from the line it starts on, membership tested on the line reached; friction only. E (Δ) is the energy and its
rise over L1 (over L2 at δ = 1/16 for L3); [bits] is the added condition's conditional rarity: for gcd, the share of
whole parts 1 to 4096 that pass, averaged over the level; for δ, 2δ over the basin width; for L3, the share of law draws
of |c| within ½ of r. Hold: from an L2 member at p, the cost of stepping p up to the next member keeping L2 (g ≥ 4),
tied (the secondary reads p′ + 1) against independent (it keeps reading p + 1). Seen narrowly (one seed, one parameter
per family):

#### Prime Gradient (suffix 1)

| T (members) | L1 | L2 g ≥ 2: E (Δ) [bits] | L2 g ≥ 4: E (Δ) [bits] | L2 g ≥ 8: E (Δ) [bits] | L2 g ≥ 16: E (Δ) [bits] | hold g ≥ 4: tied / independent |
|---|---|---|---|---|---|---|
| 100 (3) | 93 | 165 (72) [0.5] | 234 (141) [1.6] | 369 (276) [2.7] | 601 (508) [3.9] | 100 / 108 |
| 1000 (24) | 153 | 217 (64) [0.7] | 394 (241) [2.0] | 845 (692) [3.3] | 1267 (1114) [4.2] | 528 / 130 |
| 10000 (182) | 192 | 199 (6) [0.7] | 267 (75) [2.1] | 2060 (1868) [3.3] | 7014 (6821) [4.3] | 3094 / 166 |

#### Smooth Intercept {3, 7}

| T (members) | L1 | L2 g ≥ 2: E (Δ) [bits] | L2 g ≥ 4: E (Δ) [bits] | L2 g ≥ 8: E (Δ) [bits] | L2 g ≥ 16: E (Δ) [bits] | hold g ≥ 4: tied / independent |
|---|---|---|---|---|---|---|
| 100 (1) | 135 | 229 (94) [1.0] | 854 (719) [5.4] | 854 (719) [5.4] | 854 (719) [5.4] | 42 / 77 |
| 1000 (3) | 237 | 248 (10) [0.8] | 322 (85) [2.2] | 1265 (1028) [3.7] | 3114 (2877) [6.8] | 366 / 172 |
| 10000 (3) | 358 | 391 (32) [0.9] | 992 (633) [2.2] | 8905 (8547) [4.1] | 14904 (14546) [5.0] | 157 / 180 |

#### Prime Top (ends 13, over 7)

| T (members) | L1 | L2 δ = 1/4: E (Δ) [bits] | L2 δ = 1/16: E (Δ) [bits] | L2 δ = 1/64: E (Δ) [bits] | L3 (δ = 1/16 and ||c| − r| ≤ ½): E (Δ over L2) [bits] |
|---|---|---|---|---|---|
| 100 (1) | 14 | 71 (57) [5.4] | 343 (329) [7.4] | 514 (500) [9.4] | 509 (165) [2.2] |
| 1000 (2) | 317 | 534 (216) [6.4] | 939 (622) [8.4] | 2963 (2646) [10.4] | 1247 (308) [4.2] |
| 10000 (20) | 1060 | 1264 (205) [6.4] | 3232 (2173) [8.4] | 9243 (8184) [10.4] | 3773 (540) [3.9] |

1. **Added conditions cost, and more the more they demand** (seen narrowly). Every row rises with g, δ and L3, apart from
   ties within noise at small g. The earlier "joint tied ≈ parent or cheaper" (#1148) came from drawing the tied number
   near its own target (built there); here the tied number comes from the law, and that is the difference.
2. **The increment does not track the conditional rarity in bits.** It tracks how far the condition forces the tied
   number to move. A dense condition met near the start is nearly free (Prime Gradient at T ≈ 10,000, g ≥ 2: +6 for 0.7
   bits). A condition that forces a large tied number is dear well beyond its bits (g ≥ 16: +6,821 for 4.3 bits): a
   member needs a divisor of p + 1 of at least g, often only a large prime factor, so |c| must grow to it. Per bit, Δ runs
   from about 9 to 2,900; it is not a constant rate.
3. **A secondary read from the main part's value costs more to hold, at size** (seen narrowly). Stepping p up and keeping
   L2: Prime Gradient 528 against 130 at T ≈ 1,000 and 3,094 against 166 at T ≈ 10,000; Smooth Intercept 366 against
   172 at T ≈ 1,000. At small T, and Smooth Intercept at 10,000, the two are about equal (42 against 77, 157 against
   180). There a stretch onto the next rung can land on a tied number that passes by luck. The restart that decision 29
   asks for shows up as a price.

How it could be wrong: the routes found are upper bounds (two moves, a few aims each), so a cleverer route could close
gaps, most likely the large ones; the rarity measure (whole parts 1 to 4096) is a choice, and a law-sized measure would
give larger bits for g ≥ 8; levels at T ≈ 100 hold one to three members (Smooth Intercept's single level hides g ≥ 4 to
16 behind one factor of 82); one suffix, one prime set and one Prime Top parameter; friction only.


## Dynamic energy (no tables, no levels, no lift; the owner, 16 November, late)

Code: `lib/v2-linear/src/trial-dynamic.ts`; report: `lib/v2-linear/scripts/dynamic-trial.ts` (`SIZE_BY=bits` for the
other size rule); the rules mirror's trial panel has a "dynamic (energy)" pill. Built:

- energy(s, F) = the mean over K = 30 starts x of min(direct(x → s), floor(x), heuristics(x)).
- A family F is a continuous utility of the line's readings, the readings it `reads`, and its `searches` (heuristics
  that propose target readings; parameterised by the family's drawn parameters).
- Start: a random line whose read numbers have s's size (magnitude: a whole number whose log2 is uniform in
  [log2|v|, log2|v| + 0.5), never below s, so no climb in size is added); the numbers F does not read come from the law.
- direct (the ceiling): solved moves onto s itself (one, or tilt and shift in either order). Floor, shared by every
  family: each single move with a solved amount onto one of s's readings (either sign), and the shortcuts (the four
  mirrors, stretch by 2, 3, ½, ⅓, −1). Heuristics: every proposal tried, so adding one never raises the energy on the same
  starts (built; tested).
- Fresh randomness each estimate. Price: the log trial's friction.
- Five example utilities: bigger |c|; |m| near a prime ending in 1 (log2 p − √distance); |c| near a number made of 3s and
  7s (Ω − √distance); the owner's example with k = 3, length read as log2|n|; a tied conjunction (min of the prime
  utility and log2 gcd(p + 1, ⌊|c|⌋)).

In the climb table, "exact" sits on the target and "near" a little off it (lower utility). [floor only] is the energy
with the generic floor alone, on the same starts: it shows how overvalued a family is before its heuristics exist.
Seen narrowly (one parameter per family, one state per size):

#### (2) Energy along a climb (K = 30, band 0.5 bits; mean of 5 fresh estimates ± the sd of one; [floor only, same starts])

| family | T ≈ 100: exact (u) | near (u) | T ≈ 1000: exact (u) | near (u) | T ≈ 10000: exact (u) | near (u) |
|---|---|---|---|---|---|---|
| bigger-c | 0 ± 0 (100.00) [0] | 0 ± 0 (99.00) [0] | 0 ± 0 (1000.00) [0] | 0 ± 0 (999.00) [0] | 0 ± 0 (10000.00) [0] | 0 ± 0 (9999.00) [0] |
| prime-gradient-1 | 28 ± 4 (6.66) [51] | 26 ± 2 (6.16) [61] | 31 ± 2 (9.95) [148] | 27 ± 4 (9.45) [126] | 59 ± 10 (13.28) [235] | 52 ± 8 (12.78) [197] |
| smooth-3-7 | 56 ± 6 (4.00) [57] | 57 ± 2 (3.50) [138] | 146 ± 12 (4.00) [180] | 134 ± 6 (3.50) [224] | 259 ± 12 (6.00) [269] | 250 ± 15 (5.50) [336] |
| owner-k3 | 55 ± 7 (25.36) [55] | 61 ± 6 (22.53) [108] | 180 ± 12 (57.06) [180] | 169 ± 9 (52.82) [220] | 281 ± 23 (101.44) [281] | 284 ± 12 (95.78) [324] |
| tied-gcd-1 | 63 ± 6 (5.67) [656] | 68 ± 6 (5.67) [1945] | 352 ± 11 (8.95) [7196] | 376 ± 18 (8.95) [21485] | 3356 ± 274 (12.28) [82778] | 3077 ± 349 (12.28) [209662] |

#### (1) Cost: 6 ms per estimate on average (max 33), 518 utility evaluations (max 1074); K = 30, Node v22.23.4

#### (3) Non-monotonicity (a state and a small change of a read number: share where the higher-utility one scores lower; and by more than twice the jitter of one estimate)

| family | pairs | higher u, lower energy | by more than 2 sd |
|---|---|---|---|
| bigger-c | 18 | 44% | 0% |
| prime-gradient-1 | 18 | 11% | 0% |
| smooth-3-7 | 18 | 17% | 11% |
| owner-k3 | 18 | 17% | 0% |
| tied-gcd-1 | 12 | 75% | 33% |

#### (4) Hunt for overvaluation (per start: the estimate's price / a deeper search's (depth 4, beam 6); the worst six)

| family, T, state | estimate | deep | ratio | deep route |
|---|---|---|---|---|
| prime-gradient-1, 10000, exact | 403 | 15 | 26.70 | mach.stretch → mach.stretch |
| smooth-3-7, 1000, exact | 238 | 25 | 9.64 | mach.stretch → mach.stretch → si.shift |
| prime-gradient-1, 10000, exact | 124 | 17 | 7.39 | mach.stretch → mach.stretch |
| smooth-3-7, 1000, exact | 276 | 38 | 7.24 | mach.stretch → si.shift |
| smooth-3-7, 1000, exact | 219 | 33 | 6.61 | mach.stretch → cross.shift |
| tied-gcd-1, 100, exact | 76 | 12 | 6.54 | mach.stretch → mach.stretch |

Starts where the deeper search is cheaper by more than 1.5×: 69 of 600. Energy ratio estimate / deep: bigger-c 100 exact 0.00; bigger-c 100 near 0.00; bigger-c 1000 exact 0.00; bigger-c 1000 near 0.00; bigger-c 10000 exact 0.00; bigger-c 10000 near 0.00; prime-gradient-1 100 exact 1.03; prime-gradient-1 100 near 1.22; prime-gradient-1 1000 exact 1.21; prime-gradient-1 1000 near 1.51; prime-gradient-1 10000 exact 2.06; prime-gradient-1 10000 near 1.46; smooth-3-7 100 exact 1.12; smooth-3-7 100 near 1.30; smooth-3-7 1000 exact 1.69; smooth-3-7 1000 near 1.22; smooth-3-7 10000 exact 1.17; smooth-3-7 10000 near 1.10; owner-k3 100 exact 1.21; owner-k3 100 near 1.25; owner-k3 1000 exact 1.31; owner-k3 1000 near 1.37; owner-k3 10000 exact 1.07; owner-k3 10000 near 1.05; tied-gcd-1 100 exact 1.11; tied-gcd-1 100 near 1.08; tied-gcd-1 1000 exact 1.05; tied-gcd-1 1000 near 1.15; tied-gcd-1 10000 exact 1.06; tied-gcd-1 10000 near 1.00.

#### (5) Sensitivity at T ≈ 1000, exact (mean of 5 ± sd)

| family | band 0.25, K 30 | band 0.5, K 30 | band 1, K 30 | band 0.5, K 10 | band 0.5, K 60 |
|---|---|---|---|---|---|
| prime-gradient-1 | 32 ± 4 | 33 ± 3 | 33 ± 6 | 29 ± 4 | 34 ± 4 |
| smooth-3-7 | 162 ± 13 | 154 ± 7 | 173 ± 15 | 142 ± 7 | 150 ± 9 |
| owner-k3 | 164 ± 6 | 172 ± 15 | 189 ± 16 | 148 ± 23 | 173 ± 6 |
| tied-gcd-1 | 184 ± 17 | 360 ± 34 | 586 ± 68 | 319 ± 40 | 349 ± 22 |

#### (6) Do sums over 20 objects separate two standings? (10 fresh sums each; z = difference of means / sd of one sum)

| standing | sum (mean ± sd) | z against A |
|---|---|---|
| A: 20 objects at T ≈ 1000, on target | 3560 ± 106 | |
| B: the same, a little off target | 3480 ± 116 | 0.69 |
| C: on target at T ≈ 500 | 2418 ± 71 | 10.74 |

1. **Cheap** (seen): about 6 ms and 500 utility evaluations per estimate in Node.
2. **Bigger is better scores 0** (built: starts are never smaller than the state). The other families rise with size,
   with jitter of about 5 to 10% of one estimate.
3. **Without its heuristics a family is overvalued, by very different amounts** (seen narrowly): prime gradient 2 to 5
   times, smooth and the owner's example up to 2.4 times near target, the tied conjunction 10 to 60 times (floor 82,778
   against 3,356 at T ≈ 10,000). A conjunction is the extreme case: no single solved move onto s's readings satisfies
   both parts, so the generic floor almost always falls back to the direct route.
4. **The deeper search still finds cheaper routes**: 69 of 600 starts are cheaper by more than 1.5 times; energy ratio
   up to 2.1 (prime gradient at T ≈ 10,000). The pattern is a shortcut stretch followed by a solved move (stretch →
   stretch, stretch → shift): the reference tries shortcuts and solved moves, never one after the other. That is a
   heuristic to add (built: adding it can only lower the energy).
5. **Sums separate size, barely utility** (seen narrowly): 20 objects on target at T ≈ 1,000 against the same objects
   at T ≈ 500 differ by z = 10.7 (sd of one sum 106 against a difference of 1,142). Against the same objects a little
   off target, z = 0.7. Reason: a state a quarter off target and its target are about equally hard to reach from a
   random object of their size, so a small loss of utility costs little energy (built, by the min over routes).
6. **Non-monotonicity:** a small change that raises utility lowers the energy by more than 2 sd in 0 to 11% of pairs
   for the one-number families, but 33% for the tied conjunction (12 pairs).
7. **Size by bits (top plus bottom) is exploitable; magnitude is the default** (seen narrowly, my trial choice, declared
   here). With bits, a state a little off target with a fraction (m = p + ¼) scored about three times its on-target
   neighbour (prime gradient 82 against 29 at T ≈ 100; 20-object sums 6,457 off target against 3,501 on, z = −20.8).
   Its starts are fractions too, and tidying them costs, so a player could raise a score by adding bottom bits. By
   magnitude the same pairs score about equal (26 against 28).
8. **The random walk numbers are a repair cost, a different quantity.** The first version started from s after three
   random menu moves. That measured the cost of repairing a random disturbance (prime gradient 94 to 206, smooth 43 to
   54), and it scaled with the walk's length (73, 117 and 207 for walks of 1, 3 and 6).

How it could be wrong: one parameter and one state per family and size; the heuristics are mine and simple, and better
ones lower energies by unknown amounts (item 4); "near" is a single offset (a quarter, or a half for the owner's
example); the deeper search is itself bounded (depth 4, beam 6), so overvaluation may be larger than seen; the owner's
"length" read as log2|n| and the conjunction as a minimum are my readings; whole starts under magnitude ignore how
fractions are distributed at a size.


## Dynamic energy: follow-ups (the owner's replies, 16 November)

- **Size is defined only on the readings a family declares** (`reads`): a reading that is a value gets its magnitude.
  (Built: a family that reads a top and a bottom separately would declare both; none does yet.) **Cause of the bits
  exploit:** bottoms were counted for rules that read only the value. A fractional state then got starts with
  bottoms of the same length, and tidying them is dear, because an amount's fee grows with its size, not its digits.
  Measured (log trial): a tilt by 1/4 costs 19, by 1/1000 4,767, by 100 477, by 10,000 47,669. A many-digit fraction
  therefore costs far more than its digits.
- **The generic floor now tries a shortcut followed by a solved move**, onto s's readings and onto the targets the
  family's heuristics propose from where the shortcut lands (built).
- **The owner's precision shapes are added:** `powerCubedFamily(k)` (√(log2 P) − |c − P|³, P the nearest power of k)
  and `primeCubedFamily(suffix)` (the same on primes with a suffix, on |m|). Precision is the rule's job; these are not
  dealt.
- **Grids** (`lib/v2-grid/src/trial-dynamic.ts`, `scripts/dynamic-grid.ts`): starts are law boards; the floor is the
  cheapest single move of the variant (arguments up to 24 bits); the ceiling rewrites the board onto s, one cells.add
  per differing cell. Seen narrowly (one board of each kind per family, K = 30; "good" is four greedy steps from the
  random board, "top" is greedy until no single move improves):

| family | board | score | energy | ceiling binds | already as good | ms |
|---|---|---|---|---|---|---|
| magic-eighteen | random | [-38,-32] | 6 | 0% | 43% | 801 |
| magic-eighteen | good | [-1,-3] | 506 | 100% | 0% | 1792 |
| magic-eighteen | top | [0,-2] | 503 | 100% | 0% | 1752 |
| opposite-nines | random | [-43,-43] | 3 | 0% | 67% | 310 |
| opposite-nines | good | [-1,-19] | 452 | 100% | 0% | 1264 |
| opposite-nines | top | [0,0] | 475 | 100% | 0% | 1388 |
| strangers | random | [0,0] | 0 | 0% | 100% | 2 |
| strangers | good | [11,3] | 378 | 100% | 0% | 1226 |
| strangers | top | [16,8] | 443 | 100% | 0% | 1148 |

  The rewrite ceiling binds for every start on good and top boards: from a random board no single move reaches them, so
  their energy is the rewrite price (about 380 to 510), and good and top boards score alike. A random board scores
  about 0. One estimate takes about 1.1 to 1.8 seconds in Node (every single move is tried from each start). How it
  could be wrong: one board per kind; a floor of two moves or family heuristics would separate good from top; the
  rewrite by cells.add alone overstates the ceiling where a swap or a spin is cheaper.
