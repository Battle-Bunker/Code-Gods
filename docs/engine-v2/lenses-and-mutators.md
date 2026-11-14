# Lenses and mutators on a line (14 November 2026)

Status: design and measurement. **Nothing here changes the engine's dealt rules, mutators or prices.** Every proposal is
for the coordinator and the owner to choose from. The script is `lib/v2-agents/scripts/lenses.ts`
(`node --experimental-strip-types scripts/lenses.ts [--H 16] [--sources 30]` from `lib/v2-agents`, about two
minutes); its full output is [scripts/lenses-results.md](scripts/lenses-results.md).

The brief (the owner, verbatim): "Think more creatively about other lenses to use for defining a line that will give us
a wider variety of mutators operating through different lenses for changing lines and let the same project inspire new
interesting rule families as well. Consider operations in a different basis or flips around other lines (but where it's
expensive to introduce a line with lots of information in it from scratch in order to do so)." And: "it might be cheaper
for an agent that cares about gradient and a particular point on the line to rotate the line about that point (this
should be an available mutator) rather than just changing the m argument, thereby disrupting potentially fragile
structure that other gods cared about in the y intercept."

---

## The summary in plain words

- **A line can be looked at in many more ways than the engine shows**, and each way suggests its own moves. This
  document catalogues seventeen lenses (§2): the angle, the fold, a mirror anywhere, a slanted grid, a zoom, the
  distance and direction from the origin, the "swap the gradient and the y-intercept" chart, the fraction tree of the
  gradient, the line's shadow point (its pole), and eight that fold into existing or proposed moves.
- **The owner's example works and is measured.** "Turn the line about a point on it" is exact over the rationals for any
  turn whose tangent is a fraction. For an agent that wants a new gradient through a fixed pin, one turn is cheaper than
  the existing pivot route in **90%** of cases, typically **3.6×** cheaper, and it moves the y-intercept far more than a
  tilt does: the collateral damage the owner described.
- **Every proposed move keeps prices an exact potential** (each has an inverse of the same fee; checked on 4.75 million
  calls), so no rule's value changes when a move is added. And a line's description length is a floor no shortcut can
  break: shortcuts change which lines are neighbours, never how rare a line is.
- **Shortcuts.** The nine existing moves already beat the unit path by 1.17× (median). The best new shortcut is
  **swapping the gradient and the y-intercept** (y = mx + c ↦ y = cx + m, and y = c ↦ y = 1/c): 14% of routes get at
  least 1.25× cheaper, up to 4.2×, and 41% more lines fall within a 30 ⚡ budget. But **every new mutator taxes every
  call** (the "which mutator" bits grow with the menu), so a move nobody uses makes the game dearer: a weighted "which"
  code is proposed to the spec lead.
- **Collateral.** Each rule has "keeper" moves that leave it untouched (tilt keeps Prime Landing, zoom keeps Prime
  Gradient, lean keeps Whole Crossing) and "wrecker" moves. The turns and folds are the wreckers (about 36% of their
  improving calls halve a bystander's bits, against 7–26% for the nine); the fraction-tree step is the gentlest move in
  the game (6%). This is the political structure the owner wants: who is entangled with whom depends on the lens used.
- **Dynamics.** Three selfish climbers on one line never settle, with any menu; with all eighteen moves they visit more
  lines and wreck each other twice as hard, which rewards negotiating. **One warning:** a richer menu can hand one god
  the table (Whole Crossing ended with 10 bits, the others with 2–3), because some new moves keep its number while
  wrecking the others'. Menus must be balance-checked against their pool.
- **Seven new rule families** (§4: Turnstile, Whole Hypotenuse, Mirror Meeting, Swap Twins, Slanted Graph Paper, Family
  Tree, Pole Star) each read a coincidence between several numbers and come with their lens's own move.
- **The first five to build** (§5): turn about a pin (or about the origin by a Pythagorean angle), swap the gradient and
  the y-intercept, lean (the tilt's twin that keeps the x-intercept), zoom about the origin, and fold (in a crease through
  a pin, or in any mirror line paid for in full).

---

## 1. One picture behind every lens

A line over the rationals is a triple (a, b, c), up to scale, of a·x + b·y + c = 0. That makes a line a **point of the
dual plane**, and every way of changing a line is a way of moving that point. Three kinds of move come out of this, and
every lens below is one of them seen through a particular chart:

1. **Adding an amount to one number of a chart** (move up, add to the gradient, add to the run per rise, slide the pole).
   These are the owner's far-move rule: "an amount added costs in proportion to its size, and more in one act than as a
   path". They are priced by size (spec §12.4: fee rate(o)·σ, so a move of size n costs exactly n unit moves; the act
   charge W + 0.05·W² makes one big act dearer than its path).
2. **Acting on the plane by a symmetry or a change of basis** (mirror, stretch, zoom, turn, fold, shear). These are the
   owner's decision 25 shortcuts: "priced as choices (or by digits), never by the unit path". A move that needs an
   auxiliary object (a mirror line, a centre, an angle) pays that object's description length from scratch, so a fold
   in a simple mirror is cheap and a fold in an information-rich one is dear (the owner: "expensive to introduce a line
   with lots of information in it from scratch").
3. **Acting on the line's own coordinates as a dual object** (permute a, b, c; move along the gradient's fraction tree;
   slide the pole). These are moves of the dual plane that are not symmetries of the ordinary plane. They are where the
   most surprising shortcuts and the most collateral damage live, because they keep numbers that no school lens shows
   together.

Every proposed move here keeps the exact potential (owner decision 19): each has an inverse of the same mutator and the
same fee, so the price list stays "handling fee shared by a move and its inverse, plus the surcharge max(0, Δφ)", the
walk stays Metropolis on φ and every value function is unchanged by adding it. The script checks this on every
enumerated call (part `check`: 0 calls without a same-fee inverse). The stationary law, hence every rule's value, does
not depend on which mutators a variant offers; the mutators change only what play costs and where it can go cheaply.

**One price every new lens pays.** "Which mutator" costs log2 N bits on every call (spec §5.2). Going from nine to
eighteen mutators adds one bit to every call, about a quarter more on a unit shift (4.25 → 5.2 bits before the
surcharge). A lens that players do not use still makes every other move dearer. §3 measures this; §5 proposes a
weighted "which" code as the remedy (a pricing question for the spec lead).

---

## 2. The catalogue

For each lens: what a twelve-year-old sees; the numbers it exposes; the mutators it suggests (✓ = the engine has it,
**P** = proposed and measured here, *idea* = proposed, not measured); what each does to the other lenses' numbers (the
collateral map: the measured share of local calls that keep each number is in §3.3); a price consistent with spec §5; the
inverse. "Choice" prices are which + choices; "steps" are the spec's position code; "digits" the factor or rational
code.

### 2.0 The lenses the engine has (spec §12.3), for reference

slope-intercept `si` (m, c), general form `gen` (a, b, c), intercepts `int` (p, q), the plane `cart`, the intercept
triangle `tri`, the growth pattern `seq`, the table `table`, the function machine `mach` (×m then +c, fixed point,
lamp), the pegboard `peg`, the line seen from the origin `norm` (distance², foot), exact change `coins`. Their nine
mutators: `si.shift`, `si.tilt`, `seq.step`, `cart.pivot` (gradient + k about the point at x = x0), `cart.slide`,
`cart.mirror` (x-axis, y-axis, origin, y = x), `gen.nudge`, `int.move`, `mach.stretch`.

Already, the owner's example is half-built: **`cart.pivot` is "rotate about a point" in the gradient's own units** (it
adds k to m keeping the point at x0). §2.1 adds the true turn, priced by angle, which is the representation shortcut.

### 2.1 The angle: turn about a point on the line **P `rot.turn`**

- **A kid sees** a pin through the line at x = x0 and the line turned about it like a clock hand: "a quarter turn",
  "half a right angle" (tan θ = 1), "a 3-in-4 turn" (tan θ = 3/4).
- **Numbers.** The pin (x0, y(x0)), the turn t = tan θ. The gradient changes by the tangent-addition rule
  m′ = (m + t)/(1 − m·t); a quarter turn sends m to −1/m (the perpendicular).
- **The fact that makes it work over the rationals.** Turning a line about a point *on it* keeps every coefficient
  rational for **any** rational t, because only the direction turns and the pin stays put. (Turning about a point off
  the line needs a rational cosine too: §2.6.)
- **Collateral.** Keeps the pin; changes m, c, both intercepts, the distance. Against `cart.pivot` (gradient + k about
  the same pin), it reaches the perpendicular, the flat line and every angle-like target in one cheap act: in §3.2 one
  turn beats the pivot route in **90%** of cases, by a median **3.6×**. This is the owner's example: the
  agent that cares about the gradient and the pin turns, and whoever cared about the y-intercept pays.
- **Price** (choice and digits): which + steps(x0) + 1 bit (quarter turn or not) + nonzeroRat(t) (the spec's digits
  code: nonzero(p) + gamma(q)). A quarter turn about the y-intercept costs which + 1 + 1.
- **Inverse.** The turn by −t about the same pin (the pin is still at x = x0), the same fee; a quarter turn is its own
  inverse (two quarter turns about a point of the line give the same line). A turn whose result would be vertical is
  refused, and turns from vertical lines are refused, so the inverse always exists (exact potential).

### 2.2 The fold: reflect in a mirror through a point of the line **P `rot.fold`**

- **A kid sees** a mirror (a crease in the paper) through the pin; the line flips to its reflection.
- **Numbers.** The pin, the crease's gradient s. With T = 2s/(1 − s²) (the doubled crease angle), m′ = (T − m)/(1 + m·T).
  s = 0 (a level crease) sends m to −m about the pin: this is **"swap two entries of the table"** (y(i) ↔ y(j) is the
  fold about the vertical half-way between them, which on a line through that point is the same as the level fold).
  s = ±1 sends m to 1/m about the pin: "swap rise and run".
- **Collateral.** Keeps the pin and, for s = 0, |m|. Destroys about as much as a turn (§3.3).
- **Price.** which + steps(x0) + rat(s). **Inverse:** itself (a reflection undoes itself), the same fee.

### 2.3 Reflection in any line, paying for the mirror **P `mirror.any`**

- **A kid sees** a mirror line drawn anywhere on the plane, and the line's reflection in it. `cart.mirror` is the
  special case of the axes and y = x.
- **Numbers.** The mirror M = (a′, b′, c′); the reflection p ↦ p − 2·(a′px + b′py + c′)/(a′² + b′²)·(a′, b′).
- **Price: the mirror is paid from scratch.** which + φ(M), the mirror's read length in the line's own number code (the
  owner: "expensive to introduce a line with lots of information in it from scratch"). The x-axis costs φ = 6.1 bits;
  y = x costs 9.2; y = 2x + 3 costs 14.8; y = 7x + 11 costs 21.3. So a fold in a simple mirror is a shortcut and a fold in a rich one is
  a dear one. (A variant could also allow "the mirror is another object's line", priced as a reference to that object,
  which entangles objects; that breaks "every object is an independent universe", so it is not proposed.)
- **Inverse:** itself, the same fee. **Collateral:** keeps nothing in general (§3.3: it keeps any one number in 0–13%
  of calls). **Measured:** cheapest routes almost never use it (0% of acts): a mirror rich enough to help costs more
  than the path. It is the price working as the owner asked.

### 2.4 A slanted grid: shear the plane **P `basis.lean`** (and the existing `si.tilt` seen anew)

- **A kid sees** graph paper whose rows are pushed sideways (italic graph paper). The line keeps where it crosses the
  x-axis and leans: for every 1 up it goes s further sideways.
- **Numbers.** The run per unit rise, 1/m; the x-intercept. x ↦ x + s·y sends (a, b, c) to (a, b + a·s, c):
  1/m′ = 1/m − s.
- **The twin it reveals.** `si.tilt` is the other shear, y ↦ y + k·x: it keeps the y-intercept and adds to the rise per
  run. Together tilt and lean generate the **modular group** acting on the gradient (every Möbius map m ↦ (αm + β)/(γm + δ)
  with whole α, β, γ, δ and αδ − βγ = 1): the gradient already lives in a rich group, and the engine offers only half of
  its generators.
- **Collateral.** Keeps the x-intercept (100%), everything else moves. Where tilt is gentle (shallow lines), lean is
  violent, and the reverse: the same "change the steepness" goal has two cheap moves with opposite collateral.
- **Price.** It adds an amount to a coordinate (the run per rise), so it is priced by size: rate(o)·|s|, like tilt.
  **Inverse:** lean by −s, the same fee.
- **Measured:** the most-used move of all on cheapest routes (17% of acts) and +13% reach within 30 ⚡.

### 2.5 Zoom about the origin **P `basis.zoom`** (and the axis units)

- **A kid sees** the picture scaled from the origin: the triangle with the axes grows or shrinks, the slope stays.
- **Numbers.** Both intercepts × f, the distance × f, the triangle's area × f², the gradient unchanged:
  (a, b, c) ↦ (a, b, c·f).
- **Its family.** `mach.stretch` is the y-axis unit change (m and c × f, x-intercept kept). Zoom ∘ stretch⁻¹ is the
  x-axis unit change (m ÷ f, c kept). So "a different unit on each axis" is two factor moves, and the variant can offer
  any two of the three.
- **Price.** By digits: factor code on f, like a stretch. **Inverse:** zoom by 1/f, the same fee.
- **Collateral.** Keeps the gradient and the shape of the intercept triangle; destroys any rule on the size or primality
  of an intercept (50% on Prime Landing's bits) and leaves Prime Gradient alone (0%).

### 2.6 The normal form: distance from the origin and direction **P `orbit.turn`**

- **A kid sees** the line as a lighthouse beam's edge a fixed distance from the lighthouse at the origin; turning the
  lighthouse moves the line round a circle, keeping its distance.
- **Numbers.** distance² = c²/(a² + b²), the direction of the normal (a, b). The direction is a rational point on the
  unit circle only when a² + b² is a square: then (a, b, √(a² + b²)) is a Pythagorean triple.
- **The fact.** Turning about a point *off* the line keeps the line rational only for **Pythagorean angles**
  (cos θ, sin θ) = ((u² − v²)/(u² + v²), 2uv/(u² + v²)) and quarter turns. So this lens has a discrete set of cheap
  turns, ordered by the size of the triple: 3-4-5, 5-12-13, 8-15-17, …
- **Collateral.** Keeps the distance (100%) and, mostly, the triangle's area (83%: a quarter turn swaps the intercepts);
  destroys rules on the gradient or the intercepts (92% of Prime Gradient's improving-call collateral).
- **Price.** which + 2 bits (quarter or Pythagorean; which way) + gamma(u) + gamma(v). **Inverse:** the same angle the
  other way, the same fee.
- The other normal-form move, "push the line straight out", is `gen.nudge` on c (the engine has it).

### 2.7 The reciprocal chart: swap the gradient and the y-intercept **P `coef.swap`**

- **A kid sees** y = mx + c become y = cx + m: "swap the two numbers". y = 2x + 5 becomes y = 5x + 2.
- **What it is.** Swapping a and c in ax + by + c = 0 is the projective map (x, y) ↦ (1/x, y/x) of the plane: the
  **reciprocal lens**. A line and its swap always cross at x = 1 (both give y = m + c there), so the swap keeps y(1)
  and keeps a + b + c (the `gen` lens's `sum`). The other transposition, b ↔ c, sends the y-intercept to its
  reciprocal and the x-intercept to 1/m: y = 3 becomes y = 1/3 in one 1-bit choice. (a ↔ b is `cart.mirror`'s y = x.)
- **Collateral.** Keeps y(1) (51% of calls: all the a ↔ c ones) and a + b + c (74%); destroys almost everything that
  reads m or c alone (97% of Prime Staircase's bits when another rule climbs by a swap).
- **Price.** A choice: which + 1 bit. **Inverse:** itself, the same fee.
- **Measured:** the strongest new shortcut. Offered alone beside the nine it gives the largest gains (14% of pairs
  ≥ 1.25× cheaper than with the nine; up to 4.2×: y = −4 to y = −1/4 for 7 ⚡ instead of 27) and +41% reach within
  30 ⚡.

### 2.8 The fraction tree: the gradient's Stern–Brocot position **P `sb.step`**

- **A kid sees** the fraction tree (1/1 at the top; each fraction's children are the "kid fractions" made by adding
  tops and bottoms of its neighbours: 1/2 and 2/1, then 1/3, 2/3, 3/2, 3/1, …). The gradient is a path of left and
  right turns down the tree; its continued fraction counts the turns.
- **Numbers.** The continued fraction [a0; a1, …, an], the depth a0 + … + an, the parent and the two children, the Farey
  neighbours (fractions p′/q′ with |pq′ − p′q| = 1).
- **Moves.** Up to the parent, down to either child, keeping the y-intercept: choice of 3. For a whole gradient a
  child is m + 1, so it contains half of tilt; for a fraction it is the smallest change of gradient in the tree's sense.
- **Collateral.** The gentlest move measured: keeps the y-intercept and destroys the fewest bits of other rules (6%
  mean). It is a narrow move: few calls improve anything (7,809 against tilt's 102,805).
- **Price.** which + log2 3. **Inverse:** up undoes down and down undoes up; all three cost the same, so the potential is
  exact. Refused for flat and vertical lines (no position in the tree) and above 1/1.

### 2.9 The dual point and the pole **P `pole.slide`**

- **A kid sees** (as a secondary, for older players) the line's "shadow point": the pole of the line in the unit
  circle, the point (−a/c, −b/c). A line close to the origin has a far-away pole; a line far away has its pole near the
  origin, on the perpendicular from O, at distance 1/(the line's distance).
- **Numbers.** The pole; the distance's reciprocal; the classical dual point (m, −c) (the pole in the parabola
  y = x²/2), on which `si.shift` and `si.tilt` are the two axis moves, and **`cart.pivot` is a slide of the dual point
  along a line** (the lines through a fixed pin form a line of the dual plane).
- **Moves.** Slide the pole by (u, v): (a, b, c) ↦ (a − u·c, b − v·c, c). With unit steps these are the four
  Euclid moves "add c to a or b" that the engine lacks: the other eight ("add a to b" and so on) are tilt ±1, lean ±1
  and slides ±1. So pole steps complete the generators of every whole-number change of chart of the triple.
- **Terrain that depends on place.** A unit pole step barely moves a line near the origin and swings a far line wildly.
  The same move is gentle in one region and violent in another, which is the kind of cost topology the owner asked for
  (decision 25).
- **Price.** It adds an amount to the pole, so it is priced by size, like `cart.slide` (displacement code).
  **Inverse:** (−u, −v), the same fee. Refused for lines through the origin (no pole).

### 2.10 Lenses considered and folded into others (not measured as separate mutators)

| Lens | A kid sees | Its natural move | Verdict |
|---|---|---|---|
| Two-point form on lattice points | two pegs the line passes through | hop one peg, keep the other | a pivot about a lattice point; offer as `cart.pivot` with a peg as the anchor (an anchor priced as a peg's position) |
| Parametric form: a point and a direction vector | a start and an arrow | add to the arrow's run or rise, keeping the start | a pivot (rise) or a lean about the point (run); suggests a lean with an anchor, like the pivot's x0 |
| Function table (values at 0, 1, 2) | the table | change one entry keeping another; swap two entries | change-one-keep-another is a pivot about a whole x0 (`seq.step` keeps y(1)); swap is `rot.fold` with s = 0 |
| Composition: f ∘ g and g ∘ f with a machine g = (×k, +d) | two machines in a row | compose with g, paying for g | spans shift, horizontal slide, the two stretches; nothing new; pricing must charge g and g⁻¹ the same (e.g. max of their codes) for the potential |
| Inversion x ↦ 1/x | the reciprocal of each point | — | sends lines to hyperbolas, so it is not a line move; its projective cousin is `coef.swap` |
| Reflection in y = −x | | | `cart.mirror` diagonal then origin: two existing calls |
| Möbius maps of the gradient | | m ↦ (αm + β)/(γm + δ) | tilt, lean, turn and the fraction tree are its pieces; offering the whole group as one mutator would price a matrix by its digits, too abstract for a kid and redundant with its generators |
| ax + by = c with gcd structure | coins, pegs | change a, b or c | `gen.nudge` (have); the gcd and the number of lattice points are rule material (§4), not a new move |

---

## 3. Measurements

### 3.0 Method and its limits

- **Model.** Every fraction line with |a|, |b|, |c| ≤ 16 (14,688 lines; the engine's box is 10^6) is a node; every call
  of every mutator up to small arguments is an edge (4.75 million cheapest edges). The nine existing mutators are
  re-implemented on plain numbers and checked against the engine: 9,356 cheapest (line, mutator, result) fees compared
  with the engine's own argument enumeration and `applyPriced`, **0 differ**. Every edge of every mutator (existing and
  proposed) has a reverse edge of the same mutator and fee: **0 of 4,753,436 lack one** (the exact potential).
- **Prices.** W = which (log2 N: 9, 10 or 18 mutators) + choices + size code + surcharge, as spec §5.2 and §12.4;
  charge W + 0.05·W² per act, one call per act (the cheapest way to make a route).
- **Limits.** The box is small: 120 ⚡ reaches every line in it from anywhere, and the three-rule optimum sits on its
  edge (landscape-analysis.md: on lines, the optimum is wherever the window ends). So read the budgets of 30 and 60 ⚡
  and the ratios, not the absolute best. Arguments are enumerated to small sizes (an amount's size ≤ 6, a factor's
  numerator and denominator ≤ 8, the anchor x0 among 13 values, mirrors of at most 16 bits): a route that needs a bigger
  single call is missed, which can only make every set look slightly dearer. Collateral uses each beginner family with
  its first dealt tie-breaker on line-q, valued by the committed value functions.

### 3.1 Cost topology: how much cheaper the best route is

Route cost from 30 newborn lines to 40 targets (half newborn, half lines of 18–30 bits). "Gain" is one route cost over
another, per pair.

| Mutator set | Median route ⚡ | Gain over additive-only: median | p90 | ≥ 1.5× | Gain over the nine: median | p90 | ≥ 1.25× | Lines within 30 ⚡ | 60 ⚡ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| additive only (unit-path baseline) | 51 | 1.00 | 1.00 | 0% | 0.85 | 1.00 | 0% | 286 | 7,770 |
| **the existing nine** | 42 | 1.17 | 1.59 | 14% | 1.00 | 1.00 | 0% | 711 | 11,490 |
| nine + rot.turn | 43 | 1.15 | 1.56 | 12% | 0.97 | 1.01 | 0% | 661 | 11,080 |
| nine + rot.fold | 43 | 1.14 | 1.55 | 12% | 0.97 | 0.98 | 1% | 622 | 10,951 |
| nine + mirror.any | 43 | 1.14 | 1.55 | 12% | 0.97 | 0.98 | 0% | 617 | 10,912 |
| nine + basis.lean | 42 | 1.21 | 1.62 | 16% | 1.00 | 1.12 | 1% | 802 | 12,587 |
| nine + basis.zoom | 42 | 1.17 | 1.61 | 15% | 0.97 | 1.07 | 3% | 697 | 11,299 |
| nine + pole.slide | 41 | 1.21 | 1.67 | 18% | 0.99 | 1.16 | 5% | 814 | 12,541 |
| nine + sb.step | 43 | 1.16 | 1.56 | 12% | 0.97 | 1.04 | 0% | 665 | 11,289 |
| **nine + coef.swap** | **38** | **1.26** | **1.93** | **27%** | 1.01 | **1.39** | **14%** | **1,003** | 12,411 |
| nine + orbit.turn | 43 | 1.16 | 1.59 | 13% | 0.97 | 1.01 | 1% | 678 | 11,182 |
| all eighteen | 40 | 1.23 | 1.84 | 23% | 1.01 | 1.32 | 13% | 799 | 11,894 |

- The nine already have real shortcuts (median 1.17× over the unit path, 14% of pairs ≥ 1.5×: mirrors and stretches).
- **A tenth mutator that the route does not use makes the route dearer** (gain 0.97): "which" rose from log2 9 to
  log2 10 on every act. With all eighteen it rises by a whole bit. Only three proposals pay for their slot on random
  routes: **coef.swap** (by far), **pole.slide** and **basis.lean**.
- The largest single shortcuts, all eighteen against the nine: y = −4 → y = −1/4 for 7 ⚡ instead of 27 (coef.swap b ↔ c),
  x = 10 → y = 9x for 20 instead of 54, y = −8 → y = −8x − 1 for 18 instead of 43 (both via swaps).
- Acts on the cheapest routes with all eighteen offered: basis.lean 17%, coef.swap 12%, seq.step 11%, pole.slide 9%,
  si.shift 9%, si.tilt 8%, mach.stretch 8%, basis.zoom 7%, sb.step 4%, the rest 3% or less; mirror.any and rot.fold 0%.
- A state's description length is a floor no lens can break: the surcharges along any route add up to at least
  φ(target) − φ(start), and a line worth b bits to a rule has φ ≳ b. So shortcuts never make a rare line cheap to reach;
  they remove handling overhead above that floor and change which lines are neighbours.

### 3.2 The owner's example: keep a point, change the gradient

A newborn line, a pin on it at x = x0, a wanted gradient m′ (another newborn's). A pivot and a turn end on the same line,
so only their fees differ. Over 1,494 cases: **one turn is cheaper than the pivot route in 90%**, by a median **3.6×**
(p10 0.93×; the pivot route here is an upper bound: whole part in unit acts, fraction in one act). Examples:
y = 13x − 2 to a flat line about x = −½: pivot 228 ⚡, turn 41 ⚡; y = 15/4·x − 1/4 to flat about x = 4: 401 against 57.
So an agent that cares about the gradient and a pin will turn, and a turn moves the y-intercept far more than a tilt
does (it keeps the y-intercept in 13% of calls; tilt in 100%): the owner's collateral damage, measured.

### 3.3 Collateral damage

For every line and every local call (W ≤ 30) that raises some rule i's bits, each other rule j that held at least 2 bits
there: the share of those calls that destroy at least half of j's bits. Columns are the rule that suffers.

| Mutator | PL | SA | WC | DL | T | SOBR | PG | PS | R | EC | PA | Mean destroy |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| si.shift | 35% | 4% | 54% | 22% | 7% | 33% | **0%** | 81% | 13% | 3% | 5% | 13% |
| si.tilt | **0%** | 3% | 80% | 29% | 29% | 25% | 36% | **1%** | 11% | 39% | 5% | 18% |
| seq.step | 30% | 7% | 81% | 18% | 10% | 28% | 29% | 81% | 16% | 28% | 9% | 19% |
| cart.pivot | 28% | 6% | 81% | 27% | 24% | 35% | 29% | 64% | 16% | 31% | 9% | 21% |
| cart.slide | 44% | 4% | 58% | 44% | 9% | 43% | **0%** | 90% | 13% | 4% | 6% | 16% |
| cart.mirror | 55% | **0%** | 22% | 37% | 55% | 42% | 58% | 70% | **0%** | 59% | **0%** | 25% |
| gen.nudge | 4% | 2% | 41% | 48% | **1%** | 8% | 3% | 60% | 7% | 6% | 3% | 7% |
| int.move | 19% | 2% | 31% | 49% | 36% | 30% | 38% | 50% | 6% | 39% | 1% | 19% |
| mach.stretch | 52% | 1% | **0%** | 55% | 48% | 33% | 53% | 96% | 8% | 53% | 3% | 26% |
| *rot.turn* | 37% | 13% | 79% | 53% | 40% | 49% | 55% | 77% | 28% | 58% | 18% | 36% |
| *rot.fold* | 39% | 7% | 52% | 50% | 52% | 47% | 76% | 76% | 18% | 76% | 10% | 35% |
| *mirror.any* | 50% | 5% | 67% | 54% | 60% | 51% | 69% | 92% | 14% | 70% | 7% | 35% |
| *basis.lean* | 36% | 1% | **0%** | 67% | 34% | 26% | 36% | 97% | 9% | 37% | 3% | 20% |
| *basis.zoom* | 50% | 1% | 51% | 37% | 12% | 50% | **0%** | 90% | 10% | 4% | 3% | 16% |
| *pole.slide* | 24% | 4% | 68% | 62% | 33% | 29% | 37% | 79% | 9% | 39% | 5% | 22% |
| *sb.step* | **0%** | 2% | 60% | 24% | 2% | 4% | 8% | **1%** | 8% | 2% | 1% | 6% |
| *coef.swap* | 29% | 2% | 79% | 49% | 32% | 39% | 53% | 97% | 14% | 52% | 7% | 26% |
| *orbit.turn* | 47% | 1% | 81% | 76% | 78% | 48% | 92% | 95% | **1%** | 91% | **1%** | 37% |

PL prime-landing/big-prime; SA square-area/spf; WC whole-crossing/k-spf; DL divisibility-ladder/m-spf; T
treasure/prime-terms; SOBR same-on-both-rulers/steep; PG prime-gradient/prime; PS prime-staircase/first-prime; R
ruler/far; EC exact-change/big-piles; PA pythagorean-area/slanted-square. Italic rows are proposed.

What the matrix says:

- **Every rule has "keeper" mutators and "wrecker" mutators, and the proposals add both.** A keeper (bold 0–1%) is a
  move other gods can climb with without touching this rule: tilt and the fraction tree keep Prime Landing; stretch and
  lean keep Whole Crossing; shift, slide and zoom keep Prime Gradient; mirror and the orbit keep Ruler and the area
  rules. This is the political structure the owner asked for: pairs of rules are entangled through some lenses and
  independent through others, and which pairs depends on the menu.
- **The geometric turns and folds are the wreckers** (35–37% mean destroy, against 7–26% for the nine): they keep one
  point or one distance and move every coordinate number. They are what makes "caring only about my gradient and my pin"
  expensive for the neighbours.
- **The fraction tree is the gentlest move in the game** (6% mean): it keeps the y-intercept and nudges the gradient by
  the smallest step in the tree's sense; a cooperative tool.
- **Divisibility Ladder and Prime Staircase have no cheap keeper** among the proposals (DL's best keeper is seq.step
  at 18%, the best proposal sb.step at 24%; PS keeps only under tilt and the fraction tree). Rules that read a whole table of values are hard to protect, whatever the lens.

What each mutator leaves alone (share of local calls that keep the number unchanged; full table in the results file):
tilt and sb.step keep the y-intercept; shift, slide and zoom the gradient; stretch and lean the x-intercept; seq.step
y(1); mirror and orbit.turn the distance (and mostly the triangle's area); coef.swap keeps a + b + c (74%) and y(1) (51%).
No proposal keeps the pole.

### 3.4 Dynamics: do selfish climbers settle?

Three selfish climbers (Prime Landing, Treasure, Whole Crossing) share one line from each of 30 newborns, taking turns;
each takes the call that raises its own bits most per ⚡ (W ≤ 40) or passes. 300 turns.

| Mutator set | Runs reaching a fixed point | Distinct lines visited | Moves onto a line held before | Table total at the end | Bits each at the end |
|---|--:|--:|--:|--:|--:|
| additive only | 0% | 11.8 | 96% | 224 | 5.5, 5.3, 7.1 |
| the nine | 0% | 10.2 | 96% | 277 | 6.8, 4.7, 8.5 |
| all eighteen | 0% | 14.6 | 94% | 119 | 2.8, 1.8, **10.0** |

- **No set settles.** Selfish climbers fall into a tug of war in every run, cycling through 10–15 lines. More lenses
  widen the cycle (14.6 lines) but do not stop it: a richer menu keeps the object moving, which is wanted, and makes
  selfish play far more destructive (the table total halves), which rewards the negotiation the owner wants players to do.
- **A menu can hand one god the table.** With all eighteen, Whole Crossing ends with 10.0 bits and the others with
  2–3: lean and stretch keep its x-intercept, so it climbs on moves that wreck the others. A lens that keeps one rule's
  number is that rule's private highway. A variant's menu must be checked against its pool for this (§5).
- This is selfish play only; the cooperative climbs and the collapse check of landscape-analysis.md §4 have not been run
  on the proposed menus.

---

## 4. Rule families the lenses inspire

Proposals for the rule-design session (sent to it on 14 November). Each primary is meant for a twelve-year-old on a
linear-equations course; secondaries may be advanced. Every layer is graded (decision 13). None is built or valued; on
line-q they would be valued by direct draws (spec §7.0). The design aim, from landscape-analysis.md: value from
coincidences between several numbers, not one number's size, and a per-game dealt twist where possible, so no answer
carries over. For each: the lens's own mutator (the "keeper" that climbs it cheaply) and what it entangles with.

**Every secondary ties to the primary** (the owner, relayed by the coordinator on 14 November: "Secondary rules should tie
to the primary in some way even if they invoke an extra dimension of the object. For example, a primary that seeks
proximity to integers in the y intercept could have a secondary that seeks to maximise the largest common factor of that
closest integer with the floor of the gradient. That's better than a secondary that just independently wants the
gradient to be close to a large prime."). So each secondary below is a relation between the primary's **anchor** (the
whole number, peg or point the primary measures closeness to) and a number from another lens, never an independent wish.

1. **Turnstile** (the angle lens). *Primary:* "Give your line a quarter turn about the point where it crosses the
   y-axis. The turned line crosses the x-axis at c × m. Make c × m as close as possible to a whole number." *Secondaries:*
   (a) the greatest common factor of that whole number and ⌊c⌋, the bigger the better; (b) the greatest common factor of
   that whole number and ⌊m⌋, the bigger the better. *Entangles:* m and c in a product, so Prime Landing (c), Prime Gradient (m) and
   Whole Crossing (−c/m) all pull on it. *Keeper:* coef.swap a ↔ c keeps m × c exactly (the swap's ally); zoom
   multiplies it by f.
   *Tensions:* its secondary (b) rewards a steep line (a big ⌊m⌋), which pulls Whole Crossing's x-intercept −c/m toward
   0, and Ruler's distance down with it. *Collateral carried by:* coef.swap (keeps m × c, wrecks Prime Staircase 97%),
   rot.turn (moves m × c and the y-intercept together).
2. **Whole Hypotenuse** (the normal form). *Primary:* "Draw the slope triangle of your gradient p/q: q along, p up.
   Make its sloping side, √(p² + q²), as close as possible to a whole number." (Pythagoras, school year 8–9.)
   *Secondaries:* (a) the y-intercept as close as possible to a multiple of that whole number; (b) the greatest common
   factor of that whole number and the nearest whole number to the y-intercept, the bigger the better. *Keeper:* orbit.turn by a Pythagorean
   angle and rot.turn by a Pythagorean tangent both keep a Pythagorean gradient Pythagorean and multiply the hypotenuse
   (Gaussian integers multiply): a multiplicative climb, not a ramp in one number. *Entangles:* Prime Gradient, Pell-like
   rules, Pythagorean Area.
   *Tensions:* hypotenuses are products of 4k + 1 primes, so the gradient's top and bottom grow together; that fights
   Prime Gradient (m near a prime: a whole gradient, q = 1, never has a whole hypotenuse) and Divisibility Ladder's small
   factors of m. *Collateral carried by:* orbit.turn and rot.turn (they keep its structure and wreck intercept rules:
   92% on Prime Gradient, 91% on Exact Change).
3. **Mirror Meeting** (the fold lens, with a dealt mirror). *Primary:* "The mirror is the line y = x + d (d dealt per
   game). Your line hits the mirror at one point. Make that point as close as possible to a peg (whole x and whole y)."
   The point is x = (d − c)/(m − 1). *Secondaries:* (a) the greatest common factor of the peg's
   x and ⌊m⌋, the bigger the better; (b) the peg's distance² from the origin as close as possible to a multiple of ⌊c⌋. *Keeper:* the fold in the dealt
   mirror keeps the meeting point and wrecks everyone else: a free move for this god that its neighbours must police.
   The dealt d means no answer carries over between games.
   *Tensions:* the meeting point x = (d − c)/(m − 1) wants c near d and m away from 1, against Prime Landing's big
   prime c and Whole Crossing's c a multiple of m. *Collateral carried by:* the fold in the dealt mirror (its free move)
   and mirror.any in general (35% mean destroy).
4. **Swap Twins** (the reciprocal chart). *Primary:* "Your line y = mx + c and its swap y = cx + m always cross at
   x = 1. Together with the y-axis they make a thin triangle with corners (0, c), (0, m) and (1, m + c). Make its area,
   |m − c| ÷ 2, as close as possible to a whole number." *Secondaries:* (a) the greatest common factor of the whole
   area and ⌊m + c⌋ (the crossing height), the bigger the better; (b) ⌊c⌋ as close as possible to a multiple of the whole
   area. *Keeper:* coef.swap keeps the area
   and the crossing exactly; it is this god's own move, and it wrecks Prime Staircase (97%).
   *Tensions:* a whole area wants m and c a whole even step apart, against rules that want m and c to share factors
   (Whole Crossing's c a multiple of m) or c much bigger than m (Prime Landing). *Collateral carried by:* coef.swap.
5. **Slanted Graph Paper** (another basis, with a dealt slant). *Primary:* "On graph paper whose rows are each pushed s
   squares right (s dealt per game, e.g. ½), your line's gradient is m ÷ (1 − s·m). Make it as close as possible to a
   whole number." *Secondaries:* (a) the greatest common factor of that whole number and
   ⌊c ÷ (1 − s·m)⌋ (the slanted y-intercept), the bigger the better; (b) the slanted y-intercept as close as possible to a
   multiple of that whole number. *Keeper:* basis.lean by s′ changes the slant the line sees;
   tilt and lean together walk the modular group. *Entangles:* every gradient rule, through a dealt Möbius twist.
   *Tensions:* near m = 1/s the slanted numbers blow up, so it pushes m one way and Prime Gradient's whole gradients
   another, game by game. *Collateral carried by:* basis.lean (keeps the x-intercept, wrecks Prime Staircase 97%) and
   si.tilt.
6. **Family Tree** (the fraction tree; a secondary for existing families). "Tie-breaker: the y-intercept as close as
   possible, in the fraction tree, to the whole number or prime your main rule aims at (the fewest up-and-down steps)."
   For Prime Gradient (the anchor is the prime nearest m) or Whole Crossing (the whole number nearest the x-intercept). *Keeper:* sb.step. It couples m and c in a metric no school lens
   shows, and its own move is the gentlest in the game (6% destroy).
   *Tensions:* it pulls c toward m's anchor in the tree, so c stays small and simple, against Prime Landing's big prime
   c. *Collateral carried by:* sb.step (gentle) and si.tilt.
7. **Pole Star** (the dual point; second pool, advanced). *Primary:* "Make 1 ÷ (your line's distance from the origin)²,
   that is (a² + b²) ÷ c², as close as possible to a whole number." *Secondary:* the greatest common factor of that whole
   number and c² (the pole's denominator squared), the bigger the better: it ties the pole's grid to the primary's
   anchor. *Keeper:* pole.slide by whole steps keeps the pole on pegs; zoom moves the distance.
   *Entangles:* Ruler (the same distance, the other way up) — a natural rival pair, since Ruler wants the line far and
   Pole Star rewards particular near distances.
   *Tensions:* Ruler (the line far away) directly; any big-c rule, since a big c shrinks (a² + b²)/c². *Collateral carried
   by:* pole.slide and basis.zoom (zoom moves the distance and keeps the gradient).
8. **Small and Smooth** (zoom; a counterweight in the sense of owner decision 30, "rules that prefer small values and
   lots of prime factors instead of large primes"). *Primary:* "Make the area of your line's triangle with the axes as
   close as possible to a whole number." *Secondaries* (tied to that whole number): (a) the more prime factors it has
   for its size (prime factors counted with repeats, minus the number of its digits), the better; (b) the greatest common
   factor of it and ⌊c⌋, the bigger the better. *Tensions:* every "big prime" rule (Prime Landing, Prime Gradient):
   smooth small areas want small, composite intercepts. *Collateral carried by:* basis.zoom (multiplies the area by f²,
   its own climb, and wrecks Prime Landing 50%) and mach.stretch.

---

## 5. Ranking, and the first five to build

Criteria, in order: (1) the owner asked for it; (2) it adds collateral structure (a keeper for some rules, a wrecker for
others), which is the entanglement the owner wants; (3) it adds shortcuts that pay for their "which" slot; (4) a
twelve-year-old can see it; (5) it is exactly priced with an inverse of the same fee (all nine proposals are).

| Rank | Mutator | Lens | Why |
|--:|---|---|---|
| 1 | **rot.turn** | the angle | The owner's own example. One turn beats the pivot route in 90% of "keep the pin, change the gradient" cases (3.6× median); a wrecker (36%). Exact over the rationals for any rational tangent. |
| 2 | **coef.swap** | the reciprocal chart | The strongest shortcut (14% of routes ≥ 1.25× cheaper than with the nine, +41% lines within 30 ⚡); "swap m and c" is the most readable new move; keeps y(1) and a + b + c, so it is some rules' ally and others' wrecker. |
| 3 | **basis.lean** | the slanted grid | The tilt's missing twin (keeps the x-intercept); the most-used move on cheapest routes (17%); with tilt it generates the modular group on the gradient. |
| 4 | **basis.zoom** | zoom about the origin | Keeps the gradient and the triangle's shape (Prime Gradient's keeper, 0%); completes "a different unit on each axis" with mach.stretch; priced by digits. |
| 5 | **fold** (rot.fold and mirror.any as one mutator) | reflection | The owner's "flips around other lines", with the mirror paid from scratch. Alone it is rarely the cheapest route (0% of acts), so it is merged: one mutator whose argument is either a crease through a pin of the line (cheap) or any mirror line (paid by its read length). Includes "swap two table entries". |
| 6 | sb.step | the fraction tree | The gentlest move (6% destroy); a cooperative tool and a teaching lens. Narrow: few improving calls. |
| 7 | orbit.turn | the normal form | Keeper of distance and area (Ruler, Square Area, Pythagorean Area at 1%), wrecker of the rest; best merged into rot.turn as a second kind of centre (the origin, Pythagorean angles). |
| 8 | pole.slide | the dual point | Real shortcuts (+15% reach) and place-dependent terrain, but no school picture: for an advanced variant. |

**The first five to build:** `rot.turn` (with orbit.turn as its "about the origin" option), `coef.swap`,
`basis.lean`, `basis.zoom`, and `fold` (crease through a pin, or any mirror paid from scratch). That is fourteen
mutators: "which" rises from 3.17 to 3.81 bits on every call.

**Before building, two pricing questions for the spec lead** (they change prices, not values):

- **A weighted "which" code.** Every new mutator taxes every call by log2 N. A variant could give "which" a prefix code
  that is not uniform (e.g. half the mass to the six school moves): Kraft holds and a move and its inverse use the same
  mutator, so the potential stays exact. The beginner's unit shift would then not pay for lenses it never uses.
- **Inverse partners across mutators.** Every proposal here is its own inverse family. A future move whose inverse is a
  different mutator (compose with g, undone by composing with g⁻¹) must price g and g⁻¹ the same, e.g. by the larger of
  their two codes.

**Before dealing on a menu, one balance check** (for whoever builds it): run §3.3 and §3.4 for the variant's pool and
menu, and refuse a menu under which one rule's keepers leave another rule's bits wrecked and its own untouched (the
"private highway" of §3.4), or add the matching keeper for the losing rules.

---

## 6. What this does not settle

- **The box.** Measurements are on lines with |a|, |b|, |c| ≤ 16. Larger boxes would show more of the factor moves
  (stretch, zoom), whose shortcuts grow with size, and less of the edge effect in §3's "best within budget" figures
  (results file §2.2: there, all sets reach the box optimum, y = x + 13, by 120 ⚡).
- **Cooperative play and the collapse check.** §3.4 is selfish play only. Whether richer menus make high joint peaks
  easier to find for a cooperating table (landscape-analysis.md §4's five tests) has not been run; the potential floor
  (§3.1) bounds the cost of reaching a rare line from below whatever the menu, but not the search.
- **Two lines per object, grids.** Not touched. On grids the same three kinds of move exist (add to a cell; symmetries
  of the board; recolourings), and decision 25 already covers them.
- **The families of §4** are unmeasured proposals; the rule-design session owns them.
- **Nothing here is built.** Adding a mutator to a variant is a deploy (decision 7), with the potential test
  (`lib/v2-linear/test/potential.test.ts`) and an affordance entry (decision 16).
