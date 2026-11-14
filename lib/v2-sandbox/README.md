# @workspace/v2-sandbox

Engine v2's agent sandbox (spec: `docs/engine-v2/spec.md` §6, build plan PR 6). Agent code runs isolated, under a
per-act step budget, time cap and host-call cap, and reaches the host only through one synchronous channel of priced
calls: one JSON request in, one JSON reply out.

- **TypeScript / JavaScript** on QuickJS-Wasm. TypeScript is transpiled (no type check) by the TypeScript compiler on
  the host. The channel is a host function `__host(requestJson): replyJson`.
- **Python** on the pinned CPython 3.15 WASI bundle, unchanged (built by `lib/game-runtime`'s `setup:python` and
  `build:python`; same SHA-256 pin). The bundle supplies CPython and its standard library only: the trusted guest is
  this package's `python/guest.py` (a cleaned copy of the old boot and sandbox guests), and the bundle's own guest
  files are not run. The channel is WASI file descriptor 3: the guest writes a 4-byte little-endian length and the
  request with `os.write(3, …)`, and reads the reply framed the same way with `os.read(3, …)`.

Everything here is a copy-and-clean of `lib/game-runtime` (no imports from it): no summon pricing, no script mode, no
read meter, no pricing vocabulary. Reads are now the host's to count, from the replies' receipts.

## Use

```ts
import { createSandbox, FakeHost } from "@workspace/v2-sandbox";
const sandbox = await createSandbox({ language: "python", execution: "worker" });   // or "typescript", "javascript"
const host = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });   // or the engine's AgentHost
const result = await sandbox.act({ source, offer: { object: 3 }, seed: "12345", host, limits: { stepBudget: 500_000 } });
// { ok: true, calls: '[{"mutator":"seq.step","site":0,"args":{"k":"2"}}]' (UNTRUSTED), steps, usedRandom, transcript, readBits }
// { ok: false, code: "COMPILE" | "EXECUTION" | "LIMIT", error, transcript, readBits }   (still charged its reads)
host.settle(result.calls);   // the fake applies and prices the calls; the engine does this itself
sandbox.close();
```

The host is an `AgentHost`: `handle(request, { hostCallsLeft }) → { ok: true, result, bits } | { ok: false, error }`,
called synchronously. `bits` is the call's receipt (the read bits it charged). The channel (`src/channel.ts`) parses
and shape-checks requests, enforces the host-call cap (default 64) and the 16 KiB message size, turns a host exception
into `{ ok: false, error: "the host failed: …" }`, sums the receipts and keeps the transcript.

The message types are in `src/agent-api.ts`, the one file to swap for `@workspace/v2-core`'s once it merges.

## The guest libraries

`guest/codegods.js` and `guest/codegods.py` run as each act's trusted prelude: transport, values and a rational
helper, no rule logic. They give agents `offer.view / element / myRule (my_rule) / myScore (my_score) / quote /
budget`, `call(mutator, args, site?)` (Python: `call(mutator, site=0, **args)`), `Q` (bigint rationals) or
`fractions.Fraction`, and `HostError`, raised for an `{ ok: false }` reply. Uncaught, it fails the act. Both encode
requests the same way (key order, rationals as "p/q"), so the same agent in either language makes the same requests.

Then `guest/helpers.js` and `guest/helpers.py` (same names, same behaviour; the parity test is in `lib/v2-agents`)
add the plain-words helpers agents are written with: `look`, `peek`, `goal`, `progress`, `move`, `price`, `cheapest`,
`energy`, `prime`, `square`, `near`. They are listed in `docs/engine-v2/agents.md`.

## Limits

| | |
|---|---|
| Step budget | default 500,000. Python: `sys.monitoring` LINE and JUMP events in the agent's own code (cannot be caught). QuickJS: interrupt ticks, 10,000 per poll. Deterministic. |
| Time cap | `wallMs`, default 2,000, in wall time. QuickJS: checked at every interrupt poll. Python: the guest reads the clock every 10,000 steps and the host ends the act there once real time is past the cap. |
| Hard wall | `execution: "worker"` only: the worker is terminated 250 ms past the time cap, or 5 s into trusted preparation, (a stuck native step: a catastrophic regex, `sum(range(10**12))`), and the next act starts a new one (Python from the shared snapshot). Inline execution has no hard wall: use it for trusted code and tests. |
| Host calls | default 64 per act; past the cap a call gets a host error and never reaches the host. |
| Sizes | source 16 KiB; each channel message 16 KiB; returned calls 64 KiB; offer 1 KiB. |
| Memory | QuickJS 32 MiB heap, 512 KiB stack; CPython 128 MiB linear memory. |

Determinism: the virtual clock (2026-01-01T00:00:00Z, 1 µs per read), the seeded `Math.random` / `random` and the
fresh guest per act make the same source, offer, seed and host give the same transcript and calls, inline or in a
worker. Isolation: no file system, network, process, timers or extra modules (Python: the read-only module proxies,
every WASI import but the clocks, entropy and descriptor 3 refused; JavaScript: no host objects but `__host`); a
Python agent may not use names starting with `_`, `getattr` and the like (the old sandbox's source rule), which keeps
the step counter out of reach.

## Tests

`pnpm --filter @workspace/v2-sandbox test` (needs the Python bundle: `pnpm --filter @workspace/game-runtime
setup:python && pnpm --filter @workspace/game-runtime build:python`). The spec's three example agents run in both
languages (`test/agents/`) and must make the same calls at the same costs.
