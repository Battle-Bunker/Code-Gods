# Rules design: clear goal text and declared needs

Status: design (phase 1) and implementation plan (phase 2). Owner report that started it: a 5×5 base-12 grid with three
colours dealt 🐟 Go Fish Books, whose goal card said *"Your fish is the number worth 10 … a perfect book (2 points) if they
are all different colours."* Two failures:

1. **Unresolved reference.** "The number worth 10" never says which symbol to put on the board (it is `A`). The
   assistant only had that sentence, so it answered "I haven't looked at how this game writes that number".
2. **A promise the shape cannot keep.** "All different colours" over four cells needs four colours; the grid had three.
   The program was right (it asks for `PERFECT = min(4, C)` = 3 colours), the sentence was not. The summary and the card
   were written separately and drifted apart, and nothing checked that a sentence fits the shape it is dealt on.

This document sets the principles for rule text, the machinery that renders it for each shape, the declarations that
say what a rule needs from a shape, the one checker that uses them, and the audit of every family.

Code: `lib/game-utilities` (families, catalog, selectors, calibration), `lib/game-types` (components, constraints),
`lib/object-views/src/card.tsx` (the goal card both apps show), `lib/ai-player/src/assistant-prompt.ts` (briefing).

---

## 1. Who reads a goal card

Picture a 12-year-old in their first game. They have never seen this rule before. They see a board of coloured tiles
with symbols on them, and their secret goal card. Nobody explains anything. The card has to tell them, without outside
knowledge:

- **what to look for on the board**, in the exact form it appears there (the glyph on the tile, the colour's name);
- **what scores, and how much**;
- **how the parts combine** (what wins first, what breaks a tie);
- and, where it helps, **one tiny picture** of a scoring pattern.

They do not know that `A` means 10 in base 12, that a Jack is worth 11, or what "spectral order" means. They will not
read a long sentence twice.

## 2. Communication principles

P1. **Name the symbol as the board shows it, with its meaning in brackets.**
   - Digits below 10 are themselves: "the number 7".
   - Digits from 10 up: "the number A (10 in base 12)", "the number F (15 in hex)".
   - A specific card: "the card A♥ (Ace of Hearts)".
   - A rank of any suit: "any Ace (A♠, A♥, A♦ or A♣)".
   - A value class is always resolved to its members: "any card worth 10 points (10, J, Q or K of any suit)".
   - Never write "the number worth X", "cells worth X" or "the card worth X" without resolving it.

P2. **Name colours exactly as the room names them** (the colour set's own names), and only colours the room has.

P3. **Spell out values when a rule adds symbols up.** A sum rule on base 12 or 16 says "A counts 10, B counts 11"; on
   cards it says "A counts 1, J 11, Q 12, K 13" (or the rule's own values, as Twenty-One does).

P4. **Spell out the points.** Every sentence that scores says how many points ("scores 1 point", "2 points"). A tuple
   score (league-table order) says it in words: "First, more books wins. If that's a tie, more fish wins."

P5. **Never promise what the shape cannot give.** A count in the text ("all 4 different colours", "the 4 suits") is the
   count the program uses on this shape. If a rule adapts to a smaller shape, the text says the adapted count
   ("uses all 3 colours").

P6. **Short sentences, one idea each.** Aim at 20 words; never more than 32 (linted). Plain words: "touching" not
   "adjacent", "in rainbow order" not "spectral".

P7. **Show, don't only tell.** A rule whose pattern is small (a 2×2 block, a pair, a line of three) carries a tiny
   example picture on its card, drawn with the real tiles.

P8. **Same words in the summary, the card comment, the assistant briefing.** They are all rendered from one place.

## 3. Rendering descriptions for the instantiation

Descriptions were already functions of the shape (`summary(params, gridSpec)`), but each family formatted symbols its
own way with ad-hoc helpers (`thing`, `rankValue`, `RANK_NAMES`, `suitWord`), so resolution was optional and
inconsistent. The fix is a **phrasebook**, not a string-template DSL: a small typed API every family must use for
anything that names a part of the board.

`src/families/say.ts`: `say(ctx)` returns a phrasebook bound to the instantiation and built from the game-types
component tables (`SYMBOL_COMPONENTS`, `COLOUR_COMPONENTS`): the same glyphs and names the board view uses, so the text
cannot disagree with the tiles.

| Call | base12 | cards |
|---|---|---|
| `symbol(s)` | "the number A (10 in base 12)" | "the card A♥ (Ace of Hearts)" |
| `glyph(s)` | "A (10)" / "7" | "A♥" |
| `rank(r)` (any suit) | same as `symbol` | "any Ace (A♠, A♥, A♦ or A♣)" |
| `value(v)` | "the number A (10 in base 12)" | "any card worth 10 points (10, J, Q or K of any suit)" (when several ranks share it) |
| `values([...])` | "0, 1, B (11) and A (10)" | "9, 10, J, Q and K (any suit)" |
| `valueKey()` | "A counts 10 and B counts 11" | "A counts 1, J 11, Q 12 and K 13" |
| `colour(c)`, `colours([...])` | colour set names | |
| `distinct(k, "colours" \| "suits")` | "all 3 colours", "4 different colours" | |
| `points(n)`, `an(word)`, `list` | | |

Every call checks itself against the shape and throws `RuleTextError` when it cannot be true here: a colour index the
set does not have, a symbol outside the set, `distinct(4, "colours")` on a 3-colour set, a suit on digits. Rendering a
summary is therefore also a check of the summary.

**Card comments.** The kid card's header (`about`) and the constants' notes use the same phrasebook, so the source a
player opens says the same thing as the summary. Most families now derive the summary from the card text (one string).

**Value-class queries.** Where a rule targets a value that several symbols share (cards: Twenty-One's ten-count; any
rule targeting a rank), the phrasebook expands the class into its members. The text never asks the player to compute
membership.

### 3.1 Specific symbol or value class, per family

The owner leans to specific symbols; so does this design, with one principled exception.

- **Digit sets:** every symbol has a distinct value, so a value target *is* a specific symbol. All digit-set targets are
  named as that symbol ("the number A (10 in base 12)").
- **Cards, rank-based ideas keep the rank (any suit):** 🐟 Go Fish Books (a book *is* four of a rank, and a perfect book
  needs four suits, impossible with one specific card), 🫰 Snap, ✨ Constellation, 🤴 King's Court, 🎱 Bingo Caller and the
  🙅 Hated number defence goal. Their text resolves the rank to its four cards: "any 7 (7♠, 7♥, 7♦ or 7♣)".
- **Cards, token ideas use one specific card:** 🧿 Lucky Token and 🏰 Rook's Watch already target `suit × rank`; their text
  now names it fully ("the card A♠ (Ace of Spades)").
- No family is switched from value class to specific symbol, so no semantics (and no calibration table) change for
  this reason. Switching Go Fish to a specific card was considered and rejected: it would remove the perfect book on
  cards.

### 3.2 Examples on the card

`UtilityFamily.example?(params, ctx)` returns a tiny board (a few cells, real glyphs and colours, as a grid wire
string of its own size) and a caption, e.g. Go Fish on base 12, rgb: a 2×2 of `A` tiles in red, green, blue, red, captioned
"A perfect book: four As using all 3 colours. 2 points." The card carries it as `example: { value, size, caption }`;
`UtilityCardView` draws it with the same grid renderer as the board. It is optional, cheap (no search) and validated
by the tests: it must decode in the shape's symbols and colours, and its caption passes the same lint as the summary.
Go Fish Books has one now (the owner's case); any family whose scoring pattern fits in 2×2 or a line of three can add
one the same way.

## 4. Declared needs and the one applicability checker

### 4.1 What existed

game-types has a declarative constraint language (classes such as `Valued`, `Suited`, `Wheel`, `Mixable`, plus
refinements over terms `size`, `colours.count`, `symbols.count`, `suits.count`, `faces.count`, `mixes.count`,
`symbols.base`, `length.max`, …) and one resolver (`resolve`) that the server, both UIs and the AI prompt builder use.
Families declare `requires`, and `available(f, inst)` gates the public catalog (settings UI), the selectors (both
lotteries) and calibration coverage. That part was sound. The gaps:

1. **Needs that live only in the code or the text.** Go Fish's perfect book, Rummy's "three different colours", Set
   Spotter's "all different", Card Windmill's four-suit cycle, Colour-Wheel Harmony's opposite pairs: none declared.
2. **No param-level needs.** A requirement that depends on the dealt params had nowhere to go.
3. **Nothing tied the text to the declarations**, so a sentence could promise four colours on a three-colour shape.
4. Grid families kept their own copies of the colour tables (`COLOUR_NAMES`, `MIXES` in `_util.ts`), so a new colour set
   would crash them instead of being checked.

### 4.2 The design

- **Family needs** stay in the constraint language (`requires`), extended in the grid `Requires` helper with
  `minSuits`, `minFaces` and `evenColours` (beside `minColours`, `minSymbols`, sizes and classes), so every family can
  say what it uses.
- **Param needs**: `needs?(params, ctx): Constraint[]` on `UtilityFamily` for requirements that depend on the draw.
- **Text needs**: the phrasebook's `distinct(k, …)` and friends assert at render time (§3).
- **Adaptation is explicit**: when a rule scales a count to the shape (Go Fish `PERFECT = min(4, C)`, Quilt Maker),
  the count is computed once and used by the program, the comment and the summary.
- **One checker**: `applicable(family, inst, params?)` in `catalog.ts` = object type matches ∧ `resolve(requires ++
  needs(params))`. `available` is `applicable` without params. Dealing (`drawFrom` in both lotteries) checks the drawn
  params too, the public catalog (settings UI and the configure page) uses it, and coverage/offer use it.
- **Grid spec from game-types**: `gridSpec` reads colour names and mixes from `COLOUR_COMPONENTS`, so whatever colour
  sets exist (including ones being added now) are covered and checked, not special-cased.

### 4.3 The exhaustive test

`test/rules.test.ts`, over **every playable instantiation × every family × its support** (support capped by a seeded
sample of 48 plus every canonical param, so Bingo's 1,287 do not dominate):

1. if `applicable(f, inst)`: every param in the support is `applicable` with its needs; summary, card comment, both
   cards and the example render without `RuleTextError`;
2. the rendered text passes the lint: only colours the room has; no unresolved "worth N"; base-12/16 values ≥ 10 named
   by glyph; articles ("an orange"); sentence length ≤ 32 words; no "spectral"/"adjacent";
3. a family whose `requires` are unmet is never dealt (`availableFamilies`) and is listed as locked with a reason;
4. **reachability**: where a family declares `top(params, ctx)` (the best ordinal, in closed form), the exemplar
   scores exactly `top`. Go Fish declares `[2·(N−1)², 4·(N−1)²]`: every 2×2 block a *perfect* book, so on a 3-colour
   shape the bonus is provably reachable. The existing tests keep checking that exemplars beat sampled boards and every
   calibrated level.

## 5. Calibration knock-on

Table keys hash the family's TypeScript card source, comments included. Rewording a card comment would have made every
table stale (and every cloud-computed table recompute) without any change to what the rule scores. That is not an
honest key: it should change exactly when the program changes.

Decision: the key hashes the **program** (`cardProgram(source)`: the card minus comment lines and trailing `//`
notes). Migration, in its own commit before any wording change: for every shipped table, verify the stored key equals
the old derivation for the current code, then rewrite it to the new one (`scripts/rekey-programs.ts`; refuses on any
mismatch). Shipped tables stay fresh (`calibrate --check` passes). Tables computed on demand in Convex are keyed the old
way and are recomputed once, on the first game of each such shape (about 30 s; rooms show "preparing").

Semantics: no family's program changes in this work (§3.1, §6), so no table is regenerated. Any later semantic fix
changes the program, hence the key, and `calibrate --check` (CI) forces regeneration.

## 6. Audit

Every family was rendered on base10/base12/base16/cards × rgb/rgby/rainbow6. Findings and fixes (Grid; Int and string
summaries passed P1–P5 and only get P6 tightening).

**Unresolved symbols (P1).** 🐟 go_fish_books ("the number worth 10", "the card worth 1 (any suit)"); ✨ constellation and
🤴 kings_court ("cells worth N"); 🧿 lucky_token, 🏰 rooks_watch ("A♠" without its name); 🔢 colour_by_number and 🖍️
number_painter (lists "10, 11, 13" where the board shows A, B, D, or "red=11" where it shows J); 🎱 bingo_caller (fine on
cards, numbers ≥ 10 unnamed on base 12/16); 🙅 hate_value ("−1 for each 15"); 🍀 seed3_green_ones. Fix: phrasebook.

**Values not explained (P3).** Sum and size rules on base 12/16 and cards: magic_accountant, number_bonds, twenty_one (base
12/16), seesaw, treasure_map, lone_peak, line_painter, patchwork, honest_minesweeper, king_of_the_hill, rummy_melder,
flush_royale, fillomino, number_sandwich, magic_window, times_table_territory, robin_hood. Fix: `valueKey()` sentence.

**Promises the shape can't keep (P5).** go_fish_books "all different colours" on rgb (program: 3). warm_hearts on rgb
calls green "warm". Fix: text from the program's own counts; warm_hearts names the colour teams instead of "warm/cool".

**Undeclared needs (§4).** go_fish (adapted count, now explicit), rummy_melder, set_spotter, quilt_maker and sunset_sky
(3 different colours: `minColours 3`), card_windmill (`minSuits 4`), court_parade (`minFaces 3`), colour_wheel_harmony
(`evenColours`), and the grid colour tables (§4.2). Every colour set today has at least 3 colours, so these lock
nothing now; they keep a future 2-colour set honest.

**Grammar.** best_friends, twin_friends: "a orange". Fix: `an()`.

**Scoring words (P4).** Most summaries say "scores a point" but tuples rarely say how ties break (go_fish, ladder,
young_tableau, colour_carousel, mountain_climb, sudoku_scholar). Fix: "First … If that's a tie, …".

## 7. Assistant

The briefing carried only the summary, so the assistant could not resolve anything the summary left open. Now:

- the summary itself is resolved (§3), so "Explain my goal simply" has the facts;
- the briefing gains a **board key** line from the instance (size, symbols with values, e.g. "symbols 0–9, A (10),
  B (11)", the colours), so follow-up questions about symbols are answerable without a tool call;
- the system prompt says: explain the goal with the exact symbols and colours it names and a tiny example; the board
  key is in the briefing; never say you have not looked;
- the writing-agents skill already carries the card source.

Disclosure: the goal text is the player's own utility, which they may see in full (product rule). Only their own card
enters their briefing; nothing about other gods changes.

## 8. Plan (PRs into develop)

1. **Design** (this document).
2. **Keys hash the program**: `cardProgram`, rekey script and migration of shipped tables.
3. **Needs and the checker**: phrasebook, `applicable` and param `needs`, grid spec from game-types, declarations,
   `top`, the exhaustive test; every family's text rewritten through the phrasebook (the bulk).
4. **Cards and assistant**: `example` on cards (both apps through `UtilityCardView`, protocol field), board key in the
   briefing and the prompt rule.
