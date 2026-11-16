/**
 * Code results (v1's code-output panel, A15): the viewer's script runs over a game's data (code.run; the assistant runs
 * them for the player). The newest run shows unless another is picked: a list of flat rows (or {summary, rows}) is a
 * table, anything else is JSON; what it printed follows, and its code on demand. Each run is one live read (code.get),
 * the list one live page (code.list).
 */
import { useMemo, useState } from "react";
import { useCodeRun, useCodeRuns, type CodeRun } from "@/sdk";
import { cellText, columnsOf, tableOf, MAX_ROWS, type Json } from "./code-table";

const LANGUAGE: Record<string, string> = { typescript: "TypeScript", javascript: "JavaScript" };
const DATASET: Record<string, string> = { replay: "an ended game's whole record", "my-moves": "your act log", none: "no data" };
const when = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function CodeOutputPane() {
  const runs = useCodeRuns();
  const [picked, setPicked] = useState<string | null>(null);
  const runId = picked && runs?.some(r => r.runId === picked) ? picked : runs?.[0]?.runId ?? null;
  const run = useCodeRun(runId);
  if (runs === undefined) return <p className="p-4 text-sm text-muted-foreground">Loading your code runs…</p>;
  if (!runs.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="code-output-empty">
        No code runs yet. Ask your assistant to compute something over the game, for example "rank my lines by points and show a table".
      </p>
    );
  }
  return (
    <div className="space-y-4 p-3" data-testid="pane-code-output-body">
      {runs.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Run</span>
          <select value={runId ?? ""} onChange={e => setPicked(e.target.value)} className="border bg-background px-2 py-1" data-testid="select-code-run">
            {runs.map(r => <option key={r.runId} value={r.runId}>{r.title || "A code run"} · {when(r.at)}{r.status === "error" ? " · failed" : ""}</option>)}
          </select>
        </label>
      )}
      {run === undefined ? <p className="text-sm text-muted-foreground">Loading the run…</p>
        : run === null ? <p className="text-sm text-muted-foreground">This run is not yours to read.</p>
        : <RunView run={run} />}
    </div>
  );
}

function RunView({ run }: { run: CodeRun }) {
  const table = useMemo(() => (run.status === "ok" && run.result !== null ? tableOf(run.result as Json) : null), [run.status, run.result]);
  const columns = table ? columnsOf(table.rows) : [];
  const meta = [LANGUAGE[run.language] ?? run.language, `over ${DATASET[run.dataset] ?? run.dataset}`, `${(run.ms / 1000).toFixed(2)} s`, when(run.at)].join(" · ");
  return (
    <div className="space-y-4" data-testid="code-run" data-status={run.status}>
      <header className="space-y-0.5">
        <h3 className="text-[15px] font-semibold" data-testid="text-code-run-title">{run.title || "A code run"}</h3>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </header>
      {run.status === "error" && (
        <pre className="whitespace-pre-wrap break-words border-l-2 border-destructive pl-2 font-mono text-[12px] text-destructive" data-testid="text-code-error">
          {run.error ?? "The run did not finish."}
        </pre>
      )}
      {run.status === "ok" && (table ? (
        <div className="space-y-2">
          {table.summary && <p className="text-sm">{table.summary}</p>}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]" data-testid="table-code-result">
              <thead><tr>{columns.map(c => <th key={c} className="border-b px-1.5 py-1 text-left font-semibold">{c}</th>)}</tr></thead>
              <tbody>
                {table.rows.slice(0, MAX_ROWS).map((row, i) => (
                  <tr key={i} className="odd:bg-[hsl(var(--muted))]/40">
                    {columns.map(c => <td key={c} className={`px-1.5 py-0.5 ${typeof row[c] === "number" ? "text-right font-mono tabular-nums" : ""}`}>{cellText(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
              {table.rows.length > MAX_ROWS && <tfoot><tr><td colSpan={columns.length} className="px-1.5 opacity-60">and {table.rows.length - MAX_ROWS} more rows</td></tr></tfoot>}
            </table>
          </div>
        </div>
      ) : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[11px]" data-testid="text-code-result">
          {run.result === null ? "It returned nothing." : JSON.stringify(run.result, null, 2)}
        </pre>
      ))}
      {run.output && (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground">What it printed</h4>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground" data-testid="text-code-output">{run.output}</pre>
        </section>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Its code</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]" data-testid="text-code-source">{run.source}</pre>
      </details>
    </div>
  );
}
