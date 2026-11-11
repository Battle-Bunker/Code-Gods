# The bid phase

Before the rules are dealt, players may bid for the rule they want. The price is a handicap: a percentage taken off
their own final score. Code: `lib/game-utilities/src/bidding.ts` (tests: `test/bidding.test.ts`). Evidence:
`lib/game-utilities/scripts/bid-market.ts` (`pnpm --filter @workspace/game-utilities bid-market`).

## 1. The rules as shipped

- Each player may bid on any rule families of the game's pool. A bid is a whole percentage from 1 to 100. Not bidding
  is passing.
- Bids are resolved highest first. Equal bids are ordered at random.
- The highest bid wins its family. That family is now exclusive: nobody else is dealt it. The winner's other bids and
  the other bids on that family are removed. Then the next highest bid, and so on.
- Players who won nothing are dealt by the normal dealer from the families nobody won. Two of them may still get the
  same family.
- A winner's handicap comes off their final score: net = total − h% × |total|. A player who won nothing has no handicap.
- Pricing. **First price**: the winner pays their own bid. **Second price**: the winner pays the best bid still
  standing on that family behind theirs, and at least 1%.
- If nobody bids, the deal is exactly today's deal.

<!-- lead: fill --> Where it is on (which setups, which setting).

<!-- lead: fill --> How long the phase lasts and what ends it.

<!-- lead: fill --> Disclosure: what players see of the pool, of each other's bids, and of the result.

<!-- lead: fill --> Tools: what a player's program or assistant can do during the phase.

## 2. What rational bids look like on the beginner pool

The model: simulated games on Annotated basics (4×4 numbers, the eight beginner rules), every player making the simple
greedy move, seats shuffled. One player holds the rule and nobody else can have it; the others are dealt from the
other seven. 1,000 games per rule and table size; a win share is good to about ±1.6 points.

The **equalising handicap** is the percentage that brings the holder's chance of winning down to a fair seat's (1 in 3,
or 1 in 4). It is the most a player should bid: above it, passing is better. The headline is win share, not score,
because winning is what a handicap is paid for, and scores at one table rise and fall together.

| Rule | 3 players: wins | worth | to match the weakest | 4 players: wins | worth | to match the weakest |
|---|---|---|---|---|---|---|
| 🙃 Opposite Nines | 53% | **6%** | 13% | 48% | **8%** | 16% |
| 🐸 Leapfrog | 50% | **5%** | 13% | 37% | **6%** | 14% |
| 🪞 Mirrormancer | 37% | **1%** | 12% | 25% | 0% | 10% |
| 📏 Spread of Three | 24% | 0% | 6% | 32% | **3%** | 11% |
| 🎩 Magic Eighteen | 33% | 0% | 10% | 21% | 0% | 7% |
| ✌️ Two Pair | 32% | 0% | 9% | 17% | 0% | 6% |
| ↙️ Crosswise Threes | 25% | 0% | 6% | 20% | 0% | 6% |
| 👋 Strangers | 11% | 0% | 0% | 10% | 0% | 0% |

- Small handicaps matter. Most games are won by a few percent, so 6% takes Opposite Nines from 53% to 33%.
- About 13–16% makes the best rule as weak as the worst. A bid of 20% leaves any rule weaker than Strangers.
- Only two or three rules are worth a bid at all. Five are worth nothing.
- By mean score the numbers are larger (Opposite Nines 12–13%, to match the weakest 25%) and less useful: they would
  overcharge.
- The win shares are further apart than in docs/beginner-pool.md (17–47%). The likely reason: that harness can give
  two players the identical rule, and the real dealer, used here, cannot.

## 3. Does the market level the pool?

Share of a rule's holders who win, after handicaps. 1,000 games per column, the same seeds. Truthful bidders bid the
"worth" above on every rule worth 1% or more. Shading bidders bid a fraction of it: (n − 1)/n, the textbook
first-price answer for n bidders (67% at a table of 3, 75% at 4). "–": nobody held it.

**3 players**

| Rule | Nobody bids | All truthful | All shading |
|---|---|---|---|
| Opposite Nines | 53% | 30% | 33% |
| Leapfrog | 52% | 39% | 43% |
| Mirrormancer | 37% | 31% | 25% |
| Magic Eighteen | 40% | – | – |
| Two Pair | 28% | – | – |
| Crosswise Threes | 24% | – | – |
| Spread of Three | 23% | – | – |
| Strangers | 10% | – | – |
| **Spread (best − worst)** | **44 points** | **9** | **18** |
| Mean handicap paid | – | 4.0% | 2.7% |

**4 players**

| Rule | Nobody bids | All truthful | All shading |
|---|---|---|---|
| Opposite Nines | 45% | 29% | 31% |
| Leapfrog | 37% | 29% | 30% |
| Spread of Three | 26% | 26% | 25% |
| Mirrormancer | 25% | 28% | 24% |
| Two Pair | 18% | 23% | 20% |
| Crosswise Threes | 19% | 21% | 17% |
| Magic Eighteen | 22% | 8% | 7% |
| Strangers | 9% | 3% | 3% |
| **Spread (best − worst)** | **36 points** | **26** | **28** |
| Spread, weighted by how often a rule is held (sd) | 10.6 | 6.9 | 7.8 |
| Mean handicap paid | – | 5.7% | 4.0% |

First and second price gave the same numbers here: everybody has the same values, so the runner-up's bid equals the
winner's.

**Mixed tables** (win share per seat; fair is 33.3% at 3 players, 25% at 4)

| Table | Pricing | 3 players | 4 players |
|---|---|---|---|
| One passer among truthful bidders | first | passer 22%, bidders 39% | passer 18%, bidders 28% |
| One passer among truthful bidders | second | passer 19%, bidders 41% | passer 17%, bidders 28% |
| One truthful bidder among passers | first | bidder 34%, passers 33% | bidder 27%, passers 24% |
| One truthful bidder among passers | second (pays 1%) | bidder 50%, passers 25% | bidder 43%, passers 19% |
| One bidder who bids 1% on the best rule, among passers | first | bidder 50%, passers 25% | bidder 45%, passers 19% |

What this says:

- When everybody bids well, the market levels the top of the pool. At 3 players the three strong rules are all bought
  and the weak five are not played at all: the spread falls from 44 points to 9. At 4 players somebody is still dealt
  a weak rule, and Strangers and Magic Eighteen get worse (3% and 8%), so the spread only falls from 36 to 26.
- Bidding beats passing. A passer among bidders wins 19–22% instead of 33% (17–18% instead of 25%): the strong rules
  are gone before the deal.
- A lone bidder among passers gets the best rule for 1% and wins about half the games. Second price hands them that
  automatically; under first price they only have to bid 1%. It is the edge of being dealt Opposite Nines by luck
  today, but taken by whoever knows the pool.

Limits:

- These are simulated greedy players, not people. Which rule is strong depends on how the table plays: when the
  simulated players also work against each other, Spread of Three, Crosswise Threes and Strangers are the strong rules
  (worth 4–10%) and Mirrormancer and Leapfrog the weak ones. A fixed list of "good bids" would be wrong for such a
  table.
- The levelling needs accurate bids. When each bidder misjudges each rule by up to 3 points, the spread barely moves
  (41 → 37 points at 3 players, 29 → 32 at 4; 300 games) and bidders pay for weak rules.
- The "worth" assumes the alternative is a fair seat. At a table of bidders the alternative is worse, so the real
  values are somewhat higher. The model has no bidder who learns, bluffs or reads the others.
- The model cannot say whether people enjoy the phase, understand it in a first game, or how long they need.

## 4. Variants

**First price or second price.**

- First price: you pay what you bid. Bidding your full value gains nothing, so good players bid below it and have to
  guess the others' bids. Overbidding costs the whole overbid.
- Second price: you pay the next bid on that rule. Bidding your true value is safe, which is easier to explain. A bid
  nobody contests costs 1%, so an uncontested strong rule is almost free.
- In the simulations they differ only when bids differ. With misjudged values second price charged about half as much
  at 3 players (2.7% against 5.0%) with the same spread. At a table of equal, accurate bidders they are the same.
- Neither stops the lone bidder. A minimum bid per rule would; it has not been simulated.

<!-- lead: fill --> Sealed or open bidding.

<!-- lead: fill --> Disclosure variants (who sees which bids, and when).
