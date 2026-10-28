# Code Gods pilot handoff

## Publish the authoritative server

Use this project as the server. In Publishing, choose **Autoscale** with
**maximum instances = 1**. Do not run multiple replicas.

After 30 minutes without authenticated human activity, the application becomes
idle. Socket close `4008` and HTTP `503` with `code: SERVER_IDLE` stop client
polling and reconnects; AI commands, pings and passive page visibility do not
keep rooms awake. Choose **Resume / reconnect** to send `POST /api/activity`
and fetch a full snapshot. A genuine authenticated page visit can also resume.
Infrastructure scale-to-zero timing is controlled by the platform, not a
guaranteed shutdown deadline. Transient disconnects retry with bounded jitter;
expired player credentials require reapproval, not automatic renewal.

Confirm the published environment includes the built-in PostgreSQL database,
`CODE_GODS_ADMIN_EMAILS`, and the provider keys you want to use. The allowlist is
already configured as a shared environment variable. Never put keys in client code.
Publish using Replit's Publish UI; the production database schema is applied there.

After publishing, visit `/api/manifest`: `runtimes` must contain both `python`
and `typescript`. If it does not, stop and inspect the server build/startup logs.
No inference requests are made by this check.

Log out/in once to obtain the verified email claim. Open **AI library** to
create/edit named agent templates. The initial Sonnet Strategist uses Sonnet 5.5.
Deleted defaults stay deleted. Both direct Anthropic and OpenAI are supported.

Create a room and share its full URL. All players log in with Replit and join.
There must be at least three players; an owner may add AI seats from the library.
Readiness is advisory. Approve a token budget before starting with AI seats.
The room page is the lobby. **Start game** takes everyone to that game's page.
When the game ends, its result is added to the room's history and players return
to the lobby. There the owner can change settings and start the next game with
the same members. Anyone who joins mid-game watches it and plays in the next one.
AI usage bills the server's provider accounts. Current safety ceilings are
$2 per game and $5 per UTC day across this server, plus the room token limit.

## Fastest fallback: hosted player console

Each human opens the room's **Open player client** link, or:

`https://YOUR-PUBLISHED-SERVER/player/?room=ROOM_UUID`

This is a functional player console without duplicating a Replit. It uses the
same authenticated player API and WebSocket observations.

## Independent Replit clients

Duplicate this repository for each player's editable client environment.
Do not give players editor access to the authoritative server. Model-provider
keys are not needed by player clients.

In each copy, tell its Agent:

> Read PILOT.md. Configure this copy as a player client of
> https://YOUR-PUBLISHED-SERVER. Stop the existing
> artifacts/player-web: web workflow so port 22772 is free. Use the existing
> /player/ artifact route, not a new server. Run
> bash scripts/player-pilot.sh https://YOUR-PUBLISHED-SERVER as the player
> service. Do not start the copied authoritative API server.
> Keep all launch and session credentials private.

The script builds the UI under `/player/`, starts the client with a sanitized
environment, and prints the location of a private file containing a single-use
launch link. Open that file privately within 60 seconds, then open its link.
The link establishes the local client session; it is not a shareable room URL.
If it expires, restart the client with the script to generate a fresh link.

Enter the room UUID. Follow the approval link to the authoritative server,
sign in, join the room if needed, and approve the displayed code. The room
credential stays in daemon memory and expires after 15 minutes; approve again
when requested.

The client Agent uses the separate workspace-local assistant CLI described in
`docs/room-assistant.md` to observe and act as its human player, without extracting
browser cookies or copying tokens into chat.
Unless the human approves an owner grant, it has no room-owner permissions; it never sees opponents' individual scores.
Client UI and analytics are freely editable. Pull subsequent Git changes into
each copy and restart its client service.

## First smoke game

### Room assistant live acceptance

Use `docs/room-assistant.md` in a **separate player workspace**, with no authority
database or provider secrets. Do not start the copied authority. Supply the real
HTTPS player URL with room code `4B9A` (or the current canonical room link).

1. Run assistant connect with read permission. Keep only its safe approval fields.
2. In a real signed-in browser on the authority, verify resolved room, comparison
   code, self-reported label, read permission, five-minute approval expiry and
   fifteen-minute grant lifetime; approve.
3. Confirm CLI status distinguishes the local bridge from authenticated WSS.
   Observe personal data and bounded events through the intended Replit proxy.
   Verify no individual opponent scores and that an attempted mutation fails.
4. Revoke in the authority's player console during a passive subscription.
   Confirm immediate disconnect/no further private delivery, while the human
   browser remains signed in. Repeat with an action grant and a normal player
   command, checking its receipt, not just local submission.
5. Disconnect with the authority reachable, then while unreachable: the latter
   must say remote revocation is unconfirmed and identify the expiry deadline.
   Exercise denial, five-minute approval expiry, fifteen-minute grant expiry,
   bridge restart and idle/wake. None should silently use browser identity.
6. Interrupt WSS after sending a command. A missing receipt is uncertain; no
   mutation is replayed automatically. Reconnect, inspect state and receipt, and
   retry only the identical envelope explicitly if needed.

Record date, server origin, workspace separation, browser/proxy results and
blockers without recording cookies, device secrets, verifiers or bearers.
Synthetic fixture tests are not evidence of real OIDC or independent cloud
workspace access. Private preview/deployment gates may block headless requests
before game authorization; report redirects without following them or trying
to bypass the gate.

#### Recorded verification — 2026-10-20

- Workspace type checks and client tests passed. Authority integration tests
  exercise the actual assistant with real HTTP/WebSocket transports against
  isolated SQL fixtures, including read/action approval, receipts, revocation,
  browser coexistence and disconnect. They do not verify real TLS or OIDC.
- Development services started cleanly after applying the additive device schema.
- Browser pass verified logged-out `/device` and `/player/` entry screens.
  Synthetic login claims did not complete authentication: the app's fixed Replit
  OIDC issuer redirected to the real Replit sign-up/login screen. No credentials
  were extracted and no authentication bypass was added.
- Signed-in consent/grant UI and real HTTPS/WSS approval remain **unverified**.
  No independent Replit player workspace was available. The live checklist above
  needs a browser-approved human session and a separate player workspace without
  server/database credentials. This task branch was not published.

Start with three humans or two humans and one AI. Use the "First steps" preset
(Grid 4×4) or Int, a short planning phase and the default world rates. A valid
first summon is an agent that returns mutator calls. Int, Python:

```python
def agent(x):
    return [add(1)]
```

TypeScript: `function agent(x) { return [add(1)]; }`. On a Grid:
`def agent(grid):\n    return [paint(row(2), "red")]`. The mutators and helpers of the
room are listed in the observation's `instance` and in the player console. An agent
that returns `[]`, or calls that change nothing, validates but every act fails: every
object value is unique, so a change onto an existing value fails as well.

Energy: summoning costs god energy: the source's description bits (Python ast-bits-v1,
TypeScript ts-ast-bits-v1; a move helper on literal arguments is priced as that move),
shown as the validation `cost`. Validation also runs the agent on a few hundred
reference objects and reports `decisionBits` (the information its choices carry: an
agent that always makes the same move pays about nothing for deciding) and
`expectedActCost` with its breakdown. The new agent starts at 0 energy and earns 2 bits
per second of world time on Int and string boards, 16 on Grid boards (none during
planning or pauses). It is **eligible** to act once its energy reaches its
`expectedActCost`; each act pays decisionBits plus the information it erases, how much
it moves and a 2-bit floor, and a failed act still pays decisionBits + the floor, so
energy can go negative: a **cooldown** until income brings it back.
Agents run with a frozen clock and a server-seeded `random`. Destroying an agent is free.

Before publishing, set the secret `CODE_GODS_SEASON_SALT` (at least 16 characters):
production refuses to start without it. Never share it during the season; game
records carry its sha256 commitment.

Read your utility card (emoji, summary, then source; a ⚠️ defence goal if dealt),
validate, summon, watch your agent's energy and eligibility, observe transformations
and your payoff in bits, send a public message, and try one pause. Then try
reconnecting the client.

### Updating duplicated client copies (player protocol v3)

The server speaks only `code-gods.player.v3`. A player workspace duplicated before
this change must pull the repository, rebuild (`pnpm install --frozen-lockfile`,
`pnpm --filter @workspace/player-web build`) and restart its daemon or assistant
service; an old client gets a version error rather than wrong numbers. Custom
analytics must read `own.netBits`, `peerNetBits`, `peerCare` and `payoff` instead of
`ownUtility`, `othersUtilitySum` and `score`, and agents' `energy`/`eligible`. See the
migration note in `docs/player-client-integration.md`.

## Verification boundary

Browser testing covered admin CRUD, 10,000-character prompts, a three-human
game, summoning, live transformations, cross-human chat and pause. Independent
daemon processes passed real HTTP/WebSocket/PKCE/reconnection tests against
an isolated authority fixture. Production-style build and relocated runtime
smokes passed. Real Replit-copy routing, real admin OIDC claims, published-image
startup and paid model inference still require this pilot's live verification.
