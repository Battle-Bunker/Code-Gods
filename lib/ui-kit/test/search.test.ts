/**
 * The palette's pure rules: fuzzy search with aliases, availability (dimmed when searched, hidden from the empty
 * query, never shown when never applicable), the empty-query view (≤ 12 rows, default-score 0 only when typed),
 * confirmation levels, recency and the global keys.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "@workspace/player-client/catalog";
import { commandsFromCatalog } from "../src/commands.ts";
import { EMPTY_VIEW_LIMIT, matchScore, paletteRows, scoreCommand, sectionOf } from "../src/search.ts";
import { INLINE_TIMEOUT_MS, deriveConfirm, inlineStep } from "../src/confirm.ts";
import { pushRecent, readRecent, recordRecent } from "../src/recency.ts";
import { isEditable, paletteKey } from "../src/keys.ts";
import { glossaryCommands } from "../src/help.ts";
import type { Command, PaletteContext } from "../src/types.ts";

const member: PaletteContext = { role: "member", admin: false, assistantOn: false };
const owner: PaletteContext = { ...member, role: "owner" };
const local = { kind: "local", run() {} } as const;
const cmd = (id: string, title: string, extra: Partial<Command> = {}): Command =>
  ({ id, human: { title, tooltip: `${title}.` }, group: "play", performer: local, available: () => ({ ok: true }), ...extra });

test("fuzzy matching: prefix beats word start beats substring beats a scattered subsequence", () => {
  const s = (q: string) => matchScore("Remove an AI player", q);
  assert.ok(s("remove") > s("ai"), "title prefix first");
  assert.ok(s("ai") > s("mov"), "word start beats an inner substring");
  assert.ok(s("mov") > s("rmvply"), "substring beats subsequence");
  assert.ok(s("rmvply") > 0, "a scattered subsequence still matches");
  assert.equal(s("zebra"), 0);
});

test("a row matched through an alias shows the alias; one matched by its title does not", () => {
  const remove = cmd("rooms.removeAi", "Remove an AI player", { keywords: ["bot", "kick", "remove"] });
  assert.deepEqual(scoreCommand(remove, "kick bot").alias, "kick bot");
  assert.ok(scoreCommand(remove, "kick bot").score > 0);
  assert.equal(scoreCommand(remove, "remove").alias, undefined);
  assert.equal(scoreCommand(remove, "kick zebra").score, 0, "every word must match somewhere");
});

test("searching ranks available rows first, dims what the role blocks and hides what can never apply", () => {
  const commands = commandsFromCatalog(CATALOG, () => local, "engine");
  const rows = paletteRows(commands, member, { query: "end game" }).flatMap(s => s.rows);
  const end = rows.find(r => r.command.id === "rooms.endActiveGame");
  assert.ok(end && !end.availability.ok, "an owner command shows, dimmed, for a member");
  assert.ok(rows.findIndex(r => !r.availability.ok) > rows.findLastIndex(r => r.availability.ok) || rows.every(r => !r.availability.ok),
    "unavailable rows rank below available ones");
  assert.equal(paletteRows(commands, member, { query: "template" }).flatMap(s => s.rows).length, 0, "admin commands are never shown to members");
  assert.ok(paletteRows(commands, { ...member, admin: true }, { query: "template" }).flatMap(s => s.rows).length > 0);
});

test("the empty query shows at most 12 available rows, only those with a default score, the suggestion and recent ones first", () => {
  const many: Command[] = Array.from({ length: 30 }, (_, i) => cmd(`c${i}`, `Command ${i}`, { defaultScore: i % 3, group: i % 2 ? "view" : "play" }));
  many.push(cmd("blocked", "Blocked thing", { defaultScore: 9, available: () => ({ ok: false, reason: "No." }) }));
  many.push(cmd("help1", "How to play", { group: "help", defaultScore: 1 }));
  const sections = paletteRows(many, owner, { query: "", suggested: ["c3"], recent: ["c9", "c4", "c1"] });
  const rows = sections.flatMap(s => s.rows);
  assert.ok(rows.length <= EMPTY_VIEW_LIMIT, `${rows.length} rows`);
  assert.equal(sections[0].section, "suggested");
  assert.deepEqual(sections[0].rows.map(r => r.command.id), ["c3", "c9", "c4"], "the next step, then the two most recent");
  assert.ok(rows.every(r => r.availability.ok), "nothing unavailable");
  assert.ok(!rows.some(r => r.command.id === "c0" || r.command.id === "c6"), "default score 0 stays out until typed");
  assert.ok(sections.some(s => s.section === "help"), "help keeps its place");
  assert.equal(new Set(rows.map(r => r.command.id)).size, rows.length, "no row twice");
  assert.ok(paletteRows(many, owner, { query: "command 6" }).flatMap(s => s.rows).some(r => r.command.id === "c6"), "typed, it appears");
});

test("browse mode lists every available command; the help page only help", () => {
  const many = [cmd("a", "Alpha"), cmd("b", "Beta", { group: "help" }), cmd("c", "Gamma", { available: () => ({ ok: false, reason: "x" }) })];
  assert.deepEqual(paletteRows(many, owner, { query: "", browse: true }).flatMap(s => s.rows).map(r => r.command.id).sort(), ["a", "b"]);
  assert.deepEqual(paletteRows(many, owner, { query: "", only: "help" }).flatMap(s => s.rows).map(r => r.command.id), ["b"]);
});

test("sections derive from groups; navigation goes to Go to", () => {
  assert.equal(sectionOf(cmd("x", "X", { group: "owner" })), "actions");
  assert.equal(sectionOf(cmd("x", "X", { group: "view" })), "views");
  assert.equal(sectionOf(cmd("x", "X", { group: "account" })), "settings");
  assert.equal(sectionOf(cmd("x", "X", { performer: { kind: "navigate", to: "/" } })), "goto");
  assert.equal(sectionOf(cmd("x", "X", { section: "help" })), "help");
});

test("dynamic rows (a code-shaped query) join the results", () => {
  const dynamic = (q: string) => /^[A-Z0-9-]{4,36}$/i.test(q) ? [cmd(`open:${q}`, `Open room ${q.toUpperCase()}`, { section: "goto" })] : [];
  const rows = paletteRows([cmd("a", "Alpha")], member, { query: "k7qx", dynamic }).flatMap(s => s.rows);
  assert.equal(rows[0].command.human.title, "Open room K7QX");
});

test("glossary rows: 'what is bits' finds the gloss, only when typed", () => {
  const g = glossaryCommands();
  assert.ok(paletteRows(g, member, { query: "what is bits" }).flatMap(s => s.rows).some(r => r.command.id === "ui.glossary.bits"));
  assert.equal(paletteRows(g, member, { query: "" }).flatMap(s => s.rows).filter(r => r.command.id.startsWith("ui.glossary.")).length, 0);
});

test("confirmation levels: explicit wins; irreversible for everyone is a modal; spending a summary; destructive inline", () => {
  assert.equal(deriveConfirm({}), "none");
  assert.equal(deriveConfirm({ destructive: true }), "inline");
  assert.equal(deriveConfirm({ spends: true }), "summary");
  assert.equal(deriveConfirm({ everyone: true, irreversible: true }), "modal");
  assert.equal(deriveConfirm({ explicit: "none", destructive: true }), "none");
  const fromCatalog = commandsFromCatalog(CATALOG, () => local, "engine");
  assert.equal(fromCatalog.find(c => c.id === "rooms.removeAi")?.confirm, "inline");
  assert.equal(fromCatalog.find(c => c.id === "rooms.endActiveGame")?.confirm, "modal");
});

test("inline confirmation: Enter arms, Enter again within 5 s runs, later re-arms, another row re-arms", () => {
  let s = inlineStep(null, "x", 1000);
  assert.deepEqual(s, { armed: { id: "x", at: 1000 }, run: false });
  assert.equal(inlineStep(s.armed, "x", 1000 + INLINE_TIMEOUT_MS - 1).run, true);
  assert.equal(inlineStep(s.armed, "x", 1000 + INLINE_TIMEOUT_MS + 1).run, false, "timed out: arms again");
  s = inlineStep(s.armed, "y", 1500);
  assert.deepEqual(s, { armed: { id: "y", at: 1500 }, run: false });
});

test("recency: newest first, unique, bounded, and storage failures are harmless", () => {
  assert.deepEqual(pushRecent(["a", "b", "c"], "b", 3), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
  recordRecent(storage, "k", "x"); recordRecent(storage, "k", "y");
  assert.deepEqual(readRecent(storage, "k"), ["y", "x"]);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.deepEqual(readRecent(broken, "k"), []);
  assert.doesNotThrow(() => recordRecent(broken, "k", "x"));
  map.set("bad", "{not json"); assert.deepEqual(readRecent(storage, "bad"), []);
  assert.deepEqual(readRecent(null, "k"), []);
});

test("keys: Cmd/Ctrl+K toggles anywhere; / and ? only outside text fields and dialogs", () => {
  const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  const calm = { editable: false, dialogOpen: false, paletteOpen: false };
  assert.equal(paletteKey(key("k", { metaKey: true }), { ...calm, editable: true }), "toggle");
  assert.equal(paletteKey(key("K", { ctrlKey: true }), { ...calm, paletteOpen: true }), "toggle");
  assert.equal(paletteKey(key("/"), calm), "open");
  assert.equal(paletteKey(key("?", { shiftKey: true }), calm), "help");
  assert.equal(paletteKey(key("/"), { ...calm, editable: true }), null, "typing a slash in chat is never hijacked");
  assert.equal(paletteKey(key("?"), { ...calm, dialogOpen: true }), null);
  assert.equal(paletteKey(key("k"), calm), null);
  assert.equal(paletteKey(key("/", { ctrlKey: true }), calm), null);
  assert.equal(isEditable({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isEditable({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isEditable({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditable({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditable({ tagName: "BUTTON" }), false);
  assert.equal(isEditable(null), false);
});
