# The game as an ecosystem: diagnosis and one proposal (analyst: ecology, 16 November)

Words used: **bits** are a rule's score for an object's state. **Lift** is energy spent raising an object to a rarer,
higher-scoring state. A **knock** is a move that lowers someone else's bits.

Every claim carries a label. **[built]**: true by construction, from the rules or arithmetic. **[seen]**: happened in
a narrow simulation (a dozen games a row, three seats, six hand-written one-step strategies, no talk, no adaptation).
That shows a thing *can* happen, not that the game is like that. **[guess]**: my conjecture. I simulated nothing.

## 1. Diagnosis

**The wrong thing is scarce.** A seat earns about 3,000 energy a game; a move's fee is about 9; a par game of lift (25
bits) costs about 25 **[built]**. So energy rations *moves* (about 340), and height is almost free. The simulated
climbers ran out of climbs they could see in two minutes with most of their energy unspent **[seen]**. Surplus with no
outlet goes into conflict, and that is the flip-flopping and the knocking **[guess]**.

**Land is tight.** Players compete for the single state of each object. With three to five objects and three rules,
one seat's improvement is often another's loss **[built]**. More objects was the one lever that reduced undoing
without freezing the board **[seen]**.

**The score is a photograph.** Final score is the standing at the last instant, or when an object retires **[built]**.
So a state held for five minutes and knocked at the end earns nothing, and a knock just before the photograph cannot be
repaired **[built]**. That is the "rug pulled back to zero". Living things are paid in flow.

**The product is a partnership, with an outsider.** "My bits × the others' bits" is one shared product per pair of
players, credited equally to both **[built]**. A knock on my partner costs me as much as it costs them from our pair.
A player with no bits on the object owns no share, so wrecking the other two's partnership costs them only the fee
**[built]**. The hostage problem is the outsider's.

| Ecosystem feature | In the game today |
|---|---|
| A limiting resource | Energy is about 100 times the bit scale **[built]** |
| Growth invites predation | A knock costs a fee, whatever the height **[built]** |
| Costly defence | None (locks are paused). Undoing a knock costs more only if the knock lowered the object's energy **[built]**; most simulated knocks did not **[seen]** |
| Turnover and succession | Trialled; two-state cycles became rare **[seen]** |
| A strategy does worse as it gets common | Unknown. Rank in a table is a fixed pie **[built]**, so shared losses deter nobody who plays for rank |
| Coalitions that form and defect | Nothing to pay into jointly **[built]** |

## 2. The proposal: five rules

1. **Points are paid as a flow.** Keep the product. Each second, each live object pays each player their own bits ×
   the others' bits; the final score is the running total. *Structure:* damage is bounded by how long it lasts; earned
   points cannot be taken; the last second is worth one second **[built]**.
2. **Energy is the limiting resource, and lift is the main expense.** A game's income should lift about one par game
   of height, with fees small beside it. How is the other analysts' job. *Structure:* climbing, knocking and defending
   draw on one budget, so each knock has a price in height forgone **[built]**.
3. **A knock is an ordinary move.** No penalty. The knocker pays the fee and loses their own share **[built]**.
4. **Locks are the only defence, as the owner specified.** *Structure:* a lock puts an energy cost on exactly the
   pattern its makers care about, which no global energy function can see **[built]**. A floor lock is a ratchet: the
   climb continues, the undo is blocked **[built]**. Partners can both pay in, or one can free-ride **[built]**.
5. **Every object has a fixed life** (one born every 30 seconds, about five alive). Its locks die with it.
   *Structure:* no state can be held for a whole game; a lock is never worth more than the life left **[built]**.

## 3. What this structure makes possible (arithmetic, not a forecast)

**Three uses of one move.** A and B hold 10 bits each on an object with 100 seconds left; C holds none.

- C **knocks** B down 5 bits: A and B each lose 50 a second until repaired. Repaired in 10 seconds, C gains 500 on each.
- C **joins** with 1 bit, keeping theirs: C earns 20 a second, A and B 10 more each. C gains 1,000 on each rival.
- Under the photograph, a last-second knock is permanent and worth five joins **[built]**.

**One leader (110), two trailers (95 each).** A raid takes 80 off the leader.

| The two trailers | Raid paid from spare energy | Raid costs 40 of the raider's own lift |
|---|---|---|
| Neither raids | 110 / 95 / 95 | 110 / 95 / 95 |
| One raids | 30 / 95 / 95: raiding cannot hurt the raider | 30 / 55 / 95: the bystander gains most |
| Both raid | 0 / 95 / 95 | 0 / 55 / 55 |

With spare energy, a raid is free to its maker. With scarce energy, checking a leader is a cost someone must
volunteer, and the one who does not pay gains most **[built, for these numbers]**. Whether real play then mixes
building, raiding and guarding is a **[guess]**.

## 4. How this could be wrong

- **Assumptions.** That conflict comes from spare energy; that repair is quick; that players can tell who leads and
  who knocked (they cannot: moves are unattributed); that players play for rank.
- **The strongest other explanation.** The standstill and the flip-flopping may belong to one-step greedy programs,
  not to the game. A climber that looks further may never run out of climbs, and then the surplus story is false.
- **What a cleverer player does that I have not reasoned through.** Under flow, a knock repeated every few seconds
  keeps an object down for the price of the fees, and an outsider loses nothing by it: harassment replaces the single
  late knock. A lock can be used to attack, holding an object in a state that zeroes a rival. Two players can shut
  the third out of every object and split the pairs. A player can rush each newborn object and abandon it.
- **What would change my mind.** The re-scoring below showing no change; an adaptive or frontier-AI seat told to win
  by any means finding a routine; people playing it and the board going quiet.

## 5. What it deletes

The end-of-game photograph and banking at retirement. Hold rarity, the convex surcharge and tie-breaker tiers as
answers to fragility. The attempt to make the energy function see patterns. Probably the 35-bit gate, if rule 2 is
done at the source.

## 6. The two most serious risks

1. **A conveyor belt.** "Climb, lock, wait, repeat" on each new object: a static exam on a timer.
2. **The balance tips.** Dear lift may mean nobody raids and locks are dead weight. Cheap knocks favour the attacker,
   who picks one spot while the defender covers every object and pattern.

## 7. The cheap experiment, and how to keep finding out

Re-score the turnover games already run by running total instead of final standing (the simulated agents already
choose by points now, so their moves do not change). If the vandal's and the knocker's win shares do not fall, flow
scoring is not doing what rule 1 claims. This tests one claim against six strategies; it cannot clear the design. After
it: seats that adapt between games, a frontier-AI seat asked to break it, then people.

## 8. What the old game did

It ended at a hidden random moment, so any second might be the photograph **[built]**. Its own study found
time-averaged scoring took a last-30-seconds wrecker from 69% wins to 6% **[seen]**, in an equally narrow model.

---

# Second task: candidate Z judged as an ecosystem (16 November)

Labels: **[built]** true by construction of Z; **[narrow]** seen in a small simulation; **[guess]**. Nothing here
is [narrow]: Z is unbuilt.

**The predator is built in.** Coming down costs friction only, and score follows the nearest trophy. So a player whose
trophy lies below an object can pull it down onto that trophy cheaply, and the players above must pay lift to undo it
**[built]**. A floor lock is the exact counter **[built]**. Toppler against floor-keeper is Z's central relationship.

**Niches [guess].** Pioneer (lifts newborn objects: cheap, low pay). Joiner (nudges a lifted object toward its own
trophy nearby). Toppler. Floor-keeper. Free-rider on a partner's lock.

**What a player decides each minute [guess].** Which of the live objects gets scarce lift; whether to lift toward
their own trophy or toward where the others' total is rising; lift or fund a floor; which ageing object to abandon.

**Coalitions.** They form where two players' trophies sit close on one object: shared lift, shared floor **[built]**.
They break when a third player's trophy is cheaper below, when one partner stops paying the lock, and at the known end
of the object's life **[guess]**.

**The outsider.** Has a stake only within reach of one of their trophies (worth ÷ k in price) **[built]**. Because
descent is cheap, a high object is close to every trophy below it on its reading, so stakes grow with height
**[built]**. That is also the main way Z goes dull: if most players have trophies below most high states, everyone's
score is roughly the height, all rules say "up", and nothing opposes **[guess]**. Opposition must then come from
rules reading different numbers, or opposite signs of the same number.

**Product or square root.** With linear lift cost the product pays more the more is piled on one object **[built]**:
one tower, one big fight, and one object may be enough to do well, which the owner calls a bug. The square root gives
no bonus for piling on, and pays most steeply for a first small stake **[built]**, which pulls outsiders in to join.
I would take the square root **[guess]**. It also compresses leads, so standings stay close.

**Objects per player.** Two conditions, not a number: at least one object per pair of players plus one (four for
three players), so each partnership can have a home; and more objects than one income can lift, so choosing and
abandoning are real **[guess]**.

**Lifetimes.** Staggered births give overlapping generations, which is good. Under flow, a known end only makes late
lift worth smoothly less **[built]**. The harm is to coalitions: everyone knows when paying for a floor stops being
worthwhile, so partnerships unravel on schedule **[guess]**. If a bell rhythm appears, make the lifetime random with
the same average, as the old game's hidden end was.

**The two choices that matter most [guess].** (1) Trophy geometry: how far apart different players' trophies sit on
a shared reading, against the reach worth ÷ k. Too close and all agree; too far and objects are private. (2) The
combining rule, product or root.

**What would make it dull.** The "everyone up" case above. And transparency: prices and scores are smooth and known,
so one's own best move is computable; surprise can only come from the others' hidden trophies.

**How I could be wrong.** I have not traced Z3 through real mutators: shortcuts may make the cheapest route to a
trophy tiny everywhere, flattening scores. The toppler may be too strong for one-for-one floors, or irrelevant if
trophies are sparse. I assume players play for rank. I have reasoned about three players only.
