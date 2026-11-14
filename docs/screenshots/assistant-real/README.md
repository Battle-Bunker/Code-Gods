# The embedded assistant with real model calls (2026-11-14)

What a player meets when the in-game assistant calls a real model, on a local engine. An admin played, in an
admin-owned room against practice partners. There were three lines games and one grid game, driven by
`artifacts/player-web/e2e/assistant-real.ts`.

Most turns ran on Claude Haiku 5.5, through a local, uncommitted `AI_MODEL` override. The deployment's default model,
Claude Opus 5.5, ran the two money steps (summon now, and a second summon paid for from your power).

Total spend: 56 model calls, 1.27 M tokens, **USD 0.65**: Haiku 0.035, Opus 0.61.

| Step | Lines | Grids | Latency | Verdict |
|---|---|---|---|---|
| "What does my rule want?" | correct, plain, with an example | correct, plain | 3–4 s | worked |
| Write an agent from an instruction and summon it ("summon it", even "now … without asking me") | Haiku checks the code, then asks "Should I summon it?" | the same, saying "I haven't summoned it yet because … you asked me to go ahead without checking" | 8–10 s | confusing (Haiku) |
| …the same on Opus | summoned at 70%, no question | — | 42 s | worked; the reply is long |
| A "yes, summon it" | summoned at 70% and took the cost from the store | — | 10 s | worked |
| A second agent: pull power back to pay, then re-share (FUND) | Haiku cut the first agent to 20%, then promised "once the store reaches it I'll summon" (a turn cannot wait) | — | 14 s | failed (Haiku) |
| …the same on Opus | the store paid, so no pull-back was needed; it summoned and re-split 50/50, but gave away all the power (own store 0 ⚡, "keep none") | — | 31 s | worked, with a trap |
| Honour a chat deal ("leave line/grid 3 alone", smallest edit) | — (the allowance had run out) | `LEAVE = [3]` added; it was unsure the numbers match and asked before summoning | 8 s | worked; numbering unsure |
| Arrange the dock and open a pane | the arrangement put another tab over the assistant's own conversation | done; it arranged the live screen during planning, which can't be seen yet | 6 s | worked; the conversation was hidden (fixed, below) |
| Stop mid-run | "Stopped.", with no reply | — | — | worked |
| Autopilot for 30 s | in planning: nothing; while running: one turn that **carried out the request I had stopped** (three agents, the best summoned at 70%) | in planning: nothing | 30 s | confusing |
| The per-game allowance | 87% used after four requests, then "It ran out of this game's allowance" | 12% after one | — | too small |

## Findings and who owns them

- **The app: fixed** in `lib/v2-affordances` layout.ts (branch claude/v2-assistant-front). Two cases hid the
  assistant's conversation behind another tab. First, it was opened from a pane's menu, which joined it behind the tab
  there. Second, its own "Arrange the dock" did the same (01). An opened assistant now comes to the front. An arrangement
  made by a delegated caller keeps the assistant in front if it was. The human's own arrangement is left as they made
  it.
- **The server (allowance):** a game's assistant allowance lasts about four requests. Each model call is about 20 k
  tokens, and the cached prompt counts in full (02). Autopilot then runs out within seconds.
- **The server (autopilot after Stop):** autopilot's first turn carried out the request the player had just stopped
  (03, 04).
- **Agents and the prompt:**
  - Haiku asks before summoning even when told not to.
  - Haiku promises a later action in a turn that ends.
  - Opus gives away all the player's power, so the next summon or edit cannot be paid without a pull-back (05).
  - The check tool says "sample lines" in a grid game (06).
  - Replies on Opus are long, in paragraphs, where one line was asked for.
- **Agents (energy):** "Closest first has run its ⚡ down to about −14.64" (05): an agent's energy went negative.

## Screenshots (each looked at)

- `01-lines-dock-hides-assistant.png`: after "Arrange the dock", the assistant is a background tab.
- `02-lines-allowance-87pc.png`: 87% of the allowance used after four requests.
- `03-lines-stop.png`: Stop pressed at 1.6 s: "Stopped.", with no agent summoned.
- `04-lines-autopilot-after-stop.png`: autopilot then summons the agent from the stopped request.
- `05-lines-opus-second-summon.png`: Opus: two agents at 50/50, with the player's own store at 0 ⚡.
- `06-grids-deal-and-dock.png`: grids: the deal as `LEAVE = [3]`, "sample lines", and the dock arranged during
  planning.
