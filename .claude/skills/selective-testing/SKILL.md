---
name: selective-testing
description: Use in the Code Gods repo before running any test suite, to pick the smallest set of suites that can catch a break in your own change and to run it sparingly (the one file you are writing while you work; the selected set once, when ready to merge), instead of re-running the whole long suite repeatedly
---

# Selective testing: test your change, once, when it is ready

The repo's suites are long (the live-backend engine suites, the browser suites), and an agent that
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
| A pure library (`lib/v2-core`, `lib/v2-linear`, `lib/v2-valuation`, `lib/v2-views`, `lib/v2-economy`, `lib/v2-client`, `lib/ui-kit`) | that package's `pnpm --filter <pkg> test`, plus the unit tests of packages that import the changed export (grep for it) | engine live suites, unless the engine's behaviour changes through it |
| `lib/v2-affordances` (an operation) | `pnpm --filter @workspace/v2-affordances test`, plus `test:v2` if the server side of the operation changed | — |
| `lib/v2-sandbox`, `lib/v2-agents` | that package's `test` (needs the Python bundle: `pnpm --filter @workspace/v2-sandbox setup:python && pnpm --filter @workspace/v2-sandbox build:python`) | browser suites |
| `artifacts/engine/convex/lib/*` pure helpers, `convex/v2` pure modules (`deal.ts`, `presets.ts`, `artefacts.ts`) | `test:unit` | — |
| A v2 engine function (`artifacts/engine/convex/v2/**`) | `test:v2` (the files that call it: grep the function name), plus `test:unit` (`v2-query-budgets` checks the query table) if a public query was added, removed or renamed | — |
| `convex/version.ts` | `test:version` | — |
| `convex/auth/*`, `agent/*` (OAuth, `/mcp`), `http.ts` routes | `test:auth` (stop the dev engine first) | — |
| `artifacts/player-web/src` logic | `pnpm --filter @workspace/player-web test` | browser suites, unless rendering or a page's data path changed |
| A site page's or pane's rendering or data path | add `e2e:site` (`artifacts/player-web/e2e/v2-site.ts`) | — |
| The v2 views' look (`lib/v2-views`, their panes) | add `e2e:v2-views` (screenshots) | — |
| Anything in TypeScript | root `pnpm run typecheck`, once, at the end | — |

Run the whole `test:v2` only when your change touches something every v2 engine test passes through:
- `convex/v2/access.ts`, `convex/v2/ops/define.ts`;
- `auth/access.ts`;
- `test/v2-helpers.ts`;
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
