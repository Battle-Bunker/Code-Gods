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
- **Owner follow-up (3 Nov):**
  - Agreed: cost = W + β·W² per act.
  - AI-facing docs (skills, prompt, engine-api) must state clearly the incentive this creates: prefer incremental
    agents.
  - Change size must NOT depend on a static lens (e.g. digits). Examples:
    - ×7 is cheap; ×7⁴ costs more than 4× it;
    - incrementing digit 3 costs less than ⅓ of incrementing digits 1, 3 and 5.
- **Coordinator's proposal: operation-based, not lens-based.**
  - Each object type has a small set of ELEMENTARY mutators:
    - Grid: set one cell's colour or symbol;
    - Int: add d·10ᵖ (or increment one digit), multiply by m.
  - Each elementary mutator has its own information cost w = the surprisal of its parameters under a max-entropy prior.
    Magnitudes use a universal integer prior, so w(×m) ≈ log2 m (+ the op choice), and w(×ab) ≈ w(×a) + w(×b).
    Overwriting ops add their erased bits.
  - Convenience ops (paint a row, ×2401) are priced as their decomposition into elementary mutators.
  - An act's W = Σ the elementary-mutator costs of its calls, i.e. the act's description length in the mutator language.
  - charge = W + β·W² (plus read bits). This is the max-entropy prior over act description length with a fixed
    E[W²].
  - Check against the owner's examples:
    - row = 4 cells, so W is 4×, the linear part 4× and the quadratic part 16×;
    - ×7⁴: W = 4·w(×7), more than 4× the cost;
    - digits 1, 3, 5: W = 3w, more than 3×.
  - Splitting a change across acts is the intended route (each act needs its own selection); within an act, the
    quadratic falls on the total W.
- Terminology (owner, 3 Nov): use "mutator", never "generator". The code already says mutators
  (lib/game-types/src/mutators.ts). Elementary mutators are priced by their own information cost; composite
  mutators (paint a row, ×2401) are priced by their decomposition into elementary ones. Use these terms in the
  code, the docs and the AI-facing text.

## Rule balance: brittle vs robust structures (owner question 3 Nov; analysis, not started)
- Owner: in play-tests, simple structures (all one colour) earn points far more easily than lattice structures
  (chessboards). One disrupted lattice cell breaks up to 4 blocks; one disrupted red cell costs one cell.
- Coordinator's sim (4×4, 3 colours; "more reds" vs "red/green 2×2 chessboards"; greedy owner edits vs random
  single-cell edits):
  - At max, one random edit costs reds 0.67 of 16 (4%) and chessboards 1.5 of 9 (17%).
  - Steady score and static-rarity bits earned at each owner share of edits:

    | Owner share | Reds | Chessboards |
    |---|---|---|
    | 0.50 | 92% of max, 20.2 bits | 78%, ≈6–8 bits* |
    | 0.33 | 77%, 13.1 bits | 48%, 8.1 bits |
    | 0.20 | 58%, 5.8 bits | 23%, 5.0 bits |

    *Top chess levels were unseen in the static sample, so this cell is underestimated.
  - So the same effort earns very different bits: static rarity ignores maintainability under contest.
- Math: brittleness is high-order interaction.
  - In the Efron–Stein/Fourier decomposition, reds is degree 1 (each cell contributes alone). Chessboard blocks are
    degree-4 terms.
  - Noise stability Stab_ρ = Σ ρ^|S| f̂(S)² decays fast for high-degree mass.
  - Total influence (expected loss per random edit) is higher.
  - Single edits give little gradient: partial blocks score 0.
- Principled fix (owner's suggestion, refined): calibrate rarity against a reference distribution generated by the
  game's dynamics, not the i.i.d. uniform prior.
  - The owner proposed: random sequences of mutators weighted by inverse cost.
  - Refinement: weight each mutator by 2^(−cost), which is consistent with cost being bits = −log2 its prior
    probability.
  - Caveat: a pure undirected random walk of single-cell mutators has the uniform prior as its stationary
    distribution, so it only changes rarity through cheap composite mutators (it favours reachable/simple
    structures: an algorithmic-probability prior). It does NOT capture brittleness.
  - To capture brittleness, the reference process needs the contest: a goal-directed optimizer for U with a
    reference share of edits, plus 2^(−cost)-weighted mutator noise from others, run T steps.
  - Payoff bits = −log2 P_ref(U ≥ u). Equal effort then earns equal expected bits across rules.
  - It fits the existing Monte Carlo calibration pipeline (simulated per family/shape; expensive but offline).
- Owner's refinement (3 Nov): avoid intelligent-player simulations. Measure how far boards at a given score fall
  under weighted random mutations.
  - Coordinator's formalisation: "hold rarity" = −log2 P(U(x) ≥ u AND U(x′) ≥ u), where x ~ prior and x′ = x after
    m random mutations weighted 2^(−cost).
  - That's static rarity + −log2 P(hold | ≥ u). It is cheap: prior sampling, MCMC for high levels, noise, and no
    player.
  - Quick test (4×4×3, single-cell noise), adjustment for m = 2:
    - reds: +0.5 bits at u ≥ 7, +1.8 at u ≥ 12 (10.4 static);
    - chessboards: +1.2 at u ≥ 2, +2.1 at u ≥ 4 (10.0 static), +2.8 at u ≥ 5.
  - At matched static rarity the gap is real but modest (~0.3 bits at ~10 bits). It grows with level, and
    chessboards' hold probability falls much faster.
  - The contest sim showed a larger effect. Part of it is gradient sparsity (few improving single mutations), which
    a hold measure doesn't see. A cheap companion metric: P(a random mutation raises U) at level u.
  - Next: sample high levels with MCMC; compare hold rarity, and hold + ascent, against the contest sim on several
    families; pick the formula.
- Choosing the noise amount m (owner question 3 Nov). Proposal: don't fix m; derive it from the game's own mutation
  economy.
  - The noise that matters is how many FOREIGN mutations hit an object before its owner can act on it again.
  - If the owner's share of mutation events on an object is q, that count is geometric: P(m) = q(1−q)^m, mean
    (1−q)/q (memoryless: each event is the owner's with probability q).
  - So hold = Σ_m q(1−q)^m · P(U(x′_m) ≥ u | U(x) ≥ u).
  - q comes from the settings: 1/(number of deities) under symmetric play, or the expected share from the
    power/selection model (energy-weighted selection).
  - It's the same q for every rule in a game, so rules stay comparable, and calibration tables gain a key or
    parameter for q.
