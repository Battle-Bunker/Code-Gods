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
| Pure rules: scoring, settings, mutators, preludes, utility families, calibration, pricing | unit, `node --test` | `lib/game-core`, `lib/game-types`, `lib/game-utilities`, `lib/object-views`, `lib/ai-player` | `pnpm --filter <pkg> test` |
| Sandboxes: determinism, limits, hostile input, Python ≡ old host | unit and integration | `lib/game-runtime/test` | `pnpm --filter @workspace/game-runtime test` |
| Engine pure helpers (`convex/lib/*`: spawn planning, clocks) | unit, `node --test`, no backend | `artifacts/engine/test/unit` | `pnpm --filter @workspace/engine test:unit` |
| Engine functions: rules, disclosure, permissions, receipts, ticks, AI seats | integration against the **live local Convex backend** | `artifacts/engine/test/game-*.test.ts` | start `pnpm --filter @workspace/engine dev`, then `pnpm --filter @workspace/engine test:game` |
| Auth: OIDC, sessions, device flow, credentials, static routes | integration (it starts its own backend; stop the dev engine first, since the checkout has one local deployment) | `artifacts/engine/test/auth.test.ts` | `pnpm --filter @workspace/engine test:auth` |
| Player CLI, assistant, token middleware | unit + live | `lib/player-client/test` | `pnpm --filter @workspace/player-client test` (reuses `CG_TEST_SITE_URL`) |
| Engine UI flows | browser e2e (Playwright) | `artifacts/code-gods/e2e/smoke.ts` | `pnpm --filter @workspace/code-gods e2e` |
| Several player apps, panels and HMR, assistant, static hosting | multi-client browser e2e (slow: about 20 minutes) | `artifacts/player-web/e2e/multi-client.ts` | commit first (the apps are worktrees of HEAD), then `pnpm --filter @workspace/player-web e2e` |

**Choosing a layer.** A rule belongs in a unit test of the library that owns it. A Convex function is tested
through its public API with real identities; mock nothing inside the engine. Browser e2e is only for behaviour
that needs a browser: HMR, rendering, multi-app isolation. Never add an e2e check for something an engine test
can catch.

## Repo rules

- **Disclosure is a contract.** Any new player-facing query or event field gets a disclosure assertion:
  another god's per-object scores, descriptor, agent source, seeds and `endAtWorld` must never appear. Extend
  `test/game-disclosure.test.ts` rather than grepping UI text.
- **Real identities, real auth.** Engine tests act as seeded users through real JWT paths or admin
  impersonation (`test/game-helpers.ts`). Never weaken `convex/auth/access.ts` for a test.
- **Fixtures stay gated.** Test-only Convex functions (`convex/testing.ts`, `convex/auth/testing.ts`) are internal
  functions and refuse to run unless `CODE_GODS_DEV` or `CODE_GODS_TEST_FIXTURES` is set. Don't add test-only
  branches to production functions.
- **Hand-derived expectations.** Scoring expectations come from game-core's documented formulas on literal
  inputs, or from hand-checked fixtures, never from the engine's own projection code.
- **Time.** Don't sleep a fixed time to wait for a tick; poll for the observable outcome with a bound
  (`waitFor` in `game-helpers.ts`, `until` in the e2e). Games under test set a long `halfLifeSeconds` unless the
  test is about the lifetime.
- **Economy-aware fixtures.** Agent sources in tests must be affordable. A 128-character string rotate costs
  about 273 bits per act; prefer `swapChars`, `add`, or a small `slide`.
- **A bug fix starts with a failing test** at the cheapest layer that reproduces it. The multi-client e2e found
  three engine bugs; each fix should also gain a fast test.
- **Before finishing**, run every suite your change can affect: at least the package's own tests, the root
  `pnpm run typecheck`, and `test:game` for any engine change. Report each by name with pass counts, including
  failures you didn't cause.
