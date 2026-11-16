# The first nine tree families: walk-throughs

Undealt, no value files. Code: `lib/v2-linear/src/tree-*.ts`; tests: `lib/v2-linear/test/tree-*.test.ts` (hand-worked
tuples). Prime Top and Tangent Rings were built by the stopped sessions (their walk-throughs: `tangent-rings.md` and
`docs/engine-v2/handover/tree-nt.md`); the seven below complete three per lens.

| lens | family | reads (primary) | single or combined reading | targets | gaps between targets | whole / fraction |
|---|---|---|---|---|---|---|
| number theory | Prime Top | x-crossing | single | p/d, p a prime with a drawn suffix | grow slowly (about 10^L·ln p / d) | fraction |
| number theory | Smooth Mixed | height at x = k | single (m·k + c) | smooth w + drawn r/s | grow fast (smooth numbers thin out polynomially) | both |
| number theory | Tower | meeting point with y = g·x | combined (c/(g − m)) | n + u/(n + v) | about 1 | fraction |
| geometry | Tangent Rings | distance² from (0, 0) | combined | rings n/d | 1/d in the radius | both |
| geometry | Leg Ratio | base + height of the axis triangle | combined | (p + q)·n/d | constant | both |
| geometry | Quadrant Square | area of the axis triangle | combined | (p/q)·n² | grow linearly | both |
| representations | Borrowed Bottom | y-intercept or x-crossing, on the gradient's ruler | single (the ruler is the gradient's) | t/B, t with a drawn suffix | constant (10^L / B) | fraction |
| representations | Drawn Step | y-intercept | single | non-whole multiples of u/v | constant | fraction |
| representations | Part Way | y-intercept, x-crossing, area or gradient | single, or combined for area | u/v of the way along a ladder | grow linearly (squares, triangles), quadratically (cubes), geometrically (powers) | fraction |

The two right-hand columns matter for scale-free rarity (the scoring trial, `docs/engine-v2/scoring-trial.md`): an
exact hit is worth about log2 of the target gap, so sets whose gaps grow fast (Smooth Mixed, Part Way on powers) make
exact hits dominate at height; and combined readings need a sampled fallback there. Conjecture for the pool: prefer the
slow-gap, single-reading families (Prime Top, Borrowed Bottom, Drawn Step, Part Way on squares) and draw Part Way's
ladders without powers until that is settled.

Coverage: the gradient (Prime Gradient, dealt; Part Way reading m; the thirds of Smooth Mixed, Tower, Drawn Step,
Borrowed Bottom), both intercepts, area, distance, a point on the line, meeting points, tops and bottoms (Prime Top,
Borrowed Bottom, Tower's thirds). Every primary reads a size, never a top or bottom of the line (the two structural
cautions: a primary growing with a bottom is inflated by one cheap fractional nudge; and a "size of the nearest target"
primary rewards its reading being big whatever the draw, so draws differ in WHICH number is read and in the closeness
and third layers).

Every tuple below is printed by `lib/v2-linear/scripts/tree-walk.ts` (the engine's own evaluation), all layers in a row
("min" layers negated, `none` = undefined). Claims are labelled: true by construction, seen here (a narrow test: one
parameter set, one line, single moves), or conjecture.

## Smooth Mixed (`tree-nt-smooth-mixed`)

Number theory. Reads the height at a drawn x = k (a point on the line). Whole and fractional targets: w + r/s with w smooth over a drawn set of primes and r/s drawn (0 included).

Smooth Mixed, k = 2, primes = 2.3, part = 1/4. Card (all layers in a row):

> Find the line's height at x = 2, ignoring a minus sign. The targets are the whole numbers made by multiplying only 2, 3 (any number of times; 1 counts) plus 1/4: 1 1/4, 2 1/4, 3 1/4, 4 1/4, 6 1/4, … Find the target nearest that height. The bigger its whole part, the better. Secondary: The height should be as close as possible to that target. Third: Count the prime factors of the target's whole part (12 = 2 × 2 × 3 has three). The gradient (ignoring a minus sign) should be as close as possible to that count. Fourth: Where the line crosses the x-axis (ignoring a minus sign) should be as close as possible to a number that divides the target's whole part exactly. Fifth: Take the largest prime factor of the target's whole part (1 has none: use 1). The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of it.

| line or move | tuple |
|---|---|
| y = x + 17/4 | (6, 0, -1, -5/4, -5/4) |
|   shift up 1 → y = x + 21/4 | (8, -1, -2, -5/4, -3/4) |
|   shift down 1 → y = x + 13/4 | (6, -1, -1, -1/4, -1/4) |
|   tilt +1 → y = 2x + 17/4 | (8, 0, -1, -1/8, -1/4) |
|   tilt −1 → y = 17/4 | (4, 0, -2, none, -1/4) |
|   mirror in the x-axis → y = -x - 17/4 | (6, 0, -1, -5/4, -5/4) |
|   mirror in the y-axis → y = -x + 17/4 | (2, 0, 0, -9/4, -1/4) |
|   stretch by 2 → y = 2x + 17/2 | (12, -1/4, -1, -1/4, -1/2) |
|   tilt +1/7 → y = 8/7x + 17/4 | (6, -2/7, -6/7, -23/32, -5/4) |

- A stretch by 2 doubles the height, so it doubles w when 2 is in the set (6 → 12 above): a representation shortcut (decision 25), priced as a choice.
- A mirror in the y-axis reads y(−k) instead, a different number: the drawn sign of k matters, so mirrors are not peers (true by construction).
- How it could be wrong: smooth numbers thin out (about (log x)^r of them below x for r primes), so high rungs are far apart and the ladder may stall at a few hundred; the 'count' third is weak (a gradient near 2 or 3 is cheap).

## Tower (`tree-nt-tower`)

Number theory. Reads where the line meets a drawn line y = g·x through (0, 0) (a parallel line reads its y-intercept). Targets n + u/(n + v): fraction-native, never whole.

Tower, g = 2, u = 1, v = 0. Card (all layers in a row):

> Find where the line meets the line y = 2·x, and read its x, ignoring a minus sign (a line parallel to it never meets it: read its y-intercept instead). The targets are a whole number n plus 1/(n + 0): 2 1/2, 3 1/3, 4 1/4, … Find the target nearest. The bigger its n, the better. Secondary: The meeting point's x (ignoring a minus sign) should be as close as possible to that target. Third: Write the target as one fraction: (n × (n + 0) + 1) / (n + 0). The y-intercept (ignoring a minus sign) should be as close as possible to its top. Fourth: The gradient's fraction part (ignoring a minus sign: 7/3 has 1/3) should be as close as possible to the target's, 1/(n + 0). Fifth: Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to the target's bottom, n + 0.

| line or move | tuple |
|---|---|
| y = 17/2 | (4, 0, -17/2, -1/4, -3) |
|   shift up 1 → y = 19/2 | (5, -9/20, -33/2, -1/5, -4) |
|   shift down 1 → y = 15/2 | (3, -5/12, -5/2, -1/3, -2) |
|   tilt +1 → y = x + 17/2 | (8, -3/8, -113/2, -1/8, -7) |
|   tilt −1 → y = -x + 17/2 | (2, -1/3, -7/2, -1/2, -1) |
|   mirror in the x-axis → y = -17/2 | (4, 0, -17/2, -1/4, -3) |
|   mirror in the y-axis | refused: that call does not change the object |
|   stretch by 2 → y = 17 | (8, -3/8, -48, -1/8, -7) |
|   tilt +1/7 → y = 1/7x + 17/2 | (4, -17/52, -17/2, -3/28, -3) |

- Tilting changes the meeting point a lot when the gradient is near g (the reading has a pole at m = g): a cheap tilt can jump many rungs (8 → 2 above). Conjecture: this makes the primary jumpy near m = g; the closeness layer is then what holds value.
- The 'top' third grows like n², so it opposes a high primary unless the y-intercept also grows: a built-in tension between the two layers (true by construction).
- How it could be wrong: the pole may make the family a lottery rather than a climb; if the census shows high rungs reached in one move, read the meeting point's height instead.

## Leg Ratio (`tree-geo-legs`)

Geometry. Reads base plus height of the axis triangle, against a drawn shape p : q with sizes n/d.

Leg Ratio, p = 3, q = 2, d = 2. Card (all layers in a row):

> The line and the two axes make a triangle; add its base and its height (ignoring minus signs). A 3 : 2 triangle of size s has base 3 × s and height 2 × s, so base plus height 5 × s; the sizes are 1/2, 1, 1 1/2, … Find the size whose base plus height is nearest the line's. The bigger that size, the better. Secondary: The line's base plus height should be as close as possible to that size's. Third: Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to 2. Fourth: Go along to x = that size. The line's height there should be as close as possible to a whole number. Fifth: The line should cross the x-axis on the right of (0, 0), as close as possible to 3 times that size (a crossing on the left counts its whole distance).

| line or move | tuple |
|---|---|
| y = -2/3x + 4 | (2, 0, -1, -1/3, 0) |
|   shift up 1 → y = -2/3x + 5 | (5/2, 0, -1, -1/3, 0) |
|   shift down 1 → y = -2/3x + 3 | (3/2, 0, -1, 0, 0) |
|   tilt +1 → y = 1/3x + 4 | (3, -1, -1, 0, -21) |
|   tilt −1 → y = -5/3x + 4 | (3/2, -11/10, -1, -1/2, -21/10) |
|   mirror in the x-axis → y = 2/3x - 4 | (2, 0, -1, -1/3, 0) |
|   mirror in the y-axis → y = 2/3x + 4 | (2, 0, -1, -1/3, -12) |
|   stretch by 2 → y = -4/3x + 8 | (3, -1, -1, 0, -3) |
|   tilt +1/7 → y = -11/21x + 4 | (5/2, -19/22, -19, -13/42, -3/22) |

- A line of gradient −q/p hits every rung exactly by unit shifts (2 → 5/2 → 3 …, closeness 0 each time): rungs one cheap move apart, as principle 2 asks, but also a free highway for the first two layers. The first draft's thirds (base near p·s, area near p·q·s²/2) were met for free on that highway (seen in this walk-through) and were replaced by thirds the shape does not imply: the gradient's bottom near d (the shape forces bottom p, so this third pulls off the highway unless p = d) and the height at x = s near a whole number.
- 'east' is the sign-caring ally: a mirror in the y-axis costs it the whole crossing distance.
- How it could be wrong: the highway may still make the primary cheap to climb under rarity worth; the census and the scoring trial will say.

## Quadrant Square (`tree-geo-quadrant`)

Geometry. Reads the triangle's area (its size), against p/q of a square n². Four thirds, each a quarter: the sign preference lives in the third, decided by the rule that cares (the owner, 16 Nov), and a reflection keeps the primary (true by construction).

Quadrant Square, p = 3, q = 2. Card (all layers in a row):

> The line and the two axes make a triangle. The targets are 3/2 of a square of side n: 1 1/2, 6, 13 1/2, … Find the target nearest the triangle's area. The bigger its side n, the better. Secondary: The triangle's area should be as close as possible to that target. Third: Where the line crosses the x-axis should be as close as possible to that side length (a triangle on the right; the wrong side counts its whole distance). Fourth: Where the line crosses the x-axis should be as close as possible to minus that side length (a triangle on the left; the wrong side counts its whole distance). Fifth: The y-intercept should be as close as possible to that side length (a triangle above; the wrong side counts its whole distance). 6th: The y-intercept should be as close as possible to minus that side length (a triangle below; the wrong side counts its whole distance).

| line or move | tuple |
|---|---|
| y = -3x + 12 | (4, 0, 0, -8, -8, -16) |
|   shift up 1 → y = -3x + 13 | (4, -25/6, -1/3, -25/3, -9, -17) |
|   shift down 1 → y = -3x + 11 | (4, -23/6, -1/3, -23/3, -7, -15) |
|   tilt +1 → y = -2x + 12 | (5, -3/2, -1, -11, -7, -17) |
|   tilt −1 → y = -4x + 12 | (3, -9/2, 0, -6, -9, -15) |
|   mirror in the x-axis → y = 3x - 12 | (4, 0, 0, -8, -16, -8) |
|   mirror in the y-axis → y = 3x + 12 | (4, 0, -8, 0, -8, -16) |
|   stretch by 2 → y = -6x + 24 | (6, -6, -2, -10, -18, -30) |
|   tilt +1/7 → y = -20/7x + 12 | (4, -6/5, -1/5, -41/5, -8, -16) |

- Stretch by 2 multiplies the area by 2 (y = −6x + 24 has area 48): a shortcut that changes n by a factor √2, rarely onto a rung.
- How it could be wrong: the area is shared with Power Area, Square Area and Pythagorean Area, which all reward a big area; the adversary is in the quarters, which oppose each other in pairs (east against west).

## Borrowed Bottom (`tree-rep-borrowed`)

Representations. Reads the y-intercept or the x-crossing on a ruler whose bottom is the gradient's bottom number; target tops end in a drawn suffix. The primary is the target's size (the repair of the stopped draft, whose primary was the top: a tilt by 1/1000 multiplied it by about 1000).

Borrowed Bottom, ends = 37, reads = c. Card (all layers in a row):

> Write the gradient as a fraction in lowest terms and call its bottom number B (a whole-number gradient has B = 1). The targets are the fractions with bottom B, in lowest terms, whose top ends in 37 (for B = 4: 37/4 and on, every top ending in 37 that shares no factor with 4). Find the target nearest the y-intercept, ignoring a minus sign. The bigger that target, the better. Secondary: The y-intercept (ignoring a minus sign) should be as close as possible to that target. Third: The gradient's top number (ignoring a minus sign) should be as close as possible to the target's top. Fourth: Write where the line crosses the x-axis as a fraction in lowest terms. Its bottom number should be as close as possible to B. Fifth: The gradient's size times the target should be as close as possible to 1, counted in doublings: 2 and 1/2 are both one doubling away, 4 and 1/4 two.

| line or move | tuple |
|---|---|
| y = 3/4x + 137/4 | (137/4, 0, -134, -1, -936599/200000) |
|   shift up 1 → y = 3/4x + 141/4 | (137/4, -1, -134, -3, -936599/200000) |
|   shift down 1 → y = 3/4x + 133/4 | (137/4, -1, -134, -1, -936599/200000) |
|   tilt +1 → y = 7/4x + 137/4 | (137/4, 0, -130, -3, -5905387/1000000) |
|   tilt −1 → y = -1/4x + 137/4 | (137/4, 0, -136, -3, -193627/62500) |
|   mirror in the x-axis → y = -3/4x - 137/4 | (137/4, 0, -134, -1, -936599/200000) |
|   mirror in the y-axis → y = -3/4x + 137/4 | (137/4, 0, -134, -1, -936599/200000) |
|   stretch by 2 → y = 3/2x + 137/2 | (137/2, 0, -134, -1, -1336599/200000) |
|   tilt +1/7 → y = 25/28x + 137/4 | (937/28, -11/14, -912, -3, -1225263/250000) |

- The repair holds in this walk: a tilt by 1/7 moved the primary from 137/4 (34.25) to 937/28 (33.46), not by a factor.
- The 'echo' third (the gradient's top near the target's top) jumped from 134 to 912 away after the 1/7 tilt: thirds that read tops and bottoms are fragile under fractional nudges (true by construction: a nudge multiplies a bottom). That fragility is the third's, not the primary's.
- How it could be wrong: with B = 1 (a whole gradient) the targets are whole numbers ending in the suffix: the family is then Prime-Intercept-like without primality; its fraction flavour depends on the gradient being a fraction.

## Drawn Step (`tree-rep-step`)

Representations. Reads the y-intercept against the non-whole multiples of a drawn fraction u/v. The primary N is the multiple's count (a size: a fractional nudge moves the intercept by its own size).

Drawn Step, u = 3, v = 7. Card (all layers in a row):

> The targets are the whole-number multiples of 3/7 that are not whole numbers: 3/7, 6/7, 1 2/7, … (multiples of 7 × 3/7 = 3 are left out). Find the target nearest the y-intercept, ignoring a minus sign. Count how many steps of 3/7 it is: the more, the better. Secondary: The y-intercept (ignoring a minus sign) should be as close as possible to that target. Third: Where the line crosses the x-axis (ignoring a minus sign) should be as close as possible to that number of steps. Fourth: Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to 7 (a whole-number gradient has bottom number 1). Fifth: The line's height at x = 7 should be as close as possible to a whole number.

| line or move | tuple |
|---|---|
| y = -x + 9/7 | (3, 0, -12/7, -6, -2/7) |
|   shift up 1 → y = -x + 16/7 | (5, -1/7, -19/7, -6, -2/7) |
|   shift down 1 → y = -x + 2/7 | (1, -1/7, -5/7, -6, -2/7) |
|   tilt +1 → y = 9/7 | (3, 0, none, -6, -2/7) |
|   tilt −1 → y = -2x + 9/7 | (3, 0, -33/14, -6, -2/7) |
|   mirror in the x-axis → y = x - 9/7 | (3, 0, -12/7, -6, -2/7) |
|   mirror in the y-axis → y = x + 9/7 | (3, 0, -12/7, -6, -2/7) |
|   stretch by 2 → y = -2x + 18/7 | (6, 0, -33/7, -6, -3/7) |
|   tilt +1/7 → y = -6/7x + 9/7 | (3, 0, -3/2, 0, -2/7) |

- Stretch by 2 doubles N (3 → 6): a shortcut. A unit shift moves N by about 7/3 rungs.
- The 'crossing' third (X near N) ties the y-intercept to the gradient: X = c/|m| near N = c·v/u means |m| near u/v, so the third rewards a gradient near the drawn step: a second dimension defined by the target (true by construction).
- How it could be wrong: dense targets (u/v small) make closeness trivial; the third layer then carries the rule.

## Part Way (`tree-rep-partway`)

Representations. Reads the y-intercept, the x-crossing, the area or the gradient against points a drawn fraction of the way between consecutive numbers of a drawn ladder (squares, triangle numbers, cubes, powers of 2 or 3); whole points are left out.

Part Way, reads = c, ladder = square, u = 2, v = 5. Card (all layers in a row):

> Take two square numbers next to each other. The targets are the numbers 2/5 of the way from one to the next (2 1/5, 11 4/5, 19 3/5, …), leaving out any that are whole. Find the target nearest the y-intercept, ignoring a minus sign. The higher its gap (gap 1 is from the first to the second), the better. Secondary: The reading should be as close as possible to that target. Third: Take the gradient (ignoring a minus sign) times the gap's width (the second ladder number minus the first). It should be as close as possible to 1, counted in doublings: 2 and 1/2 are one doubling away. Fourth: The gradient (ignoring a minus sign) should be as close as possible to the gap number. Fifth: Where the line crosses the x-axis (ignoring a minus sign) should be as close as possible to the lower square number of the gap.

| line or move | tuple |
|---|---|
| y = x + 59/5 | (3, 0, -561471/200000, -2, -14/5) |
|   shift up 1 → y = x + 64/5 | (3, -1, -561471/200000, -2, -19/5) |
|   shift down 1 → y = x + 54/5 | (3, -1, -561471/200000, -2, -9/5) |
|   tilt +1 → y = 2x + 59/5 | (3, 0, -761471/200000, -1, -31/10) |
|   tilt −1 → y = 59/5 | (3, 0, none, -3, none) |
|   mirror in the x-axis → y = -x - 59/5 | (3, 0, -561471/200000, -2, -14/5) |
|   mirror in the y-axis → y = -x + 59/5 | (3, 0, -561471/200000, -2, -14/5) |
|   stretch by 2 → y = 2x + 118/5 | (4, -4, -166797/40000, -2, -21/5) |
|   tilt +1/7 → y = 8/7x + 59/5 | (3, 0, -3, -13/7, -53/40) |

- The gaps widen with n, so a unit bump stays in the gap from n = 2 or 3 on (true by construction): the primary is robust to small moves and climbed by stretches or long shifts.
- On powers of k, every far point is whole unless v has a prime factor dividing neither k nor k − 1: such parameter sets are refused by the space (true by construction).
- How it could be wrong: the primary grows only like √x (squares) or log x (powers): the ladder is short in a game's reach for powers.
