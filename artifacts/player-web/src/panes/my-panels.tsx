/**
 * "Your panels": the human's stored panels (`panel.*`), across rooms. One row per panel (its title, version, who wrote
 * it, on or off) with Open as a pane, Edit, Roll back, Turn off or on and Delete; below, the editor, which saves TSX
 * through `panel.save` and shows the compiler's diagnostics when a save is refused. Operations only through affordances;
 * the list and the code are the viewer's live subscriptions.
 */
import { useEffect, useRef, useState } from "react";
import { storedPane } from "@workspace/v2-client";
import { useGame, useMyPanels, usePanelCode } from "@/sdk";
import { AffordanceButton } from "@/site/components/action";
import { usePaneOps } from "@/dock/open-pane";
import { authorText, diagnosticText, EXAMPLE_PANEL, rollbackTarget, saveOutcomeText, slugProblem, type SaveOutcome } from "./my-panels-model";

type Panel = NonNullable<ReturnType<typeof useMyPanels>>[number];

function PanelRow({ panel, onEdit, onOpen }: { panel: Panel; onEdit: () => void; onOpen: () => void }) {
  const back = rollbackTarget(panel.currentVersion);
  const t = `-${panel.slug}`;
  return (
    <li className="space-y-1.5 px-4 py-3" data-testid={`row-panel${t}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{panel.title} <span className="text-xs font-normal text-muted-foreground">{panel.slug}</span></span>
        <span className="text-xs text-muted-foreground" data-testid={`text-panel-version${t}`}>
          Version {panel.currentVersion}, {authorText(panel.author)}{panel.enabled ? "" : ", turned off"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {panel.enabled && <button type="button" className="border px-2 py-1 text-xs hover:bg-muted" onClick={onOpen} data-testid={`button-panel-open${t}`}>Open as a pane</button>}
        <button type="button" className="border px-2 py-1 text-xs hover:bg-muted" onClick={onEdit} data-testid={`button-panel-edit${t}`}>Edit</button>
        {back !== null && (
          <AffordanceButton id="panel.rollback" args={{ slug: panel.slug, version: back }} label={`Back to version ${back}`} busyLabel="Rolling back…"
            className="px-2 py-1 text-xs" testId={`button-panel-rollback${t}`} />
        )}
        <AffordanceButton id="panel.setEnabled" args={{ slug: panel.slug, enabled: !panel.enabled }} label={panel.enabled ? "Turn off" : "Turn on"}
          busyLabel="Saving…" className="px-2 py-1 text-xs" testId={`button-panel-toggle${t}`} />
        <AffordanceButton id="panel.remove" args={{ slug: panel.slug }} label="Delete" busyLabel="Deleting…" tone="danger" className="px-2 py-1 text-xs"
          testId={`button-panel-remove${t}`} confirmText={`Delete "${panel.title}" and every kept version? Saving the name ${panel.slug} again later makes a new panel.`} />
      </div>
    </li>
  );
}

function Editor({ editing, onSaved }: { editing: string | null; onSaved: (slug: string) => void }) {
  const code = usePanelCode(editing);
  const [slug, setSlug] = useState(editing ?? "my-stats");
  const [draft, setDraft] = useState<string | null>(editing ? null : EXAMPLE_PANEL);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  // The panel a save just made: the editor turns to it and keeps saying it was saved.
  const saved = useRef<string | null>(null);
  // Editing a stored panel starts from its current source, once it arrives.
  // After a save the editor keeps the text just saved (the live code catches up with it), and says it was saved.
  useEffect(() => {
    const kept = editing !== null && editing === saved.current;
    saved.current = null;
    if (kept) return;
    setSlug(editing ?? "my-stats");
    setDraft(editing ? null : EXAMPLE_PANEL);
    setOutcome(null);
  }, [editing]);
  const source = draft ?? code?.source ?? "";
  const problem = slugProblem(slug) ?? (source.trim() ? null : "Write the panel's code first.");
  return (
    <div className="space-y-2 border-t px-4 py-3" data-testid="panel-editor">
      <p className="font-medium">{editing ? `Edit ${editing}` : "Write a panel"}</p>
      <p className="text-xs text-muted-foreground">
        A panel is a React component that reads the game with the panel SDK: import from "@sdk" (useGame, useMe, useMyRule, useLeaderboard,
        useMoves and more) and from "react", and end with export default definePanel(…).
      </p>
      <label className="block text-xs">
        <span className="text-muted-foreground">Name</span>
        <input value={slug} onChange={e => { setSlug(e.target.value.trim()); setOutcome(null); }} disabled={!!editing} spellCheck={false}
          className="mt-0.5 block w-full border bg-background px-2 py-1 font-mono text-sm" data-testid="input-panel-slug" />
      </label>
      <textarea value={source} onChange={e => { setDraft(e.target.value); setOutcome(null); }} spellCheck={false} aria-label="Panel code"
        className="block h-48 w-full resize-y border bg-background p-2 font-mono text-xs md:h-64" data-testid="input-panel-source" />
      <div className="flex flex-wrap items-center gap-2">
        <AffordanceButton id="panel.save" args={() => ({ slug, source })} label="Save panel" busyLabel="Saving…" tone="primary" testId="button-panel-save"
          disabledReason={problem} showReason confirmText={`Save this code as the next version of ${slug}? It runs in every copy of the app you use.`}
          onDone={r => { setOutcome(r); if (r.saved) { if (editing !== r.slug) saved.current = r.slug; setDraft(source); onSaved(r.slug); } }} />
        {outcome && <span className={`text-sm ${outcome.saved ? "" : "text-destructive"}`} role="status" data-testid="text-panel-saved">{saveOutcomeText(outcome)}</span>}
      </div>
      {outcome && !outcome.saved && (
        <ul className="space-y-0.5 text-xs text-destructive" data-testid="list-panel-diagnostics">
          {outcome.diagnostics.map((d, i) => <li key={i} className="font-mono" data-testid="row-panel-diagnostic">{diagnosticText(d)}</li>)}
        </ul>
      )}
    </div>
  );
}

export function MyPanelsPane() {
  const panels = useMyPanels();
  const phase = useGame()?.phase ?? "planning";
  const ops = usePaneOps(phase);
  const [editing, setEditing] = useState<string | null>(null);
  // A deleted panel leaves the editor (one just saved may not be listed yet: only a panel that was listed and went).
  const listed = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!panels) return;
    const now = new Set(panels.map(p => p.slug));
    if (editing && listed.current.has(editing) && !now.has(editing)) setEditing(null);
    listed.current = now;
  }, [panels, editing]);
  return (
    <div className="text-sm" data-testid="my-panels">
      <p className="px-4 py-3 text-muted-foreground">Panels you or your assistant wrote. They follow you to every game.</p>
      {panels && panels.length === 0 && <p className="px-4 pb-3 text-muted-foreground" data-testid="my-panels-empty">You have no panels yet. Write one below.</p>}
      <ul className="divide-y border-t">{(panels ?? []).map(p => (
        <PanelRow key={p.slug} panel={p} onEdit={() => setEditing(p.slug)} onOpen={() => void ops.open(storedPane(p.slug), p.placement)} />
      ))}</ul>
      {editing && <div className="px-4 pt-2"><button type="button" className="text-xs underline underline-offset-4" onClick={() => setEditing(null)} data-testid="button-panel-new">Write a new panel instead</button></div>}
      <Editor editing={editing} onSaved={slug => setEditing(slug)} />
    </div>
  );
}
