import ts from "typescript";
import { getQuickJS } from "quickjs-emscripten";
import { createInterface } from "node:readline";

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
  const statement = file.statements[0];
  const expression = statement?.declarationList?.declarations[0]?.initializer;
  if (file.statements.length !== 1 || !expression || !ts.isParenthesizedExpression(expression)
      || statement.declarationList.declarations.length !== 1) {
    throw Object.assign(new Error("Source must be one callable expression"), { code: "COMPILE" });
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
    new Error(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n")), { code: "COMPILE" });
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

function execute(js, input) {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 1000;
  let ticks = 0;
  runtime.setInterruptHandler(() => ++ticks > 10000 || Date.now() > deadline);
  const context = runtime.newContext();
  // Capture the intrinsic before untrusted code can replace JSON.stringify.
  // getString uses a NUL-terminated bridge; JSON escaping preserves embedded NULs.
  const encode = context.unwrapResult(context.evalCode("JSON.stringify"));
  try {
    const setup = context.evalCode(`{
      const denied = () => { throw new Error("Nondeterministic facility unavailable"); };
      Object.defineProperty(Math, "random", {value: denied, writable: false, configurable: false});
      Object.defineProperty(globalThis, "Date", {value: undefined, writable: false, configurable: false});
    }`);
    context.unwrapResult(setup).dispose();
    const result = context.evalCode(`${js}\n__agent`, "agent.js");
    if (result.error) {
      result.error.dispose();
      throw Object.assign(new Error("Callable creation failed or exhausted resources"), { code: "EXECUTION" });
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
          throw Object.assign(new Error("Execution failed or exhausted resources"), { code: "EXECUTION" });
        }
        try {
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
  } finally { encode.dispose(); context.dispose(); runtime.dispose(); }
}

process.stdout.write('{"ready":true}\n');
for await (const line of createInterface({ input: process.stdin })) {
  try {
    if (Buffer.byteLength(line) > 131072) throw new Error("Request too large");
    const request = JSON.parse(line);
    const { cost, js } = compile(request.source, request.settings);
    const result = request.mode === "inspect" ? { cost } : { value: execute(js, request.input) };
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code ?? "EXECUTION",
      error: String(error.message).slice(0, 1000) }) + "\n");
  }
}
