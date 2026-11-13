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

## The open pull request, #321 (round 7), item by item

Head when this was written: the commit after `9f81b8d0` that adds this file. Verified on `9f81b8d0`: root typecheck,
player-web unit tests (now 408/408), `e2e:site` 30 checks, `e2e:panels` 22/22, live engine files `game-first-agent`,
`game-validate-dry-run`, `game-room-setup`, `game-spectators`, `game-assistant-chips`. An independent review of
`9f81b8d0` then found the problems marked below. **No walk has completed on round 7** (both were cut off).

| Item | State | Where |
|---|---|---|
| Replace and "Put the previous version back" use the engine `replace` command | done, reviewed | `artifacts/player-web/src/core/game/runner.ts`, `core/panels/forge.tsx`, `use-previous-version.ts` |
| A failed query takes down only its pane; no retry loops; default layout when `dock.state` fails | done, reviewed | `src/sdk/transport.ts`, `src/sdk/query-errors.ts`, `src/core/pane-errors.tsx`, `src/dock/*` |
| "No game yet" and "not seated" get their own sentences instead of "you no longer have access" | done after review (unit-tested, not seen in a browser) | `src/sdk/query-errors.ts`, `test/query-errors.test.ts` |
| Full-store advice with the control one press away | done, reviewed | `core/panels/energy-capacity.ts`, `agents.tsx` |
| "Your points now" explained before the first agent | done, reviewed | `core/panels/score-lines.tsx` |
| Destroy confirmation says how much energy comes back | done; now also silent in a game without `fullChargeSeconds` (review finding) | `energy-capacity.ts` `destroyReturnsLine`, `agents.tsx` |
| Summon preview "It starts with N ⚡…" | done, matches the engine; **not shown** for "Summon beside it" / "Summon another copy" | `core/panels/first-agent.ts`, `forge.tsx` |
| `replaceLoss` removed | done | — |
| **First agent's share is 75%** | **half done and wrong as it stands: must be fixed before merge** | `first-agent.ts` `summonShare` (line ~128), `forge.tsx` ~123–126, ~274 |
| Second summon right after the first | not started | `forge.tsx` |
| Description carried to a new agent by "Summon beside it" | not started | `forge.tsx` ~146–152 |
| Tests on unreachable `summonShare` states | not started | `artifacts/player-web/test/first-agent.test.ts` |

### What is wrong with the 75% share (do this first)

Engine rule (`lib/game-core/src/energy.ts` `movePower`, `artifacts/engine/convex/game/commands.ts` ~283–350): after a
summon at share `s`, the player's own store holds at most `(1 − allocated − s) × P × T` (P = power, T =
`fullChargeSeconds`). Beginner setup: P = 64, T = 30, start 600. A flat 75% leaves a store of at most 480 ⚡, but the
dearest starter costs 572 (`BEGINNER_AGENT_BUDGET_BITS`, `lib/game-core/src/settings.ts`), so a Replace with it is
refused for good ("costs 572 bits, but your own energy holds at most 480"). `summonShare` also has no setup input, so
int/string worlds (P = 8, T = 60, start 200) get 75% too and keep a 120 ⚡ store.

The fix I had specified (not yet written):

1. `summonShare` takes the economy and the price: first share = `min(0.75, 1 − need / (P × T))`, where `need` = the
   larger of the price being summoned and the dearest starter price known for this game (remembered starter prices or
   the setup's agent budget; no new query). Floor as now. Below the engine default (half of what is free), or with no
   capacity, send nothing and let the engine default apply. On the beginner setup that gives about 70%.
2. Make `storeAfterSummonText` true for the same numbers.
3. Test: for every beginner starter, the store's cap after the first summon ≥ that starter's price.
4. Once the forge has sent a first summon in a game, remember it locally and stop sending the special share, so a
   second summon before the subscription updates is not refused ("Only 25% of your power is unallocated"). While the
   agent list is loading, do not treat it as "no agents".
5. Check the pinned intent still reads true: `lib/game-core/test/settings.test.ts` ~472–488,
   `artifacts/engine/test/game-first-agent.test.ts` ~41. Do not change engine defaults.
6. Then the walk the coordinator asked for: a first summon plus two replaces is comfortable at this share.

Accepted as is: destroying your only agent and summoning again counts as "first" again; summons by the assistant or
from a file keep the engine's default half.

## What remains, ordered by how much it hurts a beginner

1. The first-agent share fix above, then a walk measuring a first summon plus two replaces.
2. Checking edited code takes 10–12 s idle and 40–100 s under load (an untouched example is ≤ 4 s). The engine side
   belongs to the tick lead; the web side already lets Summon proceed without waiting for validation.
3. Balance: every walker finished 1st of 3 against the default opponents. With the integration session.
4. Round-7 walk questions never answered: is the Destroy confirmation understood; is the full-store advice seen and one
   press away on a phone; does the points explanation before the first agent make sense; any pane error visible.
5. Site pages have no error boundary: `useLivePages` still throws (`artifacts/player-web/src/site/**`).
6. Replay events show no points delta.
7. Example panel `leaderboard-race.tsx` colours do not follow the player colours.
8. "Summon beside it" carries the old description; "It starts with N ⚡" missing there.

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
