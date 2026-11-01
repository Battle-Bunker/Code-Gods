/**
 * python-script-v1: the trusted guest half of script mode, executed into the guest's `__main__` after every snapshot
 * restore (so the pinned bundle and its initialized snapshot are the agents' own, unchanged). It builds on
 * sandbox_guest.py: `_act_setup(seed, 0)` gives the seeded `random`, the virtual clock and the agents' builtins; this
 * adds a capturing `print`, a few more preloaded modules, and the run itself (module, `main(data)`, JSON encoding),
 * whose outcome it leaves in `__main__` for the host to read:
 *
 *   _S_KIND    "" (ok) | "EXECUTION" | "LIMIT" | "DOMAIN" (the input is not JSON; from _s_prepare)
 *   _S_RESULT  the JSON text of main's return value (ASCII, at most RESULT_MAX characters) when ok
 *   _S_ERROR   the error text otherwise (with the line in the script)
 *   _S_WRITES  this run's store writes as JSON {"put": {key: value}, "delete": [key]} (ASCII) when ok
 *   _S_OUTPUT  the captured print() text, at most OUTPUT_MAX UTF-8 bytes; _S_CLIPPED "1" when clipped
 */
export const scriptGuest = ({ resultMax, outputMax, writesMax }) => String.raw`
import sys as _s_sys
_S_RESULT_MAX = ${resultMax}
_S_OUTPUT_MAX = ${outputMax}
_S_WRITES_MAX = ${writesMax}
_S_EXTRA = ("bisect", "numbers")
_S_DUMPS = json.dumps


def _s_print_factory(parts, used):
    def print(*args, sep=" ", end="\n", file=None, flush=False):
        if used[1]:
            return
        text = (" " if sep is None else str(sep)).join(str(a) for a in args) + ("\n" if end is None else str(end))
        size = len(text.encode("utf-8", "replace"))
        if used[0] + size > _S_OUTPUT_MAX:
            room = _S_OUTPUT_MAX - used[0]
            if room > 0:
                cut = text.encode("utf-8", "replace")[:room].decode("utf-8", "ignore")
                parts.append(cut)
                used[0] += len(cut.encode("utf-8"))
            used[1] = True
            return
        parts.append(text)
        used[0] += size
    return print


def _s_import(name, globals=None, locals=None, fromlist=(), level=0):
    if not level and name in _S_EXTRA and name in _s_sys.modules:
        return _STATIC.setdefault(name, _readonly(name, _public(_s_sys.modules[name])))
    try:
        return _agent_import(name, globals, locals, fromlist, level)
    except ImportError:
        raise ImportError(f"{name} is not available to scripts (available: {', '.join(sorted(set(_PRELOADED + _S_EXTRA) - {'ast'}))})") from None


def _s_describe(exc):
    try:
        line = None
        tb = exc.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<script>":
                line = tb.tb_lineno
            tb = tb.tb_next
        text = f"{type(exc).__name__}: {exc}"[:500]
        return text + (f" (line {line})" if line else "")
    except BaseException:
        return "an error"


def _s_finite(v):
    # JSON has no NaN or infinities: they become null, everywhere in the value.
    if isinstance(v, float):
        return v if v == v and v not in (float("inf"), float("-inf")) else None
    if isinstance(v, dict):
        return {k: _s_finite(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_s_finite(x) for x in v]
    return v



class StoreError(Exception):
    """A store call the host would refuse: an invalid key, a value that is not JSON or bytes, a key not loaded."""


_S_KEY = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9_./-]{0,127}")


def _s_key(key, writing):
    if type(key) is not str or not _S_KEY.fullmatch(key) or ".." in key or "//" in key or key.endswith("/"):
        raise StoreError(f"invalid key {key!r}: 1-128 characters of letters, digits, _ - . / (no '..', '//' or trailing '/')")
    if writing and key.startswith("runs/"):
        raise StoreError(f"{key!r}: keys under runs/ are the engine's (past run results) and read-only")
    return key


def _s_encode(value):
    if isinstance(value, (bytes, bytearray)):
        return _S_DUMPS({"$hex": bytes(value).hex()})
    try:
        return _S_DUMPS(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError) as e:
        raise StoreError(f"store values are JSON data or bytes: {e}") from None


def _s_decode(text):
    v = json.loads(text)
    if type(v) is dict and len(v) == 1 and type(v.get("$hex")) is str:
        return bytes.fromhex(v["$hex"])
    return v


class _Store:
    """The run's view of its owner's object store: what run_code loaded, plus this run's writes (committed by the
    engine after the run, if they pass its checks). Nothing here touches a disk or the network."""
    __slots__ = ("get", "put", "delete", "list", "keys")

    def __init__(self, loaded, scope, writes, deletes):
        def covered(key):
            return any(key.startswith(s[:-1]) if s.endswith("*") else key == s for s in scope)

        def get(key, default=None):
            _s_key(key, False)
            if key in writes:
                return _s_decode(writes[key])
            if key in deletes:
                return default
            if not covered(key):
                raise StoreError(f"store.get({key!r}): not loaded; name it (or a prefix like {key.split('/')[0] + '/*'!r}) in run_code's objects")
            return _s_decode(loaded[key]) if key in loaded else default

        def put(key, value):
            _s_key(key, True)
            writes[key] = _s_encode(value)
            deletes.discard(key)

        def delete(key):
            _s_key(key, True)
            writes.pop(key, None)
            deletes.add(key)

        def keys(prefix=""):
            names = (set(loaded) | set(writes)) - deletes
            return sorted(k for k in names if k.startswith(prefix))

        object.__setattr__(self, "get", get)
        object.__setattr__(self, "put", put)
        object.__setattr__(self, "delete", delete)
        object.__setattr__(self, "keys", keys)
        object.__setattr__(self, "list", keys)

    def __setattr__(self, k, v):
        raise AttributeError("store is read-only; use store.put")

    def __repr__(self):
        return "<store: get, put, delete, list>"


def _s_prepare():
    # Trusted, outside the budget: decode the host's JSON text into the value main receives, and the loaded objects.
    global _S_DATA, _S_INPUT, _S_KIND, _S_ERROR, _S_STORE, _S_STORE_IN, _S_WRITES_STATE
    _S_KIND, _S_ERROR = "", ""
    try:
        _S_DATA = json.loads(_S_INPUT)
        spec = json.loads(_S_STORE_IN)
        loaded = {k: _S_DUMPS(v, ensure_ascii=True, separators=(",", ":")) for k, v in spec["objects"].items()}
        writes, deletes = {}, set()
        _S_WRITES_STATE = (writes, deletes)
        _S_STORE = _Store(loaded, list(spec["scope"]), writes, deletes)
    except Exception as e:
        _S_KIND, _S_ERROR = "DOMAIN", f"The input is not JSON: {e}"[:500]
    _S_INPUT = None
    _S_STORE_IN = None


def _s_run(code):
    global _S_KIND, _S_RESULT, _S_ERROR, _S_OUTPUT, _S_CLIPPED, _S_DATA, _S_WRITES
    parts, used = [], [0, False]
    _S_KIND, _S_RESULT, _S_ERROR, _S_WRITES = "", "", "", ""
    b = dict(_AGENT_BUILTINS)
    b["print"] = _s_print_factory(parts, used)
    b["__import__"] = _s_import
    b["StoreError"] = StoreError
    g = {"__builtins__": b, "__name__": "__main__", "store": _S_STORE}
    data, _S_DATA = _S_DATA, None
    try:
        exec(code, g)
        main = g.get("main")
        if not callable(main):
            raise _ScriptShape("The script must define a function main(data), like:\n    def main(data):\n        return {'answer': 42}")
        value = main(data)
        data = None
        try:
            text = _S_DUMPS(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
        except ValueError:
            text = _S_DUMPS(_s_finite(value), ensure_ascii=True, allow_nan=False, separators=(",", ":"))
        except TypeError as e:
            raise _ScriptShape(f"main must return JSON data (dicts, lists, strings, numbers, booleans, None): {e}") from None
        if type(text) is not str or len(text) > _S_RESULT_MAX:
            _S_KIND, _S_ERROR = "LIMIT", f"The script's result is larger than {_S_RESULT_MAX} bytes of JSON: return less (a summary, the top rows)"
        else:
            _S_RESULT = text
            writes, deletes = _S_WRITES_STATE
            out = "{\"put\":{" + ",".join(_S_DUMPS(k) + ":" + v for k, v in sorted(writes.items())) + "},\"delete\":" + _S_DUMPS(sorted(deletes)) + "}"
            if len(out) > _S_WRITES_MAX:
                _S_KIND, _S_ERROR = "LIMIT", f"The script's store writes are larger than {_S_WRITES_MAX} bytes: write less per run"
            else:
                _S_WRITES = out
    except _ScriptShape as e:
        _S_KIND, _S_ERROR = "EXECUTION", str(e)
    except MemoryError:
        _S_KIND, _S_ERROR = "LIMIT", "Memory limit exceeded: the script used too much memory"
    except RecursionError as e:
        _S_KIND, _S_ERROR = "EXECUTION", _s_describe(e)
    except BaseException as e:
        _S_KIND, _S_ERROR = "EXECUTION", "The script raised an error: " + _s_describe(e)
    finally:
        try:
            _S_OUTPUT = "".join(parts)
        except BaseException:
            _S_OUTPUT = ""
        _S_CLIPPED = "1" if used[1] else ""


class _ScriptShape(Exception):
    pass
`;
