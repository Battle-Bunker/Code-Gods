"""The deterministic agent sandbox, run INSIDE the guest (docs/open-agents.md §1.3, §3.5).

Trusted runtime code, executed once at bootstrap into the guest's `__main__` (so it is part of the
initialized snapshot, and every act starts from a pristine copy of it). Per act, the runner calls
`_act_setup(seed, step_limit)` before the trusted prelude runs, then `_instrument(code)` on the player's
freshly unmarshalled module code object.

* Builtins: a fresh dict per act without `open eval exec compile input breakpoint globals locals vars id
  memoryview ...`; `print` does nothing; `__import__` serves only the preloaded computational modules,
  as read-only proxies (public attributes only, assignment refused).
* `random` is a private `Random(seed)`, seeded by the host per act. `Random()` and `seed()` with no
  argument draw from that stream. `SystemRandom` is unavailable. Any use sets `_used_random`.
* `time` is the real module behind a proxy: the HOST answers WASI clock reads with a virtual clock
  (2026-01-01T00:00:00Z + 1 µs per read, restarted every act), so every path to a clock, including
  escapes past these proxies, sees the same instants. `sleep` is unavailable.
* Steps: `sys.monitoring` counts every LINE and JUMP event in the player's own code objects. Over the
  limit, `_StepLimit` (a BaseException) is raised, and raised again at every later event.
* The decimal context is reset (the snapshot already restores it).

These proxies are a model of the contract, not the isolation boundary: Wasm, the denied WASI imports, the
snapshot restore and the host-side checks are. A player who reaches past a proxy only changes their own
act.
"""
import builtins
import decimal
import random
import sys
import time
import types

_PRELOADED = ("math", "itertools", "functools", "collections", "re", "json", "decimal", "fractions",
              "statistics", "hashlib", "ast", "operator", "random", "time")
_BLOCKED = ("open", "exec", "eval", "compile", "input", "breakpoint", "exit", "quit", "help", "globals",
            "locals", "vars", "id", "memoryview", "copyright", "credits", "license", "__import__",
            "__loader__", "__spec__", "__build_class__", "__debug__", "__doc__", "__name__", "__package__",
            "aiter", "anext")
_TRUE = True
_used_random = False
_steps = 0
_step_limit = 500_000


class _StepLimit(BaseException):
    """The agent ran out of steps (a BaseException: `except Exception` cannot swallow it)."""


def _readonly(name, ns):
    ns = types.MappingProxyType(dict(ns))
    public = tuple(sorted(ns))

    class Module:
        __slots__ = ()

        def __getattribute__(self, k):
            if k == "__name__":
                return name
            if k == "__all__":
                return public
            if k == "__class__":
                return Module
            if k.startswith("_"):
                raise AttributeError(f"{k} is not available to agents")
            try:
                return ns[k]
            except KeyError:
                raise AttributeError(f"module {name!r} has no attribute {k!r}") from None

        def __setattr__(self, k, v):
            raise AttributeError("modules are read-only for agents")

        def __delattr__(self, k):
            raise AttributeError("modules are read-only for agents")

        def __dir__(self):
            return list(public)

        def __repr__(self):
            return f"<module {name!r} (agent view)>"

    Module.__name__ = Module.__qualname__ = "module"
    return Module()


def _public(mod):
    names = getattr(mod, "__all__", None) or [n for n in dir(mod) if not n.startswith("_")]
    return {n: getattr(mod, n) for n in names if hasattr(mod, n)}


def _no_sleep(*_a, **_k):
    raise RuntimeError("sleeping is not available to agents")


_STATIC = {}
for _name in _PRELOADED:
    if _name == "random":
        continue
    _ns = _public(sys.modules[_name])
    if _name == "time":
        _ns["sleep"] = _no_sleep
    if _name == "collections":
        import collections.abc
        _STATIC["collections.abc"] = _readonly("collections.abc", _public(collections.abc))
        _ns["abc"] = _STATIC["collections.abc"]
    _STATIC[_name] = _readonly(_name, _ns)
del _name, _ns


def _random_module(seed):
    rng = random.Random(seed)

    def used():
        global _used_random
        _used_random = True

    def wrap(f):
        def g(*a, **k):
            used()
            return f(*a, **k)
        g.__name__ = getattr(f, "__name__", "f")
        return g

    class Random(random.Random):
        def __init__(self, x=None):
            used()
            super().__init__(rng.getrandbits(64) if x is None else x)

        def seed(self, a=None, version=2):
            used()
            super().seed(rng.getrandbits(64) if a is None else a, version)

    def seed(a=None, version=2):
        used()
        rng.seed(rng.getrandbits(64) if a is None else a, version)

    def system_random(*_a, **_k):
        raise RuntimeError("SystemRandom is not available: use random.random() (seeded by the engine)")

    ns = {}
    for n in random.__all__:
        if n == "Random":
            ns[n] = Random
        elif n == "SystemRandom":
            ns[n] = system_random
        elif n == "seed":
            ns[n] = seed
        elif hasattr(rng, n):
            ns[n] = wrap(getattr(rng, n))
    return _readonly("random", ns)


_MODS = {}


def _agent_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level:
        raise ImportError("relative imports are not available to agents")
    if name.split(".")[0] not in _PRELOADED:
        raise ImportError(f"{name} is not available to agents (preloaded: {', '.join(_PRELOADED)})")
    if name in _MODS:
        return _MODS[name]
    if name == "collections.abc":
        return _STATIC["collections"] if not fromlist else _STATIC["collections.abc"]
    if "." in name:
        raise ImportError(f"{name} is not available to agents")
    return _STATIC[name]


def _quiet(*_a, **_k):
    return None


def _act_setup(seed, step_limit):
    global _used_random, _steps, _step_limit, _AGENT_BUILTINS
    _used_random = False
    _steps = 0
    _step_limit = step_limit
    decimal.setcontext(decimal.Context())
    _MODS["random"] = _random_module(seed)
    b = {k: v for k, v in vars(builtins).items() if k not in _BLOCKED}
    b["print"] = _quiet
    b["__build_class__"] = builtins.__build_class__
    b["__import__"] = _agent_import
    _AGENT_BUILTINS = b


_MON = sys.monitoring
_TOOL = 4


def _on_event(*_a):
    global _steps
    _steps += 1
    if _steps > _step_limit:
        raise _StepLimit("ran out of steps")


_MON.use_tool_id(_TOOL, "code-gods-steps")
_MON.register_callback(_TOOL, _MON.events.LINE, _on_event)
_MON.register_callback(_TOOL, _MON.events.JUMP, _on_event)


def _instrument(code):
    todo = [code]
    while todo:
        c = todo.pop()
        _MON.set_local_events(_TOOL, c, _MON.events.LINE | _MON.events.JUMP)
        todo.extend(k for k in c.co_consts if isinstance(k, types.CodeType))
