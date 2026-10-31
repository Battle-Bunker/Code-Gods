# Onboarding and game configuration

> Terminology: "lens" in this historical document means what the code and the UI now call a built-in **panel** (`docs/ui-redesign.md`).

Mandate: the first-time player's journey (what to do next in every state) and the separate game-configuration
page. Grounded in `lib/game-core/src/settings.ts`, `artifacts/engine/convex/{manifest,owner,rooms}.ts`,
`artifacts/code-gods/src/{pages,components}`, `artifacts/player-web/src/core/{app,console}.tsx` and
`docs/engine-api.md`.

Design rule used throughout: **every screen has exactly one primary "next step"** (one filled button or one
assistant suggestion chip). Everything else is secondary (outline/link), collapsed, or in the command palette.

---

## 0. Facts from the code that shape this design

| Fact (source) | Consequence for onboarding |
|---|---|
| `rooms.create` stores `defaultSettingsFor("Int")`: a new room is an **Int** game, which matches no preset (all five `SETTINGS_PRESETS` are Grid). | The newcomer's first room starts on an unpresented, beginner-hostile world. **Change: new rooms start on `presetSettings("grid-first-steps")`.** |
| The room page works out which preset is chosen by matching `objectType`+`typeArgs` only (`currentPreset` in `OwnerSettings`). "Classic" and "Low income" share `Grid(5,base10,rgby)`. | The room cannot say which preset it is on. **New room field needed: `settingsOrigin`** (§3.4). |
| `owner.start` refuses AI seats when `room.aiBudget <= 0` ("Approve an AI token budget before starting with AI seats"), and refuses when the provider key is missing. Budget approval lives at the bottom of a different panel. | A solo newcomer who adds two AIs and presses Start hits an error. **Adding the first AI seat must include the budget approval.** |
| `assistantBudget` defaults to 0, so the in-client assistant is **off**; the drawer tells the player to ask the owner. | The new player client is built around the assistant, and it is off by default. **Room creation must ask the owner to approve an allowance (pre-filled).** |
| `ready` is stored but gates nothing (`game/commands.ts`); `start` needs only ≥ 3 members. | "Declare ready" is a button with no consequence. Keep it as a social signal ("I'm set"), never as a step. |
| `presetSettings(id, language)` takes the language from the input; `nextSettings` ignores every other `settings` field when `preset` is given. | A saved custom configuration cannot travel as "a preset id"; it must be a full settings object (§3.5). |
| Game length is random: lifetime ~ exponential with half-life `halfLifeSeconds` of world time; world time stops in planning and pauses. P(end before t) = 1 − 2^(−t/h). | Length copy for h = 300 s: "half of games end within 5 min; 1 in 5 runs past 12 min", plus planning. |
| Hard limits: `startingObjectCount ≤ 1000`, `interactionRateHz ≤ 1000`, `spawnRateHz ≤ 10`, `planningSeconds`/`pauseSeconds ≤ 3600` (`nextSettings`); `stepBudget 1..10M`, `interactionComputeMs 1..1000`, `maxAgentsPerGod 1..200`, `agentBatteryActs ≥ 1`, `defenceRate ∈ [0,1]` (`validateSettings`); `aiBudget 0..1,000,000`; `assistantBudget 0..2,000,000`; 3..8 members; $2 per game, $5 per day AI caps. | Every control's range is taken from these, and the review step re-runs the same rules. |

---

## 1. The newcomer's journey as a state machine

### 1.1 Where people are

Recommendation (needs agreement with mandates a/b): **the player client is home for every player, owner
included**, once a room exists. The engine UI keeps the landing page, the room list, the room page (lobby,
seats, projection) and the configuration page. The **invite link is the player link** (`/player/?room=CODE`,
or a short alias `/play/CODE`), so an invited person never has to choose between two apps.

**In-game copy lives in the assistant pane.** The player client is becoming an IDE-style dock of panes (lens
on top, assistant at the bottom by default). In every player-client state below (S5–S15), the "next step"
copy is rendered twice:
- as the **assistant pane's empty-state line** (the sentence);
- as the **first suggestion chip** (the same words as an action).

H-states whose action is a plain click (Join, Resume, Start) show the chip as a button that runs the command
directly, without a model turn. A-states send the chip text as the user's message. The copy is therefore
written to work both as a statement and as a tappable request, and each state's chips are at most three: the
next step plus up to two secondaries named in the table.

### 1.2 State table

"Who": **H** = a human click on the one primary button; **A** = the assistant proposes it as a chip in chat
(the human still confirms). "Visible" lists the minimum the screen must show to make the step make sense.

| # | State (screen) | One suggested next step (exact copy, ≤ 12 words) | Who | What must be visible to understand it |
|---|---|---|---|---|
| S0 | Landing, signed out (`/`) | **Sign in with Google to play** | H | One-line pitch, the 90-second explanation (§2) as 3 short cards, "Have an invite link? Open it after signing in." |
| S0i | Invite link, signed out (`/play/CODE` or `/rooms/CODE`) | **Sign in with Google to join room CODE** | H | Room code, owner's full name, "N of 3 players here", "Your name will be shown to other players". |
| S0s | Game link, signed out (`/games/CODE`) | **Sign in to watch this game** | H | Game code, room code, "live" or "ended". |
| S1 | Signed in, no rooms (`/`) | **Create a room for your first game** | H | Secondary: "Have a code? Enter it." Empty-list copy: "Rooms you create or join appear here." |
| S2 | Owner, alone, room just created (room page) | **Invite players: copy the link** | H | Preset card (First steps, already chosen), seat strip "1 of 3 seats filled", secondary "Fill seats with AI players". |
| S2a | Owner, assistant allowance not yet approved (shown once, as the room-creation dialog, before S2) | **Turn on the assistant for everyone in this room** | H | Pre-filled allowance and model, cost line "≈ $X per player per game at Sonnet 5.5 rates, never above $2/game", consent checkbox, "Not now" link. |
| S3 | Owner, 2 seats filled (room page) | **Fill the last seat with an AI player** | H | Seat strip "2 of 3", the invite link still copyable, AI seat label "AI · Sonnet 5.5". |
| S3a | Owner pressed "Fill seats with AI", aiBudget = 0 (dialog) | **Approve AI play: up to 300,000 tokens per game** (value is a placeholder, see §6) | H | Which agent (library default), seats added, cost ≈ $ and the $2/game cap, consent checkbox. Never let the AI seat exist with a zero budget silently. |
| S4 | Owner, ≥ 3 seats, lobby (room page or player client) | **Start the game** | H | Preset card, seats with kind (human/AI), "Each player gets a secret goal when the game starts." |
| S4p | Owner wants another kind of game (room page) | **Choose a game type** (opens the preset menu) | H | Current preset highlighted; last entry "Create a new configuration…" (§3). |
| S5 | Non-owner member, lobby (player client) | **Learn the game in 90 seconds while you wait** | A | Preset card (read-only), seat strip, "Waiting for {owner} to start". The chip opens §2 inline. |
| S5j | Signed in via invite, not a member (player client) | **Join room CODE** | H | Owner name, preset card, seats, "Joining while a game runs makes you a spectator until the next one." |
| S6 | Game planning, no agents (player client) | **Ask the assistant to write your first agent** | A | Utility card summary line pinned on top ("Your secret goal: 🎯 …"), "World starts in 0:42", god energy, "The world is frozen: summon agents now." |
| S7 | Running, no agents (player client) | **Summon an agent: only agents can change objects** | A | Same pinned goal line, energy vs. the last validated summon cost, "Your points: 0". |
| S7e | Running, a summon is unaffordable | **Wait 12 s: your energy refills 1 bit per second** | — (status, no button) | Energy bar with the target cost marked; secondary "Make it shorter: shorter code costs less". |
| S8 | Running, I have agents, payoff > 0 (player client) | **Tell the others what you like: draft a chat message** | A | Lens shows my payoff trend; agents' status (charging/ready/cooldown); public chat preview. |
| S8z | Running, I have agents, own bits > 0 but payoff ≈ 0 | **Others don't care about your objects: ask them in chat** | A | Per-object "yours × others' care = payoff" for my top objects, with "others: 0" highlighted. |
| S9 | Paused by a god (player client) | **Paused 2:40: plan with the others in chat** | A | Who paused, countdown, "Your pause: unused" (one per god), "World time is stopped; energy still refills." |
| S9r | Recovery (idle-parked), non-owner | **Waiting for {owner} to resume the game** | — | Reason: "Parked after 30 minutes with no human activity." Any input counts as activity. |
| S9o | Recovery, owner | **Resume the game** | H | Same reason line. |
| S10 | Ended (player client and game page) | **See how you scored** | A | Final rank and total, winners, "Your best object", the 15 s auto-return countdown (engine UI only). |
| S11 | Lobby after ≥ 1 game, owner | **Start the next game** (or **Try Classic next** if they played First steps) | H | Last game's winner line, preset card with "next in learning order" hint. |
| S11n | Lobby after ≥ 1 game, non-owner | **Waiting for {owner} to start the next game** | — | Last result, "Ask the assistant what to try differently" as the secondary chip. |
| S12 | Member who joined mid-game (spectator) | **Watch this game: you play the next one** | — | Live lens in public mode (salience, leaderboard), chat readable, chat posting allowed for members. |
| S13 | Signed-in viewer, not a member, game running (game page) | **Join the room to play the next game** | H | Live projection; "You are watching." |
| S14 | Hosted player client, no `?room` | **Enter the room code from your invite** | H | Plus a list of "Your rooms" (from `rooms.list`) so the code is rarely needed. |
| S15 | Assistant allowance used up this game | **Your assistant is out of allowance until the next game** | — | Manual tools still work (command palette); the lens stays live. |

Transitions (main path):

```
S0 ─sign in─► S1 ─create─► S2a ─approve/not now─► S2 ─invite/AI─► S3 ─► S4 ─start─► S6 (planning)
S0i ─sign in─► S5j ─join─► S5 ─owner starts─► S6
S6 ─planning ends─► S7 ─summon─► S8 ⇄ S8z ; S8 ─pause─► S9 ─► S8 ; idle 30 min ─► S9r/S9o ─► S8
S8 ─random end─► S10 ─► S11/S11n ─start─► S6
any lobby ─owner─► S4p ─► preset menu │ "Create a new configuration…" ─► config page (§4) ─save─► S4
```

### 1.3 Dead ends in the current UI

1. **New room on Int, no preset highlighted.** The owner sees Language, the World picker, the Rule shelf, three
   dropdowns, 16 number fields, an AI budget and an assistant allowance (`OwnerSettings`) before anyone has
   joined. Nothing says "the defaults are fine, invite people".
2. **Add AI, then Start → "Approve an AI token budget…"**: the fix is at the bottom of another panel.
3. **"No agents in library"** in the AI dropdown and **missing provider key** (`UNAVAILABLE` on start): no
   explanation and no path. The AI action should be hidden with one line ("AI players are not set up on this
   server") when `aiFunding.configured` is false.
4. **"Declare ready" / "Stand down (unready)"** suggests that readiness gates the start. It does not.
5. **Two apps, no guidance.** The game page says "Act from your player client"; the room page links it in small
   type under the title. A newcomer does not know which tab is "the game".
6. **Assistant off by default**: the drawer explains that the owner must approve it "on the engine site". The
   player cannot act on that; the owner is never told.
7. **Player client in the lobby**: "Your utility function: Dealt when the next game starts", an empty Forge with a
   code placeholder, and zeros. Nothing says what will happen or what to prepare.
8. **Planning**: "world starts in 42s" with no "the world is frozen: summon now".
9. **Forge language toggle** lets a newcomer pick the wrong language ("room expects python"); Validate then Summon
   is a two-step flow whose disabled state gives no reason when energy is short.
10. **Zero payoff with no reason.** A newcomer's own bits can be high and the payoff 0 because peers do not care.
    The "why?" toggle is per object; nothing summarises it.
11. **Recovery**: non-owners see phase `recovery` with no explanation; only the owner gets "Resume".
12. **Ended**: the player client says "results are in the room's history"; the engine UI auto-returns after 15 s.
    Neither says "what next".
13. **"Game rules for your AI" textarea**: a long, technical wall on the room page that a newcomer reads as
    required.
14. **Settings conflict**: "The room revision moved… Discard to reload." throws the owner's edits away.
15. **Hosted `/player/` without `?room`** asks for a short code the newcomer may not have, with no list of their
    rooms.
16. **"needs 2 more participants (min 3)"** sits beside the disabled Start button, but "copy invite link" is a
    tiny code chip in the header.

---

## 2. The game in 90 seconds

The canonical text. The landing cards, the lobby chip (S5) and the assistant's first briefing reuse it verbatim
(212 words). Keep it in one module, e.g. `lib/object-views` beside `HowScoringWorks`, so that every surface
shows the same text.

> Code Gods is a game about a shared world and secret wishes.
>
> The world is a crowd of objects: usually small grids of coloured numbers. Every player is a god with a secret
> **utility function**, a short rule that scores every object, such as "I like grids with red corners". The
> rarer an object is by your rule, the more **bits** it is worth to you.
>
> You cannot touch objects yourself. You **summon agents**: tiny Python or TypeScript programs that, when the
> world picks them, make a few moves on a random object: swap, paint, slide. Summoning costs your **energy**,
> which refills every second, and shorter programs cost less. Each agent then earns its own energy and spends
> some on every move.
>
> Here is the twist. Your **payoff** from an object is your bits times how much the other gods, together, care
> about it. An object only you love earns you nothing. You cannot see anyone else's rule, only the total. So
> **talk**: say what you want in the public chat, find overlaps, strike deals, call out agents that wreck your
> favourites.
>
> The game ends at a random moment. Your score is your payoff added up over every object alive then. Your
> assistant can explain, write agents and draft messages for you.

For a non-Grid world, swap "small grids of coloured numbers" for the object type's `kid` text ("whole numbers",
"pieces of text") and the example rule for one from the dealt catalog.

### Glossary (15 terms)

| Term | One-line gloss |
|---|---|
| Room | The table you play at: a short code, an owner and up to 8 seats; it hosts game after game. |
| Game | One round in a room: a planning minute, then a running world that ends at a random moment. |
| God | A player, human or AI. |
| Object | One thing in the world (a grid, a number, a piece of text); no two are ever identical. |
| Utility function | Your secret rule that scores every object; only which object is better matters. |
| Defence goal ⚠️ | An optional second secret rule: objects that are unusually bad for it cost you bits. |
| Bits ✨ | How rare an object is by your rule: 1 in 8 random objects as good means 3 bits. |
| Others' care | The other gods' bits for an object added together (never 0 or less): the only thing you learn about their rules. |
| Payoff | Your bits × others' care for one object; your score is the sum over all live objects. |
| Salience 🔥 | Everyone's bits for an object added up: public, so you can see what the table cares about. |
| Agent | Your small program, `agent(obj)`, which returns up to 16 moves when the world picks it. |
| Summon | Paying energy to put an agent into the world; the price is the program's description bits (shorter is cheaper). |
| Energy | Your god's bits for summoning; it refills every real second, even during planning and pauses. |
| Agent energy ⚡ | Each agent's own battery; it charges in world time and pays for every move it tries. |
| Pause | Each god may stop the world once per game (3 minutes by default) to negotiate. |

---

## 3. The preset menu (room page and player-client lobby)

### 3.1 Presentation

A single **"Game type"** control. It shows as a card with the current choice; clicking it opens a menu (a
popover on desktop, a sheet on mobile). Owners can open it; everyone else sees it read-only.

```
┌ Game type ───────────────────────────────────────────────┐
│ 🔢🟥🟩🟦  First steps                         BEGINNER  ✓  │
│ A small 4×4 board, slowed down so you can watch your score│
│ 3–4 players · ~6 min (often 3–13) · slow pace · Python   │
├──────────────────────────────────────────────────────────┤
│ 🔢🟥🟨🟩🟦 Classic                            STANDARD     │
│ 5×5 with four colours: the standard game                 │
│ 3–6 players · ~6 min · normal pace                       │
│ 🔢🟥🟨🟩🟦 Low income                         STANDARD     │
│ 🧮🌈  Big board                               ADVANCED     │
│ 🃏🌈  Master                                  ADVANCED     │
│ ── Your configurations ──                                 │
│ ⚙️  Classic, slower and longer · saved 3 Oct              │
│ ──                                                        │
│ ＋ Create a new configuration…                            │
│ Agents are written in:  (● Python) ( TypeScript )         │
└──────────────────────────────────────────────────────────┘
```

| Element | Source | Notes |
|---|---|---|
| Emoji | Derived: the symbol component's emoji + the colour component's emoji (`SYMBOL_COMPONENTS`, `COLOUR_COMPONENTS`); for Int/string the object type's emoji (🔢/🔤) | No new data; the manifest already carries `params[].options[].emoji`. |
| Name, one-line kid text | `SETTINGS_PRESETS[].label`, `.kid` | Already in `manifest.presets`. |
| Level badge | **New field** `level: "beginner" \| "standard" \| "advanced"` on `SETTINGS_PRESETS` | Learning order stays the array order. |
| Players hint | **New field** `players: [min, max]` (authored; placeholder values above) | The menu warns, without blocking, when the room's seat count is outside it. |
| Length | Derived from `settings.planningSeconds` and `halfLifeSeconds`: "~{planning + h} min (often {0.415h}–{2.32h})" | All current presets share h = 300 s and 60 s planning, so the line is honest but identical. Show it anyway; custom configs differ. |
| Pace | Derived from `interactionRateHz`: ≤ 30 "slow", ≤ 150 "normal", else "fast" | First steps is 25 Hz. |
| `offered: false` | `manifest.presets[].offered` | Show the entry disabled: "Not available on this server yet". |
| Language | `settings.language`; applied with the preset (`presetSettings(id, language)`) | The only extra question in the menu, because every player writes code in it. |

**Default selection.** A new room is created on **First steps** (needs the `rooms.create` change). After a game
ends, the menu marks the next preset in learning order with a "Try next" chip (S11), but never switches by
itself.

**Applying.** Choosing an entry calls `owner.settings({roomId, revision, preset, settings: {language}})`
immediately; nothing waits for a Save button. The card shows "Applied for the next game". The menu is disabled
while a game runs, with the copy "Change the game type after this game ends."

### 3.2 How a non-owner sees it

The same card, read-only, in the room page and the player-client lobby:

```
This room plays: 🔢🟥🟩🟦 First steps · Beginner · ~6 min · Python
A small 4×4 board, slowed down so you can watch your score
[Customised: slower interactions, defence goals on] [See all settings ›]
```

"Customised" appears when `settingsOrigin.modified` is true. Its chips list the 1–3 biggest differences from the
base preset in plain words (from the field table in §4.3). "See all settings" opens the configuration page in
read-only mode, which replaces today's `ReadOnlySettings` panel.

### 3.3 "Create a new configuration…"

The menu's last entry. It navigates to `/rooms/:code/configure?from=<current preset or config id>`. The page
opens pre-filled from the room's current settings; nothing changes until the owner saves.

### 3.4 New room data: `settingsOrigin` (for the architecture agent)

`rooms.settingsOrigin = { kind: "preset" | "config" | "custom", id?: string, modified: boolean }`.

- Set by `owner.settings`: a `preset` argument gives `{kind: "preset", id, modified: false}`. A full `settings`
  sets `modified` = (the settings differ from what that origin would produce). A configuration applied by id
  gives `{kind: "config", id}`.
- Copied into each game's snapshot, so history rows can say "Classic" instead of `python / Grid 5,base10,rgby`.

### 3.5 Saved configurations (proposed; new data)

The owner can save any configuration for reuse in their other rooms. Proposal:

- **Table `savedConfigs`**: `{ownerId, createdAt, updatedAt, basePresetId, settings: GameSettings (full),
  assistantBudget?, assistantModel?, aiBudget?, title, summary, lastUsedAt}`, at most 20 per user, private to
  the owner.
- **Title without free text.** By default the title is generated from the base preset and the differences
  ("Classic, slower and longer"), using the consequence words in §4.3. This respects the "pre-authored, not
  free text" spirit. Whether owners may rename configurations is an **open question for the owner**: the
  memory forbids free-text identifiers for grammar, selector and complexity, and room names, but says nothing
  about personal labels.
- **Functions**: `configs.list()` (own), `configs.save({roomId} | {settings, …})`, `configs.remove({id})`, and
  `owner.settings({…, config: id})`, which re-runs `nextSettings` (validate, `assertOffered`, limits). A config
  that is no longer offered after a deploy (calibration tables change) appears disabled with "No longer runs on
  this server: {reason}. Open in editor".
- **Agent tools**: `list_configs` (read, own) and `update_settings` gains `config?: id`, so the assistant can
  say "use my long-game setup".
- **Budgets travel with the config but are never applied silently.** Applying a config whose budget differs
  from the room's opens the approval checkbox (the same consent copy as today).

---

## 4. The configuration page (`/rooms/:code/configure`)

### 4.1 Layout

A **sectioned long form with a stepper and a sticky summary**, not a wizard. A wizard hides consequences and
forces experts through every step. A long form, stepped visually, lets a newcomer go top to bottom and an
expert jump straight to "Time".

```
┌ ← Room K7QF   Configure the next game                 [Ask the assistant…]   ┐
├───────────────┬───────────────────────────────────────────┬──────────────────┤
│ 1 Start from ✓│ ① Start from                              │ SUMMARY (sticky) │
│ 2 The world   │   (● Classic) ( First steps ) ( My … )    │ 🔢🟥🟨🟩🟦 Grid 5×5│
│ 3 Goals       │ ② The world                               │ Python           │
│ 4 Agents      │   What are objects?  [🟥 Grid][🔢 Int][🔤 Text]│ 80 objects, +1/2s│
│ 5 Energy      │   Board size  [3][4][●5][6][7]   +12 rules │ ~6 min (3–13)    │
│ 6 Population  │   …                                       │ 3–8 players      │
│ 7 Time        │   ▸ More world options (2)                │ AI: 2 seats ≤$2  │
│ 8 Players & AI│ ③ Whose goals …                           │ Assistant: on    │
│ 9 Review      │                                           │ vs Classic: 3 Δ  │
│               │                                           │ [Review & save]  │
└───────────────┴───────────────────────────────────────────┴──────────────────┘
```

- Each section opens with a one-sentence intro and a **"Recommended"** reset that restores the base's values for
  that section only.
- Each section shows the questions a newcomer must answer. Expert fields sit under **"More … options"**, and the
  fixed facts (single-option fields) are plain text.
- Number fields use **stepped choices** (segmented buttons of authored values) plus "Exact value…" under the
  section's More, validated live against the bounds in §0. Choice lists stay pre-authored where the memory file
  requires it (grammar, selector, complexity, object type and type arguments, which snap to offered
  instantiations).
- The summary is a bottom sheet on mobile. "vs Classic: 3 Δ" opens the diff.

### 4.2 Dependencies (what changes when)

| Change | Effect, mirroring server logic |
|---|---|
| `language` | `grammarId` and `complexityFunctionId` move to the language's only option (`fixOptionChoices` / `settingsOptionsFor`; `COMPLEXITY_FOR`). Show both as facts: "Agents: `def agent(obj)` · priced in Python description bits". |
| `objectType` | Type-argument pickers swap (`ObjectTypePicker`), and choices snap to an offered instantiation (`snapToOffered`). Fields still at the old tuned defaults move to the new ones (`TYPE_DEFAULTS` via `pickType`/`retuneSettings`): for Grid, `startingObjectCount` 80, `spawnRateHz` 0.5, `agentEnergyPerSecond` 32, `excludedFamilies` = the 11 weak families. A toast names the fields that moved: "Adjusted 4 settings for grids (undo)". |
| `typeArgs` | The rule shelf changes (`catalogFor`, the `+12/−3 rules` delta on each option). `Grid(4,base10,rgb)` also excludes `fair_weaver` (`TYPE_DEFAULTS.byKey`). An "Unlock" on a locked rule changes `typeArgs` (`snapToOffered`). |
| `defenceRate` = 0 | Hide `penaltyWeight` (it has no effect). |
| `utilitySelectorId`, `excludedFamilies` | Filtered by language and object type (all current options support all). |
| Any field | The summary's length, pace and "vs base" diff update live. |

### 4.3 Every field

The **Meaning** and **Consequence** columns are the canonical texts for `SETTINGS_DOCS` (§4.6). Each is one
neutral sentence with no reference to layout or controls, so the configuration page tooltip, the read-only view,
the assistant's explanation and the `update_settings` tool description all read the same words. UI-only notes
(control, tier, visibility) sit in separate columns.

Control: P = pre-authored choices only. Default: Grid preset values where `TYPE_DEFAULTS` overrides
`DEFAULT_SETTINGS`. Tier: Q = asked, M = under "More", F = fixed fact.

**① Start from** (not a `GameSettings` field): "Start from which game type?" The choices are the built-in presets,
the owner's configurations and the room's current settings. Picking one replaces every field, after a
confirmation if there are unsaved edits.

**② The world**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `objectType` | What are the objects in the world? | P: 🟥 Grid / 🔢 Int / 🔤 string, with `kid` text | Grid (presets) | The kind of thing every god scores and every agent changes: a grid of coloured symbols, a whole number or a piece of text. | Grids give the richest and most visual rules, while numbers and text give terser, more abstract games. | Q |
| `typeArgs.size` (Grid) | How big is each board? | P: 3–7 (`GRID_SIZES`), offered only | 4 (First steps), 5 (Classic) | Each object is a square board with this many cells on a side. | A bigger board allows more rules and makes each object harder to read at a glance. | Q |
| `typeArgs.symbols` (Grid) | What can each cell show? | P: Digits 0–9 / Base 12 / Hex / Playing cards | base10 | The set of symbols that cells can show and that rules can count. | Playing cards add suits and face cards, which unlock more rules and make objects harder to read. | Q |
| `typeArgs.colours` (Grid) | Which colours can cells have? | P: RGB / RYGB / Rainbow 6 | rgb / rgby | The set of colours that cells can have, some of which mix into others. | More colours unlock more colour rules and mixing moves. | Q |
| `typeArgs.min`, `.max` (Int) | What are the smallest and biggest numbers? | P: offered presets | −2,147,483,648 … 2,147,483,647 | Every object is a whole number within this range. | A narrower range makes collisions with existing values, which always fail, more common. | Q |
| `typeArgs.maxLength` (string) | How long can a piece of text be? | P: 16 / 128 | 128 | Every object is a piece of text at most this many characters long. | A shorter limit makes objects simpler and leaves fewer possible values. | Q |
| `language` | Which language do agents use? | P: Python / TypeScript (`manifest.runtimes`) | python | Every player writes agents in this programming language. | Changing it changes how agents are written and how their summon price is counted. | Q |
| `grammarId` | What shape must an agent's code have? | F (P if more than one option) | python-agent-v1 | The shape an agent's code must have: a function `agent(obj)` that returns a list of moves. | It follows the language and has no other effect. | F |
| `complexityFunctionId` | How is an agent's summon price measured? | F | ast-bits-v1 / ts-ast-bits-v1-uniform | The way an agent's summon price is measured: the description bits of its source code. | It follows the language, and shorter programs always cost less. | F |

**③ Goals**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `utilitySelectorId` | How are secret goals dealt? | P: Aligned Lottery / Divine Lottery | fair-aligned | How secret goals are dealt: the Aligned Lottery deals rules that tend to want the same objects, and the Divine Lottery draws each god's rule at random. | The Divine Lottery produces more clashing goals, which makes negotiation harder and outcomes less fair. | Q |
| `excludedFamilies` | Which rules are never dealt? | `RuleShelf` toggles (P: catalog ids) | 11 weak Grid families (+ `fair_weaver` on 4×4 rgb) | Families of rules that are never dealt in this game. | Excluding more families makes goals more predictable, and restoring the weak families lowers fairness. | M |
| `defenceRate` | How likely is a god to also get something to defend? | P: 0 / 0.25 / 0.5 / 1; Exact 0–1 | 0 | The probability that each god is also dealt a defence goal, which costs points when objects are unusually bad for it. | Raising it adds conflict, because objects can lose points as well as gain them. | Q |
| `penaltyWeight` | How much does a defence bit weigh against a reward bit? | P: ½ / 1 / 2; Exact ≥ 0 | 1 | How much one defence-goal bit counts against one reward bit. | Raising it makes defending matter more than building, and it has no effect when no defence goals are dealt. | M (hidden while `defenceRate` = 0) |
| `priorId` | What is rarity measured against? | F | uniform | The reference against which rarity is measured: uniformly random objects. | Only one reference exists today, so it has no effect. | F |

**④ Agents**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `maxAgentsPerGod` | How many agents may each god keep? | P: 5 / 20 / 50 / 200; Exact 1–200 | 200 | The most agents each god may have in the world at once. | Lowering it makes each agent count more and rewards careful code over swarms. | Q |
| `commitClause` | May agents make their moves conditional? | P: off / offered | off | Whether agents may wrap moves in `only_if_better(...)`, so that the moves apply only if they raise their owner's payoff on that object. | Offering it makes agents safer and accidents rarer, at about 3.6 extra summon bits for each agent that uses it. | M |
| `stepBudget` | How much may an agent compute per act? | P: 100k / 500k / 2M; Exact 1–10M | 500,000 | The fixed number of computation steps an agent may use per act, so the same agent and input always fit or never do. | Lowering it allows only simple agents, and raising it allows cleverer agents at the cost of a slower world. | M |
| `interactionComputeMs` | What is the CPU safety limit per act? | Exact 1–1000 ms | 1000 | A CPU-time safety limit per act behind the step budget, excluding compilation and startup. | It rarely binds, so changing it seldom matters. | M |

**⑤ Energy**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `startingEnergy` | How much energy does each god start with? | P: 50 / 100 / 200 / 400 bits | 100 | The energy, in bits, each god holds for summoning agents when planning begins. | Raising it allows bigger or more first agents and a faster start. | Q |
| `energyPerSecond` | How fast does a god's energy refill? | P: 0.5 / 1 / 2 / 4 bits/s | 1 | The bits each god's energy gains per real-time second, including planning and pauses. | Raising it allows more summons and a busier world. | Q |
| `agentEnergyPerSecond` | How fast do agents charge? | P: 8 / 16 / 32 / 64 bits/s | 2 (Int); 32 (Grid) | The bits each agent's own energy gains per second of world time, used to pay for its acts. | Raising it makes agents act more often, so objects change faster. | Q |
| `agentBatteryActs` | How many acts can an agent save up? | P: 1 / 2 / 4 / 8 | 2 | How many expected acts' worth of energy an agent can store before its income stops. | Raising it lets agents act in bursts after quiet spells. | M |
| `perActFloorBits` | What is the minimum price of an attempted act? | P: 0 / 1 / 2 / 4 bits | 2 | The minimum bits charged for every attempted act, whether or not it succeeds. | Raising it makes failed and wasteful moves costlier, which favours precise code. | M |

**⑥ Population**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `startingObjectCount` | How many objects does the world start with? | P: 10 / 40 / 80 / 160; Exact 0–1000 | 10 (Int); 80 (Grid) | How many objects the world holds when it starts running. | Raising it spreads scores across more objects, and each object changes less often. | Q |
| `spawnRateHz` | How often does a new object appear? | P: 0 / 0.1 / 0.5 / 1 per s; Exact ≤ 10 | 0.1 (Int); 0.5 (Grid) | How many new random objects appear per second of world time. | Raising it brings more fresh objects to claim, and totals grow faster. | Q |
| `spawnFunctionId` | How are new objects drawn? | F | uniform | How new objects are drawn: uniformly at random. | Only one option exists today, so it has no effect. | F |
| `objectSelection` | Which object does an act target? | P: uniform / shelter | uniform | How an act's target object is chosen: uniformly, or with shelter, where objects many gods care about are hit a little less often. | Shelter protects objects many gods care about, so agreements last longer. | M |

**⑦ Time**

| Field | Question | Control | Default | Meaning | Consequence | Tier |
|---|---|---|---|---|---|---|
| `planningSeconds` | How long is planning before the world starts? | P: 30 s / 1 / 2 / 5 min; Exact ≤ 3600 | 60 | How long the world stays frozen at the start while gods read their goals, summon agents and talk. | Lengthening it helps beginners and delays the action. | Q |
| `halfLifeSeconds` | Roughly how long should games last? | P: Short 120 / Normal 300 / Long 600 / Marathon 1200 s; Exact > 0 | 300 | The world time within which half of games end, the end itself being a hidden random moment. | Lengthening it gives more time to negotiate and makes games longer on average. | Q |
| `interactionRateHz` | How fast does the world move? | P: Slow 25 / Normal 100 / Fast 300 / Max 1000 | 100 (25 in First steps) | The maximum number of acts per second across all agents. | Lowering it makes each score easier to follow, and raising it makes the world busier and harder to read. | Q |
| `pauseSeconds` | How long is each god's one pause? | P: 1 / 3 / 5 min; Exact ≤ 3600 | 180 | How long the world stops when a god uses their one pause per game. | Lengthening it gives more time to negotiate during a pause. | M |

**⑧ Players and AI** (room state and budgets, not `GameSettings`; saved through `addAi`/`removeAi` and `approveAiBudget`)

| Item | Question | Control | Default | Meaning | Consequence |
|---|---|---|---|---|---|
| AI seats | How many seats do AI players fill? | Count stepper + agent from `aiTemplates.catalog` (P) | 0; "fill to 3" suggested | AI gods play with the same information and actions as humans. | More AI seats let games start without waiting, and each one draws on the AI budget. |
| `aiBudget` | How many tokens may AI players use per game? | P: 100k / 300k / 1M; Exact 0–1,000,000; consent checkbox | 0 today; suggest a value when AI seats > 0 | The total tokens all AI players together may use in one game, billed to the server owner. | Too low a budget makes AI players stop acting mid-game, and dollar caps of $2 per game and $5 per day still apply. |
| `assistantBudget` | How many assistant tokens does each human get per game? | P: off / 50k / 200k / 1M; Exact ≤ 2,000,000; consent checkbox | 0 today; suggested at room creation | The tokens each human's in-client assistant may use per game, billed to the server owner, where zero turns the assistant off. | Raising it lets players rely on the assistant for more of the game. |
| `assistantModel` | Which model powers the assistants? | P: `manifest.aiFunding.models` (unconfigured ones disabled) | claude-sonnet-5-5 | The AI model that powers every player's assistant in the room. | Larger models give better help at a higher cost per token. |

### 4.4 Validation, review and save

- **Live validation** mirrors `validateSettings`, the `nextSettings` limits and the offered-instantiation check.
  Errors sit on the field ("Must be between 1 and 200 agents"), never in a banner. Instantiations that are not
  offered cannot be chosen (`snapToOffered`).
- **Review (section ⑨).**
  1. A plain-language diff against the base ("Classic, with: slower world (25/s), defence goals for half the
     gods, games of about 10 min").
  2. The summary card as players will see it in the preset card (§3.2).
  3. A cost block with the consent checkbox, only if a budget changed.
  4. "Also save as one of my configurations" (checkbox, §3.5).
- **Save** = `owner.settings({roomId, revision: baseRevision, settings: full})`, then
  `rooms.approveAiBudget` if a budget changed. (These are two calls: ask the architecture agent for one atomic
  call, or for `update_settings` to accept `assistantBudget`/`assistantModel`.) On success the page returns to
  `/rooms/:code` with "Saved for the next game" and the card shows "Custom (based on Classic)".
- **Conflicts** (`CONFLICT: Settings changed; refresh before saving`):
  - Re-read the room and rebase three ways: base → mine, base → theirs.
  - Disjoint fields merge automatically, with the note "Also includes 2 changes made elsewhere (by your
    assistant)".
  - Overlapping fields show per-field "Keep mine / Take theirs".
  - Never discard the draft.
- **A game started meanwhile** (`CONFLICT: frozen during games`): keep the draft in `localStorage`, keyed by the
  room. Disable Save with "A game is running. Save this for the next game when it ends." The button re-enables
  when `room.activeGame` clears.
- **Read-only mode** for non-owners: the same page, controls replaced by values, the same meanings and
  consequences. This replaces `ReadOnlySettings`.

### 4.5 The assistant on this page

- An **"Ask the assistant…"** box in the page header: "Set up a short beginner game for 4 people, two of them AI."
- The assistant reads `get_room_state`, `get_ai_catalog` and the manifest. It then calls `update_settings`
  (`preset` and/or `settings`, with `revision`), plus `add_ai`. These are owner tools, so each one already needs
  a confirmation card.
- **Card copy**: the plain-language diff from §4.4, not the JSON (for example "Switch to First steps; planning
  2 min; add 1 AI seat (Sonnet 5.5)").
- After approval the page's live room subscription updates the form. Changed fields flash, with one "Undo
  assistant changes", which saves the previous settings at the new revision.
- **If the owner has unsaved edits**, the assistant's save is a conflict for the page and goes through the merge
  above.
- **Prerequisites.** The owner's assistant needs an `owner` credential (`assistant.send` with
  `ownerConsent: true`) and a non-zero allowance. That is one more reason to ask for the allowance at room
  creation (S2a).
- **Tool gaps.** `update_settings` cannot set `assistantBudget`, and the assistant should not approve spending by
  itself. It may *propose* a budget, and the human ticks the consent box on the page.

---

### 4.6 Where per-field documentation lives

The documentation catalogue covers **functions**. Settings **fields** need their own typed table, written once
and read by every surface:

- **`SETTINGS_DOCS` in `lib/game-core/src/settings.ts`**, beside `GameSettings`:
  `export const SETTINGS_DOCS = {…} as const satisfies Record<keyof GameSettings, FieldDoc>`.
  - `FieldDoc` is `{question, meaning, consequence, unit?, section, tier: "ask" | "more" | "fixed",
    suggested?: readonly number[] | readonly string[], hiddenWhen?: Partial<Record<keyof GameSettings, unknown>>,
    dependsOn?: readonly (keyof GameSettings)[]}`.
  - `satisfies Record<keyof GameSettings, …>` makes a new field without docs a type error, so it cannot ship
    undocumented. A stale key is also an error.
  - `suggested` holds the stepped values from §4.3. `TYPE_DEFAULTS` and preset values must appear in it.
- **Type arguments** (`typeArgs.size`, `.symbols`, `.colours`, `.min`, `.max`, `.maxLength`) are defined per
  object type, so their docs belong in `lib/game-types`. Extend `ParamSchema` with
  `question`/`meaning`/`consequence`. Component options already carry `kid`, which serves as the option-level
  meaning.
- **Room budgets** (`aiBudget`, `assistantBudget`, `assistantModel`) are not `GameSettings` fields. Document them
  with a sibling `ROOM_BUDGET_DOCS: Record<"aiBudget" | "assistantBudget" | "assistantModel", FieldDoc>` in the
  engine. The function catalogue entry for `approveAiBudget` / `update_settings` can then reference those texts
  instead of repeating them.
- **Distribution:**
  - `manifest.get` returns `settingsDocs` (+ `paramDocs` inside `objectTypes[].params`), so the engine UI and
    player client never hard-code copy.
  - `get_rules` (or a small `get_settings_docs` tool) gives the assistant the same sentences.
  - The `update_settings` tool description says "field meanings: see get_settings_docs" rather than embedding
    27 sentences.
  - `rulesFor` (the copyable rules sheet) and the read-only configuration view render from it too.
- **Guard test** (unit, cheap; `lib/game-core`), checking that each `meaning`/`consequence` is:
  - one sentence (a single terminal period);
  - ≤ 200 characters;
  - free of layout words (`below|above|click|button|tab|panel|page|screen`), since these texts are also read
    by the assistant.

  A second assertion checks that every value in `DEFAULT_SETTINGS`, `TYPE_DEFAULTS` and the presets is among
  `suggested` for its field (or that the field has no `suggested`).

---

## 5. Explaining rules during play

### 5.1 Where the explanations live

| Need | Primary home | Secondary |
|---|---|---|
| "What is my goal?" | A **one-line pinned goal strip** on top of the lens: `🎯 Corner Painter: likes boards with red corners [card]`. The card opens `UtilityCardView` (kid summary, uses-badges, source, ⚠️ defence goal). | The assistant answers "what does my rule want?" with `get_my_utility` + `evaluate_value` on a live object. |
| "How does scoring work?" | An **assistant answer**: the `HowScoringWorks` five paragraphs, rendered as a rich message with the player's own numbers from one object ("This grid: you 4.1 bits × others 2.3 = 9.4"). | The lens's per-object row: "yours × others' care = payoff", the existing `ScoreBreakdown` "why?". |
| "Why is my score 0?" | **Lens badge** "0 because others don't care" when Σ own bits > 0 and Σ payoff ≈ 0, linking to an assistant answer. | — |
| Full rules sheet for an external AI | Command palette: "Copy rules for my AI" (`rulesFor`). Remove it from the default room page. | — |
| Settings in force | Preset card → read-only configuration page (§3.2). | `get_rules`. |

### 5.2 First-game guidance the assistant offers unprompted

**Who gets it.** The guidance runs only while the player is in their **first two games**. That needs new
per-user data: `gamesPlayed`, or "seen" flags. The messages are **deterministic templates rendered as assistant
messages, costing no tokens**. The model is called only when the player taps a chip or replies, so the coaching
works even when the allowance is small, and its wording is reviewed copy.

| Trigger | Message (template) | Chips |
|---|---|---|
| First lobby visit | "Welcome! While we wait for {owner}: the game in 90 seconds?" | [Show me] [Skip] |
| Game start (planning), utility dealt | "Your secret goal: {emoji} {name}: {summary}. The world starts in {n}s and is frozen until then." | [Write my first agent] [Explain my goal] |
| Planning, 20 s left, no agents | "20 seconds left. A simple agent now beats a perfect one later." | [Draft a simple agent] |
| Running 30 s, still no agents | "Nothing changes for you until one of your agents acts." | [Summon an agent] |
| First summon accepted | "{agent} is charging: about one move every {s}s. Your score updates as it acts." | [What should I watch?] |
| First payoff > 0 | "First points: {object} scores you {own} × others' {care} = {payoff}." | [How does scoring work?] |
| Σ own bits > 0, payoff ≈ 0 for 60 s | "You like your objects, but the others don't, so they pay 0. Find shared interests in chat." | [Draft a chat message] |
| Someone pauses | "{name} paused for {m}:{ss}. Good moment to negotiate." | [Summarise the chat] |
| Game ends | "Game over: you finished {rank} of {n} with {total}." | [What went well?] [What to try next?] |

**Rules for staying quiet:**

- Never post to public chat. Drafts always go through the existing `send_chat` confirmation card.
- At most one unprompted message per phase change, and never within 10 s of the player typing or acting (palette,
  summon, chat).
- Never repeat a message the player dismissed. "Skip" on the first message mutes all coaching for that game.
- Say nothing in the last 5 s of planning or a pause (the player is busy).
- Say nothing to spectators except the end-of-game summary, and nothing at all to returning players beyond game
  two.
- Never reveal anything beyond the player's own projection, and never guess other players' rules as if they were
  fact. "Others' care is high on blue-heavy grids" is allowed; "Alice wants blue" is not.

---

## 6. Risks and open questions for the other mandates

**For (a) the lens and chat composition**
- The pinned goal strip (§5.1) and the "0 because others don't care" badge must fit the single lens. Confirm the
  lens has a persistent header slot.
- Coaching messages are client-rendered templates in the assistant transcript. Chat composition must show them
  as assistant turns, distinguishable from model output, and render their chips.
- Does the assistant's chat input also carry public chat, and how? A newcomer must never confuse "talk to my
  assistant" with "talk to everyone". Suggest separate composers, or a visible "To: everyone / To: assistant"
  switch.

**For (b) progressive disclosure, palette and engine UI cleanup**
- The room page should show only: the preset card, the seat strip with "Copy invite link" and "Fill with AI",
  and Start. Members, History, Rules sheet, Player apps and budgets move to secondary tabs or the palette.
- Remove "Declare ready" from the primary path. Make it a status chip or delete it.
- Palette entries needed: "Change game type", "Configure next game…", "Copy invite link", "Copy rules for my
  AI", "Pause (once)", "Resume", "End game", "Add AI player", "Assistant allowance…".
- Where does the owner start the game: the player client lobby, the room page, or both? I recommend both, with
  the player client as home.

**For (c) the agent-centred architecture**
- New data:
  - `rooms.settingsOrigin` (§3.4).
  - `savedConfigs` table plus `list_configs` and `update_settings.config` (§3.5).
  - New preset fields `level` and `players` on `SETTINGS_PRESETS` (manifest).
  - Per-user `gamesPlayed`/coach flags (§5.2).
- Changes:
  - `rooms.create` defaults to `presetSettings("grid-first-steps")`.
  - Room creation offers the allowance consent.
  - One atomic "settings + budgets" save, or `update_settings` gains `assistantBudget`/`assistantModel` while
    consent stays human-only.
- Field documentation: `SETTINGS_DOCS` (game-core), `ParamSchema` docs (game-types) and `ROOM_BUDGET_DOCS` (engine) sit beside the function documentation catalogue and are distributed through the manifest and `get_rules`/`get_settings_docs` (§4.6). The catalogue entries for `update_settings` and `approveAiBudget` should point to them rather than duplicate them.
- Coaching templates need phase, first-summon and payoff events client-side. The observation already has them.
  Confirm no model call is needed.
- The owner's assistant on the configuration page needs an `owner` credential. Is one consented assistant
  thread per room shared between the engine UI page and the player client?

**Open questions for the owner**
1. Default AI budget and assistant allowance values: the 300k and 200k used here are placeholders. Should these
   be server-level defaults (env) rather than per room?
2. May owners rename saved configurations (free text), or only use generated titles?
3. Should Int and string get presets of their own (e.g. "Number line"), or stay reachable only on the
   configuration page?
4. Should the invite link be the player-client link (recommended) or the room page?
5. The players hint per preset: author the ranges, or derive them from simulation data in grid-lab?

**Risks**
- **Stepped choices may hide useful values.** Keep "Exact value…" for every number, and drive the step lists
  from `TYPE_DEFAULTS`/presets so the tuned values always appear among them.
- **Retuning on object-type change surprises owners.** Always show which fields moved, with undo.
- **Saved configurations rot** when calibration tables or offered instantiations change. Re-validate on list and
  apply, and never at save time only.
- **Zero-token coaching can drift from the real rules.** Generate its numbers from the observation, never
  hard-coded, and keep the copy beside `HowScoringWorks`, with a test that the templates mention only fields
  present in the observation schema.
