/**
 * The v1 audit's status table is checked, not remembered (like docs/engine-v2/v1-parity.json for the app):
 * docs/engine-v2/v1-audit-status.json mirrors the table under "## Status, re-audited" in docs/engine-v2/v1-audit.md row
 * for row, and adds, for every restored or kept row, the test files that would fail if that behaviour broke, or a `gap`
 * saying what no test guards.
 *
 * What would break: a row changed in one file and not the other; a decision, call or trial cited that owner-decisions.md
 * does not have; a test file renamed or deleted under a row that cites it; a restored or kept row with neither a test
 * nor a stated gap (a silent gap). The gaps themselves are printed, not failed: they are the list of work to do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const STATUSES = ["restored", "kept", "owner", "call", "trial", "missing", "partly"] as const;
type Status = (typeof STATUSES)[number];
type Row = { item: string; title: string; status: Status; refs: string[]; evidence: string; tests: string[]; gap?: string };

const repo = new URL("../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const rows = JSON.parse(read("docs/engine-v2/v1-audit-status.json")) as Row[];
const audit = read("docs/engine-v2/v1-audit.md");
const decisions = read("docs/engine-v2/owner-decisions.md");
const guarded = (r: Row) => r.status === "restored" || r.status === "kept";

/** The status table's rows, as [item, title, status cell, evidence cell]. */
function tableRows(): [string, string, string, string][] {
  const start = audit.indexOf("## Status, re-audited");
  assert.ok(start >= 0, "v1-audit.md has its status section");
  const end = audit.indexOf("\n---", start);
  return audit.slice(start, end).split("\n").filter(l => l.startsWith("| §")).map(l => {
    const cells = l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    assert.equal(cells.length, 3, `three cells: ${l}`);
    const [head, status, evidence] = cells as [string, string, string];
    const space = head.indexOf(" ");
    return [head.slice(0, space), head.slice(space + 1), status, evidence];
  });
}

/** A status cell's verdict: its first status word (a mixed "kept; call 12" is kept). */
function statusOf(cell: string): Status {
  const word = /restored|kept|owners?\b|call\b|trial\b|STILL MISSING|partly/.exec(cell)?.[0];
  assert.ok(word, `a status word in "${cell}"`);
  return ({ owners: "owner", "STILL MISSING": "missing" } as Record<string, Status>)[word] ?? word as Status;
}

/** The PRs and the owner's decisions, calls and trials a row names ("owners 33, 36", "owner 10 (4, 19)", "call (f)"). */
function refsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(owners?|calls?|trials?|decisions?)\s+(\(\w\)|\d+(?:\s*(?:,\s*|\(\s*)\d+\)?)*)/g)) {
    const kind = m[1]!.replace(/s$/, "").replace("decision", "owner");
    const nums = m[2]!.startsWith("(") ? [m[2]!] : m[2]!.match(/\d+/g)!;
    out.push(...nums.map(n => `${kind} ${n}`));
  }
  out.push(...[...text.matchAll(/#(\d+)/g)].map(m => `#${m[1]}`));
  return [...new Set(out)];
}

/** The numbered items (or lettered bullets) of one section of owner-decisions.md, by the section's heading. */
function section(heading: string): string {
  const start = decisions.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `owner-decisions.md has "## ${heading}"`);
  const end = decisions.indexOf("\n## ", start + 1);
  return decisions.slice(start, end < 0 ? undefined : end);
}
const items = (text: string) => new Map<string, string[]>([...text.matchAll(/^(\d+)\. (.*)$/gm)].reduce((m, [, n, line]) => m.set(n!, [...(m.get(n!) ?? []), line!]), new Map<string, string[]>()));
const owner = items(section("The owner's decisions, verbatim"));
const delegated = items(section("Coordinator's calls under the owner's delegation"));
const provisional = section("Coordinator's calls (provisional");

test("every row is well formed, unique, and its status one of the set", () => {
  assert.ok(rows.length >= 80, "the table is whole");
  assert.equal(new Set(rows.map(r => `${r.item} ${r.title}`)).size, rows.length, "item and title are unique");
  for (const r of rows) {
    const id = `${r.item} ${r.title}`;
    assert.match(r.item, /^§\d+\.\d+$/, `${id}: item`);
    assert.ok(r.title.trim(), `${id}: title`);
    assert.ok((STATUSES as readonly string[]).includes(r.status), `${id}: status ${r.status}`);
    assert.ok(Array.isArray(r.refs) && r.refs.every(x => /^(#\d+|(owner|call|trial) (\d+|\(\w\)))$/.test(x)), `${id}: refs ${r.refs}`);
    assert.equal(typeof r.evidence, "string", `${id}: evidence`);
    assert.ok(Array.isArray(r.tests), `${id}: tests`);
    if (!guarded(r)) assert.deepEqual(r.tests, [], `${id}: only a restored or kept row lists tests`);
    if (r.gap !== undefined) assert.ok(guarded(r) && r.gap.trim(), `${id}: a gap is said of a restored or kept row`);
  }
});

test("the JSON and the markdown table hold the same rows in the same order", () => {
  const table = tableRows();
  assert.deepEqual(rows.map(r => `${r.item} ${r.title}`), table.map(([item, title]) => `${item} ${title}`));
  for (const [i, [item, title, status, evidence]] of table.entries()) {
    const r = rows[i]!, id = `${item} ${title}`;
    assert.equal(r.status, statusOf(status), `${id}: status, from "${status}"`);
    assert.deepEqual(r.refs, refsOf(`${status} ${evidence}`), `${id}: refs, from "${status}"`);
    assert.equal(r.evidence, evidence, `${id}: evidence`);
  }
});

test("every listed test file exists", () => {
  const missing = rows.flatMap(r => r.tests.filter(t => !existsSync(new URL(t, repo))).map(t => `${r.item} ${r.title}: ${t}`));
  assert.deepEqual(missing, []);
});

test("every decision, call and trial a row names is in owner-decisions.md", () => {
  const unknown: string[] = [];
  for (const r of rows) for (const ref of r.refs.filter(x => !x.startsWith("#"))) {
    const [kind, n] = ref.split(" ") as [string, string];
    const ok = kind === "owner" ? owner.has(n)
      : n.startsWith("(") ? provisional.includes(`- **${n} `)
      : kind === "trial" ? (delegated.get(n) ?? []).some(line => /TRIAL/.test(line))
      : delegated.has(n);
    if (!ok) unknown.push(`${r.item} ${r.title}: ${ref}`);
  }
  assert.deepEqual(unknown, []);
});

test("no restored or kept row is silently unguarded; the gaps are printed", () => {
  const silent = rows.filter(r => guarded(r) && r.tests.length === 0 && !r.gap?.trim()).map(r => `${r.item} ${r.title}`);
  assert.deepEqual(silent, [], "restored or kept rows with no test and no gap");
  const untested = rows.filter(r => guarded(r) && r.tests.length === 0);
  const partial = rows.filter(r => guarded(r) && r.tests.length > 0 && r.gap);
  console.log(`v1 audit: ${rows.filter(guarded).length} restored or kept rows; ${untested.length} with no guarding test, ${partial.length} guarded in part`);
  for (const r of untested) console.log(`  untested  ${r.item} ${r.title}: ${r.gap}`);
  for (const r of partial) console.log(`  in part   ${r.item} ${r.title}: ${r.gap}`);
});
