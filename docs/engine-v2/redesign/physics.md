# Redesign, the physics view: store energy, score what is stored

Role `physics`, 16 November 2026. An analysis, not a decision; nothing here is built or simulated.

Every claim carries one of three labels. **(construction)**: follows from the definitions; checkable in code or by
arithmetic. **(observed)**: seen in a narrow simulation (a dozen games a row, three seats, six hand-written one-step
strategies, one preset each, no talking, no adapting); it shows a thing *can* happen, not that it is a property of the
game. **(conjecture)**: my reading. I took the figures from the docs and did not re-derive them from code.

## 1. What the present machine makes possible

- **Energy is plentiful next to the score scale.** About 3,000 energy a game against a par of about 25 bits, at one
  energy per bit (construction, from the docs). So no hill is out of any seat's reach. Simulated boards stopped moving
  after about two minutes (observed). That plenty is the cause is conjecture.
- **The score is read off the final state** (construction). So a board on which nobody wants to move is a finished
  exam; nothing in the rules pays for holding.
- **Friction is charged the same both ways; only the rise is one-way** (construction). Repair therefore exceeds damage
  by exactly the height lost, and by nothing when no height is lost. In the sampled knocks the fee was about 9 and the
  rise a few, and repair cost about what the knock cost (observed).
- **Energy and score read different things.** On the beginner grid, energy is the cell sum and rules score patterns
  the sum cannot see (construction). So moves exist that destroy score at no change in energy; 94% of sampled grid
  knocks were such (observed).
- **Rarity is not cost.** Rarity says how unlikely a blind random walk is to be somewhere; price says what a sighted
  player pays. They coincide only for pure height in a constant field (construction). I believe the caps, the gate,
  the exemptions and the floors each patch one place they differ (conjecture).
- **One energy function is forced; one friction is not** (construction). If height depended on the route, a loop of
  moves could return to its start with energy left over. Friction may depend on the route, so each mutator can have its
  own (adding by amount, multiplying by digits). The shared fee for a move and its undo existed only to make the
  random-walk law computable.
- **A cost that flattens does not confine** (construction). Cost by digits, or an inverse-square force, makes each
  further unit cheaper, so size is nearly free; a greedy climber reached intercepts near 100,000 at 40 bits (observed).

## 2. The proposed machine (six parts)

1. **One field.** Energy is a fixed price per unit of size of the object's numbers (say 10 a unit; a fraction's bottom
   number counts). This is the owner's strong gravity and replaces the "weight of 100".
2. **Prices.** A move costs its rise, plus friction chosen freely per mutator. Falling pays nothing back.
3. **Value is stored energy at your ledge.** A rule names what it reads and its *ledges* (states it likes: prime
   intercepts, a grid pattern). Your bits are the energy, in the numbers your rule reads, of the best ledge, minus the
   price of moving the object there. Layered rules are one ledge set. No law, no tables.
4. **Scarce income.** One dial: income divided by field strength, set so a seat can lift about par.
5. **Throughput.** Objects are born and retire; points are earned per second held (own bits times others' bits).
6. **Locks, as the owner specified**: a barrier with a deposit; it changes what attack costs, never what a state is
   worth.

**What holds by construction** (given that the move price to a ledge is never less than the rise, and that prices obey
"a detour never costs less"):

| Wanted property | Structural fact |
|---|---|
| Bits tied to energy; no rule far above par | A seat's bits never exceed the energy stored in the numbers its rule reads |
| Exact hit only modestly better than near | Two states differ in bits by at most the price of moving between them |
| No rug-pull from modest pushes | A move that can be undone for a price costs nobody more bits than that price |
| Repair dearer than damage, worse with height | Undoing a fall costs its friction plus the whole height lost; a halving is priced by digits, so the gap grows with height |
| Defence by investment | An attacker must pay off the lock's deposit first |
| Shortcuts as other routes | Friction differs per mutator; the rise is the same by any route |
| Bookkeeping | Energy spent = energy stored + energy lost (friction, falls, retirements, upkeep) |

Whether this stays dynamic is **conjecture**: no rest state exists (hills have no top, energy keeps arriving,
objects keep leaving), but that does not say play will be interesting.

## 3. A worked example (arithmetic)

Field 10 a unit. Friction: 1 per unit added or removed; 4 for a doubling, halving or mirror. Rule A: "y-intercept a
positive prime, bigger is better". Rule B: "y-intercept a multiple of 7, bigger is better". The line is y = 4x + 98.

| Event | Price to the mover | A's bits | B's bits |
|---|---|---|---|
| Start, intercept 98 | – | 969 (prime 97 at 970, less 1) | 980 |
| Step to 97 | 1 | 970 | 969 (98 at 980, less 11) |
| Mirror to −98 | 4 | 965 | 976 |
| A rival halves 98 to 49 | 4 | 468 | 490 |
| Putting 98 back | 494 | 969 | 980 |
| The same halving at intercept 20 | 4; undo 104 | | |
| Halving through a lock "at least 90" holding 300 | 304 | | |

Reaching 98 from nothing costs about 1,080 of a 3,000 income. A sideways move costs its victims what it costs to undo.
A fall is cheap to cause and dear to undo, more so with height (26 to 1 at 20; 123 to 1 at 98).

## 4. What it deletes

The random-walk law as a mechanism, its tables and tilts; the factorisation code; the value tree and its caps; the
35-bit gate and exemptions; the shared-fee requirement; the energy weight; the convex surcharge; floors; tie-breaker
tiers; hold rarity. One sentence of the information view survives (construction): in a constant field the odds of a
blind walk being this high halve for each fixed amount of energy.

## 5. How this could be wrong

**Assumptions it rests on.** That plenty of energy and end-of-game scoring are why boards stopped, and not the
one-step players. That a price of moving to a ledge can be defined simply for every reading. That rules reading
different numbers and directions give enough tension once height dominates. That scarcity makes play deliberate and
not merely slow.

**The strongest alternative reading.** The present machine may be fine and the simulated players dull. One-step
greedy players stop whenever no single step pays; people and stronger AIs who plan, talk and adapt might keep today's
board moving, and might find repair cheap or dear in ways the sampled knocks never touched. Nothing observed
distinguishes "the machine freezes" from "these six strategies freeze".

**What a cleverer or differently motivated player could do here that I have not reasoned through.**
- Raze: halve anything tall, since it is cheap by construction. Possible outcomes include a flat board or a game that
  is only about locks. I cannot say which.
- Lock *down*: a predicate such as "intercept at most 5" turns the defence into a cage on a rival's object.
- Pile on: own-times-others rewards several seats lifting one object; one shared tower may beat many states, which
  the owner calls a bug. Retirement shortens a tower's life but forbids nothing.
- Stay low and wide, where no fall is worth causing, and win on count.
- Spoil without wanting to win, or time attacks around births and retirements.
- Ignore ledges: near is almost as good as on (A and B differ by 11 in 970), so "just go up" may be enough.

**What would change my mind.** People or strong AIs keeping today's board lively for ten minutes. A hand-worked
case where the ledge price breaks one of the table's facts. Any play of the proposal in which most points come from
one object, or stored energy stays flat.

## 6. The one cheap experiment

Rerun the existing competitive table on beginner lines with the size field, ledge value and a flat-deposit lock. It
can only refute: a flat board, or one object carrying most points, would be an existence proof that the proposal
fails. A good-looking run would prove little, for the reasons above.

## 7. Also unsure

- Points per second and the field strength change rules on `develop`; the coordinator would have to declare them.
  I did not check what v1 did.
- Grid pattern rules would each need a "heavier is better" part.
