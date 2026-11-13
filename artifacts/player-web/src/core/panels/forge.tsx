/**
 * Agent code: the agent being written for you and what it costs. The code view shows the assistant's draft (or a
 * live agent's source); "Edit" switches the pane to the editor, which is the forge: the agent's language (a dropdown
 * of the languages the game allows; the agent's own by default, else the first allowed), the source, the
 * helpers drawer with insert, a byte count, Validate (free) and Summon (pays from your energy). The same command
 * path as everything else; an uncertain summon keeps its envelope for the identical retry under the header.
 *
 * A player with no agents finds a working example for their own goal already in the editor, named, with Summon ready
 * at once: the summon examines the agent itself, so nothing waits for a validation (./first-agent.ts decides when;
 * lib/game-utilities/src/example-agents.ts writes it from the goal card). While the game is busy checking agents the
 * same command is sent again by itself and the pane says so; after the last try there is one "Try again".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_DESCRIPTION_MAX, AGENT_NAME_MAX } from "@workspace/player-client";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { AgentCost, HelpersDrawer, type ActCostBreakdown } from "@workspace/object-views";
import { boardFacts, buildExampleAgent, mutatorNames } from "@workspace/game-utilities/example-agents";
import { useMyAgents, useMutators, useDockState, useMyCard } from "@/sdk";
import { LANGUAGE_SPECS, changeCostHint, costModelOf, defaultShare, isLanguage } from "@workspace/game-core";
import { runner, useGameCommands, useRunner, type Lang } from "@/core/game/runner";
import { forgeLanguage, forgeLanguages, forgeSandbox } from "@/core/game/language";
import { useAffordances } from "@/core/use-affordances";
import { useDockActions } from "@/dock/actions";
import { summonNeeds } from "./summon-needs";
import { armedStep, armedText, energyHint, firstAgentFill, firstAgentHint, lacksEnergy, summonReady, summonedText, untouchedExample, type ArmedSummon, type Example } from "./first-agent";
import { progressLine } from "@/core/game/command-deadline";
import { GhostButton, PanelEmpty, PrimaryButton, TextButton, type PanelProps } from "./kit";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));
const bytes = (s: string) => new TextEncoder().encode(s).length;

export default function Forge({ params, phase }: PanelProps<"forge">) {
  const obs = useDockState({ hz: 2 });
  const { agents } = useMyAgents({ hz: 1 });
  const state = useRunner();
  const live = params.agentId ? agents.find(a => a.id === params.agentId) : undefined;
  const shown = live?.source ?? params.source;
  const allowed = forgeLanguages(obs);
  const language: Lang = forgeLanguage(allowed, state.draft.language, params.language);
  const can = useAffordances();
  // Read-only (a replay, a read-only credential): the code can be read, never edited, so there is no editor.
  const readOnly = !can.can.editCode.ok;
  if (readOnly && !shown) return <PanelEmpty testId="panel-forge-readonly">{!can.can.editCode.ok && can.can.editCode.reason} Open an agent's code from {can.whose} agents.</PanelEmpty>;
  // Nothing to look at: the pane is the editor straight away.
  const editing = !readOnly && (state.editing || !shown);

  if (!editing) {
    // A past game's agent may be in a retired language (game-core RETIRED_LANGUAGES): shown as it is, edited in an allowed one.
    const lang = live?.language ?? forgeLanguage(allowed, params.language);
    return (
      <div className="space-y-3" data-testid="panel-forge">
        <p className="text-sm text-muted-foreground">{live ? (phase === "ended" ? `The code of one of ${can.whose} agents, as it ran until the end.` : `The code of one of ${can.whose} live agents.`) : "A draft from your assistant. Nothing is summoned until you or your assistant (with your approval) summons it."}</p>
        <pre className="max-h-[50vh] overflow-auto bg-secondary p-3 font-mono text-[13px] leading-relaxed text-secondary-foreground"><code>{shown}</code></pre>
        <div className="flex items-center gap-3">
          {!readOnly && <GhostButton testId="button-forge-edit" onClick={() => runner.edit(shown!, isLanguage(lang) ? lang : undefined)}>Edit</GhostButton>}
          <span className="font-mono text-xs text-muted-foreground">{lang} · {bytes(shown!)} bytes</span>
        </div>
      </div>
    );
  }
  return <Editor language={language} allowed={allowed} assistantDraft={params.source} showHelpers={params.showHelpers} ended={phase === "ended"} onlyEditor={!shown} />;
}

function Editor({ language, allowed, assistantDraft, showHelpers, ended, onlyEditor }: { language: Lang; allowed: readonly Lang[]; assistantDraft?: string; showHelpers: boolean; ended: boolean; /** The pane has no code view to go back to. */ onlyEditor: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // The agent this editor last summoned: said plainly under the buttons, since the button itself goes back to "Summon".
  const [summoned, setSummoned] = useState<string | null>(null);
  const dock = useDockActions();
  const obs = useDockState({ hz: 2 });
  // A summon from here takes the default share: half of the power you have not given to agents yet.
  const newShare = obs?.self.allocated !== undefined ? defaultShare(obs.self.allocated) : undefined;
  const { instance } = useMutators();
  const commands = useGameCommands();
  const { draft, validation, busy, notice, retrying, failed } = useRunner();
  const { can } = useAffordances({ language });
  const editor = useRef<HTMLTextAreaElement>(null);
  const source = draft.source;
  // The first agent: the example for the player's own goal per allowed language, from the goal card and the board
  // this pane already subscribes to (no extra read).
  const card = useMyCard();
  const { agents, loading: agentsLoading } = useMyAgents({ hz: 1 });
  const board = obs?.instance;
  const languageKey = allowed.join(",");
  const examples = useMemo(() => {
    const out: Record<string, Example> = {};
    if (!card || !board || board.objectType !== "Grid") return out;
    for (const l of allowed) {
      out[l] = buildExampleAgent({ familyId: card.familyId, language: l, summary: card.summary, cardSource: card.source, mutators: mutatorNames(board, l), ...boardFacts(board) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.familyId, card?.summary, card?.source, board?.key, languageKey]);
  const offered = useRef(false);
  // Not known while the agent list is loading (an empty list then is not "no agents"), unless a share above zero
  // already says an agent holds it.
  const agentCount = !obs ? undefined : (obs.self.allocated ?? 0) > 0 ? Math.max(1, agents.length) : agentsLoading ? undefined : agents.length;
  const fill = firstAgentFill({ editable: !ended, agents: agentCount, source, language, examples, offered: offered.current });
  useEffect(() => {
    if (!fill) return;
    offered.current = true;
    runner.setDraft({ source: fill.source });
    setName(n => (n.trim() ? n : fill.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.source]);
  // Only for the first agent: once one is summoned the line would read as if nothing had happened.
  const hint = agentCount === 0 ? firstAgentHint(source, language, examples) : null;
  const insert = (name: string) => {
    const el = editor.current;
    const at = el ? el.selectionStart : source.length, end = el ? el.selectionEnd : source.length;
    runner.setDraft({ source: source.slice(0, at) + name + source.slice(end) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + name.length, at + name.length); } });
  };
  // After the end the editor stays (read the code, copy it for the next game) but nothing can be validated or summoned.
  const sandbox = forgeSandbox(obs, language);
  const gameplay = can.validate.ok;
  const current = validation && validation.source === source && validation.language === language ? validation.result.validation : undefined;
  const energy = obs?.self.energy ?? 0;
  const untouched = untouchedExample(source, examples) === language;
  const summonable = gameplay && allowed.includes(language) && source.trim().length > 0;
  const checked = !!validation?.result.accepted && !!current;
  // The untouched example is summoned without a validation first (one pass through the sandbox, not two).
  const canSummon = summonable && summonReady({ untouched, valid: checked && !!current?.valid, price: checked ? current!.cost : undefined, energy });
  // "Summon as soon as I have the energy": armed for a validated agent the player cannot pay for yet, fired once
  // when their live energy reaches the price (while this pane is open), dropped by an edit or the game's end.
  const [armed, setArmed] = useState<ArmedSummon | null>(null);
  // An armed summon the engine refused: its message stays beside "Try again", which arms it again.
  const [refused, setRefused] = useState<{ armed: ArmedSummon; message: string } | null>(null);
  const fired = useRef<ArmedSummon | null>(null);
  const canArm = summonable && !canSummon && !armed && checked && !!current?.valid && current.cost > energy;
  const summon = (agent: Omit<ArmedSummon, "cost">, wasArmed?: ArmedSummon) => {
    setRefused(null);
    void commands.run({ type: "summon", language: agent.language as Lang, source: agent.source, name: agent.name, ...(agent.description ? { description: agent.description } : {}) }).then(async result => {
      if (!result) return;
      if (result.accepted) { setSummoned(agent.name); return; }
      if (wasArmed) { setRefused({ armed: wasArmed, message: result.message || "The game refused this summon." }); return; }
      // Not enough energy for an agent summoned without a validation: learn its price (free), then wait for the energy.
      if (!lacksEnergy(result.message)) return;
      const price = (await commands.run({ type: "validate", language: agent.language as Lang, source: agent.source }))?.validation;
      if (price?.valid) setArmed({ ...agent, cost: price.cost });
    });
  };
  useEffect(() => {
    const over = ended || (!gameplay && sandbox.ready && !busy);
    const step = armedStep(armed, { source, language, energy: obs?.self.energy, busy: !!busy, canSummon: gameplay && sandbox.ready && allowed.includes(language), over });
    if (step === "disarm") setArmed(null);
    if (refused && (over || refused.armed.source !== source || refused.armed.language !== language)) setRefused(null);
    if (step !== "fire" || !armed || fired.current === armed) return;
    fired.current = armed;
    setArmed(null);
    summon(armed, armed);
  });
  const arg = instance?.objectType === "Grid" ? "grid" : "x";
  const noun = instance?.objectType === "Grid" ? "grid" : "object";
  // What a change costs in this room, with its own numbers (game-core change-cost.ts; the room's cost model).
  const costModel = costModelOf(obs?.economy);
  const costHint = useMemo(() => (instance ? changeCostHint({ objectType: instance.objectType, typeArgs: instance.args }, costModel) : ""), [instance, costModel]);
  return (
    <div className="space-y-3" data-testid="panel-forge">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Language
          <select data-testid="select-language" aria-label="Agent language" value={language} disabled={allowed.length < 2}
            onChange={e => runner.setDraft({ language: e.target.value as Lang })}
            className="border border-[hsl(var(--input))] bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary disabled:opacity-80">
            {(allowed.length ? allowed : [language]).map(l => <option key={l} value={l}>{LANGUAGE_SPECS[l].label}</option>)}
          </select>
        </label>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{bytes(source)} / 16384 bytes</span>
      </div>
      {assistantDraft && assistantDraft !== source && (
        <p className="text-xs text-muted-foreground">Your assistant has a draft here. <TextButton onClick={() => runner.setDraft({ source: assistantDraft })}>Load it</TextButton></p>
      )}
      {hint && <p data-testid="text-first-agent-hint" className="text-sm font-semibold text-foreground">{hint}</p>}
      {/* The name, the buttons and what they say come before the code, so Summon is in view in a small pane. */}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="space-y-0.5 text-xs text-muted-foreground">
          Name (required to summon)
          <input data-testid="input-agent-name" value={name} maxLength={AGENT_NAME_MAX} onChange={e => setName(e.target.value)} placeholder="e.g. Corner hoarder"
            className="block w-full border border-[hsl(var(--input))] bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary" />
        </label>
        <label className="space-y-0.5 text-xs text-muted-foreground">
          Description (optional)
          <input data-testid="input-agent-description" value={description} maxLength={AGENT_DESCRIPTION_MAX} onChange={e => setDescription(e.target.value)} placeholder="What it does and why"
            className="block w-full border border-[hsl(var(--input))] bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <GhostButton testId="button-validate" disabled={!gameplay || !!busy || !allowed.includes(language) || !source.trim()} onClick={() => void commands.run({ type: "validate", language, source })}>
          <Wand2 size={14} /> {busy === "validate" ? "Checking" : "Validate (free)"}
        </GhostButton>
        <PrimaryButton testId="button-summon" disabled={!!busy || !(canSummon || canArm) || !name.trim()} onClick={() => {
          const agent = { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}), language, source };
          // Not payable yet: arm a one-shot that summons when the energy is there (the effect above fires it).
          if (!canSummon) { if (current) { setRefused(null); setArmed({ ...agent, cost: current.cost }); } return; }
          summon(agent);
        }}>
          <Sparkles size={14} /> {busy === "summon" ? "Summoning" : canArm ? "Summon as soon as I have the energy" : current ? `Summon · cost ${fmt(current.cost)}` : "Summon"}
        </PrimaryButton>
        {/* With no code view to go back to, Done goes to My agents (leaving edit mode alone would change nothing). */}
        <TextButton onClick={() => { runner.setEditing(false); if (onlyEditor) dock.show("agents"); }}>Done</TextButton>
      </div>
      {(busy === "validate" || busy === "summon") && <p data-testid="text-forge-progress" role="status" className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Loader2 size={14} className="shrink-0 animate-spin" />{progressLine(busy, retrying)}</p>}
      {summoned && !busy && <p data-testid="text-summoned" className="text-sm font-semibold text-[hsl(var(--accent))]">{summonedText(summoned, obs?.phase === "planning")}</p>}
      {refused && !busy && !armed && <p data-testid="text-armed-refused" className="text-sm font-semibold text-destructive">{refused.armed.name} was not summoned: {refused.message} <TextButton onClick={() => { const again = { ...refused.armed }; setRefused(null); setArmed(again); }}>Try again</TextButton></p>}
      {armed && <p data-testid="text-armed" className="text-sm font-semibold text-foreground">{armedText(armed, { energy: obs?.self.energy ?? 0, income: obs?.self.income, planning: obs?.phase === "planning" })} <TextButton onClick={() => setArmed(null)}>Cancel</TextButton></p>}
      {gameplay && !busy && !armed && !refused && !(canSummon && name.trim()) && source.trim() && (() => {
        // Too dear for now: say both numbers and when it will be payable, not only that it is.
        const short = current?.valid && name.trim() ? energyHint({ cost: current.cost, energy: obs?.self.energy ?? 0, income: obs?.self.income, planning: obs?.phase === "planning" }) : null;
        const needs = short ?? summonNeeds(!!current?.valid || (untouched && !current), !!name.trim(), !current || current.cost <= energy);
        return needs && <p data-testid="text-summon-needs" className="text-xs text-muted-foreground">{needs}</p>;
      })()}
      {notice && !(refused && !notice.ok) && <p data-testid="text-notice" className={`text-sm ${notice.ok ? "text-[hsl(var(--accent))]" : "text-destructive"}`}>
        {notice.text}
      </p>}
      {/* Still busy after every try: one button, the same command again (it can never apply twice). */}
      {failed && !busy && <GhostButton testId="button-try-again" onClick={() => void commands.retry(failed).then(result => { if (failed.command.type === "summon" && result?.accepted) setSummoned(failed.command.name); })}>Try again</GhostButton>}
      <textarea ref={editor} data-testid="input-source" value={source} onChange={e => runner.setDraft({ source: e.target.value })} maxLength={16384} spellCheck={false}
        aria-label="Agent source"
        placeholder={language === "python" ? `def agent(${arg}):\n    # return a list of moves, e.g. [swap(...)]\n    return []`
          : `function agent(${arg}) {\n  // return a list of moves, e.g. [swap(...)]\n  return [];\n}`}
        className="h-56 w-full resize-y border-l-4 border-[hsl(var(--input))] bg-secondary p-3 font-mono text-[13px] leading-relaxed text-secondary-foreground caret-[hsl(var(--primary))] outline-none focus:border-primary" />
      <p className="text-xs text-muted-foreground">Write <code>{language === "python" ? `def agent(${arg}):` : `function agent(${arg})`}</code>. It reads the {noun} and returns at most 16 moves from the room's helpers; each act costs ⚡ energy from the agent's own store.{costHint && <> <span data-testid="text-forge-change-cost">{costHint}</span></>}</p>
      {obs?.instance && <HelpersDrawer helpers={obs.instance.helpers} language={language} onInsert={insert} open={showHelpers} />}
      {!ended && sandbox.text && <p data-testid="text-forge-sandbox" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{sandbox.warming && <Loader2 size={12} className="animate-spin" />}{sandbox.text}</p>}
      {!can.validate.ok && !ended && !sandbox.text && !busy && <p data-testid="text-forge-off" className="text-xs font-semibold text-muted-foreground">{can.validate.reason}</p>}
      {ended && <p data-testid="text-forge-ended" className="text-xs font-semibold text-muted-foreground">No summons after the end: the game is over, so Validate and Summon are off. Your code stays here for the next game.</p>}
      <div data-testid="panel-validation" className="text-sm">
        {current ? (
          <div className={`border-l-4 py-1 pl-3 ${current.valid ? "border-[hsl(var(--accent))]" : "border-destructive"}`}>
            <p className="font-mono text-xs"><strong>{current.valid ? "VALID" : "INVALID"}</strong></p>
            <div className="mt-1"><AgentCost summonCost={current.cost} expectedActCost={current.expectedActCost} breakdown={current.breakdown as ActCostBreakdown | undefined}
              powerShare={newShare} income={newShare !== undefined ? newShare * (obs?.economy?.powerPerSecond ?? 0) : undefined} godEnergy={obs?.self.energy} /></div>
            {current.warnings?.length ? (
              // The examination's warnings (docs/rules-design.md §11): shown before the summon, which they never block.
              <div data-testid="text-validation-warnings" className="mt-1 space-y-0.5 text-xs">
                {current.expectedSuccessRate !== undefined && <p className="font-semibold text-destructive">About {Math.round(100 * current.expectedSuccessRate)}% of its acts would succeed.</p>}
                {current.warnings.map((w, i) => <p key={i} className="text-destructive">{w}</p>)}
              </div>
            ) : null}
            {current.diagnostics.length > 0
              ? <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">{current.diagnostics.map((d, i) => <li key={i} className="whitespace-pre-wrap break-words">{d}</li>)}</ul>
              : <p className="mt-1 font-mono text-xs text-muted-foreground">no diagnostics</p>}
          </div>
        ) : <p className="text-xs text-muted-foreground">{validation ? "The code changed since it was validated. Validate again." : untouched ? "This agent is ready to summon. Validate (free) shows what it costs first." : "Validate before summoning: it is free."}</p>}
      </div>
    </div>
  );
}
