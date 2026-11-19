# Status: the turnover board (line retirement), handed over 20 Nov 2026

Labels: **built** (merged and tested), **seen narrowly** (observed under the stated assumptions only), **guess**.
Times are UTC, as they appeared in the session (Melbourne is UTC+11).

## 1. What was asked (coordinator, 15 Nov)
- Build line turnover end to end, behind settings that are off by default, so that the owner's "yes" becomes a one-line
  preset change: a new line every N s, at most M live, the oldest retiring with its points banked.
- Source: `docs/engine-v2/retirement-design.md`. The evidence for it is the table simulation's `objectCap`
  (`docs/engine-v2/tug-of-war.md`).
- Checks the coordinator wanted before switching it on:
  - a both-ways test showing the table and the server agree;
  - an e2e scenario;
  - the energy gate and the dealer unaffected with turnover off;
  - a measurement: two-state cycles, rungs by third, how much of a seat's bits survive the next move by another seat,
    fairness, and the banked share of the total.

## 2. Merged and unmerged
- **#972 (built):** the server core.
  - Room settings: `liveCap`, `birthSeconds`, `retiredPoints` (`banked` | `dropped`), `retiredHolds` (default true, as
    the table models it). They are frozen into `settings.turnover`.
  - The commit retires the oldest line before a birth that would pass the cap, and at the start if the starting lines
    exceed it.
  - `v2Objects.retiredAt`, `v2Engine.live`, a `retired` event, drift skips retired lines.
  - Offers are drawn from the live lines. With no cap they are the old draws exactly (unit-tested).
  - `holdingRows` filters released states before any `take`.
- **#984 (built):** the configure page questions for those settings. #972 had turned develop's unit job red.
- **#1072 (built):**
  - Reads: `retired` sits after `memberId` in every per-player index of `v2ObjectValues` and `v2Knowledge`;
    `v2/play:banked`; `v2Objects.by_game_live`.
  - App: `panes/retired.tsx` (the note, the "new" mark, the retired list), the end page, the One-line note, and the
    replay fold of `retired` events.
  - e2e:site scenario, which passed.
  - It also carried, **untested by accident**, `scripts/turnover-measure.ts` (never run) and
    `test/v2-turnover-table.test.ts` (**fails**; see section 4).
- **Unmerged:** branch `feat/turnover-proof`, with no PR, holds a correction of the both-ways test (the game's own
  variant, and the engine's wire form). It still fails.
- No preset sets `turnover`, so turnover is off everywhere.

## 3. Unfinished plan, as next steps
1. Find where the birth walk diverges between the Convex runtime and Node (section 4), and fix it in `lib/v2-core` or
   `lib/v2-linear`.
2. Make `test/v2-turnover-table.test.ts` pass. It requires exact agreement on births, retirement order and times (to a
   tick), banked points, and totals, with seats that never move.
3. Run `scripts/turnover-measure.ts` (engine practice games, turnover on against today's settings), or run
   `lib/v2-agents/scripts/pool-dynamics.ts --cap N --births R --server` (the agents session's columns).
4. Write the results into `docs/engine-v2/tug-of-war.md`.
5. Then the owner decides; switching it on means setting `turnover` on a preset.

## 4. Obstacles and lessons
- **Seen narrowly; not explained:** `distinctBirths("line-q", seed, 3)` returns different states on the deployed local
  Convex backend than in Node, for the same seed. Each side is deterministic. The variant's mutator list and its
  `which` code are identical on both. If this holds generally, the table and the engine never share births, and
  re-computing a stored game outside Convex (replays, the table) diverges.
  - Guess: something in a mutator's argument sampling or `apply` depends on the runtime (floating-point library calls,
    module-level state).
  - How to continue: `walkStep` traces were being diffed step by step, `zzTrace` against Node, when the pause came.
- **Built:** develop moved the starting board to `bornAtStart` (at game start, in planning). The turnover start
  retirement lives there now. At the start, the first `tick` event may come before `phase`.
- **Tooling:**
  - The local dev backend fails to bundle after develop adds a workspace package: run `pnpm install`, then restart dev
    (`CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS=180` helped).
  - A conflict resolved with `git add -A` swept untracked files into a PR. Stage paths explicitly.
- **Built:** paid looks were kept. A retirement tells no one the final state for free. While live, the retired list
  says "about N points as you last saw it"; at the end it shows the exact banked figure.
- **Seen narrowly:** in `v2-settings`, `v2-log` and `v2-query-cost` (`bids:state` > 50 ms), the failures seen on
  15–16 Nov also failed on plain develop.
- **Known gaps (built as is):**
  - spectators get no retired list;
  - the scatter digest still counts retired lines, so the lines footer drops its total under turnover;
  - no backfill for rows retired before #1072 (dev test games only).

## 5. What the rebuild made obsolete (16–17 Nov: one-number utilities, energy as bits)
- **Guess:** the retirement mechanics are independent of how a line is scored: the cap, retiring the oldest, the live
  offers, the indexes, the UI.
- **Guess:** anything about "points banked" assumes points = own bits × others' bits, stored per value row. If totals
  are now computed differently, `retireLine`'s dropped-mode arithmetic and the "banked N points" wording need
  re-checking.
- **Guess:** the measurement's "rungs" counts the main-part score (`score[0]`). That is meaningless under one-number
  utilities and would need redefining.
- **Seen narrowly:** the motivating evidence (two-state cycling fell from 43% to 8% of late moves) came from the table
  with scripted Simple starters on the old rules. It is an existence result, not a property of the game, and it predates
  the rebuild.
