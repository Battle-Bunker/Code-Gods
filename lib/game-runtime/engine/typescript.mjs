/**
 * typescript-agent-v1 on QuickJS-Wasm: type-check + transpile (cached trusted compiler output) and a
 * fresh QuickJS runtime and context per act. Runs in-process or inside a worker_thread (index.mjs).
 * The compiler and QuickJS are injected (`typescript`, `quickjs-emscripten`), so a worker can load the
 * copies its host resolved (Convex installs them as external packages).
 */
import { makeTsAstBits } from "./ts-ast-bits.mjs";
import { fail, normalize, checkSource, checkInput, parseSeed, preludeDigest, checkScriptSource, checkScriptInput, scriptOptions } from "./domain.mjs";
import { createQuickJSExecutor } from "./quickjs.mjs";

export const TYPESCRIPT_VERSION = "5.9.3";

/** @param {{ ts: typeof import("typescript"), getQuickJS: () => Promise<any> }} deps */
export async function createTypeScriptEngine({ ts, getQuickJS }) {
  // typescript-agent-v1 is type-checked with TypeScript 5.9.3 (and priced on its AST): refuse any other.
  if (ts.version !== TYPESCRIPT_VERSION) throw new Error(`TypeScript ${TYPESCRIPT_VERSION} is required, found ${ts.version}`);
  const QuickJS = await getQuickJS();
  const executor = await createQuickJSExecutor({ getQuickJS });
  const { tsAstBits } = makeTsAstBits(ts);
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
  const COMPLEXITY_ID = "ts-ast-bits-v1-uniform";
  const CALLS_MAX = 65536;
  const EXAMPLE = "\n    function agent(grid) {\n        return [];\n    }";
  /** Collision-resistant identity of the exact trusted prelude text (cache keys). */
  const digest = preludeDigest;

  /** A diagnostic's message, with line, column and a caret in the player's own source. */
  function located(message, source, position) {
    const file = ts.createSourceFile("/agent.ts", source, options.target);
    const { line, character } = file.getLineAndCharacterOfPosition(Math.min(position, source.length));
    const text = source.split("\n")[line];
    if (text === undefined) return message;
    const start = Math.max(character - 60, 0);
    return `${message} (line ${line + 1}, column ${character + 1})\n    ${text.slice(start, character + 20)}\n    ${" ".repeat(character - start)}^`;
  }

  // Trusted check: agent accepts what __decode produces and returns what __encode_calls takes.
  const CHECK = "declare const __cg_wire: Parameters<typeof __decode>[0];\n__encode_calls(agent(__decode(__cg_wire)));\n";
  // Unannotated agent parameters are contextually typed by the prelude's decoder.
  const INPUT = ": ReturnType<typeof __decode>";
  // What the sandbox adds to ES2022: a virtual-clock `performance.now()` (milliseconds).
  const RUNTIME_DTS = ts.createSourceFile("/runtime.d.ts",
    "declare const performance: { readonly now: () => number };\n", ts.ScriptTarget.ES2022, true);

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
    const key = JSON.stringify([GRAMMAR, COMPLEXITY_ID, ts.version, options, settings.objectType,
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
      ["/runtime.d.ts", RUNTIME_DTS],
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
    // ts-ast-bits-v1 (uniform) over the player's source; literal moves are evaluated by the trusted
    // prelude constructors on literal arguments only.
    const priced = withPrelude(prelude.js, evaluate => tsAstBits(file, prelude.pricing.typescript, evaluate));
    const parts = priced.parts;
    const inspection = Object.freeze({
      cost: parts.structure + parts.names + parts.literals + parts.moveFlags, astBytes: cost, parts,
      literalMoves: priced.literalMoves, literalMoveFallbackBits: priced.fallbacks,
    });
    const result = Object.freeze({ inspection, js });
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(js) + Buffer.byteLength(JSON.stringify(inspection));
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

  /** A trusted QuickJS context with the prelude loaded, for evaluating literal constructor calls. */
  function withPrelude(preludeJs, use) {
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(32 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const deadline = Date.now() + 2000;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const context = runtime.newContext();
    try {
      const loaded = context.evalCode(preludeJs, "prelude.js");
      if (loaded.error) { loaded.error.dispose(); fail("CONFIG", "The room's JavaScript prelude failed to run"); }
      loaded.value.dispose();
      const evaluate = text => {
        // `text` is JavaScript built only from literals and API names (ts-ast-bits.mjs `literal`).
        const out = context.evalCode(`(() => { const c = ${text}; return typeof c === "function" ? null : __encode_calls([c]); })()`);
        if (out.error) { out.error.dispose(); return null; }
        try {
          if (context.typeof(out.value) !== "string") return null;
          const wire = JSON.parse(context.getString(out.value));
          return Array.isArray(wire) && wire.length === 1 && Array.isArray(wire[0]) && wire[0].length === 2
            && typeof wire[0][0] === "string" && wire[0][1] && typeof wire[0][1] === "object" && !Array.isArray(wire[0][1])
            ? wire[0] : null;
        } catch { return null; } finally { out.value.dispose(); }
      };
      return use(evaluate);
    } finally { context.dispose(); runtime.dispose(); }
  }

  /**
   * typescript-script-v1: types erased (never checked: an analytics script should not fail on a type), syntax errors
   * located, and no module syntax (imports, exports, `import()`), since a script reaches nothing but its input.
   * Returns {js}: trusted compiler output.
   */
  function transpileScript(source) {
    checkScriptSource(source);
    const file = ts.createSourceFile("/script.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const syntax = file.parseDiagnostics ?? [];
    if (syntax.length) fail("COMPILE", located(`SyntaxError: ${ts.flattenDiagnosticMessageText(syntax[0].messageText, "\n")}`, source, syntax[0].start ?? 0));
    let banned;
    const visit = node => {
      if (banned) return;
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
          || (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
          || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
          || ts.isImportTypeNode(node) || ts.isModuleDeclaration(node)) banned = node;
      else ts.forEachChild(node, visit);
    };
    visit(file);
    for (const ref of [...file.referencedFiles, ...file.typeReferenceDirectives]) banned ??= { getStart: () => ref.pos };
    if (banned) fail("COMPILE", located("SyntaxError: a script has no imports, exports, modules or reference directives: it reads only its data argument", source, banned.getStart(file)));
    const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: false }, reportDiagnostics: true, fileName: "/script.ts" });
    if (out.diagnostics?.length) fail("COMPILE", located(`SyntaxError: ${ts.flattenDiagnosticMessageText(out.diagnostics[0].messageText, "\n")}`, source, out.diagnostics[0].start ?? 0));
    return { js: out.outputText };
  }

  return {
    /** Trusted compiler output for a source: {inspection, js} (cached here). Throws COMPILE / CONFIG. */
    compile(source, rawSettings) {
      checkSource(source);
      const settings = normalize(rawSettings);
      const { inspection, js } = compile(source, settings);
      return { inspection: { ...inspection }, js };
    },
    /** Compiled JavaScript, executed (see quickjs.mjs). */
    execute: executor.execute,
    /** A script's trusted compiler output {js} (typescript-script-v1). */
    transpileScript,
    /**
     * One request: {mode: "inspect" | "act", source, settings, input?, seed?}. `onExecute` is called
     * when the budgeted phase starts. Returns the inspection, or {calls, usedRandom, steps}.
     */
    run(request, { onExecute } = {}) {
      if (request?.mode === "transpile") return transpileScript(request.source);
      if (request?.mode === "script") {
        checkScriptInput(request.input);
        const { cpuMs, seed } = scriptOptions({ cpuMs: request.settings?.cpuMs, seed: request.seed });
        return executor.script({ js: request.js ?? transpileScript(request.source).js, input: request.input, cpuMs, seed }, { onExecute });
      }
      if (request?.mode !== "inspect" && request?.mode !== "act") throw new Error("Unknown runner mode");
      checkSource(request.source);
      const settings = normalize(request.settings);
      if (request.mode === "act") { checkInput(request.input, settings); parseSeed(request.seed); }
      const { inspection, js } = compile(request.source, settings);
      if (request.mode === "inspect") return { ...inspection };
      return executor.execute({ js, preludeJs: settings.prelude.js, input: request.input,
        computeMs: settings.interactionComputeMs, seed: request.seed, stepBudget: settings.stepBudget }, { onExecute });
    },
  };
}
