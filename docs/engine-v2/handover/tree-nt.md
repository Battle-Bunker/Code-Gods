# Hand-over: number-theory tree families (`tree-nt-*`)

Branch `claude/tree-nt-families`, from `develop` at 2ef3ba28. Stopped at 20:15 Melbourne time, 16 November 2026, at the
coordinator's request. Nothing is merged. Nothing is dealt and no value file was generated (as instructed).

## The brief (from the coordinator, with the owner's words)

Tree-shaped tuple families through a number-theory lens: targets from number classes (primes by digit suffix, powers,
smooth numbers, squares, residues, tops against bottoms), with a second and third layer read in a different
representation of the same line; at least half with fractional targets as their natural home; large parameter sets
with a filter that guarantees targets exist; at least three alternatives for the third layer; marks so the object view
draws every layer; listed on the Line Rules Mirror with "draw another" and a type-in control; a walk-through per
family in `docs/engine-v2/tree-families/<family>.md`; one small PR per family, each reported to the coordinator.

## What is on the branch

| file | state |
|---|---|
| `lib/v2-linear/src/tree-nt-shared.ts` | done: `ParamSpace`, `treeFamily` builder, `chainsOf`, suffix-prime search, helpers |
| `lib/v2-linear/src/tree-nt-prime-top.ts` | done: family 1, Prime Top |
| `lib/v2-linear/test/tree-nt-prime-top.test.ts` | done: 9 tests, every expected value worked by hand; all pass |
| `lib/v2-linear/src/tree-nt-index.ts` | the one place the families are registered (`treeNtFamilies`) |
| `lib/v2-linear/src/families.ts`, `index.ts` | one line each: `...treeNtFamilies`, `export * from "./tree-nt-index.ts"` |
| `lib/v2-linear/src/representations.ts` | three new dynamic elements on `cart`: `heightAt{q,y}`, `fixedLine{g}`, `onFixed{x,g}` |

Checked: root `pnpm run typecheck` passes; `lib/v2-linear` tests pass (176). NOT run: the engine's rule-check and
guarantees suites, `lib/v2-views`, `lib/v2-agents`, `artifacts/player-web` (the mirror's pool test). Run them before
any merge: a new family on `lineType.families` and three new `cart` elements can trip a test that lists either.

Not started: families 2 to 5, the mirror changes, every walk-through document, the pull requests.

## Decisions made, and why

1. **Every primary reads a size of the line** (crossing, distance², height at an x, meeting point), never a top, a
   bottom or a standard-form coefficient. True by construction: one cheap fractional nudge (tilt by 1/7) multiplies a
   bottom, so a primary that grows with a bottom is inflated for almost nothing (the Close Intercept finding in
   design-principles.md, principle 6). Tops and bottoms appear only inside targets and in third layers.
2. **Targets are sparse and grow without bound; targets that accumulate are out.** Continued-fraction convergents
   (Fibonacci ratios to the golden ratio, and the like) have basins that shrink geometrically, so a high level is lost
   to any bump: a cliff. Dropped for that reason, and "stride" (top² + bottom² of the gradient near a prime) for reason 1.
3. **Fraction targets come from four constructions**: a class of whole numbers over a drawn bottom (p/d); a class plus
   a drawn fraction part (w + r/s); powers of a drawn fraction (B^j); squares of fractions ((n/d)²). All are discrete.
4. **Parameter sets**: a family carries `space` (size, a sentence, fields, `draw(rng)`, `parse(fields)`, `show(p)`);
   `dealable(lineQ)` returns a sample of 8 (hand-picked first, then seeded draws) so every existing consumer of a
   parameter list keeps working. `RuleFamily` in v2-core is NOT changed: `space` and `chains` are extra fields on the
   family object (type `TreeNtFamily`). I asked the mirror session (session_0119hWTUWcb54eAGGHQwmmqR) what contract
   it is adding for "draw another"; no reply had arrived. Match theirs if it exists.
5. **Layer lists**: `chains` on the family lists what the mirror should offer: `closeness`, `closeness>X` for each
   third X, and `closeness>X>Y` for each ordered pair (10 for three thirds). Every layer's term is always recorded, so
   any chain evaluates.
6. **Reflections keep the score** (sizes are read; targets are marked on the reading's own side). A flat line reads
   its height where the reading is a crossing (the coordinator's earlier call for Prime Landing (tuple)).
7. **Suffix draws are weighted** to short endings (1 digit 3/8, 2 digits 4/8, 3 digits 1/8): a three-digit ending
   over a bottom of 12 puts targets about 200 apart on the x-axis. Conjecture: that ladder is too sparse to climb in a
   game (the first redesigned Prime Landing failed that way with rungs 10 apart).
8. **Drawing**: marks follow the annotation contract the views already read (`lib/v2-views/test/tree-rule.test.tsx`):
   a focus on the reading with the main term, candidates for the target and its neighbours, a measure for closeness,
   and for each further layer a focus and one note with its working. `contributors.ts` reads a candidate's number from
   the element's value, else from `args.x ?? args.y`; that is why `heightAt` takes `{q, y}` and `onFixed` takes
   `{x, g}`. The plane already draws any point candidate, any segment candidate as a ghost line, `norm.circle{r2}`
   as a circle round (0, 0) and `tri.square{s}` as a square beside the triangle; no renderer change is needed for
   families 1 to 5 as designed below.

## The eight candidates

All: layer 1 is the size or level of the nearest target to a reading; layer 2 is closeness; layer 3 is one of three
alternatives read in another representation and defined by the target.

### 1. Prime Top (built) [fraction]

- Reading: where the line crosses the x-axis, ignoring sign (a flat line: its height).
- Targets: p/d, p a prime whose final digits are the drawn ending (1 to 3 digits, last digit 1, 3, 7 or 9, so such
  primes never run out), d the drawn bottom 2 to 12; a top that divides the bottom is skipped. 444 × 11 = 4,884 sets.
- Layer 1: the top p. Layer 3 alternatives, from the mixed-number form w r/d: `leftover` (the y-intercept's size near
  r), `part` (the gradient's size near r/d plus a whole number), `point` (the line's height at x = d near p).
- Card (ending 13, bottom 7, chain `closeness>leftover`): "Find where the line crosses the x-axis, ignoring a minus
  sign (a flat line never crosses it: use its height instead). The targets are the fractions with bottom 7 whose top
  is a prime number ending in 13 (13/7, 113/7, 313/7, …). Find the target nearest the crossing. The bigger that
  target's top, the better. Secondary: The crossing should be as close as possible to that target. Third: Write the
  target as a mixed number: divide its top by 7 and keep what is left over (113/7 = 16 1/7: 16 whole ones and 1 left
  over). The y-intercept, ignoring a minus sign, should be as close as possible to that leftover."
- Hand-worked tuples (in the test): y = x − 16 gives (113, 1/7 away, 15 away); y = −7x/113 + 1 gives (113, 0, 0);
  ending 3 over 2: y = −2x/13 + 1 gives (13, 0, 0), a shift of 1 moves it to 23, a tilt of 1 to 3.

### 2. Fraction Power [fraction] (next to build)

- Reading: distance² from (0, 0) (`norm.dist2`). Chosen over area: a stretch by the base moves the area exactly one
  rung (Power Area's cheap climb, pool-plan.md); distance² = c²/(1 + m²) does not scale that way. Structural claim, not
  measured.
- Targets: B^j, B = a/b > 1 a drawn fraction in lowest terms (a ≤ 12, b ≤ 6, whole bases included; about 60), j any
  whole number, negative too. Layer 1: the exponent j. Candidates drawn as `norm.circle{r2}` (concentric circles).
- Layer 3 alternatives: the x-crossing near j (crossing); the y-intercept's size near B^(j div 2) (si); the triangle's
  area near B^(j+1) (tri). The last is exact only when B² − 1 is a square of a fraction (B = 5/4, 5/3, 13/12, 17/8).

### 3. Smooth Mixed [both]

- Reading: y at x = k (table), k drawn from ±1 … ±9.
- Targets: w + r/s, w built only from a drawn set of 2 or 3 primes out of the first eight (84 sets), r/s a drawn
  fraction part (0 or a proper fraction, s ≤ 8: 22). About 33,000 sets. Layer 1: w. Candidates: `cart.heightAt{q:k,y}`.
- Layer 3 alternatives: the gradient near w's count of prime factors (si); the x-crossing near a factor of w
  (crossing); the triangle's area near a multiple of w's largest prime (tri).

### 4. Fraction Slant [fraction]

- Reading: the slanted side² of the axis triangle (`tri.hyp2`). Targets: (n/d)², d drawn 1 to 12, n leaving r on
  division by q (q 1 to 9: 45 pairs); 540 sets. The slanted side is then n/d, exactly reachable only when the legs and
  the side form a Pythagorean triple of fractions. Layer 1: n. Candidates: `tri.square{s: n/d}`.
- Layer 3 alternatives: the y-intercept's size near the next target down (a slim triangle); the gradient's size near
  n/d; distance² from (0, 0) near (n/2d)² (a fat triangle: the altitude is at most half the slanted side). The first
  and third pull opposite ways.
- (Sent to the coordinator as "Rational Reach" with distance² from a drawn lattice point; changed because a circle
  round a point other than (0, 0) needs new drawing code.)

### 5. Tower [fraction]

- Reading: the x where the line meets the drawn fixed line y = g·x (g from ±1, ±2, ±3, ±1/2, ±1/3, ±2/3, ±3/2: 14;
  a parallel line reads its y-intercept, as Same on Both Rulers (tuple) does). Focus `cart.pointAtX`, the fixed line as
  `cart.fixedLine{g}`, targets as `cart.onFixed{x,g}`.
- Targets: n + u/(n + v), u 1 to 9, v 0 to 9, n from max(1, u − v + 1) so the bottom exceeds the top and the targets
  increase (2½, 3⅓, 4¼ for u = 1, v = 0). 1,260 sets. Layer 1: n. As an improper fraction the top is n² + vn + u.
- Layer 3 alternatives: the y-intercept near that top (si); the gradient's fraction part near u/(n + v) (si); a + b + c
  of the whole-number form near a multiple of n + v (gen; the card must explain the whole-number form).

### 6 to 8 (not planned for building)

6. Leg Sum Triangle [both]: x-leg + y-leg near T(n)/d (triangle numbers over a drawn bottom); thirds: gradient near n,
   area near T(n − 1), y at x = n near a whole number.
7. Unit-Fraction Gradient [fraction]: the gradient's size near 1/n, n in a drawn class, closeness in doublings; opposes
   area and crossing size by direction. Caution: a small gradient puts a number in a bottom (decision 1 above).
8. Clock Prime Area [integer]: 2 × area near a prime leaving r on division by q (q 3 to 30, about 270 pairs): the
   suffix rule generalised to any modulus.

## Next steps, in order

1. `pnpm install`; run the suites listed as not run above; fix what the new family or the new `cart` elements trip.
2. Mirror (`artifacts/player-web/src/gallery/rules-mirror/pool.ts`, `main.tsx`): in `variantIds`, use
   `family.chains` when present (today it lists prefixes only); when `family.space` is present add "draw another"
   (`space.draw`) and one input per `space.fields` (`space.parse`, show `invalid`), and state `space.size` and
   `space.describe`. Rule keys for typed-in parameters have no value file: the page already handles that.
   `CURATED` in `gallery/line-examples.ts` wants three or four lines per family (the test's lines serve).
3. Walk-through `docs/engine-v2/tree-families/prime-top.md` (card; three lines with tuples; what shift 1, tilt 1,
   mirror, stretch 2 do; which draws are near-perpendicular; how it could be wrong). Then PR 1: shared file, Prime Top,
   mirror change. Review, selective suites, merge, tell the coordinator.
4. Families 2 to 5, one file, one test, one walk-through and one PR each; only `tree-nt-index.ts` changes for
   registration.

## How this could be wrong

- All five primaries reward a big reading; families of this shape are aligned by size with most of the pool
  (principle 6). Different readings and disjoint target classes separate where the targets sit, not the wish for size.
  Conjecture, unmeasured: the draws are near-perpendicular in closeness and thirds, not in the primary.
- Prime Top's `point` third marks a point at height p, which can be far off the window (p = 613 with bottom 7); the
  plane will zoom out. Not looked at in a browser.
- No family here has been seen on the mirror or in the object view; the marks are checked only by unit tests.
- Whether a 12-year-old can rank states from these cards (row 12) is untested.

## Housekeeping

- Draft pull request: #1122 (do not merge as it stands).
- The first commit on this branch (451a888b) carries a co-author trailer with a model name, against the brief; a
  force-push to remove it was refused in this session. Squash-merge with a clean message, or rewrite it, before merging.
