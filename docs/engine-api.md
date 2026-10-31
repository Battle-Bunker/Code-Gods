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

Every function authenticates with a 10-minute RS256 JWT minted by the deployment.

- **`browser` scope.** A human signed in on the site. The React client's `fetchAccessToken` is
  `POST /api/auth/token`: same origin, with the `cg_session` cookie.
- **`player` scope.** A player app or room assistant holding a room credential (`cgc_…`). It
  exchanges the credential with `POST /api/device/token {credential}` → `{token, expiresAt, roomId,
  permission, credentialId, credentialExpiresAt}`, and should refresh about a minute before
  `expiresAt`. A 401 means the credential was revoked or has expired: reconnect.
- **Permissions:** `read` < `act` < `owner`. An owner credential also needs the human to be the room's
  current owner. Errors are `ConvexError` with `data = {code, message}`; the codes are
  `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `INVALID`, `NOT_FOUND` and so on.

```ts
// React, same origin as the site
const convex = new ConvexReactClient(convexUrl);
function useAuth() {
  const [isLoading, setLoading] = useState(true), [user, setUser] = useState(null);
  useEffect(() => { fetch("/api/auth/user").then(r => r.json()).then(b => { setUser(b.user); setLoading(false); }); }, []);
  const fetchAccessToken = useCallback(async () => {
    const r = await fetch("/api/auth/token", { method: "POST", credentials: "same-origin" });
    return r.ok ? (await r.json()).token : null;
  }, []);
  return { isLoading, isAuthenticated: !!user, fetchAccessToken };
}
// <ConvexProviderWithAuth client={convex} useAuth={useAuth}>…
// login:  location.href = `/api/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`
// logout: POST /api/logout (same origin)
```

## HTTP actions (`/api/*`)

| Route | Body → result |
|---|---|
| `GET /api/health` | `{ok, version}` |
| `GET /api/config` | `{convexUrl, siteUrl, version}` (CORS `*`) |
| `GET /api/.well-known/jwks.json` | the public JWKS |
| `GET /api/login?returnTo=/path`, `GET /api/callback` | Replit OIDC login (code + PKCE); sets `cg_session` (24 h) |
| `POST /api/auth/token` | `{token, expiresAt}`, or 401 `{token:null}`; `Origin` must equal the site origin exactly |
| `GET /api/auth/user` | `{user: {id, name, isAdmin} \| null}` |
| `GET\|POST /api/logout` | ends the session; redirects to `/` |
| `POST /api/device/request` | `{challenge (S256, 43 chars), room (id/guid/short code), permission?: read\|act\|owner (default act), label?}` → `{deviceId, deviceSecret, userCode "XXXX-XXXX", verificationUrl "<site>/device?code=…", roomId, roomCode, permission, label, expiresIn: 300, interval: 2}` |
| `POST /api/device/poll` | `{deviceId, deviceSecret, verifier}` → 200 `{status:"approved", credential, credentialId, roomId, permission, expiresAt}` (once only), 202 pending, 429 slow_down, 403 denied/forbidden, 410 expired, 400 invalid |
| `POST /api/device/token` | `{credential}` or `Authorization: Bearer cgc_…` → a player JWT (see above) |
| `POST /api/device/revoke` | `{credential}` → `{status:"revoked"}` |

## Convex functions

A `room` or `code` argument accepts a Convex id, a GUID or a short code.

### Auth (`auth/*`)
- `auth/user:me` query → `null` or `{subject, name, scope, isAdmin, roomId?, permission?, credentialId?, label?}`
- `auth/device:pending({userCode})` query (browser) → `null` or `{roomId, roomCode, permission, label, expiresAt, userCode, status, isRoomOwner, ownerConsentRequired, canApprove}`
- `auth/device:approve({userCode, ownerConsent?})` and `auth/device:deny({userCode})` mutations (browser)
- `auth/credentials:list()` query → the caller's active credentials `[{credentialId, roomId, roomCode, permission, label, createdAt, expiresAt, lastUsedAt}]`
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

## Room-assistant mapping

| Assistant command | Engine call |
|---|---|
| `observation` | `player.observation` |
| `events --after --limit` | `player.events` |
| `command` (envelope on stdin) | `commands.submit` |
| `receipt ID` | `receipts.get` |
| `wake` | `activity.touch` |
| `room-state` | `rooms.get` |
| `ai-catalog` | `aiTemplates.catalog` |
| `room-command` | `owner.command` |
| `disconnect` | `POST /api/device/revoke` |
