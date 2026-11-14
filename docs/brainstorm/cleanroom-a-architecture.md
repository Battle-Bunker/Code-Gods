# Clean-room design A: one definition, many lenses (14 November 2026)

Scope: section 3D of `linear-equations-brief.md`, designed from first principles from the brief alone (no code, no
other documents were read). Sections 3A–3C appear only as the worked example the architecture has to serve.

## 0. The design in one page

1. **An object is its canonical state; a representation is a chart on it.** An object type has one small, exact,
   canonical state (for a line: three bounded integers). A *lens* is a pure function from that state to a flat set
   of named, typed *elements*, some of which are *coordinates* that can be written back (`put`). Nothing about a
   lens is stored in the object.
2. **Everything is an element reference.** Static, derived and "dynamic" elements are one thing: an element family
   indexed by parameters (`plane.yInt`, `plane.atX(3)`, `plane.tick(y, 5)`). Utility functions, annotations, agent
   reads and mutators all name elements the same way.
3. **A rule is named terms over elements; its annotation is the trace of evaluating it.** There is no separately
   authored annotation. The evaluator records which elements each term read; that record *is* the explanation, so
   it cannot disagree with the score.
4. **A mutation is a codeword; its price is the codeword's length.** Each mutator belongs to a lens and declares a
   prefix code for its arguments. Cost in bits is the length of that code, lens arguments included. The same code is
   the perturbation distribution scoring needs (probability 2^−bits), and it can be sampled or enumerated exactly
   with integers.
5. **Definitions are data, run by two small interpreters.** A definition is a typed declarative document compiled
   once to a canonical JSON form (the IR). A TypeScript kernel (server, browser, TypeScript agents) and a Python
   kernel (Python agents) interpret it over a closed set of about seventy exact-integer primitives. Agreement is
   proved per primitive and per definition by shared vectors, not per rule family by hand.

Reading an object is one flat-priced act that yields the whole state; changing lens afterwards is free computation.
The skill is finding the lens in which the change you want is short to say.

## 1. The formal model

### 1.1 Values

Kinds: `int` (exact), `rat` (exact, lowest terms, positive denominator), `fix` (integer count of millionths,
produced only by specified integer algorithms such as `sqrtFix` and `atan2Deg`), `bool`, `sym` (a member of a
declared finite set), bounded `list<K>`, records, and `K?` (a value or *undefined*, written ⊥). Geometric kinds
(`point`, `segment`, `polygon`, `cell`, …) are records with a known shape. There are no floating-point values
anywhere a score, a cost or a state depends on; floats exist only inside renderers.

### 1.2 Definitions

An **object type** is `T = ⟨S, canon, birth, Λ, M, R⟩`:

- `S`, the **state** schema: a bounded record. `canon: S → S` picks the representative; two objects are the same
  object exactly when their canonical states are byte-equal. `birth` draws a state from a stream of random bits.
- `Λ`, the **lenses**. A lens `λ(θ) = ⟨Θ, dom, scene, E, C, put⟩` has optional parameters `θ ∈ Θ` (a
  *parameterised lens*, such as "the two points at x₁ and x₂"), a domain predicate `dom ⊆ S` (slope-intercept does
  not exist for a vertical line), a scene kind for drawing, elements `E`, a subset `C ⊆ E` of **coordinates**, and
  `put: values of C → S ∪ {reject}`.
- An **element** `e = ⟨name, Π, kind, get, mark⟩` is a pure function `get: S × θ × π → kind ∪ {⊥}` plus a mark
  (how it appears in its lens's scene). An **element reference** is the name `(λ, θ, e, π)`; its value depends only
  on the state. A *derived* element is one that is not a coordinate. A *dynamic* element is one with `Π ≠ ∅`. There
  is no third mechanism.
- `R`, the **rule families**. `ρ = ⟨Φ, show, terms, tiers⟩`: parameter domain `Φ` with a deal distribution, an
  ordered list of lenses to show (the first is the **primary**), and named **terms**, each an expression over
  element references and parameters with a sense (minimise or maximise). A dealt **rule** is `r = (ρ, φ)`. Its
  **utility function** is `u_r: S → Score`, the tuple of term values compared lexicographically, ⊥ worst.
- The **annotation** (I call it the *explanation*) is `x_r(s)`: the trace of evaluating `u_r(s)`, namely each term's
  value and the element references it read, with their values and marks.
- `M`, the **mutators**. `μ = ⟨λ, A, code, step⟩`: a lens, an argument domain, a prefix-free
  `code: θ × A → {0,1}*`, and `step: S × θ × A → S ∪ {reject}`. A **move** is `(μ, θ, α)`. The **cost function** is
  `bits(move) = |code(move)|`.
- **Value** is not part of the type. A scoring module computes `V(r, s)` using only the interface in section 7.

### 1.3 Invariants

| # | Invariant | How it is enforced |
|---|-----------|--------------------|
| I1 | Purity: every `get`, `put`, `step`, `code`, term is a function of its inputs only | the expression language has no state, time, I/O or randomness |
| I2 | Exactness: identical results in TypeScript and Python | only `int`, `rat`, `fix`; primitives specified as integer algorithms; integers trap identically above 2⁵³ in both kernels |
| I3 | Totality with a static cost bound | no recursion; loops only over ranges and lists with compile-time bounds; the compiler rejects a definition whose worst-case step count exceeds a budget |
| I4 | Small canonical state | `S` is bounded; the compiler computes its maximum encoded size and rejects more than 64 bytes without an explicit waiver |
| I5 | Lens laws | `put(get(s)) = s` on `dom`; `put(get(put(v))) = put(v)` wherever `put(v)` is defined; an *exact* lens also has `get(put(v)) = v`. Checked automatically on thousands of generated states at build time |
| I6 | Explanation equals evaluation | the explanation is produced by the same evaluation that produces the score |
| I7 | Costs are code lengths | every mutator's code is checked prefix-free (Kraft sum ≤ 1) by exhaustive decoding to a depth |
| I8 | Replay | a game header pins the definition hash and kernel version; the log holds births and moves; state is the fold of `step` |
| I9 | Rule privacy | definitions (all families) are public; the dealt `(ρ, φ)` is known only to the server and its owner; explanations are computed on the owner's device; nothing derived from `φ` is written to shared data except server-computed points |
| I10 | Kernel stability | primitives are append-only; changing a primitive's meaning means adding a new name |

Per-object shared data is therefore the canonical state and a revision number: for a line, three small integers.
Every lens view, explanation and hint is recomputed locally from that.

## 2. The declaration format

### 2.1 The choice

A **typed declarative document** with a small expression grammar, compiled by one compiler to a canonical JSON
IR. Not an embedded TypeScript DSL and not constrained code, for four reasons:

- Data can be hashed, pinned in a game's log, shipped to a browser or a sandbox, diffed and validated. Code cannot
  be trusted the same way.
- A total language with bounded loops gives a static cost bound, which is what makes teacher authoring (section 8)
  and exhaustive perturbation (section 7) safe.
- Dependencies are visible: the compiler knows which lenses a rule reads, so "show every dependent
  representation" is checked, not remembered.
- Python never parses or compiles anything. It interprets the IR.

The IR is the contract. The surface syntax below is replaceable; a TypeScript builder emitting the same IR would
be acceptable, but I would not start there because it invites build-time host code into definitions.

Notation: `s.` is the state; `K?` may be undefined; an expression that reads ⊥ is ⊥ unless wrapped in `defined()`
or `else`; `for … in …` is a bounded comprehension; `++` concatenates codes.

### 2.2 The linear-equation type

```lens
type line "Linear equation" {

  -- The object is the line, not a way of writing it:  a·y + b·x + c = 0
  state { a: int in -12..12,  b: int in -12..12,  c: int in -144..144 }
  valid  not (s.a == 0 and s.b == 0)
  canon  let g = gcd(s.a, s.b, s.c),
             f = if s.a < 0 or (s.a == 0 and s.b < 0) then -1 else 1
         in { a: f*s.a/g, b: f*s.b/g, c: f*s.c/g }
  birth  { a: uniform(0..6), b: uniform(-6..6), c: uniform(-24..24) }      -- redrawn until valid

  lens general "ay + bx + c = 0" {
    scene formula "{a}y + {b}x + {c} = 0"
    coord a: int = s.a        slot coef
    coord b: int = s.b        slot coef
    coord c: int = s.c        slot const
    elem  x: sym, y: sym                                   -- the pronumerals, addressable for highlighting
    put   { a: a, b: b, c: c }                             -- canon removes the common factor
  }

  lens slope "y = mx + c" when s.a != 0 {
    scene formula "y = {m}x + {c}"
    coord m: rat = -s.b / s.a   slot coef
    coord c: rat = -s.c / s.a   slot const
    elem  x: sym, y: sym
    elem  sub(k: rat): rat = m*k + c                       -- dynamic: "y = m·k + c = value", drawn as a worked line
          mark worked "y = {m}·{k} + {c} = {value}"
    put   let L = lcm(den(m), den(c)) in { a: L, b: -int(m*L), c: -int(c*L) }
  }

  lens plane "Cartesian plane" {
    scene plane { axes: true, grid: 1, fit: roles }
    elem graph:  lineMark  = lineThrough(s.a, s.b, s.c)                      base
    elem origin: point     = point(0, 0)                                     base
    elem yInt:   point?    = when s.a != 0: point(0, -s.c / s.a)
    elem xInt:   point?    = when s.b != 0: point(-s.c / s.b, 0)
    elem intercept(ax: {x, y}): point? = if ax == y then yInt else xInt
    elem triangle: polygon? = when s.c != 0: polygon(origin, xInt, yInt)
    elem area:   rat?      = abs(xInt.x * yInt.y) / 2          mark label(triangle)
    elem legX:   segment?  = segment(origin, xInt)             value abs(xInt.x)
    elem legY:   segment?  = segment(origin, yInt)             value abs(yInt.y)
    elem hyp:    segment?  = segment(xInt, yInt)               value sqrtFix(xInt.x^2 + yInt.y^2)
    elem hyp2:   rat?      = xInt.x^2 + yInt.y^2
    elem angleX: fix?      = atan2Deg(abs(yInt.y), abs(xInt.x))   mark arc(xInt, origin→yInt)
    elem angleY: fix?      = 90.000000 - angleX                   mark arc(yInt, origin→xInt)
    -- dynamic elements: created from a rule's or an agent's parameters
    elem atX(q: rat): point? = when s.a != 0: point(q, (-s.b*q - s.c) / s.a)
    elem atY(k: rat): point? = when s.b != 0: point((-s.a*k - s.c) / s.b, k)
    elem tick(ax: {x, y}, v: rat): point = if ax == y then point(0, v) else point(v, 0)   mark tick
    elem drop(p: point, ax: {x, y}): segment = segment(p, if ax == y then point(0, p.y) else point(p.x, 0))
          value if ax == y then p.y else p.x                   mark dashed
    elem carry(v: rat): point = point(0, v)                    mark arc(point(v, 0), origin→point(0, v))
    elem gap(p: point, q: point): segment = segment(p, q)      mark span
          value if p.x == q.x then abs(p.y - q.y) else if p.y == q.y then abs(p.x - q.x)
                else sqrtFix((p.x - q.x)^2 + (p.y - q.y)^2)
  }

  lens pattern "Growth pattern" when s.a != 0 {
    scene strip { cells: for n in 0..5: term(n), between: jump }
    coord start: rat = -s.c / s.a
    coord step:  rat = -s.b / s.a
    elem  term(n: int in -12..12): cell = { index: n, value: start + n*step }
    elem  jump(n: int in -12..11): rat = step                  mark span(term(n), term(n+1))
    put   slope.put(m: step, c: start)
  }

  lens twoPoint(x1: int in -6..6, x2: int in -6..6) "Two points" when s.a != 0 and x1 != x2 {
    scene plane { axes: true, grid: 1, fit: roles }
    coord y1: rat = (-s.b*x1 - s.c) / s.a
    coord y2: rat = (-s.b*x2 - s.c) / s.a
    elem  P1: point = point(x1, y1),  P2: point = point(x2, y2)
    elem  run: int = x2 - x1          mark span(P1, point(x2, y1))
    elem  rise: rat = y2 - y1         mark span(point(x2, y1), P2)
    put   let m = (y2 - y1) / (x2 - x1) in slope.put(m: m, c: y1 - m*x1)
  }

  -- the same quantity seen through different lenses; the expanded view links them
  same  slope.c ~ plane.yInt.y ~ pattern.start ~ twoPoint(0, _).y1
  same  slope.m ~ pattern.step
```

Other lenses (intercept form, point-slope, rate and starting amount, balance scale, function machine, normal
vector) are the same shape: a domain, two or three coordinates, a `put`, derived elements, a scene kind.

### 2.3 Rule families

```lens
  rule interceptNearPrime(ax: {x, y}) show plane, slope {
    words "Bring the {ax}-intercept as close as you can to a prime number."
    let i     = plane.intercept(ax)                                   -- focus
    let v     = if ax == y then i.y else i.x
    let ps    = primesNear(v, 3)                                      -- the three primes nearest v
    let ticks = for p in ps: plane.tick(ax, p)                        -- targets
    let gaps  = for t in ticks: plane.gap(i, t)                       -- one distance per prime
    term distance = min(for g in gaps: g.value)         minimise
    term prime    = ps[argmin(for g in gaps: g.value)]  maximise      -- tie-break: the larger prime
    tier whole when distance == 0 {                                   -- harder tier, counts once on a prime
      term gradient = abs(slope.m - round(slope.m))     minimise
    }
  }

  rule substitutionGap(k: int in -6..6, q: int in -6..6) show plane, slope {
    words "Make y at x = {k} as close as you can to x at y = {q}."
    let P  = plane.atX(k)                       -- the point (k, y(k))
    let Q  = plane.atY(q)                       -- the point (x(q), q)
    let h  = plane.drop(P, y)                   -- y(k) read off on the y axis
    let w  = plane.drop(Q, x)                   -- x(q) read off on the x axis
    let w' = plane.carry(w.value)               -- x(q) swung round onto the y axis
    let d  = plane.gap(plane.tick(y, h.value), w')
    let _  = slope.sub(k)                       -- the substitution, worked in the formula
    term difference = d.value                         minimise
    term tidy       = den(h.value) * den(w.value)     minimise        -- tie-break: whole numbers first
  }

  rule originTriangle() show plane, general {
    words "Make the triangle between the line and the axes as large as you can."
    term area    = plane.area      maximise
    term compact = plane.hyp2      minimise                           -- tie-break: shortest hypotenuse
  }

  rule patternMultiples(d: int in 2..7) show pattern, slope {
    words "Get as many of the first six terms as you can to be multiples of {d}."
    units hit = for n in 0..5: let t = pattern.term(n) in isInt(t.value) and int(t.value) mod d == 0
    term hits  = count(hit)                    maximise
    term small = abs(pattern.start)            minimise
  }
```

`units` is a comprehension whose per-item results are recorded in the trace: that is how "which parts count and
what each contributes" works for any type.

**Compact and expanded annotations come from the same references.** For `interceptNearPrime(y)` on the line
`2y − 3x − 9 = 0` (that is, `y = 3/2·x + 9/2`), the kernel returns:

```json
{ "score": ["1/2", 5], "tier": null, "primary": "plane", "show": ["plane", "slope"],
  "terms": [
    { "id": "distance", "sense": "min", "value": "1/2", "reads": ["plane.gap#0"] },
    { "id": "prime",    "sense": "max", "value": 5,     "reads": ["plane.tick(y,5)"] } ],
  "marks": {
    "plane": [
      { "el": "plane.yInt",      "role": "focus",  "mark": {"point": [0, "9/2"]} },
      { "el": "plane.tick(y,5)", "role": "target", "mark": {"tick": [0, 5]},  "label": "5" },
      { "el": "plane.tick(y,3)", "role": "target", "mark": {"tick": [0, 3]},  "label": "3" },
      { "el": "plane.tick(y,7)", "role": "target", "mark": {"tick": [0, 7]},  "label": "7" },
      { "el": "plane.gap#0", "role": "gap", "term": "distance", "mark": {"span": [[0,"9/2"],[0,5]]}, "label": "1/2" },
      { "el": "plane.gap#1", "role": "gap", "mark": {"span": [[0,"9/2"],[0,3]]}, "label": "3/2" },
      { "el": "plane.gap#2", "role": "gap", "mark": {"span": [[0,"9/2"],[0,7]]}, "label": "5/2" } ],
    "slope": [ { "el": "slope.c", "role": "focus", "via": "same plane.yInt.y", "mark": {"slot": "c"} } ] },
  "hint": { "move": "general.bump(c, -1)", "bits": 4, "lens": "general", "score": [0, 5] } }
```

Roles are assigned mechanically: an element of the object read by a term is `focus`; an element built from rule
parameters or computed targets is `target`; an element whose value feeds a term is `gap`; `same` links add `focus`
marks in the other shown lenses. The compact card draws `marks[primary]` in priority order (gap that sets the
score, focus, nearest target) with the term values as chips. The expanded view draws every lens in `show` side by
side with all marks and labels.

### 2.4 Mutators and cost functions

Standard codes (all lengths are integers of bits):

| Code | Domain | Length |
|------|--------|--------|
| `choice(n)` | one of n | ⌈log₂ n⌉ |
| `gamma(n)` | n ≥ 1 | 2⌊log₂ n⌋ + 1 |
| `step(d)` | integer d ≠ 0 | 1 + gamma(\|d\|): ±1 costs 2, ±2..3 costs 4, ±4..7 costs 6, ±8..15 costs 8 |
| `int(d)` | any integer | gamma(\|d\| + 1), plus 1 if d ≠ 0 |
| `ratstep(p/q)` | rational ≠ 0, lowest terms | step(p) + gamma(q) |

```lens
  mutator slope.add(target: {m, c}, by: rat != 0) {
    code  choice(target) ++ ratstep(by)
    set   target += by
  }
  mutator general.bump(coef: {a, b, c}, by: int != 0) {
    code  choice(coef) ++ step(by)
    set   coef += by
  }
  mutator pattern.shift(n: int != 0) {                 -- start the pattern n places later (or earlier)
    code  step(n)
    set   start = term(n).value
  }
  mutator twoPoint(x1, x2).lift(which: {P1, P2}, by: int != 0) {   -- move one point up or down; the other is the pivot
    code  int(x1) ++ int(x2) ++ choice(which) ++ step(by)          -- the lens arguments are part of the description
    set   (if which == P1 then y1 else y2) += by
  }
  mutator plane.reflect(in: {xAxis, yAxis, diagonal}) {
    code  choice(in)
    state match in { xAxis: {a: -s.a, b: s.b, c: s.c},  yAxis: {a: s.a, b: -s.b, c: s.c},
                     diagonal: {a: s.b, b: s.a, c: s.c} }
  }
}
```

A mutator either `set`s coordinates of its lens (the kernel then calls the lens's `put`) or gives the new `state`
directly. The result is canonicalised; it is rejected if it is invalid, out of bounds or outside the lens domain. A
full codeword is `choice(number of mutators) ++ code`; that prefix is the same for every move, so it is left out of
the figures below.

**Cheap in one lens, dear in another** (all computed from the codes above):

| Change | Cheapest | Other routes |
|--------|----------|--------------|
| `y = 2/3·x + 1` to `y = 2/3·x + 3` | `pattern.shift(3)`: 4 bits | `slope.add(c, 2)`: 6 bits; `general.bump(c, −6)`: 8 bits |
| `y = 2x + 1` to `y = 1/2·x − 1/2` | `plane.reflect(diagonal)`: 2 bits | two `slope.add` moves of −3/2: 16 bits |
| `y = x + 1` to `y = 7/4·x − 2` (keep the point (4, 5)) | `twoPoint(0, 4).lift(P1, −3)`: 12 bits | `slope.add` twice: 16 bits; `general.bump` three times: 24 bits |

Vertical lines show the domain side of the same idea: no `slope` move can reach one, `plane.reflect(diagonal)` or
`general.bump(a, …)` can.

### 2.5 What the IR looks like

The compiler resolves names, checks kinds and bounds, and emits canonical JSON (sorted keys, no floats). One element:

```json
{ "lens": "plane", "name": "atX", "params": [{"name": "q", "kind": "rat"}], "kind": {"opt": "point"},
  "get": ["when", ["ne", ["s", "a"], 0],
          ["point", ["p", "q"], ["div", ["sub", ["neg", ["mul", ["s", "b"], ["p", "q"]]], ["s", "c"]], ["s", "a"]]]],
  "mark": "point" }
```

## 3. The same format on other object types

Each sketch gives the state, lenses with their coordinates, one rule and the mutators that make lens choice matter.

**Grid of digits (3×3, optionally coloured).**

```lens
type grid { state { cells: list<{d: int in 0..9, col: sym?}>[9] }
  lens cells "grid" { scene grid {rows: 3, cols: 3}
    coord cell(r: 0..2, c: 0..2): cellv = s.cells[3*r + c]
    elem  opposite(i: 0..3): pair = [[cell(0,0),cell(2,2)], [cell(0,1),cell(2,1)], [cell(0,2),cell(2,0)], [cell(1,0),cell(1,2)]][i] }
  lens lines "rows and columns as numbers" { scene table
    coord row(r: 0..2): int = 100*cell(r,0).d + 10*cell(r,1).d + cell(r,2).d ;  elem colSum(c), rowSum(r), diagSum(k) }
  rule oppositeSum(x: int in 2..16) show cells {
    units ok = for i in 0..3: let p = cells.opposite(i) in p[0].d + p[1].d == x
    term pairs = count(ok) maximise }
  mutator cells.set(r, c, d)   { code choice(9) ++ choice(10) ; set cell(r,c).d = d }
  mutator lines.addToRow(r, by){ code choice(3) ++ step(by)   ; set row(r) += by }   -- carries ripple through a row
}
```

It fits without strain. The finite state space additionally offers `enumerate` (section 7), so today's exact
rarity tables remain computable. Indexed element families replace long lists of named elements.

**Hand of cards.** State: five distinct card numbers 0..51, sorted. Lenses: `hand` (scene `tokens`; coordinates
`card(i)`; derived `rank`, `suit`), `byRank` (groups, sizes, runs and the gaps in them), `bySuit` (counts).
Rules read `byRank.group(i).size` or `byRank.run.length`. Mutators: `hand.replace(i, card)` at
`choice(5) ++ choice(52)`; `byRank.nudge(i, ±1)` at `choice(5) ++ step(±1)`, cheap for straights; `bySuit.recolour(i,
suit)` at `choice(5) ++ choice(4)`, cheap for flushes. **Strain:** position in a sorted hand is not a stable
identity (after a move, `card(2)` is a different card). Pure evaluation does not care, but animation and the log
do, so element references need an optional stable key (`card#7♥`). Distinctness is a `valid` rule, so some
codewords are rejected.

**System of two linear equations.** State: an ordered pair of lines. This needs one new construct, composition:
`part e1: line, e2: line` imports the line type, and its lenses and mutators are lifted (`e1.slope.m`,
`e2.pattern.shift(2)`). New lenses over the pair: `crossing` (scene `plane`; intersection point, angle between the
lines, the triangle with an axis; coordinates: the intersection and the two gradients, defined when the
determinant is not 0), `matrix` (coefficients, determinant, augmented column), `elimination` (the multiples that
cancel a variable). Rules: "bring the solution as close as you can to (p, q)", "make the determinant d", "make the
lines perpendicular". The mutator that makes lens rotation shine is `matrix.rowOp(i ← i + k·j)` at `choice(2) ++
step(k)`: it changes one line while keeping the solution fixed, which costs many bits per line in any single-line
lens. `crossing.move(dx, dy)` translates both lines at once. **Strain:** composition has to be designed (prefixing,
lifting, costs of choosing the part); the system is ordered because "equation 1" must mean something, which is the
"written form" question again.

**Chemical formula (composition).** State: `{C, H, N, O: int in 0..12}`. Lenses: `formula` (scene `formula`;
coordinates are the subscripts), `empirical` (coordinates: the reduced formula and the multiplier n), `mass`
(molar mass and mass fractions as rationals over a table of integer atomic masses ×1000), `combustion` (the
smallest whole coefficients of `CxHyOz + O₂ → CO₂ + H₂O`, derived), `unsaturation` ((2C + 2 + N − H)/2).
Rules: "carbon's mass fraction as close as you can to p%", "exactly k rings or double bonds", "the O₂ coefficient
is prime". Mutators: `formula.add(El, ±n)`, `empirical.scale(k)` at `gamma(k)` (multiplies every subscript), and a
`groups.add(CH₂ | OH | NH₂ | CO)` lens where a whole functional group is one symbol. Balancing is a second type:
state is the coefficient vector of a fixed reaction, `units` is one residual per element. **Strain:** composition is
easy; structure is not. A structural formula is a graph, and a canonical state for graphs (isomorphism) is beyond
this format unless the type restricts itself to shapes with an easy normal form. Data tables (atomic masses) need
a `table` literal.

**Free-body force diagram.** State: mass (integer) and up to four forces as integer components. Lenses: `arrows`
(scene `plane`, arrows from the body; magnitude and direction as `fix`), `components` (table of Fx and Fy with
column sums; coordinates), `resultant` (tip-to-tail polygon, net force, net², acceleration = net/mass as
rationals), `incline(θ)` (parameterised: components along and across a slope with rational sine and cosine, for
example 3-4-5). Rules: "balance the forces" (minimise net²), "accelerate exactly along the incline", "net force
(p, q)". Mutators: `components.add(i, axis, d)`, `arrows.quarterTurn(i)`, `arrows.scale(i, k)`,
`arrows.addForce(Fx, Fy)` (dear: it must say the whole vector). **Strain:** the polar chart (magnitude, angle) is
not closed over integer components, so its `put` must snap. I would allow it only as a declared *lossy* lens, which
satisfies the two general laws of I5 but not exactness, and show the snapped result before commit. Variable-length
state (adding and removing forces) works but makes "which force is force 2" the stable-identity problem again.
Units (N, kg) are display-only today; dimension checking would be a real addition.

**Integer and string** fit trivially and gain from the idea: an integer has decimal, binary and prime-factor
lenses (doubling is 2 bits in the factor lens and many in decimal); a string has characters, runs and letter counts.

Where the format strains, in order of seriousness: (1) states with no cheap canonical form (graphs, general
expression trees); (2) lossy lenses; (3) stable identity of parts under canonicalisation; (4) composition of types;
(5) a written form that carries information the object does not (an unsimplified equation), which this design
deliberately excludes from state; (6) rules over several objects at once, which are out of scope.

## 4. One definition, executed everywhere

```
 *.lens source ──compiler (TypeScript, build time)──▶ IR (canonical JSON) + definition hash
                                                        │
        ┌───────────────────────┬───────────────────────┼────────────────────────┐
   server (TS kernel)     browser (TS kernel)     TS agent sandbox          Python agent sandbox
   step, score, value     lens views, explanation  (TS kernel)              (Python kernel)
```

- **The kernel** is an interpreter for the IR: about seventy primitives (integer and rational arithmetic, `gcd`,
  `lcm`, comparisons, `isPrime`, `primesNear`, `isSquare`, `sqrtFix`, `atan2Deg`, bounded list operations, record
  access, geometry constructors, the codes, a specified bit-stream random source) and five entry points:
  `view(state, lens, args)`, `explain(rule, state)`, `step(state, move)`, `encode/decode(move)`,
  `moves(state, maxBits)`. Each kernel is perhaps 1,500 lines. At load a kernel may compile the IR to closures for
  speed; the meaning stays the interpreter's.
- **Why an interpreter and not code generation.** With generated code, every definition is a new chance for the two
  languages to differ (division and remainder of negatives, integer size, ordering of keys). With an interpreter,
  those differences can only live in the primitives, which are few, fixed and specified once.
- **How agreement is guaranteed.**
  1. A normative specification per primitive with golden vectors, including the awkward cases (negative remainders,
     ⊥ propagation, rationals in lowest terms, the 2⁵³ trap).
  2. A per-definition conformance corpus generated at build time: for a few thousand seeded states, every lens
     view, every family at sampled parameters, every mutator at sampled arguments, as a hash of canonical output.
     The Python kernel must reproduce every hash in CI. A definition cannot ship until both kernels agree on it.
  3. Continuous differential fuzzing of random well-typed expressions between the two kernels.
  4. Canonical serialisation of all values, so "identical" is byte equality and not a tolerance.
  5. The game header pins the definition hash and kernel version; a mismatch refuses to run instead of drifting.
- **Renderers** exist only in the browser. They consume explanations (plain data), so they are not part of the
  agreement problem.

## 5. How agents see representations

- **What an agent reads.** `obj.read()` is the one priced read. It returns the canonical state, wrapped. Everything
  after that is free local computation with the kernel in the sandbox:

```python
def act(obj, me):
    line = obj.read()                                   # priced, flat
    line.slope.m, line.plane.atX(3).y                   # free: any lens, any element, same names as rules use
    now = me.rule.explain(line)                         # free: my own score, terms and marks
    best = min((mv for mv in line.moves(max_bits=12)    # free: enumerate every codeword up to 12 bits
                if me.rule.score(mv.result) > now.score), key=lambda mv: mv.bits, default=None)
    if best: obj.commit(best)                           # priced: best.bits
    # or say it yourself:  obj.commit(line.twoPoint(0, 4).lift("P1", -3))    # 12 bits
```

- **What it pays for.** Reading: a flat price per object (how much is the energy economy's decision). Mutating: the
  codeword length. Thinking, switching lens and simulating: nothing.
- **Why changing lens is free.** Lenses are isomorphic and the kernel is in the sandbox, so anything priced could be
  recomputed from one read for nothing. A price that can be avoided by arithmetic teaches arithmetic avoidance, not
  mathematics. The lens matters where it is real: in what a change costs to say.
- **How finding a cheaper path becomes a skill.**
  1. Codes differ by lens by design (section 2.4): the same change costs 4, 6 or 8 bits, or 2 against 16.
  2. Lens domains have holes, so some targets are unreachable in one lens and one step away in another.
  3. Moves in different lenses do not commute, so multi-step routes (reflect, shift, reflect back) beat every
     single-lens route; the search space grows quickly past the 12-bit horizon the helper enumerates.
  4. Lens arguments are paid for, so choosing the pivot of `twoPoint` well is part of the price.
  5. The agent log carries a **regret line** computed after the fact: "paid 16 bits in slope; a 2-bit route
     existed in plane (reflect diagonal)". That is the teaching moment, and it needs no per-family code.
  6. The target itself is not given. Choosing which state to aim for, given one's own rule, limited energy and
     other players' unknown rules, remains the player's judgement even with an AI assistant writing the search.

## 6. Generic rendering

A renderer is written per **scene kind**, never per object type or rule family. The closed set to start with:
`formula`, `plane`, `strip`, `table`, `grid`, `tokens`, `graph`.

What a representation must supply:

- **Lens:** scene kind and its configuration (a formula template with slots; axes and grid for a plane; rows and
  columns for a grid), plus which elements are `base` (drawn always).
- **Element:** a mark from a closed vocabulary (`point`, `tick`, `segment`, `line`, `polygon`, `arc`, `span`,
  `arrow`, `slot`, `cell`, `token`, `node`, `edge`, `label`, `worked`), in scene coordinates as exact values, and a
  label format.
- **Rule:** `words`, the `show` list, and term names. Roles and priorities come from the trace.

What the generic renderer does with an explanation:

- **Highlight:** every mark with a role is drawn in its term's colour and shape; `same` links carry the highlight
  into other lenses.
- **Contributions:** term chips (name, value, sense) under the scene; `units` results become per-mark badges
  (a tick or a number on each pair, cell or term).
- **Nearest improvement:** generic. The kernel enumerates moves up to a bit horizon, keeps those that improve the
  score, and returns the one with fewest bits (ties: best score). The renderer draws the changed elements as a
  ghost in the *move's own lens* with a chip "4 bits · general: c − 1". The hint therefore also shows which lens
  makes the improvement cheap. A family may override it with an authored hint.
- **Phone-sized card:** the primary lens only, at a fixed aspect; at most five marks by priority (the gap that
  sets the score, the focus, the nearest target, then others); no in-scene labels; two term chips; the hint as a
  chip. The plane scene fits its viewport to the role-bearing marks, snaps to the grid, keeps the origin in view
  when it can, and draws edge arrows for marks outside.
- **Expanded view:** every lens in `show`, side by side (swipeable on a phone), all marks and labels, linked
  highlighting across lenses, the hint ghost, and a lens picker to add any other lens of the type for
  comparison.
- **Goal card:** `words` plus a worked example that is not authored: the kernel draws 32 births from a fixed seed,
  takes the best-scoring one for this rule and renders its explanation.

The formula scene owns mathematical typesetting (fractions, hiding a coefficient of 1, "+ −3" printed as "− 3",
a zero term greyed rather than removed so the slot stays addressable).

## 7. Where scoring plugs in

The scoring module sees every object type, finite or not, through one interface and nothing else:

```ts
interface ScoredSpace<S, Rule, Move> {
  definitionHash: string
  score(rule: Rule, s: S): Score                    // exact tuple; only its order may be used
  better(a: Score, b: Score): -1 | 0 | 1            // lexicographic, ⊥ worst
  decodeMove(s: S, bits: BitSource): { move: Move, bits: number } | null   // sampling = decoding random bits
  moves(s: S, maxBits: number): Iterable<{ move: Move, bits: number }>     // exact enumeration of short codewords
  step(s: S, move: Move): S | null                  // null = rejected
  birth(bits: BitSource): S                         // the type's reference distribution
  enumerate?(): Iterable<S>                         // finite types only: keeps today's exact rarity available
}
interface Valuation { value(space, rule, s): number /* millibits, integer */ }
```

Three properties make this enough for perturbation-based value without a finite state space:

- **The perturbation distribution is not a separate design.** A move's probability is 2^−bits because drawing a
  move *is* decoding random bits with the mutators' own codes. Mutator costing decisions enter value automatically.
- **It is exact.** Either sum over `moves(s, L)` with integer weights 2^(L−bits), or sample with a bit source
  seeded by hash(definition, rule, state). Both give the same number on every machine. A 12-bit horizon is at most
  8,191 evaluations per rule and state.
- **Only order is exposed.** A valuation that uses only `better` cannot be inflated by rescaling a term.

The server writes each player's value per object as a small document when the object changes. Nothing in the
type definition changes when the valuation theory does.

## 8. Extension and safety

- **New rule families by teachers or players: yes, and early.** A rule is a few lines of a total language over
  existing elements. Requirements: an editor with live explanation preview; the validator (kinds, bounds, static
  cost budget); an automatic playability report from birth samples (the score is not constant, not usually at its
  best, and improvable within the hint horizon); moderation of `words`; the family is public in its room, the dealt
  parameters stay private. No annotation and, with perturbation scoring, no rarity table has to be produced.
- **New lenses: possible, with review.** The lens laws are checked automatically, and the scene kind must be one of
  the closed set. A new lens is harmless until mutators are attached.
- **New mutators: private rooms only at first.** A mutator changes what every state of the type is worth, for
  every rule. The Kraft check and conformance corpus keep it safe; nothing keeps it balanced.
- **New primitives, scene kinds, mark kinds: engine developers only.** Each needs both kernels or a renderer.
- **Safety properties that make this possible:** no code execution, no recursion, bounded cost, bounded state,
  definitions addressed by hash, games pinned to a hash.

## 9. Alternatives, open questions, first prototype

### Rejected

| Alternative | Why not |
|-------------|---------|
| Rule families as hand-written TypeScript mirrored in Python (as the brief describes today) | two implementations per family, and the annotation is a third thing that can disagree with both |
| One source language compiled to TypeScript and Python | agreement must be re-established for every definition; generated code is harder to hash, pin and accept from teachers. Kept as an optimisation behind the interpreter |
| One kernel in WebAssembly, hosted everywhere | the strongest rival: identical by construction. Rejected for now because agent sandboxes and the server runtime would each need a host, and learners could not read it. I would reconsider it if the primitive set grows past a few hundred |
| Each representation stores its own state, with converters | identity and value become lens-dependent; n² converters |
| State is a symbolic expression tree with rewrite rules | right for a future "expression" type, wrong as the base: unbounded state and no cheap canonical form |
| Annotations authored per family | the brief asks for one API; a trace gives it for free and cannot drift |
| Priced lens switching or per-element reads | derivable for free from one read, so the price is fake |
| Floating point with tolerances | "identical everywhere" becomes "usually identical" |
| Costs as fractional −log₂ probabilities | no exact sampling or enumeration; integer codeword lengths are coarser but real |

### Open questions

1. **The line or the written equation.** I chose the line. `2y − 4x − 6 = 0` and `y = 2x + 3` are one object, and
   unsimplified forms cannot be states. If the owner wants "tidy this equation" to be play, the state must be the
   written form and every lens becomes lossy.
2. **Integer bits.** Codeword lengths make ±2 and ±3 cost the same and waste part of a bit on three-way choices.
   Is that granularity acceptable for the energy economy?
3. **Undefined scores.** ⊥ is worst here. The alternative is to exclude such states from a rule's value entirely.
4. **Hint strength.** A generic 12-bit hint may solve beginner rules outright. It may need to be a setting, or
   limited to the card and not exposed to agents.
5. **Bounds.** What the coefficient bounds should be, and whether hitting them (a rejected move) costs anything.
6. **Lossy lenses and stable part identity** (section 3) need rules before force diagrams or card animation.
7. **Type composition** needs a design before systems of equations.
8. **Phone performance** of `moves(s, 12)` for several rules across tens of objects.
9. **Surface syntax**: the textual form here, or a TypeScript builder over the same IR.

### What I would prototype first

1. **Two kernels and a fuzzer** (the highest risk). The IR, the primitives, and the line type with `general`,
   `slope` and `plane`, in TypeScript and Python, with the differential harness. Success: a million random
   evaluations with zero differences, and a kernel under 2,000 lines in each language.
2. **An existing finite type re-declared.** The digit grid with "opposite cells sum to x" in this format,
   reproducing today's scores and annotation exactly. Success means the format subsumes what exists and old games
   can be migrated.
3. **Annotation from trace.** The generic `plane` and `formula` renderers drawing `interceptNearPrime` on a
   phone-sized card and expanded, from the explanation alone, with the hint ghost.
4. **Move enumeration.** `moves(s, 12)` for the line type: count, time on a phone, and whether the three examples
   in section 2.4 come out as computed here.
