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
import wasmtime

ROOT = pathlib.Path(__file__).resolve().parents[3]
CACHE = ROOT / ".cache" / "code-gods" / "python-3.15.0"
ADAPTER = pathlib.Path(__file__).with_name("guest.py").read_text()
MAX_REQUEST = 32768
MAX_OUTPUT = 8192


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
        if request["mode"] == "execute":
            value = request.get("input")
            if type(value) not in (int, str):
                raise ValueError("Input must be an integer or string")
            if type(value) is int and not -(2**31) <= value < 2**31:
                raise ValueError("Input integer outside domain")
            if type(value) is str and (len(value) > 128 or not value.isascii()):
                raise ValueError("Input string outside domain")
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
                         instances=1, tables=1, memories=1)
        store.set_fuel(fuel)
        store.set_epoch_deadline(1)
        wasi = wasmtime.WasiConfig()
        wasi.argv = ["python", "-I", "-S", "-B", "-c", ADAPTER, json.dumps(request)]
        wasi.preopen_dir(str(CACHE / "lib"), "/lib", fs_mutable=False)
        wasi.stdout_custom = capture(output)
        wasi.stderr_custom = capture(errors)
        store.set_wasi(wasi)
        linker = wasmtime.Linker(self.engine)
        linker.define_wasi()
        timer = threading.Timer(seconds, self.engine.increment_epoch)
        timer.daemon = True
        timer.start()
        try:
            instance = linker.instantiate(store, self.module)
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
                if type(value) is not type(request["input"]):
                    raise ValueError("Invalid output type")
                if type(value) is int and not -(2**31) <= value < 2**31:
                    raise ValueError("Output outside domain")
                if type(value) is str and (len(value) > 128 or not value.isascii()):
                    raise ValueError("Output outside domain")
            return result
        finally:
            timer.cancel()
            timer.join()
            store.close()
            linker.close()


if __name__ == "__main__":
    runner = Runner()
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
            print(json.dumps({"ok": False, "error": str(error)[-2000:]}), flush=True)
