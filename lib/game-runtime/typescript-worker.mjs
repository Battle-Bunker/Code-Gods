import ts from "typescript";
import { getQuickJS } from "quickjs-emscripten";
import { createInterface } from "node:readline";
import { randomInt } from "node:crypto";

const QuickJS = await getQuickJS();
const options = {
  strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  noEmit: true, noResolve: false, types: [], lib: ["lib.es2022.d.ts"],
};
const baseHost = ts.createCompilerHost(options);
// Trusted, immutable standard declarations are read once per worker.
const libraryCache = new Map();
// Cache only trusted compiler output, never a guest callable/context. The
// versioned key includes exact source and every domain field (not a hash or
// delimiter-concatenation that adversarial source could collide with).
const compileCache = new Map();
let compileCacheBytes = 0;
const CACHE_ENTRIES = 128;
const CACHE_BYTES = 4 * 1024 * 1024;
/** A diagnostic's message, with line, column and a caret in the player's own source. */
function located(diagnostic, source) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  // The trusted wrapper puts the submission on its own lines, starting at line 1.
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const lines = source.split("\n"), text = lines[line - 1];
  if (line > lines.length) return `${message} (at the end of the agent)`;
  if (text === undefined) return message;
  const start = Math.max(character - 60, 0);
  return `${message} (line ${line}, column ${character + 1})\n    ${text.slice(start, character + 20)}\n    ${" ".repeat(character - start)}^`;
}
const timeLimit = computeMs => `Time limit exceeded: the agent used more than its ${computeMs} ms compute budget for one interaction. Do less work per call.`;

function compile(source, settings) {
  const key = JSON.stringify(["typescript-expression-v1", ts.version, options,
    settings?.objectType, settings?.intMin, settings?.intMax,
    settings?.stringMaxLength, source]);
  const cached = compileCache.get(key);
  if (cached) {
    compileCache.delete(key);
    compileCache.set(key, cached);
    return cached.result;
  }
  const filename = "/submission.ts";
  const objectType = settings?.objectType === "Int" ? "number"
    : settings?.objectType === "string" ? "string" : undefined;
  if (!objectType) {
    throw Object.assign(new Error("Unsupported domain settings"), { code: "DOMAIN" });
  }
  // The room supplies T for the advertised T => T expression contract.
  // This trusted annotation contextually types unannotated parameters and
  // checks both argument and return types without weakening strict checking.
  const text = `const __agent: (input: ${objectType}) => ${objectType} = (\n${source}\n);`;
  const file = ts.createSourceFile(filename, text, options.target, true);
  if (file.parseDiagnostics?.length) {
    throw Object.assign(new Error(`SyntaxError: ${located(file.parseDiagnostics[0], source)}`), { code: "COMPILE" });
  }
  const statement = file.statements[0];
  const expression = statement?.declarationList?.declarations[0]?.initializer;
  if (file.statements.length !== 1 || !expression || !ts.isParenthesizedExpression(expression)
      || statement.declarationList.declarations.length !== 1) {
    throw Object.assign(new Error("An agent must be one expression that evaluates to a function, like (x) => x + 1. Statements such as function declarations, return and import are not allowed."), { code: "COMPILE" });
  }
  let cost = 0;
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
        || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      throw Object.assign(new Error("Module imports are unavailable"), { code: "COMPILE" });
    }
    if (ts.isStringLiteralLike(node)) cost += Buffer.byteLength(node.text, "utf8");
    else if (ts.isNumericLiteral(node)) {
      const n = Number(node.text);
      cost += Number.isSafeInteger(n) ? Math.max(1, Math.ceil((BigInt(n).toString(2).length + 1) / 8)) : 8;
    } else cost += 1;
    ts.forEachChild(node, visit);
  }
  visit(expression.expression); // Only user syntax, never the trusted T => T wrapper.
  const host = {
    ...baseHost,
    getSourceFile(name, languageVersion) {
      if (name === filename) return file;
      // Never resolve submission-controlled modules or triple-slash paths.
      if (!name.startsWith(ts.getDefaultLibFilePath(options).replace(/[^/]+$/, ""))) return undefined;
      if (!libraryCache.has(name)) libraryCache.set(name, baseHost.getSourceFile(name, languageVersion));
      return libraryCache.get(name);
    },
  };
  if (file.referencedFiles.length || file.typeReferenceDirectives.length || file.libReferenceDirectives.length) {
    throw Object.assign(new Error("Reference directives are unavailable"), { code: "COMPILE" });
  }
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw Object.assign(
    new Error(`TypeError: ${located(diagnostics[0], source)}`), { code: "COMPILE" });
  const checker = program.getTypeChecker();
  if (!checker.getTypeAtLocation(expression).getCallSignatures().length) {
    throw Object.assign(new Error("Source must have a callable type"), { code: "COMPILE" });
  }
  const js = ts.transpileModule(text, { compilerOptions: {
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

function execute(js, input, computeMs = 5) {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const context = runtime.newContext();
  // Capture the intrinsic before untrusted code can replace JSON.stringify.
  // getString uses a NUL-terminated bridge; JSON escaping preserves embedded NULs.
  const encode = context.unwrapResult(context.evalCode("JSON.stringify"));
  const clock = context.newFunction("__clock", () => context.newNumber(Date.now()));
  const entropy = context.newFunction("__entropy", () => context.newNumber(randomInt(2 ** 48 - 1) / (2 ** 48 - 1)));
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
    // Prefer this thread's CPU clock when supported; process CPU is conservative
    // on older Node versions (it can include host background work). Compilation
    // and fresh-context setup are deliberately outside the guest budget.
    const cpuClock = process.threadCpuUsage?.bind(process) ?? process.cpuUsage.bind(process);
    const start = cpuClock();
    const expired = () => {
      const used = cpuClock(start);
      return used.user + used.system >= computeMs * 1000;
    };
    runtime.setInterruptHandler(expired);
    // Interrupt checks are cooperative: long native builtins may return late.
    // The post-check rejects those results; the parent hard wall kills hangs.
    const result = context.evalCode(`${js}\n__agent`, "agent.js");
    if (result.error) {
      result.error.dispose();
      const over = expired();
      throw Object.assign(new Error(over ? timeLimit(computeMs) : "Creating the agent's function failed"), { code: over ? "LIMIT" : "EXECUTION" });
    }
    const fn = result.value;
    try {
      if (context.typeof(fn) !== "function") throw new Error("Source did not produce a callable");
      // newString also crosses a NUL-terminated bridge. A host-escaped literal
      // preserves all ASCII code points without executing input as source.
      const arg = typeof input === "number" ? context.newNumber(input)
        : context.unwrapResult(context.evalCode(JSON.stringify(input)));
      try {
        const output = context.callFunction(fn, context.undefined, arg);
        if (output.error) {
          output.error.dispose();
          const over = expired();
      throw Object.assign(new Error(over ? timeLimit(computeMs) : "The agent threw an error"), { code: over ? "LIMIT" : "EXECUTION" });
        }
        try {
          if (expired()) throw Object.assign(new Error(timeLimit(computeMs)), { code: "LIMIT" });
          const type = context.typeof(output.value);
          if (type !== typeof input || !["number", "string"].includes(type)) {
            throw Object.assign(new Error("Output must preserve the primitive input type"), { code: "DOMAIN" });
          }
          // Bound before copying a potentially large guest string into the host.
          if (type === "string") {
            const length = context.getProp(output.value, "length");
            const size = context.getNumber(length);
            length.dispose();
            if (size > 8192) throw Object.assign(new Error("Output too large"), { code: "DOMAIN" });
          }
          if (type === "number") return context.getNumber(output.value);
          const encoded = context.unwrapResult(context.callFunction(encode, context.undefined, output.value));
          try { return JSON.parse(context.getString(encoded)); }
          finally { encoded.dispose(); }
        } finally { output.value.dispose(); }
      } finally { arg.dispose(); }
    } finally { fn.dispose(); }
  } finally { clock.dispose(); entropy.dispose(); encode.dispose(); context.dispose(); runtime.dispose(); }
}

process.stdout.write('{"ready":true,"executionPhases":true,"executeBatch":true}\n');
for await (const line of createInterface({ input: process.stdin })) {
  try {
    if (Buffer.byteLength(line) > 131072) throw new Error("Request too large");
    const request = JSON.parse(line);
    const { cost, js } = compile(request.source, request.settings);
    if (request.mode !== "inspect") process.stdout.write('{"phase":"execute"}\n');
    const result = request.mode === "inspect" ? { cost }
      : request.mode === "executeBatch"
        ? { values: request.input.map(input => execute(js, input, request.settings.interactionComputeMs)) }
        : { value: execute(js, request.input, request.settings.interactionComputeMs) };
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code ?? "EXECUTION",
      error: String(error.message).slice(0, 1000) }) + "\n");
  }
}
