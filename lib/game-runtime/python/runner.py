"""Warm snapshot-isolated CPython/Wasm reactor; host never evaluates Python.

Only preloaded bundled computational modules are supported during execution.
All WASI imports except clocks and entropy are denied after trusted bootstrap.
Snapshots include all memory and mutable globals; reactor.py proves the pinned
module has no table mutation instructions. Memory growth/traps discard stores.
Preparation is separately bounded; the guest budget covers eval, call, and exact
primitive result extraction. CPU sampling/fuel and a wall watchdog are best-
effort ceilings, not a physical real-time scheduling guarantee.
"""
import collections
import contextlib
import ctypes
import gc
import json
import pathlib
import struct
import sys
import threading
import time
import wasmtime
from domain import settings, check
from reactor import transform

ROOT = pathlib.Path(__file__).resolve().parents[3]
PACKAGED = pathlib.Path(__file__).resolve().parents[1] / "dist" / "python-3.15.0"
CACHE = PACKAGED if PACKAGED.is_dir() else ROOT / ".cache" / "code-gods" / "python-3.15.0"
MAX_REQUEST = 131072
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
def _price(source):
    def size(v):
        if v is None or isinstance(v, bool): return 1
        if isinstance(v, str): return len(v.encode('utf-8'))
        if isinstance(v, bytes): return len(v)
        if isinstance(v, int):
            bits = v.bit_length()+1 if v >= 0 else (~v).bit_length()+1
            return max(1, (bits+7)//8)
        if isinstance(v, float): return 8
        if isinstance(v, complex): return 16
        raise ValueError('Unsupported constant')
    return sum(size(n.value) if isinstance(n, ast.Constant) else 1
               for n in ast.walk(ast.parse(source, mode='eval')))
"""


class Runner:
    def __init__(self):
        config = wasmtime.Config()
        config.consume_fuel = True
        config.epoch_interruption = True
        config.max_wasm_stack = 1024 * 1024
        self.engine = wasmtime.Engine(config)
        binary, self.global_count, digest = transform((CACHE / "python.wasm").read_bytes())
        if digest != PINNED_WASM_SHA256:
            raise ValueError("Unrecognized CPython WASI binary")
        self.module = wasmtime.Module(self.engine, binary)
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
            self.input_buffer = self.call("malloc", 8193)
            self.size_buffer = self.call("malloc", 4)
            self.pointer_buffer = self.call("malloc", 4)
            self.code_buffer = self.call("malloc", 1024 * 1024)
            self.filename = self.cstring("<agent>")
            self.builtins_key = self.cstring("__builtins__")
            self.int_type = self.call("PyObject_Type", self.call("PyLong_FromLong", 0))
            self.str_type = self.call("PyObject_Type",
                                      self.call("PyUnicode_FromStringAndSize", self.input_buffer, 0))
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

    def prepare(self, source, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        self.restore(self.seed)
        self.memory.write(self.store, source.encode() + b"\0", self.source_buffer)
        code = self.call("Py_CompileString", self.source_buffer, self.filename, 258)
        if not code:
            raise ValueError("SyntaxError: Invalid Python expression")
        # Pricing uses its own compiled expression and never evaluates source.
        self.simple(f"_inspection_cost = _price({source!r})")
        # Obtain the price via trusted eval in __main__, using a small C API helper.
        main = self.call("PyImport_AddModule", self.cstring("__main__"))
        main_dict = self.call("PyModule_GetDict", main)
        price = self.call("PyDict_GetItemString", main_dict, self.cstring("_inspection_cost"))
        cost = self.call("PyLong_AsLong", price)
        # Only trusted compiler output reaches marshal. No submitted byte stream
        # is ever decoded, and no user expression has executed at this point.
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
        blob = bytes(self.memory.read(self.store, pointer, pointer+length))
        size = len(blob) + len(source.encode()) + len(key[1].encode())
        while self.cache and (len(self.cache) >= 128 or self.cache_bytes + size > 4*1024*1024):
            _, old = self.cache.popitem(last=False)
            self.cache_bytes -= old[2]
        item = (blob, cost, size)
        self.cache[key] = item
        self.cache_bytes += size
        return item

    def run(self, request, *, seconds=None, fuel=None, on_execute=None):
        if request.get("mode") not in ("inspect", "execute"):
            raise ValueError("Unknown runner mode")
        source = request.get("source")
        if not isinstance(source, str) or "\0" in source or len(source.encode()) > 16384:
            raise ValueError("Source must be a NUL-free string of at most 16384 bytes")
        domain = settings(request)
        budget = domain.get("interactionComputeMs", 5)
        if type(budget) not in (int, float) or not 1 <= budget <= 1000:
            raise ValueError("Invalid interactionComputeMs (1..1000)")
        if request["mode"] == "execute":
            check(request.get("input"), domain)
        key = (source, json.dumps(domain, sort_keys=True))
        try:
            with self.bounded(3):
                blob, cost, _ = self.prepare(source, key)
                if request["mode"] == "inspect":
                    return {"cost": cost}
                self.restore(self.seed)
                self.memory.write(self.store, blob, self.code_buffer)
                code = self.call("PyMarshal_ReadObjectFromString", self.code_buffer, len(blob))
                if not code:
                    raise ValueError("Trusted code deserialization failed")
                globals_ = self.call("PyDict_New")
                if self.call("PyDict_SetItemString", globals_, self.builtins_key,
                             self.call("PyEval_GetBuiltins")):
                    raise ValueError("Guest globals preparation failed")
                # Entropy must be refreshed AFTER restoring random module state.
                self.simple("random.seed(None)")
                value = request["input"]
                if type(value) is int:
                    argument = self.call("PyLong_FromLong", value)
                else:
                    self.memory.write(self.store, value.encode() + b"\0", self.input_buffer)
                    argument = self.call("PyUnicode_FromStringAndSize", self.input_buffer, len(value))
            # Conservative instruction ceiling, not an instruction-to-time promise.
            # The independent process-CPU sampler enforces the configured time
            # budget; epoch interruption and the parent wall deadline back it up.
            self.store.set_fuel(fuel if fuel is not None else int(budget * 150000))
            if on_execute:
                on_execute()
            with self.bounded(seconds if seconds is not None else max(0.05, budget/1000*10), budget):
                fn = self.call("PyEval_EvalCode", code, globals_, globals_)
                if not fn:
                    raise ValueError("Python source evaluation failed")
                result = self.call("PyObject_CallOneArg", fn, argument)
                if not result:
                    raise ValueError("Python callable failed (guest I/O is disabled)")
                typ = self.call("PyObject_Type", result)
                if typ == self.int_type:
                    output = self.call("PyLong_AsLong", result)
                    if self.call("PyErr_Occurred"):
                        raise ValueError("DOMAIN: Integer output outside configured domain")
                elif typ == self.str_type:
                    pointer = self.call("PyUnicode_AsUTF8AndSize", result, self.size_buffer)
                    length = struct.unpack("<i", self.memory.read(
                        self.store, self.size_buffer, self.size_buffer+4))[0]
                    if not pointer or not 0 <= length <= domain["stringMaxLength"]:
                        raise ValueError("DOMAIN: String output outside configured domain")
                    output = bytes(self.memory.read(self.store, pointer, pointer+length)).decode("ascii")
                else:
                    raise ValueError("Result must be an exact integer or ASCII string")
                check(output, domain)
                if type(output) is not type(value):
                    raise ValueError("Transformation must preserve input type")
                return {"value": output}
        except wasmtime.Trap:
            # A trap can interrupt C stack unwinding. Never reuse that store.
            self.new_store()
            raise


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
            message = str(error)[-2000:]
            code = "DOMAIN" if "DOMAIN:" in message else (
                "LIMIT" if isinstance(error, wasmtime.Trap) else "COMPILE"
                if "SyntaxError" in message else "EXECUTION")
            print(json.dumps({"ok": False, "code": code, "error": message}), flush=True)
