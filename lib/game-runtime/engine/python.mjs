/**
 * Warm, snapshot-isolated CPython 3.15 WASI reactor on Node's own WebAssembly (V8). The host never
 * evaluates Python.
 *
 * Grammar python-agent-v1: a module that defines a top-level `def agent(obj)`. An act runs the room's
 * trusted prelude and `__decode(input)` outside the guest budget, then the submitted module,
 * `agent(obj)` and `__encode_calls(result)` inside it, and returns the exact ASCII string the encoder
 * produced.
 *
 * Isolation: every WASI import except the clocks and entropy is denied after trusted bootstrap
 * (wasi.mjs). Before every compilation, inspection and act, all linear memory and the mutable globals
 * are restored from one initialized snapshot; the reactor transform proved the module has no table
 * mutation instructions and imports nothing but functions, so the tables cannot change. A trap or a
 * grown memory replaces the instance (a fresh instance from the same compiled module) before reuse.
 *
 * Bounds: the deterministic one is the guest's `sys.monitoring` step budget (sandbox_guest.py). V8 has
 * no instruction fuel, so CPU/wall are backstops: a post-execution check here, and the pool's
 * worker_thread watchdog (index.mjs), which terminates a worker stuck inside one native step.
 */
import { Wasi, CapabilityTrap } from "./wasi.mjs";
import { sha256 } from "./bundle.mjs";
import {
  RuntimeError, fail, GRAMMAR_IDS, COMPLEXITY_IDS, CALLS_MAX_BYTES, PRELUDE_PART_MAX_BYTES, SOURCE_MAX_BYTES,
  normalize, checkInput, checkSource, parseSeed, preludeDigest, timeLimit, stepLimit, stopwatch, Lru,
  SCRIPT_GRAMMAR_IDS, SCRIPT_LIMITS, checkScriptSource, checkScriptInput, scriptOptions, scriptTimeLimit,
} from "./domain.mjs";
import { scriptGuest } from "./python-script.mjs";

const GRAMMAR = GRAMMAR_IDS.python;
const COMPLEXITY_ID = COMPLEXITY_IDS.python;
const PY_FILE_INPUT = 257;
const CACHE_ENTRIES = 128;
const CACHE_BYTES = 4 * 1024 * 1024;
/** Initialized snapshot ceiling (the old host's 48 MiB limit). */
const SNAPSHOT_MAX_BYTES = 48 * 1024 * 1024;
const SNAPSHOT_PAGE = 4096;
const ZERO_CHUNK = Buffer.alloc(65536);
/** ast-bits-v1 tables (grid-lab claude/gridlab-open-agents, frozen per season): exact bytes required. */
export const TABLES_SHA256 = "e965947993720ce41eb308ec2cc36c1950ee5a3689405139f3d9a75cbe0f1200";
/** The act seed's entropy stream for WASI random_get (os.urandom past the proxies). */
const ENTROPY_SALT = 0x5DEECE66Dn;
const utf8 = new TextEncoder();

/**
 * Python's repr() of a str, for the trusted bootstrap texts only (so the bootstrap code strings, and
 * with them every allocation of the initialized snapshot, are byte-identical to the former host's).
 */
export function pyRepr(text) {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === "\\" || ch === quote) out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0");
    else if (c < 0x7f || (c >= 0xa1 && c !== 0xad && c <= 0x24f) || ch === "µ" || ch === "—" || ch === "–" || ch === "≥" || ch === "≤" || ch === "→" || ch === "×" || ch === "½" || ch === "⅛") out += ch;
    else throw new Error(`pyRepr: unsupported character U+${c.toString(16)} in trusted bootstrap text`);
  }
  return out + quote;
}

class Failure extends RuntimeError {}
const Compile = m => new Failure("COMPILE", m), Config = m => new Failure("CONFIG", m), Domain = m => new Failure("DOMAIN", m);
const Execution = m => new Failure("EXECUTION", m), Limit = m => new Failure("LIMIT", m);

function describeTrap(error) {
  const text = String(error?.message ?? error);
  if (/Maximum call stack size exceeded|call stack exhausted/.test(text)) return "Recursion too deep: the agent exhausted the call stack";
  if (/out of bounds|memory/i.test(text)) return "Memory limit exceeded: the agent used too much memory";
  return "The agent crashed the sandbox: " + text.slice(0, 200);
}

export class PythonEngine {
  /**
   * @param {{ files: Map<string, Uint8Array>, module?: WebAssembly.Module, snapshot?: object }} options
   *   `files`: the unpacked runtime bundle (bundle.mjs). `module`: the compiled reactor (shareable with
   *   workers). `snapshot`: an initialized snapshot from another engine (`engine.snapshot`), so a new
   *   engine (a worker) skips bootstrap; it must come from the same module.
   */
  constructor({ files, module, snapshot }) {
    this.module = module ?? new WebAssembly.Module(files.get("python-reactor.wasm"));
    this.cache = new Lru(CACHE_ENTRIES, CACHE_BYTES);
    this.instance = null;
    this.poisoned = true;
    if (snapshot) {
      this.snapshot = snapshot;
      this.meta = snapshot.meta;
      this.wasi = new Wasi({ files: new Map(), args: [], env: [] });
      this.wasi.mode = "guest";
      this.restore();
    } else this.bootstrap(files);
  }

  // --- Instance and snapshot management.
  newInstance() {
    this.instance = new WebAssembly.Instance(this.module, this.wasi.imports(this.module));
    this.x = this.instance.exports;
    this.memory = this.x.memory;
    this.wasi.memory = this.memory;
    this.poisoned = false;
  }
  /**
   * The initialized snapshot: all linear memory, stored as its nonzero 4 KiB-page runs (about a third
   * of the 40 MiB), plus every mutable global. `data` is a SharedArrayBuffer so other engines (workers)
   * receive it without a copy; each engine then keeps a private plain copy, because V8 copies out of
   * shared memory about twice as slowly.
   */
  takeSnapshot() {
    const length = this.memory.buffer.byteLength;
    if (length > SNAPSHOT_MAX_BYTES) throw new Error("Prepared snapshot exceeds 48 MiB limit");
    const memory = new Uint8Array(this.memory.buffer), runs = [];
    const zero = Buffer.alloc(SNAPSHOT_PAGE), bytes = Buffer.from(memory.buffer, memory.byteOffset, memory.length);
    let size = 0;
    for (let at = 0; at < length; at += SNAPSHOT_PAGE) {
      if (!Buffer.compare(bytes.subarray(at, at + SNAPSHOT_PAGE), zero)) continue;
      const last = runs.at(-1);
      if (last && last[0] + last[1] === at) last[1] += SNAPSHOT_PAGE; else runs.push([at, SNAPSHOT_PAGE]);
      size += SNAPSHOT_PAGE;
    }
    const data = new Uint8Array(new SharedArrayBuffer(size));
    let offset = 0;
    for (const [at, n] of runs) { data.set(memory.subarray(at, at + n), offset); offset += n; }
    const globals = [];
    for (let i = 0; this.x[`snapshot_global_${i}`]; i++) {
      const global = this.x[`snapshot_global_${i}`];
      let mutable = true;
      try { global.value = global.value; } catch { mutable = false; }
      globals.push({ value: global.value, mutable });
    }
    return { length, runs, data, globals, meta: this.meta };
  }
  /** Fresh guest: the one trusted snapshot, a new instance first if the old one trapped or grew. */
  restore() {
    const { length, runs, globals } = this.snapshot;
    this.snapshotData ??= new Uint8Array(this.snapshot.data);   // private, non-shared copy
    if (this.poisoned || !this.instance || this.memory.buffer.byteLength !== length) this.newInstance();
    const missing = length - this.memory.buffer.byteLength;
    if (missing > 0) this.memory.grow(missing / 65536);
    const memory = new Uint8Array(this.memory.buffer), data = this.snapshotData;
    // Pages that are zero in the snapshot are checked (a read) and cleared only where nonzero: an act
    // rarely touches most of them, and reading is cheaper than writing. Every byte ends equal to the
    // snapshot either way.
    const bytes = Buffer.from(this.memory.buffer, 0, length);
    const clear = (from, to) => {
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

  // --- Guest helpers (a port of the former wasmtime-py host, call for call).
  bytes() { return new Uint8Array(this.memory.buffer); }
  view() { return new DataView(this.memory.buffer); }
  write(pointer, data) { this.bytes().set(data, pointer); }
  read(pointer, length) { return this.bytes().slice(pointer, pointer + length); }
  i32(pointer) { return this.view().getInt32(pointer, true); }
  u32(pointer) { return this.view().getUint32(pointer, true); }
  cstring(text) {
    const data = utf8.encode(text + "\0");
    const pointer = this.x.malloc(data.length);
    this.write(pointer, data);
    return pointer;
  }
  simple(code) {
    const pointer = this.cstring(code);
    try { if (this.x.PyRun_SimpleString(pointer)) throw new Error("Python trusted preparation failed"); }
    finally { this.x.free(pointer); }
  }
  mainGet(name) { return this.x.PyDict_GetItemString(this.meta.mainDict, this.cstring(name)); }
  /** A str from __main__, UTF-8, at most `max` bytes (error text: 2000). */
  mainString(name, fallback, max = 2000) {
    const mainDict = this.x.PyModule_GetDict(this.x.PyImport_AddModule(this.cstring("__main__")));
    const value = this.x.PyDict_GetItemString(mainDict, this.cstring(name));
    const pointer = value && this.x.PyUnicode_AsUTF8AndSize(value, this.meta.sizeBuffer);
    if (!pointer) { this.x.PyErr_Clear(); return fallback; }
    const length = this.i32(this.meta.sizeBuffer);
    return new TextDecoder("utf-8", { fatal: false }).decode(this.read(pointer, Math.min(length, max)));
  }
  /** A new guest str from host text (UTF-8), set as __main__[name]. */
  setMainString(name, text) {
    const data = utf8.encode(text);
    const pointer = this.x.malloc(data.length + 1);
    try {
      this.write(pointer, data);
      const value = this.x.PyUnicode_FromStringAndSize(pointer, data.length);
      if (!value || this.x.PyDict_SetItemString(this.meta.mainDict, this.cstring(name), value)) throw new Error("Guest string preparation failed");
    } finally { this.x.free(pointer); }
  }

  bootstrap(files) {
    const text = path => {
      const data = files.get(path);
      if (!data) throw new Error(`Python runtime bundle lacks ${path}`);
      return new TextDecoder().decode(data);
    };
    const tables = files.get("guest/ast_bits_v1.json");
    if (!tables || sha256(tables) !== TABLES_SHA256) throw new Error("Unrecognized ast-bits-v1 tables");
    const lib = new Map([...files].filter(([path]) => path.startsWith("lib/")).map(([path, data]) => ["/" + path, data]));
    // Trusted WASI startup: synthetic PYTHONHOME and hash seed, no inherited descriptors, read-only stdlib.
    this.wasi = new Wasi({ files: lib, args: ["python", "-S", "-B"], env: ["PYTHONHOME=/", "PYTHONHASHSEED=0"] });
    this.newInstance();
    const x = this.x;
    x.__wasm_call_ctors();
    const config = x.malloc(4096), status = x.malloc(64);
    this.write(config, new Uint8Array(4096));
    x.PyConfig_InitPythonConfig(config);
    x.Py_InitializeFromConfig(status, config);
    if (this.i32(status)) throw new Error("CPython initialization failed: " + this.wasi.output.join("").slice(0, 500));
    x.PyConfig_Clear(config);
    x.free(config);
    x.free(status);
    this.simple(text("guest/boot_guest.py"));
    this.simple(text("guest/sandbox_guest.py"));
    this.simple(`_AB = {}\nexec(compile(${pyRepr(text("guest/astbits_guest.py"))}, '<astbits>', 'exec'), _AB)`);
    this.simple(`_AB_BASE = {s: _AB['BaseTables'](json.loads(${pyRepr(new TextDecoder().decode(tables))}), s) for s in ('corpus', 'uniform')}`);
    const meta = {};
    meta.sourceBuffer = x.malloc(SOURCE_MAX_BYTES + 1);
    meta.preludeBuffer = x.malloc(PRELUDE_PART_MAX_BYTES + 1);
    meta.inputBuffer = x.malloc(8193);
    meta.sizeBuffer = x.malloc(4);
    meta.pointerBuffer = x.malloc(4);
    meta.codeBuffer = x.malloc(1024 * 1024);
    for (const [key, value] of [["filename", "<agent>"], ["preludeFilename", "<prelude>"], ["builtinsKey", "__builtins__"],
      ["nameKey", "__name__"], ["decodeKey", "__decode"], ["agentKey", "agent"], ["encodeKey", "__encode_calls"],
      ["excKey", "_exc"], ["codeKey", "_USER_CODE"], ["preludeKey", "_PRELUDE_G"]]) meta[key] = this.cstring(value);
    meta.mainDict = x.PyModule_GetDict(x.PyImport_AddModule(this.cstring("__main__")));
    this.meta = meta;
    meta.truePtr = this.mainGet("_TRUE");
    meta.stepLimitType = this.mainGet("_StepLimit");
    if (!meta.truePtr || !meta.stepLimitType) throw new Error("Sandbox bootstrap failed");
    meta.moduleName = x.PyUnicode_FromStringAndSize(meta.agentKey, 5);
    meta.strType = x.PyObject_Type(meta.moduleName);
    this.wasi.mode = "guest";
    this.wasi.nodes = new Map();   // the bundled files are unreachable from here on
    this.snapshot = this.takeSnapshot();
  }

  marshal(code) {
    // Only trusted compiler output reaches marshal. No submitted byte stream is ever decoded, and no
    // submitted code has executed at this point. Version 5: CPython 3.14+ folds slice constants.
    const { x, meta } = this;
    const marshalled = x.PyMarshal_WriteObjectToString(code, 5);
    if (!marshalled || x.PyBytes_AsStringAndSize(marshalled, meta.pointerBuffer, meta.sizeBuffer)) throw new Error("Code serialization failed");
    const pointer = this.u32(meta.pointerBuffer), length = this.i32(meta.sizeBuffer);
    if (!(length > 0 && length <= 1024 * 1024)) throw new Error("Compiled code exceeds 1 MiB limit");
    return this.read(pointer, length);
  }
  load(blob) {
    this.write(this.meta.codeBuffer, blob);
    const code = this.x.PyMarshal_ReadObjectFromString(this.meta.codeBuffer, blob.length);
    if (!code) throw new Error("Trusted code deserialization failed");
    return code;
  }
  preparePrelude(text, key) {
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.restore();
    this.write(this.meta.preludeBuffer, utf8.encode(text + "\0"));
    const code = this.x.Py_CompileString(this.meta.preludeBuffer, this.meta.preludeFilename, PY_FILE_INPUT);
    if (!code) { this.x.PyErr_Clear(); throw Config("The room's Python prelude does not compile"); }
    const blob = this.marshal(code);
    return this.cache.set(key, { blob }, blob.length + Buffer.byteLength(key));
  }
  /** Fresh agent builtins (sandbox_guest._act_setup) and globals for one act or inspection. */
  freshGlobals(seed, steps) {
    const { x, meta } = this;
    this.simple(`_act_setup(${seed}, ${steps})`);
    const builtins = this.mainGet("_AGENT_BUILTINS");
    const globals = x.PyDict_New();
    if (!builtins || x.PyDict_SetItemString(globals, meta.builtinsKey, builtins)
        || x.PyDict_SetItemString(globals, meta.nameKey, meta.moduleName)) throw new Error("Guest globals preparation failed");
    return globals;
  }
  prepare(source, key, preludeBlob, vocab, scheme) {
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.restore();   // may replace the instance: read the exports after it
    const { x, meta } = this;
    const data = utf8.encode(source);
    this.write(meta.sourceBuffer, data); this.bytes()[meta.sourceBuffer + data.length] = 0;
    const code = x.Py_CompileString(meta.sourceBuffer, meta.filename, PY_FILE_INPUT);
    if (!code) {
      x.PyErr_Clear();
      // Recompiling inside the guest (never the host) recovers the real message.
      this.setMainString("_SOURCE", source);
      this.simple("_compile_error = _explain(_SOURCE)");
      throw Compile(this.mainString("_compile_error", "SyntaxError: invalid Python module"));
    }
    // The trusted prelude runs (its constructors detect literal moves); the player's source is parsed,
    // shape-checked and priced, never evaluated.
    const preludeGlobals = this.freshGlobals(0, 0);
    if (!x.PyEval_EvalCode(this.load(preludeBlob), preludeGlobals, preludeGlobals)) {
      x.PyErr_Clear(); throw Config("The room's Python prelude failed to run");
    }
    if (x.PyDict_SetItemString(meta.mainDict, meta.preludeKey, preludeGlobals)) throw new Error("Guest inspection preparation failed");
    this.setMainString("_SOURCE", source);
    this.setMainString("_VOCAB", vocab);
    this.setMainString("_SCHEME", scheme);
    this.simple("_inspection, _compile_error = _inspect(_SOURCE, _VOCAB, _SCHEME)");
    // Up to 1 MiB: an inspection with many literal moves is longer than an error message.
    const result = this.mainString("_inspection", "", 1024 * 1024);
    if (!result) throw Compile(this.mainString("_compile_error", "SyntaxError: invalid agent"));
    const inspection = JSON.parse(result);
    const parts = inspection.parts;
    // cost is Python's sum() of the parts (compensated summation), computed by the guest, so it is
    // bit-identical to the former host's.
    this.simple("_cost = repr(sum(json.loads(_inspection)['parts'].values()))");
    const cost = Number(this.mainString("_cost", "NaN"));
    const report = {
      cost, astBytes: inspection.astBytes, parts,
      literalMoves: inspection.literalMoves, literalMoveFallbackBits: inspection.fallbacks,
    };
    const blob = this.marshal(code);
    return this.cache.set(key, { blob, report }, blob.length + result.length + Buffer.byteLength(key));
  }
  steps() {
    const value = this.mainGet("_steps");
    const steps = value ? this.x.PyLong_AsLong(value) : -1;
    this.x.PyErr_Clear();
    return steps;
  }
  /** The guest's own exception text, computed inside the guest (and its budget). */
  guestError(what, limit) {
    const { x, meta } = this;
    const exc = x.PyErr_GetRaisedException();
    x.PyErr_Clear();
    if ((exc && x.PyObject_Type(exc) === meta.stepLimitType) || this.steps() > limit) return Limit(stepLimit(limit));
    let detail = "an error";
    if (exc && !x.PyDict_SetItemString(meta.mainDict, meta.excKey, exc)) {
      try { this.simple("_error = _describe(_exc)"); detail = this.mainString("_error", detail); }
      catch { x.PyErr_Clear(); }
    }
    return Execution(`${what}: ${detail}`);
  }

  /**
   * One request: {mode: "inspect" | "act", source, settings, input?, seed?, pricingScheme?}.
   * `onExecute` is called after trusted preparation, when the budgeted phase starts.
   * @returns the inspection report, or {calls, usedRandom, steps}; throws RuntimeError.
   */
  run(request, { onExecute } = {}) {
    if (request?.mode === "script") return this.script(request, { onExecute });
    if (request?.mode !== "inspect" && request?.mode !== "act") throw new Error("Unknown runner mode");
    const { source } = request;
    checkSource(source);
    if (source.includes("\0")) throw Compile(`Source must be a NUL-free string of at most ${SOURCE_MAX_BYTES} bytes`);
    const settings = normalize(request.settings);
    const { prelude, interactionComputeMs: budget, stepBudget: limit } = settings;
    const scheme = request.pricingScheme ?? "corpus";   // "uniform" only for tests and research
    if (scheme !== "corpus" && scheme !== "uniform") throw Config("Unknown pricing scheme");
    let seed;
    if (request.mode === "act") { checkInput(request.input, settings); seed = parseSeed(request.seed); }
    const identity = preludeDigest(prelude);
    const key = JSON.stringify([GRAMMAR, COMPLEXITY_ID, scheme, settings.objectType, prelude.key, identity, source]);
    const vocab = JSON.stringify(Object.fromEntries(Object.entries(prelude.pricing.python).sort(([a], [b]) => (a < b ? -1 : 1))));
    const { meta, wasi } = this;
    wasi.executing = false;
    let phase = "prepare";
    try {
      const preludeBlob = this.preparePrelude(prelude.python, JSON.stringify(["prelude", prelude.key, identity])).blob;
      const { blob, report } = this.prepare(source, key, preludeBlob, vocab, scheme);
      if (request.mode === "inspect") return { ...report };
      // Fresh guest: the one trusted snapshot, a restarted virtual clock and the act's entropy stream.
      this.restore();
      const { x } = this;   // after restore(), which may have replaced the instance
      wasi.resetAct(seed ^ ENTROPY_SALT);
      const preludeCode = this.load(preludeBlob);
      const code = this.load(blob);
      const globals = this.freshGlobals(seed, limit);
      // Trusted prelude and decode: outside the guest budget.
      if (!x.PyEval_EvalCode(preludeCode, globals, globals)) { x.PyErr_Clear(); throw Config("The room's Python prelude failed to run"); }
      const decode = x.PyDict_GetItemString(globals, meta.decodeKey);
      if (!decode || !x.PyDict_GetItemString(globals, meta.encodeKey)) throw Config("The room's prelude must define __decode and __encode_calls");
      const value = request.input;
      let argument;
      if (typeof value === "number") argument = x.PyLong_FromLongLong(BigInt(value));
      else {
        this.write(meta.inputBuffer, utf8.encode(value + "\0"));
        argument = x.PyUnicode_FromStringAndSize(meta.inputBuffer, value.length);
      }
      const obj = argument && x.PyObject_CallOneArg(decode, argument);
      if (!obj) { x.PyErr_Clear(); throw Config("The room's prelude could not decode the input"); }
      // Count steps in the player's own code objects only (not the prelude's).
      if (x.PyDict_SetItemString(meta.mainDict, meta.codeKey, code)) throw new Error("Guest instrumentation failed");
      this.simple("_instrument(_USER_CODE)");
      phase = "execute";
      onExecute?.();
      const elapsed = stopwatch();
      wasi.executing = true;
      // CPU backstop (post-check); a stuck native step is the worker watchdog's job.
      const timed = error => (elapsed() >= budget ? Limit(timeLimit(budget)) : error);
      if (!x.PyEval_EvalCode(code, globals, globals)) throw timed(this.guestError("The agent's module raised an error", limit));
      // Looked up after the module ran: the guest owns its globals.
      const agent = x.PyDict_GetItemString(globals, meta.agentKey);
      if (!agent) throw timed(Execution("The agent's module no longer defines agent"));
      const calls = x.PyObject_CallOneArg(agent, obj);
      if (!calls) throw timed(this.guestError("agent raised an error", limit));
      // The encoder is untrusted-equivalent (the guest can monkeypatch it or anything it uses); the
      // host parses and validates its output.
      const encode = x.PyDict_GetItemString(globals, meta.encodeKey);
      if (!encode) throw timed(Execution("The agent removed __encode_calls"));
      const result = x.PyObject_CallOneArg(encode, calls);
      if (!result) throw timed(this.guestError("Encoding agent's calls failed", limit));
      // Exact str only: no subclass, no repr/str/JSON hook is invoked.
      if (x.PyObject_Type(result) !== meta.strType) throw timed(Domain("agent must return a list of mutator calls (the encoder did not produce a string)"));
      if (x.PyUnicode_GetLength(result) > CALLS_MAX_BYTES) throw timed(Limit(`agent returned too many mutator calls (encoded output over ${CALLS_MAX_BYTES} bytes)`));
      const pointer = x.PyUnicode_AsUTF8AndSize(result, meta.sizeBuffer);
      const length = this.i32(meta.sizeBuffer);
      if (!pointer) { x.PyErr_Clear(); throw timed(Domain("Encoded calls must be an ASCII string")); }
      if (!(length >= 0 && length <= CALLS_MAX_BYTES)) throw timed(Limit(`agent returned too many mutator calls (encoded output over ${CALLS_MAX_BYTES} bytes)`));
      const data = this.read(pointer, length);
      if (data.some(b => b > 0x7f)) throw timed(Domain("Encoded calls must be an ASCII string"));
      const steps = this.steps();
      if (steps > limit) throw Limit(stepLimit(limit));
      // Seeded `random` sets the guest flag; any entropy read past the proxies is seen here.
      const usedRandom = this.mainGet("_used_random") === meta.truePtr || wasi.usedEntropy;
      if (elapsed() >= budget) throw Limit(timeLimit(budget));
      return { calls: new TextDecoder("latin1").decode(data), usedRandom, steps: Math.max(steps, 0) };
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      // A trap (or a host fault) may interrupt C stack unwinding: never reuse that instance.
      this.poisoned = true;
      if (error instanceof WebAssembly.RuntimeError || error instanceof RangeError || error instanceof CapabilityTrap)
        throw Limit(phase === "prepare" ? `The sandbox failed while preparing the agent: ${describeTrap(error)}` : describeTrap(error));
      throw new RuntimeError("EXECUTION", String(error?.message ?? error).slice(0, 1000));
    } finally {
      wasi.executing = false;
    }
  }

  /** Trusted compiler output for `text` (guest code or a script) as marshal bytes, cached under `key`. */
  compiled(text, filename, key, onError) {
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.restore();
    const { x } = this;
    const code = x.Py_CompileString(this.cstring(text), this.cstring(filename), PY_FILE_INPUT);
    if (!code) { x.PyErr_Clear(); onError(); }
    const blob = this.marshal(code);
    return this.cache.set(key, { blob }, blob.length + Buffer.byteLength(key));
  }

  /**
   * One script (python-script-v1): {mode: "script", source, input (JSON text), seed, settings: {cpuMs}}. The trusted
   * script guest (python-script.mjs) and `json.loads(input)` run outside the budget; the module, `main(data)` and the
   * JSON encoding of its result inside it. Bounds: the CPU post-check here and the pool's hard wall (nothing
   * interrupts a Python loop). Returns {result, output, outputTruncated, usedRandom, cpuMs}.
   */
  script(request, { onExecute } = {}) {
    const { source, input } = request;
    checkScriptSource(source);
    checkScriptInput(input);
    const { cpuMs, seed: seedText, store } = scriptOptions({ cpuMs: request.settings?.cpuMs, seed: request.seed, store: request.store });
    const seed = parseSeed(seedText);
    const { wasi } = this;
    wasi.executing = false;
    let phase = "prepare";
    try {
      const limits = { resultMax: SCRIPT_LIMITS.resultBytes, outputMax: SCRIPT_LIMITS.outputBytes, writesMax: SCRIPT_LIMITS.writesBytes };
      const guest = this.compiled(scriptGuest(limits), "<script-guest>", JSON.stringify(["script-guest", limits]),
        () => { throw new Error("Script guest does not compile"); });
      const { blob } = this.compiled(source, "<script>", JSON.stringify([SCRIPT_GRAMMAR_IDS.python, source]), () => {
        // Recompiling inside the guest (never the host) recovers the real message.
        this.setMainString("_SOURCE", source);
        this.simple("_compile_error = _explain(_SOURCE)");
        throw Compile(this.mainString("_compile_error", "SyntaxError: invalid Python script"));
      });
      this.restore();
      const { x, meta } = this;
      wasi.resetAct(seed ^ ENTROPY_SALT);
      if (!x.PyEval_EvalCode(this.load(guest.blob), meta.mainDict, meta.mainDict)) { x.PyErr_Clear(); throw new Error("Script guest failed to run"); }
      this.simple(`_act_setup(${seed}, 0)`);
      this.setMainString("_S_INPUT", input);
      this.setMainString("_S_STORE_IN", store);
      this.simple("_s_prepare()");
      if (this.mainString("_S_KIND", "") === "DOMAIN") throw Domain(this.mainString("_S_ERROR", "The input is not JSON"));
      const code = this.load(blob);
      if (x.PyDict_SetItemString(meta.mainDict, meta.codeKey, code)) throw new Error("Guest script preparation failed");
      phase = "execute";
      onExecute?.();
      const elapsed = stopwatch();
      wasi.executing = true;
      this.simple("_s_run(_USER_CODE)");
      const used = elapsed();
      wasi.executing = false;
      if (used >= cpuMs) throw Limit(scriptTimeLimit(cpuMs));
      const kind = this.mainString("_S_KIND", "EXECUTION");
      if (kind) {
        const message = this.mainString("_S_ERROR", "The script failed");
        throw kind === "LIMIT" ? Limit(message) : Execution(message);
      }
      const result = this.mainString("_S_RESULT", "", SCRIPT_LIMITS.resultBytes + 1);
      const output = this.mainString("_S_OUTPUT", "", SCRIPT_LIMITS.outputBytes);
      const writes = this.mainString("_S_WRITES", "", SCRIPT_LIMITS.writesBytes + 1);
      const usedRandom = this.mainGet("_used_random") === meta.truePtr || wasi.usedEntropy;
      return { result, output, outputTruncated: this.mainString("_S_CLIPPED", "") === "1", usedRandom, cpuMs: Math.round(used), writes };
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      this.poisoned = true;
      if (error instanceof WebAssembly.RuntimeError || error instanceof RangeError || error instanceof CapabilityTrap) {
        const text = describeTrap(error).replace(/the agent/g, "the script");
        throw Limit(phase === "prepare" ? `The sandbox failed while preparing the script: ${text}` : text);
      }
      throw new RuntimeError("EXECUTION", String(error?.message ?? error).slice(0, 1000));
    } finally {
      wasi.executing = false;
    }
  }

  /** Trusted evaluation of an expression over the guest's own modules (tests only; never on agent input). */
  trustedEval(expression) {
    this.restore();
    this.simple(`_trusted = json.dumps(${expression})`);
    return JSON.parse(this.mainString("_trusted", "null", 1024 * 1024));
  }
}
