# Redesign, role "minimal": one height, one price list, one sentence for score

Analyst document, 16 November 2026. Nothing here is built or simulated. Every claim carries a label: **[C]** true by
construction (follows from the definitions), **[O]** observed in a narrow simulation (a dozen ten-minute games a row,
six hand-written strategies, one preset: an existence proof, not a property of the game), **[J]** my conjecture.

## The finding

Seven of the twelve wanted properties are one statement: **no move may change anyone's score by more than a fixed
multiple of what that move (or its undo) costs.** "Bigger costs more and scores more", "score is the energy it takes to
get there", "no rule above par", "an exact hit is only modestly above a near miss", "a modest bump keeps most of the
value" and "damage is measured by the cost of repair" are all that sentence [J: this is my reading of the owner's
words]. The present machine cannot promise it, because score and price are two different functions: score is rarity
under a random walk, price is fee plus rise [C]. I read the patches (the 35-bit gate, the 2-bit cap, tiers, floors,
the weight of 100) as clamps where the two disagree [J]. The proposal makes score a function *of prices*, so the
sentence holds by arithmetic [C].

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

Three facts follow by arithmetic, for every rule, with no per-rule check [C]: a score never exceeds the object's own
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

All [C], hand-computed. Dials: a quarter of a bit per unit of height; friction 0.02 per unit; a mirror costs 0.5; pickiness 2. Line
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
- A rival mirrors the line (intercept −97) for 0.5: Ann's trophy is one mirror away, so she keeps 23.25. (In the one
  simulation of today's machine, such sideways knocks took a median 5 to 8 bits [O].)

## Table 2: what would go

The left column is [C] (the machine does not use these). The right column is [J].

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

- **Property 1** [C]. Scores become smooth and transparent, which makes the landscape easier to search, not harder.
  Whatever makes the game hard must come from elsewhere: secret rules, readings that share numbers, other minds.
- **Rearrangements** [C]. No height that depends on the state alone can make a mirror or swap dearer to undo than to
  do: same numbers, same height, same price both ways. The machine gives only: a cheap rearrangement does cheap damage.
- **Knock leverage** [C]. A downward knock costs friction; its repair costs friction plus lift (thirteen to one above).
  The lock is the only defence the machine offers. Whether tall objects survive without it, I do not know.
- **Primes** [C]. If lift is by size, a prime costs a step or two more than its round neighbour. "Primes are hard
  because multiplying cannot reach them", at tens of bits, contradicts property 6: two ends of one dial.
- **Increasing returns** [C]. Points are a product and score tracks energy one for one, so energy put into one object
  earns more than the same energy spread over several. Whether play then piles onto one object is unknown [J: a risk].
- **Flip-flop and standstill.** Seen once under today's machine [O]; nothing here bears on them either way.

## How this could be wrong

- **Assumptions.** That the owner wants cost itself as value. Rarity also counts *how many ways* lead to a state;
  deleting it may delete a force for diversity. That "cheapest price found" is computable for readings like area. That
  one pickiness suits every rule.
- **Strongest alternative.** The patches may come not from score and price being two functions, but from rules that
  reward patterns height cannot see, and from an exchange rate that was never set. Then keeping rarity and fixing those
  two is the smaller change, and this proposal throws away a working measure.
- **What a cleverer player might do.** Read rivals' secret rules off the smooth response of their total to small
  probes, which cliffs used to hide. Park just above many trophies, where overshoot is nearly free. Build trophies'
  cheapest holders out of fractions the height undercharges. Use a lock as a weapon: rearrange cheaply, then wall the
  object in the bad state. Form a coalition that lifts one shared number. I have not thought of the sixth.
- **What would change my mind.** A reading where the price search is slow or gameable; a person inferring a rule in a
  minute; any hand-built state whose score exceeds what the arithmetic above allows.

## The one cheap check

Structural, not a forecast of play: implement the score for two coefficient readings (closed form) and enumerate every
one-call move from a few thousand states. **Falsified if** any move changes a score by more than pickiness times its
price or its undo's, or any score exceeds height: then the "by construction" claims are wrong as implemented. Replaying
the competitive table afterwards would show only what six scripted strategies do; a human trying to break it for an
hour is worth more.

## Where the brief's summary is off

- "Bits gained ≤ energy paid in surcharge" is false today [C]: a sideways move can gain bits for no surcharge.
- The size-based height and its price are on `claude/gravity-measure` only, not on `develop` [C].
- "Nearest target" has no cliff at the target but has one halfway between targets, where one unit changes the level
  [C by the rule's definition; its size in play unmeasured].
