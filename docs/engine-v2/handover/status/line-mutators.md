# Status: the "line mutators" worker (session_0119hWTXBeuvDHog8aGeyHK9), as paused 16 Nov

Written from the session's own context only, with no new investigation. Labels: **built** (merged and tested), **seen narrowly**
(one script or test, with its assumptions), **guess**.

## 1. What I was asked to do (in order)
- Same on Both Rulers redesigns: palindrome ladder (#850, trial 33), then |c/(±1 − m)| without sign (#868, trial 34).
- Restore v1 behaviour the engine lacked: the commit clause (#874). Shelter was merged by mistake (#880) and reverted
  (#883); the coordinator ruled shelter and the futility memo not restored.
- Rival-inference reads (owner-decisions call 36): `game.boardAt` (#899), `rule.candidates` (#895), `rule.fit` (#922).
- Defence goals (call 1): grids only, off by default as in v1 (#945, #983).
- In-game parity rows taken over from W5: game details timings and end reason, and Who is here (#1040); the rotation
  line "you get X's rule" (#1051); Back to the previous view and Reset this pane (#1065).
- Last, unfinished: make Prime Landing and Same on Both Rulers keep most of their bits under a tilt of 1 (principle 11).

## 2. Merged and unmerged
- Merged into develop: #850, #868, #874, #883 (revert), #895, #899, #922, #945, #983, #1040, #1051, #1065.
- Unmerged: branch `claude/tilt-robust`, which holds only `lib/v2-agents/scripts/tilt-experiment.ts` (no PR).
  `claude/defence-goals`, `claude/defence-agents`, `claude/game-details`, `claude/play-again`, `claude/pane-back`,
  `claude/rival-fit`, `claude/board-at` and `claude/v1-shelter` are spent (merged or reverted).

## 3. Unfinished plan (concrete next steps, if the old scoring were still wanted)
1. Recast the dealt Prime Landing and Same on Both Rulers to the tuple shape (`lib/v2-linear/src/tuple-rules.ts`
   `landingTuple`, `rulersTuple`), with their pole fallbacks: a flat line reads |c| (#1029), and a line parallel to
   y = ±x reads |c| (#1056).
2. Measure the cheap-move share kept, and whether "make |X| big" becomes the hill, under the gravity (size) code. The
   branch for that, `claude/gravity-measure`, was never pushed.
3. Send the coordinator the walkthrough (card, three lines with values, each cheap move's effect) before anything is dealt.
4. Defence goals left over: an `excludedDefenceFamilies` question on the configure page. The server validates the field,
   but `room.settings` does not offer it (the description was at its 600-character limit).

## 4. Obstacles, and what the docs may not say
- **Seen narrowly** (tilt-experiment.ts; main part only, importance-sampled law, row 10's cheap moves, rung 2–3
  witnesses): off a rung both families scored below every rung, so the worst cheap move kept about 10–13%. Grading off-rung
  lines by the size of the rung nearby (one digit's worth below it; on a log scale for palindromes) lifted the median
  to 75–100%. The price: a rung's premium shrinks and "make |X| big" becomes the main hill.
- **Built:** readings that divide by the gradient have poles. About 1 cheap move in 8 from cheap witnesses lands on a
  flat or parallel line, which scores nothing, so it needs a fallback reading rather than a grading fix.
- **Seen narrowly:** fit of rival rules (collapse-check, β 0.05). On lines at σ 8, identification needed a median of
  1,284 probes; on grids, 40 of 40 cases were unidentified, and grid test 2 failed. Hence `rule.fit` refuses everything
  but lines at noise variance ≥ 64.
- **Built:** defence goals use v1's signed bits n = s⁺ − w·(η(h) − E_π η(h)) and the floored payoff own × max(0, others).
  `meanHinge` ignores the value tail past the last knot (badness ≤ 16 cells, so the effect is small, but unmeasured).
- Tooling:
  - The local backend refuses a branch whose schema lacks fields that rows written by another branch hold. Switching
    branches against one local deployment needs those branches merged first, or a fresh backend.
  - A failed bundle, for example a new workspace package not yet linked, leaves the backend serving stale code: run
    `pnpm install --offline` and restart `pnpm --filter @workspace/engine dev`.
  - `guest.gen.ts` conflicts on every merge: take either side, then rerun `node lib/v2-sandbox/scripts/gen-guest.mjs`.
  - `values.gen.ts` conflicts the same way: rerun `gen-v2-values.mjs`.
  - Op mutations throw `ConvexError` on `OpFailure` (tests use `assert.rejects`); actions return `{ok: false}`.
  - The `room.settings` description is capped at 600 characters (lib/v2-affordances parity.ts LIMITS).
- **Seen narrowly:** the query-cost gate failed locally on `v2/bids:state` at 74–75 ms against its 50 ms limit, on every
  run on 16 Nov. That code is not mine, and the cause is unknown.

## 5. Obsolete since the scoring rebuild (16–17 Nov)
- **Guess:** everything that leans on ordered score tuples, tie-breakers and the old value functions is obsolete under
  one-number utilities (decision 50): the palindrome and prime-landing ladders as dealt, the tie-breaker designs,
  `tilt-experiment.ts`, the rule-check rows 3a and 10 as applied, and the defence goals' badness-to-bits maths
  (`lib/v2-valuation/src/defence.ts`, `penaltyBitsOf`).
- **Guess:** these probably still stand, because they do not depend on how a value is computed:
  - the app and UI ports: game details, Who is here, the rotation line, pane history;
  - the commit clause's plumbing;
  - `game.boardAt` and `rule.candidates`.
  `rule.fit` survives only if its likelihood is recomputed on the new utilities.
