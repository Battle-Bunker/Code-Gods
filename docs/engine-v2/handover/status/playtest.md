# Status: the independent playtester (handover, 20 Nov)

Written from the playtester session's own context only, with no new investigation. Every claim carries a label:
- **built**: merged or done;
- **seen narrowly**: seen once, in one setup;
- **guess**: not verified.

## 1. What I was asked to do

- **Rounds.** Play the app by hand in a real browser, using Playwright on a local engine built from the tip of
  `develop`, at 1440 px and 390 px. Write each round to `docs/playtest/round-N.md`, with screenshots in
  `docs/screenshots/playtest/round-N/`. Merge only my own docs PRs, then message the owning sessions and the
  coordinator.
- **Dynamics in every round.** Did objects keep moving, did the board converge, did one strategy dominate?
- **From 15 Nov, a full new-player pass.** The coordinator added: sign-in, lobby, settings, every pane, the goal card,
  summon and edit, What if, the feed, chat, pause, the end page, replay, rematch, and grids.
- **From 16 Nov, the side-by-side baseline.** Play the old app (`archive/engine-v1`) beside develop on the same grid
  game, and give the annotation system its own pass.

## 2. Merged and unmerged

- **Merged (built), all docs only:**

  | Round or note | PR |
  |---|---|
  | Round 21 | #784 |
  | Round 22 | #788 |
  | Round 23 | #791, #796 |
  | Round 24 | #803 |
  | Round 25 | #814 |
  | Round 26 | #819, #831 |
  | Round 27 | #834 |
  | Round 28 | #844 |
  | Round 29 | #848 |
  | Round 30 | #854 |
  | Round 31 | #857 |
  | Round 32 | #861 |
  | Round 33 | #877 |
  | Round 34, the first full pass | #943 |
  | Baseline 1, grids old against new | #964 |
  | Baseline 2, annotations | #969 |
  | Baseline 3 | #1067 |

- **Unmerged:** none, apart from this note's branch `claude/status-playtest`, which has no PR.
- **Leftovers (built):**
  - The worktree `/home/user/cg-v1` (old app, read-only checkout) existed in the container.
  - Scheduled tasks `trig_01MUxsCCCZLG9961GBon1xd6`, `trig_01JVR8ftMufSjFCi11DT8Sft` and `trig_019vBh5NGDospDHvzQB1HNWh`
    are disabled, not deleted.

## 3. Unfinished plan (concrete next steps)

1. **Re-check open items on the develop tip.** The items:
   - #956: selecting the secondary should draw only its marks;
   - the sign on fold-pair notes and badges (a −1 badge beside a "1 apart" note);
   - the grid card word-wrap fix, #1081;
   - End the game during planning;
   - chat shows no unread mark during a game;
   - rematch gives no notice to players still on the end page;
   - line cards drop y(0);
   - Prime Gradient's Why line printing −4½.
2. **Play the owner's gravity number law** (`claude/gravity-measure`; it was never on origin when I looked) beside
   develop, on beginner lines, desktop and phone:
   - what a player can afford in the first two minutes;
   - whether prices read sensibly;
   - whether the starters still move;
   - whether any numbers are absurd.
3. **Repeat the old-vs-new pass on lines,** which the old app does not have (guess: only grids compare directly).

## 4. Obstacles, and what the docs may not say

- **Running both apps at once (built).** The old app runs beside develop if given its own ports:
  `CONVEX_LOCAL_CLOUD_PORT=3220 CONVEX_LOCAL_SITE_PORT=3221 FAKE_OIDC_PORT=3409 pnpm --filter @workspace/engine dev`,
  then `deploy-static`. Its first start died once with "rotateKeys: fetch failed"; a second start worked.
- **Stopping processes (built).** Never `pkill -f convex-local-backend` while two stacks run: it kills both. Kill by
  PID or by port.
- **The harness (built).**
  - It is `scripts/persona-walk/server.js` with `SITE=http://127.0.0.1:<site port>`.
  - The fake OIDC knows only alice, bob, carol, admin and unverified. Any other name times out at sign-in.
  - It clicks but cannot hover or swipe, so hover callouts and touch swipes went untested.
- **Container restarts (built).** The container restarted mid-session once. Both stacks had to be rebuilt; the
  scratchpad survived.
- **Load (seen narrowly).**
  - Three games on one local backend share slow ticks of 4–6 s, while one game alone stays near 0.3 s. Measure ticks
    with one game alone.
  - About 28 abandoned practice worlds (round 24) caused 1 s timeouts; fixed by #805.
- **Reading data (built).** `npx convex data v2Moves --limit 15000` works; a limit of 40000 returned 0 rows. Moves are
  stored once per viewer, so deduplicate on (gameId, seq). The seat that moved is `by`, not `memberId`.
- **Grid optima reached (seen narrowly).** Leapfrog and Two Pair (Grids · beginner) hit "exactly" on their main parts
  within 10 minutes, and Two Pair also topped its secondary (4 of 4). The grids session says this is known and deferred.
- **Two-state cycles (seen narrowly).** One line flipped between two states for a whole last third:
  - Whole Crossing against Divisibility Ladder, with a diagonal mirror;
  - Treasure against Divisibility Ladder, with ±1 pivots.
  These were tugs between different players, which the UI made legible. The "raised your points" metric overcounts
  them unless gains undone within two moves are discounted.
- **Chat (seen narrowly).** Chat is hidden during a game in both the old and the new app. So it is a UX fault, not a
  regression.

## 5. Probably obsolete after the 16–17 Nov scoring rebuild

- **All bits, points and tick numbers in rounds 21–34 and baselines 1–3 (guess).** Points were your bits × the
  others' bits, and energy was priced per read and change, so every dynamics table from those rounds predates the
  rebuild.
- **Findings tied to the old scoring (guess):**
  - the Prime Gradient "−4½" text;
  - the skip rates (85–98%);
  - the grid optima (if the families changed).
- **Likely still valid (guess):** app and UX findings that do not depend on scoring:
  - chat visibility;
  - the rematch notice;
  - y(0) on the line cards;
  - the old-vs-new feature gaps in baseline 1 (setups of your own, colour boards, the assistant, the end-page standings
    table, replay event marks).
