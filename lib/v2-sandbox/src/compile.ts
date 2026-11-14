/**
 * TypeScript agents are transpiled to JavaScript by the TypeScript compiler (trusted code, on the host) before
 * QuickJS runs them. Transpile only, no type check: an agent's types are its own business, and the guest library's
 * names (Offer, Call, Q, call, HostError) need no declarations to run. Syntax errors are compile errors.
 */
import { createRequire } from "node:module";
import { SandboxError } from "./limits.ts";

type TS = typeof import("typescript");
let ts: TS | null = null;
const load = () => (ts ??= createRequire(import.meta.url)("typescript") as TS);

const cache = new Map<string, string>();

export function transpile(source: string): string {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;
  const t = load();
  const out = t.transpileModule(source, {
    reportDiagnostics: true,
    fileName: "agent.ts",
    compilerOptions: { target: t.ScriptTarget.ES2020, module: t.ModuleKind.None, removeComments: false, alwaysStrict: false },
  });
  const errors = (out.diagnostics ?? []).filter(d => d.category === t.DiagnosticCategory.Error);
  if (errors.length) {
    const first = errors[0];
    const where = first.file && first.start !== undefined ? first.file.getLineAndCharacterOfPosition(first.start) : null;
    const message = t.flattenDiagnosticMessageText(first.messageText, "\n");
    throw new SandboxError("COMPILE", `SyntaxError: ${message}${where ? ` (line ${where.line + 1}, column ${where.character + 1})` : ""}`);
  }
  if (/^\s*export\s|^\s*import\s/m.test(out.outputText)) throw new SandboxError("COMPILE", "SyntaxError: an agent is a script: no import or export");
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  cache.set(source, out.outputText);
  return out.outputText;
}
