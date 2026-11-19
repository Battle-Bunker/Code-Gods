# Status: release readiness (promoting develop → main), worker session, 16 Nov 2026

Labels: **built** (merged and checked), **seen narrowly** (observed once, under stated conditions), **guess**.
Times are Melbourne (AEDT).

## 1. What I was asked
Find out what promoting `develop` (engine v2) to `main` (production, still v1) would do, and make it safe:
schema vs stored production rows, migrations, the deploy workflow and secrets, what players see at the switch,
operational limits, rollback, a go/no-go checklist. Report: `docs/engine-v2/release-readiness.md`. Never touch
production. Later asks from the coordinator: fix PILOT.md (M10), fix deploy-run cancellation, track 16 Nov schema
changes. Paused by the owner ~13:00 16 Nov.

## 2. Merged / unmerged
Merged into develop: #913 (auth key pre-push check `scripts/check-auth-keys.mjs`, post-push `auth/keysCheck:deployed`,
`test/unit/production-schema.test.ts` + `test/fixtures/production-schema.json`, first report), #942 (PILOT.md for v2,
owner's pre-promotion list, rollback runbook), #966 (deploy workflow: one run per branch, never cancel in progress;
`checks` skipped not failed on a cancelled part; `.github/scripts/deploy-concurrency.test.mjs`), #997, #1077 (report
updates). Unmerged: nothing. Nothing was ever pushed to `main`.

## 3. Unfinished plan (next steps if a release is ever attempted)
1. Owner runs, with the production key, `node scripts/check-auth-keys.mjs` in `artifacts/engine` (read-only); fix by
   `gen-jwt-key --set` / `rotateKeys` if it names a variable. Confirm `ANTHROPIC_API_KEY` on production.
2. Refresh `test/fixtures/production-schema.json` only after a promotion (it is main 2058deaf's schema).
3. Measure tick time and bytes per game on a cloud deployment (dev): stream `npx convex logs --success` with the dev
   key during a real game, summarise per function (I had a script; no game was played while it ran). Not measured.
4. `npx convex export --prod` before any promotion; agree with the owner that v1 rooms/games/replays vanish from the UI.
5. Locks and number-law schema checks were dropped (not landing); recheck any new v2 schema with the three checks in
   the report's "Changes landing on 16 November" table.

## 4. Obstacles and things the docs do not say
- **built:** before 13 Nov `auth.config.ts` never inlined `BETTER_AUTH_JWKS`/`PLAYER_JWT_JWKS` (Convex's runtime lists
  no env keys), so production has never verified with those values; a stale value would break sign-in at promotion.
  The pre-push check turns that into a red deploy with production untouched.
- **built:** the static `BETTER_AUTH_JWKS` must be an array of exactly one key: the Convex Better Auth plugin sorts
  keys with Date methods on JSON numbers, which throws with two keys. Its private key is encrypted with
  `BETTER_AUTH_SECRET`; changing the secret without `rotateKeys` breaks signing.
- **built:** `main` is an ancestor of `develop` (a shallow clone wrongly reports "unrelated histories"; unshallow first).
- **built:** Convex validates only tables listed in the schema; the v1 tables are `v.any()` until D3, so v1 rows
  validate. `aiTemplates.provider` widened with `"builtin"`: a builtin row (tombstones count) blocks a rollback push.
- **seen narrowly:** before #966 every develop push cancelled the previous gate, and `checks` reported *failure* for a
  cancelled run. After #966 the first three started runs all completed (ffa7a731, 67597754, 361c6556).
- **seen narrowly:** dev deploy lagged develop by ~11 merges (~6 min) under ~20 merging sessions (16 Nov 12:57).
- Tooling: the production key in the environment is off-limits (permission guard refused a read; the coordinator
  forbade any use). `npx actionlint` was blocked; YAML validated with PyYAML plus a static test instead.
- **guess:** v1's pending scheduled jobs fail once each after the push and stop (Convex docs do not describe it).
- Not measured: Convex function limits against real tick sizes; bytes per game after #865; AI cost per game.

## 5. Obsolete after the 16–17 Nov scoring rebuild
- The release analysis of schema, workflow, auth and rollback does not depend on scoring and stays valid until the
  schema changes again (the production-schema test guards that).
- **guess:** the report's "Changes landing on 16 November" table and §5 numbers (tick timings, writes per game, AI
  cost) describe the engine before one-number utilities and energy as bits of surprise; re-measure.
- PILOT.md's "First smoke game" points to `docs/engine-v2/spec.md` for rules and energy, which the rebuild changed.
