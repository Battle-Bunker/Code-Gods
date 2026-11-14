/**
 * Python agents: the pinned CPython 3.15 WASI reactor on Node's own WebAssembly, snapshot-isolated (copied from
 * lib/game-runtime/engine/python.mjs and cleaned: no summon pricing, no script mode, no read meter). The host never
 * evaluates Python.
 *
 * One act: restore the initialized snapshot; fresh agent builtins, the seeded `random`, the virtual clock; the guest
 * library (guest/codegods.py) runs as the prelude with `__host` in its globals; `__decode(offer)` makes the Offer;
 * then, inside the budget, the agent's module, `agent(offer)` and `__encode_calls(result)`.
 *
 * The bundle supplies CPython and its standard library only; the trusted guest is this package's python/guest.py.
 *
 * Bounds: the deterministic one is the `sys.monitoring` step budget over the agent's own code objects. Every
 * 10,000 steps the guest reads the clock, and the host ends the act there if its time cap has passed (a real-time
 * check at deterministic points). A single long native step is the worker's hard wall's job (sandbox.ts).
 */
import { readFileSync } from "node:fs";
import { Wasi, CapabilityTrap, TimeTrap } from "./wasi.ts";
import { OVERSIZE_REPLY } from "./channel.ts";
import { SandboxError, LIMITS, stepLimit, timeLimit } from "./limits.ts";
import type { Engine, ExecuteRequest, Hooks, ExecuteResult } from "./engine.ts";

const PY_FILE_INPUT = 257;
const SNAPSHOT_PAGE = 4096;
const ZERO_CHUNK = Buffer.alloc(65536);
/** Mixed into the act seed for WASI random_get (os.urandom past the proxies). */
const ENTROPY_SALT = 0x5DEECE66Dn;
const utf8 = new TextEncoder();

/** This package's trusted guest (python/guest.py), run into __main__ at bootstrap; the bundle's own guest files are not run. */
const GUEST = readFileSync(new URL("../python/guest.py", import.meta.url), "utf8");

const Compile = (m: string) => new SandboxError("COMPILE", m);
const Config = (m: string) => new SandboxError("CONFIG", m);
const Execution = (m: string) => new SandboxError("EXECUTION", m);
const Limit = (m: string) => new SandboxError("LIMIT", m);

function describeTrap(error: unknown) {
  const text = String((error as Error)?.message ?? error);
  if (/Maximum call stack size exceeded|call stack exhausted/.test(text)) return "Recursion too deep: the agent exhausted the call stack";
  if (/out of bounds|memory/i.test(text)) return "Memory limit exceeded: the agent used too much memory";
  return "The agent crashed the sandbox: " + text.slice(0, 200);
}

/** A small LRU of trusted compiler output (marshal bytes). */
class Lru<V> {
  private map = new Map<string, V>();
  private readonly max: number;
  constructor(max: number) { this.max = max; }
  get(key: string) { const v = this.map.get(key); if (v !== undefined) { this.map.delete(key); this.map.set(key, v); } return v; }
  set(key: string, value: V) { this.map.delete(key); this.map.set(key, value); if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!); return value; }
}

export interface PythonSnapshot {
  length: number;
  runs: [number, number][];
  data: Uint8Array;
  globals: { value: unknown; mutable: boolean }[];
  meta: Record<string, number>;
}

export class PythonEngine implements Engine {
  readonly module: WebAssembly.Module;
  snapshot!: PythonSnapshot;
  private cache = new Lru<Uint8Array>(128);
  private wasi!: Wasi;
  private instance: WebAssembly.Instance | null = null;
  private x: any;
  private memory!: WebAssembly.Memory;
  private meta!: Record<string, number>;
  private poisoned = true;
  private snapshotData: Uint8Array | null = null;

  /**
   * `files`: the unpacked bundle (bundle.ts). `module`: the compiled reactor, shareable with workers. `snapshot`: an
   * initialized snapshot from another engine of the same module, so this one skips bootstrap.
   */
  constructor({ files, module, snapshot }: { files?: Map<string, Uint8Array>; module?: WebAssembly.Module; snapshot?: PythonSnapshot }) {
    const wasm = files?.get("python-reactor.wasm");
    if (!module && !wasm) throw new Error("The Python bundle lacks python-reactor.wasm");
    this.module = module ?? new WebAssembly.Module(wasm as Uint8Array<ArrayBuffer>);
    if (snapshot) {
      this.snapshot = snapshot;
      this.meta = snapshot.meta;
      this.wasi = new Wasi({ files: new Map(), args: [], env: [] });
      this.wasi.mode = "guest";
      this.restore();
    } else this.bootstrap(files!);
  }

  // --- Instance and snapshot.
  private newInstance() {
    this.instance = new WebAssembly.Instance(this.module, this.wasi.imports(this.module));
    this.x = this.instance.exports;
    this.memory = this.x.memory;
    this.wasi.memory = this.memory;
    this.poisoned = false;
  }
  /** All linear memory as its nonzero 4 KiB-page runs, plus every mutable global. `data` is shared with workers. */
  private takeSnapshot(): PythonSnapshot {
    const length = this.memory.buffer.byteLength;
    const bytes = Buffer.from(this.memory.buffer, 0, length), zero = Buffer.alloc(SNAPSHOT_PAGE);
    const runs: [number, number][] = [];
    let size = 0;
    for (let at = 0; at < length; at += SNAPSHOT_PAGE) {
      if (!Buffer.compare(bytes.subarray(at, at + SNAPSHOT_PAGE), zero)) continue;
      const last = runs.at(-1);
      if (last && last[0] + last[1] === at) last[1] += SNAPSHOT_PAGE; else runs.push([at, SNAPSHOT_PAGE]);
      size += SNAPSHOT_PAGE;
    }
    const data = new Uint8Array(new SharedArrayBuffer(size));
    let offset = 0;
    for (const [at, n] of runs) { data.set(bytes.subarray(at, at + n), offset); offset += n; }
    const globals = [];
    for (let i = 0; this.x[`snapshot_global_${i}`]; i++) {
      const global = this.x[`snapshot_global_${i}`];
      let mutable = true;
      try { global.value = global.value; } catch { mutable = false; }
      globals.push({ value: global.value, mutable });
    }
    return { length, runs, data, globals, meta: this.meta };
  }
  /** A fresh guest: the one trusted snapshot, on a new instance if the old one trapped or grew. */
  private restore() {
    const { length, runs, globals } = this.snapshot;
    this.snapshotData ??= new Uint8Array(this.snapshot.data);
    if (this.poisoned || !this.instance || this.memory.buffer.byteLength !== length) this.newInstance();
    const missing = length - this.memory.buffer.byteLength;
    if (missing > 0) this.memory.grow(missing / 65536);
    const memory = new Uint8Array(this.memory.buffer), data = this.snapshotData;
    const bytes = Buffer.from(this.memory.buffer, 0, length);
    const clear = (from: number, to: number) => {
      for (let at = from; at < to; at += ZERO_CHUNK.length) {
        const end = Math.min(at + ZERO_CHUNK.length, to);
        if (Buffer.compare(bytes.subarray(at, end), ZERO_CHUNK.subarray(0, end - at))) memory.fill(0, at, end);
      }
    };
    let end = 0, offset = 0;
    for (const [at, n] of runs) {
      if (at > end) clear(end, at);
      memory.set(data.subarray(offset, offset + n), at);
      offset += n; end = at + n;
    }
    if (end < length) clear(end, length);
    globals.forEach(({ value, mutable }, i) => { if (mutable) this.x[`snapshot_global_${i}`].value = value; });
  }

  // --- Guest helpers.
  private bytes() { return new Uint8Array(this.memory.buffer); }
  private i32(pointer: number) { return new DataView(this.memory.buffer).getInt32(pointer, true); }
  private u32(pointer: number) { return new DataView(this.memory.buffer).getUint32(pointer, true); }
  private cstring(text: string) {
    const data = utf8.encode(text + "\0");
    const pointer = this.x.malloc(data.length);
    this.bytes().set(data, pointer);
    return pointer;
  }
  private simple(code: string) {
    const pointer = this.cstring(code);
    try { if (this.x.PyRun_SimpleString(pointer)) throw new Error("Python trusted preparation failed"); }
    finally { this.x.free(pointer); }
  }
  private mainGet(name: string) { return this.x.PyDict_GetItemString(this.meta.mainDict, this.cstring(name)); }
  /** A str from __main__, UTF-8, at most `max` bytes. */
  private mainString(name: string, fallback: string, max = 2000) {
    const value = this.mainGet(name);
    const pointer = value && this.x.PyUnicode_AsUTF8AndSize(value, this.meta.sizeBuffer);
    if (!pointer) { this.x.PyErr_Clear(); return fallback; }
    const length = this.i32(this.meta.sizeBuffer);
    return new TextDecoder().decode(this.bytes().slice(pointer, pointer + Math.min(length, max)));
  }
  /** A new guest str from host text. */
  private newString(text: string) {
    const data = utf8.encode(text);
    const pointer = this.x.malloc(data.length + 1);
    try {
      this.bytes().set(data, pointer);
      const value = this.x.PyUnicode_FromStringAndSize(pointer, data.length);
      if (!value) throw new Error("Guest string preparation failed");
      return value;
    } finally { this.x.free(pointer); }
  }
  private setMainString(name: string, text: string) {
    if (this.x.PyDict_SetItemString(this.meta.mainDict, this.cstring(name), this.newString(text))) throw new Error("Guest string preparation failed");
  }

  private bootstrap(files: Map<string, Uint8Array>) {
    const lib = new Map([...files].filter(([path]) => path.startsWith("lib/")).map(([path, data]) => ["/" + path, data] as [string, Uint8Array]));
    // Trusted WASI startup: synthetic PYTHONHOME and hash seed, no inherited descriptors, a read-only stdlib.
    this.wasi = new Wasi({ files: lib, args: ["python", "-S", "-B"], env: ["PYTHONHOME=/", "PYTHONHASHSEED=0"] });
    this.newInstance();
    const x = this.x;
    x.__wasm_call_ctors();
    const config = x.malloc(4096), status = x.malloc(64);
    this.bytes().fill(0, config, config + 4096);
    x.PyConfig_InitPythonConfig(config);
    x.Py_InitializeFromConfig(status, config);
    if (this.i32(status)) throw new Error("CPython initialization failed: " + this.wasi.output.join("").slice(0, 500));
    x.PyConfig_Clear(config);
    x.free(config); x.free(status);
    this.meta = { mainDict: x.PyModule_GetDict(x.PyImport_AddModule(this.cstring("__main__"))) };
    this.simple(GUEST);
    this.simple(`_HOST = _host_factory(${LIMITS.messageBytes}, ${JSON.stringify(OVERSIZE_REPLY)})\ndel _host_factory`);
    const meta = this.meta;
    meta.sourceBuffer = x.malloc(LIMITS.sourceBytes + 1);
    meta.sizeBuffer = x.malloc(4);
    meta.pointerBuffer = x.malloc(4);
    meta.codeBuffer = x.malloc(1024 * 1024);
    for (const key of ["<agent>", "<prelude>", "__builtins__", "__name__", "__decode", "__encode_calls", "__host", "agent", "_exc", "_USER_CODE"]) meta[key] = this.cstring(key);
    meta.truePtr = this.mainGet("_TRUE");
    meta.stepLimitType = this.mainGet("_StepLimit");
    meta.host = this.mainGet("_HOST");
    if (!meta.truePtr || !meta.stepLimitType || !meta.host) throw new Error("Sandbox bootstrap failed");
    meta.moduleName = x.PyUnicode_FromStringAndSize(meta.agent, 5);
    meta.strType = x.PyObject_Type(meta.moduleName);
    this.wasi.mode = "guest";
    this.wasi.nodes = new Map();   // the bundled files are unreachable from here on
    this.snapshot = this.takeSnapshot();
  }

  /** Only trusted compiler output reaches marshal; no submitted byte stream is ever decoded. */
  private marshal(code: number) {
    const { x, meta } = this;
    const marshalled = x.PyMarshal_WriteObjectToString(code, 5);
    if (!marshalled || x.PyBytes_AsStringAndSize(marshalled, meta.pointerBuffer, meta.sizeBuffer)) throw new Error("Code serialization failed");
    const pointer = this.u32(meta.pointerBuffer), length = this.i32(meta.sizeBuffer);
    if (!(length > 0 && length <= 1024 * 1024)) throw new Error("Compiled code exceeds 1 MiB limit");
    return this.bytes().slice(pointer, pointer + length);
  }
  private load(blob: Uint8Array) {
    this.bytes().set(blob, this.meta.codeBuffer);
    const code = this.x.PyMarshal_ReadObjectFromString(this.meta.codeBuffer, blob.length);
    if (!code) throw new Error("Trusted code deserialization failed");
    return code;
  }
  private compilePrelude(text: string) {
    const key = JSON.stringify(["prelude", text]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.restore();
    const code = this.x.Py_CompileString(this.cstring(text), this.meta["<prelude>"], PY_FILE_INPUT);
    if (!code) { this.x.PyErr_Clear(); throw Config("The Python guest library does not compile"); }
    return this.cache.set(key, this.marshal(code));
  }
  /** Compile and shape-check the agent's module (never evaluating it); the marshal bytes are cached. */
  private compileAgent(source: string) {
    const key = JSON.stringify(["agent", source]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.restore();
    const { x, meta } = this;
    const data = utf8.encode(source);
    this.bytes().set(data, meta.sourceBuffer); this.bytes()[meta.sourceBuffer + data.length] = 0;
    const code = x.Py_CompileString(meta.sourceBuffer, meta["<agent>"], PY_FILE_INPUT);
    this.setMainString("_SOURCE", source);
    if (!code) {
      x.PyErr_Clear();
      this.simple("_compile_error = _explain(_SOURCE)");   // recompiling in the guest recovers the message
      throw Compile(this.mainString("_compile_error", "SyntaxError: invalid Python module"));
    }
    const blob = this.marshal(code);
    // `agent` defined once at top level with one parameter; no names that reach past the guest library.
    this.simple("_compile_error = _shape(ast.parse(_SOURCE, mode='exec'), True)");
    const error = this.mainString("_compile_error", "SyntaxError: invalid agent");
    if (error) throw Compile(error);
    return this.cache.set(key, blob);
  }
  private freshGlobals(seed: bigint, steps: number) {
    const { x, meta } = this;
    this.simple(`_act_setup(${seed}, ${steps})`);
    const builtins = this.mainGet("_AGENT_BUILTINS");
    const globals = x.PyDict_New();
    if (!builtins || x.PyDict_SetItemString(globals, meta.__builtins__, builtins) || x.PyDict_SetItemString(globals, meta.__name__, meta.moduleName)
        || x.PyDict_SetItemString(globals, meta.__host, meta.host)) throw new Error("Guest globals preparation failed");
    return globals;
  }
  private steps() {
    const value = this.mainGet("_steps");
    const steps = value ? this.x.PyLong_AsLong(value) : -1;
    this.x.PyErr_Clear();
    return steps;
  }
  /** The guest's own exception text, computed inside the guest. */
  private guestError(what: string, limit: number) {
    const { x, meta } = this;
    const exc = x.PyErr_GetRaisedException();
    x.PyErr_Clear();
    if ((exc && x.PyObject_Type(exc) === meta.stepLimitType) || this.steps() > limit) return Limit(stepLimit(limit));
    let detail = "an error";
    if (exc && !x.PyDict_SetItemString(meta.mainDict, meta._exc, exc)) {
      try { this.simple("_error = _describe(_exc)"); detail = this.mainString("_error", detail); }
      catch { x.PyErr_Clear(); }
    }
    return Execution(`${what}: ${detail}`);
  }

  execute(request: ExecuteRequest, hooks: Hooks): ExecuteResult {
    const { source, prelude, offer, seed, stepBudget: limit, wallMs } = request;
    if (source.includes("\0")) throw Compile("The source must not contain NUL characters");
    const { wasi } = this;
    wasi.executing = false;
    let phase = "prepare";
    try {
      const preludeBlob = this.compilePrelude(prelude);
      const blob = this.compileAgent(source);
      this.restore();
      const { x, meta } = this;   // after restore(), which may replace the instance
      wasi.resetAct(seed ^ ENTROPY_SALT);
      const preludeCode = this.load(preludeBlob), code = this.load(blob);
      const globals = this.freshGlobals(seed, limit);
      // The trusted guest library and the offer: outside the budget.
      if (!x.PyEval_EvalCode(preludeCode, globals, globals)) { x.PyErr_Clear(); throw Config("The Python guest library failed to run"); }
      const decode = x.PyDict_GetItemString(globals, meta.__decode);
      if (!decode || !x.PyDict_GetItemString(globals, meta.__encode_calls)) throw Config("The guest library must define __decode and __encode_calls");
      const handed = x.PyObject_CallOneArg(decode, this.newString(offer));
      if (!handed) { x.PyErr_Clear(); throw Config("The guest library could not make the offer"); }
      if (x.PyDict_SetItemString(meta.mainDict, meta._USER_CODE, code)) throw new Error("Guest instrumentation failed");
      this.simple("_instrument(_USER_CODE)");
      phase = "execute";
      wasi.channel = hooks.host;
      hooks.onExecute?.();
      const started = performance.now();
      wasi.deadline = started + wallMs;
      wasi.executing = true;
      const over = () => performance.now() - started >= wallMs;
      const timed = (error: SandboxError) => (over() ? Limit(timeLimit(wallMs)) : error);
      if (!x.PyEval_EvalCode(code, globals, globals)) throw timed(this.guestError("The agent's module raised an error", limit));
      const agent = x.PyDict_GetItemString(globals, meta.agent);
      if (!agent) throw timed(Execution("The agent's module no longer defines agent"));
      const calls = x.PyObject_CallOneArg(agent, handed);
      if (!calls) throw timed(this.guestError("agent raised an error", limit));
      const encode = x.PyDict_GetItemString(globals, meta.__encode_calls);
      if (!encode) throw timed(Execution("The agent removed __encode_calls"));
      const result = x.PyObject_CallOneArg(encode, calls);
      if (!result) throw timed(this.guestError("Encoding the agent's calls failed", limit));
      // An exact str only: no subclass, no repr/str hook runs on the host's behalf.
      if (x.PyObject_Type(result) !== meta.strType) throw timed(Execution("agent must return a list of calls (the encoder did not produce a string)"));
      if (x.PyUnicode_GetLength(result) > LIMITS.callsBytes) throw timed(Limit(`agent returned too many calls (over ${LIMITS.callsBytes} bytes)`));
      const pointer = x.PyUnicode_AsUTF8AndSize(result, meta.sizeBuffer);
      if (!pointer) { x.PyErr_Clear(); throw timed(Execution("The encoded calls are not text")); }
      const length = this.i32(meta.sizeBuffer);
      const data = this.bytes().slice(pointer, pointer + length);
      if (data.some(b => b > 0x7f)) throw timed(Execution("The encoded calls must be ASCII"));
      const steps = this.steps();
      if (steps > limit) throw Limit(stepLimit(limit));
      if (over()) throw Limit(timeLimit(wallMs));
      const usedRandom = this.mainGet("_used_random") === meta.truePtr || wasi.usedEntropy;
      return { calls: new TextDecoder("latin1").decode(data), usedRandom, steps: Math.max(steps, 0) };
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      // A trap or host fault may interrupt C stack unwinding: never reuse that instance.
      this.poisoned = true;
      if (error instanceof TimeTrap) throw Limit(timeLimit(wallMs));
      if (error instanceof WebAssembly.RuntimeError || error instanceof RangeError || error instanceof CapabilityTrap) {
        throw Limit(phase === "prepare" ? `The sandbox failed while preparing the agent: ${describeTrap(error)}` : describeTrap(error));
      }
      throw Execution(String((error as Error)?.message ?? error).slice(0, 1000));
    } finally {
      wasi.executing = false;
      wasi.channel = null;
      wasi.deadline = null;
    }
  }
}
