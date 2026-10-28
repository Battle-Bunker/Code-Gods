/**
 * Kid card rendering, shared by every family (lib/grid-lab/gridlab/rules/cards.py `card`): a header comment
 * (emoji, name, 1-3 plain sentences), the dealt settings as UPPER_CASE constants, then the program.
 */
import type { ParamScalar } from "../types.ts";

/** Python's textwrap.wrap for plain prose. */
export function wrap(text: string, width = 96): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}
export function dedent(s: string): string {
  const lines = s.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length));
  return lines.map(l => l.slice(ind)).join("\n");
}

export type Lit = ParamScalar | readonly Lit[];
export type Const = readonly [name: string, value: Lit, comment?: string];

const pyLit = (v: Lit): string =>
  v === null ? "None" : typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "string" ? JSON.stringify(v)
    : Array.isArray(v) ? `[${v.map(pyLit).join(", ")}]` : String(v);
const jsLit = (v: Lit): string =>
  v === null ? "null" : typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jsLit).join(", ")}]` : String(v);

export interface CardText {
  readonly emoji: string;
  readonly name: string;
  readonly about: string;
  readonly consts: readonly Const[];
}
export function pyCard(t: CardText, body: string): string {
  const out = [`# ${t.emoji} ${t.name}`, ...wrap(t.about).map(l => `# ${l}`)];
  for (const [k, v, note] of t.consts) out.push(`${k} = ${pyLit(v)}${note ? `  # ${note}` : ""}`);
  return `${out.join("\n")}\n\n${dedent(body)}\n`;
}
export function tsCard(t: CardText, body: string): string {
  const out = [`// ${t.emoji} ${t.name}`, ...wrap(t.about).map(l => `// ${l}`)];
  for (const [k, v, note] of t.consts) out.push(`const ${k} = ${jsLit(v)};${note ? `  // ${note}` : ""}`);
  return `${out.join("\n")}\n\n${dedent(body)}\n`;
}
