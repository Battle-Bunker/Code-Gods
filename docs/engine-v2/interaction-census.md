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

## Not covered

- Grid Snap's secondary "snap-reach" (a grid family, reported by the app session): already at its top on most newborn
  boards, so it rarely orders anything. Recorded here for that family's owner; the line census does not reach grids.
