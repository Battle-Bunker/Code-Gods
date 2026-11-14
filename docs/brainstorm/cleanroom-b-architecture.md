# Clean-room design B: views, grips and parts (14 November 2026)

A design for section 3D of `linear-equations-brief.md`, the general representation-elements architecture, made from
first principles as if the engine were started today. The only input was the brief; nothing else in the repository
was read. Sections 3A–3C are the worked example it has to serve.

The method was to start from the learner and the agent author: what a twelve-year-old sees and moves, what a short
agent program looks like in each representation, and what an AI assistant needs in order to explain a move. The data
model was worked out from those, not the other way round. The design has three ideas, and each can be put in one
sentence a child could follow:

1. **A view is a way of looking at the object. A grip is a way of holding it.** Views are pictures made of named
   **parts** (elements). Grips are coordinate systems: a few numbers that together pin the object down.
2. **A move changes one number of one grip and keeps the others still.** The engine has no hand-written mutators.
   Every grip gives you one move per number it holds, plus a few whole-object transforms (mirrors). "Change c, keep m"
   slides the line. "Change the x-intercept, keep the y-intercept" swings it. The same wish costs different amounts
   under different grips, and choosing the grip is the skill.
3. **Looking is free; acting costs exactly as many bits as the move surprises the game's random mutator.** One prior
   over moves sets every price and also drives the random perturbations used for scoring (3C). Changing view is free
   computation. Choosing a grip is priced only through the moves made with it.

Everything else follows from these three ideas: utilities built from a few annotated **shapes**, annotations bound
to parts rather than pixels, and one kernel that evaluates the data definitions everywhere.

Vocabulary used below, with the brief's words in brackets: *type* (object type), *state*, *view* (representation),
*part* (element), *grip* (chart, the coordinates a move changes), *move* (mutation; a mutator is a grip coordinate or
a transform), *shape* (utility building block), *rule family*, *mark* (annotation primitive), *prior*, *cost*,
*value*.

---

## 0. The identity decision, made first

Everything else depends on what "the same object" means, so it is settled here.

**The object is the line, not the written equation.** The state is the primitive integer triple `(a, b, c)` with
`a·y + b·x + c = 0` (the owner's general form), `gcd(|a|,|b|,|c|) = 1`, and sign fixed by `a > 0`, or `a = 0` and
`b > 0`. Every line with rational coefficients has exactly one state, vertical and horizontal lines included. A state
fits in three small integers.

Consequences:

- Every view is an honest function of the state. "Multiply both sides by 2" is not a move, because it changes
  nothing. Rules about the written form, such as "the coefficients add up to zero", use the canonical writing, and
  the general view says so in words ("in lowest terms").
- Different views give different numbers the same letter: `c` in `y = mx + c` is not `c` in `ay + bx + c = 0`. Parts
  are always named by view (`equation.c`, `general.c`), and the clash becomes a teaching moment instead of a bug.
- Number domain: the state is integers, so slopes and intercepts are exact rationals. Fractions are first-class and,
  through the cost code (§6), naturally expensive. Juniors learn that "nice" numbers are cheap. There is a safety cap
  of `|a|,|b|,|c| ≤ 10^9`; a move that would cross it is invalid.
- Degenerate lines are ordinary states. A part that does not exist for a state (the x-intercept of `y = 3`) has the
  value **Absent(reason)**, and the reason is a sentence ("a flat line never reaches the x-axis"). Absent propagates
  through expressions. A rule whose score needs an Absent part scores **WORST**, the bottom of every order.

---

## 1. Five agent programs (and a sixth that wins by switching), and the API they imply

The programs below are written as a junior would write them, or as an AI assistant would write them for a junior and
then explain. Each runs once per offer. It receives the object, the player's own rule and their purse, and it
returns a move, a list of moves, or `None`. Agents are **pure functions that return a plan**; they do not call
"commit" mid-computation. That keeps them deterministic, replayable and easy to explain.

All costs below are worked out exactly with the cost code in §6. Every move carries a fixed overhead of
`log2 6 ≈ 2.6` bits for naming the grip (there are five grips plus the transform set) and `log2(number of coordinates)`
bits for naming the coordinate, plus bits for how far it moved.

### P1. Equation view: "gradient as close to a prime as possible"

```python
def turn(obj, rule, purse):
    eq = obj.view("equation")                 # y = m x + c
    if eq is None:                            # vertical line: no gradient
        return obj.view("general").change("a", to=1)   # tip it over (cheap, any a≠0 works)
    goal = nearest_prime(eq.m)
    if goal == eq.m:
        return None                           # already perfect: doing nothing is free
    return eq.change("m", to=goal)            # keeps c: the line swings about where it crosses the y-axis
```

For `y = 7/3·x + 1` the goal is 2 and the move is `m: 7/3 → 2`, δ = −1/3, costing 2.6 + 1 + 5 = **8.6 bits**.

### P2. Intercepts view: "area of the triangle with the origin as close to A as possible"

```python
def turn(obj, rule, purse):
    ix = obj.view("intercepts")               # x/p + y/q = 1
    if ix is None:
        return None                           # through the origin, flat or vertical: no triangle to work with
    A = rule.param("A")
    tries = [ix.change("p", to=sign(ix.p) * 2 * A / abs(ix.q)),   # keep q, stretch along x
             ix.change("q", to=sign(ix.q) * 2 * A / abs(ix.p))]   # keep p, stretch along y
    return min(tries, key=lambda mv: mv.cost)
```

With A = 12 and `x/4 + y/3 = 1` (area 6), stretching `p` to 8 costs 10.6 bits and stretching `q` to 6 costs
**8.6 bits**. The program learns to stretch the shorter side, because the smaller number moves by less.

### P3. General view: "the three numbers of a·y + b·x + c = 0 add up to zero"

```python
def turn(obj, rule, purse):
    g = obj.view("general")                   # a y + b x + c = 0, lowest terms
    if g.sum == 0:
        return None
    return g.change("c", to=-(g.a + g.b))     # keeps a and b: the line slides without turning
```

`3y − 5x + 4 = 0` becomes `3y − 5x + 2 = 0` (δc = −2, 2.6 + 1.6 + 5 = **9.2 bits**). The rule's annotation (§2)
then shows the junior why this is the same as "the line passes through (1, 1)".

### P4. Growth-pattern view: "pattern number 10 has exactly N tiles, with a whole-number step"

```python
def turn(obj, rule, purse):
    pat = obj.view("growth")                  # start tiles, then add `step` tiles each time
    N = rule.param("N")
    if pat.term(10) == N:
        return None
    by_start = pat.change("start", to=N - 10 * pat.step)
    by_step  = pat.change("step",  to=(N - pat.start) / 10)
    good = [mv for mv in (by_start, by_step) if rule.score(mv.after) > rule.score(obj)]
    return min(good, key=lambda mv: mv.cost, default=None)
```

With start 4, step 3 and N = 40: changing the step to 3.6 would hit 40, but it fails the whole-number tier, so the
better score wins and the program changes the start to 10 (**10.6 bits**). The growth view moves through the same
grip as `y = mx + c` (start = c, step = m) dressed in tiles. A junior who meets "start" and "step" here will later
recognise them as c and m.

### P5. Plane view with handles: "make y(k) equal x(q)"

```python
def turn(obj, rule, purse):
    k, q = rule.param("k"), rule.param("q")
    pic = obj.view("plane", handles=[at_x(k), at_y(q)])  # two dots on the line you can drag
    if pic is None:
        return None                           # flat or vertical: one of the dots doesn't exist
    A, B = pic.handle(0), pic.handle(1)       # A = (k, y(k)),  B = (x(q), q)
    return pic.change("d0", to=B.x)           # hold B still, drag A to height x(q): pivot about B
```

This is the move a twelve-year-old discovers with a finger on the screen: "hold the dot at height 3, swing the line
until the dot above x = 2 is at height x(3)". It always works in one move and needs no algebra. For `y = 2x + 1`,
k = 2, q = 3: A = (2, 5), B = (1, 3). Dragging A to (2, 1) gives `y = −2x + 5`, where y(2) = 1 and x(3) = 1. The cost is
2.6 + 12 (naming the two handle anchors) + 1 + 7 = **22.6 bits**. It is correct, but P6 shows it is not cheap.

### P6. The lens shopper: wins by switching grip

```python
def turn(obj, rule, purse):
    best = None
    for name in obj.views():                  # every way of holding the line that applies to this state
        v = obj.view(name)
        for coord in v.coords:
            for mv in v.solve(coord, rule):   # one-number changes that make the rule's shape exactly right
                if best is None or mv.cost < best.cost:
                    best = mv
    return best
```

`solve` (§1.2) finds every exact rational value of one coordinate, other coordinates held, that brings the rule's
first shape to its optimum. Here is the shopper on two rules.

**x-intercept nearest a prime**, state `y = −3/5·x + 6` (x-intercept 10, goal 11):

| grip · coordinate | the motion | change | bits |
|---|---|---|---|
| equation · m | swing about (0, 6) | −3/5 → −6/11 (δ = 3/55) | 18.6 |
| equation · c | slide up | 6 → 33/5 (δ = 3/5) | 12.6 |
| general · c | slide | −30 → −33 | 9.2 |
| general · b | swing about (0, 6) | needs b = 30/11, not whole | none |
| **intercepts · p** | **swing about (0, 6)** | **10 → 11** | **6.6** |

The swing is the same motion in the first and last rows, with a threefold difference in price. In the intercepts
grip the number that changes is the one the rule cares about.

**y(k) = x(q)**, the state from P5:

| grip · coordinate | change | bits |
|---|---|---|
| plane handles · d0 (P5's pivot) | 5 → 1 | 22.6 |
| equation · c | 1 → −5/3 | 14.6 |
| equation · m | 2m² + m − 2 = 0 has no rational root | none |
| **intercepts · q** | **1 → 1/2** (10q² + q − 3 = 0, discriminant 121) | **8.6** |

The cheapest move is `y = x + ½`, where y(2) = 5/2 = x(3). No junior would find it by staring at `y = 2x + 1`, but an
agent that holds the line every way it knows finds it in microseconds. That is the skill ceiling the owner described:
"rotating between lenses to find lower cost paths".

### 1.1 The agent-facing API these programs imply

The same API exists in Python and TypeScript (TypeScript uses camelCase). All values are exact: Python `Fraction`, and
a `Q` class in TypeScript. An Absent part reads as `None` / `null`, and `obj.why_absent("plane.x_intercept")` gives the
reason.

| Call | Returns | Cost |
|---|---|---|
| `obj.views()` | names of views that apply to this state | free |
| `obj.view(name, **params)` | a View, or `None` if the state is outside its grip's domain | free |
| `view.<part>` / `view.part("name", *args)` | an exact value, a Point, or `None` | free |
| `view.term(n)`, `view.at_x(k)`, … | parametric parts | free |
| `view.coords` | the coordinate names of the grip this view moves through | free |
| `view.change(coord, to=v)` / `by=δ` | a Move (not yet done) | free to build |
| `view.solve(coord, rule)` | exact Moves that zero the rule's first shape, possibly none | free |
| `obj.transform(name)` | a Move (mirror in an axis, swap x and y) | free to build |
| `move.cost` | bits as an exact rational (log terms as fixed-point) | free |
| `move.receipt` | itemised bits: grip, coordinate, parameters, distance | free |
| `move.after` | the imagined object after the move | free |
| `move.why` | one sentence, e.g. "keeps p: the line swings about (0, 6)" | free |
| `move.then(other)` | a two-step plan | free |
| `rule.score(obj)` | the score tuple (WORST if Absent) | free |
| `rule.param(name)`, `rule.views` | the parameters; the primary view first | free |
| `rule.explain(obj)` | the annotation as words and marks | free |
| `purse.energy`, `purse.price(bits)` | what you can afford | free |
| *return value of `turn`* | Move, list of Moves, or `None` | **the only thing paid for** |

What the AI assistant needs in order to explain is exactly what the declarations below hold: each part's one-line
`say`, the dependency graph (which parts a rule reads), each grip coordinate's `motion` sentence, the itemised receipt
of each move, and the reasons for Absent values. An assistant can be handed one JSON "sheet" per object holding all of
this, and it covers everything a junior will ask.

### 1.2 `solve` without a computer algebra system

The kernel does not do symbolic algebra. `solve(coord, rule)` handles the shapes `near`/`match` (§3.6). It evaluates
the shape's signed gap `F(t)` (for example `x_intercept − 11`) as a function of the one free coordinate `t` at seven
exact rational points, fits a rational function of degree at most 2 over 2 by exact interpolation, verifies the fit at
two further points, and returns the rational roots of the numerator (a quadratic has rational roots exactly when its
discriminant is a perfect square). If the fit fails it returns nothing. Every part of a line is a rational function of
low degree in any one coordinate, so this is complete for the linear-equation type. It is also cheap and
deterministic. Solving is not where the skill lies when frontier AI is available; choosing what to hold still is.

---

## 2. Storyboards, and what views and annotations must declare

Card sizes: the compact card is about 180×110 px (goal card and object list). The expanded view uses the full width.

### Rule R1: "y-intercept close to a prime". State `2y − x − 11 = 0`, i.e. `y = ½x + 5½`

**Compact card** (primary view: plane)
- The plane is cropped to a tall strip around the y-axis, framing y from 2 to 8 so that the intercept and the
  nearest primes on each side fit. The line enters from the left and leaves at the right edge.
- Primes on the y-axis appear as small gold diamonds at 3, 5 and 7, with labels. Composite whole numbers get plain
  ticks only.
- The intercept is a hollow ring at (0, 5½).
- Two thin measured gaps run up the axis from the ring: "½" down to 5 and "1½" up to 7. The nearer one is solid and
  the other faint.
- A dashed ghost line shows the cheapest improving move: the same line slid down by ½.
- One line of words: "5½ — ½ from the prime 5 · 7.2 bits to fix".

**Expanded view**, three columns side by side:
1. **Plane** (primary): the full grid with everything on the card, plus primes out to 11 and 2, the x-intercept
   greyed (not used), and the ghost's receipt on hover.
2. **Equation**: `y = ½x + 11/2`, with `11/2` in the same ring colour as the intercept, because `equation.c` is
   declared to be the same part as `plane.y_intercept`. Under it is a small number line around 11/2 with the same
   primes and gaps (the same `near` mark drawn on a different anchor).
3. **Growth**: "start with 5½ tiles, add ½ each time". The start column is ring-coloured and shows a half tile.
   This is where a junior sees that the y-intercept is the starting amount.

Under the columns is the score strip, "distance ½ (best possible 0) · tier: gradient whole? ✗", and a receipt list of
the three cheapest fixes. *general · c −11 → −10 (7.2 bits)* is cheaper than *equation · c 11/2 → 5 (8.6 bits)*, and
both make the same slide.

### Rule R2: "make y(k) equal x(q)", with k = 2, q = 3. State `y = 2x + 1`

**Compact card** (primary view: plane)
- A dashed vertical guide at x = 2 meets the line at dot A, labelled "y(2) = 5". A dashed horizontal guide at y = 3
  meets the line at dot B, labelled "x(3) = 1".
- **The key picture:** the comparison is between a height and a width, so the card mirrors B's width onto the y-axis
  through a faint diagonal y = x. Both numbers then sit on the same axis: a mark at 5 (from A) and a mark at 1 (from
  B, drawn hollow), with a measured gap "4" between them.
- One line of words: "y(2) = 5, x(3) = 1 — 4 apart".

**Expanded view**
1. **Plane**: everything on the card. The ghost is the cheapest fix, `y = x + ½`, and the hover receipt reads
   "intercepts · q 1 → ½, 8.6 bits; the line swings about (−½, 0)".
2. **Table** (parameterised by the rule: rows x = 0…4): the row x = 2 is highlighted with y = 5. A second,
   *reverse-lookup* row shows "y = 3 ← x = 1", which is the junior's first contact with an inverse.
3. **Equation**: the substitutions written out, "y(2) = 2·2 + 1 = 5" and "3 = 2x + 1 ⇒ x = 1". Each number is
   coloured like its mark on the plane.

If the line is horizontal, B is Absent: the card shows the horizontal guide with no meeting point and the words "a
flat line never reaches height 3 — worst score".

### Rule R3: "a + b + c = 0 in lowest terms". State `3y − 5x + 4 = 0`

**Compact card** (primary view: general)
- The equation in large type: `3y − 5x + 4 = 0`. Under each coefficient is a chip with its signed value, and a sum
  chip reads "3 + (−5) + 4 = 2 ✗".
- Words: "adds to 2 · 9.2 bits to fix (c: 4 → 2)".

**Expanded view**
1. **General** (primary): as on the card, with a balance-scale miniature: the two sides tip by the sum.
2. **Plane**: the point (1, 1) is marked as a star. A vertical gap at x = 1 runs from the line (at height ⅓) to the
   star, labelled "⅔ × a = 3 → 2". A sentence connects the two: *"adding a, b and c is the same as asking how far the
   line misses (1, 1), times a."* This is a declared **same** mark (§3.7): it links a part of one view to an
   expression in another, and it is the cross-lens insight the owner wants to teach.

### 2.1 What a view must declare (derived from the storyboards)

1. **Parts**: name, exact type, one `say` sentence, and an **anchor** (where the part lives in this view's picture:
   a point, a position on an axis, a line, a region, a span of template text, a table cell, a tile column).
   Annotations attach to anchors; they never use pixels.
2. **Parametric parts**: parts that take arguments (`at_x(k)`, `term(n)`, `row(x)`), so rules can create "dynamic
   elements" from their own parameters.
3. **Aliases**: `from: other.part` declares that two parts are the same quantity. The renderer gives them the same
   colour automatically, which is how R1's `11/2` matches the ring without a hand-written link.
4. **Picture**: one of a small fixed set of engine renderers (`cartesian`, `text`, `table`, `number_line`, `tiles`,
   `bars`, `scale`, `grid`, `fan`, `arrows`) plus bindings. Views never draw.
5. **Frame**: how to crop the picture given the parts in focus (the y-axis strip in R1, rows 0–4 in R2).
6. **Grip**: the grip the view moves through, if any, and a rename of its coordinates into the view's words
   (growth: `start ← c`, `step ← m`).
7. **Domain**: inherited from the grip, or its own condition plus a reason sentence for when the view does not apply.

### 2.2 What an annotation must declare (derived from the storyboards)

1. **Views**: the primary view (compact) first, then the parallel expanded views.
2. **Marks**, from a small vocabulary that every renderer supports on every anchor kind it has: `focus(part)`,
   `value(part)`, `ticks(anchor, set, around, n)`, `gap(a, b, label)`, `mirror(part, via, onto)`,
   `same(partA, exprB, say)`, `check(expr)`, `ghost(move)`, `guide(anchor)`. A renderer that cannot place a mark on an
   anchor shows it as a text chip below the picture, so nothing is ever silently lost.
3. **Compact budget**: which marks survive on the card, in priority order (R1 keeps ticks, gap and ghost; R2 keeps
   guides, mirror and gap).
4. **Words**: one sentence for the goal card, and a status template ("{y0} — {gap} from the prime {p}").
5. **Hint**: almost always the default, "the ghost is the cheapest exact fix `solve` finds across all grips".

The central finding of the storyboards is that **nearly all of this comes from the utility's shape** (§3.6). `near`
always draws ticks of its set plus a gap, `match` always draws both values on one axis plus a gap, and `holds` always
draws a check. Hand-written marks are needed only for cross-view insights such as R2's mirror and R3's
`same`.

---

## 3. The core model

```
Type ─┬─ State (canonical, exact, tiny)
      ├─ Grips      (coordinates ⇄ state)    → induce Moves (one per coordinate)
      ├─ Transforms (state → state)          → Moves too
      ├─ Views      (picture + Parts)        → Parts are pure functions of State (+ params)
      ├─ Sets       (primes, squares, …)     → used by shapes and marks
      ├─ Prior      (probability over Moves) → Cost = −log2 P(move); also drives perturbation scoring
      └─ Rule families (params + Shapes over Parts + views + extra marks)
                                             → Score tuple, Annotation, Value (via a Valuer)
```

### 3.1 Definitions

- **Type**: a named bundle of everything below, versioned by the hash of its content.
- **State**: a small, exact, canonical record, the object's identity, with `valid`, `canonical`, `cap` and `birth`
  (the random distribution new objects are born from).
- **Grip**: named coordinates, each with a `get` (state → exact value), a *grain* (Int, Q, a finite set, cyclic
  mod n), and a `motion` sentence. A `build` turns coordinates back into a state, and a `domain` gives a condition and
  the reason sentence when it fails. Grips can take parameters (handle anchors, the x of a pivot). Round trip:
  `build(get(s)) = s` on the domain. The kernel property-tests this at publish time.
- **Move**: either `(grip, grip params, coordinate, δ)` or `(transform, args)`. Applying a move = `build` with one
  coordinate replaced, then canonicalise. The move is invalid if it leaves the domain, the cap or validity. **There is
  no other kind of mutator.**
- **Transform**: a named whole-object map with optional arguments (mirrors, swap x↔y; row operations in §4).
- **View**: picture kind, bindings, frame rule, a grip (optional), and parts.
- **Part** (element): one of three kinds.
  - *static*: a grip coordinate or state field shown in the view (`equation.m`);
  - *derived*: an expression over other parts, in any view (`plane.area`);
  - *parametric*: takes arguments supplied by a rule or a view (`plane.at_x(k)`, `growth.term(n)`).

  Every part has a type, `say`, an anchor, and may be Absent. A part marked `display:` (angles in degrees, lengths
  with square roots) is for drawing only, and the type checker refuses it inside a utility.
- **Set**: a named set with `contains`, `nearest(x)` and `around(x, n)` (the n nearest members on each side).
  Built-ins: primes, integers, squares, multiples(n), lattice points. Sets carry the "nearby primes" scenery.
- **Shape**: a utility atom with a score and a default annotation (§3.6).
- **Utility**: an ordered list of shapes, compared lexicographically, plus optional **tiers** (shapes that count only
  once every earlier shape is at its optimum).
- **Rule family**: words, a parameter schema with a sampler, a utility, views (primary first), extra marks, and a
  worked-example generator (by default: sample a state near the optimum and show its annotation).
- **Annotation**: the display list produced by the kernel. It is lens-neutral marks bound to anchors, together with
  the words. It is not code a family writes.
- **Prior**: a probability over moves (§6). **Cost** = −log2 P(move).
- **Value**: produced by a Valuer (§7) from the rule, the state, the prior and a seed.

### 3.2 The expression language (KX)

Definitions are data. Expressions inside them are strings in a tiny, total, pure language that parses to a JSON AST:

- Values: Int (big), Q (exact rational), Bool, Point, List, Anchor, Absent(reason).
- Operators: `+ − * /` (division by zero gives Absent), `^` (integer powers), comparisons, `and or not`,
  `if … then … else`, `let`.
- Built-in functions: `abs sign min max floor ceil num den gcd is_int is_prime dist`, `nearest(set, x)`,
  `around(set, x, n)`, `exists(e)`, `absent("reason")`, `point(x, y)`, `line(a, b, c)` (accepts rationals, clears
  denominators and canonicalises), and `line_through(P, Q)`.
- Bounded comprehensions: `[f(i) for i in lo..hi]` with at most 1000 terms.
- No floats, no loops, no recursion, no host calls. Evaluation is fuel-metered; running out of fuel gives
  `Absent("too much work")`, deterministically.
- `$a` names a state field. A bare name is a coordinate, parameter or local. `view.part` names a part of another view.
- `display(e)` and `deg(atan(e))` produce display-only values. The kernel formats them into decimal strings itself,
  so every host prints the same text.

### 3.3 The declaration format

The source format is YAML holding KX strings. It is compiled to a JSON IR, and the IR is the truth: its hash is the
type's version. (A TypeScript builder that emits the same IR is optional sugar for engine developers.)

### 3.4 The linear-equation type, complete

```yaml
type: line
version: 1
say: "a straight line on squared paper"

state:
  fields: { a: Int, b: Int, c: Int }                 # a·y + b·x + c = 0
  valid: "not ($a == 0 and $b == 0)"
  canonical: "gcd($a, $b, $c) == 1 and ($a > 0 or ($a == 0 and $b > 0))"
  cap: "max(abs($a), abs($b), abs($c)) <= 10^9"
  birth: "line_through(lattice(-9..9), lattice(-9..9))"   # two distinct random lattice points

sets:
  primes: builtin.primes
  whole:  builtin.integers

# ---------- grips: ways of holding the line. Each coordinate is a move. ----------
grips:
  slope:
    say: "hold it by its gradient m and y-intercept c"
    domain: { when: "$a != 0", else: "a vertical line has no gradient" }
    coords:
      m: { get: "-$b / $a", grain: Q, motion: "swings about where it crosses the y-axis" }
      c: { get: "-$c / $a", grain: Q, motion: "slides straight up or down" }
    build: "line(1, -m, -c)"                          # y − m·x − c = 0

  intercepts:
    say: "hold it where it crosses each axis"
    domain: { when: "$a != 0 and $b != 0 and $c != 0",
              else: "this line misses an axis or passes through the origin" }
    coords:
      p: { get: "-$c / $b", grain: Q, motion: "swings about where it crosses the y-axis" }
      q: { get: "-$c / $a", grain: Q, motion: "swings about where it crosses the x-axis" }
    build: "line(1/q, 1/p, -1)"                       # y/q + x/p − 1 = 0

  general:
    say: "hold it by the three whole numbers of a·y + b·x + c = 0"
    coords:
      a: { get: "$a", grain: Int, motion: "swings about where it crosses the x-axis" }
      b: { get: "$b", grain: Int, motion: "swings about where it crosses the y-axis" }
      c: { get: "$c", grain: Int, motion: "slides without turning" }
    build: "line(a, b, c)"

  pivot:                                              # point-slope form
    say: "hold it by one point and its gradient"
    params: { h: { type: Int, default: 0, say: "the x of the point you hold" } }
    domain: { when: "$a != 0", else: "a vertical line has no gradient" }
    coords:
      m:  { get: "-$b / $a",  grain: Q, motion: "swings about the point at x = {h}" }
      yh: { get: "y_at(h)",   grain: Q, motion: "slides straight up or down" }
    build: "line(1, -m, m*h - yh)"                    # y − yh − m(x − h) = 0

  handles:
    say: "hold it by two dots on it"
    params:
      h0: { type: Anchor, default: "at_x(0)" }        # at_x(k): the dot above x = k; at_y(q): the dot at height q
      h1: { type: Anchor, default: "at_x(1)" }
    domain: { when: "exists(on_line(h0)) and exists(on_line(h1)) and on_line(h0) != on_line(h1)",
              else: "one of the dots is not on this line" }
    coords:
      d0: { get: "free(h0)", grain: Q, motion: "drags the first dot; the line pivots about the second" }
      d1: { get: "free(h1)", grain: Q, motion: "drags the second dot; the line pivots about the first" }
    build: "line_through(place(h0, d0), place(h1, d1))"

transforms:
  mirror_y: { do: "line($a, -$b, $c)", say: "mirror in the y-axis" }
  mirror_x: { do: "line(-$a, $b, $c)", say: "mirror in the x-axis" }
  swap_xy:  { do: "line($b, $a, $c)",  say: "mirror in y = x: swap x and y" }

helpers:                                              # shared KX, usable in every view
  y_at: { params: [x], value: "if $a == 0 then absent('a vertical line has no single height') else -($b*x + $c) / $a" }
  x_at: { params: [y], value: "if $b == 0 then absent('a flat line never reaches that height') else -($a*y + $c) / $b" }

# ---------- views: ways of looking. Parts are what rules and marks refer to. ----------
views:
  equation:
    say: "y = m·x + c"
    picture: { kind: text, template: "y = {m}x + {c}" }
    grip: slope
    parts:
      m:         { from: slope.m, say: "gradient: how far y goes up when x goes up by 1" }
      c:         { from: slope.c, say: "y-intercept: the value of y when x is 0" }
      m_minus_c: { value: "m - c", anchor: "between(m, c)" }

  general:
    say: "a·y + b·x + c = 0, in lowest terms"
    picture: { kind: text, template: "{a}y + {b}x + {c} = 0" }
    grip: general
    parts:
      a:   { from: general.a }
      b:   { from: general.b }
      c:   { from: general.c, say: "not the same c as in y = mx + c!" }
      sum: { value: "a + b + c", anchor: "under(template)", say: "the three numbers added up" }

  intercepts:
    say: "x/p + y/q = 1"
    picture: { kind: text, template: "x/{p} + y/{q} = 1" }
    grip: intercepts
    parts:
      p: { from: intercepts.p, say: "where it crosses the x-axis" }
      q: { from: intercepts.q, say: "where it crosses the y-axis" }

  plane:
    say: "the line drawn on squared paper"
    picture: { kind: cartesian }
    grip: handles
    frame: "around(focus, pad: 1)"
    parts:
      line:        { value: "$self", anchor: line }
      y_intercept: { value: "y_at(0)", anchor: "on_axis(y)", same_as: [equation.c, intercepts.q] }
      x_intercept: { value: "x_at(0)", anchor: "on_axis(x)", same_as: [intercepts.p] }
      triangle:    { value: "polygon(point(0,0), point(x_intercept,0), point(0,y_intercept))", anchor: region,
                     say: "the triangle the line cuts off with the two axes" }
      area:        { value: "abs(x_intercept * y_intercept) / 2", anchor: "inside(triangle)" }
      hyp2:        { value: "x_intercept^2 + y_intercept^2", anchor: "along(triangle.hyp)",
                     say: "the triangle's long side, squared (exact)" }
      rise_run:    { value: "step(point(0, y_intercept), run: den(equation.m), rise: num(equation.m))", anchor: path,
                     say: "go along this many squares, up this many" }
      slant:       { display: "deg(atan(equation.m))", anchor: "arc(x_intercept)", say: "angle with the x-axis" }
      at_x:        { params: { k: Q }, value: "point(k, y_at(k))", anchor: point }
      at_y:        { params: { q: Q }, value: "point(x_at(q), q)", anchor: point }

  table:
    say: "a table of x and y"
    picture: { kind: table }
    params: { from: { type: Int, default: 0 }, rows: { type: Int, default: 5 } }
    grip: { use: handles, with: { h0: "at_x(from)", h1: "at_x(from + 1)" } }   # edit two rows, the rest follow
    parts:
      row:     { params: { x: Int }, value: "y_at(x)", anchor: "cell(x)" }
      reverse: { params: { y: Q },   value: "x_at(y)", anchor: "reverse_row(y)" }
      step:    { from: equation.m, anchor: "difference_column", say: "how much each row goes up by" }

  growth:
    say: "a growing pattern of tiles"
    picture: { kind: tiles, fallback: bars }          # bars when start/step are not whole
    grip: { use: slope, rename: { start: c, step: m } }
    parts:
      start: { from: equation.c, say: "tiles in pattern 0" }
      step:  { from: equation.m, say: "tiles added each time" }
      term:  { params: { n: Int }, value: "start + n * step", anchor: "column(n)" }

  # also declared (pictures only, reusing grips): machine (in → ×m → +c → out, grip slope),
  # balance (a·y + b·x + c on a scale, grip general), normal (normal vector (b, a) and offset, no grip of its own)

# ---------- rule families ----------
rules:
  yint_near_prime:
    say: "Make the line cross the y-axis as close to a prime number as you can."
    views: [plane, equation, growth]
    utility:
      - near: { part: plane.y_intercept, set: primes }
    tiers:
      - holds: { expr: "is_int(equation.m)", say: "…with a whole-number gradient" }
    compact: { keep: [ticks, gap, ghost], frame: [plane.y_intercept, "around(primes, plane.y_intercept, 1)"] }

  y_of_k_vs_x_of_q:
    say: "Make y when x = {k} equal to x when y = {q}."
    params:
      k: { type: Int, range: "-5..5" }
      q: { type: Int, range: "-5..5" }
    views: [plane, table(from: k - 2), equation]
    utility:
      - match: { a: "plane.at_x(k).y", b: "plane.at_y(q).x" }
    marks:
      - guide:  { at: "plane.at_x(k)", style: vertical }
      - guide:  { at: "plane.at_y(q)", style: horizontal }
      - mirror: { part: "plane.at_y(q).x", via: "y = x", onto: "plane.axis_y",
                  say: "x(q) mirrored onto the y-axis so the two numbers sit side by side" }
    compact: { keep: [guide, mirror, gap] }

  coefficients_sum_zero:
    say: "Make the three numbers in a·y + b·x + c = 0 add up to zero."
    views: [general, plane]
    utility:
      - near:  { part: general.sum, set: "{0}" }
      - small: { expr: "max(abs(general.a), abs(general.b), abs(general.c))" }   # tie-break: small numbers
    marks:
      - point: { at: "point(1, 1)", view: plane, style: star }
      - same:  { a: general.sum, b: "general.a * (1 - plane.at_x(1).y)",
                 say: "adding a, b and c is the same as asking how far the line misses (1, 1), times a" }

  gradient_near_prime:
    say: "Make the gradient as close to a prime number as you can."
    views: [plane, equation]
    utility: [ { near: { part: equation.m, set: primes } } ]
    marks:   [ { ghost_family: "lines through plane.y_intercept with gradient in around(primes, equation.m, 1)" } ]

  area_target:
    say: "Make the triangle the line cuts off with the axes have area as close to {A} as you can."
    params: { A: { type: Int, range: "1..50" } }
    views: [plane, intercepts]
    utility: [ { near: { part: plane.area, set: "{A}" } } ]

prior: { see: "§6" }
valuer: { use: perturb/v1, budget_bits: 24, samples: 512 }   # §7
```

That is five grips (the brief's mutators, all derived), three transforms, seven views (plus three picture-only),
and five rule families. Adding a family is about six lines, and it brings its annotation with it.

### 3.5 What the kernel does with a declaration at publish time

1. Type-checks every KX expression. Display parts are refused in utilities, and every part referenced must exist.
2. Property-tests each grip: `build(get(s)) = s` on 10 000 born states inside the domain, and every coordinate is
   reachable.
3. Generates golden vectors (states, parts, scores, move costs, annotation display lists, values) and stores them
   beside the IR. Every host runs them (§5).
4. Samples rule parameters and reports each family's value distribution over born states. A family whose values are
   degenerate (always 0, always the maximum) is refused.

### 3.6 Shapes: utility atoms that carry their annotations

| shape | score (higher is better) | default marks |
|---|---|---|
| `near: {part, set}` | −dist(part, nearest(set, part)) | `ticks` of `around(set, part, 1–2)` on the part's anchor, `gap` to the nearest, words "{part} — {gap} from {nearest}" |
| `match: {a, b}` | −\|a − b\| | `focus` on both; `gap` if they share an axis, otherwise each `value` plus a gap chip |
| `small: {expr}` | −\|expr\| | `value` chip |
| `big: {expr, cap}` | min(expr, cap) | `value` chip with a bar up to the cap |
| `holds: {expr}` | 1 / 0 | `check` ✓/✗ with its `say` |
| `count: {items, pred}` | number of items satisfying pred | ✓/✗ on each item's anchor (the grid's pairs, the hand's cards) |

Unbounded "maximise" (the owner's "maximise the area") is written `near` a target or `big` with a cap. An unbounded
objective has no meaningful perturbation value, and juniors need a finish line.

### 3.7 Marks

`focus, value, ticks, gap, guide, mirror, same, check, ghost, point`, each bound to anchors. Each renderer implements
every mark for each anchor kind it has, and `chip` is the universal fallback. Colours are assigned per *part identity*,
so aliases (`same_as`, `from`) share a colour across views automatically.

---

## 4. The same format on other types: where it strains

### 4.1 Grid of digits (3×3, digits 0–9, an optional colour per cell)

```yaml
state: { fields: { d: "Int[9] in 0..9", col: "Int[9] in 0..2" } }
grips:
  cells:   { coords: { "d[i]": { grain: "cyclic 10", motion: "turns one dial" },
                       "col[i]": { grain: "set 0..2", motion: "repaints one cell" } } }
  numbers: { say: "read each row as a 3-digit number",
             coords: { "r[j]": { get: "100*d[3j] + 10*d[3j+1] + d[3j+2]", grain: "Int 0..999",
                                 motion: "counts the row up or down; carries spill into the next digit" } },
             build: "digits_of(r)" }
transforms: { swap(i, j), rotate90, mirror_h, mirror_v }
views: grid (cells), lines (row/column/diagonal sums), numbers (rows as numbers), pairs (opposite cells and their sums),
       histogram (count of each digit)
rules: opposite_pairs_sum { utility: [ count: { items: pairs.pair, pred: "pair.sum == x" } ] }
```

This fits well. The `numbers` grip is a real lens skill on a grid: going from 199 to 200 is one cheap move there and
three dial turns in `cells`. Strains: cyclic and finite grains need their own delta codes (§6). On a finite type the
valuer can be exact rarity again (§7).

### 4.2 Hand of five cards

State: a sorted list of 5 distinct card ids from 0 to 51. Grips: `swap_card` (take card X out, put card Y in);
`rank` per card (change the rank, keep the suit; invalid if it collides); `suit` per card. Views: fan, by-suit
columns, by-rank histogram, poker category (a derived part), pip sum.

**Strain 1: identity of members.** The state is a set, so "the third card" changes meaning after a move. Coordinates
and parts must be addressed **by content** ("the 7♥"), so parametric parts have to range over the state's members,
and an address can stop existing. **Strain 2: categorical grains.** A suit has no "how far", so its code is uniform
(log2 3 for "another suit"). **Strain 3: collisions** make domains depend on the whole state. All three are
manageable, but they show the design assumes coordinates are a fixed tuple. The fix is to let a grip's coordinate
list be a KX expression over the state (`for card in hand`).

### 4.3 System of two linear equations

The type is `pair(line, line)`. It is composed, not rewritten: every grip and view of each line is available under a
prefix (`L1.equation.m`), and the system adds its own:

```yaml
grips:
  solution: { domain: "both non-vertical and not parallel",
              coords: { xs: …, ys: …, m1: L1.slope.m, m2: L2.slope.m },
              motion: { xs: "slides both lines sideways together", m1: "turns line 1 about the crossing point" },
              build: "pair(through(point(xs,ys), m1), through(point(xs,ys), m2))" }
transforms:
  row_op: { args: { t: Q }, do: "pair(L1, add(L2, t * L1))", say: "add t × equation 1 to equation 2 — the crossing stays put" }
views: plane2 (both lines, crossing point), matrix ([[a1 b1][a2 b2]] | c), elimination (written steps), solution
rules: crossing on the lattice point nearest the origin; determinant prime; lines as close to perpendicular as possible
       (exact: match m1·m2 with −1)
```

Strains: (1) **Identity again.** Is the object the ordered pair of lines or the solution set? This design says the
ordered pair, so row operations are real changes, but they are priced as transforms carrying a parameter `t`. That is
the main reason transforms take arguments at all. (2) Absent is common (parallel lines have no crossing), so rules
must say what the worst score means. (3) Composition needs prefixed naming and a rule for cross-component parts. That
is cheap in the IR but has to be designed once.

### 4.4 Chemical formula

The state is atom counts over a room's alphabet (C, H, N, O, Cl). It is valid when the degree of unsaturation
`DoU = (2C + 2 + N − H − Cl)/2` is a whole number ≥ 0 and C ≥ 1. Views: Hill-order formula text, composition bars
(mass %), counts table, molar mass, and a "rings + double bonds" view showing DoU. Atomic masses are exact decimals,
so exact rationals work.

**Strain: validity is a lattice.** Nudging H by 1 makes DoU a half-integer, so half of all count moves are invalid.
The design answer is a grip whose coordinates form a *basis of the valid lattice*: `{CH₂ units, O, NH, DoU,
Cl-for-H}`. Every move in that grip is valid, and choosing that grip is the chemistry skill ("add a CH₂" versus
"change H"). The cost is that the author has to know the lattice. Deeper strain: **one formula, many molecules.** A
structural view is not a function of the state, so the format refuses it, which is correct. Structures would be a
different type (a molecular graph) whose parts are addressed by graph position, and that runs into §4.2's
content-addressing problem in its hardest form.

### 4.5 Free-body force diagram

The state is a mass m and up to five labelled forces with integer components (newtons), weight fixed at
`(0, −10m)`. Grips: `components` per force; `net` (coordinates `net_x, net_y`; build changes the force named
"applied" so the net comes out right, i.e. "hold every other force, set the total"). Transforms: add a force by kind,
remove one, rotate the diagram 90°. Views: arrows, components table, tip-to-tail polygon (closed when in equilibrium),
acceleration `F/m`. Rules: equilibrium (`small: net_x² + net_y²`), acceleration closest to a target, tension
magnitude² a perfect square.

**Strains, the worst of the five.** (1) **Irrationals.** Magnitudes and angles are not rational. Exact parts must use
squared magnitudes, or the domain must restrict directions to Pythagorean ones (3-4-5, 5-12-13); polar grips are
display-only. If the owner wants real trigonometry, KX needs exact surds (ℚ(√2, √3)), which is a contained but real
extension. (2) **Variable structure.** Adding a force creates parts, so parts are addressed by label ("tension"),
as with the cards. (3) **Units** are not in the type system; they would be `say` text only.

**Summary of strain.** The format holds wherever the state is a small tuple of exact numbers with fixed meaning. It
needs two extensions, each of which can be added later without changing the core: **content-addressed members** (cards,
forces, atoms) and **exact surds** (forces, geometry). Validity lattices are handled by good grips rather than new
machinery. Existing integer and string types fit directly: an integer has the grips `value`, `digits` and
`prime exponents`, a lovely lens trio; a string has the grips `characters` and `as a number in base 26`.

---

## 5. One definition, identical everywhere

**Mechanism.** There is one kernel: a small Rust crate with exact big rationals, the KX interpreter, the grip/move
engine, cost coding, `solve`, the annotation compiler and the valuer. It is compiled to a **single WebAssembly
binary**. Each host loads that same binary:

| host | how |
|---|---|
| server (JS runtime) | instantiate the wasm module |
| browser | instantiate the same module (web worker for valuer runs) |
| TypeScript agent sandbox | same module; a generated `.d.ts` plus a thin `Q`/`View` wrapper |
| Python agent sandbox | the same module through a wasm runtime (wasmtime, or natively under Pyodide); a generated thin wrapper exposing `Fraction`s |

The type definitions are **data (IR JSON)** loaded into the kernel, not code compiled into it. A new rule family
therefore changes no binary.

**Why identical:**
1. **One implementation.** There is nothing to mirror, so nothing can drift. The TypeScript and Python libraries are
   generated bindings, under 300 lines each, and contain no logic.
2. **No floats on the score path.** All arithmetic is exact. Logarithms (costs, values) use a specified fixed-point
   integer algorithm inside the kernel. Display decimals are formatted by the kernel.
3. **Determinism by construction.** KX has no host calls, no clock and no iteration-order ambiguity. Randomness (birth,
   valuer) comes from a counter-based generator in the kernel, keyed by hashes of game seed, object id, state and rule.
   Fuel limits make even runaway expressions finish identically.
4. **Pinned versions.** Each game's event log header records the kernel binary hash and every IR hash. Replay loads
   exactly those, so old games replay forever.
5. **Golden vectors.** Every IR publishes vectors (§3.5). Every host runs them in CI, and the sandboxes run a sample
   at startup and refuse to start on a mismatch.

**Small per-object data.** The server stores and streams the state (three integers), and per viewer their own value.
Everything visual is recomputed client-side by the kernel from state + own rule. Annotations never travel over the
wire, and a private rule never leaves its owner's client and the server.

**Fallback if the owner does not want Rust in the stack:** the same kernel written in TypeScript with `BigInt`, run in
Python through an embedded JS engine compiled to wasm (QuickJS). It is still one implementation, but slower and more
awkward to sandbox. That trade-off is decision 3 in §9.

---

## 6. What is read, what is paid for, and the price of a lens

**Reading.** When an agent is offered an object it pays once for the snapshot: the description length of the canonical
state in bits (for a line, `Σ (1 + γ(|coef|+1))`, about 15–25 bits) times the read rate, which is much lower than the
move rate. After that, **every view, part, `solve`, imagined move and own-rule score is free.** This is free
computation, because the kernel runs inside the sandbox.

**Changing lens is free.** There are two reasons. The decisive one: it is unenforceable. The kernel is a pure function
of a snapshot the agent already holds, so any agent (or its AI assistant) can recompute any view itself, and charging
for something the player can do privately only taxes honest code. The pedagogical one: pricing looking would reward
memorising over exploring, which is the opposite of what the game teaches.

**Grips are priced only through acting.** A move names its grip, so `log2(#grips + 1)` bits (2.6 here) is the toll
for using any grip, and it is the same for every grip. Exotic grips are not taxed. They win or lose purely on how
cheaply they can describe the change you want.

**The prior that sets every price** (one sentence: *a move costs its surprisal under the game's random mutator*):

```
P(move) = P(grip or transform set) · P(grip params) · P(coordinate | grip) · P(δ | grain)

P(grip)          uniform over grips ∪ {transforms}              → log2 6
P(coordinate)    uniform over the grip's coordinates             → log2 2 or log2 3
P(transform)     uniform within the transform set                → log2 3
P(params)        each Int param: γ(zigzag(n)); Anchor = 1 bit kind + Int
P(δ | Q grain)   δ = ±p/q in lowest terms, p,q ≥ 1:  2^-(1 + γ(p) + γ(q))
P(δ | Int)       q = 1: 2^-(1 + γ(|δ|) + 1)  (same code, so integers are just cheap rationals)
P(δ | cyclic n)  uniform over the n−1 other values
P(δ | finite set) uniform over the other values

γ(n) = 2⌊log2 n⌋ + 1   (Elias gamma: 1 → 1 bit, 2–3 → 3, 4–7 → 5, 8–15 → 7, …)
```

The code is prefix-free, so the probabilities sum to at most 1 (Kraft). It is also the distribution the valuer samples
from (§7). Since the same prior both prices moves and drives scoring, a state's value and an agent's costs are measured
in the same currency by construction. That answers the owner's request to "robustly integrate the practical relevance
of our mutator costing decisions".

Note that an agent pays for the **description it used**, not for the cheapest description of the change. Two moves
that land on the same state can cost different amounts. This is minimum description length applied honestly: finding
the short description is the skill.

**Receipts.** Every move in the log shows its receipt: `intercepts (2.6) · p (1) · +1 (3) = 6.6 bits`. Juniors learn the
code by reading receipts, so 3/55 visibly costs more than 1.

---

## 7. How scoring plugs in (interface only)

```ts
interface MovePrior {
  sample(state: State, rng: Rng): Move;        // draws from P_ref; rejection-samples invalid moves deterministically
  cost(move: Move): Bits;                      // = −log2 P_ref(move); exactly the price an agent pays
  apply(state: State, move: Move): State | Invalid;
}

interface Rule {
  score(state: State): Score | WORST;
  compare(a: Score | WORST, b: Score | WORST): -1 | 0 | 1;
}

interface Valuer {
  id: string;                                  // "perturb/v1", "rarity/v1", …
  value(rule: Rule, state: State, prior: MovePrior, seed: Seed): {
    bits: Fixed;                               // fixed-point, deterministic
    detail: { samples: number; better: number; worse: number; … };   // for the "why points moved" log
  };
}
```

What this interface allows a valuer to do: sample moves (and walks of moves), price them, apply them, and compare
scores. It does **not** let a valuer enumerate states or ask for an absolute probability of a state, so no finite state
space is assumed. A perturbation valuer (the 3C proposal, whose mathematics another brief owns) is
`budget_bits + samples + seed → bits`. For finite types, `rarity/v1` implements the same interface by exact enumeration
and ignores the prior, so existing types keep today's scoring until the new valuer is proven on them. "Points = own
value × others' value" needs only `value()` per (player, object) and is unchanged.

The server computes values at commit time and stores them as small per-viewer records. Clients display them, and
agents can estimate them locally with the same kernel.

---

## 8. Could teachers or players author rules and views?

Yes, in three tiers. Because definitions are data and the kernel validates them, authoring is mostly a tooling
question.

1. **Rule families over existing parts: a form.** Choose a view, click a part (or two), choose a shape (*near a set*,
   *match*, *small*, *holds*), and set parameter ranges. The annotation comes from the shape, so the teacher writes no
   drawing code. The worked example is generated. Most teacher wishes are here ("make the gradient a square number",
   "make y(3) a multiple of 5").
2. **New views over existing grips and parts: a template.** Choose a renderer (text template, table, number line,
   bars, tiles), bind parts to slots, and write `say` sentences. Example: a "taxi fare" view, fare = flag fall +
   rate × km, with grip slope renamed. This needs anchors per renderer slot, which the renderer defines.
3. **New grips and types: for experienced authors.** This needs `get`, `build` and a domain in KX. The kernel's
   round-trip property test catches most errors. This is where the strains of §4 bite.

What it needs: the validator of §3.5 (types, references, round trip, degenerate-value refusal); fuel limits (already
there); content-hash versioning, so a game pins exactly the rules it dealt; a library with "used in N games" and value
statistics; and moderation of the words. Privacy holds, because an authored rule is just another rule dealt privately.
A player authoring during a live game is possible but should wait: it invites rules tuned against opponents' known
states.

---

## 9. Rejected alternatives, open questions, owner decisions, first prototype

### Rejected

- **Hand-written mutators per representation.** Rejected because grips make mutators a consequence instead of a list
  to maintain: every grip gives "change one, keep the rest" for free, with motions a child can predict, and there is
  no question of which mutators are "principled". Transforms are the narrow exception.
- **The written equation as the object.** Rejected because it creates free no-op moves (×2 both sides), splits
  identity, and makes "how far it moved" ambiguous. Written-form rules use the canonical writing instead.
- **Representations as code (TypeScript classes mirrored in Python).** Rejected because two implementations drift, and
  per-family drawing code is what the brief already says does not generalise.
- **A computer algebra system in the core** (to solve "set X, keep Y" in general). Rejected as heavy and a source of
  nondeterminism. One-coordinate exact interpolation (`solve`) covers the need.
- **Pairwise conversions between representations.** Rejected because N views need N² converters. Every view goes
  through the canonical state instead, a star.
- **Floats anywhere on the score path.** Rejected because they break determinism across hosts.
- **Pricing lens changes or reads per view.** Rejected as unenforceable and anti-pedagogical (§6).
- **Annotations written per family.** Rejected because shapes carry their marks; only cross-view insights are written
  by hand.
- **A non-uniform grip prior ("natural" grips cheaper).** Rejected because the designer's taste would set prices.
  Uniform is the one-sentence rule.

### Open questions

1. **Plans within one grip.** Should a sequence of moves in the same grip pay the grip's name once? That is closer to
   minimum description length and rewards planning, but it complicates receipts. Proposal: not in v1.
2. **The grip set is part of the price list.** Adding a sixth grip changes `log2 6` to `log2 7` for every move. The
   grip set must therefore be fixed per type version, and it is a design budget.
3. **Canonicalisation surprises.** `general · a: 2 → 4` on `(2, 4, 1)` lands on a triple that may reduce. That is
   correct, but jarring for a junior. Should the general grip refuse moves that reduce?
4. **Privacy of move parameters.** P5's anchors (`at_x(2)`, `at_y(3)`) reveal the rule's k and q. Proposal: other
   players see the state change only, and full receipts stay private until the game ends.
5. **Exact surds**, needed for forces and real trigonometry. Is now the time, or later?
6. **Tie-breakers.** Should every family get a universal final tie-breaker, "simpler state" (fewer state bits)? It is
   principled, but it may conflict with rules about big numbers.
7. **Whether `solve` gives too much away.** It is free to everyone, so the skill becomes choosing grips and rules of
   thumb rather than algebra. That fits "frontier AI fully available", but the owner should confirm the pedagogy.

### The three decisions the owner must make

1. **Identity:** is the object the line (canonical primitive triple, as proposed) or the written equation?
2. **Moves come only from grips, and cost is surprisal under the one prior that also drives scoring:** are you happy
   to give up hand-designed mutators and to make looking (every view) free?
3. **One kernel:** do you accept a single WebAssembly kernel interpreting data definitions everywhere (Rust proposed,
   TypeScript-on-QuickJS as the fallback), replacing hand-mirrored TypeScript and Python logic? This means rewriting
   the definition layer of the existing types.

### First prototype (about two weeks of agent time, no game integration yet)

1. **Kernel v0** (Rust → wasm): exact rationals, KX, the `line` type from §3.4 with the five grips, three transforms,
   seven views and five families, cost coding, `solve`, and golden vectors. Exit criterion: all golden vectors agree in
   Node, the browser and Python (wasmtime) on 10 000 states.
2. **"Ways of holding" playground** (one page, no players): the plane with draggable handles and the equation,
   general, intercepts and growth views live beside it. Every drag shows its receipt *under every grip* that could have
   made it. This is the twelve-year-old test: after five minutes, can they predict which way "change p, keep q" swings
   the line?
3. **Agent harness:** run P1–P6 in both languages against random born states and print the receipts. Exit criterion:
   P6 beats a fixed-grip agent on cost for every family, measured.
4. **Valuer v0:** a plain perturbation valuer behind the §7 interface, used to check that the five families have
   non-degenerate, comparable value distributions.
5. **Only then:** put the `line` type into a real room with two players, and port the grid type onto the kernel to
   prove the format against an existing type (with `rarity/v1` as its valuer, so its scores do not change).
