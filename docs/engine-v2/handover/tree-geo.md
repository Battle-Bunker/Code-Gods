# Hand-over: geometry tree families (`tree-geo-*`), 16 November 2026, about 20:45 Melbourne

Branch: `claude/tree-geo-rings` (from `develop` at 2ef3ba28). Nothing is merged. One family of five is built.
The brief: eight candidate tree-shaped families through a geometry lens; build the best five as undealt families with
large parameter spaces, marks for every layer, tests on hand-worked lines, a walk-through each; show them in the Line
Rules Mirror. The coordinator stopped the session after the first family.

## What is on the branch

| File | What |
|---|---|
| `lib/v2-linear/src/tree-geo-kit.ts` | Shared kit: `ParamSpace` (size, says, draw, parse, format), `wholeSpace` (a space of whole-number fields with a filter), `geoFamily` (a tree family with its space), `nearestRung` (nearest target on any endless increasing ladder, the higher on a tie), `citer` (reads a mark's element only when its representation is in `depends`), `frac`, `firstFew`, `dist`. |
| `lib/v2-linear/src/tree-geo-rings.ts` | **Tangent Rings**, complete: card, 3 alternative thirds, space of 432 drawable sets, marks. |
| `lib/v2-linear/src/tree-geo.ts` | The one registry: `treeGeoFamilies`. `families.ts` spreads it into the line type; `index.ts` exports it. Add each new family here only. |
| `lib/v2-linear/src/representations.ts` | One new element: `cart.mark(x, y)`, a marked point a rule compares the line with. |
| `lib/v2-linear/test/tree-geo-rings.test.ts` | 6 tests, all pass: hand-worked tuples, every line has a ring, ties, the space round-trips, every layer has marks, nothing outside `depends` is read. |
| `lib/v2-linear/scripts/tree-geo-walk.ts` | Prints a family's card and the tuples of given lines under shift ±1, tilt ±1, both mirrors and stretch by 2: the tables of the walk-through files. `node --experimental-strip-types lib/v2-linear/scripts/tree-geo-walk.ts tree-geo-rings 'd = 2, u = 3, v = 4' 3,4,-10 -1,1,-3` |
| `docs/engine-v2/tree-families/tangent-rings.md` | The walk-through for Tangent Rings. |
| `artifacts/player-web/src/gallery/rules-mirror/pool.ts`, `main.tsx` | The mirror reads a family's `space` (duck-typed, no change to v2-core): "Draw another", a type-in box with the parser's own error text, and for such families the variants are each third alone after closeness, closeness alone, then all layers in a row. |
| `artifacts/player-web/test/rules-mirror-pool.test.ts` | One added test for the above; 2 of 2 pass. |

Checked on this branch: root `pnpm run typecheck` passes; the two test files above pass; the built mirror page was opened
in a browser and Tangent Rings drew the two rings, the direction point, the three measures and the score table, with
"Draw another" and a typed set both working. **Not run**: the rest of `pnpm --filter @workspace/v2-linear test`, the
`v2-views` tests that walk every family (`annotate.test.ts`, `render.test.tsx`), the engine `test:unit` rule check, the
`code-review` skill. Run these before merging.

## Decisions made, and why

1. **The parameter space is a field on the family (`space`), not a change to `RuleFamily` in v2-core.** Three sessions
   were adding families at once and `contracts.ts` is shared; the mirror reads the field by duck typing. `dealable()`
   returns a showcase of 8 sets so every existing consumer works unchanged. I proposed this shape to the mirror session
   (session_0119hWTUWcb54eAGGHQwmmqR) and got no reply; their branch (`claude/prime-gradient-suffix`) was not pushed when
   I looked. **If they built a different interface, conform to theirs and delete mine**: it is about 40 lines.
2. **Parameters are whole numbers only** (`{ d, u, v }`), so a set prints as `d = 2, u = 3, v = 4`, parses back from the
   same text, and stays a plain JSON rule key. A fraction parameter is two whole fields.
3. **A third is defined by the target, in another representation.** I dropped "gradient near u/v in doublings" from
   Tangent Rings because it reads only the parameters, not the ring: it would fail principle 3.
4. **Distances between points are "across plus up"**, not straight-line: it is a fraction for every line and a
   12-year-old can count it.
5. **Signs are free in layers 1 and 2; one third per family is the sign-caring ally** (`through` in Tangent Rings), as
   the owner asked.
6. **No fallback mechanisms.** Where a reading does not exist for some line (a vertical line has no y-intercept) that
   third is undefined, which is the worst; the first two layers are chosen so that every line has them.

## What the next session must not rediscover

- A mark that cites an element of a representation in `depends` must be read first or the engine throws ("cites …
  without reading it"); one outside `depends` must not be read. Use `citer(ctx, DEPENDS)`.
- The plane renderer already draws: point candidates, `measure` between two points, a circle for a candidate on
  `norm.circle(r2)`, a square for `tri.square(s)`, ghost lines for `cart.ghost(g)`, halfway ticks between two candidates
  on `xAxisMark`/`yAxisMark` with the same term. `tri` elements are undefined for lines through the origin or parallel to
  an axis: read `gen` or `crossing`/`si` instead if the family should score those lines.
- The card is the main sentence plus "Secondary: …", "Third: …" by position in the dealt chain, so a third's sentence
  must stand alone: define shared ideas (the direction point) in the main sentence.
- The mirror's family `<select>` is hidden at desktop width; click `button[data-family="…"]`. The built page must be
  served over http, not opened as a file. Do not commit `artifacts/player-web/dist-rules-mirror/`.
- `scoreToWire` negates "min" layers; an undefined third is `null`.
- The design-principles test and `tuple-catalogue.ts` (starters) only cover dealt or pooled families: an undealt family
  needs no entry there.

## The eight candidates

All share the shape: (1) the size of the target nearest a reading, bigger is better; (2) closeness; (3) one of several
thirds defined by that target. X and Y are the signed x- and y-intercepts. Sizes are counts of drawable sets.
Everything about dynamics below is conjecture; nothing was measured.

### 1. Tangent Rings (built)
See `docs/engine-v2/tree-families/tangent-rings.md`.

### 2. Leg Ratio (`tree-geo-legs`), to build
- **Reading:** base + height of the triangle the line cuts off the axes, |X| + |Y| (0 for a line through the origin; a
  line parallel to an axis has no triangle and no score).
- **Parameters:** a shape p : q in lowest terms, p, q from 1 to 12 (about 90 ordered pairs), and a step d from 1 to 6:
  about 550. Any coprime pair and any d can be typed.
- **Targets:** "the p : q triangle of size n/d has base p × n/d and height q × n/d", so base + height = (p + q) × n/d,
  n = 1, 2, 3, … Primary: the size n/d.
- **Card, main:** "The line and the two axes make a triangle. Add its base and its height. A 3 : 2 triangle of size s has
  base 3 × s and height 2 × s, so its base plus height is 5 × s; sizes are 1/2, 1, 3/2, … Find the size whose base plus
  height is nearest the line's. The bigger that size, the better." Secondary: "The line's base plus height should be as
  close as possible to that."
- **Thirds:** (base) the base as close as possible to p × size; (area) the area as close as possible to p × q × size² ÷ 2;
  (corner, sign-caring) the triangle in the quarter where x and y are both positive: X near +p × size.
- **Marks:** `xAxisMark` and `yAxisMark` candidates at the target legs with measures from `cart.xInt`/`cart.yInt`; the
  region `tri.area` with a note.
- **Hand-check to start the test:** p : q = 3 : 2, d = 2. y = −(2/3)x + 4: base 6, height 4, sum 10 = 5 × 2: tuple
  (2, 0, 0) for `base`; area 12 = 3 × 2 × 4 ÷ 2, so 0 for `area`.

### 3. Quadrant Square (`tree-geo-quadrant`), to build
- **Reading:** the SIGNED area ½ × X × Y: positive when the intercepts have the same sign (the triangle is in the
  top-right or bottom-left quarter), negative otherwise.
- **Parameters:** a side s = same or different (as a whole field: `side = 1` or `side = −1`), and a fraction p/q in
  lowest terms, q from 1 to 12, p from 1 to 2q: about 180 × … count them in code. Any fraction can be typed.
- **Targets:** side × (p/q) × n²: "p/q of a square of side n", on the wanted side of zero only. Primary: n. A line on the
  wrong side still has a nearest target (n = 1) and is far from it: graded, no cliff.
- **Thirds (each picks a quarter):** X near +n; X near −n; Y near +n; Y near −n. With closeness 0 and X = n the height
  is 2pn/q, a fraction.
- **Marks:** `tri.square(s = n)` candidate (drawn beside the triangle), axis marks for the third.
- **Hand-check:** side = 1, p/q = 3/2. X = 4, Y = 12 (y = −3x + 12): signed area 24 = (3/2) × 16: n = 4, closeness 0,
  "X near +4" 0. Its mirror in the y-axis has signed area −24: nearest target 3/2 (n = 1), 25½ away.
- **Risk:** this is the one family where a mirror flips the primary. That is the owner's stated wish for a sign family,
  but it is a one-move knock from n to 1; if that reads as a cliff, move the sign to a third and keep layer 1 on size.

### 4. Fraction Post (`tree-geo-post`), to build
- **Reading:** the height of the line at a drawn post x = a/b (ignoring a minus sign). A vertical line has no score.
- **Parameters:** post a/b in lowest terms with b from 2 to 7 and |a/b| < 6, and a bottom number d from 2 to 12: about
  2,000.
- **Targets:** fractions with bottom exactly d in lowest terms (n/d with n and d sharing no factor). They always exist:
  1/d is one, and every stretch of length 1 holds at least one. Primary: the target's size.
- **Thirds:** (top) the y-intercept's size near the target's top number n; (flip) the x-crossing's size near the target
  upside down, d/n; (next post) the height at x = a/b + 1 near the target plus 1/d (so the gradient is 1/d).
- **Marks:** `cart.pointAtX(q = a/b)` focus, `cart.mark` candidates at the target and its neighbour on the post, measure
  between them; axis marks for the thirds.
- **Note:** `nearestRung` needs an increasing ladder indexed by n; here skip tops that share a factor with d (walk
  outward from round(x × d) in both directions instead).

### 5. Balance Point (`tree-geo-centroid`), to build
- **Reading:** the triangle's balance point (X/3, Y/3): "cut the triangle from card: it balances on a pin there".
  Layer 1 reads the size of its x-coordinate.
- **Parameters:** bottom number d from 1 to 12, and a multiplier a/b for the thirds (a, b from 1 to 6, lowest terms):
  about 400.
- **Targets:** fractions with bottom exactly d nearest |X|/3; primary: the target's size.
- **Thirds, all on the y-coordinate, all sign relations:** (same) Y/3 near (a/b) × target with the SAME sign as X;
  (opposite) the same with the OPPOSITE sign; (hyperbola) |Y|/3 near 1 ÷ target (the balance point on the curve
  x × y = 1).
- **Marks:** `cart.mark` at the balance point (focus), candidate at the wanted point, measure between.

### 6. Ray Meeting (not built; build if one of 2 to 5 proves dull)
Reading: where the line meets the drawn ray y = (p/q)x. Targets: the lattice points (q × n, p × n) on it; primary n.
Thirds: the gradient near −q/p (square to the ray), read as "run p for every q down"; the x-intercept near a multiple of
n. About 90 rays. Close to the existing Same on Both Rulers (tuple), which meets y = ±x.

### 7. Slant (not built)
Reading: the slanted side squared, X² + Y². Targets: (n/d)², primary n/d. Third: the legs in a drawn Pythagorean ratio
u : v, so both legs are fractions. Same form as Tangent Rings with the hypotenuse for the distance.

### 8. Mirror Point (not built)
Reading: the mirror image of (0, 0) in the line (always a fraction point, twice the nearest point). Layer 1 on its
x-coordinate's size against fractions with bottom d; thirds on its y-coordinate. Same form as Balance Point.

## Known weak spots, for the coordinator

- 1, 2 and 3 have a size primary that grows by one cheap move repeated (shift for distance; tilt toward flat for legs and
  area): the weakness pool-plan.md records for Power Area. They need the growth price or a seated opponent.
- 5 and 8 overlap, as do 1 and 7.
- Whether "squared distance" passes the 12-year-old test (principle 12) is the owner's to judge on the mirror page.

## Next steps, in order

1. Ask the mirror session which parameter-space interface it settled on; conform if it differs (decision 1).
2. Run the suites listed under "Not run"; run the `code-review` skill on the branch; open the pull request for Tangent
   Rings into `develop`, merge when green, tell the coordinator so the mirror is republished.
3. Build 2, 3, 4, 5 in that order, each: test first on the hand-check above, family file, one line in `tree-geo.ts`,
   walk-through from the script, its own small pull request.
4. Report to the coordinator (session_0119hWTTwuLhVM9x9Mgn979Z) after each merge, times in Melbourne time.
