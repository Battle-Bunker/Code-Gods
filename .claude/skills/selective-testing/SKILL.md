---
name: selective-testing
description: Use in the Code Gods repo before running any test suite, to pick the smallest set of suites that can catch a break in your own change and to run it sparingly (the one file you are writing while you work; the selected set once, when ready to merge), instead of re-running the whole long suite repeatedly
---

# Selective testing: test your change, once, when it is ready

The repo's suites are long (the live-backend engine suite, the MCP suite, several browser suites), and an agent that
re-runs them after every edit, rebase or flake spends most of its time waiting. The owner's rule
(2026-11-03): **each agent builds a selective set of suites for its own work, and runs it sparingly, ideally only
when it is ready to merge.** CI on `develop` (`.github/workflows/deploy.yml`) is the full safety net.

This skill decides *which* suites and *when*. `code-gods-testing` still says *how* to write a test and run each suite;
`test-driven-development` still applies.

## While you work: one file, not a suite

- Run only the test file you are writing or changing, alone:
  - Engine: `node --experimental-transform-types --disable-warning=ExperimentalWarning --test test/<file>.test.ts`
    from `artifacts/engine`, with the local engine running.
  - Unit packages: `node --test` on that file (see the package's `test` script for its flags).
- Red, green, refactor on that file. Never run a whole suite to see one test fail.
- Typecheck only the package you changed (`pnpm --filter <pkg> typecheck` or its `tsc -p`), and only when you want
  the compiler's answer.

## When you are ready to merge: build your selective set once

List the paths your branch changes (`git diff --name-only origin/develop...HEAD`). Take the union of the rows they
match. That union is your set. Write it in the PR description, with each suite's pass count.

| You changed | Run | Not needed |
|---|---|---|
| Docs, `.agents/`, `.claude/skills/`, comments only | nothing (root typecheck only if a `.ts` file changed) | everything else |
| A pure library (`lib/game-core`, `lib/game-types`, `lib/game-utilities`, `lib/object-views`, `lib/ai-player`, `lib/ui-kit`) | that package's `pnpm --filter <pkg> test`, plus the unit tests of packages that import the changed export (grep for it) | engine live suites, unless the engine's behaviour changes through it |
| `lib/game-runtime` | `pnpm --filter @workspace/game-runtime test`; plus `test:game`'s sandbox files (`game-sandboxes`, `game-agents*`) | browser suites |
| `artifacts/engine/convex/lib/*` pure helpers | `test:unit` | — |
| An engine function (`artifacts/engine/convex/**`) | the `test/game-*.test.ts` files that call it (grep the function name and its `api.` path), plus `game-disclosure` if a player-facing query or field changed, plus `game-query-cost` if a page query's reads changed, plus `game-schema-migrations` if the schema or a migration changed | the rest of `test:game` |
| The MCP tool registry, `agent/*`, OAuth | `test:mcp` | browser suites |
| `convex/auth/*`, `http.ts` routes | `test:auth` (stop the dev engine first) | — |
| The public function catalogue (adding, removing or renaming a public function) | `pnpm --filter @workspace/player-client test` (catalogue tests) and regenerate `docs/engine-api.md` | — |
| `artifacts/player-web/src` logic | `pnpm --filter @workspace/player-web test` | browser suites, unless rendering or a page's data path changed |
| A site page's rendering or data path | add `e2e:site` | `e2e` (multi-client) |
| Dock panels' rendering | add `e2e:panels` | `e2e` (multi-client) |
| Account mode, sign-in gate | add `e2e:account` | — |
| HMR, several apps at once, static hosting of player apps | `e2e` (multi-client, about 20 minutes). Only for these. | — |
| Anything in TypeScript | root `pnpm run typecheck`, once, at the end | — |

Run the whole `test:game` only when your change touches something every engine test passes through:
- the tick (`engine/loop.ts`, `engine/tick.ts`);
- `game/state.ts`;
- `auth/access.ts`;
- `game-helpers.ts`;
- the schema of a table most tests write.

## When to run it, and when not to run it again

- **Once, when the branch is ready to merge.** Not after each commit.
- **After a rebase, only if the rebase changed files your set covers.** Check with `git diff ORIG_HEAD HEAD --name-only` after the rebase. A clean rebase onto unrelated work needs no re-run: CI on `develop` checks the combination.
- **After a review fix, re-run only the files the fix touches.**
- **A failure outside your change.** A test that fails in code your branch did not touch:
  1. Run that one file again, alone.
  2. If it passes, note it as a flake in the PR and merge.
  3. If it fails again on `origin/develop` too, it is not yours. Report it, and don't chase it on your branch.
- **One backend-heavy run at a time per machine.** If another agent's engine is running on this container, expect
  timings to be inflated and do not treat a time budget failure as real until it reproduces alone.

## After merging

- Check the `develop` run of `.github/workflows/deploy.yml` once it finishes (checks plus the dev deploy and its
  smoke test).
- If it fails on your change, fix it forward in a small PR.
- If it fails elsewhere, report it.

## Keep your work small so your set stays small

- One concern per PR. A PR that changes the schema, the tick, queries and a page at once needs nearly every suite.
  Split it so each PR's set is short.
- Before parallel work, give each agent files no other agent touches. Shared hot files (`convex/migrations.ts`,
  `test/query-budgets.ts`, the schema) go to one agent at a time.
