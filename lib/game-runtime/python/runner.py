"""Capability-limited WASI runner. Host never evaluates submitted Python.

Protocol is one JSON request per input line, one JSON response per output line.
Only the dedicated immutable stdlib directory is preopened. No inherited WASI
environment, stdin, stdout, stderr, host directories, sockets or process APIs.
Outer service MUST also bound queue length and kill workers at a hard deadline.
"""
import json
import pathlib
import sys
import threading
import struct
import wasmtime
from domain import settings, check

ROOT = pathlib.Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "code-gods" / "python-3.15.0"
ADAPTER = pathlib.Path(__file__).with_name("guest.py").read_text()
MAX_REQUEST = 131072
MAX_OUTPUT = 65536


class Runner:
    def __init__(self):
        config = wasmtime.Config()
        config.consume_fuel = True
        config.epoch_interruption = True
        config.max_wasm_stack = 1024 * 1024
        self.engine = wasmtime.Engine(config)
        self.module = wasmtime.Module.from_file(self.engine, str(CACHE / "python.wasm"))

    def run(self, request, *, seconds=3, fuel=10_000_000_000):
        if request.get("mode") not in ("inspect", "execute"):
            raise ValueError("Unknown runner mode")
        source = request.get("source")
        if not isinstance(source, str) or len(source.encode("utf-8")) > 16384:
            raise ValueError("Source must be a string of at most 16384 bytes")
        domain = settings(request)
        if request["mode"] == "execute":
            check(request.get("input"), domain)
        output = bytearray()
        errors = bytearray()

        def capture(target):
            def write(data):
                remaining = MAX_OUTPUT - len(target)
                if remaining > 0:
                    target.extend(data[:remaining])
                # Output over limit fails without growing host memory.
                return len(data) if len(data) <= remaining else -1
            return write

        store = wasmtime.Store(self.engine)
        store.set_limits(memory_size=128 * 1024 * 1024, table_elements=100000,
                         instances=4, tables=1, memories=1)
        store.set_fuel(fuel)
        store.set_epoch_deadline(1)
        wasi = wasmtime.WasiConfig()
        wasi.argv = ["python", "-S", "-B", "-c", ADAPTER, json.dumps(request)]
        wasi.env = [("PYTHONHASHSEED", "0")]
        wasi.preopen_dir(str(CACHE / "lib"), "/lib", fs_mutable=False)
        wasi.stdout_custom = capture(output)
        wasi.stderr_custom = capture(errors)
        store.set_wasi(wasi)
        linker = wasmtime.Linker(self.engine)
        linker.define_wasi()
        # Virtual facilities, not merely absent Python names: even recovered
        # builtins or ctypes cannot restore clock/random authority.
        linker.allow_shadowing = True
        i32 = wasmtime.ValType.i32()
        i64 = wasmtime.ValType.i64()
        def clock(caller, clock_id, precision, pointer):
            caller.get("memory").write(caller, struct.pack("<Q", 0), pointer)
            return 0
        def resolution(caller, clock_id, pointer):
            caller.get("memory").write(caller, struct.pack("<Q", 1), pointer)
            return 0
        def random(caller, pointer, length):
            # Fixed zero entropy is intentional, NEVER suitable for security.
            if length < 0 or length > 128 * 1024 * 1024:
                return 28
            memory = caller.get("memory")
            for offset in range(0, length, 4096):
                memory.write(caller, bytes(min(4096, length - offset)), pointer + offset)
            return 0
        linker.define_func("wasi_snapshot_preview1", "clock_time_get",
                           wasmtime.FuncType([i32, i64, i32], [i32]), clock, True)
        linker.define_func("wasi_snapshot_preview1", "clock_res_get",
                           wasmtime.FuncType([i32, i32], [i32]), resolution, True)
        linker.define_func("wasi_snapshot_preview1", "random_get",
                           wasmtime.FuncType([i32, i32], [i32]), random, True)
        # File metadata otherwise reveals host inode numbers and timestamps.
        stat_functions = {}
        for name, args in [("fd_filestat_get", 2), ("path_filestat_get", 5)]:
            def stat(caller, *values, name=name):
                errno = stat_functions[name](caller, *values)
                if errno == 0:
                    memory = caller.get("memory")
                    pointer = values[-1]
                    memory.write(caller, bytes(16), pointer)  # device/inode
                    memory.write(caller, struct.pack("<Q", 1), pointer + 24)
                    memory.write(caller, bytes(24), pointer + 40)  # times
                return errno
            linker.define_func("wasi_snapshot_preview1", name,
                               wasmtime.FuncType([i32] * args, [i32]), stat, True)
        def readdir(caller, fd, pointer, length, cookie, used):
            errno = stat_functions["fd_readdir"](caller, fd, pointer, length, cookie, used)
            if errno == 0:
                memory = caller.get("memory")
                size = struct.unpack("<I", memory.read(caller, used, used + 4))[0]
                offset = 0
                while offset + 24 <= size:
                    header = memory.read(caller, pointer + offset, pointer + offset + 24)
                    name_length = struct.unpack_from("<I", header, 16)[0]
                    memory.write(caller, bytes(8), pointer + offset + 8)
                    offset += 24 + name_length
            return errno
        linker.define_func("wasi_snapshot_preview1", "fd_readdir",
                           wasmtime.FuncType([i32, i32, i32, i64, i32], [i32]), readdir, True)
        for name, args in [("poll_oneoff", [i32] * 4)]:
            linker.define_func("wasi_snapshot_preview1", name,
                               wasmtime.FuncType(args, [i32]), lambda *args: 63)
        timer = threading.Timer(seconds, self.engine.increment_epoch)
        timer.daemon = True
        timer.start()
        try:
            instance = linker.instantiate(store, self.module)
            # WASI requires a Wasm caller with an exported memory; a direct
            # Python-to-WASI call loses that caller. A tiny trusted shim supplies it.
            for name, types in [("fd_filestat_get", ["i32"] * 2),
                                ("path_filestat_get", ["i32"] * 5),
                                ("fd_readdir", ["i32", "i32", "i32", "i64", "i32"])]:
                args = len(types)
                params = " ".join(types)
                gets = " ".join(f"local.get {i}" for i in range(args))
                shim_module = wasmtime.Module(self.engine, f'''(module
                  (import "guest" "memory" (memory 0))
                  (export "memory" (memory 0))
                  (import "wasi_snapshot_preview1" "{name}" (func $f (param {params}) (result i32)))
                  (func (export "call") (param {params}) (result i32) {gets} call $f))''')
                shim_linker = wasmtime.Linker(self.engine)
                shim_linker.define_wasi()
                shim_linker.define(store, "guest", "memory", instance.exports(store)["memory"])
                shim = shim_linker.instantiate(store, shim_module)
                stat_functions[name] = shim.exports(store)["call"]
                shim_linker.close()
                shim_module.close()
            try:
                instance.exports(store)["_start"](store)
            except wasmtime.ExitTrap as error:
                if error.code != 0:
                    raise ValueError(errors.decode("utf-8", errors="replace")[-2000:]) from error
            if len(output) >= MAX_OUTPUT:
                raise ValueError("Output limit exceeded")
            # Extra print output is rejected; pricing cannot be forged by execution.
            result = json.loads(output)
            expected = "cost" if request["mode"] == "inspect" else "value"
            if not isinstance(result, dict) or set(result) != {expected}:
                raise ValueError("Invalid result envelope")
            if expected == "cost":
                if type(result["cost"]) is not int or result["cost"] < 0:
                    raise ValueError("Invalid cost")
            else:
                value = result["value"]
                check(value, domain)
            return result
        finally:
            timer.cancel()
            timer.join()
            store.close()
            linker.close()


if __name__ == "__main__":
    runner = Runner()
    print(json.dumps({"ready": True}), flush=True)
    while True:
        line = sys.stdin.buffer.readline(MAX_REQUEST + 1)
        if not line:
            break
        if len(line) > MAX_REQUEST:
            # Do not parse a truncated oversized request or desynchronize framing.
            print(json.dumps({"error": "Request too large"}), flush=True)
            break
        try:
            result = runner.run(json.loads(line))
            print(json.dumps({"ok": True, **result}), flush=True)
        except Exception as error:
            message = str(error)[-2000:]
            code = "DOMAIN" if "DOMAIN:" in message else (
                "LIMIT" if isinstance(error, wasmtime.Trap) else "COMPILE"
                if "SyntaxError" in message else "EXECUTION")
            print(json.dumps({"ok": False, "code": code, "error": message}), flush=True)
