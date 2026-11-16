# The game as an ecosystem: diagnosis and one proposal (analyst: ecology, 16 November)

Words used: **bits** are a rule's score for an object's state. **Lift** is energy spent raising an object to a rarer,
higher-scoring state. A **knock** is a move that lowers someone else's bits. Nothing here was simulated; the toy
numbers are arithmetic, not measurements.

## 1. Diagnosis

**The wrong thing is scarce.** A seat earns about 3,000 energy a game. A move's fee is about 9. A whole par game of
lift (25 bits) costs about 25. So energy buys *moves* (about 340 of them), and height is almost free. Players run out
of worthwhile climbs in two minutes and still have nine tenths of their energy. An ecosystem with surplus energy and
nothing to invest it in spends it on conflict: that is the flip-flopping, and it is why "build, and knock when that
pays more" dominates. The knock costs its maker nothing they wanted.

**Land is too scarce.** What players really compete for is the single state of each object. With three to five
objects and three rules there is no room for niches, so every improvement for one seat is a knock for another. More
objects was the only lever that turned undoing into climbing (`tug-of-war.md`).

**The score is a photograph.** Final score is the standing at the last instant (or at the instant an object retires).
So a state held for five minutes and knocked at the end earns nothing, and a knock just before the photograph cannot be
repaired. That is the "rug pulled back to zero", and it is exactly why the vandal reaches 42% on grids once objects
retire. Living things are paid in flow: what they harvest while they hold a place.

**The product is a partnership, with an outsider.** "My bits × the others' bits" is the sum of one shared product per
pair of players, credited equally to both. That part works: a knock on my partner costs me as much as it costs them
from our pair. The hole is the player with no bits on the object. They own no share, so they can destroy the other
two's partnership for the fee. That is the hostage problem, and it is specific: it is the outsider's, not everyone's.

**Present, missing, faked.**

| Ecosystem feature | In the game today |
|---|---|
| A limiting resource | Missing: energy is 100 times too plentiful; land is too tight |
| Growth invites predation | Present, but predation is free, so it is constant |
| Costly defence | Missing (locks are paused). "Repair is dearer than damage" is faked: true only where a state is higher in energy than its neighbours, which is never on grids and half the time on lines |
| Turnover and succession | Trialled; it works (two-state cycles fall from 58% to 3% of late moves) |
| A strategy does worse as it gets common | Faked: all-knock tables lose 36–72% of their points, but rank within a table is a fixed pie, so nobody is deterred |
| Coalitions that form and defect | Missing: nothing to pay into jointly |

## 2. The proposal: five rules

1. **Points are paid as a flow.** Keep the product. Every second, each live object pays each player their own bits ×
   the others' bits. The final score is the running total. *Wanted property:* damage is bounded by how long it lasts;
   earned points cannot be taken; last-second and pre-retirement wrecking earn nothing; climbing early is rewarded.
2. **Energy is the limiting resource, and lift is the main expense.** A game's income should lift about one par game
   of height, with move fees small beside it. How (the energy function, the exchange rate) is the other analysts' job.
   The ecology needs only this: a seat can never afford everything, and there is always a higher step for sale.
   *Wanted property:* climbing, knocking and defending draw on one budget, so knocking limits itself by what it
   displaces. No rule against it is needed.
3. **A knock is an ordinary move.** No surcharge, no penalty, no "breaking costs extra". The knocker pays the fee and
   loses their own share of the object. The victims lose the flow until someone repairs, plus the lift to climb back.
4. **Locks are the only defence, as the owner specified.** Energy placed on a predicate; breaking the predicate means
   paying the lock off; upkeep drains it; anyone may add to it. *Wanted property:* this puts an energy cost on exactly
   the structure a rule rewards, which no global energy function can see on grids. So sideways knocks stop being free
   where someone cared enough to pay. A floor lock ("intercept at least 100") is a ratchet: it lets the climb continue
   and blocks the undo, which ends flip-flopping by a player's choice instead of a designer's patch. A lock is also a
   public good between partners, so coalitions form, and one partner can free-ride on the other's upkeep.
5. **Every object has a fixed life.** One born every 30 seconds, each living about 150 seconds, so about five alive
   (the measured board). Its locks die with it. *Wanted property:* succession. No state can be held for a whole game,
   several distinct high states must be found, and a lock is never worth more than the life left.

Standing stays as rank by points within the table.

## 3. Why no single strategy would dominate (toy model)

**One object, three uses of the same 10 energy.** A and B each hold 10 bits; C holds none. A and B earn 100 a second
each. The object has 100 seconds left.

- C **knocks** B down 5 bits. A and B each drop to 50 a second. If repair takes 10 seconds, C gains 500 on each rival.
- C **joins** (finds a nearby state worth 1 bit to C that keeps theirs). C earns 20 a second, A and B 110. Over the
  object's life C gains 2,000 points, and 1,000 on each rival.
- Under today's photograph scoring, the same knock made at the last second is permanent, and beats joining five to one.

So under flow, knocking wins only where repair is slow or the rules truly oppose.

**One leader, two trailers.** Leader 110, trailers 95 and 95. A raid takes 80 off the leader.

| The two trailers | Today (the raid costs spare energy) | Proposed (the raid costs 40 of the raider's own lift) |
|---|---|---|
| Neither raids | 110 / 95 / 95: leader wins | 110 / 95 / 95: leader wins |
| One raids | 30 / 95 / 95: raider cannot lose by raiding | 30 / **55** / 95: the bystander wins |
| Both raid | 0 / 95 / 95: everyone raids, always | 0 / 55 / 55: trailers share the win, on half the points |

Today raiding is never worse, so it is everyone's strategy (the measured dominance). When energy is scarce the raid
is a volunteer's problem: the leader must be checked, the one who pays for it does not win, and two who pay together
do. That is a coalition that forms and invites defection. The leader's reply is a lock, which costs lift, so being
ahead taxes itself. Builder, raider and guard each win in some company and lose in other company.

## 4. What it deletes

- The end-of-game photograph, and "banking" points at retirement.
- Hold rarity, the fragility-averse "defender", tie-breaker tiers and the convex surcharge as answers to fragility.
- The attempt to make the energy function see patterns so that repair is dearer than damage everywhere. Size handles
  height; locks handle everything else.
- Starter-side cures for flip-flopping, and probably the 35-bit gate, if rule 2 is done at the source.

## 5. The two most serious risks

1. **A conveyor belt.** Flow plus locks plus fixed lives could settle into "climb, lock, wait, repeat" on each new
   object: a static exam on a timer. Turnover guarantees movement, not variety. Only diverse, opposed rules do.
2. **The balance may tip either way.** If lift is dear, nobody raids and locks are dead weight. If knocks stay cheap
   beside lift, the attacker picks one spot while the defender must cover every object and every pattern, and
   one-for-one locks cannot keep up. Nor does anything here give the outsider a stake.

## 6. The cheap experiment

Re-score the turnover games already run (`competitive.ts`, 5 live, a birth every 30 seconds) by the running total
of points over time instead of the final standing. The agents already choose moves by points now, so no behaviour
changes. The proposal predicts the grid vandal falls from 42% to an even share or less, and the one knocker among
naive players from 50% towards 33%. If the knocker still wins half, flow scoring does not remove the dominance and
everything rests on rule 2.

## 7. What the old game did that worked

It ended at a hidden random moment, so any second might be the photograph: flow scoring by another route, lost with
fixed ten-minute games. Its own study (`coordination-incentives.md`) found time-averaged scoring cut a
last-30-seconds wrecker from 69% wins to 6%.

## 8. Unsure

How fast repairs happen in play (the 10 seconds is a guess). Whether one-for-one locks defend enough. Whether five
live objects is enough land for three players.
