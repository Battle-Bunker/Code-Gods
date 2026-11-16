# Redesign, role "minimal": one height, one price list, one sentence for score

Analyst document, 16 November 2026. Nothing here is built. Numbers in the example are hand-computed from the stated
dials, not simulated.

## The finding

Seven of the twelve wanted properties are one statement: **no move may change anyone's score by more than a fixed
multiple of what that move (or its undo) costs.** "Bigger costs more and scores more", "score is the energy it takes to
get there", "no rule above par", "an exact hit is only modestly above a near miss", "a modest bump keeps most of the
value" and "damage is measured by the cost of repair" are all that sentence. The present machine cannot promise it,
because score and price are two different functions: score is rarity under a random walk, price is fee plus rise.
Every patch on the list (the 35-bit gate, the 2-bit cap, tiers, floors, the weight of 100) is a clamp where the two
disagree. The proposal makes score a function *of prices*, so they cannot disagree.

## The machine, for a 12-year-old

1. Every object has a height: bigger numbers are higher.
2. Moving an object costs a little for the distance (friction) and a lot for any height gained (lift); coming down
   costs only friction.
3. A shortcut (mirror, swap, stretch) skips the friction of the long way round, never the lift.
4. Your secret rule is a list of trophies: places you want one of the object's numbers to be, such as "the y-intercept
   on a prime ending in 7".
5. A trophy is worth the height of the lowest object that holds it.
6. Your score on an object is your best trophy's worth, minus twice what it would cost to move the object there from
   where it is now.
7. Your points are your score times the other players' scores added together; anyone may pay energy into a lock, which
   must be paid off before the object can leave the states the lock names.

## The same, precisely

- **Height** of a state: a field strength (bits per unit of size) times the size of each number, plus a small charge
  for a fraction's bottom number. One dial: field strength.
- **Price** of a call: friction (a rate per unit added; a small fee by digits for a factor or a shortcut) plus the rise
  in height, if any. One energy is one bit of height. One dial: the friction rate. Fees need not be equal both ways,
  and each mutator may have its own friction; only lift is shared.
- **Rule**: a reading of the object plus a set of wanted values of it. A tuple rule is the same thing with narrower
  trophies ("intercept on that prime *and* gradient near one over it"), which are higher and so worth more.
- **Score** in bits: the largest, over the rule's trophies, of (least height of any state holding the trophy) minus
  pickiness times (the cheapest price found from here to such a state); never below zero. One dial: pickiness, at
  least 1. An over-estimate of the price only lowers the score, so a bounded search is safe.
- **Lock**: a wall of energy around the states a predicate names. It is the one thing that is not a function of state.

Three facts follow by arithmetic, for every rule, with no per-rule check: a score never exceeds the object's own
height; a move changes a score by at most pickiness times its price or its undo's price; one player's score on the board
never exceeds the height objects started with plus the net lift players have paid.

## Table 1: the twelve properties

| # | Wanted | Follows from |
|---|---|---|
| 1 | metastable, hard to search | **nothing here** (see "Not achieved") |
| 2 | hill climbing, temporary losses | score formula: between two trophies lift is paid before the next trophy starts to count |
| 3 | bigger costs more, scores more | trophy worth is height; height is what lift charges |
| 4 | score tied to energy to reach; par is structural | score never exceeds height; height never exceeds lift paid |
| 5 | gravity, configurable | the field strength dial |
| 6 | exact only modestly above near | the gap *is* pickiness times the price of the last step |
| 7 | keeps value under a bump | same sentence as 6 |
| 8 | repair dearer than damage, worse with height | down costs friction, up costs friction plus lift; severity grows because points are a product |
| 9 | locks | the wall: the one extra primitive |
| 10 | diverse rules, unbounded, tuples, rationals, readable card | readings and trophies; nothing in the machine has a top |
| 11 | shortcuts as differently priced routes | friction per mutator; "cheapest price found" counts shortcuts |
| 12 | add by amount, multiply by digits, primes hard | friction only; **weak form** (see below) |

## Worked example

Dials: a quarter of a bit per unit of height; friction 0.02 per unit; a mirror costs 0.5; pickiness 2. Line
y = 8x + 90. Ann wants the y-intercept on a prime ending in 7 (67, 97, 107 are worth 16.75, 24.25, 26.75). Ben wants
the gradient on a power of two (8 is worth 2, 16 is worth 4).

- Ann at 90: seven units below 97, each costing 0.27 to climb. Score 24.25 − 2 × 1.89 = 20.47. The intercept's height
  is 22.5, so score is below height.
- Ann lifts to 97 for 1.89 energy: score 24.25. At 96 it would be 23.71; at 98, 24.21. Modest either side.
- Points: Ann 24.25 × Ben 2 = 48.5 each way. Ben lifts the gradient to 16 for 2.16: both now have 97. The same 2.16
  spent by Ann toward 107 gains under 3 points. The product pulls energy to the low side.
- Ann passing 97 toward 107: at 100 her score is 24.13, a small dip, and stays flat until about 102; then it climbs.
  That is the "temporary loss".
- A rival shifts the intercept down ten, to 87, for 0.2 energy: Ann loses 5.4 bits and repair costs 2.7, thirteen times
  the knock.
- A rival mirrors the line (intercept −97) for 0.5: Ann's trophy is one mirror away, so she keeps 23.25. Today that
  move takes nearly everything.

## Table 2: what would go

| Present mechanism | What it was compensating for |
|---|---|
| Score as rarity under the law; samplers, value files, exact sums, the tree | score and price being different functions |
| "Prices must be one exact potential" | only needed so the law had a closed form; nothing reads the law now |
| The factorisation code | trying to put "primes are hard" into height, where it makes neighbours differ by tens of bits |
| Level + closeness + third parts, the 2-bit cap, tie-breaker tiers | closeness measured as rarity when it should be the price of finishing |
| The 35-bit gate and per-rule exemptions | no bound tying score to height |
| Floors for undefined readings | a reading had to exist; now only a price to a trophy has to |
| Energy weight (10 or 100 per bit), the proposed convex surcharge | energy and bits being two units |
| Hold rarity; two-step lookahead as a fix | cliffs in the score |
| Probably: the squared act charge | far moves; friction per unit already makes a jump cost its path. Unsure: the owner's words say "more in one act" |

## Not achieved; needs something real

- **Property 1.** This machine makes the landscape *easier* to search: scores are smooth and transparent. Difficulty
  has to come from secret rules, readings that share numbers and pull against each other, and other minds knocking and
  locking. No pricing rule supplies it.
- **Rearrangements.** No height that depends on the state alone can make a mirror or swap dearer to undo than to do:
  same numbers, same height, same price both ways. What the machine gives instead is that a cheap rearrangement can only
  do cheap damage. Real defence needs the lock.
- **Locks are not optional.** Downward knocks get *more* leverage than today (thirteen to one above). That is what the
  owner described, but without locks I expect tall objects not to survive.
- **Primes.** If lift is by size, a prime costs only a step or two more than the round number beside it. "Primes are
  hard because multiplying cannot reach them" at tens of bits contradicts property 6. They are two ends of the
  friction-to-lift dial.
- **Flip-flop and standstill.** Not addressed; turnover stays.
- **Piling on.** Points are a product and score now tracks energy one for one, so pouring everything into one object
  pays best. Only rival readings and knocks oppose it. This may be the "one state is enough" bug.

## The one cheap experiment

In the existing competitive table (`competitive.ts`, `knock-phi.ts`), swap the score for the formula above on two line
families whose reading is a coefficient (closed form, no search), and replay "one mixed player and two naive" at
friction-to-lift 1:1 and 1:12, no locks. **Falsified if** sideways knocks still destroy more than a tenth of the bits
lost, or if no friction setting gives both late climbing and a knocker's win share under 50%, or if more than half the
board's height ends on one object.

## Unsure, and where the brief's summary is off

- Unsure the "cheapest price found" is cheap enough to compute for readings such as area or crossing.
- Unsure pickiness is one number for all rules.
- Grids fit formally (height is the cell sum, a pattern is a trophy); untested.
- "Bits gained ≤ energy paid in surcharge" is not true today: a sideways move can gain many bits for no surcharge. It
  is the sideways knock run forwards.
- The size-based height and its price exist only on `claude/gravity-measure`, not on `develop`.
- "Nearest target" has no cliff at the target but has one halfway between targets, where one unit changes the level.
