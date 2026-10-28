# Player clients: coordinator integration contract

## Ownership and status

`lib/player-client` owns protocol validation, human SDK, HTTP transport, analytics
and the secured per-player daemon. `lib/ai-player` owns the autonomous model policy,
budgets and injectable Replit AI Integrations adapter. `artifacts/player-web`
is the customizable human console, separate from the common server display.

The authoritative server implements the `code-gods.player.v3` adapter and device
approval routes. The isolated integration test below exercises current routes
and the daemon using real HTTP and WebSocket connections. The standalone Vite
preview is not a daemon and reports that no daemon is configured.
Never pass raw engine state to a client or model.

## Authoritative HTTP adapter assumptions

Configure the transport with an absolute HTTPS base such as
`https://<game-host>/api/player/v1` (loopback HTTP is allowed only for development).
Paths below are relative to that base:

| Method/path | Input | Output |
|---|---|---|
| POST /api/device/request (origin-relative) | `{roomId,challenge}` (S256 PKCE) | `{deviceId,deviceSecret,userCode,verificationPath,expiresIn,interval}` |
| POST /api/device/approve (origin-relative) | `{code}`, authenticated browser member | `{status:"approved"}` |
| POST /api/device/poll (origin-relative) | `{deviceId,deviceSecret,verifier}` | `{status:"pending"}` / room credential |
| GET /rooms/:roomId/observation | Bearer room credential | `Observation` |
| POST /rooms/:roomId/commands | Bearer room credential; `Envelope` | `CommandResult` |

Device expiry and poll interval are seconds; the server gives five-minute device
approval and fifteen-minute room sessions. Wire credential:
`{token,roomId,godId,expiresIn}`; the daemon converts expiry to epoch milliseconds.
Browser approval URL must have exactly the configured authoritative origin.
Device secret and PKCE verifier are daemon-private; only user code
and verification URL reach the browser. Browser signs into the authoritative
service and approves membership there; this package never issues membership or
approves a request itself. No manually pasted static keys are supported.

Observation requires version, roomId, monotonically increasing revision, phase,
language, self (godId/label/isAI/energy/ready/pauseUsed and `utility`, the kid card:
familyId/emoji/name/theme/summary/language/source, plus an optional `penalty` defence
goal with its own summary, comparative and source), objects
(`{id, value, own: {ordinal, rewardBits, penaltyBits?, netBits}, peerNetBits, peerCare, payoff}`),
own agents (id/source/language/summonCost/decisionBits/expectedActCost/breakdown/randomized/
energy/eligible/acts/spent),
own transformations (id/agentId/before/after/calls/cost), the public leaderboard
(`totalPayoff`) and public chat with visibly labelled AI identities. `instance` is the
game's instantiation (game-types InstanceInfo: key, label, badges, display tables,
codec, the mutator list and the prelude helpers with Python and TypeScript
signatures); `economy` gives the energy rules (energyPerSecond, agentEnergyPerSecond,
agentBatteryActs, maxAgentsPerGod, penaltyWeight, perActFloorBits), whether the room
offers the commit clause (`commitClause`, then `only_if_better` / `onlyIfBetter` is in
`instance.helpers`), its `objectSelection` and the current world time.
`roomShortCode`, `gameShortCode` and `seated` identify the game; `seated: false` means
the player joined after this game launched: they spectate and play in the room's next
game. Phase `lobby` means no game has been played yet. Phase `ended` shows the finished
game's final state until the owner launches the next game, which arrives with a
new `gameId`. See schemas for caps. Arrays are bounded windows, not full world
histories. Agents and transformation history are filtered to the requesting god.
Only the player's own score and aggregates over the other gods are disclosed.
Unknown fields are stripped recursively before UI/model consumption.
Aggregates do not prevent mathematical inference.

Commands are only validate, summon, destroy, ready, pause and public chat. There is no
start, owner, admin, direct-message, arbitrary URL or file access command (owner
actions go through the assistant's owner grant, see room-assistant.md). An agent
defines `agent(obj)` and returns a list of mutator calls built with the room's
prelude (`def agent(x):\n    return [add(1)]`); validate/summon delegate to the
authoritative runtime and never execute locally. A validation result has `valid`,
`cost` (the summon price in bits) and its `parts`, `decisionBits` (the measured decision
information every act pays), `expectedActCost` with its `breakdown` (decision, erasure,
motion, floor), `randomized` and diagnostics. Agents run with a frozen clock and a
server-seeded `random`. Every receipt
echoes commandId and contains accepted/message, plus validation when applicable.
Source caps are client ceilings, not replacements for server/runtime limits.

Server must atomically enforce membership, room/phase/language rules, energy,
runtime isolation, rate limits, minimum three players and ownership for every
request. It must deduplicate commandId **per room and god**, persist the receipt
for the session lifetime and reject an ID reused with different payload. The
daemon coalesces duplicate requests and remembers payload binding even after an
uncertain failure. Lost responses may have applied: retry the same envelope.
Neither transport nor provider silently retries chargeable work.

The Node launcher uses `WebSocketPlayerTransport` with private Authorization
upgrade headers at `/api/rooms/:roomId/ws`, reconnect/backoff, observation events
and command receipts. Credentials never appear in socket URLs. Snapshot reads and
commands while the socket is unavailable use HTTP. Human UI polls full snapshots
every 1.5s; mutations refresh the projection immediately.
Public chat persistence and delivery remain server-owned.

## Migrating a client from v2 to v3

`code-gods.player.v3` replaces v2 outright; the server accepts only v3 envelopes and
a v2 client gets a clear version error. To update a client (or a duplicated client
copy, see PILOT.md):

1. Pull the repository and send `version: "code-gods.player.v3"` (import `VERSION`
   from `@workspace/player-client`).
2. Objects: `ownUtility`, `othersUtilitySum` and `score` are gone. Read
   `own.netBits` (and `own.rewardBits`, `own.penaltyBits`, `own.ordinal`),
   `peerNetBits` (the sum over the other gods), `peerCare = max(0, peerNetBits)` and
   `payoff = own.netBits × peerCare`. Values are bits, not [0, 1].
3. Leaderboard rows carry `totalPayoff` instead of `score`.
4. Agents: `cost` is gone. Read `summonCost`, `expectedActCost`, `energy`,
   `eligible`, `acts` and `spent`. An agent acts only while eligible.
5. Programs: an agent now defines `agent(obj)` returning mutator calls
   (`def agent(grid):\n    return [paint(row(2), "red")]`); a bare `lambda x: ...` or
   `(x) => ...` is rejected. The mutators and helpers are in `observation.instance`.
6. Validation results add `parts`, `decisionBits`, `expectedActCost`, `breakdown` and
   `randomized`; agents add `decisionBits`, `breakdown` and `randomized`. Add the
   `destroy {agentId}` command.
7. `self.utility` is the kid card (familyId, emoji, theme, shape, optional `penalty`).
   The removed `objectType`/`grid` fields: use `instance.objectType` and `instance.args`.

## Daemon and human browser

Build the artifact, then run the local daemon with Node 24:

```sh
pnpm --filter @workspace/player-web build
pnpm --filter @workspace/player-client serve \
  https://GAME_HOST/api/player/v1 \
  ../../artifacts/player-web/dist/public \
  /tmp/code-gods-private.launch
```

Use an unused private launch-file path. The daemon binds only to 127.0.0.1,
uses PORT or 4317, and creates the file with exclusive creation and permissions
0600. Open its URL within 60 seconds. Do not commit/share the file or paste the
URL into chat/logs. This short-lived single-use local capability is distinct from
the room token. Regenerate using a fresh daemon/launch-file path when needed.
The one-hour HttpOnly SameSite=Strict local session and CSRF value stay in memory;
the browser cannot read the cookie. Approval then obtains the room token directly
into daemon memory. No credentials go into localStorage, files or model messages.
Browser reload reuses a valid session/room; expired room credentials require a
fresh browser approval. Disconnect invalidates the session and clears identity
state. Stop the daemon to destroy its remaining in-memory state.

For hosted Replit use, coordinator can mount `createPlayerDaemon({origin,
basePath:"/player",serverUrl})` with `nodeHandler` inside the player-owned service
and serve the built UI at the same origin/path. Use a trusted configured public
HTTPS origin, never an arbitrary forwarded header. Deliver `launchUrl()` only
through an already-authenticated owner channel. Instantiate a daemon per human
player; do not share one process-global session among multiple users. Do not
replace this with an open proxy. The unauthenticated Vite preview returns 503
for daemon calls and never holds an upstream token.

Replit Agent uses the separate workspace-local Unix socket bridge documented in
[`room-assistant.md`](room-assistant.md), not browser session/Origin/CSRF endpoints.
Never extract browser cookies or copy tokens into chat. A same-workspace editor
is trusted; the bridge is not isolation from processes with the same OS identity.

All local mutations require exact Origin and JSON content type. Every data route
requires a live cookie; all mutations after login also require X-CSRF-Token.
Cross-site requests and Host mismatches are rejected, no CORS is enabled, and
request bodies are capped before buffering by the Node adapter. Session login
itself requires the one-time ticket plus exact Origin. No secrets are included in
errors. HTTPS sessions use Secure cookies.

## Autonomous AI wiring (coordinator owns provider setup)

Read the `ai-integrations-openai` skill and provision **Replit AI Integrations**
in the coordinator session. Never ask players for model API keys. Inject the
provisioned OpenAI SDK client into `openAIProvider(client, model, prices)`.
No setup is performed in this branch to avoid conflicting with coordinator
configuration. Missing provider throws visibly; there is no heuristic fallback.

Use a supported chat-completion model (e.g. `gpt-5.6-terra`) with **current
conservative price ceilings**, not guessed historical rates. The adapter passes
maxRetries:0 per request and requests at most 8192 output tokens. Construct one
`RoomBudget` per room and share it across all of that room's controllers. Rate,
total-token and USD limits are mandatory positive finite numbers. Reservations
use UTF-8 input bytes plus framing as a conservative token bound and reserve
the entire maximum completion at the configured price ceilings; reservations
are retained after cancellation or failures. Thus budgets may stop play early
but do not silently refund potentially billed requests.

```ts
const sharedBudget = new RoomBudget({
  callsPerMinute: 6, totalTokens: 500_000, roomSpendUsd: 2,
});
const controller = new AIController({
  roomId, godId,
  transport: playerScopedTransport,
  provider: openAIProvider(replitOpenAIClient, configuredModel, verifiedPrices),
  budget: sharedBudget,
  onEvent: event => publishToRoomUsageView(event),
});
// Run on a server-owned lifecycle, never inside an HTTP request:
await controller.run(roomAbortSignal);
```

`run` repeatedly observes, reasons, validates/summons and negotiates without
per-turn input. Each controller pins its room/god and requires self.isAI=true.
Context is rebuilt per turn with only that god's projection and last eight
receipts, not shared between gods. System policy explicitly treats all world/chat/
source/diagnostic data as untrusted user-message content. There are no LLM tools,
host execution or external URL commands. Prompt injection cannot be made
mathematically impossible, but even a malicious model output cannot widen the
command schema or obtain credentials it never received. Voluntary disclosure of
the bot's own utility function remains allowed.

Model inputs are capped at 64KB; observations are windowed further for model
context. Strict output schema allows at most four actions. Every summon is
validated using the same runtime endpoint as humans, then compared with fresh
energy; the server remains final authority. Uncertain commands retain their IDs.
Turn deadline is 180s (validate and summon measure the agent on the server); caller abort and stop() cancel in-flight SDK/transport calls.
Loop errors back off exponentially up to 60s and stop visibly after five failures.
Only one turn per controller runs at once. HTTP/SDK adapters must honor signals.

`onEvent` is mandatory: wire usage, failure, thinking/acting/backoff/stopped and
command acknowledgments to a visible usage/status surface and safe operational
logging. Events do not contain chat, utility source, provider errors or credentials.
The budget is process-local: if running multiple controller processes, coordinator
must centralize reservations before starting them. Do not reset budgets on bot
restart within a room or hide a failed controller behind another policy.

## Verification

### Independent player-process acceptance

From the repository root, with dependencies installed:

```sh
node artifacts/api-server/test/client-daemon-integration.runner.mjs
```

This bundles the actual authority routes and identity/session implementation with
a fresh in-memory SQL fixture (not a live database). It launches two separate Node
daemon processes, each using the current SDK's real HTTP/WebSocket transports.
Synthetic browser members approve each daemon through the real device route;
the daemon generates its own PKCE verifier and keeps room credentials in memory.
The parent test acts as each local browser over HTTP. No paid model calls occur.
Child environments are whitelisted, excluding inherited database/model keys.

Assertions cover independent process IDs, origins, cookies and identities;
single-use launch tickets; rejected invalid device proof; rejected unauthenticated
WebSocket upgrades; WS command receipts; validation and summoning; receipt replay
and changed-payload rejection; private agent projections; public chat; actual
runtime transformations/events; forced socket disconnect, authenticated reconnect
and resync; and disconnecting one daemon without disconnecting the other.
The test exchanges launch capabilities privately over IPC and never logs secrets.

This is **not** a test of creating two literal Replit cloud copies, OIDC login
in a real browser, reverse-proxy hosting, or the rendered player UI. The two child
processes use the same checked-out build, independently configured to the same
isolated authority.

### Replit copy startup (development preview)

Each player should copy the repository into their own private Replit workspace,
install dependencies, build `@workspace/player-web`, and point their daemon at
the **same authoritative game's** `https://GAME_HOST/api/player/v1`, not a new
authority in each copy. Each human must sign in and join that room at GAME_HOST;
the owner must provide the required minimum three seats and start the game.
Then each player opens their private one-use daemon launch URL, enters the room
ID, follows the device verification link, approves as their own room member,
and returns to their own console to validate/summon/ready.

In the **client copy only**, stop the existing Player Vite service before using
its port. Do not run two services on that port. The checked-in player artifact
already maps `/player/` to port **22772**; reuse that mapping instead of creating
an additional public port. The following commands are from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/player-web build
export GAME_PLAYER_API='https://YOUR_DEPLOYED_GAME_HOST/api/player/v1'
: "${REPLIT_DEV_DOMAIN:?Run this in the client Replit development workspace}"
PRIVATE_LAUNCH_DIR="$(mktemp -d /tmp/code-gods-player.XXXXXX)"
chmod 700 "$PRIVATE_LAUNCH_DIR"
env -i PATH="$PATH" HOME="$HOME" \
  PORT=22772 PLAYER_ORIGIN="https://$REPLIT_DEV_DOMAIN" \
  node --experimental-transform-types lib/player-client/src/serve.ts \
  "$GAME_PLAYER_API" artifacts/player-web/dist/public \
  "$PRIVATE_LAUNCH_DIR/launch"
```

This last command stays running. Use the workspace's private file access to open
the newly created launch file's URL within 60 seconds; never paste it into chat,
public logs or a shared terminal transcript. The random directory is visible in
the process's launch arguments if needed; the URL itself is only in the 0600
file. Remove the file after use. Restart with a fresh private directory if it
expires. The launcher binds `0.0.0.0` when `PLAYER_ORIGIN` is configured and
retains exact Host/Origin/CSRF validation; it does not trust forwarded headers.
For repeated use, replace the **client copy's** Player development workflow
command with this launcher rather than restarting Vite. No workflow changes or
cloud copies were performed by the verification test.

`REPLIT_DEV_DOMAIN` is for development preview only. A deployed client service
must explicitly set `PLAYER_ORIGIN` to its actual HTTPS deployment origin and
provide an authenticated owner-only launch delivery mechanism; the existing
static player deployment is not that service. Keep the authoritative GAME_HOST
separate. Each copy needs no database or model-provider secrets; `env -i` above
prevents accidentally passing inherited keys to the daemon.

The launch URL fragment establishes a Secure, HttpOnly cookie; it is not a room
credential. The owner signs into GAME_HOST for approval, then uses the client
console. A same-workspace Agent uses the separate assistant CLI in
[`room-assistant.md`](room-assistant.md); it never reuses browser cookies or
CSRF tokens.
Actual Replit proxy/browser behavior remains a manual pilot check, not an
automated cloud-copy claim.

```sh
pnpm --filter @workspace/player-client test
pnpm --filter @workspace/ai-player test
pnpm run typecheck:libs
pnpm --filter @workspace/player-web typecheck
pnpm --filter @workspace/player-web build
```

Tests cover recursive privacy projection, adversarial chat separation, strict
command allowlists, identity mismatch, credential expiry bounds, session replay,
CSRF/origin/authentication, approval token non-disclosure, receipt deduplication,
autonomous validation/cost, uncertain outcome retries, room-shared budgets,
cancel, missing provider and absence of admin/DM commands. They are independent
adapter tests. The additional process test above covers isolated authoritative
gameplay, not a fabricated successful live cloud match.
