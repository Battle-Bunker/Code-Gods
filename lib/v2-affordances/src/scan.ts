/**
 * Source scans for the parity checks that span packages (Node only; used by tests):
 * - check 2 on the Convex side: under `convex/v2`, every public mutation or action is a `defineOp` in
 *   `ops/<namespace>.ts` exported as `{ op: <verb>, as: <verb>As }`, and, once `ops/` exists, every server affordance
 *   has exactly one (live queries, which are not affordances, are left alone);
 * - check 3 on the app: `artifacts/player-web/src` calls no v2 mutation or action except through `useAffordance`,
 *   i.e. only the one runtime file that builds `perform` (it names functions with `opPath` / `VIEW_OP_PATH`) may.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { DIRECTORY, type Directory } from "./directory.ts";
import { handlerProblems } from "./server.ts";

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (n === "_generated" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? tsFiles(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

// Public builders that can write: v2 HTTP routes belong in convex/http.ts, not here. Custom builders wrapping these
// (customMutation) also match, through the call to the base builder they need.
const PUBLIC_WRITE = /\b(?:mutation|action|mutationGeneric|actionGeneric|httpAction|httpActionGeneric|customMutation|customAction)\s*\(/g;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const DEFINE = /\bdefineOp\(\s*"([^"]+)"/g;

/** Problems with `convex/v2` (root = that directory); none while it does not exist. */
export function convexOpsProblems(root: string, dir: Directory = DIRECTORY): string[] {
  const problems: string[] = [];
  const ids: string[] = [];
  for (const file of tsFiles(root)) {
    const text = stripComments(readFileSync(file, "utf8")), rel = relative(root, file);
    for (const m of text.matchAll(PUBLIC_WRITE)) problems.push(`check 2: ${rel} makes a public ${m[0].replace(/Generic|\s|\(/g, "")} outside defineOp`);
    if (/\bdefineViewOps\(/.test(text) && (rel !== "ops/view.ts" || !/\{\s*op:\s*apply\s*,\s*as:\s*applyAs\s*\}\s*=\s*defineViewOps\(/.test(text)))
      problems.push(`check 2: view operations must be exported from ops/view.ts as { op: apply, as: applyAs } = defineViewOps(...)`);
    for (const m of text.matchAll(DEFINE)) {
      const id = m[1]!, [ns, verb] = id.split(".") as [string, string];
      ids.push(id);
      if (!rel.startsWith(`ops/`) || basename(file).replace(/\.tsx?$/, "") !== ns) problems.push(`check 2: ${id} is defined in ${rel}, not ops/${ns}.ts`);
      else if (!new RegExp(`\\{\\s*op:\\s*${verb}\\s*,\\s*as:\\s*${verb}As\\s*\\}`).test(text)) problems.push(`check 2: ops/${ns}.ts must export ${id} as { op: ${verb}, as: ${verb}As }`);
    }
  }
  if (existsSync(join(root, "ops"))) problems.push(...handlerProblems(ids, dir));
  return problems;
}

const HOOK_V2 = /\b(?:useMutation|useAction)\s*\(\s*(?:api\s*(?:\.\s*v2\b|\[\s*["']v2)|makeFunctionReference\s*\(\s*[`"']v2\/)/g;
const CALL_V2 = /\.(?:mutation|action)\s*\(\s*(?:api\s*(?:\.\s*v2\b|\[\s*["']v2)|makeFunctionReference\s*\(\s*[`"']v2\/)/g;
const REF_V2 = /\bmakeFunctionReference\s*\(\s*[`"']v2\//;
const RUNTIME = /\b(?:opPath|VIEW_OP_PATH)\b/;

/** Problems in the web app's source (root = `artifacts/player-web/src`). */
export function appProblems(root: string): string[] {
  const problems: string[] = [];
  for (const file of tsFiles(root)) {
    const text = stripComments(readFileSync(file, "utf8")), rel = relative(root, file);
    const hooks = [...text.matchAll(HOOK_V2)].length;
    for (let i = 0; i < hooks; i++) problems.push(`check 3: ${rel} calls a v2 mutation or action with a hook; use useAffordance`);
    if (RUNTIME.test(text)) continue;   // the runtime that implements perform
    const calls = [...text.matchAll(CALL_V2)].length;
    for (let i = 0; i < calls; i++) problems.push(`check 3: ${rel} calls a v2 mutation or action directly; use useAffordance`);
    if (hooks + calls === 0 && REF_V2.test(text)) problems.push(`check 3: ${rel} names a v2 function outside the affordance runtime`);
  }
  return problems;
}
