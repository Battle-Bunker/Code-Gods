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

### Two further owner instructions this plan is built around (14 November 2026)

To be recorded as decisions 15 and 16 in [owner-decisions.md](owner-decisions.md).

15. "Keep a dedicated branch for wherever you reached on develop before starting on the new engine in preparation for
    pushing this new work to develop that should throw away most of the code and any trace of the integers and strings
    objects and the old engine and anything else older than that that we don't need anymore." Done by the coordinator:
    branch **`archive/engine-v1`** at `1018e913` (the merge of #341). Consequence: the end state on `develop` holds no
    old engine, no integer or string object types, and no migrations, settings, calibration tables, docs or tests that
    only served them. Deletion is a deliverable with its own pull requests (§5.8) and a final inventory. Because the
    archive keeps everything, this plan **deletes early** (as soon as a v2 replacement exists, or at once for what is
    unused or dropped) instead of carrying adapters or frozen copies.
16. "It's essential that we keep the architecture that ensures that every single operation is available to an AI
    assistant whether embedded or via the remote AI assistant delegation protocol as well as via the searchable command
    pallete. There should be a single dynamic directory of affordances available by context that generates each of
    those interface surfaces DRYly." Consequence: §2.5 makes **one affordance directory** a core v2 contract, built
    first (workstream W6), from which the assistant's tools, the MCP tools, the CLI, the palette and the UI's buttons
    are generated, with a parity test.
18. On the bid phase: "I want that still in the rebuilt app." Consequence: bidding is not deleted; it is part of M3,
    ported onto the v2 rule contract (§5.9).

## 0. The plan on one page

1. **The app stays; its data source changes.** v2 games are played in today's app: the same site shell, room page,
   dock, panes, phone layout, palette and assistant pane. The spec's separate `/v2` page tree (§1, PR 11) is dropped:
   the existing routes and page components are moved onto v2 in place.
2. **The seam is the SDK hook layer plus the affordance directory.** Panes read the engine only through
   `src/sdk/hooks.ts` (383 lines, ~25 hooks); v2 replaces its insides with `src/sdk2/`: the same hook names, v2-native
   types, over new narrow v2 queries. Every operation (a command, an owner action, a one-off read for a model, a view
   change) goes through the affordance directory (§2.5); no button calls a Convex mutation directly. A pane moves to v2
   by changing its imports, plus edits where a field's meaning changed. The pane's JSX, wording and UX fixes stay.
3. **No legacy copy, no adapters in the v1 direction.** Panes are converted in place. The v1 game screen and the v1
   engine leave `develop` as soon as the app plays lines (end of M2, deletion D2 in §5.8); until then the v1 app keeps
   running untouched beside the v2 work. Grids return on v2 in M4, copied from `archive/engine-v1`. Production (`main`)
   keeps v1 until the owner promotes `develop`.
4. **Objects are drawn by `lib/v2-views`**, a new package of scene renderers (one per scene kind, never per rule), a
   marks layer driven by the rule's recorded terms (the general annotation system), and three object faces: **chip**
   (one line of text), **compact** (the primary representation, about 160 × 100) and **expanded** (every representation
   in the rule's `depends`, switchable and comparable, cross-highlighted by meaning). It replaces `lib/object-views` for
   v2 games.
5. **The server is copied and cleaned into `artifacts/engine/convex/v2/`**, with `v2*` tables; auth, users,
   credentials, OAuth, AI templates and the sandbox's runtime assets are shared because they are infrastructure, not
   engine data.
6. **Six workstreams**: W6 the affordance directory (first: it shapes the server seam); W1 core, rules and valuation;
   W2 sandbox, agent host and starter agents; W3 Convex v2 server; W4 views and annotations; W5 the app and the
   deletions. Their interfaces are frozen in small contract PRs (§5.1).
7. **Milestones:** M1 a line game end to end on the server with scripted agents; M2 the app shows and plays a line game
   with the new annotation and representation views, and the v1 engine leaves `develop`; M3 the full inventory on
   lines, persona walks passed; M4 grids on the v2 contracts, beginner pool recalibrated, same UI; M5 the v1 tables' stored
   rows and definitions gone and the final inventory of what remains.
8. **Kept, on v2:** the bid phase (decision 18, §5.9, M3). **Deleted, not deferred** (everything stays on
   `archive/engine-v1`): integers and strings (owner), paid looks,
   tiers (replaced by v2 ladders), hold rarity and defence goals (spec §8), disclosure noise, Lab setups and
   user-saved setups (replaced by deployed presets), the playing-card and colour boards, `lib/grid-lab`. D1 deletes the
   ones v1 can lose today (§5.8). Each with its reason in §1.8.

---

## 1. Inventory of existing functionality

Legend: **=** carried over unchanged · **D** carried over with a new data source (sdk2 or a v2 query) · **R** redesigned for
v2 (how) · **×** dropped or deferred (why). The milestone where it lands on v2 is in brackets.

### 1.1 Accounts, site and access

- [ ] **=** Sign-in (Better Auth, Google, the local "fake" provider), sign-in gate on every path, error boundary per page (M2).
- [ ] **=** Avatar menu, connected apps sheet, credentials list and revoke (M2).
- [ ] **=** Device flow (`/device`) and MCP/OAuth connect (`/connect`) (M3; the tools behind them are R, §1.7).
- [ ] **=** Auto-update (`version.current`) and static hosting (M2).
- [ ] **R** Command palette (ui-kit) and site commands: generated from the affordance directory (§2.5) instead of the
  per-function catalogue and the two hand-written bind tables (M2, completed M3).
- [ ] **=** Admin rights by verified e-mail; AI player library `/admin/agents` (shared `aiTemplates` table) (M3).
- [ ] **R** Rule gallery `/rule-gallery[/:family]`: pages generated from the v2 object-type registry: card sentence, the
  goal card's worked example, the ladder, the dealable parameters; no server (M3).
- [ ] **D** Home: your rooms, create, join (v2 rooms only once D2 lands) (M2).

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
- [ ] **R** Bid phase before the deal: handicap-percent bids on rule families, highest bid wins the family exclusively,
  sealed, disclosure by preset; on v2 rule families, through the affordance directory (decision 18, §5.9) (M3).
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
- [ ] **R** In-client assistant (`core/chat/*`, 1,153 lines): pane, queue, modes and chips stay; its tools are
  generated from the affordance directory (§2.5, §4.4): explain my rule, read a line in a representation, write and
  check my agent, summon and replace, propose a pitch to another player (spec PR 12) (M3).
- [ ] **R** MCP server, OAuth, CLI (`pnpm player`): same transport and auth; tools, dispatch and CLI subcommands generated
  from the affordance directory (§2.5) (M2 generator, M3 complete).
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
| Integer and string objects | **×** deleted in D1 (owner, decisions 15) | "I might want to abandon those in favour of richer and more technically specific types." A later richer type is a new v2 object-type package; the old code is on `archive/engine-v1`. |
| Paid looks (`look`, `knowledge.ts`, `observer.ts`, stale boards, `knowledgeLog`) | **×** deleted in D1 | Walks: paid looks cost attention and sped nobody up (ux 2.7). v2 already prices what agents read (spec §6.2); human observation is free and exact. |
| Bidding (`bidding.tsx` 302, `roomBids`, `gameAuctions`) | **R** kept (decision 18), ported in M3 | The room-level bid phase before the deal, on v2 rule families, through the affordance directory; §5.9. |
| Tiers (★ bonus, gates, `card-tiers.ts`, `ruleTiers`) | **R** replaced by ladders; v1 tiers deleted in D1 | A v2 rule's score is a tuple of laddered components (main part, tie-breakers; rule brainstorm B §0). The ★ gate is a rung; the goal card's "steps to the top" is the ladder. No tier tables. |
| Hold rarity, defence goals | **×** (spec §8) | Not in v2's first version. |
| Disclosure noise (`peerNoiseBits`) | **×** | Already off on the beginner setup; it read as a bug (ux 2.7). |
| Playing-card, glyph and colour boards (First steps, Classic, Low income, Big board, Master, Annotated colours, Tiered rules) | **×** deleted in D1 | Only Annotated basics and Basics with bidding stay playable on v1 until D2; M4 ports the beginner digit grid only. Other grid variants are new `v2-grid` variants when wanted. |
| User-saved setups, Lab setups | **×** deleted (Lab setups in D1, saved setups in D2) | Presets in code (decision 7); trial variants are admin-only presets. |
| `lib/grid-lab` (Python research lab, imported by nothing) | **×** deleted in D1 | Its families were ported into game-utilities long ago; archived. |
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

**Operations** are affordances (§2.5): each is declared once in `lib/v2-affordances`, implemented once on the server,
and reached by every surface through generated code. The game commands (`check`, `summon`, `replace`, `destroy`,
`allocatePower`, `ready`, `pause`, `chat`) are separate affordances, not variants of one `submit` envelope; each has its
own Convex function (`check`, `summon` and `replace` are actions because they run the sandbox; the rest are mutations),
its own receipt (`v2Receipts`, idempotent by `requestId`) and its own parity-tested entry. Owner operations
(`room.create`, `room.settings`, `game.start`, `game.startWorldNow`, `game.end`, `game.resume`,
`seats.fillPracticePartners`, `seats.addAi`, `seats.removeAi`) likewise. `check` is the only operation that runs the
sandbox before answering.

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

`src/sdk/` is rewritten in place as the v2 SDK (called `sdk2` in this plan while both exist on a branch); it keeps the
hook names of `src/sdk/hooks.ts` where the concept survives (`useGame`, `useMyAgents`,
`useLeaderboard`, `useStandingsHistory`, `useChat`, `useRoomInfo`, `useActions`, `useDockState`, `useObjectIds`,
`useMyObject`, `useMyTotals`, `useTransformations` → renamed `useMoves`), plus `useMyRule`, `useObjectState`,
`useAnnotation(state)`; it drops `useEvaluator`, `useTrajectories`, `useObservation`, `useStaleCount`, `useMutators`.
Types are v2-native, defined in `lib/v2-client/types.ts`. Operations come from `useAffordance(id)` (§2.5). There is no
engine switch: a pane converted to v2 stops serving v1, and until D2 the v1 app runs from the code on `develop` as it is
(the conversion PRs land on an integration branch, `claude/v2-app`, merged into `develop` together with D2; see §5.3).

| Module (path, lines) | v2 treatment |
|---|---|
| Site shell, routing, sign-in (`core/app.tsx` 182, `core/routes.ts` 68, `site/lib/routes.ts` 49, `site/pages/sign-in.tsx`, `not-found.tsx`) | keep; routes unchanged, pages converted in place |
| Site layout (`site/components/layout.tsx` 334) | keep with edits: room and owner actions become `useAffordance` calls (~80 changed lines); the `setObjectRenderer("Grid")` toggle goes |
| Home (`home.tsx` 74) | keep, data from `v2/rooms.list` |
| Room page (`room.tsx` 286, `next-step.ts` 137, `room-seats.ts` 61, `rotation-note.tsx` 27) | keep with edits: data from `v2/rooms.get`, actions from affordances (~120 changed lines) |
| Configure (`configure.tsx` 698, `settings-form.ts` 371) | rewrite for v2 (~250 lines): preset picker plus the few overrides |
| Setup picker (`setup-picker.tsx` 154) | keep with edits: options from `lib/v2-linear` presets (code, no query) |
| Bidding (`bidding.tsx` 302, `site/lib/bidding.ts` 196) | keep with edits (~100 changed lines): families and cards from v2, bids through affordances; converted on `claude/v2-app` against W3-1's fixtures (§5.9) |
| Game page router (`site/pages/game.tsx` 263) | keep with edits: header from `v2/games.header`; picks Play, Spectate, Replay as today |
| Dock (`dock/*`, ~1,800 lines: shell, store, layout-sync, desktop, stacked, adapter, headers, operations, history, panel-search) | keep; layout types from `lib/v2-client/layout.ts` (a copy of player-client's 507-line `layout.ts` and 215-line `panels.ts` with v2 panel ids); `layout.current/set` → `v2/layout.*`; pane operations are affordances |
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
| Assistant pane (`core/chat/*` 1,153) | keep; its tool list and tool-detail views (`tool-detail.ts` 253) are generated from the affordance directory |
| Palette (`core/palette/*` 581) | keep the UI; its entries are generated from the affordance directory (§2.5), replacing both hand-written bind tables |
| Replay (`core/replay/*` 983, player-client `replay.ts` 637) | rewrite the reducer (~300, folding `v2Events`) and the controller's answers (~200); parts.tsx keeps its UI |
| Stored panels (`shell/*` ~775, `frame/*` 267, `sdk/bridge-protocol.ts` 107) | keep; the bridge's `QUERY_REFS` point at v2 queries and its actions at affordances; example panels rewritten |
| Spectator (`game-panels.tsx` 224) | keep with edits; rows → `<CompactFace>` without a rule |
| SDK (`sdk/*` ~1,700) | rewritten in place (~700); `evaluator.ts`, `goal.tsx`, `trajectory-windows.ts`, `tables-key.ts` deleted |
| `lib/object-views` (3,046) | not used by v2; `colour-science.ts`, `dimensions.ts`, `product.ts` and the wording of `rarity.ts` are copied into v2-views |
| `lib/ui-kit` (1,024) | keep; its type imports from player-client move to its own `types.ts` (one PR) so v2 code can use it without importing player-client |

Rough total: about 26k lines in player-web; about 17k kept as they are or with import edits, about 3k kept with
targeted edits, about 2.5k rewritten, the rest (v1-only parts, ~3.5k) deleted (D1 and D2).

### 2.5 The affordance directory (owner decision 16)

#### How it works today, and where it has drifted

Today's architecture already aims at one source (`docs/surface-architecture.md` §4, `docs/ui-redesign.md` §2.1):

- `lib/player-client/src/catalog.ts` (708 lines) has one entry per **public Convex function**: audience, human title and
  tooltip, model description, the tools that reach it, a palette spec (label, group, keywords, surface, confirmation).
  Its key type is derived from the generated `api`, so a function without an entry fails the typecheck.
- `lib/player-client/src/tools.ts` (507) lists about 60 **tools** with zod input and output schemas, permission and
  annotations, each naming the functions it reaches and borrowing its text from the catalogue. MCP (`/mcp`), the CLI
  (`pnpm player tools|call`) and the in-client assistant all read this one list. Executors are hand-written in
  `artifacts/engine/convex/agent/registry.ts` (452).
- The palettes are built by `commandsFromCatalog` (ui-kit) from catalogue entries with a palette spec, bound to
  performers by two hand-written tables (`core/palette/commands.ts`, `site/lib/commands.ts`).
- `lib/player-client/test/catalog.test.ts` checks that every player or owner function has a tool and a palette
  command, or a written `why` not.

Where it drifted:

1. **The unit is a Convex function, not an operation.** Nine game commands share `commands.submit`, so they have one
   catalogue entry; their per-command text lives in tool `about` strings and palette performers.
2. **About 70 entries are exempted by `why`**, most of them not plain subscriptions: bidding (four of them), the assistant's queue
   edits, code objects, consent pages, admin data. Each is a capability one surface has and another lacks.
3. **Buttons bypass it.** The app calls `useMutation` at 60 sites and `useAction` at 18 directly; the two palette bind
   tables restate the performers; a button and its palette command can disagree on confirmation or availability.
4. **Client-only operations are outside it.** 47 `ui.*` palette commands (open a pane, switch the grid renderer, sort,
   filter, show the glossary) are not in the catalogue, so the assistant reaches only those that happen to have a
   layout tool, and the MCP never.
5. **Context is by role only.** `availabilityFor` knows visitor, signed-in, member, seated and owner, not the phase;
   phases are restated in `panels.ts`, in tool executors' checks and in the panes.
6. **Schemas are written twice**: zod in `tools.ts`, Convex validators in each function.

#### The v2 contract

A new package `lib/v2-affordances` (depends on v2-core only) holds **the directory**: every operation any surface can
perform, declared once.

```ts
export type Context = "signedOut" | "home" | "room" | "planning" | "live" | "paused" | "ended" | "replay" | "admin";
export type Caller = "anyone" | "signedIn" | "member" | "seated" | "owner" | "admin";
export interface Affordance<I extends z.ZodType, O extends z.ZodType> {
  id: string;                         // "agent.summon", "object.read", "view.pinRepresentation"
  title: string;                      // ≤ 60, verb first: "Summon an agent"
  description: string;                // ≤ 600, for a model: what it does, when, what comes back
  tooltip: string;                    // ≤ 240, for a human
  keywords: readonly string[];        // palette search text
  group: "play" | "agents" | "view" | "room" | "owner" | "account" | "help";
  params: I;                          // zod v4: JSON Schema for tools and the CLI, Convex validators (convex-helpers zod), form fields
  result: O;                          // zod v4; game strings wrapped as untrusted
  contexts: readonly Context[];       // where it is offered
  caller: Caller;                     // who may call it
  effect: "read" | "write" | "destructive";
  spends?: "energy" | "aiBudget";     // shown before running; the assistant asks before spending
  confirm: "none" | "inline" | "summary" | "modal";
  runs: "server" | "client";          // server: a Convex function; client: a view operation (§ below)
  available?(ctx: AffordanceContext, args?: Partial<z.input<I>>): Availability; // dynamic checks beyond context and caller
  surfaces?: { except: readonly ("assistant" | "mcp" | "cli" | "palette")[]; because: Exemption };
}
export type Exemption = "consent";     // the only allowed exemption: OAuth and device approval must be a human's click
```

**Generated from it** (by functions in `lib/v2-affordances`, no hand-written lists):

| Surface | Generated | How |
|---|---|---|
| Embedded assistant | its tool list (name = id with `.` → `_`, description, JSON Schema) | `toolsFor(context, caller)`; the assistant step calls the server executor, or for `runs: "client"` sends a client action the pane performs |
| Remote delegation (MCP) | the `/mcp` tool list and dispatch | the same `toolsFor`, filtered by the credential's room and permission; client affordances act on the delegating human's layout (stored server-side, so every open client follows) |
| CLI | `pnpm player <group> <verb> --param …` and `pnpm player call <id> '<json>'` | flags from the JSON Schema; help from title and description |
| Command palette | every entry with its search text and confirmation | `paletteFor(context, caller)`; availability with reason and fix |
| UI buttons | `useAffordance(id)` → `{ available, reason, confirm, run(args) }` | the button renders the reason when unavailable and the same confirmation the palette uses |
| Server | one Convex function per server affordance, plus its internal twin taking a principal | `defineOp(affordance, handler)` in `convex/v2/ops/*.ts` validates args with the zod schema, checks caller and context from the game header, records the receipt, and returns the typed result |

**Subscriptions are not affordances.** The live queries of §2.2 are data a pane renders (R6); each has a read
affordance for models (`game.get`, `objects.list`, `object.read`, `moves.list` …) that answers the same question once,
as R7 allows.

**Client affordances** are view operations a human does with the mouse and an assistant should be able to do for them:
`view.openPane`, `view.closePane`, `view.movePane`, `view.pinRepresentation {family, rep}`,
`view.compareRepresentations {objectId, reps}`, `view.sortObjects`, `view.filterObjects`, `view.openObject
{objectId}`, `view.showGlossary {term}`. Their state lives in the human's `v2Layouts` row (pane params), so a remote
assistant changes what the human sees, and every client of that human follows. This replaces localStorage for
representation pins.

**The parity test** (`lib/v2-affordances/test/parity.test.ts` plus one in player-web and one in the engine):

1. every affordance appears in the assistant tools, the MCP tools, the CLI and the palette for at least one context,
   unless it declares the `consent` exemption;
2. every server affordance has exactly one `defineOp` in `convex/v2/ops/` and every public v2 mutation or action is
   one (a scan of the generated `api`);
3. `artifacts/player-web/src` calls no v2 mutation or action except through `useAffordance` (a source scan);
4. for each context, the sets offered to the assistant, MCP and palette are equal (same caller);
5. text limits, unique ids, keywords present, destructive affordances confirm.

**New v2 operations enter here first**, among them: `object.read {objectId, rep, site?}` and `object.element` (the
human's free reads, the same answers an agent pays for), `object.quote {objectId, calls}`, `rule.explain`,
`rule.ladder`, `agent.check`, `agent.summon`, `agent.replace`, `agent.putBack`, `agent.destroy`, `power.allocate`,
`seats.fillPracticePartners`, `game.rotation` (read: who holds which rule next), `rule.rarity {level}` (the calibration
lookup: ✨ rarity of a rung), `view.pinRepresentation`, `view.compareRepresentations`, `pitch.draft` (decision 9's
negotiation aid).

It is built first (W6, §5.1): W3's server seam is a set of `defineOp` handlers and W5's buttons are `useAffordance`
calls, so neither can start its operations before the contract exists.

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
pinned another in the switcher (the `view.pinRepresentation` affordance, stored in the human's layout so an assistant can set it too). The
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
| `v2Rules` | `deities` (utility part) | (game, player): family, params, layers (a dealt rule is `{family, params, layers}`; the beginner pool deals 2), artefact hash, card sentence, ladder with rung rarity and each rung's layer, won by bid and handicap | deal | private to the player |
| `v2Players` | `deities` (account part) | (game, player): energy, power, allocated, ready, pause used | commands, tick | hot per player |
| `v2Objects` | `objects` (cold part) | object: number, born at | tick | |
| `v2ObjectStates` | `objects` (hot part) | object: state wire, version, changed at | tick | shared by all viewers |
| `v2ObjectValues` | `objectViews` | (object, player): score wire (`(string \| null)[] \| null`), level, rarity, peer sum, points, version | tick | indexes `by_game_player_points`, `_rarity`, `_want`, `_born` |
| `v2Agents` | `agents` (cold part) | agent: owner, name, language, source hash, current program version, share | commands | |
| `v2AgentEnergy` | `agents` (hot part) | agent: energy, acts, skips, failures, spend, points gained | tick | hot |
| `v2AgentPrograms` | new | (agent, version): source, language, summoned at, acts, points gained | commands, tick | the put-back comparison |
| `v2Standings` | `standings` | game: rows (player, total, handicap %, net total, rank) | scoreboard | ≤ 8 rows in one doc; rank by net total |
| `v2RoomBids` | `roomBids` | (room, player): bids [{family, percent}], done | bid affordances | private to the player |
| `v2Auctions` | `gameAuctions` | game: every bid, the order of wins, each winner's family and handicap | deal | disclosed per preset; everything after the end |
| `v2StandingsHistory` | `standingsHistory` | (game, seq): totals | scoreboard | race, results |
| `v2Moves` | `objectEvents` (projection) | (move, player concerned): §2.3 | tick | the act log |
| `v2Digests` | `objectDigests` | (game, player): packed [object, own rarity, want] | tick | others-care |
| `v2Events` | `tickBatches` + `objectEvents` | event: spec §9.1 | tick, lobby | the record; replay folds it |
| `v2Layouts` | `dockLayouts` | (human, room): layout | layout commands | |
| `v2Assistant*` | `assistant*` | as today | assistant | copied: their keys are v1 room and game ids (guess: typed `v.id("rooms")`; if they are strings, share instead) |
| `v2Panels`, `v2PanelVersions` | `panels*` | stored panel with `sdk: 2` | panel commands | per human |
| `v2WorkSlots` | `workSlots` | background slot | checks, AI seats | avoids widening the old table |

Bidding's tables get v2 twins (§5.9): `v2RoomBids` (from `roomBids`) and `v2Auctions` (from `gameAuctions`).

Dropped with no v2 twin: `holdTables`, `examinationRuns`, `knowledgeLog`, `godTotals`
(standings are exact), `agentSamples`, `futileActs`, `catalogs`, `examinations` (rate limit moves into `v2WorkSlots`),
`gameSetups`, every `calibration*` table.

### 4.3 Functions, area by area

| Area | Today | v2 (file in `convex/v2/`) | Work |
|---|---|---|---|
| Rooms | `rooms.ts` 417, `lib/rooms.ts` 148 | `rooms.ts` (~300): create, list, get, join, leave, setSpectator, setReady, chat, history | copy, drop settings and AI quota fields; keep the room's bid-phase state (§5.9) |
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
| Assistant | `assistant.ts` 455, `assistant/*` ~1,800 | copied into `v2/assistant/*`; tools generated from the affordance directory, executed by the `defineOp` internal twins | M3 |
| MCP and CLI | `agent/mcp.ts` 164, `agent/registry.ts` 452, `agent/node.ts` 151 | `/mcp` keeps its transport and OAuth; its tool list and dispatch are generated from the directory (W6-2); no hand-written registry | M2 (generator), M3 (complete) |
| Layout and panels | `layout.ts` 252, `panels.ts` 221 | copies over `v2Layouts`, `v2Panels`; pane operations are client affordances | M2 layout, M3 panels |
| Test fixtures | `testing.ts` 691 | `v2/testing.ts`: seed a room, deal fixed rules, set energy, insert states | W3's first PR |

### 4.4 The assistant, MCP and CLI (M3)

They are generated from the affordance directory (§2.5); there is no separate tool registry. The v2 directory has about
40 affordances at M3 instead of today's 60 tools plus 47 `ui.*` commands, because paid looks, setups, hold and
inference tools go and view operations join. The executors are the `defineOp` internal twins, so
`agent/registry.ts` (452) has no v2 counterpart. The assistant's prompt teaches the v2 vocabulary (points, ✨ rarity,
⚡ energy, power) and lists the context's affordances.

### 4.5 What is switched off, and when

- **D1 (now):** integer and string objects, paid looks, tiers, hold rarity, disclosure noise, Lab setups, the
  older grid setups and `lib/grid-lab` leave `develop` (§5.8). Annotated basics stays playable on v1.
- **D2 (end of M2):** the v1 engine, its Convex modules, the v1 game screen and the v1-only libraries leave `develop`;
  v2 lines are the only game on `develop` and the dev deployment. Production (`main`) keeps v1 until the owner promotes.
- **M4:** grids return on v2.
- **M5:** the v1 tables' rows and definitions go, after the owner's sign-off.

---

## 5. The path

### 5.1 Workstreams and their interfaces

| Workstream | Owns | Interface it publishes (frozen in the PR named) |
|---|---|---|
| **W1 Core, rules, valuation** (the spec session) | `v2-core`, `v2-linear`, `v2-valuation`; later `v2-grid` | v2-core types (spec PR 2); line element names (PR 3); artefact JSON (PR 4); **presets and beginner pool** (`v2-linear/presets.ts`, new) |
| **W2 Sandbox, agent host, starters** | `v2-sandbox`, `v2-agents`, starter agents per family, summon price | `runAct(input): ActRecord` and `check(program): CheckReport` (W2-2) |
| **W6 Affordances** | `lib/v2-affordances`, the generators, the parity tests, `useAffordance`, the MCP and CLI front ends | **the directory contract** (W6-1, §2.5) and the generators (W6-2) |
| **W3 Convex server** | `convex/v2/**`, `v2-economy` | **the v2 API contract** (W3-1): table schema, every query's args and return validator, the operations' affordance entries with stub `defineOp` handlers; fixtures in `v2/testing.ts` |
| **W4 Views** | `v2-views` | component props of §3.3 and `annotate()` (W4-1) |
| **W5 App and deletions** | `player-web` (`sdk2`, pane conversions, e2e), `v2-client` (layout, panels, types), the deletion PRs D1–D3 and the final inventory (§5.8) | — |

Pairs: W6→W3 and W6→W5 (every operation is declared in the directory before W3 implements it or W5 puts it on a button;
W6 owns the generators, W3 the handlers, W5 the buttons), W1→W2 (agent host evaluates rules, prices calls), W1→W3 (deal, values), W1→W4 (contracts, element names),
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
| W6-1 | W6 | the directory contract (§2.5): types, `defineOp`, `useAffordance`'s interface, the parity test, import boundary | 2 |
| W6-2 | W6 | generators: assistant and MCP tool lists, the CLI, palette entries, `useAffordance`; the MCP endpoint routes v2 rooms' credentials to the generated tools | W6-1 |
| W3-1 | W3 | **API contract**: `convex/v2/schema.ts`, validators and stubbed queries over fixtures, every M1–M2 operation and the bid operations (§5.9) declared in the directory with a stub `defineOp`, import-boundary extended, R8 rows (marked pending) | 2, W6-1 |
| W3-2 | W3 | v2-economy (spec PR 8), including the pure bid mechanism and its tests copied and cleaned from `game-utilities/src/bidding.ts` (§5.9) | 2 |
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
| D1 | W5 | deletion of what v1 can lose today (§5.8); ui-kit loses its player-client type imports | — (can start now) |
| W5-2 | W5 | on the integration branch `claude/v2-app` (with a `preview` deployment): `v2-client` layout, panels, types; `src/sdk` rewritten over W3-1's contract; room page, home, game router, header and dock on v2; buttons through `useAffordance` | W3-1, W6-2 |
| W5-3 | W5 | on `claude/v2-app`: the bidding screen converted against W3-1's fixtures (§5.9); panes on v2: overview, objects (compact faces), popover (expanded), my-card (goal card), act log (`move-line.ts`), agents, forge (summon, replace, destroy, starters), results headline, chat | W4-3, W5-2, W3-4 |
| D2 | W5 | `claude/v2-app` merges into `develop` together with the deletion of the v1 engine, its Convex modules and the v1-only libraries (§5.8) | W5-3 and M2's acceptance |

**Acceptance (M2):** `e2e/v2-line-game.ts` (desktop 1440×900 and phone 390×844): create a v2 room, "Play a practice
game", "Summon my first agent" in one press, a scoring move appears in the act log as a full sentence with rarity and
points before → after, the objects row shows a compact face whose marks are present (by test id), the popover shows
three representations and hovering `si.c` highlights `cart.yInt` and `table.y0`, the goal card shows the ladder and a
nearest improvement, the game ends on the results headline; the browser's level equals the server's on every object
the page showed. The parity test passes for every M2 operation. After D2: root typecheck and every remaining suite
green with the v1 engine gone. Unit tests: `move-line` sentences for the ux 2.2
and 2.3 cases; `annotate` against the terms; renderer markup.

**Risks:** compact clutter at 160 × 100 (W4 decides by mark priority: focus and the nearest candidate only in compact);
v2-linear's bundle size in the browser (expected small); hook-shape drift between `sdk` and `sdk2` making pane moves
bigger than estimated.

### 5.4 M3: the full inventory on lines

| PR | Workstream | Contents |
|---|---|---|
| W5-4 | W5 | what-if (`CallPicker`), others-care, points over time, race, rules pane, results charts, configure on presets, setup picker, spectators |
| W5-5 | W5 + W3 | replay: `v2Events` file, reducer, controller, parts with points changes and any player's annotation |
| W5-6 | W5 + W3 | forge put-back comparison (`v2AgentPrograms`), check report |
| W3-5 | W3 | rotation and running totals on repeat games; model-backed AI seats; quotas |
| W3-8 | W3 + W5 | the bid phase on v2 (§5.9): `v2RoomBids`, `v2Auctions`, the bid affordances' handlers, the deal with bids, handicaps in standings, disclosure; the bidding screen wired to them; tests ported from `game-bidding` |
| W3-6 | W3 + W6 | every remaining operation of §1 in the directory with its handler; the CLI as `pnpm player`; MCP tests ported |
| W3-7 | W3 + W5 | assistant on v2 (prompt; tools generated from the directory; client affordances performed by the pane); stored panels with `@sdk` v2 and rewritten examples |
| W5-7 | W5 | palette complete from the directory (no hand-written palette commands left); site smoke on v2 |
| W5-8 | W5 | persona-walk round on v2 (two walks, desktop and phone), fixes, a second round |

**Acceptance (M3):** every checklist item of §1 marked D or R ticked with a named test or walk; e2e suites ported to v2:
`multi-client` (line games instead of Int/string/Grid, three clients, phone), `site-smoke`, `stored-panels`,
`account-mode`, `objects-scroll`, `replay-shot`, `beginner-walk`, `three-humans-walk`; engine suites ported: lifecycle,
rooms, energy, power, practice partner, rotation, replay, disclosure, query cost, MCP, assistant (mock), layout, panels.
The parity test passes with no exemption but `consent`; the source scan finds no direct mutation call in the app.
The testable statements of ux-lessons §1–§5 each have a test (the starter price bounds, no stale "Summon my first agent",
energy wording, phone heights, per-pane failure isolation). Persona walks, non-admin, alone with practice partners, meet
the round-9 bests or better: seated ≤ 10 s, first agent ≤ 30 s, first scoring move ≤ 45 s, score change explained ≤ 90 s on
desktop (the walker's explanation correct), natural end ≤ 420 s; and the walkers can say what a representation switch
showed them (new question).

**Risks:** the never-solved list (ux §7: balance, power versus energy, rarity understanding) carries over; the walks will
find v2-specific confusions (representations, "rung"); budget two walk rounds.

### 5.5 M4: grids on the v2 contracts

| PR | Workstream | Contents |
|---|---|---|
| W1-G1 | W1 | `lib/v2-grid`: the digit grid object type (spec §13): state, `cells`, `lines`, `pairs`, `blocks` representations, mutators (distance pricing as Annotated basics' `distance-v1`, copied and cleaned), the eight beginner families from `docs/beginner-pool.md` copied and cleaned from `game-utilities/src/families/grid/*` on `archive/engine-v1`, each as a laddered family with marks reproducing today's units (annotations-design §3) |
| W1-G2 | W1 | calibration of the beginner grid pool with v2-valuation; the cross-check that the uniform walk reproduces today's rarity within the error bars; too-hard backlog entries |
| W4-G | W4 | the `grid` scene renderer (copied and cleaned from `archive/engine-v1`'s `object-views/grid-display.ts` 359, `glyph.tsx` 58, `explain/GoalBoard.tsx` 298 hover modes as marks interaction) |
| W2-G | W2 | grid starters (Simple, Thorough) per beginner family, both languages, priced within starting energy |
| W3-G | W3 + W5 | `Grids · beginner` preset; e2e and a persona-walk pair on grids (the noun "grid" everywhere, ux 2.8) |

**Acceptance (M4):** `v2-game.test.ts` parametrised over both presets; `e2e/v2-grid-game.ts`; the grid persona walks no
slower than the round-9 bests on today's grids; every beginner grid family converged; the units of today's annotations
for each family are present as marks (a test per family on its example board).

**Risks:** grid families whose units overlap need hover modes (annotations-design §3), which the v2 marks model must
express (a `group` on marks, guess); value differences against today's tables where the old engine's pricing was not
symmetric.

### 5.6 M5: the last of v1, and the final inventory

By M5 the v1 code is long gone from `develop` (D1, D2). What remains is stored data and the record.

| PR | Contents |
|---|---|
| D3-a | Owner sign-off to delete v1's stored games (irreversible on the deployments; the code is archived, the data is not). Export the dev and production deployments (`npx convex export`) first. Production only after `main` has been promoted to v2. |
| D3-b | Per CLAUDE.md's schema steps: the v1 tables are already widened to optional-everything in D2 (§5.8); a migration deletes their rows; after dev and production report it done, a later PR removes the tables and the migration's leftovers, and the legacy migrations (`setupsV2`, `aiSeatNames`, `assistantPerGame`, `dropHaskell*`, `backfill*`) and their workflow steps. |
| D3-c | `docs/engine-v2/what-remains.md`: the final inventory of every package, Convex module, table, doc and test suite on `develop`, each with why it stays; every doc that only described v1 removed (moved to the archive by deletion); CLAUDE.md, PILOT.md, `docs/engine-api.md` and `.agents/memory/*` rewritten for v2; the `v2` prefixes on tables, packages and routes kept (renaming is churn; guess). |

**Acceptance (M5):** root `pnpm run typecheck`, every suite and CI green; the deploy succeeds with the narrowed schema;
`what-remains.md` lists nothing that serves only v1; one persona-walk pair on the deployed dev app.

### 5.7 Changes to the spec's build plan (§14)

| Spec PR | Change |
|---|---|
| 2–4 | unchanged |
| 5 | adds `presets.ts` (beginner pool from the calibration report), `ArgCode.enumerate(maxBits)` and optional `RuleFamily.examples(params, variant)` (goal-card worked examples; fallback a seeded search like today's `goalExample`) |
| 6 | unchanged; the summon-price code (`ts-ast-bits`, `astbits_guest`) is part of the copy |
| 7 | unchanged; followed by **W2-2** (starters per family, `check`, price tests), which the spec did not have |
| 8 | moves to W3 (W3-2) |
| 9 | grows: annotation model (§3.1), faces, switcher, parts list, ladder, move line, goal card, gallery; may not import ui-kit until ui-kit drops its player-client imports (D1) |
| 10 | split into W3-1 (contract and fixtures, first), W3-3 (rooms, lobby, deal, rotation, practice), W3-4 (tick, commands); schema adds `v2Players`, `v2Moves`, `v2StandingsHistory`, `v2AgentPrograms`, `v2Digests`, `v2Members`, `v2Chat`, `v2Receipts`, `v2Layouts`, per-player sort indexes on `v2ObjectValues`, and card plus rung rarities on `v2Rules` |
| 11 | replaced: no separate `/v2` page tree; the existing app converted in place on `claude/v2-app` (W5-2, W5-3), merged with D2 |
| 12 | becomes W6-1 and W6-2 (the affordance directory and its generators, **before** PR 10) and W3-6, W3-7 (every operation, assistant, stored panels) |
| 13 | becomes M4 (W1-G1, W1-G2, W4-G, W2-G, W3-G) |
| 14 | replaced by deletion as a deliverable: D1 now, D2 at the end of M2, D3 at M5 (§5.8), on decision 15 |
| new | `lib/v2-affordances` in the package table of spec §1; spec §10 gains the operations of §2.5; spec §6 queries are also human affordances (`object.read` free for humans) |

### 5.8 Deletion as a deliverable (decision 15)

Everything deleted stays on `archive/engine-v1`. Stored data follows CLAUDE.md's schema steps: code stops writing a
field or table, its definition is widened (never narrowed early), and rows are deleted by a migration only in D3, with
the owner's sign-off. CLAUDE.md's "Engine v2" section still says v2 lives beside the old engine until it replaces it;
decision 15 supersedes that, and the coordinator should update the sentence.

**D1, now** (W5; needs nothing from v2; one pull request per bullet, each with the suites it touches green; Annotated
basics stays playable on v1):

- **Integers and strings**: their object types, codecs and mutators in game-types; their families in game-utilities;
  `IntObject` and `StringObject` in object-views; the number and text editors in `object-editors.tsx` and
  `object-editor-model.ts`; their setups and settings options; the Int and string games in `e2e/multi-client.ts`; their
  docs and tests.
- **Paid looks**: `game/looks.ts`, the `look` command and tool, `knowledge.ts`, `observer.ts`, stale-board fields'
  writers, `game-paid-observation` tests, `e2e/paid-observation-shots.ts`, the setup, `.agents/memory/paid-observation.md`.
- **Tiers**: `card-tiers.ts`, `ruleTiers`, `TIER_COMPOSITIONS`, the Tiered rules setup and Lab tier setups,
  `docs/tiered-rules.md`, `docs/handover-tiered-rules.md` if present.
- **Hold rarity and disclosure noise**: `engine/hold.ts`, `engine/holdData.ts`, hold work slots, `game-hold` tests,
  `peerNoiseBits` and the noise fields' writers.
- **Setups**: every Lab setup and every setup but Annotated basics and Basics with bidding (First steps, Classic, Low income, Big board, Master,
  Annotated colours); the deep colour and glyph code goes in D2, not here (cheap boundary first).
- **`lib/grid-lab`** (imported by nothing) and docs that only served removed features or superseded designs:
  `docs/brainstorm/`, `docs/research/` items about removed features, `docs/clean-implementation-plan.md`,
  `docs/unify-apps-plan.md`, handovers of finished work (`handover-*.md`), `docs/layered-rules-*`, balance results of v1
  setups. Docs describing the v1 engine that still runs (`engine-api.md`, `energy-model.md`, `convex-read-architecture.md`)
  stay until D2 or D3.
- The coordinator may close the open variant drafts (#290–#293, #295, #299, #300, #324); their branches remain.

**D2, at the end of M2** (with the merge of `claude/v2-app`):

- Libraries: `game-types`, `game-utilities`, `game-core`, `object-views`, `player-client`, `ai-player`, `game-runtime`
  (each already copied and cleaned where v2 needed it: v2-sandbox, v2-economy, v2-views, v2-client, v2-ai).
- Convex v1 modules: `engine/*`, `calibration/*`, `owner.ts`, `game/*`, `player.ts`, `dock.ts`, `games.ts`, `rooms.ts`,
  `setups*`, `manifest*`, `commands.ts`, `bidding.ts` (already ported, §5.9), `replays.ts`, `ai/*`, `agent/registry.ts`, `agent/node.ts`, `agent/rules.ts`,
  `agent/series.ts`, v1 `assistant*`, `layout.ts`, `panels.ts`, `lib/*` v1 helpers, v1 `testing.ts` fixtures, crons for
  v1 caches; shared modules (`auth/*`, `agent/oauth*`, `agent/connect.ts`, `activity.ts`, `aiTemplates.ts`, `version.ts`,
  `lib/rooms.ts`'s `encodeUuid`) lose their imports of v1 libraries.
- Schema: every v1 table's definition replaced by a self-contained loose definition (each field
  `v.optional(v.any())`, indexes dropped): a pure widening, so the schema imports nothing of v1 and deploys over the
  stored rows.
- Tests and scripts: every v1 engine suite and unit test, v1 e2e scripts and shots, calibration and runtime upload
  scripts that only v1 used, deploy-workflow steps for them.
- The app: every v1-only file left after the conversion (`sdk/evaluator.ts`, `goal.tsx`, `score-line.ts`,
  `object-why.ts` v1, `knowledge.ts`, galleries for glyphs and v1 annotations, `setObjectRenderer`).

**D3, at M5**: §5.6.

**What can be deleted now**, in one line: integers and strings, paid looks, tiers, hold rarity, disclosure
noise, every setup but Annotated basics, `lib/grid-lab`, and the docs of all of these (D1).

### 5.9 The bid phase on v2 (decision 18)

**Rules carried over unchanged** (`docs/bid-phase.md`, `.agents/memory/bid-phase.md`): a room-level step of the start,
before the game exists; each human player bids whole percents 1–100 of handicap on rule families, sealed; the
mechanism sorts every bid highest first (ties uniformly at random), gives the top bidder that family exclusively, drops
that player's other bids and the family's other bids, and repeats; everyone else is dealt as usual from the families
nobody won; **no bids gives the dealer's own deal, byte for byte** (same generator, nothing drawn first); the handicap
(first price by default, second price as a preset option) comes off the winner's totals only (net = total − h% × |total|),
never off per-object points, since a player's points are a product with the others' rarity; disclosure by preset
(`none`, `handicaps`, `all`), everything after the end; AI seats and practice partners do not bid; the phase ends at its
deadline or when every human is done.

**On the v2 rule contract.** A dealt v2 rule is `{family, params, layers}`. **A bid names a family only**; the winner's
params and layers are drawn by the dealer from that family's dealable grid exactly as for everyone else.
Recommendation and reasons: a player bids before seeing anything but cards, and a family's card is what they can judge;
family-plus-layer bids would multiply the bid screen by the layer choices (with two layers dealt, often ten or more
options a family) and make most bids unopposed; and the dealer's balance band (spec §7.8) keeps working on layers. If
the owner later wants bids on layers, the bid's `family` widens to `{family, layers?}` without changing the mechanism.

**Rotation.** Today rotation is off when the setup has a bid phase, and a deal made with winning bids neither rotates
nor continues a rotation. **That stays**: the auction is itself the fairness instrument, and rotating a rule someone
paid for would void their bid. An all-pass auction is identical to no bidding, so it may continue or start a rotation
(today's rule, since `bid` is false for it).

**Affordances** (all in the directory, so the assistant, MCP, CLI and palette reach them, and today's four `why`
exemptions disappear): `bid.state` (read: the families on offer with card and ladder top, the deadline, my bids, who is
done), `bid.place {family, percent}`, `bid.withdraw {family}`, `bid.done`, `game.auction` (read, by disclosure). Context:
`room` while the room's bid phase is open; caller: `seated` human. The bidding screen keeps its layout and words
(`bidding.tsx` 302, `site/lib/bidding.ts` 196).

**Presets.** `Lines · beginner with bidding` (45 s bid phase, first price, sealed); admin presets for second price and
open disclosure. Bidding stays off on `Lines · beginner`.

**Who and when.** W3 carries it, with W5 for the screen and W6 for the entries:
- W3-1 (M1) declares the bid affordances with stub handlers and the `v2RoomBids` and `v2Auctions` tables;
- W3-2 (M1) copies the pure mechanism (`game-utilities/src/bidding.ts`) and its tests, including the byte-for-byte
  no-bids test, into `lib/v2-economy`;
- W5-3 (M2) converts the bidding screen on `claude/v2-app` against the fixtures;
- W3-8 (M3) implements the handlers, the deal with bids, handicaps in `v2Standings`, disclosure and the replay's auction,
  and ports `game-bidding` and the disclosure checks.

So when D2 deletes `convex/bidding.ts` and the v1 libraries, the mechanism, its tests and the screen are already on v2,
and the server side is the archived module copied and cleaned in W3-8. D1 no longer touches bidding, and Basics with
bidding stays playable on v1 until D2.

**Acceptance (in M3's):** `v2-bidding.test.ts` (all-pass equals the plain deal byte for byte; exclusive wins; ties at
random under a seed; handicaps in standings and results; first and second price; disclosure per preset;
rotation off after a won bid, on after an all-pass); the parity test covers the bid affordances; an e2e step in
`multi-client` bids from the screen and from the assistant.

---

## 6. The first wave: briefs for the sessions that start when the core packages merge

W1 (the spec session) continues with spec PR 5 and the additions of §5.7. Three things can start **now**, before the core
merges: W6 (the affordance directory: its contract needs only zod and the context vocabulary), W5's D1 deletions, and
W2's sandbox spike (spec PR 6). W3 and W4 start on the merge of spec PRs 2–4.

**W6, the affordance directory.** You build `lib/v2-affordances`, the single directory of every operation that the
embedded assistant, the remote assistant (MCP), the CLI, the command palette and the app's buttons are generated from
(owner decision 16, quoted in this plan's preamble). Read this plan §2.5 first, then `docs/surface-architecture.md` §4,
`lib/player-client/src/catalog.ts`, `tools.ts`, `test/catalog.test.ts`, `lib/ui-kit/src/commands.ts`,
`artifacts/player-web/src/core/palette/commands.ts`, `site/lib/commands.ts` and `artifacts/engine/convex/agent/{mcp,
registry}.ts`, to keep what works (one catalogue, typed against the generated api, completeness tests) and fix the six
drifts §2.5 lists. Deliver, in order, PRs into `develop`: (1) W6-1, the contract: the `Affordance` type, contexts and
callers, `defineOp(affordance, handler)` for Convex (zod-validated args via convex-helpers, caller and context checks
from the game header, receipts, an internal twin taking a principal), `useAffordance(id)`'s interface, and the parity
test of §2.5 (five checks) running over an initially empty v2 directory plus two example affordances end to end; (2)
W6-2, the generators: tool lists for the assistant and MCP (JSON Schema from zod), MCP dispatch for v2 rooms' credentials
on the existing `/mcp` transport and OAuth, the CLI (`pnpm player call <id>` and generated subcommands), palette entries
with search text and confirmation, `useAffordance` for React, and client affordances stored as layout pane params. Then
review every operation W3 and W5 add. Nothing may import the old libraries; the `consent` exemption is the only one.



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
validator returning fixture data from `convex/v2/testing.ts`, every M1–M2 operation (§2.2, §2.5) declared in W6's
directory with a stub `defineOp` handler (W6-1 must have landed; never a public mutation outside `defineOp`), the
import-boundary test extended to `convex/v2/**`, R8 rows. Then W3-2 (v2-economy, spec PR 8 with the agent-count
neutrality tests), W3-3 (rooms, owner commands, lobby, deal from presets refusing unconverged rules, rotation, practice
partners), W3-4 (loop and tick with births, offers, `runAct` from W2, values, `v2Moves`, standings, events; the
operations summon, replace, destroy, allocatePower, check, ready, pause, chat as `defineOp` handlers). M1's acceptance tests (§5.2) are yours, and the bid phase (§5.9: stubs in W3-1, mechanism in W3-2, handlers in W3-8).
Follow the spec's layered rules: `v2Rules` holds `layers` and each rung's layer (artefact schema 2), score wire is
`(string | null)[] | null`, and a `too-coarse` artefact is not dealable. Copy the
lease, watchdog and commit pattern from `engine/loop.ts`; do not import anything from the old engine.

**W4, views and annotations.** You build `lib/v2-views` (spec §11, PR 9, enlarged by this plan §3). Read spec §3–§4 and
§11, `docs/annotations-design.md` §3–§4 (the interaction model to keep), ux-lessons §2, and this plan §3 including the
storyboards. Deliver: W4-1 `annotate()` and `nearestImprovement()` as pure modules with Node tests (parts equal the
recorded terms; the improvement really raises the level at its quoted price); W4-2 the six line scene renderers with
the renderer contract of §3.2 and the static-markup test over every representation of every family; W4-3 the components
of §3.3 and a gallery page reproducing the three storyboards of §3.4 at desktop and phone width, with screenshots in the
PR. Player-facing words: points, ✨ rarity, ⚡ energy, power, "main part", "tie-breaker", the variant's noun ("line");
never "bits" or "object". No Convex, no imports from object-views (copy `colour-science.ts`, `dimensions.ts`, `product.ts`
if useful); depend on ui-kit only after D1 cuts its player-client imports.

**W5, the app and the deletions.** You move today's app onto v2 data without losing its UX work, and you delete what
v2 replaces (owner decision 15: everything stays on `archive/engine-v1`). Read ux-lessons (all), this plan §1–§3, §5.3
and §5.8, `docs/convex-read-architecture.md` §3 (R6: one shared live subscription per datum, no client caches), and the
app: `artifacts/player-web/src/sdk/hooks.ts`, `core/panels/*`, `dock/*`, `site/pages/*`. Start now with D1 (needs
nothing from v2): one pull request per bullet of §5.8's D1 list, each leaving Annotated basics playable and its suites
green, and cut ui-kit's type imports from player-client. Then, on the integration branch `claude/v2-app` with a `preview`
deployment so the owner can try it, W5-2 against W3-1's fixtures and W6-2's `useAffordance`: `lib/v2-client` (layout and
panels copied and cleaned from player-client, v2 types), `src/sdk` rewritten in place with the hook names of §2.4,
room page, home, game router, header and dock on v2, every button through `useAffordance`. Then W5-3 when W4-3 and W3-4
land: the panes, ending with the M2 e2e test of §5.3 on desktop and phone, and D2 (merge `claude/v2-app` into `develop`
with the v1 engine's deletion). Keep every sentence the walks fixed (ux §6); when a v1 sentence names grids, rewrite it
for lines, not around it.

---

## 7. Open questions for the owner (none blocks the first wave)

1. Deleting v1's stored games from the deployments (D3-a) is irreversible; the plan asks then, with an export first.
2. Between D2 and M4 `develop` has no grid game (lines only); the archive branch and production keep grids. Acceptable?
   (Guess: yes, under decision 15.)
3. Bidding on layered rules: the plan has bids name a family, not a family plus layers (§5.9). Say if you want bids on
   the layers too.
4. Whether the beginner pool mixes story families (rule brainstorm B) with the spec's twelve: W1 decides from the
   calibration report and the first walks.
