# Code Gods pilot handoff

## Publish the authoritative server

Use this project as the server. In Publishing, choose **Reserved VM**, not
Autoscale: the world scheduler and authority lease expect one continuously
running server. Do not run multiple replicas.

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

The client Agent may use the secured local daemon APIs described in
`docs/player-client-integration.md` to observe and act as its human player.
It has no room-owner permissions or access to opponents' individual values.
Client UI and analytics are freely editable. Pull subsequent Git changes into
each copy and restart its client service.

## First smoke game

Start with three humans or two humans and one AI. Use TypeScript, Int, a short
planning phase and the default world rates. A valid first summon is
`(x) => x` or `(x) => x + 1` (the latter can fail at the upper integer boundary).
Python equivalents are `lambda x: x` and `lambda x: x + 1`.

Check the private source, validate, summon, observe transformations, send a
public message, and try one pause. Then try reconnecting the client.

## Verification boundary

Browser testing covered admin CRUD, 10,000-character prompts, a three-human
game, summoning, live transformations, cross-human chat and pause. Independent
daemon processes passed real HTTP/WebSocket/PKCE/reconnection tests against
an isolated authority fixture. Production-style build and relocated runtime
smokes passed. Real Replit-copy routing, real admin OIDC claims, published-image
startup and paid model inference still require this pilot's live verification.
