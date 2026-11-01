# Goal annotations: interactive, focus-cell explanations of a utility

Status: design (phase 1), built in phase 2 (§9), report and demos in phase 3 (§10–§12).

The owner's request: every utility rule gets a rich, *interactive* annotation that teaches a kid how the rule works,
driven by hovering a cell of the expanded grid. The old per-cell marks ("supports your score / holds your score back",
quiet good/bad/neutral underlines and the generic sensitivity annotator) are deleted, not extended (§8).

Code: `lib/game-utilities/src/explain/` (the model, the board, one *lens* per family, the example search, verification
against the card) and `lib/object-views/src/explain/` (the shared renderer and its pure layout helpers).

---

## 1. Who it is for

A 12-year-old in their first game sees a board and a secret goal card. The card's sentence says what scores (rules
design, docs/rules-design.md). A sentence is not enough for rules about *structures*: "3 cells in a line whose
numbers are evenly spaced" only clicks when you see three tiles light up, with ✓ and ✗ next to each condition. The
annotation is the worked example the sentence points at: it shows, on a real board, which pieces of the board the rule
looks at, what it checks on each piece, and how many points each piece gives.

## 2. Principles for kids-first teaching annotations

A1. **One anchor, a few pieces.** The focus cell selects the handful of rule pieces (sub-structures) it belongs to;
    only those are drawn. Never paint the whole board's accounting at once. At most 6 pieces per focus; a lens chooses
    which (Set Spotter: only trios that *end* at the focus).

A2. **Point, then explain.** Every highlighted piece on the board has a numbered badge and an arrow to its callout,
    and the callout repeats the piece in miniature (the actual tiles), so the eye can travel both ways.

A3. **Say the check, not the code.** A callout lists the rule's conditions as facts, each with ✓ or ✗, in the card's
    own words, with the actual symbols: "✓ colours all the same (green, green, green)", "✗ numbers not evenly spaced
    (2, 5, 9)". When a piece nearly scores, say what is missing ("one more red would close it").

A4. **Points are always explicit and always add up.** Every piece shows its points (+1, −1, 0, "+4 tie-break"). The
    pieces of the whole board add up to the card's score, and the panel says so ("This board: 5 points"). The model is
    computed from the board, and checked against the card's own program (§6.4), so it cannot disagree with the score.

A5. **Show the alternatives for per-cell rules.** When a rule judges each cell alone (Parity Painter), the best
    explanation is the rule's *outcome table*: every kind of cell the rule distinguishes, drawn as a tile, with its
    points, and the focus cell's row and column ringed.

A6. **Colour is never the only signal.** Scoring pieces are solid green with ✓ and a "+" badge; losing pieces are red,
    dashed, with "−"; pieces that score nothing are grey, dotted, with "0". The tiles keep their own colour pattern or
    letter cue (PR #88). Text works without the drawing (screen readers read the headline and callouts).

A7. **Quiet everything else.** Cells outside the focus pieces are dimmed, not hidden; the board stays readable.

A8. **Examples teach both sides.** The goal card's example board is searched (§6.5) so the default focus shows a piece
    that scores *and* one that doesn't, using only the room's symbols and colours.

## 3. The focus-cell interaction model

- **Focus.** Exactly one cell is the focus. Its pieces are drawn on the board and listed as callouts.
- **Default focus.** In the compact-to-rich hover popover: the top-left cell (the owner's spec), so opening is
  predictable. In the goal card's permanent example: the cell the example search chose as most illuminating (A8).
- **Hover** (mouse/pen) over a cell moves the focus there. The focus stays where it was left when the pointer leaves the
  board (it does not snap back), so a player can read the callouts.
- **Tap** (touch) on a cell moves the focus. Touch never opens a hover state.
- **Keyboard.** The board is one focusable `role="grid"` element; arrow keys move the focus, Home goes to the top-left.
  The headline and callouts sit in an `aria-live="polite"` region, so each move is read out.
- **Layout without clutter.**
  - The board is drawn at detail size with an SVG overlay: pieces as capsules (lines, pairs), rounded blocks (2×2
    windows), outlines (regions, the frame), and a ring around the focus cell.
  - Each piece has a numbered badge at its end nearest the callout column.
  - Callouts sit in a column beside the board (below it when the container is narrower than ~30rem), sorted by the
    vertical position of their piece so arrows rarely cross. Arrows are drawn from the badge to the callout's edge as
    gentle curves in the piece's tone.
  - An outcome table, when the lens has one, is drawn under the callouts with an arrow from the focus cell.
  - A one-line headline above: the focus cell in words ("Row 2, column 3: a green 7") and the board's total.
- **Where it appears.** (1) The goal card (`UtilityCardView`) shows the example board with its annotations
  permanently. (2) The grid popover (hover a compact grid anywhere in the player app) shows the hovered grid annotated
  with the player's *own* goal when the app provides it (§7). Both use the same component, so replays can reuse it.

## 4. The annotation model

```ts
type Cell = { r: number; c: number };
interface Fact { text: string; ok: boolean }                 // a condition the rule checks: ✓ / ✗
interface Spot { cell: Cell; label: string; tone: Tone }      // emphasis inside a piece (a mine, a frame breaker)
type Tone = "gain" | "loss" | "zero";

interface Link { from: Cell; to: Cell; ok: boolean }        // a connector (mirror pair) drawn as an arc

interface Part {                     // one piece of the rule: what the card loops over
  id: string;                        // stable: "trio:1,0:right"
  shape: "cell" | "pair" | "line" | "block" | "region" | "ring" | "window";
  cells: Cell[];                     // in order for lines
  points: number[];                  // one entry per explained ordinal component ([1] or [0, 3])
  title: string;                     // "SET", "not a SET", "3 + 7 = 10"
  facts: Fact[];
  spots?: Spot[];
  links?: Link[];
}

interface Explanation {              // the whole board, independent of focus
  familyId: string; size: number;
  parts: Part[];
  components: string[];              // names of the explained ordinal components: ["points", "tie-break: …"]
  ordinal: Ordinal;                  // the card's own score of this board (evaluated by the card program)
  verified: boolean;                 // Σ part.points[k] === ordinal[k] for every explained component k
}

interface FocusView {                // what the renderer draws for one focus cell
  focus: Cell; headline: string;
  parts: Part[];                     // the selected pieces, ordered
  table?: OutcomeTable;              // per-cell rules: rows × columns of sample tiles with points; `at` = the focus's entry
  note?: string;                     // "This cell is not on the edge: it never changes your score."
}
```

A piece's tone is derived from its points (positive, negative, zero), never stated separately, so it cannot lie.

## 5. Review of every rule family

Ranked by how well the rule fits a focus-cell annotation. **Tier A**: every point comes from small local pieces that
contain the cell; the annotation is complete and obvious. **Tier B**: local pieces, but the score takes a max, a
threshold or a tie-break over them; still very good with one extra line. **Tier C**: the score is a property of long
lines or big regions; a focus cell can select the line or region, but the "why" is spread out (§10 modes help).
**Tier D**: whole-board or process rules where a cell's role is indirect (a global count, a centroid, a flood); the
focus cell alone teaches little and needs another mode (§11). ★ = annotated in phase 2.

### Tier A: local pieces

| Family | Pieces (what the focus selects) | Sketch |
|---|---|---|
| ★ 🎭 Parity Painter | the cell | Outcome table: kind (even, odd) × colour, +1 / −1 / 0, focus entry ringed. |
| ★ 🔺 Set Spotter | trios with an end at the focus (across, down, diagonals when dealt) | Green capsule SET, grey not-a-SET; facts "colours all the same / all different" and "numbers evenly spaced". |
| ★ 🤝 Number Bonds | the pairs (right, down) containing the focus | "3 + 7 = 10 ✓", colour condition when the mode has one. |
| ★ ♟️ Chessmaster | 2×2 blocks containing the focus (points), seams touching it (tie-break) | Block: alternating ✓/✗ per side; seams as thin pairs. |
| ★ 💣 Honest Minesweeper | the focus's 3×3 neighbourhood | Mines spotted inside it; "shows 2, touches 2 mines ✓ → +2". A mine shows the honest cells it is counted by. |
| 🏁 Odds & Evens | 2×2 blocks containing the focus | As Chessmaster, odd/even instead of colours. |
| 🍀 Green Ones, 🧿 Lucky Token | the cell | Outcome table: right colour × right symbol, score and halfway tie-break. |
| 🖍️ Number Painter, 🔢 Colour-by-Number | the cell | Outcome table: symbol class × colour. |
| ⚔️ Conqueror, 🏡 Homebody | the cell | Outcome table (colour × zone for Homebody). |
| 🫰 Snap!, 🤗 Best Friends, 👯 Twin Friends | pairs containing the focus | Pair capsules with the matching condition. |
| 🥙 Number Sandwich, 🪜 Staircase Climber, 🧱 Wallpaper Weaver, 👣 Rainbow Steps | trios / pairs / steps through the focus | As Set Spotter (ends or middle, per rule). |
| 🧵 Quilt Maker | 2×2 blocks containing the focus | Colours used, matching sides ✗. |
| 🐴 Knight Riders | knight-jump pairs from the focus | L-shaped connectors. |
| 🤴 King's Court, 🗳️ Neighbourhood Vote | the 3×3 / plus neighbourhood | Tally bar chart of neighbour colours. |
| 🥪 Othello Sandwich | the two lines through the focus | Bread ✓/✗ on each side. |
| 🎚️ Colour Ladder | pairs containing the focus | "7 > 3 so green should come after blue ✗". |

### Tier B: local pieces combined by max, threshold or tie-break

| Family | Pieces | Sketch |
|---|---|---|
| ★ 🧮 Magic Accountant | the focus's row (or column) | Running sum with "= 14 ✓" or "13, 1 short"; tie-break distance shown on every row. |
| ★ 🏰 Kingdom | the focus's patch; the biggest patch | Region outline; "your patch: 3 cells, biggest: 5 (scores)". |
| 🗺️ Archipelago, ✨ Constellation, ✖️ Times-Table Territory, 🪨 Stepping Stones, 🧩 Fillomino, 🧩 Patchwork | the focus's patch/group | Region outline with size facts. |
| 🏝️ Islander, 🏮 Lantern Lighter, ⛰️ King of the Hill | the cell plus its row/column/neighbours | Rays or neighbour ring with ✓/✗. |
| 🐟 Go Fish Books | 2×2 blocks containing the focus | Book ✓, perfect ✓ (colours used). |
| 🃏 Rummy Melder | trios through the focus | Set or run facts; cells credited once (needs a "counted once" spot). |
| 🦓 Stripe Painter, 🪞 Mirrormancer, 🚩 Flag Bearer, 🧶 Fair Weaver, ⚖️ Seesaw, ⭕ Round Numbers, 🔍 Divisibility Detective | the focus's row/column | Line callout with tallies; Mirrormancer pairs drawn as arcs. |
| 🎱 Bingo Caller | the cell, its row, column, diagonal | Dab ✓ plus line bonus progress "3 of 4". |
| 🃏 Twenty-One, ♣️ Flush Royale, 🏠 Full House | the focus's row and column | Hand total / flush / pairs. |
| 🔴 Connect Four, ⏳ Falling Sand | the column below the focus, lines through it | "stands: every cell below is red ✓". |

### Tier C: long lines, big regions, sequences

| Family | Why harder | Sketch |
|---|---|---|
| 🌈 Rainbow Road, 🌅 Sunset Sky, 🪜 Ladder of Numbers, ⛷️ Uphill, 🎯 Straight Shooter | whole-line verdicts from step chains | Focus row with step arrows ✓/✗; scrubber over rows (§11 M1). |
| 🐍 Snake Charmer, 🐍 Uno Snake, 🧗 Mountain Climb, 🌉 Bridge Builder | longest path: the focus may not be on it | Draw the best path; say whether the focus is on it and why not. |
| 🧱 Tetromino Tamer, 🏰 Border Baron, 🧀 Swiss Cheese | regions of regions (shapes, borders, holes) | Region outline plus shape/size facts. |
| 🔍 Looking-Glass, 🎡 Pinwheel, 🎯 Bullseye, 🌈 Rainbow Bands | symmetry orbits, rings, diagonals | The focus's orbit / ring as connectors. Bullseye stops at the first failing ring: needs a step-through. |
| ➕ Column Addition | carries flow right to left | Step-through narration of the written sum (§11 M3). |
| 🖼️ Picture Frame (★) | all-or-nothing over the edge | Always draws the frame; breakers spotted; inner cells get "never matters". Built as the whole-board example. |

### Tier D: global counts and processes

| Family | Why the focus cell is weak | Better mode |
|---|---|---|
| ↔️ Far Apart | centroids of two colours | What-if preview: move the focus cell's colour and watch both centres move (M2). |
| 🏔️ Lone Peak, 🏹 Robin Hood | the board's maximum / per-colour totals | What-if preview with score deltas; totals bar chart. |
| 🏯 Castle Keeper | flood from the edge | Step-through flood animation (M3). |
| 🔢 Sudoku Scholar | all-or-nothing over every line | Clash finder: focus shows its clashes in row, column, diagonal. |
| 🪟 Magic Window | max over 3×3 windows | Window scrubber. |
| 🏰 Rook's Watch | rows and columns holding a token | Rays from tokens. |
| Defence goals (🚫 🙅 🫧 🏴 🫠 📐 🔁 👥) | penalties are mostly global counts | Same lenses, loss tone; disclosure unchanged (own goal only). |

### Int and string families

The paradigm is a *focus position* (digit or character) instead of a cell. Most are Tier A/B with the same building
blocks: runs (🍬 Glyph Glutton, 🏃 Streaker, 📈 Ascender), pairs from the outside in (🪞 Mirror, Palindromist), prefix or
suffix matches (🦎 Tailwright, 👑 Firstborn, 🔚 Last Word, 🪄 Incantor), totals (🔯 Numerologist, 🧾 Tallykeeper, ⚖️
Scale-keeper). Arithmetic ones (🏺 Power Hoarder, 🎭 Many-Faced, 🔮 Residue Oracle) are Tier D: a factor tree or residue
table, not a position. Out of scope for phase 2 (First Steps is a Grid setup), but the model's `Part.cells` generalises
to positions without change.

## 6. Architecture

### 6.1 Lenses (game-utilities `src/explain/`)

A **lens** is the per-family annotation spec: pure functions of (params, board), written beside the model, using the
same decoded values the card's prelude gives (`cell.value`, colour names) and the phrasebook for words.

```ts
interface Lens<P> {
  familyId: string;
  components(p: P, b: Board): string[];               // names of the ordinal components the parts explain
  parts(p: P, b: Board): Part[];                      // the whole-board decomposition
  select?(parts: Part[], focus: Cell, p: P, b: Board): Part[];  // default: the parts containing the focus
  table?(p: P, b: Board, focus: Cell): OutcomeTable | null;
  note?(p: P, b: Board, focus: Cell): string | null;
}
```

`Board` is the decoded grid with the card-prelude view of each cell (symbol, colour index and name, value, glyph),
neighbourhoods, lines, regions (same order as the prelude's `grid.regions`) and the phrasebook.

### 6.2 Public API

- `lensFor(familyId)`: the lens, or undefined.
- `explain(descriptor, inst, value): Explanation | null`: decode, run the lens, evaluate the card on the same value
  (`evaluator`, the program the engine runs), set `verified`.
- `focusView(descriptor, inst, explanation, cell): FocusView`.
- `goalExample(descriptor, inst): { value, focus, caption }`: the searched example (§6.5).

### 6.3 Renderer (object-views `src/explain/`)

`<GoalBoard>`: the detail-size board (the same tile model as the grid display), the SVG overlay, the callout column,
the outcome table and the headline, with hover/tap/keyboard focus. Layout maths (capsule geometry, badge placement,
callout order, arrow paths) are pure functions in `layout.ts`, unit tested under Node. A React context
(`GoalExplainerProvider`) lets an app say "explain grids with this goal"; the grid popover uses it when present.

### 6.4 Never disagreeing with the score

The lens computes pieces from the board; the card program computes the score. They are tied two ways:
1. **Tests.** For every lens, every param of its support on First Steps (and the other playable Grid shapes where the
   family is applicable), on several hundred seeded random boards plus the exemplar and the example: for each explained
   component k, Σ parts[k] = the card's ordinal[k]. A lens that drifts fails CI.
2. **Runtime.** `explain` evaluates the card too and sets `verified`. An unverified explanation is never drawn as a
   breakdown: the renderer shows the board with "Can't explain this board yet" instead of wrong numbers.

### 6.5 Example boards

`goalExample` searches deterministically (seeded by the instantiation and the params): seeded random boards, mutations
of the family's exemplar, and the lens's own seed boards if any, all in the room's symbols and colours. Each candidate
is scored for *illumination*: it must verify, have at least one scoring and one non-scoring piece, few enough pieces
not to clutter, and a cell whose selection shows both kinds. The best candidate wins; its most illuminating cell is the
default focus. The caption is generated from the explanation ("This board scores 5 points. Point at a cell to see
why."). The card's existing tiny `example` (Go Fish) stays as the server-side fallback for clients without the
renderer.

## 7. Disclosure

A goal card is the player's own utility, so annotating it fully is fine. The explainer is built in the player's own
client from their own descriptor (`player.myUtility`), and the grid popover only explains with that goal. Nothing new
crosses the server boundary; no other god's utility is ever explained. A replay may provide the explainer only for the
viewing player's own goal.

## 8. What was removed

The old system: `game-utilities` `annotations.ts` and `families/annotators.ts` (eight bespoke annotators), object-views
`annotations.ts` and the `annotations` prop of every object renderer (underlines, outlines, legends, badges), the
player-web generic sensitivity annotator (`sdk/annotate.ts`, `use-annotations.ts`) and the objects panel's `annotate`
param (stored layouts that still carry it load without it). Nothing of it is reused: its model (a tone per cell) cannot
say *which piece* a cell belongs to or *why* the piece scores.

## 9. Phase 2 build

Eight families, chosen for diverse piece shapes so the framework is exercised by each kind, all applicable on First
Steps (4×4, base 10, rgb):

| Family | Piece shape | What it exercises |
|---|---|---|
| 🎭 Parity Painter | cell | outcome table |
| 🔺 Set Spotter | trio (line of 3) | custom selection (ends only), facts |
| 🤝 Number Bonds | pair | arithmetic facts, colour modes |
| ♟️ Chessmaster | 2×2 block + seams | tuple score: points and tie-break parts |
| 💣 Honest Minesweeper | 3×3 neighbourhood | spots (mines), reverse selection for mines |
| 🧮 Magic Accountant | row / column | line sums, tuple with a negative tie-break |
| 🏰 Kingdom | region | max over regions |
| 🖼️ Picture Frame | ring (whole edge) | all-or-nothing, notes for cells that never matter |
| 🪞 Mirrormancer | row / column with pair arcs | connectors (`links`), tuple tie-break |

Where to look: the gallery page `artifacts/player-web/annotations.html` (dev server: `pnpm --filter @workspace/player-web
dev`, then `/annotations.html`; `?family=<id>` for one) and its browser check `pnpm --filter @workspace/player-web
e2e:annotations`. In a game, the goal card (`my-card` panel) shows the annotated example, and every grid's hover view
explains the grid with the player's own goal (`MyGoalProvider` in `src/core/app.tsx`).
