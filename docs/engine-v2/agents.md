# Engine v2: agents (what W3 and W5 build against)

Owner: workstream W2. Code: `lib/v2-agents` (the host and one act), `lib/v2-sandbox` (the sandbox and the guest
libraries). Spec: [spec.md](spec.md) §6.

## One act: `runAct`

```ts
import { runAct, sandboxes } from "@workspace/v2-agents";
const pool = sandboxes("worker");                      // one sandbox per language, started on first use
const { record, state } = await runAct(await pool.get(program.language), {
  type: lineType, variant, state, rule: { family, params },   // the acting agent's player's rule
  program: { language: "python" | "typescript" | "javascript", source },
  seed, energy,                                        // the agent's energy, as budget() reports it
  object, liveObjects,                                 // the offer: log2(liveObjects) read bits
  limits, economy,                                     // optional: sandbox limits; { kappa, beta } (default spec 32, 0.05)
});
```

`record: ActRecord` is plain JSON (store it as the `act` event):

| Field | Meaning |
|---|---|
| `outcome` | `committed`, `skipped` (returned nothing) or `failed` |
| `reason`, `code` | why it failed; `code` is the sandbox's (`COMPILE`, `EXECUTION`, `LIMIT`) when the program itself failed |
| `calls` | the applied moves: `{ mutator, site, args, rep, price }`; `rep` is the view the mutator belongs to (the lens), `price` v2-core's `Price` |
| `changeBits` | W, the sum of the calls' prices (0 unless committed) |
| `readBits`, `offerBits`, `readsByRep` | R (offer included) and its split by view (`offer` for the offer's bits) |
| `charge` | R/κ + (committed ? W + βW² : 0), in energy |
| `before`, `after` | the state, encoded by the object type |
| `transcript`, `steps` | every host request and reply; sandbox steps used |

`state` is the new state (the old one unless committed). A failed or skipped act is still charged its reads. All
prices come from v2-core's `applyCalls` and the object type's `readLength`, so a new price list in `v2-linear` needs no
change here.

The engine host is `EngineHost` (`lib/v2-agents/src/host.ts`); its read accounting is spec §3.1 with one addition: a
view with no coordinates (`tri`) is charged its static elements, or it would be a free full read.

## The helpers agents are written with

Every act's prelude defines these, with the same names and behaviour in both languages
(`lib/v2-sandbox/guest/helpers.{js,py}`; parity test `lib/v2-agents/test/parity.test.ts`). Words for a twelve-year-old:

| Helper | In plain words | Host calls |
|---|---|---|
| `look(offer, view)` | what the line looks like in one view: `look(offer, "si").m` is the gradient | 1, costs a little ⚡ once per act |
| `peek(offer, view, name, args)` | one number of a view: `peek(offer, "seq", "term", {n: 3})` | 1 |
| `goal(offer)` | your rule: `family`, `params`, `card` (its sentence) | 1, free |
| `progress(offer)` | how well the line does on your rule now: `level`, `top`, `main`, `tiebreak` (bigger is better) | 1, costs reading your rule's views |
| `move(mutator, args)` | one change: `move("si.tilt", {k: 1})`, Python `move("si.tilt", k=1)`. A plan is a list of moves | 0 |
| `price(offer, plan)` | the ⚡ the plan would cost, or null/None if it is not allowed; nothing changes | 1; free, except that an act's first price costs a look at the move's view if the agent has not looked yet |
| `cheapest(offer, plans)` | the cheapest allowed plan, as a list of moves (null/None if none): the same change through different views costs different amounts | 1 per plan |
| `energy(offer)` | the ⚡ your agent has | 1, free |
| `prime(n)`, `square(n)` | is n a whole number that is prime / a perfect square (anything else: false) | 0 |
| `near(x, test)` | the whole number nearest x that passes the test: `near(m, prime)`; the test gets a plain whole number; on a tie the smaller | 0 |

An agent is `agent(offer)` returning a plan (a list of moves) or null/None to skip. The lower-level guest API
(`offer.view`, `offer.quote`, `call`, `Q`, `Fraction`) stays available.

## Still to come from W2

Example agents and starters per beginner family with their summon prices; `check(program, sampleState)`; the
harness that compares families; the assistant's primer. This page will list them when they land.
