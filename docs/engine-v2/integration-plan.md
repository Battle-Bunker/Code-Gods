# Engine v2: integration plan, from the core packages to a working app (14 November 2026)

Status: the plan to build from. It follows the owner's instruction of 14 November (below), the decisions in
[owner-decisions.md](owner-decisions.md), the contracts in [spec.md](spec.md) and the lessons in
[ux-lessons.md](ux-lessons.md). Where this plan changes the spec's build plan (§14), §5.6 says how. Where it guesses, it
says "guess".

The owner, verbatim: "I want you to be planning from now to integrate the new engine into the UI we already have, with
augmentations for a more general annotations system and multiple representations per object. The UI code isn't
precious but the UX optimisation work it carries is and I also suspect it will make sense to keep most of the UI code. I
want you to plot the path all the way to a working GUI app with all existing functionality and linear equation objects
first followed by grids. Don't bother migrating integers and strings yet. I might want to abandon those in favour of
richer and more technically specific types going forward."

## 0. The plan on one page

1. **The app stays; its data source changes.** v2 games are played in today's app: the same site shell, room page,
   dock, panes, phone layout, palette and assistant pane. The spec's separate `/v2` page tree (§1, PR 11) is replaced by
   v2 **routes** (`/v2/rooms/:id`, `/v2/rooms/:id/games/:gameId`) that render the **same page components** with a v2
   data source. At M5 the prefix goes and the routes become the only ones.
2. **The seam is the SDK hook layer.** Panes read the engine only through `src/sdk/hooks.ts` (383 lines, ~25 hooks) and
   commands through `src/core/game/runner.ts`. v2 gets `src/sdk2/`: the same hook names, v2-native types, over new
   narrow v2 queries. A pane moves to v2 by changing its imports, plus edits where a field's meaning changed. The pane's
   JSX, wording and UX fixes stay.
3. **The old panes are frozen, not adapted.** Before the first pane moves, today's engine-coupled panes are copied
   verbatim to `src/legacy/` and the v1 game screen points there. Nobody adapts v1 data to v2 shapes or the reverse;
   `src/legacy/` gets no features and is deleted at M5. This costs one mechanical PR and saves every adapter in the
   v1 direction.
4. **Objects are drawn by `lib/v2-views`**, a new package of scene renderers (one per scene kind, never per rule), a
   marks layer driven by the rule's recorded terms (the general annotation system), and three object faces: **chip**
   (one line of text), **compact** (the primary representation, about 160 × 100) and **expanded** (every representation
   in the rule's `depends`, switchable and comparable, cross-highlighted by meaning). It replaces `lib/object-views` for
   v2 games.
5. **The server is copied and cleaned into `artifacts/engine/convex/v2/`**, with `v2*` tables; auth, users,
   credentials, OAuth, AI templates and the sandbox's runtime assets are shared because they are infrastructure, not
   engine data.
6. **Five workstreams** run in parallel after the core packages merge: W1 core, rules and valuation; W2 sandbox, agent
   host and starter agents; W3 Convex v2 server; W4 views and annotations; W5 the app. Their interfaces are frozen in
   small contract PRs (§5.1).
7. **Milestones:** M1 a line game end to end on the server with scripted agents; M2 the app shows and plays a line game
   with the new annotation and representation views; M3 the full inventory on lines, persona walks passed, v2 the
   default; M4 grids on the v2 contracts, beginner pool recalibrated, same UI; M5 the old engine removed.
8. **Dropped or deferred:** integers and strings (owner), paid looks, bidding, tiers (replaced by v2 ladders), hold
   rarity and defence goals (spec §8), disclosure noise, user-saved setups (replaced by deployed presets), the playing
   card boards. Each with its reason in §1.

---

## 1. Inventory of existing functionality

Legend: **=** carried over unchanged · **D** carried over with a new data source (sdk2 or a v2 query) · **R** redesigned for
v2 (how) · **×** dropped or deferred (why). The milestone where it lands on v2 is in brackets.

### 1.1 Accounts, site and access

- [ ] **=** Sign-in (Better Auth, Google, the local "fake" provider), sign-in gate on every path, error boundary per page (M2).
- [ ] **=** Avatar menu, connected apps sheet, credentials list and revoke (M2).
- [ ] **=** Device flow (`/device`) and MCP/OAuth connect (`/connect`) (M3; the tools behind them are R, §1.7).
- [ ] **=** Auto-update (`version.current`) and static hosting (M2).
- [ ] **=** Command palette (ui-kit) and site commands; v2 commands added to the catalogue (M2, completed M3).
- [ ] **=** Admin rights by verified e-mail; AI player library `/admin/agents` (shared `aiTemplates` table) (M3).
- [ ] **R** Rule gallery `/rule-gallery[/:family]`: pages generated from the v2 object-type registry: card sentence, the
  goal card's worked example, the ladder, the dealable parameters; no server (M3).
- [ ] **D** Home: your rooms, create, join. Lists v2 rooms beside v1 rooms until M5 (two skeleton queries) (M2).

### 1.2 Rooms, seats and setups

- [ ] **D** Room page (`site/pages/room.tsx`, 286): code, owner, next-step button, players, chat, next game, past games
  (M2). "Invitations" are short codes: unchanged.
- [ ] **D** Join by code, leave, spectate toggle, ready (M2).
- [ ] **D** Creating a room seats the creator (ux 1.1) (M2).
- [ ] **D** Practice partners for every owner: one press fills empty seats; the partner summons its rule's starter
  agent once (ux 1.1, 1.2) (M2: needed for the first scripted e2e; the practice partner is the M1 scripted agent).
- [ ] **D** Model-backed AI seats, admin only, with quotas (M3).
- [ ] **D** Public chat (M2) and chat history (M3).
- [ ] **D** Owner controls: start, "Start the world now" with its visible answer (ux 1.7), end the game, resume (M2).
- [ ] **R** Setups and settings. Today: `configure.tsx` (698) + `settings-form.ts` (371) edit a large `GameSettings`,
  users save setups (`gameSetups`), Lab setups for admins. v2: a room picks a **preset** (deployed code, decision 7):
  `Lines · beginner` (line-z, the beginner family pool, 60 s planning, 5 min, 600 starting energy), `Lines · rational`
  (line-q), `Lines · four lines` (line-z4) and later `Grids · beginner`; the owner may change the few room settings
  (length, planning, seats, starting energy, power). Lab presets (admin only) are variants and price lists under trial.
  The configure page keeps its layout and loses most of its fields (M3). User-saved setups: **×** deferred; presets are
  enough while the engine is moving (guess: nobody but the owner saved setups).
- [ ] **D** Setup picker with the Lab group for admins (M3).
- [ ] **D** Past games list and the replay link (M3).

### 1.3 Planning and the first agent

- [ ] **D** Planning phase: 60 s, the planning line in the header, "Start the world now" (M2).
- [ ] **R** "Summon my first agent": opens the forge holding the player's rule's **starter** (W2 ships a Simple and a
  Thorough starter for every dealable family, in TypeScript and Python, each with one "Try this:" comment; ux 1.3, 3.1);
  summons in one press without a check first (M2).
- [ ] **D** Every starter payable from starting energy during planning; the god's store can still pay for the dearest
  starter after the first summon. Both are tests over the real summon prices of the real starters (ux 1.4, 1.5) (M2).
- [ ] **D** First agent's power share ≈ 70% with the explaining sentence (ux 3.7) (M2).
- [ ] **D** After an accepted summon nothing offers "Summon my first agent" (ux 1.8); the summon message says what
  happened and links to My agents (ux 1.9) (M2).

### 1.4 The forge (agent code)

- [ ] **D** Code editor with language choice (TypeScript, Python), examples and "Other starting points" as Replace (ux
  3.4) (M2 summon/replace; M3 the rest).
- [ ] **R** Check (today "validate", 10–100 s under load, never solved: ux 7.4). v2: `check` compiles, prices the
  program, and runs **one act** against a sample object in the sandbox with the host channel and the act's normal step
  budget; it reports the queries made, their read bits, the calls returned and their quoted price. It never blocks
  Summon (ux 1.3). Target: under 3 s on an idle deployment (guess; measured in M3).
- [ ] **D** Replace as one command: same agent, name, share and stored energy; price from the god's store; the message
  says so (ux 3.2, 3.3) (M2).
- [ ] **D** Put back the previous version in one press, with the frozen before/after comparison ("Before your change:
  +21 points a move. Since: +1") (ux 3.5). Data: per program version stats (`v2AgentPrograms`, §4.2) (M3).
- [ ] **D** Destroy, with what comes back (ux 3.8) (M2).
- [ ] **R** The "board facts" and mutator names the starters print come from v2-linear (mutator titles, element
  labels), not game-utilities (M2).

### 1.5 Economy

- [ ] **D** Power, power shares (allocatePower), energy accrual, capacity, debt capped at a full store, re-allocation
  loses nothing (`lib/v2-economy`, copied and cleaned from `game-core/energy.ts`) (M1 server, M2 UI).
- [ ] **D** My agents pane (`agents.tsx` 425, `energy-capacity.ts` 214, `agent-labels.ts` 125): energy "about 0 ⚡"
  wording, full-store wording, acts, spend, skips, failures (ux 3.9) (M2).
- [ ] **R** Act cost display: v2's act charge is `R/κ + W + βW²` (spec §6.1); the agents pane's "breakdown" shows reads and
  changes in those terms, in ⚡ (M2).
- [ ] **D** Header: phase pill, clocks, own energy, own total always visible, on the phone too (ux 2.5) (M2).

### 1.6 Seeing objects and scores

- [ ] **R** Objects pane (`objects.tsx` 434): virtualised rows; each row a **compact face** (§3) instead of a grid
  thumbnail; the payoff rectangle (width = your ✨ rarity, height = how much the others want it, area = your points;
  ux 2.8) unchanged; sort by points, rarity, want, newest; the noun is "line" (ux 2.8) (M2).
- [ ] **R** The object popover: the **expanded face** with every representation the rule depends on, switching and
  comparing (§3) (M2).
- [ ] **R** "Why?" on a row (`object-why.ts`): from the annotation's terms and the ladder: "rung 5 of 8: the tank empties
  1/3 of a minute after minute 3" (M2).
- [ ] **R** Act log, "What just changed" (`feed.tsx` 103, `score-line.ts` 390, `score-lines.tsx` 147): one line per move
  of the player's own agent: which representation changed and how ("gradient 3 → 5"), rule score before → after in
  plain words, ✨ rarity before → after with its reason, points before → after with the want, both values when the want
  changed, and "because the others want this line less now" when points move against the score (ux 2.2, 2.3). Data:
  `v2Moves` rows written by the tick (§2.3) (M2).
- [ ] **R** Goal card (`goal-card.tsx` 80, my-card pane): card sentence, the worked example as an annotated compact face
  with "point at a part to see why", the ladder as "steps to the top" with ✨ rarity per rung, the parts named "(main
  part, tie-breaker)" (ux 2.6) (M2).
- [ ] **D** "Your points now" explained before the first agent exists (ux 2.4) (M2).
- [ ] **R** What-if pane (`what-if.tsx` 73): pick a mutator and an argument, see the resulting line, its rule score and
  rarity, and the call's price, all computed in the browser with v2-linear; no server (M3).
- [ ] **D** Others-care scatter (`others-care.tsx` 75): from a per-player digest written by the tick (M3).
- [ ] **D** Bits over time, renamed "Your points over time" (`bits-over-time.tsx` 41): from the standings history (M3).
- [ ] **D** Leaderboard and race (`race.tsx` 76): standings and standings history (M2 standings, M3 race).
- [ ] **D** Overview, "Where am I" (`overview.tsx` 95): next step, totals (M2).
- [ ] **D** Rules pane (`rules.tsx` 62): the room's preset and economy in words (M3).
- [ ] **D** Observation is free and exact (ux 2.7); no noise anywhere in v2 (spec §8) (M2).

### 1.7 After the game, AI and tools

- [ ] **D** Results (`results.tsx` 144): "You finished 1st of 3 with N points", best line, charts with the "points rise and
  fall" caption and no negative padding (ux 2.9) (M2 headline, M3 charts).
- [ ] **D** Rule rotation across replays and running totals per seat (`lib/dealRotation.ts`, rotation note) (M3).
- [ ] **R** Replay (`core/replay/*`, 983 lines): the controller folds `v2Events` (spec §9.2) and answers the sdk2 hooks
  at the playhead, so every pane works in replay unchanged; after the end every player's rule is open, so the expanded
  face can show **any** player's annotation (new), and replay events show points changes (never solved, ux 7.6) (M3).
- [ ] **R** In-client assistant (`core/chat/*`, 1,153 lines): pane, queue, modes and chips stay; its tools are the v2
  tool set (§4.4): explain my rule, read a line in a representation, write and check my agent, summon/replace, propose a
  pitch to another player (spec PR 12) (M3).
- [ ] **R** MCP server, OAuth, CLI (`pnpm player`): same transport and auth, v2 tools from a new `lib/v2-client`
  (protocol, tool registry, CLI) (M3).
- [ ] **D** `run_code` and the code-output pane (code tables are generic); v2 datasets are the game's own events (M3).
- [ ] **R** Stored panels and the panel SDK: the bridge exposes the sdk2 hooks as `@sdk` version 2; v1 panels do not load
  in v2 games (the frame says so); the example panels are rewritten for v2 (M3).
- [ ] **D** Spectators (`game-panels.tsx` 224): standings, objects (states only, drawn in a default representation
  since a spectator holds no rule), chat (M3).
- [ ] **D** Phone layout: stacked panes, ≤ 45% list height, short code box, stacked primary buttons, status lines brought
  into view (ux §5); the expanded face stacks representations as tabs below 768 px (M2, walked in M3).
- [ ] **D** Failure isolation: per-pane boundaries, no retries, the play screen routed on the header it already has (ux
  §4) (M2).
- [ ] **D** Dock: layouts per room (copied table), presets per phase, pane search, "which pane it replaced" (ux 5.4) (M2).

### 1.8 Dropped or deferred, with the recommendation

| Feature | Decision | Why |
|---|---|---|
| Integer and string objects | **×** deferred (owner) | "I might want to abandon those in favour of richer and more technically specific types." Their renderers stay in `src/legacy/` until M5 and then go. |
| Paid looks (`look`, `knowledge.ts`, `observer.ts`, stale boards, `knowledgeLog`) | **×** dropped | Walks: paid looks cost attention and sped nobody up (ux 2.7). v2 already prices what agents read (spec §6.2); human observation is free and exact. |
| Bidding (`bidding.tsx` 302, `roomBids`, `gameAuctions`) | **×** deferred past M4 | It answers single-game fairness, which is undecided (design-explorations "Decisions waiting" 1). Rotation is the fairness mechanism kept. If revived, bids are on rule keys and handicaps are points multipliers; nothing in v2 blocks it. |
| Tiers (★ bonus, gates, `card-tiers.ts`, `ruleTiers`) | **R** replaced by ladders | A v2 rule's score is a tuple of laddered components (main part, tie-breakers; rule brainstorm B §0). The ★ gate is a rung; the goal card's "steps to the top" is the ladder. No tier tables. |
| Hold rarity, defence goals | **×** (spec §8) | Not in v2's first version. |
| Disclosure noise (`peerNoiseBits`) | **×** | Already off on the beginner setup; it read as a bug (ux 2.7). |
| Playing-card and glyph boards (Master 7×7 cards, colour boards) | **×** deferred past M4 | M4 ports the beginner digit grid only. Other grid variants are new variants of `v2-grid` when wanted. |
| User-saved setups | **×** deferred | Presets in code (decision 7) until the engine settles. |
| `examinationRuns` cache, futility tracking, `futileActs` | **R** | v2's check is one act; futility is visible in the act log (skips) and needs no table. |
| Calibration tables, `/api/calibration`, on-demand calibration | **R** | Committed artefacts (spec §7.6) imported by the server; the browser receives only the viewer's ladder with rung rarities. |

---

## 2. The seam

### 2.1 Where the UI meets the engine today

- **Queries:** `useLive` (52 sites) and `useQuery`/`useQueries` against `api.*` from
  `@workspace/engine/convex/_generated/api`. Game data goes through `src/sdk/hooks.ts` and `src/sdk/transport.ts`, whose
  `QUERY_REFS` allowlist is: `player.{observation, events, myUtility, trajectories, objectsPage, objectIds, object,
  objectsTop, objectRank, totals, staleCount}`, `dock.{state, agents, transformations, agentSeries}`,
  `games.{standings, standingsHistory}`, `rooms.{chat, get}`. The replay controller and the stored-panel bridge answer
  the same names.
- **Site queries outside the SDK:** `rooms.get` (10 sites), `games.header`, `games.instance`, `player.game`,
  `owner.settings`, `setups.*`, `rooms.history`, `bidding.*`, `assistant.*`, `layout.current`.
- **Commands:** `commands.submit` (action, protocol v3 envelope: validate, summon, replace, destroy, allocatePower,
  look, ready, pause, chat) through `core/game/runner.ts` (224); owner commands through `owner.*` and `rooms.*`
  mutations (`core/game/owner.ts` 78, `site/components/layout.tsx` 334).
- **Types:** `Observation`, `LiveObject`, `MyAgent`, `Standing`, `Instance`, `Economy` (player-client `protocol.ts`);
  `ObjectValue = number | string`, `ObjectContext` (object-views); `instantiate`, `parseGridForDisplay`, `applyCalls`
  (game-types); energy maths and settings (game-core); `explainer`, `ruleScoreWording`, example agents
  (game-utilities); `GameRecord` (engine `lib/projection`).
- **The browser evaluates the viewer's rule** in `sdk/evaluator.ts` (65), a mirror of the engine's scoring, with
  calibration tables fetched from `/api/calibration`. In v2 this mirror disappears: v2-linear is the one implementation
  (spec §0.1) and the bits come from the server.

### 2.2 The v2 seam

**Commands.** One action, `v2/commands.submit`, with a v2 envelope from `lib/v2-client/protocol.ts`:
`{ protocol: "code-gods.v2", requestId, gameId, command }`, where `command` is one of `check {language, source}`,
`summon {language, source, name, share?}`, `replace {agentId, language, source}`, `destroy {agentId}`,
`allocatePower {shares}`, `ready`, `pause`, `chat {text}`. Receipts as today (`v2Receipts`, idempotent by requestId).
Owner commands: `v2/owner.command {roomId, op}` with `op` one of `create`, `settings {preset, overrides}`, `start`,
`startWorldNow`, `end`, `fillPracticePartners`, `addAi`, `removeAi`, `resume`. `check` is the only command that runs
the sandbox before answering; it is the reason `submit` is an action.

**Subscriptions** (every one requires sign-in, reads one document or one index page, and gets an R8 row):

| Query | Reads | Hot? | Serves |
|---|---|---|---|
| `v2/rooms.list {paginationOpts}` | members `by_user` page | cold | home |
| `v2/rooms.get {roomId}` | room + ≤ 16 members (bounded) + current game header | cold | room page, header |
| `v2/rooms.chat {roomId, paginationOpts}` | `v2Chat by_room` page | on message | chat |
| `v2/rooms.history {roomId, paginationOpts}` | `v2Games by_room_phase` page | cold | past games |
| `v2/games.header {gameId}` | 1 `v2Games` | cold (phase changes) | router, header, timers |
| `v2/games.standings {gameId}` | 1 `v2Standings` | each scoreboard (≤ every 10 s) | header total, leaderboard |
| `v2/games.standingsHistory {gameId, after}` | `v2StandingsHistory` page | append | race, points over time, results |
| `v2/play.myRule {gameId}` | the viewer's `v2Rules` row (family, params, card, ladder with rung rarity) | cold | goal card, faces, what-if |
| `v2/play.me {gameId}` | the viewer's `v2Players` row (energy, power, ready, pauseUsed) | hot, 1 doc | header, agents |
| `v2/play.objectIds {gameId, sort, paginationOpts}` | `v2ObjectValues by_game_player_<sort>` page | page changes | objects skeleton |
| `v2/play.object {objectId}` | `v2ObjectStates` (shared state) + viewer's `v2ObjectValues` | that object changes | one row / face |
| `v2/play.agents {gameId}` | viewer's `v2Agents` (≤ 20, bounded) | cold | agents, forge |
| `v2/play.agentEnergy {agentId}` | 1 `v2AgentEnergy` | hot | one agent row |
| `v2/play.agentPrograms {agentId}` | `v2AgentPrograms by_agent` (≤ 20) | per act of that agent | put back comparison |
| `v2/play.moves {gameId, paginationOpts}` | `v2Moves by_game_player_seq` page | on a move that concerns the viewer | act log |
| `v2/play.digest {gameId}` | 1 `v2Digests` row | when the viewer's values change | others-care scatter |
| `v2/spectate.objectIds`, `v2/spectate.object` | `v2Objects by_game` page; 1 `v2ObjectStates` | — | spectators |
| `v2/layout.current {roomId}` | 1 `v2Layouts` | on layout change | dock |
| `v2/replays.stored {gameId}` + `GET /api/v2/replay/<room>/<game>` | file of the folded events, written once at the end | — | replay |

This adds four tables to spec §10 (`v2Moves`, `v2StandingsHistory`, `v2AgentPrograms`, `v2Digests`), one per-viewer
sort index family on `v2ObjectValues`, and two cold fields on `v2Rules` (card sentence and the ladder's rung rarities);
§4.2 gives them.

### 2.3 Why `v2Moves`

The act log's line needs, for the viewer, the score, level, rarity, want and points before and after a move, and the
calls made. Folding `v2Events` for that in a query breaks R2 and R4; recomputing in the browser needs other players'
values, which never reach it. So the tick, which holds all of it, writes one small private row per (move, player
concerned): the player whose agent acted, and every player whose points on that object changed by more than 0.05.
Rows: `{gameId, playerId, seq, objectId, agentId?, mine, calls (wire), rep (the representation of the first call),
stateBefore, stateAfter (wire), score/level/rarity before and after, want before and after, points before and after,
charge?}`. The browser renders the line from the row and v2-views (the two states give the "gradient 3 → 5" diff).

### 2.4 The adapter strategy, module by module

`src/sdk2/` implements the same hook names as `src/sdk/hooks.ts` where the concept survives (`useGame`, `useMyAgents`,
`useLeaderboard`, `useStandingsHistory`, `useChat`, `useRoomInfo`, `useActions`, `useDockState`, `useObjectIds`,
`useMyObject`, `useMyTotals`, `useTransformations` → renamed `useMoves`), plus `useMyRule`, `useObjectState`,
`useAnnotation(state)`; it drops `useEvaluator`, `useTrajectories`, `useObservation`, `useStaleCount`, `useMutators`.
Types are v2-native, defined in `lib/v2-client/types.ts`. A `GameEngineContext` (`"v1" | "v2"`) set by the route picks
`src/legacy/*` or the main panes.

| Module (path, lines) | v2 treatment |
|---|---|
| Site shell, routing, sign-in (`core/app.tsx` 182, `core/routes.ts` 68, `site/lib/routes.ts` 49, `site/pages/sign-in.tsx`, `not-found.tsx`) | keep; add `/v2/...` patterns pointing at the same pages with `engine="v2"` |
| Site layout (`site/components/layout.tsx` 334) | keep with adapter: room/owner actions go through a `useRoomActions(engine)` hook with v1 and v2 implementations (~80 lines each); remove the `setObjectRenderer("Grid")` toggle for v2 |
| Home (`home.tsx` 74) | keep; second list from `v2/rooms.list` |
| Room page (`room.tsx` 286, `next-step.ts` 137, `room-seats.ts` 61, `rotation-note.tsx` 27) | keep with adapter: `useRoomModel(engine)` returns the room, members, settings summary and next step; v2 implementation ~120 lines |
| Configure (`configure.tsx` 698, `settings-form.ts` 371) | rewrite for v2 (~250 lines): preset picker plus the few overrides; v1 file to legacy |
| Setup picker (`setup-picker.tsx` 154) | keep with adapter: options from `lib/v2-linear` presets (code, no query) |
| Bidding (`bidding.tsx` 302, `site/lib/bidding.ts` 196) | legacy only (deferred) |
| Game page router (`site/pages/game.tsx` 263) | keep with adapter: header from `v2/games.header`; picks Play, Spectate, Replay as today |
| Dock (`dock/*`, ~1,800 lines: shell, store, layout-sync, desktop, stacked, adapter, headers, operations, history, panel-search) | keep; layout types from `lib/v2-client/layout.ts` (a copy of player-client's 507-line `layout.ts` and 215-line `panels.ts` with v2 panel ids); `layout.current/set` → `v2/layout.*` by engine |
| Header (`core/header.tsx` 206, timers, planning line) | keep, imports to sdk2 |
| Overview (`overview.tsx` 95, `next-step.ts` 56) | keep, imports to sdk2 |
| My agents (`agents.tsx` 425, `agent-labels.ts` 125, `energy-capacity.ts` 214, `power-share.ts` 27) | keep with edits: energy maths from `lib/v2-economy`, act cost breakdown in v2 terms (~60 changed lines) |
| Forge (`forge.tsx` 661, `first-agent.ts` 483, `use-previous-version.ts` 34, `validation-text.ts` 48) | keep with edits: starters from `lib/v2-agents/starters`, check report rewritten (~150 changed lines), put back unchanged |
| Objects (`objects.tsx` 434, `payoff-geometry.ts` 64, `object-why.ts` 28) | keep the list, sort, rectangle and virtualisation; row body → `<CompactFace>`; paid-look parts removed (~120 changed lines) |
| Act log (`feed.tsx` 103, `score-line.ts` 390, `score-lines.tsx` 147) | rewrite `score-line.ts` as `move-line.ts` (~250) keeping its sentence templates and tests' cases; `feed.tsx` keeps its frame |
| Goal card, my card (`goal-card.tsx` 80, `my-card.tsx` 48, `object-editors.tsx` 127, `object-editor-model.ts` 72) | rewrite on `<GoalCard>` from v2-views; editors become the what-if's call picker |
| What-if (`what-if.tsx` 73) | rewrite (~150) on v2-linear in the browser |
| Others-care, bits over time, race (`others-care.tsx` 75, `bits-over-time.tsx` 41, `race.tsx` 76, `sdk/charts.tsx` 253) | keep, sdk2 |
| Results (`results.tsx` 144, `results-rank.ts` 21) | keep; noun and best-line face from v2-views |
| Rules (`rules.tsx` 62) | keep with edits: preset and economy text |
| Public chat, code output, timeline (`public-chat.tsx` 60, `code-output.tsx` 94, `timeline.tsx` 30) | keep |
| Assistant pane (`core/chat/*` 1,153) | keep; tool detail views gain v2 tool names (`tool-detail.ts` 253) |
| Palette (`core/palette/*` 581) | keep; v2 commands registered by engine |
| Replay (`core/replay/*` 983, player-client `replay.ts` 637) | rewrite the reducer (~300, folding `v2Events`) and the controller's answers (~200); parts.tsx keeps its UI |
| Stored panels (`shell/*` ~775, `frame/*` 267, `sdk/bridge-protocol.ts` 107) | keep; the bridge's `QUERY_REFS` becomes per engine; example panels rewritten |
| Spectator (`game-panels.tsx` 224) | keep with adapter; rows → `<CompactFace>` without a rule |
| SDK (`sdk/*` ~1,700) | v1 stays as is for legacy; new `sdk2/*` (~700) |
| `lib/object-views` (3,046) | not used by v2; `colour-science.ts`, `dimensions.ts`, `product.ts` and the wording of `rarity.ts` are copied into v2-views |
| `lib/ui-kit` (1,024) | keep; its type imports from player-client move to its own `types.ts` (one PR) so v2 code can use it without importing player-client |

Rough total: about 26k lines in player-web; about 17k kept as they are or with import edits, about 3k kept with
targeted edits, about 2.5k rewritten, the rest (v1-only parts, ~3.5k) frozen in `src/legacy/` and deleted at M5.

---

## 3. The new UI parts: annotations and representations

### 3.1 What a renderer gets

The browser holds the object's state (from `v2/play.object`), the viewer's rule (from `v2/play.myRule`) and the variant
(by id from the v2-linear registry). `v2-views` computes everything else locally:

```ts
// lib/v2-views/src/annotate.ts: pure, unit-tested under Node, no React
export interface Annotation {
  evaluation: Evaluation;                 // v2-core evaluate(rule, state): score, terms, marks, reads
  parts: Part[];                          // one per score component, in order: main part, tie-breakers
  rung: { level: number; top: number; rarity: number; nextRarity?: number }; // from the ladder in v2Rules
  improvement: Improvement | null;        // the nearest improvement (below), or null when at the top or none is cheap
}
export interface Part {
  name: string;                           // "main part", "tie-breaker" (ux 2.6), or the family's own label
  term: TermId; value: Q | Undef; sense: "max" | "min";
  rung: number; rungs: number;            // this component's place on its own ladder (rule brainstorm B §0)
  sentence: string;                       // "the tank empties 1/3 of a minute after minute 3"
  marks: Mark[];                          // the marks that cite this part's terms
}
export interface Improvement {
  calls: Call[]; price: number;           // ⚡ at the viewer's prices (spec §5.2)
  before: Score; after: Score; levelAfter: number;
  sentence: string;                       // "tilt by −1 (7.2 ⚡): the tank empties at minute 4 exactly"
}
export function annotate(rule: DealtRule, ladder: LadderView, state: S, variant: Variant): Annotation;
export function nearestImprovement(rule, state, variant, budget = { evaluations: 2000, maxBits: 16 }): Improvement | null;
```

- **Per-rung contributions** are the `parts`: each score component is a recorded term (spec §4.2) put on its own ladder,
  so the card shows "main part: rung 5 of 8, tie-breaker: yes". The marks a part owns are those citing its term.
- **Dynamic elements** (nearby primes with distances, the point at x = q, the nearest whole minute) are whatever the
  family reads through `EvalContext.read` with arguments and cites in `candidate` and `measure` marks; the marks layer
  adds them to the scene. No family-specific UI code exists.
- **Nearest improvement** enumerates single calls in ascending price (each mutator's arguments up to `maxBits`), applies
  them with v2-linear, evaluates the rule, and returns the cheapest call that raises the level (or, failing that, the
  main part's distance). It is the goal card's "next step" and the expanded face's hint. It needs one addition to the
  contract: `ArgCode.enumerate(maxBits): Iterable<A>` (§5.6). It is never sent to the server and never shown for other
  players' rules.
- **Never disagreeing:** the parts and marks are the recorded terms; there is no second computation (spec §4.2). The
  server's level for the viewer (`v2ObjectValues.level`) is compared with the browser's in a dev-mode assertion and in
  the M2 e2e test.

### 3.2 The renderer contract

```ts
// lib/v2-views/src/scene.ts
export type FaceSize = "chip" | "compact" | "expanded";
export interface SceneRenderer<K extends SceneKind> {
  kind: K;
  box: Record<Exclude<FaceSize, "chip">, { w: number; h: number }>;  // compact ≈ 160×100; expanded ≈ 320×220
  render(props: {
    scene: Extract<SceneData, { kind: K }>;           // rep.layout(state, site)
    values: (ref: ElementRef) => ElementValue;        // the element values for this state
    marks: readonly Mark[];                           // only marks whose refs belong to this representation
    terms: ReadonlyMap<TermId, Term>;                 // for measure labels
    size: Exclude<FaceSize, "chip">;
    before?: (ref: ElementRef) => ElementValue;       // a previous state: changed elements are emphasised
    highlight: MeaningKey | null;                     // cross-highlight (spec §11.3)
    onHover(ref: ElementRef | null): void;
  }): ReactElement;
  anchors(scene, size): ReadonlyMap<string, Rect>;    // where each element (and mark) sits: callouts, tests, arrows
  text(scene, values, before?): string;               // the plain-text form: chips, act log, screen readers, assistant
}
```

One renderer per scene kind: `equation`, `plane`, `table`, `sequence`, `machine`, `pegboard` (lines) and `grid` (M4). A
static-markup test renders every representation of every family over a corpus of states and checks that every mark's
element produced a node and that `text()` mentions every coordinate.

### 3.3 Components

| Component | What it is | Where it sits |
|---|---|---|
| `<ObjectChip>` | `text()` of the primary representation: "y = −3x + 10" | act log lines, palette, results lists |
| `<CompactFace>` | the primary representation's scene, the rule's marks, the ✨ rarity and the level ("5/8") | objects rows, spectator rows, goal card example, results best line |
| `<ExpandedFace>` | every representation in the rule's `depends`, side by side (desktop) or as tabs (phone); the parts list (one box per part, sorted gains first, as `GoalBoard` does today); the worked computation from the terms; the nearest improvement | the object popover, replay inspector, the my-card pane's example |
| `<RepSwitcher>` | tabs of every representation the variant has (not only `depends`), with the rule's own marked; "compare" pins two side by side | inside `ExpandedFace` |
| `<MeaningHighlight>` | context: hovering an element highlights every element with the same meaning in every shown representation | `ExpandedFace`, goal card |
| `<PartsList>` | one box per part with its sentence and rung; two-way linked to marks (hover a box, its marks light; hover a mark, its box scrolls into view), the interaction model of `annotations-design.md` §3 kept | `ExpandedFace`, goal card |
| `<LadderView>` | "steps to the top": rungs with their ✨ rarity, the current rung marked | goal card, expanded face |
| `<MoveLine>` | one act log line from a `v2Moves` row (§2.3): the changed representation before → after, then the score, rarity and points sentence | act log, replay timeline |
| `<GoalCard>` | sentence, worked example (an `ExpandedFace` on an example state), ladder, "Try this" next step | my-card pane, rule gallery, forge's side panel |
| `<CallPicker>` | the variant's mutators grouped by representation, with argument input and live price | what-if pane |

**Primary versus parallel.** Compact contexts always show one representation: the rule's `primary`, unless the viewer
pinned another in the switcher (kept in localStorage per family; a per-viewer convenience, not server data). The
expanded face shows the rule's `depends` in their order; the switcher reaches the rest. For a spectator or a replay
viewer without a rule, the primary is the variant's first representation (`si` for lines, `cells` for grids).

**Phone.** Compact faces keep their size (rows stay at the current grid row height); the expanded face becomes tabs
below 768 px with the parts list under the scene; the popover becomes a bottom sheet like the assistant's.

### 3.4 Storyboards: a line under a two-rung beginner rule

The rule, for illustration (guess: the first beginner pool is chosen from the calibration report, and rule brainstorm B's
"Empty Tank" trimmed to two parts is a plausible member): **Empty Tank, beginner**, variant `line-q`. Card: "Your line is
a draining water tank: it starts with c litres and loses −m litres a minute. Make it run out at a whole minute; a prime
minute is even better." Main part: the distance from the emptying time T = −c/m to the nearest whole minute N, on the
ladder `d ≤ 8, 4, 2, 1, ½, ¼, ⅛, 0` (8 rungs). Tie-breaker: whether N is prime (2 rungs). Primary representation
`cart`; depends `cart, si, table`. The object is y = −3x + 10 (T = 10/3, N = 3, d = ⅓, rung 5 of 8; 3 is prime).

**On the goal card (my-card pane, planning).** Top: "🛢 Empty Tank" and the card sentence. Under it the worked example,
a compact plane: the line from (0, 10) falling to the x-axis, the water under it shaded; the x-intercept dot at 3⅓; a tick
on the x-axis at 3, bold, with a bracket "⅓ min" between the tick and the dot; a faint tick at 4 with "⅔". Beside it the
parts list: "Main part: runs out ⅓ of a minute after minute 3 — step 5 of 8" and "Tie-breaker: 3 is prime ✓". Under
both, the ladder: eight steps, the fifth lit, each with its ✨ rarity ("✨ 2.1", … "✨ 6.8" at the top), and the
sentence "Each step up is rarer among random lines; rarer is worth more to you." Last line, the nearest improvement:
"Next step: shift down 1 (6.2 ⚡, guessed price) makes it run out at minute 3 exactly — step 8 of 8." (y = −3x + 9 empties
at T = 3.) Pointing at "Main part" lights the bracket and the dot; pointing at the tick lights the part.

**In the Objects list (a row).** Left: the compact plane, 160 × 100, line, shaded water, the bold tick at 3 and the
bracket; nothing else. Right: "✨ 3.4 · 5/8" and the payoff rectangle (width your rarity, height the others' want, area
your points "12.1"). The row's chip text, for screen readers and the palette: "y = −3x + 10: runs out ⅓ min after
minute 3". A row of a line that is not draining (y = 2x − 6) shows the plane with the sentence in place of the marks:
"this tank is not draining" and "WORST" rendered as "✨ 0 · not scoring".

**Expanded (the popover).** Three panels in the order of `depends`: the plane (as compact, larger, with axes labelled
"minutes" and "litres"); the equation `y = −3x + 10` with −3 and 10 as elements (hovering 10 lights the plane's
y-intercept and the table's y(0) row: the meaning `yIntercept`); the table of values y(0) … y(5) with the row where y
crosses 0 (between x = 3 and 4) bracketed and the note "empty at 3⅓". Under them the parts list and the worked
computation from the terms: "T = 10 ÷ 3 = 3⅓; nearest whole minute 3; gap ⅓ → step 5 of 8. 3 is prime → tie-breaker
met." Then "Compare with…" opens the switcher: `gen` (3x + y − 10 = 0), `int` (x/(10/3) + y/10 = 1, whose p is T
itself: the representation where this rule is easiest to read, which the switcher marks "this is where your goal
lives"), `seq`, `mach`, `peg`. Last, the nearest improvement and its price.

**In the act log.** "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (shifted down 1). It now runs out at
minute 3 exactly: step 5 → 8 of 8. ✨ rarity 3.4 → 6.8 (fewer random lines run out at a whole minute). Points on this line
8.2 → 16.3 (the others want it 2.4)." If the want changed too: "(the others want it 2.1, was 2.4)". If another player's
agent moved it away: "Points on this line 16.3 → 7.9 because Ada's agent moved it: it now runs out ½ minute after
minute 3."

---

## 4. The server path

### 4.1 Principles

- New code under `artifacts/engine/convex/v2/`, new tables prefixed `v2`, nothing imported from game-core, game-types,
  game-utilities, player-client, ai-player or game-runtime (extend the import-boundary test to `convex/v2/**` in the
  first W3 PR).
- **Shared, not copied** (infrastructure, no engine data): `users`, `devices`, `credentials`, Better Auth, `oauthClients`,
  `oauthRequests`, `oauthRetiredRefresh`, `activity`, `aiTemplates`, `aiUsage`, `runtimeAssets`, `runtimeReadiness`,
  `compiledPrograms`, `siteBuilds`, `manifests` (unused by v2), the `migrations` component. Their modules (`auth/*`,
  `agent/oauth*`, `agent/connect.ts`, `agent/store.ts`, `activity.ts`, `aiTemplates.ts`, `version.ts`, `http.ts`) are
  used as they are; `http.ts` gains the v2 routes.
- **Copied and cleaned** into `convex/v2/`: everything engine-coupled, table by table below.

### 4.2 Tables

| v2 table | From | Fields (one document per) | Written by | Notes |
|---|---|---|---|---|
| `v2Rooms` | `rooms` | room: codes, owner, revision, preset id, overrides, current game, preparing | room and owner commands | no settings blob, no AI quota fields on the room (moved to `v2RoomQuotas` if needed) |
| `v2Members` | `members` | (room, player): kind human / practice / ai, name, spectator, userId, ai template | room commands | ≤ 16 per room |
| `v2Chat` | `chat` | message | chat command | |
| `v2Receipts` | `receipts` | command receipt | commands | |
| `v2Games` | `games` | header: room, codes, phase, deadlines, preset, variant key, seed, roster, rotation, summary, replay file | lobby, tick (phase only) | cold |
| `v2Clocks` | `gameClocks` | world seconds, last tick, object and agent counts | every commit | hot; no public query (clients interpolate) |
| `v2Engine` | `gameEngine` | lease, next birth, next batch, failures | the loop | internal |
| `v2Rules` | `deities` (utility part) | (game, player): family, params, artefact hash, card sentence, ladder with rung rarity | deal | private to the player |
| `v2Players` | `deities` (account part) | (game, player): energy, power, allocated, ready, pause used | commands, tick | hot per player |
| `v2Objects` | `objects` (cold part) | object: number, born at | tick | |
| `v2ObjectStates` | `objects` (hot part) | object: state wire, version, changed at | tick | shared by all viewers |
| `v2ObjectValues` | `objectViews` | (object, player): score wire, level, rarity, peer sum, points, version | tick | indexes `by_game_player_points`, `_rarity`, `_want`, `_born` |
| `v2Agents` | `agents` (cold part) | agent: owner, name, language, source hash, current program version, share | commands | |
| `v2AgentEnergy` | `agents` (hot part) | agent: energy, acts, skips, failures, spend, points gained | tick | hot |
| `v2AgentPrograms` | new | (agent, version): source, language, summoned at, acts, points gained | commands, tick | the put-back comparison |
| `v2Standings` | `standings` | game: rows (player, total, rank) | scoreboard | ≤ 8 rows in one doc |
| `v2StandingsHistory` | `standingsHistory` | (game, seq): totals | scoreboard | race, results |
| `v2Moves` | `objectEvents` (projection) | (move, player concerned): §2.3 | tick | the act log |
| `v2Digests` | `objectDigests` | (game, player): packed [object, own rarity, want] | tick | others-care |
| `v2Events` | `tickBatches` + `objectEvents` | event: spec §9.1 | tick, lobby | the record; replay folds it |
| `v2Layouts` | `dockLayouts` | (human, room): layout | layout commands | |
| `v2Assistant*` | `assistant*` | as today | assistant | copied: their keys are v1 room and game ids (guess: typed `v.id("rooms")`; if they are strings, share instead) |
| `v2Panels`, `v2PanelVersions` | `panels*` | stored panel with `sdk: 2` | panel commands | per human |
| `v2WorkSlots` | `workSlots` | background slot | checks, AI seats | avoids widening the old table |

Dropped with no v2 twin: `holdTables`, `examinationRuns`, `roomBids`, `gameAuctions`, `knowledgeLog`, `godTotals`
(standings are exact), `agentSamples`, `futileActs`, `catalogs`, `examinations` (rate limit moves into `v2WorkSlots`),
`gameSetups`, every `calibration*` table.

### 4.3 Functions, area by area

| Area | Today | v2 (file in `convex/v2/`) | Work |
|---|---|---|---|
| Rooms | `rooms.ts` 417, `lib/rooms.ts` 148 | `rooms.ts` (~300): create, list, get, join, leave, setSpectator, setReady, chat, history | copy, drop settings and AI quota fields, drop bidding hooks |
| Owner and lobby | `owner.ts` 388, `game/lobby.ts` 329, `setups.ts` 441 | `owner.ts` (~250): command (settings, start, startWorldNow, end, resume, fillPracticePartners, addAi, removeAi); `lobby.ts` (~200): deal, births at start, header | rewrite around presets; deal draws from the preset's dealable pool, refusing any rule without a converged artefact (spec §7.6) |
| Rotation | `lib/dealRotation.ts` 71 | `rotation.ts` (~70) keyed by rule key | copy |
| Tick | `engine/tick.ts` 393, `engine/loop.ts` 471, `game/state.ts` 84, `lib/world.ts` 227, `engine/background.ts` 107 | `loop.ts` (~350, the lease, watchdog, commit pattern copied), `tick.ts` (~350): births by the birth walk, opportunities and offers (`v2-economy`), acts through the agent host (`v2-agents`), values (`v2-valuation` lookup), standings, events, moves | the commit writes clocks, states, values, energy, moves, events; standings on the scoreboard cadence |
| Energy and power | `lib/power.ts` 46, parts of `game/commands.ts` | `lib/v2-economy` (W3), used by tick and commands | copy and clean `game-core/energy.ts` per spec PR 8 |
| Commands | `commands.ts` 120, `game/commands.ts` 408, `engine/pricing.ts` 214 | `commands.ts` (~150, action), `commandsApply.ts` (~300, mutation) | summon price: the program's code length in bits (copied from game-runtime's `ts-ast-bits.mjs` and `astbits_guest.py` into v2-sandbox) times the economy's price per bit; `check` runs one act (§1.4) |
| Agents and sandbox | `engine/runtime.ts` 273, `runtime/*` ~900 | `runtime.ts` (~250) over `lib/v2-sandbox` and `lib/v2-agents` | copy the batching and pool; one act = offer, host-channel queries, calls |
| Valuation | `engine/node.ts` 326, `engine/calibration.ts` 291, `engine/pinned.ts` 81, `calibration/*` ~900, `engine/hold*` 309 | `values.ts` (~120): artefact lookup by rule key; the game header records each artefact's content hash | no runtime calibration; artefacts are bundled |
| Read models | `game/readModel.ts` 78, `game/objectViews.ts` 185, `lib/views.ts` 55 | written inside the commit (values, moves, digests) and by `scoreboard.ts` (~100) | v2 writes values in the commit, not a scheduled sync: a move changes ≤ 8 rows (guess: fine at 1.5 s ticks; measure in M1) |
| Player queries | `player.ts` 735, `dock.ts` 109, `games.ts` 222 | `play.ts` (~300), `games.ts` (~120), `spectate.ts` (~60) | new, from §2.2 |
| Event log, replay | `lib/projection.ts` 431, `replays.ts` 115 | `events.ts` (~150, append and per-player filtering), `replays.ts` (~100, file at end, HTTP download) | spec §9 |
| Practice partners | `ai/seats.ts` 297, `lib/builtinPlayer.ts` 27 | `seats.ts` (~200): a practice partner summons its rule's Simple starter once, with the first-agent share | copy and clean |
| AI seats (model-backed) | `ai/turn.ts` 213, `lib/ai-player` | `aiTurn.ts` (~150) over `lib/v2-ai` (providers copied from ai-player, prompt rewritten) | M3 |
| Assistant | `assistant.ts` 455, `assistant/*` ~1,800 | copied into `v2/assistant/*`; tools from `lib/v2-client/tools.ts` executed by `v2/agent/registry.ts` | M3 |
| MCP and CLI | `agent/mcp.ts` 164, `agent/registry.ts` 452, `agent/node.ts` 151 | `/mcp` routes by token to v1 or v2 registry by the room the credential is scoped to; `v2/agent/registry.ts` (~300) | M3 |
| Layout and panels | `layout.ts` 252, `panels.ts` 221 | copies over `v2Layouts`, `v2Panels` | M2 layout, M3 panels |
| Test fixtures | `testing.ts` 691 | `v2/testing.ts`: seed a room, deal fixed rules, set energy, insert states | W3's first PR |

### 4.4 The tool set for agents, the assistant and MCP (M3)

`lib/v2-client/tools.ts`, about 25 tools instead of about 60: `get_game` (header, standings, my rule, my energy),
`list_objects` (paged, my values), `read_object` (a representation or element, free for humans), `explain_my_rule`
(card, ladder, annotation of an object), `quote` (price of calls on a state), `check_agent`, `summon_agent`,
`replace_agent`, `destroy_agent`, `allocate_power`, `chat`, `start_game`, `ready`, `list_moves`, panel tools (copied),
`run_code` (copied), `draft_pitch` (a message to another player naming lines both rules like; the negotiation tool of
decision 9). The assistant's prompt teaches the v2 vocabulary (points, ✨ rarity, ⚡ energy, power).

### 4.5 What is switched off when v2 becomes the default (end of M3)

- "Create room" makes v2 rooms; creating a v1 room is an admin-only "Classic engine" option, kept for comparison.
- The setup picker, configure page and bidding for v1 live only on v1 rooms.
- Practice partners, AI seats, assistant and MCP keep serving live v1 games until they end; no new v1 games except by
  admins.
- Crons for v1 calibration prunes and examination caches keep running until M5 (cheap).

---

## 5. The path

### 5.1 Workstreams and their interfaces

| Workstream | Owns | Interface it publishes (frozen in the PR named) |
|---|---|---|
| **W1 Core, rules, valuation** (the spec session) | `v2-core`, `v2-linear`, `v2-valuation`; later `v2-grid` | v2-core types (spec PR 2); line element names (PR 3); artefact JSON (PR 4); **presets and beginner pool** (`v2-linear/presets.ts`, new) |
| **W2 Sandbox, agent host, starters** | `v2-sandbox`, `v2-agents`, starter agents per family, summon price | `runAct(input): ActRecord` and `check(program): CheckReport` (W2-2) |
| **W3 Convex server** | `convex/v2/**`, `v2-economy`, `v2-client/protocol.ts` | **the v2 API contract** (W3-1): table schema, every query's args and return validator, the command envelope; fixtures in `v2/testing.ts` |
| **W4 Views** | `v2-views` | component props of §3.3 and `annotate()` (W4-1) |
| **W5 App** | `player-web` (`sdk2`, routes, legacy freeze, pane moves, e2e), `v2-client` (layout, panels, tools, CLI) with W3 | — |

Pairs: W1→W2 (agent host evaluates rules, prices calls), W1→W3 (deal, values), W1→W4 (contracts, element names),
W2↔W3 (`runAct`, `check`: W2 owns the function, W3 calls it from an action and records its `ActRecord` as an `act`
event), W3↔W5 (the API contract: W5 builds against W3-1's fixtures before the tick exists), W4↔W5 (props: W5 mounts W4's
components and passes subscriptions' data in). W4 never touches Convex; W5 never computes a score.

### 5.2 M1: a line game end to end on the server, played by scripted agents

| PR | Workstream | Contents | Depends on |
|---|---|---|---|
| spec 2–4 | W1 | v2-core, v2-linear first cut, v2-valuation, first artefacts (as the spec) | — |
| spec 6 | W2 | v2-sandbox and the host-channel spike | — (∥ from now) |
| W1-5 | W1 | spec PR 5 (line complete) **plus** `presets.ts` with the beginner pool chosen from the calibration report, `ArgCode.enumerate`, `RuleFamily.examples` | 2–4 |
| W2-1 | W2 | spec PR 7: agent host, queries, quotes, act charge, guest libraries, three example agents | 3, 6 |
| W2-2 | W2 | Simple and Thorough starters for every family in the beginner pool, both languages; summon price; `check`; the price tests of ux 1.4–1.5 | W2-1, W1-5 |
| W3-1 | W3 | **API contract**: `convex/v2/schema.ts`, validators and stubbed queries over fixtures, envelope in `v2-client/protocol.ts`, import-boundary extended, R8 rows (marked pending) | 2 |
| W3-2 | W3 | v2-economy (spec PR 8) | 2 |
| W3-3 | W3 | rooms, owner, lobby, deal, rotation, practice partners | W3-1, W1-5 |
| W3-4 | W3 | loop and tick: births, offers, acts via `runAct`, values, moves, standings, events; commands | W3-2, W3-3, W2-2 |

**Acceptance (M1):** `artifacts/engine/test/v2-game.test.ts` on the local backend: a room with three practice partners
on `Lines · beginner` with planning shortened to 5 s and length to 60 world seconds; every partner summons its starter
(TypeScript for one, Python for two); at least one `committed` act per partner; standings non-zero; the game ends.
`v2-replay.test.ts`: folding the stored events gives the final standings exactly; re-executing the acts from the header
gives the same `act` events (spec §9.3). `v2-disclosure.test.ts`: no v2 query returns another player's rule, score or
value during a live game. `v2-query-cost.test.ts`: every §2.2 query within R8 in a 1,000-object game (object count
raised by a fixture). Starter prices ≤ starting energy for every family in the pool.

**Risks:** the WASI fd-3 host channel (if the spike fails: QuickJS first, Python guests restricted to a pre-read
bundle of all static representations, charged as a full read; decided in spec PR 6); act latency with many host calls
per act inside a 1.5 s tick (measure; cap host calls lower for beginners); too few converged beginner rules (the pool
needs at least six for rotation across three seats; spec §7.8's levers apply); commit size with per-player rows.

### 5.3 M2: the existing app shows and plays a line game

| PR | Workstream | Contents | Depends on |
|---|---|---|---|
| W4-1 | W4 | `annotate`, `nearestImprovement`, parts and sentences, ladder view model; Node tests on a corpus | W1-5 |
| W4-2 | W4 | scene renderers (`equation`, `plane`, `table`, `sequence`, `machine`, `pegboard`), marks layer, cross-highlight; the static-markup test | spec 3 |
| W4-3 | W4 | `ObjectChip`, `CompactFace`, `ExpandedFace`, `RepSwitcher`, `PartsList`, `LadderView`, `GoalCard`, `MoveLine`; a gallery page (`src/gallery/v2.tsx`) with the §3.4 storyboards as fixtures | W4-1, W4-2 |
| W5-1 | W5 | freeze: move v1-coupled panes and helpers to `src/legacy/`, route v1 games there; ui-kit loses its player-client type imports; no behaviour change (the existing e2e passes) | — (can start now) |
| W5-2 | W5 | `v2-client` layout, panels, types; `src/sdk2/` over W3-1's contract; `/v2` routes; room page, home, game router, header, dock on v2 | W3-1, W5-1 |
| W5-3 | W5 | panes on v2: overview, objects (compact faces), popover (expanded), my-card (goal card), act log (`move-line.ts`), agents, forge (summon, replace, destroy, starters), results headline, chat | W4-3, W5-2, W3-4 |

**Acceptance (M2):** `e2e/v2-line-game.ts` (desktop 1440×900 and phone 390×844): create a v2 room, "Play a practice
game", "Summon my first agent" in one press, a scoring move appears in the act log as a full sentence with rarity and
points before → after, the objects row shows a compact face whose marks are present (by test id), the popover shows
three representations and hovering `si.c` highlights `cart.yInt` and `table.y0`, the goal card shows the ladder and a
nearest improvement, the game ends on the results headline; the browser's level equals the server's on every object
the page showed. Existing `pnpm e2e` (multi-client, v1) still passes. Unit tests: `move-line` sentences for the ux 2.2
and 2.3 cases; `annotate` against the terms; renderer markup.

**Risks:** compact clutter at 160 × 100 (W4 decides by mark priority: focus and the nearest candidate only in compact);
v2-linear's bundle size in the browser (expected small); hook-shape drift between `sdk` and `sdk2` making pane moves
bigger than estimated.

### 5.4 M3: the full inventory on lines, v2 the default

| PR | Workstream | Contents |
|---|---|---|
| W5-4 | W5 | what-if (`CallPicker`), others-care, points over time, race, rules pane, results charts, configure on presets, setup picker, spectators |
| W5-5 | W5 + W3 | replay: `v2Events` file, reducer, controller, parts with points changes and any player's annotation |
| W5-6 | W5 + W3 | forge put-back comparison (`v2AgentPrograms`), check report |
| W3-5 | W3 | rotation and running totals on repeat games; model-backed AI seats; quotas |
| W3-6 | W3 + W5 | `v2-client/tools.ts`, `v2/agent/registry.ts`, MCP routing, CLI (`pnpm player` with a v2 room credential) |
| W3-7 | W3 + W5 | assistant on v2 (prompt, tools, pane tool details); stored panels with `@sdk` v2 and rewritten examples |
| W5-7 | W5 | v2 is the default (§4.5); palette and catalogue complete; site smoke on v2 |
| W5-8 | W5 | persona-walk round on v2 (two walks, desktop and phone), fixes, a second round |

**Acceptance (M3):** every checklist item of §1 marked D or R ticked with a named test or walk; e2e suites ported to v2:
`multi-client` (line games instead of Int/string/Grid, three clients, phone), `site-smoke`, `stored-panels`,
`account-mode`, `objects-scroll`, `replay-shot`, `beginner-walk`, `three-humans-walk`; engine suites ported: lifecycle,
rooms, energy, power, practice partner, rotation, replay, disclosure, query cost, MCP, assistant (mock), layout, panels.
The testable statements of ux-lessons §1–§5 each have a test (the starter price bounds, no stale "Summon my first agent",
energy wording, phone heights, per-pane failure isolation). Persona walks, non-admin, alone with practice partners, meet
the round-9 bests or better: seated ≤ 10 s, first agent ≤ 30 s, first scoring move ≤ 45 s, score change explained ≤ 90 s on
desktop (the walker's explanation correct), natural end ≤ 420 s; and the walkers can say what a representation switch
showed them (new question).

**Risks:** the never-solved list (ux §7: balance, power versus energy, rarity understanding) carries over; the walks will
find v2-specific confusions (representations, "rung"); budget two walk rounds. MCP clients of v1 rooms keep working
because routing is by credential scope.

### 5.5 M4: grids on the v2 contracts

| PR | Workstream | Contents |
|---|---|---|
| W1-G1 | W1 | `lib/v2-grid`: the digit grid object type (spec §13): state, `cells`, `lines`, `pairs`, `blocks` representations, mutators (distance pricing as Annotated basics' `distance-v1`, copied and cleaned), the eight beginner families from `docs/beginner-pool.md` copied and cleaned from `game-utilities/src/families/grid/*`, each as a laddered family with marks reproducing today's units (annotations-design §3) |
| W1-G2 | W1 | calibration of the beginner grid pool with v2-valuation; the cross-check that the uniform walk reproduces today's rarity within the error bars; too-hard backlog entries |
| W4-G | W4 | the `grid` scene renderer (copied and cleaned from `object-views/grid-display.ts` 359, `glyph.tsx` 58, `explain/GoalBoard.tsx` 298 hover modes as marks interaction) |
| W2-G | W2 | grid starters (Simple, Thorough) per beginner family, both languages, priced within starting energy |
| W3-G | W3 + W5 | `Grids · beginner` preset; e2e and a persona-walk pair on grids (the noun "grid" everywhere, ux 2.8) |

**Acceptance (M4):** `v2-game.test.ts` parametrised over both presets; `e2e/v2-grid-game.ts`; the grid persona walks no
slower than the round-9 bests on today's grids; every beginner grid family converged; the units of today's annotations
for each family are present as marks (a test per family on its example board).

**Risks:** grid families whose units overlap need hover modes (annotations-design §3), which the v2 marks model must
express (a `group` on marks, guess); value differences against today's tables where the old engine's pricing was not
symmetric.

### 5.6 M5: the old engine removed

| PR | Contents |
|---|---|
| R-1 | Owner sign-off: v2 replaces v1 (spec PR 14 is "owner"). Ask, and export the dev and production deployments (`npx convex export`) before anything is deleted. |
| R-2 | Remove v1 routes, `src/legacy/`, `src/sdk/`, v1 site adapters; drop the `/v2` route prefix with redirects. |
| R-3 | Delete v1 Convex modules; widen-migrate-narrow for the old tables per CLAUDE.md: a migration deletes the rows of every v1 table (an owner-approved, irreversible step), then a later PR removes the tables from the schema. |
| R-4 | Delete `lib/game-types`, `game-utilities`, `game-core`, `object-views`, `grid-lab`, `player-client`, `ai-player`, `game-runtime` and their e2e and unit suites; rename `pnpm player` to the v2 CLI; update `docs/engine-api.md`, PILOT.md and CLAUDE.md. |

**Acceptance (M5):** root `pnpm run typecheck`, all suites and CI green with the libraries gone; deploy succeeds with
the narrowed schema; one full persona-walk pair on the deployed dev app.

### 5.7 Changes to the spec's build plan (§14)

| Spec PR | Change |
|---|---|
| 2–4 | unchanged |
| 5 | adds `presets.ts` (beginner pool from the calibration report), `ArgCode.enumerate(maxBits)` and optional `RuleFamily.examples(params, variant)` (goal-card worked examples; fallback a seeded search like today's `goalExample`) |
| 6 | unchanged; the summon-price code (`ts-ast-bits`, `astbits_guest`) is part of the copy |
| 7 | unchanged; followed by **W2-2** (starters per family, `check`, price tests), which the spec did not have |
| 8 | moves to W3 (W3-2) |
| 9 | grows: annotation model (§3.1), faces, switcher, parts list, ladder, move line, goal card, gallery; may not import ui-kit until ui-kit drops its player-client imports (W5-1) |
| 10 | split into W3-1 (contract and fixtures, first), W3-3 (rooms, lobby, deal, rotation, practice), W3-4 (tick, commands); schema adds `v2Players`, `v2Moves`, `v2StandingsHistory`, `v2AgentPrograms`, `v2Digests`, `v2Members`, `v2Chat`, `v2Receipts`, `v2Layouts`, per-player sort indexes on `v2ObjectValues`, and card plus rung rarities on `v2Rules` |
| 11 | replaced: no separate `/v2` page tree; the existing app on v2 data (W5-1 to W5-3), with `/v2` route prefixes until M5 |
| 12 | becomes W3-6 and W3-7 (tools, MCP, CLI, assistant, stored panels) |
| 13 | becomes M4 (W1-G1, W1-G2, W4-G, W2-G, W3-G) |
| 14 | becomes M5 (R-1 to R-4) |

---

## 6. The first wave: briefs for the sessions that start when the core packages merge

W1 (the spec session) continues with spec PR 5 and the additions of §5.7. W2's sandbox spike (spec PR 6) can start
before the core merges. The four briefs below start on the merge of spec PRs 2–4.

**W2, agent host and starters.** You build `lib/v2-agents` (spec §6, PR 7) on top of `lib/v2-sandbox` (spec PR 6; build
it first if it has not landed) and then the starters. Read spec §5–§6, owner decisions 6 and (d), ux-lessons §1 and §3,
and this plan §1.3–§1.4 and §5.2. Deliver, in order, PRs into `develop`: (1) the agent host: `runAct({variant, rule,
state, program, seed, budget}) → ActRecord` (queries with read bits, calls, per-call prices, outcome, charge), quotes,
guest libraries for TypeScript and Python, the three example agents run by tests in both languages; (2) W2-2: a Simple
and a Thorough starter for every family in `v2-linear`'s beginner pool, each with exactly one "Try this:" comment; the
summon price (the program's code length, copied and cleaned from game-runtime's AST-bits code); `check(program,
sampleState) → CheckReport`; tests that every starter's summon price is at most the preset's starting energy and that
after the first summon at the first-agent share the god's store still pays for the dearest starter. Freeze `runAct` and
`check` signatures in PR 1 and tell the W3 session. Nothing may import the old libraries.

**W3, the Convex server.** You build `artifacts/engine/convex/v2/` and `lib/v2-economy`. Read CLAUDE.md (Convex read
rules, engine v2 section), `docs/convex-read-architecture.md` §3, spec §6.1, §8–§10, and this plan §2.2, §2.3 and §4.
First PR (W3-1, within a day, it unblocks W5): the v2 schema of §4.2, every query of §2.2 with its args and return
validator returning fixture data from `convex/v2/testing.ts`, the command envelope in `lib/v2-client/protocol.ts`, the
import-boundary test extended to `convex/v2/**`, R8 rows. Then W3-2 (v2-economy, spec PR 8 with the agent-count
neutrality tests), W3-3 (rooms, owner commands, lobby, deal from presets refusing unconverged rules, rotation, practice
partners), W3-4 (loop and tick with births, offers, `runAct` from W2, values, `v2Moves`, standings, events; commands
summon, replace, destroy, allocatePower, check, ready, pause, chat). M1's acceptance tests (§5.2) are yours. Copy the
lease, watchdog and commit pattern from `engine/loop.ts`; do not import anything from the old engine.

**W4, views and annotations.** You build `lib/v2-views` (spec §11, PR 9, enlarged by this plan §3). Read spec §3–§4 and
§11, `docs/annotations-design.md` §3–§4 (the interaction model to keep), ux-lessons §2, and this plan §3 including the
storyboards. Deliver: W4-1 `annotate()` and `nearestImprovement()` as pure modules with Node tests (parts equal the
recorded terms; the improvement really raises the level at its quoted price); W4-2 the six line scene renderers with
the renderer contract of §3.2 and the static-markup test over every representation of every family; W4-3 the components
of §3.3 and a gallery page reproducing the three storyboards of §3.4 at desktop and phone width, with screenshots in the
PR. Player-facing words: points, ✨ rarity, ⚡ energy, power, "main part", "tie-breaker", the variant's noun ("line");
never "bits" or "object". No Convex, no imports from object-views (copy `colour-science.ts`, `dimensions.ts`, `product.ts`
if useful); depend on ui-kit only after W5-1 lands.

**W5, the app.** You move today's app onto v2 data without losing its UX work. Read ux-lessons (all), this plan §1–§3
and §5.3, `docs/convex-read-architecture.md` §3 (R6: one shared live subscription per datum, no client caches), and the
app: `artifacts/player-web/src/sdk/hooks.ts`, `core/panels/*`, `dock/*`, `site/pages/*`. Start now with W5-1 (needs
nothing from v2): move every v1-coupled pane and helper listed in §2.4 to `src/legacy/` unchanged, route v1 games there,
cut ui-kit's type imports from player-client; the existing e2e and unit suites must pass unchanged. Then W5-2 against
W3-1's fixtures: `lib/v2-client` (layout and panels copied from player-client, v2 types), `src/sdk2/` with the hook
names of §2.4, the `/v2` routes, room page, home, game router, header and dock on v2. Then W5-3 when W4-3 and W3-4 land:
the panes, ending with the M2 e2e test of §5.3 on desktop and phone. Keep every sentence the walks fixed (ux §6); when a
v1 sentence names grids, rewrite it for lines, not around it.

---

## 7. Open questions for the owner (none blocks the first wave)

1. Deleting v1 stored games at M5 (R-3) is irreversible; the plan asks then, with an export first.
2. Bidding and single-game fairness: deferred here; revive after M4 only if the owner wants it.
3. User-saved setups: presets only until the engine settles (guess that nobody else used saved setups).
4. Whether the beginner pool mixes story families (rule brainstorm B) with the spec's twelve: W1 decides from the
   calibration report and the first walks.
