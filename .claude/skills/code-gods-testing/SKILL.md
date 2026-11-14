---
name: code-gods-testing
description: Use when writing, changing or reviewing tests in the Code Gods repo, and before finishing any change, to pick the right suite, run it against the local Convex engine, and apply test-driven-development here
---

# Testing in Code Gods

Apply the `test-driven-development` skill (vendored in `.claude/skills/`, from obra/superpowers) with these repo
specifics. Its rules stand: write the failing test first and watch it fail; name the break each test catches;
derive expectations by hand; exercise real code and don't assert on mocks; run the mutation check. This file says
*where* and *how* in this repo.

## Pick the cheapest layer that can catch the break

| Behaviour | Layer | Where | Run |
|---|---|---|---|
| Pure rules: lines, rules and their scores, valuation, views, the economy, the client's helpers | unit, `node --test` | `lib/v2-core`, `lib/v2-linear`, `lib/v2-valuation`, `lib/v2-views`, `lib/v2-economy`, `lib/v2-client`, `lib/ui-kit` | `pnpm --filter <pkg> test` (root `pnpm run test:v2` runs the main ones) |
| Operations: the affordance directory (every surface's buttons, palette, assistant tools) | unit, `node --test` | `lib/v2-affordances/test` | `pnpm --filter @workspace/v2-affordances test` |
| Sandboxes and agents: determinism, limits, hostile input, the example agents in both languages | unit and integration | `lib/v2-sandbox/test`, `lib/v2-agents/test` | build the Python bundle once (`pnpm --filter @workspace/v2-sandbox setup:python && pnpm --filter @workspace/v2-sandbox build:python`), then `pnpm --filter <pkg> test` |
| Engine pure helpers and v2 pure modules (deal, presets, artefacts), the query-cost table's coverage | unit, `node --test`, no backend | `artifacts/engine/test/unit` | `pnpm --filter @workspace/engine test:unit` |
| Engine v2 functions: the lobby, the contract of every operation, permissions, disclosure | integration against the **live local Convex backend** | `artifacts/engine/test/v2-*.test.ts` (helpers: `test/v2-helpers.ts`) | start `pnpm --filter @workspace/engine dev` and wait for `[dev] READY`, then `pnpm --filter @workspace/engine test:v2` |
| The deployed-build signal (`convex/version.ts`) | integration against the live local backend | `artifacts/engine/test/version.test.ts` | with the dev engine running, `pnpm --filter @workspace/engine test:version` |
| Query cost (R8 of `docs/convex-read-architecture.md`): every query a page subscribes to has a row | unit | budget tables `test/v2-query-budgets.ts` (v2) and `test/query-budgets.ts` (shared: auth, version, AI templates); `test/unit/query-budgets.test.ts` and `test/unit/v2-query-budgets.test.ts` check them | part of `test:unit` |
| Auth: Google sign-in via Better Auth (the test-only "fake" provider locally), device flow, credentials, player JWTs, static routes | integration (it starts its own backend; stop the dev engine first, since the checkout has one local deployment) | `artifacts/engine/test/auth.test.ts` | `pnpm --filter @workspace/engine test:auth` |
| The app's pure logic (`artifacts/player-web/src`: routes, next steps, palette commands, time, device approval, the dock's models) | unit, `node --test` | `artifacts/player-web/test` | `pnpm --filter @workspace/player-web test` |
| The app's site (rooms, practice partners, a live line game, one line, planning) at desktop and phone | browser e2e (Playwright) | `artifacts/player-web/e2e/v2-site.ts` | `pnpm --filter @workspace/player-web e2e:site` |
| The v2 views' look | browser screenshots (Playwright) | `artifacts/player-web/e2e/v2-views.ts` | `pnpm --filter @workspace/player-web e2e:v2-views` |

**Choosing a layer.** A rule belongs in a unit test of the library that owns it. A Convex function is tested
through its public API with real identities; mock nothing inside the engine. Browser e2e is only for behaviour
that needs a browser: rendering, layout, focus. Never add an e2e check for something an engine test can catch.

## Repo rules

- **Disclosure is a contract.** Any new player-facing query or event field gets a disclosure assertion:
  another player's rule, per-object values, agent source and seeds must never appear. Assert it in the v2 engine
  suite (`test/v2-contract.test.ts`) rather than grepping UI text.
- **Real identities, real auth.** Engine tests act as seeded users through real JWT paths or admin
  impersonation (`test/v2-helpers.ts`). Never weaken `convex/auth/access.ts` for a test.
- **Fixtures stay gated.** Test-only Convex functions (`convex/v2/testing.ts`, `convex/auth/testing.ts`) are internal
  functions and refuse to run unless `DEV` or `TEST_FIXTURES` is set. Don't add test-only
  branches to production functions.
- **Hand-derived expectations.** Scoring expectations come from the spec's documented formulas
  (`docs/engine-v2/spec.md`) on literal inputs, or from hand-checked fixtures, never from the engine's own code.
- **A reused local deployment lies to you.** Earlier runs leave their rooms and games behind; a test that counts
  rows must scope them to its own fresh users. When a deployment is dirty beyond that, wipe it and start again: stop
  `dev`, `rm -rf artifacts/engine/.convex/local`, start `dev`, wait for `[dev] READY`, `deploy-static`.
- **Time.** Don't sleep a fixed time to wait for a tick; poll for the observable outcome with a bound.
- **A bug fix starts with a failing test** at the cheapest layer that reproduces it; a bug an e2e found also gains
  a fast test.
- **Before finishing**, run your change's selective set once, when it is ready to merge (the `selective-testing`
  skill picks it from the paths you changed), plus the root `pnpm run typecheck`. Report each suite by name with pass
  counts, including failures you didn't cause. While you work, run only the file you are writing.
