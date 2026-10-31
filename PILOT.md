# Code Gods pilot handoff

## One engine deployment

The engine is **one Convex deployment** (`artifacts/engine`). It is the only server and the only
store. At `https://<dep>.convex.site` it serves:

| Path | What |
|---|---|
| `/` | the engine UI (`artifacts/code-gods`): rooms, lobby, owner controls, game pages, AI library, `/device` approvals |
| `/player/` | the hosted default player client (`artifacts/player-web`) |
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
pnpm --filter @workspace/game-runtime setup:python                        # once: the pinned CPython WASI download
pnpm --filter @workspace/engine upload-runtime --prod                     # the Python runtime bundle → file storage
pnpm --filter @workspace/engine deploy-static --prod                      # build and upload the engine UI and /player/
```

Also set `ADMIN_EMAILS` (verified Google emails) and the provider keys
(`ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`) with `npx convex env set --prod`. Never set
`FAKE_OIDC_URL`, `AI_MOCK`, `TEST_FIXTURES` or `DEV` in production.
Without `SEASON_SALT` the engine refuses to run games in production. Never share the salt
during the season; game records carry its sha256 commitment. `BETTER_AUTH_SECRET` also encrypts the
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
   `PLAYER_JWT_JWKS`, `SEASON_SALT` or `ADMIN_EMAILS` is missing, or a test-only variable is set.

Each run (one at a time per environment): install, root typecheck and the offline unit suites, the
pinned Python runtime bundle (the CPython download is cached), `npx convex deploy` (it accepts dev and
production deploy keys alike), `BETTER_AUTH_JWKS` on the first deploy only (`rotateKeys` → env set →
push again), `upload-runtime` (skipped when the bundle is already there), `deploy-static`, and a smoke
test (`/api/health`, `/mcp` answers 401, `runtime/probe:smoke`). Re-run a failed run from the Actions
tab; a manual run ("Run workflow") works on `develop` and `main` only.

The local scripts (`scripts/dev.mjs`, `test:auth`, the e2e scripts, the player-client tests) refuse to run
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
in with your full name); `/api/health` answers;
`npx convex run --prod runtime/probe:smoke` (in `artifacts/engine`) runs one act per language; the
AI library shows which providers are configured. Then create a room, connect one player app and play
the "First steps" preset.

The admin check reads `ADMIN_EMAILS` on every call: no new sign-in is needed after changing it.
Open **AI library** to create or edit named agent templates. The seeded Sonnet Strategist uses
Sonnet 5.5; deleted defaults stay deleted. Both direct Anthropic and OpenAI are supported.

## Running a pilot

- **Rooms.** Create a room and share its short code or URL. Rooms have no names; they are persistent
  lobbies with a history of ended games. All humans sign in with Google and join.
- **Players.** A game needs at least three players. The owner may fill seats with AI players from the
  library. Readiness is advisory. **Start game** takes everyone to that game's page. When it ends, the
  result joins the room's history and everyone returns to the lobby, where the owner can change
  settings and start the next game with the same members. Anyone who joins mid-game watches and plays
  in the next one.
- **AI seats and budgets.** Before starting with AI seats, the owner approves a token budget. AI usage
  bills the deployment's provider keys. Reservations are taken before each call and capped at $2 per
  game and $5 per UTC day across the deployment, plus the room's token budget and 6 calls per minute
  per room (`docs/ai-player-billing.md`).
- **Idle parking.** After 30 minutes without human activity (creating or joining a room, the owner's
  start or resume, and the clients' activity touches on real interaction), the engine parks running games in `recovery`: no ticks and no AI turns are scheduled, so a
  parked deployment costs nothing. AI turns, polling and subscriptions never count as activity. The
  next human activity resumes parked games automatically; the room assistant can do it with
  `pnpm player assistant wake`.

### Hosted player client (no duplicate needed)

Each human can play at `https://<dep>.convex.site/player/?room=CODE`, signed in on the engine site.
Use it as the fallback for anyone without their own player app.

### Your own player app (any dev environment)

Each player runs their own copy of the repository as a live-moddable client of the one engine: a
local checkout, GitHub Codespaces, Gitpod or Replit all work. Player apps need no engine code, database
or provider keys. Do not give players editor access to the engine's own deployment.

1. Clone (or fork) the repository and run `pnpm install`.
2. Set `CODE_GODS_ENGINE_URL` to the engine's site URL (`https://<dep>.convex.site`), in your
   environment's secret store (e.g. Codespaces secrets) or in a gitignored `.env.local` where you run
   pnpm.
3. Run `pnpm player connect --room CODE` (add `--permission owner` for the room owner's full
   delegation, or `read` for observation only; the default is `act`; `--write-env .env.local` stores
   both values for you).
4. Open the printed `/device` link in the browser where you are signed in to the engine, check the
   comparison code, room, permission and label, and approve. An owner grant needs the current room
   owner's extra consent.
5. Store the printed credential as `CODE_GODS_CREDENTIAL` the same way. It is shown once; it is
   room-bound, expires after 7 days and can be revoked on the engine's player page or with
   `pnpm player assistant disconnect`.
6. Run `pnpm --filter @workspace/player-web dev` (port 22772 unless `PORT` is set). The Vite dev server
   keeps the credential server-side and gives the browser only 10-minute JWTs (`/__codegods/token`).
7. Open the app through the **launch link** the dev server prints to its console
   (`…/__codegods/launch?key=…`). A forwarded dev URL is public, so tokens go only to a browser that
   opened this link. Keep it private. To keep the link stable across restarts, store a long random
   value as `CODE_GODS_LAUNCH_KEY`. Otherwise each restart prints a new link. Replit, Codespaces and
   Gitpod URLs are detected; behind another proxy or tunnel set `CODE_GODS_PUBLIC_ORIGIN` (and
   `CODE_GODS_ALLOWED_HOSTS` for any further hosts).

#### On Replit

Import the repository as a Repl. `.replit` defines the **Player** workflow (the dev server above, port
22772); store the two values (and optionally `CODE_GODS_LAUNCH_KEY`) in Replit Secrets and restart
the workflow. The Replit Agent can act as the room assistant (`replit.md`).

`pnpm player status` checks the connection. The player's coding agent is their **room assistant**
(`docs/room-assistant.md`): it uses the same credential through `pnpm player assistant …` and can
build live panels in the running client (`docs/panels.md`). Client UI and analytics are freely
editable; to update, pull from Git and restart the dev server. The engine stays authoritative:
a modified client can do no more than its human could, and never sees opponents' individual scores.

## First smoke game

Start with three humans, or two humans and one AI. Use the "First steps" preset (Grid 4×4) or Int, a
short planning phase and the default world rates. A valid first summon is an agent that returns
mutator calls. Int, Python:

```python
def agent(x):
    return [add(1)]
```

TypeScript: `function agent(x) { return [add(1)]; }`. On a Grid:
`def agent(grid):\n    return [paint(row(2), "red")]`. The mutators and helpers of the room are listed
in the observation's `instance` and in the player client. An agent that returns `[]`, or calls that
change nothing, validates but every act fails: every object value is unique, so a change onto an
existing value fails as well.

Energy: summoning costs god energy: the source's description bits (Python ast-bits-v1, TypeScript
ts-ast-bits-v1; a move helper on literal arguments is priced as that move), shown as the validation
`cost`. Validation also runs the agent on a few hundred reference objects and reports `decisionBits`
(the information its choices carry: an agent that always makes the same move pays about nothing for
deciding) and `expectedActCost` with its breakdown. The new agent starts at 0 energy and earns 2 bits
per second of world time on Int and string boards, 32 on Grid boards (none during planning or
pauses). It is **eligible** to act once its energy reaches its `expectedActCost`; each act pays
decisionBits plus the information it erases, how much it moves and a 2-bit floor, and a failed act
still pays decisionBits + the floor, so energy can go negative: a **cooldown** until income brings it
back. Agents run on a virtual clock with a seeded `random`. Destroying an agent is free.

Two experimental mechanics from the spirals study stay off unless the owner turns them on: the commit
clause (agents may wrap moves in `only_if_better(...)`, committed only if they raise the owner's
points) and `shelter` object selection.

Read your utility card (emoji, summary, then source; a ⚠️ defence goal if dealt), validate, summon,
watch your agent's energy and eligibility, observe transformations and your payoff in bits, send a
public message, and try one pause. Then revoke and reconnect a player app.

## Local testing without a Convex account

```sh
pnpm install
pnpm --filter @workspace/engine dev        # local Convex backend (3210 client, 3211 site) + stand-in OIDC (3399)
pnpm --filter @workspace/engine upload-runtime    # Python runtime bundle → the local deployment
pnpm --filter @workspace/engine deploy-static     # engine UI at http://127.0.0.1:3211/, player client at /player/
```

`dev` runs the official Convex CLI's local backend (`npx convex dev`, anonymous) and a stand-in OIDC
provider (`scripts/fake-oidc.mjs`), which Better Auth offers as the test-only provider "fake" because the
**local-only** env vars `TEST_FIXTURES` and `FAKE_OIDC_URL` are set. The UI's button goes to
Google (dummy client id locally); sign in as a test identity with `POST /api/auth/sign-in/oauth2
{"providerId":"fake","callbackURL":"/"}` from the page, as `artifacts/code-gods/e2e/smoke.ts` does.
Signing in offers the test identities alice, bob, carol, admin and unverified. It also sets a random
season salt, JWT keys, a Better Auth secret and JWKS, and `AI_MOCK=1` (an offline mock AI provider).
A local deployment created before Google sign-in (its `users` rows have `issuer`) refuses the new schema:
there is no migration, so stop the engine, delete `artifacts/engine/.convex/local` and start it again.

A local player app: `pnpm player connect --engine http://127.0.0.1:3211 --room CODE --write-env .env.local`
(gitignored), approve as a test identity, then `PORT=22772 BASE_PATH=/ pnpm --filter @workspace/player-web dev`.
`artifacts/engine/scripts/seed-players.ts` seeds a room with several connected simulated players.

Tests that use the local backend: `pnpm --filter @workspace/engine test:game`,
`pnpm --filter @workspace/engine test:auth`, `pnpm --filter @workspace/player-client test` and
`pnpm --filter @workspace/code-gods run e2e` (Playwright, three signed-in browsers). Tests without an
engine: `pnpm run typecheck`, `pnpm --filter @workspace/game-runtime test` (after
`setup:python` and `build:python`), and the `lib/game-*`, `lib/object-views` and `lib/ai-player` tests.

## Verification boundary

Tested locally, against the Convex local backend: the engine's functions and HTTP actions, full games
on Int, string and Grid in both languages, disclosure, idle parking, the device flow and credentials,
revocation, the room assistant, the player app's token endpoint, static hosting of both sites, mock AI
seats, Better Auth sign-in, sign-out and session expiry through the stand-in provider, and the engine UI
end to end in Playwright with stand-in identities.

Needs the real account and is **not** yet verified:

- a real Google sign-in (the tests check only that sign-in sends the browser to Google with the right
  client id, redirect URI and account chooser; the stand-in provider imitates the rest);
- cloud behaviour: Node action memory (512 MiB) and cold starts with the Python bundle, function time
  limits, and throughput under real load;
- independent player apps in separate real dev environments (e.g. Replit, Codespaces), through their
  preview proxies;
- paid model inference with real provider keys.
