# Convex migration plan: one Convex deployment, no separate server

Branch `claude/convex-migration`. This plan moves Code Gods' authoritative engine, persistence, auth and
static hosting onto **one Convex deployment** and deletes PostgreSQL and the Express server. It also
specifies how each player's duplicated Replit app becomes a distinct, live-moddable game client of
that one engine, with the player's Replit Agent acting as their room assistant.

The plan comes first. Sections marked **Measured** are filled in from local runs as the work lands
(see §11). Sources for Convex behaviour are cited inline. I checked each one on 2026-10-28 and did
not rely on memory.

## 0. Decisions that change standing rules

| Standing rule (`.agents/memory`) | Now | Why |
|---|---|---|
| Persist in Replit's built-in PostgreSQL | **Convex is the only store.** No PostgreSQL, drizzle, `DATABASE_URL` or PG queue | The user decided to migrate to Convex ("eliminating use of postgres") |
| Deploy on Replit Autoscale, max one instance; Replit Publish | **Convex hosts everything**: functions, data, file storage, static frontends | "Convex should host the static engine frontend and the default client frontend with no need for any separate server" |
| Queue DB writes asynchronously with bounded batching | Replaced by **batched engine ticks**: one commit mutation per tick (§3) | The same goal (no write per interaction) in Convex's transactional model |
| Room credentials last 15 minutes, held only in daemon memory, never persisted | A player app holds a **revocable, scoped, expiring room credential in Replit Secrets** and exchanges it for 10-minute JWTs (§5) | The user asked for onboarding that "stores the scoped credential in Replit Secrets". The credential is room-bound, permission-bound, revocable from the engine UI, and expires after 7 days by default |
| Close connections after 30 minutes without human activity | Kept, as **tick-loop parking**: no ticks are scheduled after 30 minutes without human activity, and the game enters `recovery` with auto-resume | Convex bills function time; a parked loop costs nothing |

All other product rules still hold: aggregate-only disclosure of opponents' utilities, public chat
only, at least 3 players, rooms as unnamed lobbies with history, full verified names, AI players
funded by server-side provider keys with budgets, "utility function" terminology, object uniqueness,
summon pricing, two energy accounts, the 2-bit floor and information scoring.

## 1. Target architecture

```
                   ┌──────────────────────── Convex deployment ─────────────────────────┐
 Engine UI  ───────┤ https://<dep>.convex.site/          static: artifacts/code-gods       │
 (browser)         │ https://<dep>.convex.site/player/   static: artifacts/player-web      │
                   │ https://<dep>.convex.site/api/*     HTTP actions: OIDC login, device  │
                   │                                     flow, JWKS, token exchange        │
 Player app #1 ────┤ wss://<dep>.convex.cloud            queries / mutations / actions     │
 (Replit dev,      │   reactive queries (disclosure-filtered projections)                  │
  Vite + HMR) ─────┤   mutations (commands, lobby, owner actions, chat)                    │
 Player app #2 ────┤   engine: tick action ("use node", sandboxes) → commit mutation       │
 Player app #3 ────┤   AI seats: scheduled actions per seat (provider keys in env vars)    │
 Replit Agents ────┤   crons: watchdog, idle parking, credential/session expiry GC          │
 (assistant CLI)   │   file storage: CPython WASI bundle, static assets                    │
                   └────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Package layout after the migration

```
artifacts/engine/            NEW. The Convex project (package @workspace/engine)
  convex.json                node.externalPackages for the sandboxes
  convex/schema.ts           tables (§2)
  convex/auth.config.ts      customJwt provider = this deployment's own issuer (§5)
  convex/http.ts             /api/* HTTP actions + static routes for both frontends (§7)
  convex/lib/*.ts            pure helpers shared by functions (projection, access checks, world clock)
  convex/rooms.ts lobby.ts commands.ts chat.ts admin.ts history.ts   queries/mutations
  convex/engine/tick.ts      "use node" tick action (sandbox + scoring), commit.ts (mutation)
  convex/ai/*.ts             AI seat turns ("use node" for provider SDKs)
  convex/auth/*.ts           OIDC login, sessions, device approval, credentials, JWT minting
  scripts/                   dev runner, local OIDC stand-in, static upload, Python bundle upload
lib/game-core, game-types, game-utilities, object-views    unchanged (pure TS)
lib/game-runtime             sandboxes, in-process: QuickJS (TS) and CPython-WASI on Node (Python) (§4)
lib/player-client            protocol types + Convex client SDK, room-assistant CLI, connect CLI
lib/ai-player                model policy and budgets, run by the Convex AI seat action
artifacts/code-gods          engine/lobby UI on the Convex React client
artifacts/player-web         default player client + live panels system and Panel SDK (§8)
DELETED: artifacts/api-server, lib/db, lib/api-spec, lib/api-zod, lib/api-client-react,
         the PG docs and env, scripts/player-pilot.sh, the device daemon and local socket bridge
```

The OpenAPI/orval layer goes away. The Convex-generated `api` object, with argument validators and
inferred return types, is the contract. `lib/player-client` keeps the v3 observation and command
types and Zod schemas, so external clients and the assistant validate what they receive.

## 2. Data model (Convex tables)

Every table has the indexes its queries need. No query does a full scan over growing tables.

| Table | Key fields | Notes |
|---|---|---|
| `users` | `subject` (Replit `sub`), `name` (full verified name), `email`, `emailVerified`, `issuer` | upserted at login |
| `sessions` | `tokenHash`, `userId`, `expiresAt` | browser refresh sessions (HttpOnly cookie on the convex.site origin) |
| `oidcFlows` | `keyHash`, `verifier`, `state`, `nonce`, `returnTo`, `expiresAt` | 10-minute login transactions |
| `rooms` | `shortCode`, `ownerId`, `createdAt`, `revision`, `settings`, `aiBudget`, AI usage counters, `activeGameId` | the lobby; no name |
| `members` | `roomId`, `userId \| aiSeat`, `name`, `kind`, `ready`, `aiAgent` | one doc per seat |
| `games` | `roomId`, `shortCode`, `phase`, clocks (`worldSeconds`, `lastTick`, `endAtWorld`, `nextSpawn`, `planningEndsAt`, `pauseEndsAt`), `settings` snapshot, `roster`, `executionEpoch`, `tick` lease, `seasonCommitment`, `summary` (when ended) | `endAtWorld` is never projected |
| `deities` | `gameId`, `userId`, `utility` (descriptor, **private**), `spent`, `pauseUsed` | never returned raw |
| `objects` | `gameId`, `value`, `version`, `scores` (per god, **private**), `salience` | ≤ 2,000 per game; `by_game_value` index enforces uniqueness |
| `agents` | `gameId`, `ownerId`, `source` (private to owner), pricing fields, `account` (energy), `acts`, `spent`, `destroyed` | per-agent energy account |
| `tickBatches` | `gameId`, `seq`, `events[]` (spawns, transforms, failures with costs and per-god scores) | one doc per committed tick; the event log. Queries project per viewer (§6) |
| `chat` | `roomId`, `authorId`, `authorName`, `kind`, `text`, `timestamp` | public only |
| `receipts` | `roomId`, `actorId`, `scopeKey`, `requestId`, `hash`, `result` | idempotent commands |
| `aiTemplates` | name, provider, model, prompt (≤ 10,000 chars), revision, `deleted` | admin-editable, seeded once |
| `aiUsage` | per-room reservations, per-UTC-day spend | budgets enforced in mutations |
| `devices` | `userCodeHash`, `deviceSecretHash`, PKCE challenge, `roomId`, requested permission, label, status, `expiresAt` | device approval requests |
| `credentials` | `tokenHash`, `userId`, `roomId`, `permission` (`read`/`act`/`owner`), `label`, `expiresAt`, `revokedAt` | scoped player-app credentials |
| `activity` | `lastHumanActivityAt` (singleton) | drives idle parking |
| `runtimeAssets` | `name`, `sha256`, `storageId` | the CPython WASI bundle in file storage |

Calibration and synergy tables stay **in the code bundle** (`lib/game-utilities/data`, 4.5 MB of
JSON). Only the Node tick action and the summon examination load them, and they load only the table
of the game's instantiation. The default Convex runtime (64 MiB memory) never imports them. File
storage remains an option if the tables outgrow the bundle (limit: 230 MB of code per deployment,
[docs.convex.dev/functions/bundling](https://docs.convex.dev/functions/bundling)).

## 3. Engine loop for Convex's execution model

Convex constraints that shape it ([docs.convex.dev/production/state/limits](https://docs.convex.dev/production/state/limits)):
queries and mutations get 1 s of user code, 64 MiB, and at most 16,000 document writes and 16 MiB
per transaction. Node actions get 10 minutes and 512 MiB, but no transactions: they read through
queries and write through mutations. Mutations are serializable, and Convex retries them on
optimistic-concurrency conflicts.

### 3.1 Tick = one Node action + one commit mutation

```
 commit mutation (tick n) ──schedules──▶ tick action (n+1) ──runMutation──▶ commit mutation (n+1) ──▶ …
```

1. **Lease.** `games.tick = {seq, leaseUntil}`. Only the commit mutation that holds the current
   `seq` schedules `seq+1`. A cron watchdog (every minute) restarts a running game whose lease
   expired, so a crashed action never stalls a game. Exactly one loop runs per game.
2. **Read.** The tick action reads one consistent snapshot through an internal query: game clocks,
   live objects (value, version, scores), live agents (source, pricing, account), the settings
   snapshot and the epoch.
3. **Simulate a window.** It advances the wall clock to `now` and processes the interactions due
   in `(lastTick, now]`, up to `interactionRateHz × Δt`, but **at most one tick window of 1.0 s**
   (setting `tickSeconds`, 0.25–1.0). It never catches up past that ("upper limit, no interaction
   debt"). For each opportunity it runs the existing semantics, **sequentially against the in-memory
   copy**:
   - pick the target object (`uniform` or `shelter`) and an *eligible* agent (energy ≥ expected
     cost, settled to the opportunity's world time), using a CSPRNG;
   - run the agent in the sandbox with the HMAC-derived seed `deriveSeed(salt, ["play", gameId, agentId, actIndex])`
     and a frozen clock;
   - `applyCalls`; enforce **uniqueness** against the in-memory world (onto any existing value,
     the object's own included, fails); apply the commit clause using only the owner's bits and the
     peer aggregate;
   - charge the act (`actCharge`: decision + erasure + motion + the **2-bit floor**; a failed or
     duplicate act pays decision + floor) on the agent's account. The account may go negative
     (cooldown);
   - score a changed object for every god with the shipped surprisal tables and floored peer care
     (`payoff = n_own · max(0, Σ_peers n)`).

   Because the window is simulated sequentially in one process, uniqueness and per-agent cooldowns
   hold *within* the batch exactly as they did in the Express engine. Interactions inside one window
   are serialized, not overlapping; the Express engine overlapped up to four.
4. **Commit.** One `engine.commit` mutation receives the window's results: changed objects
   `{id, fromVersion, value, scores}`, agent account states, spawns, the clock advance and the event
   batch. It re-validates everything against the database:
   - the game id, phase and `executionEpoch` must be unchanged (pause, end and recovery bump the
     epoch, which discards the whole window);
   - each object's `fromVersion` must match. If a player command touched nothing the window used,
     the batch commits;
   - a destroyed agent's acts are dropped. Its absolute account state is not written back;
   - uniqueness is re-checked through the `by_game_value` index;
   - spawns and the world clock (`advanceWorld`: Poisson spawns, lifetime end, the 2,000-object
     limit) are applied in the same transaction.

   Then it schedules the next tick: immediately if work is pending, or at the next deadline
   (planning end, pause end, next spawn) if no agent is eligible. If validation fails, the window
   is discarded and the next tick re-reads. Discarding is safe because no act's effect was visible
   yet. A discarded window is counted and logged, never retried blindly.
5. **Writes per tick.** Changed objects (bounded by the window's acts) + touched agents + 1
   `tickBatches` doc + the game doc. At 100 Hz and 1 s ticks that is ≤ ~210 writes per commit,
   well under the 16,000 limit. One event doc per tick, not one per act, keeps history storage
   proportional to ticks.

**Determinism and secrecy.** The season salt comes from the Convex environment variable
`CODE_GODS_SEASON_SALT`, which the deployment refuses to run without in production. Only Node
actions read it, to derive seeds. Games record its sha256 commitment. Target selection, agent
selection and spawns use `crypto.getRandomValues`. Agent execution itself is deterministic given
(source, input, prelude, seed).

**Reactivity.** Clients subscribe to queries over `objects`, `agents` and `tickBatches`. A commit
invalidates them once per tick, so subscriptions update at the tick rate (1 Hz), never at the
interaction rate. That is the server-side half of the Panel SDK's throttling (§8.3).

### 3.2 Throughput estimate (measured results in §11)

From `lib/game-runtime/README.md`'s warm benchmarks: a TypeScript act takes ≈ 1.8 ms and a Python
act ≈ 13–20 ms, in-process and sequential. Per tick action, single-threaded:

| Language | acts/s per game (estimate) | vs default cap 100 Hz | vs max 1,000 Hz |
|---|---|---|---|
| TypeScript | ≈ 300–500 | fits | not reachable on one thread |
| Python | ≈ 50–70 | **below the default** on one thread | not reachable |

Options to raise the ceiling, measured in §11: (a) `worker_threads` inside the tick action (Node
actions have 512 MiB; each Python worker holds a ~40 MiB snapshot, so 4 workers fit); (b) split the
window across parallel tick actions per object shard, each committing its own batch (OCC keeps it
correct, but there are more conflicts); (c) a shorter tick for lower latency. Commit-mutation cost
is measured separately. **The honest ceiling is whatever §11 records. The cap setting stays 100 Hz
by default and up to 1,000 Hz, and the engine simply runs below the cap when capacity is lower,
exactly as the user specified ("an upper limit").**

### 3.3 Commands and phases

Commands are mutations: validate, summon, destroy, ready, pause, chat, plus owner actions (settings,
start, end, resume, add or remove AI seats, the AI budget). Summon and validate need the sandbox
(examination runs the agent on the reference mixture), so they run as an **action**: examine, then
call an internal mutation that checks energy, the agent cap and the phase, writes the agent and
stores the receipt. The idempotency key is per (room, god, requestId). A reused id with a different
payload is rejected. Pause bumps the epoch and schedules the tick at `pauseEndsAt`.

## 4. Agent sandboxes inside Convex Node actions

Requirements kept from `lib/game-runtime`: frozen virtual clock (2026-01-01, +1 µs per read),
HMAC/season-seeded `random`, a deterministic step budget, no host access, no state across acts, and
compilation and startup outside the per-act budget.

- **TypeScript (QuickJS-Wasm).** Run in-process inside the tick action instead of in a child
  process: the type-check plus transpile cache and a fresh QuickJS runtime per act. The behaviour of
  `typescript-worker.mjs` moves into a module that both the worker and the in-process path use.
  `quickjs-emscripten` and `typescript` are listed in `convex.json` `node.externalPackages`, so
  their `.wasm` files and lib `.d.ts` files load from `node_modules` on the server.
- **Python (CPython 3.15 WASI on Node's WebAssembly).** The current host is `wasmtime-py` in a
  separate Python process. Convex's Node runtime has no Python, so the host moves to JavaScript:
  - the reactor transform (`reactor.py`) runs **offline**: the pinned `python.wasm` is transformed
    once into `python-reactor.wasm`, recorded by sha256;
  - the JS host implements the same WASI import table: only `clock_time_get`, `clock_res_get` and
    `random_get` are answered (virtual clock, SplitMix64 from the act seed), and every other import
    is denied after bootstrap;
  - one initialized linear-memory snapshot is restored before every act (`memory.buffer.set`), and
    mutable globals are reset;
  - the step budget stays in-guest (`sys.monitoring`), so it remains deterministic. Wasmtime *fuel*
    has no V8 equivalent: the deterministic ceiling is the step budget, and the CPU/wall watchdog
    runs the guest in a `worker_thread` that the host terminates. The README's determinism section
    is updated to say exactly this.
  - Distribution: the CPython bundle (`python-reactor.wasm` + stdlib zip, ~30 MB) is uploaded to
    Convex file storage by `pnpm engine:upload-runtime`, recorded in `runtimeAssets` with its
    sha256, and fetched once per warm Node instance into `/tmp`, where the sha256 is verified.
- **Fallback if Python on V8 misses the budget:** Pyodide (Python 3.13, CPython compiled for
  Emscripten) with the same seeding, step and capability rules. Its weaker spot is per-act
  isolation inside one interpreter, mitigated by snapshotting. The options and trade-offs are
  recorded in §11 rather than silently dropping Python. **Measured:** cold start, per-act warm cost,
  and memory, for both languages.

## 5. Auth: Replit identity, Convex JWTs, device approval

- **Issuer.** The deployment is its own OIDC-style issuer. `convex/auth.config.ts` declares a
  `customJwt` provider with issuer `CONVEX_SITE_URL`, a JWKS URL `CONVEX_SITE_URL/api/.well-known/jwks.json`
  and RS256. The signing key is the env var `CODE_GODS_JWT_PRIVATE_KEY` (PKCS#8 PEM). JWTs last 10
  minutes and carry `sub` (user id) plus `scope` (`browser` | `player`), and for player tokens `room`,
  `perm` and `cred` (the credential id, checked against revocation on every call).
- **Browser login (engine UI and hosted player client, same origin).** `GET /api/login` →
  Replit OIDC (`https://replit.com/oidc`, client id `REPLIT_OIDC_CLIENT_ID`, authorization code +
  PKCE + nonce) → `GET /api/callback` verifies the ID token, upserts the user with the **full
  verified name**, and sets an HttpOnly, Secure, SameSite=Lax session cookie. The React client's
  `fetchAccessToken` calls `POST /api/auth/token` (cookie + same-origin check) to get a fresh JWT.
  `/api/logout` deletes the session.
- **Admins.** `CODE_GODS_ADMIN_EMAILS` (env var) is checked against the *verified* email claim
  persisted at login, as before.
- **Device approval for player apps.** `player connect <engine-url> --room CODE` → `POST /api/device/request`
  (PKCE challenge, room, requested permission `read`|`act`|`owner`, self-reported label) → the CLI
  prints the verification URL and code → the human approves on `/device` in their signed-in
  browser. An owner grant needs the owner's extra consent and must come from the current room owner →
  `POST /api/device/poll` returns the **credential** once. The human stores it in Replit Secrets as
  `CODE_GODS_CREDENTIAL` (and `CODE_GODS_ENGINE_URL`).
- **Credential → JWT.** `POST /api/device/token` with the credential returns a 10-minute player JWT.
  In a player app the long-lived credential never reaches the browser: the Vite dev server (and
  the production preview server) exposes a same-origin `/__codegods/token` middleware that does the
  exchange server-side, and the browser receives only short JWTs. The assistant CLI does the
  same exchange in Node.
- **Revocation.** The engine's player page lists the human's credentials. Revoking sets `revokedAt`;
  every query and mutation checks `cred` (an indexed point read), so a revoked credential stops
  working at once, even before its JWT expires.
- **Local tests.** A stand-in OIDC provider (`artifacts/engine/scripts/fake-oidc.mjs`: discovery,
  JWKS, authorize with a test-only identity picker, token endpoint) is selected **only** by setting
  the Convex env var `REPLIT_OIDC_ISSUER` on the *local* deployment. Production leaves it unset and
  uses `https://replit.com/oidc`. The stand-in is never bundled into the deployment.
- **Risk:** Replit's OIDC must accept `https://<dep>.convex.site/api/callback` as a redirect URI for
  the configured client. This must be checked when the real account is connected (§12). If Replit
  restricts redirect URIs to Replit-hosted domains, the fallback is a minimal callback page on the
  engine's existing Replit domain that only forwards `code` and `state` to the Convex callback. It
  holds no secrets and no state.

## 6. Disclosure enforced in queries

All reads go through functions in `convex/lib/projection.ts` (ported from
`artifacts/api-server/src/game/projection.ts`):

- `player.observation({roomId})`: the caller's own utility card, and per object the
  caller's own score plus **peer aggregates only** (`peerNetBits`, `peerCare`, `payoff`). Also the
  caller's own agents (with sources), the leaderboard (total payoffs), public chat, the room and game
  settings, and the instance (mutators and helpers). Never another god's descriptor, score,
  agent source, seed or `endAtWorld`.
- `player.history({gameId, afterSeq, limit})` and `player.trajectories(...)`: events from
  `tickBatches`, projected per viewer with the same function, so history leaks nothing that live
  state would not.
- `public.game(...)`: salience (Σ net bits), the leaderboard and roster only.
- Tests assert that no other god's per-object score or descriptor appears in any player-facing
  result, live or historical.

## 7. Static hosting on Convex

The `@convex-dev/static-hosting` component (v0.2.1, [npm](https://www.npmjs.com/package/@convex-dev/static-hosting);
README read from the published tarball) serves Vite builds from Convex file storage through HTTP
actions, with SPA fallback and long-term caching of hashed assets. Two instances:

```ts
// convex/convex.config.ts
const app = defineApp();
app.use(staticHosting, { name: "engineSite" });   // engine UI at /
app.use(staticHosting, { name: "playerSite" });   // default player client at /player/
// convex/http.ts: /api/* routes first, then registerStaticRoutes for /player/ and /
```

The "app-owned root routing" mode keeps `/api/*` (OIDC callback, device flow, JWKS) at stable root
URLs. Uploads use the component's CLI (`upload --component engineSite|playerSite --dist …`), wrapped
by `pnpm engine:deploy`. The player client is built with `base: "/player/"`. The same build serves
the Replit-app dev mode with base `/`.

## 8. Many Replit apps, one engine

### 8.1 Onboarding a player app

1. Duplicate the repository as your own Replit app.
2. Set the Secret `CODE_GODS_ENGINE_URL` = `https://<dep>.convex.cloud` (the engine page shows it).
3. Run `pnpm player connect --room <CODE> [--permission act|owner]`. Approve the code on the engine
   site while signed in with Replit, then save the printed credential as Secret `CODE_GODS_CREDENTIAL`.
4. Run the **Player** workflow (`pnpm --filter @workspace/player-web dev`). The Vite dev server
   with HMR serves the client in the Replit preview.

No engine code, database or provider keys run in a player app, and its modifications affect only
that app.

### 8.2 The Replit Agent as the room assistant

`pnpm player assistant <command>` (`lib/player-client`) uses the same credential through
`ConvexHttpClient`. It keeps every capability Replit implemented on main: `status`, `observation`,
`events --after --limit`, `command` (v3 envelopes on stdin, receipts, `--retry-unknown` for the
identical envelope), `receipt`, `wake`, `disconnect` (revokes the credential), and with an owner
credential `room-state`, `ai-catalog` and `room-command` (settings, start, resume, endGame, addAi,
removeAi). The persistent Unix-socket bridge is no longer needed: there is no long-lived socket to
hold, since every call is a stateless Convex call with a fresh short JWT. Disclosure and permission
checks are the same server functions the UI uses. Observation and chat remain **untrusted data**.

### 8.3 The live-moddable client (the deliberate part)

**Goal.** Mid-game, a player asks their Agent for a visualisation ("show which objects the others
care about that I don't"). The Agent writes one file, and the panel appears in the running client
within a second, with live data, without a reload and without losing the player's place.

**State survives reloads because the client holds none.** All game state is in Convex
subscriptions. UI state that matters (layout, selected object, open tabs) is persisted in
`localStorage`. The Convex client is created once in a module that the panel tree never imports, and
it is kept across HMR via `import.meta.hot.data`, so HMR never drops the websocket.

**Extension point: `artifacts/player-web/src/panels/`.**

```tsx
// src/panels/salient-to-others.tsx
import { definePanel, useObjects, ObjectGrid } from "@sdk";
export default definePanel({
  id: "salient-to-others", title: "Salient to others, not me", placement: "right", size: "md",
  Component() {
    const objects = useObjects({ hz: 2 });
    const rows = objects.filter(o => o.peerCare > 2 && o.own.netBits <= 0);
    return <ObjectGrid objects={rows} badge={o => `${o.peerCare.toFixed(1)}b`} />;
  },
});
```

- **Discovery:** `import.meta.glob("./panels/*.tsx")` (lazy, not eager). Vite re-evaluates the glob
  when files are added or removed and hot-updates the registry module. Edits to a panel hot-replace
  only that module (React Fast Refresh).
- **Containment:** each panel is loaded with `React.lazy` inside its own `ErrorBoundary` and
  `Suspense`. A syntax error is a failed dynamic import, a runtime error is a render error, and a
  hanging panel is a stuck suspense. All three are shown inline in that panel's frame with the
  message and a "retry" button. Vite's full-screen error overlay is disabled
  (`server.hmr.overlay: false`) so one broken panel never covers the game. The core UI
  (`src/core/**`) does not import from `src/panels/**` except through the registry. A
  `panels:check` script (lint rule `no-restricted-imports`) keeps panels from importing core
  internals; they import only `@sdk`.
- **Layout:** a dock with three regions (`left`, `right`, `bottom`), tabs within each region, drag to
  move, a size preset per panel, and hide/show. Layout lives in `localStorage` (`cg.layout.v1`) and
  can also be set from code with `placement`/`size`, so the Agent can position what it builds. New
  panels open in their declared region and never move existing ones.
- **The core game UI** (board, utility card, agents, summon editor, chat, leaderboard) is itself
  rendered from `src/core/`, outside the panel system, so a panel cannot remove it.

**Panel SDK (`src/sdk/`, re-exported as `@sdk`).** Everything the player may see, nothing more,
because every hook reads the same disclosure-filtered Convex queries:

| Hook | Returns |
|---|---|
| `useGame()` | phase, clocks, room/game codes, settings, instance (mutators, helpers), economy |
| `useObjects({hz})` | live objects with `own` bits and peer aggregates (`peerNetBits`, `peerCare`, `payoff`) |
| `useObjectHistory(id)` / `useTrajectories({hz})` | per-object value and own-bits series from the event log |
| `useEvents({limit})` | the viewer's projected event window (transforms, failures, spawns) |
| `useMyCard()` | own utility card (kid card, source, penalty) |
| `useEvaluator()` | `score(value)` → own ordinal, reward, penalty and net bits, run **locally** with `lib/game-utilities`' evaluator and the shipped calibration table for this instantiation; `applyCalls(value, calls)` for "what would this mutation do" |
| `useMyAgents({hz})` | own agents with energy, eligibility, expected cost, acts, spent; plus the energy-rate math to project cooldowns |
| `useMutators()` | the mutator catalogue with descriptions and bit costs (`describeBits`) |
| `useLeaderboard()`, `useChat()`, `useRoom()` | public standings, public chat, room and settings |
| `useActions()` | `validate`, `summon`, `destroy`, `chat`, `pause`: the same authorised functions the assistant uses (opt-in per panel) |
| `useThrottled(value, hz)` / `useSnapshot(hz)` | throttle helpers; every live hook takes `hz` (default 2, max 5) |

Rendering toolkit: `ObjectView` / `GridObject` re-exported from `lib/object-views`, plus small
`Sparkline`, `BarList`, `Heatmap`, `ScatterPlot`, `Timeline` and `Table` components (SVG, no chart
dependency). They are colour-blind safe and theme aware.

**Agent-facing docs in the player app.** `artifacts/player-web/AGENTS.md` (also linked from
`replit.md`) and `docs/panels.md` contain the SDK reference, file conventions, performance rules (no
subscriptions above 5 Hz, memoise derived data, cap DOM nodes, never poll), the disclosure rule
(inference from aggregates only), and how to test a panel. Example panels (shipped in
`src/panels/examples/`, enabled by moving them to `src/panels/`):

1. my bits over time per object; 2. salient to others but not me; 3. inferred opponent interests
from aggregate movements (peer aggregate deltas against the calls that caused them, labelled as
inference); 4. mutator cost-vs-yield explorer; 5. agent energy and cooldown timeline;
6. "what would this mutation do to my score" (local evaluator); 7. chat-linked object mentions.

**Inspecting the live metagame while writing code.** `pnpm player state [--pretty] [--objects N]`
dumps the player-visible observation (the same projection the panels get) as JSON.
`pnpm player state --watch 2` streams diffs. `pnpm player sample-panel <name>` scaffolds a panel
from the current instance's field names. The Agent therefore writes panels against real data.

**Isolation.** Panels run only in the player's own app and browser, with that player's credential.
The engine stays authoritative: every action goes through the same server mutations with
permission checks, so a modified client can do no more than the human could.

## 9. AI seats

An AI seat runs as a scheduled action chain per (game, seat). Each turn: build the seat's observation
(same projection, `self.isAI = true`) → `lib/ai-player` policy → provider call (Anthropic or OpenAI;
keys in the Convex env vars `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`) → validate and summon through the
same command path → reschedule (backoff on errors, stop after five failures, visible status). Budget
reservations (tokens, room USD, $2 per game, $5 per UTC day) are taken in a mutation **before** the
call, and are never refunded on failure. Turns are not scheduled while the game is parked or
paused. The test provider `mock` is enabled only when the env var `CODE_GODS_AI_MOCK=1`.

## 10. Test plan (all local; no Convex account)

- **Backend:** the official CLI `npx convex dev` in local mode (verified in this container: the
  CLI downloads the `precompiled-*` local backend; queries, mutations, Node actions, HTTP actions and
  file storage all work). `artifacts/engine/scripts/dev.mjs` starts it with test env vars (season
  salt, JWT key, `REPLIT_OIDC_ISSUER` → stand-in OIDC, `CODE_GODS_AI_MOCK=1`).
- **Unit and integration (Vitest + `convex-test` where it fits; live local backend otherwise):**
  the ported game integration (Int, string, Grid lifecycles; uniqueness; energy and cooldown; the
  floor; scoring parity with game-core), lifecycle (lobby → start → pause → end → history), the
  runtime parity suites (Python ≡ TS ≡ grid-lab), the disclosure tests, auth and device flow,
  receipts and idempotency, AI budgets with the mock provider.
- **Multi-client E2E (Playwright):** the engine plus **three player-web dev servers on different
  ports**, each with its own identity, credential and panels directory (separate checkouts of
  `artifacts/player-web` to simulate separate Replit apps). Humans are driven by Playwright, plus one
  mock AI seat. Full games on Int, string and Grid.
- **HMR test:** during a running game, write `panels/test-live.tsx` into client A. Assert it appears
  without a navigation (the `performance.navigation` count and a sentinel `window.__cgBoot` value are
  unchanged), its value updates as ticks commit, and clients B and C are unchanged. Then write a
  syntax error: the error shows inside that panel's frame, and the board and other panels still update.
- **Assistant path:** the assistant CLI with an `act` credential summons an agent and chats on the
  player's behalf. With `owner` it starts a game. With `read` it is refused. Revocation takes
  effect immediately.
- **Static hosting:** both builds uploaded to the local deployment; `GET /`, `/rooms/X` (SPA
  fallback), `/player/` and a hashed asset are served with the right types.
- **Throughput:** `pnpm engine:bench` runs a game with N TS and N Python agents and records acts/s,
  commit latency and discarded windows.

## 11. Measured results

Everything was measured on the local Convex backend in this container (4 shared vCPUs). That backend
enforces neither the cloud's 512 MiB limit nor its concurrency limits, so the cloud numbers will
differ. The sandbox figures come from `lib/game-runtime/README.md` ("Convex measurements").

**Engine throughput.** These come from `pnpm --filter @workspace/engine bench`: 12 agents (24 for the
1,000 Hz rows), 20 s runs, ticks committed at most once a second, a 1.5 s window cap, and 4 parallel
acts per wave.

| Run | Cap | Sustained acts/s | Simulate per tick | Commit per tick | Discarded windows |
|---|---|---|---|---|---|
| TypeScript, Int | 100 Hz | 98 | 119 ms | 120 ms | 0 |
| Python, Int | 100 Hz | 94 (with a 1.0 s window cap) | 255 ms | 113 ms | 0 |
| TypeScript, Grid | 100 Hz | 94 (with a 1.0 s window cap) | 285 ms | 118 ms | 0 |
| Python, Grid | 100 Hz | 98 | 364 ms | 118 ms | 0 |
| TypeScript, Int | 1,000 Hz | 703 | 1,055 ms per 1,000 acts | 268 ms | 0 |
| Python, Int | 1,000 Hz | 339 | 2,632 ms per 1,000 acts | 243 ms | 0 |

The **default cap of 100 Hz is met** in both languages, on both Int and Grid. The **1,000 Hz maximum is
not reached** on one tick action: about 700 acts/s in TypeScript and 340 in Python on Int, less on
Grid, where scoring dominates. Above capacity the engine simply runs slower and skips the remainder,
as specified. It accrues no debt and discards no windows. Both of the following would raise this
ceiling:
- larger runtime pools in the cloud's dedicated Node instance;
- splitting a window across object shards in parallel tick actions.

Neither is built.

**Sandboxes** (a warm Grid agent with open-agent settings, in a Convex Node action):

| | Python (CPython 3.15 WASI on Node's WebAssembly) | TypeScript (QuickJS) |
|---|---|---|
| Warm act p50 / p95 | 6.1 / 8.1 ms (2 workers) | 4.8 / 7.1 ms (2 executors) |
| Parallel acts/s, production pools | 276 | 374 |
| Cold start to ready | 2.3–2.6 s, including the 5.2 MB bundle fetch from file storage (122–171 ms) | 2.3–2.6 s, including the TypeScript compiler's first type-check |
| Memory (whole process) | 312 MiB steady; 425–506 MiB with every pool warm and the TS compiler running | (shared) |
| vs the deleted Wasmtime host | about 2× faster per act; bootstrap 0.57 s instead of 4.7–7 s | unchanged |

**Clients.** At first commits ran at up to 4 Hz. With three player apps subscribed, re-running every
client's queries on each commit left them tens of seconds behind on the local backend:
- the observation query took about 170 ms uncached;
- events took about 110 ms;
- trajectories took about 190 ms.

Commits at most once a second, plus an observation that scans 16 recent batches instead of 64, fixed
this. The multi-client e2e (§10) passes with three apps, panels and a mock AI seat on one engine.

**Tests** (all against live local backends):

| Suite | Result |
|---|---|
| auth (`pnpm --filter @workspace/engine test:auth`) | 12/12 |
| game (`… test:game`) | 16/16, Python and TypeScript |
| runtime (`pnpm --filter @workspace/game-runtime test`) | 35/35, including Python parity with the old host |
| player client and assistant (`pnpm --filter @workspace/player-client test`) | 15 |
| engine UI e2e (`pnpm --filter @workspace/code-gods e2e`) | 23/23 |
| multi-client e2e (`pnpm --filter @workspace/player-web e2e`) | 27/27 |

The multi-client e2e covers:
- full Int, string and Grid games in three worktree player apps;
- live HMR of a new panel, contained compile errors, other apps unaffected;
- the room assistant acting with act and owner credentials, and a read credential refused;
- disclosure;
- static hosting of both frontends, including the hosted client.

## 12. Connecting the real Convex account (checklist)

1. `cd artifacts/engine && npx convex login && npx convex deploy` (creates the project). Note
   `CONVEX_URL` (`https://<dep>.convex.cloud`) and `CONVEX_SITE_URL` (`https://<dep>.convex.site`).
2. Environment variables (`npx convex env set --prod NAME VALUE`):
   - `CODE_GODS_SEASON_SALT`: ≥ 16 random characters, secret for the season;
   - `CODE_GODS_JWT_PRIVATE_KEY`: RS256 PKCS#8 PEM from `pnpm engine:gen-jwt-key`;
   - `REPLIT_OIDC_CLIENT_ID`: the engine Repl's `REPL_ID` (Replit Auth client id);
   - `CODE_GODS_ADMIN_EMAILS`: the admin allowlist (comma-separated verified emails);
   - `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`;
   - do **not** set `REPLIT_OIDC_ISSUER` or `CODE_GODS_AI_MOCK` in production.
3. Register `https://<dep>.convex.site/api/callback` as the redirect URI for the Replit OIDC client.
   Verify one real login (§5 risk).
4. `pnpm engine:upload-runtime --prod` (CPython bundle) and `pnpm engine:deploy` (backend + both
   static sites).
5. Smoke test: `/` loads and login works; `/api/health` shows `runtimes: ["python","typescript"]`; create
   a room, connect one player app with `pnpm player connect`, and play the "First steps" preset.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Python on V8 is slower than Wasmtime and has no fuel | Measure. Use the step budget as the deterministic bound, plus a worker watchdog. Pyodide as an alternative. Document the ceiling |
| Node action cold start (QuickJS, TS compiler, CPython bundle download) | Warm module-scope caches. The tick loop keeps instances warm. Measure cold start |
| OCC conflicts between commit and commands discard windows | Windows are short. Commands touch agents and deities, not objects. Count discards |
| Replit OIDC redirect URI on convex.site | Verify at connection time. Fallback relay page (§5) |
| Event log growth | One doc per tick. Older ended games keep only the summary plus a compacted trajectory (follow-up) |
| Self-reported assistant labels | Unchanged: the label is not a verified identity |
| A panel that floods the client | `hz` cap in the SDK. Docs rules. The error boundary contains crashes, not CPU, so the docs say so |
