# Status: fraction rules B (session_0119hWTTSQJexsxsCFhxneCD), 16 Nov 2026

Labels: **built** (in code, tested), **seen narrowly** (one script, its assumptions named), **guess**.

## 1. The task
Build two of four fraction-native line rule families (owner decision 46: "utility functions that were crafted with
rationals in mind from the beginning"), in the 16 Nov tree shape (primary = property of the nearest target,
secondary = closeness, third = another reading tied to the target). Undealt until the coordinator read a walk-through
per family. Session A (session_0119hWTUfiGvWxCDBSg5ouWu) built the other two (Fraction Gradient, Square Fraction
Intercept, draft PR #948).

## 2. Merged and unmerged
- Merged: nothing of mine. A bug I found and reported (tree-value.ts `tailKnots` cancellation) was fixed by the spec
  lead in #1056.
- Unmerged: branch `claude/frac-families-b`, draft PR #1003 (merged with develop as of 16 Nov):
  - `lib/v2-linear/src/frac-plus-flip.ts` + test: **Plus Its Flip**. The crossing (ignoring sign) near n ± k/n
    (k = 1, −1, 2, −2; whole targets left out); primary n; closeness in halvings (within 1/8, 1/4, 1/2); dealt third:
    |gradient| × n to tenths near 1; undealt thirds: |c| near n, y at x = n near whole. **built**
  - `lib/v2-linear/src/frac-matching-bottoms.ts` + test: **Matching Bottoms** (equivalent fractions). Primary: the
    y-intercept's bottom B; secondary: the gradient's bottom near r·B (r = 1, 2, 3, ½: 3/8 beside 5/4 = 10/8); thirds
    tied to B. **built**
  - `lib/v2-agents/scripts/frac-tree-check.ts`: values a tuple family with the tree valuation and prints examples
    under every cheap move, row 10 share kept, row 13 non-whole share, and a greedy climber (the gate). **built**

## 3. Unfinished plan (now moot, see 5)
1. Re-measure both families on the size-only number code (gravity session's `claude/gravity-measure`, never pushed)
   at surcharge w = 1, 30, 100.
2. If a bottom number still ran away, grade it by its nearest power of 2 instead of its raw size.
3. Write Matching Bottoms' walk-through (Plus Its Flip's was sent 16 Nov ~01:00 UTC).

## 4. Obstacles and lessons (not in the docs as far as I know)
- **Bottom size is cheap to climb, rare under the factorisation law.** Multiplying shortcuts (stretch, zoom) reach big
  bottom numbers for a few ⚡ while the law rates them rare, so every bottom-size or precision ladder broke the gate:
  powers of 2 of the y-intercept's bottom (16 bits / ~50⚡, then flat at bottom 64), Pell ratios (35 bits / 76⚡),
  Matching Bottoms (61–64 bits / 107–256⚡), A's Repeating/Polygon Bottom (41–56). **seen narrowly** (greedy climber,
  one seat's income, 3–6 chains). The fix belongs in the number code (price a bottom by its size), not per rule. **guess**
- **The tree valuation pays each part by rank.** A smooth regrading (log scale, relative to the gap) changes no bits;
  only ties or caps do. An exact hit is a point mass one move away, so it was a spike (Plus Its Flip: 9.1 closeness
  bits, a unit shift off it kept 2.3 of 12.6). Halving buckets cut it to ~4; the spike then moved into the third.
  **built** (by construction of tree-value.ts) / **seen narrowly** (the numbers).
- **Closeness in plain units makes big-n near misses free**: whole crossings at large n sit within 1/n of n + 1/n, so
  good states were whole lines (a = ±1). Measure closeness relative to the target spacing. **seen narrowly**
- **Fraction parts and bottoms survive whole moves** (unit shift, unit tilt, axis mirrors): bump robustness ~90–100%
  median; weak moves are coefficient nudges and the diagonal mirror. **built** (by construction) / **seen narrowly**.
- **Readings that are ratios of two readings collapse** onto the gradient or the crossing (crossing ÷ intercept =
  −1/m): "a nice fraction of another reading" adds no new reading. **built** (algebra)
- **Crossing-reading rules have a cliff at a unit tilt to flat** (no crossing = worst). **built**
- Tooling: `tuples-tree.ts` and `values-cli.ts` worked; root `pnpm run typecheck` covers the libs. Lexicographic value
  files (option a) made secondaries worth < 0.5 bit, so they cannot test a closeness layer.

## 5. Obsolete after the 16–17 Nov rebuild (one-number utilities, energy as bits of surprise)
- The tuple/tree shape itself (owner decision 50 replaces tuples and tie-breakers with one utility per rule), so both
  families' layer structure, the `close>third` keys and frac-tree-check.ts are obsolete as written. **built** (by the
  decision)
- What may carry over (**guess**): the target kinds (n ± k/n on the crossing; matching bottoms / equivalent fractions),
  measuring closeness relative to target spacing, reading fraction parts or bottoms for bump robustness, and the
  warning that rarity-priced bottoms need a size-based code.
