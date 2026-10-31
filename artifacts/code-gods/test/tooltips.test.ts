/**
 * One source for tooltips (palette-and-pages.md §2.10): a button's or link's tooltip comes from the catalogue (or a
 * `ui.*` command) through components/action.tsx. This fails on a literal `title="…"` on a button or link anywhere
 * else in the engine UI, so a hand-written tooltip cannot drift from its palette row.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../src");
const ALLOWED = new Set([path.join("components", "action.tsx")]);
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return name === "ui" ? [] : files(full); // shadcn primitives are vendored
  return full.endsWith(".tsx") ? [full] : [];
});

/** The opening tags of <button>, <a> and <Link> elements, braces and strings respected (so `=>` does not end a tag). */
export function openingTags(source: string): { tag: string; text: string; line: number }[] {
  const out: { tag: string; text: string; line: number }[] = [];
  const re = /<(button|a|Link)(?=[\s>])/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let depth = 0, quote = "", i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) { if (c === quote && source[i - 1] !== "\\") quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: m[1], text: source.slice(m.index, i + 1), line: source.slice(0, m.index).split("\n").length });
  }
  return out;
}
const literalTitle = (tagText: string) => /\stitle=(["'])/.test(tagText) || /\stitle=\{\s*(["'`])/.test(tagText);

test("the scanner finds a literal title on a button even after an arrow function", () => {
  const tags = openingTags(`<button onClick={() => go()} title="Copy room link">x</button><a href="/" title={tip}>y</a>`);
  assert.deepEqual(tags.map(t => [t.tag, literalTitle(t.text)]), [["button", true], ["a", false]]);
});

test("no button or link outside the Action/Tip helper has a hand-written tooltip", () => {
  const offenders: string[] = [];
  for (const file of files(SRC)) {
    const rel = path.relative(SRC, file);
    if (ALLOWED.has(rel)) continue;
    for (const t of openingTags(readFileSync(file, "utf8"))) if (literalTitle(t.text)) offenders.push(`${rel}:${t.line} <${t.tag} … title="…">`);
  }
  assert.deepEqual(offenders, [], "use <Action k=…> or <Tip k=…> so the text comes from the catalogue");
});
