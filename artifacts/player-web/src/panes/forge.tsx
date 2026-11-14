/**
 * "Agent code": write, check, summon and replace agents (integration plan §1.3–1.4, ux-lessons §1.3–1.9, §3).
 *
 * The editor opens holding the example for the player's own dealt rule; "Summon my first agent" summons it in one
 * press, without a check first, at the first-agent share. With an agent in the editor a changed draft is offered as
 * Replace first ("Summon beside it" is secondary). "Other starting points" (Simple, Thorough, Bold) sit beside the
 * next step, as a Replace of the agent in the editor. "Put the previous version back" is one press, with the frozen
 * before/after comparison. Check runs one act in the sandbox and never blocks Summon.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { noteSummoned, useAgentCount, useAgentPrograms, useGame, useMe, useMyAgents, useMyRule } from "@/sdk";
import { failureText } from "@/site/components/action";
import { useOpenPane } from "@/dock/open-pane";
import { energyText } from "@/core/words";
import {
  affordLine, comparisonText, FIRST_SHARE, openingProgram, otherStartingPoints, primaryAction, replacedText, summonedText, summonPrice, type Language,
} from "./forge-model";

/** An agent's name from its program's title: "Example: legs nearly whole" → "Legs nearly whole". */
const agentName = (title?: string) => {
  const t = (title ?? "").replace(/^Example:\s*/i, "").trim();
  return t ? (t[0]!.toUpperCase() + t.slice(1)).slice(0, 40) : undefined;
};

type Status = { tone: "ok" | "error" | "info"; text: string; action?: "agents" } | null;

function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  return { busy, async run<T>(what: string, f: () => Promise<T>): Promise<T | undefined> { setBusy(what); try { return await f(); } finally { setBusy(null); } } };
}

export function ForgePane() {
  const header = useGame();
  const rule = useMyRule();
  const agents = useMyAgents();
  const me = useMe();
  const openPane = useOpenPane(header?.phase ?? "planning");
  const summon = useAffordance("agent.summon");
  const replace = useAffordance("agent.replace");
  const putBack = useAffordance("agent.putBack");
  const check = useAffordance("agent.check");
  const runner = useRun();
  const statusRef = useRef<HTMLDivElement>(null);

  const [chosenLanguage, setLanguage] = useState<Language>("typescript");
  const [selected, setSelected] = useState<string | null>(null);   // the agent in the editor
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [ran, setRan] = useState<string | null>(null);             // the source just summoned or replaced (no stale price: ux 3.6)
  const [report, setReport] = useState<string | null>(null);
  // An accepted summon counts at once, before the agent list catches up (ux-lessons 1.8).
  const count = useAgentCount() ?? 0;
  // The agent in the editor: the one chosen, else the first; a destroyed one gives way to the next.
  useEffect(() => {
    if (agents?.length && !agents.some(a => a.agentId === selected)) { setSelected(agents[0]!.agentId); setDraft(null); }
  }, [agents, selected]);
  const agent = agents?.find(a => a.agentId === selected) ?? null;
  // An agent's code is in its own language; the choice applies to new code only.
  const language: Language = agent ? agent.language : chosenLanguage;
  const programs = useAgentPrograms(agent?.agentId);
  const current = programs?.[0];
  const opening = useMemo(() => (rule ? openingProgram(rule.row.family, rule.row.tieBreaker, language) : null), [rule?.row.family, rule?.row.tieBreaker, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = useMemo(() => (rule ? otherStartingPoints(rule.row.family, language) : []), [rule?.row.family, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = agent ? current?.source ?? "" : opening?.source ?? "";
  const source = draft ?? base;
  const changed = !!agent && !!current && source !== current.source;
  const primary = primaryAction({ agents: count, selected: !!agent, draftChanged: changed });
  const price = summonPrice(language, source);
  useEffect(() => { statusRef.current?.scrollIntoView({ block: "nearest" }); }, [status]);   // ux-lessons 5.3

  if (!header) return null;
  if (!header.me) return <p className="p-4 text-sm text-muted-foreground">You're watching: only players write agents.</p>;
  if (!rule) return <p className="p-4 text-sm text-muted-foreground">Your rule is being dealt…</p>;

  const fail = (e: unknown) => setStatus({ tone: "error", text: failureText(e) });
  const doSummon = async (src: string, first: boolean, name?: string) => {
    setStatus({ tone: "info", text: first ? "Summoning your first agent…" : "Summoning…" });
    try {
      const r = await runner.run("summon", () => summon.run({ language, source: src, ...(name ? { name } : {}), ...(first ? { share: FIRST_SHARE } : {}) }));
      if (!r) return;
      setRan(src); setDraft(null); setSelected(r.agentId);
      if (header?.gameId) noteSummoned(header.gameId);
      setStatus({ tone: "ok", text: first ? summonedText({ name: name ?? "Your agent", share: FIRST_SHARE, power: me?.power ?? 0 }) : `Summoned for ${energyText(r.price)}.`, action: "agents" });
    } catch (e) { fail(e); }
  };
  const doReplace = async (src: string) => {
    if (!agent) return;
    setStatus({ tone: "info", text: `Replacing ${agent.name}'s code…` });
    try {
      const r = await runner.run("replace", () => replace.run({ agentId: agent.agentId, language, source: src }));
      if (!r) return;
      setRan(src); setDraft(null);
      setStatus({ tone: "ok", text: replacedText(agent.name), action: "agents" });
    } catch (e) { fail(e); }
  };
  const doCheck = async () => {
    setReport("Checking: one move on a sample line…");
    try {
      const r = await check.run({ language, source });
      const moves = r.sample.map(x => x.outcome === "committed" ? "made a move" : x.outcome === "skipped" ? "chose not to move" : `failed${x.reason ? `: ${x.reason}` : ""}`);
      setReport([`${r.verdict === "works" ? "It works" : r.verdict === "warns" ? "It works, with a warning" : "It does not work yet"}: ${r.summary}`,
        `Summoning it costs ${energyText(r.price)}.`, ...(moves.length ? [`On sample lines it ${[...new Set(moves)].join(", ")}.`] : [])].join("\n"));
    } catch (e) { setReport(failureText(e)); }
  };
  const previous = programs?.[1];
  const comparison = current && previous ? comparisonText(previous, current) : null;

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm" data-testid="forge">
      <div className="flex flex-wrap items-center gap-2">
        {agents && agents.length > 0 && (
          <select value={selected ?? ""} onChange={e => { setSelected(e.target.value); setDraft(null); }} className="h-8 border bg-background px-2" aria-label="Agent in the editor" data-testid="select-forge-agent">
            {agents.map(a => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
          </select>
        )}
        <select value={language} disabled={!!agent} onChange={e => { setLanguage(e.target.value as Language); setDraft(null); }} className="h-8 border bg-background px-2" aria-label="Language" data-testid="select-forge-language">
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
        </select>
        <span className="text-xs text-muted-foreground">{agent ? `${agent.name}, version ${agent.version}` : opening ? `${opening.title}: ${opening.summary}` : ""}</span>
      </div>
      <textarea value={source} onChange={e => { setDraft(e.target.value); setRan(null); }} spellCheck={false} wrap="off" aria-label="Agent code"
        className="min-h-[160px] h-[40dvh] md:h-auto md:flex-1 w-full resize-y border bg-[hsl(var(--muted))]/40 p-2 font-mono text-xs leading-relaxed" data-testid="input-forge-code" />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {primary === "summonFirst" && (
          <button type="button" aria-disabled={!summon.available || !!runner.busy || undefined} onClick={() => summon.available && !runner.busy && void doSummon(source, true, agentName(opening?.title))}
            className={`bg-primary text-primary-foreground px-3 py-2 font-medium ${!summon.available || runner.busy ? "opacity-50" : ""}`} title={summon.reason} data-testid="button-summon-first-forge">
            {runner.busy === "summon" ? "Summoning…" : "Summon my first agent"}
          </button>
        )}
        {primary === "replace" && agent && (
          <button type="button" aria-disabled={!replace.available || !!runner.busy || undefined} onClick={() => replace.available && !runner.busy && void doReplace(source)}
            className={`bg-primary text-primary-foreground px-3 py-2 font-medium ${!replace.available || runner.busy ? "opacity-50" : ""}`} title={replace.reason} data-testid="button-replace">
            {runner.busy === "replace" ? "Replacing…" : `Replace ${agent.name}'s code`}
          </button>
        )}
        {count > 0 && (primary === "replace" || primary === "summon") && (
          <button type="button" aria-disabled={!summon.available || !!runner.busy || undefined} onClick={() => summon.available && !runner.busy && void doSummon(source, false)}
            className="border px-3 py-2" data-testid="button-summon-beside">Summon beside it</button>
        )}
        <button type="button" aria-disabled={!check.available || undefined} onClick={() => check.available && void doCheck()} className="border px-3 py-2" title="Try one move on a sample line without spending energy. Summon does not wait for it." data-testid="button-check">Check</button>
        {others.length > 0 && (
          <details className="relative" data-testid="other-starting-points">
            <summary className="cursor-pointer select-none border px-3 py-2">Other starting points</summary>
            <ul className="mt-1 w-[min(22rem,90vw)] divide-y border bg-card">
              {others.map(o => (
                <li key={o.title} className="space-y-1 p-2">
                  <p><span className="font-medium">{o.title}</span>: {o.summary} <span className="text-muted-foreground">({energyText(summonPrice(language, o.source))})</span></p>
                  {agent ? <button type="button" className="underline underline-offset-4" aria-disabled={!replace.available || !!runner.busy || undefined} onClick={() => replace.available && !runner.busy && void doReplace(o.source)} data-testid={`button-replace-with-${o.kind}`}>Replace {agent.name} with {o.title}</button>
                    : <button type="button" className="underline underline-offset-4" onClick={() => setDraft(o.source)} data-testid={`button-open-${o.kind}`}>Open in the editor</button>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {!runner.busy && (primary || !agent) && <p className="text-xs text-muted-foreground" data-testid="text-forge-price">{affordLine({ price, energy: me?.energy ?? 0, justRan: ran === source })}</p>}
      <div ref={statusRef} aria-live="polite">
        {status && (
          <div className={`border px-3 py-2 ${status.tone === "error" ? "border-destructive/50 text-destructive" : status.tone === "ok" ? "border-primary/40" : ""}`} data-testid="text-forge-status">
            <p>{status.text}</p>
            {status.action === "agents" && <button type="button" className="mt-1 underline underline-offset-4" onClick={() => void openPane("agents")} data-testid="button-open-agents">Open My agents</button>}
          </div>
        )}
      </div>
      {agent && previous && (
        <div className="border px-3 py-2 space-y-1" data-testid="put-back">
          {comparison && <p data-testid="text-comparison">{comparison}</p>}
          <button type="button" aria-disabled={!putBack.available || undefined} className="underline underline-offset-4"
            onClick={() => putBack.available && void runner.run("putBack", () => putBack.run({ agentId: agent.agentId, version: previous.version })).then(() => setStatus({ tone: "ok", text: `${agent.name} runs its previous version again.` }), fail)}
            data-testid="button-put-back">Put the previous version back</button>
        </div>
      )}
      {report && <pre className="max-h-48 overflow-auto border p-2 text-xs whitespace-pre-wrap" data-testid="text-check-report">{report}</pre>}
    </div>
  );
}
