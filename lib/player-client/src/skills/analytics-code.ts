/**
 * The analytics-code skill's body (docs/assistant/code-execution.md §5; its index entry is in ../skills.ts): what the
 * model loads with load_skill before its first run_code. Static text plus the dataset catalogue (../datasets.ts), so a
 * new dataset documents itself.
 */
import { DATASETS, DATASET_NAMES } from "../datasets.ts";

const datasetLines = DATASET_NAMES.map(name => {
  const d = DATASETS[name];
  const opts = [d.needsGameId ? "needs {name, gameId}" : d.gameId ? "optional gameId" : "", d.limit ? `limit default ${d.limit.default}, max ${d.limit.max} batches` : ""]
    .filter(Boolean).join("; ");
  return `- ${name}${opts ? ` (${opts})` : ""}: ${d.about}\n  data.${name}: ${d.shape}`;
}).join("\n");

export const ANALYTICS_CODE_SKILL = `ANALYTICS CODE (run_code, get_code_run, list_code_runs)

When to run code. Use run_code when an answer needs computation over many values: ranking or filtering all objects by a
formula, correlations, trends over time, grouping events, scoring hypothetical values with the player's utility logic,
"which of my agents paid off". Answer from the briefing or one read tool when that suffices; do not run code to fetch a
single number you can read. Scripts read only: they cannot summon, chat or change anything.

How it works. run_code {language, source, datasets, params?, title?, cpuSeconds?}. The engine fetches each named dataset
as the player (never another god's secrets), passes data = {<dataset>: value, ..., params: params ?? {}} to main(data),
and returns main's result as JSON with what the script printed. The datasets never pass through this conversation,
so prefer naming datasets over pasting values into params. Budget: about 10 s CPU per run (cpuSeconds up to 20), a few
dozen runs and 120 CPU seconds per game; one run at a time. Inputs are at most 4 MiB of JSON, results 1 MiB.

Languages and libraries.
- python: CPython 3.15 standard library subset, preloaded: math, statistics (mean, median, stdev, correlation,
  linear_regression, quantiles), collections (Counter, defaultdict), itertools, functools, operator, json, re, decimal,
  fractions, random (seeded), time (virtual clock), hashlib, bisect, numbers. No numpy or pandas, no files, network or
  os/sys. print() is captured.
- typescript: ES2022 (Math, JSON, Array methods, Map/Set, RegExp, Intl is absent). Types are erased, not checked; no
  imports or exports. console.log is captured.
Randomness is seeded from the script and its data, so a rerun gives the same answer.

Output conventions.
- Return a list of flat rows (objects with the same keys) for anything tabular: the code-output panel renders it as a
  table, keys in first-row order. Round numbers (e.g. round(x, 2)) and keep at most a few hundred rows.
- Or return {"summary": "...", "rows": [...]} or another small object; print() short notes if useful.
- After a useful result, show it: open_panel {panelId: "code-output", params: {runId}} (the result says so), then
  explain the finding in one or two sentences. Never paste the whole table into the conversation.
- An error result (status error) carries the message with the line: fix the script and run again; do not retry the
  same code. A TRUNCATED field means the preview was cut; get_code_run pages through the rest.

Datasets (each is data[name]; request them as names, or {name, gameId, limit}):
${datasetLines}

Example (python): "rank my top 5 objects by payoff".
  run_code {language: "python", title: "Top 5 by payoff", datasets: ["objects"], source:
  "def main(data):\\n    rows = sorted(data['objects'], key=lambda o: -o['payoff'])[:5]\\n    return [{'object': o['id'], 'payoff': round(o['payoff'], 2), 'my bits': round(o['own']['netBits'], 2), 'others care': round(o['peerCare'], 2)} for o in rows]\\n"}

Example (typescript): correlation of my bits with others' care.
  run_code {language: "typescript", datasets: ["objects"], source:
  "function main(data) {\\n  const xs = data.objects.map(o => o.own.netBits), ys = data.objects.map(o => o.peerCare);\\n  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;\\n  const mx = m(xs), my = m(ys);\\n  let sxy = 0, sxx = 0, syy = 0;\\n  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });\\n  return { n: xs.length, correlation: sxy / Math.sqrt(sxx * syy) };\\n}\\n"}

Example (python): which objects are rising, from trajectories.
  datasets: [{"name": "trajectories", "limit": 200}], source: a main that takes each series' first and last payoff and
  returns the ten largest increases as rows.
`;
