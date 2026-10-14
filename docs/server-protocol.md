# Code Gods server integration contract

The server display lives at `/`. All HTTP and WebSocket API paths start with `/api`.
The current display uses generated OpenAPI hooks and one-second polling. It never
receives private valuation descriptors, seeds, end deadlines, or opponent values.

## Identity

Browser login: `/api/login?returnTo=/rooms/ROOM_UUID`; callback `/api/callback`.
Verified Replit OIDC subjects identify humans. Session tokens are opaque; only
SHA-256 hashes are persisted. Cookies are Secure, HttpOnly, SameSite=Lax.

Player clients do not inherit Replit Agent credentials. They use an application
device approval flow:

1. Generate a random verifier locally and its base64url SHA-256 challenge.
2. `POST /api/device/request` with `{roomId,challenge}`. Keep the returned
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
simulating unobserved downtime. Schema migrations are separate from server startup.

## Player API and WebSocket

The companion/AI client protocol is `code-gods.player.v1`:

- `GET /api/player/v1/rooms/:roomId/observation`
- `POST /api/player/v1/rooms/:roomId/commands`

Both require a browser session or approved room-scoped player bearer token.
Commands use `{version,commandId,gameId?,command}`; `commandId` is a UUID.
`gameId` is required for validate, summon and pause, and stale IDs are rejected.
Examples:

```json
{"version":"code-gods.player.v1","commandId":"UUID","gameId":"GAME_UUID","command":{"type":"validate","language":"python","source":"lambda x: x"}}
{"version":"code-gods.player.v1","commandId":"UUID","command":{"type":"chat","text":"Public message"}}
```

Other commands are `summon` (same fields as validate), `pause`, and `ready`
with a boolean `ready`. Programs must be one expression evaluating to a unary
function, e.g. Python `lambda x: x` or TypeScript `(x: number) => x`; module/export
wrappers are not the agent submission protocol. Validation is free; successful
summoning charges the runtime's measured structural cost exactly once.

Receipts are `{commandId,accepted,message,validation?}`. Accepted and rejected
v1 receipts are persisted and replayed for the same identity/command ID.
Reusing that ID with changed content fails. Retry the original envelope after
an uncertain connection failure; do not invent a new ID.

The same v1 envelopes are accepted over:

`wss://SERVER/api/rooms/ROOM_UUID/ws`, Authorization header from daemon.
Browser display sockets can use same-origin session cookies.

The older browser convenience commands are also accepted:

```json
{"protocolVersion":1,"command":"agent.summon","requestId":"UUID","gameId":"GAME_UUID","payload":{"source":"lambda x: x"}}
{"protocolVersion":1,"command":"pause.use","requestId":"UUID","gameId":"GAME_UUID","payload":{}}
{"protocolVersion":1,"command":"chat.send","requestId":"UUID","payload":{"text":"Public message"}}
{"protocolVersion":1,"command":"ready.set","requestId":"UUID","payload":{"ready":true}}
```

Snapshot/reconnect requests use `command: "subscribe"` or `"resume"`.
Envelopes have `{protocolVersion,type,seq,serverTime,payload}`.
Current messages include `room.snapshot`, `leaderboard.updated`, `command.receipt`,
`command.error`, `object.spawned` and `object.transformed`. The `seq` is the room
commit revision; several messages from one commit can share it, so it is not a
unique event cursor. Object events also have event IDs. Snapshots include all
current objects and a recent public chat
window. Older public chat is paged through `/api/rooms/:roomId/chat?before=TIMESTAMP`.
Successful player command receipts are persistent and deduplicated by identity,
game and request ID. Reusing an ID with changed content fails.

Private player snapshots have `self` with the player's `valueSource`, current
energy, own agent source list and pause status. Personal object rows contain
`ownValue`, `othersValueSum` and their product `score`. There is no per-opponent
valuation endpoint and no private messaging.

## Integration and verification status

The isolated runtimes, value generators, player protocol and autonomous AI
controller are connected. `game/adapters.ts` is the runtime/valuation boundary.
Startup probes both languages, including string NUL/newline preservation, and
advertises only usable languages. Missing adapters fail explicitly: no host-eval
or placeholder-value fallback exists. AI calls use frozen library strategies,
direct providers and persistent budget gates; see `ai-player-billing.md`.

`pnpm --filter @workspace/api-server test:integration` tests HTTP/WebSocket
routes, projections, three-player games, exact costs, pause/energy, persisted
receipt serialization and mock-AI budgets using isolated in-memory SQL/session
fixtures. Runtime integration additionally exercises actual Wasm interpreters.
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
It runs real isolated identity probes for Python and TypeScript in both the
integer and string domains (including NUL/newline strings), and fails if
provisioning or execution fails. The production launcher uses `uv run --offline --no-sync` with
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
and no `.cache`. Both languages passed integer and NUL/newline string identity
checks (cost 6). The host executable selected inside `.pythonlibs` was CPython
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
