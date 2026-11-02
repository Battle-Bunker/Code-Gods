/**
 * What an expanded tool call shows: everything the assistant sent (the call's arguments) and everything it read back
 * (the stored result, exactly as the model received it, cut to fit or not), as readable sections rather than JSON.
 * Pure (no React): the pane renders the sections (tool-detail-view.tsx); unit-tested in test/tool-detail.test.ts.
 *
 * A per-tool registry (TOOL_DETAIL) gives the calls whose data has a natural shape their own view (agent code with its
 * price and verdict, the rules text, a skill, a script and its output, the game state as tables). Every other tool,
 * including ones added later, gets the generic view: a key/value tree whose lists of records become tables.
 *
 * The data is the player's own (assistant.thread returns only their calls), and nothing here reads beyond it.
 */

export type Scalar = string | number | boolean | null;
export type Section =
  | { kind: "code"; title: string; language: string; code: string }
  | { kind: "text"; title: string; text: string }
  | { kind: "facts"; title: string; rows: [string, string][] }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "tree"; title: string; node: TreeNode }
  | { kind: "note"; tone: "info" | "warn" | "error"; text: string };
export type TreeNode =
  | { kind: "value"; text: string; multiline?: boolean }
  | { kind: "map"; entries: [string, TreeNode][] }
  | { kind: "list"; items: TreeNode[] }
  | { kind: "table"; columns: string[]; rows: string[][] };

/** A call as the pane receives it from assistant.thread. */
export type DetailCall = { tool: string; status: string; argsJson: string; resultJson: string | null; summary: string };

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const parse = (json: string | null): unknown => { if (json === null) return undefined; try { return JSON.parse(json) as unknown; } catch { return json; } };

// ---------------------------------------------------------------------------------------------
// Values and labels
// ---------------------------------------------------------------------------------------------

/** "expectedActCost" → "Expected act cost", "gameId" → "Game ID", "TRUNCATED" stays. */
export function label(key: string): string {
  if (/^[A-Z_]+$/.test(key)) return key;
  const words = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(" ").filter(Boolean)
    .map(w => (w === "id" ? "ID" : w === "ids" ? "IDs" : w === "url" ? "URL" : w === "json" ? "JSON" : w === "cpu" ? "CPU" : w === "ms" ? "ms" : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A number as people read it: integers whole, others to at most three significant decimals. */
export function num(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function scalarText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return num(v);
  if (typeof v === "string") return v;
  return compact(v);
}
/** A small value on one line (a cell of a table): [1, 2] · {a: 1}. */
function compact(v: unknown): string {
  if (Array.isArray(v)) return v.map(x => (isRecord(x) || Array.isArray(x) ? compact(x) : scalarText(x))).join(", ");
  if (isRecord(v)) return Object.entries(v).map(([k, x]) => `${label(k).toLowerCase()}: ${isRecord(x) || Array.isArray(x) ? compact(x) : scalarText(x)}`).join("; ");
  return scalarText(v);
}
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const flatRecord = (v: unknown) => isRecord(v) && Object.values(v).every(x => isScalar(x) || (Array.isArray(x) && x.every(isScalar) && x.length <= 8) || (isRecord(x) && Object.values(x).every(isScalar) && Object.keys(x).length <= 4));

/** A list of records with simple fields: columns in first-seen order. */
function asTable(items: unknown[]): { columns: string[]; rows: string[][] } | null {
  if (items.length < 2 || !items.every(flatRecord)) return null;
  const keys: string[] = [];
  for (const item of items as Json[]) for (const k of Object.keys(item)) if (!keys.includes(k)) keys.push(k);
  if (keys.length > 12) return null;
  return { columns: keys.map(label), rows: (items as Json[]).map(item => keys.map(k => (k in item ? scalarText(item[k]) : ""))) };
}

/** The generic view of any JSON value: maps of labelled entries, lists, tables for lists of records, multi-line text kept. */
export function tree(v: unknown): TreeNode {
  if (typeof v === "string") return { kind: "value", text: v, ...(v.includes("\n") ? { multiline: true } : {}) };
  if (isScalar(v) || v === undefined) return { kind: "value", text: scalarText(v) };
  if (Array.isArray(v)) {
    if (v.every(isScalar)) return { kind: "value", text: v.length ? v.map(scalarText).join(", ") : "none" };
    return asTable(v) ? { kind: "table", ...asTable(v)! } : { kind: "list", items: v.map(tree) };
  }
  return { kind: "map", entries: Object.entries(v as Json).map(([k, x]) => [label(k), tree(x)]) };
}

// ---------------------------------------------------------------------------------------------
// The stored result: envelope, notes, truncation, errors
// ---------------------------------------------------------------------------------------------

export type Unwrapped = { data: unknown; notes: Section[]; error?: { code?: string; message?: string } };

/**
 * The result the model read, unwrapped: the engine's note and a truncation notice become notes (shown first, as
 * the model read them first), the untrusted-data envelope is opened, an error becomes an error note.
 */
export function unwrap(result: unknown): Unwrapped {
  const notes: Section[] = [];
  if (!isRecord(result)) return { data: result, notes };
  const { ENGINE_NOTE, TRUNCATED, truncated: _cut, untrusted: _u, notice: _n, ...rest } = result;
  if (typeof ENGINE_NOTE === "string") notes.push({ kind: "note", tone: "info", text: ENGINE_NOTE });
  if (typeof TRUNCATED === "string") notes.push({ kind: "note", tone: "warn", text: `The assistant saw this result cut to fit its limit, exactly as shown here. ${TRUNCATED}` });
  if (isRecord(rest.error) && Object.keys(rest).length === 1) {
    const error = rest.error as { code?: string; message?: string };
    notes.push({ kind: "note", tone: "error", text: `${error.code ? `${error.code}: ` : ""}${error.message ?? "The call failed"}` });
    return { data: undefined, notes, error };
  }
  // The untrusted envelope ({untrusted, notice, data}) holds the tool's own result in `data` (a page cursor beside it stays).
  const data = "data" in rest && Object.keys(rest).length === 1 ? rest.data : rest;
  // A failure reported inside the data (a command's failed run, a script's error).
  if (isRecord(data) && isRecord(data.error)) {
    const error = data.error as { code?: unknown; message?: unknown };
    notes.push({ kind: "note", tone: "error", text: `${typeof error.code === "string" ? `${error.code}: ` : ""}${typeof error.message === "string" ? error.message : "The call failed"}` });
  }
  return { data, notes };
}

// ---------------------------------------------------------------------------------------------
// Per-tool views
// ---------------------------------------------------------------------------------------------

type View = (args: Json, data: unknown, call: DetailCall) => Section[];
const input = (args: Json, skip: string[] = []): Section[] => {
  const shown = Object.fromEntries(Object.entries(args).filter(([k]) => !skip.includes(k)));
  return Object.keys(shown).length ? [{ kind: "tree", title: "Sent", node: tree(shown) }] : [];
};
const output = (data: unknown, title = "Result"): Section[] => (data === undefined ? [] : [{ kind: "tree", title, node: tree(data) }]);
const rest = (data: unknown, skip: string[]): unknown => (isRecord(data) ? Object.fromEntries(Object.entries(data).filter(([k]) => !skip.includes(k))) : data);
const hasKeys = (v: unknown) => isRecord(v) && Object.keys(v).length > 0;
const pct = (rate: unknown) => (typeof rate === "number" ? `${Math.round(rate * 100)}%` : undefined);
const VERDICT: Record<string, string> = { works: "Works", fails: "Fails", no_change: "Never changes an object", rejected: "Does not compile" };

/** validate_agent and summon_agent: the code, then the price, energy and verdict, the diagnostics, the next step. */
const agentView: View = (args, data) => {
  const sections: Section[] = [{ kind: "code", title: "Agent code", language: typeof args.language === "string" ? args.language : "the game's default language", code: String(args.source ?? "") }];
  sections.push(...input(args, ["source"]));
  const d = isRecord(data) ? data : {};
  const receipt = isRecord(d.receipt) ? d.receipt : {};
  const v = isRecord(receipt.validation) ? receipt.validation : {};
  const a = isRecord(d.assessment) ? d.assessment : {};
  const rows: [string, string | undefined][] = [
    ["Status", typeof d.status === "string" ? d.status : undefined],
    ["Verdict", typeof a.verdict === "string" ? VERDICT[a.verdict] ?? a.verdict : undefined],
    ["Engine", typeof receipt.accepted === "boolean" ? `${receipt.accepted ? "accepted" : "rejected"}${typeof receipt.message === "string" ? `: ${receipt.message}` : ""}` : undefined],
    ["Summon price", typeof v.cost === "number" ? `${v.cost.toFixed(1)} bits` : undefined],
    ["Your energy", typeof v.energy === "number" ? `${v.energy.toFixed(1)} bits` : undefined],
    ["Affordable", typeof v.affordable === "boolean" ? (v.affordable ? "yes" : "not yet") : undefined],
    ["Cost per act", typeof v.expectedActCost === "number" ? `${num(v.expectedActCost)} bits expected` : undefined],
    ["Decision bits", typeof v.decisionBits === "number" ? num(v.decisionBits) : undefined],
    ["Changes objects", pct(v.changeRate)],
    ["Invalid or failing", pct(v.invalidRate)],
    ["Uses randomness", typeof v.randomized === "boolean" ? (v.randomized ? "yes" : "no") : undefined],
    ["Message", typeof d.message === "string" ? d.message : undefined],
  ];
  const facts = rows.filter((r): r is [string, string] => r[1] !== undefined);
  if (facts.length) sections.push({ kind: "facts", title: "Outcome", rows: facts });
  if (typeof a.summary === "string") sections.push({ kind: "text", title: "What it means", text: a.summary });
  if (typeof a.next === "string") sections.push({ kind: "text", title: "Next step given to the assistant", text: a.next });
  if (Array.isArray(v.diagnostics) && v.diagnostics.length) sections.push({ kind: "list", title: "Diagnostics", items: v.diagnostics.map(scalarText) });
  const other = { ...rest(v, ["cost", "energy", "affordable", "expectedActCost", "decisionBits", "changeRate", "invalidRate", "randomized", "diagnostics", "valid"]) as Json };
  if (hasKeys(other)) sections.push(...output(other, "Price details"));
  return sections;
};

const TOOL_DETAIL: Record<string, View> = {
  validate_agent: agentView,
  summon_agent: agentView,
  get_rules: (args, data) => [
    ...input(args),
    ...(isRecord(data) && typeof data.rules === "string" ? [{ kind: "text" as const, title: "Rules", text: data.rules }] : []),
    ...output(rest(data, ["rules"]), "Also returned"),
  ],
  load_skill: (args, data) => [
    ...input(args),
    ...(isRecord(data) && typeof data.body === "string" ? [{ kind: "text" as const, title: `The ${scalarText(data.name)} skill`, text: data.body }] : output(data)),
  ],
  run_code: (args, data) => {
    const d = isRecord(data) ? data : {};
    const sections: Section[] = [];
    if (typeof args.source === "string") sections.push({ kind: "code", title: "Script", language: typeof args.language === "string" ? args.language : "python", code: args.source });
    sections.push(...input(args, ["source"]));
    if (typeof d.output === "string" && d.output) sections.push({ kind: "text", title: d.outputTruncated ? "Printed output (cut)" : "Printed output", text: d.output });
    if (d.result !== undefined) sections.push(...output(d.result, "Result"));
    if (typeof d.resultPreview === "string") sections.push({ kind: "text", title: "Result (preview)", text: d.resultPreview });
    sections.push(...output(rest(d, ["output", "outputTruncated", "result", "resultPreview", "error"]), "Run"));
    return sections;
  },
  load_tools: (args, data) => [
    { kind: "list", title: "Asked for", items: Array.isArray(args.names) ? args.names.map(scalarText) : [] },
    ...(isRecord(data) && Array.isArray(data.loaded) ? [{ kind: "list" as const, title: "Loaded", items: data.loaded.length ? data.loaded.map(scalarText) : ["(already loaded)"] }] : output(data)),
  ],
};

/**
 * The sections of one call: the engine's notes and any cut first (as the model read them), then the tool's view (or
 * the generic one) of its arguments and result. A call still waiting or never run shows what it will send.
 */
export function toolDetail(call: DetailCall): Section[] {
  const parsedArgs = parse(call.argsJson);
  const args = isRecord(parsedArgs) ? parsedArgs : { value: parsedArgs };
  const { data, notes, error } = unwrap(parse(call.resultJson));
  const view = TOOL_DETAIL[call.tool];
  const body = view ? view(args, data, call) : [...input(args), ...output(data)];
  const pending = call.resultJson === null
    ? [{ kind: "note" as const, tone: "info" as const, text: call.status === "awaiting_confirmation" ? "Waiting for your confirmation: nothing has run yet." : call.status === "denied" ? "You declined: it never ran." : "No result yet." }]
    : [];
  return [...notes, ...(error ? [] : pending), ...body];
}

// ---------------------------------------------------------------------------------------------
// Syntax highlighting (agent and analytics code: Python, TypeScript and Haskell)
// ---------------------------------------------------------------------------------------------

export type Token = { text: string; kind: "keyword" | "string" | "comment" | "number" | "plain" };
const KEYWORDS: Record<string, Set<string>> = {
  python: new Set("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(" ")),
  typescript: new Set("as async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return switch this throw true try type typeof undefined var void while yield".split(" ")),
  haskell: new Set("case class data deriving do else if import in instance let module newtype of then type where qualified as hiding True False Nothing Just".split(" ")),
};

/** Tokens of a Python, TypeScript or Haskell source, for colouring only: strings, comments, numbers and keywords. */
export function highlight(code: string, language: string): Token[] {
  const lang = language === "typescript" || language === "javascript" ? "typescript" : language === "haskell" ? "haskell" : "python";
  const comment = lang === "python" ? "#[^\\n]*" : lang === "haskell" ? "--[^\\n]*|\\{-[\\s\\S]*?-\\}" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
  const strings = lang === "haskell" ? `"(?:\\\\.|[^"\\\\\\n])*"` : lang === "python" ? `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'` : "`(?:\\\\.|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'";
  const pattern = new RegExp(`(${comment})|(${strings})|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_][A-Za-z0-9_]*)`, "g");
  const out: Token[] = [];
  let at = 0;
  const push = (text: string, kind: Token["kind"]) => {
    if (!text) return;
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += text; else out.push({ text, kind });
  };
  for (const m of code.matchAll(pattern)) {
    push(code.slice(at, m.index), "plain");
    const [text, c, s, n, word] = m;
    push(text, c ? "comment" : s ? "string" : n ? "number" : word && KEYWORDS[lang].has(word) ? "keyword" : "plain");
    at = m.index! + text.length;
  }
  push(code.slice(at), "plain");
  return out;
}
