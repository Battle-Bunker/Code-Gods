# Redesign, the physics view: store energy, score what is stored

Role `physics`, 16 November 2026. An analysis, not a decision; nothing here is built. Numbers marked "measured" are
from `competitive-play.md` and the `claude/gravity-measure` branch; the worked example is arithmetic, not simulation.

## 1. Why the present machine misbehaves

**It is far too hot.** Income is about 3,000 energy a game; a whole par score is about 25 bits, at one energy per bit.
Every hill is a pebble next to the budget, so the board runs to rest in two minutes. And rest is the end: the score is
read off the state, so a resting board is a finished exam.

**Friction is bigger than height.** A typical move costs about 9 in fee and only a few in rise. The fee is the same in
both directions, so repair costs what damage cost (measured: 10 to 18 against 14 to 18). The "uphill costs more" law is
real but lives in the small term.

**There are two landscapes.** Energy sees size (today, factor counts). Score sees how rare a pattern is. A swap, a
mirror or a step to the next integer crosses the score landscape without changing energy: 94% of grid knocks. "Many ways
to be broken, few to be whole" does not rescue this: it only makes repair hard for someone who does not know the way
back, and players do.

**Rarity is the wrong ruler.** It measures how unlikely a blind random walk is to be somewhere, not what it costs a
sighted player to get there. The two agree in one case only: pure height in a constant field. Each place they differ
has a patch (the 2-bit cap, the 35-bit gate, exemptions, floors, tiers).

**The one-energy rule was never explained.** Height must be one function of the state, or a loop of moves could end
where it began with energy left over: a perpetual-motion machine. Friction is different: it may depend on the route.
So every mutator can have its own friction (adding by amount, multiplying by digits) but not its own height. That is
all the "global energy function" constraint says. The requirement that a move and its undo share a fee existed only to
make the random-walk law computable.

**Gravity must keep rising.** An inverse-square force, or a cost by digits, flattens with distance, so big numbers are
nearly free (measured: intercepts of 100,000 at 40 bits). Only energy that grows with the size itself confines.

## 2. The proposed machine (six parts)

1. **One field.** A state's energy is a fixed price per unit of size of its numbers (say 10 energy a unit; a fraction's
   bottom number counts as size). This is the owner's strong gravity, and it replaces the "weight of 100".
2. **Prices.** A move costs its rise in energy, plus friction chosen freely per mutator. Falling pays nothing back.
3. **Value is stored energy at your ledge.** A rule names what it reads and its *ledges* (the states it likes: prime
   intercepts, square gradients, a grid pattern). Your bits on an object are the energy, in the numbers your rule reads,
   of the best ledge, minus the going price of moving the object there from where it is. Layered rules are one ledge
   set. No law, no tables.
4. **Scarce income.** One dial: a game's income divided by the field strength, set so a seat can lift about par. Energy
   is short for all ten minutes; the hills have no top, so there is no rest state to reach.
5. **Throughput.** Objects are born and retire; points are earned per second held (own bits times the others' bits, as
   now). Retirement is the outflow a driven system needs, not a fix for flip-flopping: stored energy leaves, new
   objects pose new problems, and no single tower can carry a game.
6. **Locks, as the owner specified.** A lock is a barrier with an energy deposit; it changes what attack costs, never
   what a state is worth.

| Wanted property | What produces it |
|---|---|
| Bits tied to the energy of reaching the state; no rule far above par | Bits *are* stored energy (identity B); income is scarce |
| Bigger is rarer, dearer, and pays in proportion | The constant field; no top |
| Exact hit only modestly better than near | They differ by exactly the price of the last step (identity D) |
| Modest pushes keep most value; no rug-pull | A move loses you at most what it costs to undo (identity C) |
| Repair dearer than damage, worse with height | Falling is friction only, climbing is friction plus rise; halving is priced by digits |
| Defence by investment | Locks: the attacker must first pay off the deposit |
| Shortcuts as differently priced routes | Friction is per mutator; the rise is the same by any route |
| Stays dynamic | Scarcity, hills without tops, births and retirements |

**Identities** (each a test, replacing the gate and the per-rule checks):

- A. Energy spent = energy now stored on the board + energy lost (friction, falls, retirements, lock upkeep).
- B. A seat's bits on an object never exceed the energy stored in the numbers its rule reads.
- C. If a move can be undone for a price, it lowers nobody's bits by more than that price.
- D. Two states differ in bits by at most the price of moving between them.
- E. Undoing a fall costs the fall's friction plus the whole height lost.

## 3. A worked example

Field 10 energy per unit. Friction: 1 per unit added or removed, 4 for a doubling, halving or mirror. Income 3,000.
Rule A: "y-intercept a positive prime, bigger is better". Rule B: "y-intercept a multiple of 7, bigger is better".
The line is y = 4x + 98.

| Event | Price to the mover | A's bits | B's bits |
|---|---|---|---|
| Start, intercept 98 | – | 969 (prime 97 at 970, less 1 to step down) | 980 |
| Step to 97 | 1 | 970 | 969 (98 at 980, less 11 to step up) |
| Mirror to −98 | 4 | 965 | 976 |
| A rival halves 98 to 49 | 4 | 468 | 490 |
| Putting 98 back | 494 | 969 | 980 |
| The same halving at intercept 20 | 4, undo 104 | | |
| Halving through a lock "intercept at least 90" holding 300 | 304 | | |

Reaching 98 from nothing costs about 1,080, a third of a game's income. Sideways moves cost their victims what they
cost to undo, so they stop being weapons. The only real attack is down; one halving undoes 494 for 4, and the ratio
grows with height (26 to 1 at 20; 123 to 1 at 98). That is the owner's asymmetry as a law. It is also brutal.

## 4. What it deletes

The random-walk law as a mechanism, its sampled tables and tilts; the factorisation code; the value tree and its 2-bit
caps; the 35-bit gate and per-rule exemptions; the shared-fee requirement; the energy weight; the convex surcharge;
floors for undefined readings (such a state is simply far from every ledge); tie-breaker tiers; hold rarity; lookahead
starters. The information reading survives as one sentence: in a constant field, the odds of a blind walk being this
high halve for every fixed amount of energy, so stored energy *is* rarity.

## 5. The two most serious risks

1. **Razing.** Falls are so cheap that "halve anything tall" may beat building for everyone, leaving a flat board unless
   locks are bought as a matter of course. The game could become lock-or-die, or simply low.
2. **Everyone agrees on "up".** Near a ledge is almost as good as on it (A and B above differ by 11 in 970), so which
   ledge matters far less than how high. Diversity then rests on rules reading different numbers and opposite
   directions. And own-times-others rewards piling onto one object. Retirement limits a tower's life; nothing in the
   machine forbids it. If one shared lift is enough to do well, that is the owner's bug.

## 6. The one cheap experiment

Rerun the existing competitive table on beginner lines (three naive; one mixed with two naive; three mixed; turnover
on) with three changes: the size field at 10 a unit, ledge value, and a flat-deposit lock that a defender buys. The
proposal is false if (a) energy stored on the board stays flat or all-mixed tables still lose more than about a third
of the naive total (razing wins), or (b) most points come from one object or one state (the tower).

## 7. What I am unsure of

- "The going price of moving the object to the ledge" needs one definition (I suggest the cheapest single act). For
  rules that read a ratio, such as where the line crosses the x-axis, this may be awkward; complexity could return here.
- Points per second, and the field strength, are changes to rules on `develop` (the final score is the standing at the
  end; one energy per bit). The coordinator would have to declare them. I did not check what v1 did.
- I have not simulated any of this. Whether scarce energy alone keeps play interesting, rather than slow, is untested.
- Grids need every pattern rule to have a "heavier is better" part, or its bits are stuck near zero.
