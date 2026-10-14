---
name: WASI determinism
description: Non-obvious WASI host-callback and deterministic-computation constraints.
---
Virtualize clocks and entropy at the WASI import boundary, not only through Python module names. Normalize library file metadata as well.

**Why:** A capability-limited interpreter still inherits real time, entropy and inode/timestamp information from WASI. Guest introspection makes Python-level name hiding unsuitable as a security boundary.

**How to apply:** When extending runtime facilities, consider reproducibility separately from host authority. Directory traversal ordering is not a portable computational API; freeze dependency content.

Calls to original Wasmtime WASI functions from Python callbacks need a tiny Wasm shim exporting the guest memory.

**Why:** Calling the original function directly loses the Wasm caller and fails with “missing required memory export.” Denying directory reads entirely also prevents CPython from importing encodings at startup.

**How to apply:** Preserve caller memory when wrapping metadata functions; test interpreter startup and module imports, not just the wrapper in isolation.
