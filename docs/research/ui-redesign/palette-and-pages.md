# Palette and pages: progressive disclosure for Code Gods

> Terminology: "lens" in this historical document means what the code and the UI now call a built-in **panel** (`docs/ui-redesign.md`).

Mandate (d): the research on progressive disclosure, the command palette, and the cleanup of every engine UI page
(`artifacts/code-gods`: `/`, `/rooms/:id`, `/games/:code`, `/device`, `/connect`, `/admin/agents`). The player client's
primary screen and its lenses belong to (a), onboarding and the configuration page to (b), and the agent-centred
architecture to (c). Section 6 lists what I need from each of them.

**Thesis.** Every screen answers one question: *what do I do next?* It does that with one filled button, at most four
sections and plain words. Everything else moves to one of two places. Options that belong to a section go behind that
section's **Details** disclosure. Everything else goes to **one command palette**. The palette lists every affordance
of both apps and every tool in `lib/player-client/src/tools.ts`, so a human can do anything the AI can.

---

## 0. Sources

| # | Source | Used for |
|---|---|---|
| S1 | NN/g, *Progressive Disclosure*: https://www.nngroup.com/videos/progressive-disclosure/ ; Nielsen's essay: https://uxtigers.com/post/progressive-disclosure | deferring advanced features to a secondary surface |
| S2 | Laws of UX, Hick's law and choice overload: https://lawsofux.com/ ; https://thedecisionlab.com/reference-guide/design/hicks-law | fewer, unequal choices |
| S3 | NN/g, *How Chunking Helps Content Processing*: https://www.nngroup.com/articles/chunking/ (with Cowan's ~4-chunk estimate) | at most 4 groups |
| S4 | Red Hat Design System, call-to-action guidelines: https://ux.redhat.com/elements/call-to-action/guidelines | one primary action per page |
| S5 | NN/g, *UI Accelerators*: https://www.nngroup.com/articles/ui-accelerators/ ; *Flexibility and Efficiency* heuristic: https://www.nngroup.com/articles/flexibility-efficiency-heuristic/ | the palette as an accelerator |
| S6 | NN/g, *Hamburger Menus and Hidden Navigation*: https://www.nngroup.com/articles/hamburger-menus/ | hidden navigation is found about half as often |
| S7 | Superhuman, *How to build a remarkable command palette*: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ | one shortcut, aliases, fuzzy search, default scores |
| S8 | VS Code UX guidelines, Command Palette: https://code.visualstudio.com/api/ux-guidelines/command-palette ; GitHub command palette: https://docs.github.com/en/get-started/accessibility/github-command-palette ; Linear: https://linear.app/enablement/guide/navigating-linear ; cmdk: https://github.com/pacocoursey/cmdk | naming, categories, scopes, nested pages |
| S9 | NN/g, *Why Disabled Buttons Hurt UX*: https://www.nngroup.com/videos/why-disabled-buttons-hurt-ux-and-how-to-fix-them/ ; *Hidden vs. Disabled*: https://smart-interface-design-patterns.com/articles/hidden-vs-disabled/ | explain unavailable commands; hide only what can never apply |
| S10 | NN/g, *Empty States in Application Design*: https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/ | empty states that teach and offer a next step |
| S11 | Amber Case, *Principles of Calm Technology*: https://www.caseorganic.com/post/principles-of-calm-technology ; Primer, confirmation dialog: https://primer.style/product/components/confirmation-dialog/guidelines | calm periphery; confirm only what is costly |
| S12 | ChatGPT interface breakdown: https://www.925studios.co/blog/chatgpt-interface-design-breakdown ; *The death of the empty state in AI products*: https://uxdesign.cc/the-death-of-the-empty-state-in-ai-products-2026-e11439fbb688 ; NN/g on jargon: https://www.nngroup.com/articles/technical-jargon/ | chat-first minimalism; plain language |

Caveat: I read several NN/g pieces only through their video summaries or secondary citations (chunking, empty states,
jargon). The evidence sentences below stay inside what those summaries say.

---

## 1. Principles

**P1. Progressive disclosure: defaults first, specialist options on request.**
- *Evidence.* NN/g defines it as deferring advanced or rarely used features to a secondary screen, which makes an application easier to learn and less error-prone (S1). Nielsen adds a warning: hiding information people need *before deciding* is concealment, not disclosure.
- *Rule.* Each page has a default layer (at most 4 sections) and a secondary layer (a Details disclosure, a sheet, the palette, or a separate page). Some facts are never hidden: security facts (the permission requested, the room, the comparison code, the self-reported requester) and a room's owner and creation date (product memory).
- *Before.* `OwnerSettings` in `room-panels.tsx` shows about 30 controls to every owner by default: language, a preset grid, the `ObjectTypePicker`, the `RuleShelf`, 3 option selects, 2 mechanics selects, 16 numeric inputs in 4 fieldsets, save, discard and defaults, and two budget forms with consent checkboxes.
- *After.* The room page keeps one **Setup** select (presets) and a **New configuration** link to (b)'s page. The budgets move to an **AI spending** sheet.

**P2. Hick's law: fewer choices, of unequal weight.**
- *Evidence.* Decision time grows with the number and complexity of the options shown (S2).
- *Rule.* A page region shows at most 1 filled button and at most 2 secondary text actions. Pairs of equal-weight buttons are allowed only for Approve/Deny.
- *Before.* The rooms list shows Create room, the join-code input, Open room and every room row at the same weight. `Members` shows Join, Ready, Leave, an AI select with an Add button, and Start.
- *After.* The rooms list has one **Create room** button. Joining by code goes through the palette: typing a code produces "Open room K7QX".

**P3. Chunk into at most four groups.**
- *Evidence.* NN/g: chunking helps people process content. Later research puts working memory nearer 4 chunks than 7 (S3).
- *Rule.* At most 4 top-level sections per page. A key/value strip holds at most 4 pairs.
- *Before.* The game page header is a 6-cell grid (phase, world t, planning, started, ended, end reason), followed by 9 panels in 3 columns.
- *After.* One status sentence, then 3 sections (Leaderboard, Objects, Chat), then **Game details ▸**.

**P4. One primary action, derived from state.**
- *Evidence.* Design systems agree on one primary call to action per page; when two buttons compete for attention, both lose (S4).
- *Rule.* One function, `nextStep(viewer, room, game)`, feeds three places: the page header's primary button, the palette's **Suggested** group, and (b)'s onboarding hints.
- *Before.* An owner's room page shows four filled buttons at once: "Open the player client" (`bg-primary`), "Start game" (`bg-accent`), "Save settings" (`bg-primary`), and "Join" (`bg-primary`, before joining).
- *After.* Exactly one filled button (table in §3.3).

**P5. The palette is an accelerator and a catalogue, never the only path to the next step.**
- *Evidence.* NN/g: accelerators speed up experts without burdening novices, and a menu shows each shortcut beside its command (S5). Navigation hidden behind a menu icon is used about half as often (S6).
- *Rule.*
  - Nothing a newcomer needs for the next step lives only in the palette.
  - The palette still lists everything, including the actions that are visible on the page.
  - The trigger is a labelled, field-sized control with the shortcut printed on it, not a bare icon.
- *Before.* The `Shell` header has a separate "AI library" link for admins, the user's name, and a bordered "Sign out" button.
- *After.* The header holds the wordmark, a breadcrumb, the palette trigger and an avatar. AI library and Sign out are palette commands, also reachable from the avatar.

**P6. One command surface, named in product terms, with aliases.**
- *Evidence.*
  - Superhuman: one shortcut opens it everywhere, and commands should not be split across shortcuts.
  - Superhuman: show a match as "Title (matched alias)" so people learn the product's words.
  - Superhuman: low-value commands get a default score of 0, so they stay hidden until typed (S7).
  - VS Code: clear names grouped in categories. Linear: "run any action or jump to any page by name" (S8).
- *Rule.*
  - One command registry serves both apps, derived from `TOOLS`.
  - Aliases cover the words newcomers bring with them ("kick bot" finds Remove an AI player).
- *Before.* "Copy rules" is a whole `GameRules` panel on both the room and game pages. Half the repertoire (`get_trajectories`, `evaluate_value`, `get_game_history`, `get_receipt`) is reachable only through MCP or the AI.
- *After.* Each of these is a palette command.

**P7. Explain what is unavailable now; hide only what can never apply.**
- *Evidence.* NN/g: disabled buttons confuse people unless the reason is explained. A control the user is never authorised for is better hidden (S9).
- *Rule.*
  - Owner commands appear for members **when searched**, dimmed, with the reason and the owner's name.
  - Admin commands are hidden from non-admins.
  - A command blocked by the current state shows the reason and a fix command.
- *Before.* In `Members`, "Start game" is `disabled={!canStart}` with no reason given. "Leave" explains itself only in a `title` tooltip.
- *After.* "Start game. Needs 3 players; 2 have joined. → Add an AI player ↵".

**P8. Empty states teach and offer the next step.**
- *Evidence.* NN/g: empty states should communicate status, help people learn the screen, and give a direct path to the key task (S10).
- *Rule.* `EmptyState` always has a one-sentence body and an action, or names the palette command to use.
- *Before.* "Silence in the pantheon. No one has spoken. Treaties start with a first message." has no action. "No rooms exist yet" has no button.
- *After.* "No rooms yet. Create one and share its link. [Create room]"

**P9. Calm: the periphery informs, and interruptions are earned.**
- *Evidence.* Calm technology asks for the smallest possible amount of attention and informs through the periphery (S11).
- *Rule.*
  - At most one moving element per screen: the live dot.
  - Entrance motion plays on page load only.
  - A toast appears only when the outcome is not visible on screen.
  - Banners do not pulse.
- *Before.*
  - The `rise` animation runs on every panel and every room or chat row, with staggered `animationDelay`.
  - The `pulse-dot` runs on the active-game banner.
  - The header `Sigil` orbits continuously.
- *After.* Static rows. The sigil animates once. The live dot is the only pulse.

**P10. Confirm only what is costly or irreversible, and name the consequence.**
- *Evidence.* Primer: confirm actions with serious, permanent or widespread impact, and don't confirm actions that are easy to undo. Habitual confirmations get clicked without reading (S11).
- *Rule.* The confirmation level is derived from `annotations.destructiveHint` and from cost (§2.6). Use Undo instead of a confirmation where the action can be reversed (applying a preset, toggling ready).
- *Before.* Removing an AI seat in `Members` has no confirmation at all, while ending a game has a modal.
- *After.* Removing an AI player gets an inline confirmation. Ending a game keeps its modal.

**P11. Chat-first: the blank input comes first, suggestions come second, scope stays visible.**
- *Evidence.* In ChatGPT the blank field came first and suggestions were added on top of it. A good AI empty state also states the assistant's scope and limits (S12).
- *Rule.*
  - A palette hand-off to the assistant pre-fills a draft and never sends it.
  - The assistant's empty state offers at most 3 starter verbs that depend on the current state (detail with (a)).
  - On the engine UI, public chat is the only free-text input on the room page.

**P12. Plain language first; jargon gets a gloss.**
- *Evidence.* NN/g: if most of the audience won't know a term, lead with the plain-language version or pair the two (S12).
- *Rule.* The glossary in §5. The first use of a term on a page gets a gloss popover.
- *Before.* "rev 12", "quorum 3 deities", "protocol v3", "Commit clause", "Half-life", "Possible gods".
- *After.* "3 players minimum". Revision and protocol are deleted from the UI. Engine terms move to (b)'s page, glossed.

---

## 2. Command palette spec

### 2.0 Source of truth: the function catalogue, plus performers

The palette holds no command list of its own. Every row is **one catalogue entry plus one client-side performer**.

- **Catalogue entry.** This is (c)'s single typed catalogue of every public Convex function.
  - Key: the function path (`rooms.join`, `owner.start`, `commands.submit#summon`, `panels.save`). A `#type` suffix splits `commands.submit` by envelope type (`validate`, `summon`, `destroy`, `ready`, `pause`, `chat`; `GAME_COMMANDS` and `protocol.ts`). An `#action` suffix splits `owner.command` (`settings`, `start`, `resume`, `endGame`, `addAi`, `removeAi`).
  - `human: {title, tooltip}`: the only human-facing text.
  - `ai: {description}`: the MCP/registry text, written for models.
  - `tool?`: the registry tool that exposes the function.
  - `permission`.
  - `destructive`.
- **Client-only entries.** Actions that touch no Convex function (navigation, clipboard, dock layout, glossary) need entries of the same shape under a `ui.*` key, e.g. `ui.copyInviteLink`, `ui.dock.addPane`. I need (c) to allow these in the catalogue, or in a sibling catalogue of identical type.
- **Palette metadata.** Kept beside the entry (`palette: {section, keywords, aliases, surfaces, defaultScore, confirm}`), never inside `human` or `ai`.
- **Performer.** One of five kinds:

| Performer | Does | Used by (kinds from §2.5) |
|---|---|---|
| `navigate(route)` | route change or new tab | Go to, lenses in the engine UI |
| `form(page)` | nested palette page (pick or field) or a sheet; on submit it calls `submit` | B, C; consent sheets |
| `submit(fn, args)` | calls the Convex function: mutation or action, or a `commands.submit` envelope built with `buildEnvelope()` (`tools.ts`) and a fresh `commandId` | A and the end of B/C |
| `handoff(draft)` | opens the assistant composer with an editable prompt and a "may ask to: ‹tool›" label; never sends | D |
| `local(fn)` | client-only effect (clipboard, dock, theme, glossary) | `ui.*` entries |

- **What the palette renders.** Title = `human.title`. Subtitle and detail line = `human.tooltip`. The `ai.description` is never shown, because it carries model-facing instructions such as "Requires a commandId; resend the identical call".
- **Parity test.** It fails when a catalogue entry for a public function has no command and no stated exclusion.
- **Stated exclusions.** These public functions are data subscriptions and render pages rather than run commands: `rooms.list`, `rooms.get`, `games.view`, `games.resolve`, `activity.status`, `assistant.status`, `assistant.thread`, `panels.layout`. `auth/testing.probe` is test-only. `assistant.confirm` belongs to confirmation cards only, never the palette.

### 2.1 Trigger

```
desktop ≥ 640px  ┌──────────────────────────────────────────────┐
(header, right)  │ 🔍  Search or do anything…        ⌘K  │  ☰  │   (avatar)
                 └──────────────────────────────────────────────┘
mobile           [ 🔍 ☰ Menu ]   (44px tap target; the word "Menu" is kept, per S6)
```

- **Click target.** The whole control opens the palette.
  - Clicking the field focuses the input with an empty query.
  - Clicking ☰ opens the same palette in browse form: groups expanded and the input still focused. ☰ is there for people who think in menus rather than search.
- **Placeholder by page.**
  - Rooms list: "Search or enter a room code".
  - Room page: "Search or do anything in K7QX".
  - Player client: "Search, act, or ask…" (when the assistant is on).
- **⌘K / Ctrl+K** opens and closes the palette from anywhere, including from inside inputs and the agent editor (Superhuman, S7). ⌘K is not bound to anything else in either app.
- **`/`** opens the palette only when no editable element has focus and no dialog is open. Typing in chat or the editor is never hijacked. Inside the player-client composer, `/` belongs to (a) (see §6).
- **`?`** (with no input focused) opens the palette on its **Help** page.
- **Esc** goes back one page, then closes. Backspace on an empty query goes back one page (the cmdk pages pattern, S8). On close, focus returns to the element that had it.

### 2.2 Layout

```
┌ Room K7QX · you: owner ─────────────────────────────────────────────┐
│ 🔍 start                                                            │
├─────────────────────────────────────────────────────────────────────┤
│ SUGGESTED                                                           │
│ ▶ Start game                         4 players · Classic grid    ↵  │
│ ACTIONS                                                             │
│   Add an AI player…                  seats a bot from the library   │
│   Mark me ready (start)              advisory                       │
│ HELP                                                                │
│   Explain: planning window                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Deal everyone a secret goal and start the world for all players.    │  ← detail line (catalogue human.tooltip)
│ ↑↓ move   ↵ run   esc back                  🔒 = needs another role │
└─────────────────────────────────────────────────────────────────────┘
```

- It is a modal `CommandDialog` (already present in both apps' `components/ui/command.tsx`), 640px wide, near the top of the screen.
- **Context chip.** Engine UI: "Room K7QX · you: owner | member | visitor". Player client: "Ada Lovelace · this connection: act". The chip states the permission that gates the commands.
- **Rows** show an icon, a verb-first title, a subtitle of at most 10 words, and a key hint. The **detail line** shows the selected command's `human.tooltip` (§2.10), never the model-facing `ai.description`.

### 2.3 Sections and the empty-query view

| Section | Contents | Empty-query view |
|---|---|---|
| **Suggested** | `nextStep()` plus the 2 most recent commands (recency kept per viewer in `localStorage`, every access in try/catch; an empty store is fine) | ≤ 3 |
| **Actions** | play, owner and admin actions | top 4 by default score |
| **Lenses** (player client) / **Views** (engine UI) | views of the game (names come from (a)) | top 4 |
| **Go to** | routes, rooms, games | current room, its game, Your rooms |
| **Settings** | connections, spending, account, assistant | hidden until typed |
| **Help** | rules, scoring, glossary, shortcuts, developer tools | "How to play", "Explain a term…" |

The empty-query view shows about 12 rows at most. Every other command has a default score of 0 and appears only when typed (S7).

### 2.4 Search

- cmdk's built-in fuzzy ranking runs over the title, keywords and aliases. A row matched through an alias shows it: "Remove an AI player (kick bot)".
- Boosts: commands for the current page, commands relevant to the current state (e.g. Resume while the game is in recovery), and recency.
- Unavailable commands rank below available ones.
- **Dynamic rows.**
  - A code-shaped query (`/^[A-Z0-9-]{4,36}$/i`, the same test as `submitCode` in `home.tsx`) produces "Open room XXXX" and "Open game XXXX".
  - A glossary term produces "Explain: bits".
- **No match.**
  - With the assistant available: "Ask the assistant: '…'", which hands off a draft.
  - Otherwise: "Search the rules for '…'", which opens Rules with that text highlighted.

### 2.5 Commands with parameters

| Kind | Arguments | Palette behaviour | Examples |
|---|---|---|---|
| **A. Run** | none | Enter runs it (with the confirmation level from §2.6) | Start game, Mark me ready, Use my pause |
| **B. Pick** | one choice from a finite list | a nested cmdk page listing the choices (S8) | Destroy agent → my agents; Add an AI player → `get_ai_catalog`; Setup → presets; Replay log → past games |
| **C. Field** | one short scalar | a nested page with one validated field and a consequence line | Score a value… (`evaluate_value`); Open room by code |
| **D. Author** | code, TSX, multi-field settings, or a consent statement | **hand-off** to the surface built for authoring | Summon or validate → the agent editor lens, focused; full settings → (b)'s configuration page; AI spending → its sheet (it needs consent text); Make a panel… → an assistant draft |

**Should the palette pre-fill the assistant instead?** Only for kind D, and as the no-match fallback. Kinds A–C run
directly, for three reasons:
- the palette is free, deterministic and instant, while the assistant costs tokens;
- the assistant is **off by default**: `assistantBudget` is 0 until the owner approves it (`AssistantBudget` in `room-panels.tsx`);
- every tool needs a human path anyway.

A hand-off must:
- open the assistant composer with an editable draft, e.g. "Build a panel that charts my net bits per object";
- label the draft with the tool it will probably call ("may ask to: save_panel"), so the confirmation card that follows is expected;
- never send anything by itself.

When the assistant is unavailable, the row names the human path instead ("Make a panel: see docs/panels.md or run
`pnpm player call save_panel`").

### 2.6 Confirmations

| Level | When | Rendering | Commands |
|---|---|---|---|
| **none** | reads, navigation, reversible toggles | run on Enter; a toast only if the result is off screen; Undo where possible | most; applying a preset (toast with Undo) |
| **inline** | `destructiveHint`, scoped to the user, cheap; or once-only | the row turns into "Press ↵ again to destroy agent A3: its stored energy is lost. Esc keeps it." It times out after 5 s | `destroy_agent`, `remove_ai`, `delete_panel`, `rollback_panel`, `pause_game` ("one pause per game"), Leave room, Revoke app |
| **summary** | spends resources, or starts something for everyone | a summary card on a nested page; Enter confirms | `summon_agent` ("42 bits of your 120"), `start_game` ("4 players · Classic grid · Python"), `add_ai` ("uses the room's AI budget") |
| **modal** | irreversible and affects everyone | the existing `AlertDialog`: consequence, then a verb button ("End game G9TQ"); focus starts on Cancel | `end_game`, deleting a library AI player (admin) |

Approving a device or connection and approving AI or assistant budgets are **never** done in the palette. Those
commands open their own pages or sheets, which keep the consent text and the checkbox.

### 2.7 Permission shown, not hidden

| Availability | Empty query | When searched | Example |
|---|---|---|---|
| available | per score | normal | |
| blocked by state | hidden | dimmed; reason + fix | "Start game. Needs 3 players; 2 have joined. → Add an AI player" |
| blocked by role (could change) | hidden | dimmed 🔒; reason names who can | "End game. Only the owner, Ada Lovelace, can end it." / "This connection is read-only. Reconnect with act ▸" |
| never applicable | hidden | hidden | AI library for non-admins; owner tools on a signed-out page |

Engine UI roles: visitor < signed in < member < seated < owner, plus admin. Player client: the credential's
`read < act < owner`, using `mayUse()` from `tools.ts`. That is the same ranking the MCP server enforces.

### 2.8 The full command list (keyed by catalogue entry)

Key:
- **Where:** P = player client, E = engine UI.
- **Confirm:** inl = inline, sum = summary, mod = modal.
- **Performer:** nav, form, submit, handoff, local; `→` chains them.
- † = hidden from the empty-query view.
- Each title shown is the proposed `human.title`.

**Play** (act; registry Act group)

| Command | Keywords / aliases | Catalogue key | Tool | Performer | Perm | Where | Confirm |
|---|---|---|---|---|---|---|---|
| Validate agent | test, compile, cost | `commands.submit#validate` | `validate_agent` | nav(agent editor lens) → submit | act | P | – |
| Summon agent | deploy, spawn bot, run code | `commands.submit#summon` | `summon_agent` | nav(agent editor) → form(summary) → submit | act | P | sum |
| Destroy agent… | kill, stop agent | `commands.submit#destroy` | `destroy_agent` | form(pick agent) → submit | act | P | inl |
| Mark me ready / not ready | ready | `commands.submit#ready` (P), `rooms.setReady` (E) | `set_ready` | submit | act / member | both | – |
| Message everyone… | chat, say, public | `commands.submit#chat` | `send_chat` | local(focus composer, query pre-filled); the human presses Send | act / member | both | – |
| Use my pause | pause, freeze | `commands.submit#pause` | `pause_game` | submit | act | P | inl |
| Wake the game† | wake, parked, idle | `activity.touch` | `wake_engine` | submit (Suggested only while parked) | act | P | – |
| Score a value… | evaluate, what if | **none public** (`internal.agent.node.evaluate`) | `evaluate_value` | form(field) → submit | read | P | – |

**Read and lenses** (read)

| Command | Keywords | Catalogue key | Tool | Performer | Perm | Where |
|---|---|---|---|---|---|---|
| Who am I / this connection† | account, credential, expiry | `auth/user.me` (+ credential) | `whoami` | form(sheet) | read | both |
| How to play | rules | `manifest.get` + `rooms.get` → `rulesFor()` | `get_rules` | nav(Rules) | read | both |
| Inspect raw observation† | json, debug | `player.observation` | `get_observation` | form(JSON sheet) | read | P |
| Event log | events, transformations | `player.events` | `get_events` | nav(lens) | read | P |
| Trajectories | chart, over time | `player.trajectories` | `get_trajectories` | nav(lens) | read | P |
| My utility card | goal, incentives | `player.myUtility` | `get_my_utility` | nav(lens) | read | P |
| Past games | history, results | `rooms.history` | `list_games` | nav(Past games) | read / member | both |
| Replay a past game's log…† | replay | `player.history` | `get_game_history` | form(pick game) → nav(lens) | read | P |
| Chat history† | scroll back | `rooms.chatHistory` | `get_chat` | nav(chat, older pages) | read | both |
| Check a command's status…† | receipt, pending | `receipts.get` | `get_receipt` | form(pick recent commandId) | read | P |
| Lens: ‹name›, one per lens from (a) | objects, agents, leaderboard, analytics | `ui.lens.open#‹id›` (reads the lens's own queries) | – | local | read | P |

**Owner** (owner; registry Owner group)

| Command | Keywords | Catalogue key | Tool | Performer | Where | Confirm |
|---|---|---|---|---|---|---|
| Start game | launch, begin, play | `owner.start` (≡ `owner.command#start`) | `start_game` | form(summary) → submit | both | sum |
| Resume game | recovery, unpause | `rooms.resume` (≡ `owner.command#resume`) | `resume_game` | submit | both | – |
| End game now | stop, finish | `rooms.endActiveGame` (≡ `#endGame`) | `end_game` | form(modal) → submit | both | mod |
| Add an AI player… | bot, ai seat | `rooms.addAi` (≡ `#addAi`), choices from `aiTemplates.catalog` | `add_ai`, `get_ai_catalog` | form(pick) → submit | both | sum |
| Remove an AI player… | kick bot | `rooms.removeAi` (≡ `#removeAi`) | `remove_ai` | form(pick) → submit | both | inl |
| Choose next game's setup… | preset, configuration | `owner.settings` (`{preset}`) (≡ `#settings`) | `update_settings` | form(pick preset) → submit; Undo toast | both | – |
| New game configuration… | custom, advanced | `ui.nav.newConfiguration` → (b)'s page, which saves through `owner.settings` | `update_settings` | nav | E | – |
| AI spending… | budget, tokens, billing | `rooms.approveAiBudget` (`{aiBudget}`) | `update_settings` (AI budget) | form(sheet with consent) | E | consent |
| Assistant allowance… | enable assistant, model | `rooms.approveAiBudget` (`{assistantBudget, assistantModel}`) | – | form(sheet with consent) | E | consent |
| Inspect raw room state† | room json | `rooms.get` | `get_room_state` | form(JSON sheet) | P | – |

**Panels** (custom views; read or act)

| Command | Catalogue key | Tool | Performer | Perm | Confirm |
|---|---|---|---|---|---|
| Panels | `panels.list` | `list_panels` | nav(panel manager) | read | – |
| View panel source…† | `panels.code` | `get_panel` | form(pick) → sheet | read | – |
| Make a panel… | `panels.save` | `save_panel` | handoff("Build a panel that …"); fallback: docs/panels.md | act | the assistant's card |
| Roll back a panel…† | `panels.rollback` | `rollback_panel` | form(pick panel, then version) → submit | act | inl |
| Move or resize a panel…† | `panels.place` | `place_panel` | form(pick) → submit | act | – |
| Turn a panel on / off† | `panels.setEnabled` | – (no tool; gap for (c)) | form(pick) → submit | act | – |
| Delete a panel…† | `panels.remove` | `delete_panel` | form(pick) → submit | act | inl |

All of these are P only.

**Rooms and navigation**

| Command | Keywords | Catalogue key | Performer | Perm | Where | Confirm |
|---|---|---|---|---|---|---|
| Create room | new room, host | `rooms.create` | submit → nav(`/rooms/:code`) | signed in | E | – |
| Open room ‹code› | join code, room id | `ui.nav.room` (dynamic, code-shaped query) | nav | signed in | both | – |
| Join this room | take a seat | `rooms.join` | submit | signed in | both | – |
| Leave this room† | exit | `rooms.leave` | submit | member, not seated | E | inl |
| Copy invite link | share, invite | `ui.copyInviteLink` | local | any | both | – |
| Open player client | play, console | `ui.nav.playerClient` | nav(`/player/?room=`) | member | E | – |
| Room page | lobby | `ui.nav.room` | nav | member | P | – |
| Watch live game | arena, spectate | `ui.nav.game` (page reads `games.view`) | nav | member | both | – |
| Open a past game…† | results | `ui.nav.game` | form(pick) → nav | member | E | – |
| Your rooms | home | `ui.nav.home` | nav | signed in | E | – |
| Present on a big screen† | project, fullscreen | `ui.present` | local | any | E | – |

**Assistant** (P only)

| Command | Catalogue key | Performer | Perm |
|---|---|---|---|
| Ask the assistant… (also the no-match fallback) | `assistant.send` | handoff (the human sends) | act, allowance > 0 |
| Stop the assistant | `assistant.cancel` | submit (Suggested while a turn runs) | act |
| Assistant conversations… | `assistant.threads` | form(pick) → open thread | read |
| Auto-approve summons up to…† | `assistant.setPrefs` | form(field) → submit | act |
| Assistant permission…† | the permission choice on first `assistant.send` | form(radio + owner consent) | member |

**Settings, connections and help**

| Command | Catalogue key | Performer | Perm | Where |
|---|---|---|---|---|
| Connect a player app… | `ui.connectInstructions` | form(sheet: `pnpm player connect --room CODE`) | member | both |
| Connected apps… | `auth/credentials.list` / `auth/credentials.revoke` | form(sheet; revoke = inline confirm) | signed in | E |
| Approve a device code… | `ui.nav.device` (page uses `auth/device.pending/approve/deny`) | nav | signed in | E |
| AI library (hidden for non-admins) | `ui.nav.admin` (page uses `aiTemplates.adminList`) | nav | admin | E |
| New AI player template | `aiTemplates.create` | nav(`/admin/agents/new`) | admin | E |
| Edit / delete an AI player template…† | `aiTemplates.update` / `aiTemplates.remove` | nav(`/admin/agents/:id`); delete = modal | admin | E |
| Copy game rules for an AI | `ui.copyRules` (`rulesFor()`) | local | member | both |
| How scoring works | `ui.help.scoring` | form(sheet) | any | both |
| Explain a term… | `ui.glossary` | form(pick term); P also offers handoff | any | both |
| Keyboard shortcuts | `ui.help.shortcuts` | form(sheet) | any | both |
| Server info† | `manifest.get` | form(sheet) | any | E |
| Safe mode (no custom panels)† | `ui.safeMode` | local(reload with `?panels=off`) | any | P |
| Sign in with Google / Sign out | `ui.auth.signIn` / `ui.auth.signOut` (Better Auth, not a Convex function) | local | – | both |

`/connect` (`agent/connect.pending/approve/deny`) is reached only from an OAuth redirect and has no palette command.

**Coverage.**
- All 32 registry tools appear.
- Every public Convex function appears, or is listed in §2.0's exclusions. Two exceptions: the MCP `httpAction`s, which are not callable from the UI, and `owner.command#*`, which is shown as equivalent (≡) to the direct owner functions.
- Gaps for (c):
  - `evaluate_value` has **no public Convex function**, so the human path needs one, or a call through `/mcp`.
  - `panels.setEnabled` has **no registry tool**.
  - The assistant allowance has **no tool**.

### 2.9 Dock commands (player client as an IDE-style dock)

**Default layout:** one analytics pane on top, the assistant at the bottom. Panes can be moved and resized. The layout
persists through the existing `panels.layout` / `panels.setLayout`. Dock commands are `ui.dock.*` entries with `local`
performers that end in `panels.setLayout`.

| Command | Keywords | Scope | Behaviour | Confirm |
|---|---|---|---|---|
| Add analytics pane: ‹lens› (one row per lens from (a)) | split, new pane, open beside | focused pane | inserts below the focused analytics pane; if the assistant has focus, below the lowest analytics pane; focuses the new pane | – |
| Change lens of this pane… | switch view | **this pane** | form(pick lens); hidden when this pane is the assistant | – |
| Close pane | close, hide | **this pane** | closes it; on the assistant the title becomes "Hide assistant" (Focus assistant brings it back); a toast offers Undo | – (Undo) |
| Move assistant to the right / Move assistant to the bottom | dock, side, position | assistant | only the position the assistant is not in is offered | – |
| Focus assistant | chat, ask, jump | – | moves focus to the assistant composer; shows it if hidden. Shortcut: **Ctrl+`** on every platform (the key VS Code uses to toggle its terminal; ⌘` on macOS switches windows, so no `mod`) | – |
| Focus next pane / previous pane | cycle | – | Ctrl+Shift+` cycles through panes | – |
| Maximize this pane / Restore layout | zoom, fullscreen | **this pane** | temporary; not persisted | – |
| Reset layout | default layout | – | restores one analytics pane plus the assistant at the bottom; a toast offers Undo (the previous layout is kept in memory) | – (Undo) |

**How the palette scopes "this pane".**
- The dock tracks `focusedPaneId`: the pane that last held focus or was last clicked. Opening the palette moves focus into the dialog, so the palette **captures `focusedPaneId` at open time** as `scope.pane`.
- The context chip then shows the scope ("Pane: Trajectories · top"), and pane commands read "Close pane: Trajectories".
- Each pane header's ⋯ button opens the same palette with `scope.pane` set to that pane and the query pre-filtered to pane commands. There is no second menu.
- With no pane in scope (for example, the palette was opened from the header after focus left the dock), the "this pane" commands become pickers ("Close pane…" lists the panes).
- Stored panels (`place_panel` docks left, right or bottom) are also panes in the dock. (a) and (c) must reconcile `placement` with the new layout model (§6).

### 2.10 One source for tooltips

- **Every visible control in both apps is bound to a catalogue key.** The shared `Action` primitive (§4) takes `k: CatalogueKey`. A control may override its short label, but its tooltip text always comes from `human.tooltip`.
  - Example: `rooms.join` with title "Join this room" and tooltip "Take a seat; you'll play in the next game."
- **Tooltip composition, in order:**
  1. `human.tooltip`;
  2. if unavailable, the reason from `available()`, e.g. "Only the owner, Ada Lovelace, can start the game.";
  3. the keyboard shortcut, if any.
  The same text appears in the palette's detail line, so a button and its palette row never disagree.
- **Accessibility.** The tooltip is wired through `aria-describedby`, and disabled controls stay focusable so keyboard users can reach the reason (S9). On touch, the reason under a disabled *primary* button is shown inline as text, because hover does not exist.
- **Enforcement.** A source test in both apps fails on a literal `title="…"` on a `button` or `a` element outside `lib/ui-kit`. Today there are many, e.g. "Seats are frozen while a game is running" in `Members` and "Copy room link" in the room `Header`. Each moves into catalogue text.
- **Limits.** `human.title` ≤ 5 words, verb first. `human.tooltip` ≤ 15 words, one sentence, no model instructions (§5).

---

## 3. Page-by-page cleanup (engine UI)

### 3.0 Shared header on every page

`[sigil] Code Gods  ›  K7QX  ›  Game G9TQ  ........  [🔍 Search or do anything… ⌘K ☰]  (AL)`

- **Delete:** the "/ pantheon server" subtitle; the header "Sign in with Google" button (every signed-out page already shows that button in its body); the visible username and the bordered "Sign out"; the "AI library" link. These move to the palette and the avatar.
- `Conn` (live or final) shrinks to a dot inside the breadcrumb.

### 3.1 Landing (signed out): `pages/home.tsx` `Landing`

| Stays | ONE primary | → palette | → details | Deleted |
|---|---|---|---|---|
| The H1 "Gods bargain. Universes execute."; one sentence on what the game is; "How a game goes" in 3 steps (Join or create a room → write a tiny agent and bargain in chat → highest score wins) | **Sign in with Google** | Server info (manifest) | – | the 4 tenets (merged into the 3 steps; "This screen is the arena" moves to the game page's Present command); the concentric decorative rings; the "/ pantheon server" subtitle; the duplicate header CTA |

The secondary line stays as one sentence: "Got an invite link? Just open it; you'll sign in there."

### 3.2 Rooms list (signed in): `pages/home.tsx` `Rooms`

| Stays | ONE primary | → palette | → details | Deleted |
|---|---|---|---|---|
| The title "Your rooms". One row per room, prominent: **code · Owner: name (you) · Created: date**, then the status in words ("Lobby · 2 players", "Game G9TQ running") | **Create room** | Open room by code (the placeholder says "Search or enter a room code"); Approve a device code; Connected apps | – | the "Signed in as" line; the H1 "The pantheon"; the "Found a room" panel and its GUID sentence; the "Join by code" panel; staggered row animation |

Empty state: "No rooms yet. Create one and share its link. A game needs 3 players, and AI players count. [Create room]".
Below it: "Have a code? Type it in search (⌘K)."

### 3.3 Room page: `pages/room.tsx`

The primary action comes from `nextStep()`:

| Viewer | State | Status sentence | Primary | Secondary (≤ 2 text links) |
|---|---|---|---|---|
| visitor | any | "You were invited to room K7QX." | Sign in with Google | – |
| signed in, not a member | lobby | "Join to play in the next game." | Join this room | Watch live game (if one is running) |
| member | lobby | "Waiting for Ada to start the game." | Open player client | Mark me ready |
| owner | lobby, fewer than 3 players | "2 more players needed. AI players count." | Copy invite link | Add an AI player |
| owner | lobby, 3 or more | "4 players ready." | Start game | Add an AI player |
| seated | running | "You're playing in game G9TQ." | Open player client | Watch live game |
| member, not seated | running | "Game G9TQ is running; you'll play in the next one." | Watch live game | – |
| owner | recovery | "Game G9TQ paused for safety: ‹reason›." | Resume game | Watch live game |

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◎ Code Gods › K7QX                      [🔍 Search or do anything in K7QX ⌘K ☰] (AL)│
├────────────────────────────────────────────────────────────────────────────────────┤
│ Room K7QX  ⧉                                                                       │
│ Owner  Ada Lovelace (you)      Created  31 Oct 2026, 14:02                         │
│                                                                                    │
│ 2 more players needed. AI players count.                                           │
│ [ Copy invite link ]   Add an AI player                                            │
├───────────────────────────────────────┬────────────────────────────────────────────┤
│ Players · 1 of 3                       │ Public chat                                │
│ ● Ada Lovelace  owner · ready          │ Grace: hi, python or ts?                  │
│ ○ waiting for a player…                │ Ada: python                               │
│ ○ waiting for a player…                │                                            │
│                                        │ [ Say something to everyone…      ] Send   │
├───────────────────────────────────────┴────────────────────────────────────────────┤
│ Next game                                                                          │
│ Setup  [ Classic grid · recommended            ▾ ]   New configuration →           │
│ Python · 3–8 players · objects are 6×6 grids                     Details ▸         │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ Past games (3)                                                                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

| Item today | After |
|---|---|
| `Header`: copy chip, "you own this room", "rev N", a duplicate 7xl H1 of the code, `PlayerClientLink`, the owner/created grid | One title "Room K7QX ⧉" and one strip with **Owner** and **Created** (memory). "rev" is deleted. The client link becomes the primary action when `nextStep` says so. |
| `ActiveBanner` (pulsing) | Becomes the status sentence plus its primary action (no pulse) |
| `Members` (join, ready, leave, add-AI select, start) | **Players** list only. Each AI row has an ⋯ menu with Remove (inline confirm). Join, Ready and Start move to the header primary. Leave → palette. Add AI → secondary link opening the palette's picker |
| `Chat` | Stays visible. Empty state: "No messages yet. Deals start here. Say hello." |
| `PlayerApps` (instructions plus credentials) | Palette: "Connect a player app…" and "Connected apps…". The page shows nothing |
| `History` | A **Past games (n)** disclosure, collapsed; its rows link to `/games/:code` |
| `GameRules` (copy and textarea) | Palette "Copy game rules for an AI"; also inside Next game › Details |
| `ScoringPanel` | Palette and Help "How scoring works"; a gloss on "bits" |
| `OwnerSettings` | The **Setup** select plus "New configuration →" (b). Everything else goes to (b)'s page or the AI spending sheet |
| `ReadOnlySettings` and `Repertoire` (non-owners) | The same Next game block without the select. Details ▸ shows a key/value list and "Utility functions in this game" |
| AI billing, AI budget, assistant allowance | An **AI spending** sheet (palette and Details ▸). Details shows one line: "AI players: 12,400 of 200,000 tokens · Assistant: off · Change ▸" |

**How the room page points to presets and to (b)'s page.**
- **Setup** is a select, usable by the owner only. Its groups:
  - **Recommended**: `manifest.presets`, label plus the `kid` line; presets with `offered: false` stay out.
  - **Saved**: owner-saved configurations, data from (b).
  - **Current (custom)**: only when the settings match no preset.
  - A divider, then the item **New configuration…**.
- Picking a preset applies it at once (`update_settings {preset}`, as the preset grid does today) and shows a toast "Next game: Classic grid · Undo".
- **New configuration →** sits beside the select as a link, so it is visible without opening the menu. It navigates to (b)'s separate page and returns to the room on save.
- While a game runs, the select is disabled with the reason inline: "Changes apply after game G9TQ ends."

### 3.4 Game page: `pages/game.tsx`

| Stays | ONE primary | → palette | → details ("Game details ▸") | Deleted |
|---|---|---|---|---|
| Title "Game G9TQ" with a "room K7QX" link. The status sentence: "Running · world starts in 12 s" / "Paused · resumes in 8 s" / "Ended: time limit". **Leaderboard** (merged with `Roster`: rank, name, AI or human, score, owner crown). **Objects** (the arena, the widest column). **Public chat** | seated: **Open player client**; spectator: none (watching *is* the task); ended: **Back to room K7QX** (auto-return kept, "Stay here" clearly visible); owner in recovery: **Resume game** | End game (modal; also in an ⋯ Owner menu in the header); Copy rules; How scoring works; Present on a big screen | Settings used (`ReadOnlySettings`), utility functions in the game (`Repertoire`), started, ended, end reason, world time | the 6-cell header grid; the duplicate 7xl code; the "Game rules for your AI" panel; `ScoringPanel`; the separate `Roster`; the `OwnerControls` panel |

The "newer game" banner stays as a single static line, because it is the next step.

### 3.5 Device approval: `pages/device.tsx`

| Stays | ONE primary | → palette | → details | Deleted |
|---|---|---|---|---|
| Step 1: the code field + **Continue**. Step 2, visible because it is security-relevant: the comparison code (large), the room ("K7QX · you own it"), the permission in plain words, the requester label marked "(self-reported)", an "expires in 4:32" countdown, the owner warning and consent checkbox | **Approve access** (Deny is the secondary, outlined) | – | after approval: the `CODE_GODS_CREDENTIAL` storage instructions; the room UUID | the "Request status" row (the enabled buttons already show it); two of the three explanatory paragraphs (one sentence remains: "Approve only if you started this and the code matches your client.") |

### 3.6 Connect: `pages/connect.tsx`

| Stays | ONE primary | → details | Deleted |
|---|---|---|---|
| Client name (self-reported); **Returns to** host; Room (preselected when there is only one); the permission as a sentence; the owner warning and consent | **Approve connection** | "Change permission ▸" reveals the radio buttons; client metadata URL; expiry time | "Log in to review" → "Sign in with Google" (consistent wording); the 30-day text shrinks to one line |

### 3.7 Admin AI library: `pages/admin-agents.tsx`

| Stays | ONE primary | → palette | → details | Deleted |
|---|---|---|---|---|
| The title "AI players"; the missing-credentials banner, which names the env var to set; rows showing name · model · status badge | **New AI player** | New, edit, delete template | the editor moves to its own route (`/admin/agents/new`, `/:id`); price per million tokens appears in the model select's subtitle; rev and updated time appear on hover | the 2-line prompt preview on rows; trash icons on rows (delete becomes a danger action inside the editor, with a modal); the "Admin / AI library" eyebrow |

The not-found page becomes `EmptyState` "Nothing here" + **Your rooms**.

---

## 4. Shared component vocabulary

These go in a new workspace lib, `lib/ui-kit`, styled only through the HSL tokens both apps already define
(`--primary`, `--card`, `--border`). Command data is (c)'s catalogue plus the palette metadata and performers (§2.0); none of it is defined per app.

| Primitive | Props sketch | Replaces |
|---|---|---|
| `AppHeader` | `crumbs: {label, href?}[]`, `palette: PaletteTriggerProps`, `account?: {name, initials}` | `Shell` header; the player-web console header |
| `PageHeader` | `title`, `facts?: Fact[] (≤4)`, `status?: string` (one sentence), `primary?: Action`, `secondary?: Action[] (≤2, text links)`, `overflow?: CommandId[]` (⋯ opens the palette filtered to them) | room and game `Header`, `ActiveBanner`, `OwnerControls` |
| `Action` | `k: CatalogueKey` (title, tooltip and permission come from the catalogue, §2.10), `label?` (short override, ≤3 words), `args?`, `tone?: "primary" \| "quiet" \| "danger"`; availability and its reason come from the command's `available(ctx)` | ad-hoc `<button className=… title=…>` |
| `Section` | `title`, `count?`, `summary?` (shown when collapsed), `collapsible?`, `defaultOpen?`, `persistKey?` (per-viewer `localStorage`, try/catch), `action?: Action (max 1)` | `Panel` (both apps), `<details>` uses |
| `KeyValueStrip` | `items: {label, value, title?, mono?}[]` (max 4) | the owner/created grid, the 6-cell game grid, the device `dl` |
| `EmptyState` | `title (≤5 words)`, `body (1 sentence)`, `action?: Action`, `hint?: CommandId` | `Empty` (both apps) |
| `PaletteTrigger` | `placeholder`, `shortcut: "mod+k"`, `compact?`, `onOpen(init?: {page?, query?})` | – |
| `CommandPalette` | `commands: Command[]`, `context: {role, permission, room?, game?, assistantOn}`, `onHandoff(draft: {text, tool?})` | – |
| `Command` (data) | `entry: CatalogueEntry` ((c)'s: key, `human {title, tooltip}`, `ai {description}`, `tool?`, `permission`, `destructive`) + `palette: {section, keywords, aliases, icon, surfaces, defaultScore, confirm}` + `performer: navigate \| form \| submit \| handoff \| local` + `available(ctx) → {ok} \| {ok:false, reason, fix?, hidden?}`; `ctx` includes `scope.pane` (§2.9) | – |
| `Term` | `id: GlossaryId`, `children?` | – |

Two guard rules keep the palette and the registry in step:
1. A parity test fails if any catalogue entry (public function or `TOOLS` name) lacks a `Command` or a stated exclusion (§2.0).
2. `confirm` defaults to `"inline"` when `annotations.destructiveHint` is true, so a new destructive tool can't land unconfirmed.

**Style rules.**
- `label-mono` (uppercase mono) is only for `KeyValueStrip` labels, never for headings. Today it labels nearly everything.
- One filled button per view.
- `rise` runs only on page entry.
- Sentence case everywhere.

---

## 5. Copy guidelines

**Tone.**
- Plain and direct, in the second person.
- The game's flavour lives in titles and the landing hero, never in instructions or errors.
- Errors say what happened and what to do next ("Room not found. Check the code, or ask the owner for the link.").

| Element | Limit |
|---|---|
| Button | ≤ 3 words, verb first ("Start game") |
| Section heading | ≤ 4 words, a noun ("Public chat") |
| Status sentence | 1 sentence, ≤ 12 words |
| Helper text / empty-state body | 1 sentence, ≤ 20 words |
| Palette title / subtitle | ≤ 5 words, verb first / ≤ 10 words |
| Gloss | ≤ 15 words |

**One word per concept.**

| Today | Proposed |
|---|---|
| deity / deities / god / pantheon (in functional copy) | **player** (keep "Code Gods" and "god" in flavour copy and in the glossary) |
| Found a room / The pantheon | Create room / Your rooms |
| AI seat, seat an AI | AI player |
| Public channel (engine) vs Public chat (client) | Public chat |
| Possible gods | Utility functions in this game |
| Objects / hottest first | Objects (sort as a control) |
| Your player apps | Connected apps |
| Owner controls | Owner (⋯ menu) |
| recovery / parked | "Paused for safety: ‹reason›" / "Asleep after 30 idle minutes; wakes when someone acts" |
| quorum 3 deities / rev 12 / protocol v3 | "3 players minimum" / deleted / deleted (Server info) |
| Sign in with Google to enter the pantheon / Log in to review | Sign in with Google |

**Glossary.** It lives in one `glossary.ts` in `lib/ui-kit`. It should also feed the assistant's `GAME_PRIMER`, so
humans and the AI use the same words.

| Term | Gloss | First appears |
|---|---|---|
| Room | A lobby with a short code; games are played in it one after another. | rooms list |
| Owner | The person who created the room; they choose the setup and start games. | room header |
| Player (god) | Anyone seated in a game, human or AI. | room |
| AI player | A computer player from the server's library, seated by the owner. | room |
| Utility function | Your secret rule for which objects you want; it decides your score. | player client; Details |
| Utility card | The plain-language summary of your utility function. | player client |
| Object | A thing in the shared world: a number, a string or a grid. | game page |
| Agent | A small program you write that changes objects, one move at a time. | player client |
| Summon | Pay energy to put your agent into the world. | agent editor |
| Energy | What you spend to summon; you earn it over time. | player client |
| Bits (✨ / ⚠️) | Points: rarer outcomes you want earn more ✨; ⚠️ marks a penalty. | leaderboard |
| Payoff | Your total score: your bits weighted by how much others care. | leaderboard |
| Planning window | Time before the world starts running, for writing agents and deals. | game status |
| Pause | Each player may stop world time once per game. | player client |
| Preset | A ready-made game setup; pick one, or make a new configuration. | Next game |
| Player client | The screen where you play: your card, your agents, your chat. | room primary |
| Permission (read / act / owner) | What a connected app may do for you: look, play, or run the room. | device, connect, palette chip |
| Panel | A custom view you or your AI add to the player client. | player client |

**Where a gloss appears.**
- `<Term>` gives the first occurrence of a term on a page a dotted underline. Hover on desktop or tap on mobile shows the gloss, plus "More in rules".
- In the player client, when the assistant is on, the popover also offers "Ask the assistant". That hands off the draft "Explain ‹term› using my current game".
- The palette's "Explain a term…" lists the whole glossary. A query like "what is bits" matches.
- (b)'s onboarding may link to terms but should not duplicate the text.

---

## 6. Risks and open questions

**For (a): player client lens and chat composition.**
1. **Lens names and routes.** The palette's lens commands (Event log, Trajectories, My utility card, Replay, Chat history, Panels, Lens: ‹name›, and the dock's Add analytics pane: ‹lens›) need (a)'s final list, plus a way to open a lens programmatically (`openLens(id, params)`).
2. **`/` inside the composer.** Does (a) use `/` for slash commands? If so, I propose that slash commands *are* this palette, filtered to Actions, so there is one registry and no second command language.
3. **The hand-off target must be explicit.** If (a) merges public chat and the assistant into one composer, a palette hand-off could leak a private prompt into public chat. Show a visible target toggle ("Everyone" / "Assistant"). Palette hand-offs always target the assistant. "Message everyone…" (`send_chat`) targets "Everyone", and the human sends it.
3b. **The dock.**
   - The pane model must expose `focusedPaneId`, `addPane(lens, {below})`, `setLens`, `close` and `moveAssistant(right|bottom)`.
   - Layout should be stored through the existing `panels.layout` / `panels.setLayout`.
   - Stored panels (`place_panel`: left, right, bottom) must become panes, or `placement` must map onto dock positions.
   - Confirm the Ctrl+` / Ctrl+Shift+` bindings against the agent editor and composer.
4. **Agent editor focus.** Kind-D summon and validate need an API that focuses the editor and optionally loads a source.

**For (b): onboarding and the configuration page.**
5. **The route** for "New configuration…" (I assumed `/rooms/:code/setup/new`), how it returns to the room, and whether saved configurations are per owner or per server. That is new data: today's `manifest.presets` are code-defined (`SETTINGS_PRESETS`).
6. **One `nextStep()`.** Onboarding hints, the page primary and palette Suggested must read the same function, or they will drift and disagree.
7. **Teaching the palette once.** Onboarding should introduce it with one hint ("Anything else: ⌘K"). It should not tour features the palette already lists.
8. **Settings that leave the room page.** The AI and assistant budgets have consent text. Do they belong on (b)'s page or in my AI spending sheet? I propose the sheet: spending is room policy, not a game configuration.

**For (c): agent-centred architecture.**
9. **Catalogue shape.** I need from (c):
   - client-only `ui.*` entries (navigation, clipboard, dock, glossary) of the same type;
   - variant keys for multiplexed functions (`commands.submit#summon`, `owner.command#start`);
   - palette metadata kept outside `human` and `ai`, so changing palette copy doesn't regenerate `tools.schema.json`.
   - Does `human.tooltip` also feed (b)'s onboarding hints?
10. **Engine actions with no tool.** The engine UI calls Convex directly (`api.rooms.join`, `leave`, `create`, `credentials.revoke`, `aiTemplates.*`), and none of these is a registry tool. If the agent is the centre, should `join`, `leave` and revoke become tools? Today the palette maps both kinds, and the parity test exempts them with stated reasons.
10b. **Gaps the parity test will expose.** `evaluate_value` has no public Convex function (only `internal.agent.node.evaluate`). `panels.setEnabled` and the assistant allowance have no registry tool. `owner.command` duplicates the direct owner functions: which one is canonical?
11. **Assistant off by default.** Every kind-D hand-off needs a human fallback; "Make a panel…" and "Ask the assistant…" depend on the allowance.
12. **Confirmation policy.** Palette confirmations (human-initiated) are deliberately lighter than the assistant's confirmation cards (agent-initiated): `destroy_agent` runs unconfirmed for the assistant but inline-confirms in the palette. (c) should confirm that this asymmetry is intended.

**Cross-cutting.**
13. **Tests.** Moving panels breaks e2e selectors (`button-copy-rules`, `settings-presets`, `panel-player-apps`, `button-end-game`, `banner-active-game`). The cleanup should keep `data-testid`s on the new primitives where the behaviour survives, and update suites under `.claude/skills/code-gods-testing`.
14. **Discoverability debt.** Moving things into the palette costs discovery (S6). Mitigations: the labelled trigger, page-specific placeholders, the "Have a code? Type it in search" lines, and owner commands surfacing on search with explanations.
15. **Projection.** The game page doubles as a projected arena. "Present on a big screen" should hide the header and the composer. Does the owner want that mode?
16. **Owner decision needed.** Should "player" replace "god" and "deity" in functional copy? The glossary keeps "god" either way.
