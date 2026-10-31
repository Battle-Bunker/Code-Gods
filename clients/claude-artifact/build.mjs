#!/usr/bin/env node
/**
 * Build the publishable page: dist/template.html is template.html with core.js inlined in place of its
 * `import * as core from "./core.js";` line, so the artifact is one self-contained file.
 *
 *   node clients/claude-artifact/build.mjs        (or: pnpm run build:artifact)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const IMPORT = /^[ \t]*import \* as core from "\.\/core\.js";[ \t]*$/m;

/** template.html + core.js source → one HTML string with `const core = Object.freeze((() => {…})())`. */
export function inline(html, coreSource) {
  if (!IMPORT.test(html)) throw new Error('template has no `import * as core from "./core.js";` line');
  if (/<\/script/i.test(coreSource)) throw new Error("core.js must not contain </script");
  const names = [];
  const body = coreSource.replace(/^export\s+((?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*))/gm, (_, decl, fn, binding) => {
    names.push(fn ?? binding);
    return decl;
  });
  if (/^\s*(?:export|import)\s/m.test(body)) throw new Error("core.js has an import or export build.mjs cannot inline (one export per declaration)");
  const block = `const core = Object.freeze((() => {\n${body}\nreturn { ${names.join(", ")} };\n})());`;
  return html.replace(IMPORT, () => block);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));
  const out = inline(readFileSync(here("./template.html"), "utf8"), readFileSync(here("./core.js"), "utf8"));
  mkdirSync(here("./dist"), { recursive: true });
  writeFileSync(here("./dist/template.html"), out);
  console.log(`wrote ${here("./dist/template.html")} (${Buffer.byteLength(out)} bytes)`);
}
