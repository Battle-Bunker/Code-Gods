# Energy-economy redesign: simulation evidence (capacity T, no rate cap, offer price)

Harness: `lib/game-core/scripts/balance-settings.ts` (rule switches on `Config`) and
`lib/game-core/scripts/capacity-experiments.ts` (the tables). Every game is seeded (seed 1000 + i), so each table is
reproducible from the command above it. All numbers below are pasted from those runs on 2026-11-11.

Rules: **R1** capacity = power × T; **R2** no 4 Hz per-agent cap; **R3** offer price log2(live objects)/32 per offer;
**R4** debt bound (optional). "before" = no T, cap on, no offer price. "after" = T, cap off, offer price on.

Games per row were lowered from the brief to fit the time budget: 100 games for acts/waste rows (not 200), 500 for win
shares (not 1000; ±2.1 points), 100 for the hoarder, 200 (25 Hz) and 100 (100 Hz) for neutrality.

## Recommendation: default T = 30 s (keep it; raise to 60 only for rooms with P ≤ 8)

1. **Agents in every shipped room spend income as fast as it arrives** (51–95% of the stream finds no agent with
   energy), so no agent account ever reaches its capacity: 0.0% of agent income is wasted at every T from 5 to 300,
   and acts, skips and win shares are identical at every T (§1). T is therefore free to be set by the other three
   concerns.
2. **Hoarding.** With the cap removed, what a hoarder can take is bounded by its stored energy = power × T. The two
   active gods keep 99% of their acts at T = 30, 98% at 60, 95% at 120, 89% at 300 and 82–84% with no T (§3). T ≤ 60
   keeps the harm within 2%.
3. **Code size.** A god can never afford a program above retained power × T. At P = 64, T = 30: 1,920 bits with nothing
   allocated, 960 at half, 480 at a quarter. The owner's 1,137-bit agent needs ≥ 59% of power retained at T = 30 (30% at
   T = 60, 15% at T = 120); a 400-bit agent needs 21%. At T = 30 size is a real trade against agents' power; at T ≥ 120
   it is not (§6).
4. **Agents can still store a mid-sized change.** At T = 30 the smallest default agent (share 1/8) holds 240 bits (2.8
   row repaints of 86 bits); a half-share agent holds 960, just under the whole 4×4 grid (985). At T = 5 the 1/8 agent
   holds 40 bits, under one row repaint; at T = 15, 120 (§6).
5. **The exception is low power.** At P = 8 (default Int settings), T = 30 gives a planning capacity of 240, and after a
   first default summon the capacity (120) cuts the god's 140 bits to 120; T = 15 cuts startingEnergy itself to 120. If
   P = 8 rooms keep startingEnergy 200, they need T = 60, or startingEnergy must be exempt from the clamp during planning.

## Headline answers

- **Can a hoarder saturate access?** No. Without the cap it draws most of the *surplus* stream (69% of 25 Hz at
  T = 30; 93% of 100 Hz in §4) but the active gods still act at 99% of their normal rate at T = 30, because a denied
  agent's energy rises until it is drawn. Where offers are scarce (4 Hz) the hoarder gets 34%, its power share, and
  costs the active gods no more than an ordinary third player would (98–99%). Cost to the hoarder with the offer price:
  4.2 bits/s = 7.5% of its agents' income at 25 Hz (0.33 bits/s = 0.6% at 4 Hz; 21 bits/s = 37% at 100 Hz). Without T
  the harm grows with game length (82% after 600 s). The offer price alone changes the active gods' acts by under 2%;
  capacity is what bounds the hoarder.
- **What the cap was protecting.** Under "before", a hoarder's offers rise with its agent count: 4, 8, 12, 18.7, 19.2
  offers/s for n = 1, 2, 3, 5, 10 at 25 Hz and 4 → 40 at 100 Hz. Under "after" they are 18.50 (25 Hz) and 93.41
  (100 Hz) at every n. So after-rules are neutral in agent count, but one skipping god can make the sandbox run nearly
  the whole stream (93 offers/s at 100 Hz). That is compute load, not an advantage in play; it needs a decision
  (a per-god compute bound, or a cheap built-in skip that does not run the sandbox).
- **Neutrality** (§4): for `always` and `greedy`, offers/s, acts/s and energy/s are flat in n under all three rule
  sets (energy binds: 3.53 acts/s for always, 2.68 for greedy at every n; spread ≤ 0.5%). Win shares are flat within
  their standard errors (±3.2 points at 200 games). The rise with n under "before" appears only for the skipper.
- **Careful vs blunt** (§2): greedy's lead over always in win share is +18.8 points before and +13.7 after on First
  steps, +6.2 → +10.1 on Classic, +1.7 → −0.1 on Master (each ±3.6 points, 500 games), the same at every T. The new
  rules neither add to nor remove the reward for care that this harness can see; the payoff ratio is 1.00 everywhere.

## What this harness cannot measure

- It has no saving policy. Every policy spends when offered, so capacity never binds an agent; a strategy that saves
  for one large change (a row repaint) is not modelled, and neither is R4 (the debt bound changed nothing: one-cell
  changes cost 15–30 bits here against capacities of 240 bits or more at T = 30).
- Changes are all one size (two cells' worth: 16.3 bits on Classic). Distance pricing, composite mutators and the
  86/985-bit changes enter only through the arithmetic in §6.
- Goals are random draws and a look is all-or-nothing, so win shares respond weakly (a pure hoarder still "wins" about
  31% in §4). Read the win shares as a lower bound on any effect, as energy-model §2.1 already says.
- Gods never spend after planning here, so "income wasted, gods' own" is the worst case (a god that summons nothing
  more): 95% at T = 30. It shows that the god's unspent reserve stops growing, which is the intent of R1.
- The futility memo, sandbox time and real programs are absent. The compute cost of a skipper is inferred from offers/s.

## 1 and 2. T sweep and careful vs blunt

Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 1,2 --games 100 --wingames 500 --rooms grid-first-steps`

#### 1. T sweep, after-rules (no cap, offer price on). Acts, skips, waste and reading: 3 greedy gods × 3 agents, 100 games per row. Win shares: 500 games per row (fair 33.3; ±2.1 points).

### grid-first-steps (P = 64, 25 Hz, fixed 600 s)

| T (s) | acts/game | skips/game | income wasted, agents | income wasted, gods' own | energy on reading incl. offer | stream passed (no agent with energy) | wins always / greedy / deny | wins always / greedy / greedy |
|---|---|---|---|---|---|---|---|---|
| 5 | 5605 | 1404 | 0.0% | 99.6% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 15 | 5605 | 1404 | 0.0% | 97.9% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 30 | 5605 | 1404 | 0.0% | 95.4% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 60 | 5605 | 1404 | 0.0% | 90.4% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 120 | 5605 | 1404 | 0.0% | 80.4% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 300 | 5605 | 1404 | 0.0% | 50.4% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| none | 5605 | 1404 | 0.0% | 0.0% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| 30 + R4 debt bound | 5605 | 1404 | 0.0% | 95.4% | 18.7% | 51% | 22.8 / 35.2 / 42.0 | 24.2 / 39.6 / 36.2 |
| before (none, 4 Hz cap, no offer price) | 5700 | 1429 | 0.0% | 0.0% | 17.3% | 50% | 19.2 / 36.8 / 44.0 | 20.8 / 35.8 / 43.4 |

#### 2. Careful (greedy: look, then act or skip) against blunt (always: read nothing, always edit). Room: always / greedy / greedy, 3 agents each, 500 games per cell. "gain" = the mean greedy seat's win share minus the always seat's (points); "payoff" = mean greedy total payoff ÷ mean always total payoff. Before-rules = 4 Hz cap, no offer price (T = none is today); after-rules = no cap, offer price.

### grid-first-steps

| T (s) | before: always wins | before: greedy wins (mean seat) | before: gain (pts) | before: payoff ratio | before: always acts/s | before: greedy acts/s | after: always wins | after: greedy wins (mean seat) | after: gain (pts) | after: payoff ratio | after: always acts/s | after: greedy acts/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| 15 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| 30 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| 60 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| 120 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| 300 | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |
| none | 20.8% | 39.6% | +18.8 | 1.007 | 3.83 | 3.17 | 24.2% | 37.9% | +13.7 | 1.005 | 3.77 | 3.11 |


Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 1,2 --games 100 --wingames 500 --rooms grid-classic`

#### 1. T sweep, after-rules (no cap, offer price on). Acts, skips, waste and reading: 3 greedy gods × 3 agents, 100 games per row. Win shares: 500 games per row (fair 33.3; ±2.1 points).

### grid-classic (P = 64, 100 Hz, halfLife 300 s)

| T (s) | acts/game | skips/game | income wasted, agents | income wasted, gods' own | energy on reading incl. offer | stream passed (no agent with energy) | wins always / greedy / deny | wins always / greedy / greedy |
|---|---|---|---|---|---|---|---|---|
| 5 | 3476 | 869 | 0.0% | 99.4% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 15 | 3476 | 869 | 0.0% | 97.3% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 30 | 3476 | 869 | 0.0% | 94.1% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 60 | 3476 | 869 | 0.0% | 88.1% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 120 | 3476 | 869 | 0.0% | 77.2% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 300 | 3476 | 869 | 0.0% | 51.8% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| none | 3476 | 869 | 0.0% | 0.0% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| 30 + R4 debt bound | 3476 | 869 | 0.0% | 94.1% | 25.2% | 90% | 27.0 / 34.4 / 38.6 | 26.6 / 37.2 / 36.2 |
| before (none, 4 Hz cap, no offer price) | 3524 | 890 | 0.0% | 0.0% | 24.2% | 90% | 28.0 / 34.8 / 37.2 | 29.2 / 36.0 / 34.8 |

#### 2. Careful (greedy: look, then act or skip) against blunt (always: read nothing, always edit). Room: always / greedy / greedy, 3 agents each, 500 games per cell. "gain" = the mean greedy seat's win share minus the always seat's (points); "payoff" = mean greedy total payoff ÷ mean always total payoff. Before-rules = 4 Hz cap, no offer price (T = none is today); after-rules = no cap, offer price.

### grid-classic

| T (s) | before: always wins | before: greedy wins (mean seat) | before: gain (pts) | before: payoff ratio | before: always acts/s | before: greedy acts/s | after: always wins | after: greedy wins (mean seat) | after: gain (pts) | after: payoff ratio | after: always acts/s | after: greedy acts/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| 15 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| 30 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| 60 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| 120 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| 300 | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |
| none | 29.2% | 35.4% | +6.2 | 1.003 | 3.45 | 2.62 | 26.6% | 36.7% | +10.1 | 1.002 | 3.41 | 2.59 |


Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 1,2 --games 100 --wingames 500 --rooms grid-master`

#### 1. T sweep, after-rules (no cap, offer price on). Acts, skips, waste and reading: 3 greedy gods × 3 agents, 100 games per row. Win shares: 500 games per row (fair 33.3; ±2.1 points).

### grid-master (P = 64, 100 Hz, halfLife 300 s)

| T (s) | acts/game | skips/game | income wasted, agents | income wasted, gods' own | energy on reading incl. offer | stream passed (no agent with energy) | wins always / greedy / deny | wins always / greedy / greedy |
|---|---|---|---|---|---|---|---|---|
| 5 | 1635 | 406 | 0.0% | 99.4% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 15 | 1635 | 406 | 0.0% | 97.3% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 30 | 1635 | 406 | 0.0% | 94.1% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 60 | 1635 | 406 | 0.0% | 88.1% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 120 | 1635 | 406 | 0.0% | 77.2% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 300 | 1635 | 406 | 0.0% | 51.8% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| none | 1635 | 406 | 0.0% | 0.0% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| 30 + R4 debt bound | 1635 | 406 | 0.0% | 94.1% | 34.8% | 95% | 31.6 / 33.0 / 35.4 | 33.4 / 34.4 / 32.2 |
| before (none, 4 Hz cap, no offer price) | 1643 | 416 | 0.0% | 0.0% | 34.4% | 95% | 29.8 / 39.2 / 31.0 | 32.2 / 35.2 / 32.6 |

#### 2. Careful (greedy: look, then act or skip) against blunt (always: read nothing, always edit). Room: always / greedy / greedy, 3 agents each, 500 games per cell. "gain" = the mean greedy seat's win share minus the always seat's (points); "payoff" = mean greedy total payoff ÷ mean always total payoff. Before-rules = 4 Hz cap, no offer price (T = none is today); after-rules = no cap, offer price.

### grid-master

| T (s) | before: always wins | before: greedy wins (mean seat) | before: gain (pts) | before: payoff ratio | before: always acts/s | before: greedy acts/s | after: always wins | after: greedy wins (mean seat) | after: gain (pts) | after: payoff ratio | after: always acts/s | after: greedy acts/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| 15 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| 30 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| 60 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| 120 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| 300 | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |
| none | 32.2% | 33.9% | +1.7 | 1.002 | 1.87 | 1.23 | 33.4% | 33.3% | -0.1 | 0.999 | 1.85 | 1.22 |


Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 1,2 --games 100 --wingames 500 --rooms grid-first-steps@4Hz`

#### 1. T sweep, after-rules (no cap, offer price on). Acts, skips, waste and reading: 3 greedy gods × 3 agents, 100 games per row. Win shares: 500 games per row (fair 33.3; ±2.1 points).

### grid-first-steps@4Hz (P = 64, 4 Hz, fixed 600 s)

| T (s) | acts/game | skips/game | income wasted, agents | income wasted, gods' own | energy on reading incl. offer | stream passed (no agent with energy) | wins always / greedy / deny | wins always / greedy / greedy |
|---|---|---|---|---|---|---|---|---|
| 5 | 1919 | 481 | 64.9% | 99.6% | 18.7% | 0% | 25.0 / 32.8 / 42.2 | 26.0 / 33.2 / 40.8 |
| 15 | 1919 | 481 | 63.3% | 97.9% | 18.7% | 0% | 26.4 / 35.2 / 38.4 | 23.4 / 39.0 / 37.6 |
| 30 | 1919 | 481 | 60.8% | 95.4% | 18.7% | 0% | 28.6 / 30.2 / 41.2 | 29.0 / 31.0 / 40.0 |
| 60 | 1919 | 481 | 55.8% | 90.4% | 18.7% | 0% | 26.0 / 32.8 / 41.2 | 29.0 / 33.6 / 37.4 |
| 120 | 1919 | 481 | 45.8% | 80.4% | 18.7% | 0% | 27.6 / 33.0 / 39.4 | 27.0 / 33.2 / 39.8 |
| 300 | 1919 | 481 | 15.8% | 50.4% | 18.7% | 0% | 32.4 / 35.4 / 32.2 | 30.0 / 35.0 / 35.0 |
| none | 1919 | 481 | 0.0% | 0.0% | 18.7% | 0% | 31.4 / 34.4 / 34.2 | 27.6 / 36.6 / 35.8 |
| 30 + R4 debt bound | 1919 | 481 | 60.8% | 95.4% | 18.7% | 0% | 28.6 / 30.2 / 41.2 | 29.0 / 31.0 / 40.0 |
| before (none, 4 Hz cap, no offer price) | 1919 | 481 | 0.0% | 0.0% | 17.3% | 0% | 29.0 / 31.6 / 39.4 | 28.6 / 35.0 / 36.4 |

#### 2. Careful (greedy: look, then act or skip) against blunt (always: read nothing, always edit). Room: always / greedy / greedy, 3 agents each, 500 games per cell. "gain" = the mean greedy seat's win share minus the always seat's (points); "payoff" = mean greedy total payoff ÷ mean always total payoff. Before-rules = 4 Hz cap, no offer price (T = none is today); after-rules = no cap, offer price.

### grid-first-steps@4Hz

| T (s) | before: always wins | before: greedy wins (mean seat) | before: gain (pts) | before: payoff ratio | before: always acts/s | before: greedy acts/s | after: always wins | after: greedy wins (mean seat) | after: gain (pts) | after: payoff ratio | after: always acts/s | after: greedy acts/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 27.2% | 36.4% | +9.2 | 1.005 | 1.34 | 1.07 | 26.0% | 37.0% | +11.0 | 1.006 | 1.34 | 1.06 |
| 15 | 26.8% | 36.6% | +9.8 | 1.006 | 1.34 | 1.07 | 23.4% | 38.3% | +14.9 | 1.006 | 1.34 | 1.06 |
| 30 | 25.8% | 37.1% | +11.3 | 1.005 | 1.34 | 1.06 | 29.0% | 35.5% | +6.5 | 1.005 | 1.33 | 1.07 |
| 60 | 29.2% | 35.4% | +6.2 | 1.004 | 1.33 | 1.07 | 29.0% | 35.5% | +6.5 | 1.006 | 1.33 | 1.07 |
| 120 | 27.2% | 36.4% | +9.2 | 1.005 | 1.33 | 1.07 | 27.0% | 36.5% | +9.5 | 1.005 | 1.33 | 1.07 |
| 300 | 30.0% | 35.0% | +5.0 | 1.004 | 1.33 | 1.07 | 30.0% | 35.0% | +5.0 | 1.002 | 1.33 | 1.07 |
| none | 28.6% | 35.7% | +7.1 | 1.004 | 1.32 | 1.07 | 27.6% | 36.2% | +8.6 | 1.003 | 1.32 | 1.07 |


Reading these: the three shipped rooms are energy-bound, so every T row is the same game. Only the scarce-stream room (4 Hz) shows capacity at work: agents waste 61% of income at T = 30 and 16% at T = 300, with no change in acts (offers bind there either way).

Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 3 --games 100`

## 3. Hoarder: god 2's three agents read nothing and return no calls; gods 0 and 1 are greedy (3 agents each, default shares 1/2, 1/4, 1/8). grid-first-steps, 100 games per row and room. "active acts/s" sums gods 0 and 1. Comparison rooms under the same rules: the third god an ordinary greedy player; only the two active gods.

### interactionRateHz = 25 (the Grid seeds' value)

| T (s) | offer price | rate cap | hoarder's share of the stream | hoarder offers/s | hoarder cost bits/s | cost ÷ its agents' income | hoarder energy (2nd-half mean, bits) | an active god's energy (bits) | active acts/s, hoarder room | active acts/s, third god greedy | active acts/s, two gods only | vs greedy third | vs two only |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 280 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 5 | off | none | 68.4% | 17.10 | 0.00 | 0.0% | 280 | 57 | 6.32 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 5 | on | 4 Hz | 48.0% | 12.00 | 2.90 | 5.2% | 279 | -23 | 6.22 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 5 | on | none | 68.9% | 17.22 | 4.15 | 7.4% | 279 | 55 | 6.21 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 15 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 840 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 15 | off | none | 68.5% | 17.13 | 0.00 | 0.0% | 840 | 188 | 6.29 ± 0.00 | 6.33 | 6.33 | 99% | 99% |
| 15 | on | 4 Hz | 48.0% | 12.00 | 2.89 | 5.2% | 839 | -23 | 6.22 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 15 | on | none | 69.0% | 17.26 | 4.17 | 7.4% | 839 | 184 | 6.19 ± 0.00 | 6.23 | 6.23 | 99% | 99% |
| 30 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 1680 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 30 | off | none | 68.7% | 17.17 | 0.00 | 0.0% | 1680 | 383 | 6.26 ± 0.00 | 6.33 | 6.33 | 99% | 99% |
| 30 | on | 4 Hz | 48.0% | 12.00 | 2.90 | 5.2% | 1679 | -23 | 6.23 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 30 | on | none | 69.2% | 17.30 | 4.18 | 7.5% | 1679 | 374 | 6.15 ± 0.00 | 6.23 | 6.23 | 99% | 99% |
| 60 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 3360 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 60 | off | none | 69.0% | 17.26 | 0.00 | 0.0% | 3360 | 774 | 6.18 ± 0.00 | 6.33 | 6.33 | 98% | 98% |
| 60 | on | 4 Hz | 48.0% | 12.00 | 2.89 | 5.2% | 3359 | -23 | 6.23 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 60 | on | none | 69.6% | 17.39 | 4.20 | 7.5% | 3359 | 753 | 6.08 ± 0.00 | 6.23 | 6.23 | 98% | 98% |
| 120 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 6720 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 120 | off | none | 69.8% | 17.45 | 0.00 | 0.0% | 6720 | 1554 | 6.04 ± 0.00 | 6.33 | 6.33 | 95% | 95% |
| 120 | on | 4 Hz | 48.0% | 12.00 | 2.89 | 5.2% | 6719 | -23 | 6.23 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 120 | on | none | 70.3% | 17.57 | 4.23 | 7.6% | 6719 | 1508 | 5.94 ± 0.00 | 6.23 | 6.23 | 95% | 95% |
| 300 | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 16800 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| 300 | off | none | 71.9% | 17.98 | 0.00 | 0.0% | 16800 | 3608 | 5.60 ± 0.00 | 6.33 | 6.33 | 88% | 89% |
| 300 | on | 4 Hz | 48.0% | 12.00 | 2.89 | 5.2% | 16770 | -23 | 6.23 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| 300 | on | none | 72.3% | 18.08 | 4.36 | 7.8% | 16749 | 3460 | 5.53 ± 0.00 | 6.23 | 6.23 | 89% | 89% |
| none | off | 4 Hz | 48.0% | 12.00 | 0.00 | 0.0% | 25207 | -22 | 6.33 ± 0.00 | 6.33 | 6.33 | 100% | 100% |
| none | off | none | 73.9% | 18.48 | 0.00 | 0.0% | 25207 | 4463 | 5.21 ± 0.00 | 6.33 | 6.33 | 82% | 82% |
| none | on | 4 Hz | 48.0% | 12.00 | 2.89 | 5.2% | 23939 | -23 | 6.23 ± 0.00 | 6.23 | 6.23 | 100% | 100% |
| none | on | none | 73.9% | 18.48 | 4.47 | 8.0% | 23252 | 4095 | 5.21 ± 0.00 | 6.23 | 6.23 | 84% | 84% |

### interactionRateHz = 4 (scarce stream: offers are the bottleneck)

| T (s) | offer price | rate cap | hoarder's share of the stream | hoarder offers/s | hoarder cost bits/s | cost ÷ its agents' income | hoarder energy (2nd-half mean, bits) | an active god's energy (bits) | active acts/s, hoarder room | active acts/s, third god greedy | active acts/s, two gods only | vs greedy third | vs two only |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | off | 4 Hz | 34.2% | 1.37 | 0.00 | 0.0% | 280 | 267 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 5 | off | none | 34.2% | 1.37 | 0.00 | 0.0% | 280 | 267 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 5 | on | 4 Hz | 34.2% | 1.37 | 0.33 | 0.6% | 280 | 267 | 2.11 ± 0.01 | 2.13 | 3.20 | 99% | 66% |
| 5 | on | none | 34.2% | 1.37 | 0.33 | 0.6% | 280 | 267 | 2.11 ± 0.01 | 2.13 | 3.20 | 99% | 66% |
| 15 | off | 4 Hz | 33.9% | 1.35 | 0.00 | 0.0% | 840 | 827 | 2.12 ± 0.00 | 2.13 | 3.20 | 99% | 66% |
| 15 | off | none | 33.9% | 1.35 | 0.00 | 0.0% | 840 | 827 | 2.12 ± 0.00 | 2.13 | 3.20 | 99% | 66% |
| 15 | on | 4 Hz | 33.8% | 1.35 | 0.33 | 0.6% | 840 | 826 | 2.12 ± 0.01 | 2.13 | 3.20 | 99% | 66% |
| 15 | on | none | 33.8% | 1.35 | 0.33 | 0.6% | 840 | 826 | 2.12 ± 0.01 | 2.13 | 3.20 | 99% | 66% |
| 30 | off | 4 Hz | 34.1% | 1.36 | 0.00 | 0.0% | 1680 | 1666 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 30 | off | none | 34.1% | 1.36 | 0.00 | 0.0% | 1680 | 1666 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 30 | on | 4 Hz | 34.1% | 1.36 | 0.33 | 0.6% | 1680 | 1666 | 2.10 ± 0.00 | 2.13 | 3.20 | 99% | 66% |
| 30 | on | none | 34.1% | 1.36 | 0.33 | 0.6% | 1680 | 1666 | 2.10 ± 0.00 | 2.13 | 3.20 | 99% | 66% |
| 60 | off | 4 Hz | 34.4% | 1.38 | 0.00 | 0.0% | 3360 | 3346 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 60 | off | none | 34.4% | 1.38 | 0.00 | 0.0% | 3360 | 3346 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 60 | on | 4 Hz | 34.4% | 1.38 | 0.33 | 0.6% | 3360 | 3346 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 60 | on | none | 34.4% | 1.38 | 0.33 | 0.6% | 3360 | 3346 | 2.10 ± 0.00 | 2.13 | 3.20 | 98% | 66% |
| 120 | off | 4 Hz | 35.4% | 1.41 | 0.00 | 0.0% | 6720 | 6706 | 2.06 ± 0.01 | 2.13 | 3.20 | 97% | 64% |
| 120 | off | none | 35.4% | 1.41 | 0.00 | 0.0% | 6720 | 6706 | 2.06 ± 0.01 | 2.13 | 3.20 | 97% | 64% |
| 120 | on | 4 Hz | 35.4% | 1.42 | 0.34 | 0.6% | 6720 | 6706 | 2.07 ± 0.00 | 2.13 | 3.20 | 97% | 65% |
| 120 | on | none | 35.4% | 1.42 | 0.34 | 0.6% | 6720 | 6706 | 2.07 ± 0.00 | 2.13 | 3.20 | 97% | 65% |
| 300 | off | 4 Hz | 38.4% | 1.54 | 0.00 | 0.0% | 16800 | 15726 | 1.96 ± 0.00 | 2.13 | 3.20 | 92% | 61% |
| 300 | off | none | 38.4% | 1.54 | 0.00 | 0.0% | 16800 | 15726 | 1.96 ± 0.00 | 2.13 | 3.20 | 92% | 61% |
| 300 | on | 4 Hz | 38.5% | 1.54 | 0.37 | 0.7% | 16800 | 15680 | 1.97 ± 0.00 | 2.13 | 3.20 | 92% | 62% |
| 300 | on | none | 38.5% | 1.54 | 0.37 | 0.7% | 16800 | 15680 | 1.97 ± 0.00 | 2.13 | 3.20 | 92% | 62% |
| none | off | 4 Hz | 41.7% | 1.67 | 0.00 | 0.0% | 25207 | 17768 | 1.87 ± 0.00 | 2.13 | 3.20 | 88% | 58% |
| none | off | none | 41.7% | 1.67 | 0.00 | 0.0% | 25207 | 17768 | 1.87 ± 0.00 | 2.13 | 3.20 | 88% | 58% |
| none | on | 4 Hz | 41.6% | 1.66 | 0.40 | 0.7% | 25031 | 17639 | 1.87 ± 0.00 | 2.13 | 3.20 | 88% | 58% |
| none | on | none | 41.6% | 1.66 | 0.40 | 0.7% | 25031 | 17639 | 1.87 ± 0.00 | 2.13 | 3.20 | 88% | 58% |


Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 4 --games 200`

## 4. Agent-count neutrality: god 0 runs n pre-created agents with equal shares 0.9/n (no summon priced); gods 1 and 2 are greedy with 2 agents at 0.45 each. grid-classic board, fixed 300 s, P = 64. 200 games per row at 25 Hz, 100 at 100 Hz; mean ± standard error over games. (a) before: 4 Hz cap, no T; (b) capacity T = 30 with the cap kept; (c) after: no cap, T = 30, offer price.

### 25 Hz, god 0 policy: always

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 27.5 ± 3.2 | -8 |
| (a) before | 2 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 28.0 ± 3.2 | -16 |
| (a) before | 3 | 3.54 ± 0.00 | 3.54 ± 0.00 | 57.73 ± 0.00 | 35.5 ± 3.4 | -24 |
| (a) before | 5 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 30.5 ± 3.3 | -39 |
| (a) before | 10 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 3.3 | -72 |
| (b) cap + T=30 | 1 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 27.5 ± 3.2 | -8 |
| (b) cap + T=30 | 2 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 28.0 ± 3.2 | -16 |
| (b) cap + T=30 | 3 | 3.54 ± 0.00 | 3.54 ± 0.00 | 57.73 ± 0.00 | 35.5 ± 3.4 | -24 |
| (b) cap + T=30 | 5 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 30.5 ± 3.3 | -39 |
| (b) cap + T=30 | 10 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 3.3 | -72 |
| (c) after | 1 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.64 ± 0.00 | 27.0 ± 3.1 | -8 |
| (c) after | 2 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.65 ± 0.00 | 31.0 ± 3.3 | -17 |
| (c) after | 3 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.70 ± 0.00 | 30.5 ± 3.3 | -25 |
| (c) after | 5 | 3.50 ± 0.00 | 3.50 ± 0.00 | 57.80 ± 0.01 | 31.0 ± 3.3 | -40 |
| (c) after | 10 | 3.50 ± 0.00 | 3.50 ± 0.00 | 57.87 ± 0.00 | 29.0 ± 3.2 | -73 |

### 25 Hz, god 0 policy: greedy

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 3.35 ± 0.00 | 2.68 ± 0.00 | 57.61 ± 0.00 | 32.5 ± 3.3 | -4 |
| (a) before | 2 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.66 ± 0.00 | 35.0 ± 3.4 | -18 |
| (a) before | 3 | 3.35 ± 0.00 | 2.68 ± 0.00 | 57.70 ± 0.00 | 38.0 ± 3.4 | -29 |
| (a) before | 5 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.75 ± 0.00 | 35.0 ± 3.4 | -49 |
| (a) before | 10 | 3.37 ± 0.00 | 2.69 ± 0.00 | 57.88 ± 0.00 | 27.5 ± 3.2 | -98 |
| (b) cap + T=30 | 1 | 3.35 ± 0.00 | 2.68 ± 0.00 | 57.61 ± 0.00 | 32.5 ± 3.3 | -4 |
| (b) cap + T=30 | 2 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.66 ± 0.00 | 35.0 ± 3.4 | -18 |
| (b) cap + T=30 | 3 | 3.35 ± 0.00 | 2.68 ± 0.00 | 57.70 ± 0.00 | 38.0 ± 3.4 | -29 |
| (b) cap + T=30 | 5 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.75 ± 0.00 | 35.0 ± 3.4 | -49 |
| (b) cap + T=30 | 10 | 3.37 ± 0.00 | 2.69 ± 0.00 | 57.88 ± 0.00 | 27.5 ± 3.2 | -98 |
| (c) after | 1 | 3.31 ± 0.00 | 2.64 ± 0.00 | 57.63 ± 0.00 | 31.0 ± 3.3 | -10 |
| (c) after | 2 | 3.31 ± 0.00 | 2.65 ± 0.00 | 57.67 ± 0.00 | 32.0 ± 3.3 | -20 |
| (c) after | 3 | 3.31 ± 0.00 | 2.65 ± 0.00 | 57.70 ± 0.00 | 34.0 ± 3.4 | -30 |
| (c) after | 5 | 3.32 ± 0.00 | 2.65 ± 0.00 | 57.76 ± 0.00 | 33.5 ± 3.3 | -50 |
| (c) after | 10 | 3.33 ± 0.00 | 2.66 ± 0.00 | 57.93 ± 0.00 | 28.0 ± 3.2 | -99 |

### 25 Hz, god 0 policy: hoard

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 4.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 25.0 ± 3.1 | 12967 |
| (a) before | 2 | 8.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 29.0 ± 3.2 | 12967 |
| (a) before | 3 | 12.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 32.0 ± 3.3 | 12967 |
| (a) before | 5 | 18.73 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 33.5 ± 3.3 | 12967 |
| (a) before | 10 | 19.21 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 27.0 ± 3.1 | 12967 |
| (b) cap + T=30 | 1 | 4.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 27.0 ± 3.1 | 1728 |
| (b) cap + T=30 | 2 | 8.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 30.5 ± 3.3 | 1728 |
| (b) cap + T=30 | 3 | 12.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 24.0 ± 3.0 | 1728 |
| (b) cap + T=30 | 5 | 18.35 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 30.0 ± 3.2 | 1728 |
| (b) cap + T=30 | 10 | 18.42 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 31.0 ± 3.3 | 1728 |
| (c) after | 1 | 18.50 ± 0.00 | 0.00 ± 0.00 | 4.16 ± 0.00 | 31.0 ± 3.3 | 1727 |
| (c) after | 2 | 18.50 ± 0.00 | 0.00 ± 0.00 | 4.16 ± 0.00 | 31.0 ± 3.3 | 1727 |
| (c) after | 3 | 18.50 ± 0.00 | 0.00 ± 0.00 | 4.16 ± 0.00 | 31.0 ± 3.3 | 1727 |
| (c) after | 5 | 18.50 ± 0.00 | 0.00 ± 0.00 | 4.16 ± 0.00 | 31.0 ± 3.3 | 1727 |
| (c) after | 10 | 18.50 ± 0.00 | 0.00 ± 0.00 | 4.16 ± 0.00 | 31.0 ± 3.3 | 1727 |

### 100 Hz, god 0 policy: always

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 4.6 | -8 |
| (a) before | 2 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 30.0 ± 4.6 | -16 |
| (a) before | 3 | 3.54 ± 0.00 | 3.54 ± 0.00 | 57.73 ± 0.00 | 30.0 ± 4.6 | -24 |
| (a) before | 5 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 4.6 | -41 |
| (a) before | 10 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 28.0 ± 4.5 | -81 |
| (b) cap + T=30 | 1 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 4.6 | -8 |
| (b) cap + T=30 | 2 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 30.0 ± 4.6 | -16 |
| (b) cap + T=30 | 3 | 3.54 ± 0.00 | 3.54 ± 0.00 | 57.73 ± 0.00 | 30.0 ± 4.6 | -24 |
| (b) cap + T=30 | 5 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 31.0 ± 4.6 | -41 |
| (b) cap + T=30 | 10 | 3.53 ± 0.00 | 3.53 ± 0.00 | 57.62 ± 0.00 | 28.0 ± 4.5 | -81 |
| (c) after | 1 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.64 ± 0.00 | 25.0 ± 4.4 | -8 |
| (c) after | 2 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.65 ± 0.00 | 30.0 ± 4.6 | -17 |
| (c) after | 3 | 3.49 ± 0.00 | 3.49 ± 0.00 | 57.70 ± 0.00 | 29.0 ± 4.6 | -25 |
| (c) after | 5 | 3.50 ± 0.00 | 3.50 ± 0.00 | 57.84 ± 0.01 | 20.0 ± 4.0 | -41 |
| (c) after | 10 | 3.50 ± 0.00 | 3.50 ± 0.00 | 57.87 ± 0.00 | 25.0 ± 4.4 | -83 |

### 100 Hz, god 0 policy: greedy

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.61 ± 0.00 | 33.0 ± 4.7 | -4 |
| (a) before | 2 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.66 ± 0.00 | 34.0 ± 4.8 | -18 |
| (a) before | 3 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.70 ± 0.00 | 41.0 ± 4.9 | -29 |
| (a) before | 5 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.75 ± 0.00 | 30.0 ± 4.6 | -49 |
| (a) before | 10 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.88 ± 0.01 | 29.0 ± 4.6 | -98 |
| (b) cap + T=30 | 1 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.61 ± 0.00 | 33.0 ± 4.7 | -4 |
| (b) cap + T=30 | 2 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.66 ± 0.00 | 34.0 ± 4.8 | -18 |
| (b) cap + T=30 | 3 | 3.36 ± 0.00 | 2.68 ± 0.00 | 57.70 ± 0.00 | 41.0 ± 4.9 | -29 |
| (b) cap + T=30 | 5 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.75 ± 0.00 | 30.0 ± 4.6 | -49 |
| (b) cap + T=30 | 10 | 3.36 ± 0.00 | 2.69 ± 0.00 | 57.88 ± 0.01 | 29.0 ± 4.6 | -98 |
| (c) after | 1 | 3.30 ± 0.00 | 2.65 ± 0.00 | 57.63 ± 0.00 | 32.0 ± 4.7 | -10 |
| (c) after | 2 | 3.31 ± 0.00 | 2.65 ± 0.00 | 57.66 ± 0.00 | 31.0 ± 4.6 | -20 |
| (c) after | 3 | 3.32 ± 0.00 | 2.65 ± 0.00 | 57.69 ± 0.00 | 35.0 ± 4.8 | -30 |
| (c) after | 5 | 3.32 ± 0.00 | 2.65 ± 0.00 | 57.77 ± 0.01 | 32.0 ± 4.7 | -50 |
| (c) after | 10 | 3.33 ± 0.00 | 2.66 ± 0.00 | 57.93 ± 0.01 | 38.0 ± 4.9 | -99 |

### 100 Hz, god 0 policy: hoard

| rules | n agents | offers/s | acts/s | energy spent/s | win share % | god 0 energy (bits) |
|---|---|---|---|---|---|---|
| (a) before | 1 | 4.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 24.0 ± 4.3 | 12967 |
| (a) before | 2 | 8.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 31.0 ± 4.6 | 12967 |
| (a) before | 3 | 12.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 37.0 ± 4.9 | 12967 |
| (a) before | 5 | 20.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 33.0 ± 4.7 | 12967 |
| (a) before | 10 | 40.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 32.0 ± 4.7 | 12967 |
| (b) cap + T=30 | 1 | 4.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 28.0 ± 4.5 | 1728 |
| (b) cap + T=30 | 2 | 8.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 31.0 ± 4.6 | 1728 |
| (b) cap + T=30 | 3 | 12.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 34.0 ± 4.8 | 1728 |
| (b) cap + T=30 | 5 | 20.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 25.0 ± 4.4 | 1728 |
| (b) cap + T=30 | 10 | 40.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 29.0 ± 4.6 | 1728 |
| (c) after | 1 | 93.41 ± 0.01 | 0.00 ± 0.00 | 21.04 ± 0.02 | 32.0 ± 4.7 | 1722 |
| (c) after | 2 | 93.41 ± 0.01 | 0.00 ± 0.00 | 21.04 ± 0.02 | 32.0 ± 4.7 | 1722 |
| (c) after | 3 | 93.41 ± 0.01 | 0.00 ± 0.00 | 21.05 ± 0.02 | 32.0 ± 4.7 | 1722 |
| (c) after | 5 | 93.41 ± 0.01 | 0.00 ± 0.00 | 21.05 ± 0.02 | 32.0 ± 4.7 | 1722 |
| (c) after | 10 | 93.41 ± 0.01 | 0.00 ± 0.00 | 21.05 ± 0.02 | 31.0 ± 4.6 | 1722 |


Command: `node --experimental-transform-types lib/game-core/scripts/balance-settings.ts --experiments 5,6` (arithmetic with game-core's functions; no games)

## 5. The offer price log2(live objects)/κ (κ = 32) against the cheapest change C (docs/energy-model.md §2.1) and a full read at 1/κ (fullReadCharge). "after 600 s" uses startingObjectCount + spawnRateHz × 600 objects.

| seed | objects at start | offer price (bits) | objects after 600 s | offer price then | cheapest change C | full read ÷ κ | offer ÷ C (start) | offer ÷ C (600 s) | offer ÷ full read | whole stream's offers, bits/s (600 s) | P (bits/s per god) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| grid-first-steps | 80 | 0.198 | 380 | 0.268 | 11.5 | 2.45 | 1.7% | 2.3% | 8.1% | 6.7 | 64 |
| grid-annotated-basics | 10 | 0.104 | 70 | 0.192 | 16.3 | 1.66 | 0.6% | 1.2% | 6.3% | 4.8 | 64 |
| grid-classic | 80 | 0.198 | 380 | 0.268 | 14.3 | 4.16 | 1.4% | 1.9% | 4.8% | 26.8 | 64 |
| grid-low-income | 80 | 0.198 | 380 | 0.268 | 14.3 | 4.16 | 1.4% | 1.9% | 4.8% | 26.8 | 32 |
| grid-big | 80 | 0.198 | 380 | 0.268 | 17.8 | 7.41 | 1.1% | 1.5% | 2.7% | 26.8 | 64 |
| grid-master | 80 | 0.198 | 380 | 0.268 | 18.7 | 12.69 | 1.1% | 1.4% | 1.6% | 26.8 | 64 |

## 6. The god's own account: capacity = retained share × P × T (energyCapacity). Refilling from empty takes T world seconds at any retained share (capacity ÷ income). "fits" = the largest reference program (60, 150, 400, 1137 bits) a full account pays for. startingEnergy = 200.

### P = 64 (Grid)

| T (s) | retained 10%: capacity (fits) | retained 25%: capacity (fits) | retained 50%: capacity (fits) | retained 100%: capacity (fits) | seconds to refill from empty | startingEnergy kept in planning |
|---|---|---|---|---|---|---|
| 15 | 96 (≤ 60) | 240 (≤ 150) | 480 (≤ 400) | 960 (≤ 400) | 15 | 200 |
| 30 | 192 (≤ 150) | 480 (≤ 400) | 960 (≤ 400) | 1920 (≤ 1137) | 30 | 200 |
| 60 | 384 (≤ 150) | 960 (≤ 400) | 1920 (≤ 1137) | 3840 (≤ 1137) | 60 | 200 |
| 120 | 768 (≤ 400) | 1920 (≤ 1137) | 3840 (≤ 1137) | 7680 (≤ 1137) | 120 | 200 |

| program (bits) | retained 10%: smallest T that fits it (s); seconds to save it from empty | retained 25%: smallest T that fits it (s); seconds to save it from empty | retained 50%: smallest T that fits it (s); seconds to save it from empty | retained 100%: smallest T that fits it (s); seconds to save it from empty |
|---|---|---|---|---|
| 60 | 9.4 | 3.8 | 1.9 | 0.9 |
| 150 | 23.4 | 9.4 | 4.7 | 2.3 |
| 400 | 62.5 | 25.0 | 12.5 | 6.3 |
| 1137 | 177.7 | 71.1 | 35.5 | 17.8 |

### P = 32 (grid-low-income)

| T (s) | retained 10%: capacity (fits) | retained 25%: capacity (fits) | retained 50%: capacity (fits) | retained 100%: capacity (fits) | seconds to refill from empty | startingEnergy kept in planning |
|---|---|---|---|---|---|---|
| 15 | 48 (none) | 120 (≤ 60) | 240 (≤ 150) | 480 (≤ 400) | 15 | 200 |
| 30 | 96 (≤ 60) | 240 (≤ 150) | 480 (≤ 400) | 960 (≤ 400) | 30 | 200 |
| 60 | 192 (≤ 150) | 480 (≤ 400) | 960 (≤ 400) | 1920 (≤ 1137) | 60 | 200 |
| 120 | 384 (≤ 150) | 960 (≤ 400) | 1920 (≤ 1137) | 3840 (≤ 1137) | 120 | 200 |

| program (bits) | retained 10%: smallest T that fits it (s); seconds to save it from empty | retained 25%: smallest T that fits it (s); seconds to save it from empty | retained 50%: smallest T that fits it (s); seconds to save it from empty | retained 100%: smallest T that fits it (s); seconds to save it from empty |
|---|---|---|---|---|
| 60 | 18.8 | 7.5 | 3.8 | 1.9 |
| 150 | 46.9 | 18.8 | 9.4 | 4.7 |
| 400 | 125.0 | 50.0 | 25.0 | 12.5 |
| 1137 | 355.3 | 142.1 | 71.1 | 35.5 |

### P = 8 (default Int settings)

| T (s) | retained 10%: capacity (fits) | retained 25%: capacity (fits) | retained 50%: capacity (fits) | retained 100%: capacity (fits) | seconds to refill from empty | startingEnergy kept in planning |
|---|---|---|---|---|---|---|
| 15 | 12 (none) | 30 (none) | 60 (≤ 60) | 120 (≤ 60) | 15 | 120 |
| 30 | 24 (none) | 60 (≤ 60) | 120 (≤ 60) | 240 (≤ 150) | 30 | 200 |
| 60 | 48 (none) | 120 (≤ 60) | 240 (≤ 150) | 480 (≤ 400) | 60 | 200 |
| 120 | 96 (≤ 60) | 240 (≤ 150) | 480 (≤ 400) | 960 (≤ 400) | 120 | 200 |

| program (bits) | retained 10%: smallest T that fits it (s); seconds to save it from empty | retained 25%: smallest T that fits it (s); seconds to save it from empty | retained 50%: smallest T that fits it (s); seconds to save it from empty | retained 100%: smallest T that fits it (s); seconds to save it from empty |
|---|---|---|---|---|
| 60 | 75.0 | 30.0 | 15.0 | 7.5 |
| 150 | 187.5 | 75.0 | 37.5 | 18.8 |
| 400 | 500.0 | 200.0 | 100.0 | 50.0 |
| 1137 | 1421.3 | 568.5 | 284.3 | 142.1 |

### The first five minutes (real deity-account functions): planning with world time stopped and 200 bits, summon a 60-bit agent at the default share (half of unallocated), then a second; then world time runs. Each cell: the god's balance (largest reference program it can pay for).

| P | T (s) | retained after summons | capacity after summons | planning balance (clamped) | after 1st summon | after 2nd summon | at 30 s | at 60 s | at 300 s |
|---|---|---|---|---|---|---|---|---|---|
| 64 | 15 | 25% | 240 | 200 | 140 | 80 | 240 (≤ 150) | 240 (≤ 150) | 240 (≤ 150) |
| 64 | 30 | 25% | 480 | 200 | 140 | 80 | 480 (≤ 400) | 480 (≤ 400) | 480 (≤ 400) |
| 64 | 60 | 25% | 960 | 200 | 140 | 80 | 560 (≤ 400) | 960 (≤ 400) | 960 (≤ 400) |
| 64 | 120 | 25% | 1920 | 200 | 140 | 80 | 560 (≤ 400) | 1040 (≤ 400) | 1920 (≤ 1137) |
| 64 | none | 25% | ∞ | 200 | 140 | 80 | 560 (≤ 400) | 1040 (≤ 400) | 4880 (≤ 1137) |
| 32 | 15 | 25% | 120 | 200 | 140 | 80 | 120 (≤ 60) | 120 (≤ 60) | 120 (≤ 60) |
| 32 | 30 | 25% | 240 | 200 | 140 | 80 | 240 (≤ 150) | 240 (≤ 150) | 240 (≤ 150) |
| 32 | 60 | 25% | 480 | 200 | 140 | 80 | 320 (≤ 150) | 480 (≤ 400) | 480 (≤ 400) |
| 32 | 120 | 25% | 960 | 200 | 140 | 80 | 320 (≤ 150) | 560 (≤ 400) | 960 (≤ 400) |
| 32 | none | 25% | ∞ | 200 | 140 | 80 | 320 (≤ 150) | 560 (≤ 400) | 2480 (≤ 1137) |
| 8 | 15 | 25% | 30 | 120 | 60 | 0 | 30 (none) | 30 (none) | 30 (none) |
| 8 | 30 | 25% | 60 | 200 | 120 | 60 | 60 (≤ 60) | 60 (≤ 60) | 60 (≤ 60) |
| 8 | 60 | 25% | 120 | 200 | 140 | 80 | 120 (≤ 60) | 120 (≤ 60) | 120 (≤ 60) |
| 8 | 120 | 25% | 240 | 200 | 140 | 80 | 140 (≤ 60) | 200 (≤ 150) | 240 (≤ 150) |
| 8 | none | 25% | ∞ | 200 | 140 | 80 | 140 (≤ 60) | 200 (≤ 150) | 680 (≤ 400) |

### Agents' capacities at P = 64 (share × P × T), against a one-cell change (16.3 bits on the Classic board in this harness), a row repaint on 4×4 (86 bits) and the whole 4×4 grid (985 bits). With R4 the largest act an agent can ever commit costs at most 2 × capacity (full balance down to −capacity).

| T (s) | share 0.5: capacity | share 0.3: capacity | share 0.25: capacity | share 0.125: capacity | seconds of income for 86 bits at share 0.25 | for 985 bits at share 0.25 |
|---|---|---|---|---|---|---|
| 5 | 160 | 96 | 80 | 40 | 5.4 | 61.6 |
| 15 | 480 | 288 | 240 | 120 | 5.4 | 61.6 |
| 30 | 960 | 576 | 480 | 240 | 5.4 | 61.6 |
| 60 | 1920 | 1152 | 960 | 480 | 5.4 | 61.6 |
| 120 | 3840 | 2304 | 1920 | 960 | 5.4 | 61.6 |
| 300 | 9600 | 5760 | 4800 | 2400 | 5.4 | 61.6 |

