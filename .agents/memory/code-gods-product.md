---
name: Code Gods product intent
description: Standing product constraints for the game and player environment.
---
Code Gods aims to elicit human technical understanding through political negotiations about executable transformations, despite unrestricted frontier AI assistance. Players use a developer environment of their choice (a local checkout, Codespaces, Gitpod or Replit) and may freely modify their client and analytics with a coding agent during play. Replit is optional, never required.

**Why:** The user wants technical fluency to be causally important to negotiation, not artificial limits on AI assistance.

**How to apply:** Keep server authority separate from freely customizable player clients in the same repo. The server UI is a common display and owner control panel, not a player gameplay editor. Video-call politics is external and out of scope.

Individual opponents' object utilities are not directly shared: clients receive their own utility, the sum of other gods' utilities and their product (the score). Public leaderboards show player total scores.

**Why:** The user explicitly specified aggregate-only opponent information.

**How to apply:** Preserve these disclosure boundaries throughout events, snapshots, history and analytics; do not claim aggregate values prevent mathematical inference.

The user approved sandbox-compatible computational libraries for the MVP: supported Python computational modules and TypeScript's ECMAScript built-ins, with documented exclusions and no host access.

**Why:** Full native standard-library compatibility would require additional isolated execution infrastructure.

**How to apply:** Do not expose Node, browser or server capabilities to game agents. Publish the actual tested runtime/module contract rather than promise all standard-library APIs.

Require at least three players per game; additional slots can be populated by autonomous AI players. All players, including AI, can participate in a global public chat channel; no private chats are allowed.

**Why:** The user explicitly added these requirements.

**How to apply:** Enforce the minimum on the server, distinguish AI identities from human (Google) identities, and give bots the same information and action permissions as human players. Do not implement private messaging.

Use parallel subtasks for this project; the main agent should act as coordinator and remain responsive.

**Why:** The user explicitly requested this working arrangement.

**How to apply:** Delegate implementation aggressively with clear file ownership and contracts. The user reiterated this after the main agent took on too much implementation; retain coordination and final integration checks.

Persist everything in Convex (the user's decision to migrate; PostgreSQL removed).

**Why:** The user decided to eliminate PostgreSQL and run the engine, persistence, auth and static hosting on one Convex deployment, with no separate server (docs/convex-migration-plan.md §0).

**How to apply:** Keep all authoritative state in the Convex deployment's tables (artifacts/engine/convex/schema.ts). Do not reintroduce PostgreSQL, drizzle, `DATABASE_URL`, an in-memory-only store or a second database.

Rooms do not have names. They are identified by a short code derived from their GUID.

**Why:** The user explicitly corrected the room-name field and reiterated this requirement.

**How to apply:** Do not introduce room-name inputs, API properties, or display titles; use the GUID-derived short code.

Show a room's creation date and owner prominently alongside its ID wherever rooms are listed.

**Why:** The user explicitly requested these identifying details.

**How to apply:** Preserve this information in any future room-list surfaces without introducing room names.

Private development-preview access is separate from Code Gods authentication. The user confirmed that granting an additional account editor access allowed it through the preview gate.

**Why:** Replit's preview permissions can block a player before the game's login runs.

**How to apply:** Distinguish preview access failures from game authentication failures. Editor access is a development workaround, not a player permission model: it also grants source-code editing access.

Private Replit gates can block headless requests before Code Gods authentication runs.

**Why:** A live connection attempt to the former Replit-published server was redirected to Replit's `__replshield`; following that redirect produced misleading header/referrer errors instead of a game API response.

**How to apply:** Inspect redirects without following them when a connection fails, and report a platform gate as such. The engine itself is now on Convex (`*.convex.site`), outside Replit's gates; a player app may still run behind a dev container's preview proxy (e.g. Replit's).

Use full names from verified Google identities (given + family name) to label human players, not just first names.

**Why:** First names do not sufficiently distinguish the game's players.

**How to apply:** `convex/auth/profileName.ts` combines Google's given and family names at sign-in. The identity key (god id) is the Better Auth user id, never the display name; Google's `sub` is kept on the `users` row for audit.

Grammar, utility-selector and complexity-function options are always pre-authored in deployed code.

**Why:** The user explicitly requires dropdown choices rather than arbitrary identifier text inputs.

**How to apply:** Populate selectors from the server's supported options, filter compatibility, and reject unknown identifiers server-side.

Fund Code Gods AI players through user-supplied Anthropic or OpenAI API keys, not Replit-managed inference credits.

**Why:** The user selected direct provider billing and subsequently requested both Anthropic and OpenAI model choices.

**How to apply:** Keep the keys in the Convex deployment's env vars (never in player apps or clients), enforce room usage budgets, and do not silently fall back to a Replit-billed provider.

AI-player templates are persistent admin-editable named records with provider/model selection and prompts capped at 10,000 characters; Sonnet 5.5 is the requested default.

**Why:** The user wants to author agents after deployment, not keep fixed code-only personalities.

**How to apply:** Gate authoring by an environment-configured verified-email allowlist. Seed defaults once and preserve edits/deletions across restarts. Do not save allowlisted personal emails in memory.

Deploy the engine as one Convex deployment that serves the engine UI, the hosted player client and the API. Park after 30 minutes without human activity.

**Why:** The user wants affordable compute with no separate server; Convex bills function time, so a parked tick loop costs nothing. The 30-minute idle rule is kept from the former Autoscale deployment.

**How to apply:** Do not add a Replit Publish step, a Reserved VM or a second server. After 30 minutes without human activity, park running games in `recovery` (no ticks, no AI turns) with auto-resume on the next human activity; AI turns, heartbeats and passive subscriptions must not count as activity.

Interaction speed is an upper limit; perform interactions as fast as available capacity permits, parallelized over four cores.

**Why:** The user rejected recovery pauses caused by trying to catch up to a fixed interaction schedule during the pilot.

**How to apply:** Do not accumulate interaction debt or stop the game for throughput overload. The interaction cap defaults to 100 Hz and is configurable up to 1,000 Hz; the user explicitly corrected confusion between default and maximum. Keep concurrent transformations consistent and benchmark higher rates for headroom.

Agent interactions have a configurable compute budget defaulting to 5 ms; compilation and interpreter startup must not be repeated inside that hot path.

**Why:** The user rejected hundreds of milliseconds of isolation overhead per simple function call and wants thousands of interactions per second. Time and randomness are explicitly allowed read-only capabilities.

**How to apply:** Measure whole-engine throughput, not only function timing; separate preparation cost from guest computation and retain enforced resource/capability limits rather than relying on Python-level name hiding.

Batch engine ticks: one Node action runs the agents of a tick, then one commit mutation writes the whole tick; never one write per interaction.

**Why:** The user explicitly requested high-throughput event-system persistence alongside a configurable interaction-rate cap. Batched ticks reach that goal in Convex's transactional model.

**How to apply:** Keep one commit mutation (and one `tickBatches` document) per tick, preserve opportunity order within it, and stay inside Convex's per-transaction limits. A discarded tick (a conflict or a failed action) is an uncommitted window, never a partially applied one.

Call them **utility functions**, never "value functions". "Value" means an object's value (the T instance).

**Why:** The user explicitly wants the technical concept of utility invoked.

**How to apply:** Use utility/ordinal/rewardBits/netBits/peerNetBits/peerCare/payoff in code, protocol, UI and docs.

Utility functions must be heterogeneous, simple to state, and accompanied by a plain-language incentive summary. There is a large repertoire of unrelated families per object type (lib/game-utilities). Utility functions return ordinal utilities (a number or a lexicographic tuple, bigger is better) in the kid card style `def utility(grid):`; scoring converts them to rarity bits through shipped calibration tables (docs/clean-implementation-plan.md). Dealing is behind a selector interface: "fair-aligned" (measured rule synergy) by default, with the Divine Lottery as fallback.

**Why:** The user rejected a uniform schema with one varying parameter, and rejected complicated rule code with validation boilerplate. Fairness is meant to come from many games, not in-game balancing (for now). Beginners must understand their incentives without reading code.

**How to apply:** New families need short Python and TypeScript kid cards with no input validation, a summary, a finite parameter support, and calibration tables regenerated with `pnpm --filter @workspace/game-utilities calibrate`. Parity tests (Python ≡ TS, order ≡ lib/grid-lab) and the calibration freshness test enforce this.

The user directed a clean break: the old design ([0,1] utilities, free-form T → T agents, god-only energy, protocol v2) was deleted outright, with no shims or deprecated fields.

**Why:** The user said to throw old code away completely rather than keep features that complicate the architecture.

**How to apply:** Don't reintroduce compatibility layers. Superseded code is deleted completely (the Convex migration removed the Express server, PostgreSQL and the OpenAPI clients outright).

Every object in a world is unique. A transformation onto any existing value (including the object's own) fails entirely, and spawns redraw.

**Why:** The user explicitly requires uniqueness.

**How to apply:** Enforce it in the engine's commit path and spawner, not in clients.

No platform dependency: the app runs on one Convex deployment and nothing else. Sign-in is Google only, through Better Auth served by Convex.

**Why:** The owner wants the app to work entirely independently of Replit by default, and chose Google OAuth as the only sign-in (2026-10-31).

**How to apply:** Do not add another sign-in method, a Replit dependency or a second server. Replit, Codespaces, local machines, Claude and a browser tab are optional *surfaces* (docs/surface-architecture.md).

Every assistant surface uses one agent interface: the tool registry (lib/player-client/src/tools.ts, executors in artifacts/engine/convex/agent/registry.ts), served as MCP at `POST /mcp`. This covers Replit Agent, Claude chat, Claude Code, claude.ai artifacts, the CLI and the in-client assistant served by Convex.

**Why:** The owner wants Replit, Claude artifacts and an in-client assistant to plug into exactly the same interfaces. That interface has to let them act, query state and history, and live-update the client UI.

**How to apply:** New agent capabilities are registry tools, run inside Convex as the human behind a revocable credential (principal = credential), never a surface-specific API. Live UI changes are stored panels: TSX in Convex, compiled on save, rendered in sandboxed frames by every open client. The in-client assistant uses the same executors, is off until the room owner approves an allowance, and asks the player to confirm public chat, summons, pauses and owner actions.

Every public Convex function has an entry in one typed catalogue (lib/player-client/src/catalog.ts: `CATALOG: Record<PublicFunctionPath, CatalogEntry>`, keys derived from the generated `api` type) with documentation for humans (title, tooltip) and for the AI (description), the tools that reach it, and a palette spec or a `why`.

**Why:** The owner wants every affordance a player has to be available and documented for their assistant, enumerated in one place that forks into the human and the AI API, with the documentation required by the type system (2026-10-31).

**How to apply:** A new public function fails the typecheck until it has an entry; a new registry tool names its `functions` and derives its description from the first one's entry (or gives its own `about` when it wraps a shared function), never a free-standing description. Buttons, menus and the command palette in both apps read the human side; MCP, the CLI and the in-client assistant read the AI side. Keep `docs/engine-api.md`'s generated table current (`pnpm --filter @workspace/player-client gen:catalog`).

The player client is a dock of panes: built-in panels, the human's stored panels and exactly one assistant pane (never closable). A human picks a pane's panel from a menu; a panel's parameters are set only by the assistant, through the layout tools.

**Why:** The owner centred the interface on the assistant, wants IDE-style movable panes with one analytics panel over the chat by default, and wants every panel parameterised by the AI rather than by controls (docs/ui-redesign.md, 2026-10-31).

**How to apply:** Panel metadata and the layout tree are pure modules in lib/player-client (`panels.ts`, `layout.ts`) shared by the engine (validation in `convex/layout.ts`, one row per human per room in `dockLayouts`) and the client (rendering). New views are panels with zod parameter schemas whose fields all default (so the client is complete with the assistant off); the assistant changes the screen only through `open_panel` (a built-in panel by id or a stored panel by slug), `set_panel_params`, `move_pane` and `close_pane` (no confirmation card, at most two per step, never a pane the player arranged unless asked). Do not reintroduce per-panel controls, dock regions or a per-human-only layout.

The things a player adds to their workspace are called **panels**, never "lenses": the built-in ones are panels ("Panels" in menus), a player's own TSX ones are stored panels ("Your panels"). One tool, `open_panel`, opens either.

**Why:** The owner's instruction (2026-10-31): "Use the term panel instead of lens for the things that can be added to one's player workspace." The rename was a clean break: no aliases, no deprecated names; stored layouts with the old pane kind reset to the default layout.

**How to apply:** Use "panel" in code, UI copy, tool names, test ids and docs (`PanelId`, `kind: "panel"`, `open_panel`, `set_panel_params`, `ui.panel.*`, `menu-panel`). Built-in renderers live in `artifacts/player-web/src/core/panels/`; `src/panels/` stays the file-panel folder. Say "built-in panel" or "stored panel" where the two could be confused. The research documents under `docs/research/ui-redesign/` keep the old word as history.

Game setups are a seeded catalogue of complete settings; a settings change enforces only the game's own dependencies.

**Why:** The owner (2026-10-31) asked to remove the configuration page's "Start from" presets, to turn them into a seed catalogue of default game setups, and to delete the confusing, buggy guidance toward partial preset collections of settings (retuning toward tuned type defaults, option repair, snapping, "Recommended" resets), implementing clean mutations for the degrees of freedom that enforce exactly the invariants and dependencies the model defines, and no more.

**How to apply:** A setup is a named complete `GameSettings` (`gameSetups`, `convex/setups.ts`): the defaults come from game-core `SEED_SETUPS`, are seeded once and only admins change them; every human may save their own. `owner.settings` takes a `setupId` or the fields to change, and every change (UI control, engine request) goes through game-core `applySettingsChange`: a language sets its grammar and summon price, an object type its default offered instantiation, type arguments must be offered, excluded families that no longer exist are dropped, option fields must be choices of the language and type; everything else is free within `validateSettings`. Tuned type defaults (`typeDefaults`, `defaultSettingsFor`) only build the seed setups. Do not reintroduce partial presets, retuning, or fields that move to "suit" another.

An ended game stays inspectable in its frozen final state: nothing the player could see while it ran disappears when it ends.

**Why:** The owner's instruction (2026-10-31): "Do not make any information disappear when the game ends. The entire structure of the game should continue to be inspectable in frozen state after the game ends." (My agents had shown only a placeholder sentence after the end.)

**How to apply:** Every built-in panel with game data lists `ended` in its phases (`lib/player-client/src/panels.ts`, linted by `test/panels.test.ts`); `results` is only the default once the game is over. Panels show the final tick (clocks stop: god energy at `endedAt`, world time at its last value) and refuse actions with a visible reason instead of hiding the panel (forge: Validate and Summon off with a line saying why). The engine never deletes or collapses an ended game's rows; reads (observation, events, trajectories, myUtility, layout, the assistant's tools) serve it until the room's next game, then by game id. The assistant briefs an ended game as its frozen final state, never as a lobby. Chat stays open after the end (it belongs to the room). Do not add a phase gate that blanks a panel or a read on `ended`.

The assistant's state is per (player, game): starting a new game in the same room starts the assistant with an entirely fresh context.

**Why:** The owner asked that all state associated with an assistant be scoped to a player and game combo (2026-11-01).

**How to apply:** Threads (turns, briefings, messages, tool calls, cards), the allowance, code runs and stored objects carry the game's epoch (the room's current game, or the lobby before the first); launching a game ends the room's active assistant turns. An earlier game's conversation stays readable by its human for that game (replays) but is never listed, continued or loaded in the next. The player's own choices are not assistant state and stay: layout and panels, saved scripts (`scripts/`), the auto-approve preference, the room credential. New assistant state gets the same key.

URLs nest games in their rooms, in both apps: `/rooms/:room` and `/rooms/:room/games/:game` (short codes) in the engine UI, and the same scheme under the player client's own base path. The engine hosts the player client at `/client/` (never "player" in the prefix; `/player/*` redirects there), and the client is a reference implementation of a separate app: it must run unchanged from any surface (a Replit or Codespaces dev server at `/`, a proxy path). A player can open the past games of a room they played in, read-only.

**Why:** The owner's instruction (2026-11-01): "make the player client URL schema as rich as the platform url schema and mirror it, but with the /client/ prefix", "nest games within rooms like /rooms/<id>/games/<id> (for both platform and client apps)", "It should be possible for the player client to visit historic games within a room they participated in", and treat `/client` as "a reference implementation of a separate app that we could run from Replit dev environments (or any other surface)".

**How to apply:** Build engine UI paths with `artifacts/code-gods/src/lib/routes.ts` and client paths with `artifacts/player-web/src/core/routes.ts` (relative to Vite's base, never a hard-coded prefix). Keep old links (`/games/:code`, `?game=`, `?room=`, `/player/*`) redirecting. A past game (neither the room's active nor its current game) is readable only by the gods who played in it and the room owner; the engine enforces it on every per-game read (`convex/lib/rooms.ts` `requireHistoricReaderAs`), never the UI alone.

Every player client, the hosted `/client/` one included, is an external app of the engine: it authenticates only with a room-scoped player token (OAuth + PKCE or the device flow, `@workspace/player-client/browser`), never with the engine site's session cookie, and calls only public catalogued functions.

**Why:** The owner wants `/client` to be a reference implementation of an app players run from any surface (Replit, localhost, …) and change freely; any privileged shortcut of the hosted client is a design bug (2026-11-01, docs/external-clients.md).

**How to apply:** The Google session is for the engine UI only (sign-in, rooms, /connect, /device, credential management). Bearer-authorized routes answer CORS `*` without credentials; cookie routes stay same-origin. A capability the hosted client needs is added for every client (a public function, an OAuth parameter), never as a same-origin or first-party exception; the only first-party difference is that /connect approves the engine's own client without a click (a member, at most act).

Players never wait for agent sandboxes to boot: launches are async, and whatever needs a warm sandbox says "not ready yet".

**Why:** The owner (2026-11-01): "Players should not need to wait seconds for the game to start for agent sandboxes to launch. Their launch should be async and any functions that depend on them having launched should just declare themselves unready until the agent sandbox(s) are warm." (A cold start had spent 1.1–1.6 s booting CPython-WASI before the game began.)

**How to apply:** Readiness is engine state, one `runtimeReadiness` row per language (`warming | ready | failed` + reason, keyed by the runtime version); rules in `convex/lib/sandboxes.ts`, writes only through `runtime/readiness.ts ensure`/`settle`, boots only in the scheduled `runtime/warm.ts`. Never call the runtime from a start or any player-awaited path to "check" it: use `ensureSandboxes` (static: deployed and not just failed). Validate, summon and run_code answer a typed `notReady` (not receipted); AI seats wait; the tick skips unready languages' agents; planning holds past its deadline until every allowed language is ready, so world time starts for everyone at once (fairness). A new runtime needs only an entry in game-core LANGUAGE_SPECS and, if it has a stored bundle, `RUNTIME_ASSETS` in `runtime/node.ts`.
