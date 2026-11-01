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
 *   _S_OUTPUT  the captured print() text, at most OUTPUT_MAX UTF-8 bytes; _S_CLIPPED "1" when clipped
 */
export const scriptGuest = ({ resultMax, outputMax }) => String.raw`
import sys as _s_sys
_S_RESULT_MAX = ${resultMax}
_S_OUTPUT_MAX = ${outputMax}
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


def _s_prepare():
    # Trusted, outside the budget: decode the host's JSON text into the value main receives.
    global _S_DATA, _S_INPUT, _S_KIND, _S_ERROR
    _S_KIND, _S_ERROR = "", ""
    try:
        _S_DATA = json.loads(_S_INPUT)
    except Exception as e:
        _S_KIND, _S_ERROR = "DOMAIN", f"The input is not JSON: {e}"[:500]
    _S_INPUT = None


def _s_run(code):
    global _S_KIND, _S_RESULT, _S_ERROR, _S_OUTPUT, _S_CLIPPED, _S_DATA
    parts, used = [], [0, False]
    _S_KIND, _S_RESULT, _S_ERROR = "", "", ""
    b = dict(_AGENT_BUILTINS)
    b["print"] = _s_print_factory(parts, used)
    b["__import__"] = _s_import
    g = {"__builtins__": b, "__name__": "__main__"}
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
