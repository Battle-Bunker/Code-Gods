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

RESULTS
