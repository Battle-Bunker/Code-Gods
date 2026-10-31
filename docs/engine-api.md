# Engine API (Convex)

The engine is one Convex deployment. Clients talk to it in two ways:

- **Convex functions** at the client URL `https://<dep>.convex.cloud`, using `ConvexReactClient`,
  `ConvexClient` or `ConvexHttpClient` and the generated `api` from
  `artifacts/engine/convex/_generated/api`.
- **HTTP actions** at the site URL `https://<dep>.convex.site`, which also serves the engine UI at `/`
  and the default player client at `/player/`.

Locally (`pnpm --filter @workspace/engine dev`) these are `http://127.0.0.1:3210` and
`http://127.0.0.1:3211`.

A player app configures only the **site URL**. `GET /api/config` returns
`{convexUrl, siteUrl, version}`.

## Identity

Every function authenticates with a 10-minute RS256 JWT. There are two kinds, told apart by issuer:

- **`browser` scope.** A human signed in on the site with **Google**, through Better Auth served by the
  deployment (`/api/auth/*`). The session is an HttpOnly cookie on the site origin (24 h), shared by the
  engine UI at `/` and the hosted player client at `/player/`. Convex JWTs come from
  `GET /api/auth/convex/token` (issuer `<site>`, audience `convex`). The human's god id is the Better
  Auth user id; signing out ends the session at once, even for an unexpired JWT.
- **`player` scope.** A player app or room assistant holding a room credential (`cgc_…`). It
  exchanges the credential with `POST /api/device/token {credential}` → `{token, expiresAt, roomId,
  permission, credentialId, credentialExpiresAt}` (issuer `<site>/api/device`, audience `code-gods`), and
  should refresh about a minute before `expiresAt`. A 401 means the credential was revoked or has
  expired: reconnect.
- **Permissions:** `read` < `act` < `owner`. An owner credential also needs the human to be the room's
  current owner. Errors are `ConvexError` with `data = {code, message}`; the codes are
  `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `INVALID`, `NOT_FOUND` and so on.
- **Admins** have a verified Google email listed in `CODE_GODS_ADMIN_EMAILS`.

```ts
// React, same origin as the site (artifacts/code-gods/src/lib/convex.tsx)
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";

const authClient = createAuthClient({ baseURL: location.origin, plugins: [convexClient()] });
const convex = new ConvexReactClient(convexUrl);
// <ConvexBetterAuthProvider client={convex} authClient={authClient}>…   (the current human: auth/user:me)
// sign in:  authClient.signIn.social({ provider: "google", callbackURL: location.pathname + location.search })
// sign out: authClient.signOut()
```

## HTTP actions (`/api/*`)

| Route | Body → result |
|---|---|
| `GET /api/health` | `{ok, version}` |
| `GET /api/config` | `{convexUrl, siteUrl, version}` (CORS `*`) |
| `GET /api/.well-known/jwks.json` | the public JWKS of player JWTs |
| `/api/auth/*` | Better Auth: `POST /api/auth/sign-in/social {provider: "google", callbackURL}` → `{url}` (Google), `GET /api/auth/callback/google`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `GET /api/auth/convex/token` → `{token}`, `GET /api/auth/convex/jwks`. Same origin only; callback URLs must be on the site |
| `POST /api/device/request` | `{challenge (S256, 43 chars), room (id/guid/short code), permission?: read\|act\|owner (default act), label?}` → `{deviceId, deviceSecret, userCode "XXXX-XXXX", verificationUrl "<site>/device?code=…", roomId, roomCode, permission, label, expiresIn: 300, interval: 2}` |
| `POST /api/device/poll` | `{deviceId, deviceSecret, verifier}` → 200 `{status:"approved", credential, credentialId, roomId, permission, expiresAt}` (once only), 202 pending, 429 slow_down, 403 denied/forbidden, 410 expired, 400 invalid |
| `POST /api/device/token` | `{credential}` or `Authorization: Bearer cgc_…` → a player JWT (see above) |
| `POST /api/device/revoke` | `{credential}` → `{status:"revoked"}` |

Local deployments only (`pnpm --filter @workspace/engine dev`): `POST /api/auth/sign-in/oauth2
{providerId: "fake", callbackURL}` signs in through the stand-in OIDC server (`scripts/fake-oidc.mjs`); it
exists only while `CODE_GODS_TEST_FIXTURES` or `CODE_GODS_DEV` and `CODE_GODS_FAKE_OIDC_URL` are set.

## MCP (`POST /mcp`) and the agent tools

Every assistant surface (Claude, Claude Code, Replit Agent, the CLI, later the in-client assistant) uses
one tool registry: definitions in `lib/player-client/src/tools.ts` (zod; JSON Schema committed as
`tools.schema.json`), executors in `artifacts/engine/convex/agent/registry.ts`. A tool runs inside Convex
as the human behind the credential, in the credential's one room, through the same projections and
commands as the human's own client. How to connect Claude: `docs/connect-claude.md`.

- **Transport.** `POST /mcp`, stateless, JSON responses only. It answers the 2026-07-28 protocol
  (`server/discover`, per-request `_meta` envelope, `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name`
  headers) and 2025-era clients (`initialize`, `tools/list`, `tools/call`). `GET` and `DELETE` are 405;
  notifications get 202. Bodies over 256 KiB are 413. An `Origin` header, when present, must be the site,
  `https://claude.ai`, `https://claude.com` or one listed in `CODE_GODS_MCP_ALLOWED_ORIGINS` (else 403).
- **Authentication.** `Authorization: Bearer <access token>` (OAuth, below), or a device credential as
  `Authorization: Bearer cgc_…` or `x-api-key: cgc_…`. Without one: 401 with
  `WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`;
  a revoked, expired or unknown one adds `error="invalid_token"`.
- **Permissions.** `tools/list` lists only the tools the grant allows; every call is checked again in
  Convex. An owner grant whose human no longer owns the room is not a principal at all.
- **Results.** `structuredContent` (also as JSON text) is `{untrusted: true, notice, data, nextCursor?,
  truncated?}`: `data` is game data written by players. Paged tools return `nextCursor` (pass it back as
  their cursor argument; null at the end); results are bounded to about 80 KB. A refusal is a tool result
  with `isError: true` and text `{"error": {code, message}}` (`FORBIDDEN`, `CONFLICT`, `BAD_REQUEST`, …).

| Tool | Permission | Arguments → `data` |
|---|---|---|
| `whoami` | read | → `{subject, name, roomId, roomCode, permission, kind, label, credentialId, expiresAt}` |
| `get_rules` | read | → `{rules, settings, objectInstance, activeGame}` |
| `get_observation` | read | `objectsLimit≤200, objectsCursor` → the v3 observation, objects paged, ≤20 agents, sources ≤4 KB |
| `get_events` | read | `gameId?, after?, limit≤50` → `player.events` |
| `get_trajectories` | read | `gameId?, afterSeq?, limit≤200` → `player.trajectories` |
| `list_games` | read | `cursor, limit≤20` → `{games, total}` (`rooms.history`) |
| `get_game_history` | read | `gameId, afterSeq?, limit≤50` → `player.history` |
| `get_my_utility` | read | → `player.myUtility` |
| `evaluate_value` | read | `value` → `{ordinal, rewardBits, netBits, penalty?}` with YOUR utility in the current game |
| `get_chat` | read | `cursor?, limit≤100` → `{messages}`, `nextCursor` (an opaque string: the next older page; null at the end) |
| `get_receipt` | read | `commandId` → `{status: received\|pending\|failed\|not_found, receipt?, error?}` |
| `validate_agent`, `summon_agent` | act | `source, language?, commandId (summon: required), gameId?, waitMs≤120000 (default 90000)` |
| `destroy_agent` | act | `agentId, commandId, gameId?` |
| `set_ready`, `send_chat` | act | `ready` / `text`, `commandId?` |
| `pause_game` | act | `commandId, gameId?` |
| `wake_engine` | act | → `activity.touch` |
| `get_room_state`, `get_ai_catalog` | owner | → `rooms.get`, `aiTemplates.catalog` |
| `update_settings` | owner | `requestId, revision, settings?, preset?, aiBudget?` |
| `start_game`, `resume_game`, `end_game` | owner | `requestId` (start is idempotent per requestId) |
| `add_ai`, `remove_ai` | owner | `requestId, aiAgentId` / `requestId, deityId` |

Command tools build a v3 envelope (the current game's id and language unless given) and answer
`{status: "received", commandId, receipt}` with the engine's `CommandResult`. Resending the identical call
returns the stored receipt; the same `commandId` with different content is `CONFLICT`. Summon and validate
run as a scheduled action: if it is not done within `waitMs`, the answer is `{status: "pending",
commandId}` and `get_receipt` completes it (`failed` means not applied: resend the identical call).

## MCP OAuth 2.1 (authorization server on the deployment)

Public clients, PKCE S256, one room and one permission per connection (`credentials.kind = "oauth"`).

| Route | |
|---|---|
| `GET /.well-known/oauth-protected-resource` (and `…/mcp`) | `{resource: "<site>/mcp", authorization_servers: ["<site>"], scopes_supported: [read, act, owner]}` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata: S256 only, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true` |
| `POST /api/oauth/register` | RFC 7591 DCR → 201 `{client_id: "cgo_…", …}`. Redirect URIs: Claude's callback (`https://claude.ai/api/mcp/auth_callback`, `https://claude.com/…`), loopback `http://127.0.0.1:<any port>/…` / `localhost`, or one in `CODE_GODS_OAUTH_REDIRECT_URIS`. At most 50 registrations per 10 minutes for the whole deployment (429 `temporarily_unavailable` with `Retry-After`); a client that redeems no code within 24 hours is deleted by the hourly sweep |
| client ID metadata documents | an `https://` `client_id` is fetched (no redirects, 5 s, 32 KiB, public hosts only) and cached for an hour |
| `GET /oauth/authorize` | `response_type=code, client_id, redirect_uri, code_challenge, code_challenge_method=S256, state, scope (read\|act\|owner, default act), resource=<site>/mcp` → 302 to the engine UI's `/connect?request=…` |
| `/connect` (engine UI) | the signed-in human reviews the client's self-reported name and the redirect host, picks one of their rooms and a permission ≤ the scope (`agent/connect:pending`, `:approve` with a `completion` secret the page generates, `:deny`) |
| `GET /oauth/authorize/complete?request=…&completion=…` | → 302 to `redirect_uri?code&state&iss` (or `error=access_denied`). The code is released only with the approving browser's completion secret (403 otherwise), so holding the request key is not enough |
| `POST /api/oauth/token` | form: `grant_type=authorization_code, code, code_verifier, client_id, redirect_uri` or `grant_type=refresh_token, refresh_token, client_id` → `{access_token, token_type: "Bearer", expires_in: 3600, refresh_token: "cgr_…", scope}` |
| `POST /api/oauth/revoke` | RFC 7009: a refresh or access token → the connection is revoked; always 200 |

The access token is a 60-minute player JWT naming the credential (`cred`), so revocation applies on the next
call. Refresh tokens rotate; presenting a used one revokes the connection, as does replaying a code. A
connection expires after 30 days without a refresh. Connections appear in `auth/credentials:list` with
`kind: "oauth"` and the client's name as `label`.

## Convex functions

A `room` or `code` argument accepts a Convex id, a GUID or a short code.

### Auth (`auth/*`)
- `auth/user:me` query → `null` or `{subject, name, scope, isAdmin, roomId?, permission?, credentialId?, label?}`
- `auth/device:pending({userCode})` query (browser) → `null` or `{roomId, roomCode, permission, label, expiresAt, userCode, status, isRoomOwner, ownerConsentRequired, canApprove}`
- `auth/device:approve({userCode, ownerConsent?})` and `auth/device:deny({userCode})` mutations (browser)
- `auth/credentials:list()` query → the caller's active credentials `[{credentialId, roomId, roomCode, permission, kind: device|oauth|assistant, clientId?, label, createdAt, expiresAt, lastUsedAt}]`
- `auth/credentials:revoke({credentialId})` mutation; takes effect on the next call

### Rooms (`rooms`)
- `create()` mutation (browser) → `{roomId, shortCode, guid}`
- `list()` query → `[{id, guid, shortCode, ownerId, ownerName, createdAt, memberCount, phase, activeGameShortCode}]`
- `get({room})` query → `{id, guid, shortCode, ownerId, ownerName, createdAt, revision, settings, members[{id, name, kind, ready, status?, aiAgentId?, aiAgentRevision?, provider?, model?}], chat[≤100], aiBudget, aiUsed, aiReservedUsd, aiInputTokens, aiOutputTokens, objectInstance, utilityCatalog|null, activeGame|null, serverTime}`
- `join({room})`, `leave({roomId})`, `setReady({roomId, ready})` mutations
- `chatHistory({roomId, before?})` query
- `history({room})` query → ended games, newest first: `{id, guid, shortCode, roomId, startedAt, endedAt, endReason, settings, roster, leaderboard, winners, worldSeconds, objectCount, scoring, seasonCommitment}`
- Owner-only mutations: `approveAiBudget({roomId, aiBudget})`, `addAi({roomId, templateId})` → `{godId}`, `removeAi({roomId, godId})`, `endActiveGame({roomId})`, `resume({roomId})`

### Owner actions (`owner`)
Browser owner, or an `owner` credential held by the current owner.
- `settings({roomId, revision, settings?, preset?, aiBudget?})` → `{revision}`: merges partial settings and retunes them to the instantiation
- `start({roomId, requestId?})` → `{gameId, shortCode, guid}`, idempotent per `requestId`
- `command({roomId, action: settings|start|resume|endGame|addAi|removeAi, requestId?, revision?, settings?, preset?, aiBudget?, aiAgentId?, deityId?})`: the room assistant's `room-command`

### Player (`player`, `commands`, `receipts`)
Each of these returns the caller's own projection only.
- `player.observation({roomId, at?})` query → a v3 `Observation` (`lib/player-client` `observationSchema`). `at` is only a cache key; pass e.g. `Math.floor(Date.now()/1000)` when polling for fresh energy during planning or a pause.
- `player.events({roomId, gameId?, after?, limit≤50})` query → `{gameId, events[{seq, type, …}], nextCursor, latestCursor, gap}`. Event types are `object.spawned`, `object.transformed` (calls and cost only when `mine`), `agent.failed` (own agents only) and `phase`. Object events carry own bits plus `peerNetBits`, `peerCare` and `payoff`.
- `player.history({roomId, gameId, afterSeq?, limit?})` query: the same projection for any game of the room, ended games included
- `player.trajectories({roomId, gameId?, afterSeq?, limit≤200})` query → `{objects[{objectId, points[{seq, worldSeconds, value, ownNetBits, peerNetBits, payoff}]}], nextCursor, latestCursor}`
- `player.myUtility({roomId})` query → `{gameId, godId, utility{familyId, params, penalty?}, instantiationKey, objectType, typeArgs, priorId, penaltyWeight, language, settings}`, or null when the caller isn't seated (own descriptor only)
- `commands.submit({roomId, envelope})` action: a v3 envelope (`envelopeSchema`) → `CommandResult`. Replaying the identical envelope returns its receipt; a reused `commandId` with a different payload is a CONFLICT.
- `receipts.get({roomId, commandId})` query → `CommandResult | null`

### Stored panels (`panels`)
A human's panels, across rooms (`docs/panels.md` "Stored panels"). Reads: any caller of that human. Writes: browser sessions and `act`/`owner` credentials. Another human's slug is NOT_FOUND. Each function has an internal twin `<fn>As({principal: {credentialId}, …})` for the agent registry.
- `panels.list()` query → `[{id, slug, title, placement, size, currentVersion, enabled, updatedAt, author{kind, label}, lastForeignVersion}]`
- `panels.code({slug, version?})` query → `{slug, version, source, compiled, diagnostics, compilerVersion, sourceHash, author, createdAt}` (the last 20 versions are kept)
- `panels.save({slug, source, title?, placement?, size?})` action → `{ok: true, slug, version, diagnostics: []}` or `{ok: false, slug, diagnostics[{line, column, code, message}]}` (nothing stored). Limits: source ≤ 64 KB, compiled ≤ 128 KB, 32 panels, 30 saves a minute.
- `panels.rollback({slug, version})` → `{slug, version, from}` (a new version with the old code); `panels.setEnabled({slug, enabled})`; `panels.remove({slug})`; `panels.place({slug, placement?, size?, title?})`
- `panels.layout()` query → the dock layout or null; `panels.setLayout({layout})` (≤ 16 KB)

### Other modules
- `games.view({code})` query: the public game view (salience, leaderboard, roster, settings, objectInstance, game chat, winners, utilityCatalog, stats, roomActiveGame). `games.resolve({code})` → `{…, status: current|historical|unavailable}`.
- `activity.touch()` mutation: human activity, which resumes idle-parked games (the assistant's `wake`). `activity.status()` query.
- `aiTemplates.catalog()` query: the public AI library, without prompts. Admin only: `adminList()`, `create`, `update({id, revision, …})`, `remove({id, revision})`.
- `manifest.get()` action: object types with their offered instantiations, presets, options, runtimes and AI funding status.

### Internal twins (principals)

Each player-facing projection and command has an internal twin `<name>As` taking
`principal: {credentialId}` (`player.observationAs`, `eventsAs`, `historyAs`, `trajectoriesAs`, `myUtilityAs`,
`receipts.getAs`, `rooms.getAs`, `chatHistoryAs`, `historyAs`, `addAiAs`, `removeAiAs`, `endActiveGameAs`,
`resumeAs`, `activity.touchAs`, `aiTemplates.catalogAs`, `commands.submitAs`, `owner.commandAs`). They
resolve the viewer with `auth/access.ts viewerForCredential` (not revoked, not expired, owner grants only
for the current owner) and run the same code as the public function.

## Room-assistant mapping

The CLI's `assistant` commands are aliases of the agent tools, called over `POST /mcp`.

| Assistant command | Tool |
|---|---|
| `observation` | `get_observation` |
| `events --after --limit` | `get_events` |
| `command` (envelope on stdin) | `validate_agent`, `summon_agent`, `destroy_agent`, `set_ready`, `send_chat` or `pause_game` |
| `receipt ID` | `get_receipt` |
| `wake` | `wake_engine` |
| `room-state` | `get_room_state` |
| `ai-catalog` | `get_ai_catalog` |
| `room-command` | `update_settings`, `start_game`, `resume_game`, `end_game`, `add_ai` or `remove_ai` |
| `disconnect` | `POST /api/device/revoke` |
