"""The trusted guest of the v2 sandbox, run once into CPython's __main__ at bootstrap (so it is part of the
initialized snapshot, and every act starts from a pristine copy of it). Copied from lib/game-runtime's
boot_guest.py and sandbox_guest.py and cleaned (no summon pricing, no read meter); the pinned bundle's own copies of
those files are not run.

Per act, the host calls `_act_setup(seed, step_limit)` before the guest library (guest/codegods.py) runs, then
`_instrument(code)` on the agent's freshly unmarshalled module code object.

* Builtins: a fresh dict per act without `open eval exec compile input breakpoint globals locals vars id
  memoryview ...`; `print` does nothing; `__import__` serves only the preloaded computational modules, as read-only
  proxies (public attributes only, assignment refused).
* `random` is a private `Random(seed)`, seeded by the host per act. `SystemRandom` is unavailable.
* `time` is the real module behind a proxy: the HOST answers WASI clock reads with a virtual clock
  (2026-01-01T00:00:00Z + 1 µs per read, restarted every act). `sleep` is unavailable.
* Steps: `sys.monitoring` counts every LINE and JUMP event in the agent's own code objects. Over the limit,
  `_StepLimit` (a BaseException) is raised, and raised again at every later event. Every 10,000 steps the clock is
  read, so the host can end an act past its time cap.
* The channel: `_HOST(request)` writes a 4-byte little-endian length and the request to WASI descriptor 3 and reads
  the reply framed the same way (spec §6.5). The host puts it in each act's globals as `__host`.
* Agent source: `agent` defined once at top level with one parameter, and no names starting with `_`, `getattr`
  and the like (`_shape`), so the step counter and the channel's internals stay out of reach.

These proxies are a model of the contract, not the isolation boundary: Wasm, the denied WASI imports, the snapshot
restore and the host-side checks are.
"""
import ast, json, math, random, time, sys, collections, functools, itertools, operator, statistics
import re, decimal, fractions, hashlib
import os
os.environ.pop('PYTHONHOME', None)
class _BlockedOutput:
    def write(self, *args): raise PermissionError('Guest I/O is disabled')
    def flush(self): pass
sys.stdout = sys.stderr = _BlockedOutput()
_EXAMPLE = '\n    def agent(offer):\n        return None'
# Agent source rule: no name that could reach past the guest library into the sandbox (the step counter, the channel).
_BAD_ATTRS = frozenset((
    'gi_frame gi_code gi_yieldfrom cr_frame cr_code cr_await ag_frame ag_code ag_await f_back f_globals '
    'f_locals f_builtins f_code tb_frame tb_next cell_contents format format_map mro').split())
_BAD_NAMES = frozenset('getattr setattr delattr attrgetter methodcaller vars globals locals'.split())
def _reach(tree):
    # The first (by line) use of a name the sandbox keeps for itself, as an error message, or ''.
    found = []
    def hit(node, name, attr=False):
        line = getattr(node, 'lineno', 0) or 0
        col = getattr(node, 'col_offset', 0) or 0
        if name in _BAD_NAMES:
            text = (f'agents can\'t use {name} (line {line}): read the object through the offer '
                    '(offer.view("si").m, ...)')
        elif attr and name in _BAD_ATTRS:
            text = (f'agents can\'t use ".{name}" (line {line}): it reaches into the sandbox'
                    + (', build text with f-strings or + instead' if name.startswith('format') else ''))
        elif len(name) > 1 and name[0] == '_':
            text = f'agents can\'t use "{name}" (line {line}): names starting with _ belong to the sandbox'
        else:
            return
        found.append((line, col, text))
    for node in ast.walk(tree):
        if isinstance(node, ast.Name): hit(node, node.id)
        elif isinstance(node, ast.Attribute): hit(node, node.attr, True)
        elif isinstance(node, ast.arg): hit(node, node.arg)
        elif isinstance(node, ast.keyword):
            if node.arg: hit(node, node.arg)
        elif isinstance(node, ast.alias):
            for part in node.name.split('.'): hit(node, part)
            if node.asname: hit(node, node.asname)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            for n in node.names: hit(node, n)
    return min(found)[2] if found else ''
def _shape(tree, reach=True):
    found = [n for n in tree.body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == 'agent']
    if not found:
        return ('SyntaxError: an agent must define a function named agent at the top '
                'level, like:' + _EXAMPLE)
    if len(found) > 1:
        return f'SyntaxError: agent is defined more than once (line {found[1].lineno})'
    f = found[0]
    if isinstance(f, ast.AsyncFunctionDef):
        return f'SyntaxError: agent must be a plain def, not async def (line {f.lineno})'
    a = f.args
    positional = a.posonlyargs + a.args
    required = len(positional) - len(a.defaults)
    if (required > 1 or (not positional and a.vararg is None)
            or any(d is None for d in a.kw_defaults)):
        return (f'SyntaxError: agent must take exactly one argument (line {f.lineno}), '
                'like:' + _EXAMPLE)
    found = _reach(tree) if reach else ''
    return 'SyntaxError: ' + found if found else ''
def _explain(source):
    try:
        compile(source, '<agent>', 'exec')
    except SyntaxError as e:
        text = (e.text or '').split('\n')[0]
        column = max(min(e.offset or 1, len(text) + 1), 1)
        start = max(column - 60, 0)
        where = f' (line {e.lineno}, column {e.offset})' if e.lineno else ''
        caret = f'\n    {text[start:column + 20]}\n    {" " * (column - 1 - start)}^' if text else ''
        return f'SyntaxError: {e.msg}{where}{caret}'
    except Exception as e:
        return f'{type(e).__name__}: {e}'
    return 'SyntaxError: invalid Python module'
def _describe(exc):
    # Runs inside the guest budget: user __str__/__name__ hooks may run here.
    try:
        line = None
        tb = exc.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<agent>':
                line = tb.tb_lineno
            tb = tb.tb_next
        text = f'{type(exc).__name__}: {exc}'[:500]
        return text + (f' (line {line})' if line else '')
    except BaseException:
        return 'an error'

import builtins
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


_NOW = time.monotonic


def _on_event(*_a):
    global _steps
    _steps += 1
    if _steps > _step_limit:
        raise _StepLimit("ran out of steps")
    if not _steps % 10000:
        _NOW()   # the host checks the act's time cap at this clock read (a deterministic point)


_MON.use_tool_id(_TOOL, "code-gods-steps")
_MON.register_callback(_TOOL, _MON.events.LINE, _on_event)
_MON.register_callback(_TOOL, _MON.events.JUMP, _on_event)


def _instrument(code):
    todo = [code]
    while todo:
        c = todo.pop()
        _MON.set_local_events(_TOOL, c, _MON.events.LINE | _MON.events.JUMP)
        todo.extend(k for k in c.co_consts if isinstance(k, types.CodeType))


def _host_factory(limit, oversize):
    write, read = os.write, os.read

    def take(n):
        out = b""
        while len(out) < n:
            chunk = read(3, n - len(out))
            if not chunk:
                raise OSError("the host channel is closed")
            out += chunk
        return out

    def host(request):
        if type(request) is not str:
            raise TypeError("a host request is JSON text")
        data = request.encode("utf-8", "replace")
        if len(data) > limit:
            return oversize
        frame = len(data).to_bytes(4, "little") + data
        while frame:
            frame = frame[write(3, frame):]
        return take(int.from_bytes(take(4), "little")).decode("utf-8", "replace")
    return host
