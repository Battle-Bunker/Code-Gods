# Interaction census: how randomly drawn rules meet

The owner's centre of attention (16 November): "causing randomly drawn rules to interestingly interact in terms of a
dynamic mixture of opportunities for conflict and cooperation", with "simple big nudges in a direction towards higher
regions of intersecting score space for 2 or 3 cooperating rules plus separate agents to refine with faster cheap
moves", and "multiple distinct high value states" needed to do well. This census measures that by structure, not by
simulated play. Script: `lib/v2-linear/scripts/census.ts`
(`node --max-old-space-size=12000 --experimental-strip-types lib/v2-linear/scripts/census.ts --draws 100`).

## Method

- **Pool.** The ten dealt beginner families and every tree family on the line type (the seven tuple recasts and the
  nine tree families of `tree-families/first-nine.md`). A drawn rule is a family, a parameter set drawn from its
  `space` (else one of its listed sets) and one of its layer chains.
- **Grid.** Lines y = mx + c with m a fraction with bottom 1, 2 or 3 and |m| ≤ 40 (321 gradients), c with bottom 1 or 2
  and |c| ≤ 160 (641 intercepts): 205,761 lines. A cheap move is one step of m or of c on the grid.
- **Grid rarity.** For each rule, a line's bits are −log2 of the share of the grid scoring at least as well (main part,
  then the dealt layers). Each rule's bar is 5 bits, or just under its best on the grid when its ties are coarser.
- **Per draw (2 or 3 rules):** good lines (every rule at or over its bar); places (good lines connected by cheap
  moves); spread (the farthest two places' best lines, in grid steps); valleys (for each merge of two places in a
  bottleneck tree, how far below the bar the best connecting path dips: passing through a worse state for someone);
  PMI (log2 of the share of good lines over the product of each rule's share: above 0 the rules help each other,
  below 0 they compete); cheap moves (from 1,500 sampled lines, each rule's improving one-step moves, and whether each
  helps, leaves or harms each other rule by more than a quarter bit); alliances (where one rule's main part is in its top
  1/32, Spearman's ρ between its last layer and another rule's main part: |ρ| ≥ 0.3 counts).
- **Verdicts.** hopeless: no good line. dull: |PMI| < 0.5 and under 1 in 10 cheap moves touching another rule. conflict:
  PMI < −1 and harm more than twice help. rich: the rest with two or more places.

**What this is not** (every number below is "seen in a narrow test" under these assumptions): grid rarity is not the
game's law (the law weighs short codes, so small numbers are commoner than here); the grid's cheap moves are not the
game's priced mutators (stretches, reflections and swaps, the representation shortcuts, are absent, so "big nudges"
are only approximated by far places); the grid is bounded, so unbounded ladders are cut at |m| ≤ 40, |c| ≤ 160.

## Results (16 November, seed census-1, 100 draws of two and 100 of three; Square Area as it stood before its redesign)

Seen in a narrow test, under the assumptions above.

| | draws of two | draws of three |
|---|---|---|
| rich / dull / conflict / hopeless | 82 / 8 / 0 / 10 | 57 / 1 / 0 / 42 |
| jointly good places per draw (median) | 26 | 4 |
| draws with two or more places | 90% | 58% |
| of those, some two places joined only through a worse state | 100% (median dip 4.0 bits) | 100% (4.9 bits) |
| cooperative (PMI > 0.5) / competitive (< −0.5) / independent | 56 / 16 / 18 of 90 | 50 / 3 / 5 of 58 |
| cheap improving moves: help / neutral / harm (medians) | 5% / 90% / 5% | 7% / 87% / 5% |
| draws whose cheap moves both help and harm (each ≥ 5%) | 45 of 90 | 39 of 58 |
| alliances (one rule's last layer moves with another's main part, abs ρ ≥ 0.3) | 27 of 88 | 55 of 88 |

### What it says (each with how it could be wrong)

1. **Several distinct good places, separated by valleys, are the norm** (90% of pairs, 58% of triples). The owner's
   "multiple distinct high value states" holds structurally for most draws. How it could be wrong: with many small
   places, a "valley" is often one off-target step; the dip size (4 to 5 bits, about the bar) says the separations are
   real, but the grid's one-step moves exaggerate them compared with the game's shortcuts.
2. **The cooperation is mostly one shared direction: bigger.** Most draws are "cooperative", and the best joint places
   sit on the grid's edge (|c| = 160, the largest areas and distances): almost every primary rewards a big reading,
   whatever the draw (true by construction for "size of the nearest target" primaries; the stopped sessions' second
   caution). On an unbounded board that is a shared climb, not politics. How it could be wrong: grid rarity is uniform,
   while the law makes big numbers costlier, so in the game the joint best would sit inside, where the rules' targets
   disagree; the census overstates this alignment, but it does not invent it.
3. **Move by move, rules mostly ignore each other.** About 90% of one-step improving moves leave the other rules within a
   quarter bit. The interaction lives in where the good places are (PMI), not in each nudge; refinement is mostly
   private. That matches the owner's picture ("simple big nudges" to a shared region, "separate agents to refine with
   faster cheap moves"), and half the draws do have moves that both help and harm.
4. **Conflict as a verdict never occurs; competition does** (16 of 90 pairs with PMI < −0.5). There is no pure tug of
   war in this pool, and few real adversaries: the pool lacks rules whose climb shrinks the readings others enlarge.
   The one structural adversary present is the gradient (a steep line shrinks crossings, areas and distances): Prime
   Gradient and Part Way reading m.
5. **Alliances of the best kind exist** (a third layer served by another rule's main part): 27 of 88 pairs, 55 of 88
   triples. The strongest are degenerate (Prime Intercept's gradient-log third against any rule that fixes the
   gradient), so the count is an upper bound.

### The pool: what to add and drop (recommendation, conjecture until play)

- **Keep, interacting well:** Prime Top (15 of 16 draws rich, help 12%, harm 6%), Crossing (tuple) (25 of 25), Prime
  Landing, Whole Crossing, Tangent Rings, Tower, Leg Ratio, Ruler, Same on Both Rulers.
- **Keep, but they mostly ignore the others:** Drawn Step and Prime Intercept (help and harm 2% each): they read only the
  y-intercept, which other rules rarely pin.
- **Drop or defer:** Smooth Mixed (12 of 14 draws hopeless: smooth targets thin out too fast), Treasure (tuple) (11 of
  15), Part Way on powers (sparse rungs; its draws are also often dull), and Prime Gradient's long suffixes (23 of 28
  hopeless, partly the grid's |m| ≤ 40 cut, partly real sparsity: two- and three-digit suffixes put the first rung at 11
  to 1,000+).
- **Add:** adversaries coupled through another number, with Prime Gradient's profile (design principle 6): rules whose
  climb steepens the line or pulls a reading toward a drawn finite target band, so that "bigger" splits the cabal.
  Families reading the gradient or a ratio (Part Way on m; a Tower variant on the meeting point's height) are the
  nearest candidates already built.
- Then re-run this census with the scoring trial's rarity (`lib/v2-linear/src/trial-rarity.ts`) in place of grid
  rarity, which removes the grid-edge artefact of item 2.

## By family

| family | draws | rich | dull | conflict | hopeless | median help | median harm |
|---|---|---|---|---|---|---|---|
| prime-gradient | 28 | 4 | 1 | 0 | 23 | 3% | 2% |
| prime-landing | 21 | 18 | 0 | 0 | 3 | 9% | 8% |
| smooth-intercept | 19 | 12 | 1 | 0 | 6 | 3% | 2% |
| square-area | 18 | 12 | 2 | 0 | 4 | 4% | 4% |
| whole-crossing | 18 | 15 | 1 | 0 | 2 | 13% | 11% |
| treasure | 14 | 8 | 3 | 0 | 3 | 7% | 8% |
| same-on-both-rulers | 20 | 13 | 0 | 0 | 7 | 10% | 5% |
| ruler | 21 | 15 | 0 | 0 | 6 | 9% | 9% |
| pythagorean-area | 16 | 11 | 1 | 0 | 4 | 7% | 6% |
| prime-intercept | 26 | 21 | 1 | 0 | 4 | 2% | 2% |
| power-area | 19 | 14 | 1 | 0 | 4 | 10% | 8% |
| landing-tuple | 17 | 12 | 0 | 0 | 5 | 14% | 4% |
| ruler-tuple | 19 | 11 | 0 | 0 | 8 | 5% | 2% |
| treasure-tuple | 15 | 4 | 0 | 0 | 11 | 1% | 2% |
| rulers-tuple | 16 | 12 | 0 | 0 | 4 | 10% | 8% |
| crossing-tuple | 25 | 25 | 0 | 0 | 0 | 10% | 10% |
| tree-nt-prime-top | 16 | 15 | 0 | 0 | 1 | 12% | 6% |
| tree-geo-rings | 27 | 21 | 1 | 0 | 5 | 11% | 5% |
| tree-nt-smooth-mixed | 14 | 2 | 0 | 0 | 12 | 3% | 1% |
| tree-nt-tower | 21 | 16 | 2 | 0 | 3 | 9% | 5% |
| tree-geo-legs | 19 | 15 | 0 | 0 | 4 | 11% | 4% |
| tree-geo-quadrant | 17 | 12 | 1 | 0 | 4 | 4% | 3% |
| tree-rep-borrowed | 20 | 13 | 1 | 0 | 6 | 5% | 4% |
| tree-rep-step | 18 | 14 | 0 | 0 | 4 | 2% | 2% |
| tree-rep-partway | 20 | 7 | 3 | 0 | 10 | 6% | 2% |


## Pairs (draws of two)

| pair | verdicts |
|---|---|
| crossing-tuple + landing-tuple | rich |
| crossing-tuple + prime-gradient | rich |
| crossing-tuple + prime-intercept | rich, rich |
| crossing-tuple + prime-landing | rich, rich |
| crossing-tuple + ruler | rich |
| crossing-tuple + ruler-tuple | rich |
| crossing-tuple + same-on-both-rulers | rich |
| crossing-tuple + smooth-intercept | rich |
| crossing-tuple + tree-nt-tower | rich |
| crossing-tuple + tree-rep-borrowed | rich |
| crossing-tuple + tree-rep-partway | rich |
| crossing-tuple + tree-rep-step | rich |
| landing-tuple + prime-intercept | rich |
| landing-tuple + ruler | rich |
| landing-tuple + square-area | rich |
| landing-tuple + treasure-tuple | hopeless |
| landing-tuple + tree-geo-quadrant | rich |
| landing-tuple + tree-nt-prime-top | rich |
| landing-tuple + tree-nt-tower | rich |
| power-area + prime-gradient | hopeless |
| power-area + prime-landing | rich |
| power-area + rulers-tuple | rich |
| power-area + treasure | dull |
| power-area + tree-geo-rings | rich |
| power-area + tree-nt-tower | rich |
| power-area + tree-rep-step | rich |
| power-area + whole-crossing | rich |
| prime-gradient + ruler-tuple | hopeless |
| prime-gradient + treasure-tuple | rich |
| prime-gradient + tree-geo-quadrant | hopeless |
| prime-gradient + tree-rep-borrowed | rich, hopeless |
| prime-gradient + tree-rep-partway | dull |
| prime-gradient + whole-crossing | rich |
| prime-intercept + ruler | rich |
| prime-intercept + ruler-tuple | rich, rich |
| prime-intercept + treasure-tuple | rich |
| prime-intercept + tree-geo-quadrant | rich |
| prime-intercept + tree-rep-step | rich |
| prime-intercept + whole-crossing | dull |
| prime-landing + pythagorean-area | rich |
| prime-landing + ruler | rich |
| prime-landing + ruler-tuple | rich |
| prime-landing + smooth-intercept | rich |
| prime-landing + tree-geo-legs | rich, rich |
| prime-landing + tree-geo-rings | rich, rich |
| prime-landing + tree-nt-tower | rich |
| pythagorean-area + rulers-tuple | rich |
| pythagorean-area + tree-nt-prime-top | rich |
| pythagorean-area + tree-nt-tower | rich |
| pythagorean-area + tree-rep-borrowed | rich |
| pythagorean-area + whole-crossing | rich |
| ruler + same-on-both-rulers | rich, rich |
| ruler + smooth-intercept | rich |
| ruler + treasure | rich |
| ruler + treasure-tuple | rich |
| ruler + tree-geo-legs | rich |
| ruler + tree-nt-tower | rich |
| ruler-tuple + tree-geo-rings | rich |
| ruler-tuple + tree-rep-borrowed | rich, rich |
| rulers-tuple + tree-geo-quadrant | rich |
| rulers-tuple + tree-geo-rings | rich |
| same-on-both-rulers + treasure | rich |
| same-on-both-rulers + tree-geo-legs | rich |
| smooth-intercept + smooth-intercept | rich |
| smooth-intercept + tree-geo-legs | rich |
| smooth-intercept + tree-rep-borrowed | dull, rich, rich |
| smooth-intercept + tree-rep-step | hopeless |
| square-area + tree-nt-smooth-mixed | rich |
| square-area + tree-nt-tower | rich, dull |
| square-area + tree-rep-partway | dull |
| square-area + whole-crossing | rich |
| treasure + tree-geo-quadrant | dull |
| treasure + tree-geo-rings | dull |
| treasure-tuple + tree-geo-quadrant | hopeless |
| treasure-tuple + tree-rep-borrowed | hopeless |
| tree-geo-legs + tree-geo-quadrant | rich |
| tree-geo-legs + tree-nt-smooth-mixed | hopeless |
| tree-geo-legs + tree-nt-tower | rich |
| tree-geo-legs + tree-rep-partway | hopeless |
| tree-geo-legs + whole-crossing | rich |
| tree-geo-quadrant + tree-rep-step | rich, rich |
| tree-geo-rings + tree-nt-prime-top | rich, rich |
| tree-geo-rings + tree-nt-tower | rich |
| tree-geo-rings + tree-rep-partway | rich |
| tree-geo-rings + tree-rep-step | rich |
| tree-nt-tower + whole-crossing | rich |
| tree-rep-step + tree-rep-step | rich |

## Second run: the scoring trial's law, and three splitter families (16 November, evening)

`--law trial` weights each grid line by the trial's chance 2^−H (`trial-rarity.ts` `rarityHeight`), so a rule's bits
are the law-weighted share at least as good and big numbers are as rare as the trial makes them. Seed census-1 without
the splitters, then seed census-2 with them (Root Tilt, Surd Intercept, Near Origin: `tree-families/splitters.md`).
Seen in a narrow test.

| | grid rarity, pairs / triples | trial law, pairs / triples | trial law with splitters, pairs / triples |
|---|---|---|---|
| cooperative (PMI > 0.5) | 56 of 90 / 50 of 58 | 85 of 97 / 79 of 85 | see below |
| best place, median abs c (grid edge 160) | at the edge | 152.5 | 151 |
| valley depth (median) | 4.0 / 4.9 bits | 1.9 / 2.5 bits | 1.5 / 2.2 bits |
| cheap moves help / neutral / harm | 5 / 90 / 5% | 9 / 83 / 6% | 6 / 90 / 4% (pairs) |

1. **"Cooperation is one shared direction: bigger" survives the trial's law, and strengthens.** Weighting lines by the
   law did not move the best joint places off the large intercepts: rules that each reward a big reading agree there,
   and rarity under the law makes those agreements worth more, not less. How it could be wrong: the grid still stops at
   abs c 160, and the law's tail above it is not seen; a census over the law's own draws (not a grid) would settle it.
2. **The splitters split.** Median PMI of draws holding Root Tilt −0.25, Surd Intercept −0.82, Near Origin +0.27, against
   +3.33 for draws without any of them. They turn a shared climb into a choice.
3. **But on the grid they are mostly "hopeless"** (Surd Intercept 14 of 16 draws, Near Origin 15 of 19, Root Tilt 6 of
   13). For the two digit families this is the grid, by construction: its fractions have bottoms of 3 at most, so few
   digits of a surd can be matched. For Near Origin it is real: a big |m| / |c| needs a small intercept, which every
   big-intercept rule fights. Conjecture: in the game, with fractions of any bottom, the digit families find joint places
   (the reachable digits rise with the bottoms the law allows); Near Origin may be too strong an adversary as drawn
   (hopeless with three rules in 15 of 19 draws).

### By family (trial law, with the splitters)

| family | draws | rich | dull | conflict | hopeless | median help | median harm |
|---|---|---|---|---|---|---|---|
| prime-gradient | 15 | 7 | 0 | 0 | 8 | 9% | 7% |
| prime-landing | 12 | 12 | 0 | 0 | 0 | 9% | 7% |
| smooth-intercept | 23 | 19 | 0 | 0 | 4 | 6% | 6% |
| square-area | 13 | 13 | 0 | 0 | 0 | 9% | 6% |
| whole-crossing | 18 | 15 | 0 | 0 | 3 | 12% | 9% |
| treasure | 15 | 13 | 0 | 0 | 2 | 6% | 5% |
| same-on-both-rulers | 26 | 21 | 0 | 0 | 5 | 8% | 6% |
| ruler | 18 | 18 | 0 | 0 | 0 | 7% | 6% |
| pythagorean-area | 28 | 22 | 2 | 0 | 4 | 7% | 6% |
| prime-intercept | 11 | 10 | 0 | 0 | 1 | 5% | 3% |
| power-area | 13 | 12 | 0 | 0 | 1 | 9% | 6% |
| landing-tuple | 20 | 13 | 0 | 0 | 7 | 12% | 6% |
| ruler-tuple | 19 | 13 | 0 | 0 | 6 | 8% | 5% |
| treasure-tuple | 17 | 13 | 0 | 0 | 4 | 6% | 5% |
| rulers-tuple | 17 | 14 | 1 | 0 | 2 | 9% | 6% |
| crossing-tuple | 13 | 12 | 0 | 0 | 1 | 9% | 9% |
| tree-nt-prime-top | 19 | 15 | 0 | 0 | 4 | 15% | 6% |
| tree-geo-rings | 25 | 21 | 0 | 0 | 4 | 10% | 5% |
| tree-nt-smooth-mixed | 20 | 18 | 0 | 0 | 2 | 6% | 5% |
| tree-nt-tower | 14 | 12 | 0 | 0 | 2 | 8% | 7% |
| tree-geo-legs | 19 | 15 | 0 | 0 | 4 | 12% | 6% |
| tree-geo-quadrant | 17 | 13 | 2 | 1 | 1 | 6% | 5% |
| tree-rep-borrowed | 21 | 15 | 1 | 0 | 5 | 10% | 8% |
| tree-rep-step | 14 | 12 | 0 | 0 | 2 | 5% | 3% |
| tree-rep-partway | 15 | 11 | 0 | 0 | 4 | 8% | 6% |
| tree-split-root-tilt | 13 | 3 | 3 | 1 | 6 | 4% | 3% |
| tree-split-surd-intercept | 16 | 2 | 0 | 0 | 14 | 5% | 3% |
| tree-split-near-origin | 19 | 3 | 1 | 0 | 15 | 6% | 6% |


## Proposal: the dealt beginner pool (a recommendation to the coordinator; nothing is dealt by this)

The owner's target: 12 families, at least four fraction-native. Chosen for a mixture of cooperation and conflict
(census), coverage of readings, and the structural cautions. Fraction-native families need worth as a formula of their
parameters (the scoring trial's seam) before they can be dealt; until then they stay undealt.

| # | family | reads | role in the mixture | census (trial law) | status |
|---|---|---|---|---|---|
| 1 | Prime Landing | x-crossing | big crossing; climbs with tilts | 12 of 12 rich | dealt |
| 2 | Whole Crossing | x-crossing | big crossing by 5s; Prime Landing's class adversary | 15 of 18 rich, help 12% | dealt |
| 3 | Smooth Intercept | y-intercept | smooth against prime (Prime Landing's adversary on c) | 19 of 23 rich | dealt |
| 4 | Square Area | area | big area, from 2² up (redesigned 16 Nov) | 13 of 13 rich | dealt |
| 5 | Pythagorean Area | area | prime area, against Square Area on one number | 22 of 28 rich | dealt |
| 6 | Ruler | distance² | big distance | 18 of 18 rich | dealt |
| 7 | Same on Both Rulers | meeting with y = ±x | palindromes | 21 of 26 rich | dealt |
| 8 | Prime Gradient | gradient | **the coupled adversary**: a steep line shrinks crossings, areas, distances | 7 of 15 rich, 8 hopeless (long suffixes) | dealt (1, 9) |
| 9 | Prime Top | x-crossing, p/d | fraction-native; the best interaction measured (help 15%, harm 6%) | 15 of 19 rich | to deal |
| 10 | Leg Ratio | base + height | fraction-native sizes; a shape pin with a sign ally | 15 of 19 rich, help 12% | to deal |
| 11 | Borrowed Bottom | y-intercept on the gradient's ruler | fraction-native; couples the gradient's bottom to the intercept | 15 of 21 rich, help 10%, harm 8% | to deal |
| 12 | Root Tilt | gradient | fraction-native **splitter**: pins the gradient to √D against steepen and flatten climbs | splits (median PMI −0.25); grid-limited | to deal |

Out of the current pool: **Treasure** and **Prime Staircase** (both "size of a ladder number from a coefficient", the
form five families already share; Prime Staircase was not in the census's candidate list, an omission of this script).
Alternates: Tangent Rings (21 of 25 rich) in place of Ruler if distance should read fraction-natively; Surd Intercept
in place of Root Tilt if the pin should sit on the y-intercept; Near Origin only after softening (as drawn it leaves
most triples with no joint place). How this could be wrong: grid rarity and the trial law are both narrow models; one
seed per run; the "rich" verdict is generous (two places and PMI not near zero); and nothing here is play.

## Third run: "lift + sideways, per part" (the owner's preferred basis, #1140), 16 November, late

Script: `lib/v2-linear/scripts/sideways-census.ts` (`--instances 2 --starts 12`). Comparison only; nothing dealt changes.
Labels: **built** (true by construction of the script), **seen** (narrow test: two instances a family, 12 random starts a
state, a grid of |m| ≤ 20 in thirds and |c| ≤ 80 in halves), **guess**.

How it is computed (built, and narrower than the trial's own code, which takes one-number readings with explicit
targets): a state's class is every grid line scoring at least as well under the engine; lift is the line's height H
(TRIAL_LOG), since engine families do not expose their reading; sideways is the mean, over random starts at the same
height, of the cheapest route of up to two additions (tilt and/or shift) onto a class member near in height, priced by
the trial's `callPrice`, with no shortcuts (an upper bound on the trial's search); "on" is the rule's best grid line,
"off" that line shifted by 1, "half" the line at half its bits; ρ is Spearman's between energy and the law-weighted grid
bits (the stand-in for tree closeness bits) over twelve states; the jump flag fires when one unit shift or tilt from the
rule's top 5% moves its bits by 3 or more in the median.

| family | instance | bits on / off / half | lift share on / off / half | sideways on / off / half | ρ(energy, tree bits) | median Δbits under one cheap move | jumps |
|---|---|---|---|---|---|---|---|
| prime-landing | {"ends":1} [shared-factor] | 23.0 / 6.3 / 11.7 | 0.15 / 0.34 / 0.20 | 5119.5 / 1749.4 / 3661.2 | 0.62 | 1.3 | no |
| prime-landing | {"ends":1,"side":-1} [shared-factor] | 23.0 / 6.3 / 11.7 | 0.07 / 0.72 / 0.11 | 12520.7 / 354.6 / 7198.3 | 0.77 | 1.4 | no |
| smooth-intercept | {"primes":[3,7]} [shared-factor] | 17.7 / 3.5 / 9.2 | 0.51 / 0.78 / 0.62 | 849.9 / 242.8 / 441.2 | 0.52 | 1.3 | no |
| smooth-intercept | {"primes":[3,11]} [shared-factor] | 17.7 / 3.7 / 8.4 | 0.39 / 0.39 / 0.33 | 1392.0 / 1330.1 / 1520.3 | 0.72 | 0.9 | no |
| square-area | {"ends":9} [shared-factor] | 17.0 / 1.7 / 9.1 | 0.14 / 0.95 / 0.40 | 4945.9 / 41.7 / 1283.4 | 0.48 | 1.4 | no |
| whole-crossing | {"q":5,"r":1} [shared-factor] | 21.0 / 1.3 / 11.1 | 0.17 / 0.93 / 0.15 | 3620.2 / 60.3 / 5768.6 | 0.59 | 0.5 | no |
| whole-crossing | {"q":5,"r":2} [shared-factor] | 14.7 / 4.2 / 8.0 | 0.18 / 0.33 / 0.09 | 3982.2 / 1780.9 / 12409.7 | 0.16 | 0.6 | no |
| treasure | {"k":3} [shared-factor] | 23.6 / 2.5 / 11.9 | 0.15 / 0.04 / 0.03 | 6710.8 / 26822.5 / 44201.9 | 0.54 | 7.2 | yes |
| treasure | {"k":3,"side":-1} [shared-factor] | 23.6 / 2.3 / 11.9 | 0.08 / 0.46 / 0.24 | 13112.9 / 1238.7 / 2868.0 | 0.63 | 7.2 | yes |
| same-on-both-rulers | {"meets":1,"digits":"odd"} [shared-factor] | 21.3 / 0.2 / 11.8 | 0.09 / 1.00 / 0.04 | 8804.4 / 0.0 / 31769.7 | 0.38 | 1.4 | no |
| same-on-both-rulers | {"meets":1,"digits":"even"} [shared-factor] | 18.6 / 4.6 / 9.3 | 0.17 / 0.61 / 0.10 | 3898.5 / 505.6 / 9343.0 | -0.14 | 1.6 | no |
| prime-gradient | 9 [shared-factor] | 17.0 / 9.7 / 8.5 | 0.03 / 0.06 / 0.06 | 47279.1 / 19631.4 / 18643.1 | 0.82 | 2.3 | no |
| prime-gradient | 3 [shared-factor] | 15.0 / 8.7 / 7.7 | 0.05 / 0.05 / 0.71 | 25191.4 / 22119.3 / 292.7 | 0.47 | 4.8 | yes |
| prime-staircase | {"ends":1} [shared-factor] | 21.2 / 5.3 / 9.2 | 0.09 / 0.33 / 0.50 | 9096.4 / 1876.1 / 365.4 | 0.54 | 0.0 | no |
| prime-staircase | {"ends":3} [step-back] | 18.4 / 2.4 / 6.4 | 0.15 / 0.35 / 0.56 | 5418.7 / 1804.7 / 159.9 | 0.37 | 0.2 | no |
| ruler | {"ends":1} [shared-factor] | 22.6 / 0.0 / 11.3 | 0.10 / 1.00 / 0.06 | 8877.5 / 0.0 / 19685.4 | 0.70 | 4.6 | yes |
| ruler | {"ends":3} [shared-factor] | 22.3 / 0.0 / 11.1 | 0.08 / 1.00 / 0.31 | 9737.2 / 0.0 / 2549.2 | 0.49 | 7.5 | yes |
| pythagorean-area | {"ends":1} [shared-factor] | 17.8 / 5.7 / 9.7 | 0.23 / 0.34 / 0.26 | 2804.8 / 1594.2 / 2662.8 | 0.43 | 5.9 | yes |
| pythagorean-area | {"ends":3} [same-ending] | 18.0 / 5.8 / 9.0 | 0.11 / 0.23 / 0.06 | 6622.8 / 2790.5 / 14790.5 | 0.73 | 6.8 | yes |
| tree-nt-prime-top | ends = 31, over = 10 [closeness] | 18.1 / 17.1 / 9.0 | 0.29 / 0.20 / 0.39 | 2084.4 / 3333.2 / 1115.5 | 0.44 | 0.3 | no |
| tree-nt-prime-top | ends = 69, over = 8 [closeness>leftover] | 18.1 / 17.1 / 9.0 | 0.10 / 0.11 / 0.29 | 7890.3 / 6415.0 / 1732.6 | 0.36 | 0.3 | no |
| tree-nt-smooth-mixed | k = -6, primes = 2.5.19, part = 6/7 [closeness] | 22.8 / 22.8 / 11.4 | 0.03 / 0.10 / 0.17 | 36658.0 / 9258.3 / 4187.8 | 0.85 | 0.4 | no |
| tree-nt-smooth-mixed | k = -2, primes = 13.17, part = 1/8 [closeness>count] | 22.8 / 22.8 / 11.0 | 0.15 / 0.09 / 0.67 | 6219.7 / 10258.6 / 262.4 | 0.77 | 0.3 | no |
| tree-nt-tower | g = -1/3, u = 6, v = 1 [closeness] | 18.1 / 17.1 / 9.1 | 0.20 / 0.25 / 0.09 | 3132.9 / 2380.9 / 8394.2 | -0.13 | 0.1 | no |
| tree-nt-tower | g = 1, u = 2, v = 7 [closeness>top] | 19.7 / 18.6 / 9.9 | 0.06 / 0.06 / 0.36 | 13182.0 / 13333.8 / 1323.9 | -0.06 | 0.1 | no |
| tree-geo-rings | d = 9, u = 16, v = 63 [closeness>touch] | 14.0 / 12.9 / 7.0 | 0.17 / 0.18 / 0.23 | 2996.6 / 2974.6 / 2596.6 | -0.19 | 0.1 | no |
| tree-geo-rings | d = 12, u = 77, v = 36 [closeness>axis] | 14.0 / 12.9 / 7.0 | 0.28 / 0.19 / 0.12 | 1670.6 / 2753.3 / 6210.4 | 0.10 | 0.1 | no |
| tree-geo-legs | p = 9, q = 1, d = 4 [closeness] | 18.1 / 17.0 / 9.1 | 0.08 / 0.14 / 0.19 | 9612.1 / 5129.6 / 3453.5 | 0.30 | 0.2 | no |
| tree-geo-legs | p = 1, q = 6, d = 1 [closeness>bottom] | 18.1 / 17.1 / 9.1 | 0.13 / 0.25 / 0.16 | 5532.3 / 2487.2 / 4340.2 | 0.05 | 0.3 | no |
| tree-geo-quadrant | p = 4, q = 3 [closeness] | 18.1 / 17.1 / 9.1 | 0.14 / 0.09 / 0.25 | 5282.1 / 8008.2 / 2122.8 | 0.10 | 0.2 | no |
| tree-geo-quadrant | p = 31, q = 22 [closeness>east] | 19.1 / 19.1 / 9.6 | 0.11 / 0.11 / 0.19 | 6658.5 / 6903.4 / 3481.4 | 0.20 | 0.2 | no |
| tree-rep-borrowed | ends = 7, reads = x [closeness] | 18.1 / 17.1 / 9.1 | 0.13 / 0.18 / 0.08 | 5616.6 / 3759.1 / 10198.9 | 0.85 | 0.1 | no |
| tree-rep-borrowed | ends = 229, reads = x [closeness>echo] | 15.6 / 13.1 / 7.8 | 0.43 / 0.37 / 0.41 | 982.4 / 1227.9 / 954.1 | 0.33 | 0.1 | no |
| tree-rep-step | u = 3, v = 7 [closeness] | 12.8 / 11.7 / 6.4 | 0.03 / 0.10 / 0.07 | 35358.4 / 9280.0 / 15272.3 | 0.51 | 0.0 | no |
| tree-rep-step | u = 4, v = 3 [closeness>crossing] | 20.5 / 12.7 / 10.2 | 0.14 / 0.17 / 0.20 | 5851.9 / 4478.1 / 3826.4 | 0.52 | 0.1 | no |
| tree-rep-partway | reads = area, ladder = triangle, u = 7, v = 8 [closeness] | 18.1 / 17.1 / 9.1 | 0.24 / 0.06 / 0.10 | 2650.8 / 13411.5 / 7888.1 | -0.29 | 0.2 | no |
| tree-rep-partway | reads = c, ladder = square, u = 1, v = 2 [closeness>flip] | 21.4 / 11.5 / 10.8 | 0.03 / 0.11 / 0.09 | 27287.4 / 7107.8 / 10458.4 | 0.49 | 0.1 | no |

What it says:

1. **Jumpy readings are the old ladders, not the tree families** (seen): Treasure (7.2), Ruler (4.6, 7.5), Pythagorean
   Area (5.9, 6.8) and one Prime Gradient instance (4.8) move their bits by 3 or more under one cheap move from a good
   state; every tree family stays at or below 0.4. Built: a "nearest target" primary changes by one step when a bump
   crosses into the next basin, while a ladder off its rung falls below every rung. Square Area (redesigned) did not
   flag on this grid (|m| ≤ 20; the reported m 101 → 102 jump is outside it).
2. **Energy agrees with rarity for single-number readings and not for combined ones** (seen): ρ 0.4 to 0.85 for the
   dealt ladders and for Smooth Mixed, Borrowed Bottom, Drawn Step and Prime Top; near 0 or negative for Tower (−0.13,
   −0.06), Tangent Rings (−0.19, 0.10), Leg Ratio (0.30, 0.05), Quadrant Square (0.10, 0.20) and Part Way on the area
   (−0.29), whose readings combine both numbers. This matches the trial's warning that combined readings are fragile.
3. **Sideways dominates lift** (seen): lift share mostly 0.03 to 0.5. Under this basis a state's worth is mainly how far
   it is from random lines of its own height, not how high it is.
4. **On / off**: a unit shift off the best line keeps most bits for every tree family (18.1 → 17.1) and loses most of them
   for the ladders (Prime Landing 23 → 6.3, Ruler 22.6 → 0.0): principle 11 again, seen on another measure.

### The pool of 12, revised with the jump flag and the size-adversary gap (recommendation, guess until play)

Prefer readings of one number that change smoothly under cheap moves. Against the proposal above: **Drawn Step
replaces Leg Ratio** (single reading, ρ 0.5, no jumps; Leg Ratio's combined reading disagrees with rarity), and **Ruler
and Pythagorean Area are flagged**: kept for coverage (distance, prime area) but first in line for the tree recast
(Ruler (tuple) and a Pythagorean Area tuple exist or are cheap), since both jump. The fraction-native four become Prime
Top, Borrowed Bottom, Drawn Step and Root Tilt, all single-number readings. The size-adversary gap stays the pool's main
weakness: Prime Gradient (one jumpy instance) and Root Tilt are its only members pulling against "bigger"; Near Origin
splits hardest but is a combined reading of |m| / |c| that fails a unit-shift bump, so it needs softening before it is
a candidate (guess: read 1 over the crossing rounded to a whole number, or draw dense targets).

## Fourth run: per part, for the combined readings (16 November, late)

Script: `lib/v2-linear/scripts/sideways-parts.ts` (`--starts 16`). The third run matched starts on the whole line's
height with additions only; here, as the trial's per-part mode (#1140), starts are matched on the READING's own size
(within a factor of √2: the gradient from the law, the y-intercept solved for the reading), lift is the reading's
(g·log2(1 + x)), and one of the trial's shortcuts may precede the finishing additions. One instance a family, twelve
states each (built; seen narrowly).

| family | instance | ρ(energy, bits) | ρ(lift, bits) | ρ(sideways, bits) | lift share | dominant |
|---|---|---|---|---|---|---|
| square-area | {"ends":9} [shared-factor] | 0.38 | 0.09 | 0.63 | 0.80 | lift |
| tree-nt-tower | {"g":"2","u":1,"v":0} [closeness] | 1.00 | 1.00 | 0.34 | 0.93 | lift |
| tree-geo-rings | {"d":2,"u":3,"v":4} [closeness] | 1.00 | 1.00 | 0.05 | 0.95 | lift |
| tree-geo-legs | {"p":3,"q":2,"d":2} [closeness] | 0.94 | 1.00 | -0.68 | 0.93 | lift |
| tree-geo-quadrant | {"p":3,"q":2} [closeness] | 1.00 | 1.00 | -0.27 | 0.95 | lift |
| tree-rep-partway | {"reads":"area","ladder":"square","u":2,"v":5} [closeness] | 1.00 | 1.00 | -0.66 | 0.95 | lift |

1. **Matched on the reading, energy ranks like rarity for all five combined-reading tree families** (ρ 0.94 to 1.00,
   seen), where the third run gave about 0. The failure was the matching, not the families.
2. **But it is lift that ranks, and that is built in.** Lift is 93 to 95% of the energy and alone gives ρ = 1.00; for a
   "size of the nearest target" primary the reading's lift is monotone in the primary, so the agreement is mostly true
   by construction. Sideways adds little and ranks against rarity for three of the five (Leg Ratio −0.68, Part Way on
   area −0.66, Quadrant Square −0.27): within a size band, the states rarity values most are not the ones far from
   random starts. Plainly: on these families, sideways measures something other than rarity.
3. **Square Area is the exception** (ρ 0.38): its main part is a ladder of squares, not the reading's size, so lift of
   the area ranks poorly (0.09) and sideways carries the agreement (0.63). Its "jump" (one tilt moves the area a lot) is
   what sideways sees.

How it could be wrong: one instance a family; 16 starts; routes are bounded (one shortcut, two additions); the grid
stops at |m| ≤ 20, |c| ≤ 80, where the class's members are found.

### Why sideways ranks against rarity within a level (diagnosis, seen narrowly)

`lib/v2-linear/scripts/sideways-diagnosis.ts`: Quadrant Square (3/2 of a square), level n = 4 (target area 24, cell
18.75 to 30.75), six grid states from far to exact, 24 starts each, the same estimate as the fourth run.

| state | area | distance to 24 | closeness bits | class share of starts (in already) | sideways | cheapest route: none / one addition / two additions / via shortcut | unit tilt moves the area by |
|---|---|---|---|---|---|---|---|
| y = -11x + -26 | 30.73 | 6.73 | 0.00 | 1.00 | 0 | 24 / 0 / 0 / 0 | 3.1 |
| y = 10/3x + -23/2 | 19.84 | 4.16 | 0.28 | 0.67 | 27 | 16 / 6 / 0 / 2 | 4.6 |
| y = -9/2x + -31/2 | 26.69 | 2.69 | 0.79 | 0.71 | 16 | 17 / 5 / 0 / 2 | 7.6 |
| y = -33/2x + 29 | 25.48 | 1.48 | 0.95 | 0.42 | 63 | 10 / 4 / 0 / 10 | 1.6 |
| y = -15x + 53/2 | 23.41 | 0.59 | 1.60 | 0.17 | 71 | 4 / 6 / 0 / 14 | 1.7 |
| y = 49/3x + 28 | 24.00 | 0.00 | 3.25 | 0.17 | 31 | 4 / 18 / 0 / 2 | 1.4 |

The cause is the **bounded route search**, not the measure. Built: the class of a state is everything at least as good,
so a near miss's class contains the exact state's class, and a correct search can never price a near miss above the
exact state. Seen: it did (71 at 0.59 away, 63 at 1.48, against 31 on the target). The search finishes only onto the 30
class members nearest in reading, rather than solving the addition that lands the reading on the target (as the trial's
own `finish` does for its one-number rules). Near the target those members are other near misses that one addition
rarely hits, so the estimate falls back on shortcut routes (14 of 24 starts at 0.59 away) and overprices. Rising
sideways from the far states to the near ones does agree with rarity; only the near-to-exact end inverts.

The other two candidates matter less here. Shortcuts are a symptom of the missed finish, not a cheaper path to "at
least as close". Coarse jumps are real but secondary: a unit tilt moves the area by 1.4 to 7.6 in a level 12 wide. Next
step, if the measure is pursued: solve the finishing addition per family from its reading (as `finish` does for m, c and
area), and the near-exact inversion should vanish.

## Not covered

- Grid Snap's secondary "snap-reach" (a grid family, reported by the app session): already at its top on most newborn
  boards, so it rarely orders anything. Recorded here for that family's owner; the line census does not reach grids.
