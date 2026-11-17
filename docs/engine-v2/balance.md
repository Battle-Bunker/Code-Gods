# Balance of Lines · beginner under the 17 November law (simulated play)

Labels: **by construction**, **seen narrowly** (with its assumptions), **guess**. Times in Melbourne time unless UTC is said.

## The harness

`lib/v2-linear/scripts/balance-sim.ts` plays a whole Lines · beginner game headless on the engine's own code:

- the turn law (`applyCalls` over the lens mutators: naming bits plus the turn's surprise);
- the estimator (`estimateLine`), re-estimating every seat on a line at each commit, as the server does;
- the economy's selection (`opportunities`, `pickByEnergy`, `affordable`/`actCredit`);
- the dealt pool (`dealt.ts`), births every 240 s, and 600 world seconds.

It logs, per seat: turns, bits, energy and points every 30 s, and share of turns by lens and by move. It logs every commit with its bits, the own and others' energy change, and the change in line size.

`balance-jitter.ts` re-reads finished standings at several start counts K.

**Assumptions** (they limit every result below):
- Four seats, distinct rules.
- One agent per seat, with ¾ of the power and an empty balance at the start.
- Reads cost 16 bits ÷ κ an act; no locks, drift or bidding.
- The practice partners are the harness's, not the app's starters:
  - **greedy:** best Δutility per bit, in its rule's own lens;
  - **hopper:** the same, in all six lenses;
  - **saver:** waits for 60 bits, then takes multi-mutation turns or the rule's candidates;
  - **knocker:** chooses on points against the leader, with energies at K = 4.
- Two seeds per setting.

## What changed during the day (17 Nov, UTC)

1. **Old law** (gravity 1, a holding constant):
   - lines ran to 40–500-bit numbers within a game;
   - past 10^10 several rules read NaN, so a cheap ×10 zeroed a rival's energy;
   - single 8–80-bit turns added 1,000–96,000 energy.

   Seen narrowly, 25 games.
2. **#1198: a cap on a, b, c.** Later removed by the owner as "a hidden bug bomb" (#1205).
3. **#1203: gravity as the uphill toll.** Surprise is Σ path²/(2 ln 2) + (λ/2)·s, never below 0 for a turn; beginner gravity 20.
4. **#1206, #1210: every dealt rule exact at any size.** The nearest prime with a digit suffix takes 0.1–1.3 ms up to 10^40, so no table is needed. #1209 added the estimator's work budget.
5. **The pump returned once the rules were exact.**
   - At gravity 20, lines reached up to 283 bits; at gravity 10, up to 1,330.
   - On big lines Hensel, Whole Stair and Bearing turns gained 2–11 times the energy they cost.
   - The coordinator traced most of it to the work budget being one pool per estimate (later starts fell back to the direct price, which reads big lines as rare), fixed in #1218, and to candidates that missed one-number routes, fixed in #1222.

## The runaway check, before and after #1218 and #1222 (seen narrowly)

Same seeds and income 3. "Before" is 600 s games; "after" is 300 s games, because a 600 s game hung on #1218.

| Gravity | End size, median / max bits | Lines ≥ 64 bits | Own Δenergy per bit spent on big lines |
|---|---|---|---|
| 20, before | 34 / 283 | 4 of 10 | Whole Stair 3.8, Bearing 2.4, Hensel 2.2, Ring 1.3, Archimedes 0.8 |
| 20, after | 18 / 25 | 0 of 8 | (no big lines) |
| 10, before | 11 / 1,330 | 4 of 10 | Hensel 11.0, Bearing 6.6, Whole Stair 3.2, Archimedes 2.6 |
| 10, after | 20 / 103 | 1 of 8 | Archimedes 3.0, Bearing 2.3, Hensel 0.6, Whole Stair 0.5 |

## The sweep at the current law (after #1222; seen narrowly, 600 s, 2 seeds)

| Gravity | Income (bits/s) | Store (s) | Agent start | Turns/seat | Median turn bits | First turn, s (median / slowest seat) | End size, bits (median / max) | Turns up / down | Own ΔE per bit (median) | Turns gaining more than they cost | Lines moving in the last 120 s | Leader changes per game | End utility per seat·line (median / p90 / max) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 15 | 1.5 | 240 | 0 | 36 | 11.7 | 0 / 600 | 6 / 33 | 29% / 21% | 0.42 | 16% | 10/10 | 10 | 0.0 / 9.7 / 31 |
| 15 | 3 | 240 | 0 | 69 | 11.7 | 0 / 59 | 16 / 106 | 30% / 18% | 0.48 | 23% | 10/10 | 11 | 0.2 / 8.8 / 104 |
| 20 | 1.5 | 240 | 0 | 36 | 11.5 | 0 / 600 | 8 / 43 | 28% / 19% | 0.47 | 17% | 10/10 | 12 | −0.3 / 8.8 / 18 |
| 20 | 3 | 240 | 0 | 75 | 11.3 | 0 / 60 | 6 / 115 | 27% / 20% | 0.40 | 23% | 10/10 | 12.5 | 0.0 / 5.6 / 13 |
| 20 | 3 | 60 | 0 | the same as store 240 (the store never binds) | | | | | | | | | |
| 20 | 3 | 240 | 50 | 80 | 11.7 | 0 / 5 | 8 / 32 | 26% / 20% | 0.49 | 21% | 10/10 | 9 | 0.3 / 8.0 / 16 |
| 20 | 3 | 240 | 150 | 83 | 11.5 | 0 / 2 | 6 / 651 | 27% / 20% | 0.50 | 22% | 10/10 | 11.5 | 0.0 / 6.6 / 30 |

At income 6, all four games ran past a 12-minute cap and none finished. Estimates got slow, which suggests lines grew large. This is not measured further.

**Approaches** (mean rank, 1 best, 10 games):

| Approach | Mean rank |
|---|---|
| knocker | 1.8 |
| greedy | 2.6 |
| saver | 2.7 |
| hopper | 2.9 |

**End utility by rule** (gravity 20, income 3):

| Rule | Median | Max |
|---|---|---|
| Hensel | 5.6 | 5.6 |
| Archimedes | 2.0 | 9.2 |
| Whole Stair | 1.2 | 12.7 |
| Ring | −0.1 | 4.2 |
| Bearing | −1.8 | 5.4 |
| Prime Balance | −5.1 | −2.0 |
| Stepping Coefficients | −56 | −14 |

## The two questions from the owner's evening

- **How long until each seat can afford a first useful turn (gravity 20)?** Seen narrowly: at once for the climbers. An agent is offered a line as soon as its balance is positive (the first second). A typical turn costs about 11–12 bits, and `affordable` lets it go into debt up to its store's capacity. Only the saver waits, by design, about 60 s for 60 bits. So in the harness the economy does not explain a 60 s wait for a first move.

  Guess: the app's starters save until they hold 10 s of income, about 22 bits at 2.25 a second, which is about 10 s, not 60. The browser test's wait more likely comes from the sandbox, the estimate time, or the offer schedule. A starting balance for agents shortens only the saver's wait (agent start 50: slowest first turn 5 s).

  **Recommendation:** do not raise starting energy for this; find the 60 s in the app.
- **Which gravity gives climbs into the middle of the ladders without runaway?** Seen narrowly: none of 15 or 20 does with these partners. The median end utility per seat·line is about 0 at both, p90 6–10, against ladder middles of about 12–16 (`energy.md` ladders).
  - Gravity 15 reaches more (one 104) but also grows lines (max 106 bits).
  - Gravity 10 before the estimator fixes ran away; after them, one line of 103 bits in 300 s.

  The partners climb one mutation at a time and rarely find the multi-number routes a rung needs. That is a limit of the bots as much as of gravity.

  **Recommendation:** keep gravity 20 tonight; trial 15 when the estimator's time on big lines is bounded (see 1 below).

## Jitter and the start count (seen narrowly: four 300 s games, 12 re-readings each, reference K = 48)

| K | Swap rate, all pairs | Swap rate, pairs within 20% | Median relative sd of a seat's points | Estimate ms (median, p95; Node) |
|---|---|---|---|---|
| 4 | 12.5% | 32% | 23% | 4, 71 |
| 8 | 9.3% | 28% | 23% | 8, 156 |
| 12 | 10.8% | 32% | 13% | 13, 224 |
| 16 | 6.8% | 21% | 8% | 15, 287 |
| 24 | 7.6% | 23% | 14% | 24, 423 |

Close seats swap places on noise in about a fifth to a third of readings at any K tried. More starts helps little and the tail time grows with K. A commit estimates every seat, so at the p95 a four-seat commit at K = 12 is about 0.9 s in Node, already past the server's 600 ms gate.

**Recommendation:** keep K = 12. Bound the estimate's time, not its starts: the work budget counts scored states, but route pricing on big numbers dominates the tail.

How this could be wrong: four games, eight close pairs.

## Settings

No change recommended to the beginner configuration tonight. Gravity 20, income 3 and the 240 s store stay; the store never binds. Starting energy and K = 12 stay too.

## The three things most likely to make a real game feel broken or dull (ranked)

1. **Size still pays, and big lines are slow.** Evidence:
   - after #1218 and #1222, one line in 300 s at gravity 10 reached 103 bits;
   - one game at gravity 20 with agent start 150 grew a line to 651 bits;
   - Archimedes and Bearing turns on big lines gained 2–3 times their cost;
   - estimates on such lines reach 0.2–0.4 s each in Node, and all four income-6 games ran past 12 minutes.

   The structural cause (guess): from a same-size start, naming a specific big target costs about its bits, so the measure reads big structured lines as rare. Gravity's toll is λ/2 bits per bit of size per number. Where a rule's energy rises faster than that per bit of size, growing pays.

   How it could be wrong: the remaining cases are single lines on single seeds, and the harness's bots take many cheap ×k turns a human would not.
2. **Little visible climbing.**
   - The median seat ends a game at about 0 utility on each line, and the ladders' middles are rarely reached.
   - Stepping Coefficients (median −56) and Prime Balance (−5) are not climbed at all by one-step partners.
   - Most turns (about 50%) change size by nothing or little, and only about 20% gain more energy than they cost.

   How it could be wrong: these are the harness's partners, not people or the app's starters; a person can plan a multi-number turn.
3. **Standings near the top are noise, and knocking leads.**
   - Close seats swap on estimate noise in 20–32% of readings, and the leader changes about every 50 s.
   - The knocker (points against the leader) ranks best (1.8 of 4).
   - The saver ranks last: holding energy draws offers (selection by balance), and each skipped offer costs its reads.

   How it could be wrong: 10 games; the knocker also climbs when climbing pays, so its lead is not purely from knocks.
