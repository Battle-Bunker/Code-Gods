/**
 * Code results: one analytics run the assistant made for the player (run_code; docs/assistant/code-execution.md §4),
 * live from code.runs.get. A list of flat rows (or {summary, rows}) is a table; anything else is JSON; the printed text
 * follows, and the source on demand. A run's whole result is fetched from file storage when its row holds a prefix.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useRoom } from "@/sdk";
import { PanelEmpty, Section, type PanelProps } from "./kit";

import { cellText, columnsOf, tableOf, MAX_ROWS, type Json } from "./code-table";

function useFullResult(fullUrl: string | null, clipped: boolean): { result: string; output: string } | null {
  const [full, setFull] = useState<{ result: string; output: string } | null>(null);
  useEffect(() => {
    setFull(null);   // never show another run's result while this one loads
    if (!clipped || !fullUrl) return;
    let live = true;
    fetch(fullUrl).then(r => r.json() as Promise<{ result: string; output: string }>).then(v => { if (live) setFull(v); }, () => {});
    return () => { live = false; };
  }, [fullUrl, clipped]);
  return full;
}

export default function CodeOutput({ params }: PanelProps<"code-output">) {
  const { roomId } = useRoom();
  const run = useQuery(api.code.runs.get, { roomId, ...(params.runId ? { runId: params.runId } : {}) });
  const full = useFullResult(run?.fullUrl ?? null, run?.clipped ?? false);
  const resultText = full?.result ?? run?.resultJson ?? null;
  const parsed = useMemo((): Json | undefined => {
    if (!resultText) return undefined;
    try { return JSON.parse(resultText) as Json; } catch { return undefined; }
  }, [resultText]);
  if (run === undefined) return <PanelEmpty>Loading the run…</PanelEmpty>;
  if (run === null) return <PanelEmpty testId="panel-empty-code-output">No code runs yet. Ask your assistant to compute something, for example "rank my top 5 objects by payoff and show a table".</PanelEmpty>;
  const output = full?.output ?? run.output ?? "";
  const table = parsed !== undefined && params.view !== "json" ? tableOf(parsed) : null;
  const columns = table ? columnsOf(table.rows) : [];
  const meta = [run.language === "python" ? "Python" : "TypeScript", run.cpuMs !== null ? `${(run.cpuMs / 1000).toFixed(2)} s CPU` : null,
    new Date(run.startedAt).toLocaleTimeString()].filter(Boolean).join(" · ");
  return (
    <div className="space-y-4" data-testid="panel-code-output" data-status={run.status}>
      <header className="space-y-0.5">
        <h3 className="text-[15px] font-semibold" data-testid="text-code-run-title">{run.title ?? "Analytics run"}</h3>
        <p className="label">{meta}</p>
      </header>
      {run.status === "running" && <p className="beat text-sm text-muted-foreground" data-testid="text-code-running">Running code…</p>}
      {run.status === "error" && (
        <pre className="whitespace-pre-wrap break-words border-l-2 border-destructive pl-2 font-mono text-[12px] text-destructive" data-testid="text-code-error">
          {run.error ? `${run.error.code}: ${run.error.message}` : "The run did not finish."}
        </pre>
      )}
      {run.status === "ok" && (
        <>
          {table?.summary && <p className="text-sm">{table.summary}</p>}
          {table ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]" data-testid="table-code-result">
                <thead><tr>{columns.map(c => <th key={c} className="border-b border-[hsl(var(--border))] px-1.5 py-1 text-left font-semibold">{c}</th>)}</tr></thead>
                <tbody>
                  {table.rows.slice(0, MAX_ROWS).map((row, i) => (
                    <tr key={i} className="odd:bg-[hsl(var(--muted))]/40">
                      {columns.map(c => <td key={c} className={`px-1.5 py-0.5 ${typeof row[c] === "number" ? "text-right font-mono tabular-nums" : ""}`}>{cellText(row[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
                {table.rows.length > MAX_ROWS && <tfoot><tr><td colSpan={columns.length} className="px-1.5 opacity-60">+{table.rows.length - MAX_ROWS} more rows</td></tr></tfoot>}
              </table>
            </div>
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[11px]" data-testid="text-code-result">
              {parsed !== undefined ? JSON.stringify(parsed, null, 2) : resultText}
            </pre>
          )}
          {run.clipped && !full && <p className="text-xs text-muted-foreground">Showing the start of a large result…</p>}
        </>
      )}
      {output && (
        <Section title="Printed">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground" data-testid="text-code-output">
            {output}{run.outputTruncated ? "\n… (clipped)" : ""}
          </pre>
        </Section>
      )}
      <details open={params.showSource} className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">The code</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]" data-testid="text-code-source">{run.source}</pre>
      </details>
    </div>
  );
}
