/**
 * What Check says in Agent code: the verdict and the check's own summary, once (lib/v2-agents check.ts ends it with the
 * summon price), and what it did on the samples. For an agent already summoned the summon price is beside the point:
 * the editor's price line says what the edit costs, so the summon sentence is left out.
 */
export interface CheckResult {
  verdict: string;
  summary: string;
  sample: readonly { outcome: "committed" | "skipped" | "failed" | string; reason?: string }[];
}

export function checkReport(r: CheckResult, o: { replacing: boolean; many: string }): string {
  const verdict = r.verdict === "works" ? "It works" : r.verdict === "warns" ? "It works, with a warning" : "It does not work yet";
  const summary = o.replacing ? r.summary.replace(/\s*Summoning it costs .*$/, "") : r.summary;
  const moves = r.sample.map(x => x.outcome === "committed" ? "made a move" : x.outcome === "skipped" ? "chose not to move" : `failed${x.reason ? `: ${x.reason}` : ""}`);
  return [`${verdict}: ${summary}`, ...(moves.length ? [`On sample ${o.many} it ${[...new Set(moves)].join(", ")}.`] : [])].join("\n");
}
