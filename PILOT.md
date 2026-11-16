# Code Gods pilot handoff

## One engine deployment

The engine is **one Convex deployment** (`artifacts/engine`). It is the only server and the only
store. At `https://<dep>.convex.site` it serves:

| Path | What |
|---|---|
| `/` | the app (`artifacts/player-web`, static component `engineSite`): your rooms, room pages, owner controls, games (player view, spectator view, replay), AI library, `/connect` and `/device` approvals |
| `/api/*` | HTTP actions: Google sign-in (Better Auth, `/api/auth/*`), device flow, token exchange, JWKS, `/api/config`, `/api/health` |

Clients call Convex queries, mutations and actions at `https://<dep>.convex.cloud`. AI seats, the tick
loop, idle parking and the agent sandboxes all run inside the deployment. API reference:
`docs/engine-api.md`; design: `docs/convex-migration-plan.md`.

## Connecting the real Convex account

Follow the checklist in `docs/convex-migration-plan.md` §12: the environment variables, the deploy
commands, Google sign-in, the season salt and the runtime bundle upload. The essential
commands, from the repository root unless noted:

```sh
cd artifacts/engine && npx convex login && npx convex deploy && cd ../..   # push the functions; note the .convex.cloud / .convex.site URLs
pnpm --filter @workspace/engine gen-jwt-key --set --prod                  # player JWTs: PLAYER_JWT_PRIVATE_KEY + PLAYER_JWT_JWKS
(cd artifacts/engine && npx convex env set --prod SEASON_SALT)            # ≥ 16 random characters, read from stdin; secret for the season
(cd artifacts/engine && openssl rand -base64 32 | npx convex env set --prod BETTER_AUTH_SECRET)
(cd artifacts/engine && npx convex env set --prod GOOGLE_CLIENT_ID)       # from the Google OAuth client below
(cd artifacts/engine && npx convex env set --prod GOOGLE_CLIENT_SECRET)
(cd artifacts/engine && npx convex run --prod auth/betterAuth:rotateKeys | npx convex env set --prod BETTER_AUTH_JWKS)
(cd artifacts/engine && npx convex deploy)                                # push again so auth.config.ts inlines both JWKS
pnpm --filter @workspace/v2-sandbox setup:python                          # once: the pinned CPython WASI download
pnpm --filter @workspace/engine upload-runtime --prod                     # the Python runtime bundle → file storage
pnpm --filter @workspace/engine deploy-static --prod                      # build and upload the app, served at /
```

Also set `ADMIN_EMAILS` (verified Google emails) and `ANTHROPIC_API_KEY` (the engine's AI seats and assistant use
Anthropic only; without the key they fail with "No AI model is configured on this deployment") with
`npx convex env set --prod`; `AI_MODEL` picks the model (a lib/v2-ai `MODELS` id; unset, the default), and
`AI_MODEL_ASSISTANT`, `AI_MODEL_SEAT` or `AI_MODEL_PITCH` one kind of step's. Never set `FAKE_OIDC_URL`, `AI_MOCK`,
`TEST_FIXTURES`, `DEV` or `PREVIEW_SIGN_IN_CODE` in production (the deploy refuses them).
The deploy still requires `SEASON_SALT`, though engine v2 does not read it. `BETTER_AUTH_SECRET` also encrypts the
Better Auth signing key: if you change it (or to rotate the key), run `rotateKeys`, set `BETTER_AUTH_JWKS`
again and push. Rotation makes browsers fetch new Convex JWTs; sessions survive.

### Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys on every push: `develop` → the dev deployment
(`quixotic-gopher-395`), `main` → production (`original-bear-509`). One-time setup:

1. **Deploy keys.** In the Convex dashboard, production deployment → Settings → General →
   generate a production deploy key; dev deployment → Settings → generate a dev deploy key. Name both
   for GitHub Actions, and give them full permissions: the workflow runs internal functions
   (`rotateKeys`, the runtime upload, the smoke probe), which a restricted key refuses with
   `deployment:functions:runInternalActions`.
2. **GitHub Environments** (repository Settings → Environments): `development` with deployment branch
   rule `develop`, and `production` with rule `main` (optionally with required reviewers). Each gets the
   secret `CONVEX_DEPLOY_KEY` (that deployment's key); the key alone selects the deployment.
3. **The deployment's env vars** (above): the workflow checks names only and fails before deploying when
   `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PLAYER_JWT_PRIVATE_KEY`,
   `PLAYER_JWT_JWKS`, `SEASON_SALT` or `ADMIN_EMAILS` is missing, or a test-only variable is set; and, before
   the push, `scripts/check-auth-keys.mjs` checks that `PLAYER_JWT_JWKS` holds `PLAYER_JWT_PRIVATE_KEY`'s public
   key and that `BETTER_AUTH_JWKS` decrypts with `BETTER_AUTH_SECRET` (`auth.config.ts` inlines both JWKS, so a
   stale one breaks sign-in). Run it yourself with `CONVEX_DEPLOY_KEY=… node scripts/check-auth-keys.mjs` in
   `artifacts/engine` (prints names, never values).

Each deploy (one at a time per environment): install, the pinned Python runtime bundle (the CPython download is
cached), the env var check above, `npx convex deploy --typecheck enable` (it typechecks every function, validates the
schema, and accepts dev and production deploy keys alike), `version:record`, `BETTER_AUTH_JWKS` on the first deploy
only (`rotateKeys` → env set → push again), the schema migrations (`scripts/run-migrations.mjs`: the
`@convex-dev/migrations` component's `runAll`, waited for until every one reports success, else the deploy fails;
CLAUDE.md "Schema migrations"), `upload-runtime` (skipped when the bundle is already there), `deploy-static
--if-changed` (the app's one site, `app`; a build that hashes to the deployment's env var `STATIC_SHA256_APP`,
recorded at its last upload, isn't uploaded again), and a smoke test (`/api/health`, `/mcp` answers 401 without a
token, and `auth/keysCheck:deployed`: tokens signed with the deployment's keys verify against the pushed auth config).

**A game whose ticks fail** retries after 1.5 s and ends after 20 failures in a row (`convex/v2/loop.ts`); a
per-game watchdog restarts a tick whose clock has not moved for 30 s. The raw errors are in the deployment's logs.

**The gate** is the `checks` job: the root typecheck, the offline unit suites (root `test:offline:rest`: the v2
libraries, the engine's unit tests, the app, the CI scripts) and the sandbox and agent tests (`v2-sandbox`,
`v2-agents`). Its parts run as parallel jobs and `checks` succeeds only when all did. On **`develop`** it runs beside
the deploy and never holds it
back: a failure marks the commit red but the dev deploy proceeds (about 1½–2 minutes), so fix or revert it before
merging `develop` into `main`. On **`main`** the production deploy does its install and bundle build while the gate runs,
then waits for `checks` before anything ships. When the release is a merge of `develop` the tree is identical, so the
`lookup` job (`.github/scripts/previous-gate.mjs`, using the workflow token's `actions: read`) looks for a Deploy run on
`develop` whose head commit has the same tree and whose `checks` job succeeded; if one exists the gate is not re-run
(a production deploy then takes about the deploy job's own 1½–2 minutes). No match, a red or cancelled run, or any API
error means the gate runs in full: a lookup problem can only cost time. A deploy in progress always finishes; a newer
push waits for it. Pushes that only change `*.md`, `docs/`, `.agents/` or `.claude/`
don't deploy. Locally `pnpm run test:offline` runs the same suites.

**Preview deployments** (one per branch, for trying design variants) are a separate workflow, `.github/workflows/preview.yml`,
which does nothing until the secret `CONVEX_PREVIEW_DEPLOY_KEY` exists: `docs/preview-deployments.md`.

Re-run a failed run from the Actions tab; a manual run ("Run workflow") works on `develop` and `main` only.
Release `develop` → `main` with a pull request whose head is a short-lived branch cut from `develop`, never
`develop` itself: merging deletes the head branch.

The local scripts (`scripts/dev.mjs`, `test:auth`, the e2e scripts) refuse to run
while `CONVEX_DEPLOY_KEY` is set or `CONVEX_DEPLOYMENT` names a cloud deployment: they set test-only env
vars and must never reach one. Set a deploy key per command only, never export it.

### Google sign-in

Humans sign in with Google only, through Better Auth served by the deployment. In the
[Google Cloud console](https://console.cloud.google.com/), in a project for Code Gods:

1. **Google Auth Platform → Branding:** app name, support email, and under **Authorized domains** add
   `<dep>.convex.site` (or your custom domain).
2. **Audience:** user type **External**; **Publish app** (in "Testing" only listed test users can sign in).
   The scopes are `openid`, `email` and `profile`, which need no verification review.
3. **Clients → Create client:** type **Web application**. **Authorized redirect URI:**
   `https://<dep>.convex.site/api/auth/callback/google` (with `SITE_URL` set, that origin instead).
   No JavaScript origins are needed. Copy the client id and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

A player's god id is their Better Auth user id; their name is Google's given + family name.

Smoke test: `/` loads and a real Google sign-in works (the account chooser appears, you come back signed
in with your full name); `/api/health` answers; the AI library shows which providers are configured. Then create a
room, fill the empty seats with practice partners and play a short "Lines · beginner" game.

The admin check reads `ADMIN_EMAILS` on every call: no new sign-in is needed after changing it.
Open **AI library** to create or edit named agent templates (deleted ones stay as tombstones). The engine runs
them on Anthropic models (`ANTHROPIC_API_KEY`). Since engine v2 no deploy step seeds default templates.

## Running a pilot

- **Rooms.** Create a room and share its short code or URL. Rooms have no names; they are persistent
  lobbies with a history of ended games. All humans sign in with Google and join.
- **Players and spectators.** A game needs three to eight players. Every member is a player or a
  spectator: the owner and the members who join start as players, and a member (or the owner, for
  any human member) switches it on the room page (`rooms.setSpectator`, tool `set_spectator`; it applies
  to the next game). Only players count toward the 3–8. The owner may fill seats with AI players from the
  library. Readiness is advisory. **Start game** takes everyone on the room page to the game's page,
  `/rooms/CODE/games/GAME`: seated players get the dock, everyone else the spectator view. When the game
  ends, the same URL becomes its replay, for its players, its spectators and the owner; the room page lists
  it under past games, and the owner can change settings and start the next game with the same members.
  Anyone who joins mid-game watches and plays in the next one.
- **AI seats and budgets.** Only rooms owned by an admin (`ADMIN_EMAILS`) may seat model-backed AI players or
  spend on the assistant. Each room has token quotas per game (default 300,000 for all AI seats together and
  300,000 for each player's assistant; the owner may raise them). Every call is reserved first and capped at USD 2
  per game and USD 5 per UTC day for each pool (AI seats, assistant) across the deployment, and 20–30 calls a
  member and 120 a pool per minute (`convex/v2/spend.ts`). Practice partners cost nothing.
- **Idle parking.** After 30 minutes without human activity (creating or joining a room, the owner's
  start or resume, and the clients' activity touches on real interaction), the engine parks running games (paused,
  marked parked): no ticks and no AI turns are scheduled, so a
  parked deployment costs nothing. AI turns, polling and subscriptions never count as activity. The
  next human activity resumes parked games automatically.

### The engine's own app (no duplicate needed)

Each human can play at `https://<dep>.convex.site/rooms/CODE`, signed in with Google on the engine site.
It is the same app a player can run themselves, with the same rights. Use it as the fallback for anyone
without their own player app.

### The CLI and remote assistants (any dev environment)

Every operation of the game is also a command of `pnpm player` and a tool of the engine's MCP server
(`<site>/mcp`), generated from one directory (`docs/engine-v2/affordances.md`). Either acts for one human in one
room, with the rights that human approved.

1. Clone the repository and run `pnpm install`. Set `CODE_GODS_ENGINE_URL` to the engine's site URL
   (`https://<dep>.convex.site`); without it the CLI talks to the local engine (`http://127.0.0.1:3211`).
2. Run `pnpm player connect --room CODE` (add `--permission owner` for the room owner's full delegation, or
   `read` for observation only; the default is `act`).
3. Open the printed `/device` link in the browser where you are signed in to the engine, check the code, room,
   permission and label, and approve. An owner grant needs the current room owner. The CLI saves the credential
   in `~/.config/code-gods/cli.json` (mode 600; `--config FILE` or `CODE_GODS_CONFIG` to move it). It is
   room-bound, expires after 7 days and can be revoked on the engine site (menu → Connected apps) or with
   `pnpm player disconnect`.
4. `pnpm player status` checks the connection; `pnpm player tools` lists what you may do now (it follows the
   game's phase and your rights); `pnpm player help [namespace [verb]]` documents each command, e.g.
   `pnpm player chat send --text "hello"`, `pnpm player agent summon --language python --source "$(cat agent.py)"`,
   or `pnpm player call object.read '{"objectId":"…","rep":"si"}'`.

An MCP client (Claude Code, Claude Desktop, any other) connects to `<site>/mcp` itself, with OAuth: add the
server URL and approve the connection when the engine asks. It gets the same tools.

Each human can also play in the engine's own app at `https://<dep>.convex.site/rooms/CODE`, or run the app as
their own dev server with `VITE_CODE_GODS_ENGINE_URL` set to the engine's site URL: it then asks you to sign in,
you approve it on the engine's `/connect` page (it acts as you in every room, like the engine's own site; revoke
it there under Connected apps), and it works from any origin.

## First smoke game

Start with three humans, or one human and two practice partners, on "Lines · beginner". Every player starts with
their rule's example agent; read your goal card, then edit, check and summon an agent, watch its energy and moves,
send a public message and try one pause. Then revoke and reconnect a player app. The rules, energy and
pricing are in `docs/engine-v2/spec.md`.

## Local testing without a Convex account

```sh
pnpm install
pnpm --filter @workspace/engine dev        # local Convex backend (3210 client, 3211 site) + stand-in OIDC (3399); runs the migrations, uploads the Python runtime
pnpm --filter @workspace/engine deploy-static     # the app at http://127.0.0.1:3211/
```

`dev` runs the official Convex CLI's local backend (`npx convex dev`, anonymous) and a stand-in OIDC
provider (`scripts/fake-oidc.mjs`), which Better Auth offers as the test-only provider "fake" because the
**local-only** env vars `TEST_FIXTURES` and `FAKE_OIDC_URL` are set. The UI's button goes to
Google (dummy client id locally); sign in as a test identity with `POST /api/auth/sign-in/oauth2
{"providerId":"fake","callbackURL":"/"}` from the page, as `artifacts/player-web/e2e/v2-site.ts` does.
Signing in offers the test identities alice, bob, carol, admin and unverified. It also sets a random
season salt, JWT keys, a Better Auth secret and JWKS, and `AI_MOCK=1` (an offline mock AI provider).
Before it prints `[dev] READY` it starts the schema migrations as a deploy does, and it uploads the Python runtime
bundle for v2 agents (`upload-runtime`: it runs `setup:python` and `build:python` first when the bundle is missing or
no longer matches its pin, and skips the upload when the deployment already has it). On every start it removes any `DEV` env var from the local deployment:
`TEST_FIXTURES` is the one fixtures switch locally, and a leftover `DEV=1` would keep fixtures on when
`test:auth` turns them off.
A local deployment created before Google sign-in (its `users` rows have `issuer`) refuses the new schema:
there is no migration, so stop the engine, delete `artifacts/engine/.convex/local` and start it again. Schema changes since then are
migrations (CLAUDE.md "Schema migrations"), which `dev` starts on every run like a deploy does.

The CLI against the local engine: `pnpm player connect --room CODE`, approve as a test identity on
`http://127.0.0.1:3211/device`, then any `pnpm player …` command. A local app in account mode:
`VITE_CODE_GODS_ENGINE_URL=http://127.0.0.1:3211 PORT=22772 BASE_PATH=/ pnpm --filter @workspace/player-web dev`.

Tests: `.claude/skills/code-gods-testing/SKILL.md` (which suite for which change, how to run each);
`selective-testing` picks the set for a change. In short: `pnpm --filter @workspace/engine test:v2` and
`test:auth` against the local backend, `pnpm --filter @workspace/player-web run e2e:site` (Playwright) and the
other `e2e:*` scripts in `artifacts/player-web/package.json`; without an engine, `pnpm run typecheck` and
`pnpm run test:offline`.

### Testing the assistant against a real provider locally

The local deployment's assistant uses the mock (`AI_MOCK=1`); every `dev` start removes provider keys, so the
mock-scripted suites never spend money. There is no script for a live local assistant since engine v2: try a real
provider on the dev deployment instead.

## Verification boundary

Tested locally, against the Convex local backend: the engine's functions and HTTP actions, full games
on Grid boards in both languages, disclosure, idle parking, the device flow and credentials,
revocation, the room assistant, the player app's token endpoint, static hosting of the app, mock AI
seats, Better Auth sign-in, sign-out and session expiry through the stand-in provider, and the app's site
pages and its account mode end to end in Playwright with stand-in identities.

Needs the real account and is **not** yet verified:

- a real Google sign-in (the tests check only that sign-in sends the browser to Google with the right
  client id, redirect URI and account chooser; the stand-in provider imitates the rest);
- cloud behaviour: Node action memory (512 MiB) and cold starts with the Python bundle, function time
  limits, and throughput under real load;
- independent player apps in separate real dev environments (e.g. Replit, Codespaces), through their
  preview proxies;
- paid model inference with real provider keys.
