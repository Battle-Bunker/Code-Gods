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
  1. Rebase onto develop (#205 landed). Keep #205's skill text. After the worker's correction, the owner prompt should be ~7,832 (On request)
     / ~7,946 (Autopilot) chars, under 8,000, so no trim is expected; still re-run the lib/ai-player test.
  2. Run the selective set: game-assistant, -queue, -modes, game-schema-migrations, game-disclosure, game-ai,
     game-query-cost, lib/ai-player and root typecheck. Then merge.
  3. Optional tests for the review fixes.
  4. The narrowing PR once dev and prod report the migrations done.
- Gotchas: convex/_generated/api.d.ts was hand-edited (regenerate it); the dev watcher takes ~20 s to push.

### Deploy safety (session_0119hWTT8rs9FPTwCbFNiPzZ), stopped 20:30
- PR #201 is pushed (head c687560), NOT merged.
- Covers: pinned tables, tick-failure banner with backoff (gameEngine.tickFailures), idle and game-over notices,
  the post-deploy tick check, and the game-deploy-survival test.
- Tested before the last commit: test:game green, test:mcp 17/17, unit 134, player-client 84, player-web 234,
  game-core 57, typecheck.
- The last commit merges develop (#202–#205) and renames `failures` → `tickFailures`. Root typecheck passes, but
  the engine run is untested: the local backend refused the push over a local-only row with the old field. No dev or
  production row has it, so no migration is needed.
- Thursday:
  1. Start a fresh local deployment.
  2. Run the full test:game and test:mcp.
  3. Merge.
  4. Release soon after: it protects live games across deploys.
- The ~1–3 min start window on re-keying deploys is documented in the PR as a known follow-up.

### Rules / typed params (session_0119hWTXb7nWu2F4Fp2GSwu6), stopped 20:30
- Merged into develop: #184, #191 (Picture Frame), #202, #203, #204, and #207 arithmetic+seeds (24a7ef6).
  136 of 137 families are typed.
- On a branch, no PR: feat/typed-params-bingo (179321d4) types Bingo Caller, the last family, with a new `set`
  param kind. It is based on #204, so on Thursday:
  1. Rebase.
  2. Take develop's lib/game-utilities/data/.
  3. Rerun scripts/rekey-typed-params.ts (it must say "0 left alone") and calibrate --check.
  4. Leave UNTYPED_FAMILIES empty; append typedParamsBingo* after typedParamsArithmetic* in runAll.
  5. Run the unit set, then merge.
- Left:
  - bingo_caller.
  - The typed-params narrowing, once migrations:status is done on dev AND prod: delete the legacy readers,
    UtilityFamily.upgrade, upgradeParams/upgradeDescriptor, the explainer's upgrade and the rekey script.
  - Set Spotter + the equal-opportunity audit.
  - PR 3 annotations by scoring unit.
  - PR 4 points tuples.
- Gotchas:
  - Never hand-merge data/calibration JSON: take develop's copy, re-run the rekey, regenerate manifest.json.
  - Grep for conflict markers before every rebase --continue (one slipped into #204's branch; repaired).
  - The full game-utilities and grid-lab suites take 10–15 min: run targeted files.
  - e2e:site isn't run locally; develop CI covers it.
- Late delivery: the rules worker received the Set Spotter / equal-opportunity brief and the #196 note only after
  the wrap-up, so neither was acted on. Give the equal-opportunity brief to Thursday's resume in full.
  - The owner's words: "Parameters should create peer variations within a rule family without any unfair asymmetry
    in scoring opportunity between them."
  - Set Spotter's binary diagonals option is the example.
  - Build an audit test with a shrinking allowlist.
  - Keep @workspace/game-utilities out of hot query modules; the engine test:unit catches it.

## More owner intentions recorded 3 Nov (not started; design these together with intention 1, the energy model)
Owner, verbatim (abridged only where marked):
- "[An energy cap of N acts' worth] is entirely the wrong paradigm. It gives an unfair advantage to agents whose
  acts are more information expensive. We want imposing change on the world to be uniformly expensive for everyone
  though. I want to make it far harder for agents to make radical changes to objects in one go (like setting every
  cell to red or 1) so that every object becomes a meaningful incremental battleground."
- **Mutators:**
  - Grid: the default agent mutation sets the value of one cell, or changes the colour of a row (much more
    expensive).
  - Number objects: change one digit, multiply by a number, or add a number. There is NO operation for setting the
    number; you could expensively iterate over digits and set them.
- **Superlinear change cost:** setting a row's colour should cost more than 4× setting one cell's (4×4 grid). The
  owner prefers a principled superlinear cost in how much of an object one mutation changes (to motivate
  incremental change) over a per-agent energy cap.
- **Power:**
  - Deities have a fixed power budget (energy/s).
  - They allocate shares of it to their agents and can re-allocate at will. This removes the motive for duplicate
    agents.
  - Unallocated power is the deity's own energy income, which pays for summoning.
  - A new agent starts with zero energy and a chosen share of the power budget.
- **Selection:**
  - The probability of selecting an agent for the next mutation is proportional to its current energy balance.
  - There is no eligibility filter: spend varies per object.
  - Balances may go negative.
  - There is no per-agent energy cap (unless one is still needed to force incremental change).
  - Agents spend by query information plus change information (intention 1).
- **Coordinator's analysis (3 Nov),** for this grid: 4×4, 3 colours.
  - The "proportion of objects on the post side" principle is exactly linear: −log2 P(post-set) for k independent
    cells is k·log2 C. Information of independent constraints adds, so a row costs exactly 4× a cell (6.34 vs
    1.58 bits).
  - The current repo cost (erasure + a 0.35-weighted quadratic motion term) is 4.02×: barely superlinear.
  - The principled superlinear form is the surprisal of the change under the maximum-entropy prior on change size
    given a fixed mean SQUARED change: P(k) ∝ exp(−βk²), so cost = a·k + b·k². With b = 1 bit, a row costs 8.6× a
    cell and a whole grid 109×. That matches the motion term's existing quadratic form, but needs a much larger
    weight. See the conversation for the full table.
