# Tiered rules: what is in the code

The design and its measurements are in `archive/engine-v1:docs/layered-rules-design.md`; the numbers for each shipped family are in
`archive/engine-v1:docs/layered-rules-measurements/`. This page says how the shipped code works and how to add to it.

## A tiered draw

- A family's **base draw** is unchanged: same params, card, shape and calibration key as before tiers existed.
- A **tiered draw** is the same family with one more param, `tiers: [{ id, ...params, gate }]` (`TierParams` in
  `lib/game-utilities/src/types.ts`). Its ordinal is `[...base, base[0] >= gate ? tier : 0]`.
  - Below the gate the rule is exactly its base. Above it the tier breaks ties among boards equal on the base.
  - `gate: 0` is the plain lexicographic composition. `compose: "unlock"` is `[min(base[0], gate), tier, ...base]`.
    Both are Lab variants.
- Tiered draws are **never in `support`**, so no existing pool changes. A setup asks for them with the game setting
  `ruleTiers` (depth 1 or 2, and a variant); `UtilityFamily.tiered(ctx, depth, compose)` lists them.
- The card is the base's card with the interaction's code nested before the `return` and the "★ To score even higher"
  sentences added (`tieredCard` in `src/families/grid/tiers.ts`). The goal card shows the ★ block collapsed until the
  base reaches the gate.
- Above the gate the goal board says what the tier wants and, while it scores nothing, which unit comes nearest
  (`TierStatus.nearest`, from the `Part.heat` the tier lenses set). **To look at it:**
  `pnpm --filter @workspace/player-web dev`, then `/annotations.html` — the last two sections show ✌️ Two Pair and
  ↙️ Crosswise Threes with a ★, each on the base's own exemplar (the ★ open and empty) beside the card's example
  (which scores it). `pnpm --filter @workspace/player-web e2e:annotations` checks them, and
  `node --experimental-transform-types e2e/annotations-shots.ts <dir>` writes `star-<family>.png`.

## Adding tiers to a family

A grid family passes `tiers` to `gridFamily` (`GridTiers` in `src/families/grid/tiers.ts`):

| Field | Meaning |
|---|---|
| `interactions` | the operators it can carry (`Interaction`: id, card function name, label, text, constants, TypeScript and Python bodies, optional symmetry fold) |
| `gate`, `gateText` | the base level at which the tier starts to count (the base's greedy ten-move level), and how the card says it |
| `dealt` | the values dealt on a shape. Each must pass the liveness check there; `test/tiers.test.ts` re-runs it |
| `lab` | alive values outside the 6 to 20 bit band (the "uncapped" Lab variant) |
| `compare` | the few values whose plain and unlocked compositions are built for comparison |
| `dealtPairs` | expert: pairs of interactions (depth 2), checked against a wider band (6 to 26 bits for the two together) |
| `base` | the base as disjoint, equally scored units whose scores add up to the base ordinal (`DisjointBase`) |

An interaction's code is the body of a nested function inside `utility(grid)`. It may read the base's local variables
(its vocabulary: kings, subjects, mirror lines). `linesSum` and `windowsSum` are the models.

Then:
1. add the family's spec to `SPECS` in `test/tiers.test.ts`;
2. sweep the parameter with `tierLiveness` and list the values that pass in `dealt`;
3. build the tables: `pnpm --filter @workspace/game-utilities calibrate --families <id>`.

## The families that carry tiers (4×4 digits)

| family | interactions | dealt values | pairs (depth 2) |
|---|---|--:|--:|
| Opposite Nines | lines x, squares x | 21 | 4 |
| Mirrormancer | mirrors holding two ys, halves add up to x | 15 | 3 |
| Kings and Subjects | pairs of kings x apart, same-number roads of y | 6 | 2 |
| Two Pair | links by total x, links through y, roads of equal numbers of y | 35 | – |
| Crosswise Threes | lines x | 8 | – |

The seeded setup **Tiered rules** deals one interaction per rule; the Lab setups deal the other compositions and, as
**Lab · two ★ tiers**, the pairs.

## Calibration: the hybrid law

`src/tiers/hybrid.ts`. The base is a sum over disjoint units, so:
- the base's law is exact (a convolution over units);
- boards with a given base level can be drawn exactly;
- a kernel that redraws two units together, uniformly among fillings with the same summed score, never leaves the level.

The tier is calibrated one base level at a time by multilevel splitting inside that level:

    G(b, i) = G_B(> b) + P(B = b) · P(I >= i | B = b)

- Below the gate the levels are the base's own, exactly.
- The table's estimator label is `hybrid:<id>`, with its own bound (`HYBRID_MAX_ERROR_BITS`, 1 bit).
  `test/tiers-hybrid.test.ts` checks it against brute force on an alphabet small enough to enumerate.
- A 4×4 table takes 5 to 10 seconds. Unlocked tiers have no such law and use the sampling estimator, which is known to
  be loose at the top (design §7.1): Lab only.

## Liveness

`liveness` in `src/tiers/hybrid.ts`, `tierLiveness` for a family. On the boards that max the base, the tier must:
- vary, and not be zero at its best;
- be maxed by at most half of them;
- add 6 to 20 bits (`TIER_MIN_ADDED_BITS`, `TIER_MAX_ADDED_BITS`);
- not be maxed by a uniform or two-digit board (`degenerateBoards`: checkerboards, stripes, quadrants, `abba/baab`,
  one digit on a field of another).

`tierTop` is the best tier the splitting found there.
