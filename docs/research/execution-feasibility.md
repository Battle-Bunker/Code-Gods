# Execution feasibility and approval gate

## Finding

Full native standard-library compatibility and a capability-free pure-function
sandbox are different contracts. Do not advertise the former while shipping the
latter. No player code is executed by the current foundation library.

### Recommended MVP contract (awaiting approval)

- Python: CPython compiled for WASI in a fuel-metered Wasmtime host, with a
  dedicated read-only standard-library bundle. The sandbox must have no server
  filesystem preopens, inherited environment, sockets or process creation.
  Exact computational module availability must be inventoried against the
  pinned build before the grammar manifest is published.
- TypeScript: typecheck/transpile source, then execute JavaScript in a fresh
  QuickJS WebAssembly runtime. ECMAScript computation facilities such as Math,
  strings, arrays, maps, sets, JSON and regular expressions are the baseline;
  Node APIs, DOM and third-party packages are not implied by TypeScript support.
  Expose no host callbacks other than a tightly bounded value bridge.
- Impose memory, stack, wall-time and instruction budgets, including compilation
  and callable creation, with independent termination controls around workers.
  A JS interrupt callback alone must not be assumed to interrupt every native
  regex/library operation. Test this and use an outer hard deadline.
- Fresh invocation state; no wall-clock or uncontrolled randomness as game
  inputs. Describe rejected nondeterministic facilities in the grammar manifest.
- Run both compilation and validation of hostile programs away from the server's
  request loop. A subprocess alone is not a sandbox.

This is a candidate architecture, not an installed or verified runtime.
No security audit or sandbox escape testing has yet been completed.

### Why not simply run Pyodide inside the server?

Python's documentation explicitly notes Pyodide's access to JavaScript/DOM and
network facilities. Being compiled to WebAssembly does not remove authority
granted by host imports and bridges. Using it on a privileged Node host without
an additional verified isolation boundary would not meet the game contract.

### Full compatibility alternative

If native Python/Node standard-library compatibility is essential, investigate
a separately hardened execution service with dedicated isolation rather than
grant the game server's privileges to submissions. This adds infrastructure and
may require external authorization. No provider has been selected or connected.
Even this alternative must forbid exfiltration, resource exhaustion and effects
on other players; "full compatibility" cannot mean access to server secrets.

## Sources inspected

- https://docs.python.org/3/library/intro.html#webassembly-platforms
  documents restricted/unavailable process, networking, threading and filesystem
  capabilities on WebAssembly targets.
- https://pyodide.org/en/stable/usage/wasm-constraints.html
  lists removed and nonfunctional modules and browser-mediated networking.
- https://raw.githubusercontent.com/justjake/quickjs-emscripten/main/README.md
  documents absent host APIs by default and memory/stack/interrupt controls.
  The project states that it has not been security audited.
- https://github.com/python/cpython/blob/main/Platforms/WASI/README.md
  identifies the upstream CPython WASI build path; packaging and runtime
  performance still need investigation.

## Current deliverable boundary

The runtime-independent rule primitives and their tests exist. Server
authentication, persistence, scheduling, WebSocket transport, executable agents,
the shipping value generator, and both web interfaces are not implemented.
The three requested brainstorming passes are preserved alongside this report.
The task remains incomplete, awaiting a decision on the computational-library
contract before runtime-dependent interfaces are committed.
