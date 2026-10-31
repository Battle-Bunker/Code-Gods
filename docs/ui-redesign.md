# UI redesign: the assistant at the centre

Status: adopted 2026-10-31. This is the integrated design; the four research documents it draws on are in
`docs/research/ui-redesign/` (architecture, player client, palette and pages, onboarding and configuration).
Where they disagree, this document decides. It supersedes the panel-dock parts of `docs/surface-architecture.md`
§5 and §6 and the "Layout" parts of `docs/panels.md`.

Terminology: the things a player adds to their workspace are **panels**. The 13 built-in ones (§3) were called
"lenses" while this was designed, and still are in the research documents; a player's own TSX panels are **stored
panels** (`docs/panels.md`), "Your panels" in menus.

## 0. The owner's directives

1. The whole site is cluttered. Centre the interface on the AI assistant, which reaches every capability the player
   has through its tools, plus tools that show parameterisable analytics.
2. The player client is an IDE-style dock of movable, resizable panes. Default: one analytics **panel** in the top
   half, the assistant chat in the bottom half. Dragging the assistant to the right, adding a second panel (from the
   palette or by asking the assistant) and dragging it under the first must be easy.
3. A pane's panel is chosen from a dropdown; a panel's **parameters are set only by the assistant**.
4. A **command palette** (a search field with a menu button at the top right, and a keyboard shortcut) gives humans
   the same repertoire as the assistant's tools, for everything that does not fit the lean primary screen.
5. **Every public Convex function** is enumerated once, with a documentation annotation for humans (tooltips) and
   for the AI (tool descriptions), required by the type system. That one place forks into the human and the AI API.
6. Game configuration is not shown by default: game setups in a simple menu, and "create a new configuration" opens a
   separate page that asks every question clearly and explains what each means.
7. Highest goal: a first-time visitor feels little overwhelm and knows the next thing to do.

## 1. Decisions

| Topic | Decision | Source |
|---|---|---|
| Dock library | `dockview-react` 8.x (MIT, React 19, JSON layouts, `addPanel` relative to a pane). Not loaded under 768 px: a stacked renderer draws the same layout with the assistant as a bottom sheet. `react-resizable-panels` is removed. | player-client §1.1 |
| Layout state | A library-independent tree (`DockLayout`, below) in a new table `dockLayouts` per (human, room). The arrangement follows the human to a new room; panel parameters do not (they name one game's objects). | architecture §2.2–2.3 |
| Panes | `panel` (built-in), `assistant` (exactly one, never closable), `stored-panel` (the human's stored panel in its sandboxed frame), `file-panel` (dev containers). | architecture §3 |
| Layout tools | `get_layout` (read), `open_panel` (a built-in panel by `panelId` or a stored panel by `slug`, exactly one), `set_panel_params`, `move_pane`, `close_pane` (act). No confirmation card: view changes touch no game state and are reversible; a chip in the chat names every change. `place_panel` is removed; `placement`/`size` on panels become add-pane hints only. | architecture §2.4, player-client §6 |
| Anti-flap | `open_panel` without `place` reuses an open pane of that panel, else switches a built-in panel the player did not choose (`setBy` default, then the assistant's own latest) and opens a new pane only when `place` is given or every built-in panel is the player's; at most two layout tools per model step; 12 layout writes a minute per human per room; the assistant never moves or closes a pane the player arranged unless asked. | architecture §2.4, player-client §2.2 |
| Panels | 13 built-in panels (§3). Parameters: primitives, enums, short id lists; `forge.source` is the only code. | player-client §2, architecture §2.1 |
| Default panel | `overview` in lobby, planning, running and paused; `results` when the game ends. A pane's panel auto-follows the phase only while its `setBy` is `default` (neither the human nor the assistant chose it). A new game resets panel parameters. | this document |
| The forge | A panel (`forge`) with an in-place edit mode: the assistant drafts code into it (`open_panel {panelId: forge, params: {source}}`), the human may type or paste. Validate and Summon live in it, with the console's test ids. | architecture §0, player-client §3 |
| Public chat vs. assistant | Separate inputs. The assistant pane is "Your assistant (private)"; the `public-chat` panel has the only public input ("Say to everyone…"). A palette hand-off always targets the assistant and never sends by itself. | palette §6, onboarding §6 |
| Assistant off (allowance 0) | The client is complete without it: panels at defaults, every action in the palette and in the panels that need it. The assistant pane shows the welcome, chips in command form and one sentence on how the owner turns it on. | architecture §4.3 |
| Catalogue | `lib/player-client/src/catalog.ts`: `CATALOG: Record<PublicFunctionPath, CatalogEntry>`, keys derived from `typeof api`. Tool descriptions, the assistant's tool guide, palette rows and tooltips in both apps read from it. `TOOL_GUIDE` is deleted. | architecture §1 |
| Settings documentation | `SETTINGS_DOCS` beside `GameSettings` in `lib/game-core` (`satisfies Record<keyof GameSettings, FieldDoc>`), type-argument docs on `ParamSchema` in `lib/game-types`, room budget docs in the engine; served by `manifest.get` and `get_rules`. | onboarding §4.6 |
| Palette | One shared component in a new `lib/ui-kit` (`CommandPalette`, `PaletteTrigger`, `Term` glossary). Rows = catalogue entries with a `palette` spec + client-only `ui.*` commands of the same human shape, each with a performer: navigate, form, submit, hand-off, local. Trigger: search field + ☰ at the top right; Cmd/Ctrl+K everywhere; `/` and `?` only when no input has focus. | palette §2 |
| Confirmations in the palette | none / inline (press Enter again) / summary / modal, derived from `destructiveHint` and cost. The assistant's cards stay as they are, plus `destroy_agent` now also asks. | palette §2.6 |
| Engine UI | Stays AI-free (shared display and owner panel). Every page: one status sentence from `nextStep()`, one filled primary action, at most four sections, the rest behind Details or in the palette. Owner and creation date stay prominent wherever rooms are listed; rooms have no names. | palette §3, architecture §6 |
| Game setups and configuration | Game setups are a seeded catalogue of complete settings (`gameSetups`, `convex/setups.ts`): the defaults First steps, Classic, Low income, Big board and Master (game-core `SEED_SETUPS`, seeded once, admin-editable) plus each human's own. The room page shows one **Setup** select (Defaults, Your setups, "Custom" when the room matches none, divider, "New configuration…"); a pick applies at once with Undo. The page `/rooms/:code/configure` edits the room's next-game settings directly: a long form with a stepper and a sticky summary, asking every `GameSettings` field grouped World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with meaning and consequence from `SETTINGS_DOCS`, and "Save as a setup…". (2026-10-31: the former "Start from" presets, their partial patches and the retuning toward tuned type defaults were removed.) | onboarding §3–4, palette §3.3, owner |
| Settings changes | Every change goes through game-core `applySettingsChange` (the page per control, the engine per `owner.settings`): a language sets its grammar and summon price, an object type its default offered instantiation, type arguments must be offered, excluded families that no longer exist are dropped, option fields must be choices of the language and type; everything else is free within `validateSettings`. Nothing else moves. | owner (2026-10-31) |
| Room creation | New rooms start on the seeded First steps setup. Creating a room asks the owner, once, to turn on the assistant with a pre-filled allowance and a consent checkbox ("Not now" keeps it off). Adding the first AI player asks for the AI budget in the same step. | onboarding §0 |
| Which setup is active | `rooms.settingsOrigin {kind: setup \| custom, id?, modified}` set by `owner.settings`, copied into the game snapshot; the UI names a setup while the room's settings equal it. | onboarding §3.4 |
| Wording | "player" in functional copy, "god" kept in flavour copy and the glossary. "Declare ready" leaves the primary path (it gates nothing). Revision numbers and protocol versions leave the UI. | palette §5, onboarding §1.3 |
| Invite links | Stay on the room page (`/rooms/CODE`); the room page's primary action for a member is "Open player client". | this document |
| Object renderers | An object type may register several named renderers with a default; each viewer's choice per type is remembered in their browser and switched from the palette (`ui.objects.renderer`) or the grid detail view. Grids default to coloured digits (`--cg-ink-*` text shades, tested for 4.5:1 contrast and ΔE ≥ 25), with tiles as the alternative. | this document |
| Deferred | per-user coaching flags and zero-token coaching messages beyond the empty states and chips, `players` hints on setups, Int/string default setups, "Present on a big screen". | this document |

## 2. Contracts (fixed before parallel work)

### 2.1 The catalogue (`lib/player-client/src/catalog.ts`, export `@workspace/player-client/catalog`)

```ts
type Paths<T, P extends string = ""> = { [K in keyof T & string]: T[K] extends FunctionReference<any, "public"> ? `${P}${K}` : Paths<T[K], `${P}${K}.`> }[keyof T & string];
export type PublicFunctionPath = Paths<typeof api>;          // "rooms.join" | "auth.credentials.list" | …  (verified against convex 1.48)
export type Audience = "player" | "owner" | "infrastructure" | "admin" | "test";
export type PaletteGroup = "play" | "view" | "room" | "owner" | "account" | "help";
export interface PaletteSpec { label: string; group: PaletteGroup; keywords?: readonly string[]; surfaces: readonly ("player" | "engine")[]; confirm?: "none" | "inline" | "summary" | "modal" }
export interface CatalogEntry {
  kind: "query" | "mutation" | "action";
  audience: Audience;
  human: { title: string; tooltip: string };     // ≤ 60 / ≤ 240 chars; verb-first title; one sentence; no model instructions
  ai: { description: string };                   // ≤ 600 chars: what it does, when to use it, what comes back
  tools: readonly ToolName[];                    // registry tools that reach it; [] when none
  palette: PaletteSpec | null;
  why?: string;                                  // required (runtime test) when audience is player|owner and tools or palette is empty
}
export const CATALOG: { readonly [P in PublicFunctionPath]: CatalogEntry };
```

Tool definitions gain `functions: readonly PublicFunctionPath[]` and derive `title`/`description` from the first
function's catalogue entry plus the tool's own `note` (argument semantics such as paging, `waitMs`, `commandId`).
Zod schemas stay in `tools.ts`. `lib/player-client/test/catalog.test.ts` asserts: every player/owner entry has a tool
or a `why`, and a palette spec or a `why`; tools and entries agree in both directions; `kind` matches annotations;
length limits; unique titles; and `Object.keys(CATALOG)` equals the public functions found by a regex walk of the
committed `_generated/api.d.ts` (the fallback against a silent type widening).

### 2.2 Panels (`lib/player-client/src/panels.ts`, export `@workspace/player-client/panels`)

```ts
export type Phase = "lobby" | "planning" | "running" | "paused" | "ended";
export interface PanelDefinition<P extends z.ZodObject = z.ZodObject> {
  id: PanelId; title: string; blurb: string;      // blurb: one sentence for a newcomer
  phases: readonly Phase[];                      // where it has data; elsewhere its empty state names the next step
  params: P;                                     // strict; every field optional with a default, except what-if's objectId/calls
  summary: (params: z.output<P>) => string;      // "Top 12 · only ones others care about" (the pane caption, the chat chip)
}
export const PANEL_IDS = ["overview", "my-card", "objects", "others-care", "bits-over-time", "race", "agents", "feed", "what-if", "public-chat", "forge", "results", "rules"] as const;
export const PANELS: { readonly [K in PanelId]: PanelDefinition };
export const defaultPanelFor = (phase: Phase): PanelId => phase === "ended" ? "results" : "overview";
```

Renderers: `artifacts/player-web/src/core/panels/<id>.tsx` (not `src/panels/`, which holds file panels), indexed as `PANEL_VIEWS satisfies Record<PanelId, PanelView>`.

### 2.3 The layout (`lib/player-client/src/layout.ts`, export `@workspace/player-client/layout`)

```ts
export type SetBy = "default" | "human" | "assistant";
export type Pane =
  | { id: string; kind: "panel"; panelId: PanelId; params: Record<string, unknown>; setBy: SetBy }
  | { id: string; kind: "assistant" }
  | { id: string; kind: "stored-panel"; slug: string }
  | { id: string; kind: "file-panel"; fileId: string };
export type Node =
  | { type: "split"; direction: "row" | "column"; sizes: number[]; children: Node[] }   // weights, same length as children
  | { type: "tabs"; panes: string[]; active: string };
export type DockLayout = { version: 1; root: Node; panes: Record<string, Pane> };
export type Place = { relativeTo?: string; direction: "left" | "right" | "above" | "below" | "tab" };
export const LAYOUT_LIMITS = { panes: 12, panelPanes: 4, depth: 6, bytes: 32 * 1024, writesPerMinute: 12 } as const;
export const DEFAULT_LAYOUT: (phase: Phase) => DockLayout;   // column split 50/50: p1 panel (defaultPanelFor), p2 assistant
export function parseLayout(raw: unknown, ctx: { phase: Phase; storedSlugs: readonly string[]; fileIds?: readonly string[] }): { layout: DockLayout; warnings: string[] };  // never throws
export function openPane(layout: DockLayout, pane: Pane, place?: Place): { layout: DockLayout; paneId: string };   // default place: below the most recent panel when the assistant is left/right, else to its right; a 5th built-in panel is refused (CONFLICT)
export function movePane(layout: DockLayout, paneId: string, place: Place): DockLayout;
export function closePane(layout: DockLayout, paneId: string): DockLayout;                 // refuses the assistant and the last panel
export function setPaneParams(layout: DockLayout, paneId: string, params: Record<string, unknown>, setBy: SetBy): DockLayout;
export const PRESET_LAYOUTS: Record<"stacked" | "side-by-side" | "two-panels", (current: DockLayout) => DockLayout>;
```

The player client owns one adapter (`src/dock/adapter.ts`: `toDockview`, `fromDockview`) with round-trip tests.
Floating and pop-out groups fold back into the tree on save.

### 2.4 Engine (`artifacts/engine/convex/layout.ts`, `convex/layout/tables.ts`)

```ts
dockLayouts: defineTable({ subject: v.string(), roomId: v.id("rooms"), layout: v.any(), gameId: v.optional(v.string()),
  setBy: v.object({ kind: v.union(v.literal("browser"), v.literal("device"), v.literal("oauth"), v.literal("assistant")), label: v.string() }),
  updatedAt: v.number(), recent: v.array(v.number()) }).index("by_subject_room", ["subject", "roomId"]).index("by_subject_updated", ["subject", "updatedAt"])
```

- `layout.current({roomId})` (requireMember read): the room's row, or the human's most recent row from another room
  with panel parameters reset (the panels and who chose them stay; a never-chosen first pane follows the new room's
  phase), or `DEFAULT_LAYOUT(phase)`. A new game in the room also resets panel parameters. Internal twin `currentAs`.
- `layout.set({roomId, layout, ifUpdatedAt?})` (requireMember read): `parseLayout`, rate limit (`RATE_LIMITED`),
  `CONFLICT` when `ifUpdatedAt` is stale. Internal twin `setAs`. Executors read-modify-write in one mutation each.
- `panelLayouts`, `panels.layout`, `panels.setLayout`, `panels.place`, their internal twins and the registry tool
  `place_panel` are removed. `panels.placement/size` stay stored (set at save time) as add-pane hints.
  `panels.setEnabled` stays; it is a palette command ("Turn a panel on or off") with `tools: []` and a `why`
  (the assistant opens or closes panes instead). Convex refuses a validator its documents fail, so `panelLayouts`
  is dropped from the schema only after the dev deployment's table is cleared (a gated test-fixture mutation);
  production has no rows.
- `rooms.create` starts from the seeded First steps game setup; `rooms.settingsOrigin` is set by
  `owner.settings` and copied into the game snapshot.
- `assistant/rules.ts`: `destroy_agent` joins `ALWAYS_CONFIRM`; two layout tools per step; `argsLimit("open_panel")`
  and `("set_panel_params")` = 20 000.
- `lib/ai-player/src/assistant-prompt.ts`: tool list from the catalogue; new sections THE PLAYER'S SCREEN and NEXT
  STEPS (architecture §4.1); the briefing gains a PANELS block (≤ 1 500 chars).

### 2.5 The palette (`lib/ui-kit`, export `@workspace/ui-kit`)

```ts
export type Performer =
  | { kind: "navigate"; to: string | (() => string) }
  | { kind: "form"; page: PaletteFormPage }                 // pick from a list, or one validated field, then submit
  | { kind: "submit"; run: () => Promise<unknown> }
  | { kind: "handoff"; draft: string; tool?: ToolName }     // pre-fills the assistant composer; never sends
  | { kind: "local"; run: () => void };
export interface Command { id: string; human: { title: string; tooltip: string }; group: PaletteGroup; keywords?: readonly string[]; shortcut?: string;
  confirm?: "none" | "inline" | "summary" | "modal"; performer: Performer; available: (ctx: PaletteContext) => { ok: true } | { ok: false; reason: string; fix?: string; hidden?: boolean }; defaultScore?: number }
export interface PaletteContext { role: "visitor" | "signed-in" | "member" | "seated" | "owner"; admin: boolean; permission?: "read" | "act" | "owner"; phase?: Phase; assistantOn: boolean; scope?: { paneId: string } }
export function CommandPalette(props: { commands: readonly Command[]; context: PaletteContext; open: boolean; onOpenChange(open: boolean): void; placeholder: string; suggested?: readonly string[]; recentKey?: string }): JSX.Element;
export function PaletteTrigger(props: { placeholder: string; onOpen(init?: { query?: string; page?: string }): void; compact?: boolean }): JSX.Element;
export function Term(props: { id: GlossaryId; children?: ReactNode; onAsk?: (draft: string) => void }): JSX.Element;
export const GLOSSARY: Record<GlossaryId, { term: string; gloss: string }>;
export function commandsFromCatalog(catalog: typeof CATALOG, bind: (path: PublicFunctionPath, entry: CatalogEntry) => Performer | null, surface: "player" | "engine"): Command[];
```

Per-app command lists: `artifacts/player-web/src/core/palette/commands.ts` and `artifacts/code-gods/src/lib/commands.ts`
(catalogue-derived rows + `ui.*` rows: navigation, clipboard, dock, glossary, help). Unavailable commands are
hidden from the empty query and shown dimmed with their reason when searched; commands that can never apply are hidden.

### 2.6 Test ids

Kept verbatim (the e2e suites use them): `input-source`, `button-validate`, `button-summon`, `button-lang-*`,
`panel-validation`, `text-notice`, `banner-unknown`, `text-phase`, `text-self-label`, `text-room`, `text-mode`,
`status-connection`, `input-chat`, `button-send-chat`, `row-agent-*`, `row-object-*`, `row-transformation-*`,
`banner-core-error`, `input-room-id`, `button-open-room`, `text-room-error`, `link-login`, `panel-frame-stored:*`,
`panel-error-*`, `badge-stored-*`, `dialog-panel-action`, `button-panel-action-*`, `text-panel-action-payload`,
`text-safe-mode`. Engine UI: `button-login`, `button-logout`, `text-room-code`, `text-room-owner`, `text-room-created`,
`text-viewer-seat`, `button-save-settings`, `button-ready`, `select-language`, `type-Int`, `list-settings`,
`link-player`, `link-admin-agents`, `link-game-*`, `row-member-*`, `row-credential-*`, `button-revoke-*`,
`panel-player-apps`, `text-game-status`, `panel-final-results`, `text-world-t`, `text-game-code`, `text-end-reason`,
and every `text-device-*`/`button-approve-device`/`status-approved`/`checkbox-device-owner-consent`/`text-connect-command`.
New: `dock`, `pane-<id>`, `tab-<id>`, `menu-panel`, `button-add-pane`, `button-palette`, `dialog-palette`,
`assistant-pane`, `select-setup`, `link-new-configuration`, `page-configure`.

## 3. The panels

| id | Title | For a newcomer | Parameters (assistant only) | Phases |
|---|---|---|---|---|
| `overview` | Where am I | What's happening, how I'm doing, the one thing to do next (lobby variant: who is here, the owner, what happens at start) | `focus: auto\|goal\|agents\|standing` | all |
| `my-card` | Your secret goal | Your utility card in plain words, with live examples | `examples 0–6 (3)`, `showSource`, `exampleSort: best\|worst` | planning, running, paused |
| `objects` | Objects by payoff | Which things in the world earn you points | `sortBy: payoff\|mine\|othersCare`, `filter: all\|positive\|contested\|chips`, `limit 3–60 (12)`, `highlight: objectId[] ≤ 8`, `layout: list\|grid` | running, paused, ended |
| `others-care` | What others care about | Where the others' interests lie (from totals only) | `mode: snapshot\|movements`, `quadrant: none\|chips\|conflict\|shared`, `window 10–50` | running, paused |
| `bits-over-time` | My points over time | Is it getting better or worse for me | `metric: payoff\|mine\|others`, `objects: top\|bottom\|ids`, `ids ≤ 8`, `count 1–8 (5)`, `window s` | running, paused, ended |
| `race` | Leaderboard race | Who's winning, is anyone catching up | `show: all\|top3\|me-vs-leader`, `metric: total\|gap`, `window s (300)` | running, paused, ended |
| `agents` | My agents | Your agents, their energy, when each acts next | `agentIds`, `window s (120)`, `showSource`, `showCosts` | running, paused |
| `feed` | What just changed | Latest changes and what they did to you | `who: all\|mine\|others`, `objectId?`, `minImpact bits`, `limit 5–50 (20)`, `groupBy: none\|object\|mutator` | running, paused, ended |
| `what-if` | What if… | What a move would do to your score before anyone makes it | `objectId` (required), `calls` (required), `compare?`, `value?` | planning, running, paused |
| `public-chat` | Public chat | Everything said to everyone; the only public input | `filter: all\|humans\|ai\|mentionsMe`, `highlight: string[] ≤ 5` | all |
| `forge` | Agent code | The agent being written for you and what it costs; Edit for the editor | `language?`, `source? ≤ 16 KiB`, `agentId?`, `showHelpers` | planning, running, paused |
| `results` | How the game went | Final standings and why you finished where you did | `gameId?`, `section: all\|standings\|mine` | ended, lobby |
| `rules` | How to play | The 90-second explanation, scoring and this room's settings | `section: all\|primer\|scoring\|settings` | all |

Phase-aware prompt chips and empty-state copy: player-client §4; the 90-second explanation and the glossary:
onboarding §2 (the glossary lives in `lib/ui-kit/src/glossary.ts` and feeds the assistant's primer).

## 4. Work packages

| WP | Scope (exclusive files) | Tests |
|---|---|---|
| 0 contracts | `lib/player-client/src/{catalog,panels,layout}.ts` + exports; `tools.ts` (+5 tools, −`place_panel`, `functions`, derived descriptions) + `tools.schema.json`; `convex/layout/tables.ts`, `schema.ts`, `convex/layout.ts` (functions), `agent/registry.ts` executors, `assistant/rules.ts`, `assistant-prompt.ts` (tool list from the catalogue); `panels.*` removals; `lib/ui-kit` package skeleton with the §2.5 API; `code-gods/package.json` dependencies | `lib/player-client/test/{catalog,panels,layout,tools}.test.ts`, `lib/ai-player` prompt test, engine `test:unit`, root typecheck |
| 1 engine | `convex/layout.ts` behaviour, `rooms.create` preset, `settingsOrigin`, `SETTINGS_DOCS` + `ParamSchema` docs + budget docs + manifest, briefing PANELS, prompt sections, `docs/engine-api.md`, `docs/panels.md`, `docs/room-assistant.md` | `test/game-layout.test.ts` (new), `game-assistant`, `mcp`, `game-disclosure`, game-core tests |
| 2 player client | `artifacts/player-web/src/{core,dock}/**` (built-in panels in `src/core/panels/`), `index.css`, `package.json` (dockview), deletions of `console.tsx`, `shell/dock.tsx`, `shell/layout*.ts`, `core/assistant/drawer.tsx`; palette command list; e2e updates | `test/{adapter,layout-sync,suggestions,palette-commands,assistant-state}.test.ts`; e2e `multi-client.ts` and `stored-panels.ts` updated |
| 3 ui-kit + engine UI | `lib/ui-kit/**` (palette, glossary, Term), `artifacts/code-gods/**` (shell, pages, config page, presets menu, room-creation dialog, palette wiring, tooltips), `code-gods/e2e/smoke.ts` | `lib/ui-kit/test/*`, `code-gods/test/*` (nextStep, settings form rules), e2e smoke updated |

Order: 0 → (1, 2, 3 in parallel worktrees) → merge 1, 2, 3 → every suite → code review → one PR into `develop`.

## 5. Flags for the owner

- Defaults used: assistant allowance 200 000 tokens per human per game and AI budget 300 000 tokens per game in the
  room-creation and add-AI prompts. Both are placeholders to tune.
- With the assistant off, parameterised views are unreachable by design (the dropdown picks panels; only the
  assistant sets parameters). Every panel has useful defaults.
- "player" replaces "god/deity" in functional copy; flavour copy keeps the pantheon.
- Deferred: saved custom configurations (and whether owners may name them), coaching messages beyond the empty
  states, a presentation mode for the game page.
