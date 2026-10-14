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
   Tokens are room-scoped, expire after four hours, and cannot change owner settings.
   `/api/device/revoke` revokes the presented token.

Approval codes expire after five minutes. This is **not** a native Replit OAuth
device grant. The browser approval binds a local client to the verified account.

## Room actions

Owner and browser convenience APIs are defined in `lib/api-spec/openapi.yaml`.
Room lookup accepts a UUID or unambiguous Crockford prefix. Listing returns only
rooms the caller has joined; room links/codes permit other logged-in humans to join.
Readiness is advisory. A game requires at least three participants.

All writes use a single authoritative commit order. A PostgreSQL advisory lease
prevents two server processes from operating the universe simultaneously. Startup
loads persisted state and places interrupted games in recovery rather than
simulating unobserved downtime. Schema migrations are separate from server startup.

## Player WebSocket

`wss://SERVER/api/rooms/ROOM_UUID/ws`, Authorization header from daemon.
Browser display sockets can use same-origin session cookies.

Commands:

```json
{"protocolVersion":1,"command":"agent.summon","requestId":"UUID","gameId":"GAME_UUID","payload":{"source":"lambda x: x"}}
{"protocolVersion":1,"command":"pause.use","requestId":"UUID","gameId":"GAME_UUID","payload":{}}
{"protocolVersion":1,"command":"chat.send","requestId":"UUID","payload":{"text":"Public message"}}
{"protocolVersion":1,"command":"ready.set","requestId":"UUID","payload":{"ready":true}}
```

Snapshot/reconnect requests use `command: "subscribe"` or `"resume"`.
Envelopes have `{protocolVersion,type,seq,serverTime,payload}`.
Current messages: `room.snapshot`, `leaderboard.updated`, `command.receipt`,
`command.error`. Snapshots include all current objects and a recent public chat
window. Older public chat is paged through `/api/rooms/:roomId/chat?before=TIMESTAMP`.
Successful player command receipts are persistent and deduplicated by identity,
game and request ID. Reusing an ID with changed content fails.

Private player snapshots have `self` with the player's `valueSource`, current
energy, own agent source list and pause status. Personal object rows contain
`ownValue`, `othersValueSum` and their product `score`. There is no per-opponent
valuation endpoint and no private messaging.

## Integration status

The independently built isolated runtimes, value generators, and human/AI clients
must be connected before this becomes a playable release. `game/adapters.ts`
defines the server-side runtime and valuation boundary. Missing adapters fail
explicitly; there is no host-eval or placeholder-value fallback. AI seat creation
is available but starting with AI seats is blocked until its controller is wired.

Final integration must align the client command/error schemas, add granular
game-start/transformation events with per-event ordering, verify bot budgets and
autonomous scheduling, and test restart/reconnect end to end. Do not treat this
intermediate server preview as the completed MVP.
