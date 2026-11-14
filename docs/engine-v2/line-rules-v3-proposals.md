# Line rules, third pass: candidates measured against the collapse check (14 November 2026)

Status: proposals and measurements only. Nothing here changes the dealt rule pool, prices or scoring. The script is
`lib/v2-agents/scripts/line-rules-v3.ts` (run from `lib/v2-agents`:
`node --experimental-strip-types scripts/line-rules-v3.ts --part all --n 1500000`, about 25 minutes). It follows
[landscape-analysis.md](landscape-analysis.md), whose five collapse tests (§4) are applied here.

---

## The summary in plain words

**What I tried.** Eight rule families on fraction lines (a·x + b·y + c = 0), each with a primary a 12-year-old can read
("the y-intercept is as close to a whole number as possible") and three advanced secondaries, 24 rules in all, following
the owner's pattern (decision 23). The secondaries cover what the brief asked for: (a) number structure that does not grow
with size (the decimal period of 1/n, "nearly a perfect square", a second representation also nearly whole); (b) primaries
that read several coefficients at once (distance from the centre, gradient × intercept, the line passing near a peg,
the area with the axes); (c) several representations of one line constraining each other (both intercepts, the area and
√(a² + b²)); and (d) a dealt twist (a target gradient T, a column x = T), per game and per object. Nine tables of three
and four of these rules went through the five collapse tests.

**What does not work, and why. No candidate passes the collapse check. I could solve every table in one sentence.**

1. **Bounded secondaries do not ramp, but they are worth very little, and their best line is a small degenerate one.**
   "1/n has a long repeating decimal", "n is nearly a square", "the x-intercept is whole too" top out at **1.3 to 10.5
   bits**, at lines like y = x + 1 or y = 7x + 7. A rule's top is worth −log2 of the law's mass on its best set, and that
   mass is dominated by the set's *cheapest* member. The law puts half of each coefficient on 0 and much of the rest on
   ±1, ±2, so every coincidence has a cheap solution near the centre. Example: "both intercepts whole" is satisfied by
   every line y = ±x + n, worth 2.1 bits.
2. **"As big as possible" secondaries still ramp.** Smallest-prime-factor secondaries reach 20 to 33 bits inside a line's
   share of a game, but their best line sits at the window's edge and grows with it (y = ±x ± 89 is the best of the
   control table; "m = ±1 and c the biggest prime you can afford" is still the sentence). Path-consistent prices make the
   ramp end where the money runs out (landscape-analysis H5), which is a budget, not a landscape. **So no "as big as
   possible" secondary survives on one line**, as the main source of bits or as a tie-breaker under the primaries tried.
3. **"Nearly whole" on a square root is a hidden ramp.** √(a² + b²), √(area) and the distance from the centre get closer
   to whole numbers as the numbers grow (√(n² + 1) ≈ n + 1/2n). Their exact hits are cheap and sit at the top, but the
   near-misses below them improve with size, so scripted climbers that cannot jump to an exact hit **walk outward for
   ever**: in two tables the climbers ended with a coefficient of 16,384 and 20,736.
4. **One line is too small a universe for "hard even for a frontier AI with compute".** A line's share of a game (2,475 ⚡
   at unit-step, path-consistent prices) reaches **about 2 million fraction lines** from one birth. Enumerating them and
   scoring three rules takes seconds. A rule-knowing climber with 10⁵ evaluations already gets 63–100% of the exact best.
   No rule on one line can fix that, because the searcher does not need to understand the rule, only to evaluate it.
5. **Few good states, and they share a closed form.** The best 24 distinct lines keep 68–100% of 24 × the best (the test
   asks for under 70%), and they are one family each: y = ±x + n, y = ±(7/2)x + 7n, slope = the dealt T.
6. **Dynamics freeze.** In 5 of 9 tables the table total stops changing within 50 s of a 300 s game; in the others the
   seats walk one or two objects outward along a ramp. Seats with fixed utilities on independent objects converge; that
   is a mechanism, not a tuning problem (§3.4).

**What works, partly.**

- **Disclosure noise works** on these rules as it did on the old ones: identifying the other seats' rules from disclosed
  sums takes 2–28 probes when exact, 68–431 at σ = 2 bits, and is not done in 1,500 probes at σ = 8 in 13 of 15 runs.
- **A per-object twist makes the 24 objects 24 different problems**: with a per-object target gradient T, each object's
  best line differs (T = 5/3 → y = (5/3)x + 7; T = −2/7 → y = −(2/7)x + 3; T = 1/6 → y = x/6 + 3). It stops copying, not
  solving: each object's answer is again one sentence ("the simplest fraction at T, intercept a small multiple").
- **Coupled primaries do entangle the seats.** Primaries that read a, b and c together (distance, product, pegs) make the
  seats fight over the same coefficients, and the hardest table for a climber (Whole Distance/rep + Whole at x = 7/spf +
  Target Gradient/whole intercept) has a single needle (2 near-best states of 2 million) that 10⁵ evaluations reach only
  63–66% of. It is hard for a climber, trivial for enumeration.

**What needs the owner's decision** (none of these is taken here; each would change a game rule):

1. **More numbers per object** (proposal (c) at scale). An object of two or four lines, with rules that read across them
   ("where your two lines cross is nearly a whole-number point"), makes the reachable set about (2·10⁶)² = 4·10¹² or more,
   not enumerable, and gives coincidence rules room for ~30 bits without size, as on grids (16 cells, 60 climbs ended in
   60 places). Decision 2 and "lines per object" (coordinator's call (c), default 1) are where this lives. **This is the
   recommended next study**: it keeps every rule a pure function of one object.
2. **Relational rules** (a rule reads other objects). Out of scope by the owner's standing rule "every object is an
   independent universe"; flagged, not proposed.
3. **The law's mass at 0 and ±1** (landscape-analysis proposal 7). It is what makes every coincidence cheap at the centre
   and caps bounded rules at ~10 bits. A flatter law is a change to the potential, births and prices.
4. Whether a bounded rule worth ~10 bits at its top is acceptable at all, given "on order 30 bits worth of surprise within
   reach for each" rule. On one line, with this law, the measurements say a rule gets 30 bits only by size (a ramp).

---

## 1. Setup

- **Object.** A fraction line a·x + b·y + c = 0, primitive, b > 0 (or b = 0 < a: a vertical line, which these rules
  score as worst), the line-q object. Every rule reads a representation of the one line: gradient m = −a/b, y-intercept
  k = −c/b, x-intercept X = −c/a, area with the axes A = c²/(2|a|b), distance from the centre |c|/√(a² + b²), y at a
  given x.
- **Law.** Each of a, b, c from the mixed integer code (decision 17), conditioned on canonical lines (`lineLaw`).
- **Bits.** −log2 π{lines whose (primary, secondary) is at least as good, lexicographically}, estimated from 216,446
  canonical draws of the law tilted to t = 0.55 and reweighted (an empirical ladder, decision 22). No state measured fell
  past the sample's top.
- **Prices.** Path-consistent unit steps (#580): one call changes a, b or c by ±1 and costs log2 9 + the one-step code +
  max(0, Δφ) bits, charged W + 0.05·W² ⚡. A line's share of a three-seat game is 2,475 ⚡; a seat's game is 19,800 ⚡.
- **Table total.** F = Σᵢ nᵢ · Σ_{j≠i} nⱼ on each line, as in landscape-analysis.md.
- **Twists.** For the tables, Target Gradient's T = 5/3 and Whole at x = T's T = 7. §3.5 varies T.

## 2. The eight families

Kid-readable primary first; secondaries are the three alternatives (decision 14: one primary, several secondaries, a
dealt rule is the primary plus one). Every primary is continuous (decision 13): closer is better, with no buckets.
"Bits" are the rule's top in the |a|, |c| ≤ 24, b ≤ 24 window, at the smallest line that reaches it, and the median best
over the cheapest 150,000 lines reachable from six births (the reach runs to 530–674 ⚡ of the 2,475; the full reach is
about 2 million lines).

| # | Family: primary (kid text) | Secondary | Maths | Top bits (window 24) @ line | Best in reach (bits) | Ramp? |
|---|---|---|---|---|---|---|
| 1 | **Whole Intercept**: the y-intercept is as close to a whole number as possible | spf: that number's smallest prime factor is big (the owner's example) | −‖c/b‖, then spf(round(c/b)) | 15.9 @ (−23, 1, −23), was 9.3 at window 12 | 28.7 | **yes** (edge, grows) |
| | | rep: 1 ÷ that number has a long repeating decimal | ord_n(10)/(n − 1) | 8.1 @ y = 7x + 7 | 8.1 | no; degenerate top |
| | | x-whole: the x-intercept is nearly whole too | −‖c/a‖ | 2.1 @ y = x + 1 | 2.1 | no; worthless |
| 2 | **Whole Crossing**: the line crosses the x-axis as close to a whole number as possible | spf | spf(round(−c/a)) | 16.8 @ y = x + 23 | 32.8 | **yes** |
| | | sq: that number is nearly a perfect square | −‖√n‖ | 6.3 @ y = x + 4 | 6.3 | hidden (√ near-misses) |
| | | area-whole: the triangle with the axes has nearly whole area | −‖A‖ | 5.1 @ y = 2x + 2 | 5.1 | no |
| 3 | **Whole Distance**: the line's distance from (0, 0) is as close to a whole number as possible | hyp-whole: √(a² + b²) nearly whole | −‖√(a² + b²)‖ | 3.7 @ y = 1 | 3.7 | hidden |
| | | spf | spf(round(dist)) | 17.1 @ y = 23 | 20.0 | **yes** |
| | | rep | reptend of round(dist) | 9.6 @ y = 7 | 9.6 | no |
| 4 | **Square Area**: the triangle with the axes has an area as close to a perfect square as possible | omega: the root has many prime factors (the owner's example 2) | Ω(round √A) | 8.5 @ y = 2x + 16 (7.7 at window 12) | 9.4 | slow ramp (powers of 2) |
| | | spf | spf(round √A) | 13.3 @ y = 2x + 22 | 26.0 | **yes** |
| | | k-whole | −‖c/b‖ | 6.7 @ y = 2x + 2 | 6.7 | no |
| 5 | **Peg Line**: the line passes as close as possible to a whole-number point in columns x = 1 to 9 | two-pegs: the second-closest peg is close too | second smallest ‖y(x)‖ | 1.3 @ y = x + 1 | 1.3 | no; worthless |
| | | spf of the peg's height | | 7.4 @ (−20, 3, 19) | 8.6 | slow |
| | | rep of the peg's height | | 5.8 @ y = 4x + 3 | 5.8 | no |
| 6 | **Target Gradient** (twist T): the gradient is as close as possible to the dealt T | k-whole | −\|m − T\|, then −‖k‖ | 10.5 @ y = (5/3)x + 1 | 10.5 | no; one-sentence top |
| | | spf | spf(round k) | 14.6 @ (−5, 3, −20) | 16.9 | **yes** (in c) |
| | | dist-whole | −‖dist‖ | 16.4 @ (−20, 12, −23) | 20.4 | hidden |
| 7 | **Whole at x = T** (twist T): at the dealt x, y is as close to a whole number as possible | next-whole: at x = T + 1 too | −‖y(T)‖, −‖y(T+1)‖ | 1.8 @ y = x + 1 | 1.8 | no; worthless |
| | | spf | spf(round y(T)) | 8.4 @ (−24, 1, −23) | 9.2 | edge |
| | | rep | | 5.3 @ y = x | 5.3 | no |
| 8 | **Whole Product**: gradient × y-intercept is as close to a whole number as possible | spf | spf(round(m·k)) | 18.4 @ y = 23x + 23 | 24.1 | **yes** |
| | | rep | | 9.8 @ y = 7x + 1 | 9.8 | no |
| | | x-whole | | 2.1 @ y = x + 1 | 2.1 | no; worthless |

(‖x‖ is the distance from x to the nearest whole number.) A birth scores 0.8–2.5 bits on every rule.

**Reading it.** Every rule is one of three kinds. *Size rules* (spf, and to a lesser degree omega and the peg height)
reach 17–33 bits in reach and ramp. *Coincidence rules with an exact top* (rep, sq, x-whole, area-whole, k-whole,
next-whole, two-pegs) do not ramp at the top, but the top is a tiny line worth 1–10 bits: the exact coincidence is cheap
near the centre because the law is. *Root near-misses* (hyp-whole, sq, dist-whole) have an exact top plus a ramp of
ever-better near-misses below it, which climbers walk (§3.4). None reaches the owner's "on order 30 bits within reach"
without a ramp. The landscape analysis's correlation test (bits against φ above 0.9) does not fire on line-q, because φ
there includes a and b; the edge and growth tests do.

**Why, in one line.** A rule's top is worth −log2 π(its best set) ≈ φ of the set's cheapest member. If the best set has
a cheap member, the top is cheap and central; if not, its members are big, and bigger is the direction of travel. To get
~30 bits with neither, the best set must need many *independent* numbers to line up, and one line has only three.

## 3. The collapse tests on tables

Nine tables: the owner's pattern with spf everywhere (control, 3 and 4 seats) and seven of the new rules in groups that
make their primaries share coefficients.

| # | Table | Exact best in reach | Near-best (≥ 90%) lines / slopes | 10⁵-eval climber / exact | Best 24 distinct keep | Slopes in top 24 | Dynamics: F at 50 s steps; objects moved in the last 100 s |
|---|---|---|---|---|---|---|---|
| 1 | Whole Intercept/spf + Whole Crossing/spf + Whole Distance/spf (control) | y = ±x ± 89 | ~50 / 2 | 0.15, 0.52, 0.94 | 0.70 | 3 | 1,283 → 1,339, rising slowly; 54% (walking c outward) |
| 2 | Whole Intercept/rep + Whole Crossing/area-whole + Whole Distance/hyp-whole | y = (47/2)x − 47 | 32–36 / 16–18 | 0.96, 0.78, 0.95 | 0.93 | 12 | 1,039 → 1,166; 54%; a coefficient reached 16,384 |
| 3 | Peg Line/two-pegs + Whole at 7/next-whole + Whole Product/x-whole | y = x + n (any n) | ~35,000 / 333 | 1.00 | 1.00 | 8 | 347 → 357; flat top |
| 4 | Square Area/k-whole + Target Gradient/dist-whole + Whole Crossing/sq | y = (5/3)x − 70/3 | 6–8 / 3–4 | 0.91, 0.91, 0.90 | 0.86 | 5 | 2,034 → 2,156; a coefficient reached 20,736 |
| 5 | Whole Intercept/x-whole + Peg Line/rep + Square Area/omega | y = x/2 − 48 | 10 / 4 | 0.84, 0.91, 0.84 | 0.76 | 12 | 1,105 flat from 50 s; 4% |
| 6 | Whole Distance/rep + Whole at 7/spf + Target Gradient/k-whole | (−4, 3, −95) | 2 / 1 | 0.66, 0.63, 0.65 | 0.89 | 12 | 1,232 flat; 13% |
| 7 | Table 2 + Peg Line/two-pegs (4 seats) | y = (47/2)x − 47 | 24–28 / 12–14 | 0.89, 0.95, 0.84 | 0.94 | 12 | 1,586 flat; 8% |
| 8 | Whole Product/rep + Whole at 7/next-whole + Square Area/k-whole + Target Gradient/dist-whole | (−25, 15, 27) | 2 / 1 | 1.00, 0.74, 0.93 | 0.75 | 7 | 2,426 flat; 8% |
| 9 | Control + Whole at 7/spf (4 seats) | y = ±x ± 89 | ~55 / 2 | 0.94, 0.98, 0.97 | 0.68 | 7 | 2,012 flat; 8% |

Columns 3–5 are over the full reach of three births (1.98, 2.01 and 2.26 million lines).

### 3.1 Test 1, no ramp: fails for every size secondary; bounded ones pass by being worth little

See §2. 8 of 24 rules have a growing top at the window's edge; 4 more ramp below an exact top.

### 3.2 Test 2, no cheap optimum for a rule-knowing searcher: fails

Exhaustive enumeration of the reach (2 million lines) took a few seconds a birth in a single-threaded script; a frontier
AI with compute does the same. Against the check's literal bar (10⁵ evaluations reaching 95% of the reference), a
steepest-ascent climber with restarts passes on tables 5, 6 and 8 and on some births of 1, 2 and 7. That is a measure of
needles, not of a landscape: table 6's optimum is 2 lines out of 2 million, and enumeration finds it. Table 3 has 35,000
near-best lines (every y = x + n) and is trivial.

### 3.3 Test 3, no single answer: fails

The best 24 distinct lines keep 68–100% of 24 × the best (the check asks for under 70%). Each table's best states are one
sentence:

- Table 1 and 9: "y = ±x + p, p the largest prime you can afford" (as on line-z).
- Table 2 and 7: "gradient ±p/2 with p a full-reptend prime, intercept ∓p" (7, 17, 19, 23, 29, 47 …): both intercepts whole
  (−p and 2), area whole, and √(p² + 4) close to whole for large p (the hidden ramp), so the best line grows with p too.
- Table 3: "y = x + n". Table 4: "gradient T, the intercept a multiple of 1/3 that makes the rest whole".
- Table 6: "a 3-4-5 direction (whole distance), the intercept making y(7) a prime".

### 3.4 Test 4, no convergence in play: fails, by freezing or by walking outward

Scripted seats (each second each seat makes its best affordable unit move by gain per ⚡ in its own points rate,
uniqueness enforced, a seat's 19,800 ⚡ over 300 s) never sit idle, but in tables 5–9 the table total stops changing by
50 s: the seats shuffle one or two objects between equally good states. In tables 1, 2 and 4 the total keeps rising by
1–2% a minute because a seat walks one object outward along a ramp (a big prime, or a root near-miss to 16,384 and
20,736). Neither is the dynamic ecosystem asked for. The mechanism is general: with each object an independent universe
and every utility fixed, a hill climber stops at a local maximum of its objective, and the only motion left is conflict
between seats over the same object. The rules here make the seats' interests overlap (they share coefficients) but not
conflict much, because the cheap degenerate lines (y = ±x + n) are good for nearly every rule at once.

### 3.5 Test 5, disclosure: passes with noise, fails without

| Table | Candidates | σ = 0 | σ = 2 | σ = 8 |
|---|--:|---|---|---|
| 2 | 189 pairs | 3–28 probes | 214–431 | 1,165, 1,495, and 3 of 5 not identified in 1,500 |
| 3 | 189 | 2–4 | 68–397 | 5 of 5 not identified |
| 7 (4 seats) | 945 triples | 3–14 | 173–304 | 5 of 5 not identified |

The same as the old pool (landscape-analysis H4): exact sums give the rules away; v1's 8-bit noise hides them. Disclosure
noise was deleted in D1 and is open with the owner (`v1-audit.md`); nothing here changes that.

### 3.6 The twist (d): per object it varies the answer, not its form

Target Gradient/whole intercept with Whole Intercept/rep and Whole Distance/hyp-whole, at six values of T (window 24):

| T | Best line | Best 24 keep | Slopes in top 24 |
|---|---|---|---|
| 5/3 | y = (5/3)x + 7 | 0.72 | 8 |
| −2/7 | y = −(2/7)x + 3 | 0.61 | 8 |
| 3/4 | y = (2/3)x + 7 | 0.76 | 10 |
| 7/2 | y = (7/2)x + 7 | 0.74 | 9 |
| −4/5 | y = −(4/5)x + 3 | 0.81 | 9 |
| 1/6 | y = x/6 + 3 | 0.66 | 7 |

Dealt per object, T makes the 24 objects 24 different problems, so "copy the best line" no longer works, and dealt per
game it stops answers carrying over between games. Each problem is still solved by one sentence ("the simplest fraction
at or near T, then the intercept that makes the secondary exact"). A twist keeps its parameter named, typed and of equal
opportunity if T is drawn from a set whose members give the same top bits (the six above give 10–12 bits); that is a
calibration per value, as decision 20 allows.

## 4. Being adversarial: the one-sentence solutions

For each family alone: Whole Intercept/spf, Whole Crossing/spf, Whole Product/spf: "y = ±x ± (largest affordable
prime)". Whole Distance/spf: "y = largest affordable prime". Square Area/spf: "y = 2x + 2p". Any rep: "make the number
7 (or the nearest full-reptend prime)". Any x-whole, k-whole, next-whole, two-pegs, area-whole: "y = x + n". hyp-whole:
"a horizontal line" (√(0 + 1) = 1). Peg Line: "any line with whole gradient and intercept". Target Gradient: "slope =
T's simplest fraction". Each table's sentence is in §3.3. I found every one in under a minute from the rule text and
checked it against the measured tops.

## 5. What this suggests for the next round (proposals, for the owner)

Ranked by what the measurements say would move the tests, and all within "a utility is a pure function of one object"
except where marked.

1. **Objects of two or four lines, with rules that read across them** (needs the owner: object variant and default lines
   per object). Kid-readable primaries exist: "your two lines cross as close as possible to a whole-number point", "the
   triangle your three lines make has nearly whole area", "your four lines make a nearly square shape". Coincidences then
   need several independent numbers (as on grids, whose 16 cells have 39 bits of collision entropy against line-q's 5.9),
   so bits come from structure, not size, and the reachable set (≈ 4·10¹² for two lines) is not enumerable. This is the
   next measurement to make, with this script extended to tuples.
2. **No exact cheap degenerate states**: exclude, or score as worst, the lines every coincidence loves (gradient 0 or ±1,
   intercept 0), or make the law less concentrated there (needs the owner: landscape-analysis proposal 7). Without it,
   bounded secondaries stay at 1–10 bits whatever they say.
3. **Never use "nearly whole" on a square root as a secondary below an exact top.** Its near-misses improve with size
   (√(n² + 1) ≈ n + 1/2n) along a path of unit steps, and climbers walk it. Near-misses of fractions improve with size
   too (the best non-zero ‖c/b‖ is 1/b), but in these runs no climber walked one, presumably because growing b is dear
   under the law; that is not measured separately. If a root is read, read only whether it is exact.
4. **Per-object twists** (T per object, drawn from a calibrated set): stops copying and carry-over between games at the
   cost of a value cache per T. Worth doing with 1; alone it does not pass tests 2–4.
5. **Disclosure noise σ ≈ 8 bits** (open with the owner in the v1 audit): passes test 5 for every table measured.
6. **"As big as possible" secondaries**: drop them from tables where they are the only source of bits above ~10, or bound
   them by a dealt target (landscape-analysis proposal 8). On one line I found no setting where bigger stops paying before
   the budget does.
7. **Relational rules** (needs the owner to change "every object is an independent universe"): the only route measured
   or estimated so far in which an object's best state depends on states other players are moving. Listed for
   completeness; not proposed.

## 6. Limits of these measurements

- Unit steps on a, b, c stand in for the mutators (shift, tilt, step, pivot …); the real moves reach slightly different
  sets at similar costs. The per-rule "best in reach" is over the cheapest 150,000 lines (up to 530–674 ⚡); the table
  tests use the full reach.
- Ladders are empirical (216,446 weighted draws); tops above ~35 bits would need a larger sample. None was hit.
- The scripted seats are greedy and selfish; model seats talk and coordinate, which in the landscape analysis made
  collapse faster, not slower.
- Tables were chosen to make primaries share coefficients; I did not search all C(8, 3) · 27 tables.
