# Engine API (Convex)

The engine is one Convex deployment. Clients talk to it in two ways:

- **Convex functions** at the client URL `https://<dep>.convex.cloud`, using `ConvexReactClient`,
  `ConvexClient` or `ConvexHttpClient` and the generated `api` from
  `artifacts/engine/convex/_generated/api`.
- **HTTP actions** at the site URL `https://<dep>.convex.site`, which also serves the engine UI at `/`
  and the default player client at `/client/`.

Locally (`pnpm --filter @workspace/engine dev`) these are `http://127.0.0.1:3210` and
`http://127.0.0.1:3211`.

A player app configures only the **site URL**. `GET /api/config` returns
`{convexUrl, siteUrl, version}`.

## Identity

Every function authenticates with a 10-minute RS256 JWT. There are two kinds, told apart by issuer:

- **`browser` scope.** A human signed in on the site with **Google**, through Better Auth served by the
  deployment (`/api/auth/*`). The session is an HttpOnly cookie on the site origin (24 h), used only by the
  engine UI at `/` (sign-in, rooms, approvals, credential management). No player client uses it, the hosted
  one included (docs/external-clients.md). Convex JWTs come from
  `GET /api/auth/convex/token` (issuer `<site>`, audience `convex`). The human's god id is the Better
  Auth user id; signing out ends the session at once, even for an unexpired JWT.
- **`player` scope.** Every player client, on any origin (the hosted `/player/` client, a Replit dev URL,
  localhost), and every agent: one human, one room, one permission. A browser client gets it from an OAuth
  connection (below, "MCP OAuth 2.1": the access token is a player JWT, also for Convex functions) or the device
  flow; `@workspace/player-client/browser` does both. A holder of a room credential (`cgc_…`)
  exchanges the credential with `POST /api/device/token {credential}` → `{token, expiresAt, roomId,
  permission, credentialId, credentialExpiresAt}` (issuer `<site>/api/device`, audience `code-gods`), and
  should refresh about a minute before `expiresAt`. A 401 means the credential was revoked or has
  expired: reconnect.
- **Permissions:** `read` < `act` < `owner`. An owner credential also needs the human to be the room's
  current owner. Errors are `ConvexError` with `data = {code, message}`; the codes are
  `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `INVALID`, `NOT_FOUND` and so on.
- **Admins** have a verified Google email listed in `ADMIN_EMAILS`.

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
| `GET /api/config` | `{convexUrl, siteUrl, version}` |
| `GET /api/.well-known/jwks.json` | the public JWKS of player JWTs |
| `/api/auth/*` | Better Auth: `POST /api/auth/sign-in/social {provider: "google", callbackURL}` → `{url}` (Google), `GET /api/auth/callback/google`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `GET /api/auth/convex/token` → `{token}`, `GET /api/auth/convex/jwks`. Same origin only; callback URLs must be on the site |
| `POST /api/device/request` | `{challenge (S256, 43 chars), room (id/guid/short code), permission?: read\|act\|owner (default act), label?}` → `{deviceId, deviceSecret, userCode "XXXX-XXXX", verificationUrl "<site>/device?code=…", roomId, roomCode, permission, label, expiresIn: 300, interval: 2}` |
| `POST /api/device/poll` | `{deviceId, deviceSecret, verifier}` → 200 `{status:"approved", credential, credentialId, roomId, permission, expiresAt}` (once only), 202 pending, 429 slow_down, 403 denied/forbidden, 410 expired, 400 invalid |
| `POST /api/device/token` | `{credential}` or `Authorization: Bearer cgc_…` → a player JWT (see above) |
| `POST /api/device/revoke` | `{credential}` → `{status:"revoked"}` |

**CORS.** The routes authorized by what a request carries (a secret, a credential or a bearer token) answer any
origin with `Access-Control-Allow-Origin: *` and an `OPTIONS` preflight, never `Access-Control-Allow-Credentials`:
`/api/config`, `/api/.well-known/jwks.json`, `/api/device/*`, `/api/oauth/*` and `/.well-known/oauth-*`. The cookie
routes (`/api/auth/*`) are same-origin only. Convex functions take a bearer JWT from any origin.

Local deployments only (`pnpm --filter @workspace/engine dev`): `POST /api/auth/sign-in/oauth2
{providerId: "fake", callbackURL}` signs in through the stand-in OIDC server (`scripts/fake-oidc.mjs`); it
exists only while `TEST_FIXTURES` or `DEV` and `FAKE_OIDC_URL` are set.

## MCP (`POST /mcp`) and the agent tools

Every assistant surface (Claude, Claude Code, Replit Agent, the CLI and the in-client assistant) uses
one tool registry: definitions in `lib/player-client/src/tools.ts` (zod; JSON Schema committed as
`tools.schema.json`), executors in `artifacts/engine/convex/agent/registry.ts`. A tool names the public
functions it reaches and takes its description from their catalogue entries (`lib/player-client/src/catalog.ts`,
the "Public function catalogue" below), so humans and models read one text. A tool runs inside Convex
as the human behind the credential, in the credential's one room, through the same projections and
commands as the human's own client. How to connect Claude: `docs/connect-claude.md`.

- **Transport.** `POST /mcp`, stateless, JSON responses only. It answers the 2026-07-28 protocol
  (`server/discover`, per-request `_meta` envelope, `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name`
  headers) and 2025-era clients (`initialize`, `tools/list`, `tools/call`). `GET` and `DELETE` are 405;
  notifications get 202. Bodies over 256 KiB are 413. An `Origin` header, when present, must be the site,
  `https://claude.ai`, `https://claude.com` or one listed in `MCP_ALLOWED_ORIGINS` (else 403).
- **Authentication.** `Authorization: Bearer <access token>` (OAuth, below), or a device credential as
  `Authorization: Bearer cgc_…` or `x-api-key: cgc_…`. Without one: 401 with
  `WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`;
  a revoked, expired or unknown one adds `error="invalid_token"`.
- **Permissions.** `tools/list` lists only the tools the grant allows; every call is checked again in
  Convex. An owner grant whose human no longer owns the room is not a principal at all.
- **Listing.** Each tool carries its full description and input schema, plus a one-line form in
  `_meta["io.codegods/short"]` for clients that build a lightweight index. The guidance for a kind of task is a
  skill: the server instructions index them (`game-rules`, `writing-agents`, `screen`, `game-setups`) and
  `load_skill {name}` returns one with the room's live data (docs/assistant/token-efficiency.md).
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
| `load_skill` | read | `{name}` (`game-rules`, `writing-agents`, `screen`, `game-setups`) → `{name, body}`: the skill's guidance with the live parts it reads as the caller (the room's rules; the allowed languages and the default one's helpers, and the caller's utility source; the panel catalogue) |
| `validate_agent`, `summon_agent` | act | `source, language? (one the game allows; default its first), commandId (summon: required), gameId?, waitMs≤120000 (default 90000)` |
| `destroy_agent` | act | `agentId, commandId, gameId?` |
| `set_ready`, `send_chat` | act | `ready` / `text`, `commandId?` |
| `pause_game` | act | `commandId, gameId?` |
| `wake_engine` | act | → `activity.touch` |
| `get_room_state`, `get_ai_catalog` | owner | → `rooms.get`, `aiTemplates.catalog` |
| `update_settings` | owner | `requestId, revision, setupId?, settings?, aiBudget?`: a setup from `list_setups` or the settings fields to change, not both |
| `start_game`, `resume_game`, `end_game` | owner | `requestId` (start is idempotent per requestId) |
| `add_ai`, `remove_ai` | owner | `requestId, aiAgentId` / `requestId, deityId` |
| `list_setups` | read | → `setups.list` (the defaults, then the human's own) |
| `save_setup`, `delete_setup` | act | `name, settings, setupId?, summary?` → `setups.save` (changes no room, so the in-client assistant needs no card); `setupId` → `setups.remove` (always confirmed by the player) |
| `list_panels`, `get_panel` | read | → `panels.list`; `slug, version?` → `panels.code` |
| `save_panel`, `rollback_panel`, `delete_panel` | act | `slug, source, title?, placement?, size?` → `panels.save`; `slug, version` → `panels.rollback`; `slug` → `panels.remove` |
| `get_layout` | read | → `layout.current` plus the built-in panel catalogue (`panels[{id, title, blurb, phases, paramsSchema, defaults}]`) and the caller's enabled stored panels (`storedPanels[{slug, title, placement, size}]`) |
| `open_panel` | act | exactly one of `panelId` (a built-in panel, with `params?`) and `slug` (a stored panel), `place?` → `{paneId, layout, summary, reused}` (both or neither: BAD_REQUEST). Built-in, without `place` no pane is added: an open pane of that panel is reused (`reused: true`), else a built-in panel the player did not choose (`setBy` default or assistant) is switched to it; a new pane opens only with `place` or when every built-in panel is the player's; at most 4 (CONFLICT). Stored, without `place` an open pane of it is activated, else it opens in a new pane |
| `set_panel_params`, `move_pane`, `close_pane` | act | `paneId, params` / `paneId, place` / `paneId` → `{paneId, layout, summary, reused}`; the assistant pane and the last built-in panel cannot be closed (CONFLICT) |

Command tools build a v3 envelope (the current game's id and its first allowed language unless given) and answer
`{status: "received", commandId, receipt}` with the engine's `CommandResult`. Resending the identical call
returns the stored receipt; the same `commandId` with different content is `CONFLICT`. Summon and validate
run as a scheduled action: if it is not done within `waitMs`, the answer is `{status: "pending",
commandId}` and `get_receipt` completes it (`failed` means not applied: resend the identical call).

## MCP OAuth 2.1 (authorization server on the deployment)

Public clients, PKCE S256, one room and one permission per connection (`credentials.kind = "oauth"`). The same
server connects MCP clients and browser player clients on any origin (docs/external-clients.md): the access token
is a player JWT for both `/mcp` and Convex functions.

| Route | |
|---|---|
| `GET /.well-known/oauth-protected-resource` (and `…/mcp`) | `{resource: "<site>/mcp", authorization_servers: ["<site>"], scopes_supported: [read, act, owner]}` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata: S256 only, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true` |
| `POST /api/oauth/register` | RFC 7591 DCR → 201 `{client_id: "cgo_…", …}`. Redirect URIs: any `https://` URI (exact; no fragment or userinfo), loopback `http://127.0.0.1:<any port>/…` / `localhost`, or one in `OAUTH_REDIRECT_URIS` (another scheme). Clients cache their `client_id`. At most 50 registrations per 10 minutes for the whole deployment (429 `temporarily_unavailable` with `Retry-After`); a client that redeems no code within 24 hours is deleted by the hourly sweep |
| client ID metadata documents | an `https://` `client_id` is fetched (no redirects, 5 s, 32 KiB, public hosts only) and cached for an hour |
| `GET /oauth/authorize` | `response_type=code, client_id, redirect_uri, code_challenge, code_challenge_method=S256, state, scope (read\|act\|owner, default act), resource?` (`<site>`, `<site>/mcp` or none), `room?` (a room id, GUID or short code: preselected on `/connect`) → 302 to the engine UI's `/connect?request=…` |
| `/connect` (engine UI) | the signed-in human reviews the client's self-reported name and the redirect host, picks one of their rooms and a permission ≤ the scope (`agent/connect:pending`, `:approve` with a `completion` secret the page generates, `:deny`). The hinted room is preselected, and offered to join (`rooms.join`) when the human is not in it. A non-owner's `owner` request starts at `act`. **First party:** a redirect to the site's own origin (the hosted client), for a member, at most `act`, is approved by the page without a click (`autoApprove`); an owner grant always needs the consent checkbox |
| `GET /oauth/authorize/complete?request=…&completion=…` | → 302 to `redirect_uri?code&state&iss` (or `error=access_denied`). The code is released only with the approving browser's completion secret (403 otherwise), so holding the request key is not enough |
| `POST /api/oauth/token` | form: `grant_type=authorization_code, code, code_verifier, client_id, redirect_uri` or `grant_type=refresh_token, refresh_token, client_id` → `{access_token, token_type: "Bearer", expires_in: 3600, refresh_token: "cgr_…", scope, room_id, room_code, credential_id}` |
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
- `agent/connect:pending({request})` query (browser) → `null` or `{clientName, clientId, redirectUri, redirectHost, permission, resource, status, expiresAt, rooms[{roomId, shortCode, isOwner, createdAt}], roomHint: {roomId, shortCode, isOwner, member}|null, roomHintUnknown, firstParty, autoApprove: permission|null}`; `agent/connect:approve({request, roomId, permission, completion, ownerConsent?})`, `agent/connect:deny({request})` mutations (browser)
- `auth/device:approve({userCode, ownerConsent?})` and `auth/device:deny({userCode})` mutations (browser)
- `auth/credentials:list()` query → the caller's active credentials `[{credentialId, roomId, roomCode, permission, kind: device|oauth|assistant, clientId?, label, createdAt, expiresAt, lastUsedAt}]`
- `auth/credentials:revoke({credentialId})` mutation; takes effect on the next call

### Rooms (`rooms`)
- `create({assistantBudget?, assistantModel?})` mutation (browser) → `{roomId, shortCode, guid}`. The room runs the system's First steps setup (`setup {id, name, deleted: false}`); the optional assistant allowance (tokens per human per game, 0 = off, ≤ 2,000,000) and model turn the in-client assistant on at creation.
- `list()` query → `[{id, guid, shortCode, ownerId, ownerName, createdAt, memberCount, phase, activeGameShortCode, setupName|null}]`
- `get({room})` query → `{id, guid, shortCode, ownerId, ownerName, createdAt, revision, settings, setup|null, members[{id, name, kind, ready, status?, aiAgentId?, aiAgentRevision?, provider?, model?}], chat[≤100], aiBudget, aiUsed, aiReservedUsd, aiInputTokens, aiOutputTokens, assistantBudget, assistantModel, objectInstance, utilityCatalog|null, activeGame|null, preparing|null, serverTime}`.
  `preparing` is `{instance, ready, total, startedAt, estimateSeconds, dealtAs, dealerNote?, error?}` while the next game computes rule tables nobody had for its shape (`owner.start` below): progress only, never the deal. `error` says why it could not finish; the owner starts again or ends it with `endActiveGame`.
  `setup` is `{id, name, deleted}`: the game setup the room runs (a room always runs one; there is no "custom" state). `settings` is that setup's settings as they were when it was applied; `name` is its current name, or its name then once it is `deleted` (null only on rooms stored before the setups-v2 migration).
- `join({room})`, `leave({roomId})`, `setReady({roomId, ready})` mutations
- `chatHistory({roomId, before?})` query
- `history({room})` query → ended games, newest first: `{id, guid, shortCode, roomId, startedAt, endedAt, endReason, settings, setup {id, name}|null, roster, leaderboard, winners, worldSeconds, objectCount, scoring, seasonCommitment}`
- Owner-only mutations: `approveAiBudget({roomId, aiBudget, assistantBudget?, assistantModel?})` → `{aiBudget, assistantBudget, assistantModel}` (the seats' budget is frozen during games; the assistant allowance per human per game, 0 = off, and its catalog model may change any time), `addAi({roomId, templateId})` → `{godId, name}` (the seat's own name, unique in the room and fixed for its life: an alliterative title such as "Vector Vizier", convex/lib/aiNames.ts), `removeAi({roomId, godId})`, `endActiveGame({roomId})` (with no game running, it ends a preparation: `{cancelled: "preparing"}`), `resume({roomId})`

### Owner actions (`owner`)
Browser owner, or an `owner` credential held by the current owner.
- `settings({roomId, revision, setupId?, settings?, aiBudget?})` → `{revision, setup?: {id, name, created, note}}`. `setupId` (any setup in `setups.list`: they are shared) applies that setup's complete settings and makes it the room's setup. `settings` holds the fields to change (a whole settings object is fine: fields equal to the room's are no change, so stale type arguments follow an edited type), applied through the settings model (`lib/game-core/src/settings-model.ts`): `languages` is the non-empty list of languages agents may be written in (supported ones, each once; the first is the default), and each agent's grammar and summon-price function follow its own language (game-core `LANGUAGE_SPECS`), so settings carry no grammar or price id; an older client's single `language` means `languages: [language]`; an `objectType` change takes that type's default instantiation and drops excluded families it lacks; `typeArgs` may be any valid, non-retired instantiation (3×3 Grids are retired; whether tables are shipped does not matter: a first game prepares them) and drops excluded families it lacks; a non-uniform prior needs the shape's shipped tables; goal dealing and spawn function must be choices of the type; `excludedFamilies` must be reward families and `excludedDefenceFamilies` defence families of the object type, and each list keeps only those the instantiation can deal; `defenceGoals: true` needs at least one defence family left; every other field is free within `validateSettings` and the server's limits (objects ≤ 1000, spawns ≤ 10/s, planning and pauses ≤ 1 h). Nothing is retuned to suit another field. The result is written to the room's setup when the owner owns it (`created: false`), otherwise (a system setup, another human's, a deleted one) to a new setup of the owner's named "<name>'s copy", which the room then runs (`created: true`); `note` says which in one sentence, and the same settings again change no setup. Not both (BAD_REQUEST).
- `start({roomId, requestId?})` → `{gameId, shortCode, guid}`, or `{status: "preparing", instance, ready, total, estimateSeconds, dealtAs, note?, message}`; idempotent per `requestId`. The deal comes from every available family; each draw's rule table is analytic, shipped, or computed on an earlier game. When some are missing (the first game on a shape on this server), the deal is fixed, the room's `preparing` shows the progress, one Node action per missing table computes it (docs/analytic-calibration/architecture.md §3), and the game begins by itself when the last lands: planning time starts then. A failing table is retried twice with backoff, then `preparing.error` names it. Settings are frozen while it prepares. Measured cloud first use (6 gods, defence goals on): Grid 4×4 ≈ 35 s, 5×5 ≈ 70 s, 6×6 ≈ 130 s, 7×7 ≈ 260 s; Int ranges up to ≈ 250 s; strings ≈ 15 s; every later game on the shape starts at once.
- `command({roomId, action: settings|start|resume|endGame|addAi|removeAi, requestId?, revision?, setupId?, settings?, aiBudget?, aiAgentId?, deityId?})`: the room assistant's `room-command`

### Game setups (`setups`)
One shared collection of complete next-game settings, each with a name (≤ 40 characters, unique among its owner's) and a one-line summary, and each owned: by the human who created it, or by the system (`ownerId: null`: game-core `SEED_SETUPS`, First steps, Classic, Low income, Big board, Master). Everyone sees every setup. Only the owner changes or deletes one (FORBIDDEN otherwise, naming the owner); system setups nobody changes, admins included: `setups:ensureSeeded` (run at every deploy) keeps them equal to the code, and players duplicate one instead. Reads: any caller. Writes: browser sessions and `act`/`owner` credentials. Internal twins `listAs`, `getAs`, `saveAs`, `duplicateAs`, `removeAs` serve the registry.
- `setups.list()` query → every setup, without settings: the system's in shipped order, then everyone's by name: `[{id, name, summary, system, seedId?, ownerName ("System" for the system's), mine, editable (= mine), updatedAt}]`. At most 500: the system's and the caller's always, then others', newest first.
- `setups.get({setupId})` query → one setup with `settings` (any setup), else NOT_FOUND.
- `setups.save({name, settings, setupId?, summary?})` action → the setup. `settings` must be complete (every GameSettings field, no other; the old single-language shape `language` + `grammarId` + `complexityFunctionId` is read as `languages: [language]`), valid, a playable shape and within the server's limits. Without `setupId` a new setup of the caller's (names unique among their own: CONFLICT; at most 50); with it, over one the caller owns. The summary defaults to a line generated from the settings. Changes no room.
- `setups.duplicate({setupId, name?})` mutation → a new setup of the caller's with the source's settings and summary, named "<name>'s copy" (then " 2", " 3"… while the caller has that name; shortened to fit 40 characters) or `name`. Changes no room.
- `setups.remove({setupId})` mutation → `{removed, name}`: one the caller owns. Rooms that run it keep their settings and show it as deleted.
- Migration: `migrations/node:setupsV2` (deploy, after `ensureSeeded`; idempotent) turns stored `defenceRate` into `defenceGoals` + `excludedDefenceFamilies`, a single `language` (with its grammar and price ids) into `languages: [language]`, and every room's `settingsOrigin` into `setupId` (a custom or modified room gets a new setup of its owner's, "Room <code>'s setup").

### Player (`player`, `commands`, `receipts`)
Each of these returns the caller's own projection only.
- `player.observation({roomId, at?})` query → a v3 `Observation` (its `leaderboard` is the scoreboard published every `scoreIntervalSeconds` of world time, as of `leaderboardWorldSeconds`; `self.score` is the caller's own live total; while live, every others' sum and what is built on it carries the game's disclosure noise, `peerNoiseBits`, docs/public-log-design.md §5.2) (`lib/player-client` `observationSchema`): `languages` lists the languages the game allows and `language` is the default (the first); each own agent carries its own `language`. `at` is only a cache key; pass e.g. `Math.floor(Date.now()/1000)` when polling for fresh energy during planning or a pause. After the end it is the ended game's frozen final state (phase `ended`; objects, own agents, transformations, leaderboard, own card; god energy stops at `endedAt`) until the room's next game starts. Ended games are kept whole and are not deleted (no retention limit; a game is its objects ≤ 2,100, agents ≤ 2,000, deities and event batches).
- `player.events({roomId, gameId?, after?, limit≤50})` query → `{gameId, events[{seq, type, …}], nextCursor, latestCursor, gap}`. Event types are `object.spawned`, `object.transformed` (every god's, public; calls and cost only when `mine`; while the game is live another god's carries no `agentId`), `agent.summoned` / `agent.destroyed` (while live, own agents only), `agent.failed` (own agents only) and `phase`. Object events carry own bits plus `peerNetBits`, `peerCare` and `payoff` (docs/public-log-design.md §1).
- `player.series({roomId, gameId?, cursor?, limit≤4000})` query → `{gameId, phase, live, self {godId, index}, others, rows, columns {world, seq, objectId, kind, version, before, value, ownBefore, othersBefore, own, others, payoff, mine}, cursor, done, pageDone}`: every spawn and transformation of the game in world-time order, one row each, with the caller's own bits and the other gods' summed bits before and after (exact). Seated players only. docs/public-log-design.md §2.
- `player.board({roomId, gameId?, world?})` query → `{gameId, world, objects[{objectId, value, version, changedAt, own, others, payoff}]}`: every object as it was at world time `world` (default now). Seated players only.
- `player.history({roomId, gameId, afterSeq?, limit?})` query: the same projection for any game of the room, ended games included
  (a past game, one the room no longer runs, only for the gods who played in it and the room owner; the same rule holds
  for `events` and `trajectories` with a `gameId`)
- `player.game({roomId, gameId})` query: one game of the room by id or code, its public world (final once ended),
  standings, winners and chat, with `current` (the room's active or current game) and `seated`; a past game only for
  its players and the room owner (the player client's read-only `/rooms/:room/games/:game`)
- `player.trajectories({roomId, gameId?, afterSeq?, limit≤200})` query → `{objects[{objectId, points[{seq, worldSeconds, value, ownNetBits, peerNetBits, payoff}]}], nextCursor, latestCursor}`
- `player.myUtility({roomId})` query → `{gameId, godId, utility{familyId, params, penalty?}, instantiationKey, objectType, typeArgs, priorId, penaltyWeight, language (the default), languages, settings}`, or null when the caller isn't seated (own descriptor only)
- `commands.submit({roomId, envelope})` action: a v3 envelope (`envelopeSchema`) → `CommandResult`. Validate and summon carry the agent's `language`: one the game does not allow is refused (not accepted, "This game does not allow …"). Replaying the identical envelope returns its receipt; a reused `commandId` with a different payload is a CONFLICT. Validate and summon (the agent's sandboxed examination) are limited to 30 a minute per human per room, whatever the credential: past it, `RATE_LIMITED` with no receipt (send the identical envelope again later).
- `receipts.get({roomId, commandId})` query → `CommandResult | null`

### Stored panels (`panels`)
A human's panels, across rooms (`docs/panels.md` "Stored panels"). Reads: any caller of that human. Writes: browser sessions and `act`/`owner` credentials. Another human's slug is NOT_FOUND. Each function has an internal twin `<fn>As({principal: {credentialId}, …})` for the agent registry. Where a panel shows is the dock layout's business (`layout`, below): `placement` and `size` are the add-pane hints a panel's manifest gives.
- `panels.list()` query → `[{id, slug, title, placement, size, currentVersion, enabled, updatedAt, author{kind, label}, lastForeignVersion}]`
- `panels.code({slug, version?})` query → `{slug, version, source, compiled, diagnostics, compilerVersion, sourceHash, author, createdAt}` (the last 20 versions are kept)
- `panels.save({slug, source, title?, placement?, size?})` action → `{ok: true, slug, version, diagnostics: []}` or `{ok: false, slug, diagnostics[{line, column, code, message}]}` (nothing stored). Limits: source ≤ 64 KB, compiled ≤ 128 KB, 32 panels, 30 saves a minute.
- `panels.rollback({slug, version})` → `{slug, version, from}` (a new version with the old code); `panels.setEnabled({slug, enabled})`; `panels.remove({slug})`

### Dock layout (`layout`)
The player client's panes (`docs/ui-redesign.md` §2.3–2.4): one row per human per room, a library-independent tree of split groups and tab groups (`lib/player-client/src/layout.ts`), validated by `parseLayout` (never throws: unknown built-in panels become the phase's default panel, invalid panel parameters their defaults, unknown stored panels are dropped, a missing assistant or built-in panel is added). Internal twins `currentAs`/`setAs` and the pane operations `openPanelAs`, `setPanelParamsAs`, `movePaneAs`, `closePaneAs` (one read-modify-write mutation each) serve the layout tools.
- `layout.current({roomId})` query (member, read) → `{layout, warnings, source: "room" | "carried" | "default", phase, updatedAt|null, setBy{kind, label}|null}`. `carried`: the human's most recent layout from another room with every built-in panel's parameters reset and `setBy: "default"` (the arrangement follows you; parameters name one game's objects).
- `layout.set({roomId, layout, ifUpdatedAt?})` mutation (member, read) → `{layout, warnings, updatedAt}`: the whole layout (drags, the panel menu, presets), ≤ 32 KB, at most 12 writes a minute per human per room (RATE_LIMITED), CONFLICT when `ifUpdatedAt` is stale.

## Public function catalogue

Every public function above has an entry in `lib/player-client/src/catalog.ts` (`CATALOG: Record<PublicFunctionPath, CatalogEntry>`, keys derived from the generated `api` type, so a new function fails the typecheck until documented). The entry gives humans a title and tooltip (buttons, menus, the command palette), models a description (the registry's tool text), the tools that reach it, and a `why` when a player affordance has none. This table is generated from it.

<!-- catalog:begin (generated by `pnpm --filter @workspace/player-client gen:catalog`; do not edit by hand) -->
| Function | Kind | Audience | Title | What it does | Assistant tools |
|---|---|---|---|---|---|
| `activity.touch` | mutation | player | Wake the game | Counts as human activity and resumes a game parked after 30 idle minutes. | `wake_engine` |
| `activity.status` | query | infrastructure | Show activity status | When a human was last active and whether games are parked. | — (A live subscription a page renders; there is nothing to run.) |
| `agent.connect.pending` | query | infrastructure | Review a connection request | Shows which app wants to connect, with which rights, before you approve it. | — (Reached only from an OAuth redirect; approvals keep their consent page.) |
| `agent.connect.approve` | mutation | infrastructure | Approve the connection | Lets this app act as you in one room with the rights shown. | — (Consent is given on the /connect page only.) |
| `agent.connect.deny` | mutation | infrastructure | Deny the connection | Sends the app away without any access. | — (Consent is given on the /connect page only.) |
| `aiTemplates.catalog` | query | owner | Browse AI players | The AI players an owner can seat, with their provider and model. | `get_ai_catalog` |
| `aiTemplates.adminList` | query | admin | Open the AI library | Every AI player template with its prompt, for admins. | — (Admin page data; the palette navigates to the library instead.) |
| `aiTemplates.create` | mutation | admin | Add an AI player template | Creates a named AI player with a provider, model and prompt (admins only). | — |
| `aiTemplates.update` | mutation | admin | Edit an AI player template | Changes a template's name, model or prompt; send its current revision. | — |
| `aiTemplates.remove` | mutation | admin | Delete an AI player template | Removes a template from the library; seated copies keep playing. | — |
| `assistant.send` | mutation | player | Ask the assistant | Sends your message; the assistant answers and acts as you with the rights you chose. | — (The assistant does not drive itself; the human sends, stops and configures it from the assistant pane.) |
| `assistant.cancel` | mutation | player | Stop the assistant | Stops the current answer; a card waiting for you is cancelled at once. | — (The assistant does not drive itself; the human sends, stops and configures it from the assistant pane.) |
| `assistant.confirm` | mutation | player | Decide a confirmation | Approves or denies an action the assistant asked permission for. | — (Decided on the confirmation card in the assistant pane, never elsewhere.) |
| `assistant.setPrefs` | mutation | player | Set assistant preferences | Lets summons the assistant validated run without a card up to this many bits (0 asks every time). | — (The assistant does not drive itself; the human sends, stops and configures it from the assistant pane.) |
| `assistant.status` | query | player | Show assistant status | Whether the assistant is on, its allowance, model, credential and active turn. | — (A live subscription a page renders; there is nothing to run.) |
| `assistant.threads` | query | player | Switch conversation | Your assistant conversations in this room's current game, newest first. | — (The assistant does not drive itself; the human sends, stops and configures it from the assistant pane.) |
| `assistant.transcript` | query | player | Show this game's conversation | Your assistant conversation in this game: a new game starts with none. | — (A live subscription a page renders; there is nothing to run.) |
| `assistant.thread` | query | player | Show a conversation | One conversation's messages, tool calls and confirmation cards. | — (A live subscription a page renders; there is nothing to run.) |
| `auth.credentials.list` | query | infrastructure | Show connected apps | Every app, connector and assistant acting as you, with its room, rights and expiry. | — |
| `auth.credentials.revoke` | mutation | infrastructure | Revoke a connected app | Cuts that app's access on its next call; you can reconnect it later. | — |
| `auth.device.pending` | query | infrastructure | Review a device code | Shows what a player app asks for before you approve its code. | — (The /device page's data; approval keeps its consent page.) |
| `auth.device.approve` | mutation | infrastructure | Approve a device code | Gives the player app a credential for the room and rights shown. | — (Consent is given on the /device page only.) |
| `auth.device.deny` | mutation | infrastructure | Deny a device code | Refuses the player app; it gets nothing. | — (Consent is given on the /device page only.) |
| `auth.testing.probe` | query | test | Probe authentication | A test-only check of the signed-in identity on local deployments. | — (Test only.) |
| `auth.user.me` | query | infrastructure | Show who I am | Your name, god id and, for a player app, its room and rights. | `whoami` |
| `code.objects.list` | query | player | Show my stored objects | What your assistant's scripts saved for you: keys, sizes and how much of your store is used. | `list_code_objects` |
| `code.runs.list` | query | player | Show my code runs | The analytics scripts your assistant ran for you in this game, newest first, with its budget. | `list_code_runs` |
| `code.runs.get` | query | player | Show a code run | One analytics run's source, result table and printed output. | `get_code_run` |
| `commands.submit` | action | player | Send a game command | Validate, summon or destroy an agent, mark yourself ready, chat publicly or use your pause. | `validate_agent`, `summon_agent`, `destroy_agent`, `set_ready`, `send_chat`, `pause_game` |
| `games.resolve` | query | player | Open a game by code | Finds a game's page from its code, current or historical. | — (Resolves a code for the game page; the room's games reach the assistant through list_games and get_game_history.) |
| `games.view` | query | player | Watch a game | The public view of a game: salience, standings, roster and winners. | — (The public game page's subscription; the human's private view is get_observation.) |
| `layout.current` | query | player | Show the dock layout | The panes you see in this room, as every open client of yours renders them. | `get_layout`, `load_skill` |
| `layout.set` | mutation | player | Arrange the dock | Moves, resizes, adds or closes panes; every open client of yours follows. | `open_panel`, `set_panel_params`, `move_pane`, `close_pane` |
| `manifest.get` | action | infrastructure | Show server info | Object types, offered instantiations, options, runtimes and whether AI players are funded. | `get_rules` |
| `calibration.node.tables` | action | infrastructure | Load calibration tables | The calibration tables of a utility and its defence goal, for scoring values in the browser. | — (The player client's evaluator loads these itself; agents score values with evaluate_value.) |
| `owner.settings` | action | owner | Choose the next game's setup | Puts the next game on a game setup, or changes the room's setup; running games keep theirs. | `update_settings` |
| `owner.start` | action | owner | Start the game | Deals secret goals and spawns the world for 3 to 8 players; planning begins at once. | `start_game` |
| `owner.command` | action | owner | Run an owner action | Settings, start, resume, end, add or remove an AI player, in one call. | `update_settings`, `start_game`, `resume_game`, `end_game`, `add_ai`, `remove_ai` |
| `panels.list` | query | player | Show my panels | Your stored panels with version, author and whether each is on. | `list_panels` |
| `panels.code` | query | player | View a panel's source | The TSX, compiled code and diagnostics of one panel version. | `get_panel` |
| `panels.save` | action | player | Make a panel | Saves TSX as a panel you can open as a pane; a syntax error saves nothing. | `save_panel` |
| `panels.rollback` | mutation | player | Roll back a panel | Makes an older version current again, as a new version. | `rollback_panel` |
| `panels.setEnabled` | mutation | player | Turn a panel on or off | Hides a panel in every client without deleting it, or shows it again. | — (The assistant opens and closes panes with open_panel and close_pane; hiding a panel for good is the human's choice.) |
| `panels.remove` | mutation | player | Delete a panel | Deletes a panel and all its versions; this cannot be undone. | `delete_panel` |
| `player.observation` | query | player | Inspect the raw observation | Your private view of the game as the engine sends it, once per tick. | `get_observation`, `load_skill` |
| `player.events` | query | player | Open the event log | Spawns, transformations and phase changes of the current game, as they affect you. | `get_events` |
| `player.history` | query | player | Replay a past game's log | The event log of a game of this room; past games open for their players. | `get_game_history` |
| `player.replay` | query | player | Replay a game I played | Everything that happened in an ended game you played in, fully revealed: every player's goal, every agent's code, every move. | `get_replay` |
| `player.game` | query | player | Open a game of this room | One game of this room, live or as it ended; past games open for their players and the owner. | — (The player client's game page (/rooms/:room/games/:game); the assistant reads past games through list_games and get_game_history.) |
| `player.trajectories` | query | player | Open my points over time | Per-object series of your bits, the others' total and your payoff. | `get_trajectories` |
| `player.series` | query | player | Open the utility series | Every change to every object this game, with your bits and the others' total before and after. | `get_utility_series` |
| `player.board` | query | player | Board at a moment | Every object as it was at a world time, with your bits and the others' total. | `get_board_at` |
| `player.myUtility` | query | player | Open my secret goal | Your own utility descriptor and the settings to evaluate it; nobody else's. | `get_my_utility` |
| `receipts.get` | query | player | Check a command's status | Whether a command you sent was received, is pending or failed. | `get_receipt` |
| `rooms.create` | mutation | player | Create a room | Opens a new room on the First steps setup with you as owner, ready to share its invite link. | — (A credential is bound to one existing room; rooms are created in the browser.) |
| `rooms.list` | query | player | Show my rooms | Rooms you can see, with owner, creation date, players and phase. | — (A live subscription a page renders; there is nothing to run.) |
| `rooms.get` | query | player | Show the room | Members, settings, chat, budgets and the active game of a room. | `get_rules`, `get_room_state`, `load_skill` |
| `rooms.join` | mutation | player | Join this room | Takes a seat; joining mid-game makes you a spectator until the next game. | — (Membership precedes any credential: the human joins in the browser before an assistant can act for them there.) |
| `rooms.leave` | mutation | player | Leave this room | Gives up your seat; you can join again later. | — (Leaving would revoke the very credential the assistant acts through.) |
| `rooms.setReady` | mutation | player | Mark me ready | Tells the room you are ready for the next game; it gates nothing. | `set_ready` |
| `rooms.chatHistory` | query | player | Show older chat | Earlier public messages than the ones on screen. | `get_chat` |
| `rooms.history` | query | player | Show past games | Finished games of this room with their standings and winners. | `list_games` |
| `rooms.approveAiBudget` | mutation | owner | Set AI spending | Approves the AI players' token budget and the assistant allowance per player per game. | `update_settings` |
| `rooms.addAi` | mutation | owner | Add an AI player | Seats an AI player from the library between games; it spends the room's AI budget. | `add_ai` |
| `rooms.removeAi` | mutation | owner | Remove an AI player | Unseats an AI player between games. | `remove_ai` |
| `rooms.endActiveGame` | mutation | owner | End the game now | Ends the running game for everyone; its final standings are recorded. | `end_game` |
| `rooms.resume` | mutation | owner | Resume the game | Restarts a game stopped in recovery. | `resume_game` |
| `setups.list` | query | player | Browse game setups | Every game setup: the system's, then everyone's by name, each with its owner. | `list_setups` |
| `setups.get` | query | player | Show a game setup | One setup's complete settings, whoever owns it. | `get_setup` |
| `setups.save` | action | player | Save a game setup | Saves a setup you own under its name, or a new one of yours. | `save_setup` |
| `setups.duplicate` | mutation | player | Duplicate a game setup | Makes your own copy of a setup, named "<name>'s copy", to edit. | `duplicate_setup` |
| `setups.remove` | mutation | player | Delete a game setup | Deletes one of your setups; rooms that run it keep its settings. | `delete_setup` |
<!-- catalog:end -->

### In-client assistant (`assistant`)
The assistant drawer of the player client (`docs/surface-architecture.md` §6). Callers: browser sessions and player
credentials of a room member. Threads, messages and tool calls are visible to their human only (another human gets
NOT_FOUND).
- `assistant.send({roomId, text ≤ 4000, threadId?, permission?: read|act|owner, ownerConsent?})` mutation → `{threadId, turnId}`.
  The first send creates (or reuses) the caller's `kind: "assistant"` credential for the room (default `act`; never
  above the caller's own; `owner` only for the current owner with `ownerConsent: true`); a different `permission`
  replaces it. FORBIDDEN when the owner has not enabled the assistant (allowance 0); CONFLICT while the caller's
  previous turn in the room is still active.
- `assistant.cancel({turnId})` mutation → `{status}`: `cancelling` (the running step stops at its next flush or between
  tool calls) or `cancelled`.
- `assistant.confirm({toolCallId, decision: approve|deny})` mutation → `{status}`: decides a call waiting for
  confirmation (summons unless auto-approved, public chat, pauses, panel deletion, owner tools). A decision on a call
  that no longer waits changes nothing. Unanswered cards are denied after 2 minutes.
- `assistant.setPrefs({roomId, autoApproveSummonBits})` mutation: summons up to this many bits, validated earlier in
  the same turn, run without a card (0 = always ask).
- `assistant.status({roomId})` query → `{enabled, allowance{limit, used, epoch}, model{id, label, provider}|null,
  credential{credentialId, permission, expiresAt}|null, activeTurn{turnId, threadId, status}|null, isOwner, maxPermission,
  autoApproveSummonBits}`. `allowance.used` counts billed tokens: input-price equivalents, so a prompt-cache read counts
  its price relative to input (0.1 at Anthropic, 0.25 at OpenAI), an Anthropic cache write 1.25, uncached input and
  output 1 (`lib/ai-player` `usageCost`). A step reserves its worst case (estimated input at its dearest price plus the
  output ceiling) and settles to what it cost; a cancelled step is billed from what was known (its reported input and
  the streamed output), never its whole reservation.
- `assistant.threads({roomId})` query → `[{_id, title, createdAt, updatedAt, activeTurnId}]` (the caller's, newest first).
- `assistant.thread({threadId})` query → `{thread, turns[{_id, status: running|awaiting_confirmation|cancelling|done|failed|cancelled|budget_exhausted,
  step, maxSteps, deadline, usage{inputTokens, outputTokens, reservedTokens, reservedUsd, billedTokens}, tools, credentialId, error|null, …}],
  messages[{_id, turnId, seq, role, text, status: streaming|done|error|cancelled, reservedTokens, inputTokens, outputTokens,
  cacheReadTokens, cacheWriteTokens, billedTokens, inputEstimate, usageEstimated}],
  toolCalls[{_id, turnId, messageId, callId, index, tool, argsJson, status: pending|awaiting_confirmation|running|ok|error|denied,
  summary, resultJson, commandId, confirmDeadline}]}`. `argsJson` is the exact payload the call runs with; `resultJson` is
  the registry result the model saw (`{untrusted: true, …}` or `{error}`), at most 8 KB; a clipped one starts with a
  `TRUNCATED` field naming what was cut ("data.objects shows 11 of 60 items") and ends with `truncated: true`.

Internal: `assistant/step:run({turnId, gen})` (one Node action per model step), `assistant/store:*` (the turn loop's
mutations and the `sweep` cron), `ai/seats:reserve|settle({pool: "assistant", …})`.

### Other modules
- `games.view({code})` query: the public game view (salience, leaderboard, roster, settings, objectInstance, game chat, winners, utilityCatalog, stats, roomActiveGame). `games.resolve({code})` → `{…, status: current|historical|unavailable}`.
- `activity.touch()` mutation: human activity, which resumes idle-parked games (the assistant's `wake`). `activity.status()` query.
- `aiTemplates.catalog()` query: the public AI library, without prompts. Admin only: `adminList()`, `create`, `update({id, revision, …})`, `remove({id, revision})`.
- `manifest.get()` action: object types with their `playable` instantiations (every combination of the type's parameter choices, minus retired shapes; each with `prepare: {toCompute, seconds}|null`, the first game's preparation on this server, and `synergy`, whether the Aligned Lottery has measured synergy there), `offered` (diagnostics: the shapes whose every table is shipped), options, runtimes and AI funding status.

### Internal twins (principals)

Each player-facing projection and command has an internal twin `<name>As` taking
`principal: {credentialId}` (`player.observationAs`, `eventsAs`, `historyAs`, `trajectoriesAs`, `myUtilityAs`,
`receipts.getAs`, `rooms.getAs`, `chatHistoryAs`, `historyAs`, `addAiAs`, `removeAiAs`, `endActiveGameAs`,
`resumeAs`, `activity.touchAs`, `aiTemplates.catalogAs`, `commands.submitAs`, `owner.commandAs`, `setups.listAs`, `getAs`, `saveAs`, `duplicateAs`, `removeAs`). They
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
