# Alignment and tension between the dealt line rules

Owner decision 30 (verbatim, in part): "I absolutely want bigger is better mechanics so there are unbounded hills to
climb. We just need to make sure there are adversaries to ongoing expensive climb of those hills and we should create
diversity of goals so that it's rare for optimising just one thing, like finding a large prime in the x-intercept, to
straightforwardly benefit multiple rules at once. ... Also deliberately introduce rules that are in tension with one
another. ..."

This page measures how the dealt line pool stands against that: when a move climbs one rule's hill, what happens to
every other rule's bits. It is analysis only. No game logic changed.

- Script: `lib/v2-agents/scripts/tension.ts`. Run it with `pnpm --filter @workspace/v2-agents tension -- --json
  docs/engine-v2/scripts/tension-results.json` from the repository root, or from `lib/v2-agents` with
  `--json ../../docs/engine-v2/scripts/tension-results.json`. It takes about 3 minutes.
- Full printed output: [`scripts/tension-results.md`](scripts/tension-results.md). That file holds every table below
  plus the per-rule state counts, the per-direction table with the rules that like each direction, every basic strategy
  at k = 1, 2, 4 and 8, the flag detail and the per-direction signatures.
- Every pair's numbers: [`scripts/tension-results.json`](scripts/tension-results.json). For each unordered pair it
  gives the class, the pooled up/down/same in both orders, and a one-character-per-direction signature in both orders.
  It also gives every strategy's per-rule climb counts.

## Method

- **Rules.** Every dealt (family, params, tie-breaker) of the preset `lines-beginner` on line-q: 43 rules in 11
  families, all with committed value functions. A rule's bits are its committed value function looked up at the line's
  score (harness `valuer`).
- **States.** For each rule A, states that cover A's bits range, drawn by subset simulation as in `hold-measure.ts`.
  The script first takes 120 draws from π (`lineLaw`). Then, for rising thresholds u, it runs the walk (v2-core
  `walkStep`) restricted to {bits_A ≥ u}. This keeps the upper parts of A's hill in the sample, not just π's bulk. It
  keeps up to 24 distinct states per 1-bit bin of A's bits, bins 0–16+. That gives 140–410 states per rule, about
  12,000 in all, and reaches 9–66 bits.
- **Directions.** 48 fixed moves, each applied once at every state. Every line-q mutator is included, with small
  arguments of both signs:
  - shift and tilt by ±1, ±2 and ±½;
  - step by ±1 and ±2;
  - pivot by ±1 about x0 = −1, 1 and 2;
  - slide by one unit along either axis;
  - all four mirrors;
  - nudge a, b or c by ±1;
  - move either intercept by ±1;
  - stretch by 2, 3, 5, 7, ½, ⅓, −2 and −½.

  Prices are the real ones (`applyPriced`). A direction is **cheap** when its mean fee (price less surcharge) is at most
  12 bits. All are cheap except stretch ×5 (12.5 bits) and ×7 (15.1 bits).
- **Climbs.** Take an ordered pair (A, B) of rules from different families. Among the (A-state, direction) moves that
  raise A's bits, count the share where B's bits rise, fall or stay the same (|Δ| < 10⁻⁶), and the mean Δbits_B.
- **Per-direction verdict** for A → B, over the A-climbs along one direction (at least 8 of them):
  - *with*: B rises at ≥ 50% of them, and at least twice as often as it falls;
  - *against*: the same with falls;
  - *none*: B is unchanged at ≥ 50%;
  - otherwise *mixed*.
- **Classes of an unordered pair** {A, B}:
  - **ALIGNED**: some cheap direction is *with* in both orders, and no cheap direction is *against* in either order.
  - **IN TENSION**: pooled over the cheap directions, in both orders, A's climbs lower B at ≥ 50% and more often than
    they raise it.
  - **NEUTRAL**: in both orders, A's climbs leave B unchanged at ≥ 50%.
  - **MIXED**: everything else. Two sub-labels are given:
    - *shared climb*: there is a direction that is *with* both ways, but some other direction is *against*;
    - *one-sided tension*: the IN TENSION condition holds in one order only.
- **Basic strategies.** One move with a fixed argument, applied k = 1, 2, 4 and 8 times from every state. Strategies:
  - shift ±1;
  - tilt ±1;
  - step +1;
  - pivot about x0 = −1 by +1;
  - slide (1, 0);
  - nudge a +1 and c ±1;
  - move x +1 and move y +1;
  - stretch ×2, ×3 and ×½.

  A climb of A means Δbits_A > 0 after k steps.
- **Flag.** Lines given by their intercepts, built around one prime p, scored on every rule; and stretch by p from such
  a line.

## Counts

835 unordered pairs of rules from different families:

| Class | Pairs |
|---|--:|
| ALIGNED | 19 |
| IN TENSION | 7 |
| NEUTRAL | 24 |
| MIXED | 785 |
| of which: shared climb (a direction serves both, another sets them against each other) | 606 |
| of which: one-sided tension | 7 |

The typical relation between two dealt rules is a *shared climb*: some cheap direction raises both, and another cheap
direction raises one and lowers the other. That is diversity, but the alignment is rarely clean. Strict alignment (19
pairs) and real tension (7 pairs) are both rare. Deliberate tension, as the owner asks for, is almost absent from the
current pool: 7 pairs, all of them Square Area against Pythagorean Area.

## Families × families

Each cell counts the rule pairs (tie-breaker × tie-breaker) by symbol:

- **A**: aligned;
- **a**: mixed with a shared climbing direction;
- **T**: in tension;
- **t**: one-sided tension;
- **·**: neutral;
- **~**: mixed.

| | PL | SA | WC | DL | T | SOBR | PG | PS | R | EC | PA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **PL** Prime Landing |  | a6 ~9 | a2 ~13 | a20 | a25 | a30 | a19 ·1 | A2 a10 ·2 ~6 | a15 | a9 ~6 | a15 |
| **SA** Square Area | a6 ~9 |  | a9 | a11 ~1 | a15 | a16 ~2 | a12 | a6 ~6 | t3 ~6 | a9 | **T7** t2 |
| **WC** Whole Crossing | a2 ~13 | a9 |  | a8 ~4 | a11 ~4 | a2 ~16 | a7 ~5 | a3 t2 ~7 | A4 a5 | A2 a4 ·2 ~1 | a4 ~5 |
| **DL** Divisibility Ladder | a20 | a11 ~1 | a8 ~4 |  | a18 ~2 | a24 | a16 | a8 ·2 ~6 | A2 a10 | a6 ·4 ~2 | a7 ~5 |
| **T** Treasure | a25 | a15 | a11 ~4 | a18 ~2 |  | a29 ~1 | a20 | a10 ~10 | a15 | a2 ~13 | a15 |
| **SOBR** Same on Both Rulers | a30 | a16 ~2 | a2 ~16 | a24 | a29 ~1 |  | a24 | a12 ~12 | a18 | a16 ~2 | a18 |
| **PG** Prime Gradient | a19 ·1 | a12 | a7 ~5 | a16 | a20 | a24 |  | a11 ~5 | a12 | ·7 ~5 | a12 |
| **PS** Prime Staircase | A2 a10 ·2 ~6 | a6 ~6 | a3 t2 ~7 | a8 ·2 ~6 | a10 ~10 | a12 ~12 | a11 ~5 |  | A1 a5 ~6 | a5 ·6 ~1 | A2 a4 ~6 |
| **R** Ruler | a15 | t3 ~6 | A4 a5 | A2 a10 | a15 | a18 | a12 | A1 a5 ~6 |  | a7 ~2 | **A6** a3 |
| **EC** Exact Change | a9 ~6 | a9 | A2 a4 ·2 ~1 | a6 ·4 ~2 | a2 ~13 | a16 ~2 | ·7 ~5 | a5 ·6 ~1 | a7 ~2 |  | a6 ~3 |
| **PA** Pythagorean Area | a15 | **T7** t2 | a4 ~5 | a7 ~5 | a15 | a18 | a12 | A2 a4 ~6 | **A6** a3 | a6 ~3 |  |

The 43 × 43 rule matrix, with the same symbols, is in
[`scripts/tension-results.md`](scripts/tension-results.md#rules--rules).

## The aligned pairs and their shared directions

| Pair | Shared cheap directions | A → B up / down / same | B → A up / down / same |
|---|---|---|---|
| Prime Landing/big-prime · Prime Staircase/first-prime | shift +2, step −2, pivot@2 −1 | 40 / 3 / 57% | 68 / 14 / 18% |
| Prime Landing/big-prime · Prime Staircase/last-prime | shift +2, step −2, pivot@2 −1 | 39 / 3 / 58% | 79 / 6 / 15% |
| Whole Crossing/k-spf · Ruler/far | tilt ±1, tilt ±½, nudge a ±1 | 45 / 25 / 30% | 33 / 32 / 35% |
| Whole Crossing/k-gpf · Ruler/far | tilt ±1, +2, ±½, nudge a ±1 | 47 / 23 / 29% | 34 / 31 / 35% |
| Whole Crossing/k-gpf · Ruler/prime-gradient | tilt −1, ±½, nudge a ±1 | 48 / 22 / 30% | 30 / 32 / 38% |
| Whole Crossing/k-gpf · Exact Change/big-piles | tilt −1, −2, −½, step −1, −2, pivots by −1, nudge a +1 | 20 / 10 / 71% | 57 / 21 / 22% |
| Whole Crossing/m-spf · Ruler/far | tilt ±½ | 56 / 12 / 32% | 29 / 32 / 39% |
| Whole Crossing/m-spf · Exact Change/big-piles | tilt −½, step −1, −2, pivots by −1 | 24 / 4 / 72% | 36 / 18 / 46% |
| Divisibility Ladder/m-spf · Ruler/prime-gradient | slide (−1, 0) | 54 / 24 / 22% | 32 / 14 / 54% |
| Divisibility Ladder/m-gpf · Ruler/prime-gradient | tilt −2, step −2, slide (−1, 0), nudge c −1 | 56 / 20 / 24% | 32 / 14 / 53% |
| Prime Staircase/near-miss · Ruler/square-area | almost every direction | 61 / 13 / 26% | 63 / 11 / 26% |
| Prime Staircase/near-miss · Pythagorean Area/prime-height | almost every direction | 63 / 12 / 25% | 61 / 14 / 25% |
| Prime Staircase/near-miss · Pythagorean Area/whole-legs | almost every direction | 62 / 13 / 25% | 58 / 12 / 30% |
| Ruler/prime-gradient · Pythagorean Area/slanted-square | almost every direction | 74 / 14 / 12% | 65 / 18 / 16% |
| Ruler/prime-gradient · Pythagorean Area/prime-height | almost every direction | 75 / 14 / 11% | 69 / 18 / 13% |
| Ruler/prime-gradient · Pythagorean Area/whole-legs | almost every direction | 75 / 14 / 12% | 73 / 14 / 14% |
| Ruler/square-area · Pythagorean Area/slanted-square | almost every direction | 81 / 14 / 5% | 66 / 19 / 14% |
| Ruler/square-area · Pythagorean Area/prime-height | almost every direction | 82 / 14 / 4% | 72 / 18 / 10% |
| Ruler/square-area · Pythagorean Area/whole-legs | almost every direction | 81 / 14 / 4% | 72 / 12 / 16% |

Ruler/far with Pythagorean Area (all three tie-breakers) is a shared climb that falls just short of the class: 83% of
Ruler/far's climbs raise Pythagorean Area. Ruler × Pythagorean Area is the one family pair that is aligned almost
everywhere. Their main layers share an anchor, the line's closeness to the origin: Ruler wants the distance² near a
small square, and Pythagorean Area wants the cut-off area near 6. Those targets are compatible, so nearly every move
that improves one improves the other.

## The pairs in tension

| Pair | A → B up / down / same (mean Δ) | B → A up / down / same (mean Δ) | Most-against directions |
|---|---|---|---|
| Square Area/spf · Pythagorean Area/whole-legs | 33 / 54 / 14% (+0.64) | 27 / 64 / 9% (+0.01) | shifts, tilt +1 |
| Square Area/omega · Pythagorean Area/whole-legs | 29 / 53 / 17% (+0.56) | 30 / 64 / 6% (+0.03) | shifts, tilt +1 |
| Square Area/omega · Pythagorean Area/slanted-square | 30 / 56 / 14% (+0.55) | 31 / 60 / 9% (+0.05) | shifts, tilts |
| Square Area/lpf · Pythagorean Area/whole-legs | 30 / 51 / 19% (+0.74) | 27 / 64 / 9% (+0.03) | shifts, tilt +1 |
| Square Area/omega · Pythagorean Area/prime-height | 30 / 55 / 15% (+0.55) | 33 / 56 / 10% (+0.13) | shift −2, −½, tilts |
| Square Area/spf · Pythagorean Area/slanted-square | 33 / 51 / 16% (+0.64) | 30 / 60 / 9% (+0.06) | shifts, tilts |
| Square Area/spf · Pythagorean Area/prime-height | 33 / 51 / 16% (+0.65) | 33 / 57 / 10% (+0.11) | shift −2, −½, tilts |
| *one-sided:* Square Area/lpf · Pythagorean Area/slanted-square, prime-height; Square Area/{spf, lpf, omega} · Ruler/far; Whole Crossing/{k-spf, k-gpf} · Prime Staircase/last-prime | | | |

Square Area against Pythagorean Area is the pool's only real tension. Both main layers are about the area of the
triangle the line cuts off the axes, with incompatible targets: "close to a square number" against "close to 6".
Notice that the mean Δbits stays slightly positive even where most moves lower the other rule: the losses are small and
the rare gains are larger. So the tension is in frequency, not in magnitude.

## Which directions most rules like

Each line below gives a direction, the number of rules that like it (it raises the rule at ≥ 40% of its states and
lowers it less often), and the pairs that share it and that have it against them:

- **Raising the y-intercept is the shared anchor.**
  - shift +1: 15 rules like it; shift +2: 16 rules.
  - slide (0, 1): 15 rules. nudge c −1 (also raises the y-intercept): 14 rules.
  - Shared by about 145 pairs each and against in only about 40.

  The mirror directions (shift −1, slide (0, −1), nudge c +1, move y −1) are liked by no rule and are against in
  290–405 pairs. "Bigger is better" tie-breakers (big-prime, k-gpf, last-prime, big-bill, …) and the c-based
  near-a-prime mains all pull c upward together, so the y-intercept is the one hill that many rules climb at once.
- **The step and pivot family is the big lever**, and it cuts both ways. step ±2 and pivot@−1 +1 are the most often
  shared directions (306, 251 and 231 pairs). They are also among the most often against (184–350 pairs). Changing the
  gradient while holding one table value fixed moves many table- and sequence-based rules a lot, either way.
- **Tilt is liked by the gradient rules**: Square Area, Divisibility Ladder, Treasure and Prime Gradient/prime. It is
  shared with the crossing and Ruler rules through the x-intercept.
- **Stretch is narrow.**
  - ×2 and ×3 are liked by Divisibility Ladder/steep, Ruler, Exact Change/big-bill and a few others.
  - ×½, ⅓ and −½ are liked by Square Area only, all three tie-breakers.
  - Stretch never changes the x-intercept, so it does nothing for Whole Crossing's main layer or its k tie-breakers.
- **The mirrors** are liked by no rule (climb share 5–12%). Mirror origin is never *against* (0 pairs), and mirror x,
  y and diagonal are against in 72–77 pairs.
- **Basic strategies** (the full table is in the results file):
  - shift +1 repeated raises its own rule at 31–37% of the states at every k. The mean gain grows from 2.0 bits at
    k = 1 to 7.3 bits at k = 8. Along the way the other families' rules rise 41–44% of the time and fall 16–22%. It is
    the one strategy that carries others with it, because of the shared y-intercept anchor above.
  - nudge c −1 behaves the same way: 33–35% of states, others +43–45% / −16–20%.
  - stretch ×2 and ×3 climb a few rules steeply: the mean gain is 6.8 and 25 bits at k = 8. But they increasingly
    lower everyone else: at k = 8, ×3 lowers others 53% of the time and raises them 17%. Stretching is a lone climb with
    adversaries, which is the shape decision 30 asks for.
  - tilt +1, step +1 and pivot@−1 +1 hold steady: 28–35% own climbs, others up 39–56% / down 18–32%.
- **No simple hidden anchor besides c.** Moves that shorten the numbers (φ falls) or make them more whole (b falls) do
  not raise the climbing rule more often, and do not carry other rules more often, than other moves. Shorter moves
  raise their rule 16% of the time against 27% for longer ones, and other rules move up/down 34/31% against 39/27%.

## Flag: one prime for several rules

These are the three rules named in the task: Square Area/spf, Whole Crossing/k-spf and Prime Landing/big-prime.

**Random states hide the case.** Under the sampled states and small moves, no pair of the three is aligned:

| Pair | Class | Notes |
|---|---|---|
| Square Area/spf · Whole Crossing/k-spf | MIXED, shared climb | tilt ±1, ±2, ±½ and nudge a ±1 are shared: both read the x-intercept. 5 directions are against. |
| Prime Landing/big-prime · Square Area/spf | MIXED | Big-prime's climbs raise SA/spf only 39% of the time and lower it 43%. |
| Prime Landing/big-prime · Whole Crossing/k-spf | MIXED | Big-prime's climbs raise WC/k-spf 27% of the time and lower it 35%. |

The other way round, the climbs of SA/spf and WC/k-spf raise big-prime 72–92% of the time along shift +1, +2, +½ and
move y +1. Pushing the y-intercept up helps big-prime whatever else it does.

**Constructed lines show it plainly.** One prime p, placed in the intercepts, serves two of the three rules at once, and
the same prime also feeds the families' sister tie-breakers. Bits at p = 1009, with the read in the last column:

| Line (x-int, y-int) | SA/spf | WC/k-spf | PL/big-prime | Others over 8 bits | Read |
|---|--:|--:|--:|---|---|
| (p, 2p) | 674 | 540 | 4 | SA/lpf 531, WC/k-gpf 474 | the x-intercept is p and the area is p², so the root is p |
| (2p, p) | 674 | 3 | 534 | SA/lpf 531, WC/k-gpf 474 | the y-intercept is p and the area is p² |
| (p, p) | 2 | 540 | 534 | WC/k-gpf 474 | both intercepts are p |
| (1, p) | 2 | 1 | 534 | **PL/m-spf 1,040**, PL/m-gpf 532, **WC/m-spf 711** | the gradient is −p and the y-intercept is p |

The last row is the strongest instance of "one thing benefits multiple rules" in the pool. A single large prime p, as
the y-intercept with x-intercept 1, earns hundreds of bits for Prime Landing under every tie-breaker and for Whole
Crossing/m-spf.

**No line serves all three.** With x-intercept p and y-intercept q both prime, the area pq/2 is never a perfect
square. So the three are pairwise aligned through a shared prime but jointly frustrated. A player can satisfy any two
with one prime.

**Stretch by p** keeps the x-intercept and multiplies the y-intercept by p. From x-intercept p:

| p | from y-int 2: ΔSA/spf | from y-int 1: ΔPL/big-prime | ΔWC/k-spf | Fee (bits) |
|--:|--:|--:|--:|--:|
| 5 | +7.6 | +4.2 | 0 | 12.5 |
| 31 | +24.1 | +17.9 | 0 | 26.7 |
| 101 | +70.2 | +54.6 | 0 | 35.9 |
| 1009 | +672 | +531 | 0 | 53.8 |
| 100003 | +66,215 | +52,461 | 0 | 89.5 |

**The hills are linear in the prime; the fee is logarithmic.** The "bigger is better" tie-breakers have no knots past
the sampled range. So their committed value functions extrapolate along a straight line in the secondary utility
(`valueLookup`'s tail; for example PL/big-prime has a tail slope of 0.52 bits per unit of the prime, and SA/spf 0.66).
Bits therefore grow like ~0.5–0.7·p, while one stretch by p costs ~5.4·log₂ p bits. Owner decision 30 wants unbounded
hills, and these are unbounded hills. But their slope against cost is enormous, and a known prime is a formula, not a
search. That is the kind of easy high peak the metastable-ecosystem instruction calls a bug.

The adversaries in the current pool cannot answer it. A rule loses at most its current bits, typically 0–15, when a
rival climbs, while the climber gains hundreds or thousands. **This is a proposal for the coordinator, not a change
made here:** cap or flatten the tail (for example bits ∝ log of the prime, as rarity under π would give), or pair each
unbounded hill with an adversary that is itself unbounded.

## Observations for designing tension families

1. **Same anchor with incompatible targets makes tension; same anchor with compatible targets makes alignment.**
   - Square Area against Pythagorean Area (area near a square against area near 6) is the only real tension in the
     pool.
   - Ruler with Pythagorean Area (distance near a small square, area near 6: both "close to the origin") is the most
     aligned pair of families.

   To add tension deliberately, give two families the same anchor and opposed or incommensurable targets. For example:
   - y-intercept near a square against y-intercept near a prime;
   - gradient steep against gradient near 1;
   - x-intercept a big prime against x-intercept highly composite (many prime factors).
2. **The shared anchors in this pool:**
   - the y-intercept c: the most shared, through shift, slide and nudge c, and through the stretch from the origin;
   - the x-intercept: Whole Crossing, Square Area, Ruler/far and Exact Change/big-piles, through tilt and nudge a;
   - the gradient: Divisibility Ladder, Treasure, Prime Gradient/prime and Same on Both Rulers/steep;
   - the triangle and the distance from the origin: Square Area, Pythagorean Area and Ruler.

   Most rules sit on c or the gradient, so directions that move c upward are liked by a third of the pool at once.
   Rules anchored on c should include some that want c **small** or c **composite**, as adversaries of the "c up" hill.
3. **The y-intercept-up hill is the unbounded hill many rules share** (big-prime, k-gpf, last-prime, big-bill,
   Treasure's terms). That is the multiple-benefit case the owner wants to be rare. It needs a rule that loses bits as
   |c| grows: a *bounded* target that c overshoots, or a "small numbers" rule.
4. **Make the unbounded hills adversarial in kind, not just in sign.** A loss is bounded by the victim's current bits
   (≤ ~15 here), while a big-prime climb gains ~0.5·p bits. Tension only bites if the adversary's own hill is also
   unbounded and pulls the same coordinate the other way. For example, "x-intercept with as many prime factors as
   possible" against Whole Crossing/k-spf ("smallest prime factor as big as possible").
5. **Stretch is the cleanest lone climber.** It helps a handful of rules and, repeated, lowers most others (×3 at
   k = 8: others down 53%, up 17%). Rules that reward stretching are natural adversaries of the c- and table-based
   rules. But stretch by p combined with a prime intercept is an easy peak (the flag above).
6. **Step and pivot are the levers that make most pairs MIXED.** They are both widely shared and widely against. They
   create the diversity of goals the owner asks for, and they are where a designer can tune: a new family that reads
   y(1) or y(−1) (kept fixed by step and pivot@−1) is protected from these levers. One that reads y(0) is exposed to
   them.
