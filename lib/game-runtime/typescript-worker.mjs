import ts from "typescript";
import { getQuickJS } from "quickjs-emscripten";
import { createInterface } from "node:readline";
import { createHash, randomInt } from "node:crypto";

const QuickJS = await getQuickJS();
const options = {
  strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  noEmit: true, noResolve: false, types: [], lib: ["lib.es2022.d.ts"],
};
const baseHost = ts.createCompilerHost(options);
// Trusted, immutable standard declarations are read once per worker.
const libraryCache = new Map();
// Cache only trusted compiler output, never a guest callable/context. The
// versioned key includes the exact source, the object type, the prelude key and
// a SHA-256 of the exact prelude text, JSON-encoded (no delimiter concatenation
// that adversarial source could collide with).
const compileCache = new Map();
let compileCacheBytes = 0;
const CACHE_ENTRIES = 128;
const CACHE_BYTES = 4 * 1024 * 1024;
const GRAMMAR = "typescript-agent-v1";
const CALLS_MAX = 65536;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const EXAMPLE = "\n    function agent(grid) {\n        return [];\n    }";
/** Collision-resistant identity of the exact trusted prelude text (cache keys). */
const digest = prelude => createHash("sha256")
  .update(JSON.stringify([prelude.python, prelude.js, prelude.dts])).digest("hex");

/** A diagnostic's message, with line, column and a caret in the player's own source. */
function located(message, source, position) {
  const file = ts.createSourceFile("/agent.ts", source, options.target);
  const { line, character } = file.getLineAndCharacterOfPosition(Math.min(position, source.length));
  const text = source.split("\n")[line];
  if (text === undefined) return message;
  const start = Math.max(character - 60, 0);
  return `${message} (line ${line + 1}, column ${character + 1})\n    ${text.slice(start, character + 20)}\n    ${" ".repeat(character - start)}^`;
}
const timeLimit = computeMs => `Time limit exceeded: the agent used more than its ${computeMs} ms compute budget for one interaction. Do less work per call.`;

// Trusted check: agent accepts what __decode produces and returns what __encode_calls takes.
const CHECK = "declare const __cg_wire: Parameters<typeof __decode>[0];\n__encode_calls(agent(__decode(__cg_wire)));\n";
// Unannotated agent parameters are contextually typed by the prelude's decoder.
const INPUT = ": ReturnType<typeof __decode>";

const libraries = ts.getDefaultLibFilePath(options).replace(/[^/]+$/, "");
function program(files) {
  const host = {
    ...baseHost,
    getSourceFile(name, languageVersion) {
      if (files.has(name)) return files.get(name);
      // Never resolve submission-controlled modules or triple-slash paths.
      if (!name.startsWith(libraries)) return undefined;
      if (!libraryCache.has(name)) libraryCache.set(name, baseHost.getSourceFile(name, languageVersion));
      return libraryCache.get(name);
    },
  };
  return ts.createProgram([...files.keys()], options, host);
}
// Trusted declaration files that type-check on their own, by prelude digest (small LRU).
const preludeCache = new Map();
function checkedPrelude(dts, identity) {
  if (preludeCache.has(identity)) {
    const file = preludeCache.get(identity);
    preludeCache.delete(identity); preludeCache.set(identity, file);
    return file;
  }
  const file = ts.createSourceFile("/prelude.d.ts", dts, options.target, true);
  const diagnostics = ts.getPreEmitDiagnostics(program(new Map([["/prelude.d.ts", file]])));
  if (diagnostics.length || file.referencedFiles.length || file.typeReferenceDirectives.length) {
    fail("CONFIG", `The room's TypeScript prelude declarations do not type-check: ${diagnostics.length
      ? ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n") : "reference directives are unavailable"}`);
  }
  if (preludeCache.size >= 16) preludeCache.delete(preludeCache.keys().next().value);
  preludeCache.set(identity, file);
  return file;
}

function compile(source, settings) {
  const { prelude } = settings;
  const identity = digest(prelude);
  const key = JSON.stringify([GRAMMAR, ts.version, options, settings.objectType,
    prelude.key, identity, source]);
  const cached = compileCache.get(key);
  if (cached) {
    compileCache.delete(key);
    compileCache.set(key, cached);
    return cached.result;
  }
  const file = ts.createSourceFile("/agent.ts", source, options.target, true);
  if (file.parseDiagnostics?.length) {
    const d = file.parseDiagnostics[0];
    fail("COMPILE", `SyntaxError: ${located(ts.flattenDiagnosticMessageText(d.messageText, "\n"), source, d.start)}`);
  }
  if (file.referencedFiles.length || file.typeReferenceDirectives.length || file.libReferenceDirectives.length) {
    fail("COMPILE", "Reference directives are unavailable");
  }
  const agents = file.statements.filter(s => ts.isFunctionDeclaration(s) && s.name?.text === "agent");
  const bodies = agents.filter(s => s.body);
  if (!bodies.length) fail("COMPILE", `SyntaxError: an agent must declare a function named agent at the top level, like:${EXAMPLE}`);
  if (bodies.length > 1) fail("COMPILE", located("SyntaxError: agent is declared more than once", source, bodies[1].getStart(file)));
  const agent = bodies[0];
  if (agent.asteriskToken || agent.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
    fail("COMPILE", located("SyntaxError: agent must be a plain function, not async or a generator", source, agent.getStart(file)));
  }
  // ast-bytes-v1 over the player's source only (the SourceFile root counts once,
  // the end-of-file token does not). Never the prelude or the trusted check.
  let cost = 1;
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
        || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
        || node.kind === ts.SyntaxKind.ExportKeyword
        || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      fail("COMPILE", located("Module imports and exports are unavailable", source, node.getStart(file)));
    }
    if (ts.isStringLiteralLike(node)) cost += Buffer.byteLength(node.text, "utf8");
    else if (ts.isNumericLiteral(node)) {
      const n = Number(node.text);
      cost += Number.isSafeInteger(n) ? Math.max(1, Math.ceil((BigInt(n).toString(2).length + 1) / 8)) : 8;
    } else cost += 1;
    ts.forEachChild(node, visit);
  }
  file.statements.forEach(visit);
  const first = agent.parameters[0];
  const at = first && !first.type ? (first.questionToken ?? first.name).end : -1;
  const checked = at < 0 ? file : ts.createSourceFile("/agent.ts",
    source.slice(0, at) + INPUT + source.slice(at), options.target, true);
  const declarations = checkedPrelude(prelude.dts, identity);
  const files = new Map([
    ["/prelude.d.ts", declarations],
    ["/agent.ts", checked],
    ["/check.ts", ts.createSourceFile("/check.ts", CHECK, options.target, true)],
  ]);
  const diagnostics = ts.getPreEmitDiagnostics(program(files));
  const where = name => diagnostics.find(d => d.file?.fileName === name);
  const own = where("/agent.ts"), check = where("/check.ts");
  if (own) {
    // Map positions in the checked text back to the player's source.
    const position = at >= 0 && own.start > at ? Math.max(at, own.start - INPUT.length) : own.start;
    fail("COMPILE", `TypeError: ${located(ts.flattenDiagnosticMessageText(own.messageText, "\n"), source, position)}`);
  }
  if (check) fail("COMPILE", `TypeError: agent must take one argument (the room's object) and return a list of mutator calls: ${ts.flattenDiagnosticMessageText(check.messageText, "\n")}`);
  if (diagnostics.length) fail("CONFIG", `The room's TypeScript prelude declarations do not type-check: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n")}`);
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  } }).outputText;
  const result = Object.freeze({ cost, js });
  const bytes = Buffer.byteLength(key) + Buffer.byteLength(js);
  if (bytes <= CACHE_BYTES) {
    while (compileCache.size >= CACHE_ENTRIES || compileCacheBytes + bytes > CACHE_BYTES) {
      const oldest = compileCache.keys().next().value;
      compileCacheBytes -= compileCache.get(oldest).bytes;
      compileCache.delete(oldest);
    }
    compileCache.set(key, { result, bytes });
    compileCacheBytes += bytes;
  }
  return result;
}

function act(js, preludeJs, input, computeMs = 5, onExecute = () => {}) {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const context = runtime.newContext();
  const handles = [];
  const keep = handle => (handles.push(handle), handle);
  // Capture the intrinsic before untrusted code can replace JSON.stringify.
  // getString uses a NUL-terminated bridge; JSON escaping preserves embedded NULs.
  const stringify = keep(context.unwrapResult(context.evalCode("JSON.stringify")));
  const clock = keep(context.newFunction("__clock", () => context.newNumber(Date.now())));
  const entropy = keep(context.newFunction("__entropy", () => context.newNumber(randomInt(2 ** 48 - 1) / (2 ** 48 - 1))));
  /** Copy a guest string primitive exactly, after bounding its length. */
  const copy = (handle, max) => {
    if (context.typeof(handle) !== "string") return undefined;
    const length = context.getProp(handle, "length");
    const size = context.getNumber(length);
    length.dispose();
    if (size > max) return null;
    const encoded = context.unwrapResult(context.callFunction(stringify, context.undefined, handle));
    try { return JSON.parse(context.getString(encoded)); } finally { encoded.dispose(); }
  };
  try {
    context.setProp(context.global, "__clock", clock);
    context.setProp(context.global, "__entropy", entropy);
    const setup = context.evalCode(`{
      const clock = globalThis.__clock, entropy = globalThis.__entropy, NativeDate = Date;
      delete globalThis.__clock; delete globalThis.__entropy;
      const HostDate = function(...args) {
        if (!new.target) return new NativeDate(clock()).toString();
        return Reflect.construct(NativeDate, args.length ? args : [clock()], new.target);
      };
      Object.setPrototypeOf(HostDate, NativeDate);
      HostDate.prototype = NativeDate.prototype;
      Object.defineProperty(HostDate, "now", {value: clock});
      Object.defineProperty(globalThis, "Date", {value: HostDate, writable: false, configurable: false});
      Object.defineProperty(Math, "random", {value: entropy, writable: false, configurable: false});
    }`);
    context.unwrapResult(setup).dispose();
    // Error text is computed by guest code (user getters may run), inside the budget.
    const describe = keep(context.unwrapResult(context.evalCode(`(e) => {
      try { return (String((e && e.name) || "Error") + ": " + String(e && e.message !== undefined ? e.message : e)).slice(0, 500); }
      catch { return "an error"; }
    }`)));
    // Trusted prelude and decode: outside the guest budget.
    const prelude = context.evalCode(preludeJs, "prelude.js");
    if (prelude.error) { prelude.error.dispose(); fail("CONFIG", "The room's JavaScript prelude failed to run"); }
    prelude.value.dispose();
    const decode = keep(context.getProp(context.global, "__decode"));
    const encode = keep(context.getProp(context.global, "__encode_calls"));
    if (context.typeof(decode) !== "function" || context.typeof(encode) !== "function") {
      fail("CONFIG", "The room's prelude must define __decode and __encode_calls");
    }
    // newString also crosses a NUL-terminated bridge. A host-escaped literal
    // preserves all ASCII code points without executing input as source.
    const arg = keep(typeof input === "number" ? context.newNumber(input)
      : context.unwrapResult(context.evalCode(JSON.stringify(input))));
    const decoded = context.callFunction(decode, context.undefined, arg);
    if (decoded.error) { decoded.error.dispose(); fail("CONFIG", "The room's prelude could not decode the input"); }
    const object = keep(decoded.value);
    // Prefer this thread's CPU clock when supported; process CPU is conservative
    // on older Node versions (it can include host background work). Compilation,
    // fresh-context setup, the prelude and decode are outside the guest budget.
    const cpuClock = process.threadCpuUsage?.bind(process) ?? process.cpuUsage.bind(process);
    // The parent's execution wall backstop starts here, after trusted setup.
    onExecute();
    const start = cpuClock();
    const expired = () => {
      const used = cpuClock(start);
      return used.user + used.system >= computeMs * 1000;
    };
    runtime.setInterruptHandler(expired);
    // Interrupt checks are cooperative: long native builtins may return late.
    // The post-check rejects those results; the parent hard wall kills hangs.
    const guest = (result, what) => {
      if (!result.error) return keep(result.value);
      const error = keep(result.error);
      if (expired()) fail("LIMIT", timeLimit(computeMs));
      const text = context.callFunction(describe, context.undefined, error);
      let detail = "an error";
      if (!text.error) { detail = copy(keep(text.value), 1000) || detail; }
      else text.error.dispose();
      if (expired()) fail("LIMIT", timeLimit(computeMs));
      fail("EXECUTION", `${what}: ${detail}`);
    };
    guest(context.evalCode(js, "agent.js"), "The agent's program threw an error");
    let agent;
    try { agent = keep(context.getProp(context.global, "agent")); }
    catch { fail(expired() ? "LIMIT" : "EXECUTION", expired() ? timeLimit(computeMs) : "Reading agent failed"); }
    if (context.typeof(agent) !== "function") fail("EXECUTION", "The agent's program no longer defines function agent");
    const calls = guest(context.callFunction(agent, context.undefined, object), "agent threw an error");
    // The encoder is untrusted-equivalent (the guest can replace what it uses);
    // the host parses and validates its output.
    const output = guest(context.callFunction(encode, context.undefined, calls), "Encoding agent's calls failed");
    if (expired()) fail("LIMIT", timeLimit(computeMs));
    const text = copy(output, CALLS_MAX);
    if (text === undefined) fail("DOMAIN", "agent must return a list of mutator calls (the encoder did not produce a string)");
    if (text === null) fail("LIMIT", `agent returned too many mutator calls (encoded output over ${CALLS_MAX} bytes)`);
    if (expired()) fail("LIMIT", timeLimit(computeMs));
    if (/[^\x00-\x7f]/u.test(text)) fail("DOMAIN", "Encoded calls must be an ASCII string");
    return text;
  } finally {
    for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
    context.dispose(); runtime.dispose();
  }
}

// Trusted warm-up before announcing readiness: V8 compiles QuickJS's Wasm
// functions lazily on first use, which must not be charged to a player's budget.
for (let i = 0; i < 3; i++) {
  act("function agent(o) { return [{ m: String(o), at: Date.now(), r: Math.random(), s: [1, 2].map(x => x * 2) }]; }\n",
    "function __decode(w) { return w; }\nfunction __encode_calls(c) { return JSON.stringify(c); }\n",
    i ? "warm" : 1, 1000);
  try { act("function agent(o) { throw new Error('warm'); }", "function __decode(w) { return w; }\nfunction __encode_calls(c) { return c; }", 1, 1000); }
  catch { /* expected */ }
}
process.stdout.write('{"ready":true,"executionPhases":true}\n');
for await (const line of createInterface({ input: process.stdin })) {
  try {
    if (Buffer.byteLength(line) > 524288) throw new Error("Request too large");
    const request = JSON.parse(line);
    const { cost, js } = compile(request.source, request.settings);
    const result = request.mode === "inspect" ? { cost }
      : { calls: act(js, request.settings.prelude.js, request.input, request.settings.interactionComputeMs,
        () => process.stdout.write('{"phase":"execute"}\n')) };
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code ?? "EXECUTION",
      error: String(error.message).slice(0, 1000) }) + "\n");
  }
}
