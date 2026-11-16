# Tangent Rings (`tree-geo-rings`): walk-through

Undealt. Code: `lib/v2-linear/src/tree-geo-rings.ts`; tests: `lib/v2-linear/test/tree-geo-rings.test.ts`. Every tuple
below is printed by `lib/v2-linear/scripts/tree-geo-walk.ts` (the engine's own evaluation), not worked by hand here.

## The card (d = 2, u = 3, v = 4, all three thirds in a row)

> Rings are circles round (0, 0) with radius 1/2, 1, 3/2, 2, … (every multiple of 1/2). Square the distance from (0, 0)
> to the line, square each ring's radius, and find the ring whose squared radius is nearest (the bigger ring on a tie).
> The bigger that ring's radius, the better. Each ring has a direction point: radius × 3/5 across and radius × 4/5 up
> (it is on the ring because 3² + 4² = 5²). **Secondary:** The line's squared distance from (0, 0) should be as close as
> possible to that ring's squared radius (it is 0 away when the line just touches the ring). **Third (touch):** Find the
> point of the line nearest to (0, 0), and flip that ring's direction point over the axes into the same quarter. Count
> how far apart the two points are, across plus up: less is better. **Or third (axis):** A line touching that ring at its
> direction point meets the y-axis at radius × 5/4. The line's y-intercept (ignoring a minus sign) should be as close to
> that as possible. **Or third (through):** The line should pass through that ring's direction point (not flipped: across
> and up are both positive). Measure straight up or down from the point to the line: less is better.

A dealt rule would be `closeness>touch`, `closeness>axis` or `closeness>through`.

## Parameters

`d` (rings every 1/d) and a direction (u, v) in lowest terms with u² + v² a square number. Drawn: d 1 to 12 and 36
directions (both orders of the 18 primitive triples with generators up to 9): 432 sets. Typed: any d to 60 and any such
direction. True by construction: every member has targets (the rings have no end; every line, vertical ones and lines
through the origin included, has a squared distance).

## Three lines, and what each cheap move does (tuple order: ring, closeness, touch, axis, through; "min" layers negated)

| line | tuple | why |
|---|---|---|
| 3x + 4y = 10 (y = −¾x + 2½) | (2, 0, 0, 0, 0) | distance² 100/25 = 4 = 2²; it touches ring 4 at (6/5, 8/5); y-intercept 5/2 = 2 × 5/4 |
| shift up 1 | (3, −29/25, −7/25, −¼, −¼) | distance² 7.84: now nearest ring 6 (radius 3), 1.16 short of it |
| shift down 1 | (1, −11/25, −7/25, −¼, −¼) | |
| tilt +1 | (5/2, −25/68, −43/34, −5/8, −7/8) | a flatter line is further from (0, 0): ring 5 |
| tilt −1 | (1, −7/13, −43/65, −5/4, −13/20) | |
| mirror in the x-axis | (2, 0, 0, 0, −16/5) | only `through` reads signs |
| mirror in the y-axis | (2, 0, 0, 0, −9/5) | |
| stretch by 2 | (3, −17/13, −89/65, −5/4, −1/10) | |
| y = x + 3 | (2, −½, −2/5, −½, −13/5) | distance² 4½: ring 4 (4) beats ring 5 (6¼); nearest point (−3/2, 3/2) against (−6/5, 8/5) |
| shift up 1 | (3, −1, −3/5, −¼, −17/5) | |
| shift down 1 | (3/2, −¼, −3/10, −1/8, −17/10) | |
| tilt +1 | (3/2, −9/20, −9/10, −9/8, −18/5) | |
| tilt −1 (y = 3) | (3, 0, −12/5, −¾, −3/5) | a flat line at height 3 touches ring 6 |
| mirror in the y-axis | (2, −½, −2/5, −½, −1/5) | |
| stretch by 2 | (5/2, −19/20, −17/10, −23/8, −7) | |
| y = 2x | (½, −¼, −7/10, −5/8, −1/5) | through the origin: distance 0, so the first ring, ¼ away |
| shift up or down 1 | (½, −1/20, −3/10, −3/8, …) | |
| tilt ±1, mirrors, stretch | (½, −¼, −7/10, −5/8, …) | a line through the origin stays through it |

Seen in these three lines only: a unit shift from a touching line moves the ring by one or two rungs (never to the
foot of the ladder); a mirror keeps everything except `through`; a tilt changes the ring because distance = |c|/√(1 + m²).

## Which draws are near-perpendicular (conjecture, not measured)

- Same d, different direction: the ring and closeness are identical (fully aligned); the thirds differ. Two seats with
  the same d cooperate on distance and pull the line's direction apart.
- Different d: the rings of 1/d and 1/d′ coincide only on multiples of 1/gcd; for coprime d, d′ the closeness layers
  disagree except on whole radii. Size is shared (both want far), so they are allies on the primary, as every
  "bigger is better" pair is (principle 6).
- `touch` against `through`: `through` fixes the first quarter, `touch` any quarter; `axis` reads only |c|.

## How it could be wrong or dull

- **Distance grows cheaply by shifting**: each unit shift of a flattish line adds about a unit of radius, d rungs. The
  primary is a straight hill in c (the same weakness pool-plan.md records for Power Area); it needs the growth price or an
  opposing family (a steep-gradient rule shrinks the distance). Not measured.
- **Squared distance is a bespoke step** for a 12-year-old ("square the distance, square the radius"). It is there
  because the distance itself is usually not a fraction. If it reads badly, the alternative is to read |c| and |x-crossing|
  instead, which loses the circle.
- With `touch` at 0 and closeness at 0 the line is the tangent at the direction point: one line per ring. That is a
  ladder of exact states, each reachable by `basis.zoom` from the last (zoom is out of the beginner set for exactly this
  reason).
- Large d makes rungs so dense that "the ring" changes with almost any move: the primary then behaves like plain
  distance and closeness carries the structure.
