# Integration pass: handover (2026-11-13)

## 0. State on 2026-11-14 (third session): read this first

Merged into `develop`: #326 (rotated deal, harness, evidence), #335 (practice partner, rotation on the room page and
results), plus the docs PR this section came in. Sections 1 to 7 below are the second session's and are kept for their
numbers; where they conflict with this one, this one is current.

- **Balance (stage 4): decided.** No single-game fix exists among scaling, pool choice or deal choice (numbers:
  docs/rule-difficulty.md §9, docs/beginner-pool.md §6). Shipped: a room playing again with the same players passes the
  rules one seat along until everyone has held each (`artifacts/engine/convex/lib/dealRotation.ts`); the room page and
  the results say whose rule comes next and add up the rotation. Scoring unchanged; options for the owner in
  docs/rule-difficulty.md §9.
- **Practice opponents: done.** Practice games seat the built-in Practice partner (no model), which summons its
  rule's example agent (docs/beginner-pool.md §7). AI seats, this one included, are still admin-only.
- **Saturation: none** (docs/beginner-pool.md §8). No parameter changed.
- **Spoiling:** unchanged by the rotation; the smallest principled change is #295 at ×3, which suits the default
  setup's exact sums (docs/coordination-incentives.md §9). Not shipped (a scoring decision).
- **Integration:** Deploy runs on `develop` green for #317 to #326 (#335 was running at the time of writing);
  `mcp.test.ts` fixed (18/18); `test:auth` 19/19; `e2e:account` 8/8; 20-game load check: 20/20 started, late p50
  1.3 s / max 2.1 s, 0 restarts. The 895-before-1,007 leaderboard: the public scoreboard publishes every 10 world
  seconds (`scoreIntervalSeconds`) and the final is published exactly at the end; by design, not a bug.
- **Not done:** a browser look at the rotation line and the practice partner on the page; `e2e:panels`; the assistant
  live suite (needs a provider key); full `test:game`; the model against engine games under #320.

Written for a successor who has not seen the session. Branch: `claude/integration-pass` (from `develop` at 06a598c1).
The brief: prove the combined `develop` works after a day of merges, fix what does not, tune the beginner defaults
with evidence. Stages 1 to 3 are done; stage 4 (balance) is measured but **not fixed**; stages 5 and 6 are not started.

## 1. Done

| What | Where |
|---|---|
| CI gate on `develop` was red (run 261). `unit (rest)`: 22 engine unit tests need the Python runtime bundle that job never built (fixed by #315; #317 adds `CG_REQUIRE_PYTHON_RUNTIME=1` so `language-price.test.ts` fails there instead of skipping). `unit (5/8, 6/8, 8/8)` hit 20 minutes: `calibration.test.ts` rebuilt the 10 to 30 s hybrid law of each of 49 tiered draws in every shard holding a 4×4 digit file; each law is now checked once across shards (shard 5: 174 s locally) | PR #317, merged |
| Real failure in `test:game` (1 deal in 5): the assistant's writing-agents skill passed its 20,000-character limit and cut the end of the player's own rule source. Helper lists now give way | #317 |
| Engine tests on the real tick: debt moves from a god to an agent with its power; agent-count neutrality with agents acting on credit | #317 (`test/game-power.test.ts`, `test/game-energy.test.ts`) |
| The summon diagnostic prints TypeScript's structure bits as charged | #317 |
| Room details list shows "Looking at the world" | #317 |
| `coordination-programs/README.md` re-measured (TypeScript 1 to 5% dearer than Python; startingEnergy 600) | #317 |
| Browser script for the debt sentences and estimate against charge (`e2e/debt-shots.ts`; its test ids predate the "overdrawn" rewording and may need updating) | #317 |
| Harness: coordination model on the final economy (distance pricing from the setup, debt bound, mean rank, mode `rules`, `--pool`, `--equal-tops`), with unit tests | this branch, not merged |
| Walk scripts `e2e/beginner-walk.ts`, `e2e/three-humans-walk.ts` | this branch, not merged |
| Evidence: `docs/beginner-pool.md` §5, `docs/coordination-incentives.md` §4a, raw tables `docs/balance-results-2026-11-13/` | this branch, not merged |

Suites on `develop` c13b910f, fresh engine and database (stage 1): root typecheck pass; `test:offline:rest` 10 suites
pass; `calibrate --check` pass; game-runtime 54/54; `test:game` 190/191 (the skill bug above; the file passed 7 times
after the fix); `test:mcp` 18/18; `e2e:site` 30/30. `game-paid-observation` passed in the full run and in 3 isolated
runs: no flake reproduced. The unsharded `game-utilities` suite does not finish in 30 minutes locally (the hybrid
laws): rely on CI's 8 shards.

Browser, read at 1440×900 and 390×844: debt sentences (destroy confirmation, share preview, "You owe"); the popover
clearance lets a click through to Look; the popover stays in the viewport (develop's own cap is the one that
shipped); summon estimate 7.35 against 7.35 charged per act.

Whole games (stage 3, default setup, fresh engine):

- Practice game, admin and two mock AI seats: never meets the bid phase; first scoring move 65 s after creating the
  room (60 s is the planning countdown; the owner can press "Start the world now"); the example agent, summoned once
  and left alone, finished 1st of 3 (8,068 / 7,087 / 2,138 and, on an earlier run, also 1st). Results and replay open.
- Three humans (alice, bob, carol), each pressing only "Summon my first agent": first scoring moves at 81 s; final
  31,626 / 29,909 / 23,740 for Mirrormancer / Spread of Three / Magic Eighteen.
- Bug seen, handed to the first-five-minutes lead: one query timeout (`dock:state`, caused by this machine's load)
  blanked a player's whole page ("This view failed") for the rest of the game.

## 2. Stage 4 numbers

Model: `lib/game-utilities/scripts/coordination.ts` (real rules, shipped tables with hold rarity, game-core energy).
Economy: Annotated basics as shipped on 13 Nov before #320: distance pricing, 600 starting energy, 30 s store, read
price 1/32, offers charged, debt bound, score noise 0, 300 s, one agent per god, programs paid for (`--summon`).
Observation mode does not enter the model (agents read the board either way). **Not** measured with #320's
"energy moves with power" (the model has no re-allocation, so it should not matter) or with the 75% first-agent share.

**Win share by dealt rule**, every god playing the same policy. Cell: win share / mean rank. 3 players: 600 games per
policy (each rule dealt about 225 times, ±3 points). 4 players: 600 games greedy, 300 considerate and deny.

| Rule | top bits in a 3-player game | 3p greedy | 3p considerate | 3p deny | 4p greedy | 4p considerate | 4p deny |
|---|---|---|---|---|---|---|---|
| Opposite Nines | 32.9 | 83% / 1.19 | 72% / 1.29 | 87% / 1.14 | 44% / 1.89 | 59% / 1.46 | 65% / 1.56 |
| Mirrormancer | 33.0 | 68% / 1.35 | 11% / 2.50 | 24% / 2.27 | 52% / 1.69 | 1% / 3.66 | 9% / 2.96 |
| Leapfrog | 25.0 | 24% / 2.02 | 9% / 2.43 | 34% / 1.87 | 13% / 2.59 | 1% / 3.23 | 19% / 2.67 |
| Spread of Three | 27.3 | 23% / 2.03 | 28% / 1.96 | 25% / 2.04 | 44% / 1.88 | 28% / 2.04 | 38% / 2.02 |
| Two Pair | 27.0 | 23% / 1.96 | 22% / 2.26 | 23% / 2.23 | 16% / 2.59 | 7% / 3.02 | 8% / 2.94 |
| Crosswise Threes | 19.8 | 21% / 2.43 | 15% / 2.11 | 21% / 2.26 | 17% / 2.89 | 10% / 2.38 | 22% / 2.41 |
| Strangers | 25.4 | 20% / 2.18 | 9% / 2.47 | 27% / 2.20 | 13% / 2.80 | 4% / 2.85 | 32% / 2.40 |
| Magic Eighteen | 20.6 | 1% / 2.88 | 93% / 1.07 | 22% / 2.08 | 1% / 3.68 | 92% / 1.08 | 18% / 2.77 |

Own bits per object at the end, 3p greedy: Mirrormancer 19.5, Opposite Nines 18.0, Two Pair 15.5, Leapfrog 14.9,
Spread of Three 14.1, Strangers 13.1, Crosswise Threes 11.0, Magic Eighteen 9.7 (each 47 to 59% of its top). Points
against the table's mean run only from 0.78 to 1.34 in every table.

**Spoiler against careful play** (3 players, 24 games per table, ±10 points; considerate rows 48 games):

- One `deny` among two cooperators: wins 88%, mean rank 1.13. Among two `payoff`: 79%, rank 1.21. Among two greedy:
  46%, rank 1.63. Among two considerate: 100% of 48, with 19,455 points against 10,029 at the all-considerate table.
- Considerate wins 0% as the one careful god at a greedy or spoiling table. A greedy god at a considerate table: 100%.
- Equilibrium by win share: greedy, greedy, deny (unchanged). By points: greedy, payoff, payoff (unchanged).
- Welfare: payoff ×3 100,663; cooperator ×3 70,925; greedy ×3 61,450; considerate ×3 31,136; deny ×3 11,592.
- 4 players: deny among three cooperators 92% (rank 1.08); among three payoff 54%; among three greedy 29%.
- The debt bound and flat pricing do not change the order (`unbounded-debt`, `flat` sections).

**Practice opponents.** Only the two browser games above (the example agent alone finished 1st both times, as the
persona walks reported). No model run: the mock AI seats' policy is not in the model. Not done.

**Saturation.** Not measured. Indications only: in the practice game at 1:06 of 5:00 the player's top two objects
were already at the rule's top (24.3 bits of 24.3); in the three-human game the best boards were at the top of all
three rules. Model figure: under all-greedy play rules hold 47 to 59% of their top per object at 300 s (objects keep
spawning at 0.1 Hz, so the average never saturates even when the oldest boards have).

## 3. Diagnosis: why the dealt rule decides the game

Points on an object are own bits × the sum of the others' bits. At one table the totals are therefore close (within
about ±20%), and between two players the difference on an object is (the third player's bits) × (a − b): whoever's
rule holds more bits is ahead on every object. So a small systematic edge in own bits wins nearly every game, and the
edge is a property of the rule and of how the table plays:

- under greedy, the rules with the highest tops hold the most bits;
- under considerate play, the rule whose moves least often lower another rule's bits (Magic Eighteen) keeps moving
  while the others are blocked;
- under spoiling, Opposite Nines.

Win share is a knife-edge measure here; points are not far apart. Any fix has to remove a systematic edge of a few
percent, for every way of playing.

## 4. Fixes: what was measured, what I would choose

Measured, 3 players, 300 games per policy (lowest to highest win share by rule):

| Change | greedy | considerate | deny | Verdict |
|---|---|---|---|---|
| As shipped | 1 to 83% | 9 to 93% | 21 to 87% | |
| (a) every rule scaled so its top is 26 bits (`--equal-tops 26`) | 15 to 63% | 4 to 96% | 1 to 68% | rejected: moves the win to Crosswise Threes and Leapfrog; Mirrormancer 1% under deny |
| (c′) drop Opposite Nines, Mirrormancer, Magic Eighteen (`--pool leapfrog,spread_three,two_pair,crosswise_threes,strangers`) | 9 to 52% | 10 to 60% | 22 to 50% | rejected: Spread of Three wins under every policy; five rules is fewer than the owner asked for |

Not measured: (b) narrowing dealt parameter values (the eight rules have one or two dealt variants each, so there is
little to narrow); swapping in `SYMMETRIC_POOL` candidates.

**No fix is verified, and nothing was shipped.** What the two experiments show is that no per-rule constant and no
subset of this pool levels win share for all three policies, because the edge depends on the policy.

What I would do, in this order:

1. **Measure "equal par" before anything else.** Scale each rule by the bits it holds under reference greedy play
   (the par figures above: 19.5, 18.0, 15.5, 14.9, 14.1, 13.1, 11.0, 9.7), not by its top. This is the one
   normalisation that targets the measured edge directly, and it is one constant per calibration table, computed
   offline like the tables. Add `--equal-par` beside `--equal-tops` in `gameRule` (scale = B ÷ par). Accept it only if
   greedy and deny come within about 1.5× and considerate within about 2×. I expect greedy to level and Magic
   Eighteen to stay far ahead under considerate play.
2. **If Magic Eighteen stays extreme under considerate play, replace it** (it is the outlier in two different
   directions: 1% greedy, 93% considerate) with a `SYMMETRIC_POOL` candidate and re-measure with `--pool`.
3. **If no scale works, change the deal, not the score:** deal each player in a room a rule they have not yet held
   until all have gone round (fair over a room's games, no change to scoring or to any rule). Unmeasured; it needs
   nothing but the dealer.
4. The bid phase is the only mechanism in the repository already measured to level the pool (docs/bid-phase.md §3:
   44 points of spread to 9 among truthful bidders). It is off on the default setup because nobody knows how
   beginners take to it. It is the fallback if 1 to 3 fail.

Anything in 1 or 2 changes scoring or the pool for existing setups: report numbers to the coordinator before merging.

## 5. What remains, in order

Local engine first: `pnpm --filter @workspace/engine dev` (wait for `[dev] READY`), then
`pnpm --filter @workspace/engine run deploy-static`.

1. Merge this branch's harness, scripts and docs: `pnpm --filter @workspace/game-utilities typecheck`,
   `node --experimental-strip-types --test lib/game-utilities/test/coordination.test.ts` (13 pass), root
   `pnpm run typecheck`, then a PR into `develop`. Docs and scripts only; no engine suite needed.
2. Check the Deploy run on `develop` after #317 is green in every `unit` shard (the calibration split was timed on
   one shard only, locally).
3. Stage 4 fix, as §4. Commands (about 1 s per game and core for greedy, 3 to 5 s for considerate and deny):
   `pnpm --filter @workspace/game-utilities coordination rules --players 3 --games 300 --summon --set greedy,considerate,deny [--equal-tops 26 | --pool a,b,c]`
4. Practice opponents: measure the example agent alone against the mock AI seats over many games
   (`artifacts/engine/scripts/coordination-games.ts` plays real engine games; the mock seats are in
   `artifacts/engine/convex/ai/`), then choose opponents among existing agents so that the example finishes mid-table.
5. Saturation: add to the model's `GameResult` the share of objects at each god's top over time, and run
   `coordination tables --tables greedy,greedy,greedy --duration 300` against `--duration 150`, `--objects 20`,
   `--spawn 0.3`.
6. The leaderboard that showed 895 one second before a final of 1,007 on the beginner setup: not looked at.
7. Stage 5 load check, alone on the machine:
   `pnpm --filter @workspace/engine load -- --games 20 --ai 2 --seconds 90` (branch numbers: 3 s late, 0 restarts,
   0 failed summons).
8. Once each on current `develop`: `pnpm --filter @workspace/engine test:auth` (stop the dev engine first),
   `pnpm --filter @workspace/player-web e2e:account`, `pnpm --filter @workspace/player-web e2e` (commit first; 20
   minutes), `e2e:panels` (21/22 since #313, known), and a browser look at #318 `replace` and #320.
9. Full `test:game`, `test:mcp`, `e2e:site` again on the final tree (develop has moved a long way since c13b910f),
   then the final report (state of develop, defaults changed, judgment calls, open list).

## 6. Local-engine gotchas met

- A fresh database: stop everything (`pkill -f scripts/dev.mjs; pkill -f convex/bin/main.js; pkill -f
  convex-local-backend; pkill -f local.cjs`), `rm -rf artifacts/engine/.convex/local`, start again. A leftover
  `local.cjs` executor survives a restart otherwise.
- The engine stops at two hours; restart it before a long suite. `test:game` takes 31 minutes.
- A long-running engine keeps the setups and calibration tables it was seeded with: after merging `develop`, restart
  it (the first walk ran on a stale paid-observation default).
- It does not redeploy when only a `lib/` package changes: touch a file under `artifacts/engine/convex/`.
- `convex dev` wedges on a conflict marker: restart after a conflicted merge.
- Never run a model sweep or a second browser walk beside a browser game on 4 cores: queries pass their 1 s limit and
  a page dies. Engine live tests end every game on the engine, so do not run them during a walk.
- `pkill -f <pattern>` inside a command line that contains the pattern kills the shell running it.
- The node test runner prints a file's results only when the file ends; use
  `--test-reporter=tap --test-reporter-destination=FILE` to time a slow file.
- The clock in this container runs behind expectation; trust `date`, not a sense of elapsed time.
- CI runs only on pushes to `develop` and `main`, never on a pull request.

## 7. Unverified

- That every `unit` shard is green on `develop` after #317.
- `test:auth`, `e2e:account`, the multi-client e2e, `e2e:panels`: not run by me.
- Everything merged after c13b910f except what my own PR touched (#310 to #320): no full live suite on it.
- The popover opening upward (only the downward case was measured after the cap).
- The model against real engine games on the final economy (`coordination validate` uses games recorded under the
  4 Hz cap).
- Stage 4 under #320 and under a 75% first-agent share.
