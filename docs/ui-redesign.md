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
8. (2026-10-31, after testing on Convex Dev; overrides anything below that contradicts it.) Game setups are one
   autocomplete collection with search; every setup has a name (the first field of the form) and an owner, the
   defaults being owned by the system so nobody can edit them; there is no generic "Custom" and no separate section
   for the defaults. Every entry has Edit (greyed out for those who do not own it) and Duplicate, which opens the
   configuration page on the copy named "<name>'s copy". The board has distinct controls for each dimension (size,
   symbols, colours), not one dropdown of shapes. Every parameter a game needs under the hood is a control
   (grammar, utility selector, complexity function, object selection, prior…), never a read-only assertion.
   Defence goals are not a per-player probability (a handicap): they are a switch with a checklist of allowed
   defence goals, and when on, everyone gets one from that set.

## 1. Decisions

| Topic | Decision | Source |
|---|---|---|
| Dock library | `dockview-react` 8.x (MIT, React 19, JSON layouts, `addPanel` relative to a pane). Not loaded under 768 px: a stacked renderer draws the same layout with the assistant as a bottom sheet. `react-resizable-panels` is removed. | player-client §1.1 |
| Layout state | A library-independent tree (`DockLayout`, below) in a new table `dockLayouts` per (human, room). The arrangement follows the human to a new room; panel parameters do not (they name one game's objects). | architecture §2.2–2.3 |
| Panes | `panel` (built-in), `assistant` (exactly one, never closable), `stored-panel` (the human's stored panel in its sandboxed frame), `file-panel` (dev containers). | architecture §3 |
| Layout tools | `get_layout` (read), `open_panel` (a built-in panel by `panelId` or a stored panel by `slug`, exactly one), `set_panel_params`, `move_pane`, `close_pane` (act). No confirmation card: view changes touch no game state and are reversible; a chip in the chat names every change. `place_panel` is removed; `placement`/`size` on panels become add-pane hints only. | architecture §2.4, player-client §6 |
| Anti-flap | `open_panel` without `place` reuses an open pane of that panel, else switches a built-in panel the player did not choose (`setBy` default, then the assistant's own latest) and opens a new pane only when `place` is given or every built-in panel is the player's; at most two layout tools per model step; 12 layout writes a minute per human per room; the assistant never moves or closes a pane the player arranged unless asked. | architecture §2.4, player-client §2.2 |
| Panels | 13 built-in panels (§3). Parameters: primitives, enums, short id lists; `forge.source` is the only code. | player-client §2, architecture §2.1 |
| Default panel | `objects` (Objects by payoff) in lobby, planning, running and paused; `results` when the game ends. The objects ranked by payoff, each with a payoff rectangle drawn to scale (width: your bits, height: what the others care, on one scale for both axes and every row, so equal values make a square and the area is the payoff; each value labelled on its edge), the numbers, the relative payoff bar and its annotation. Your bits and the others' care wear one colour each in every panel (petrol blue, raspberry); the rectangle's fill and the bar run one amber ramp by the payoff relative to the best shown (2026-10-31, the owner's phone review); before the world runs its empty state says what will appear and offers the one next step. Where am I (`overview`) stays an ordinary panel (2026-10-31: the owner found its sentences gave no insight at a glance). A pane's panel auto-follows the phase only while its `setBy` is `default` (neither the human nor the assistant chose it). A new game resets panel parameters. | this document |
| The forge | A panel (`forge`) with an in-place edit mode: the assistant drafts code into it (`open_panel {panelId: forge, params: {source}}`), the human may type or paste. Validate and Summon live in it, with the console's test ids. | architecture §0, player-client §3 |
| Public chat vs. assistant | Separate inputs. The assistant pane is "Your assistant (private)"; the `public-chat` panel has the only public input ("Say to everyone…"). A palette hand-off always targets the assistant and never sends by itself. | palette §6, onboarding §6 |
| Assistant off (allowance 0) | The client is complete without it: panels at defaults, every action in the palette and in the panels that need it. The assistant pane shows the welcome, chips in command form and one sentence on how the owner turns it on. | architecture §4.3 |
| Catalogue | `lib/player-client/src/catalog.ts`: `CATALOG: Record<PublicFunctionPath, CatalogEntry>`, keys derived from `typeof api`. Tool descriptions, the assistant's tool guide, palette rows and tooltips in both apps read from it. `TOOL_GUIDE` is deleted. | architecture §1 |
| Settings documentation | `SETTINGS_DOCS` beside `GameSettings` in `lib/game-core` (`satisfies Record<keyof GameSettings, FieldDoc>`), type-argument docs on `ParamSchema` in `lib/game-types`, room budget docs in the engine; served by `manifest.get` and `get_rules`. | onboarding §4.6 |
| Palette | One shared component in a new `lib/ui-kit` (`CommandPalette`, `PaletteTrigger`, `Term` glossary). Rows = catalogue entries with a `palette` spec + client-only `ui.*` commands of the same human shape, each with a performer: navigate, form, submit, hand-off, local. Trigger: search field + ☰ at the top right; Cmd/Ctrl+K everywhere; `/` and `?` only when no input has focus. | palette §2 |
| Confirmations in the palette | none / inline (press Enter again) / summary / modal, derived from `destructiveHint` and cost. The assistant's cards stay as they are, plus `destroy_agent` now also asks. | palette §2.6 |
| Engine UI | Stays AI-free (shared display and owner panel). Every page: one status sentence from `nextStep()`, one filled primary action, at most four sections, the rest behind Details or in the palette. Owner and creation date stay prominent wherever rooms are listed; rooms have no names. | palette §3, architecture §6 |
| Game setups and configuration | Game setups are ONE shared collection of complete, named, owned settings (`gameSetups`, `convex/setups.ts`): the system's First steps, Classic, Low income, Big board and Master (game-core `SEED_SETUPS`, owned by the system, kept equal to the code at every deploy, editable by nobody) and every human's own, visible to everyone. The room page shows one **Setup** combobox (cmdk, as the palette): typing filters by name, owner and summary; each row shows its name, owner ("System", "You", or the owner's name) and summary, with **Edit** (unavailable, with the reason, unless it is yours) and **Duplicate**; picking a row applies it at once with Undo; "New setup" duplicates the room's current one. There is no "Custom" and no "Defaults" group. The page `/rooms/:code/configure?setup=<id>` edits ONE setup (the room's when no id is given): its name first, then every `GameSettings` field as a real control (`SETTINGS_DOCS[k].control`) grouped World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with meaning and consequence from `SETTINGS_DOCS`; the board is one control per type argument, every playable combination enabled (only the retired 3×3 is not), with a light note when the first game on that shape will prepare rule tables ("about 70 s", from the measured cloud latencies) and, for the Aligned Lottery, when no synergy is measured there (it then deals like the Divine Lottery); defence goals are a switch with a checklist of the allowed ones (on: every player gets one). Anyone but the owner reads it with every control disabled and one action, "Duplicate and edit". Save writes the setup and puts the room's next game on it; Delete is in the review section. | onboarding §3–4, palette §3.3, owner (directive 8) |
| Settings changes | Every change goes through game-core `applySettingsChange` (the page per control, the engine per `owner.settings`): a language sets its grammar and summon price, an object type its default instantiation, type arguments must be playable (valid and not retired; tables are prepared on demand), excluded families that no longer exist are dropped (an excluded id must be a family of the type; one the board cannot deal is dropped), option fields must be choices of the language and type; everything else is free within `validateSettings`. Nothing else moves. | owner (2026-10-31) |
| Room creation | New rooms start on the seeded First steps setup. Creating a room asks the owner, once, to turn on the assistant with a pre-filled allowance and a consent checkbox ("Not now" keeps it off). Adding the first AI player asks for the AI budget in the same step. | onboarding §0 |
| Which setup is active | `rooms.setupId` (+ `setupName`): a room always runs a setup, and its `settings` are that setup's at the time they were applied. `owner.settings({setupId})` applies any setup; `owner.settings({settings})` edits the room's setup if the owner owns it, else creates their "<name>'s copy" and switches the room to it. A deleted setup's rooms keep their snapshot and show it as "(deleted)". Games snapshot `setupId`/`setupName`. | owner (directive 8) |
| Wording | "player" in functional copy, "god" kept in flavour copy and the glossary. "Declare ready" leaves the primary path (it gates nothing). Revision numbers and protocol versions leave the UI. | palette §5, onboarding §1.3 |
| Invite links | Stay on the room page (`/rooms/CODE`); the room page's primary action for a member is "Open player client". | this document |
| Object renderers | An object type may register several named renderers with a default; each viewer's choice per type is remembered in their browser and switched from the palette (`ui.objects.renderer`) or the grid detail view. Grids default to coloured digits (per colour set, `--cg-ink-<set>-<letter>`, derived to maximise CIEDE2000 and colour-blind separation at 4.5:1 contrast), with tiles in the same sets as the alternative. | this document |
| Object annotations | Marks that show at a glance which parts of an object make up a utility's score: grid `cells` (weighted) and `region`s, string `spans`, Int `digits` (from the left, past the sign) and `badge`s, each with a tone (good, bad, neutral) and a legend label. Types in `lib/game-utilities/src/annotations.ts` (no React), re-exported with the drawing helpers by `lib/object-views`; every renderer takes `annotations` (quiet cues in the page's ink: underlines in digits and text, outlines in tiles, solid for good and dotted for bad; weight sets thickness and opacity; no washes, glyphs or tone hues, so they never fight the digits' colours). A family may register a bespoke annotator (`ANNOTATORS` in `lib/game-utilities/src/families/annotators.ts`); every other family gets a generic sensitivity analysis of the player's own score in the browser (≤ 6 alternatives per position, ≤ 300 scorings per object, idle time, cached). The objects panel shows the player's own annotation by default (`annotate: mine\|none`). Opponents' utilities are never annotated (the client cannot score them). | this document |
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
export const defaultPanelFor = (phase: Phase): PanelId => phase === "ended" ? "results" : "objects";
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
- `rooms.create` runs the system's First steps game setup; `rooms.setupId` is set by `owner.settings` and copied
  into the game snapshot (directive 8; it replaced `settingsOrigin`, migrated by `migrations/node:setupsV2`).
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
`assistant-pane`, `select-setup` (the Setup combobox trigger), `input-setup-search`, `row-setup-*`, `button-edit-setup-*`,
`button-duplicate-setup-*`, `button-new-setup`, `text-current-setup`, `link-configure`, `page-configure`, `input-setup-name`,
`choice-arg-<param>-<value>`, `switch-defenceGoals`, `check-defence-*`, `select-<field>`, `button-duplicate-and-edit`,
`button-delete-setup`.

## 3. The panels

| id | Title | For a newcomer | Parameters (assistant only) | Phases |
|---|---|---|---|---|
| `overview` | Where am I | What's happening, how I'm doing, the one thing to do next (lobby variant: who is here, the owner, what happens at start) | `focus: auto\|goal\|agents\|standing` | all |
| `my-card` | Your secret goal | Your utility card in plain words, with live examples | `examples 0–6 (3)`, `showSource`, `exampleSort: best\|worst` | planning, running, paused, ended |
| `objects` | Objects by payoff | Which things in the world earn you points | `sortBy: payoff\|mine\|othersCare`, `filter: all\|positive\|contested\|chips`, `limit 3–60 (12)`, `highlight: objectId[] ≤ 8`, `layout: list\|grid`, `annotate: mine\|none` | running, paused, ended |
| `others-care` | What others care about | Where the others' interests lie (from totals only) | `mode: snapshot\|movements`, `quadrant: none\|chips\|conflict\|shared`, `window 10–50` | running, paused, ended |
| `bits-over-time` | My points over time | Is it getting better or worse for me | `metric: payoff\|mine\|others`, `objects: top\|bottom\|ids`, `ids ≤ 8`, `count 1–8 (5)`, `window s` | running, paused, ended |
| `race` | Leaderboard race | Who's winning, is anyone catching up | `show: all\|top3\|me-vs-leader`, `metric: total\|gap`, `window s (300)` | running, paused, ended |
| `agents` | My agents | Your agents, their energy, when each acts next | `agentIds`, `window s (120)`, `showSource`, `showCosts` | running, paused, ended |
| `feed` | What just changed | Latest changes and what they did to you | `who: all\|mine\|others`, `objectId?`, `minImpact bits`, `limit 5–50 (20)`, `groupBy: none\|object\|mutator` | running, paused, ended |
| `what-if` | What if… | What a move would do to your score before anyone makes it | `objectId` (required), `calls` (required), `compare?`, `value?` | planning, running, paused, ended |
| `public-chat` | Public chat | Everything said to everyone; the only public input | `filter: all\|humans\|ai\|mentionsMe`, `highlight: string[] ≤ 5` | all |
| `forge` | Agent code | The agent being written for you and what it costs; Edit for the editor | `language?`, `source? ≤ 16 KiB`, `agentId?`, `showHelpers` | planning, running, paused, ended (read-only) |
| `results` | How the game went | Final standings and why you finished where you did | `gameId?`, `section: all\|standings\|mine` | ended, lobby |
| `rules` | How to play | The 90-second explanation, scoring and this room's settings | `section: all\|primer\|scoring\|settings` | all |

**An ended game stays inspectable.** When a game ends nothing the player could see disappears: every panel with game
data has `ended` among its phases and renders the game frozen at its final tick (objects with their final payoffs and
marks, the player's agents and their final accounts, the race, bits-over-time and the feed to the end, others-care,
the player's own card, what-if evaluated locally on the final values, chat). `results` is only the *default* panel once
the game is over (`defaultPanelFor`); a pane the player chose or a carried layout keeps its panel. Actions are refused,
never hidden: the forge keeps the editor with Validate and Summon off and one line saying why, and My agents keeps
"Edit a copy" with Destroy off. Public chat stays open after the end: it belongs to the room, as on the room page.
Utility cards stay private after the end (no reveal of the others' goals). The engine keeps every row of an ended game
(objects, agents, deities, event batches, chat); the observation serves it until the room's next game takes the
slot, and by game id after that (`player.history`, `games.view`, `rooms.history`). Lint: `lib/player-client/test/panels.test.ts`.

**A game preparing its rule tables.** The first game on a shape with no shipped tables (on-demand calibration,
docs/analytic-calibration/architecture.md §3.4) stays in the lobby phase while its tables compute: `overview` (lobby
variant) and `results` (in the lobby) show "The game is preparing its rule tables, 12 of 18 ready…" from the room's
`preparing` (rooms.get), with why it failed if it did; the room page shows the same with a progress bar; the
assistant's briefing (from get_rules `preparing`) says it, and `start_game` returns `{status: "preparing", message}`.
The game opens by itself when the last table lands.

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
- Deferred: coaching messages beyond the empty states, a presentation mode for the game page.
- Calibration never constrains the board controls (on-demand calibration B2): every playable size × symbols × colours
  combination, and any valid Int range or string length, can be chosen. The first game on a shape with no shipped
  tables prepares them: the room page shows "The game is preparing its rule tables, 12 of 18 ready" with a progress
  bar, the player client's overview and results panels and the assistant's briefing say the same, and the game opens
  by itself when they are ready. Shipping tables (`calibrate` + `upload-calibration`) only warms the cache.
