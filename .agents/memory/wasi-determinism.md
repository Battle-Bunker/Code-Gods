---
name: WASI determinism
description: Capability limits and the deterministic bounds of the CPython WASI and QuickJS agent sandboxes on Node.
---
Enforce capabilities at the WASI import boundary, not through Python module names. Time and randomness are allowed, but only as the host's virtual clock and seeded stream.

**Why:** The user explicitly allowed time and randomness. Guest introspection makes Python-level name hiding unsuitable as a security boundary for forbidden filesystem/network/process capabilities, and a real clock or entropy would make the same act differ between measurement and play.

**How to apply:** Python runs as CPython WASI on Node's own WebAssembly with a JS WASI host (`lib/game-runtime/engine/python.mjs`, `engine/wasi.mjs`; see `lib/game-runtime/README.md`). After bootstrap, only `clock_time_get`, `clock_res_get` and `random_get` are answered, from the virtual clock (starts at 2026-01-01T00:00:00Z, +1 µs per read) and the act's seeded stream; every other import returns `ENOTCAPABLE` (or traps for `proc_exit`). The standard library is a read-only in-memory `/lib` during bootstrap only. Keep imports capability-limited and the bundle pinned by SHA-256.

Isolate mutable interpreter state by restoring one trusted initialized snapshot before every compilation, inspection and act.

**Why:** Builtins, modules, globals and heaps must not carry state between calls or agents, and the snapshot must be identical on every host for results to match.

**How to apply:** Restore all linear memory and mutable globals from the snapshot; replace the instance after a trap, host fault or memory growth. Bootstrap runs on the virtual clock and a fixed entropy stream and reads the stdlib in sorted order, so object addresses are reproducible. QuickJS gets a fresh context per act.

The step budget is the deterministic bound; there is no fuel on V8.

**Why:** Moving from Wasmtime to V8 removed instruction fuel, the former second deterministic ceiling.

**How to apply:** Count Python LINE/JUMP events in the player's code (`sys.monitoring`) and QuickJS interrupt ticks against `stepBudget`. The CPU check and the worker's hard wall are only backstops, and a result they stop is not deterministic, so run open agents with a generous `interactionComputeMs` (1000) so the step budget binds first. Test interpreter startup and module imports, not only the host functions in isolation.
