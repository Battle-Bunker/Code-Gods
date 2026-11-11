# Production-readiness backlog (push of 2026-11-11)

What a 30-minute push by fourteen parallel sessions found and did not fix. Merged in the push: PRs #241–#266
(see "What shipped" at the end). Items are ordered by priority inside each section. "Unverified" means nobody
reproduced it or ran the check; treat it as a question, not a known bug.

Simulation harnesses added in the push, for re-running the balance numbers:
`lib/game-core/scripts/balance-settings.ts` and `lib/game-utilities/scripts/family-balance.ts` (how to run: the
header of each file).

## 1. Robustness of live games

1. **Tick livelock under load (P0).** With 20 concurrent games (1–3 mock AI seats each) on the local backend, no game
   advanced for about ten minutes; they then all ran and ended, ten minutes late. Ticks are not failing: they outlive
   their lease and are discarded. `LEASE_MS = 30_000` (`convex/lib/world.ts:24`) counts from the scheduled time
   (`engine/loop.ts:42-51`); the watchdog reschedules every game with `leaseUntil < now` each minute
   (`loop.ts:407-413`), bumping `tick.seq`, so the slow tick in flight commits as "stale". Ticks are slow because the
   sandbox pool has one worker per language (`convex/runtime/node.ts:113-116`), a queued job waits up to 34 s
   (`lib/game-runtime/index.mjs:250-254`), and tick acts queue behind AI-seat examinations, which have no cap.
   The local single-node backend may exaggerate it: re-run on the dev deployment. Fix order:
   1. Lease heartbeat: `renewLease(gameId, seq)` sets `leaseUntil = now + LEASE_MS` only while seq matches; call it
      from `tick.ts` before each wave and before the commit. Test: a slow act plus a saturated pool; commits keep
      landing and `stats.discarded` stays 0. About 20 lines.
   2. Bound each act wave by the time left in `MAX_SIMULATE_MS` (`tick.ts:53`, `:223`); expiry is a host skip.
   3. Cap concurrent AI-seat examinations per deployment; an AI turn waits while its game's tick is overdue.
   4. A priority lane in `GameRuntime.request` so acts are dequeued before examinations.
   A watchdog grace period alone is not safe: `scripts/check-live-games.mjs` expects a commit within
   `LIVE_CHECK_SECONDS = 90` after a deploy; the two must change together.
   It is not only AI seats: 20 games with humans only (no AI seats) froze 7 of 20 mid-run and took up to 230 s to
   start; with AI seats 20 of 20 stalled. A re-run on develop after #262 still livelocks ("watchdog: restarted 20"
   every minute; 13 of 20 games had not finished starting after 240 s; none ended within 290 s).
   Hold rarity adds to it: `engine/hold:computeOne` takes 1.4–7.5 s each under load, shares the same capacity, and
   `holdState "computing"` gates planning→running (`engine/tick.ts:109-114`). Put hold and examination work at a
   priority below ticks.
   Load regression to add: 20 games with 3 mock AI seats; every `tick.seq` advances within 2 minutes.
   Open question: what fired 1,836 `runtime/acts:run` calls while every game was still in planning (AI examinations
   or probes).
2. **Start is slow and fragile under light load (P0/P1).** Start→running took 40–60 s with about five games
   starting at once (the "preparing" table computation). #262 stopped every start writing the global activity row and
   re-arms the watchdog for a stuck "preparing" room; #263/#266 keep the room page on "Starting…" instead of falling
   back to the lobby. #262 is confirmed under the soak's 20 parallel starts: 0 `commitStart` failures of any kind
   (before: 5 and 7 OCC failures). Start latency is not fixed: 80–218 s at 20 concurrent games (see item 1). Still
   open: a fault-injection test for the stuck-"preparing" fix; show a real start failure in the
   status line ("Couldn't start the game: <reason>. Try again."), which needs a failure field on `StartView` in
   `lib/player-client/src/start.ts` (about 15 lines); optionally make `startGame` return the existing game instead
   of CONFLICT when the same owner started it less than 2 minutes ago (`owner.ts`, about 6 lines).
3. **Forge "Validate" stuck 10–30 s under load, Summon disabled (P1).** Same sandbox queue as item 1. Add a timeout
   and a visible error in `artifacts/player-web/src/core/panels/forge.tsx:116`.
4. **AI-seat chain watchdog (P2).** A turn action that dies without running `afterTurn` silences the seat for the
   rest of the game. `afterTurn` records `member.aiNextAt` (optional field: schema widen); the watchdog restarts
   chains more than 2 minutes overdue. About 40 lines plus a test in `game-ai.test.ts`.
5. **Recovery page crowding (P1).** `touchActivity` reads recovery games `by_phase .take(200)` (`activity.ts:23-25`);
   more than 200 stopped games crowd idle-parked games out and those never auto-resume. Index on
   `["phase", "autoResume"]`.
6. **Reject settings that always stall (P1).** `powerPerSecond = 0`, or zero starting objects with zero spawn rate,
   validate today. About 6 lines in `validateSettings`; check stored rooms first, since it also runs on stored
   live-game settings.
7. **Unverified:** AI seats going quiet in a 90 s game when the only human is idle (re-run on develop after #241,
   with the human acting mid-game); tick versus player-command write contention under load; the sandbox's
   hostile-code limits re-run; a game running to its natural end in the GUI; the device flow end to end.
8. **Assistant:** "My agents" pane replaced by a second Objects pane after `set_panel_params` (unconfirmed: script it
   alone on a fresh layout and diff `get_layout`); `assistant.send` could refuse up front when the allowance is used
   up (`convex/assistant.ts` ~L190).
9. **Agent interface:** wrong HTTP method returns 404 or Convex's text/plain instead of JSON 405
   (`auth/routes.ts:136`, `agent/oauth.ts:280`); malformed refresh token / short request key / over-long client id
   get misleading "required" errors (`agent/oauth.ts:244`, `:195`, `~146`); `catalog.ts:439` names a non-existent
   `show_panel` tool; CLI message nits (unknown command, `--pretty=yes`, `--count` without `--watch`,
   `state --objects` help says ≤90 but accepts 2000).
10. **Local dev:** `scripts/dev.mjs` prints READY while the site still serves a placeholder; run `deploy-static`
    (or warn) first, and have the health check test that `/` serves the app.

## 2. Balance

Owner decisions first.

1. **Is skill-independent equality between goal families the goal?** Under greedy play on Annotated basics (3
   players, fair 33%): colour_bonds 60%, magic_accountant 55%, mirrormancer 53% … chessmaster 14%, kingdom 4%.
   First steps: seesaw 89%; mountain_climb, times_table_territory, constellation about 4%. The order flips under
   random and "deny" play. Capping family ceilings does almost nothing (tested at 16 and 24 bits); the imbalance is
   climb rate (bits gained per move). Candidate fix: calibrate by bits reachable in N greedy moves from a random
   board, or rescale by measured climb rate. `test/cross-family-opportunity.test.ts` pins today's gaps so they can be
   ratcheted down.
2. **"Deny the opponents" may be the dominant strategy:** 62% of wins against random 12% and greedy 26% with real
   scoring on the First steps board.
3. **Drop or flag kingdom in the Annotated basics pool** (`ANNOTATED_BASICS_EXCLUDED` in game-core settings).
4. **Degenerate tables:** sudoku_scholar on Grid(4,base10,rgby) has a one-level table (always about 0 bits);
   bridge_builder tops at 3.6 bits on 4×4 rgb and is in the First steps pool. Exclude a family wherever its table
   is degenerate (declared needs).
5. **Weak climbers in First steps** (mountain_climb, times_table_territory, constellation, the *_piece_tamer
   family, prime_territory, fibonacci_sandwich): check for plateaus; give a finer ordinal, then recalibrate.
6. **Tempo settings:** `interactionRateHz` does nothing above about 25 Hz at current power; bigger boards get far
   fewer acts at the same power (master about a third of classic). Shipped setup defaults are stored data: use the
   migration workflow. Re-check with real scoring first.
7. **Dealing:** fair-aligned equals divine-lottery on First steps, Annotated basics, Big board and Master (no synergy
   matrix ships for them); check fair-aligned is seat-symmetric as #261 made the lottery.
8. **First-seat advantage** of 3–8 points in the turn-based model: confirm against the engine's real tick order.
9. **Pacing for a first game:** five minutes of planning plus 10–15 minutes; no first-time persona reached the end.

## 3. UX

Owner decisions first.

1. **A first move needs Python.** Four of five first-time personas could not make a move. #264 added a "Write my
   first agent" button; pre-filling the editor with a working example for the player's own goal card is the next
   step (M).
2. **The room owner starts as a spectator.** Seat the owner by default (`rooms.create`), or make "Play the next
   game" a primary button.
3. **"Mark me ready" is still a player's primary button** once enough players are in, though ready gates nothing.
4. **The brand red is slightly darker** after #257's contrast fix (3.98:1 → 4.8:1 on the primary button).

Then, by reach:

5. **The score is unreadable.** The card says "each SET scores 1 point" while "How scoring works" says points are
   bits × others' bits; no running total; displayed products don't multiply out (rounded factors). Write "adds 1 to
   your rule's score" on cards, add "Your points now: X", show factors to 2 dp or "≈" (`core/panels/rules.tsx`).
6. **"bits" means both energy and rarity.** Label energy "⚡ energy" and explain income in a tooltip.
7. **The assistant's starter chips** must end in a reply or an error, and the mock should follow the chip's intent
   so e2e catches a regression (`core/chat/suggestions.ts:24`).
8. **End rule copy contradicts itself:** sign-in page says the game ends at a random moment; the game shows a
   countdown. No tie-break rule is shown.
9. **Header:** one colour per phase for the phase pill; one countdown, not two; drop "hosted client" (update
   `e2e/multi-client.ts:539`); show "offline / reconnecting" from the Convex connection state.
10. **Dock:** a new pane can be about 100 px wide at 1440 (pass the dock's pixel width to the open-panel action and
    split below when under 320 px; `lib/player-client/src/layout.ts:371-389`, about 30 lines); replay timeline pane
    only about 150 px tall; "Agent code · Empty" caption while the editor holds code (`panels.ts:129`); the forge
    draft is lost on reload.
11. **Ended game seen by a non-member:** no winner, no next step (`site/pages/game.tsx` ~160).
12. **Room and home:** two links to the same game; "+ Add AI player" as a plain button rather than a palette of
    model ids; "needs N more" on home rows; relative timestamps; one label for the play/watch toggle; stale
    "Next game … Undo" toast after Start; "Copy of X" for duplicated setups.
13. **Configure:** read-only chips look editable; summary says "15 min" while Time says "Long (10 min)"; on phones
    the page is about 5,400 px tall with a duplicated summary and no section navigation.
14. **/connect with no request** shows the intro plus a red error; show neutral text. **/device** shows the code
    twice.
15. **Accessibility:** dock tabs nest buttons inside `role=tab`; goal board is about 24 tab stops (one stop with
    arrow keys); no live region for phase changes; no skip link; the game page has no h1; small touch targets on
    the room page and objects panel. **Unverified and possibly blocking:** keyboard-only play of a full game;
    colour-blind readability of board tiles.
16. **Rule text:** go_fish_books "a fish in two blocks counts twice" (it counts once per 2×2 window, up to 4);
    column_addition drops the carry silently. Unaudited by scoring: number_painter, prime_territory,
    times_table_territory, young_tableau, colour_seesaw, far_apart, colour_carousel; thin coverage on 6×6 and 7×7;
    Int/string families.
17. **Unverified:** real turns at phone width; the assistant bottom sheet; configure at every control's limits;
    leaving mid-game; the end-of-game moment for a seated player; dark mode following the system.

## What shipped (PRs into develop)

| Area | PRs |
|---|---|
| Engine: AI-seat chains, watchdog, membership cap, start conflict, stuck preparing | #241, #254, #262 |
| Agent interface: MCP permission and auth errors, pause reasons, CLI help, docs | #244, #260 |
| Assistant: quota refusal visible; unknown-tool test | #248 |
| Balance: tie ranking, energy bounds, harnesses, cross-family guard, seat-symmetric deal | #243, #246, #256, #261 |
| Rule text: ten false goal cards | #252, #265 |
| Site pages: next step, join by code, open seats, error and signed-out states, form limits, start state | #242, #247, #251, #255, #259, #263, #266 |
| In-game: results headline and ties, chat overflow, first-agent button, summon hint, replay names | #245, #250, #253, #258, #264 |
| Spectator and replay | #249 |
| Accessibility | #257 |

Skills installed under `.claude/skills/`: `usability-heuristics` (MIT), `frontend-design` (Apache-2.0),
`wcag-guide` (MIT).
