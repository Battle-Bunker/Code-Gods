/**
 * Source scans for the parity checks that span packages (Node only; used by tests):
 * - check 2 on the Convex side: under `convex/v2`, every public mutation or action is a `defineOp` in
 *   `ops/<namespace>.ts` exported as `{ op: <verb>, as: <verb>As }`, and, once `ops/` exists, every server affordance
 *   has exactly one (live queries, which are not affordances, are left alone).
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

const PUBLIC_WRITE = /\b(?:mutation|action|mutationGeneric|actionGeneric)\s*\(/g;
const DEFINE = /\bdefineOp\(\s*"([^"]+)"/g;

/** Problems with `convex/v2` (root = that directory); none while it does not exist. */
export function convexOpsProblems(root: string, dir: Directory = DIRECTORY): string[] {
  const problems: string[] = [];
  const ids: string[] = [];
  for (const file of tsFiles(root)) {
    const text = readFileSync(file, "utf8"), rel = relative(root, file);
    for (const m of text.matchAll(PUBLIC_WRITE)) problems.push(`check 2: ${rel} makes a public ${m[0].replace(/Generic|\s|\(/g, "")} outside defineOp`);
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
