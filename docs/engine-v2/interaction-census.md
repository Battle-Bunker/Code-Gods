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

## Not covered

- Grid Snap's secondary "snap-reach" (a grid family, reported by the app session): already at its top on most newborn
  boards, so it rarely orders anything. Recorded here for that family's owner; the line census does not reach grids.
