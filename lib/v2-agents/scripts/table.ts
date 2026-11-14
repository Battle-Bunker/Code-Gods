/**
 * Mixed tables: naive starters, the new starters, model-backed seats, and a mix, on the same beginner rules and seeds.
 *
 *   pnpm --filter @workspace/v2-agents table -- [--games 2] [--rounds 10] [--usd 1] [--out docs/engine-v2/ai-table-results.md]
 *
 * Model seats use the cheapest Anthropic model in v2-ai's list when CODE_GODS_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) is
 * set, else the mock provider (whose default turn only reads the game: the numbers then show the harness, not play).
 * Every model call draws on one budget (--usd); the report says what was spent.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { anthropicProvider, Budget, mockProvider, MODELS, type ChatProvider } from "@workspace/v2-ai";
import { lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable, type SeatKind, type TableReport, type TableSeat } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  games: { type: "string", default: "2" }, rounds: { type: "string", default: "10" }, usd: { type: "string", default: "1" },
  out: { type: "string" }, only: { type: "string" },
} });
const games = Number(o.games), rounds = Number(o.rounds);
const key = process.env.CODE_GODS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
const cheapest = MODELS.filter(m => m.provider === "anthropic").sort((a, b) => a.prices.input + a.prices.output - b.prices.input - b.prices.output)[0]!;
const provider: ChatProvider = key ? anthropicProvider({ apiKey: key, model: cheapest.id, prices: cheapest.prices, effort: "low" }) : mockProvider();
const budget = new Budget({ tokens: 50_000_000, usd: Number(o.usd) });

const beginner = presets.find(p => p.id === "lines-beginner")!.rules;
const RULES = [["treasure", "prime-terms"], ["prime-staircase", "first-prime"], ["square-area", "lpf"]] as const;
const NAMES = ["Ada", "Bo", "Cy"];
const seat = (k: number, kind: SeatKind): TableSeat => {
  const [family, tieBreaker] = RULES[k]!;
  const params = beginner.find(r => r.family === family)!.params as Record<string, unknown>;
  const a = startersFor(family, "typescript").find(x => x.kind === (kind === "naive" ? "naive" : "simple"))!;
  return { name: NAMES[k]!, kind, rule: { family, params, tieBreaker }, program: { language: a.language, source: a.source } };
};
const TABLES: Record<string, (g: number) => SeatKind[]> = {
  naive: () => ["naive", "naive", "naive"],
  starters: () => ["starter", "starter", "starter"],
  models: () => ["model", "model", "model"],
  // Each rule plays each kind once over three games.
  mix: g => { const k: SeatKind[] = ["model", "starter", "naive"]; return [0, 1, 2].map(i => k[(i + g) % 3]!); },
};

const boxes = sandboxes();
const results: Record<string, TableReport[]> = {};
for (const [name, kinds] of Object.entries(TABLES)) {
  if (o.only && !o.only.split(",").includes(name)) continue;
  results[name] = [];
  const n = name === "mix" ? Math.max(3, games) : games;
  for (let g = 0; g < n; g++) {
    const report = await runTable(boxes, {
      type: lineType, variant: lineZ, lines: 12, seed: `g${g % games}`, rounds, acts: 6, energy: 600, income: 120,
      seats: kinds(g).map((kind, k) => seat(k, kind)), model: { provider, budget, every: 2 },
      onTurn: (s, round, run) => console.error(`  ${name} g${g} r${round} ${s}: ${run.toolCalls.map(c => c.name + (c.ok ? "" : "✗")).join(" ")} — ${run.text.slice(0, 120)}`),
    });
    results[name]!.push(report);
    console.error(`${name} g${g}: ${report.seats.map(s => `${s.seat}(${s.kind}) ${s.gained.toFixed(0)}`).join(" · ")}; deals ${report.deals.length}, kept ${report.deals.filter(d => d.kept).length}; $${budget.snapshot().usd.toFixed(3)}`);
  }
}
await boxes.close();

// ---------------------------------------------------------------- the report

const lines: string[] = [];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
lines.push(`| Table | Seat kind | Seats | Points gained (mean) | Reversal ⚡ (mean) | Messages | Proposals | Deals accepted | Deals kept | Games with a kept deal |`);
lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
for (const [name, reports] of Object.entries(results)) {
  const seats = reports.flatMap(r => r.seats);
  for (const kind of [...new Set(seats.map(s => s.kind))]) {
    const ss = seats.filter(s => s.kind === kind);
    const deals = reports.flatMap(r => r.deals.filter(d => r.seats[d.by]!.kind === kind || r.seats[d.with]!.kind === kind));
    lines.push(`| ${name} | ${kind} | ${ss.length} | ${mean(ss.map(s => s.gained)).toFixed(0)} | ${mean(ss.map(s => s.reversalEnergy)).toFixed(0)} | ${ss.reduce((t, s) => t + s.messages, 0)} | ${ss.reduce((t, s) => t + s.proposals, 0)} | ${kind === "model" ? deals.length : "–"} | ${kind === "model" ? deals.filter(d => d.kept).length : "–"} | ${kind === "model" ? `${reports.filter(r => r.deals.some(d => d.kept)).length} of ${reports.length}` : "–"} |`);
  }
}
const chat = Object.values(results).flat().flatMap(r => r.chat);
const spent = budget.snapshot();
const text = `# Mixed tables: naive starters, new starters and model-backed seats

Generated by \`pnpm --filter @workspace/v2-agents table -- --games ${games} --rounds ${rounds}\`. Three beginner rules (${RULES.map(r => r.join("/")).join(", ")}), 12 lines on line-z,
${rounds} rounds of 6 acts per seat, 600 ⚡ to start and 120 ⚡ a round. Model seats start with the Simple starter and take a
turn every 2 rounds with the server AI seat's prompt and tools (at most 6 model calls a turn). In "mix" each rule plays
each kind once over three games. Model: ${key ? `the cheapest Anthropic model in v2-ai's list, low effort` : "the mock provider (no key): its turns only read"}.
Spent: $${spent.usd.toFixed(3)} over ${spent.calls} model calls (${spent.tokens.toLocaleString("en")} tokens).

${lines.join("\n")}

Deals are read from the chat (a proposal names a line and offers something; another seat accepts it; it is kept when
neither side then lowers the other's points on a named line): a heuristic, not the players' own record. In "mix" only
one seat is model-backed and scripted seats never chat, so no deal can be made there: its deal columns measure nothing.

## Chat the model seats wrote (first 12 messages)

${chat.slice(0, 12).map(m => `- **${m.from}** (round ${m.round}): ${m.text.replace(/\n/g, " ")}`).join("\n") || "(none)"}
`;
if (o.out) writeFileSync(o.out, text); else console.log(text);
