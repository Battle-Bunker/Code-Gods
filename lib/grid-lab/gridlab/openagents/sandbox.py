"""Run an open agent once: ordinary Python, the runtime's standard library, no state, a closed interface.

The runtime contract being modelled is lib/game-runtime/README.md: CPython with the computational
modules preloaded (math, itertools, functools, collections, re, json, decimal, fractions, statistics,
hashlib, ast, operator, random, time), no files, network, processes or threads. Grid Lab runs agents
in-process with `exec`, so this is a model of that contract and NOT a security boundary.

Each application:

* runs the agent's module afresh in new globals (agents are stateless: nothing survives from one
  application to the next; module proxies refuse assignment; the decimal context is reset);
* gives `random` a private generator seeded by the caller (`seed`, a 64-bit integer). The engine
  derives play seeds and measurement seeds with the same keyed hash (`derive_seed`), so the two are
  indistinguishable to the agent (§ docs/open-agents.md 4.3);
* gives `time` a frozen virtual clock: it starts at the same instant on every application and advances
  1 µs per call, so it is deterministic and identical in measurement and play. `sleep` is unavailable;
* counts deterministic steps (every new line and every jump in the agent's own code, plus N² per grid
  it previews or scores) and aborts at `step_limit`. A wall-clock backstop (`WALL_LIMIT`) catches
  long-running builtins; hitting it is reported, and makes that run non-deterministic;
* hides `open`, `exec`, `eval`, `compile`, `input`, `globals`, `locals`, `vars`, `id`, `breakpoint`, and
  makes `print` a no-op (guest stdout is not a result channel).

A run that raises, times out, or returns something that is not a list of valid moves does nothing.
Determinism caveat: str hashing is randomised per process unless PYTHONHASHSEED=0 (the runtime pins
it), so set iteration order over strings can differ between processes. `HASH_DETERMINISTIC` says
whether this process is pinned; measurement caches are only written to disk when it is.
"""
from __future__ import annotations

import ast
import builtins
import decimal
import hashlib
import hmac
import importlib
import os
import random as _random
import sys
import time as _time
from dataclasses import dataclass, field
from typing import Optional

from ..core import Grid, GridType
from .api import (MoveError, Move, GridView, all_moves, apply_moves, constructors, normalise_action)

STEP_LIMIT = 500_000
WALL_LIMIT = 5.0                       # seconds; a backstop, outside the deterministic semantics
EPOCH = 1_767_225_600.0                # 2026-01-01T00:00:00Z: where every application's clock starts
HASH_DETERMINISTIC = os.environ.get("PYTHONHASHSEED") == "0"
PRELOADED = ("math", "itertools", "functools", "collections", "re", "json", "decimal", "fractions",
             "statistics", "hashlib", "ast", "operator", "random", "time")
BLOCKED_BUILTINS = ("open", "exec", "eval", "compile", "input", "breakpoint", "exit", "quit", "help", "globals",
                    "locals", "vars", "id", "memoryview", "copyright", "credits", "license", "__import__",
                    "__loader__", "__spec__", "__build_class__", "__debug__", "__doc__", "__name__", "__package__",
                    "aiter", "anext")


class StepLimit(BaseException):
    """Raised inside the agent when its step budget runs out (BaseException: `except Exception` won't catch it)."""


# ------------------------------------------------------------------------------------------------
# seeds: one keyed hash for measurement and play
# ------------------------------------------------------------------------------------------------
SALT = b"gridlab-open-agents-v1"       # in production: a season secret, committed by hash, revealed after


def derive_seed(*parts, salt: bytes = SALT) -> int:
    """A 64-bit seed: HMAC-SHA256(salt, parts). Measurement uses ("measure", ...) and play ("play", ...);
    without the salt the two streams are indistinguishable."""
    msg = "\x1f".join(map(str, parts)).encode()
    return int.from_bytes(hmac.new(salt, msg, hashlib.sha256).digest()[:8], "big")


# ------------------------------------------------------------------------------------------------
# step accounting with sys.monitoring (only the agent's own code objects are instrumented)
# ------------------------------------------------------------------------------------------------
_MON = sys.monitoring
_TOOL = 4
_ACTIVE: list = []                     # stack of _Budget


class _Budget:
    __slots__ = ("steps", "limit", "exhausted", "t0", "timeout")

    def __init__(self, limit: int):
        self.steps, self.limit, self.exhausted, self.timeout = 0, limit, False, False
        self.t0 = _time.perf_counter()

    def tick(self, n: int = 1):
        self.steps += n
        if self.steps > self.limit:
            self.exhausted = True
            raise StepLimit()
        if not self.steps & 4095 and _time.perf_counter() - self.t0 > WALL_LIMIT:
            self.exhausted = self.timeout = True
            raise StepLimit()


def _on_event(*_a):
    if _ACTIVE:
        b = _ACTIVE[-1]
        b.steps += 1
        if b.steps > b.limit or b.exhausted:
            b.exhausted = True
            raise StepLimit()
        if not b.steps & 4095 and _time.perf_counter() - b.t0 > WALL_LIMIT:
            b.exhausted = b.timeout = True
            raise StepLimit()


_installed = False


def _install():
    global _installed
    if _installed:
        return
    try:
        _MON.use_tool_id(_TOOL, "gridlab-openagents")
    except ValueError:
        pass
    _MON.register_callback(_TOOL, _MON.events.LINE, _on_event)
    _MON.register_callback(_TOOL, _MON.events.JUMP, _on_event)
    _installed = True


def _code_objects(c):
    yield c
    for k in c.co_consts:
        if hasattr(k, "co_code"):
            yield from _code_objects(k)


# ------------------------------------------------------------------------------------------------
# module proxies
# ------------------------------------------------------------------------------------------------
class ReadOnlyModule:
    """A module as the agent sees it: public attributes only, no assignment."""

    def __init__(self, name: str, ns: dict):
        object.__setattr__(self, "_ns", ns)
        object.__setattr__(self, "__name__", name)

    def __getattr__(self, k):
        if k.startswith("_") and k not in ("__name__", "__doc__", "__all__"):
            raise AttributeError(f"{k} is not available to agents")
        try:
            return self._ns[k]
        except KeyError:
            raise AttributeError(f"module {self.__name__!r} has no attribute {k!r}") from None

    def __setattr__(self, k, v):
        raise AttributeError("modules are read-only for agents")

    def __delattr__(self, k):
        raise AttributeError("modules are read-only for agents")

    def __dir__(self):
        return sorted(self._ns)

    def __repr__(self):
        return f"<module {self.__name__!r} (agent view)>"


def _public(mod) -> dict:
    names = getattr(mod, "__all__", None) or [n for n in dir(mod) if not n.startswith("_")]
    return {n: getattr(mod, n) for n in names if hasattr(mod, n)}


_STATIC: dict = {}


def _static_module(name: str) -> ReadOnlyModule:
    if name not in _STATIC:
        mod = importlib.import_module(name)
        ns = _public(mod)
        if name == "collections":
            ns["abc"] = _static_module("collections.abc")
        _STATIC[name] = ReadOnlyModule(name, ns)
    return _STATIC[name]


class _Usage:
    __slots__ = ("random", "time", "score", "previews")

    def __init__(self):
        self.random = self.time = self.score = False
        self.previews = 0


def _random_module(seed: int, use: _Usage, forbidden: bool) -> ReadOnlyModule:
    if forbidden:
        def nope(*a, **k):
            raise RuntimeError("randomness is not available to agents in this mode")
        return ReadOnlyModule("random", {n: nope for n in _random.__all__})
    rng = _random.Random(seed)

    def wrap(f):
        def g(*a, **k):
            use.random = True
            return f(*a, **k)
        g.__name__ = getattr(f, "__name__", "f")
        return g

    class Random(_random.Random):
        def __init__(self, x=None):
            use.random = True
            super().__init__(rng.getrandbits(64) if x is None else x)

        def seed(self, a=None, version=2):
            super().seed(rng.getrandbits(64) if a is None else a, version)

    def seed(a=None, version=2):
        use.random = True
        rng.seed(rng.getrandbits(64) if a is None else a, version)

    def system_random(*a, **k):
        raise RuntimeError("SystemRandom is not available: use random.random() (seeded by the engine)")

    ns = {}
    for n in _random.__all__:
        if n == "Random":
            ns[n] = Random
        elif n == "SystemRandom":
            ns[n] = system_random
        elif n == "seed":
            ns[n] = seed
        elif hasattr(rng, n):
            ns[n] = wrap(getattr(rng, n))
    return ReadOnlyModule("random", ns)


def _time_module(use: _Usage, forbidden: bool) -> ReadOnlyModule:
    if forbidden:
        def nope(*a, **k):
            raise RuntimeError("the clock is not available to agents in this mode")
        return ReadOnlyModule("time", {n: nope for n in ("time", "time_ns", "monotonic", "perf_counter",
                                                          "process_time", "gmtime", "localtime", "strftime")})
    clock = [0]

    def now() -> float:
        use.time = True
        clock[0] += 1
        return EPOCH + clock[0] * 1e-6

    def ns_(f):
        return lambda: int(round(f() * 1e9))

    def gmtime(secs=None):
        return _time.gmtime(now() if secs is None else secs)

    def strftime(fmt, t=None):
        return _time.strftime(fmt, gmtime() if t is None else t)

    def asctime(t=None):
        return _time.asctime(gmtime() if t is None else t)

    def ctime(secs=None):
        return _time.asctime(gmtime(secs))

    def sleep(_s):
        raise RuntimeError("sleeping is not available to agents")

    ns = {"time": now, "time_ns": ns_(now), "monotonic": now, "monotonic_ns": ns_(now), "perf_counter": now,
          "perf_counter_ns": ns_(now), "process_time": now, "process_time_ns": ns_(now), "thread_time": now,
          "thread_time_ns": ns_(now), "gmtime": gmtime, "localtime": gmtime, "mktime": _time.mktime,
          "strftime": strftime, "strptime": _time.strptime, "asctime": asctime, "ctime": ctime, "sleep": sleep,
          "struct_time": _time.struct_time, "timezone": 0, "altzone": 0, "daylight": 0, "tzname": ("UTC", "UTC")}
    return ReadOnlyModule("time", ns)


# ------------------------------------------------------------------------------------------------
# compile once, run many times
# ------------------------------------------------------------------------------------------------
class AgentError(ValueError):
    """The source is not a valid agent (syntax error, or no `def agent(grid)`)."""


def _safe_builtins() -> dict:
    b = {k: v for k, v in vars(builtins).items() if k not in BLOCKED_BUILTINS}
    b["print"] = lambda *a, **k: None
    b["__build_class__"] = builtins.__build_class__
    return b


_BUILTINS = _safe_builtins()
_API: dict = {}


def api_globals(gt: GridType) -> dict:
    if gt not in _API:
        _API[gt] = constructors(gt)
    return _API[gt]


@dataclass
class RunResult:
    moves: tuple = ()                 # the validated action (empty: do nothing)
    grid: Optional[Grid] = None       # the result of applying it
    steps: int = 0
    error: Optional[str] = None       # why the run did nothing, if it failed
    used_random: bool = False
    used_time: bool = False
    used_score: bool = False
    timeout: bool = False


@dataclass
class Owner:
    """The summoning god's utility as an agent may see it: score(...) = surprisal in bits."""
    draw: object
    table: object
    batch_cache: dict = field(default_factory=dict, repr=False)

    def score(self, g: Grid, gt: GridType) -> float:
        return float(self.table.surprisal(self.draw.ordinal(g, gt)))

    def score_batch(self, sym, col, gt: GridType):
        import numpy as np
        o = self.draw.family.evaluate_batch(sym, col, self.draw.params, gt)
        return np.asarray(self.table.surprisal(o), float)


def names_used(source: str) -> set:
    """Every identifier the source loads (a static over-approximation of what it may call)."""
    out = set()
    for n in ast.walk(ast.parse(source)):
        if isinstance(n, ast.Name):
            out.add(n.id)
    return out


class CompiledAgent:
    """Source compiled once; `run(grid, ...)` executes it afresh each time."""

    def __init__(self, source: str, gt: GridType):
        self.source, self.gt = source, gt
        try:
            tree = ast.parse(source)
        except SyntaxError as e:
            raise AgentError(f"line {e.lineno}: {e.msg}") from None
        if not any(isinstance(s, ast.FunctionDef) and s.name == "agent" for s in tree.body):
            raise AgentError("an agent must define `def agent(grid):` at the top level")
        self.code = compile(tree, "<agent>", "exec")
        self.calls_score = "score" in names_used(source)
        _install()
        for c in _code_objects(self.code):
            _MON.set_local_events(_TOOL, c, _MON.events.LINE | _MON.events.JUMP)

    def run(self, g: Grid, seed: int = 0, owner: Optional[Owner] = None, step_limit: int = STEP_LIMIT,
            randomness: str = "seeded") -> RunResult:
        gt = self.gt
        use = _Usage()
        forbid = randomness == "forbidden"
        mods = {"random": _random_module(seed, use, forbid), "time": _time_module(use, forbid)}
        budget = _Budget(step_limit)
        N2 = gt.N ** 2

        def _import(name, globals=None, locals=None, fromlist=(), level=0):
            if level:
                raise ImportError("relative imports are not available to agents")
            top = name.split(".")[0]
            if top not in PRELOADED:
                raise ImportError(f"{name} is not available to agents (preloaded: {', '.join(PRELOADED)})")
            if name in mods:
                return mods[name]
            if name == "collections.abc":
                return _static_module("collections") if not fromlist else _static_module("collections.abc")
            if "." in name:
                raise ImportError(f"{name} is not available to agents")
            return _static_module(name)

        b = dict(_BUILTINS)
        b["__import__"] = _import
        ns = dict(api_globals(gt))
        ns["__builtins__"] = b
        ns["__name__"] = "__agent__"

        class Hook:
            @staticmethod
            def tick_preview():
                use.previews += 1
                budget.tick(N2)

        view = GridView(g, gt, Hook)
        if owner is not None:
            ns["score"] = _make_score(g, gt, owner, budget, use)
        res = RunResult()
        decimal.setcontext(decimal.Context())
        _ACTIVE.append(budget)
        try:
            exec(self.code, ns)
            agent = ns.get("agent")
            if not callable(agent):
                raise AgentError("`agent` is not a function")
            out = agent(view)
            if budget.exhausted:
                raise StepLimit()
            moves = normalise_action(out, gt)
            res.moves = moves
            res.grid = apply_moves(g, moves, gt)
        except StepLimit:
            res.error = "timeout (wall clock)" if budget.timeout else "ran out of steps"
        except (Exception, RecursionError) as e:   # noqa: BLE001 - any mistake does nothing
            res.error = f"{type(e).__name__}: {e}"
        finally:
            _ACTIVE.pop()
            decimal.setcontext(decimal.Context())
        if res.error is not None:
            res.moves, res.grid = (), g
        res.steps = budget.steps
        res.used_random, res.used_time, res.used_score = use.random, use.time, use.score
        res.timeout = budget.timeout
        return res


@__import__("functools").lru_cache(maxsize=None)
def _family_index(gt: GridType) -> dict:
    """move -> (mutator id) for every legal move, so score() can batch a whole moves(...) list at once."""
    return {m: m.mid for m in all_moves(gt)}


def _make_score(g: Grid, gt: GridType, owner: Owner, budget: _Budget, use: _Usage):
    from ..agentlang.interp import batch_results
    cache: dict = {}
    fam = _family_index(gt)
    N2 = gt.N ** 2

    def score(x=None):
        """How rare your god finds a grid, in bits: score() for this grid, score(move) or score([moves])
        for this grid after those moves, score(view) for any grid view (e.g. grid.after(...))."""
        use.score = True
        budget.tick(N2)
        if x is None:
            return owner.score(g, gt)
        if isinstance(x, GridView):
            return owner.score(x._lab, gt)
        if isinstance(x, Move):
            v = cache.get(x)
            if v is not None:
                return v
            mid = fam.get(x)
            if mid is not None:          # batch the whole family on first use (same values, faster)
                ms = all_moves(gt, mid)
                sym, col = batch_results(g, ms, gt)
                vals = owner.score_batch(sym, col, gt)
                for m, v in zip(ms, vals.tolist()):
                    cache[m] = v
                return cache[x]
            return owner.score(apply_moves(g, (x,), gt), gt)
        if isinstance(x, (list, tuple)) and all(isinstance(m, Move) for m in x):
            return owner.score(apply_moves(g, x, gt), gt)
        raise TypeError("score() takes nothing, a move, a list of moves, or a grid")
    return score
