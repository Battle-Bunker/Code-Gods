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

## Orientation

- Product rules and history: `.agents/memory/*.md`.
- Architecture: `docs/convex-migration-plan.md`; how pages read Convex: `docs/convex-read-architecture.md`.
- API: `docs/engine-api.md`.
- Pilot and deploy: `PILOT.md`. A push to `develop` deploys the dev Convex deployment and a push to `main` deploys
  production (`.github/workflows/deploy.yml`, PILOT.md "Automatic deploys").
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
