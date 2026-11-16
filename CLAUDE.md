# Code Gods: notes for Claude Code

## How work ships (the owner's standing instruction)

- **Ship every task all the way.** Take each requested task to a pull request into `develop` and merge
  it yourself. The owner does not review pull requests; they give feedback only on the app's behaviour
  when they test it.
- **You own code quality.** Before merging:
  - review your own diff (the `code-review` skill at an effort that fits the change);
  - fix what it confirms;
  - run your change's selective set of suites, once, when it is ready to merge (`.claude/skills/selective-testing/SKILL.md`;
    how to write and run each suite: `.claude/skills/code-gods-testing/SKILL.md`). CI on `develop` is the full net;
  - make sure the root `pnpm run typecheck` passes;
  - make sure CI is green, if any runs.
- **Branches.** Branch from `develop` and target `develop`. Never push to or merge into `main` unless
  the owner asks.
- **Write tests as you develop:** efficient, discerning, test-first. Follow the `test-driven-development`
  skill (vendored from obra/superpowers) and this repo's `code-gods-testing` skill. Test the behaviour
  that would break, at the cheapest layer that can catch it.

## The owner's attention, and how to reason (standing instructions, 2026-11-16)

- **Ask only load-bearing questions.** "Don't waste my attention on asking what I think about cheaply changeable
  configuration parameters. We are massively bottlenecked on my attention and you need to help with triage to ask my
  attention only for architecturally load bearing design questions where changing direction on those areas later is
  costly. You should do all choosing of cheaply changeable parameters yourself with your own judgement."
- **Suggestions are evidence of what is wanted, not a parts list.** "We have accumulated a lot of mess of complexity
  from you repeatedly following my suggestions and corrections as literal instructions and adding bad ideas to fix
  dissonances you encounter that add complexity instead of noticing the dissonance and looking for a more elegant and
  simpler way to achieve the combined ecosystem properties we want." When a wanted property and a mechanism conflict,
  do not add a mechanism: say so, and look for the design in which the conflict does not arise.
- **Do not over-read narrow experiments.** "You need to become more self-aware of your propensity to overweight the
  results of experiments that include massive amounts of constraining assumptions." A simulation with a handful of
  scripted strategies is an existence proof that something can happen, never a property of the game ("one strategy
  dominates", "no dominant strategy" are both overreach). Label every claim as true by construction, seen in a narrow
  test (with its assumptions), or conjecture; prefer structural claims; write "how this could be wrong" for every
  diagnosis and proposal.
- **Times in Melbourne time.** "Always specify times in Melbourne timezone."
- **Keep the session list truthful.** Archive every delegated session whose work is complete, as it completes, so the
  live sessions show what is in progress.
- The map of the scoring and costing machine as built, and the shortlist of simpler designs (16 November):
  `docs/engine-v2/redesign/` on the `claude/redesign-*` branches.

## Reading data from Convex (the owner's standing instruction, 2026-11-02)

Never one integrated query for a page. Each component subscribes to what it renders: a collection is a paginated,
indexed skeleton query plus one `useQuery` per item, run by the item's component and dropped when it unmounts (lists
virtualised). Public queries read one document or one index page, never a whole table; hot fields (written every tick)
never share a document with cold fields other queries read; standings, totals, ranks and histories are written by the
tick as small documents; sign-in is required for everything, so every query is per viewer and must stay a few documents; in the app every piece of
server data is one shared live subscription that every component showing it refers to (no one-off reads, result
caches, client retry, throttling, polling or sampled history; one-off reads only in one-shot CLI commands and inside
Convex functions). The rules (R1–R9), the research
behind them and the redesign plan are in `docs/convex-read-architecture.md`; the summary is
`.agents/memory/convex-reads.md`; Convex's own audit workflow is `.claude/skills/convex-performance-audit`. A new page
query needs an entry in the query-cost gate (R8).

## The game is a metastable ecosystem; its logic is the owner's (standing instruction, 2026-11-14)

- **Critical design criterion.** The game must remain dynamic, interesting and resilient to metagame collapse. The
  owner: "We're trying to design a metastable ecosystem here that remains dynamic and interesting and we're explicitly
  trying to move away from a task that's like a static exam." The landscape over the players' combined utility
  functions is meant to be enormous and hard to search, "even for a frontier AI with a substantial amount of compute".
- **An optimum found is a bug.** "If you discover that optimal *solutions* are ever being found you should report this
  as a bug and try yourself to find appropriate ways to avoid the failure mode." Never build features, prompts or advice
  that help players reach or hold a fixed point (agreed destination states, settle-and-hold, copying one state). Report
  simulation results for dynamics (do objects keep moving, do states converge, does one strategy dominate), not only
  totals. An AI model's bias is toward single-point optimisation; correct for it.
- **Defence by locks, and cooperation on chosen states (owner, 2026-11-16).** "I think it's good that it becomes
  increasingly hard to defend higher energy/scoring objects because of the asymmetry in cheaply imposing costs relative
  to repairing what was destroyed ... But I also want it to be more possible to defend higher scores with extra
  investment of energy." The mechanic: a **lock** on an object with an attached **predicate** that the object's current
  state meets (for example "the y-intercept is prime", "the gradient is −2", a floor on a reading); "to push the object
  to a state that doesn't meet that predicate, one must pay the energy cost to remove the lock"; "the expense of creating
  the lock and sustaining it proportional to the information content of the predicate"; "any agent that gets offered
  interaction with that object can query the locks and add or subtract energy from any given lock with their available
  energy balance." This narrows the bullet above: locks, and players agreeing on states and strategies, are wanted. "It's
  ok for specific states to be calculated in advance and then effortfully pursued by multiple cooperating agents over
  many steps (and then locked collaboratively too), as long as such high value states can't be easily reached in one
  step and as long as multiple distinct high value states need to be found to do well in aggregate." What stays a bug: a
  high-value state reachable in one step, or one state being enough to do well. Design and status:
  `docs/engine-v2/locks.md`.
- **Agents are dynamic hill climbers.** Objects are unique within a game; a far move in one act costs at least the path
  of small ones; "all strategies should be incremental hill climbing towards profitable combined states."
- **Representation shortcuts are wanted (owner decision 25).** The far-move rule is about the *size* of an additive
  change in one act: an amount added costs in proportion to its size, and more in one act than as a path. Mutators
  that operate in another representation (swap, rotate, reverse, spin, mirror, stretch by a factor) are intended
  shortcuts, priced as choices (or by digits), never by the unit path: "That makes the state space more interestingly
  shaped in terms of cost function topology and more like real life exploration of problem spaces."
- **Tie-breakers tie to the primary (owner decision 29).** A secondary is a relation between the primary's anchor and
  another aspect of the object (e.g. the gcd of c's nearest whole number with ⌊m⌋), never an independent wish (e.g. "m
  close to a large prime" beside a c-primary). Rules may be entangled to different degrees (decision 27); no maxima
  (decision 26): coefficients are uncapped and value curves extend without bound.
- **Unbounded hills, with adversaries (owner decision 30).** "Bigger is better" hills are wanted. What prevents
  collapse is adversaries to the climb and diversity of goals: rules in deliberate tension (small values against big,
  smooth numbers against large primes, opposite signs and directions on shared anchors), so that one basic strategy
  rarely raises several seated rules' bits at once. The bug found 14 Nov (a stretch to y = −2x + 734 paid 102k points)
  was two seated rules rewarding the same number in the same direction with no adversary; it is fixed in the pool and the
  deal, not by removing hills. A value tail never grows faster than the φ of the cheapest state that reaches it.
- **The old game is the spec; only its implementation is disposable.** "The old code acts as a precious spec of what I
  want and a demonstration of what I'm trying to accomplish, even though the specific implementation of that logic is
  not precious." The owner (later the same day): "keep the rules we already designed prior to this engine upgrade, but
  don't treat the old design as gospel, just as a strong guiding light." So the default is the old rule. A rule is never
  dropped silently, by a session's "judgment call", or to make the work easier. The coordinator (not a worker session)
  may trial a change to an old rule when there is an obvious way it would cohere better with the new engine and make
  the game more dynamic, and must then "loudly declare" it to the owner with the motivation, and report the empirical
  effects once known (recorded in `docs/engine-v2/owner-decisions.md` as a trial, not as the owner's decision). A worker
  session that sees such a change proposes it to the coordinator. The instruction below not to be attached to prior
  work is about code.
- **What is wanted and what is the bug.** Hill climbing a combined landscape that improves several players' rules at
  once is wanted. The bug is when really high peaks are easy to find (by search, by a formula, or by being told the
  rules). The owner has little time for detailed decisions: learn the principles and make good calls.
- **Every rule family passes `docs/engine-v2/design-principles.md` before it is dealt** (owner, 2026-11-15): an
  unbounded main part, a long ladder, a tie-breaker defined by the main part's value (stepping up the main part restarts
  the tie-breaker's climb), many dealable instances that are close to perpendicular, named adversaries. A pull request
  that adds or changes a dealt rule carries that file's check table. The coordinator re-reads the file at every check-in.
- Details, and what went wrong on 14 November: `.agents/memory/metastable-ecosystem.md`. Departures made during the
  rebuild: `docs/engine-v2/v1-audit.md`. Why optima were easy to find: `docs/engine-v2/landscape-analysis.md`.

## Engine v2 (the owner's standing instructions, 2026-11-14)

The engine is being rebuilt from a fresh slate, for linear equations first, in new `lib/v2-*` packages and new `v2*`
Convex tables, and integrated into the existing app (`docs/engine-v2/spec.md`, `docs/engine-v2/integration-plan.md`;
the decisions behind them: `docs/engine-v2/owner-decisions.md`). The owner, verbatim: "I don't care about throwing away
prior work. It will still be available in git. You have a burdensome bias towards attachment to keeping prior work and
backwards compatibility that tends to accumulate mess and technical debt. Try to adjust against that bias for this
project. We are in rapid exploration mode which is cheaper and faster than ever with AI coding ... Being encumbered by
backwards compatibility baggage and attachment to prior work is one of the biggest hazards to our rapid exploration
priority." So, in v2 work (decision 15):

- **Delete old code early; never game rules.** Everything as it stood before v2 is on the branch `archive/engine-v1`
  (never push to it). Old code leaves `develop` as soon as v2 replaces it (integration plan §5.8) and lives only on the
  archive branch: no legacy copies, no adapters, no frozen v1 directories kept "for reference" on `develop`. The only
  game features the owner asked to delete are integer and string objects. A session, not the owner, also deleted paid
  looks, hold rarity, score noise and the other setups and credited the owner's decision 15 for it
  (`docs/engine-v2/v1-audit.md`). Since then paid looks and score noise are restored, and the owner settled hold
  rarity on 15 November: not added unless there is a good reason, and the measurement found none (decision 43). The
  other setups (v1's other grid boards) are still open with the owner. No session deletes a game feature again
  without the owner's own words. The status of every v1 behaviour is the table in `docs/engine-v2/v1-audit.md`.
- No compatibility with stored games, old calibration tables, old settings or the old event log.
- Every operation is an affordance in one directory (`lib/v2-affordances`, owner decision 16) that generates the
  assistant tools, MCP, CLI, command palette and buttons; never add an operation to one surface by hand.
- Nothing in v2 imports from the old rule/object/annotation/calibration libraries (`game-types`, `game-utilities`,
  `game-core`, `object-views`, `player-client`, `ai-player`, `game-runtime`); copy and clean what is good.
  `lib/v2-core/test/import-boundary.test.ts` enforces it.
- Stored v1 data while v1 is being deleted: widen or loosen the validators of deleted fields so existing rows still
  load; no data migrations for deleted features and no row deletions (rows go in D3, with the owner's sign-off). The
  schema-migration steps below do not apply to v2 tables until v2 holds data worth keeping.

## Orientation

- Product rules and history: `.agents/memory/*.md`.
- Architecture: `docs/convex-migration-plan.md`; how pages read Convex: `docs/convex-read-architecture.md`.
- API: `docs/engine-api.md`.
- Pilot and deploy: `PILOT.md`. A push to `develop` deploys the dev Convex deployment and a push to `main` deploys
  production (`.github/workflows/deploy.yml`, PILOT.md "Automatic deploys").
- Preview deployments (a branch on its own Convex preview, label `preview` on its pull request): `docs/preview-deployments.md`.
  Older design variants and setups: `docs/design-explorations.md` (a pointer to `archive/engine-v1`).
- Running locally (no Convex account needed): `pnpm --filter @workspace/engine dev`. It starts the official
  CLI's local Convex backend plus a stand-in OIDC provider, which Better Auth offers as the test-only provider "fake" beside Google.

## Schema migrations (the owner's standing instruction, 2026-11-02)

Never wipe or reset stored data to get past a schema change: migrate it, as Convex recommends
(the [`@convex-dev/migrations` component](https://www.npmjs.com/package/@convex-dev/migrations), whose README sets out these steps;
[Stack: "Intro to migrations"](https://stack.convex.dev/intro-to-migrations) and
["Migrating data with mutations"](https://stack.convex.dev/migrating-data-with-mutations)).

1. **Widen.** Make the schema accept the old and the new shape: a new field as `v.optional(...)`, a removed value kept
   in its union, a removed field made optional. Code reads both shapes (`?? default`). Writers write the new shape.
2. **Migrate.** Add `export const <name> = migrations.define({ table, migrateOne })` in
   `artifacts/engine/convex/migrations.ts`, idempotent (a row already in the new shape is left alone; return a patch
   or nothing), and append it to `runAll`. The deploy workflow runs `scripts/run-migrations.mjs` after `convex deploy`;
   it starts `runAll` and waits until `migrations:status` reports every one `success`, failing the deploy otherwise.
   `pnpm --filter @workspace/engine dev` runs them on the local deployment too. Test it on legacy rows
   (`test/game-schema-migrations.test.ts`: write the old shape with a `convex/testing.ts` fixture, run `runAll` with
   `reset: true`, check every row, run again).
3. **Narrow.** Only after dev **and** production report the migration done (`npx convex run migrations:status
   [--prod]`), a later PR makes the field required (or drops the old value) and removes the fallbacks. Convex refuses to
   deploy a schema the stored rows do not match, so a premature narrowing fails the deploy instead of corrupting data.

Deleting a field or table follows the same steps (widen to optional, migrate it away, then remove it). The older
hand-rolled steps in `convex/migrations.ts` (setupsV2, aiSeatNames, assistantPerGame) predate the component and keep
their own workflow steps; new migrations never take that route.
