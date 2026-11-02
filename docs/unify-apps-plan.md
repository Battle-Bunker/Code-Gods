# One app: unifying the engine UI and the player client

Status: **adopted** (2026-11-02, `develop` at 7444fce). Approved by the coordinator: the account grant (§3), the
spectator defaults (§2) and no backwards compatibility (owner). Nothing is built yet: implementation waits for the
coordinator's "go".

**The owner's request, in short.** There is one reference app. It has no `/client/` prefix and no "separate client".
Every page is calibrated to the signed-in human:

- `/rooms/:r` is a room page and never a game;
- `/rooms/:r/games/:g` is the game: the player view for seated gods, the spectator view for spectators, and the
  replay once the game is over;
- spectators are a room role. The owner defaults to spectator, and the owner or the member themselves can change it.

The same app must also run as a custom client from localhost or a Replit dev URL, pointed at a Convex deployment.
Permissions must come only from the human's Google identity, never from which app they run.

## 0. What exists today

| | Engine UI (`artifacts/code-gods`) | Player client (`artifacts/player-web`) |
|---|---|---|
| Served at | `/` (static instance `engineSite`) | `/client/` (instance `playerSite`); `/player/*` 308s there; any dev server at `/` |
| Pages | `/` rooms, `/rooms/:r` (players, chat, next game, past games), `/rooms/:r/configure`, `/rooms/:r/games/:g` (public game view: leaderboard, objects, chat, owner menu; results then auto-return), `/games/:code` (legacy), `/connect`, `/device`, `/admin/agents[/:id]` | `{base}` your connected rooms, `{base}rooms/:r` (**the live dock for the current game**, plus the ended-game bar), `{base}rooms/:r/games` (past games), `{base}rooms/:r/games/:g` (current → redirects to the room; ended → replay dock) |
| Auth | Better Auth Google cookie → Convex JWT, `scope: "browser"` (the human, everywhere) | Room-scoped player JWT only: OAuth+PKCE per room (PR #84; `/connect` approves the first-party `act` grant without a click), or the dev server's `/__codegods/token` (credential in the env) |
| Palette | `@workspace/ui-kit`, `PaletteSurface = "engine"` | the same kit, `"player"` |
| Auto-update | site `engine` in `siteBuilds` | site `player` |
| Tests | unit `test/*.test.ts`; e2e `smoke.ts`, `auto-update.ts` | unit (24 files); e2e `multi-client`, `stored-panels`, `assistant-games`, `replay-shot`, `annotations`, `objects-scroll`, … |

Engine facts this plan relies on:

- An unseated member already gets a **spectator projection**. `buildObservation(…, godId)` gives roster index −1:
  public salience and the published scoreboard, no utility (`convex/lib/projection.ts`, `lib/load.ts`).
- The roster is every member at start (`owner.ts startGame`: `members.length` must be 3 to 8). A god who joins
  mid-game is already a de facto spectator of that game.
- Past games are readable by their roster and the room owner (`requireHistoricReaderAs`). The current slot is
  readable by every member.
- Only about ten call sites distinguish `scope === "browser"`: `rooms.create/join/list`, `credentials.*`,
  `device`/`connect` approval, `panels/access`, `setups`, `games.ts` scope, and `assistant.ts`.

## 1. Target

### 1.1 Which codebase survives

**`artifacts/player-web` survives and becomes "the app".** The engine UI's pages move into it. Then
`artifacts/code-gods` is deleted. A rename to `artifacts/app` is optional, as the last PR, if the coordinator
wants it.

Why player-web:

- It is the hard part to move: the dock, the SDK and its sandboxed frame build (`vite.frame.config.ts`), the
  stored-panel bridge, CSP, replay, and the assistant pane.
- It already has the machinery that "run it anywhere" needs: a path-independent base, the dev-server token plugin,
  `VITE_CODE_GODS_ENGINE_URL`, and the hosted-flow and auto-update code.
- The engine UI's pages are plain React and wouter over `useLive(api.…)`, about 1,800 lines. They port easily.
  Both apps carry the same shadcn `components/ui` copies, so those dedupe for free.

### 1.2 Route table (base-relative; `/` when hosted)

| Route | Who | What it shows |
|---|---|---|
| `/` | signed in | Your rooms (code, owner, created; no names), create a room, join by code. **Account session only** (§3). With a room-scoped session (dev server): that room, and links to the engine site to do more. |
| `/rooms/:r` | member | **Room only, never a game.** Header (code, owner, created, invite link) and the status sentence with one primary action (`nextStep`). **Active game:** a card with its code, phase, clock and a prominent "Open game G…" link; the preparing progress. **Members:** name and roles (owner 👑, player / spectator, AI with model, ready, you), the spectator toggle (§2), and the owner's AI-seat menu. Room chat. Next game (setup, summary, AI spending, "See all settings"). **Game history:** every past game, with the open/replay link where readable. |
| `/rooms/:r` | signed in, not a member | Invite: join (as a player, or as a spectator). |
| `/rooms/:r/configure` | member (owner edits) | As today. |
| `/rooms/:r/games/:g`, live, viewer seated | roster god | **Player view:** today's dock (`PlayerShell`), header, panels and the assistant. Owner actions in the palette/header if the viewer also owns the room. |
| `/rooms/:r/games/:g`, live, viewer not seated | member (spectator, or joined mid-game) | **Spectator view:** today's engine-UI game page (status line, leaderboard with roster, objects, chat, game details, owner ⋯ menu: end, resume), from `games.view` and the spectator projection. No forge, no per-god card. |
| `/rooms/:r/games/:g`, ended | its roster, its spectators, the owner; any member while it is the room's current slot | **Replay** (`ReplayGame`, deep links `?e,t,speed,play,as`), the same for all. It falls back to the final state (`HistoricGame`). The 15 s auto-return to the room is removed. A seated player watching the end stays on the URL and it turns into the replay. |
| `/connect`, `/device` | signed in **on the engine origin** | As today (consent and credential management). Off-origin, the app links to `<engine>/connect`. |
| `/admin/agents[/:id]` | admin, engine origin | As today. |

**No redirects, no legacy aliases** (owner, 2026-11-02: "Remove the old code as thoroughly as possible … make the
code look like it would if you had designed it according to my just declared guidelines from scratch"). The table
above is the whole URL scheme. Any other path is the app's not-found page.

These go entirely, with their code and tests:

- `/client/*`, the `/player[/*]` 308s, the `playerSite` static component and its `convex.config.ts` registration;
- `/games/:code`, `?game=`, `?room=` and `{base}rooms/:r/games`;
- `legacyGameCode`, the `legacyGame` route kind and `carriedSearch` special cases;
- the room page's id→short-code canonicalisation. Links are built from short codes only. Whether the engine's room
  and game lookups still need to accept a Convex id or GUID is decided by their non-UI callers (MCP, SDK), not by
  URLs.

The app's `routes.ts` is the one URL scheme, written fresh: `routeHref`/`parseRoute` base-relative, with the route
kinds `home | room | configure | game | connect | device | admin`. The panel frame is `/panel-frame.html`.

**Navigation on launch.** As the room page does today, every member who is looking at the room page when a game
launches is taken to the game URL. The view there depends on their role. The game page never navigates on its own,
because ended means replay.

## 2. The spectator role

### 2.1 Data model

- `members.spectator: boolean` (required; AI seats are always `false`). This is a **preference for the next game**,
  like settings.
  Changing it mid-game never changes the running roster.
- `games.spectators: string[]` (required) is snapshotted at launch. It lists the human members who were not dealt in, so that
  history and replay access can name them, and the history row can show "watched by …".
- `rooms.preparing.memberIds` already fixes the roster at the deal. Spectators are excluded there.

### 2.2 Who sets it, and the rules

- A new public mutation, `rooms.setSpectator({ roomId, spectator, godId? })`:
  - a member may set it for themselves;
  - the owner may set it for any **human** member;
  - an AI seat is never a spectator (it exists to play), so an AI seat is refused;
  - it is refused while `preparing` (the deal is fixed);
  - while a game is live it is accepted, and applies to the next game, like settings ("Changes apply after game G
    ends").
- It needs a catalogue entry with a palette spec and a registry tool, `set_spectator`, at `act` permission for self
  and `owner` for others, so the assistant, MCP and the CLI get it too (the single-catalogue rule).
- **The owner defaults to spectator.** `rooms.create` inserts the owner's member row with `spectator: true`.
  Members who join default to player. `rooms.join` takes an optional `spectator` argument for "join to watch".
- **Start rules** count players only. That means non-spectator members, humans plus AI: 3 to 8. A spectating owner
  doesn't count toward 3. `nextStep` gains the case: "2 players: play yourself, add an AI, or wait".
- **Ready** applies to players only. Spectators have no ready state. The lobby AI rules are unchanged.
- **Ownership transfer** (if it ever exists) does not touch the flag.
- **Existing data: migrated.** Stored members are backfilled with `spectator: false` (today's owners keep playing) and
  stored games with `spectators: []` (§5, "Schema changes are migrated").

### 2.3 Disclosure

- **Live:** a spectator gets exactly what an unseated member already gets: `games.view` (public) and
  `player.observation`/`events` with index −1, which are aggregate only. They never see a per-god utility or card,
  their own agents (they have none), or another god's live transformation details (the public-log rules). They
  can't summon, validate or pause. They may chat, because chat belongs to the room. The owner's controls (end,
  resume) work from the spectator view.
- **Assistant:** off for spectators in v1, because the allowance is per player per game. A read-only spectator
  assistant can come later.
- **Replay** of an ended game: fully transparent (owner ruling 2026-11-01). It is readable by
  `roster ∪ spectators ∪ owner`. `requireHistoricReaderAs` adds `game.spectators`, with a `test:game` case.
- **AI seats and the assistant** never see spectator-only state. There is none: a spectator's view is a subset of a
  player's.

## 3. Auth: one app, any origin, rights from the Google identity

### 3.1 The conflict

PR #84 (`docs/external-clients.md` decisions 1 and 5, memory "every player client … never the site cookie") made
the hosted client hold **only a room-scoped token**. The aim was that it could do no more than an external client.
External clients therefore **cannot** list, create or join rooms, edit setups, or use any page outside one room.

The unified app has a home page (create, join) and room membership flows. Under that rule it could not be fully
"the app" off-origin. The owner's new requirement is equality in the other direction. Whatever app the human runs,
they get what their Google identity allows.

### 3.2 Proposal: one `EngineSession` abstraction, three backends

| Backend | When | Convex JWT | Rights |
|---|---|---|---|
| **site** | the app is served by the engine (same origin as `/api/auth`) | Better Auth → `scope: "browser"` (today's engine UI) | the human, everywhere |
| **account** (new) | the app on any other origin: localhost, Replit dev URL, static host | OAuth+PKCE grant with `scope=account` → player JWT with `scope: "account"` | **the same as site**, except the consent and credential surface: approving devices and connections, listing and revoking credentials, and admin. Those stay on the engine origin. |
| **room** | the dev server's `/__codegods/token`, `clients/hello`, or an explicit "room only" connect | today's room-scoped player JWT | one room × read/act/owner |

- **Engine.** `getViewer` maps `scope: "account"` to a `Viewer` with `scope: "account"`. A helper `isAccount(viewer)`
  (browser or account) replaces the `scope === "browser"` checks in `rooms.create/join/list`, `panels/access`,
  `setups`, `games.ts`, `assistant.ts` and `requireRoomPermission`.
- **Browser-only gates** stay as they are: `credentials.*`, `device.approve`, `connect.approve`, and
  `isAdmin` (false for account).
- **Account grants** are `kind: "oauth"` credentials with `roomId` absent and `permission: "account"`. They are
  listed and revocable in "Your player apps". Their refresh token rotates, with 7 days idle (rooms get 30), and
  reuse revokes the grant.
- **Consent.** `/connect` shows "This app will act as you in **every room**", with the origin, and the explicit
  checkbox. An account grant is never approved without a click, first-party included. There is no first-party
  account grant, because on the engine origin the app uses the site backend.
- **App.** `connection.ts` grows from `devserver | hosted` to `site | account | room`. It detects `site` with
  `GET /api/auth/get-session` on the same origin. Otherwise it uses `/__codegods/token`. Otherwise it uses the
  stored account session, else a sign-in screen ("Sign in with Google via <engine>"). The pages read
  `useEngineSession()` → `{ me, kind, can(…) }`. The affordance model takes `role` and `permission` from it, so
  `availabilityFor` already works: a room session is `permission`, site and account are `role`.

**Why not "hosted uses tokens too" (keep PR #84's invariant literally)?**

- The hosted app would need an account-wide refresh token in `localStorage` on the engine's own origin. That is the
  origin whose cookie can approve new grants, so XSS there would be strictly worse than today.
- It would also mean a redirect dance on every first load and two sign-ins.
- The site cookie is the identity's own session. Using it on its own origin gives no privilege that an account grant
  elsewhere lacks, apart from the consent pages, which must be origin-bound to mean anything.

So equality is kept at the level the owner asked for: identity, not code. Both paths get the same `Viewer` rights
through one engine helper, and one test matrix runs the app in both modes (§5).

**Threat model delta** (to be written into `external-clients.md` §3.3):

- A forked or buggy client with an account grant can do anything the human can in Code Gods. That includes creating
  rooms, joining rooms and owner actions in rooms they own.
- It still cannot mint or approve credentials, see other humans' private data, or reach admin.
- XSS in a player's own client now steals an account-wide refresh token instead of a room one.
- Mitigations:
  - explicit consent naming the origin;
  - 7-day idle expiry;
  - rotation with reuse detection;
  - revocation from the engine site;
  - per-human rate limits (unchanged, already per human);
  - an opt-in "room only" connect stays available for coding agents and anyone who wants least privilege.
- MCP, the CLI and the in-client assistant are unchanged: room credentials only. `account` is never accepted on
  `/mcp`.

## 4. Other surfaces

- **MCP / registry / CLI.** No change except the new `set_spectator` tool and catalogue entry. MCP tokens stay
  room-scoped, and `mcp.ts` rejects `account`.
- **In-client assistant.** It is unchanged on the player view. On the site backend, `assistant.ts` already treats
  browser as `owner`-capable. It must use the **seat's** room permission semantics (the human's own: owner if they
  own the room, else act) for site and account alike. Check `assistant.ts:50`.
- **Palette (PR #126 single registry).** `PaletteSurface "engine" | "player"` collapses into per-page contexts. Home
  and room pages bind the room and owner entries the engine UI binds today. The player view binds the player
  entries. The spectator view binds owner and chat entries. Both `commands.ts` files (`code-gods/src/lib/commands.ts`,
  `player-web/src/core/palette/*`) merge into the app's one binding table. Palette specs keep `surface` only where an
  entry is page-specific.
- **Affordances (`useAffordances`, audit worker).** The merged app derives `PaletteContext` from `useEngineSession()`
  plus the room and roster. "seated" now means on the active roster, and spectators rank as `member`. Coordinate:
  that worker's hook becomes the app's one hook. Phase 2 starts only after it merges.
- **Auto-update (PR #108).** There is one static site, so `versionSiteV` gains `"app"`; a migration deletes the old
  sites' `siteBuilds` rows (they only record past deploys), and a narrowing PR leaves `"app" | "functions"` (§5). `startAutoUpdate` keeps protecting a seated player's unsent work (unchanged). Tabs still open
  on `/client/` at the cutover just 404 on reload, which is acceptable: there are no external users.
- **Version skew.** One build means engine pages and dock can no longer disagree.
- **Deep links.** Replay params stay on the game URL. `?panels=off` (safe mode) is the only carried parameter.
- **Docs.** These need rewriting:
  - README (one app; "run it locally": `pnpm --filter @workspace/player-web dev` with `VITE_CODE_GODS_ENGINE_URL`);
  - PILOT.md (URLs, deploy of one site);
  - `external-clients.md`, rewritten to the new invariant: identity decides, not the app; site or account grant for
    the app; room grants for agents. Includes the threat-model delta of §3;
  - `surface-architecture.md` §1 (one row for the app);
  - `player-client-integration.md`;
  - `engine-api.md` (generated catalogue rows);
  - `.agents/memory/code-gods-product.md`: the URL, `/client` and site-cookie rules are replaced by this design's,
    with no "old links keep working" clause;
  - delete what describes the removed apps: the `/client`/`/player` sections everywhere, `docs/readme` and
    `docs/screenshots` assets of the old room-dock layout (regenerated by `readme-shots`), and `replit.md` lines
    about two sites.

## 5. Sequencing (each PR keeps `develop` green, merged per CLAUDE.md; all wait for the coordinator's "go")

**Schema changes are migrated, never reset** (owner, 2026-11-02: "set a precedent for our process to do migrations
according to convex best practices"; CLAUDE.md "Schema migrations"). The `@convex-dev/migrations` component runs from
the deploy workflow (`scripts/run-migrations.mjs`), and each change goes widen → migrate → narrow:

- **PR 1:** `members.spectator` and `games.spectators` land optional; `backfillMemberSpectator` sets `false` on every
  stored member (existing owners keep playing: no current room changes behaviour) and `backfillGameSpectators` sets
  `[]` on stored games.
- **PR 3:** `siteBuilds.site` is widened to accept `"app"` beside the old `"engine"` and `"player"`; a migration deletes
  the old sites' rows (they only record past builds; the next deploy records the app's).
- **A narrowing PR** after dev and production report those migrations done makes `spectator`/`spectators` required and
  `siteBuilds.site` `"app" | "functions"` only, and drops the fallbacks.

1. **PR 1: spectator role, engine and current UIs.**
   - Engine changes:
     - `members.spectator` and `games.spectators` (optional, backfilled by component migrations);
     - the `@convex-dev/migrations` component, `scripts/run-migrations.mjs` in the deploy workflow and dev, and
       CLAUDE.md "Schema migrations";
     - `rooms.setSpectator`, the catalogue entry and the `set_spectator` tool;
     - start counts players only;
     - owner default on `rooms.create`;
     - `join({spectator})`;
     - the historic reader rule.
   - The test fixtures' room helper opts the owner into playing (`setSpectator(owner, false)` after create), where
     tests assume it.
   - The engine UI room page shows roles and the toggle; `nextStep` covers the new cases.
   - Tests: `test:game`, `test:mcp` (tool), the catalogue typecheck, and code-gods `next-step`.
   - It is engine-only plus small UI, so there is little friction.
2. **PR 2: account grants.**
   - `scope=account` in OAuth and `/connect` consent.
   - `Viewer.scope "account"` and the `isAccount` helper.
   - `/mcp` rejects account grants.
   - The SDK gets `createPlayerAuth({ scope: "account" })`.
   - Tests: `test:auth` (a foreign origin gets an account grant, can list, create and join, can't approve or revoke,
     and is revoked) and `test:mcp`.
   - Docs: `external-clients.md` and the memory rule (the new invariant).
3. **PR 3: the move.** It is mostly mechanical, with no compatibility paths.
   - `git mv` the engine UI's pages, components, hooks and lib into `player-web/src/site/`, and dedupe `ui/`.
   - Add the one router and `EngineSession` with site and room backends.
   - player-web builds with base `/`, and the frame moves to `/panel-frame.html`.
   - `http.ts` drops the `playerSite` instance, the `/client/` mount and the `/player` 308s; `convex.config.ts`
     drops the component.
   - `deploy-static` uploads one site.
   - Delete `artifacts/code-gods`, its workspace entry, and its config (vite, components.json, deploy steps).
   - Move code-gods unit tests into player-web `test/`, and its e2e `smoke.ts` and `auto-update.ts` into
     player-web `e2e/`.
   - Routes at this point: the game route dispatches to the dock (seated) or the old game page (others); the room
     route still holds the dock until PR 4.
   - This is the one big-bang PR, because two apps cannot both own `/`. It is why the coordinator should wait until
     the dock, replay, agent-names and affordance work has merged.
4. **PR 4: page semantics.**
   - `/rooms/:r` becomes room-only (the members/roles table, the active-game card, history; the dock and ended bar
     leave it).
   - `/rooms/:r/games/:g` does player, spectator and replay dispatch, and the auto-return goes.
   - Delete the legacy route kinds and helpers listed in §1.2.
   - Tests: `routes.test.ts` (the route table, and unknown paths are not-found); e2e `multi-client` updated so live play happens at the
     game URL; a new e2e `spectator.ts` (the owner spectates by default, sees the public view, can't see a card, ends
     the game, and both land on the replay).
5. **PR 5: off-origin account mode in the app.**
   - The account backend, the sign-in screen, and links out to the engine for `/connect`, `/device` and admin.
   - e2e: the app served by Vite on another port against the local engine, doing create room → configure → play
     (extends `smoke:hello`'s harness).
6. **PR 6: cleanup and docs.**
   - Collapse `PaletteSurface`.
   - Delete the hosted-flow per-room auto-redirect logic and the first-party consent shortcut (`/connect`
     auto-approval for the `/client/` redirect URI) with its tests.
   - README, PILOT, the surface docs and the memory rules.
   - Optionally rename `player-web` → `app`.

**Deleted overall:**

- `artifacts/code-gods`;
- the `playerSite` static instance, the `/client/` mount and the `/player` redirects;
- every legacy URL form (`/games/:code`, `?game=`, `?room=`, `rooms/:r/games`) and its tests;
- first-party OAuth auto-approval (decision 5) and `PLAYER_CLIENT_BASE`;
- the `{base}rooms/:r/games` page (history moves to the room page);
- the ended-game bar on the room page;
- the game page's auto-return.

## 6. Risks and major obstacles

1. **Reversing PR #84's invariant (major; approved by the coordinator 2026-11-02, the owner informed).** The written product rule says the
   hosted client never uses the site cookie and external clients are room-scoped. Unifying the apps on the owner's
   terms requires account-wide grants for off-origin use.
   *Proposal:* §3, the site cookie on the engine origin and account grants elsewhere, with identical `Viewer`
   rights through one helper. Consent and credential management stay on the engine origin. Room-only tokens remain
   for agents.
2. **The owner-as-spectator default vs the 3-player minimum and the test suite (major churn).** Many engine tests
   and e2e flows create a room with three humans, the owner among them, and start.
   *Proposal:* the default lives only in `rooms.create`'s member insert. Test helpers pass an explicit
   `ownerPlays: true`, an internal or test-fixture argument, not a public one; or they call `setSpectator` after
   create. The UI tells the owner plainly why a 2-player room can't start. Existing rooms are unaffected.
3. **Two apps both own `/` (merge friction).** PR 3 touches every file of `artifacts/code-gods` and the routing core
   of player-web.
   *Proposal:* start only after the dock, replay bar, agent names and affordance audit have all merged and been
   released. Make PR 3 strictly mechanical (moves, imports, router, hosting) and put semantic changes in PR 4, so
   the big diff is easy to review and rebase.
4. **Engine UI pages assume the cookie** (`authClient`, `useAuth`, `ConvexBetterAuthProvider`).
   *Proposal:* `EngineSession` wraps the Better Auth provider (site) and `ConvexProviderWithAuth` (account and
   room). Pages use only `useEngineSession()`. `/connect`, `/device` and admin render only for `site`.
5. **Replay access for spectators.** Today's past-game rule excludes them.
   *Proposal:* the `games.spectators` list and the extended `requireHistoricReaderAs`, tested. The list is every
   non-roster human member at launch, and `rooms.join` appends anyone who joins while the game is live, because they
   are its spectators.
6. **CSP and the panel frame on the root origin.** The engine UI had no meta CSP, and the client's CSP
   (`connect-src` the deployment, `frame-src 'self'`) now covers `/connect` and Better Auth too.
   *Proposal:* add the site's own origin (`/api/auth`) to `connect-src`, and Google's sign-in is a navigation, not a
   fetch. `csp.test.ts` covers both modes.
7. **Bundle size.** Engine pages plus the dock, SDK and grids in one bundle.
   *Proposal:* route-level `lazy()`. The home, room and configure pages don't load the dock chunk.
8. **Strict schema vs existing data.** *Decision:* component migrations, widen → migrate → narrow (§5); no resets.
9. **Behaviour the owner may not expect:** the 15 s auto-return disappears, and the room page no longer embeds the
   live game. Both follow from the request, and the PR descriptions say so.
