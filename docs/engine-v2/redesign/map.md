# The scoring and costing machine as built (map)

Read from the code on `develop` on 16 November, and checked by running the real engine on real dealt rules. Every
number below was produced by the code, not copied from a document.

## 1. The quantities

- **State energy** (bits). How many bits it takes to write an object's numbers down in one fixed code. Each object
  type has its own code (section 3).
- **The law.** A table of how likely each state is under a random walk that accepts a move with chance 2^−price. It
  works out as: each extra bit of state energy halves the chance. Nobody plays this walk. It is used to give birth to
  objects and as the yardstick for "rare".
- **Score.** What a rule says about a state: a short ordered list (main part, then secondaries), compared left to right.
- **Bits** (a rule's value for a state). How rare it is, under the law, to score at least this well: one bit per
  halving. Stored per dealt rule as a precomputed table. Past about 18 bits nothing is measured; a fitted "tail" formula
  extends the table.
- **Points.** On each object: my bits × the sum of everyone else's bits.
- **Energy.** The currency, nominally in bits. Beginner game: 4 a second for 600 seconds plus 130 at the start, so
  2,530 a seat (the brief says 3,000). A store holds at most 960.
- **Fee.** The code length of the call itself: which move (about 3.2), plus its arguments. Adding costs in proportion
  to the amount (4.4 energy per unit on lines); multiplying costs by the factor's digits (×3 costs 5.4). A move and its
  undo have the same fee.
- **Surcharge.** The rise in state energy, if it rose; nothing if it fell.
- **Act charge.** W + 0.05 × W², where W is the sum of fee plus surcharge over the act's calls; plus reads.
- **Read price.** 1/32 of an energy per bit an agent reads. A player's own look costs about 0.08.
- **Agent program cost.** The code length of the program's tokens, scaled; a typical starter is about 45 energy, an
  edit is the length of the difference.

## 2. How they connect

1. Number code → state energy → the law.
2. The law + a rule → that rule's bits table → bits of a state → (times the others' bits) → points.
3. Number code → surcharge. Call code → fee. Fee + surcharge → act charge → energy spent.
4. Income → energy → both what you can pay and how often your agents are offered objects (offers go in proportion to
   energy held).

The only link between the scoring side (2) and the costing side (3) is the number code, and it reaches the costing
side only through the surcharge.

**Hold exactly:** a move and its undo share a fee; price up minus price down equals the change in state energy; the
law is "one bit, half as likely"; points = own × others; one call of size n has the same W as n unit calls.

**Hold roughly:** bits of a state ≤ its state energy. True for measured tables; beyond 18 bits it is enforced by
hand-set limits on the tail.

**Do not hold:**
- *"Bits gained ≤ surcharge paid."* False. In section 4 a seat gains 5.15 bits for a surcharge of 3. A grid swap
  changed a seat's bits by 1.7 for a surcharge of 0.
- *"One energy buys one bit."* False in practice. The surcharge is the small part of the bill. A unit shift of a line
  costs 4.4 in fee and typically 0 to 2 in surcharge; a ±1 on a grid cell costs 8.2 in fee and 0.5 in surcharge.
- *"A far move costs more than the path."* Only through the 0.05 × W² term, and only within one act.
- *"Repair costs more than damage."* Only when the damage lowered state energy. Sideways damage is undone at the same
  price.

## 3. State energy today

**Lines** (the default board has fraction coefficients; the line is stored as whole numbers a, b, c in ax + by + c = 0).
For a and c: half a bit per unit of the *sum of the number's prime factors* (64 = 2×2×2×2×2×2 → 6; 37 → 18.5). For b:
half a bit per unit above 1. Plus constants.
y = 3x + 36 → 15.95. y = 3x + 37 → 29.45. y = 3x + 38 → 21.45.
So energy is not size: neighbours differ by 13 bits, and y = 2x + 64 (16.45) is far cheaper than y = 2x + 37 (28.95).

**Grids** (4×4 digits). 27.61 plus half a bit per unit of the total of all cells.
All zeros → 27.61. A typical newborn → about 41. All nines → 99.61 (and it scores nothing for anyone).
Energy cannot see where the digits are; every dealt grid rule is about where they are.

**Pairs** (two lines). The two lines' codes added, with zero coefficients made rarer.
y = x with y = −x → 17.80. (y = 2x + 3, x + 2y = 4) → 23.38. (−7x + 3y = 37, 5x + 4y = 64) → 51.38.

## 4. One move, end to end

A real three-seat deal on the beginner lines board. Seat A: Prime Landing (x-crossing rounds to minus a prime ending
in 1). Seat B: Ruler (square the line's distance to the origin, round down: a prime ending in 9). Seat C: Prime
Staircase (y(0), y(1), … begin with primes ending in 7).

The line is y = 2x + 11, state energy 15.95. One call: stretch by 3, giving y = 6x + 33.

| | before | after |
|---|---|---|
| State energy | 15.95 | 18.95 |
| A bits / points | 3.87 / 20.6 | 3.87 / 40.5 |
| B bits / points | 3.45 / 19.8 | 8.60 / 49.3 |
| C bits / points | 1.86 / 13.6 | 1.86 / 23.2 |

Price: fee 8.65 (3.24 to name the move, 5.40 for the factor 3) + surcharge 3.00 = 11.65. Act charge: 11.65 + 0.05 ×
11.65² = 18.43, plus about half an energy of reading.

Only B's rule moved (the squared distance became 29.4, which rounds to 29). A's points doubled without A doing
anything. The undo (stretch by ⅓) costs 12.4: no surcharge. Total points on the object went from 54 to 113 for 18
energy; a seat has 2,530.

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

1. **Cost follows the number code; value follows the rule; they see different things.** The grid code sees only the
   total; the line code sees factor structure. Rules reward arrangement, primes, distances, areas. So most
   value-changing moves are sideways in energy, and the promise "what is worth more cost more to reach" has nothing to
   stand on.
2. **The fee is most of the bill and is tied to nothing.** The one part of a price connected to rarity (the surcharge)
   is typically a tenth to a third of it. Seats hold 2,530 energy against a 25-bit scale, so the excess is held back by
   a floor, a gate and a small income rather than by the prices.
3. **Line gravity pulls toward smooth numbers, not small ones.** One unit step can cost 13.5 or refund it. Rules that
   want primes pay it; rules that want smooth numbers are paid by it. "Near" and "exact" can be far apart in energy
   while a rule calls them close, or the reverse.
4. **Unbounded by design, capped by test.** Hills have no top, but bits are measured only to 18; above that they are a
   fitted formula with hand-set limits, and a test forbids passing 35. The region the owner cares about is the
   unmeasured one.
5. **Left-to-right ranking times a product.** Any gain in the main part outranks all secondaries, so one step can
   erase a seat's bits (one unit shift took a seat from 2.23 to 0.02), and because points multiply, it erases the other
   seats' points too. The gentler tree valuation exists but is not dealt.

## Unsure

How points accumulate over time into standing (I read the per-object formula, not the scoring schedule). Whether
defence goals are dealt in the beginner game. The gate's climber appears to spend raw prices without the quadratic
term, so it is richer than a real seat; I did not run it.
