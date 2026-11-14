# Rule brainstorm E: unusual lenses on a line (14 November 2026)

One of five independent brainstorms of **layered rule families** for the line object type of engine v2
([spec.md](../spec.md), [owner-decisions.md](../owner-decisions.md)). This one's slant is surprise: lenses beyond the
spec's nine representations (§12.3) under which the line becomes a mirror, a crease, a saw cut, a fence, a word, a drum
pattern, a billiard shot, a loom, a gear, a ramp, a lamp, a coin puzzle, a tangent, a plumb line, a firefly, a cipher
and a chord. Seventeen lenses, nineteen families.

Every worked example below was computed exactly by
[`scripts/e_unusual_lenses_check.py`](scripts/e_unusual_lenses_check.py) (`python3`, fractions only, no engine). Where
the text says a line is the top of its ladder, the script's brute-force search over small coefficients supports it; a
claim that is proved rather than searched says so.

## 0. Conventions

- The line is y = mx + c over the rationals, m = p/q in lowest terms (q > 0); its primitive general form is
  a·x + b·y + c₀ = 0 with b > 0 (spec §12.1). Vertical lines are undefined in every lens here unless stated.
- A **score** is a tuple compared lexicographically, bigger is better (spec §4.2). Each family lists the **primary**
  first, then its **secondaries** in order. "min q" means the component is −q.
- Distances are **squared** wherever a square root would leave the rationals (`reach2`, `clear2`, `kite2`). The card
  says "distance"; the ladder's thresholds are on the square.
- "Peg" means a point with whole-number coordinates. "Whole" means an integer. dist(q, ℤ) is the distance from q to the
  nearest whole number.
- **Isomorphic** means the lens's coordinates determine the line and the line determines them (on a stated domain).
  **View** means the lens forgets something: many lines look the same through it. Views are not a weakness: "which lines
  share this picture?" is half of what they teach.
- **Status** per family: **A** = implementable under the representation contract as written (spec §3, §4, §11);
  **B** = the score is implementable as written, the drawing is not; **C** = the score itself needs a contract change.
  The letter-number codes (G1 … G10) refer to the gap list in §3.

## 1. The lenses

Each lens is a proposed `Representation`. "Coordinates" are the elements that determine the line (none for a view).
Element names are what a rule or a drawing points at.

| # | Id | The line becomes | Fixed furniture | Elements (name: meaning) | Isomorphic? |
|---|---|---|---|---|---|
| 1 | `mir` | a mirror | — | coordinate `twin`: the reflection of the origin (point). Dynamic `image(px, py)` (point), `foot(px, py)` (point: where the perpendicular from P meets the mirror), `gap2(px, py)` (squared distance from P to the mirror), `side(px, py)` (+1, 0, −1) | **Yes**, for lines not through the origin: the line is the perpendicular bisector of the origin and `twin`. Through the origin `twin` is the origin itself and the lens is blind to the direction |
| 2 | `fold` | a crease in a sheet of paper | the paper, the square [0, 8]² | `creaseA`, `creaseB` (points where the crease meets the paper's edge), `landing` (where the bottom-left corner lands: `mir.image(0, 0)`), `cornerTri` (the three side lengths of the triangle cut off at the top-left corner when the corner lands on the top edge), `flapArea` (area of the paper on the origin's side of the crease). Dynamic `landingOf(k)` for corner k | **Yes** where the crease crosses the paper (`creaseA`, `creaseB` are coordinates); it is `mir` with a boundary |
| 3 | `cut` | a saw cut across a chessboard | the board [0, 8]², unit squares (i, j), dark when i + j is even | coordinates `enter`, `exit` (points on the board's edge). Derived `below`, `above` (areas of the two pieces), `through` (unit squares whose inside the cut passes through), `darkThrough`, `lightThrough`, `wholeBelow`, `wholeAbove` (uncut squares each side) | **Yes** for lines that cross the board; the counts alone are a view |
| 4 | `dots` | a fence through a field of sheep | the 49 dots {0 … 6}² | `above`, `below`, `on` (counts), `clear2` (smallest squared distance from a dot not on the fence to the fence), `touchers` (dots at exactly that distance), `nearest` (point). Dynamic `side(px, py)` | **View**: every fence in the same gap between dots gives the same counts |
| 5 | `word` | a word, spelt by walking it | the open box (0, 6)² with its grid lines | `word` (symbol): walking left to right, write R at each vertical grid line x = 1 … 5, U (or D when descending) at each horizontal grid line y = 1 … 5, X when both are crossed at once (a peg). Derived `length`, `mismatch` (positions i in the first half with letter i ≠ letter from the end), `corners` (number of X). Dynamic `letter(i)` | **View**: a whole region of (m, c) spells the same word |
| 6 | `beat` | a drum pattern | a bar of eight beats, n = 1 … 8 | dynamic `hit(n)` = ⌊y(n)⌋ − ⌊y(n − 1)⌋ (the horizontal grid lines crossed during beat n). Derived `bar` (symbol: `x` where hit ≠ 0, `.` elsewhere), `hits` (number of `x` in the bar), dynamic `barAt(k)` (the k-th bar, beats 8k − 7 … 8k) | **View**: floors forget where between the grid lines the line is |
| 7 | `bil` | a billiard shot | the table [0, 8] × [0, 4]; the ball travels from the left cushion to the right, bouncing off top and bottom | with fold(t) = t mod 8, replaced by 8 − (t mod 8) when above 4: `start` = (0, fold(y(0))), `landing` = (8, fold(y(8))), `bounces` (number of multiples of 4 strictly between y(0) and y(8)), dynamic `bounce(k)` (point on a cushion), `leg(k)` (segment) | **View** of the unfolded line; isomorphic when `start`, the signed bounce count and `landing` are all kept and 0 ≤ c ≤ 4 |
| 8 | `loom` | threads on a ring of N pegs | N pegs numbered 0 … N − 1 round a circle (N is a rule parameter: 8, 9, 10 or 12) | dynamic `thread(n)` = y(n) mod N (a loose end when not whole). Derived `tour` (pegs visited following threads from peg 0 until a peg repeats or an end is loose), `reached` (different whole pegs that are thread ends), `lengths` (number of different thread lengths, a length being the shorter way round from n to `thread(n)`), `knots` (pegs threaded to themselves) | **View**: the line modulo N |
| 9 | `gear` | a gear train with a pointer and a turn counter | a dial | `driver` = \|p\| teeth, `driven` = q teeth, `step` = m mod 1 (how far the pointer moves per turn of the handle), dynamic `pointer(n)` = y(n) mod 1, `counter(n)` = ⌊y(n)⌋. Derived `home` (the first whole n ≥ 1 with y(n) whole: the pointer is straight up), `period` = q | **Yes** with the counter; the pointer alone is a view |
| 10 | `ramp` | a ramp with crates stacked under it | the floor y = 0, the wall x = 6, six columns n = 0 … 5 | dynamic `stack(n)` = max(0, ⌊min(y(n), y(n + 1))⌋). Derived `crates` = Σ stack, `air` (area under the ramp and above the floor for 0 ≤ x ≤ 6, minus `crates`), `touch` (whole x in 0 … 6 with y(x) whole and ≥ 0), `stairs` (number of different stack heights) | **View** |
| 11 | `lamp` | a lamp casting one ruler's shadow on another (a nomogram) | two parallel rulers of the same scale: x on the top one (height 1), y on the bottom one (height 0); a thread joins x to y(x) | coordinate `eye` (point): all threads pass through (c/(1 − m), m/(m − 1)). Derived `same` = c/(1 − m) (the reading that is the same on both rulers: the thread that hangs straight down), `lampHeight` = m/(m − 1). Dynamic `thread(x)` (segment), `lands(x)` = y(x) | **Yes** for m ≠ 1 (m = 1: the threads are parallel, the lamp is infinitely far away). Above the top ruler for m > 1, between the rulers for m < 0, below the bottom ruler for 0 < m < 1 |
| 12 | `coin` | a way-to-pay puzzle: "x coins worth a and y coins worth b make N" | the first quadrant's pegs | `coinX` = a, `coinY` = b, `bill` = N = −c₀, `ways` (pegs on the line with x, y ≥ 0), `single` (ways using one kind of coin), `evenWay` (1 when some way uses equally many of each), `fewest` (smallest x + y over the ways). Dynamic `way(k)` (point) | **Yes** where defined: it is `gen` read as a puzzle. Defined when a > 0 and b > 0 (a falling line) |
| 13 | `circ` | a chord or tangent of a circle | the circle x² + y² = 25 with its twelve rim pegs (±5, 0), (0, ±5), (±3, ±4), (±4, ±3) | `reach2` (squared distance from the centre to the line), `mid` (the chord's midpoint), `chord2` = 4(25 − reach2), `rimPegs` (0, 1 or 2 of the twelve on the line), coordinate `pole` (point: where the tangents at the chord's two ends cross, (−25a/c₀, −25b/c₀)), `kite2` = \|pole\|² − 25 (squared length of each tangent) | **Yes** through `pole` for lines not through the centre (pole and polar); `reach2`, `chord2` are views |
| 14 | `drop` | a wall with a plumb line dropped to it from a hook at the origin | — | coordinate `foot` (point where the perpendicular from the origin meets the line; same meaning as `circ.mid` and half of `mir.twin`), `drop2` = \|foot\|² (same meaning as `circ.reach2`), `plumb` (segment). Undefined through the origin ("the hook is on the wall") | **Yes** for lines not through the origin |
| 15 | `orbit` | a firefly: feed 0 into the machine, feed the answer back in, again and again | the diagonal y = x (for the cobweb), a jar \|x\| ≤ J | dynamic `hop(k)` = the k-th answer (hop(0) = 0), `web(k)` (the cobweb's k-th step, a segment), `escape(J)` (the first k with \|hop(k)\| > J; undefined after 64 hops). Coordinates `home` (the fixed point, = `lamp.same`), `pull` = m | **Yes** for m ≠ 1 through (`home`, `pull`): y = home + pull·(x − home) |
| 16 | `cipher` | a code wheel on the alphabet | 26 letters round a wheel, A = 0 … Z = 25 | dynamic `encode(k)` = y(k) mod 26 (undefined between letters), `write(word)` (symbol). Derived `letters` (different letters produced), `selfUndo` (letters k with encode(encode(k)) = k), `stay` (letters encoded as themselves) | **View**: the line modulo 26 |
| 17 | `music` | a chord grown from one note | a fundamental note of frequency 1 | dynamic `note(k)` = `orbit`'s k-th hop started from 1 instead of 0 (note(0) = 1), `interval(k)` = note(k + 1)/note(k). Derived `chord3`, `chord4` (the first three or four notes as the smallest whole-number ratio, symbol), `rough3`, `rough4` (the sum of that ratio's numbers: smaller is sweeter), `climbs` (how many of note(2) > note(1), note(3) > note(2) hold) | **Yes**: note(1) and note(2) give the line when note(1) ≠ 1 |

Three of these are the same hidden coordinate in different clothes: `mir.twin`, `drop.foot` and `circ.pole` all lie on
one ray from the origin (twin = 2·foot; pole = 25·foot/\|foot\|²). And `lamp.same` = `orbit.home`. A table of shared
`meaning` ids (spec §3) would say so, and the views would cross-highlight them: the same point is "my reflection", "the
foot of my plumb line" and "the midpoint of my chord".

## 2. The families

### 1. Constellation Mirror (`mir`)

- **Card.** "The line is a mirror. As many stars as possible should have their reflection land exactly on another star."
- **Parameters.** A constellation S of pegs. Example S = {(1, 3), (3, −1), (5, 0), (3, 4), (−1, 2), (1, −2)}.
- **Primary.** max `twins` = #{s ∈ S : `mir.image(s)` ∈ S and ≠ s}. A child checks it by folding the picture in her head.
- **Secondaries.** (1) max the stars lying on the mirror (#{s : `mir.gap2(s)` = 0}): a star on the glass is its own
  twin. (2) `peg`: max pegs of [−6, 6]² on the mirror. (3) `drop`: min `mir.gap2(0, 0)`: the mirror passes as close to
  the middle of the sky as it can.
- **Example.** y = x/2: all six stars pair up ((1, 3) ↔ (3, −1), (5, 0) ↔ (3, 4), (−1, 2) ↔ (1, −2)); score
  (6, 0, 7, 0). The perpendicular mirror y = −2x + 5 pairs four and carries two on the glass: (4, 2, 6, −5). The
  parallel near miss y = x/2 + ½ pairs none: (0, 0, 6, −⅕).
- **Compact drawing.** The plane with the six stars; the mirror; a thin link from each star to its image, solid where
  the image is a star, dotted with a hollow ring where it is not.
- **Teaches.** A symmetry axis is the perpendicular bisector of every matched pair at once; reflection keeps distances;
  two different mirrors can each be "partly right".
- **Degenerate, runaway.** A constellation with no axis tops out at 2 (any bisector of two stars). No runaway: twins is
  bounded by \|S\|. Vertical axes are unreachable in the Z domain: deal constellations whose axis has a slope.
- **Status: A.** Stars are rule parameters; `image(px, py)` is a dynamic point element with rational arguments;
  the links are `measure` marks. (The stars as scenery before any mark is drawn: G1.)

### 2. Haga's Fold (`fold`)

- **Card.** "The line is a crease. Fold the paper along it: the bottom-left corner should land exactly on the top edge."
- **Primary.** min \|landing.y − 8\| + max(0, −landing.x, landing.x − 8) (how far the corner lands from the top edge).
- **Secondaries.** (1) min dist(landing.x, ℤ): it lands on a whole tick of the edge. (2) max the number of whole
  side lengths in `cornerTri` (0 … 3; a triangle with a zero side counts 0). (3) min dist(`creaseB`.y, ℤ): the crease
  leaves the paper at a whole tick too.
- **Example.** y = −x/2 + 5. The corner lands on (4, 8), the midpoint of the top edge; the corner triangle has sides
  3, 4, 5; the crease runs from (0, 5) to (8, 1). Score (0, 0, 3, 0). Landing on (2, 8) instead (y = −x/4 + 17/4):
  sides 15/4, 2, 17/4, score (0, 0, 1, −¼). Landing on (6, 8) (y = −3x/4 + 25/4): sides 7/4, 6, 25/4, the same score.
- **Compact drawing.** The paper square; the crease; the folded flap drawn turned over in a second tint; a dot where the
  corner lands; the corner triangle's three sides labelled.
- **Teaches.** Folding is reflecting. Landing the corner at (t, 8) gives a triangle with sides (64 − t²)/16, t,
  (64 + t²)/16: a Pythagorean triple for every rational t (8-15-17 at t = 2, 3-4-5 at t = 4, 7-24-25 at t = 6), and
  only t = 4 makes all three whole. This is Haga's first theorem from origami.
- **Degenerate, runaway.** Folding along y = 4 (t = 0) or along the diagonal (t = 8) lands on the edge's ends with a
  flat triangle: primary 0, secondary (2) 0. Bounded: no runaway.
- **Status: B.** Elements are points and numbers. The drawing needs the paper (G1) and the flap as a region (G2).

### 3. Fair Cut (`cut`)

- **Card.** "The line saws the chessboard in two. The two pieces should have the same area."
- **Primary.** min \|`cut.below` − 32\|.
- **Secondaries.** (1) max `darkThrough` − `lightThrough`: the saw should spoil dark squares, not light ones.
  (2) min `through`: spoil as few squares as possible. (3) max the number of `enter`, `exit` that are pegs.
- **Example.** y = x: below = 32; the cut runs through the eight squares of the long diagonal, all dark, and ends on
  two corners. Score (0, 8, −8, 2). y = x/2 + 2 is fair too, but spoils four of each colour: (0, 0, −8, 2). y = 4 is
  fair and spoils nothing: (0, 0, 0, 2). y = x + 1 spoils seven light squares and is not fair: (−15/2, −7, −7, 1).
- **Compact drawing.** The board, the two pieces tinted, the spoiled squares hatched, two area labels.
- **Teaches.** Every line through the centre halves the square (the family of fair cuts is a pencil of lines, not one
  line); the squares a line crosses and their colours; a point symmetry pairs spoiled squares of the same colour, so
  dark − light is always even on a fair cut.
- **Degenerate, runaway.** Lines missing the board score −32. Bounded. Among fair cuts with \|p\| ≤ 24, q ≤ 12 the
  diagonal is the unique best.
- **Status: B.** Scores from numbers. Drawing needs the board (G1) and the two pieces as regions (G2).

### 4. Sheep Fence (`dots`)

- **Card.** "The line is a fence across a field of 49 sheep. Exactly N sheep should be above the fence."
- **Parameters.** N ∈ {6, 10, 15} (triangular numbers, which only a diagonal fence can cut off cleanly); N = 14 or 21 for a
  beginner's deal that a flat fence wins.
- **Primary.** min \|`dots.above` − N\|.
- **Secondaries.** (1) min `on`: no sheep standing on the fence. (2) max `clear2`: the fence leaves the widest
  possible street on its tightest side. (3) max `touchers`: as many sheep as possible stand exactly on the street's kerb.
- **Example (N = 10).** y = x + 5/2: the ten sheep above are 4 + 3 + 2 + 1 in the top-left corner; nearest sheep at
  squared distance ⅛ (nine of them, four above and five below). Score (0, 0, ⅛, 9). y = x + 9/4 has the same ten above
  and a tighter street (1/32). The mirror-image fence y = −x + 17/2 ties with the example.
- **Compact drawing.** The dot field, the fence, the street as a pale band of half-width √clear2, the touchers ringed.
- **Teaches.** A line separates; the same split has a whole family of fences and one best one (the widest margin: the
  idea behind a support-vector machine); for a direction (a, b) the rows of dots are 1/√(a² + b²) apart, so the widest
  street belongs to the simplest direction that achieves the count.
- **Degenerate, runaway.** N a multiple of 7 is won by a horizontal fence (clear2 = ¼, fourteen touchers): fine as a
  beginner's deal. Bounded.
- **Status: A** for the score; the dots as scenery and the band are G1, G2.

### 5. Palindrome Path (`word`)

- **Card.** "Walk the line across the box and spell R for every wall line and U for every floor line you cross (X for
  a corner). The word should read the same backwards."
- **Primary.** min `word.mismatch`.
- **Secondaries.** (1) max `length`. (2) max `corners`. (3) `si`: min \|p\| + q, the simplest gradient.
- **Example.** y = ¾x + ¾ spells **URURXRURU**: a palindrome of nine letters through the corner (3, 3). Score
  (0, 9, 1, −7). y = x + ½ spells URURURURUR: five mismatches. y = x spells XXXXX: (0, 5, 5, −2).
  y = ⅔x + 1 spells RURXRUR: (0, 7, 1, −5).
- **Compact drawing.** The 6 × 6 box, the line, a letter on each crossing, and the word printed underneath with its
  two halves facing each other.
- **Teaches.** A half-turn about the box's centre reverses the walk and keeps every letter, so every line through the
  centre spells a palindrome: symmetry of the word is symmetry of the picture. A ten-letter palindrome would need five
  U and five R, and an even palindrome has an even number of each letter: nine is the proved top (the script finds
  none longer), reached by gradients ±¾ and ±4/3 through the centre.
- **Degenerate, runaway.** The empty word and one-letter words are palindromes: the primary is cheap, the secondaries
  carry the value (deal it with the ladder's first rungs on length). Bounded.
- **Status: A** for the score (numeric derived elements); the word is a `symbol`. Drawing letters on crossings needs
  an indexed element with a state-dependent count (G6) and the box (G1).

### 6. Tresillo (`beat`)

- **Card.** "Each time the line climbs past a whole number, the drum sounds. The first bar of eight beats should play
  x . . x . . x ."
- **Parameters.** The target bar: `x..x..x.` (tresillo), `x.xx.xx.` (cinquillo), `x...x...`, `x.x.x.x.`.
- **Primary.** max the number of beats n = 1 … 8 where `beat.bar` agrees with the target.
- **Secondaries.** (1) max `streak`: how many of beats 9 … 32 go on agreeing with the repeated target before the first
  wrong one (0 … 24). (2) `peg`: max hits of the first bar that are clean (y(n) is whole exactly on the beat). (3) `table`:
  min \|⌊y(0)⌋\|: the drum starts on the ground floor.
- **Example.** y = ⅜x + ⅝ plays x . . x . . x . for ever: (8, 24, 1, 0). y = ⅖x + ⅗ plays x . . x . x . . and agrees on
  six beats: (6, 2, 2, 0). The same gradient started elsewhere, y = ⅜x + ⅞, plays the rotation x . x . . x . . :
  (4, 2, 1, 0).
- **Compact drawing.** The line over an eight-column grid with a dot where it crosses each horizontal grid line; under
  it a strip of eight cells, filled where the drum sounds, with the target strip beneath and mismatches ringed.
- **Teaches.** The gradient is hits per beat (three in eight is ⅜); the intercept is the rotation of the pattern; a
  straight line always spreads its hits as evenly as possible (the patterns a line can play are exactly the Euclidean
  rhythms), and only a gradient of exactly ⅜ keeps the tresillo going.
- **Degenerate, runaway.** An uneven target such as `xx......` cannot be matched on all eight beats: the ladder's top
  rung is empty and calibration drops it (spec §4.4); deal only Euclidean targets. For m > 1 a beat can hold two hits
  (`hit(n)` = 2): it still shows as `x`. Bounded.
- **Status: A.** `hit(n)` is a dynamic number; the strip is the `sequence` scene with dots. The target is a rule
  parameter (a string). Being able to hear it is G10.

### 7. Trick Shot (`bil`)

- **Card.** "The line is a billiard shot from the left cushion. The ball should finish in the bottom-right pocket."
- **Parameters.** The pocket height T ∈ {0, 2, 4} on the right cushion; the cushion count B ∈ {1, 2, 3}.
- **Primary.** min \|`bil.landing`.y − T\|.
- **Secondaries.** (1) min \|`bounces` − B\|: off exactly B cushions. (2) max the bounces that touch a cushion at a
  whole x. (3) min `start`.y: shoot from the bottom-left pocket.
- **Example (T = 0, B = 3).** y = 2x: the ball leaves (0, 0), touches the top at x = 2, the bottom at x = 4, the top at
  x = 6, and drops into (8, 0): a W. Score (0, 0, 3, 0). y = 3x/2 + 1 also makes three cushions but finishes at height
  3: (−3, 0, 1, −1). For T = 2, y = 7x/4 lands exactly with three cushions but none at a whole x: (0, 0, 0, 0).
- **Compact drawing.** The 8 × 4 table, the zigzag path, the pocket ringed, a faint copy of the unfolded straight line
  climbing through stacked mirror images of the table.
- **Teaches.** A bouncing path is a straight line through reflected copies of the room; the height reached is y(8)
  folded; steeper means more cushions (each cushion is one more multiple of 4 passed).
- **Degenerate, runaway.** Without secondary (1) steeper and steeper shots also land in the pocket (y = x, 2x, 3x, 4x …
  from the corner all drop into it, with 1, 3, 5, 7 … cushions): the cushion count is what stops the runaway, and the
  confining price makes steep shots dear in any case. A shot along a cushion (m = 0, c = 0) lands with no bounce.
- **Status: B.** Scores from numbers and points. The path is a variable number of segments (G6) and the table is
  scenery (G1).

### 8. One Thread (`loom`)

- **Card.** "Tie a thread from every peg n to peg y(n), counting round the ring. Starting at peg 0 and following the
  threads, visit as many pegs as possible before you come back to one you have seen."
- **Parameters.** N ∈ {8, 9, 10, 12}.
- **Primary.** max `loom.tour`.
- **Secondaries.** (1) max `reached`. (2) max `lengths`: threads of as many different lengths as possible (a tangle,
  not a star). (3) `si`: min \|m\| + \|c\|.
- **Example (N = 9).** y = −2x + 1 visits 0, 1, 8, 3, 4, 2, 6, 7, 5 and returns to 0: one thread through all nine
  pegs, with three different thread lengths. Score (9, 9, 3, −3). y = 4x + 1 also tours all nine: (9, 9, 3, −5).
  y = x + 4 tours all nine as a star with one thread length: (9, 9, 1, −5). y = 3x + 1 gets stuck after 0, 1, 4:
  (3, 3, 5, −4).
- **Compact drawing.** Nine pegs on a circle, nine chords, the tour from peg 0 drawn heavier with small order numbers.
- **Teaches.** Clock arithmetic; when multiplying and adding round a ring visits everything (for a full tour c must share no factor with N and
  m − 1 must be divisible by every prime dividing N, and by 4 when N is; so on the 12-ring only m ≡ 1 works and every full
  tour is a star, while the 9-ring allows m = 4 and m = 7 ≡ −2). This is how the simplest random-number generators are
  built.
- **Degenerate, runaway.** Fractional lines give loose ends and short tours; the family belongs on the Z domain.
  Infinitely many lines are the same modulo N: secondary (3) picks the plainest, and the read-length surcharge prices
  the rest.
- **Status: C (G3, G4).** The numbers are dynamic elements with N as an argument, so the score is computable as
  written, but there is no dial scene (G3) and `layout(state, site)` cannot know which N the rule deals in (G4).

### 9. Homecoming Gear (`gear`)

- **Card.** "Each turn of the handle moves the pointer m of a turn round its dial. The pointer should point straight
  up again for the first time after exactly T turns."
- **Parameters.** T ∈ {5, 7, 8, 12}.
- **Primary.** min \|`gear.home` − T\| (WORST when the pointer is never straight up after a whole number of turns).
- **Secondaries.** (1) min `period` − `home`: it comes home every T turns, not just once. (2) min \|`step` − ½\|: the
  pointer swings as near to half-way round as it can each turn. (3) min \|`counter(home)`\|: the turn counter reads as
  near zero as possible at homecoming.
- **Example (T = 7).** y = (3/7)x − 3: the pointer shows 3/7, 6/7, 2/7, 5/7, 1/7, 4/7 and, on the seventh turn, 0, with
  the counter at 0. Score (0, 0, −1/14, 0). y = x/7 is home at 7 too but creeps: (0, 0, −5/14, −1). y = x/9 + 2/9 is
  first home at 7 and then not again until 16: (0, −2, −7/18, −1). y = x/2 + ⅓ is never home: WORST.
- **Compact drawing.** A dial with seven ticks, the pointer's stops joined in order (a seven-pointed star for 3/7),
  two meshing gears labelled with their tooth counts, a small counter window.
- **Teaches.** The denominator of the gradient is a period; the numerator chooses the star; the intercept is a phase,
  and a phase that is not a multiple of 1/q means never.
- **Degenerate, runaway.** Whole gradients are home at once (home = 1). Adding a whole number to m or c changes
  nothing on the dial: secondary (3) and the surcharge pin it.
- **Status: B.** Numbers only; needs a dial scene (G3).

### 10. Crate Ramp (`ramp`)

- **Card.** "The line is a ramp. Stack unit crates under it on the floor, between the corner and the wall at 6. Exactly
  N crates should fit."
- **Parameters.** N ∈ {10, 15, 20} (not multiples of 6, which a flat shelf wins).
- **Primary.** min \|`ramp.crates` − N\|.
- **Secondaries.** (1) min `air`: as little wasted space under the ramp as possible. (2) `peg`: max `touch`, crate
  corners touching the ramp. (3) max `stairs`: as many different stack heights as possible.
- **Example (N = 10).** y = x − 1: stacks 0, 0, 1, 2, 3, 4; air 5/2; the ramp touches a crate corner at six whole x;
  five different heights. Score (0, −5/2, 6, 5), the best found. y = (4/5)x holds the same ten crates under more air:
  (0, −22/5, 2, 5).
- **Compact drawing.** The floor and wall, the crates as squares, the ramp, the air shaded, touching corners dotted.
- **Teaches.** Counting pegs under a line (the sum of floors); area against count (the air is what the floors throw
  away); a ramp through many pegs wastes least.
- **Degenerate, runaway.** A descending ramp is the mirror image (y = −x + 5 ties). Bounded by N.
- **Status: B.** `stack(n)` is a dynamic number. Crates and air are regions (G2).

### 11. Lamp and Rulers (`lamp`)

- **Card.** "Join each number x on the top ruler to y on the bottom ruler with a thread. One thread hangs straight
  down: it should be the one at T."
- **Parameters.** T ∈ {−4, 3, 6, 10}; one deal uses T = −40 with the real Celsius and Fahrenheit rulers.
- **Primary.** min \|`lamp.same` − T\| (WORST for m = 1, when no thread or every thread hangs straight).
- **Secondaries.** (1) min dist(`lampHeight`, ℤ): the lamp where all threads cross hangs a whole number of ruler-gaps
  up or down. (2) `table`: max the number of different whole ticks reached by the threads from x = −5 … 5. (3) min
  \|`lands(0)`\|: the thread from 0 is short.
- **Example (T = 6).** y = 2x − 6: the thread at 6 is vertical; the lamp is at (6, 2), one gap above the top ruler;
  all eleven threads land on whole ticks. Score (0, 0, 11, −6). y = (3/2)x − 3 has its lamp at height 3 but only five
  whole landings: (0, 0, 5, −3). y = −x + 12 crosses its threads half-way between the rulers: (0, −½, 11, −12).
  Celsius to Fahrenheit, y = (9/5)x + 32 with T = −40: lamp height 9/4, score (0, −¼, 3, −32).
- **Compact drawing.** Two rulers, eleven threads meeting at the lamp, the vertical thread bold, the lamp a small sun.
- **Teaches.** A fixed point (−40° is the same on both scales); a gradient is a magnification, seen as how far the
  lamp is (height m/(m − 1): 2 for doubling, ½ for a flip, far away as m nears 1); a line is a projection from a point.
- **Degenerate, runaway.** m = 0 puts the lamp on the bottom ruler and sends everything to T: primary 0, secondary
  (2) scores 1. m near 1 sends `same` to infinity: far from T, so it scores badly rather than running away.
- **Status: A** on the `plane` scene (threads are dynamic segments, the lamp a point); a `rulers` scene would be
  truer (G3).

### 12. Prime Threads (`lamp`, read as a number-line map)

- **Card.** "Tie threads from the first six primes on the top ruler. As many as possible should land on different
  primes, and none on the prime it started from."
- **Primary.** max the number of different primes among `lands(p)`, p ∈ {2, 3, 5, 7, 11, 13}, not counting a prime
  that lands on itself.
- **Secondaries.** (1) min the largest landing (short threads, small primes). (2) `table`: max the primes among
  y(1) … y(13). (3) `si`: min \|c\|.
- **Example.** y = 6x + 1 sends 2, 3, 5, 7, 11, 13 to 13, 19, 31, 43, 67, 79: six primes. Ten of y(1) … y(13) are prime.
  Score (6, −79, 10, −1), the best with \|m\| ≤ 60, \|c\| ≤ 400. y = 2x + 1 lands four: (4, −27, 8, −1). y = x lands
  none (every prime stays put); y = 17 lands one.
- **Compact drawing.** The two rulers with the six primes lit on top; six threads; landings ringed green when prime.
- **Teaches.** Why m must be even and c odd; why m = 2 and m = 4 cannot work (among the six landings one is always a
  multiple of 3) and m = 6 can; the pattern 6k + 1.
- **Degenerate, runaway.** Without "different" a flat line wins trivially; without secondary (1) large coefficients
  offer endless near-tops. This is the one family here that is number theory, kept because the brief names it.
- **Status: A** today, with `mach.out(q)` or `table.y(q)`.

### 13. Exact Change (`coin`)

- **Card.** "Read the line as a shop puzzle: x coins worth a and y coins worth b pay a bill of N. There should be
  exactly W ways to pay."
- **Parameters.** W ∈ {2, 3, 4}.
- **Primary.** min \|`coin.ways` − W\| (WORST for a rising or flat line: one coin would have to be owed back).
- **Secondaries.** (1) min `single`: every way needs both kinds of coin. (2) max `evenWay`: one way uses the same
  number of each. (3) min `bill`: the cheapest such bill.
- **Example (W = 3).** 3x + 4y = 35, that is y = −¾x + 35/4: the ways are (1, 8), (5, 5), (9, 2). Score (0, 0, 1, −35),
  the best with coins up to 12 and bills up to 120 (4x + 3y = 35 ties). 2x + 3y = 17 has three mixed ways and no even
  one: (0, 0, 0, −17).
- **Compact drawing.** The first quadrant's pegs, the line, the ways as filled pegs each with a small pile of the two
  coins, the diagonal y = x dotted.
- **Teaches.** Whole-number solutions step by (b, −a) along the line; coins that share a factor cannot pay most bills;
  a bill divisible by a coin has a single-coin way; an even way means N is a multiple of a + b.
- **Degenerate, runaway.** Coins of 1 make every bill payable with one kind (secondary (1) punishes it). Without
  secondary (3) the bill runs away.
- **Status: A.** Elements are numbers and points on the `plane` or `pegboard` scene.

### 14. Kiss the Circle (`circ`)

- **Card.** "The line should just touch the circle of radius 5, without cutting it."
- **Primary.** min \|`circ.reach2` − 25\|.
- **Secondaries.** (1) min the squared distance from `mid` to the nearest rim peg: it touches at a peg. (2) `tri`: min
  `tri.area`: the corner of the plane it cuts off is as small as possible. (3) `int`: max p + q, both intercepts positive.
- **Example.** 3x + 4y = 25, that is y = −¾x + 25/4, touches at the peg (3, 4); it cuts off a triangle of area 625/24.
  Score (0, 0, −625/24, 175/12). y = −(20/21)x + 145/21 is a tangent too, with a smaller triangle (4205/168), but it
  touches between pegs: (0, −10/29, …). y = −x + 7 misses by ½ in reach2: (−½, −½, −49/2, 14).
- **Compact drawing.** The circle with twelve rim pegs, the tangent, the radius to the touching point with its
  right-angle mark, the intercept triangle tinted.
- **Teaches.** A tangent is perpendicular to the radius; a rational tangent touches at a rational point of the circle,
  which is a Pythagorean triple (3-4-5 here, 20-21-29 for the near miss); the smallest corner triangle belongs to the
  45° tangent, which no rational line reaches.
- **Degenerate, runaway.** Without secondary (1), secondary (2) is an endless climb towards area 25 through ever larger
  triples: a good runaway to show the surcharge working, but it has no top rung. The four tangents at (±5, 0), (0, ±5)
  have no intercept triangle.
- **Status: C (G5).** `tri.area` is undefined for the axis-parallel tangents and an undefined term makes the whole
  score WORST (spec §4.2), which would rank y = 5 below a line that misses the circle. The circle is scenery (G1).

### 15. Tangent Kite (`circ`, the pole)

- **Card.** "The line cuts the circle at two points. Draw the two tangents there: they should cross exactly on a peg."
- **Primary.** min the squared distance from `circ.pole` to the nearest peg (WORST when the line misses the circle or
  passes through its centre).
- **Secondaries.** (1) max `rimPegs`: the chord runs from rim peg to rim peg. (2) min `kite2`: the kite made by the
  centre, the two ends and the pole is as small as possible. (3) `tri`: min `tri.area`.
- **Example.** x + y = 5, that is y = −x + 5: the chord joins (5, 0) and (0, 5), the tangents cross at (5, 5), and the
  kite is a square of side 5. Score (0, 2, −25, −25/2). 7x + y = 25 joins (3, 4) and (4, −3) with pole (7, 1), a tilted
  square: (0, 2, −25, −625/14). x + 2y = 5 joins (5, 0) and (−3, 4) with pole (5, 10) and a long kite: (0, 2, −100, −25/4).
  There are 32 non-vertical peg-to-peg chords whose pole is a peg.
- **Compact drawing.** The circle, the chord, two tangents meeting at the pole, the kite tinted, right-angle marks at
  the two ends.
- **Teaches.** Every line has a point that stands for it (pole and polar): a far line has a near pole and a near line a
  far one; the kite is a square exactly when the two radii are perpendicular.
- **Degenerate, runaway.** Lines close to the centre throw the pole far away onto pegs (x + y = 1 has pole (25, 25)):
  secondary (2) and the pole's distance keep them low. For most lines the two ends are irrational.
- **Status: B.** The score uses rational elements only. The tangents' feet are generally irrational, so the drawing
  needs approximate geometry (G8) and a circle (G1).

### 16. Plumb Line (`drop`)

- **Card.** "Drop a plumb line from the origin straight onto the line. Its foot should land exactly on a peg."
- **Primary.** min the squared distance from `drop.foot` to the nearest peg (WORST through the origin).
- **Secondaries.** (1) `int`: max the number of whole intercepts (0 … 2). (2) min the distance from `drop2` to the
  nearest square number: the plumb line has a whole length. (3) `tri`: min `tri.area`.
- **Example.** x + y = 2, that is y = −x + 2: foot (1, 1), intercepts 2 and 2, drop2 = 2 (one away from a square), area
  2. Score (0, 2, −1, −2). 2x + y = 5: foot (2, 1), one whole intercept: (0, 1, −1, −25/4). 3x + 4y = 25: foot (3, 4),
  a plumb line of length exactly 5, no whole intercept: (0, 0, 0, −625/24). All three secondaries are first met
  together at 4x + 3y = 300 (foot (48, 36), length 60): (0, 2, 0, −3750).
- **Compact drawing.** The line, the plumb segment from the origin with a right-angle mark, the foot ringed on its
  peg, the two intercepts ticked.
- **Teaches.** The shortest path to a line is perpendicular; for a·x + b·y = N the foot is N·(a, b)/(a² + b²), so a peg
  foot needs a² + b² to divide N; a whole length needs a Pythagorean direction.
- **Degenerate, runaway.** The far summit at N = 300 costs many bits of read length: a deliberate "rarer structure
  costs more" top that calibration may report unreachable; the ladder should stop secondary (2) at "within 1". In the
  Z domain a flat line y = k has a peg foot and a whole plumb line but no intercept triangle (G5 again).
- **Status: A** except for the undefined area on flat lines (G5), which reordering the secondaries avoids.

### 17. Firefly Jar (`orbit`)

- **Card.** "Feed 0 into the machine, then feed each answer back in. The firefly should stay inside the jar (between
  −10 and 10) for four hops and escape on exactly the fifth."
- **Parameters.** K ∈ {4, 5, 6}; the jar J = 10.
- **Primary.** min \|`orbit.escape(10)` − K\| (WORST if it has not escaped after 64 hops).
- **Secondaries.** (1) max the whole numbers among hop(1) … hop(K). (2) max the zigzags: pairs of consecutive hops on
  opposite sides of 0. (3) min \|hop(K)\|: it only just escapes.
- **Example (K = 5).** y = −2x + 1 hops 1, −1, 3, −5, 11: whole every time, across zero every time, out by one. Score
  (0, 5, 4, −11), the best found. y = x + 11/5 hops 11/5, 22/5, 33/5, 44/5, 11: (0, 1, 0, −11). y = 2x + 1 hops
  1, 3, 7, 15 and is out a hop early: (−1, 4, 0, −15).
- **Compact drawing.** The cobweb: the line and the diagonal y = x, the staircase or spiral of `web(k)` segments from
  0, the jar as a square; or the same five hops as arcs on a number line.
- **Teaches.** Iteration; a negative gradient spirals and a positive one climbs; \|m\| > 1 escapes and \|m\| < 1 is
  pulled home to the fixed point c/(1 − m) (if that is inside the jar the firefly never leaves); the hops are
  c·(1 + m + … + m^(k−1)).
- **Degenerate, runaway.** m = 1 marches out in steps of c. \|m\| < 1 with the fixed point inside the jar never escapes:
  WORST, as does c = 0. Bounded.
- **Status: A.** `hop(k)` and `web(k)` are dynamic elements on the `plane` scene (count K is a rule parameter).

### 18. Cipher Wheel (`cipher`)

- **Card.** "The line is a secret code: letter number k becomes letter number y(k), counting round the alphabet. It
  should turn GIRL into TRIO."
- **Parameters.** (plain, target) ∈ {(GIRL, TRIO), (HOLY, SLOB), (WIZARD, DRAZIW), (COLD, FROG), (HAL, IBM)}.
- **Primary.** max the letters of the plain word that come out right.
- **Secondaries.** (1) max `letters`: the code can be undone (26 different letters). (2) max `selfUndo`: the same
  wheel decodes (26 when coding twice gives the message back). (3) `si`: min \|m\| + \|c\|: the plainest key.
- **Example.** y = −x − 1 writes TRIO: (4, 26, 26, −2). It is the alphabet backwards (A ↔ Z, B ↔ Y), the same key
  that turns HOLY into SLOB and WIZARD into DRAZIW, its own spelling reversed. y = 25x + 25 is the same wheel with a
  dearer key: (4, 26, 26, −50). COLD → FROG is y = x + 3, which cannot undo itself: (4, 26, 0, −4). A key with an even
  m, such as y = 2x + 7, uses only 13 letters and cannot be decoded.
- **Compact drawing.** Two concentric letter rings (plain outside, code inside), the plain word's letters joined to
  their codes, the produced word printed over the target with wrong letters struck.
- **Teaches.** Remainders; why the multiplier must share no factor with 26; a falling gradient reverses the alphabet;
  many lines are one cipher.
- **Degenerate, runaway.** A word pair with no affine key tops out below its length (two letters can always be hit).
  Fractional lines fall between letters. Keys repeat every 26 in m and in c: secondary (3) and the surcharge.
- **Status: B.** Word parameters live in the rule; `encode(k)` is a dynamic number; `write` is a symbol. Needs a
  wheel scene (G3) and non-rational element arguments if `write(word)` is to be an element (G6).

### 19. Sweet Chord (`music`)

- **Card.** "Start on note 1 and let the machine give the next note, and the next. The second note should be a perfect
  fifth above the first (3/2)."
- **Parameters.** The interval I ∈ {3/2 (fifth), 5/4 (major third), 4/3 (fourth)}.
- **Primary.** min \|`music.note(1)` − I\|.
- **Secondaries.** (1) max `climbs`: the third and fourth notes keep rising. (2) min `rough3`: the first three notes,
  as whole numbers, are as small as possible. (3) min `rough4`.
- **Example (fifth).** y = x + ½ plays 1, 3/2, 2, 5/2, the chord 2 : 3 : 4 : 5. Score (0, 2, −9, −14), the best with
  denominators up to 12. y = (3/2)x stacks fifths, 4 : 6 : 9: (0, 2, −19, −65). y = 2x − ½ plays 2 : 3 : 5: (0, 2, −10, −19).
  For the major third the top is y = x + ¼, the major chord 4 : 5 : 6 (then 7).
- **Compact drawing.** Four bars whose heights are the notes, the whole-number ratio underneath, a faint cobweb beside
  it; a play button if G10 is taken up.
- **Teaches.** The sweetest chords are equal steps in frequency, a gradient of exactly 1 (the overtone series is the
  line y = x + c), while equal musical intervals are a gradient with c = 0; chords are ratios of small whole numbers.
- **Degenerate, runaway.** m = 0 repeats one note and m < 0 can go below zero: `climbs` puts them last. Bounded below
  by the proof that 2 : 3 : c needs c ≥ 4.
- **Status: A** for score and a bar drawing on `sequence`; sound is G10.

## 3. What the representation contract lacks

Collected from the families above, in order of how many families each blocks.

| Gap | What is missing in spec §3, §4, §11 | Blocks or weakens | Smallest change |
|---|---|---|---|
| **G1 Scenery** | Every scene primitive is tied to an element of the state (§11.1). Lenses have fixed furniture that is not a function of the line: a chessboard, a paper square, a dot field, a circle with rim pegs, a billiard table, two rulers. Rule-parameter furniture (a constellation, a pocket) can be faked with `candidate` marks on dynamic elements, but only for points | 1, 2, 3, 4, 5, 7, 10, 14, 15 | `SceneData` gains `scenery: SceneryItem[]` (grid, box, circle, ruler, polygon), not tied to elements and not citeable by marks |
| **G2 Regions and paths** | `ElementValue` has number, point, segment, symbol. `PlaneItem` already lists `draw: "region"` but no element value can be a region. The two pieces of a cut, a folded flap, a street, crates, a bouncing path, a cobweb need polygon and polyline values | 2, 3, 4, 7, 10 | add `{ kind: "polygon"; points }` and `{ kind: "path"; points }` |
| **G3 Scene kinds** | `SceneKind` is a closed list of seven. Missing: `dial` (loom, gear, cipher wheel), `rulers` (two parallel scales with threads), `strip` (a row of letters or beats; `sequence` with `picture: "dots"` nearly serves) | 8, 9, 11, 12, 18 | add `dial` and `rulers`; let `sequence` terms hold symbols |
| **G4 Lens parameters in the layout** | `layout(state, site)` has no arguments, so a lens whose furniture depends on the rule (the loom's N, the jar's J, the bar length, the pocket) cannot be drawn for that rule; dynamic elements reach the scene only through marks | 8, and the parameterised versions of 6, 7, 17 | `layout(state, site, args?)`, with the rule passing the same arguments it passes to dynamic elements; or one registered representation per parameter value |
| **G5 Undefined per component** | §4.2: any undefined score term makes the whole score WORST. A ladder needs "undefined here ranks below every defined value of *this* component" so that a line that meets the primary keeps it when a secondary has nothing to measure (an axis-parallel tangent has no intercept triangle) | 14, 16; any ladder whose secondary reads `tri`, `int`, `mach.reverse` | a third `sense`, or `{ term, sense, undefinedAs: "worst" }` on a component; WORST stays the rule for the primary |
| **G6 Indexed and non-rational arguments** | Dynamic parameters are shown only with `domain: "Q"` and `ElementRef.args` are rational wires. Lenses need whole-number indices with a state-dependent count (`way(k)`, `leg(k)`, `letter(i)`, `bounce(k)`), and occasionally a string or a point list (`write(word)`, a constellation) | 5, 7, 13, 18 | `ParamDecl.domain` gains `"N"` with an optional `count` element name, and `"string"`; or keep strings in rule parameters only (enough for every family here) |
| **G7 Price of a lossy view** | §3.1 charges a `view` the code length of the representation's **coordinates**. A view with no coordinates (every "View" lens above, and the spec's own `tri`, `table`, `peg`) is therefore free, although `table` or `tri` reveals the whole line | pricing of 4, 5, 6, 7, 8, 10, 16–19 as agent reads | charge a coordinate-free view the code length of the element values returned, capped at the state's read length |
| **G8 Approximate geometry** | Elements are exact rationals. A chord's ends, a tangent's foot from an outside point and anything on a circle are generally irrational; they are needed only to draw | 15, and the chord in 14 | scenery and `layout` primitives may carry floats; elements stay exact |
| **G9 Mark kinds** | No mark shades a region, traces a path or links a pair as "these two match" (`measure` is a labelled distance and half serves) | 1, 3, 4, 7 | add `{ kind: "link"; from; to; ok: boolean }` and `{ kind: "shade"; ref }` |
| **G10 Sound** | The rendering contract is visual. Tresillo and Sweet Chord are checked by ear in a second | 6, 19 (optional) | a scene may declare `audio: { kind: "rhythm" \| "chord"; el: ElementRef[] }` |

Not a gap, but worth a sentence in the spec: a layered ladder's rungs are tuples (the primary's thresholds, then, at
the primary's top, each secondary's thresholds in turn). §4.4 and §7.1 already allow it; §7.4 fits a curve on the
primary component only, so secondary rungs take step values, which is right.

### 3.1 Mutators these lenses would want

The mutator contract (§5) needs no change: each of these is an ordinary `apply`. They are listed because a lens only
feels like a representation when something moves in it, and because they give the "cheap here, dear there" contrasts
the price list exists for. All obey the pricing principle through the argument code plus the read-length surcharge:
going to larger or more complex numbers costs more than coming back.

| Mutator | Lens | Argument (code) | Effect | Cheap here, dear elsewhere |
|---|---|---|---|---|
| `mir.moveTwin` | mir, fold, drop | (u, v): int, int | the origin's reflection moves by (u, v); the line follows as the new perpendicular bisector | one call re-aims a fold; in `si` it changes m and c to unrelated fractions |
| `circ.roll` | circ | which of the twelve rim pegs: choice(12) | rotate the line about the origin by the rational rotation taking (5, 0) to that peg | keeps `reach2`, so a tangent stays a tangent; moves between the 3-4-5 directions in one step |
| `lamp.raise` | lamp, orbit | k: nz | `lampHeight` += k with `same` fixed (m and c both change, the fixed point does not) | changes the magnification about the fixed point; `si.tilt` would move the fixed point |
| `orbit.rehome` | orbit, lamp | k: nz | `home` += k with `pull` fixed (c += k(1 − m)) | slides the cobweb along the diagonal |
| `beat.rotate` | beat, gear | k: nz (beats) | c += k·m: the pattern starts k beats later | a rotation of the rhythm is one small integer; as a shift it is the fraction k·m |
| `bil.steepen` | bil | k: nz (cushions) | m += k/2 with `start` fixed: one more bounce on the 8 × 4 table | keeps a corner-to-pocket shot aimed at a pocket |
| `coin.bill` | coin, gen | k: nz | N += k (c₀ −= k), no renormalising when gcd(a, b) = 1 | the cheap parallel move in whole steps of the general form |

## 4. Collisions worth knowing (decision 5)

Lines that sit high on two ladders at once, found while checking examples. These are the seeds of negotiation.

- **y = −2x + 1** is the top of both Firefly Jar (K = 5) and One Thread (N = 9).
- **3x + 4y = 25** tops Kiss the Circle, has a peg foot with a whole plumb line (Plumb Line: (0, 0, 0, …)), and is the
  crease that lands the corner on (6, 8) in Haga's Fold (primary met).
- **y = x** is the top of Fair Cut, a five-letter all-corner palindrome, a fifteen-crate ramp with every stack
  different, and the worst possible Prime Threads and Lamp (every thread vertical).
- **y = 2x** is the top Trick Shot; under the lamp its fixed point is 0 with the lamp at height 2.
- **x + y = 5** tops Tangent Kite and pays a bill of 5 in six ways (Exact Change, far from W = 3): a conflict, not an
  alliance.
- Lines through a box's centre serve Fair Cut (centre (4, 4)) or Palindrome Path (centre (3, 3)), never both, unless
  they pass through both centres: only y = x.

## 5. Top eight

Chosen for delight and for how differently each makes a child look at the same line.

| # | Family | Lens | Primary | Why this one |
|---|---|---|---|---|
| 1 | **Haga's Fold** | `fold`: the line is a crease | fold the bottom-left corner onto the top edge | you can do it with a real square of paper, and a 3-4-5 triangle appears |
| 2 | **Tresillo** | `beat`: the line is a drum pattern | the first bar plays x . . x . . x . | the only family you can hear; gradient becomes tempo, intercept becomes rotation |
| 3 | **Firefly Jar** | `orbit`: the line is fed its own answers | stay in the jar four hops, escape on the fifth | iteration and the cobweb; the top, 1, −1, 3, −5, 11, is a small marvel |
| 4 | **Lamp and Rulers** | `lamp`: the line is a projection between two rulers | the thread at T hangs straight down | the whole line collapses to one point, the lamp; −40° is its real-world anchor |
| 5 | **Tangent Kite** | `circ`: the line is a chord with a pole | the tangents at the chord's ends cross on a peg | a line turns into a point; the top is a square hiding in a circle |
| 6 | **Cipher Wheel** | `cipher`: the line is a secret code | turn GIRL into TRIO | a falling gradient reverses the alphabet; WIZARD spelt backwards |
| 7 | **Sheep Fence** | `dots`: the line is a fence | exactly ten sheep above | counting first, then the widest street: a child meets the margin idea |
| 8 | **Trick Shot** | `bil`: the line is a billiard shot | finish in the bottom-right pocket | bouncing is a straight line through mirrored rooms; the top is y = 2x drawn as a W |

Next four, had there been room: Constellation Mirror, Palindrome Path, Exact Change, One Thread.
