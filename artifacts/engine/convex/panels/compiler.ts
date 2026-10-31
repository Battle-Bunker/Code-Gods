"use node";
/**
 * The stored-panel compiler: TSX source → CommonJS (react-jsx) that the player client's panel frame evaluates.
 *
 * Phase 1 checks syntax only (TypeScript's transpileModule; type-checking against sdk.d.ts is phase 2) plus an
 * import allowlist walked over the AST: static imports, re-exports, `import x = require()` and literal
 * `require("…")` must name react, react/jsx-runtime or @sdk; dynamic `import()` and computed `require(x)` are
 * refused. Any error means no code: the caller gets diagnostics {line, column, code, message} and nothing is stored.
 */
import { createHash } from "node:crypto";
import ts from "typescript";
import { fail } from "../lib/errors.ts";
import { LIMITS, kb } from "./limits.ts";

export const PANEL_IMPORTS = ["react", "react/jsx-runtime", "@sdk"] as const;
/** Bumped when the output format changes (stored versions record it). */
export const COMPILER_REVISION = 1;
export const compilerVersion = () => `cg-panels/${COMPILER_REVISION} typescript/${ts.version}`;

export type Diagnostic = { line: number; column: number; code: string; message: string };
/** Manifest values read from a literal `definePanel({ title, placement, size })` (the save call can override them). */
export type PanelManifest = { title?: string; placement?: "left" | "right" | "bottom"; size?: "sm" | "md" | "lg" };
export type CompileResult =
  | { ok: true; compiled: string; diagnostics: Diagnostic[]; manifest: PanelManifest; compilerVersion: string; sourceHash: string }
  | { ok: false; diagnostics: Diagnostic[]; compilerVersion: string; sourceHash: string };

const FILE = "panel.tsx";
const ALLOWED: ReadonlySet<string> = new Set(PANEL_IMPORTS);
const allowlist = PANEL_IMPORTS.map(m => `"${m}"`).join(", ");
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

function at(file: ts.SourceFile, position: number): { line: number; column: number } {
  const { line, character } = file.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
}

/** Every module reference that is not allowed, as diagnostics. */
function checkImports(file: ts.SourceFile): Diagnostic[] {
  const out: Diagnostic[] = [];
  const refuse = (node: ts.Node, code: string, message: string) => out.push({ ...at(file, node.getStart(file)), code, message });
  const literal = (node: ts.Node, specifier: string) => {
    if (!ALLOWED.has(specifier)) refuse(node, "CG_IMPORT", `Panels may import only ${allowlist}; "${specifier}" is not available.`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) literal(node, node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteral(expression)) literal(node, expression.text);
      else refuse(node, "CG_REQUIRE", `require() needs a string literal naming one of ${allowlist}.`);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        refuse(node, "CG_DYNAMIC_IMPORT", `Dynamic import() is not available to panels; import ${allowlist} statically.`);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        const [first] = node.arguments;
        if (node.arguments.length === 1 && first && ts.isStringLiteralLike(first)) literal(node, first.text);
        else refuse(node, "CG_REQUIRE", `require() needs a string literal naming one of ${allowlist}.`);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      literal(node, node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** title / placement / size from the first `definePanel({...})` call with an object literal. */
function readManifest(file: ts.SourceFile): PanelManifest {
  let found: PanelManifest | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "definePanel" &&
      node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const manifest: Record<string, string> = {};
      for (const property of node.arguments[0].properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isStringLiteralLike(property.initializer)) {
          manifest[property.name.text] = property.initializer.text;
        }
      }
      found = {
        ...(manifest.title ? { title: manifest.title.slice(0, 80) } : {}),
        ...(["left", "right", "bottom"].includes(manifest.placement) ? { placement: manifest.placement as PanelManifest["placement"] } : {}),
        ...(["sm", "md", "lg"].includes(manifest.size) ? { size: manifest.size as PanelManifest["size"] } : {}),
      };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found ?? {};
}

/** Compile one panel. Throws ConvexError BAD_REQUEST when the source or output is over its size limit. */
export function compilePanel(source: string): CompileResult {
  if (bytes(source) > LIMITS.sourceBytes) {
    fail("BAD_REQUEST", `Panel source is ${kb(bytes(source))}; the limit is ${kb(LIMITS.sourceBytes)}.`);
  }
  const sourceHash = createHash("sha256").update(source, "utf8").digest("hex");
  const version = compilerVersion();
  const output = ts.transpileModule(source, {
    fileName: FILE,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true, isolatedModules: true, removeComments: false, sourceMap: false, inlineSourceMap: false,
    },
  });
  const file = ts.createSourceFile(FILE, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const syntax: Diagnostic[] = (output.diagnostics ?? []).map(d => ({
    ...(d.start !== undefined ? at(file, d.start) : { line: 1, column: 1 }),
    code: `TS${d.code}`,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
  const diagnostics = [...syntax, ...checkImports(file)].sort((a, b) => a.line - b.line || a.column - b.column);
  if (diagnostics.length) return { ok: false, diagnostics, compilerVersion: version, sourceHash };
  const compiled = output.outputText;
  if (bytes(compiled) > LIMITS.compiledBytes) {
    fail("BAD_REQUEST", `The compiled panel is ${kb(bytes(compiled))}; the limit is ${kb(LIMITS.compiledBytes)}. Make the source smaller.`);
  }
  return { ok: true, compiled, diagnostics: [], manifest: readManifest(file), compilerVersion: version, sourceHash };
}
