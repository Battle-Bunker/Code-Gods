"""Warm snapshot-isolated CPython/Wasm reactor; host never evaluates Python.

Grammar python-agent-v1: a module that defines a top-level `def agent(obj)`.
An act runs the room's trusted prelude and `__decode(input)` outside the guest
budget, then the submitted module, `agent(obj)` and `__encode_calls(result)`
inside it, and returns the exact ASCII string the encoder produced.

Only preloaded bundled computational modules are supported during execution.
All WASI imports except clocks and entropy are denied after trusted bootstrap.
Snapshots include all memory and mutable globals; reactor.py proves the pinned
module has no table mutation instructions. Memory growth/traps discard stores.
Preparation is separately bounded. CPU sampling/fuel and a wall watchdog are
best-effort ceilings, not a physical real-time scheduling guarantee.
"""
import collections
import contextlib
import ctypes
import gc
import hashlib
import json
import pathlib
import struct
import sys
import threading
import time
import wasmtime
from domain import (GRAMMAR, CALLS_MAX, PRELUDE_PART_MAX, Compile, Config, Domain,
                    Execution, Limit, settings, check_input)
from reactor import transform

ROOT = pathlib.Path(__file__).resolve().parents[3]
PACKAGED = pathlib.Path(__file__).resolve().parents[1] / "dist" / "python-3.15.0"
CACHE = PACKAGED if PACKAGED.is_dir() else ROOT / ".cache" / "code-gods" / "python-3.15.0"
MAX_REQUEST = 524288
CACHE_ENTRIES = 128
CACHE_BYTES = 4 * 1024 * 1024
PY_FILE_INPUT = 257
PINNED_WASM_SHA256 = "9f58ad347987d0a23def7eefa5aa5e8ffaef529fba26979350c44376d6b8fae3"
BOOT = """
import ast, json, math, random, time, sys, collections, functools, itertools, operator, statistics
import re, decimal, fractions, hashlib
import os
os.environ.pop('PYTHONHOME', None)
class _BlockedOutput:
    def write(self, *args): raise PermissionError('Guest I/O is disabled')
    def flush(self): pass
sys.stdout = sys.stderr = _BlockedOutput()
_EXAMPLE = '\\n    def agent(grid):\\n        return []'
def _price(tree):
    def size(v):
        if v is None or isinstance(v, bool): return 1
        if isinstance(v, str): return len(v.encode('utf-8', 'surrogatepass'))
        if isinstance(v, bytes): return len(v)
        if isinstance(v, int):
            bits = v.bit_length()+1 if v >= 0 else (~v).bit_length()+1
            return max(1, (bits+7)//8)
        if isinstance(v, float): return 8
        if isinstance(v, complex): return 16
        if v is Ellipsis: return 1
        raise ValueError('Unsupported constant')
    return sum(size(n.value) if isinstance(n, ast.Constant) else 1 for n in ast.walk(tree))
def _inspect(source):
    # Parses and prices; never evaluates. Returns (cost, '') or (-1, message).
    try:
        return _shape(ast.parse(source, mode='exec'))
    except Exception as e:
        return -1, f'SyntaxError: {type(e).__name__}: {e}'[:500]
def _shape(tree):
    found = [n for n in tree.body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == 'agent']
    if not found:
        return -1, ('SyntaxError: an agent must define a function named agent at the top '
                    'level, like:' + _EXAMPLE)
    if len(found) > 1:
        return -1, f'SyntaxError: agent is defined more than once (line {found[1].lineno})'
    f = found[0]
    if isinstance(f, ast.AsyncFunctionDef):
        return -1, f'SyntaxError: agent must be a plain def, not async def (line {f.lineno})'
    a = f.args
    positional = a.posonlyargs + a.args
    required = len(positional) - len(a.defaults)
    if (required > 1 or (not positional and a.vararg is None)
            or any(d is None for d in a.kw_defaults)):
        return -1, (f'SyntaxError: agent must take exactly one argument (line {f.lineno}), '
                    'like:' + _EXAMPLE)
    return _price(tree), ''
def _explain(source):
    try:
        compile(source, '<agent>', 'exec')
    except SyntaxError as e:
        text = (e.text or '').split('\\n')[0]
        column = max(min(e.offset or 1, len(text) + 1), 1)
        start = max(column - 60, 0)
        where = f' (line {e.lineno}, column {e.offset})' if e.lineno else ''
        caret = f'\\n    {text[start:column + 20]}\\n    {" " * (column - 1 - start)}^' if text else ''
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
"""


def describe_trap(trap, phase, budget):
    text = str(trap)
    if phase == "prepare":
        return "Time limit exceeded: compiling the agent took longer than 3 seconds"
    if any(sign in text for sign in ("all fuel consumed", "interrupt", "CPU budget", "watchdog")):
        return (f"Time limit exceeded: the agent used more than its {budget:g} ms compute "
                "budget for one interaction. Do less work per call.")
    if "call stack exhausted" in text:
        return "Recursion too deep: the agent exhausted the call stack"
    if "out of bounds" in text or "memory" in text:
        return "Memory limit exceeded: the agent used too much memory"
    return "The agent crashed the sandbox: " + text.split("Caused by:")[-1].strip()[:200]


def digest(prelude):
    """Collision-resistant identity of the exact trusted prelude text (cache keys)."""
    return hashlib.sha256(json.dumps([prelude["python"], prelude["js"], prelude["dts"]])
                          .encode()).hexdigest()


class Runner:
    def __init__(self):
        config = wasmtime.Config()
        config.consume_fuel = True
        config.epoch_interruption = True
        config.max_wasm_stack = 1024 * 1024
        self.engine = wasmtime.Engine(config)
        binary, self.global_count, sha = transform((CACHE / "python.wasm").read_bytes())
        if sha != PINNED_WASM_SHA256:
            raise ValueError("Unrecognized CPython WASI binary")
        self.module = wasmtime.Module(self.engine, binary)
        # Trusted compiler output only: user modules and room preludes, LRU-bounded.
        self.cache = collections.OrderedDict()
        self.cache_bytes = 0
        self.seed = None
        self.store = None
        with self.bounded(3):
            self.new_store()
            self.call("__wasm_call_ctors")
            config_ptr = self.call("malloc", 4096)
            status = self.call("malloc", 64)
            self.memory.write(self.store, bytes(4096), config_ptr)
            self.call("PyConfig_InitPythonConfig", config_ptr)
            self.call("Py_InitializeFromConfig", status, config_ptr)
            if struct.unpack("<i", self.memory.read(self.store, status, status + 4))[0]:
                raise RuntimeError("CPython initialization failed")
            self.call("PyConfig_Clear", config_ptr)
            self.call("free", config_ptr)
            self.call("free", status)
            self.simple(BOOT)
            self.source_buffer = self.call("malloc", 16385)
            self.prelude_buffer = self.call("malloc", PRELUDE_PART_MAX + 1)
            self.input_buffer = self.call("malloc", 8193)
            self.size_buffer = self.call("malloc", 4)
            self.pointer_buffer = self.call("malloc", 4)
            self.code_buffer = self.call("malloc", 1024 * 1024)
            self.filename = self.cstring("<agent>")
            self.prelude_filename = self.cstring("<prelude>")
            self.builtins_key = self.cstring("__builtins__")
            self.name_key = self.cstring("__name__")
            self.decode_key = self.cstring("__decode")
            self.agent_key = self.cstring("agent")
            self.encode_key = self.cstring("__encode_calls")
            self.exc_key = self.cstring("_exc")
            self.module_name = self.call("PyUnicode_FromStringAndSize", self.agent_key, 5)
            self.str_type = self.call("PyObject_Type", self.module_name)
            self.startup = False
            self.seed = self.snapshot()

    @contextlib.contextmanager
    def bounded(self, wall_seconds, cpu_ms=None):
        # Wasmtime wrapper cycles are host bookkeeping, not guest computation.
        # Defer host cyclic collection until after the timed guest phase.
        collect_later = cpu_ms is not None and gc.isenabled()
        if collect_later:
            gc.disable()
        stop = threading.Event()
        cpu_start = None
        deadline = None
        def watch():
            while not stop.wait(0.0005 if cpu_ms is not None else 0.01):
                if deadline is not None and (time.monotonic() >= deadline or
                    cpu_ms is not None and time.process_time_ns()-cpu_start >= cpu_ms*1_000_000):
                    self.engine.increment_epoch()
                    return
        thread = threading.Thread(target=watch, daemon=True)
        thread.start()
        try:
            if self.store:
                self.store.set_epoch_deadline(1)
            # Watchdog construction is trusted setup, not submitted computation.
            cpu_start = time.process_time_ns()
            deadline = time.monotonic() + wall_seconds
            yield
            if time.monotonic() >= deadline:
                raise wasmtime.Trap("Wall watchdog limit exceeded")
            if cpu_ms is not None and time.process_time_ns()-cpu_start >= cpu_ms*1_000_000:
                raise wasmtime.Trap("Interaction process CPU budget exceeded")
        finally:
            stop.set()
            thread.join()
            if collect_later:
                gc.enable()

    def new_store(self):
        if self.store is not None:
            self.store.close()
            self.linker.close()
            self.shim_linker.close()
        self.store = wasmtime.Store(self.engine)
        self.store.set_limits(memory_size=128*1024*1024, table_elements=100000,
                              instances=2, tables=1, memories=1)
        self.store.set_fuel(10_000_000_000)
        self.store.set_epoch_deadline(1)
        wasi = wasmtime.WasiConfig()
        wasi.argv = ["python", "-S", "-B"]
        wasi.env = [("PYTHONHOME", "/"), ("PYTHONHASHSEED", "0")]
        wasi.preopen_dir(str(CACHE / "lib"), "/lib", fs_mutable=False)
        self.store.set_wasi(wasi)
        self.startup = self.seed is None
        self.linker = wasmtime.Linker(self.engine)
        delegated = {}
        imports, wrappers = [], []
        for index, item in enumerate(self.module.imports):
            if item.module != "wasi_snapshot_preview1":
                raise ValueError("Unexpected module import")
            name, typ = item.name, item.type
            def dispatch(caller, *args, name=name, typ=typ):
                if name == "random_get" and not self.startup and not 0 <= args[1] <= 65536:
                    return 28
                if self.startup or name in ("clock_time_get", "clock_res_get", "random_get"):
                    return delegated[name](caller, *args)
                if len(typ.results) == 1:
                    return 76  # WASI ENOTCAPABLE, regardless of recovered Python APIs
                raise wasmtime.Trap("Guest I/O/process capability denied")
            self.linker.define_func(item.module, name, typ, dispatch, True)
            params = " ".join(str(t) for t in typ.params)
            results = " ".join(str(t) for t in typ.results)
            sig = f"(param {params})" if params else ""
            sig += f" (result {results})" if results else ""
            imports.append(f'(import "{item.module}" "{name}" (func $f{index} {sig}))')
            gets = " ".join(f"local.get {i}" for i in range(len(typ.params)))
            wrappers.append(f'(func (export "{name}") {sig} {gets} call $f{index})')
        self.instance = self.linker.instantiate(self.store, self.module)
        self.exports = self.instance.exports(self.store)
        self.memory = self.exports["memory"]
        if not hasattr(self, "shim_module"):
            wat = '(module (import "guest" "memory" (memory 0)) (export "memory" (memory 0)) '
            self.shim_module = wasmtime.Module(self.engine, wat + " ".join(imports + wrappers) + ")")
        self.shim_linker = wasmtime.Linker(self.engine)
        self.shim_linker.define_wasi()
        self.shim_linker.define(self.store, "guest", "memory", self.memory)
        shim = self.shim_linker.instantiate(self.store, self.shim_module)
        delegated.update(shim.exports(self.store))

    def call(self, name, *args):
        return self.exports[name](self.store, *args)

    def cstring(self, text):
        data = text.encode() + b"\0"
        pointer = self.call("malloc", len(data))
        self.memory.write(self.store, data, pointer)
        return pointer

    def simple(self, code):
        pointer = self.cstring(code)
        try:
            if self.call("PyRun_SimpleString", pointer):
                raise ValueError("Python trusted preparation failed")
        finally:
            self.call("free", pointer)

    def main_string(self, name, fallback):
        main_dict = self.call("PyModule_GetDict", self.call("PyImport_AddModule", self.cstring("__main__")))
        value = self.call("PyDict_GetItemString", main_dict, self.cstring(name))
        pointer = value and self.call("PyUnicode_AsUTF8AndSize", value, self.size_buffer)
        if not pointer:
            self.call("PyErr_Clear")
            return fallback
        length = struct.unpack("<i", self.memory.read(self.store, self.size_buffer, self.size_buffer+4))[0]
        return bytes(self.memory.read(self.store, pointer, pointer+min(length, 2000))).decode("utf-8", "replace")

    def snapshot(self):
        if self.memory.data_len(self.store) > 48 * 1024 * 1024:
            raise ValueError("Prepared snapshot exceeds 48 MiB limit")
        memory = ctypes.string_at(self.memory.data_ptr(self.store), self.memory.data_len(self.store))
        globals_ = tuple(self.exports[f"snapshot_global_{i}"].value(self.store)
                         for i in range(self.global_count))
        return memory, globals_

    def restore(self, snapshot):
        memory, globals_ = snapshot
        if self.store is None or self.memory.data_len(self.store) > len(memory):
            self.new_store()
        missing = len(memory) - self.memory.data_len(self.store)
        if missing:
            self.memory.grow(self.store, missing // 65536)
        ctypes.memmove(self.memory.data_ptr(self.store), memory, len(memory))
        for i, value in enumerate(globals_):
            glob = self.exports[f"snapshot_global_{i}"]
            if glob.type(self.store).mutable:
                glob.set_value(self.store, value)
        self.store.set_fuel(10_000_000_000)
        self.store.set_epoch_deadline(1)
        self.startup = False

    def remember(self, key, item):
        size = item[2]
        while self.cache and (len(self.cache) >= CACHE_ENTRIES or self.cache_bytes + size > CACHE_BYTES):
            _, old = self.cache.popitem(last=False)
            self.cache_bytes -= old[2]
        self.cache[key] = item
        self.cache_bytes += size
        return item

    def marshal(self, code):
        # Only trusted compiler output reaches marshal. No submitted byte stream
        # is ever decoded, and no submitted code has executed at this point.
        # Version 5 is required for the slice constants CPython 3.14+ folds from `s[1:]`.
        marshalled = self.call("PyMarshal_WriteObjectToString", code, 5)
        if not marshalled or self.call("PyBytes_AsStringAndSize", marshalled,
                                      self.pointer_buffer, self.size_buffer):
            raise ValueError("Code serialization failed")
        pointer = struct.unpack("<I", self.memory.read(
            self.store, self.pointer_buffer, self.pointer_buffer+4))[0]
        length = struct.unpack("<i", self.memory.read(
            self.store, self.size_buffer, self.size_buffer+4))[0]
        if not 0 < length <= 1024 * 1024:
            raise ValueError("Compiled code exceeds 1 MiB limit")
        return bytes(self.memory.read(self.store, pointer, pointer+length))

    def prepare_prelude(self, text, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        self.restore(self.seed)
        self.memory.write(self.store, text.encode() + b"\0", self.prelude_buffer)
        code = self.call("Py_CompileString", self.prelude_buffer, self.prelude_filename, PY_FILE_INPUT)
        if not code:
            self.call("PyErr_Clear")
            raise Config("The room's Python prelude does not compile")
        blob = self.marshal(code)
        return self.remember(key, (blob, -1, len(blob) + sum(len(part) for part in key)))

    def prepare(self, source, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        self.restore(self.seed)
        self.memory.write(self.store, source.encode() + b"\0", self.source_buffer)
        code = self.call("Py_CompileString", self.source_buffer, self.filename, PY_FILE_INPUT)
        if not code:
            self.call("PyErr_Clear")
            # Recompiling inside the guest (never the host) recovers the real message.
            self.simple(f"_compile_error = _explain({source!r})")
            raise Compile(self.main_string("_compile_error", "SyntaxError: invalid Python module"))
        # Shape check and price parse the source again; nothing is evaluated.
        self.simple(f"_inspection_cost, _compile_error = _inspect({source!r})")
        main_dict = self.call("PyModule_GetDict", self.call("PyImport_AddModule", self.cstring("__main__")))
        cost = self.call("PyLong_AsLong", self.call("PyDict_GetItemString", main_dict,
                                                    self.cstring("_inspection_cost")))
        if cost < 0:
            raise Compile(self.main_string("_compile_error", "SyntaxError: invalid agent"))
        blob = self.marshal(code)
        return self.remember(key, (blob, cost, len(blob) + sum(len(part.encode()) for part in key)))

    def load(self, blob):
        self.memory.write(self.store, blob, self.code_buffer)
        code = self.call("PyMarshal_ReadObjectFromString", self.code_buffer, len(blob))
        if not code:
            raise ValueError("Trusted code deserialization failed")
        return code

    def guest_error(self, what):
        """The guest's own exception text, computed inside the guest (and its budget)."""
        exc = self.call("PyErr_GetRaisedException")
        self.call("PyErr_Clear")
        detail = "an error"
        if exc:
            main_dict = self.call("PyModule_GetDict", self.call("PyImport_AddModule", self.cstring("__main__")))
            if not self.call("PyDict_SetItemString", main_dict, self.exc_key, exc):
                try:
                    self.simple("_error = _describe(_exc)")
                    detail = self.main_string("_error", detail)
                except ValueError:
                    self.call("PyErr_Clear")
        return Execution(f"{what}: {detail}")

    def run(self, request, *, seconds=None, fuel=None, on_execute=None):
        if request.get("mode") not in ("inspect", "act"):
            raise ValueError("Unknown runner mode")
        source = request.get("source")
        if not isinstance(source, str) or "\0" in source or len(source.encode()) > 16384:
            raise Compile("Source must be a NUL-free string of at most 16384 bytes")
        domain = settings(request)
        budget = domain["interactionComputeMs"]
        prelude = domain["prelude"]
        if request["mode"] == "act":
            check_input(request.get("input"), domain)
        identity = digest(prelude)
        key = (GRAMMAR, domain["objectType"], prelude["key"], identity, source)
        phase = "prepare"
        try:
            with self.bounded(3):
                prelude_blob = self.prepare_prelude(prelude["python"], ("prelude", prelude["key"], identity))[0]
                blob, cost, _ = self.prepare(source, key)
                if request["mode"] == "inspect":
                    return {"cost": cost}
                # Fresh guest: every act starts from the one trusted snapshot.
                self.restore(self.seed)
                prelude_code = self.load(prelude_blob)
                code = self.load(blob)
                globals_ = self.call("PyDict_New")
                if (self.call("PyDict_SetItemString", globals_, self.builtins_key,
                              self.call("PyEval_GetBuiltins"))
                        or self.call("PyDict_SetItemString", globals_, self.name_key, self.module_name)):
                    raise ValueError("Guest globals preparation failed")
                # Entropy must be refreshed AFTER restoring random module state.
                self.simple("random.seed(None)")
                # Trusted prelude and decode: outside the guest budget.
                if not self.call("PyEval_EvalCode", prelude_code, globals_, globals_):
                    self.call("PyErr_Clear")
                    raise Config("The room's Python prelude failed to run")
                decode = self.call("PyDict_GetItemString", globals_, self.decode_key)
                if not decode or not self.call("PyDict_GetItemString", globals_, self.encode_key):
                    raise Config("The room's prelude must define __decode and __encode_calls")
                value = request["input"]
                if type(value) is int:
                    argument = self.call("PyLong_FromLongLong", value)
                else:
                    self.memory.write(self.store, value.encode() + b"\0", self.input_buffer)
                    argument = self.call("PyUnicode_FromStringAndSize", self.input_buffer, len(value))
                obj = argument and self.call("PyObject_CallOneArg", decode, argument)
                if not obj:
                    self.call("PyErr_Clear")
                    raise Config("The room's prelude could not decode the input")
            # Conservative instruction ceiling, not an instruction-to-time promise.
            # The independent process-CPU sampler enforces the configured time
            # budget; epoch interruption and the parent wall deadline back it up.
            phase = "execute"
            self.store.set_fuel(fuel if fuel is not None else int(budget * 150000))
            if on_execute:
                on_execute()
            with self.bounded(seconds if seconds is not None else max(0.05, budget/1000*10), budget):
                if not self.call("PyEval_EvalCode", code, globals_, globals_):
                    raise self.guest_error("The agent's module raised an error")
                # Looked up after the module ran: the guest owns its globals.
                agent = self.call("PyDict_GetItemString", globals_, self.agent_key)
                if not agent:
                    raise Execution("The agent's module no longer defines agent")
                calls = self.call("PyObject_CallOneArg", agent, obj)
                if not calls:
                    raise self.guest_error("agent raised an error")
                # The encoder is untrusted-equivalent (the guest can monkeypatch it
                # or anything it uses); the host parses and validates its output.
                encode = self.call("PyDict_GetItemString", globals_, self.encode_key)
                if not encode:
                    raise Execution("The agent removed __encode_calls")
                result = self.call("PyObject_CallOneArg", encode, calls)
                if not result:
                    raise self.guest_error("Encoding agent's calls failed")
                # Exact str only: no subclass, no repr/str/JSON hook is invoked.
                if self.call("PyObject_Type", result) != self.str_type:
                    raise Domain("agent must return a list of mutator calls (the encoder did not produce a string)")
                if self.call("PyUnicode_GetLength", result) > CALLS_MAX:
                    raise Limit(f"agent returned too many mutator calls (encoded output over {CALLS_MAX} bytes)")
                pointer = self.call("PyUnicode_AsUTF8AndSize", result, self.size_buffer)
                length = struct.unpack("<i", self.memory.read(
                    self.store, self.size_buffer, self.size_buffer+4))[0]
                if not pointer:
                    self.call("PyErr_Clear")
                    raise Domain("Encoded calls must be an ASCII string")
                if not 0 <= length <= CALLS_MAX:
                    raise Limit(f"agent returned too many mutator calls (encoded output over {CALLS_MAX} bytes)")
                data = bytes(self.memory.read(self.store, pointer, pointer+length))
                if not data.isascii():
                    raise Domain("Encoded calls must be an ASCII string")
                return {"calls": data.decode("ascii")}
        except wasmtime.Trap as trap:
            # A trap can interrupt C stack unwinding. Never reuse that store.
            self.new_store()
            raise Limit(describe_trap(trap, phase, budget)) from None


def code_of(error):
    if isinstance(error, (wasmtime.Trap, Limit)):
        return "LIMIT"
    for cls, code in ((Compile, "COMPILE"), (Domain, "DOMAIN"), (Config, "CONFIG")):
        if isinstance(error, cls):
            return code
    return "EXECUTION"


if __name__ == "__main__":
    runner = Runner()
    print(json.dumps({"ready": True, "executionPhases": True}), flush=True)
    while True:
        line = sys.stdin.buffer.readline(MAX_REQUEST + 1)
        if not line:
            break
        if len(line) > MAX_REQUEST:
            print(json.dumps({"error": "Request too large"}), flush=True)
            break
        try:
            result = runner.run(json.loads(line), on_execute=lambda: print(
                json.dumps({"phase": "execute"}), flush=True))
            print(json.dumps({"ok": True, **result}), flush=True)
        except Exception as error:
            print(json.dumps({"ok": False, "code": code_of(error),
                              "error": str(error)[-2000:]}), flush=True)
