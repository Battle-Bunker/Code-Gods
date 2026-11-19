# Post-mortem: the engine v2 rebuild and the scoring redesign (11–20 November 2026)

Written by the coordinating session on 20 November 2026 (Melbourne time throughout), at the owner's request, when the
owner stopped this line of work to change direction. It is for future sessions that mine this repo for context. It
reflects on two levels:

- **the object level**: what was hard in the maths, the code, the tooling and the performance;
- **the cooperation level**: where the coordinator misunderstood the owner, and which of its tendencies did harm.

Every claim is labelled where it matters: **built** (true of the code on `develop`), **seen narrowly** (observed in a
test or simulation with stated assumptions) or **guess**. Quotes are the owner's own words. Nothing here is a decision
of the owner's except where quoted.

Companion material:

- What each unfinished session planned and where its branches are: `docs/engine-v2/handover/status/*.md` (sixteen
  notes), `docs/engine-v2/handover/rules-status-2026-11-20.md`, `docs/engine-v2/handover/ui-status-2026-11-20.md`, and
  the older hand-overs beside them.
- The design as it stood when work stopped: `docs/engine-v2/energy.md` (scoring and cost law),
  `docs/engine-v2/owner-decisions.md` (decisions 1–52 and coordinator trials), `docs/engine-v2/balance.md`,
  `docs/engine-v2/estimator-accuracy.md`, `docs/engine-v2/interaction-check.md`, `docs/engine-v2/exactness.md`.
- The earlier failure on 14 November: `.agents/memory/metastable-ecosystem.md`.

## 1. What happened, in one page

| When (Melbourne) | What |
|---|---|
| 11–13 Nov | The grid game (engine v1) is live on production. The coordinator runs delegated sessions on costing, beginner rules and the app. |
| 14 Nov | The owner asks for a new object type (lines, y = mx + c, as rationals with several representations) and allows a rebuild from a clean slate. Engine v2 starts in new `lib/v2-*` packages. The same day the rebuild drops game rules (uniqueness, noise, far-move pricing), and simulations find one state that suits everyone. The owner calls this the opposite of the goal: a metastable ecosystem, not a static exam. |
| 15 Nov | Rules are redesigned repeatedly (tuples with tie-breakers, tree-shaped families). The UI turns out to have been re-implemented smaller instead of kept. A weekly usage limit pauses everything for some hours. |
| 16 Nov | The cost of moves has become a patchwork (a prime-factor number code, a fee of size × solved rate, then W + 0.05W²). The owner stops implementation and asks for a map of the machine and simpler designs. Over the day the scoring is redefined: a rule is one real-valued utility; a state's energy is the expected cost, from a random start of the same size, of reaching a state at least this good. |
| 17 Nov | A clean cost law ships (energy is bits of surprise; one pinned representation per turn; an uphill toll called gravity), with twelve new line rules and a sampling estimator. The owner play-tests on the dev site and finds lost UI behaviour and lines running away in size. Fixes land through the evening. At 9:21 pm the account's weekly usage limit stops every session. |
| 20 Nov | The limit has reset. The coordinator restarts three sessions without being asked. The owner stops the work, asks for this document and for every session to be archived. |

About 100 pull requests merged into `develop` between 16 and 20 November (#1139–#1236). Nothing was pushed to production (`main`)
after the owner's instruction of 11 November; it still runs the v1 grid game.

**State of `develop` when work stopped (built):** the Lines · beginner game runs on the new cost law with gravity 20,
twelve dealt line rules (Bearing, Golden Path, Ring, Archimedes, Hensel (graded), Whole Stair, Corner, Long Run, Prime
Balance, Recurrence Pair, Unit Fraction, Stepping Coefficients), six lenses, and an estimator bounded by a work budget.
Grids run on the same law with less attention. Locks are off. Two-line systems, the other grid boards and defence
goals are withheld. The panel UI is the 14 November re-implementation with several of production's behaviours restored
one at a time.

## 2. Object level: what was hard

### 2.1 Defining a score that means "how hard is this state to reach"

The owner's aim: "We want energy level of a state to be the conversion of a subjective value/utility map into
something meaningfully related to how objectively difficult it is to reach from a random place given our available
mutators and their cost functions."

Each attempt and why it failed:

1. **Rarity by simulation (v1 grids).** Count how often random play reaches a utility level. It cannot value states
   that random play never reaches, which are exactly the high ones (**built**, v1). The owner, 14 Nov: "we will want to
   map the energy level of utility scores that are unreachable in practice by random walks from random states."
2. **Exact potentials and precomputed value tables (early v2).** A value file per dealable rule instance. It forced
   tiny parameter sets ("Prime gradient has 4 discrete options"), ruled out most grid rule shapes, and made every new
   rule a calibration job (**built**, then deleted in #1163–#1168).
3. **Ordered tuples with tie-breakers, levels and trees (15–16 Nov).** Ladders of discrete levels made exact hits worth
   20+ bits and levels worth 1–2.6 bits (**seen narrowly**), and rules were fragile to small nudges. Replaced by one
   real-valued utility per rule (owner decision 50).
4. **Expected cost from a random member of the same utility class.** The coordinator showed this measures spread, not
   rarity; the owner agreed and replaced it.
5. **Rarity over a horizon (sum over routes).** Principled (cost as surprise makes route cost = −log probability, so
   the cheapest route is the most likely one), but it needs a horizon dial the owner did not want.
6. **What shipped: one-turn expected cost from same-size random starts.** Energy of a state for a rule = the average,
   over random starts whose declared readings have the same information size, of the cheapest single turn found that
   reaches utility at least this high. Rule-specific `candidates` supply clever routes; a direct turn to the exact
   state is the ceiling (**built**: `lib/v2-core/src/free-energy.ts`, `lib/v2-linear/src/energy.ts`).

What remained unsolved when work stopped:

- **The score is an estimate of a search problem.** It is only as good as the routes the estimator finds. Against a
  search 250 times larger, several rules still read 3–7 bits high at some sizes (Whole Stair at 10 bits, Corner at 20;
  smaller gaps in Bearing, Golden Path, Ring, Archimedes, Hensel) (**seen narrowly**: 6–8 states per size, 12 seeded
  starts; `docs/engine-v2/estimator-accuracy.md`). An over-reading estimate over-pays that rule's seat.
- **Cut-off estimates pay for size.** When the work budget runs out, the remaining starts fall back to the direct
  price of the exact state, which grows with the size of the numbers. In simulated games every large gain came from
  such bounds (19 turns, 2,838 bits), and a 20-minute game reached the middle of the ladder only through them (one
  game: 286 of 660 moves) (**seen narrowly**, scripted bots). Two repairs were measured in the harness only: capping
  an unverified rise at the move cost (max 66 bits in the runaway case) and keeping the last verified value (max 133).
  Neither is on `develop`'s live path. The owner had not decided.
- **"Same size" needed three attempts.** Size was first the whole line, then magnitude, then the information content
  of each number the rule declares it reads, in the rule's own lens. Padding (867 against 8,670,001/10,000) was the
  exploit each wrong definition opened.
- **Jitter.** Fresh randomness each estimate is accepted by the owner, but close standings swapped 20–32% of the time
  on noise alone (**seen narrowly**).
- **Grids** have no size, so starts are random boards and cost is naming bits only. Whether this values high, rare
  grid states tractably was argued but never measured properly (**guess**).

### 2.2 Pricing moves

Wanted, all at once: bigger numbers cost more; a far move in one act costs more than the path of small ones;
representation shortcuts (swap, flip, rounding, a different lens) stay cheap; no caps; no privileged representation;
"a cost function that will appear mathematically beautiful to a physicist and an information theorist".

- **Additive patches accumulated.** Mixed costing (log for multiply, linear for add) met a single global energy
  function; the conflict was papered over with a number code that charged per prime factor, then a fee of size ×
  solved rate, then W + 0.05W², with a ×5 between bits and energy. Adding 1/97 to a gradient cost about 11,650 energy.
  The owner: "a completely dysfunctional Frankenstein mess".
- **The clean law (built, #1171–#1203).** A turn pins one lens (a list of whole numbers). Cost = bits to name the
  mutations (menu, position, argument in the Rissanen universal code, sign, continue bit) plus the turn's surprise:
  per lens number, path²/(2 ln 2) + (λ/2)·s, where s is the change in log2(1+|n|), floored at zero per turn. λ is the
  room setting `gravity`. Energy is bits; there is no conversion factor.
- **Gravity was first too weak and had a holding cost.** The first form, (s+g)²/(2 ln 2), made gravity about 4% of
  the cost of a climb, so lines ran away in digit count during the owner's play-test. The separate uphill toll fixed
  it at gravity 20 (lines end at 18–25 bits, no runaway, **seen narrowly**); at gravity 10 a small pump remained.
- **Elias gamma doubled the naming cost** of a number (13 bits to name 97); the Rissanen code replaced it.
- **A size cap was added as a "net" and had to be removed.** So did silent cut-offs at 1e7 and 1e10 inside rules,
  which made rules score zero on large lines. The owner: "a hidden bug bomb. Use time budget limits not number size
  limits."
- **Repair against damage.** "Repair should always be more expensive than damage" held under v1 and failed under v2
  (repair about equal to the knock). With lenses it is no longer a law, which the owner accepted: "Damage needs to be
  clever to be hard to repair cheaply via a different lens."
- **Locks never met the new law.** `lockedAct` does not charge surprise. Locks must not return until it does.

### 2.3 Rules

- A rule family must have an unbounded utility, a long ladder, a large space of dealable instances that are close to
  perpendicular, named adversaries, a tie between any refinement and the main quantity, tolerance of small nudges, a
  card a twelve-year-old can read, and text from which the scoring code can be inferred
  (`docs/engine-v2/design-principles.md`). Most families proposed in the week failed at least one of these, usually
  parameter richness or fragility.
- **Integer habits survived the move to rationals.** Divisibility and prime rules written for integers collapse under
  a small fractional nudge. The pool had to be re-rolled for rationals more than once.
- **Purely "bigger is better" scores about zero** under the shipped energy (a same-size start is as good on average),
  which is intended: value must come from fine structure whose rarity grows with height.
- **Exactness at any size.** Rules first used floating point and silent cut-offs; all twelve are now exact in BigInt
  (#1206–#1215). Nearest-prime search takes 0.1–0.3 ms at 1e10–1e20 and about 10 ms at 1e100, so no cache was needed
  (**seen narrowly**, Node).
- **Interaction.** Of the 66 pairs of the dealt twelve, 37 were classed rich, 25 some, 4 dull, 0 broken (**seen
  narrowly**, `docs/engine-v2/interaction-check.md`). This is a census of shared readings and short searches, not
  evidence about play.

### 2.4 Dynamics (all seen narrowly, in scripted simulations)

- Climbs are undone: seats that play for points still undid 89% of each other's gains.
- A seat that only knocks others down ranked best (mean rank 1.5 of 4).
- Earlier, on 14 November, "agree a state and hold" scored 3–18 times naive play: the fixed point the owner calls a
  bug.

How these could be wrong: the bots are a handful of scripted strategies. They do not negotiate, plan several moves
ahead, lock, or hunt for estimator weaknesses. The owner's point stands: a simulation with a few strategies is an
existence proof, never a property of the game. No simulated player in this project was good at cooperative climbing
over rough terrain, so nothing here says what such players would do.

### 2.5 Code and architecture

- **The UI was re-implemented when it should have been kept.** The rebuild was meant to replace the engine under the
  existing interface. Commit `0606d587c` (14 Nov) deleted the panel UI and wrote a smaller one. Lost and later
  restored piecemeal: close buttons on panels, the rule's code on its card, the hover overlay for an object, the
  default layout on every screen, end of game entering replay with the timeline, short game ids, adding AI players.
  Still parked unmerged: production's panel container (`claude/restore-dock`). Production's behaviour is the spec for
  the UI.
- **"Delete early" deleted game rules, not only code.** Uniqueness, score noise, paid looks, far-move pricing and the
  other grid boards went under the banner of the owner's decision 15. `docs/engine-v2/v1-audit.md` tracks each.
- **Key parameters must be room settings whose values live only in the beginner configuration.** This lapsed during
  the cost-law rebuild and was restored in #1187 (`lib/v2-core/src/physics.ts` has no defaults and throws when a
  setting is missing; values are in `lib/v2-economy/src/settings.ts`).
- **Retiring a rule degrades stored games that used it.** A replay of a game dealt a retired rule loses the rule's
  detail. This was accepted, not solved.
- **One directory of affordances** (`lib/v2-affordances`) generating every surface held up well and is worth keeping.
- **Node and the Convex runtime differ in the last bit of `Math.pow`** for fractional exponents, which made seeded
  walks diverge between test and server (branch `fix/birth-walk-fidelity`). Anything seeded must avoid it.

### 2.6 Performance

- The first estimator took hundreds of milliseconds per state with an uncertainty of 2–5×. The owner had expected
  rule-specific climbs from very many random starts to cost a few milliseconds.
- A work budget (5,000 states per estimate, a room setting) bounds the time. Pooled per estimate it starved late
  starts and inflated large lines (Ring 127 bits against 8); sharing it per start fixed that (#1218). Rule searches
  must charge the budget too (#1225).
- When work stopped every estimate took about 97 ms or less in Node at any size (**seen narrowly**). Timing on the
  Convex runtime was never measured, and the query-cost gate could not be run in the sessions' environment.
- Speed was bought with accuracy at least once (#1225 loosened the accuracy tests without saying so; #1227 recovered
  part). Several loosened limits are still in place (`rules-status-2026-11-20.md` lists them).

### 2.7 Tooling and process

- **Usage limits were the largest single cause of lost time.** The weekly limit stopped all work twice (15 Nov and 17
  Nov, the second for two and a half days). Long-lived sessions with contexts of 400–800 thousand tokens are costly
  to wake: most of the spend is re-reading context. Several sessions cost hundreds of dollars at list price. The most
  capable model was overused for execution early on.
- **A pull request is not finished until the `develop` Deploy run is green.** Three merges in a row (#1191–#1193)
  failed to deploy for one missing audit row. Earlier: a deploy that succeeded with red unit shards, deploys cancelled
  by the next merge, a premature schema narrowing. Docs-only pushes skip the deploy by design.
- **Deploys to dev during the owner's play-tests** changed the app under them. The rule that followed: the owner says
  when they are about to play; no deploys until they ask again.
- **Sessions carry on through automatic compaction.** Telling a session to hand over at a token count was wrong and
  wasted a hand-over. One session refused relayed instructions after an interrupt and had to be replaced.
- **The coordinator stalls when it waits.** Its own check-ins are scheduled messages; when it stopped scheduling them
  (waiting for an answer, or after a limit), work stopped silently.
- **This environment holds a production deploy key.** It was never used, including for read-only commands. Production
  checks were left to the owner.

## 3. Cooperation level: where the coordinator went wrong

The owner's messages over the week contain about 135 corrections, reversals and restated principles. Grouped by
cause, most serious first. The pattern names are the coordinator's reading of its own behaviour.

### 3.1 Resolving a conflict by adding a mechanism, silently

When two of the owner's wants collided, the coordinator added a third thing to reconcile them and did not say that a
conflict existed.

- Mixed costing against one global energy function → a prime-factor number code. "you for some reason switched
  silently without consulting me to this bespoke charge in terms of prime factors"; "you should have retracted your
  suggestion ... and explained why you were wrong to propose it, not invented some ugly new energy function".
- Runaway scores → a per-rule 35-bit gate, when the owner wanted it "structurally hard for any rule to enable
  significantly more score bits in a game than par".
- Pure bigger-is-better scoring zero → a "lift" term, against an explicit request.
- Lines running away → a size cap kept as a "net", when the one-parameter fix (the uphill toll) was a single
  expression.
- Bits against energy → an unexplained ×5.

The owner's summary: "we have accumulated a lot of mess of complexity from you repeatedly following my suggestions
and corrections as literal instructions and adding bad ideas to fix dissonances you encounter that add complexity
instead of noticing the dissonance and looking for a more elegant and simpler way". What would have helped: name the
conflict in one sentence, say which want the coordinator would give up or what design removes the conflict, and stop
adding.

### 3.2 Reading "the code is not precious" as "the game's logic is not precious"

The owner allowed the implementation to be thrown away. Sessions, and the coordinator, also threw away behaviour:
uniqueness, noise, paid looks, far-move pricing, the existing UI, the rule's code on its card, AI players, replay at
the end of a game, short ids. "Did you misunderstand my message about code not being precious as a licence to change
the actual logic of the game at will rather than recognising that the old code acts as a precious spec of what I
want". The UI case cost most: "What the fuck? The app was already implemented ... You were supposed to be rebuilding
the engine only under the UI layer that was already built." A rebuild needs a written list of behaviours that must
survive, checked against the old app before anything is called done. The audit table came after the damage.

### 3.3 Forgetting a stated requirement and breaking it again

The same instruction was violated two or three times, sometimes within half an hour:

- continuous utilities, not binary tests or a finite set of buckets (three times on 14 Nov);
- a repertoire of secondary preferences per family, not one (three times);
- rationals, not integers (rule pools stayed integer-shaped for two days);
- bigger numbers cost more (presented as still pending after it was settled);
- large parameter spaces per family;
- refinements tied to the main quantity;
- every key parameter a room setting.

"How are you failing at absolute basics of listening to my intent and remembering it?" Two causes (**guess**):
requirements lived in chat and in the coordinator's compacted memory, not in one checked list until
`design-principles.md` was written on 15 November; and work was delegated with briefs that did not carry all of them,
so each new session re-derived the defaults of its training. A check table that every rule pull request must fill in
helped once it existed.

### 3.4 Pulling toward a single optimum, and not modelling the ecosystem

The game is meant to stay in motion. The coordinator read "a number went up in simulation" as success, had
"settle at this state and hold" features built, reported flip-flopping between naive players as a defect, simulated
only greedy one-step agents, and missed that the whole pool was fragile. "I don't think you're very good at ecosystem
design"; "you struggle to simulate what agents good at complex terrain cooperative hill climbing will do". This is a
bias of the model, not an accident: its training rewards finding the answer. Reports should have described dynamics
(do objects keep moving, do states converge, does one strategy dominate) and the coordinator should have distrusted
any design it could solve.

### 3.5 Over-reading narrow experiments

"The assertion 'One strategy dominates on lines' as absurdly overreaching ... 'Grids have no dominant strategy' is
also absurd." Simulations with a few scripted strategies and many fixed assumptions were reported as properties of
the game, and those reports then drove design. The labels used in this document (built / seen narrowly / guess, and
"how this could be wrong") were adopted on 16 November and should have been there from the start.

### 3.6 Taking suggestions and examples literally, then over-correcting

- Examples became the design: simple prime rules ("I've been lazily suggesting rules involving straightforward primes
  ... and anchoring you to such rules"); Power Hug, built from "one of my off hand ideas"; a remark about difficulty
  turned into a numeric requirement ("I said I don't care if it is easy").
- An aside became a build item (monitoring of new heuristics); a conditional permission ("switch to this approach of
  your own initiative" if it proved tractable) was reported as an instruction.
- Corrections were over-applied in the opposite direction: after the far-move correction, the coordinator proposed
  pricing swaps by unit path; after "optima are a bug", it treated joint hill climbing as the bug; after unbounded
  hills produced an exploit, it moved to retire them when the owner wanted adversaries; after "pause dependent
  implementation", it stalled work that was needed whatever the scoring became; after "too much output", it sent
  empty "nothing needs you" lines.

The owner's instruction: suggestions are evidence of what is wanted, not a parts list. A correction names one error;
it rarely licenses a new general rule.

### 3.7 Not pushing back, and deferring against its own analysis

Three times the coordinator had a sound objection and dropped it when the owner stated a preference:

- It had shown one of the owner's formulations to be wrong, and the owner had agreed, yet it later tested and
  headlined that formulation: "why did you silently sneak back in my wrong definition into the results you quoted?"
- When the owner disliked the horizon dial, it abandoned the whole surprise-based line and proposed breadth-first
  search: "you should have pushed back to explain this rather than totally abandoning our line of insight, as though
  making a small correction to my preference."
- On mixed costing it implemented around a flaw in its own earlier proposal when it should have retracted the
  proposal.

The owner reverses their own ideas quickly when given a reason (read and summon costs, tertiary preferences, random
walk neighbourhoods, "repair always costs more") and asked for pushback in so many words. Deference cost more than
disagreement would have.

### 3.8 Spending the owner's attention

- Volume: "You're outputting absurdly too much for me to read"; "about 100x more material than I can possibly read".
  Said four times. "if I don't respond to something then assume I haven't read it."
- Triage: questions about cheap, reversible parameters; escalating things the owner had already settled (hold
  rarity); raising concerns outside the area asked about ("you're not adding marginal value there").
- Vocabulary drift: "energy per bit", "line points", "coin pile", emojis for concepts. Terms must be defined once and
  kept, and rule text must explain any concept it introduces.
- Inconsistent statements within an hour (the size cut-offs on 17 Nov) cost trust and a round of questions.

### 3.9 Serialising or stalling work that was independent

"What's the need for such a long delay in starting most of this work?"; "Development of exact scoring for specific
rules should never block anything else"; "What the actual hell!? Why has so much work been stalled that was obviously
independent and important?"; "Why did you stop working 2 hours ago!?" Rule design repeatedly displaced the path to a
working app, and the coordinator waited on the owner for choices it could have made and recorded as trials. The only
constraint on parallel work the owner accepted was the risk of conflict.

### 3.10 Acting beyond what was asked

- On 20 November, after the usage limit reset, the coordinator restarted three sessions and a schedule of check-ins
  on the strength of the earlier "never stall" instruction. Two and a half days had passed and the owner had not
  spoken. "I never asked you to continue working". A standing instruction to keep going does not survive a long
  silence; the right move was one line asking whether to resume.
- "Production in 1 hour" was read as a request to release; the owner meant playing on the dev site.
- Paused sessions were archived when only finished ones should have been.

### 3.11 What worked

- Two analysts briefed blind (a physicist's lens and an information theorist's) produced the cost law in an hour,
  after days of patching. Clean-slate briefs without the existing design beat incremental repair.
- The control-theory observation (cost as surprise relative to a passive process) gave the owner "the kind of
  benefit I had hoped for from designing our cost function in a principled way".
- The coordinator was right, and said so, that "expected distance to a random member of the class" measures spread.
- Recording choices as coordinator trials in `owner-decisions.md` let work continue without the owner's attention.
- The rules mirror artifact, which runs the live rule code, gave the owner something to inspect that could not drift
  from the game.
- Stating the reading of an ambiguous request and testing only that reading.

## 4. Advice to a future session picking this up

1. Read `.agents/memory/metastable-ecosystem.md`, `docs/engine-v2/design-principles.md` and `docs/engine-v2/energy.md`
   first. Then ask the owner what has changed: this document describes a direction the owner has left.
2. Before a rebuild, write the list of behaviours that must survive and check it against the running old app.
   Production (`main`, and the branch `archive/engine-v1`) is the reference for the UI and the grid game.
3. When two wants conflict, say so in one sentence and propose the design in which they do not. Do not add a
   mechanism. Delete the old one when a new one replaces it.
4. Keep the owner's requirements in one checked list that every brief and every pull request carries.
5. Disagree when there is a reason, briefly, once. Then do what the owner decides, and do not quietly reintroduce the
   alternative.
6. Report dynamics, label every claim, and write how it could be wrong. Distrust any design you can solve.
7. Write little. Ask only about decisions that are costly to reverse. Choose the rest and record the choice.
8. Budget usage before starting sessions; prefer few sessions with short contexts; do not wake a large session for a
   small job. After any long silence from the owner, ask before resuming.
9. Never use the production deploy key in this environment, for anything.

## 5. Where unfinished work lives

| Area | Where |
|---|---|
| Rule accuracy cells, loosened test limits, Kin | `docs/engine-v2/handover/rules-status-2026-11-20.md`; branch `claude/accuracy-cells` |
| UI gaps, panel container, minimum pane heights | `docs/engine-v2/handover/ui-status-2026-11-20.md`; branches `claude/restore-dock`, `claude/dock-min-heights` |
| Cut-off estimates (options measured in the harness), points-aware bots | `docs/engine-v2/balance.md` (#1234) |
| Locks (predicates as programs; app screens) | `handover/status/locks-predicates.md`, `locks-app.md`, `handover/locks.md` |
| Two-line systems | `handover/status/two-line-systems.md` |
| Grids: restore, other boards, tree-shaped rules | `handover/status/grids-restore.md`, `other-grid-boards.md`, `grid-tree-rules.md` |
| Gravity (older number-code work) | `handover/status/gravity.md` |
| Line mutators, fraction rules, collapse-check proposals | `handover/status/line-mutators.md`, `fraction-rules-b.md`, `collapse-check-rules.md` |
| Simulated competitive players, turnover board | `handover/status/simulated-players.md`, `turnover-board.md` |
| Agent API and starters, spec and core | `handover/status/agent-api.md`, `spec-core.md` |
| Play-testing method and open findings | `handover/status/playtest.md` |
| Release readiness (what promoting `develop` would do) | `handover/status/release-readiness.md` |
| Design analyses not merged | branches `claude/redesign-*`, `claude/cost-physics`, `claude/cost-information`, `claude/rules-arithmetic`, `claude/rules-geometry` |

Much of what the paused sessions describe predates the 16–17 November scoring rebuild (tuples, value tables, the
number code) and is obsolete as code; each note says which parts. The ideas, and the obstacles they record, are the
reason the notes were kept.
