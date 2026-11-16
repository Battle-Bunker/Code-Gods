# Adversary: how each candidate design could be solved, frozen or dominated (16 November 2026, revised)

I ran no simulation. Each claim carries a label: **[built]** true by construction (it follows from a formula or the
code as I read it), **[narrow]** observed in a small experiment (a dozen games a row, six hand-written strategies, no
communication, no adaptation), **[guess]** my conjecture. An attack here is an existence proof: it shows a thing *can*
happen, not that it will, nor that players would find nothing better. Where I found no attack, that proves nothing.

## Two facts under every family

**1. The final score is a photograph, not a film.** [built: spec line 774 and `loop.ts`; I did not check for an end
guard on moves.] A player's total is the points on the board at the last tick. Holding a state earns nothing. So a
last move that cannot be answered is worth more than any earlier one.

**2. "My bits × the others' bits" pays more for piling up.** [built] If three players can each place 30 bits: all on
one line, each scores 30 × 60 = 1,800; spread over three lines, 3 × 10 × 20 = 600. Also: the product of my bits and
yours is paid to both of us, so two players always tie, and a line worth 30, 30, 0 pays 900, 900, 0. And knocking a
line where I hold nothing costs me no points. *Why this may matter less than it looks:* it assumes three rules can all
be high on one line. Rules in tension are designed to prevent exactly that; I did not measure how well they do.

## Family by family

| Family | An attack that exists | What I guess follows | One change that removes the attack |
|---|---|---|---|
| A. Today | [narrow] With rules told, a formula: gradient ±1, biggest affordable prime intercept (y = −x + 887, 139 times the state AI seats settled on). [built] Undo costs what do costs; par costs about 1% of income. | [narrow] Build-and-knock beat the starters tried. [guess] Flip-flop persists. | Charge height in the score's own currency (family B). |
| B. Size gravity, about 100 energy per bit | [built] The knock and the cuckoo, below. [built] A prime at 101 and a plain 100 differ by half a bit, so single-number rules become ramps. | [guess] Little stays high without defence. | A defence that costs energy (C). |
| C. B plus locks | [built] The jail lock; the ratchet ("intercept at least 120", climb, re-lock); a short program defends any height. | [guess] Two players out-fund a third and sit on one line. | A lock leaks a share of the energy it holds, instead of upkeep by program length. |
| D. Plus turnover | [built] Retirement times are public, so with banked points the last tick before each is unanswerable; with dropped points only the last 150 seconds count. | [guess] Play bunches at the bells. | Points per second held. |
| E. Scoring variants | [built] Product: piling up, pair shut-out. Sum: no reason to share. Minimum: the lowest player controls the line. Shares of a fixed pot: every build is a knock. | [guess] Each has its own bad equilibrium; which is worst I cannot say. | Square root of the product (so doubling all bits doubles points). Least sure. |

## The attacks, exactly

**The knock in B.** [built on `gravity.md`'s draft energy; the fee is my estimate] y = x + 120 holds about 30 bits for
an intercept rule and cost about 3,000 energy, a game's income. "Move down by 120" costs about 65. If two rivals hold
30 bits each there and I hold none, 65 energy removes 900 points from each; 65 spent building buys two thirds of a
bit. *Why I may be wrong about what follows:* victims can retaliate, refuse to share lines with a knocker in the next
game, or build where rebuilding is cheap. None of that was ever simulated.

**The cuckoo.** [built, if the energy is the same for both coefficients and fees are not multiplied by the weight] I
want a big gradient, you a big intercept. You lift y = x + 120. I "swap two numbers": y = 120x + 1, for a fee of about
30 against your 3,000. A high-value state in one step. A mirror does the same to any rule that reads a sign (about 3
energy each way). The dilemma [built]: under one global energy a shortcut either moves value for almost nothing or is
charged full height and is no shortcut. `gravity.md` checked only the mover's own rule.

**Locks.** [built] Draining costs the drainer one for one, so both sides burn what they bid.
- *Jail.* A predicate need only be true now. After a knock I lock "intercept at most 0" with 200; you owe 200 plus the
  climb.
- *Flat upkeep.* "At least 1,000,000" is about as short a program as "at least 10".
- *Two against one.* [guess] Both builders gain from a lock and the third pays alone, so the pair should win. A third
  player with a better idea than draining may prove me wrong.
- *Last tick.* [built, given fact 1] a lock must outlast a rival's full store (about 960 on the beginner preset).

**A fully informed coalition.** [guess throughout] A: computes the formula and sits. B: a non-aggression pact that
breaks at the last tick. C: one line, one floor lock, three ramps: movement without choice. D with points per second
and leaking locks: the only case where I could not write the plan in advance, which is weak evidence, since my failure
to find a plan is not the absence of one.

## What I could not think of

- **Strategies across games:** reputation, grudges, signalling by moves, teaching a partner a convention.
- **Agents that model the other agents:** reading rivals' programs from their moves and exploiting their timing.
- **Lock programs as contracts:** predicates that encode a deal ("true while both our readings rise"), or that bait a
  rival into paying to break something worthless. I only considered floors and ceilings.
- **Composite readings** (areas, crossings, pairs of lines, grid patterns): I argued from single coefficients. These
  may hold real landscape under size gravity, or hide cheaper thefts than the cuckoo.
- **Deliberate use of the knock as a tool**, for example lowering a line to pass under a rival's lock.
- **People.** A human may value an odd-looking state for reasons no bit count predicts; the owner's thesis is that
  this is where the game lives.

## Tests, each honest about its scope

| Test (a simulated table, under an hour) | Assumption it removes | Worth worrying if | What it cannot show |
|---|---|---|---|
| 1. Last minute: cut the final 30 seconds; add a seat that waits until the last 60. | That all play is steady. | Winner changes in over 20% of games; the sleeper wins a third. | That no later-striking plan exists. |
| 2. Scripted thefts: every single move from every climbed state, valued for every seated rule. | That only the mover's rule matters. | An act under 10% of a full charge gives anyone 3 bits. | Thefts needing two moves or two players. |
| 3. Talking seats: two seats share rules and a plan against a third; then all three. | No communication. | Third seat under 15%; best object over half a seat's points. | What cleverer coalitions do. |
| 4. Adapting seats: each seat may switch among all strategies on hand every game, 50 games. | Fixed strategies. | The mix settles on one strategy, or tables lose over 30% of points. | Anything about strategies not in the set. |
| 5. Open challenge: a frontier AI gets the rules of the design and an hour to write an agent that beats the best so far; repeat with its agent added. | A fixed, hand-written strategy set. | It wins over 60% three rounds running with the same idea. | Passing shows only that this search, this long, found nothing. |

## Judgement [guess]

My guess, no more, is that the nearest family is D on top of C, with points per second and leaking locks, because
those remove the three attacks I can state exactly (last tick, jail, flat upkeep). The cuckoo and piling up remain
open. I cannot rank the families on what players would actually do: I have existence proofs against each and no
evidence about frequency. I am also unsure whether size gravity leaves a landscape to search in single-number rules; if
not, the difficulty moves to the other players, which may be what is wanted, but it should be chosen knowingly.

---

# Second task: attacking candidate Z (16 November)

Same labels; nothing simulated. "Friction" is the small per-move charge, "lift" the charge for rising.

**The claim holds, and it kills the cuckoo by paying it in advance.** [built] A move costing p changes the cheapest
route to any trophy by at most p, so no score rises by more than k × p or falls by more than k × the undo's price. Read
it backwards: if a swap for 3 energy takes your y = x + 120 to my trophy, I *already* score nearly full on your line.
Nothing is stolen because nothing needs to arrive.

**So the score is a staircase of height, and the cards are near decoration.** [built, given cheap friction]
- Coming down costs friction only, so overshooting is free: my score is about the worth of my best trophy *beneath*
  the object.
- Cheap swap and mirror make gradient height, intercept height and either sign interchangeable. "Opposite directions
  on a shared anchor" stops being a tension.
- At k = 1 it is exact: a state d of lift below a trophy scores worth − d, its own height. Every card reads "height".
- At large k cards matter, but scores move k per unit of energy: cliffs and leverage return.

**Lift becomes a gift to everyone.** [guess] Whoever lifts, all score; a player who never lifts scores about the same
and keeps their energy. I expect under-lifting.

**Ways round, as asked.**
- *Trim.* [built] I move the object down to just above my own trophy. Cost: friction. My score: unchanged. Rivals with
  higher trophies lose up to k × the drop; repair costs the full lift. The cheap knock survives, as the undo bound
  allows. (Under the product I lose their factor.)
- *Two moves.* I found no theft the bound misses; it adds along a path. That proves nothing.
- *Locks.* [built] If "cheapest price" counts locks, a lock holding L between the object and your trophy cuts your
  score by up to k × L for my L, moving nothing: a toll gate. If it ignores locks, a jailed object scores as if repair
  were possible: odd, harmless. Ignore locks.
- *Denying flow.* [guess] Trim a newborn early, before a lock is funded: most seconds lost per energy. Each object's
  opening seconds become the contest.

**Weight and decoration.** [guess]
- Carries weight: score from prices (ends sideways knocks, the cuckoo, exact-hit cliffs); flow (ends the last tick);
  free descent plus locks; the square root (ends piling); scarcity.
- Probably decoration: leak proportional to program length (the fraction of energy held does the scaling); k as a
  dial (cliff-free only near 1, where cards vanish); the constant field.
- Unknown: turnover. A source of movement, or only a clock.

**Smallest change that makes cards matter.** [guess] Measure distance to a trophy both ways: the dearer of "price
there" and "price back". Being above a trophy then costs as much as being below; each trophy is a two-sided hill of
slope k; overshoot is not free. The cost, stated plainly: trimming down onto my own trophy then *raises* my score for
friction only, so "no move raises a score by more than k times its price" is lost for descents. That is a priced
conflict of interest over someone else's lift, not a one-step peak from nowhere, but it should be judged, not
assumed. It also leaves swap and mirror equivalence untouched.

**Not shown.** Whether sparse joint trophies make good combined states rare; composite readings (a shortest-path
problem I did not attempt); what talking players do with a public staircase.
