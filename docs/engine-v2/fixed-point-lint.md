# Fixed-point wording lint (15 November)

The owner's standing rule is: never build features, prompts or advice that help players reach or hold a fixed point.
It had no test until now; the 14 November failure was advice of exactly that kind. The test is
`artifacts/engine/test/unit/v2-fixed-point-lint.test.ts`.

## What it reads

- Every affordance's id, title and description (`lib/v2-affordances` DIRECTORY). These are also the tool names and
  descriptions of the MCP, the CLI, the command palette and the assistant.
- The agent primer (`lib/v2-agents` AGENT_PRIMER).
- The AI prompts in `lib/v2-ai`:
  - VOCABULARY, FUND, STRATEGY and the pitch prompt;
  - the assistant prompt in each context;
  - the AI seat prompt.
- Every shipped line starter's source and comments, in both languages.
- These app files, as text:
  - `artifacts/player-web/src/panes/tug-of-war.ts`;
  - `artifacts/player-web/src/panes/move-line.ts`;
  - `lib/v2-views/src/story.tsx`;
  - `lib/v2-views/src/climb.tsx`.

## What it flags

Wording that proposes a destination or a hold, for example:
- settle;
- hold it, hold at;
- an agreed state;
- copy this state;
- stay on;
- lock in;
- park the line;
- a fixed point, a destination, a final state, a state to reach;
- toward a state;
- defend.

An allowlist with a reason per entry admits sentences that say the opposite ("never a final state to hold") or mean
something else (an agent holds energy; another object holds a state).

## What it found, and the fixes (this change)

| where | wording | now |
|---|---|---|
| assistant prompt | "finding lines that serve several rules at once and defending them together" | "… and climbing them together, step by step (there is no final state to reach; the climb never ends)" |
| AI seat prompt | "propose … which lines to build and defend together" | "which lines to improve together and the next steps on them (a direction, never a final state to hold)" |
| STRATEGY | "climbs toward a state the others like too"; "toward its own state good for everyone" | "climbs in a direction the others like too"; "in directions good for everyone (a climb with no top, not a state to reach)" |
| pitch prompt | "which lines to defend together" | "in which direction to move them next, step by step … never a final state to reach and keep" |
| `pitch.draft` description | "which states serve both rules and which objects to defend together" | "which objects would score more on both rules and in which direction to move them next" |

## Flagged for the coordinator, not changed

These are mechanisms rather than wording, and are older than the lint:

- **LEAVE.** The starters keep a LEAVE list ("lines you agreed to leave alone"), and STRATEGY's example deal is "Line 9
  is yours: my agent leaves it alone (LEAVE)". That gives one seat a line. tug-of-war.md found that seats settling into
  owning lines is the other failure besides the tug of war.
- **PROTECT and "a tug-of-war is better ended in chat".** These are not holds: a protected line still climbs, and the
  others are only kept as well off. They are noted here because a deal that ends a tug usually leaves the line where it
  is.
