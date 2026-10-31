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
| **Hosted client** (`/player/` on the deployment) | Convex WebSocket, browser session | the client's own commands | stored panels, in sandboxed frames | in-client assistant (Convex) |
| **Dev container** (any Vite environment: local, Codespaces, Gitpod, Replit, …) | Convex WebSocket, JWTs from the dev server's `/__codegods/token` after the private launch link | same | file panels (HMR, in-process) **and** stored panels | the environment's coding agent through MCP or the CLI, plus the in-client assistant |
| **Claude** (chat, Claude Code) | MCP tool calls | MCP tools | writes stored panels through MCP; the human watches the hosted client | Claude itself |
| **Claude artifact** (claude.ai page; `clients/claude-artifact/`) | the Code Gods connector through the page's `mcp` capability: `watchTool` on `get_observation` and `whoami` (about 30 s polling floor, paused while hidden) | `callTool` on a click: `send_chat` (confirmed in the page), `validate_agent`, `summon_agent`, `set_ready`; ambiguous failures check `get_receipt` and resend with the same `commandId` | Claude republishes the page; whether it could render stored panels is what `probe.html` checks | Claude, plus the page's `sample` ("Ask Claude") |

The engine UI (`/`) stays the common room display and owner control panel. Sign-in, device and connector approval, and credential management live there.

## 2. Identity (Wave 1A)

- **Google is the only sign-in,** through Better Auth served by Convex (§7.1).
- **Identity key.** A human's god id is a stable key derived from the auth library's user record, which is tied to Google's `sub`.
- **Display name.** Google's given and family names give the full name.
- **Admins.** The admin rule is an allowlist of verified Google emails (`CODE_GODS_ADMIN_EMAILS`).
- **Removed.** Replit OIDC, the relay page and all `REPLIT_*` variables are deleted.
- **Local tests.** Tests sign in without Google, through a test-only path that only works when `CODE_GODS_TEST_FIXTURES` or `CODE_GODS_DEV` is set on the local deployment. Production refuses it.
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
- The in-client assistant: `kind: "assistant"`. It is created when the human enables the assistant in a room, with a permission the human chooses (default `act`), and is listed and revocable like any other.

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
| Panels (act) | `list_panels`, `get_panel`, `save_panel`, `delete_panel`, `rollback_panel`, `place_panel` |

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

**Public API.** `panels.list`, `panels.code`, `panels.save`, `panels.rollback`, `panels.setEnabled`, `panels.remove`, `panels.place`, `panels.layout` and `panels.setLayout`. Each has an internal twin taking `principal`, named `<fn>As`, for the registry.

**Client (`artifacts/player-web`).**
- The shell registry merges file panels with stored panels from `panels.list`. On an id clash the file panel wins and shows a "shadows stored vN" badge.
- **Isolation:** stored panels run in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) served as `/player/panel-frame.html`, with its own meta CSP (`connect-src 'none'`).
- **Bridge:** a postMessage bridge carries the same `@sdk` API. The SDK is built twice with a swapped transport: `useQuery` on the host, bridge subscriptions in the frame. Panels keep real React hooks.
- **Confirmations:** the host enforces a confirmation for `chat`, `summon`, `destroy` and `pause` coming from a stored panel. A per-panel "let it act" grant is set by the player and reset whenever a non-browser author writes a new version.
- **Failure handling:** a crashing panel stays inside its frame. `?panels=off` is safe mode.
- **File panels** stay in-process with HMR (dev containers only). A "run sandboxed" toggle proves a file panel works as a stored one.

**Hosting and CLI.**
- The production `/player/` page gets a build-time meta CSP: `connect-src` limited to the deployment, `script-src 'self' 'unsafe-eval'`, which the utility evaluator needs.
- The CLI's `pnpm player panel push|pull <slug>` moves panels between `src/panels/` and the store, through the registry tools.

## 6. In-client assistant (Wave 2)

**Data.** `convex/assistant/`:
- `assistantThreads`, `assistantTurns`, `assistantMessages`, `assistantToolCalls`;
- `assistantAllowances {roomId, subject, epoch, usedTokens}`.

**Turn loop.** One scheduled Node action per model step, chained with a generation number.
- Streaming text is patched into the message document about every 250 ms.
- Only one active turn runs per (room, human).
- Cancellation takes effect between steps and between stream flushes.
- A cron fails turns that pass their deadline.

**Tools.** The registry executors, run in-process with the human's `assistant` credential as principal. There is no other path to game state.
- **Need confirmation** (a card in the chat): `summon_agent` (unless the player sets "auto-approve summons up to N bits"), `send_chat` (always), owner tools (always) and `delete_panel`.
- **Run automatically and listed as activity chips:** reads, `validate_agent`, `destroy_agent`, `set_ready` and panel saves.

**Models and budget.**
- `lib/ai-player` gains a streaming, tool-using `ChatProvider` (Anthropic and OpenAI) plus a scripted mock (`CODE_GODS_AI_MOCK`).
- It is paid by the deployment's provider keys from a separate **assistant pool**. The room owner approves an equal allowance per seated human per game, and the model, in the existing AI budget card. The default is 0, so the assistant is off until approved. There are per-player and per-room rate limits and a daily USD ceiling.

**Safety.**
- Game data reaches the model only as untrusted JSON tool results.
- Public chat is never auto-sent.
- Logs record ids, tools, outcomes and usage, never message text.
- Threads are visible only to their human.

**UI.** A core drawer in player-web (`src/core/assistant/`) with:
- streaming messages, tool chips and confirmation cards;
- a Stop button;
- an allowance meter.

**Deferred.** Phase 2 **watches**: declarative per-tick triggers for AI-speed tactics, open to every surface.

## 7. Decisions

1. **Auth library: Better Auth served by Convex** (`@convex-dev/better-auth` 0.12.x with `better-auth` 1.6.x, exact pins). Convex Auth is still beta, has a v1→v2 migration ahead, and keeps tokens in localStorage.
   - **Session and tokens:** the session lives in an HttpOnly cookie on the deployment's own origin. Both SPAs share it with no cross-domain plugin, and get Convex JWTs from `/api/auth/convex/token`.
   - **Identity:** the god id is the Better Auth user id. A `users` row is kept by component triggers and stores the Google `sub` for audit.
   - **Player JWTs:** they move to their own issuer, `<site>/api/device`, so the two token kinds are told apart by issuer.
   - **Tests:** the local fake OIDC server is a `genericOAuth` provider that is enabled only under `CODE_GODS_TEST_FIXTURES`.
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
