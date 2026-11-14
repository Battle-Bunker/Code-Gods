# Sharing rules: a proposal for the owner to decide

**Status: proposal. Nothing here is in the game.** The storyboards are running pages that use the real faces, rules and
calibrated value functions: `artifacts/player-web/sharing-rules.html?frame=show|received|suits|propose|sentence`.
`pnpm --filter @workspace/player-web run e2e:sharing-rules` captures them into `docs/screenshots/sharing-rules/` at
1440 and 390 px.

## Why this comes up now

- **Players can't say why another player wants a line.** In the grids persona walk (14 November), Carol answered
  three of the four questions with confidence. The fourth, "why might another player want the same grid?", she could
  only guess: "it's tagged TUG-OF-WAR … nothing tells me what their rule wants."
- **Negotiation needs that answer.** The agents session's coordination result (rule-compatibility.md) is that the
  table gains most, 3 to 18 times on conflicted tables, when contested lines are *settled at a state both sides like
  and held*. Finding that state needs each side to know what the other's rule wants.
- **Today that happens only in free text.** A rule is secret, the screen shows only the *sum* of the others' bits, and
  players can describe their rules in chat. This is a disclosure question, so the decision is the owner's.

## The choice

| | A. Show my card (recommended) | B. Words only, with help | C. Nothing new |
|---|---|---|---|
| What a player can do | Show their real rule card to chosen players or the table, from the goal card or from chat | A "my rule in one sentence" button pastes the card's sentence into the chat box, to edit or send | Type what they like in chat |
| What the receiver gets | The card itself, and on any line or board: "for Bo: 9.20 bits", Bo's ● / ◆ chain drawn on it, and "what suits us both" | Words they can't check | Words they can't check |
| Can it be a lie | No: a shown card is the real one | Yes: the button pastes the truth, but the player can edit it or say anything | Yes |
| Settle-and-hold | One tap: "propose: settle line 4 at y = … and hold", then TARGET/SETTLE filled on acceptance | By hand: the player works out the state and types TARGET/SETTLE | By hand |
| Build cost | Medium: a shared-cards document per game, the per-player value of a shown rule on each object, the helper and the proposal message | Small: a button and a chat template | None |

**Recommendation: A, irrevocable for the game, sharing chosen per player, with B's button as well.** B's button pastes
exactly the card's sentence, so it discloses the same thing as A, minus the proof and the arithmetic. If B is
acceptable, A adds no new secret. It adds only that the disclosure can be trusted and used: "for Bo: 9.20 bits", what
suits us both, and a one-tap proposal. The owner might still prefer B if they want bluffing to stay possible even after
a player chooses to share.

## 1. Show my card to …

Storyboards: `show-1440.jpg`, `show-390.jpg`.

- **Where:** the goal card has "Show my rule card to…", with the players listed and "Everyone at the table". Chat has
  the same action next to a player's name.
- **Revocable or not: not, for the rest of the game.** Once read, a card can't be unread. A "hide again" button would
  only pretend otherwise and would invite bad faith ("I took it back").
- **What the receiver sees** (`received-1440.jpg`, `received-390.jpg`):
  - the card's sentence and both parts, with the card's own worked example;
  - on every line or board they look at, the sharer's bits ("for Bo: 1.18 bits");
  - the sharer's ● / ◆ chain drawn in the sharer's colours on that object, through the same contributor components.

## 2. What suits us both

Storyboards: `suits-1440.jpg`, `suits-390.jpg`, `suits-390-dark.jpg`, `propose-1440.jpg`, `propose-390.jpg`.

- **When it appears:** once two players have each shown the other their card, a contested object offers "What suits
  you both".
- **What it computes:** the state nearby whose *product* of the two players' bits is largest, from the two shared rules
  only. The storyboard finds it by searching nearby lines with the real value functions. On line 4 (y = 3x + 8) it
  finds y = −x + 47: from 2.94 × 1.18 = 3.46 to 27.37 × 26.40 = 722.54, for 52.88 ⚡ to get there (a tilt then a shift
  at the engine's prices).
- **How it's shown:** a ghost of that state where the view can draw it, with the price to get there.
- **The proposal:** a one-tap chat message, "Proposal: settle line 4 at y = −x + 47 and both hold it". On acceptance,
  both players' agents get `TARGET = { m: -1, c: 47 }; SETTLE = [4]`, the starters' settle-and-hold settings. The
  agent then notes "Holding line 4 at y = −x + 47 as agreed".
- **Grids:** the same, with a board's sixteen-digit TARGET (#538).

## 3. What stays secret, lying, AI seats

- **Secret:**
  - a card that hasn't been shown;
  - the per-player bits of anyone who hasn't shown their card. The screen keeps today's *sum* of the others' bits;
  - agents' code and energy.
- **Lying:** a player can still describe their rule falsely in free text, but a shown card is always the real one.
  This asymmetry is intended. Words stay a bluffing channel; the card is a proof. Without it, "what suits us both"
  could be gamed by a fake card.
- **Practice partners and AI seats:** they don't negotiate today.
  - Practice partners never show a card.
  - The coordination result suggests a later option: an AI seat could *accept* a "what suits us both" proposal when
    the proposed state raises its own bits.
  - Until the agents session builds that, the helper is offered only between humans.

## 4. The cheaper alternative (B)

Storyboards: `sentence-1440.jpg`, `sentence-390.jpg`.

- **What it is:** the chat box gets "My rule in one sentence" and "What I want on this line". These paste the card's
  sentence, or the main part's chain on the line, into the box; the player edits and sends.
- **Is it the same disclosure?** In content, yes: the sentence *is* the card. It differs in trust (it can be edited and
  can't be checked) and in use (no per-player bits, no helper, no one-tap settle).

## Persona test (before choosing, about 30 minutes)

Two non-coder personas sit at one table (agents in real browsers, as in the 14 November walks), with conflicting
rules and a contested line. Each version of the page is played once:
- **B:** the button only.
- **A:** cards and the helper.

Measures:
- **Q4:** can each persona say why the other wants the line?
- **A deal:** do they agree a state?
- **The hold:** does it hold, and for how long?
- **Points:** does the table's total beat the no-talk baseline?
- **Did anyone feel cheated:** for example, a lie in B, or a card shown by mistake in A?

A ships if it reaches agreement where B doesn't, or reaches it faster, without the "cheated" answers.

## Shipped instead, playtest round 8: the others' total at candidates

The coordinator allowed something narrower than a shown card: a player may see the others' **total** bits on an object
before and after a candidate move, never one player's rule.
- **The candidates.** Each candidate in "What would make it rarer" shows your bits × others' total = points, ordered
  "Best for points" or "Best for my rarity". A candidate that raises both is marked "↑ both of you".
- **The read.** `v2/play:othersAt` takes the candidates' calls (at most four) and applies them to the object's live state
  on the server. A player can ask only about states one move from where the object is, never any state.
- **One tap from a candidate:**
  - "Propose this in chat" writes a plain proposal into the chat box ("Shall we settle line 8 at y = 2x + 7 and both
    hold it? There I get … bits and the rest of you … bits together."). A board is written in four rows, and the chat
    draws it as a board.
  - "Hold it here" fills in the agent's hold control with that candidate.
- **The end summary.** "Deals held" names each held object, who held it, and your points before the hold and at the end.
- **Tests.** `e2e:candidates`; screenshots are in `docs/screenshots/candidates/`.

The proposal above (cards, "what suits us both") is still the owner's to decide.
