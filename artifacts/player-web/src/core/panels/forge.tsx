/**
 * Agent code: the agent being written for you and what it costs. The code view shows the assistant's draft (or a
 * live agent's source); "Edit" switches the pane to the editor, which is the forge: language, the source, the
 * helpers drawer with insert, a byte count, Validate (free) and Summon (pays from your energy). The same command
 * path as everything else; an uncertain summon keeps its envelope for the identical retry under the header.
 */
import { useRef } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { AgentCost, HelpersDrawer, type ActCostBreakdown } from "@workspace/object-views";
import { useMyAgents, useMutators, useObservation } from "@/sdk";
import { runner, useGameCommands, useRunner, type Lang } from "@/core/game/runner";
import { GhostButton, PrimaryButton, TextButton, type PanelProps } from "./kit";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));
const bytes = (s: string) => new TextEncoder().encode(s).length;

export default function Forge({ params }: PanelProps<"forge">) {
  const obs = useObservation({ hz: 2 });
  const { agents } = useMyAgents({ hz: 1 });
  const state = useRunner();
  const live = params.agentId ? agents.find(a => a.id === params.agentId) : undefined;
  const shown = live?.source ?? params.source;
  const language: Lang = state.draft.language ?? params.language ?? obs?.language ?? "python";
  // Nothing to look at: the pane is the editor straight away.
  const editing = state.editing || !shown;

  if (!editing) {
    const lang = live?.language ?? params.language ?? obs?.language ?? "python";
    return (
      <div className="space-y-3" data-testid="panel-forge">
        <p className="text-sm text-muted-foreground">{live ? "The code of one of your live agents." : "A draft from your assistant. Nothing is summoned until you or your assistant (with your approval) summons it."}</p>
        <pre className="max-h-[50vh] overflow-auto bg-secondary p-3 font-mono text-[13px] leading-relaxed text-secondary-foreground"><code>{shown}</code></pre>
        <div className="flex items-center gap-3">
          <GhostButton testId="button-forge-edit" onClick={() => runner.edit(shown!, lang)}>Edit</GhostButton>
          <span className="font-mono text-xs text-muted-foreground">{lang} · {bytes(shown!)} bytes</span>
        </div>
      </div>
    );
  }
  return <Editor language={language} assistantDraft={params.source} showHelpers={params.showHelpers} />;
}

function Editor({ language, assistantDraft, showHelpers }: { language: Lang; assistantDraft?: string; showHelpers: boolean }) {
  const obs = useObservation({ hz: 2 });
  const { instance } = useMutators();
  const commands = useGameCommands();
  const { draft, validation, busy, notice, unknown } = useRunner();
  const editor = useRef<HTMLTextAreaElement>(null);
  const source = draft.source;
  const insert = (name: string) => {
    const el = editor.current;
    const at = el ? el.selectionStart : source.length, end = el ? el.selectionEnd : source.length;
    runner.setDraft({ source: source.slice(0, at) + name + source.slice(end) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + name.length, at + name.length); } });
  };
  const gameplay = !!obs && !unknown && commands.canAct;
  const current = validation && validation.source === source && validation.language === language ? validation.result.validation : undefined;
  const canSummon = gameplay && !!validation?.result.accepted && !!current?.valid && current.cost <= (obs?.self.energy ?? 0) && language === obs?.language && source.trim().length > 0;
  const arg = instance?.objectType === "Grid" ? "grid" : "x";
  const noun = instance?.objectType === "Grid" ? "grid" : "object";
  return (
    <div className="space-y-3" data-testid="panel-forge">
      <div className="flex flex-wrap items-center gap-2">
        {(["python", "typescript"] as const).map(l => (
          <button key={l} type="button" data-testid={`button-lang-${l}`} onClick={() => runner.setDraft({ language: l })} aria-pressed={language === l}
            className={`border px-2.5 py-1 font-mono text-xs ${language === l ? "border-secondary bg-secondary text-secondary-foreground" : "border-[hsl(var(--input))]"}`}>{l}</button>
        ))}
        {obs && obs.language !== language && <span className="text-xs font-semibold text-destructive">This room expects {obs.language}</span>}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{bytes(source)} / 16384 bytes</span>
      </div>
      {assistantDraft && assistantDraft !== source && (
        <p className="text-xs text-muted-foreground">Your assistant has a draft here. <TextButton onClick={() => runner.setDraft({ source: assistantDraft })}>Load it</TextButton></p>
      )}
      <textarea ref={editor} data-testid="input-source" value={source} onChange={e => runner.setDraft({ source: e.target.value })} maxLength={16384} spellCheck={false}
        aria-label="Agent source"
        placeholder={language === "python" ? `def agent(${arg}):\n    # return a list of moves, e.g. [swap(...)]\n    return []` : `function agent(${arg}) {\n  // return a list of moves, e.g. [swap(...)]\n  return [];\n}`}
        className="h-56 w-full resize-y border-l-4 border-[hsl(var(--input))] bg-secondary p-3 font-mono text-[13px] leading-relaxed text-secondary-foreground caret-[hsl(var(--primary))] outline-none focus:border-primary" />
      <p className="text-xs text-muted-foreground">Write <code>{language === "python" ? `def agent(${arg}):` : `function agent(${arg})`}</code>. It reads the {noun} and returns at most 16 moves from the room's helpers; each act costs bits from the agent's own energy.</p>
      {obs?.instance && <HelpersDrawer helpers={obs.instance.helpers} language={language} onInsert={insert} open={showHelpers} />}
      <div className="flex flex-wrap items-center gap-2">
        <GhostButton testId="button-validate" disabled={!gameplay || language !== obs?.language || !source.trim() || !!busy} onClick={() => void commands.run({ type: "validate", language, source })}>
          <Wand2 size={14} /> {busy === "validate" ? "Validating" : "Validate (free)"}
        </GhostButton>
        <PrimaryButton testId="button-summon" disabled={!canSummon || !!busy} onClick={() => void commands.run({ type: "summon", language, source })}>
          <Sparkles size={14} /> {busy === "summon" ? "Summoning" : current ? `Summon · cost ${fmt(current.cost)}` : "Summon"}
        </PrimaryButton>
        <TextButton onClick={() => runner.setEditing(false)}>Done</TextButton>
      </div>
      <div data-testid="panel-validation" className="text-sm">
        {current ? (
          <div className={`border-l-4 py-1 pl-3 ${current.valid ? "border-[hsl(var(--accent))]" : "border-destructive"}`}>
            <p className="font-mono text-xs"><strong>{current.valid ? "VALID" : "INVALID"}</strong></p>
            <div className="mt-1"><AgentCost summonCost={current.cost} expectedActCost={current.expectedActCost} breakdown={current.breakdown as ActCostBreakdown | undefined}
              agentEnergyPerSecond={obs?.economy?.agentEnergyPerSecond} godEnergy={obs?.self.energy} /></div>
            {current.diagnostics.length > 0
              ? <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">{current.diagnostics.map((d, i) => <li key={i} className="whitespace-pre-wrap break-words">{d}</li>)}</ul>
              : <p className="mt-1 font-mono text-xs text-muted-foreground">no diagnostics</p>}
          </div>
        ) : <p className="text-xs text-muted-foreground">{validation ? "The code changed since it was validated. Validate again." : "Validate before summoning: it is free."}</p>}
      </div>
      {notice && <p data-testid="text-notice" className={`text-sm ${notice.ok ? "text-[hsl(var(--accent))]" : "text-destructive"}`}>{notice.text}</p>}
    </div>
  );
}
