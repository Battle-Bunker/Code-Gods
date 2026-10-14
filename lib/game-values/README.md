# Pantheon of Friction v1

An independent, dependency-free, **trusted-host** value generator. No LLM,
network, game-core import, runtime execution, server, or UI is needed. It
generates 3–8 distinct `[0,1]` preferences on either signed 32-bit integers or
capped ASCII strings. Every god includes a host evaluator and complete Python
and TypeScript source. Nothing changes legal agents, energy pricing, or scoring.

## Integration

```ts
import { registry, GENERATOR_ID, GenerationError } from "@workspace/game-values";

try {
  const pantheon = registry[GENERATOR_ID]({
    seed: 42,                 // required uint32, never Math.random() inside generation
    objectType: "Int",         // or "string"
    deityCount: 3,             // integer 3–8, default 3
    intMin: -2147483648,        // Int only, defaults shown
    intMax: 2147483647,
    // stringMaxLength: 128,   // string only, default 128, supported 4–4096
  });
  const god = pantheon.gods[0];
  const ownValue = god.evaluate(0);
  const python = god.source.python;       // standalone def value(x)
  const typescript = god.source.typescript; // standalone export function value(x)
  const replayManifest = pantheon.manifest;
  const trustedDiagnostics = pantheon.screening;
} catch (error) {
  if (error instanceof GenerationError) {
    // Reject game creation explicitly. A screening failure includes error.report.
    // Invalid settings/domain errors have no report. Never silently use a fallback.
  } else {
    throw error;
  }
}
```

Pass the actual room limits; do not generate for the defaults then evaluate
against a different domain. `god-1` through `god-N` are stable indices within a
generated roster, not account IDs. Bind gods to the server's roster once and
retain that mapping. Both language exports use the same mathematical
preferences, so room language does not affect generation. Evaluators reject
invalid objects rather than truncate, coerce, clamp or wrap out-of-domain data.
Wrapping **inside** a valid integer's value formula is deliberate.

The host must evaluate using `god.evaluate`, **not by executing exported player
code**. Source strings are disclosures/debugging artifacts, not a host sandbox.
The caller selects the room's language and adapts the `value` entry point if its
isolated runtime needs a different wrapper.

Keep the complete manifest, screening report and roster sources server-only.
They disclose opponents' individual valuations. Send a player only their
assigned source, own value, sum of other values, and product; preserve existing
public total-score rules. Do not return this whole object through an API.

This package intentionally does not edit root project references, the lockfile,
server dependencies or settings. Coordinator wiring should add the
`workspace:*` dependency and project reference, handle `GenerationError`, retain
replay information, and assign the roster. Until wired, it can be checked directly:

```sh
pnpm exec tsc --build lib/game-values
pnpm --filter @workspace/game-values test
pnpm --filter @workspace/game-values benchmark
```

Tests need Node 24 and `python3`; they fail rather than skip missing Python.
There are no package dependencies to install.

## Chosen families

All gods use `v = 1 / (1 + (distance / 2)^2)`.

### Integers: cyclic proximity wells

The seed chooses period `p` from `{16,20,24,28}` and a common cyclic shift.
The first three centers are shifted versions of `[4,8,6]`; additional gods
use distinct centers `[5,7,3,9,10]`. Distance is the shorter distance around
the residue circle. Euclidean modulo handles negatives and `INT_MIN` directly,
with no `abs(INT_MIN)` overflow. Zero is an ordinary residue.

The minimum domain width is the seed-selected period, ensuring a full
reachable cycle; smaller domains fail explicitly even if another seed could fit.
Configured endpoints may be anywhere within signed 32-bit limits.
No trial factorization, number-theory library or arbitrary precision is needed.
Host evaluation is O(1) time and memory.

Why this default: the research's nearby cyclic preferences and overlapping
proximity wells combine cheaply. Nonperiodic wells near zero would place almost
all full-range signed integers in near-zero tails. Cyclic wells distribute the
same contested geometry across the domain. They deliberately ignore magnitude;
period-separated inputs are equivalent, and cheap constants remain strong.

### Strings: overlapping edit-distance prototypes

The seed selects two distinct lowercase ASCII letters `a,b`. Prototypes are
`aaaa`, `bbbb`, `aabb`, followed by `aaab`, `abbb`, `abab`, `abba`, `baab` for
larger rosters. These names denote the selected letters, not literal a/b.
Distance is exact unit-cost Levenshtein distance over the **entire input**.
Four-character prototypes permit O(4n) time and O(4) working memory. All ASCII
0–127, including NUL, DEL, line endings, quotes and backslashes, is legal.
The empty string is legal and has distance four from every prototype, giving
value `1/5`; it is not a special optimum. Caps below four or above 4096 fail
explicitly as unsupported by this version, not as invalid engine object types.

Why this default: the prototype family offers shared repair and contested edits
without exponential language enumeration. Unlike a grammar-language distance,
it needs only a small linear dynamic program and identical source in both
languages. Uniform long ASCII inputs mostly reward deletion/cleanup; we measure
that limitation rather than hide it with a different spawning rule.

### Families not selected

| Research candidate | Decision |
|---|---|
| Prime multiplicity/diversity | Interesting shared structure, but factorization cost and square-free constant exploit; defer as an optional future family. |
| Bit occupancy/alternation | Cheap, but strong constant 5 and a missing nontrivial roster design; not a default here. |
| AB/BC motif normalization | Reject: `ABC` simultaneously maximizes both raw preferences. |
| Lag-2/lag-3 with anti-collapse factor | Viable exploratory family, but has missing-lag zeros and cleanup dominance; prototypes provide clearer complete-roster witnesses. |
| Exact distance to arbitrary grammar languages | Reject exponential target enumeration on the live path. |
| Nonperiodic integer proximity wells | Good local witnesses, poor coverage under full-range uniform spawning. |
| Resource shares | Outside the requested Int/ASCII domains. |

The package does not claim the unused candidates were implemented or exhaustively
benchmarked. It implements and screens the selected families only.

## Exact payoff witnesses (seed 42, three gods)

Every table entry is the **actual multiplayer payoff**
`u_i(x) = v_i(x) * sum(v_j(x), j != i)`, not just a raw-value preference.
Values and payoff deltas are both retained for every report witness.

| Domain / transition | Before payoffs A,B,C | After payoffs A,B,C | Result |
|---|---|---|---|
| Int `8 → 6` | .017647, .031765, .025882 | .070000, .150000, .120000 | A and B cooperate; C also gains |
| Int `2 → 3` | .750000, .750000, 1 | .492308, .886154, .886154 | Same A–B pair conflicts; C loses |
| Int `1 → 2` | .886154, .492308, .886154 | .750000, .750000, 1 | B+C gain against A |
| Int `3 → 2` | .492308, .886154, .886154 | .750000, .750000, 1 | A+C gain against B |
| String eight NULs → `kkii` | .006920, .006920, .006920 | .750000, .750000, 1 | A and B cooperate; C also gains |
| String `kkii → kiii` | .750000, .750000, 1 | .492308, .886154, .886154 | Same A–B pair conflicts; C loses |
| String `kkki → kkii` | .886154, .492308, .886154 | .750000, .750000, 1 | B+C gain against A |
| String `kiii → kkii` | .492308, .886154, .886154 | .750000, .750000, 1 | A+C gain against B |

Important correction to the coalition brainstorm: a center payoff of 1 falling
to .886154 is a **loss**. An endpoint-directed move does not benefit the middle
god simply because it benefits a partner. The two coalition witnesses above
instead move from different nearby endpoints toward the center.

For the same first pair at seed 42, integer screening finds 105 cooperative and
30 conflicting ordered transitions among 256 candidate transitions. String
screening finds 5,594 cooperative and 4,738 conflicting transitions among 16,900.
These are **candidate-pool counts, not spawn probabilities**. Every transition is
feasible via a legal constant program; integer local increments and string local
deletions are separately measured. Tests recompute all reported witnesses for
four seeds and each supported roster size, not only these examples.

## Screening and failure contract

Generation runs a deterministic, offline `bounded-payoff-screen-v1`:

* Integer pool covers every residue, hence its raw/payoff maxima claims are exact
  for this family and configured domain.
* String pool includes all words over the two chosen letters through length
  `min(cap,6)`, plus empty/control/maximum-length garbage inputs. Enumeration is
  capped at six, never proportional to the configured cap's exponential space.
* Reject indistinguishable gods, a candidate common value or payoff maximum,
  absence of same-pair cooperative/conflicting witnesses for gods 0 and 1, or
  fewer than two distinct winning coalitions with a harmed outsider.
* Require absolute payoff margins greater than `1e-5`. Record each witness's
  object, all values, all payoffs, both delta vectors, winners and losers.
* Draw 128 diagnostic spawn samples from the **configured** domain. Integers use
  uniform bounded draws. ASCII lengths use the truncated geometric distribution
  proportional to `128^length`, then uniform code points—equivalent to the
  engine's uniform rank distribution, **not uniform length**.
* Report identity means, value/payoff ranges, near-zero/near-one saturation,
  first-pair value ties, local transitions (`x+1` with domain-boundary wrap or
  deleting the first character), constant repair, and contested constant switches.
* Report each god's best screened constant and gain over identity. First maximum
  in deterministic candidate order breaks ties.

The constant-switch diagnostic repeats deterministic switches once per spawn
sample; its `count` is bookkeeping, **not independent statistical evidence**.
The seed and screen version fix every sample and tie-break. Screening does not
retry new seeds, silently weaken requirements, replace a failed roster, call an
LLM, or enforce its warnings as new gameplay rules.

Acceptance means structural payoff diversity is witnessed. It does **not** mean
balanced gameplay, resistance to constants, frequent local conflict under spawn
distribution, or margins above arbitrary deployment costs. For strings, bounded
candidate maxima are not a proof of global payoff optimality. The distinct
prototypes do rule out a common raw maximum of 1, but other common payoff
maximizers outside the search are not exhaustively excluded.

### Measured distribution limitations

Seed 42, default domains, three gods, 128 samples:

| Diagnostic | Int | ASCII cap 128 |
|---|---:|---:|
| Identity mean payoff A | .256727 | 1.23850e-7 |
| Identity mean payoff B | .253697 | 1.24025e-7 |
| Identity mean payoff C | .313394 | 1.24480e-7 |
| Local move A/B cooperation | 44.53125% | 0% above margin |
| Local move A/B conflict | 11.71875% | 0% above margin |
| Constant cleanup A/B cooperation | 81.25% | 100% |
| Switch first god's constant toward others: A/B conflict | 100% | 100% |

Long ASCII spawning produces near-zero payoffs and large garbage plateaus; almost
all strings have maximum length. The package explicitly warns that political
disagreement appears **after repair/constant overwrite**, not commonly in local
changes to fresh strings. At cap 4096 even individual values are usually below
`1e-6`. These are limitations of this accepted research baseline, not claims of
strong naturally occurring regional politics.

## Cheap agents and unchanged rules

For seed 42, the first god's best integer constant is 1, the second's 3, and the
third's 2. String analogues are `kkki`, `kiii`, `kkii`. Payoffs are the endpoint
and center rows above. Integer first-god constant improves its expected
single-object payoff by about .629427 over sampled identity; the string analogue
improves by about .886154. These are **gross** improvements, not net profits.

`uniformAgentPayoffs(gods, input, slots)` computes one uniformly selected agent
slot: `null` is identity, other entries are constant outputs. `[null,a,a]` gives
`(u(input)+2u(a))/3`; repeated copies alter selection probability, not payoff
arithmetic. `composeConstantAgents(input,[a,null,b])` returns b: last writer wins.
Tests cover identity, duplicate dilution, repeated constants, reversed composition
and empty composition. These helpers are analytical baselines, not engine
scheduling or untrusted program execution.

An expected gain `g` per affected object only offsets an external cost `c` when
actual expected affected-object count times `g` exceeds `c`. That count depends
on selection, lifetime and scheduling owned by the engine. This package invents
no constant surcharge and imposes no preservation restriction. Constants remain
legal. Two-player scores would be identical (`v1*v2`); this generator supports
three or more gods rather than claim otherwise.

## Reproducibility and performance

See [reproducibility](docs/reproducibility.md) and
[benchmarks](docs/benchmarks.md). Golden fixtures lock the selected seed's
preferences, signed endpoints, negative/zero inputs, controls, empty strings and
payoff geometry. Tests run generated Python and TypeScript against host outputs,
including randomized objects and invalid values; no source/evaluator equivalence
is inferred merely by checking string contents.
