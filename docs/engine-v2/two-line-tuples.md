# Two-line families in the owner's tuple shape: walk-throughs (undealt designs, 16 November)

The coordinator's order (16 Nov, 01:06 UTC): design the two-line families in the shape of design-principles.md 3b. Nothing
here is dealt or built: the shipped pair families (two-line-systems.md §13) stay as they are while the owner tests.

The shape:
- **Primary.** A property of the target nearest to a reading of the pair.
- **Secondary.** How close the reading is to that target.
- **Third.** Another dimension of the pair, judged against the same target.

Points are each layer's rarity added up: the tree valuation, choice (b) of pool-plan.md v2. Every tuple below was
computed by scripts/pair-tuples.ts (lib/v2-agents) on the real pair mutators, with the real prices.

## Do pairs share tonight's pool-wide problem?

**Yes, for prime targets; much less for power targets.**

Under the tree valuation, the first exact hit is cheap and worth most of the score, and then a greedy climb stalls.
- **Prime targets stall.** A pair's readings are rational numbers that the additive moves (a slide along the other
  line, a translate) tune in small steps. So landing exactly on a prime ending in 1 costs one or two 6–9⚡ moves. The
  next prime ending in 1 is 10–30 units further. Every unit step towards it first loses closeness, so a greedy seat
  stops on the first exact hit, as Prime Intercept does on lines.
- **Power targets need not stall.** A representation shortcut can carry a pair from one target to the next and keep it
  exact:
  - a stretch of the steeper line by k multiplies the gradients' ratio by k (Power Ratio below);
  - a zoom by k multiplies the crossing, the intercepts and the gaps by k.
  - Measured: a stretch by 2 took a ratio exactly on 2³ to exactly on 2⁴.
  - The price grows with the line's size (trial 29's floor): 9.1⚡ on a small pair, 108.8⚡ on y = 8x + 41.
  - So the climb continues and becomes dearer each step: a hill with a price, not a cliff. That is the pairs' answer to
    the stall.
- **What the power climb needs.** An adversary at the table, because a seat with nothing opposing it just keeps
  stretching, and the energy gate on the built version.

## Walk-through 1: Power Ratio (versions k = 2, 3, 5, 7; each with a choice of third)

**The card, as a player sees it:**
> Divide the steeper line's gradient by the gentler one's, ignoring minus signs. This is the *ratio* (for y = 9x + 1
> and y = 2x + 8½ it is 9 ÷ 2 = 4½).
> - **Main:** the power of 2 (1, 2, 4, 8, 16, …) nearest the ratio. Higher is better. "Nearest" is counted in
>   doublings: 3 is nearer 4 than 2.
> - **Tie-breaker:** how far the ratio is from that power, in doublings (4½ is 0.17 doublings from 4). Closer is better.
> - **Then:** the gap between the two y-intercepts should be near a multiple of that power (not 0), counted as a share
>   of the power: 0 is on a multiple, ½ is as far as it gets.

*Why it suits a 12-year-old:* "gradient" and "y-intercept" are on every line card. "Doubling" is explained in the card
by an example.

**Three systems, with their tuples and why:**

| system | tuple | why |
|---|---|---|
| y = 2x − 7, y = −x + 32 | (2¹, 0, ½ of 2) | the ratio is 2 ÷ 1 = 2, exactly 2¹; the gap 39 is ½ of 2 from 38 or 40 |
| y = 8x + 41, y = x + 41 | (2³, 0, 1 of 8) | the ratio is 8; the gap is 0, which is no multiple, so the nearest is 8 |
| y = 9x + 1, y = 2x + 8½ | (2², 0.17, 0.13 of 4) | the ratio 4½ is nearest 4; the gap 7½ is ½ from 8 |

**What a cheap move by another player does** (to y = 8x + 41, y = x + 41, which is (2³, 0, 1 of 8)):

| move | price | tuple after | kept |
|---|--:|---|---|
| shift line 1 by 1 | 6.0⚡ | (2³, 0, 0.88) | main and tie-breaker kept; the third improves |
| tilt line 1 by 1 | 6.0⚡ | (2³, 0.17, 1) | main kept; closeness drops a little |
| turn line 2 by 1 | 7.0⚡ | (2², 0, 1) | down one power, still exact |
| slide line 1 by 1 | 6.0⚡ | (2³, 0, 0.13) | kept; the third improves a lot |
| zoom by 2 | 77.9⚡ | (2³, 0, 1) | unchanged (a zoom keeps gradients) |
| stretch line 1 by 2 | 108.8⚡ | (2⁴, 0, 0.44) | up one power, still exact |

- **Bumps are gradual (principle 11).** A modest bump keeps the main part and moves closeness by a fraction of a
  doubling. The one cheap move that changes the target (a turn) lands on the next power down, still exact.
- **Fractions are good states (principle 13).** A ratio of 9/4 is 0.83 doublings from 2, and a gradient of ½ against
  2 is exactly 4.

**Versions:** k = 2, 3, 5, 7. A bigger k has fewer, rarer targets, so it is equal in opportunity per unit of code
cost, as the ladder audit measures.

**Alternative thirds:**
- the y-intercepts' gap near a multiple of the power (above);
- the crossing's x near a multiple of the power, as a share of it;
- the gentler gradient times the power near a whole number.

**Adversaries:**
- Steep Ratio as shipped, and any rule wanting the lines near parallel: a ratio of 1 is the foot of this ladder.
- Divide By's bigger D, which wants the gradients far apart in the opposite sense.

## Walk-through 2: Prime Crossing (versions: the ending 1, 3, 7 or 9; each with a choice of third)

**The card:**
> The two lines cross at one point. Look at its height (its y, ignoring a minus sign).
> - **Main:** the prime number ending in 1 nearest to that height (11, 31, 41, 61, 71, 101, …). Bigger is better. A
>   prime is a whole number bigger than 1 that only 1 and itself divide.
> - **Tie-breaker:** how far the height is from that prime. Closer is better.
> - **Then:** the crossing's x should be near a multiple of that prime (not 0), counted as a share of the prime: 0 is
>   on a multiple, ½ is as far as it gets.

**Three systems:**

| system | tuple | why |
|---|---|---|
| y = 2x − 7, y = −x + 32 | (11, 8, 0.18) | crossing (13, 19): 19 is 8 from 11 and 12 from 31; 13 is 2 from 11, which is 0.18 of 11 |
| y = x/2 + 30, y = −3x/2 − 31 | (11, 3.75, 0.23) | crossing (−30½, 14¾): fractions read as they are |
| y = 8x + 41, y = x + 41 | (41, 0, 1) | crossing (0, 41): exactly on 41; x = 0 is no multiple, so the nearest is 41 |

**What a cheap move does** (to the pair on 41):

| move | price | tuple after |
|---|--:|---|
| shift line 1 by 1 | 6.0⚡ | (41, 0.14, 1) |
| tilt line 1 by 1 | 6.0⚡ | (41, 0, 1) |
| turn line 2 by 1 | 7.0⚡ | (41, 0, 1) |
| slide line 1 by 1 | 6.0⚡ | (41, 1, 0.98) |
| slide both up by 1 | 6.1⚡ | (41, 1, 1) |
| zoom by 2 | 77.9⚡ | (71, 11, 1) |

- **Robust (principle 11).** One bump moves closeness by up to 1 and keeps the prime.
- **It stalls.** As found tonight on lines, the first exact prime is two cheap moves away, and the next is a long
  additive walk. So it should not be dealt as it stands. Two repairs to measure:
  - **(a) Targets joined by a shortcut.** Primes are not joined, so this means changing the target, which makes it a
    different family.
  - **(b) A main part counted in steps between targets.** The tie-breaker would be the share of the way from this
    prime to the next, so walking up between primes gains instead of losing. That is the spec lead's call for the pool.

**Re-measured under the tree valuation** (the coordinator, 16 Nov: the spec lead found that bounding the inner terms
removes the stall on single lines; scripts/prime-crossing-tree.ts).

The setup:
- 100,000 law draws, valued by lib/v2-valuation tree-value.ts.
- 16 greedy climbs of one seat's 2,500⚡ on one pair. Each step takes the best bits per energy over every pair move:
  shift, tilt, turn, slide, stretch, translate and zoom.

| valuation | primes stepped per climb (median / max) | climbs stepping ≥ 2 primes | final bits (median / max) |
|---|---|--:|---|
| tree (chain rule) | 2 / 4 | 9 of 16 | 13.5 / 17.9 |
| tree, closeness and third at most 2 bits each | 14 / 29 | 16 of 16 | 17.9 / 19.6 |
| tree, closeness in units of the gap to the next target | 3 / 5 | 13 of 16 | 13.5 / 17.9 |

- **Bounding the inner terms removes the stall for Prime Crossing too.** So it is dealable in the shape, on that
  valuation, pending the energy gate and test 2 once built.
- **Grading closeness by the gap barely helps here.** The gaps between primes ending in 1 are 10–30, so a unit step is
  still a sizeable share.
- **Every climb still ends frozen,** because the tree's level term stops growing past the largest prime its draws
  measured (tree-value.ts: "nothing beyond the best measured u0"). That is a top of its own. A level tail like the
  pairs' ladder-log, capped by witnesses, is needed before a bounded tree is dealt.

**Versions:** the ending 1, 3, 7 or 9, equal by the symmetry of primes' endings.

**Alternative thirds:**
- the crossing's x near a multiple of the prime;
- the product of the gradients times the prime near −1;
- the crossing's x near the prime ÷ its height.

## The check table (design-principles.md) for the two walk-throughs

| row | Power Ratio | Prime Crossing |
|---|---|---|
| 1 unbounded | yes: powers without end | yes: primes without end |
| 2 climbed all game | expected: the stretch shortcut joins targets, and its price rises with size (to measure) | with inner terms bounded at 2 bits: a greedy seat steps 14 primes (median); without: 2, a stall |
| 3 tie-breaker defined by the main part | yes: closeness to that power; the third reads the same power | yes: closeness to that prime; the third reads the same prime |
| 3a ≥ 3 candidates of different forms | three thirds listed (near-multiple, near-multiple of another reading, near-whole) | three listed |
| 3b nearest-target shape | yes | yes |
| 4 dealable instances | 4 | 4 |
| 5 perpendicular | to measure (PMI) once built | to measure |
| 6 adversaries | Steep Ratio's near-parallel foot; Divide By | Far Crossing (the steeper line's x-intercept moves the crossing) |
| 11 robust to modest bumps | yes: closeness changes by fractions of a doubling | yes: closeness changes by up to 1 |
| 12 the card states the scoring | yes: each layer says what is measured and which way is better | yes |
| 13 good states among fractions | yes: ratios such as 4½ and ½ ÷ 2 | yes: heights such as 14¾ |
