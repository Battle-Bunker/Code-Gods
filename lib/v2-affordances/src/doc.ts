/** The directory as a Markdown table, for docs/engine-v2/affordances.md (kept equal by test/doc.test.ts). */
import { DIRECTORY, type Directory } from "./directory.ts";

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function directoryTable(dir: Directory = DIRECTORY): string {
  const rows = dir.map(a => {
    const params = Object.keys(a.params.shape).filter(k => k !== "requestId").join(", ") || "—";
    const flags = [a.effect, a.spends ? `spends ${a.spends}` : "", a.confirm !== "none" ? `confirm ${a.confirm}` : "", a.surfaces ? `not on ${a.surfaces.except.join("/")} (${a.surfaces.because})` : ""]
      .filter(Boolean).join("; ");
    return `| \`${a.id}\` | ${cell(a.title)} | ${params} | ${a.runs} · ${a.scope} | ${a.caller} | ${a.contexts.join(", ")} | ${flags} |`;
  });
  return ["| Id | Title | Params | Runs · scope | Caller | Contexts | Effect |", "|---|---|---|---|---|---|---|", ...rows].join("\n");
}
