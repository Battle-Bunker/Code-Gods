# Code Gods: surfaces, agents and live UI

Status: plan adopted 2026-10-31. It supersedes the Replit-specific parts of `docs/convex-migration-plan.md`. That document remains the record of the engine, tick loop and sandbox design.

## 0. Goals and principles

1. **No platform dependency.** Code Gods runs on one Convex deployment and needs nothing else. People sign in with Google. Replit, Codespaces, local machines, Claude and a browser tab are all *surfaces*: optional places to play from.
2. **One agent interface.** Every assistant uses one tool registry, executed inside Convex as the player it acts for:
   - Replit Agent in a dev container;
   - Claude (chat, Claude Code, artifacts);
   - the in-client assistant served by Convex;
   - the CLI.

   Every surface reaches it through **MCP** at `POST /mcp`, except the in-client assistant, which calls the executors in-process.
3. **Live UI is data.** A player's custom panels are TSX stored in Convex (*stored panels*). Any agent writes them through the registry, and every open client of that player re-renders them through its reactive subscription. A dev server is not needed. Dev containers keep file panels with HMR as a second source.
4. **Same human, same rights, never more.** An agent acts as the human who delegated to it, through a revocable credential. Disclosure stays enforced in Convex queries: an agent sees exactly what its human sees.
5. **Clean break.** No compatibility shims. Replit-only code, PostgreSQL and other template baggage are deleted (Wave 0).

## 1. Surfaces

| Surface | Reactive data | Acting | Live UI changes | Assistant |
|---|---|---|---|---|
| **Hosted client** (`/client/` on the deployment) | Convex WebSocket, a room's OAuth connection (player JWT; never the site session: docs/external-clients.md) | the client's own commands | stored panels, in sandboxed frames | in-client assistant (Convex) |
| **Any browser client** (any origin: a Replit dev URL, localhost, a static host; `clients/hello`) | Convex WebSocket, a room's OAuth connection or device credential (`@workspace/player-client/browser`) | public Convex functions | whatever it renders | the player's own |
| **Dev container** (any Vite environment: local, Codespaces, Gitpod, Replit, …) | Convex WebSocket, JWTs from the dev server's `/__codegods/token` after the private launch link | same | file panels (HMR, in-process) **and** stored panels | the environment's coding agent through MCP or the CLI, plus the in-client assistant |
| **Claude** (chat, Claude Code) | MCP tool calls | MCP tools | writes stored panels through MCP; the human watches the hosted client | Claude itself |
| **Claude artifact** (claude.ai page; `clients/claude-artifact/`) | the Code Gods connector through the page's `mcp` capability: `watchTool` on `get_observation` and `whoami` (about 30 s polling floor, paused while hidden) | `callTool` on a click: `send_chat` (confirmed in the page), `validate_agent`, `summon_agent`, `set_ready`; ambiguous failures check `get_receipt` and resend with the same `commandId` | Claude republishes the page; whether it could render stored panels is what `probe.html` checks | Claude, plus the page's `sample` ("Ask Claude") |

The engine UI (`/`) stays the common room display and owner control panel. Sign-in, device and connector approval, and credential management live there.

## 2. Identity (Wave 1A)

- **Google is the only sign-in,** through Better Auth served by Convex (§7.1).
- **Identity key.** A human's god id is a stable key derived from the auth library's user record, which is tied to Google's `sub`.
- **Display name.** Google's given and family names give the full name.
- **Admins.** The admin rule is an allowlist of verified Google emails (`ADMIN_EMAILS`).
- **Removed.** Replit OIDC, the relay page and all `REPLIT_*` variables are deleted.
- **Local tests.** Tests sign in without Google, through a test-only path that only works when `TEST_FIXTURES` or `DEV` is set on the local deployment. Production refuses it.
- **Unchanged.** Device approval, room credentials and player JWTs signed by the deployment (our `customJwt` provider) all stay. `getViewer` keeps returning the same `Viewer` shape: browser scope comes from the auth library's identity, player scope from our JWT.

## 3. Principals and credentials (contract for all waves)

**`credentials` table.** It gains:
- `kind: "device" | "oauth" | "assistant"` (existing rows are `device`);
- for `oauth` rows: `clientId?`, `refreshHash?` and `refreshExpiresAt?`.

A credential is always bound to one human (`subject`), one room and one permission (`read < act < owner`). It is revocable and shown on the engine UI's credential list.

**Principal.**
- Every tool execution runs as `Principal = { credentialId: Id<"credentials"> }`.
- `viewerForCredential(ctx, credentialId)` in `convex/auth/access.ts` returns the same `Viewer` as `getViewer` gives for a player JWT, after the same checks: not revoked, not expired, owner still current for `owner` grants.
- Internal functions that execute tools take `principal` and resolve the viewer this way. Public functions keep resolving it from `ctx.auth`.
- Shared helpers `requireMemberAs(ctx, viewer, room, need)` and `requireOwnerAs(ctx, viewer, room)` sit beside `requireMember` and `requireOwner` in `convex/lib/rooms.ts`.

**Who holds which credential.**
- Device flow (CLI, coding agents): `kind: "device"`, 7 days, as today.
- MCP OAuth connections (claude.ai, Claude Code, Replit Agent): `kind: "oauth"`. Access tokens are 60-minute player JWTs carrying `cred`. Refresh tokens rotate, and reusing one revokes the credential. The grant expires after 30 days without use.
- The in-client assistant: `kind: "assistant"`. It is created by the human's first assistant message in a room, with a permission the human chooses (default `act`), and is listed and revocable like any other (§6).

## 4. Agent interface: registry and MCP (Wave 1B)

**Registry.** `lib/player-client/src/tools.ts` lists the tools. Each entry has:
- `name` (snake_case);
- `title` and `description`;
- `permission` (`read` | `act` | `owner`);
- `annotations` (`readOnlyHint`, `destructiveHint`);
- `input` and `output` as zod schemas, plus generated JSON Schema that is committed and snapshot-tested.

**Executors.** They live in `artifacts/engine/convex/agent/`:
- `registry.ts` maps a name to `run(ctx: ActionCtx, principal, args)`;
- executors call the internal twins of the existing projections and commands; they never read game tables directly;
- results wrap game data as `{ untrusted: true, data }`, are bounded to about 20k tokens, and are paginated by cursor.

**Tools.**

| Kind | Tools |
|---|---|
| Read | `whoami`, `get_rules`, `get_observation`, `get_events`, `get_trajectories`, `list_games`, `get_game_history`, `get_my_utility`, `evaluate_value` (own utility only), `get_chat`, `get_receipt` |
| Act | `validate_agent`, `summon_agent`, `destroy_agent`, `set_ready`, `send_chat`, `pause_game`, `wake_engine` |
| Owner | `get_room_state`, `get_ai_catalog`, `update_settings`, `start_game`, `resume_game`, `end_game`, `add_ai`, `remove_ai` |
| Game setups | `list_setups` (read); `save_setup`, `delete_setup` (act) |
| Panels | `list_panels`, `get_panel` (read); `save_panel`, `delete_panel`, `rollback_panel` (act) |
| Layout (docs/ui-redesign.md §2.4) | `get_layout` (read); `open_panel`, `set_panel_params`, `move_pane`, `close_pane` (act) |

- Command tools build the v3 envelope. `commandId` is required for summon, destroy and pause; owner tools carry a `requestId`.
- Summon and validate take `waitMs` (default 90 s). Past it they return `{status: "pending", commandId}`, and `get_receipt` completes the call.

**MCP endpoint.** `POST /mcp` is a Convex HTTP action.
- It is stateless and returns JSON only, so it answers both the 2026-07-28 and the 2025-era protocols.
- It uses `@modelcontextprotocol/server` v2 `createMcpHandler` if that runs in Convex's V8 runtime. If not, a minimal handler of our own takes its place.
- It accepts `Authorization: Bearer <player JWT>` (OAuth access tokens), and `Bearer cgc_…` or `x-api-key: cgc_…` (device credentials).
- An unauthenticated call gets 401 with `WWW-Authenticate` pointing at the protected-resource metadata.

**OAuth 2.1 authorization server.** It runs on the same deployment:
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`;
- `POST /api/oauth/register` (DCR, public clients) and CIMD;
- `GET /oauth/authorize` sends the browser to the engine UI's `/connect` page, which reuses device approval and adds a room picker;
- `POST /api/oauth/token` (code with PKCE S256; refresh);
- a revocation endpoint.

One connection is one credential, for one room and one permission.

**CLI.** `pnpm player` becomes an MCP client of `/mcp` using the device credential: `pnpm player tools` and `pnpm player call <tool> '<json>'`. The existing `assistant …` subcommands become thin aliases, so there is one server path. `connect`, `status` and `state --watch` stay.

## 5. Stored panels and the panel host (Wave 1C)

> The dock (regions, `panelLayouts`, `panels.place/layout/setLayout`, `place_panel`) described below was replaced by the
> pane layout of `docs/ui-redesign.md` §2.3–2.4 (`dockLayouts`, `layout.current/set`, the layout tools). Panels are
> panes; `placement`/`size` are add-pane hints. The compilation, sandbox and confirmation parts stand.

**Engine (`convex/panels/`).**
- `panels {subject, slug, title, placement, size, currentVersion, enabled, updatedAt}` and `panelVersions {panelId, version, source, compiled, diagnostics, compilerVersion, sourceHash, author {kind: browser|device|oauth|assistant, label}, createdAt}`, keeping the last 20 versions.
- `panelLayouts {subject, layout}` makes the dock layout follow the player across devices. localStorage is only the boot cache.
- Panels belong to the human (`subject`) across rooms.
- **Who may write:** browser sessions and `act`/`owner` credentials. `read` credentials and AI seats may not.
- **Limits:** source ≤ 64 KB, compiled ≤ 128 KB, ≤ 32 panels per player, ≤ 30 saves per minute.

**Compilation.** On save, a Node action:
- runs an import allowlist (`react`, `react/jsx-runtime`, `@sdk`);
- transpiles with TypeScript `transpileModule` to CommonJS with react-jsx;
- returns diagnostics with line and column to the writer;
- commits nothing on a syntax error.

Type-checking against `sdk.d.ts` is phase 2.

**Public API.** `panels.list`, `panels.code`, `panels.save`, `panels.rollback`, `panels.setEnabled` and `panels.remove`. Each has an internal twin taking `principal`, named `<fn>As`, for the registry. The dock layout is `layout.current` and `layout.set` (docs/engine-api.md "Dock layout").

**Client (`artifacts/player-web`).**
- The shell registry merges file panels with stored panels from `panels.list`. On an id clash the file panel wins and shows a "shadows stored vN" badge.
- **Isolation:** stored panels run in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) served as `/client/panel-frame.html`, with its own meta CSP (`connect-src 'none'`). The client page's CSP has `frame-src 'self'` (hosted and dev server alike), so a frame cannot navigate itself off-origin.
- **Bridge:** a postMessage bridge carries the same `@sdk` API. The SDK is built twice with a swapped transport: `useQuery` on the host, bridge subscriptions in the frame. Panels keep real React hooks.
- **Confirmations:** the host enforces a confirmation for `chat`, `summon`, `destroy` and `pause` coming from a stored panel. A per-panel "let it act" grant is set by the player and reset whenever a non-browser author writes a new version.
- **Failure handling:** a crashing panel stays inside its frame. `?panels=off` is safe mode.
- **File panels** stay in-process with HMR (dev containers only). A "run sandboxed" toggle proves a file panel works as a stored one.

**Hosting and CLI.**
- The production `/client/` page gets a build-time meta CSP: `connect-src` limited to the deployment, `script-src 'self' 'unsafe-eval'`, which the utility evaluator needs.
- The CLI's `pnpm player panel push|pull <slug>` moves panels between `src/panels/` and the store, through the registry tools.

## 6. In-client assistant (Wave 2A, built)

> The assistant now lives in a pane of the dock, not a drawer, and arranges the player's screen through the layout tools;
> the system prompt and briefing gained THE PLAYER'S SCREEN, NEXT STEPS and a PANELS block (`docs/ui-redesign.md` §2.4).

A model served by Convex that answers one human in the player client's **Assistant** drawer and acts for them
through the agent registry. API: `docs/engine-api.md` "In-client assistant"; billing: `docs/ai-player-billing.md`.

**Data** (`convex/assistant/tables.ts`):
- `assistantThreads {roomId, subject, title, epoch, createdAt, updatedAt, activeTurnId?}`: one human's conversation in a
  room during one game (`epoch`: the room's current game id when it started, or `lobby`; the allowance's key).
- `assistantTurns {threadId, roomId, subject, gameId?, credentialId, status, gen, step, maxSteps (12), deadline (start + 10 min), usage, tools, lastStop?, error?}`;
  status is `running | awaiting_confirmation | cancelling | done | failed | cancelled | budget_exhausted`.
- `assistantMessages {threadId, turnId, seq, role, text (≤ 32 KB), status: streaming|done|error|cancelled, reservedTokens?, inputTokens?, outputTokens?,
  cacheReadTokens?, cacheWriteTokens?, billedTokens?, inputEstimate?, usageEstimated?, contentJson?}`: the user's message, then one assistant message
  per model step (`usageEstimated`: a cancelled step billed from what was known).
- `assistantToolCalls {turnId, messageId, callId, index, tool, argsJson, status: pending|awaiting_confirmation|running|ok|error|denied, summary, resultJson (≤ 8 KB), commandId?, confirmDeadline?, approved?}`.
  `argsJson` is ≤ 8 KB, except agent sources (validate/summon, 20 KB) and stored panels (`save_panel`, 70 KB).
- `assistantAllowances {roomId, subject, epoch, usedTokens, calls}` (epoch: the room's current game id, or `lobby`) and
  `assistantPrefs {roomId, subject, autoApproveSummonBits}`.

**Principal.** The first `assistant.send` in a room creates (or reuses) the human's `kind: "assistant"` credential for
that room: permission as chosen in the drawer (default `act`; never above the caller's own; `owner` only for the current
owner with explicit consent; a different choice revokes the old one and creates a new one), 30 days, never longer than a
player credential that created it. It is listed and revocable on the engine UI like any other credential; it is never a
bearer token. Every tool runs through `registry.runTool(ctx, {credentialId}, …)`: there is no other path to game state.

**Turn loop** (`convex/assistant.ts`, `assistant/store.ts`, `assistant/step.ts`).
- `send` (requireMember read; FORBIDDEN while the owner's allowance is 0) inserts the user message and the turn and
  schedules `assistant/step:run({turnId, gen})`; while the human's turn in this game is active it queues the message
  instead (below).
- One scheduled Node action per model step, chained with `gen`; a step whose `gen` or status is stale exits. A step:
  resolves the previous step's tool calls → reserves from the assistant pool → streams from the provider, flushing the
  text into the message about every 250 ms or 400 characters through a mutation that also reports cancellation →
  settles the usage → records the tool calls → runs them → schedules the next step, or finishes (model stop, 12 steps,
  10-minute deadline, budget refusal). A rate-limited step waits and retries.
- `cancel` marks the turn `cancelling` and bumps `gen`: the step aborts the stream at its next flush, or stops between
  tool calls. A turn waiting for a confirmation is cancelled at once.
- Command and request ids of tool calls are UUIDv5 of (turnId, callId), replacing any id the model wrote, so a replayed
  approval or a re-run step never applies a command twice.
- A cron (`assistant sweeper`, every minute) fails turns past their deadline, finishes cancellations whose step died
  and denies unanswered confirmations.

**Queued messages** (`assistantQueue {roomId, subject, epoch, threadId, clientId?, text, status: queued|delivered|removed, held?, turnId?, messageId?}`,
keyed by (player, game) like the threads). The composer stays usable while the assistant works:
- A `send` while the turn is running, waiting on a card or stopping is queued for that turn's conversation (at most 5,
  each ≤ 4,000 characters; CONFLICT for another conversation of the game). The pane shows it as queued, editable
  (`editQueued`) and removable (`removeQueued`) until delivered. The queue is in Convex, so it survives reloads and
  every tab or app of the player sees it (`assistant.status` `queued`).
- **Step boundary.** Before each model step that follows a tool step (its calls resolved and their results stored),
  queued messages become user messages of the turn, in order (`assistant/store:deliverQueued`). The history puts them
  in the user message that carries that step's tool results, after the results and an engine note
  (`rules.ts QUEUED_NOTE`): for Anthropic the `tool_result` blocks then text blocks in one user message; for OpenAI the
  `tool` messages right after the assistant's `tool_calls`, then one user message with the texts. The model reads them
  in the same turn and can change course. Not at the step ceiling (they wait for the next turn).
- **No tool step.** A turn that ends (done, failed, step limit, budget) with messages still queued starts the next turn
  in the same conversation at once, with all of them as its prompt.
- **Exactly once.** Delivery marks each row `delivered` in the same mutation that inserts its message, so of two racing
  deliveries one finds nothing (Convex mutations are serializable). `clientId` (the pane sends a UUID) makes a retried
  send return the same row, queued or delivered, never a second message.
- **Cards.** A queued message never approves anything. It declines a card that is waiting (the result tells the model
  the player sent a message instead and to ask again if still wanted), and while a message is queued a call that would
  need a card is declined the same way rather than shown, so the player's latest words decide before any card. The
  model then reads the message beside the declined result.
- **Stop** keeps the messages queued so far, marked `held`: they never go into the stopped turn and start nothing
  by themselves. They go first in the player's next message's turn, or now with `sendQueued`; the pane says so. A
  message sent after Stop, while the step winds down, is not held and starts the next turn when the cancellation lands.
  A new game drops the last game's queue.
- **Accounting.** A queued message costs nothing until delivered. Its text is then part of the next step's input, so
  that step's reservation estimate (made after delivery) includes it and settles to what the step cost, as for any
  message.

**Confirmation.** `summon_agent` (unless the player set "auto-approve summons up to N bits" and this turn validated the
same source at most at N), `send_chat`, `pause_game`, `destroy_agent`, `delete_panel`, `delete_setup` and every owner tool wait for a card:
the call goes `awaiting_confirmation`, the turn pauses with no action open, the pane shows the exact payload, and
`assistant.confirm(toolCallId, approve|deny)` resumes it (a new `gen`). Unanswered after 2 minutes, the call is denied.
Reads, `validate_agent`, `set_ready`, `wake_engine`, panel saves (`save_panel`, `rollback_panel`) and the layout tools
(at most two layout changes per step) run automatically and show as activity chips. A tool the grant does not allow is
refused at once (FORBIDDEN), with no card.

**Models and budget.** `lib/ai-player`'s `ChatProvider` (`stream({system, messages, tools, maxOutputTokens, signal,
onText})`) has Anthropic Messages and OpenAI chat-completions adapters (direct endpoints, catalog prices, no retries;
a max-tokens or other incomplete stop is an error) and `mockChatProvider()` under `AI_MOCK=1` (a message
starting with `/mock {json}` scripts the steps; anything else reads the observation and summarizes it). Seats and the
assistant explain the game with one `GAME_PRIMER`. The model is offered the registry's JSON Schemas for the
credential's permission, without the engine-derived ids. The separate assistant pool: an equal allowance per human per
game and the model, approved by the owner in the AI budget card (default 0 = off); `ASSISTANT_GAME_USD` per room per
game, `DAILY_ASSISTANT_USD` per day; per-player and per-room call rates (`convex/lib/aiModels.ts`).

**Cost.** Anthropic requests cache the tools and system prompt (an explicit breakpoint) and the conversation so far
(top-level automatic caching), so a turn's later steps read most of their input from the cache; OpenAI caches the same
stable prefix automatically (`prompt_cache_key` per thread). The allowance counts billed tokens (a cache read at its
price relative to input; `lib/ai-player` `usageCost`) and USD uses the catalogue's cache prices. A step's reservation
is its input estimate (Anthropic `count_tokens`; otherwise a characters-per-token ratio measured from live usage,
`CHARS_PER_TOKEN`) with a margin, at its dearest price, plus the 8,192-token output ceiling; it settles to the actual
cost, even past the reservation. A cancelled step is billed from what was known: the input the provider reported when
the stream opened (else the estimate) and the streamed output plus hidden reasoning time at a speed bound. An earlier
turn that ended without its answer (allowance, failure, cancellation) is followed in the model's history by an
"Engine note" saying so, so the next turn neither treats it as answered nor answers it unasked. A tool result clipped
to 8 KB starts with a `TRUNCATED` field naming what was kept of what, and the prompt forbids counts from it.

**Safety.**
- Tool results reach the model as the registry's untrusted JSON (`{untrusted: true, notice, data}`); the system prompt
  says only the player's messages are instructions.
- Public chat is never sent without the player's confirmation.
- Logs record ids, tools, outcomes and usage, never message text or tool arguments.
- Threads, messages and tool calls are readable only by their human (`assistant.thread(s)` check `subject`, and a
  player credential reaches its own room only); stored tool results are the human's own projections.
- **Per (player, game).** Everything the assistant works from is keyed by human and game: threads (with their turns,
  briefings, history window, messages, tool calls and cards), the allowance, code runs and the stored objects other
  than saved scripts (`docs/assistant/code-execution.md` §5). Starting a game ends the room's active turns (a waiting
  card is denied), `assistant.threads` lists only the current game's, and `assistant.send` refuses an earlier game's
  thread (CONFLICT), so a new game begins with an empty context. An earlier game's threads stay readable by their human
  (`assistant.threads {gameId}`, `assistant.thread`); the assistant's own tools never reach that game's runs or
  objects. The player's choices stay: the summon auto-approve preference, the assistant credential, panels and layout.
  The pane follows the game reactively: `assistant.status` names the current `game`, and the pane renders one
  conversation component keyed by it, whose transcript is the query `assistant.transcript {roomId, gameId, threadId?}`
  (that game's thread only, whatever id the client names) and whose `send` names the game (CONFLICT once another is
  current). When the game changes, the query arguments change and the old game's state is gone, without a reload.

**UI** (`artifacts/player-web/src/core/assistant/`): a core drawer behind the header's "Assistant" toggle, in hosted and
dev-server modes: streaming messages, tool chips (expandable to the exact arguments and the outcome), confirmation cards
with a countdown, Stop, the allowance meter, the permission choice on first use, and an explanation while the owner has
not enabled it. The owner's side is the "In-client assistant" part of the engine UI's AI budget card.

**Deferred.** Phase 2 **watches**: declarative per-tick triggers for AI-speed tactics, open to every surface. A browser
e2e of the drawer (the unit-tested UI state and the engine suite cover the behaviour).

## 7. Decisions

1. **Auth library: Better Auth served by Convex** (`@convex-dev/better-auth` 0.12.x with `better-auth` 1.6.x, exact pins). Convex Auth is still beta, has a v1→v2 migration ahead, and keeps tokens in localStorage.
   - **Session and tokens:** the session lives in an HttpOnly cookie on the deployment's own origin, and the engine UI gets Convex JWTs from `/api/auth/convex/token`. Player clients, the hosted one included, never use it: they hold room-scoped player JWTs (docs/external-clients.md, 2026-11-01).
   - **Identity:** the god id is the Better Auth user id. A `users` row is kept by component triggers and stores the Google `sub` for audit.
   - **Player JWTs:** they move to their own issuer, `<site>/api/device`, so the two token kinds are told apart by issuer.
   - **Tests:** the local fake OIDC server is a `genericOAuth` provider that is enabled only under `TEST_FIXTURES`.
   - **MCP OAuth:** our own small endpoints (§4), not Better Auth's MCP plugin.
   - **Browser sessions:** 24 h.
2. **Pilot data:** none exists beyond local tests, so there is no migration (clean break).
3. **Stored panels:** sandboxed iframes; compile-time syntax checks only in phase 1; scoped to the human; `act` credentials may write.
4. **MCP:** stateless JSON. OAuth with DCR and CIMD, plus raw `cgc_` bearer tokens. One room per connection. `evaluate_value` covers the caller's own utility only. The CLI becomes an MCP client.
5. **Assistant:** a separate pool, an equal allowance per seated human, default off, owner-approved. Confirmations as in §6. No public "via assistant" label: delegation is to the same human. Watches are deferred.
6. **Artifacts:** an experimental, slow-dashboard surface. 1 Hz play stays on the clients built on Convex.
   - **Reference page** (Wave 2B): `clients/claude-artifact/template.html`, with its pure logic in `core.js` (unit-tested with
     `node --test`) inlined by `build.mjs` into `dist/template.html`, the file that gets published. It declares
     `capabilities: {mcp: {servers: [{server: "Code Gods", tools: [whoami, get_observation, get_receipt, send_chat,
     validate_agent, summon_agent, set_ready]}]}, sample: {}}`. Game data is rendered as text only.
   - **Probe:** `probe.html` reports whether the artifact runtime allows `new Function`, sandboxed `blob:` and `srcdoc`
     frames, `postMessage` and `MessagePort` round trips, and blob Workers: the prerequisites for running stored panels
     (`panel-runtime.js`) inside an artifact. It still has to be run in claude.ai.
   - Verified only locally, against a stand-in for the runtime (`dev/claude-stub.js`, `pnpm run smoke:artifact`). A live
     claude.ai check is still open (README).

## 8. Waves and ownership

| Wave | Owner area | Depends on |
|---|---|---|
| 0: baggage | root config, `artifacts/{code-gods,player-web}` build config and wording, `lib/player-client` wording, docs wording, deletion of `mockup-sandbox` and `scripts` | — |
| 1A: identity | `artifacts/engine/convex/auth/**` (except the credential kinds in §3), `auth.config.ts`, the engine UI sign-in, the player-web sign-in, `scripts/dev.mjs`, test sign-in helpers in every suite | 0 |
| 1B: agent interface | `lib/player-client/src/tools.ts` and the CLI, `artifacts/engine/convex/agent/**`, credential kinds and `viewerForCredential`, the OAuth endpoints, the engine UI `/connect` page | 0 |
| 1C: stored panels | `artifacts/engine/convex/panels/**`, `artifacts/player-web/src/{shell,sdk}`, the panel frame, the CSP plugin | 0 |
| 2: assistant, artifacts, docs | `convex/assistant/**`, `lib/ai-player` ChatProvider, `player-web/src/core/assistant`, `clients/claude-artifact`, the final docs and memory pass | 1A–1C |

The coordinator integrates each wave, runs every suite (`.claude/skills/code-gods-testing/SKILL.md`), reviews, and merges to `develop` through a PR.
