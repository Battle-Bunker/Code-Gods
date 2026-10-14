# Player clients: coordinator integration contract

## Ownership and status

`lib/player-client` owns protocol validation, human SDK, HTTP transport, analytics
and the secured per-player daemon. `lib/ai-player` owns the autonomous model policy,
budgets and injectable Replit AI Integrations adapter. `artifacts/player-web`
is the customizable human console, separate from the common server display.

The checked-in authoritative OpenAPI spec currently contains only healthz. No
parent player DTO or routes were available in this branch. Accordingly,
`code-gods.player.v1` in `lib/player-client/src/protocol.ts` is an explicit
**integration contract**, not a claim these endpoints already exist. Coordinator
must map its versioned observation/commands to this adapter or update this single
contract in coordination. Do not pass raw engine state to a client or model.
The preview deliberately reports that no daemon is configured. Contract tests use
injected fixtures; they do not demonstrate live gameplay or successful model calls.

## Authoritative HTTP adapter assumptions

Configure the transport with an absolute HTTPS base such as
`https://<game-host>/api/player/v1` (loopback HTTP is allowed only for development).
Paths below are relative to that base:

| Method/path | Input | Output |
|---|---|---|
| POST /device/start | `{version:"code-gods.player.v1",roomId}` | `{deviceCode,userCode,verificationUri,expiresAt,intervalMs}` |
| POST /device/poll | `{deviceCode}` | `{status:"pending"}` / `{status:"denied"}` / `{status:"approved",credential}` |
| GET /rooms/:roomId/observation | Bearer room credential | `Observation` |
| POST /rooms/:roomId/commands | Bearer room credential; `Envelope` | `CommandResult` |

Times are epoch milliseconds. Poll interval is 1–30 seconds. Device and room
credential expiry is at most 15 minutes. Credential:
`{token,roomId,godId,expiresAt}`. Browser approval URL must have exactly the
configured authoritative origin. Device code is daemon-private; only user code
and verification URL reach the browser. Browser signs into the authoritative
service and approves membership there; this package never issues membership or
approves a request itself. No manually pasted static keys are supported.

Observation requires version, roomId, monotonically increasing revision, phase,
language, self (godId/label/isAI/energy/ready/valueSource), objects
(id/value/ownValue/othersSum/payoff), own agents (id/source/language/cost),
own transformations (id/agentId/before/after), public leaderboard and public chat
with visibly labelled AI identities. See schemas for caps. Arrays are bounded
windows, not full world histories; coordinator must window larger rooms.
Agents and transformation history must already be filtered to the requesting god.
Only the player's value source and aggregate opponent values are allowed.
Unknown fields are stripped recursively before UI/model consumption.
Aggregate values do not prevent mathematical inference.

Commands are only validate, summon, ready, pause and public chat. There is no
start, owner, admin, direct-message, arbitrary URL or file access command.
Programs are callable expressions (Python `lambda x: x`, TypeScript `(x) => x`);
validate/summon delegate to the authoritative runtime and never execute locally.
Validation result requires valid, cost and diagnostics. Every receipt echoes
commandId and contains accepted/message, plus validation when applicable.
Source caps are client ceilings, not replacements for server/runtime limits.

Server must atomically enforce membership, room/phase/language rules, energy,
runtime isolation, rate limits, minimum three players and ownership for every
request. It must deduplicate commandId **per room and god**, persist the receipt
for the session lifetime and reject an ID reused with different payload. The
daemon coalesces duplicate requests and remembers payload binding even after an
uncertain failure. Lost responses may have applied: retry the same envelope.
Neither transport nor provider silently retries chargeable work.

No event transport is invented here. Human UI polls full snapshots every 1.5s;
the transport-neutral interface permits coordinator SSE/WebSocket adapters later.
Mutations refresh the projection immediately. Public chat persistence and
delivery remain server-owned.

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

Replit Agent can use the same local session/Origin/CSRF command endpoints after
the user approves the room; it receives no owner capabilities. A same-workspace
code editor is trusted to customize its own player environment; this is not a
security boundary against that player reading their own process memory.

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
the bot's own value source remains allowed.

Model inputs are capped at 64KB; observations are windowed further for model
context. Strict output schema allows at most four actions. Every summon is
validated using the same runtime endpoint as humans, then compared with fresh
energy; the server remains final authority. Uncertain commands retain their IDs.
Turn deadline is 60s; caller abort and stop() cancel in-flight SDK/transport calls.
Loop errors back off exponentially up to 60s and stop visibly after five failures.
Only one turn per controller runs at once. HTTP/SDK adapters must honor signals.

`onEvent` is mandatory: wire usage, failure, thinking/acting/backoff/stopped and
command acknowledgments to a visible usage/status surface and safe operational
logging. Events do not contain chat, value source, provider errors or credentials.
The budget is process-local: if running multiple controller processes, coordinator
must centralize reservations before starting them. Do not reset budgets on bot
restart within a room or hide a failed controller behind another policy.

## Verification

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
adapter tests, not fabricated successful live matches.
