# Adversary: how each candidate design gets solved, frozen or dominated (16 November 2026)

I ran no simulation. This is reading (code and docs on `develop`, `gravity.md`, `competitive-play.md`, `locks.md`) plus
arithmetic. Where a number is my estimate, I say so.

## Two facts that sit under every family

**1. The final score is a photograph, not a film.** The spec (line 774) and `loop.ts` agree: a player's total is the
points on the board *at the last tick*. Nothing is earned for holding a state. So the first nine minutes only matter as
preparation, and whoever moves last decides. Any design that keeps this loses to "save energy, strike at the bell".

**2. "My bits × the others' bits" rewards piling everything on one object.** Give each of three players 30 bits to
place. All on one line: each scores 30 × 60 = 1,800. Spread evenly over three lines: 3 × 10 × 20 = 600. One object is
three times better, which is exactly the owner's named bug ("one state being enough to do well"). Two more
consequences of the same formula:

- The product of my bits and yours is paid to both of us. With two players the scores are always equal. With three,
  two players who build a line worth 30, 30, 0 score 900, 900, 0: the third is shut out and can only decide which of
  the other two wins (kingmaking).
- Knocking a line on which I hold no bits costs me no points at all.

## Family by family

| Family | Cheapest route to a very high score | The degenerate strategy | The one change that breaks my attack |
|---|---|---|---|
| A. Today (rarity, factorisation code, fee plus surcharge) | A formula, once rules are told: gradient ±1 and the biggest prime intercept affordable (y = −x + 887 was worth 139 times the state the AI seats settled on). A line's whole reachable set enumerates in under 90 seconds. Par (25 bits) costs about 1% of income. | Build, and knock when that pays more (measured: 58–67% wins, best reply to itself). Undo costs the same as do, and energy is a hundred times too plentiful, so late play is two states flipping. | Charge height in the currency the score is counted in (that is family B). |
| B. Size-only gravity, about 100 energy per bit | No search at all: every rule becomes a ramp, so the answer is "pour energy into my reading on the line where the others are highest". A prime at 101 and a plain 100 differ by half a bit, so the rule card's fine print stops mattering. | Scorched earth. Falling is free; climbing is 100 per bit. Nobody can keep anything, so the best play is to hold energy and knock. | A defence that costs energy (family C). |
| C. B plus locks | The same ramp, now with a ratchet: lock "intercept at least 120", climb, re-lock higher. | Two players lock one line and out-fund the third two to one, for ever. Also the jail lock (below). | Make a lock leak a percentage of the energy it holds each second, in place of upkeep by program length. |
| D. B or C plus turnover | The same ramp, repeated on each new object. | Banked points: snipe or pump in the last tick before an object retires, when nobody can answer. Dropped points: only the last 150 seconds of the game count. | Pay points per second held, not at a moment. |
| E. Scoring variants | Product: one object (above). Sum: no reason to share an object, so solitaire plus spite. Minimum: the lowest player on a line holds it hostage. Shares of a fixed pot: every build is a knock; pure tug-of-war. | Product: pair shut-out and kingmaking. Minimum: extortion by sitting at zero. | Keep the product but take its square root, so doubling everyone's bits doubles the points instead of quadrupling them. (Least sure of this one.) |

## The attacks, with numbers

**The knock in B.** A line at y = x + 120 holds about 30 bits for an intercept rule and cost about 3,000 energy, a
whole game's income. "Move the line down by 120" costs about 65 (my estimate from the fee table: a few bits to name
the move plus half a bit per unit). So 65 energy removes 900 points from each of two rivals. The same 65 spent
building buys two thirds of a bit, about 20 points. Knocking is roughly 45 times better than building. The owner wants
repair dearer than damage; 46 to 1 with no defence is not an ecosystem, it is a desert.

**The cuckoo.** I want a big gradient; you want a big intercept. You spend 3,000 lifting y = x + 120. I play "swap two
numbers": y = 120x + 1. Under any energy that sees only size, the two lines weigh the same, so I pay only the fee. The
code already carries a patch for this (the swap's fee is "at least what the dearer number costs to write"), but at 100
energy per bit that is about 30 against your 3,000. This is a high-value state reached in one step. Mirrors do the
same to any rule that cares about sign: about 3 energy flips +120 to −120, and 3 flips it back, so the old flip-flop
survives inside B. The uncomfortable choice: under one global energy a shortcut is either a theft tool or it is
charged its full height and is no longer a shortcut. `gravity.md` checked only that a shortcut never pays its *mover*
more than its price on the mover's own climb; it did not check this case.

**Locks.** Draining costs the drainer one for one, so a lock is an auction where both sides burn what they bid. Three
problems:

- *Two against one.* Both builders gain from the lock and the third pays alone. The pair always wins. With the product
  score telling them to share one line, the result is one line, one lock, climbing a ramp: moving, but solved.
- *The jail.* A predicate is only "something true now". After my 65-energy knock I lock "intercept at most 0" with 200.
  You now owe 200 plus 3,000. Locks help the vandal as much as the builder.
- *Upkeep by program length does not scale.* "Intercept at least 1,000,000" is about as short a program as "at least
  10". Height is defended at a flat fee, so upkeep is noise and a funded lock is a permanent wall.

And with the photograph score, a lock must outlast one rival's full store at the last tick (about 960 energy on the
beginner preset, a third of a game's income) or it is drained and the line knocked with no time to answer.

**The bell (turnover).** Retirement times are public (the oldest line goes when a new one is born). With banked points,
all real play happens in the tick before each bell, and the cheap knock wins it. With dropped points, minutes one to
seven are dead time.

## What a perfectly informed coalition does

- A: computes the formula and sits on it. Collapse to a point.
- B: cannot hold anything, so it agrees a non-aggression pact. That is a fixed point in behaviour, and it breaks at the
  last tick.
- C: all three stand on one line, lock a floor, and ratchet up their three ramps. This looks like the owner's
  "cooperating agents pursuing chosen states over many steps", but there is one state and no choice in it.
- D with points per second and leaking locks: the coalition must keep choosing *which* young lines to lift and defend,
  because height costs upkeep and objects die. That is the only case where I could not write the plan down in advance.

## Five tests before anything is built

| Test (simulated table, under an hour) | Fails if |
|---|---|
| 1. Last minute. Replay games with the final 30 seconds cut off; also seat a player who does nothing until the last 60 seconds. | The winner changes in more than 20% of games, or the sleeper wins a third or more. |
| 2. Damage, repair, defence. For the best knocker: rivals' points destroyed per energy against points built per energy; repair energy against knock energy; then the same with a lock funded at 20% of the build cost. | Knock beats build by more than 5 to 1; or repair costs less than 1.5 times the knock (today 0.6 to 1.0); or the funded lock stops fewer than half the knocks; or a jail lock costs its victim more than 3 times what it cost. |
| 3. One step and formula. From every climbed state try every single move for every seated rule (not just the mover's); and give one agent all three rules and a closed-form target. | Any act costing under 10% of a full charge gives any player 3 bits or more; or the formula agent scores more than twice the hill climber. |
| 4. One object, two against one. Share of each seat's points from its best object; third seat's share against two colluders. | Best object carries over half a seat's points; or the third seat gets under 15% (even is 33%). |
| 5. Movement and dominance. Naive, build-and-knock, vandal, defender, sleeper, locker, jailer, in all mixes. | Any one wins over 45% against naive *and* against itself; or all-same tables lose over 30% of the naive total; or over 25% of late moves are two-state flips; or under one object changes per minute. |

## Judgement

None of the five families passes as stated, and the reasons are mostly not in the families: the photograph score and
the product's reward for piling up are shared by all. The nearest to something that keeps moving is **D on top of C**
(size gravity, locks, few live objects with turnover), provided points are paid per second and a lock's upkeep is a
leak on the energy it holds. Then height everywhere has to be paid for continuously, defence scales with what is
defended, jails decay, the bell disappears, and objects die before anyone can sit on them.

What I am unsure of:

- Whether size-only gravity leaves any landscape to *search*. I think it does not: the difficulty would come entirely
  from other players, not from the mathematics. That may be what the owner wants ("no correct answers, only evolving
  terrain"), but it retires most of the rule pool's fine structure, and someone should say so plainly.
- Whether the square root is the right cure for piling up; a minimum or a cap per object might do better. Test 4 decides.
- Points per second may bring back "hold for ever". I expect the cheap knock plus leaking locks to prevent it; test 5
  must show it.
- How the fees of swap and mirror would be scaled under a weight of 100. If scaled fully, the cuckoo dies and so do
  shortcuts.
