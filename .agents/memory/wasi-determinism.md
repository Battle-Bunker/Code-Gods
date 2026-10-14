---
name: WASI determinism
description: Non-obvious WASI host-callback and deterministic-computation constraints.
---
Enforce capabilities at the WASI import boundary, not only through Python module names. Real read-only clocks and randomness are explicitly permitted; filesystem metadata remains outside the intended user-agent API.

**Why:** The user later explicitly allowed time and randomness. Guest introspection still makes Python-level name hiding unsuitable as a security boundary for forbidden filesystem/network/process capabilities.

**How to apply:** Do not require deterministic agent execution or block approved clock/entropy queries. Keep imports capability-limited, freeze dependency content, and isolate mutable interpreter state between agents.

Calls to original Wasmtime WASI functions from Python callbacks need a tiny Wasm shim exporting the guest memory.

**Why:** Calling the original function directly loses the Wasm caller and fails with “missing required memory export.” Denying directory reads entirely also prevents CPython from importing encodings at startup.

**How to apply:** Preserve caller memory when wrapping metadata functions; test interpreter startup and module imports, not just the wrapper in isolation.
