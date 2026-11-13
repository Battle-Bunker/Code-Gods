# Handover: tick livelock, sandbox lanes, examination cache, slow validate (2026-11-13)

Branch `claude/tick-livelock`. Everything below was measured on the local backend (4 cores), never on a cloud
deployment. Nothing of this went to `main`.

## Done (merged into `develop`)

| PR | What |
|---|---|
| #279 | Forge Validate/Summon and the assistant's validate end in a retryable "sandbox is busy" error: engine gives up at 20 s (`EXAMINATION_DEADLINE_MS`), app at 25 s. |
| #289 | Lease heartbeat (`loop.ts renewLease`, `tick.ts keepLease`); waves bounded by the tick's time left; sandbox queue priorities tick / human / background with a per-request deadline (`lib/game-runtime`); deployment-wide caps in `workSlots` (8 examinations, 3 hold computations, 3 AI turns; turns and holds past the cap are queued, no polling); examination cache (`examinationRuns`, `lib/examinationCache.ts`); AI turn waits while its game's tick is overdue; watchdog restart logging and `stats.restarts`; AI-seat chain watchdog (`members.aiNextAt`); recovery index `games.by_phase_autoResume`; load harness. |
| #311 | Test only: `test/game-validate-latency.test.ts` (a running practice-style game, six validates of new Python code, each within 5 s). |

Numbers for #289, develop → branch, same machine, 12 s planning:

- 20 games (2 humans + 2 mock AI): running 239 s late → 2.5–4.4 s late; watchdog restarts 60 → 0; summons failed 60 of 60
  → 0 of 60; ticks committed 20 → 460–495.
- Human summon of the same example code (cached): 4 practice games 6.0 s → 0.6–0.9 s; 20 practice games 16.6 s → 1.3–2.1 s.
- Different code per player: 4 practice games 6.0 s → 5.3 s; 20 practice games 16.6 s → about 22 s with "busy" answers.
- 50 games: 37 s late, 0 restarts, 59 refused actions, 59 of 150 summons failed (no baseline on develop).

## Open: draft PR for commit `8030f6ef` (NOT merged)

"A timed-out examination resumes on the retry; fewer round trips per examination". On this branch, pushed. It was
verified on develop as of #320 (about 18:30 UTC); develop has moved 21 commits since with no textual conflict, and
nothing was re-run after that. Merge only after re-running the commands under "Remains" step 1.

What it does:

1. **Resume.** Before it, an examination that hit its deadline saved nothing (`examinationCache.put` ran only after a
   complete measurement), so every retry redid all ~230 runs; under load no retry could finish, which is the
   "Trying again (2 of 4)… 40–100 s" in the walks. Now the runs an unfinished examination did finish are stored
   (`engine/pricing.ts`, the `catch` around the measurement), the sandbox stops 1.5 s before the caller's deadline so
   there is time to store them (`EXAMINATION_SAVE_MS`), and the same command sent again carries on. Tested:
   `test/game-examination-cache.test.ts`, third test (300 ms deadlines: each attempt gets further, one finishes, the
   answer equals an uninterrupted one). Fixture: `convex/testingNode.ts examineWithin`.
2. **Fewer round trips.** `CONCURRENCY` in `engine/pricing.ts` 4 → 16: one `runtime/acts:run` call carries 16 runs, so
   an examination is about 15 nested action calls instead of 60.

## What was measured about validate/summon under load

All through `commands:submit` as the human owner, edited (uncached) Python code, default room, two mock AI seats.

| Condition | Validate |
|---|---|
| Idle, planning or running game | 1.4–2.0 s (1.3–1.5 s with the draft PR) |
| Default Grid board, 15 generated starter agents, each edited | 1.4–3.3 s |
| 3, 4 or 6 CPU busy loops on 4 cores | 1.6–2.1 s |
| During and after a real redeploy of the local engine | 1.3–2.3 s |
| Eight other games running (1 human + 2 AI each) | 5–8 s on develop; 2.2–4.8 s with the draft PR |

- **Where the time goes under load:** the nested action round trips, not the sandbox runs and not the queue order.
  In the eight-game run `runtime/acts:run` averaged 69 ms a call (p95 207 ms) and an examination made about 60 of
  them. Plain CPU contention from other processes did not slow it; other games' engine load did.
- **Queue order is not the bottleneck.** I tried making ticks and people take turns in the sandbox queue: no change
  (5–8 s), so I reverted it.
- **Is a timed-out attempt's work redone on the retry?** On develop: yes, all of it. With the draft PR: no.
- **Is a late result cached and hit?** Not as such: the examination is stopped at its deadline (queued runs are
  dropped), it does not finish late. What is kept is its finished runs (draft PR); a completed examination is always
  cached.

## The browser-route numbers (first-five-minutes lead, one game, develop 7b51806d)

Through the forge in a browser, one practice game, one builder subagent on the same 4 cores: first summon of the
untouched example ≤ 4 s; "Check and summon" of a new program 10–12 s check plus 4–5 s summon; check after a
two-character edit 10–12 s; validate after a comment-only edit 10–12 s. No retry line seen.

**Explained and fixed (2026-11-13, PR "Inline the auth JWKS").** Every nested call of a signed-in browser's action
(each `ctx.runQuery`/`runMutation`/`runAction` of `commands:submit`, about 25 in a check) made the backend fetch
`/api/auth/convex/jwks` first, 80–190 ms each. `auth.config.ts` was meant to inline the JWKS from `BETTER_AUTH_JWKS`, but it
checked `Object.keys(process.env)`, which is always empty in Convex's runtime, so it always fell back to the URL (the
player JWT's `PLAYER_JWT_JWKS` too). At 60 nested calls a check (before #325's batching) and a busy machine that is the
10–12 s. The suites never saw it: they impersonate with the admin key, which validates no JWT.
`artifacts/player-web/e2e/forge-check-timing.ts` measures a forge check in a real browser with the backend's log for the
same window. Local, one running game: 3.6–4.0 s (24 JWKS fetches a check) → 1.05–1.3 s (none); click → websocket
send is 35–60 ms and response → repaint under 50 ms, so the client adds nothing. Regression test:
`test/game-auth-jwks.test.ts`. Unverified on a cloud deployment (which may cache the JWKS; the inlining is right either way).

Two ideas from that lead, not built: key the cache on comment-stripped source or the syntax tree, so a comment or
whitespace edit is instant; and make summon-after-check in a running game reuse the check (for example by examining
against the board the check saw).

## Remains, in order

1. **(Done: #325 merged.) Re-verify and merge the draft PR.** From the repo root, with the local engine running
   (`pnpm --filter @workspace/engine dev`, wait for `[dev] READY`):
   ```
   git fetch origin develop && git merge origin/develop
   pnpm run typecheck
   pnpm --filter @workspace/engine test:unit
   cd artifacts/engine
   T="node --experimental-transform-types --disable-warning=ExperimentalWarning --test --test-concurrency=1"
   for f in game-examination-cache game-validate-latency game-code game-ai game-load game-ai-quotas game-lifecycle; do $T test/$f.test.ts; done
   ```
   All seven passed on develop as of #320. Then run the `code-review` skill on the diff (not done for this commit).
2. **(Done: the JWKS fetch above.) Explain the 10–12 s browser check.** Get backend durations for one forge check: the local backend's log stream
   is `GET http://127.0.0.1:3210/api/stream_function_logs?cursor=0` with header `Authorization: Convex <adminKey>`
   (key in `artifacts/engine/.convex/local/default/config.json`; `test/execution-log.ts` and `test/load-harness.ts`
   read it). Compare the durations of `commands:submit`, `runtime/acts:run`, `runtime/acts:inspect` with the
   wall-clock seen in the browser. If `commands:submit` is 2–3 s, the rest is client-side.
3. **Summon after check in a running game** (the 4–5 s): confirm with the same log that the second examination runs
   ~40 sandbox runs, then decide whether to examine against the checked board.
4. **Cloud dev load run** (never done), below.
5. Optional: comment-insensitive cache key; a 20-game regression in the suite (today `game-load.test.ts` runs 8 games
   and also passes on the pre-fix code).

## The cloud dev load run (never done)

Humans only (AI seats there would call real providers). It is not read-only: it seeds `test|…` users and Load rooms
on the dev deployment and ends only its own games. It refuses a `prod:` key or a URL the key does not name.

```
cd artifacts/engine
CONVEX_DEPLOY_KEY='dev:<name>|…' npx convex env set TEST_FIXTURES 1
CG_LOAD_URL=https://<name>.convex.cloud CG_LOAD_ADMIN_KEY='dev:<name>|…' \
  pnpm --filter @workspace/engine load -- --target dev --games 20 --seconds 90
CONVEX_DEPLOY_KEY='dev:<name>|…' npx convex env remove TEST_FIXTURES
```

The `dev:<name>|…` key format is from memory and untested against a real deployment. Add `--unique` to give every
player different code. What I expect there, as a guess: each action has its own instance, so sandbox throughput
should matter less than locally, and the 64-concurrent-action limit and the scheduler should matter more.

## Gotchas

- **The local engine takes about 15 minutes to start in this container**: the load runs left a 3.8 GB local database
  (`artifacts/engine/.convex/local/default/convex_local_backend.sqlite3`) and each startup step reloads it. Set
  `CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS=900`. Do not wipe it to get past a schema change (CLAUDE.md).
- The local engine does not redeploy when only `lib/` changes, and `touch` is not enough: change a `convex/` file.
- A checkout of older code will not start against that database (rows carry newer optional fields): add the widened
  schema (`convex/game/tables.ts`) to the old checkout.
- The harness summons identical `add(1)` code unless `--unique`; identical code is answered from the cache.
- `test/load-harness.ts` does not import `game-helpers.ts` (whose `after` hook ends every live game).
- Under many live games the test helpers' `endGames` hook can fail with an OCC error against tick commits; it is the
  hook, not the test body.
- `git push --force` is blocked in this environment; merge develop instead of rebasing.

## Unverified

- Everything on a cloud deployment.
- The draft PR on develop after #320.
- The 50-game result after the last merges; no 50-game baseline exists.
- Human-before-AI ordering end to end (tested at the queue only, `lib/game-runtime/test/runtime.test.mjs`).
- Whether `touch`ing a file restarted the sandbox in my "after redeploy" measurement (the later real edit did
  redeploy; cold-start cost was not isolated).
- Start latency with cold tables: only measured warm (about 1–2 s a start).
