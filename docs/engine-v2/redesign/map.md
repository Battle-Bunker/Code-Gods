# The scoring and costing machine as built (map)

Read from the code on `develop`, 16 November. Each claim carries a label:
**[C]** true by construction (follows from the definitions; checkable in the code);
**[O]** observed by me, by running the real engine on a handful of hand-picked states and moves (an existence proof,
not a property of the game);
**[J]** my conjecture. I ran no games and cite no simulation results.

## 1. The quantities

- **State energy** (bits): the length of an object's numbers written in one fixed code per object type (section 3).
- **The law**: how likely each state is under a random walk that accepts a move with chance 2^−price. Each extra bit
  of state energy halves the chance. It gives birth to objects and is the yardstick for "rare"; nobody plays it.
- **Score**: a rule's verdict on a state, an ordered list (main part, then secondaries) compared left to right.
- **Bits**: how rare it is, under the law, to score at least this well. A precomputed table per dealt rule; past
  about 18 bits nothing is measured and a fitted "tail" formula extends it.
- **Points**: on each object, my bits × the sum of everyone else's bits.
- **Energy**: the currency. Beginner game: 4 a second for 600 seconds plus 130, so 2,530 a seat (the brief says
  3,000); a store holds at most 960.
- **Fee**: the code length of the call: which move (about 3.2) plus arguments. Adding costs by the amount (4.4 per
  unit on lines [O]); multiplying costs by the factor's digits (×3 costs 5.4 [O]). A move and its undo share a fee.
- **Surcharge**: the rise in state energy, if it rose.
- **Act charge**: W + 0.05 × W², W being fee plus surcharge summed over the act's calls; plus reads.
- **Read price**: 1/32 energy per bit an agent reads. **Program cost**: the program's token length, scaled (a typical
  starter about 45).

All [C] unless marked.

## 2. How they connect

1. Number code → state energy → the law.
2. The law + a rule → that rule's bits table → bits of a state → (times the others' bits) → points.
3. Number code → surcharge. Call code → fee. Fee + surcharge → act charge → energy spent.
4. Income → energy → both what you can pay and how often your agents are offered objects (offers go in proportion to
   energy held).

[C] The scoring side (2) and the costing side (3) share only the number code, and it reaches cost only through the
surcharge.

**Hold exactly [C]:** a move and its undo share a fee; price up minus price down equals the change in state energy;
the law is "one bit, half as likely"; points = own × others; one call of size n has the same W as n unit calls; a
grid swap never changes state energy.

**Holds only where measured [C]:** bits of a state ≤ its state energy. Past 18 bits it rests on hand-set limits.

**Not guaranteed by anything in the code:**
- *"Bits gained ≤ surcharge paid."* [O] Counter-examples: section 4 (5.15 bits for a surcharge of 3); a grid swap
  (1.7 bits for 0).
- *"One energy buys one bit."* [C] That is the surcharge only; fee and the squared term come on top. [O] In the dozen
  moves I priced, the surcharge was the smaller part (line unit shift: fee 4.4, surcharge 0 to 2; grid ±1: 8.2, 0.5).
- *"A far move costs more than the path."* [C] Only through 0.05 × W², within one act.
- *"Repair costs more than damage."* [C] Only when the damage lowered state energy.

## 3. State energy today

**Lines** (the default board has fraction coefficients; the line is stored as whole numbers a, b, c in ax + by + c = 0).
For a and c: half a bit per unit of the *sum of the number's prime factors* (64 = 2×2×2×2×2×2 → 6; 37 → 18.5). For b:
half a bit per unit above 1. Plus constants.
y = 3x + 36 → 15.95. y = 3x + 37 → 29.45. y = 3x + 38 → 21.45.
[C] Energy is not size: neighbours differ by 13 bits, and y = 2x + 64 (16.45) is cheaper than y = 2x + 37 (28.95).

**Grids** (4×4 digits). 27.61 plus half a bit per unit of the total of all cells.
All zeros → 27.61. A typical newborn → about 41. All nines → 99.61 (and it scores nothing for anyone).
[C] Energy cannot see where the digits are; the dealt grid rules I read are about where they are.

**Pairs** (two lines). The two lines' codes added, with zero coefficients made rarer.
y = x with y = −x → 17.80. (y = 2x + 3, x + 2y = 4) → 23.38. (−7x + 3y = 37, 5x + 4y = 64) → 51.38.

## 4. One move, end to end

[O] One hand-picked move on a real three-seat deal (beginner lines). Seat A: Prime Landing (the x-crossing rounds to
minus a prime ending in 1). Seat B: Ruler (the squared distance to the origin, rounded down, is a prime ending in 9).
Seat C: Prime Staircase. The line y = 2x + 11 is stretched by 3 to y = 6x + 33.

| | before | after |
|---|---|---|
| State energy | 15.95 | 18.95 |
| A bits / points | 3.87 / 20.6 | 3.87 / 40.5 |
| B bits / points | 3.45 / 19.8 | 8.60 / 49.3 |
| C bits / points | 1.86 / 13.6 | 1.86 / 23.2 |

Price: fee 8.65 (3.24 to name the move, 5.40 for the factor) + surcharge 3.00 = 11.65. Act charge: 11.65 + 0.05 ×
11.65² = 18.43, plus about half an energy of reading. Only B's rule moved (the squared distance became 29.4); A's
points doubled without A acting. The undo costs 12.4. A vivid case: it shows what can happen, not what usually does.

## 5. Knobs and patches

| Knob (where) | Value | The dissonance it answered |
|---|---|---|
| Bits per unit (`v2-core/codes.ts` STEP; grid `step`) | 0.5 | Strength of the pull to cheap states |
| Factor code for a, c (`codes.ts`) | sum of prime factors | One energy function had to make multiplying cheap and primes dear |
| Chance of a zero coefficient (`line.ts`, `pair.ts`) | 1/8, 1/16; pairs 1/64, 1/256 | Flat and vertical lines were cheap shared basins |
| Size-proportional fee (`codes.ts` amountCode) | 4.4 per unit on lines | Far moves were cheap when priced by digits |
| Quadratic act term (`v2-economy/charge.ts`) | 0.05 × W² | One big act should cost more than small ones |
| Read divisor; look weight (`charge.ts`, presets) | 32; 0.06–0.19 | Reading cheap but not free |
| Shortcut floor (`v2-linear/mutators.ts`) | fee doubles every 3.5 bits of energy past 20 | Repeated ×3 climbed to 59–78 bits |
| Energy gate (`test/unit/v2-no-straight-hill`) | 35 bits; 2 open exceptions | Nothing structural bounds bits per income |
| Tail limits (`v2-valuation/value.ts`, `value-pair.ts`) | ≤ 0.5 per unit, ≥ 0.38 per doubling, pairs 1 per doubling, distances 1 per halving, sampling trusted to 18 bits | Each fixed one overpayment (102,000 points; 8,238 bits; 34 bits) |
| Ladder caps, per-level secondary curves (`value.ts`) | from hand-made witness states | Extrapolated bits exceeded state energy; flat tops |
| Tree value, 2-bit inner cap (`tree-value.ts`) | built; **no dealt rule uses it** | An exact hit was worth 4–14 bits and stopped climbs |
| Exemption lists (`v2-rule-check`, `design-principles` tests) | about 30 entries; 8 of 10 line families exempt from "a cheap move keeps most bits" | Dealt rules that fail the written principles |
| Undealt lists (`presets.ts` ×3) | several rules and secondaries | Cheap peaks (37–45 bits for 99–211 energy); a formula that finds tops |
| Rule redraw (`drift.ts`) | every 120 s on lines | Boards standing still |
| Uniqueness correction (`uniqueness.ts`) | small shift on rare scores | No two objects may be equal |
| Power, store, offers (`v2-economy/settings.ts`) | 4/s, 240 s, 3/s | "Nothing climbs past about 40 bits" |
| Locks (`v2-core/locks.ts`) | 1 energy per bit; upkeep repays the fee every 240 s | Defence. In the simulator, not the live server |

## 6. Where the machine fights itself

1. **Cost and value read different things. [C]** Surcharge depends only on the number code (cell total; factor
   structure). Rules depend on arrangement, primes, distances, areas. So moves exist that change bits at no change in
   energy, and nothing forces a more valuable state to cost more to reach. How often play uses such moves: unknown.
2. **The fee is tied to nothing on the scoring side. [C]** Fees can be any symmetric numbers without changing the law
   or anyone's bits. [O] In my few examples they were most of the bill. [J] This is why a floor, a gate and a small
   income were needed to hold bits down.
3. **Line gravity pulls toward smooth numbers, not small ones. [C]** A unit step can cost 13.5 or refund it. [J] This
   treats prime-wanting and smooth-wanting rules unequally.
4. **Unbounded by design, capped by test. [C]** Bits are measured to 18, extrapolated by hand-set formulas beyond, and
   a test forbids passing 35.
5. **Left-to-right ranking times a product. [C]** Any main-part change outranks all secondaries, and each seat's
   points are multiplied by the others' bits. [O] One unit shift took a seat from 2.23 bits to 0.02. The tree valuation
   meant to soften this is built but not dealt [C].

## How this could be wrong

*What it rests on.* My main diagnosis (scoring and costing barely touch) rests on about twenty states and a dozen
moves that I chose, three deals, today's presets, and reading rather than playing.

*Strongest alternative.* The loose coupling may be harmless, even the point: fees price *naming* a move, the surcharge
is gravity, and value comes from rare coincidences between rules that no cost function could price in advance. Then
the patches are symptoms of income being too large for the bit scale, or of left-to-right ranking, not of the code.

*What a cleverer player might do.* Use cheap sideways moves to cooperate, not to damage; hoard, since offers follow
energy held; raise others' bits to raise their own points; write agents whose read costs, which I treated as small,
dominate. Any of these could turn what I call conflicts into the interesting part.

*What would change my mind.* A census over many random states and all cheap moves in which surcharge usually tracks
bits gained; or inventive human play in which the gate, floor and exemptions never bind.

## Unsure

How points accumulate into standing. Whether defence goals are dealt to beginners. Whether the gate's climber pays the
squared term. The table's third column comes from code comments, unverified.
