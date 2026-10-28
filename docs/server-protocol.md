# Code Gods server integration contract

## Interaction throughput

`interactionRateHz` is a per-room dispatch ceiling, not a fixed-rate work quota.
It defaults to 100 Hz and accepts ceilings up to 1000 Hz; a high cap does not
guarantee that rate on the deployed hardware.
`stepBudget` is the deterministic per-act budget (default 500,000 steps; at most
10,000,000): the same agent, input and seed always fit or never do.
`interactionComputeMs` is only the CPU backstop behind it: an integer from 1 to
1000 milliseconds, defaulting to 1000. Both exclude compilation and worker
startup, and are independent of the dispatch cap. The owner can change it only
between games; each game retains its settings snapshot.
The single server admits up to four interactions concurrently across rooms.
Missed opportunities are not queued or replayed; slow execution lowers achieved
throughput rather than putting the game into recovery. Running world time and
the sampled game lifetime continue independently of achieved interaction rate.

Each in-flight transformation reserves its target object. Guest execution runs
outside the state-mutation lock; completion commits only if the game, phase,
execution epoch and object version still match. Pauses, idle shutdown and game
replacement invalidate obsolete results. Runtime admission is also bounded
across both languages, including validation requests.

Interaction persistence uses a bounded asynchronous buffer (64 changes per room,
256 across the server), flushing after 100 ms or earlier at batch thresholds.
Failures retain queued changes and stop new interaction admission until writes
can resume. Object changes, appended events and room sequence commit atomically.
Commands flush pending interactions before their own transaction, so acknowledged
summons and energy charges remain durable. Graceful shutdown drains the queue.
Socket change notifications follow commit; HTTP observations can include the
short uncommitted interaction window. An abrupt process kill can lose that window.

The server display lives at `/`. All HTTP and WebSocket API paths start with `/api`.
Share rooms as `/rooms/{roomShortCode}`, games as `/games/{gameShortCode}`,
and browser player links as `/player/?room={roomShortCode}`. Full GUIDs
also resolve. A game link opens only that game; historical links never silently
display a replacement game. IDs inside authenticated protocol envelopes remain
canonical GUIDs. Device approval request responses include the resolved `roomId`
GUID, which the daemon pins before accepting credentials returned by polling.
The current display uses generated OpenAPI hooks and one-second polling. It never
receives private utility descriptors, scores, seeds, end deadlines, or agent sources.

## Identity

Browser login: `/api/login?returnTo=/rooms/ROOM_UUID`; callback `/api/callback`.
Verified Replit OIDC subjects identify humans. Session tokens are opaque; only
SHA-256 hashes are persisted. Cookies are Secure, HttpOnly, SameSite=Lax.

Player clients do not inherit Replit Agent credentials. They use an application
device approval flow:

1. Generate a random verifier locally and its base64url SHA-256 challenge.
2. `POST /api/device/request` with `{roomId,challenge,clientLabel,permission}`.
   Permission is `read`, `act`, or explicitly owner-approved `owner`; labels are self-reported, not verified identities.
   Keep the returned
   `deviceSecret` in daemon memory, not in a browser bundle or URL.
3. Ask the human to visit the returned `verificationPath` on the server domain.
   They log in, join the room, and approve the displayed code.
4. Poll `/api/device/poll` with `{deviceId,deviceSecret,verifier}` at the returned
   interval. A 202 is pending; success returns `{token,expiresIn,roomId}`.
5. Send the token in `Authorization: Bearer ...` from the trusted client daemon.
   Tokens are room-scoped, expire after fifteen minutes, and cannot change owner settings.
   `/api/device/revoke` revokes the presented token.

Approval codes expire after five minutes. This is **not** a native Replit OAuth
device grant. The browser approval binds a local client to the verified account.

## Rooms and games

A **room** is a persistent lobby: its members (humans who joined plus AI seats the
owner added), readiness, public chat and the owner's settings for the NEXT game.
A **game** is one match launched from the room by its owner. It copies the room's
settings, members and AI seat strategies at launch and keeps that snapshot.

1. Lobby: members join or leave; the owner edits settings and seats (`settings`,
   `addAi`, `removeAi`). Readiness is advisory.
2. The owner launches (`start`): three to eight members are required, and a room
   has at most one active game. `GET /api/rooms/:id` reports it as `activeGame`;
   its page is `/games/{gameShortCode}` (`GET /api/games/:code/state`).
3. While it runs, settings and seats are frozen. Someone who joins mid-game is a
   member but not in the game's roster: they spectate (`seated: false` in player
   observations) and are dealt into the next game. A member seated in the active
   game cannot `leave` until it ends; the owner cannot leave.
4. The game ends when its sampled lifetime elapses, or when the owner uses
   `endGame`. In the same commit the server stamps `endedAt`/`endReason` and
   writes the game's public result to `cg_games.summary`. Sockets receive
   `game.ended` with that result, and `activeGame` becomes null: the room is a lobby again.
5. `GET /api/rooms/:id/games` lists finished games newest first: start and end
   times, settings used, roster, final leaderboard and winners (ties share the
   win). Results contain only what the public leaderboard already shows. Past
   games stay viewable at their final state through `/api/games/:code/state`.

Player observations follow the room's current game slot (the active game, or the
latest one until the next launch), so after a game ends they show its final state
with phase `ended` until the owner launches the next game. The public room state
(`RoomState`) carries no game: use `activeGame`, `GET /api/games/:code/state` and
the history.

## Room assistant access

For the Agent-facing CLI and lifecycle see [room-assistant.md](room-assistant.md).
Authenticated browsers inspect `/api/device/details?code=...` before approving,
may deny through `POST /api/device/deny`, and list their own delegated sessions at
`GET /api/device/grants`. Owner-only
`POST /api/device/grants/:delegateId/revoke` invalidates just that grant and its
live sockets. Pending clients may cancel using `/api/device/cancel` with their
device proof. Read-only grants cannot use either HTTP or socket mutation formats;
all grants remain bound to one room and the approving human. Only an explicit
`owner` grant approved by that room's current owner includes room configuration,
AI budget/seats, game lifecycle and player actions. Read/act grants never inherit
owner rights. No grant includes global administrator powers.

## Room actions

Owner and browser convenience APIs are defined in `lib/api-spec/openapi.yaml`.
Room lookup accepts a UUID or unambiguous Crockford prefix. Listing returns only
rooms the caller has joined; room links/codes permit other logged-in humans to join.
Readiness is advisory. A game requires three to eight participants. AI seat
creation requires `aiAgentId` from the public agent library; it copies the selected
template's name, provider, model, strategy and revision into the seat. The game
roster freezes that snapshot at start. Strategy text is not public room data.

All writes use a single authoritative commit order. A PostgreSQL advisory lease
prevents two server processes from operating the universe simultaneously. Startup
loads persisted state and places interrupted games in recovery rather than
simulating unobserved downtime. World time is frozen in recovery. Games frozen by a
restart or by idling resume on their own once a human is active again; the
2,000-object safety stop waits for the owner's Resume. Schema migrations are
separate from server startup.

## Object types and settings

A game's objects are values of one **instantiation** of an object type: settings carry
`objectType` (`Int`, `string` or `Grid`) and `typeArgs` (`Int {min,max}`,
`string {maxLength}`, `Grid {size,symbols,colours}`). `GET /api/manifest` lists every
type in `objectTypes[]` with its parameters (and presets), capability classes and
badges, its tuned `settingsDefaults`, and the `offered` instantiations: those whose
every dealable utility function has a calibration table. The `settings` room action
refuses any other instantiation. When the owner switches instantiation, tuned fields
the request leaves untouched (absent, or still the room's current value) take the new
instantiation's tuned defaults (`settingsDefaults`, e.g. Grid's object count, spawn rate,
agent income scaled with the board and, on the beginner board, excluded families).
`excludedFamilies` lists family ids never dealt in the game (validated against the
type's catalog). `Manifest.presets` are named starting points in display order
(`grid-first-steps`, `grid-classic`, `grid-big`, `grid-master`); the settings action
`{action:"settings",revision,preset:"grid-first-steps"}` applies one, keeping the
room's language.
`RoomState.objectInstance` and `GameView.objectInstance` describe the instantiation
(`InstanceInfo`: key, label, badges, display tables, codec, mutators and prelude
helpers); `RoomState.utilityCatalog` lists the families any god might draw, with
availability, badges and kid-worded locked reasons (`needs ♠ Suits: pick Playing cards`).

## Scoring (information bits)

Each god draws a utility function (an ordinal: a number or a tuple, bigger is better)
and, with probability `defenceRate`, a defence goal. For god *i* and object *x*:
`rewardBits` is the surprisal of the ordinal under the spawn prior (calibration
tables), `penaltyBits` the soft-hinged surprisal of the defence goal's badness, and
`netBits` n = rewardBits − `penaltyWeight` · (penaltyBits − its prior mean).
payoff_i = n_i · max(0, Σ_{j≠i} n_j); a leaderboard total is the sum of payoffs over
live objects. Scores are server-private (`scores` on each object). A god sees only its
own `{ordinal, rewardBits, penaltyBits?, netBits}` and the aggregates `peerNetBits`
(Σ_{j≠i} n_j), `peerCare` (max(0, peerNetBits)) and `payoff`; the public sees
`salience` (Σ_i n_i) and total payoffs. Aggregates do not prevent inference.

## Agents and energy

An agent is ordinary Python or TypeScript that defines `agent(obj)` against the room's
generated prelude and returns a list of at most 16 **mutator calls**, never a new
object: Int `def agent(x):\n    return [add(1)]`, Grid
`function agent(grid) { return [paint(row(2), "red")]; }`. The engine validates the
calls against the instantiation's closed set of bit-priced mutators and applies them.

- **Summon price** (paid once from god energy, which accrues `energyPerSecond` per
  real-time second from `startingEnergy`): the source's description bits,
  `complexityFunctionId` `ast-bits-v1` (Python, corpus-weighted) or
  `ts-ast-bits-v1-uniform` (TypeScript), one per language, plus each **literal move**
  (a call of a move helper on literal arguments) priced as that move: 3 flag bits +
  log2 #available mutators + its field bits if it is valid here, else its fallback
  bits as an ordinary call. Each room's prelude carries the pricing vocabulary
  (its API names, attributes, parameters, meaningful strings, mutators and areas).
- **Measured per-act price.** At summon (and validation) the server RUNS the agent on
  the season's reference mixture (128 uniform + 64 structured values of the
  instantiation, salted by the season, plus up to 16 live objects as the "game"
  component), once per value, or 8 times per value with different seeds if it used
  `random`. `decisionBits` is the information its actions carry about the object,
  I(X; A) (entropy of its actions for a deterministic agent, a jackknife estimate for
  a randomized one); `expectedActCost` = decisionBits + mean erasure + mean motion +
  `perActFloorBits` (default 2 bits: the Margolus–Levitin floor of every attempted act). Measurement runs outside the authority lock, four at a time
  (about 200 runs for a deterministic agent, 1,600 for a randomized one).
- **Validate** (free) returns `{valid, cost, parts, decisionBits, expectedActCost,
  breakdown: {decision, erasure, motion, floor}, randomized, diagnostics}`.
- **Agent energy.** A new agent starts at 0 and earns `agentEnergyPerSecond` bits per
  second of world time (default 2; Grid 16, provisional pending grid-lab PR #14's follow-up) (nothing during planning, pauses or recovery), capped at
  `agentBatteryActs` × expectedActCost. It is **eligible** while energy ≥ expectedActCost.
- **Interactions.** Each dispatch picks a uniform random object and a uniform random
  eligible agent (one act per agent at a time). Acts are deterministic: a frozen clock,
  and `random` / `Math.random` seeded with `deriveSeed(seasonSalt, ["play", gameId,
  agentId, actIndex])`. An act pays decisionBits + its pointwise erasure + its
  whole-act motion + the floor. A failed act (runtime error, invalid call, no change)
  or a duplicate result (the value of any existing object) changes nothing and pays
  decisionBits + the floor. The calls' own naming bits are reported (`cost.naming`),
  not charged. Energy may go negative: a cooldown.
- **Destroy** (`agent.destroy`, owner only) is free and not refunded. Each god may keep
  `maxAgentsPerGod` live agents (at most 200).
- **Season salt.** `CODE_GODS_SEASON_SALT` is a server secret behind every measurement
  and play seed; production refuses to start without it, development and tests use a
  random per-process salt (with a warning). It is never logged or returned; every game
  and history record carries `seasonCommitment` = sha256(salt), so after the season the
  salt can be revealed and every seed checked.

Dealing: `utilitySelectorId` `fair-aligned` (default) keeps the friendliest even deal of
32 Divine Lottery deals using the shipped synergy matrices of the instantiation and
`priorId`; without a matrix it is the Divine Lottery (`divine-lottery`). `priorId`
(default `uniform`, listed in `Manifest.priors`) is the rarity prior the calibration
tables are keyed by.

Every object value in a world is unique: spawns redraw on collision.

## Player API and WebSocket

The companion/AI client protocol is `code-gods.player.v3`
(`lib/player-client/src/protocol.ts` is normative; see
[player-client-integration.md](player-client-integration.md)):

- `GET /api/player/v1/rooms/:roomId/observation`
- `POST /api/player/v1/rooms/:roomId/commands`

Both require a browser session or approved room-scoped player bearer token.
Commands use `{version,commandId,gameId?,command}`; `commandId` is a UUID.
`gameId` is required for validate, summon, pause and destroy, and stale IDs are rejected.

```json
{"version":"code-gods.player.v3","commandId":"UUID","gameId":"GAME_UUID","command":{"type":"validate","language":"python","source":"def agent(x):\n    return [add(1)]"}}
{"version":"code-gods.player.v3","commandId":"UUID","gameId":"GAME_UUID","command":{"type":"destroy","agentId":"AGENT_UUID"}}
{"version":"code-gods.player.v3","commandId":"UUID","command":{"type":"chat","text":"Public message"}}
```

Other commands are `summon` (same fields as validate), `pause`, and `ready` with a
boolean `ready`. Receipts are `{commandId,accepted,message,validation?}`. Accepted and
rejected receipts are persisted and replayed for the same identity/command ID. Reusing
that ID with changed content fails. Retry the original envelope after an uncertain
connection failure; do not invent a new ID.

The same envelopes are accepted over `wss://SERVER/api/rooms/ROOM_UUID/ws`
(Authorization header from a daemon; browser sockets use same-origin session cookies).
Inbound socket messages are only these envelopes. Outbound envelopes are
`{protocolVersion:1,type,seq,serverTime,payload}`: `room.snapshot` (public `RoomState`),
`player.observation` (the v3 observation), `leaderboard.updated` (standings),
`command.receipt`, `command.error`, `object.spawned`, `object.transformed` (the object
with your own score and peer aggregates; calls and cost only for your own agents),
`game.preparing` (a new game launched with you seated; payload: your observation) and
`game.ended` (the public game record). `seq` is the room commit revision; several
messages from one commit can share it. Snapshots include all current objects and a
recent public chat window; older chat is paged through
`/api/rooms/:roomId/chat?before=TIMESTAMP`.

The observation carries `instance` (InstanceInfo: mutators, helpers, display tables),
`economy` (energy rules and world time), `self.utility` (the kid card: emoji, name,
summary, `def utility(...)` source in the game language, and an optional `penalty`
defence goal), `self.energy`, own agents (`summonCost`, `decisionBits`, `expectedActCost`,
`breakdown`, `randomized`, `energy`, `eligible`, `acts`, `spent`), own objects' scores and peer aggregates, own
transformations (calls and cost), the public leaderboard (`totalPayoff`) and public chat.
There is no per-opponent score endpoint and no private messaging.

## Integration and verification status

The isolated runtimes, utility functions, calibration tables, player protocol and
autonomous AI controller are connected. `game/adapters.ts` is the runtime/utility
boundary (it builds the runtime's `ActSettings` from the instantiation's prelude;
`CONFIG` runtime errors are server bugs, `COMPILE`/`DOMAIN`/`EXECUTION`/`LIMIT` are the
agent's); `game/pricing.ts` prices and measures agents; `game/season.ts` holds the salt. `game/calibration.ts` is the calibration boundary. Startup probes both
languages on every object type's default instantiation with an empty agent
(`def agent(x):\n    return []`, which must return `"[]"`) and advertises only usable
languages. Missing adapters fail explicitly: no host-eval
or placeholder-value fallback exists. AI calls use frozen library strategies,
direct providers and persistent budget gates; see `ai-player-billing.md`.

`pnpm --filter @workspace/api-server test:integration` tests HTTP/WebSocket
routes, projections, a full game per object type (Int, string, Grid) in both
languages, exact costs, agent energy and eligibility, destroy, pause/energy,
replay of agent accounts, the startup guard, persisted receipt serialization and
mock-AI budgets using isolated in-memory SQL/session fixtures. Runtime integration additionally exercises actual Wasm interpreters.
These tests do not prove production PostgreSQL transaction/restart behavior,
real OIDC/device approval, deployment filesystem retention or paid provider
availability. Production restart/reconnect and capacity checks remain necessary.

## Deployment constraints

Use Autoscale with maximum instances set to **1**. This is a single-authority
pilot, not a distributed deployment. Keep the PostgreSQL authority lock.
After 30 minutes of human inactivity, application idle stops background work.
Clients stop polling/reconnecting on WebSocket close `4008` or HTTP `503`
`SERVER_IDLE`. Explicit human Resume calls authenticated `POST /api/activity`
before reconnecting and fetching a full snapshot. Passive traffic and AI
commands must not wake an unattended room. Platform infrastructure shutdown
has no guaranteed deadline. Transient disconnects retry with bounded jitter,
retaining local credentials until expiry; expired device credentials need
human reapproval. Never blindly retry non-idempotent commands with new IDs.

The API build now performs `uv sync --frozen --no-dev` against the committed
`pyproject.toml`/`uv.lock` (`wasmtime==49.0.0`), downloads the SHA-256-pinned CPython
3.15 WASI archive, and places it in `lib/game-runtime/dist/python-3.15.0`.
It runs the real isolated agent probes for Python and TypeScript on every object
type, and fails if provisioning or execution fails. The production launcher uses `uv run --offline --no-sync` with
the built `.pythonlibs` environment; startup does not install dependencies or run
schema migrations. The runner prefers packaged assets and retains `.cache` only
as a development fallback. Never rely on an untracked development cache shipping.

Builds require Python 3.13+, uv, access to the pinned Python packages/archive,
and retention of `.pythonlibs` plus `lib/game-runtime/dist` in the final image.
The API bundle deliberately leaves `@workspace/game-runtime` external: retain
the entire `lib/game-runtime` package, its workspace link under the API's
`node_modules`, and the root pnpm dependency tree (including QuickJS Wasm and
TypeScript declarations). `.replitignore` explicitly includes these paths and
API `dist` output; `.gitignore` still excludes generated build environments.
Production artifact metadata launches from the workspace root and sets
`UV_PROJECT_ENVIRONMENT=.pythonlibs`. Do not deploy only API `dist`.

A fresh `NODE_ENV=production pnpm --filter @workspace/api-server run build`
passed, followed by an isolated relocated-package smoke using the offline,
no-sync launcher, copied runtime assets/environment and pnpm dependencies,
and no `.cache`. That check predates the agent contract and must be repeated with
the current probes. The host executable selected inside `.pythonlibs` was CPython
3.13.11 with wasmtime 49.0.0; the guest remains the SHA-256-pinned CPython 3.15.0
WASI build. Host Python is supplied by Replit's Python module, not pinned by
the guest archive. The virtual environment's Python symlink targets a Nix
store executable, so that module/closure must also exist in the published image.

This is a local packaging check, not proof of an actual published image.
There is no active deployment. Autoscale capacity (maximum instances 1) must be selected
before publishing; choose the paid capacity deliberately in Publishing settings
rather than assuming a hardware tier. A deployment smoke must verify both
languages after image creation, including Python/Nix retention. The existing
startup language fallback may permit TypeScript-only startup; a healthy HTTP
endpoint alone is not proof that published Python is usable.

### Interaction event log and checkpoints

`cg_interaction_batches` is an additive development schema change; deploy it through
the normal Replit Publish schema-diff flow. There is no startup DDL or production
migration script. The table contains room/game IDs, an end sequence, and one event
per act: a transformation (resulting object value, version, private scores, calls and
cost) or a failed act (`agent.failed`: reason and cost), each with the acting agent's
resulting account (`{id, account, acts, spent}`, absolute values). Replay therefore
restores agent balances as well as objects. It contains no agent source.

`cg_games.started_at`, `ended_at` and `summary` (plus the `cg_games_room_started_idx`
index) are nullable columns. The summary is the public game record; it carries
`scoring: "information-v1"` and holds no scores or sources. History lists only
summaries with that marker.

**Startup guard.** Stored state is JSONB. A stored room whose state does not parse as
the current schema (settings that fail validation, a game without the scoring marker,
objects without scores, agents without accounts) is reset on startup: default
settings, no game, members and chat kept, its interaction batches dropped. Games
written by an earlier design are not shown (`/games/:code/state` is 404) and are not
part of any history. This is a guard against unreadable rows, not a translation: no
old state is mapped. There is no destructive migration; unused columns may remain.

Interaction completion changes the local cache first. Buffers hold at most 64
events per room and 256 globally, flushing after 100ms or at 32 events in a room
(128 globally). A flush inserts one compact batch rather than rewriting worlds.
`(room_id, end_seq)` is the idempotency key. An uncertain append acknowledgement
freezes admission until that exact batch succeeds on retry. Socket notifications
follow durable append; reads of the live cache may expose the bounded uncommitted
window. Abrupt termination can lose only that uncommitted interaction window.
The 100ms interval is a flush target, not a durability SLA during database stalls;
capacity limits bound retained changes and prevent unlimited backlog.

Clock checkpoints and commands write complete room/game snapshots and delete
covered batches in the **same transaction**. Commands acknowledge energy spending
and receipts only after that transaction commits. New-game/end/pause commands
therefore cannot discard committed transformations. Graceful shutdown drains
pending appends. Startup replays batches newer than each room checkpoint in sequence
order, validates object versions, previous values and agents, then checkpoints the recovered
world in recovery mode. A sequence gap or invalid transition fails startup rather
than silently substituting incomplete state. Historical `cg_games.state` is a
checkpoint, not a continuously updated interaction feed.

Isolated PostgreSQL pipeline verification (random temporary schema, dropped in
`finally`, no user table writes):
`RUN_ISOLATED_POSTGRES_BENCHMARK=1 node artifacts/api-server/test/pipeline-postgres-benchmark.mjs`.
It exercises real TypeScript Wasm and a clearly labeled synthetic runtime, with
10/100/2000 objects, actual append/checkpoint durability and bounded teardown.
The benchmark-only 4000Hz setting measures infrastructure headroom; production
settings still default to 100Hz and allow at most 1000Hz. Measurements include
drain/checkpoint time and are not a guarantee of achieved speed for every game.
