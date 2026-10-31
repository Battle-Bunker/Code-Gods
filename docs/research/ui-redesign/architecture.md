# The agent-centred player client: architecture

Status: design proposal, 2026-10-31 (revised the same day for two further directives: one typed catalogue of every public Convex function, and IDE-style docking). Scope: how the in-client assistant becomes the centre of the player client; the catalogue that makes every affordance documented for humans and the AI; lenses and the dock layout as data the AI can drive through registry tools; safety; the engine UI; the work plan and the integration review. Sibling documents cover the lens catalogue and composition (a), progressive disclosure and the palette (b), onboarding and the configuration page (c), and the docking UI itself. This one fixes the contracts they share and settles the collisions with the adopted architecture (`docs/surface-architecture.md`).

## 0. Where the directives collide with the architecture, and the resolutions

| Directive | Collision | Resolution |
|---|---|---|
| "Every affordance available to the player is available and documented for their assistant", enumerated in one place, with a documentation annotation required by the type system | 59 public functions in 16 modules; the registry (`tools.ts`) and `TOOL_GUIDE` (`assistant-prompt.ts`) each carry their own prose; nothing ties a public function to a tool or a tooltip. | `lib/player-client/src/catalog.ts`: `CATALOG: Record<PublicFunctionPath, CatalogEntry>`, where `PublicFunctionPath` is derived from `typeof api` (verified against convex 1.48's generated types, §1.3). Tool descriptions, the assistant's guide, tooltips and palette labels are all read from it. `TOOL_GUIDE` is deleted, not shimmed. |
| "Access every capability through its tools" | True for game actions already (§4 of the surface architecture); the *view* is the one capability the registry lacks. | Five layout tools and one table (`dockLayouts`), §2. The view becomes data, as panels are. |
| IDE-style docking; default one lens over the assistant; drag the assistant right, add a second lens below the first | The current dock is three regions of many panels around a three-column console; `panelLayouts` syncs that geometry; nothing can address a pane. | Clean break: `shell/dock.tsx`, `layout.ts`, `layout-sync.ts`, `panelLayouts`, `panels.place/layout/setLayout` and `place_panel` go. A library-independent layout tree per (human, room), §2. |
| "Require the AI to configure any parameters" | A human whose room owner left the assistant off (allowance 0, the default) could never parameterise a lens. | The dropdown and the palette choose lens ids only; every lens has meaningful defaults; parameters come from `open_lens`/`set_lens_params`. Flagged to the owner: with the AI off, "objects by payoff" is reachable, "the five objects I named" is not. |
| Where does the programmer's editor go? (Memory: technical fluency must stay causally important.) | An "analytics lens" has no room for the Forge; `e2e/multi-client.ts` drives the Forge by test ids. | The Forge is a lens (`forge`, params `{language?, source?}`): the AI can place a *draft* in the editor without summoning. Test ids stay; the e2e opens the lens first (§8). |
| "A command palette gives humans the same repertoire as the agent's tools" | A hand-written palette drifts from the registry. | The palette reads `CATALOG[*].palette`; a test asserts every player/owner entry has a tool or a `why`, and a palette entry or a `why` (§1.4). |
| Game configuration on its own page with presets | Presets and `update_settings {revision}` exist. | No data-model change (§6). |
| "Centre the interface around the AI" read as "also in the engine UI" | The engine UI is the shared display and owner panel; it holds no player credential. | The engine UI stays AI-free; it gains tooltips from the catalogue (§6). |
| Least overwhelm for a first-time user | A proactive model turn per game spends every player's equal allowance on boilerplate. | Zero-token client-side welcome and phase-aware chips (§4). |

## 1. One typed catalogue of every public Convex function

### 1.1 Where it lives

`lib/player-client/src/catalog.ts`, exported as `@workspace/player-client/catalog`. Reasons: `lib/player-client` has no React and no Convex server runtime (it already imports pure engine modules such as `convex/panels/limits.ts`); `tools.ts` lives beside it; `lib/ai-player` and `artifacts/player-web` already depend on it; `artifacts/code-gods` adds the dependency (`"@workspace/player-client": "workspace:*"`). The catalogue imports **types only** from `@workspace/engine/convex/_generated/api` (`import type { api }`), exactly as `sdk/hooks.ts` does, so no server code is pulled in at runtime; and `import type { ToolName } from "./tools.ts"`, while `tools.ts` imports the `CATALOG` value: a type-only edge, so no runtime cycle.

### 1.2 The entry shape

```ts
export type Audience = "player" | "owner" | "infrastructure" | "admin" | "test";
export type PaletteSpec = { label: string; group: "play" | "view" | "room" | "owner" | "account"; shortcut?: string };
export interface CatalogEntry<P extends PublicFunctionPath = PublicFunctionPath> {
  kind: FunctionKind<P>;                                     // "query" | "mutation" | "action", checked against the generated api
  audience: Audience;
  human: { title: string; tooltip: string };                 // ≤ 60 and ≤ 240 chars: buttons, menu rows, hover text in both apps
  ai: { description: string };                               // ≤ 600 chars: what it does, when to use it, what comes back
  tools: readonly ToolName[];                                // the registry tools that reach it (through its `As` twin); [] when none
  palette: PaletteSpec | null;                               // the human's command in the player client's palette; null when none
  why?: string;                                              // REQUIRED (by the test) when audience is player|owner and tools or palette is empty
}
export const CATALOG: { readonly [P in PublicFunctionPath]: CatalogEntry<P> } = {
  "rooms.join":        { kind: "mutation", audience: "player", human: { title: "Join room", tooltip: "Join this room; joining mid-game makes you a spectator until the next game." },
                         ai: { description: "Join the room the credential is bound to … (the hosted client joins before any tool can run; credentials are issued to members only)." },
                         tools: [], palette: null, why: "A credential is bound to a room the human already belongs to; joining is the browser's job." },
  "commands.submit":   { kind: "action", audience: "player", human: { title: "Send a command", tooltip: "Validate, summon, destroy, ready, chat or pause: one authorised path." },
                         ai: { description: "…" }, tools: ["validate_agent", "summon_agent", "destroy_agent", "set_ready", "send_chat", "pause_game"], palette: { label: "Summon from code…", group: "play" } },
  "auth.device.approve": { kind: "mutation", audience: "infrastructure", human: { title: "Approve device", tooltip: "Approve a player app's code on the engine site." }, ai: { description: "…" }, tools: [], palette: null },
  "auth.testing.probe":  { kind: "query", audience: "test", … },
  // … 58 entries after this change (59 today − panels.place, panels.layout, panels.setLayout + layout.current, layout.set)
};
```

Many-to-many is explicit: a tool names the functions it wraps (`def({ …, functions: ["commands.submit"] })` in `tools.ts`), and an entry names its tools; the test checks both directions agree.

### 1.3 Type-level enforcement (verified)

```ts
import type { FunctionReference } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
type Paths<T, P extends string = ""> = { [K in keyof T & string]: T[K] extends FunctionReference<any, "public"> ? `${P}${K}` : Paths<T[K], `${P}${K}.`> }[keyof T & string];
export type PublicFunctionPath = Paths<typeof api>;                 // "activity.touch" | "auth.credentials.list" | "agent.connect.pending" | …
type Kinds<T, P extends string = ""> = { [K in keyof T & string]: T[K] extends FunctionReference<infer Ty, "public"> ? [`${P}${K}`, Ty] : Kinds<T[K], `${P}${K}.`> }[keyof T & string];
export type FunctionKind<P extends PublicFunctionPath> = Extract<Kinds<typeof api>, [P, unknown]>[1];
```

Why it works with convex 1.48: `api` is declared as `FilterApi<typeof fullApi, FunctionReference<any, "public">>`, and `FilterApi`'s `FilterKeysInApi` drops a module whose filtered body is `Record<string, never>`, so `typeof api` holds only modules that have public functions, nested by directory (`api.auth.credentials.list`). The mapped type recurses over those keys and bottoms out at `FunctionReference`. I compiled the derivation against the repository's real `_generated/api.d.ts` with `tsc --strict`: `"auth.credentials.list"`, `"agent.connect.pending"`, `"assistant.send"` and `["commands.submit", "action"]` are members; `"agent.registry.runTool"` (not a Convex function) and `"assistant.store.flush"` (internal) are not, and a `@ts-expect-error` on `"agent.store.principalInfo"` holds. A non-`Partial` `Record<PublicFunctionPath, …>` therefore fails the typecheck on a missing key, and the object literal's excess-property check fails on a path that no longer exists (a renamed or deleted function). Root `pnpm run typecheck` is the lint. No `api.d.ts` parser is needed; keep one in reserve only if a future Convex version changes `FilterApi`.

Cost: `_generated/api.d.ts` is regenerated by `convex dev`; the catalogue's typecheck therefore needs the generated file, which the engine already commits. A function added without a catalogue entry fails `lib/player-client`'s typecheck, which the root project references.

### 1.4 The fork: one source, two audiences

| Consumer | Reads | Replaces |
|---|---|---|
| `tools.ts` | `def({ name, functions, permission, annotations, input, output, note? })` builds `title` and `description` as `CATALOG[functions[0]].ai.description` + the tool's own `note` (argument semantics the function does not have: paging, `waitMs`, `commandId`). | the hand-written `title`/`description` strings |
| `lib/ai-player/src/assistant-prompt.ts` | lists `toolsFor(permission)` with `tool.description`, appending "(confirmed by the player first)" when `needsConfirmation`-style rules say so; the agent-writing advice moves into the WRITING AN AGENT paragraph | `TOOL_GUIDE` (deleted) |
| `/mcp tools/list`, the CLI's `pnpm player tools` | `tool.description` | unchanged plumbing |
| player client palette (`src/core/palette/commands.ts`) | entries with `palette !== null`, filtered by `audience`, the viewer's permission and the phase | a hand-written command list |
| player client and engine UI buttons and menus | `CATALOG[path].human` for labels and `title=` tooltips, e.g. `CATALOG["rooms.setReady"].human.tooltip` on Declare ready | scattered strings |
| `docs/engine-api.md` | a generated table (a `gen:catalog` script writes the function table; a test checks it is current, like `tools.schema.json`) | the hand-maintained function table |

Completeness is asserted at runtime too (`lib/player-client/test/catalog.test.ts`): every `player`/`owner` entry has at least one tool or a `why`; has a palette entry or a `why`; every tool's `functions` are paths whose entries list that tool; `kind` matches the registry's annotations (a `query` tool is `readOnlyHint`); titles ≤ 60, tooltips ≤ 240, descriptions ≤ 600; titles are unique. Today's `why` cases are the browser-only flows (`rooms.create/join/leave`: membership precedes any credential), the auth and device flows, `agent.connect.*` (OAuth approval), `assistant.*` (the assistant does not drive itself), `aiTemplates.adminList/create/update/remove` (admin), `manifest.get` (served inside `get_rules`, so `tools: ["get_rules"]`), `games.view/resolve` (public spectator view: `tools: ["list_games", "get_game_history"]`), and `auth.testing.probe` (test).

### 1.5 Zod schemas stay in `tools.ts`

Argument schemas belong to tools, not functions: `get_observation`'s paging and `summon_agent`'s `waitMs` have no counterpart in `player.observation` or `commands.submit`. `tools.ts` keeps `input`/`output` zod and the committed JSON Schema snapshot, and references the catalogue by path through `functions`. The catalogue never holds argument shapes.

## 2. The view as data: lenses and the dock layout

### 2.1 Lenses

A **lens** is a built-in view shipped in the player client as TSX, rendered in-process. Metadata (ids, titles, phases, zod parameter schemas, defaults) is pure and lives in `lib/player-client/src/lenses.ts` (`@workspace/player-client/lenses`), so the engine validates parameters with the same schemas the client renders with. Renderers live in `artifacts/player-web/src/lenses/<id>.tsx`, indexed as `LENS_VIEWS = {…} satisfies Record<LensId, LensView>`, so a catalogue id without a renderer fails the typecheck (the `EXECUTORS` pattern).

```ts
export interface LensDefinition<P extends z.ZodType = z.ZodType> {
  id: string; title: string; description: string;    // for the dropdown, the palette and the model
  phases: readonly Phase[];                            // where it has data; elsewhere its empty state names the next step
  params: P;                                           // strict object; every field optional with a default, except an id a lens cannot show without
  summary: (params: z.output<P>) => string;            // "objects · by payoff · top 8", shown on the pane tab and in the chat chip
}
// Initial ids (sibling a owns the list and renderers): overview, forge, objects, object, trajectories, agents, leaderboard, chat, rules, history.
export const LENS_IDS: [LensId, ...LensId[]];
export const defaultLensFor = (phase: Phase): LensId => phase === "lobby" ? "rules" : phase === "ended" ? "leaderboard" : "overview";
```

Parameters are primitives, enums and short id arrays (≤ 12 object ids), never a god id (nothing per-god is disclosed anyway), never code except `forge.source` (≤ 16 KiB, like an agent source).

### 2.2 The layout tree (library-independent)

The stored state is no longer `{lensId, params}` but a serialised dock layout:

```ts
// lib/player-client/src/layout.ts  (pure; zod; the engine validates and the client renders)
export type Pane =
  | { id: string; kind: "lens"; lensId: LensId; params: Record<string, unknown> }
  | { id: string; kind: "assistant" }
  | { id: string; kind: "stored-panel"; slug: string }
  | { id: string; kind: "file-panel"; fileId: string };                     // dev containers: src/panels/<id>.tsx
export type Node =
  | { type: "split"; direction: "row" | "column"; sizes: number[]; children: Node[] }   // sizes: weights, same length as children
  | { type: "tabs"; panes: string[]; active: string };                                   // a leaf group of pane ids
export type DockLayout = { version: 1; root: Node; panes: Record<string, Pane> };
export const DEFAULT_LAYOUT = (phase: Phase): DockLayout => ({ version: 1,
  root: { type: "split", direction: "column", sizes: [60, 40], children: [{ type: "tabs", panes: ["p1"], active: "p1" }, { type: "tabs", panes: ["p2"], active: "p2" }] },
  panes: { p1: { id: "p1", kind: "lens", lensId: defaultLensFor(phase), params: {} }, p2: { id: "p2", kind: "assistant" } } });
export const LAYOUT_LIMITS = { panes: 12, depth: 6, bytes: 32 * 1024, changesPerMinute: 12 } as const;
/** Never throws. Unknown lens → defaultLensFor(phase); invalid params → defaults + warnings; unknown stored slug or file → pane dropped;
 *  empty groups pruned; sizes normalised; no assistant pane → one added as a bottom 40% split; anything structurally wrong → DEFAULT_LAYOUT. */
export function parseLayout(raw: unknown, ctx: { phase: Phase; storedSlugs: readonly string[]; fileIds?: readonly string[] }): { layout: DockLayout; warnings: string[] };
/** The operations the tools and the palette apply; pure, so they are unit-tested without a browser. */
export function openPane(layout: DockLayout, pane: Pane, place?: Place): { layout: DockLayout; paneId: string };
export function closePane(layout: DockLayout, paneId: string): DockLayout;
export function setPaneParams(layout: DockLayout, paneId: string, params: Record<string, unknown>): DockLayout;
export type Place = { relativeTo?: string; direction: "right" | "left" | "below" | "above" | "tab" };   // default: below the largest lens pane, or "tab" with it
```

Why our shape and not the library's JSON: the four candidates (dockview-react, flexlayout-react, rc-dock, react-mosaic) all serialise, but each in its own vocabulary (dockview's `grid/panels/activeGroup`, flexlayout's `layout.children` with `weight`, rc-dock's `dockbox/floatbox`, mosaic's binary tree). The engine must validate a layout without React (`parseLayout` runs in a Convex mutation), the tools must address panes by stable ids and place them with coarse directions, and the sibling must stay free to change libraries. So the client owns one adapter per library, `toLibrary(layout)`/`fromLibrary(json)`, in `artifacts/player-web/src/dock/adapter.ts`, and the adapter test round-trips `DEFAULT_LAYOUT` and a three-pane fixture. Floating and pop-out windows are not representable: the adapter folds them back into the tree on save. Splits carry weights, not pixels, so a layout saved on a laptop is sane on a phone.

### 2.3 Where the state lives: `dockLayouts`, per human per room

| Candidate | AI sets it, every client updates live | Human drag/dropdown without the AI | Stale/invalid | Verdict |
|---|---|---|---|---|
| **`dockLayouts {subject, roomId}`** | the executors write the row; clients subscribe to `layout.current` | the client calls `layout.set` directly | `parseLayout` on every read; executors refuse invalid params with the lens's JSON Schema | **chosen** |
| per subject only (as `panelLayouts` was) | yes | yes | lens params carry one game's object ids; the lens that fits the lobby of room B differs from the running game of room A | rejected, but the layout *shape* follows the human: see below |
| client-only state and a tool that returns instructions | only for the in-client assistant | yes | fragile | rejected: Claude Code over MCP must steer the hosted client too |

```ts
// artifacts/engine/convex/layout/tables.ts
dockLayouts: defineTable({
  subject: v.string(), roomId: v.id("rooms"), layout: v.any(),      // parseLayout-valid at write; ≤ 32 KB
  gameId: v.optional(v.string()),                                   // the room's current game when written
  setBy: v.object({ kind: v.union(v.literal("browser"), v.literal("device"), v.literal("oauth"), v.literal("assistant")), label: v.string() }),
  updatedAt: v.number(), recent: v.array(v.number()),               // write times in the last minute
}).index("by_subject_room", ["subject", "roomId"]).index("by_subject_updated", ["subject", "updatedAt"])
```

`convex/layout.ts`: `layout.current({roomId})` query (requireMember read) returns the room's row or, when none exists, the human's most recently updated row from another room with every lens's `params` reset to `{}` and `gameId` cleared: **the arrangement follows you, the parameters do not**. `layout.set({roomId, layout, ifUpdatedAt?})` mutation (requireMember read: a human's own view state; a read credential may change its own client's view) parses, rate-limits (`RATE_LIMITED` past 12 writes a minute per human per room) and writes; with `ifUpdatedAt` it answers `CONFLICT` when the row moved, which the client uses for drags. Internal twins `currentAs`, `setAs` and the operation twins below take `principal`. The client applies server layouts only between drags (a drag in progress queues the update) and pushes a full layout with `ifUpdatedAt` 800 ms after a gesture ends; on `CONFLICT` it adopts the server's version. Tool executors never trust a client copy: each operation is one mutation that reads the row, applies the pure operation and writes, so the AI's change lands on the latest layout.

### 2.4 The layout tools

| Tool | Permission | Annotations | Input | `data` | Card |
|---|---|---|---|---|---|
| `get_layout` | read | read-only | `{}` | `{layout, lenses: [{id, title, description, phases, paramsSchema}], storedPanels: [{slug, title}], warnings}` | no |
| `open_lens` | act | acts | `{lensId: z.enum(LENS_IDS), params?: z.record(z.string(), z.unknown()), place?: Place}` | `{paneId, layout, summary}` | no |
| `open_panel` | act | acts | `{slug, place?: Place}` (one of the human's stored panels) | `{paneId, layout}` | no |
| `set_lens_params` | act | acts | `{paneId, params}` | `{paneId, summary}` | no |
| `close_pane` | act | acts | `{paneId}` | `{layout}` | no |
| `place_panel` | — | — | removed | — | — |

Rules in the executors (`convex/layout.ts`, called from `agent/registry.ts`):
- `open_lens` without `place` **reuses** an open pane of the same `lensId` (replaces its params, activates its tab) instead of adding one; with `place` it adds a pane. One pane per lens unless the model asks for more: the main anti-flap rule.
- `close_pane` refuses `CONFLICT` on the assistant pane (confirmation cards live there) and on the last lens pane.
- `params` are parsed with `LENSES[lensId].params`; a failure is `BAD_REQUEST` whose message carries that lens's JSON Schema, so the model self-corrects in one step. Stored rows are still re-parsed leniently by every reader.
- `open_panel` checks the slug belongs to the human (`NOT_FOUND` otherwise).
- At most two layout tools per model step (`assistant/rules.ts`, beside `callsPerStep`): the third is answered `BAD_REQUEST` before it runs. `argsLimit("open_lens") = argsLimit("set_lens_params") = 20_000` (a Forge draft).

Why no confirmation card: a layout change touches no game state, is visible at once and reversible with one gesture; a card per view change would make the assistant a vending machine. The surprise is handled by a chip in the assistant pane for every change ("opened trajectories · payoff · 3 objects, below the overview"), by `setBy` on the pane tab ("set by your assistant · revert"), by the server rate and the per-step cap, and by "Reset layout" in the palette.

How the per-lens parameter schemas reach the model without a 50 KB discriminated union in `tools.schema.json`: `open_lens.lensId` is the enum (one snapshot line per lens), `params` an open record; schemas travel in `get_layout` and in the briefing's LENSES block (§4). The snapshot changes once now (five tools in, one out) and then only when a lens id is added.

## 3. Lenses, stored panels and what replaces the dock

A stored panel is a pane (`kind: "stored-panel"`), shown in its sandboxed frame (`stored-frame.tsx`, unchanged) filling its pane; a file panel is a pane in dev containers (`kind: "file-panel"`, in-process with HMR, or sandboxed through the existing toggle). The "add a pane" menu in the dock header and the palette list built-in lenses, then "Your panels" (`panels.list`, enabled), then in a dev server "Your files". Stored panels remain the AI's extension path when no built-in lens fits: `save_panel` then `open_panel` in the same turn.

| Removed outright | Replaced by |
|---|---|
| `shell/dock.tsx` regions, `layout.ts`, `layout-sync.ts`, the `DockBar`; `panelLayouts`; `panels.layout/setLayout/place` and their twins; `place_panel`; `placement`/`size` arguments of `save_panel` | the dock tree, `dockLayouts`, `layout.current/set`, the five tools |
| `panels.placement/size`, `panelVersions.manifest.placement/size` | validators made optional and no longer written; a gated one-off mutation clears the columns and `panelLayouts` on the dev deployment; the fields and the table are deleted in the follow-up PR (Convex refuses a validator its existing documents fail; production has no rows) |
| `definePanel({placement, size})` | accepted by the compiler's manifest reader, ignored, documented in `docs/panels.md` |

What stays: the frame, bridge and frame CSP; `confirmations.tsx` and `action-policy.ts` (a panel's `chat/summon/destroy/pause` still show the host dialog with the exact payload; the "let it act" grant still dies on a foreign version); `?panels=off` (now: built-in lenses and the assistant only); the shadows badge; `registry-merge.ts`, which now feeds a menu instead of regions.

## 4. The assistant as the centre

### 4.1 Prompt, briefing and guide

| Place | Addition |
|---|---|
| Tool descriptions (from the catalogue, §1.4) | `get_layout`: "the panes the player sees, the lenses available with their parameter schemas, the player's stored panels"; `open_lens`: "show a lens, with parameters you choose, in the player's dock (reuses an open pane of that lens unless you place a new one); say what you opened and what to look at"; `set_lens_params`, `open_panel`, `close_pane` likewise. |
| System prompt, **THE PLAYER'S SCREEN** | "The player's screen is a dock of panes: lenses, their stored panels and this conversation; the briefing lists them. Open or re-parameterise a lens when the answer is something a lens shows better than words (an object's breakdown → `object`; which objects move → `trajectories`; a draft agent → `forge` with `source`). At most one layout change per answer unless the player asks for an arrangement; never close or move a pane the player arranged unless asked; prefer explaining over opening when a visible pane already shows it; after a change, one line on what to look at. The player picks lenses from a menu but cannot set their parameters: you do." |
| System prompt, **NEXT STEPS** | "A newcomer's question is a request for the next concrete step: name it, offer to do it, do it when asked. Lobby: their incentives come with the game; suggest `set_ready`. Planning: read their utility, pick a target with `evaluate_value`, draft an agent into the Forge, `validate_agent`, report cost against energy; summon only when asked. Running: watch `trajectories`, destroy agents losing bits, negotiate in public chat (confirmed). Ended: `leaderboard` and `history`." Also: "Summon from a description: write the agent in the room language from the briefing's helpers, validate it, show it in the Forge (`open_lens forge {source}`), ask before `summon_agent`." |
| Briefing (`assistantBriefing`), a `LENSES` block ≤ 1,500 chars | "Your player sees: [p1] objects · by payoff · top 8 (you set it 2 min ago); [p2] this conversation (right)". Then one line per lens: `id — title — params: a, b — phases`; stored panels by slug. `get_layout` is then rarely needed. |

### 4.2 Phase-aware suggestions and the welcome (zero tokens)

`artifacts/player-web/src/core/chat/suggestions.ts`, pure, unit-tested: `suggestionsFor({phase, seated, isOwner, energy, agents, assistantEnabled, layout}) → ≤ 3 { label, prompt?, command? }`. With the assistant on a chip sends its `prompt`; off, it runs its palette `command`.

| Phase | Chips | Default lens |
|---|---|---|
| lobby, not ready | "What am I trying to do in this game?" · "Declare ready" (command) · "Show the rules" | `rules` |
| lobby, owner, < 3 players | "Add an AI player" (command) · "How do I invite people?" | `rules` |
| planning, no agents | "Explain my utility in a paragraph" · "Draft a cheap agent for me" · "Which objects should I care about?" | `overview` |
| running | "Which of my objects are losing bits?" · "What should I say to the others?" · "Pause the game" (command, once) | `overview` |
| ended | "How did I do?" · "What would have scored better?" | `leaderboard` |

The welcome is a client-side note at the top of the assistant pane, never stored or sent: "Room X · owner Y · you are in the lobby. Pick a lens above or ask below." **No proactive model turn.**

### 4.3 The assistant-off client

When `assistant.status.enabled` is false: the dock, the lens menu and the palette are the whole client; every console action lives in the palette and in the lenses that need it (`forge`: Validate/Summon; `agents`: destroy; `overview`: Ready/Pause; `chat`: the public input). The assistant pane shows the welcome, the chips in command form, one sentence ("Your assistant is off in this room; the owner enables it in the room's AI budget card"), and a single palette button (Ctrl/Cmd-K) instead of a textarea that would fail silently. Lenses run on defaults; "Ask the assistant to configure this lens" is hidden.

## 5. Safety and trust

| Question | Answer |
|---|---|
| Can a layout change hide a pending confirmation? | The card is in the assistant pane, which the AI cannot close (`close_pane` refuses) and the human's drag can only move or tab. When a call goes `awaiting_confirmation`, the client activates that pane's tab and the dock header shows a badge until the card is decided. Within a step, `resolveCalls` stops at the first call needing a card, so an `open_lens` queued after a `send_chat` waits for the decision. |
| Can lens params leak another god's data? | No. Params select *what the lens asks the SDK for*; every lens reads the same disclosure-filtered hooks (`useObservation`, `useTrajectories`, `useEvents`, `useRoomInfo`) as panels, and no lens has a god-id parameter. The `mcp.test.ts` disclosure loop gains the five tools (results are view state and the caller's own slugs). |
| Can a stored panel in a pane act without asking? | No change: `action-policy.ts` gates `chat/summon/destroy/pause` from a frame behind the host dialog. |
| Rate limits | 12 layout writes a minute per human per room in `layout.set`/`setAs` (dropdown, drags and tools alike); two layout tools per model step; the assistant's `ASSISTANT_CALLS_PER_MINUTE = 8` bounds the steps. |
| Who may write `dockLayouts` | the human in a browser and any of their credentials for that room; another human's row is unreachable (keyed on the viewer's subject); `layout.current` is the caller's own. |
| One path for the palette | Act commands: `useActions()` → `commands.submit` (what the console uses and `commands.submitAs` wraps). Owner commands: `api.owner.command`, `api.rooms.*`, the functions `owner.commandAs` wraps. Layout: `layout.set` and the same pure operations the executors apply. Panels: `panels.save`. The palette's entries are the catalogue's `palette` fields, so the "same repertoire" is a tested property, not a habit. Human-initiated destructive commands keep the console's inline confirm; owner commands confirm in the palette's second step. |
| Logging | ids, tool names and outcomes only; layout tools log `lensId` and `paneId`, never params (a Forge draft is the player's code). |

## 6. The engine UI and game configuration

| Question | Decision | Why |
|---|---|---|
| Data model for the config page | none | `SETTINGS_PRESETS`, `manifest.get`, `owner.settings({revision, settings?, preset?})` and `update_settings` exist with optimistic concurrency; presets are pre-authored in code (memory). |
| "Save my configuration as a preset" | skip | A `settingsPresets` table, a user-authored name, retuning and two tools, none of which helps the first-time user. Revisit when owners run many games. |
| Route and files | `artifacts/code-gods/src/pages/room-settings.tsx` at `/rooms/:id/settings`; `OwnerSettings` moves out of `components/room-panels.tsx`; `pages/room.tsx` keeps members, the AI budget card, history, player apps and a "Configure the next game" link; presets menu first, the form under "Advanced"; every control's `title` from `CATALOG[path].human.tooltip`. | sibling (c) owns the page |
| Assistant in the engine UI | no | The engine UI is the shared display and owner panel with no player credential; a second chat surface would split the owner's thread. The owner already configures through their assistant in the player client with an `owner` grant. The page says so in one line. |

## 7. Implementation plan

Contracts fixed by WP0 before parallel work: `PublicFunctionPath`, `CatalogEntry`, `CATALOG` (all entries), `def({ functions })` in `tools.ts`; `LensDefinition`, `LENS_IDS`, `defaultLensFor`; `Pane`, `Node`, `DockLayout`, `Place`, `DEFAULT_LAYOUT`, `LAYOUT_LIMITS`, `parseLayout`, `openPane`, `closePane`, `setPaneParams`; the five tool schemas; the `dockLayouts` row; `layout.current/set` signatures; the kept test ids (`input-source`, `button-validate`, `button-summon`, `panel-validation`, `text-phase`, `text-self-label`, `input-chat`, `button-send-chat`, `row-agent-*`, `row-object-*`, `row-transformation-*`, `text-notice`, `banner-unknown`, `text-mode`, `status-connection`, `test-live`) and the new ones (`dock`, `pane-<id>`, `tab-<id>`, `button-add-pane`, `menu-lens`, `button-palette`, `dialog-palette`, `assistant-pane`).

| WP | Owner area (exclusive files) | Work | Tests (cheapest layer) | Risk |
|---|---|---|---|---|
| **0 contracts** (coordinator, serial) | `lib/player-client/src/{catalog,lenses,layout}.ts`, `package.json` exports, `tools.ts` (+5 tools, −`place_panel`, `functions`, derived descriptions), `tools.schema.json` regenerated; `convex/layout/tables.ts`, `schema.ts`, `convex/layout.ts` signatures, `agent/registry.ts` executor stubs; `code-gods/package.json` dependency | fixes names and shapes; the catalogue is written in full here (58 entries) because every later package reads it | `lib/player-client/test/{catalog,lenses,layout,tools}.test.ts`: completeness rules of §1.4; every lens param optional with a default except ids; `parseLayout` degrades on each failure class and never throws; `openPane` reuse rule; adapter-free round trips | low |
| **1 engine** | `convex/layout.ts`, `convex/layout/*`, `agent/registry.ts`, `assistant/rules.ts` (per-step cap, `argsLimit`, `summarize`), `lib/ai-player/src/assistant-prompt.ts` (sections, briefing LENSES, `TOOL_GUIDE` deleted), `convex/panels.ts` and `panels/tables.ts` (removals, optional fields), `convex/testing.ts` (gated clear of `panelLayouts` and the columns), `docs/engine-api.md` (generated table), `docs/panels.md` | the state, the tools, the prompt | `test/unit/assistant.test.ts`; `lib/ai-player` prompt test (every offered tool documented from the catalogue; LENSES in the briefing); new `test/game-layout.test.ts` (live: set/current per room; the shape follows across rooms with params reset; another human NOT_FOUND; rate limit; invalid params BAD_REQUEST carrying the schema; `open_panel` with a foreign slug NOT_FOUND; `close_pane` on the assistant CONFLICT; `ifUpdatedAt` CONFLICT); `test/mcp.test.ts` (read lists `get_layout` only; disclosure loop + five tools); `test/game-assistant.test.ts` (a scripted turn opens a lens and the row changes; a third layout call in one step errors) | medium: schema change on the dev deployment |
| **2 player-web dock** (sibling's UI design) | `src/core/app.tsx`, `src/dock/{dock.tsx, adapter.ts, add-pane-menu.tsx}`, `src/core/chat/{pane.tsx, suggestions.ts, welcome.tsx}` (from `core/assistant/drawer.tsx`; `state.ts` kept), `src/lenses/**` (renderers extracted from `console.tsx`), `stored-frame.tsx` as a pane body; delete `shell/dock.tsx`, `shell/layout.ts`, `shell/layout-sync.ts` | the dock, the sync (`layout.current`, `ifUpdatedAt`, drag queueing), the panes | `test/adapter.test.ts` (round trips), `test/layout-sync.test.ts` (pure decision: apply/queue/push/adopt-on-conflict), `test/suggestions.test.ts`, `test/assistant-state.test.ts`, `test/registry-merge.test.ts`; e2e `multi-client.ts` gains `openLens(page, "forge")`/`openLens(page, "chat")` and a 390×844 viewport pass; `e2e/stored-panels.ts` opens a stored panel as a pane | high |
| **3 player-web palette** | `src/core/palette/{commands.ts, palette.tsx}` | the catalogue-driven palette, Ctrl/Cmd-K, the visible button, "Configure this lens…", "Reset layout" | `test/palette-commands.test.ts` (every `palette` entry rendered; permission and phase gating mirror the console's `disabled` rules) | low |
| **4 code-gods** | `src/pages/room-settings.tsx`, `src/pages/room.tsx`, `src/components/room-panels.tsx`, `src/App.tsx`, tooltips from the catalogue, page cleanup per sibling (b) | the config page and presets menu | `test/settings-options.test.ts`; `e2e/smoke.ts` gains the route and checks a tooltip text equals the catalogue's | low |

Merge order into `develop`: 0 → 1 → 2 → 3 (3 needs 2's dock for "configure this lens") → 4 at any time after 0. WP1 lands before WP2 because the client subscribes to `layout.current` on the dev deployment the e2e runs against. Before WP1's deploy: run the gated clear so the optional-field validators deploy cleanly; the fields and `panelLayouts` go in a follow-up PR once the dashboard shows them empty. Each WP: `pnpm run typecheck`, its suites, `test:game` for engine changes (`.claude/skills/code-gods-testing/SKILL.md`), the `code-review` skill, then merge.

## 8. Integration review: the twelve ways this goes wrong

| # | Failure | Mitigation |
|---|---|---|
| 1 | On a phone the assistant pane eats the height or a two-column split is unusable. | Weights, not pixels; below `md` the adapter renders the tree as a vertical stack with the assistant pane collapsible to its input row plus a badge; `100dvh` with `min-h-0` panes; a 390×844 e2e pass. |
| 2 | A lens with no data in the lobby shows a blank. | `LensDefinition.phases` plus a per-lens empty state naming the next step; the add-pane menu greys lenses outside their phases; `defaultLensFor` applies when the stored row is from another game and its lens is meaningless now. |
| 3 | `tools.schema.json` churns and stales the snapshot. | Only `open_lens.lensId`'s enum is in it; per-lens schemas travel in `get_layout`; one regeneration in WP0. |
| 4 | Human drags and AI writes fight over the layout. | Executors read-modify-write in one mutation; the client queues server layouts during a drag, pushes with `ifUpdatedAt`, and adopts the server on `CONFLICT`; the decision logic is a pure, tested module. |
| 5 | A new public function ships undocumented or the palette drifts. | `Record<PublicFunctionPath, …>` fails the typecheck; `catalog.test.ts` fails on a player/owner entry without a tool, a palette entry or a `why`. |
| 6 | `e2e/multi-client.ts` breaks on moved test ids. | Ids kept verbatim inside `lenses/forge.tsx` and `lenses/chat.tsx`; `openLens()` helpers before the steps that need them; header ids unchanged. |
| 7 | CSP breaks a pane. | Lenses are in-process TSX; stored panels reuse the frame and `frame-src 'self'`; the dock library is bundled (`script-src 'self'`); `csp.test.ts` unchanged. |
| 8 | HMR of file panels inside a pane reloads the core. | `shell/registry.ts` and `panel-store.ts` untouched; the `file-panel` pane renders `PanelBody` with the same `status`/`generation` plumbing; the `test-live` e2e check runs with that pane open. |
| 9 | The assistant flaps the layout or undoes the human's arrangement. | Prompt rules; `open_lens` reuse; two layout tools per step; 12 writes a minute; a chip per change; `setBy` on the tab with revert; "Reset layout". |
| 10 | Newcomers confuse the assistant with the public chat. | The assistant pane's tab reads "Your assistant (private)"; the `chat` lens is "Pantheon chat · everyone reads this"; `send_chat` cards say "public"; the off-state pane has no textarea. |
| 11 | Dropping `placement/size` and `panelLayouts` fails the dev deploy's schema validation. | Optional first, gated clear, delete in a follow-up once empty; production has no rows. |
| 12 | The catalogue's type derivation breaks on a Convex upgrade (a widened `FilterApi` would make `PublicFunctionPath` accept anything and the record check would pass vacuously). | The derivation is three lines over `FilterApi` and `FunctionReference`; `catalog.test.ts` also compares `Object.keys(CATALOG)` with the public function paths found by a regex walk of the committed `_generated/api.d.ts` (`fullApi`'s module list plus each module's `export const x = query|mutation|action(` lines, exactly the fallback the brief asked for; the runtime `api` object is a Proxy and cannot be enumerated), so a silent type widening becomes a failing test. |

Two further notes for the coordinator: the `Who` from `agent/store.ts principalInfo` already carries `kind` and `label`, so `setBy` needs no new auth code; and `assistantPrefs` stays as it is: the layout is view state shared by every surface, not an assistant preference.
