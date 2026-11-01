# External player clients

Status: design adopted 2026-11-01. It extends [`surface-architecture.md`](surface-architecture.md) and
[`player-client-integration.md`](player-client-integration.md). Routes and functions are in [`engine-api.md`](engine-api.md).

**Goal.** A player can run their own client on any origin and change it freely with a coding agent during play. The
origin can be a Replit dev URL (`https://xyz.replit.dev`), `http://localhost:5173`, Codespaces, a static host or a
claude.ai artifact. The hosted client at `/client/` is a **reference implementation** of such an app. It gets nothing
from the engine that a client on another origin cannot get the same way. Server authority stays in the Convex
deployment: whatever a client is or does, it can act only as its human, in one room, with one permission. The
disclosure rules hold in the engine's queries.

## 1. Audit (2026-11-01, `develop` at 5c75a0f)

| Question | Finding | Verdict |
|---|---|---|
| Does `/client` use only the public API? | Every game call is a public Convex function in the typed catalogue (`lib/player-client/src/catalog.ts`): no internal functions, admin keys or admin routes. | ✅ |
| Does `/client` authenticate like an external app? | **No.** Hosted mode used the engine site's Better Auth **session cookie** (same origin) and browser-scope JWTs. A browser-scope JWT means "the human, everywhere": every room, `rooms.create`/`join`, approving devices and connections, listing and revoking credentials. No external app can get that, and none should. | ❌ design bug, fixed (§3.1) |
| Can a browser app on another origin sign in? | **No.** `/api/device/*` sent no CORS headers and had no preflight, so a page on `xyz.replit.dev` could not request, poll or exchange a credential. OAuth registration accepted only Claude's callbacks, loopback and an operator allowlist, so a page on `https://xyz.replit.dev/` could not be a redirect target. `authorize` required `resource=<site>/mcp`. The only path was a Node dev server holding the credential (`tokenHandler`). | ❌ fixed (§3.2–3.3) |
| Are tokens scoped, short-lived and revocable? | Yes: one credential = one human × one room × one permission (`read` < `act` < `owner`). Every call re-checks revocation (`access.ts` `viewerForCredential`). Bearer JWTs last 10 min (device) or 60 min (OAuth). OAuth refresh tokens rotate, and a reuse revokes the connection. Every credential is listed on the engine UI ("Your player apps") and revocable there. | ✅ |
| Does a client get the same information as any other? | Yes. Disclosure is enforced in the projections (`player.*`), whoever calls them (`test/game-disclosure.test.ts`, the MCP disclosure test). | ✅ |
| Rate limits | Per **human**, not per credential: chat (1/s), panel saves, code runs, the assistant and AI pools, device requests (20 pending per room), DCR (50 per 10 min per deployment), energy. More credentials do not buy a human more. Validate runs are not rate limited (§5). | ✅ / gap noted |
| Realtime | A `ConvexClient`/`ConvexReactClient` with a player JWT subscribes over the WebSocket to the same queries. It already worked in dev-server mode. | ✅ |
| SDK | `@workspace/player-client` is a browser-safe workspace package: the protocol, `PlayerClient` and the typed catalogue. It had no browser sign-in, so every browser app had to reimplement OAuth/PKCE or depend on a Node dev server. It is not published to npm. | ❌ fixed (§4) |
| MCP from a browser | `/mcp` checks `Origin` against an allowlist (the MCP spec's DNS-rebinding MUST) and has no preflight. | kept on purpose (§3.4) |

## 2. Decisions

1. **One way in for every client: a room credential, never the site session.** The engine site's Google session is
   used only by the engine UI: signing in, approving connections and devices, creating and joining rooms, managing
   credentials. Every player client authenticates with a **player JWT** naming a credential, the hosted `/client`
   included.
2. **Browser apps on any origin use OAuth 2.1 with PKCE** (the authorization code flow, public clients), the same
   authorization server Claude uses. Changes:
   - any `https://` redirect URI can be registered (exact match; never a fragment or userinfo), as well as loopback http;
   - `resource` may be the site itself (`<site>`) or `<site>/mcp`, or left out;
   - a `room` hint picks the room on `/connect`, which offers to join it.

   **Why open redirects up?** The consent page is the control. It shows the app's self-reported name, the exact return
   origin and the room and permission. The code goes only to the approving browser (completion secret), and only with
   the PKCE verifier. A phishing app gets at most what the human approves on a page that names the phishing origin.
3. **The device flow stays, and now works from browsers too.** `/api/device/*` answer CORS from any origin. It is the
   way in where a redirect cannot work, for instance inside an iframe preview: Replit's webview frames the app, and
   Google sign-in refuses to be framed. It is also how CLIs and coding agents connect (`pnpm player connect`).
4. **CORS: `*` without credentials, only on bearer-authorized endpoints.** These are `/api/config`, the JWKS,
   `/api/device/{request,poll,token,revoke}`, `/api/oauth/{register,token,revoke}` and `/.well-known/oauth-*`. They never
   send `Access-Control-Allow-Credentials`. Cookie-authenticated routes (`/api/auth/*`) stay same-origin, so no foreign
   page can use a human's session. Convex functions (`*.convex.cloud`, HTTP and WebSocket) already take a bearer JWT
   from any origin.
5. **First-party consent.** When the redirect URI is the hosted client itself (the engine's own origin and the client's
   path, `/player/` or `/client/`), the human is a member of the hinted room and the grant is at most `act`, `/connect`
   approves without a click. No other page of the engine's origin qualifies. The code can only
   reach the engine's own page, and the token is the same as any external app's. An `owner` grant always needs the
   explicit consent checkbox, whoever asks. No other client gets this shortcut. It skips one click; the engine
   grants it no extra rights.
6. **Scope is per room, not per game.** The room is the unit of membership, ownership and chat. Games in a room
   follow one another, and replays and history are per room. A per-game token would ask for consent at every game
   start and buy nothing, since a credential already sees only its human's projection. The in-client assistant's
   credential stays per (human, room) for the same reason.
7. **MCP keeps its Origin allowlist.** Browser apps call Convex functions directly, through the SDK. MCP is for
   agents, which send no `Origin`. An operator can still list extra origins (`MCP_ALLOWED_ORIGINS`).
8. **The SDK lives in the repository** (`@workspace/player-client/browser`). Players fork this repository and change
   their client in place (the product rule), so a workspace package is the SDK. Publishing it to npm is a packaging
   step for later: the browser module depends only on `fetch`, Web Storage and `convex`.

## 3. Design

### 3.1 The hosted client is an OAuth client of its own engine

`/client/` (player-web in "browser" mode) does what any external page does:

1. It reads `GET /api/config` → `{convexUrl, siteUrl}` (same origin when hosted; `VITE_CODE_GODS_ENGINE_URL` elsewhere).
2. It looks up a stored session for the room in the URL. Sessions are kept per engine and room, in `localStorage`.
3. With none, it registers itself (DCR: the engine answers the same name and redirect URI with the same
   `client_id`, outside its registration limit) and sends the browser to `/oauth/authorize` with `scope=act` and
   `room=<code>`. The return path is kept with the PKCE `state`.
4. `/connect` (engine UI): sign in with Google if needed, join the room if needed, then approve. The approval is
   automatic for the first-party `act` grant (decision 5). An owner action in the client (start, settings, AI seats)
   asks for an `owner` connection instead. The owner approves it with the consent checkbox, and it replaces the
   `act` connection, which the SDK revokes.
5. Back on `/client/?code&state`, it exchanges the code at `/api/oauth/token` → `{access_token (60-min player JWT),
   refresh_token, room_id, room_code, credential_id, scope}` and gives the Convex client a `fetchToken` that
   refreshes. Refreshes are serialized across tabs with the Web Locks API, because a reused refresh token revokes
   the connection.
6. Revoking on the engine UI ("Your player apps") stops the client at its next call. The client then waits for a click
   to connect again: a revoked connection is never renewed silently. `signOut()` in the SDK (the hello client's
   **Disconnect**) revokes it from the client.

The dev-server mode is unchanged: the credential lives in the Node dev server, and the browser gets JWTs from
`/__codegods/token`. It is the safest option for a dev container, because the browser never holds a refresh token.

### 3.2 Authenticating from an arbitrary origin

| Option | Use it when | The app holds |
|---|---|---|
| **OAuth redirect** (`signInWithRedirect`) | a top-level page on any https origin or loopback | a rotating refresh token (30 days idle) and a 60-min access token |
| **Device flow** (`signInWithDevice`) | inside an iframe (Replit webview), a CLI, or a page that cannot be a redirect target | a `cgc_` credential (7 days), exchanged for 10-min JWTs |
| **Dev-server token** (`tokenHandler`) | a Node dev server you run (player-web's Vite) | nothing in the browser: the server keeps the credential |
| **Pasted credential** | quick experiments | a `cgc_` credential. Avoid this in shared Repls: anyone who can read the Repl can use it |

### 3.3 Threat model

- **A malicious or buggy client** acts as its human only, in its one room, with its permission. It sees exactly the
  human's projection. Every engine function re-checks the credential and the room membership, and an owner grant
  works only while the human owns the room. It cannot approve connections, list or revoke other credentials,
  create rooms or reach other rooms: those need the browser session, which only the engine site's origin has.
  Rate limits are per human, so a loop in one client cannot exceed the human's limits.
- **A token leaked from a public Repl.** The damage is bounded by room × permission × lifetime. An access JWT lasts at
  most 60 min, but revocation stops it on its next call. A leaked refresh token used by an attacker rotates; when the
  real app next refreshes, the reuse revokes the connection for both. Revoke from "Your player apps" on the engine
  UI. Keep credentials in the environment's secret store, never in files of a public Repl; the docs and the CLI say so.
- **An AI coding agent with the token in its environment** is the human's delegate (room-assistant boundary): it can
  do whatever the credential allows. Give it a `read` credential for analytics work. An `act` credential lets it
  chat publicly and summon. The in-client assistant's confirmations do not apply to outside agents. Never give an
  agent an `owner` credential unless the human wants it to run the room.
- **A phishing page posing as a client** must still pass `/connect`, which shows its real origin. The first-party
  consent shortcut applies only to the engine's own origin.
- **XSS in a player's own client** steals what that origin stores: the refresh token for one room. A player who
  changes their client can harm only their own access. The hosted client's CSP limits `connect-src` to the engine.

### 3.4 Realtime

Use the Convex client with the player JWT (`ConvexClient#setAuth(fetchToken)` or `ConvexReactClient`). Subscriptions
are the same public queries with the same projection, so the disclosure guarantees are the same. When a credential is
revoked, the next token fetch fails, the client's auth callback reports it, and the queries stop. MCP and the CLI's
`state --watch` remain for agents.

## 4. The SDK and a minimal client

`@workspace/player-client/browser`:

```ts
import { ConvexClient } from "convex/browser";
import { api } from "@workspace/engine/convex/_generated/api";
import { createPlayerAuth } from "@workspace/player-client/browser";

const auth = createPlayerAuth({ engineUrl: "https://<dep>.convex.site", clientName: "My Code Gods client" });
const session = await auth.completeSignIn() ?? auth.session(ROOM);       // back from /connect, or stored
if (!session) await auth.signInWithRedirect({ room: ROOM, permission: "act" });  // leaves the page
const convex = new ConvexClient(session.convexUrl);
convex.setAuth(auth.fetchToken(session), ok => { if (!ok) showReconnect(); });
convex.onUpdate(api.player.observation, { roomId: session.roomId }, obs => render(obs));
await convex.action(api.commands.submit, { roomId: session.roomId, envelope: { version: VERSION, commandId: crypto.randomUUID(), command: { type: "chat", text: "hi" } } });
```

The example app is in `clients/hello/` (README: a Replit quickstart). The typed catalogue of every public function is
`lib/player-client/src/catalog.ts`; its generated table is in `engine-api.md`. The protocol types and Zod schemas are
in `lib/player-client/src/protocol.ts`.

## 5. Follow-ups

- Validate (and summon examinations) have no per-human rate limit: a looping client can burn sandbox time.
  Recommended limit: about 30 examinations a minute per human per room.
- DCR's deployment-wide limit (50 new registrations per 10 minutes) lets anyone block new apps for a while. Repeat
  registrations of an app already known are free (deduplicated by metadata), and client ID metadata documents avoid
  DCR entirely. Per-IP limits need the platform to expose the client address.
- Publish `@workspace/player-client` to npm for clients outside this repository.

## 6. Tests

- `test:auth`: CORS preflight and headers on every bearer endpoint for a foreign `Origin`; no CORS on `/api/auth/*`.
  A client "served" from `https://xyz.replit.dev` and from `http://localhost:5173` registers, is approved, exchanges
  its code, subscribes over the WebSocket, acts, and is revoked. The subscription then loses auth.
- `test:mcp`: https redirect URIs register, the same metadata gets the same client, the `resource` and `room` hints
  work, and first-party approval applies only to the hosted client's path and never to `owner`.
- `lib/player-client` unit tests: the browser SDK's PKCE, state, storage per room, cross-tab refresh and reconnect.
- Browser: `clients/hello` served on a different port from the engine, driven by Playwright (`pnpm run smoke:hello`).
