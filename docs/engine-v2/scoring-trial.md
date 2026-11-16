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
score exceeds the height (linear: 2,500 states; log: 250 states, sizes up to 3,000, 4 rules, exact; area to 1e−2 in
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
