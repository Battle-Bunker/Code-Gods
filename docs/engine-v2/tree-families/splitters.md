# Cabal-splitting tree families: Root Tilt, Surd Intercept, Near Origin

Undealt. Code: `lib/v2-linear/src/tree-split.ts`; tests: `lib/v2-linear/test/tree-split.test.ts` (hand-worked). Why they
exist: the interaction census (`../interaction-census.md`) found the pool's cooperation was mostly one shared direction,
bigger. These read differently (claims labelled: true by construction, seen here, or conjecture):

- **Root Tilt**: the gradient's size should agree with √D (D drawn, 2 to 999, not a square: 968 sets) in as many leading
  digits as possible; second, how near the first differing digits are (0 to 9); thirds: the y-intercept near D, the
  crossing on the right near √D (sign ally), the y-intercept's whole part near the digits shared. A pull toward a finite
  value: it fights both steepening and flattening climbs. Unbounded by construction (√D is irrational).
- **Surd Intercept**: the y-intercept's size should agree with (a + √D)/b (8,100 sets; the golden ratio is a = 1, D = 5,
  b = 2) in as many leading digits as possible; thirds: the gradient near b, a rising line, the gradient's whole part
  near the next digit not yet shared. A pin against every big-intercept rule.
- **Near Origin**: 1 over the crossing's distance, |m| / |c|, against whole numbers leaving r when divided by q (464
  sets); thirds: the gradient near the target (then c is about 1), the y-intercept near a whole number other than 0,
  the crossing on the left. Grows only as the crossing shrinks: the census's missing adversary.

Seen here (single lines, single moves; the tables are `scripts/tree-walk.ts` output, the closeness of the digit families
omitted where it is a long fraction): a stretch by 2 knocks Root Tilt's digits to 0 (the gradient doubles) and a unit
tilt does too; mirrors keep every primary. Near Origin loses most of its primary to a unit shift (y = 10x + 1 → 10x + 2:
10 → 3), so it fails a robustness reading as drawn (design principle 11); conjecture: drawing q smaller (dense targets)
or reading 1 over the crossing's distance rounded to a whole number would soften it.

How this could be wrong: digits are an exacting ladder: each extra digit needs about ten times the precision, which
under the law costs bottoms about √10 times bigger, so a few digits may be the practical top in a game; and a solver can
compute √D's best fractions in advance (continued fractions), so the pin is a known target, reachable only by a far
move whose price grows with the fraction's size (the owner allows targets computed in advance when not reachable in one
cheap step).

## Walk tables

### tree-split-root-tilt (D = 7)

| line or move | tuple |
|---|---|
| y = 37/14x + 7 | (3, -3, 0, -195892787/37000000, -4) |
|   shift up 1 → y = 37/14x + 8 | (3, -3, -1, -209892787/37000000, -5) |
|   shift down 1 → y = 37/14x + 6 | (3, -3, -1, -181892787/37000000, -3) |
|   tilt +1 → y = 51/14x + 7 | (0, -1, 0, -232933301/51000000, -7) |
|   tilt −1 → y = 23/14x + 7 | (0, -1, 0, -158852273/23000000, -7) |
|   mirror in the x-axis → y = -37/14x - 7 | (3, -3, 0, -195892787/37000000, -4) |
|   mirror in the y-axis → y = -37/14x + 7 | (3, -3, 0, -107213/37000000, -4) |
|   stretch by 2 → y = 37/7x + 14 | (0, -3, -7, -195892787/37000000, -14) |
|   tilt +1/7 → y = 39/14x + 7 | (1, -1, 0, -201184289/39000000, -6) |

### tree-split-near-origin (q = 7, r = 3)

| line or move | tuple |
|---|---|
| y = 10x + 1 | (10, 0, 0, 0, 0) |
|   shift up 1 → y = 10x + 2 | (3, -2, -7, 0, 0) |
|   shift down 1 → y = 10x | no score |
|   tilt +1 → y = 11x + 1 | (10, -1, -1, 0, 0) |
|   tilt −1 → y = 9x + 1 | (10, -1, -1, 0, 0) |
|   mirror in the x-axis → y = -10x - 1 | (10, 0, 0, 0, 0) |
|   mirror in the y-axis → y = -10x + 1 | (10, 0, 0, 0, -1) |
|   stretch by 2 → y = 20x + 2 | (10, 0, -10, 0, 0) |
|   tilt +1/7 → y = 71/7x + 1 | (10, -1/7, -1/7, 0, 0) |

