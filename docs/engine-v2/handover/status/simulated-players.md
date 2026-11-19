# Status: simulated players that play to win (competitive play)

Worker session, 16 Nov 2026 (about 11:00–13:00 Melbourne time), paused by the owner on 16 Nov and archived on 20 Nov.
Labels: **built** (in code, tested), **seen narrowly** (measured in a few scripted tables: an existence proof, not a
property of the game), **guess**.

## 1. What I was asked to do

The owner asked: do grids get vandalised by competing players, or did we only simulate naive ones? My task was to
build measurement agents that play to win, never shipped. Then:

- measure them on lines-beginner and grids-beginner: holds, damage against repair, who wins, cycles, tops;
- measure the levers: the turnover board, pricing (c′), tree-shape rules, and later locks;
- say whether the results are a reason to restore hold rarity.

## 2. Merged and unmerged

- Merged into develop:
  - **#1038**: the agents (`lib/v2-agents/scripts/competitive-agents.ts`), the runner (`scripts/competitive.ts`), the
    knock breakdown (`scripts/knock-phi.ts`), `TableInput.playerTurns` in `src/table.ts`, the tests
    (`test/competitive.test.ts`) and `docs/engine-v2/competitive-play.md`.
  - **#1085**: the doc's paused status and a re-run command for every table.
- Unmerged: branch `claude/competitive-play-2` (no PR) adds `--pool rules.json` to `competitive.ts`, to seat rules no
  preset deals (three distinct families a game). Rules without committed value files need them generated
  (`lineValueFunction`) first.

## 3. Plan not executed (next steps, if the question is still alive)

1. On any new scoring or costing design, run `knock-phi.ts` first:
   - the share of knocks that keep energy (|Δφ| < 1);
   - undo − knock;
   - the share of high states above their one-step neighbours in energy.
2. Then run the best-reply rows (`naive,mixed,mixed`, `defender,mixed,mixed`) and `mixed,naive,naive`.
3. Tree and tuple rules (starters since #1060): 6 rows were started with `--pool` and stopped unfinished.
4. Size-only gravity (`claude/gravity-measure`, never pushed while I ran): the same rows plus the knock breakdown.
5. Locks: the agents session was to add them to `runTable` with locker, drainer and cooperating-pair seats. Then
   measure:
   - lock against no lock: the bits surviving the next move, energy spent by each side, standings;
   - whether locks freeze boards;
   - whether one locked state is enough to do well (a bug).

   Then tell the locks session which creation and upkeep constants make defence neither free nor pointless.

## 4. Obstacles and things learned that the docs may not say

- **Built.** Competitive agents are source transforms of the Simple starter: the regex replaces
  `return climb(offer, options, score(...), QUOTES);`. Any starter without that line, such as the tuple starters,
  needs checking.
- **Built.** Grid starters try only ±1 steps. A ±1 step barely dents a high grid board, so a knocker needs far moves:
  cell ±2..±9 and row or column ±2.
- **Built.** The host call cap is 64 an act. `othersAfter` is a priced read and a host call, and so is `rarity`, so a
  defender's neighbour check is limited to a few candidates.
- **Built.** An agent must return a list of calls: a bare move fails with "agent must return a list of calls".
- **Built.** Changing a numeric literal in a program can cost 0 at the edit price when the replace is a no-op. Check
  that the rewrite actually changed the source.
- **Built.** A grid score's parts are exact fractions `{n, d}`, not numbers. `Number(part)` is NaN, which first made
  the "tops reached" measure read 0%.
- **Built.** On grid4 the law's code length is φ = 0.5 · (sum of cells) + const. So swaps and ±1 trades keep φ, and
  every grid pattern rule is orthogonal to φ.
- **Seen narrowly.** 94–95% of grid knocks and about a third of line knocks keep φ, and those cost the same to undo
  as to make. The price asymmetry exists only for knocks that lower φ.
- **Seen narrowly.** "Mixed" (build, and knock when a rival's loss per energy beats building) beat naive starters
  58% (lines) and 67% (grids). On lines it was also the best reply to itself among 4 scripted kinds; on grids the kinds
  cycled. All-mixed tables lost 36% (lines) and 72% (grids) of points. This says nothing about strategies I did not
  script.
- **Tooling.**
  - About 30–60 s per 600 s game. Four parallel processes on 4 cores is the limit.
  - Merging develop mid-run needs `pnpm install` (new workspace packages).
  - Background runs survive turns, but a locally patched core file trips the stop hook; I used
    `git update-index --assume-unchanged` and restored the file after the run.

## 5. Obsolete since the 16–17 Nov rebuild (one-number utilities, energy as bits of surprise)

- **Guess.** All the numbers are obsolete. They used ordered score tuples with tie-breakers, value files from the old
  calibration, the grid4 cell-sum law, and the beginner pools as dealt on 16 Nov.
- **Guess.** The method should survive where the agent API still offers `worth`, `othersAfter` and prices:
  - knock against Δenergy, with exact-undo pricing;
  - one competitive seat among naive seats, and best replies;
  - the same seeds in every row.
- **Guess.** `compete`'s rivals estimate (n·S + S²(1 − 1/R)) assumes points = own bits × the others' sum. If the
  points formula changed, rewrite it.
- **Guess.** The structural lesson still applies to any design: a cost asymmetry protects a high score only if the
  energy measure rises with what the rules score.
