# Release readiness: promoting `develop` (engine v2) to `main` (production)

Written 16 November 2026 (UTC) against `origin/develop` at 2acf4a7c (#903) and production's `main` at 2058deaf (#268,
deployed 11 November, deploy run 42983782973). Read-only: nothing here touched production. This session had no
production deploy key, so **no production state was inspected**; everything below comes from the repository, the
GitHub Actions history, the dev deployment's deploy runs and a local backend. Items that depend on production's
stored values are marked *unknown* and say what checks them.

## 0. Summary

No hard blocker was found. The promotion is a fast-forward (`main` is an ancestor of `develop`), the schema accepts
every row production can hold (now a unit test), and the migrations touch only v2 tables, which are empty on
production. The one serious risk was latent: since 13 November `auth.config.ts` really inlines `BETTER_AUTH_JWKS` and
`PLAYER_JWT_JWKS`, two production env values that production has **never used**. If either is stale, sign-in or every
player/MCP token breaks at the push. #913 makes the production deploy check them **before** the push and stop if they
disagree, so the worst case is a red deploy with production untouched, not a broken site.

**What a production user sees at the switch (the owner must agree to this before promoting).** Every v1 room, game
in progress, ended game and replay disappears from the app; the rows stay in the database, untouched, until D3.
Accounts are kept and players stay signed in. Old room and game links show "not found" messages, not errors.
Room-bound device and MCP credentials stop working; account-wide ones keep working. AI spend counters start again at
zero (the code's ceilings still apply). Details: §4.

## 1. Schema against stored production data

Convex validates every stored document of every table **listed** in the pushed schema and fails the push on a
mismatch; tables not listed are not validated (docs.convex.dev/database/schemas, "Schema validation").

Method: both schemas were bundled and exported table by table (`TableDefinition.export()`), and compared.

| Production table(s) (`main`) | `develop` | Stored v1 rows validate? |
|---|---|---|
| 49 v1 game tables (`games`, `rooms`, `members`, `objects`, `agents`, `standings*`, `calibration*`, `panel*`, `assistant*`, `code*`, `manifests`, `aiUsage`, `agentJobs`, …) | `defineTable(v.any())`, no indexes (`V1_TABLES` in `convex/schema.ts`) | Yes: `v.any()` accepts anything. Indexes are only dropped. |
| `aiTemplates` | same fields; `provider` gains `"builtin"` | Yes: a pure widening. |
| auth tables (`auth/tables.ts`), agent/OAuth tables (`agent/tables.ts`), `siteBuilds`, `runtimeAssets` | identical validators | Yes. |
| components: `betterAuth`, `migrations`, `engineSite` (static hosting) | the same three, the same package versions (`@convex-dev/better-auth` 0.12.6, `migrations` 0.3.7, `static-hosting` 0.2.1) | Yes: component schemas unchanged. |
| (none) | 46 new `v2*` tables | Empty on production; nothing to validate. |

Proof: `artifacts/engine/test/unit/production-schema.test.ts` (#913) loads `test/fixtures/production-schema.json`
(the exported schema of `main` 2058deaf) and asserts every production table is still in develop's schema with a
validator that accepts everything the old one did. Mutation-checked: dropping `aiUsage` from `V1_TABLES`, or removing
`"openai"` from `aiTemplates.provider`, fails it. It runs in `test:unit`, so in every PR and the deploy gate.
Tables that exist in production's database but are in neither schema (dropped before 11 November) are not validated
and need nothing.

Further evidence: the dev deployment held v1 data when D2 (a7a1e798, 14 November) loosened these tables, and every dev
deploy since has pushed this schema successfully (e.g. runs 43775807481, 43776170158).

**Green.** After promotion, refresh the fixture from the new `main` so the test guards the next release (the dump: bundle
`artifacts/engine/convex/schema.ts` with esbuild, map each table to `export().documentType`).

## 2. Migrations on first deploy

The workflow's only migration step is `node scripts/run-migrations.mjs`: it starts `migrations:runAll` and polls
`migrations:status` until all succeed (timeout 30 min, `MIGRATION_TIMEOUT_S`).

| Migration | Table | On production | Idempotent |
|---|---|---|---|
| `stripLevels` | `v2Moves` | empty table: no-op | yes (skips rows without `level`) |
| `stripObjectLevels` | `v2ObjectValues` | empty: no-op | yes |
| `stripRuleLadders` | `v2Rules` | empty: no-op | yes |
| `noiseKeys` | `v2Games` | empty: no-op | yes (skips ended games and games with a key) |
| `shownValues` | `v2ObjectValues` | empty: no-op | yes |

Expected time: seconds (five empty scans). None touches a v1 table. The component's state table on production
already holds v1's finished migrations under other names; they are not in `RUN_ALL` and are ignored.

The hand-rolled v1 steps (`setups:ensureSeeded`, `migrations/node:setupsV2`, `migrations:aiSeatNames`,
`migrations:assistantPerGame`, `engine/holdData:scheduleWarm`, the runtime/calibration probes and
`check-live-games.mjs`) are gone from develop's workflow and their functions are deleted; they do not run. Their
targets were v1 tables and are moot. **Green.**

## 3. The deploy workflow for `main`

`.github/workflows/deploy.yml` on push to `main`, environment `production` (one secret: `CONVEX_DEPLOY_KEY`).

1. `lookup`: finds a develop run whose gate passed on the identical tree. A fast-forward promotion of a commit whose
   develop deploy run passed its `checks` reuses it; otherwise the gate (`typecheck`, `unit`, `runtime`) runs in full
   and the deploy waits for `checks`.
2. `deploy`: install; build the pinned CPython bundle; wait for the gate; then
   - **Check the deployment's env vars** (names only): requires `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET`, `PLAYER_JWT_PRIVATE_KEY`, `PLAYER_JWT_JWKS`, `SEASON_SALT`, `ADMIN_EMAILS` (the same list
     as `main`, which deployed green on 11 November); refuses `DEV`, `TEST_FIXTURES`, `AI_MOCK`, `FAKE_OIDC_URL`,
     `PREVIEW_SIGN_IN_CODE` and any `CODE_GODS_*`. **New (#913):** `scripts/check-auth-keys.mjs` reads the four auth
     key values into memory (never printed) and stops the deploy, before anything is pushed, unless `PLAYER_JWT_JWKS`
     holds `PLAYER_JWT_PRIVATE_KEY`'s public key and `BETTER_AUTH_JWKS` is one unexpired key that decrypts with
     `BETTER_AUTH_SECRET` and pairs with its public key. Checked against a real `rotateKeys` value on the local backend.
   - **New (#913), last in the smoke test:** `npx convex run auth/keysCheck:deployed` mints a player JWT and signs a
     Better Auth token with the deployment's keys, and verifies both against the JWKS the pushed auth config inlined
     (catches a value changed after the push, or a config that fell back to fetching by URL). Checked on the local
     backend, including a player key changed without a push (fails, naming `PLAYER_JWT_JWKS`).
   - `convex deploy --typecheck enable`; `version:record`; `BETTER_AUTH_JWKS` only if unset (it is set on production);
     migrations (§2); `upload-runtime` (the pinned Python bundle, re-hashed by the server); `deploy-static
     --if-changed`; smoke test (`/api/health`, `/mcp` answers 401 without a token).
3. Not checked by the workflow: `ANTHROPIC_API_KEY` (AI seats and the assistant only; without it they fail with "No AI
   model is configured on this deployment", `v2/ai.ts`). `SEASON_SALT` is still required but nothing in develop reads it.

Sign-in: Google through Better Auth, unchanged; the Google OAuth client's redirect URIs are unchanged because the site
URL and `/api/auth/*` paths are unchanged. The test-only "fake" provider needs fixtures on plus `FAKE_OIDC_URL`, the
preview provider needs `PREVIEW_SIGN_IN_CODE`: both refused by the env check. Test fixtures (`v2/testing.ts`,
`v2/panelTesting.ts`, `auth/testing.ts`) refuse to run without `TEST_FIXTURES`/`DEV`; every unguarded one is internal.
Time scale is an internal mutation only (default 1). Error details in the UI are dev builds only.

`PILOT.md` "Automatic deploys" still describes v1 steps (`upload-calibration`, runtime/calibration probes); the
workflow above is authoritative.

## 4. What a production user sees at the switch

- **Accounts survive.** Better Auth's component and the auth tables are unchanged; signed-in users stay signed in.
  Browser Convex tokens last 10 minutes and are re-minted with the static key; at worst a tab re-fetches once.
- **Home:** lists v2 rooms only, so everyone starts at "No rooms yet".
- **Old room links** `/room/<CODE>`: "Room not found. Check the code, or ask the owner for the link." (`v2Rooms` only).
  New codes are unique only among v2 rooms, so an old code can later be issued to an unrelated new room and an old
  bookmark would offer to join it (codes are invitations anyway; low impact, accepted).
- **Old game links:** "No such game here. It may belong to another room." No crash. `/rooms/X/configure` → "Nothing here".
- **Games in progress under v1:** stop. v1's functions are deleted; its crons (engine watchdog, assistant sweeper,
  calibration and program prunes) are removed with them.
- **v1's scheduled functions.** v1 schedules only short follow-ups: the next tick (`runAt`, about a second ahead), AI
  and assistant turns (seconds), start/hold/calibration/replay steps (mostly `runAfter 0`), and two longer ones: the
  start watchdog (`PREPARING_WATCHDOG_MS`) and `engine.hold.dropFile` (deletes an old hold file after a grace period).
  Each job that comes due after the push finds no function and fails once, as a log entry. Nothing re-schedules it
  (every chain was re-armed by the function that no longer exists), so the noise stops within seconds, apart from the
  odd late `dropFile`, whose only effect is an old hold file left in storage. Games parked by v1's idle watchdog have
  no pending jobs at all. They cannot be stopped more cleanly: cancelling them before the push would mean writing to
  production under v1, and a cleanup after the push could only reach the few long-delay jobs. Recommendation: let
  them fail. (The Convex docs do not describe a scheduled job whose function was deleted; "fails when due" is the
  expected behaviour, not observed on production. The dev deployment went through the same change on 14 November.)
- **Ended games and replays:** not shown (no reader of v1 tables; "Past games" lists a room's v2 games). Old
  `/api/replay/*` links get a JSON 404. The old event log is not compatible (decision 15); the rows remain until D3.
- **Credentials:** account-scoped device/MCP grants still work; room-bound ones point at v1 rooms and are refused. MCP
  clients see the new tool set generated from `lib/v2-affordances`.
- **AI:** only rooms owned by an `ADMIN_EMAILS` admin may spend. Per-room token quotas (default 300,000 per game per
  pool, owner-set up to 10,000,000), hard ceilings in code of USD 2 per game and USD 5 per UTC day per pool across the
  deployment (so at most USD 10/day in total), 20–30 calls a member and 120 a pool per minute; all enforced server
  side (`v2/spend.ts`, `spendWithin`). v2 counts in new tables, so v1's spend history does not count against them.
- **Admin-only:** AI template library (`/admin/agents`, server-checked), model-backed AI seats (server-checked), the
  "Lab" setup group (client-side filter only; no lab presets exist today).

## 5. Operational limits

- **Tick:** a `scheduler.runAfter` chain, 1.5 s apart, ≤ 3 s of world time each (`v2/loop.ts`). The tick action reads
  the snapshot and live agents 100 a page (≤ 300 documents, ~1.7 MiB a page by the code's estimate; ≤ 1,600 agents a
  game), runs the acts in the sandbox, then commits in one mutation. **Not measured on a cloud deployment** against
  Convex's per-function limits; local playtests: median 0.3–0.6 s, a few 4–6 s ticks per game (docs/playtest/round-32,
  round-33).
- **Writes per game:** W3 measured 6–9 MB per 10-minute practice game before #865, 95–99% act events. #865 drops the
  host transcript from skipped acts only; not re-measured since. A busy production day could therefore still write tens
  of MB per game: watch the dashboard's storage after launch.
- **Recovery:** a per-game watchdog chain every 20 s restarts a tick whose clock stalled 30 s; a failing tick retries
  after 1.5 s and ends the game after 20 failures in a row. No cron restarts a dead watchdog chain itself (gap; low
  likelihood).
- **Idle parking:** after 30 minutes without human activity deployment-wide, the next commit parks the game; any human
  activity resumes up to 200 parked games.
- **Agents sandbox:** per act 500,000 steps, 2 s wall, 64 host calls, 16 KiB source, QuickJS 32 MiB / CPython 128 MiB.
  Runs inline in the action: Python checks the clock every 10,000 steps, so a long native step runs until the action's
  own limit (known risk, `lib/v2-sandbox/README.md`).
- **AI cost:** no production measurement; offline harness about USD 0.10–0.14 per 2-game table. The code ceilings
  above bound it.
- **Workflows:** `deploy.yml` is the only one that touches production. `pr-checks.yml` (PRs to develop),
  `preview.yml` (its own preview key) and `collapse-check.yml` (nightly, report only) use no production credentials.

## 6. Rollback

Reverting means pushing the old tree to `main` (a revert commit, or a `workflow_dispatch` of the deploy on a commit
with 2058deaf's tree), which redeploys v1's functions, schema and app.

Would work:
- **The push itself:** v1 rows were never written by v2, so they still match v1's strict validators; v2 tables are not
  in v1's schema and are not validated; auth and component tables are identical.
- **Exception:** if an admin created an AI template with the built-in provider after promotion, v1's narrower
  `aiTemplates.provider` rejects that row and the rollback push fails. Delete or edit that template first (or check
  with a read-only query of `aiTemplates`).
- v1 games come back as they were at the switch (paused or stalled; v1's watchdog cron restarts live ones).
- Sign-in keeps working: v1 verifies by URL against the same keys.

Would not be undone:
- v2 rows (rooms, games, replays created after the switch) stay in the database, invisible to v1.
- Spend recorded by v2 is not seen by v1's counters.
- v1's credentials refused during the v2 window may have been re-issued by users.
- Users who saw v2 for a while lose what they did there until a re-promotion.

Before promoting, export production (`npx convex export --prod`, read-only); D3-a asks for this anyway.

## 7. For the owner: checking the two auth key values on production before promoting

Only the owner holds the production deploy key. These steps read values into memory and print names only.

1. Get a production deploy key: Convex dashboard → production deployment (`original-bear-509`) → Settings → General →
   generate a deploy key (or reuse the one in the GitHub Environment `production`).
2. In a checkout of `develop` (after #913): `cd artifacts/engine && pnpm install`.
3. Check: `CONVEX_DEPLOY_KEY=<the key> node scripts/check-auth-keys.mjs`. It ends with "auth keys agree (…)" or
   lists problems by variable name.
4. If it names `PLAYER_JWT_JWKS` or `PLAYER_JWT_PRIVATE_KEY`: `CONVEX_DEPLOY_KEY=<the key> pnpm gen-jwt-key --set`
   (sets both together; outstanding 10-minute player tokens are re-fetched). v1 does not read `PLAYER_JWT_JWKS`, so
   this is safe before promotion.
5. If it names `BETTER_AUTH_JWKS` or `BETTER_AUTH_SECRET`: with the key set,
   `npx convex run auth/betterAuth:rotateKeys | npx convex env set BETTER_AUTH_JWKS`. Safe under v1 too: v1 signs and
   verifies with the key `rotateKeys` also stores in its table. Signed-in browsers fetch a new token within 10
   minutes; sessions survive.
6. Run step 3 again; it should agree. Then promote. The deploy runs the same check before its push and
   `auth/keysCheck:deployed` after it.

## 8. Go/no-go checklist

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Promotion is a clean fast-forward | green | `main` 2058deaf is an ancestor of `develop` |
| 2 | Schema accepts every stored production row | green | §1; `production-schema.test.ts` |
| 3 | Migrations safe and fast on production | green | §2: all five on empty v2 tables |
| 4 | Required env vars present on production | green (by history) | same names as `main`'s check, green on 11 Nov |
| 5 | `BETTER_AUTH_JWKS` / `PLAYER_JWT_JWKS` agree with their keys on production | **unknown** | never used on production before; #913 checks them before the push (stops a bad deploy with production untouched) and after it. The owner can know in advance with §7 (read-only) |
| 6 | No test or preview switch on production | green | env check refuses `DEV`, `TEST_FIXTURES`, `AI_MOCK`, `FAKE_OIDC_URL`, `PREVIEW_SIGN_IN_CODE` |
| 7 | `ANTHROPIC_API_KEY` set on production (AI seats, assistant) | unknown | not checked by the workflow; v1 read it too, so it is likely set |
| 8 | AI spend bounded | green | USD 2/game, USD 5/day per pool, admin rooms only (`v2/spend.ts`) |
| 9 | Owner accepts that v1 rooms, games in progress, replays and room-bound credentials vanish from the app | owner decision | §4; decision 15 |
| 10 | Tick and per-game writes within Convex limits on a cloud deployment | unknown | only local measurements (§5); watch the first games' function logs and storage |
| 11 | Production export taken before the push | to do | `npx convex export --prod` (owner or coordinator with the key) |
| 12 | Rollback path | green, one caveat | §6: blocked only by a built-in AI template row |
| 13 | Dev deploy of the release commit green | check at promotion time | the promoted commit's develop deploy run, including `checks` |
