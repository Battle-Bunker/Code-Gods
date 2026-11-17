/**
 * The real code of a dealt rule (the owner, 17 November: "showing the code of a rule ... was part of the original
 * template for rendering any rule and is essential information"). v2 rules carry no source text of their own, so the
 * code shown is the family's definition as written in its source file (lib/v2-linear or lib/v2-grid
 * `*families*.ts`): the section of the file, between its `// -----` headings, that defines the family's id. Pure;
 * tested in test/rule-code.test.ts.
 */

const HEADING = /^\/\/ -{10,}/;

/** The section of `text` that defines the family `id` (`id: "<id>"`), or null when the file has none. */
export function familySection(text: string, id: string): string | null {
  const lines = text.split("\n");
  const at = lines.findIndex(l => l.includes(`id: "${id}"`));
  if (at < 0) return null;
  let start = at;
  while (start > 0 && !HEADING.test(lines[start]!)) start--;
  let end = at + 1;
  while (end < lines.length && !HEADING.test(lines[end]!)) end++;
  return lines.slice(start, end).join("\n").trim();
}

/** The family's code from the first file that defines it, with the file it came from. */
export function ruleCode(files: Readonly<Record<string, string>>, id: string): { file: string; code: string } | null {
  for (const [file, text] of Object.entries(files)) {
    const code = familySection(text, id);
    if (code) return { file: file.replace(/^(\.\.\/)+/, ""), code };
  }
  return null;
}
