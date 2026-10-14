# Isolated computational runtime adapters

This package owns no server, database, authentication, transport or game rules.
Use the asynchronous adapter, **not** the Python `Runner` directly in a request
handler. The latter is a single-threaded internal worker with no admission queue.

## Setup (pinned)

Install workspace dependencies from the committed pnpm lockfile. This package pins
TypeScript 5.9.3 and quickjs-emscripten 0.31.0. Install
`python/requirements.txt` with the project's Python package manager (Wasmtime
49.0.0); no virtual environment is required. Run:

```
pnpm --filter @workspace/game-runtime setup:python
pnpm --filter @workspace/game-runtime test
pnpm --filter @workspace/game-runtime test:python
python3 lib/game-runtime/python/inventory.py
pnpm --filter @workspace/game-runtime benchmark
```

Setup verifies the SHA-256 of the exact CPython 3.15.0 WASI SDK 33 archive before
extracting into the ignored `.cache/code-gods/python-3.15.0` directory. Provision
that directory before starting the service. Treat it as immutable trusted
dependency content; do not modify it while workers run. Workers do not download
anything. Missing dependencies produce `UNAVAILABLE`, never native execution.
Supply `python` in the constructor if Python is not on the launcher's PATH.

## Integration

```ts
import { createRuntime, RuntimeError } from "@workspace/game-runtime";
const runtime = createRuntime({ language: "python", workers: 2, queueLimit: 32 });
const settings = {
  objectType: "Int" as const, intMin: -100, intMax: 100, stringMaxLength: 256,
};
await runtime.inspect("lambda x: x + 1", settings); // {cost: 9}; never evaluates source
await runtime.validate("lambda x: x + 1", [0, 10], settings);
// {cost: 9, outputs: [1, 11]}; each sample has fresh guest state
await runtime.execute("lambda x: x + 1", 41, settings); // {value: 42}; no price
runtime.close(); // shutdown hook: rejects outstanding work, kills workers
```

TypeScript source example: `(x: number) => x + 1`. Factory expressions are
supported in both languages. Samples do not prove totality over the whole domain;
each later interaction must execute again and validate its actual output.

`RuntimeError.code` is one of `CONFIG`, `COMPILE`, `DOMAIN`, `EXECUTION`, `LIMIT`,
`CAPACITY`, `UNAVAILABLE`. Engine failures caught internally (including some
interrupt/memory failures) use `EXECUTION`; outer deadline failures use `LIMIT`.
Never take cost from execution. Associate inspection results with the exact
source/language/grammar version on the authoritative server.

Domains are supplied on every call, not inferred from a global 128-character
limit. Integers must stay within the configured signed-32-bit subrange.
ASCII strings support settings caps from 0 through 8192. Larger settings fail
explicitly; supporting them requires increasing bounded IPC/output budgets.
No coercion, wrapping, clamping, truncation, promises or objects as outputs.

## Grammar and price: ast-bytes-v1

Python accepts one `eval` expression which must evaluate to a callable at
execution. Inspection parses and compiles but **never evaluates** it. Each AST
node costs one byte except Constant: strings UTF-8 length, bytes length,
signed integers minimum two's-complement byte length (at least one), floats 8,
complex 16, None/bool 1. Operators, contexts and the root Expression count.

TypeScript accepts one expression with a statically callable type, checks strict
ES2022 standard-library types, and erases types with TypeScript 5.9.3 before
QuickJS evaluation. Imports and reference directives are unsupported.
The submitted expression's AST counts one per node including identifiers and
type nodes, excluding the trusted wrapper. String/template text literals cost
UTF-8 length, nonnegative numeric integer literals minimum signed byte length,
other numeric literals 8. Unary minus is a separate node; BigInt and other
non-numeric-literal nodes cost one. Whitespace/comments do not count.
These are language-specific structural prices, not instruction counts.

## Computational module inventory

`python/inventory.py` executes representative workloads in the actual pinned
guest, not host Python. Verified: **math, itertools, functools, collections,
re, json, decimal, fractions, statistics, hashlib**. This is an inventory of
tested computational uses, not a promise of every API in those modules.
Other modules present in the read-only CPython bundle are not guaranteed.
Native extensions not compiled into this build, pip packages, process creation,
networking, threads, writable files, host environment and host files are excluded.
No import-name blacklist is claimed as a security boundary.

TypeScript supports QuickJS ECMAScript computational built-ins, including strings,
arrays, maps, sets, JSON, Math and RegExp. Node, DOM, network, module loading,
package imports, timers and host callbacks are unavailable.

## Capability and determinism boundary

Submitted Python runs only inside Wasmtime; submitted JavaScript runs only in a
fresh QuickJS Wasm context/runtime. Neither is evaluated by the host interpreter.
Workers receive an empty host environment. WASI receives only the fixed
`PYTHONHASHSEED=0`, no inherited descriptors and one read-only library preopen.
Guest stdout is only a bounded untrusted result channel; extra output is rejected.
The trusted parent validates envelope shape and every returned domain value.

WASI `clock_time_get` is always zero, `clock_res_get` is one nanosecond, and
`random_get` returns zero-filled bytes. These facilities are **not secure random
sources**. File stats normalize devices/inodes/timestamps; directory entries
normalize inodes. Blocking `poll_oneoff` is denied. Hash seeding is fixed.
The tiny trusted Wasm metadata shims export guest memory because Wasmtime's WASI
calls require a Wasm caller with a memory export. Directory traversal order still
follows the immutable installed bundle; do not treat host-dependent filesystem
enumeration as a portable computational API.

QuickJS Date is unavailable and Math.random throws; these bindings cannot be
restored by deleting/reassigning their properties. No host clocks/random callbacks
are installed. Fresh invocations reset all globals, modules, hash seeds and heaps.
This is reproducible computation on the pinned build, not a claim of identical
floating-point/library behavior across future engine versions.

## Resource limits and capacity

* Source: 16 KiB UTF-8; request: 128 KiB; output channels: 64 KiB.
* Python: 128 MiB linear memory, 1 MiB Wasm stack, 10 billion fuel units and
  three-second epoch interruption per invocation.
* QuickJS: 32 MiB heap, 512 KiB stack; at most 10,000 interrupt polls and a
  one-second execution interrupt deadline. Poll counts are not exact instructions.
* Independent parent process deadline defaults to four seconds, including
  compilation and callable creation. SIGKILL terminates even uninterruptible
  native regex operations. Startup also has a 30-second hard deadline.
* Node worker V8 old-space is capped at 192 MiB. This is not an OS RSS quota;
  native Wasmtime compilation, allocator overhead and the OS require extra memory.
* One worker by default; maximum 16. Queue defaults to 32 waiting requests,
  capped at 1024. Queue waits expire; overload returns `CAPACITY`. Worker crashes
  reject the active call and workers restart for queued work. Missing setup
  rejects queued work rather than spawning indefinitely.

Measured in this workspace (10 warm calls, math import/square-root workload):

| Language | Cold first call | Warm mean | Serial calls/second |
| --- | ---: | ---: | ---: |
| Python | 2016 ms | 397 ms | 2.5 |
| TypeScript | 919 ms | 102 ms | 9.8 |

These are observations, not reservations. More workers require available CPU and
memory; four Python workers do **not** guarantee ten calls/second on one CPU.
Budget room interaction frequency and concurrent rooms accordingly. Run the
benchmark on the target host before admitting a room. Do not silently queue
unbounded work to imitate real-time throughput.

## Security gates

The hostile regression suite covers host file/network attempts, wrong types and
domains, execution-price forgery, factory state, non-executing inspection,
compilation abuse, infinite loops, malicious regex, deterministic facilities,
capacity failure and worker recovery. It is not a sandbox security audit.
Before public hostile multi-tenant use, independently audit both engines and
the host imports, test engine-version upgrades, and add OS-level worker RSS/CPU
limits and target-host concurrent capacity qualification. QuickJS upstream does
not claim a completed security audit. Do not represent this package as formally
verified or as permission to expose full native Python/Node standard libraries.
