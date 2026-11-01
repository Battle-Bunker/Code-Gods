# Player client: lens panes and the assistant, in an IDE-style dock

> Terminology: "lens" in this historical document means what the code and the UI now call a built-in **panel** (`docs/ui-redesign.md`).

Mandate: the composition of the player client (`artifacts/player-web`). It replaces the three-column
`core/console.tsx`, the fixed-region panel `shell/dock.tsx` and the side drawer `core/assistant/drawer.tsx` with
**one dock of panes**. By default there are two panes: an analytics **lens** in the top half and the **assistant**
chat in the bottom half. Players can drag panes like in an IDE, and the assistant can rearrange them with tools.
Everything else lives in the command palette (mandate a).

The screen answers three questions and nothing else: **where am I** (header), **what does it look like** (lens
panes), **what do I do next** (assistant). The dock's flexibility is there for whoever wants it. A newcomer never has
to touch it.

---

## 1. The page layout

### 1.1 Choosing the dock library

The repo uses React 19.1 (`catalog: react 19.1.0`) and Vite ^7.3. `react-resizable-panels@^2.1.7` is already in
`artifacts/player-web/package.json`. Data comes from the npm registry and bundlephobia on 2026-10-31. Sizes are
min+gzip of the whole package; nothing is tree-shaken.

| | **dockview-react** | flexlayout-react | rc-dock | react-mosaic-component | react-resizable-panels (baseline) |
|---|---|---|---|---|---|
| Licence | MIT. The separate `dockview-enterprise` package is commercial | MIT | Apache-2.0 | Apache-2.0 | MIT |
| Latest release | 8.8.3, 2026-10-30, after four releases in four days | 0.11.1, 2026-09-26 (still pre-1.0) | 4.1.0, 2026-09-30; 5.0 alphas in October | 7.2.1, 2026-09-28 | 4.15.3, 2026-10-30 |
| React 19 | peer `^16.8 … ^19` ✓ | peer `^18 \|\| ^19` ✓ | peer `>=18` ✓ | peer `16 - 19` ✓ | peer `^18 \|\| ^19` ✓ |
| Size (gzip) | ~94 kB (`dockview-core` bundled) | ~53 kB | ~58 kB, plus lodash and rc-component deps | ~43 kB, plus the react-dnd stack | ~21 kB |
| JSON layout | `api.toJSON()` / `api.fromJSON(data, {reuseExistingPanels})`. An invalid layout throws and resets | `Model.fromJson(json)` / `model.toJson()` | `saveLayout()` / `loadLayout()`, with `saveTab`/`loadTab` hooks | the layout *is* a plain n-ary tree (`value` + `onChange`) | `groupRef.getLayout()` / `setLayout()`; sizes only |
| Programmatic add/move/remove | `api.addPanel({id, component, params, position: {referencePanel, direction: 'left'\|'right'\|'above'\|'below'\|'within'}})`, `api.removePanel(panel)`, `panel.api.setSize`, `updateParameters` | `model.doAction(Actions.…)` with `DockLocation` | `dockMove(source, target, direction)` | edit the tree yourself | none: panes are JSX |
| Change events | `onDidLayoutChange`, with `reasons` (geometry, structure, activePanel, panelParameters…), and `onDidLayoutFromJSON` | `onAction` (intercept) / model change | `onLayoutChange` | `onChange` | `onLayoutChanged` |
| Tabs / drag-to-dock | ✓ / ✓, plus floating groups and popout windows | ✓ / ✓, plus popouts | ✓ / ✓, plus float | tabs (v7) / ✓ | ✗ / ✗ |
| Theming | CSS variables (`--dv-*`) plus a theme object | CSS variables (`--flexlayout-*`) over theme files | SCSS rebuild; no CSS-variable story | CSS variables; Blueprint optional | your own CSS |
| Touch | pointer-event drag for touch and pen (`dragAndDrop: 'auto'`) | "Mobile support (iPad, Android)" | undocumented | react-dnd touch backend | larger hit areas for coarse pointers |
| Accessibility | free: ARIA tablist/tab/tabpanel/region, tab-strip arrow keys, focus rings, live-region announcements. Enterprise only: spatial keyboard navigation and keyboard docking | ARIA roles, a configurable keymap, focus styling | undocumented | undocumented | `role="separator"` with keyboard resize |

**Recommendation: `dockview-react`.** It is the only candidate that is actively released, React-19-clean and
dependency-free, and its React API matches what the assistant must do one-to-one:
- "add a lens *below* lens-1" is literally `addPanel({position: {referencePanel: 'lens-1', direction: 'below'}})`;
- panel `params` carry each lens's AI-set parameters through serialisation;
- `onDidLayoutChange`'s `reasons` let us persist structure and sizes without saving every tab focus;
- `fromJSON(…, {reuseExistingPanels: true})` applies a preset without remounting the chat, so a half-typed message
  and the stream survive.

The free tier also covers everything we need: tabs, drag-to-dock, popout windows (the "lens on a second monitor"
answer), touch drag, ARIA and announcements. We use no enterprise feature.

Its weight (~94 kB gzip) is the cost. We pay it only at widths where docking exists: phones never load it (§1.6).

FlexLayout is the runner-up: smaller, MIT, with a better free keyboard story. Its 0.x API and action-object style
make the assistant's operations less direct, and the coupling is weaker. `react-resizable-panels` would satisfy only
the old "one adjustable split" brief. It cannot drag the assistant to the right or stack tabs, so we remove it from
`package.json` rather than keep two layout systems.

**Calls the shell makes** (`core/dock/shell.tsx`):

| Need | dockview call |
|---|---|
| Mount | `<DockviewReact components={{lens: LensPane, assistant: AssistantPane, panel: StoredPanelPane}} tabComponents={{lens: LensTab, assistant: AssistantTab}} rightHeaderActionsComponent={PaneMenu} className="cg-dock" onReady={({api}) => shell.attach(api)} />` |
| Create from JSON | `api.fromJSON(toDockview(layoutV2), {reuseExistingPanels: true})`, inside try/catch; on a throw, `api.fromJSON(toDockview(DEFAULT_LAYOUT))` |
| Add a pane relative to another | `api.addPanel({id: 'lens-2', component: 'lens', tabComponent: 'lens', title: 'Leaderboard race', params: {lens: 'race', params: {...}}, position: {referencePanel: 'lens-1', direction: 'below'}})` |
| Move a pane | `api.removePanel(p)` then `api.addPanel({...same id and params, position})`. A preset uses `fromJSON` (above) |
| Remove a pane | `api.removePanel(api.getPanel('lens-2')!)` |
| Change a lens or its parameters | `api.getPanel(id)!.api.updateParameters({lens, params})` and `.setTitle(title)` |
| Grow the assistant for a card | `api.getPanel('assistant')!.api.setSize({height: 320})` (or `width`, when it sits on the right) |
| Listen | `api.onDidLayoutChange(e => { if (e.reasons has 'structure' or 'geometry' or 'panelParameters') saveDebounced() })` |
| Serialise | `fromDockview(api.toJSON())` → `LayoutV2` → `layout.set({layout, revision})` (below) |

Sources: npm registry metadata (`registry.npmjs.org/<pkg>`), bundlephobia, [dockview add panels](https://dockview.dev/docs/core/panels/add),
[save](https://dockview.dev/docs/core/state/save) / [load](https://dockview.dev/docs/core/state/load) state,
[licence](https://dockview.dev/docs/overview/licence), [accessibility](https://dockview.dev/docs/advanced/accessibility),
[theming](https://dockview.dev/docs/core/theming), [migrating to v8](https://dockview.dev/docs/releases/migrating/migrating-to-v8),
[FlexLayout](https://github.com/caplin/FlexLayout), [rc-dock](https://github.com/ticlo/rc-dock),
[react-mosaic](https://github.com/nomcopter/react-mosaic), [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels).

I took the event `reasons` and `fromJSON` options from the current docs. Method names on `panel.api` need checking
against the 8.8 typedocs in the spike.

### 1.2 The layout model (what is stored and what the assistant edits)

We store our own small schema rather than dockview's JSON. This keeps the assistant's tools, the server-side
validation and the phone renderer independent of the library. `toDockview` and `fromDockview` live in
`core/dock/convert.ts` and are unit-tested as round trips. The schema lives in `lib/player-client/src/layout.ts`
(zod), shared with the registry tools (mandate c).

```json
{ "version": 2,
  "root": { "split": "row", "sizes": [0.62, 0.38], "children": [
    { "split": "column", "sizes": [0.5, 0.5], "children": [
      { "stack": [{ "id": "lens-1", "kind": "lens", "lens": "objects", "params": { "filter": "contested" }, "setBy": "assistant" }] },
      { "stack": [{ "id": "lens-2", "kind": "lens", "lens": "race" }] } ] },
    { "stack": [{ "id": "assistant", "kind": "assistant" }] } ] } }
```

| Rule | Why |
|---|---|
| Exactly **one** `assistant` pane. It cannot be closed, only resized down to its composer (56 px tall or 280 px wide) | the AI is the centre; losing it would strand a newcomer |
| **1–4** lens panes; a `stack` may hold several as tabs; the tab strip appears only when a stack has two or more | the control budget (§5); four lenses already looks like a cockpit |
| `kind: "panel"` (a stored panel by slug, in its sandboxed frame): **only if mandate c agrees** | it replaces the old left/right/bottom regions |
| Sizes are fractions, never pixels | the same layout fits any desktop |
| **Geometry and each pane's `lensId`** are stored per human (one row, as `panelLayouts` is today: `{subject, layout, revision, updatedAt}`), replacing the v1 regions layout outright | it follows the player across devices and across rooms; the assistant writes it with a tool |
| **Lens parameters** are stored per (human, room, paneId), in the architecture mandate's `lensStates`, not in the layout. The `params` in the JSON above are the client's merged view | parameters carry object ids of one game, while geometry is a habit that belongs to the person (mandate c's argument, adopted) |
| Writes go through one mutation with a `revision` check (compare-and-set), not `layout-sync.ts`'s "push after 800 ms" loop. A user drag that loses a race re-applies on top of the server's version | the AI and a drag on another device must not overwrite each other silently |

**One default, for every phase** (recommended): `lens-1` on top and the assistant below, 50/50. The layout never
changes by itself, because rearranging on a phase change disorients people. A phase change only changes **what
lens-1 shows** (§2.1). Three presets live in the palette and are available to the assistant: **Stacked** (default),
**Side by side** (assistant right, 38 %), **Two lenses + assistant** (wireframe C).

### 1.3 Wireframes (desktop ≥ 1024 px)

**A. Default: Stacked**
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ (AL) Ada Lovelace      RUNNING · 4:12        ⚡ 412 bits    ●     [⌕ Search or do…] ☰ │ 44 header
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Objects by payoff ▾   Top 12 · only ones others care about · by assistant         ⋯  │ 32 lens header
│                                                                                      │
│    1  ▦▦▦▦   yours 6.2b × others 3.1b = 19.2b   ██████████████                       │
│    2  ▦▦▦▦   yours 4.0b × others 2.2b =  8.8b   ███████                              │
│    …                                                                                 │
├────────────────────────────────────────── ═══ ───────────────────────────────────────┤ 8 gutter
│ Assistant                                                                            │ 32 header
│                                           Which objects matter most to me?  ◂ you    │
│   Your best three are #1, #2 and #5. I've filtered to objects the others care        │
│   about too, because you only score where they do.                                   │
│   ◦ looked at the game · showed Objects by payoff                               ▸    │
│  [ Ask your assistant…                                                        (↑) ]  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**B. Side by side: the assistant dragged to the right** (drag its header onto the right-edge drop zone, choose the
preset in the palette, or ask "put yourself on the right")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ (AL) Ada Lovelace      RUNNING · 4:12        ⚡ 412 bits    ●     [⌕ Search or do…] ☰ │
├───────────────────────────────────────────────────┬┬─────────────────────────────────┤
│ Objects by payoff ▾  Top 12 · contested         ⋯ ││ Assistant                        │
│                                                   ││        Which objects matter?  ◂ │
│   1 ▦▦▦▦ 19.2b ██████████████                     ││  Your best three are #1, #2…     │
│   2 ▦▦▦▦  8.8b ███████                            ││  ◦ looked · showed Objects   ▸   │
│   …                                               ││                                  │
│                                                   ││ [ Ask your assistant…       (↑)] │
└───────────────────────────────────────────────────┴┴─────────────────────────────────┘
```

**C. Two lenses stacked on the left, the assistant on the right.** "Add a lens" in the palette, or "also show me the
race", adds `lens-2` **below the last lens in the left column** (the default placement rule, below). The player can
also drag a lens header onto the bottom half of `lens-1`.
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ (AL) Ada Lovelace      RUNNING · 4:12        ⚡ 412 bits    ●     [⌕ Search or do…] ☰ │
├───────────────────────────────────────────────────┬┬─────────────────────────────────┤
│ Objects by payoff ▾  Top 12 · contested       ⋯ ✕ ││ Assistant                        │
│   1 ▦▦▦▦ 19.2b ██████████████                     ││  …                               │
│   2 ▦▦▦▦  8.8b ███████                            ││                                  │
├──────────────────────── ═══ ──────────────────────┤│                                  │
│ Leaderboard race ▾  Last 5 min · everyone     ⋯ ✕ ││                                  │
│   ╱‾‾‾ you                                        ││                                  │
│  ╱──── Grace                                      ││ [ Ask your assistant…       (↑)] │
└───────────────────────────────────────────────────┴┴─────────────────────────────────┘
```

**Placement rule for a new lens** (from the palette, `add_pane` without a position, or "Add lens below/right" in ⋯):
*below the most recently focused lens pane* when the assistant sits right or left; *to the right of it* when the
assistant sits above or below. Either way the assistant keeps its edge. With four lenses, the new one opens as a tab
of the focused lens instead.

### 1.4 Global header: the minimum

| Slot | Shows | Rules |
|---|---|---|
| Identity | initials avatar + full name (avatar only on phone) | "view only" pill for a `read` credential |
| Phase | `LOBBY · 3 of 5 ready` / `PLANNING · starts in 0:42` / `RUNNING · 4:12` / `PAUSED · resumes 0:18` / `GAME OVER` / `SPECTATING` | the only `--primary` element in the header; it replaces `Countdown` and `LobbyStatus` |
| Energy | `⚡ 412 bits` | planning, running and paused only; tabular mono |
| Connection | a dot: accent = live, muted + `.beat` = reconnecting | text only when not live |
| Palette | `⌕ Search or do…` + `☰` (an icon only on phone) | mandate a |

These move to the palette's "This room" section: room code, game code, owner and creation date, mode
("hosted client" / "your player app"), safe mode, the room and game links, **Reset layout**, sign out.

### 1.5 Pane headers

Both pane headers are dockview tab renderers (`LensTab`, `AssistantTab`), 32 px tall, one per pane, full width when a
stack holds a single pane. **The header is the drag handle.** Dockview's drag threshold keeps clicks from becoming
drags.

**Lens pane header:** `[Lens title ▾]  parameter caption  ‹ ↺  ⋯  ✕`

| Part | Behaviour |
|---|---|
| `Lens title ▾` | the lens dropdown: 14 px, semibold, the title in Fraunces. Built-in lenses grouped by phase relevance, then "Yours" (stored panels, if adopted), then the assistant's saved presets. Picking only changes the lens; its parameters come back as last used in this pane, or the defaults |
| Parameter caption | 12 px muted plain language: "Top 12 · only ones others care about · by assistant". Truncates; the tooltip adds "set by your assistant 2 min ago". **Not editable**: only the AI sets parameters |
| `‹` `↺` | appear only after the assistant changed this pane: back to the previous view, or reset to defaults |
| `⋯` | Maximise · Pop out to a window (dockview popout) · Add lens below/right · Ask about this view (fills the composer with "About the {lens} view: ") · Close |
| `✕` | shown only when two or more lens panes exist; the last lens cannot be closed |

**Assistant pane header:** `Assistant` + a status word ("thinking…" with `.beat`, "waiting for you" while a card is
open), and nothing else. Threads, permission and auto-approve settings are in the palette. Collapse it by dragging
the gutter, or press `Esc` in an empty composer.

### 1.6 Sizes, persistence, phone

| Property | Value |
|---|---|
| Default split | 50/50, top/bottom. Side by side: lens 62 %, assistant 38 % |
| Minimums | lens pane 160 px tall / 320 px wide. Assistant 56 px tall (composer only, plus a 22 px preview of its latest line) / 280 px wide |
| Gutters | 8 px hit area, 1 px `--card-border` line, `--primary` on hover or drag. Keyboard: Tab to a gutter, ↑/↓ or ←/→ to resize |
| Shortcuts | `/` focuses the composer; `Esc` in an empty composer collapses the assistant to its minimum; palette shortcuts: mandate a |
| Persistence | geometry and lens ids in the per-human layout row; parameters in `lensStates`; a localStorage boot cache only, as today |
| **Phone (< 768 px)** | dockview is **not loaded** (`React.lazy` behind a `matchMedia` check). `core/dock/stacked.tsx` renders the same `LayoutV2`: lens panes in reading order, stacked vertically and scrolled, each at least 280 px. The assistant is always a **bottom sheet** (peek 56 px / half / full), wherever it sits on desktop. No drag, no gutters, no tabs (tabbed lenses become stacked). Focusing the composer snaps the sheet to half, and the lenses shrink to their one-line **summary strips**. Phones read the synced layout but never write sizes |

**Phone (390 px), the default layout**
```
┌────────────────────────────────┐
│ (AL)  RUNNING 4:12  ⚡412  ●  ⌕ ☰│
├────────────────────────────────┤
│ Objects by payoff ▾          ⋯ │
│ top 12 · others care           │
│  1 ▦▦ 19.2b ██████████         │
│  2 ▦▦  8.8b █████              │
├──────────────  ═══  ───────────┤ bottom sheet
│ Your best three are #1, #2…    │
│ ◦ 2 steps ▸                    │
│ [Ask your assistant…       (↑)]│
└────────────────────────────────┘
```

**Behaviour by state**

| State | Assistant pane | Lens panes |
|---|---|---|
| **Model streaming** | size unchanged; pinned to the bottom unless the player scrolled up ("↓ new" pill); send becomes **Stop**; the header says "thinking…" | unchanged unless the assistant calls `set_lens` |
| **Confirmation pending** | the card **docks above the composer**. If the pane is under 200 px tall (or 280 px wide), `setSize` grows it to fit, and the old size comes back after the decision | the focused lens pane previews the consequence under a ribbon "Preview · not done yet": `summon_agent` → Agent code; `send_chat` → Public chat with a ghost line; `pause_game` → Overview, "your one pause stops the world for N s". It reverts afterwards |
| **Lobby** | same layout; the empty state and chips lead | `overview` (lobby variant) |
| **Assistant off** (allowance 0) or **spent** | the composer becomes a command search feeding the palette ("Assistant is off in this room · type to search commands") | lenses work at their defaults |
| **Outcome unknown** (a direct command's transport failed) | a system card: "Your summon may not have arrived. **Retry the same command** · It didn't apply" (today's `banner-unknown`, same envelope) | unchanged |

---

## 2. The lens catalogue

**Contract.** A lens is `{id, title, blurb, phases, params (zod), summary(state) → string, Component}` in
`core/lens/registry.ts`. Its parameter schemas live in `lib/player-client/src/lenses.ts`, so the registry tool
validates exactly what the client renders (mandate c). **Only the assistant sets parameters**, through one tool,
`set_lens {pane?, lensId, params}`. Without `pane` it targets the most recently focused lens pane. Each pane's
dropdown chooses a lens and nothing else: picking one restores the parameters last used for that lens in that pane,
or its defaults. The pane header shows the parameters as a read-only caption (§1.5).

| # | id · title | For a newcomer | Hooks | Rendering | Parameters (AI only): name · type · default · range · meaning | Phases |
|---|---|---|---|---|---|---|
| 1 | `overview` · Where am I | "What's happening, how I'm doing, and the one thing to do next." | `useGame`, `useMyCard`, `useObjects`, `useMyAgents`, `useLeaderboard`, `useRoomInfo` | three sentences in 16 px prose (situation, standing, next step), three big numbers in mono (rank, total payoff, agents acting), and **one next-step button** with a chat equivalent. Lobby variant: members with ready ticks, owner, "what happens when the game starts" | `focus` · enum auto/goal/agents/standing · auto · what the middle sentence is about. `detail` · enum newcomer/brief · newcomer · prose length | all |
| 2 | `my-card` · Your secret goal | "What you score for, in plain words." | `useMyCard`, `useObjects`, `useEvaluator` | `UtilityCardView` + `HowScoringWorks` (open on first game) + the 3 live objects that score best for you, each with `ScoreBreakdown compact` | `examples` · int · 3 · 0–6 · how many live examples to show. `showSource` · bool · false · show the kid-card code. `exampleSort` · enum best/worst · best · examples you like or dislike most | planning, running, paused |
| 3 | `objects` · Objects by payoff | "Which things in the world earn you points." | `useObjects`, `useObservation` (instance, comparative) | ranked list: `ObjectView`, `yours × others = payoff` and a bar; "why?" expands `ScoreBreakdown` (as today) | `sortBy` · enum payoff/mine/othersCare · payoff. `filter` · enum all/positive/contested/chips · all · contested = both care; chips = others care, you don't. `limit` · int · 12 · 3–60. `highlight` · objectId[] · [] · ≤ 8 · objects the assistant is talking about. `layout` · enum list/grid · list | running, paused, ended |
| 4 | `others-care` · What others care about | "Where the other players' interests lie (from totals only)." | `useObjects`, `useEvents` | `ScatterPlot` mine × others with highlighted quadrant; `BarList` of the quadrant counts; caption "inferred from totals, not anyone's actual goal" (merges `salient-to-others` and `opponent-interests`) | `mode` · enum snapshot/movements · snapshot · current values vs how recent changes moved them. `quadrant` · enum none/chips/conflict/shared · none · which region to highlight and list. `window` · int · 50 · 10–50 ticks · how far back `movements` looks | running, paused |
| 5 | `bits-over-time` · My points over time | "Is it getting better or worse for me?" | `useTrajectories`, `useObjects` | `LineChart`, one series per object, with dashes; legend uses `Obj` | `metric` · enum payoff/mine/others · payoff. `objects` · enum top/bottom/ids · top. `ids` · objectId[] · [] · ≤ 8. `count` · int · 5 · 1–8. `window` · int seconds · 0 (= whole game) · 0–3600 | running, paused, ended |
| 6 | `race` · Leaderboard race | "Who's winning, and is anyone catching up?" | `useLeaderboard`, `useGame` (+ a standings series, §6) | `LineChart` of total payoff per god; you in `--primary`, solid; AI seats marked "AI" in the legend; current ranks as a `Table` underneath | `show` · enum all/top3/me-vs-leader · all. `metric` · enum total/gap · total · gap = distance to the leader. `window` · int seconds · 300 · 60–3600 | running, paused, ended |
| 7 | `agents` · My agents | "Your agents, their energy, and when each acts next." | `useMyAgents`, `useGame` | per agent: a status word (ready / charging 3 s / cooldown), an energy bar with the act-cost tick (as today), a `Sparkline`; `Timeline` lanes beneath | `agentIds` · string[] · all. `window` · int seconds · 120 · 30–600. `showSource` · bool · false. `showCosts` · bool · false · the `AgentCost` breakdown | running, paused |
| 8 | `feed` · What just changed | "The latest changes to the world and what they did to you." | `useEvents`, `useMutators`, `useObservation` | a reverse-chronological feed: `TransformationView`, "mine / someone else's", Δ yours, Δ others; mine also shows the calls and cost. `groupBy: mutator` reproduces `mutator-explorer` as a `Table` | `who` · enum all/mine/others · all. `objectId` · string? · none · follow one object. `minImpact` · number bits · 0 · 0–64 · hide small changes. `limit` · int · 20 · 5–50. `groupBy` · enum none/object/mutator · none | running, paused, ended |
| 9 | `what-if` · What if… | "What a move would do to your score, before anyone makes it." | `useEvaluator`, `useObjects`, `useMutators` | before → after (`Obj`), Δ your net bits, act cost; when there is a second hypothesis, the two side by side; always the note "others' reaction is unknowable" | `objectId` · string · required. `calls` · `[mutatorId, params][]` · required · 1–16 · the move to try. `compare` · calls? · none · a second move to compare. `value` · wire? · none · score a raw value instead (mirrors `evaluate_value`) | planning, running, paused |
| 10 | `public-chat` · Public chat | "Everything said to everyone. This is where deals happen." | `useChat`, `useGame` | large readable transcript: you in `--primary`, AI seats tagged; mentions of you highlighted; a "Say to everyone…" line at the bottom (see §3) | `filter` · enum all/humans/ai/mentionsMe · all. `highlight` · string[] · [] · ≤ 5 terms · words the assistant is pointing at | all |
| 11 | `code` · Agent code | "The agent your assistant is writing for you, and what it costs." | the agent draft (§6), `useMyAgents`, `useMutators` | code (mono on `--secondary`), language, validation: VALID/INVALID, `AgentCost`, diagnostics. **One button: "Edit"** switches the pane to in-place editing (§3) | `source` · enum draft/agent · draft. `agentId` · string? · none · show a live agent's code. `showHelpers` · bool · false · the `HelpersDrawer` list, read-only | planning, running, paused |
| 12 | `results` · How the game went | "Final standings and why you finished where you did." | `useLeaderboard`, `useTrajectories`, `useObjects`; `list_games`/`get_game_history` data for older games | podium `Table`, your payoff line over the game, your three best and worst objects | `gameId` · string? · the game that just ended · a past game of this room. `section` · enum all/standings/mine · all | ended, lobby |

Stored panels (docs/panels.md) appear, if mandate c agrees, as a third pane kind, listed under "Yours" in every
lens dropdown. Each renders in its sandboxed frame. Their manifest `placement` and `size` become the defaults for
"add pane" (left/right/bottom map to a direction relative to the focused lens). A stored panel's own controls are its
business, because it is the player's own code.

### 2.1 Default lens per phase

| Phase | Default | Why |
|---|---|---|
| lobby | `overview` (lobby variant) | who is here and what happens next; the "I'm ready" button |
| planning | `my-card` | the first thing a newcomer must know is what they want |
| running | `overview` in the player's first game, `objects` after that | newcomers need the story, returning players the ranking |
| paused | `overview` | why it paused, when it resumes, what changed |
| ended | `results` | |

A **phase change** sets the default only in the **first lens pane** (`lens-1`, top-left), and only if the player
did not pick its lens by hand in the last 60 s. Other lens panes are the player's own and keep their lens. Lens
choices live in the synced layout, so every open client follows them.

### 2.2 When the assistant switches lenses

1. **Asked** ("show me…", "which objects…"): switch.
2. **Its answer is about something visual** (a ranking, a trend, a comparison): switch, and say so in one clause
   ("I've put them on top").
3. **Previewing a confirmation**: switch the focused lens pane for the duration of the card, then return (§1.6).
4. **Never** within 20 s of the player touching that pane or its dropdown. It offers the view instead: a step line
   reading "Suggested view: Agent code ▸", which switches on click.
5. **Never** two switches in one turn; the last one wins.
6. **Panes are the player's.** The assistant adds, moves or removes panes, or applies a preset, only when asked
   ("show the race too", "put yourself on the right"). It never does so to illustrate an answer: it switches the
   lens of an existing pane instead.

Every switch pushes onto that pane's history. The header's `‹` returns to the previous view, and `↺` re-applies the
lens's defaults. Both appear only when there is something to undo.

---

## 3. Where today's affordances go

| Today (`console.tsx` / dock / drawer) | Becomes | Detail |
|---|---|---|
| Forge: language toggle, editor, `HelpersDrawer` | **Code lens**, with an **edit mode** | The player asks ("write an agent that…"). The assistant writes the shared draft (`set_agent_draft`, §6), calls `validate_agent` and shows the Code lens. A human who wants to type presses **Edit** in the Code lens, or uses the palette ("Write agent code…", "Paste agent code…"), which opens or focuses a Code pane in edit mode. That pane *is* the forge: the textarea, the language (preset to the room's), the helpers drawer with insert, a byte count, and **Validate** / **Summon…**. Editing code is content, not a lens parameter. Each keystroke pause writes the shared draft, so "check what I pasted" works in chat. In a dock, the editor is a pane like any other, so the old sheet idea is dropped. |
| Forge: Validate | chat action (auto, step line) + the Code pane's edit-mode button | |
| Forge: Summon | chat action (confirmation card) + the edit mode's "Summon…" (its own confirmation with the cost) | A summon must not be paid twice: the pane keeps the envelope for an identical retry. |
| Your agents: list, energy, status | **`agents` lens** | |
| Your agents: load into forge | "Edit a copy" on an agent in the `agents` lens (its one action) + palette | opens the Code pane in edit mode |
| Your agents: destroy | chat action + palette "Destroy agent…" | Today `destroy_agent` runs without a card; I want a card when the player did not name the agent (§6). |
| Analytics tiles (6) | **`overview`** keeps rank, total payoff and agents acting; the Σ net-bits tiles go to the `objects` lens footer | the other tiles are dropped from the primary screen |
| Your utility function | **`my-card` lens** | |
| Objects by your points (+ "why?") | **`objects` lens** | "why?" stays: it is a disclosure, not a parameter |
| Your transformations | **`feed` lens** (`who: mine`) | |
| Readiness: Declare / Withdraw ready | the overview's lobby next-step button + chat (`set_ready`, auto) + palette | |
| Readiness: Pause | chat (card) + palette "Use my one pause…" (a card with what it costs) | never on the primary screen: it can be used once and cannot be undone |
| Leaderboard | **`race` lens** (its table) + rank in `overview` | |
| Public chat: transcript | **`public-chat` lens** + an unread badge on the lens dropdown ("Public chat · 3") | |
| Public chat: input | "Say to everyone…" inside the `public-chat` lens + palette "Say publicly…" + asking the assistant (card) | negotiation is the game, so typing straight to the room must not cost a model turn and a confirmation. It is the only lens with a text input, styled as public: a globe icon and a `--primary` rule. |
| Dock: left/right/bottom regions, move buttons ◧◨⬓, size cycling sm/md/lg, tabs/stack toggle | **dockview**: drag a pane header to any edge or centre (centre = tab), drag gutters to resize, ⋯ → Maximise / Pop out / Close | layout v1 (regions) is replaced by `LayoutV2`, clean break |
| Dock bar: "show {hidden}", reset layout, safe mode, panel counts, the dev "sandbox" toggle | palette: "Add lens…", "Reset layout", "Layout: Stacked / Side by side / Two lenses", safe mode, the dev toggle | closed panes are simply gone; add them again from the palette |
| Drawer: threads, model label, permission | palette: "New conversation", "Past conversations", "Assistant settings" (permission, revoke, auto-approve summons up to N bits) | |
| Drawer: allowance meter | the composer's top edge (§4) | |
| Panel action confirmations (`shell/confirmations.tsx`) | unchanged modal; it reuses the confirm-card visuals | |
| Second monitor | ⋯ → Pop out (a dockview popout window) | the popout stays part of the same layout and comes back when closed |

---

## 4. The chat's visual grammar

At 160 px tall (or 280 px wide on the right) the timeline has about 72 px under the 32 px pane header: three to four lines of 14 / 20 px text. Everything below is designed for that.

| Element | Look |
|---|---|
| **User message** | right-aligned, max 75 % wide, `bg-muted`, 14 px sans, `--radius-md`, 6 / 10 px padding; while pending, 60 % opacity |
| **Assistant message** | left-aligned, no container, 14 px sans in `--foreground`, max 68 ch; light markdown (bold, inline code, short lists); object references (`#3`) render as inline `Obj` chips that highlight in the lens on hover |
| **Step line** (tool activity) | **one line per model step**, never one per call: `◦ looked at the game · tested agent code · showed Agent code`, 12 px sans in `--muted-foreground`, built from human verbs (the registry's `title`, put into the past tense). Truncates with "+2", and `▸` expands to today's chips (mono, exact arguments). While running, the current verb in the present tense with `.beat` ("testing agent code…"). An error turns the line `--destructive` and leaves it expanded. A denied call reads "you declined: post to everyone". |
| **Confirmation card** | docked above the composer, `--card` with a 2 px `--primary` left rule. Line 1, a plain sentence: "Post to everyone: *"Let's leave the blue grids alone"*" / "Summon this agent for **38 bits** of your 412" / "Use your one pause (stops the world 30 s)". Line 2: **Approve** (primary) · **Not now** (ghost) · "Details ▸" (the exact payload as JSON). The 2-minute deadline drains as a 2 px bar along the bottom. The buttons arm after 700 ms, like `shell/confirmations.tsx`. `⌘↵` approves; plain `↵` never does. |
| **System line** | centred, 12 px, muted: "Game started · you're in planning", "You approved the summon". The assistant's phase changes and outcomes appear here too, not as banners. |
| **Allowance meter** | no persistent meter. It is a 2 px line on the composer's top edge, in `--accent`, filling with use; text appears only past 80 % ("15 % of this game's assistant allowance left") and at 100 % ("Allowance used up for this game · ⌕ do it yourself"). |
| **Permission (first use)** | an inline card in the empty state, shown once: "Your assistant acts as you. ● **Play for me** (asks before anything public or costly) ○ **Only look**". "Owner powers…" sits behind a disclosure for the room owner. Sending the first message accepts the choice, with no extra click. Later changes go through the palette. |

**Empty state** (Fraunces 20 px greeting, then 14 px; all under 40 words):

| Phase | Copy |
|---|---|
| lobby | "Hi, I'm your assistant. The game hasn't started yet. Ask me how Code Gods works, or tell me you're ready." |
| planning | "Above is your secret goal. Next: tell me in plain words what your agent should do. I'll write it, test it, and ask before spending your energy." |
| running | "The world is live. Ask me what to do next. I'll point at what matters and explain why." |
| paused | "The world is paused. A good moment to ask what changed, or to make a public proposal." |
| ended | "Game over. Ask me why you finished where you did, and what to try next time." |

**Prompt chips** (three at most, under the empty state and after a finished turn, hidden while typing):

| Phase | Chips |
|---|---|
| lobby | "How does this game work?" · "Who's in the room?" · "I'm ready" |
| planning | "Explain my goal simply" · "Write me a first agent" · "What should my agent do?" |
| running | "What should I do next?" · "Which objects matter to me?" · "What do the others want?" |
| paused | "What changed?" · "Draft a public proposal" · "Should I change my agents?" |
| ended | "Why did I finish there?" · "What would have worked better?" · "Show the results" |

**Lens → chat.** Clicking any object in any lens pane puts a reference chip ("object #3") into the composer.
Pointing at something and then asking about it needs no parameter UI.

---

## 5. Design principles and tokens

**Principles.**
1. Words before numbers. Every lens leads with a sentence; numbers support it.
2. One next step. At most one primary-coloured action on screen.
3. The assistant configures and the human chooses: the dropdown picks, the AI tunes.
4. Nothing on the primary screen is irreversible without a card.

**Control budget** in the default layout (one lens and the assistant), counting every visible interactive element:

| # | Persistent (7) | Where |
|---|---|---|
| 1 | palette search | global header |
| 2 | ☰ menu | global header |
| 3 | lens dropdown (the lens title) | lens pane header |
| 4 | ⋯ pane menu | lens pane header |
| 5 | gutter between the panes | dock |
| 6 | composer | assistant pane |
| 7 | send / Stop | assistant pane |

Not counted as controls, but present: dragging a pane header (no visible button), and the assistant pane header,
which has none.

**Contextual: at most 3 more at once, one group at a time:**
- prompt chips (≤ 3), **or**
- a confirmation card (Approve, Not now; "Details" is a disclosure), **or**
- the lens's history (‹, ↺) plus its one action (next step, Edit, "why?" on the hovered row, the public-chat input).

**Default screen: 7 persistent + 3 contextual = 10 at most.** Each lens pane the player adds costs three more: the
dropdown, ⋯ and ✕ (and ✕ then also appears on the first pane). That is the player's choice, never the default.
Today's console shows more than 25 controls before scrolling, plus three to five per docked panel.

**Typography** (existing families):

| Step | Font | Use |
|---|---|---|
| 11 px / 0.12 em caps | JetBrains Mono (`.label`, raised from 10 px for legibility) | chart axes, tab labels in stacks |
| 12 px | Bricolage Grotesque | step lines, system lines, captions |
| 14 px / 1.45 | Bricolage Grotesque | chat and lens body |
| 16 px / 1.5 | Bricolage Grotesque | the overview's sentences |
| 20 px | Fraunces | the empty-state greeting (pane titles use Fraunces at 14 px) |
| 28 px tabular | JetBrains Mono | the overview's three big numbers |

**Spacing.** A 4 px base (`--spacing`), with steps 4 / 8 / 12 / 16 / 24 / 32. Fixed heights: global header 44, pane
headers 32, gutter 8, composer 44 (it grows to 5 lines, then scrolls). Pane padding: 16 px desktop, 12 px phone. No
card frames inside a pane: one `--card` surface per pane, with 1 px `--card-border` gutters between them. This
removes the panel-within-panel look of today's `Panel`.

**Dock theme** (`.cg-dock` in `index.css`). It maps dockview's `--dv-*` variables onto our tokens, and the spike checks
the exact names against the 8.x theming page:
- background → `--background`;
- group and tab-strip background → `--card`;
- separator → `--card-border`;
- active tab text → `--foreground`, inactive → `--muted-foreground`;
- drop-target overlay → `--primary` at 12 % alpha;
- focus ring → `--ring`.

Tab radius is 0. There are no tab close icons (closing is in ⋯ / ✕). With one tab, the tab strip *is* the pane header.

**Colour.**
- The header moves from `bg-sidebar` (navy) to `--background` with a hairline; navy is reserved for code surfaces.
- `--primary` (vermilion) marks only the phase pill, the one next-step action, send / Approve and "you" in charts.
- `--accent` (teal) means good, positive, ready or live.
- `--destructive` means negative bits, cooldown or an error.
- Chart series use `SERIES` / `DASHES` from `sdk/charts.tsx`; colour is never the only channel.
- `.dark` repeats the light values today: dark mode is effectively unimplemented (flag for theming).

**Motion.**
- Lens change: cross-fade plus the 6 px `.rise`, shortened to 200 ms.
- Numbers update with no animation (ticks are once a second; motion would be noise).
- `.beat` is used only for "working" states.
- Drop-target overlays fade in over 100 ms; dockview's own animation is otherwise left alone. A sheet snap on phones takes 120 ms ease-out.
- Add a `prefers-reduced-motion` block to `index.css` that disables `.rise` and `.beat` (it has none today).

**Files I would create**
- `core/header.tsx` (`StatusHeader`, `PhasePill`).
- Dock: `core/dock/shell.tsx` (`PlayerShell`, replacing `Dock` + `Console` in `app.tsx` `Play`; it mounts
  `DockviewReact`), `core/dock/stacked.tsx` (the phone renderer), `core/dock/convert.ts` (`toDockview`,
  `fromDockview`, round-trip unit tests), `core/dock/layout-store.ts` (`LayoutV2`, presets, the placement rule,
  per-pane history, compare-and-set sync; it replaces `shell/layout.ts` and `shell/layout-sync.ts`), `core/dock/tabs.tsx`
  (`LensTab`, `AssistantTab`, `PaneMenu`).
- Lens host: `core/lens/registry.ts`, `core/lens/pane.tsx` (`LensPane`, `ParamCaption`).
- Lenses: `core/lenses/{overview,my-card,objects,others-care,bits-over-time,race,agents,feed,what-if,public-chat,code,results}.tsx`.
- Chat: `core/chat/{pane,timeline,step-line,confirm-card,composer,empty-state}.tsx`. The pure logic of
  `assistant/state.ts` carries over (`buildTimeline`, `cardReducer`, `allowanceMeter`); `chipView` grows into
  `stepView`.
- Deleted (clean break): `shell/dock.tsx`, `shell/layout.ts`, `core/console.tsx`, `core/assistant/drawer.tsx`, and
  `react-resizable-panels` from `package.json`. Stored-panel framing (`stored-frame.tsx`, `panel-frame.tsx`,
  `confirmations.tsx`) is kept for the `panel` pane kind.

---

## 6. Risks, and what I need from the other mandates

| Risk | Who | Mitigation |
|---|---|---|
| **The assistant is off by default** (owner allowance 0), so the centrepiece is dead on first visit | newcomers | Mandate b: the config page defaults to a modest allowance and asks the owner on room creation. Here: the composer becomes a command search, and lenses and the palette cover everything. |
| A blank text box ("what do I type?") | newcomers | phase empty-state copy, three chips, the overview's next-step button |
| JSON confirmations read as alarming | newcomers | a plain sentence first, payload behind "Details", the lens previews the consequence |
| The AI states a wrong number | everyone | the lens is ground truth beside the claim |
| Lens switches feel like the screen moving by itself | everyone | the 20 s rule, one switch per turn, the "set by assistant" caption, `‹` back |
| Every parameter tweak costs a model turn and allowance | power users | the assistant may save a configured view as a **preset**. Presets appear in the dropdown and palette and are recalled without the model. The parameters were still set by the AI. |
| IDE flexibility reads as clutter, or a stray drag wrecks the layout | newcomers | one calm default; drags start only from pane headers, past dockview's threshold; "Reset layout" is always in the palette; the assistant cannot rearrange panes unprompted (§2.2 rule 6) |
| dockview's default look is heavy and IDE-like (tab strips, borders) | everyone | the `.cg-dock` theme: a single-tab header *is* the pane header, no tab icons, hairline gutters |
| ~94 kB gzip on the primary path | everyone on desktop | lazy-load behind the width check; phones never download it; the spike measures real tree-shaken size |
| dockview's free tier lacks keyboard docking | keyboard users | palette commands ("Move assistant right", "Add lens below") and asking the assistant cover every layout change; gutters and tab strips stay keyboard-operable |
| Layout JSON from another device or the AI is invalid | everyone | validated with zod server-side and client-side; `fromJSON` failure falls back to the default layout |
| Typing code or public chat through the AI is slow | power users | the Code pane's edit mode and the public-chat input are direct; palette commands for everything |

**From mandate a (palette and engine UI):** commands for every affordance marked "palette" in §3. The palette should
accept the composer's text when the assistant is off. Reserve `/` (composer focus) and `Esc` (collapse). "This room"
shows code, owner and creation date. Per-lens "Show …" commands, "Add lens…", the three layout presets, "Move
assistant left / right / bottom", "Reset layout", preset recall and assistant settings.

**From mandate b (onboarding and game configuration):** a first-run flow that ends *on this screen* (lobby,
`overview`, the lobby empty state) rather than a tour layered over it; owner settings kept on the configuration page;
the non-zero default allowance; a "first game" flag for §2.1.

**From mandate c (agent architecture):**
- **Layout tools** over `LayoutV2` (`lib/player-client/src/layout.ts`), all permission `read` (they touch only the
  human's own UI), run automatically and validated server-side (one assistant, 1–4 lenses, known lens ids,
  parameters valid for the lens):
  - `get_layout` (or fold it into `list_lenses`), so the assistant knows what the player sees;
  - `set_lens {pane?, lensId, params}`;
  - `add_pane {pane: {kind, lens?, params?, slug?}, relativeTo?, direction?: left|right|above|below|within}`;
  - `move_pane {id, relativeTo, direction}`;
  - `remove_pane {id}`;
  - `apply_layout {preset}`.

  The layout tools write the per-human layout row and `set_lens` writes `lensStates`; every open client re-renders
  through its subscription. This **reverses** the architecture draft's deletion of `panelLayouts` and `place_panel`:
  the dock directive needs a stored, AI-writable layout. `place_panel` becomes `move_pane`. The names `set_lens` and
  `list_lenses` follow the architecture draft.
- A decision on `kind: "panel"` (stored panels as panes) and on whether `place_panel`'s `placement`/`size` survive.
- Saved lens presets `{name, lens, params}` per human.
- **Agent drafts** (`set_agent_draft`, `get_agent_draft`, one shared draft per player per game), so the AI and the
  Code pane's edit mode work on the same source.
- `evaluate_calls {objectId, calls}`, so the AI knows what the What-if lens shows (`evaluate_value` takes only a value).
- A public **standings series** query, so `race` is not empty every time it opens (today's example samples only
  while mounted).
- A confirmation for `destroy_agent` unless the player named the agent.
- Past-tense and present-tense verbs per tool (from `title`) for step lines.
- The mock provider (`AI_MOCK=1`) extended to script `set_lens` and `add_pane`, for e2e tests of switching,
  previews and layout changes.
