# Handover: the first five minutes (2026-11-13)

For a successor who has not seen the earlier work. Branch: `claude/first-five-minutes`. Open pull request: **#321** (draft,
into `develop`). Nothing goes to `main` / production.

## Goal

A brand-new player goes from creating a room to seeing their own agent make a scoring move, and understanding why the
score changed, in under two minutes without docs; and reaches the end of a first game in about five. Measured by
screen-only persona walks (below), before and after each round. The owner's standing brief: get to a well functioning
game optimised for beginners with good balance and UX; keep a list of major judgment calls; do not block on input.

## Done today (merged into `develop`)

| PR | What |
|---|---|
| #281 | First-agent path: pre-filled example agent, one-click "Summon my first agent", owner seated on room creation. |
| #310 | Score vocabulary ("rule score", "✨ rarity", "points", "⚡ energy"), score lines that say why points moved. |
| #313 | Beginner setup values (`ANNOTATED_BASICS_PATCH`: planning 60 s, fixed duration, half-life 300 s, observation free, peer noise 0, `distance-v1`), results-first replay, new seed `grid-annotated-paid` ("Basics with paid looks"). |
| #316 | Forge: "Check and replace NAME", previous-version memory, first-20-moves comparison, "Put the previous version back", "Other starting points" shelf, sticky action row. |
| #319 | Round 6 fixes from walks and reviews (examples prefer `write`, "Try this" comments, phone layout fixes, e2e repairs). |

Result measured by walks after #319: non-coders summon in about 30–45 s, see a first scoring move at about 41–110 s,
can explain the score, and see the natural end of the game at about 350–410 s (before: never reached).

## Round 7 and after (merged 2026-11-13)

| PR | What |
|---|---|
| #321 | Atomic replace, pane-local query errors, energy lines. A beginner's first agent (beginner rule on the beginner board, Python) gets the largest share that still leaves the store able to pay for the dearest starter: 0.701562 (`firstAgentShare`, `isBeginnerGoal` in game-core). `BEGINNER_AGENT_BUDGET_BITS` is 573, derived by the example-agents test from every starter's price. |
| #327 | Walk fixes: replace says what it keeps; a shelf starter is offered as Replace of the agent in the editor or the only goal agent (never an observer); whose store is full; "Starting the world…"; the dock routes on the header's roomId, so a timed-out room query no longer tears it down (`dockRoomId`); site error boundaries; `usePlayerStyle`. |
| #330 | "Energy about 0 ⚡" for a working agent; "✨ rarity a → b (fewer random grids score this well)". |
| #331 | Power explained after the first summon; no negative energy for a working agent with capacities; "Other starting points" button; no stale price after a replace; Objects pane in house words. Walks after #330: Jo 6.5 / 38.4 / 56.8 / **66.9** / 356.7 s, Sam 3.7 / 24.1 / 81.9 / 81.9 / 385.5 s. |

Walks on merged round 7 (before #327): Sam (phone): seated 4.2 s, summoned 44.6 s, first scoring move 92.7 s,
explained ~93 s, end 358.7 s. Jo (desktop): 4.3 / 81 / 96 / not explained / 405.8 s.

## What remains, ordered by how much it hurts a beginner

1. AI seats are admin-only: a beginner who invites one friend cannot start (a product and funding decision, reported).
2. Checking edited code is slow under load (tick lead's).
3. Balance: every walker finishes 1st of 3 (balance session's).
4. Jargon still met: "bits" in setup details and prices, "1 in 2.2 billion" rarity text, power vs energy after the
   first summon ("70% of your power… 19.1 ⚡/s" is half understood).
5. On a phone, scrolling stacked panes often scrolls the Objects list or the code box instead of the page (Sam, twice):
   nested scroll areas in `src/dock/stacked.tsx`; needs a look in a phone browser before changing.
   `e2e/objects-scroll.ts` (no package script) is stale: it expects a first page of 12 rows and gets 36.
6. Replay events show no points delta (needs engine data).
7. The assistant's mock reply locally is not a product bug (no provider key), but its numbers are unrounded.
8. No walk yet on #327 and later.

## Persona walks, exactly as run

Files: `scripts/persona-walk/` (`server.js`, `cli.js`, `README.txt`, `PERSONA.md`, `PERSONA-MODES.md`, `COMMON.md`).
They contain the placeholders `<WALK>` and `<SCRATCH>`: copy the folder outside the repo (a scratch directory) and
replace `<WALK>` with that path, because walkers are forbidden to read anything in the repo.

- `server.js` drives the pre-installed Chromium (never run `playwright install`), signs in through the fake OIDC
  provider as `--user`, and serves commands; `cli.js PORT <command>` prints a screenshot path, a clock (seconds since
  sign-in) and the visible text with numbered clickable elements. `friends CODE` makes `bob` and `carol` join a room.
- A walker is a subagent given only `PERSONA.md` (plus `PERSONA-MODES.md` for whole-game walks), a persona, a
  viewport, a user, a port (4701–4799) and an output directory. It may run only the harness and read its PNGs.
- Personas used: Jo (34, office administrator, never coded; desktop 1440x900), Sam (19, student, phone 390x844,
  impatient), Alex (developer, desktop). Users: `alice` with `friends` for human opponents; `admin` when the walker
  must add computer players (only `admin` may).
- Times are read from the harness clock at five milestones: seated; first agent summoned; first scoring move; score
  change understood (the walker must write a correct explanation; a guess counts as not understood); game end seen.
  Limit about 660 s.
- A game needs three players: give a walker two friends (`friends CODE bob unverified` for `alice`; the other walker
  as `admin` with `friends CODE carol` plus an AI seat). Only these five identities exist in the fake provider.
- Two walks at a time, no more: the machine has 4 cores and the agent sandbox saturates, which makes summons and checks
  slow and falsifies the timings. A fresh room per walk. **Never run live engine tests during a walk** (see gotchas).
- The site under test is the static build the local engine serves on :3211; rebuild it before walks
  (`pnpm --filter @workspace/engine run deploy-static`, or run `e2e:site`, which builds and deploys it).
- `COMMON.md` is the brief given to builder subagents (tests first, no commits, house vocabulary).

## Local engine gotchas

- Start: `pnpm --filter @workspace/engine dev`; wait for `[dev] READY`. Backend 127.0.0.1:3210, site :3211, fake OIDC
  :3399. Users: `admin` (may add AI players), `alice`, `bob`, `carol`.
- Live engine tests end every game when they finish (`after(endGames)` in `artifacts/engine/test/game-helpers.ts`).
  They kill any walk or e2e in progress.
- Run live files one at a time with the repo's flags:
  `node --experimental-transform-types --disable-warning=ExperimentalWarning --test --test-concurrency=1 test/<file>.test.ts`
  from `artifacts/engine` (`--import tsx` does not work).
- `convex dev` wedges for good after it sees a conflict marker in a file. Restart: `pkill` `convex-local-backend`,
  `convex dev`, `fake-oidc`, `scripts/dev.mjs`; start again.
- A long-running engine does not upload new calibration tables after a merge: restart it (symptom: e2e "no first-use
  note").
- A change only in `lib/*` is not pushed: `touch artifacts/engine/convex/rooms.ts` and wait about 20 s.
- `roomWith` in `test/game-helpers.ts` defaults to `observation: "free", peerNoiseBits: 8`; the beginner patch uses
  noise 0, which breaks the spectator test if copied there.
- `planningSeconds` must stay a documented value (60); 75 failed the settings-docs test.
- Summon price is the length of the program's description of its syntax tree: comments are free. The examination
  cache is keyed by the exact source text.

## Suites to run when the dock, forge or seeds change

- Always: root `pnpm run typecheck`; `pnpm --filter @workspace/player-web test`.
- Dock or panes: `e2e:panels` (must be 22/22), `e2e:site`.
- Forge or first-agent path: `e2e:site`; live `game-first-agent`, `game-validate-dry-run`, `game-assistant-chips`;
  `artifacts/engine/test/unit/example-agents.test.ts`.
- Seeds or settings: `lib/game-core` tests (`settings.test.ts`), live `game-room-setup`, `game-spectators`,
  `example-agents` unit tests, `e2e:site`.
- Room page or seats: `e2e:site`, live `game-room-setup`, `game-spectators`.

## Not verified

- Whole `test:game`, `test:mcp`, `e2e` (multi-client), `e2e:account`, `e2e:replay`, `e2e:assistant` on recent trees.
- `e2e/score-shots.ts` and `e2e/paid-observation-shots.ts` were edited and not all run.
- The last commit (destroy line gating, the two new error sentences) has unit tests and typecheck only; no e2e, no
  browser.
- No completed walk on round 7.

## Judgment calls made so far (reported to the coordinator as they happened)

1. Observation is free by default on the beginner setup; paid looks live in a separate seed ("Basics with paid looks").
2. Peer noise 0 on the beginner setup, so a score change can be explained exactly.
3. Fixed game length with a 60 s planning phase, so a first game ends in about five minutes.
4. The room's creator is seated as a player by default; watching is the opt-in.
5. Summon is not blocked on validation; the first agent is a pre-filled, working example.
6. Example agents use `write` rather than `add` (priced by distance) and carry one "Try this" change.
7. "Points" is the one word for the score; "bits" only ever means rarity.
8. Replay opens on the results first, panes one press away.
9. "Overdrawn" is the word for negative energy (accepted by the coordinator).
10. A failed query shows in its pane and waits for the subscription; no retry button loops, no polling.
11. Previous version is kept per agent and compared on a frozen first-20-moves window.
12. Left #281 a draft overnight on 11-11 rather than merge unverified after a quota stall.
13. Round-7 PR left as a draft at handover: the review showed the flat 75% share breaks Replace for the dearest starter.
14. Proposed share rule: as close to 75% as still leaves a store able to pay for the dearest starter (about 70%).
15. The beginner first-agent share applies to Python only (TypeScript starters cost up to about 1,100).
16. "Summon beside it" sends only a description the player changed; an exact copy shows no "starts with" line.
17. A shelf starter replaces the agent in the editor, or the only goal agent; never an observer.
18. A timed-out room query keeps the dock by routing on the header's roomId, not by holding a stale result (read rules).
19. A working agent's small overdraft reads "about 0 ⚡" (exact in the tooltip).
