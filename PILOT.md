# Code Gods pilot handoff

## One engine deployment

The engine is **one Convex deployment** (`artifacts/engine`). It is the only server and the only
store. At `https://<dep>.convex.site` it serves:

| Path | What |
|---|---|
| `/` | the engine UI (`artifacts/code-gods`): rooms, lobby, owner controls, game pages, AI library, `/device` approvals |
| `/player/` | the hosted default player client (`artifacts/player-web`) |
| `/api/*` | HTTP actions: Replit OIDC login, device flow, token exchange, JWKS, `/api/config`, `/api/health` |

Clients call Convex queries, mutations and actions at `https://<dep>.convex.cloud`. AI seats, the tick
loop, idle parking and the agent sandboxes all run inside the deployment. There is no PostgreSQL, no
Express server and no Replit Publish step for the engine. API reference: `docs/engine-api.md`; design:
`docs/convex-migration-plan.md`.

## Connecting the real Convex account

Follow the checklist in `docs/convex-migration-plan.md` §12: the environment variables, the deploy
commands, the OIDC redirect URI, the season salt and the runtime bundle upload. The essential
commands, from the repository root unless noted:

```sh
cd artifacts/engine && npx convex login && npx convex deploy && cd ../..   # push the functions; note the .convex.cloud / .convex.site URLs
pnpm --filter @workspace/engine gen-jwt-key --set --prod                  # CODE_GODS_JWT_PRIVATE_KEY + CODE_GODS_JWT_JWKS
(cd artifacts/engine && npx convex env set --prod CODE_GODS_SEASON_SALT)  # ≥ 16 random characters, read from stdin; secret for the season
(cd artifacts/engine && npx convex deploy)                                # push again so auth.config.ts picks up the JWKS
pnpm --filter @workspace/game-runtime setup:python                        # once: the pinned CPython WASI download
pnpm --filter @workspace/engine upload-runtime --prod                     # the Python runtime bundle → file storage
pnpm --filter @workspace/engine deploy-static --prod                      # build and upload the engine UI and /player/
```

Also set `REPLIT_OIDC_CLIENT_ID`, `CODE_GODS_ADMIN_EMAILS` and the provider keys
(`ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`) with `npx convex env set --prod`.
`REPLIT_OIDC_CLIENT_ID` is the engine Repl's `REPL_ID`. Replit Auth only returns to that Repl's own
domains, so the engine Repl serves `artifacts/engine/relay/convex-callback.html` (for example at
`https://code-gods-engine.replit.app/convex-callback`) and `REPLIT_OIDC_REDIRECT_URI` names that URL. The
page forwards the login to `https://<dep>.convex.site/api/callback`. Never set
`REPLIT_OIDC_ISSUER`, `CODE_GODS_AI_MOCK`, `CODE_GODS_TEST_FIXTURES` or `CODE_GODS_DEV` in production.
Without `CODE_GODS_SEASON_SALT` the engine refuses to run games in production. Never share the salt
during the season; game records carry its sha256 commitment.

Smoke test: `/` loads and a real Replit login works; `/api/health` answers;
`npx convex run --prod runtime/probe:smoke` (in `artifacts/engine`) runs one act per language; the
AI library shows which providers are configured. Then create a room, connect one player app and play
the "First steps" preset.

Log out and in once after setting `CODE_GODS_ADMIN_EMAILS` to get the verified-email admin check.
Open **AI library** to create or edit named agent templates. The seeded Sonnet Strategist uses
Sonnet 5.5; deleted defaults stay deleted. Both direct Anthropic and OpenAI are supported.

## Running a pilot

- **Rooms.** Create a room and share its short code or URL. Rooms have no names; they are persistent
  lobbies with a history of ended games. All humans sign in with Replit and join.
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
Use it as the fallback for anyone without their own Replit app.

### Independent Replit player apps

Each player duplicates the repository as their own Replit app, a live-moddable client of the one
engine. Player apps need no engine code, database or provider keys. Do not give players editor access
to the engine's own workspace.

1. Duplicate the repository.
2. Set the Replit Secret `CODE_GODS_ENGINE_URL` to the engine's site URL (`https://<dep>.convex.site`).
3. Run `pnpm player connect --room CODE` (add `--permission owner` for the room owner's full
   delegation, or `read` for observation only; the default is `act`).
4. Open the printed `/device` link in the browser where you are signed in to the engine, check the
   comparison code, room, permission and label, and approve. An owner grant needs the current room
   owner's extra consent.
5. Store the printed credential as the Replit Secret `CODE_GODS_CREDENTIAL`. It is shown once; it is
   room-bound, expires after 7 days and can be revoked on the engine's player page or with
   `pnpm player assistant disconnect`.
6. Run the **Player** workflow (`pnpm --filter @workspace/player-web dev`). The Vite dev server keeps
   the credential server-side and gives the browser only 10-minute JWTs (`/__codegods/token`).
7. Open the app through the **launch link** the workflow prints to its console
   (`…/__codegods/launch?key=…`). The dev URL is public, so tokens go only to a browser that opened this
   link. Keep it private. To keep the link stable across restarts, store a long random value as the
   Replit Secret `CODE_GODS_LAUNCH_KEY`. Otherwise each restart prints a new link.

`pnpm player status` checks the connection. The player's Replit Agent is their **room assistant**
(`docs/room-assistant.md`): it uses the same credential through `pnpm player assistant …` and can
build live panels in the running client (`docs/panels.md`). Client UI and analytics are freely
editable; to update, pull from Git and restart the Player workflow. The engine stays authoritative:
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
provider (`scripts/fake-oidc.mjs`) selected by the **local-only** Convex env var `REPLIT_OIDC_ISSUER`.
Signing in offers the test identities alice, bob, carol, admin and unverified. It also sets a random
season salt, a JWT key and `CODE_GODS_AI_MOCK=1` (an offline mock AI provider).

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
seats, and the engine UI end to end in Playwright with stand-in identities.

Needs the real account and is **not** yet verified:

- a real Replit OIDC sign-in (the stand-in provider only imitates it), including whether Replit
  accepts `https://<dep>.convex.site/api/callback` as a redirect URI (fallback: a forwarding callback
  page on a Replit domain, plan §5);
- cloud behaviour: Node action memory (512 MiB) and cold starts with the Python bundle, function time
  limits, and throughput under real load;
- independent player apps in separate real Replit workspaces, through Replit's preview proxy;
- paid model inference with real provider keys.
