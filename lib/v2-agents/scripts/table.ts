/**
 * Mixed tables: naive starters, the new starters, model-backed seats, and a mix, on the same beginner rules and seeds.
 *
 *   node --experimental-strip-types scripts/table.ts [--games 2] [--seconds 300] [--usd 1] [--type lines|grid] [--rules a/x,b/y,c/z] [--out docs/engine-v2/ai-table-results.md]
 *
 * Model seats use the cheapest Anthropic model in v2-ai's list when CODE_GODS_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) is
 * set, else the mock provider (whose default turn only reads the game: the numbers then show the harness, not play).
 * Every model call draws on one budget (--usd); the report says what was spent.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { anthropicProvider, Budget, mockProvider, MODELS, type ChatProvider } from "@workspace/v2-ai";
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { gridPresets, gridType, grid4 } from "@workspace/v2-grid";
import { lineType, lineZ, presets } from "@workspace/v2-linear";
import { gridStartersFor } from "../src/grid-starters.ts";
import { sandboxes, shippedAgents, startersFor, summonBits } from "../src/index.ts";
import { runTable, type SeatKind, type TableReport, type TableSeat } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  games: { type: "string", default: "2" }, seconds: { type: "string", default: "300" }, usd: { type: "string", default: "1" },
  out: { type: "string" }, only: { type: "string" },
  model: { type: "string", default: "cheap" },
  effort: { type: "string", default: "low" },
  type: { type: "string", default: "lines" },
  rules: { type: "string" },   // three family/tie-breaker, comma-separated (default: the mixed table below)   // cheap: the cheapest Anthropic model in v2-ai's list; strong: the next dearer one
} });
const games = Number(o.games), seconds = Number(o.seconds);
const key = process.env.CODE_GODS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
const byPrice = MODELS.filter(m => m.provider === "anthropic").sort((a, b) => a.prices.input + a.prices.output - b.prices.input - b.prices.output);
if (!["low", "medium", "high"].includes(o.effort)) throw new Error(`--effort is low, medium or high, not ${o.effort}`);
if (o.model !== "cheap" && o.model !== "strong") throw new Error(`--model is cheap or strong, not ${o.model}`);
const chosen = byPrice[o.model === "strong" ? 1 : 0];
if (!chosen) throw new Error(`v2-ai's list has no ${o.model} Anthropic model`);
const modelWords = o.model === "strong" ? "the second-cheapest Anthropic model in v2-ai's list" : "the cheapest Anthropic model in v2-ai's list";
const provider: ChatProvider = key ? anthropicProvider({ apiKey: key, model: chosen.id, prices: chosen.prices, effort: o.effort as "low" | "medium" | "high" }) : mockProvider();
const budget = new Budget({ tokens: 50_000_000, usd: Number(o.usd) });

if (o.type !== "lines" && o.type !== "grid") throw new Error(`--type is lines or grid, not ${o.type}`);
const grid = o.type === "grid";
const ECON = grid ? GRIDS_BEGINNER_ECONOMY : LINES_BEGINNER_ECONOMY;
const beginner = grid ? gridPresets.find(p => p.id === "grids-beginner")!.rules : presets.find(p => p.id === "lines-whole")!.rules;
// Lines: three families of the §10.5 beginner pool, one of them new in it (Whole Crossing). Grids: the table whose
// shared board rule-compatibility.md found (8118455454451881).
const DEFAULT_RULES = grid ? [["magic-eighteen", "primes"], ["opposite-nines", "primes"], ["mirrormancer", "middle"]] : [["prime-landing", "big-prime"], ["treasure", "prime-terms"], ["whole-crossing", "k-spf"]];
const RULES = (o.rules ? o.rules.split(",").map(r => r.split("/") as [string, string]) : DEFAULT_RULES) as readonly (readonly [string, string])[];
const NAMES = ["Ada", "Bo", "Cy", "Di"];
const N = RULES.length;
if (N < 2 || N > NAMES.length) throw new Error(`--rules takes 2 to ${NAMES.length} rules`);
const seat = (k: number, kind: SeatKind): TableSeat => {
  const [family, tieBreaker] = RULES[k]!;
  const params = beginner.find(r => r.family === family)!.params as Record<string, unknown>;
  const a = (grid ? gridStartersFor(family, "typescript", tieBreaker) : startersFor(family, "typescript")).find(x => x.kind === (kind === "naive" ? "naive" : "simple"))!;
  return { name: NAMES[k]!, kind, rule: { family, params, tieBreaker }, program: { language: a.language, source: a.source } };
};
const TABLES: Record<string, (g: number) => SeatKind[]> = {
  naive: () => Array<SeatKind>(N).fill("naive"),
  starters: () => Array<SeatKind>(N).fill("starter"),
  models: () => Array<SeatKind>(N).fill("model"),
  // Each rule plays each kind once over three games.
  mix: g => { const k: SeatKind[] = ["model", "starter", "naive"]; return Array.from({ length: N }, (_, i) => k[(i + g) % 3]!); },
};

const boxes = sandboxes();
const results: Record<string, TableReport[]> = {};
for (const [name, kinds] of Object.entries(TABLES)) {
  if (o.only && !o.only.split(",").includes(name)) continue;
  results[name] = [];
  const n = name === "mix" ? Math.max(3, games) : games;
  for (let g = 0; g < n; g++) {
    const report = await runTable(boxes, {
      ...(grid ? { type: gridType, variant: grid4, economy: ECON } : { type: lineType, variant: lineZ }), lines: 24, seed: `g${g % games}`, seconds,
      seats: kinds(g).map((kind, k) => seat(k, kind)), model: { provider, budget },
      onTurn: (s, at, run) => console.error(`  ${name} g${g} ${Math.round(at)}s ${s}: ${run.toolCalls.map(c => c.name + (c.ok ? "" : "✗")).join(" ")} — ${run.text.slice(0, 120)}`),
    });
    results[name]!.push(report);
    console.error(`${name} g${g}: ${report.seats.map(s => `${s.seat}(${s.kind}) ${s.gained.toFixed(0)}`).join(" · ")}; deals ${report.deals.length}, kept ${report.deals.filter(d => d.kept).length}; $${budget.snapshot().usd.toFixed(3)}`);
  }
}
await boxes.close();

// ---------------------------------------------------------------- the report

const lines: string[] = [];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
lines.push(`| Table | Seat kind | Seats | Points gained (mean) | Lowest seat-game | Reversal ⚡ (mean) | Edits / summons (⚡ spent) | Messages | Proposals | Deals accepted | Deals kept | Games with a kept deal | Commitments at the end: enacted / pending / retracted |`);
lines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const [name, reports] of Object.entries(results)) {
  const seats = reports.flatMap(r => r.seats);
  for (const kind of [...new Set(seats.map(s => s.kind))]) {
    const ss = seats.filter(s => s.kind === kind);
    const deals = reports.flatMap(r => r.deals.filter(d => r.seats[d.by]!.kind === kind || r.seats[d.with]!.kind === kind));
    lines.push(`| ${name} | ${kind} | ${ss.length} | ${mean(ss.map(s => s.gained)).toFixed(0)} | ${Math.min(...ss.map(s => s.gained)).toFixed(0)} | ${mean(ss.map(s => s.reversalEnergy)).toFixed(0)} | ${ss.reduce((t, s) => t + s.replaced, 0)} / ${ss.reduce((t, s) => t + s.summoned, 0)} (${ss.reduce((t, s) => t + s.spent.edits + s.spent.summons, 0).toFixed(0)}) | ${ss.reduce((t, s) => t + s.messages, 0)} | ${ss.reduce((t, s) => t + s.proposals, 0)} | ${kind === "model" ? deals.length : "–"} | ${kind === "model" ? deals.filter(d => d.kept).length : "–"} | ${kind === "model" ? `${reports.filter(r => r.deals.some(d => d.kept)).length} of ${reports.length}` : "–"} | ${kind === "model" ? ["enacted", "pending", "retracted"].map(k => ss.reduce((t, s) => t + s.commitments[k as "enacted"], 0)).join(" / ") : "–"} |`);
  }
}
// Whole tables: points gained by all seats together per game, and the poorest seat.
const totals = [`| Table | Table gained per game (mean) | Each game | Lowest seat-game |`, `|---|--:|---|--:|`];
for (const [name, reports] of Object.entries(results)) {
  totals.push(`| ${name} | ${mean(reports.map(r => r.seats.reduce((t, s) => t + s.gained, 0))).toFixed(0)} | ${reports.map(r => r.seats.reduce((t, s) => t + s.gained, 0).toFixed(0)).join(", ")} | ${Math.min(...reports.flatMap(r => r.seats.map(s => s.gained))).toFixed(0)} |`);
}
const chat = Object.values(results).flat().flatMap(r => r.chat);
// Starter prices in seconds of full power (the owner sets the level from these).
const prices = shippedAgents().filter(a => a.kind !== "naive").map(a => summonBits(a.language, a.source).energy).sort((x, y) => x - y);
const median = prices[Math.floor(prices.length / 2)]!, dearest = prices.at(-1)!;
const secs = (e: number) => `${e.toFixed(0)} ⚡ = ${(e / ECON.powerPerSecond).toFixed(1)} s of full power`;
const spent = budget.snapshot();
const text = `# Mixed tables: naive starters, new starters and model-backed seats

Generated by \`pnpm --filter @workspace/v2-agents table -- --games ${games} --seconds ${seconds}\`. ${N} beginner rules (${RULES.map(r => r.join("/")).join(", ")}), 24 ${grid ? "boards on grid-4" : "lines on line-z"},
${seconds} world seconds on the beginner economy run as the server's tick runs it (${ECON.opportunitiesPerSecond} act opportunities a second drawn by
energy, ${ECON.powerPerSecond} power, ${ECON.fullChargeSeconds} s to full, ${ECON.startingEnergy} ⚡ to start, credit, births at 0.1 a second). Every seat summons its
starter at the first-agent share; model seats then take a turn every 20 s with the server AI seat's prompt and tools
(at most 6 model calls a turn), edits cost the change (owner decision 21) and power.allocate takes absolute shares. In "mix" each rule plays
each kind once over three games. Model: ${key ? `${modelWords}, ${o.effort} effort` : "the mock provider (no key): its turns only read"}. Each model turn's message lists the seat's deals as commitments (v2-ai commitments.ts): pending until its agents' code skips the lines, or retracted.
Shipped agents (examples and starters): median ${secs(median)}, dearest ${secs(dearest)}.

Spent: $${spent.usd.toFixed(3)} over ${spent.calls} model calls (${spent.tokens.toLocaleString("en")} tokens).

${lines.join("\n")}

${totals.join("\n")}

Deals are read from the chat (a proposal names a line and offers something; another seat accepts it; it is kept when
neither side then lowers the other's points on a named line): a heuristic, not the players' own record. In "mix" only
one seat is model-backed and scripted seats never chat, so no deal can be made there: its deal columns measure nothing.

## Chat the model seats wrote (first 12 messages)

${chat.slice(0, 12).map(m => `- **${m.from}** (${Math.round(m.at)} s): ${m.text.replace(/\n/g, " ")}`).join("\n") || "(none)"}
`;
if (o.out) writeFileSync(o.out, text); else console.log(text);
