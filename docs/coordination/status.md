# Coordinator status: paused Tue 3 Nov 2026, resumes Thu 5 Nov 2026 morning (AEDT)

The owner paused all work at about 20:20 AEDT on Tue 3 Nov: weekly quota is low, and nothing is urgent now that
today's Battle Bunker session is over. Every worker was told to stop at a clean point, push, and report.
Coordinator session: session_0119hWTUfnFoGVhQud4gmKNK. All times are AEDT.

## How work ships (unchanged)
- Workers branch from `develop`, open PRs into `develop`, and merge them themselves once green and self-reviewed
  (standing go). Production (`main`) is released only when the owner calls it.
- Before every merge, run the engine `test:unit` (it includes the hot-query bundle guard), the affected suites and
  root `pnpm run typecheck`.
- A release takes ~3 min when develop's `checks` already passed on the identical tree, and ~5 min otherwise.
- Run browser/live tests on a freshly started local engine. A long-lived engine degrades, and an engine left over
  from a cut-off run makes `player-client` live tests fail at sign-in.

## Production
- main = 0207b25 (release #197, live 19:09). It contains typed params for the annotated families (#184), the game
  timer (#195), the replay Timeline fix (#194/#193), the peak-only probe gate (#192), the hot-query fix (#196),
  and everything earlier.
- **Not yet released (in develop):**
  - #198/#199 Objects panel sorts;
  - #191 Picture Frame redesign;
  - #200/#205 futile-act fixes and summon warnings;
  - #202–#204 typed params for 85 more families;
  - #201 deploy safety, if merged.
- Releasing a re-keying change (Picture Frame, typed params) can briefly fail a game *start* (1–3 min); running
  games are protected once #201 is live.

## Work in flight at the pause (statuses filled in from workers' final reports)
| Session | Work | State at pause |
|---|---|---|
| session_0119hWTXb7nWu2F4Fp2GSwu6 (rules, Opus) | Typed params batch 5 (arithmetic+seeds, bingo_caller); then Set Spotter + equal-opportunity audit; PR 3 annotations by scoring unit; PR 4 points tuples | see "Final reports" |
| session_0119hWTXQru41EPmeU8vK7FP (assistant modes, Opus) | Autopilot / On request / Read-only replace per-action approvals | see "Final reports" |
| session_0119hWTT8rs9FPTwCbFNiPzZ (deploy safety, Opus) | #201: pinned tables, visible engine errors, idle and game-over notices, post-deploy tick check | see "Final reports" |
| session_0119hWTVSN8TR78vRcYy8naD (energy model, Opus) | Stopped immediately after starting (deferred by the owner) | see "Final reports" |
| session_0119hWTXM1yC9oVNVEMEmVT5 (read architecture) | Resumes Thu 09:00 by its own plan: #171 useLive retry, trajectory windows, objectViews read model (also page the new Objects sorts by index), narrowing of hot fields / replay fallback / objectEvents index+cost | idle until Thursday |

## Owner intentions recorded, not started (do these Thursday, in this order unless the owner reprioritises)
1. **Energy model: no fixed per-act cost** (owner, 3 Nov, verbatim): "I don't want agents to be charged energy per
   mutation for its code complexity, only for what it actually does during that mutation turn. It should be
   possible for an agent to efficiently query the board (being charged only the bits spent on the query) and skip
   if there aren't good improvement opportunities according to its cheap heuristic and thereby conserve energy to
   be run more frequently. Remove any fixed cost component of per mutation energy cost."
   - Plan (the brief given to session_0119hWTVSN8TR78vRcYy8naD):
     - remove the per-act floor and the per-act decisionBits from `actCharge` (lib/game-types/src/pricing/measure.ts);
     - meter the bits an act reads in the sandbox preludes;
     - add a "skipped" outcome (not a failure, outside futility tracking);
     - schedule opportunities by actual spend, with a documented cap;
     - update the UI, docs and the assistant's guidance;
     - migrate stored agent prices.
   - Resume that session, or start a fresh one with the same brief.
2. Finish the rules batch: Set Spotter (remove the diagonals asymmetry), then the equal-opportunity audit test
   (shrinking allowlist) and fixes. Parameters must create peer rules of equal opportunity.
3. PR 3: annotations built around scoring units. A sorted, scrollable list of all scoring boxes; hover links each
   box to its board region; per-family hover geometry.
4. PR 4: points tuples. Primary/secondary points; boxes show (+1, 0), (0, −2); no "wins"/"tie" anywhere.
5. Finish assistant modes (Autopilot / On request / Read-only), if not merged at the pause.
6. **My agents panel legibility** (owner, 3 Nov: "I don't understand the numbers in this interface so new players
   will be even more confused"). Redesign it together with intention 1, since "per act" changes there.
   - Label every number: the summon price; the agent's energy vs your energy; "est. per act" vs the actual average.
   - Explain the bar: its scale is the battery (agentBatteryActs × est. per act) and the tick is one act's cost.
   - Give the timeline a legend and row labels (green ready, grey charging, red cooldown, dashed now).
   - Name unnamed agents.
   - Add one-line hover explanations (Terms).
   - Panel code: artifacts/player-web/src/core/panels/agents.tsx; economy in artifacts/engine/convex/lib/world.ts.

## Open questions for the owner
- Picture Frame middle cells: symmetric −1 (colour or symbol) / −4 (both) is implemented; the owner hasn't
  confirmed.
- An explicit "pass" for agents: superseded by intention 1 (skipping becomes cheap and isn't a failure).
- Optional: the `player-client` test script reuses any engine that answers /api/health, even one without the
  test sign-in provider; a small guard would avoid false alarms.

## Final reports from workers
(appended below as they arrive)

### Energy model (session_0119hWTVSN8TR78vRcYy8naD), stopped 20:21
- No code: branch feat/read-metered-acts has no commits.
- Survey notes:
  - actCharge (lib/game-types/src/pricing/measure.ts) is called from convex/engine/tick.ts.
  - Eligibility is energy ≥ expectedActCost (lib/world.ts, game-core energy.ts).
  - Opportunities are a room-wide interactionRateHz stream, picked from eligible agents.
- Design: meter reads in the grid prelude (lib/game-types/src/grid/prelude.ts) by making Cell's symbol/value/suit/
  is_picture/colour properties. A read costs log2 of its alphabet, capped per cell per layer; repeat reads are free.
- **Owner decision needed:** the Python/QuickJS sandbox can't hide private slots or closures, so an agent could
  read past the meter. Options: host-side metering, or an AST ban on underscore/dunder attribute access in agent
  source. The worker's default is the AST ban.

### Assistant modes (session_0119hWTXQru41EPmeU8vK7FP), stopped 20:22
- Draft PR #206 (branch feat/assistant-modes, ff68a59), NOT merged.
- Done:
  - Approvals removed everywhere.
  - Modes Autopilot / On request (default) / Read-only, one per player per room. Read-only is enforced server-side.
  - Autopilot is a scheduled chain (assistant/autopilot.ts): ≤ 6-step turns at game start, then every 60 s, from
    the per-game quota. It stops at 10% of the quota left, at game end, on idle parking and under the AI gate.
  - 4 widen+migrate migrations.
  - Medium code-review fixes are applied.
- Left:
  1. Rebase onto develop (#205 landed). Keep #205's skill text. The Autopilot prompt variant will be ~8,013 chars,
     over the 8,000 limit, so trim the mode text, not #205's.
  2. Run the selective set: game-assistant, -queue, -modes, game-schema-migrations, game-disclosure, game-ai,
     game-query-cost, lib/ai-player and root typecheck. Then merge.
  3. Optional tests for the review fixes.
  4. The narrowing PR once dev and prod report the migrations done.
- Gotchas: convex/_generated/api.d.ts was hand-edited (regenerate it); the dev watcher takes ~20 s to push.
