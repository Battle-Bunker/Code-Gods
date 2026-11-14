/**
 * One line (the `object` pane): the line in the human's focus (`view.focus`, set by Lines, the palette or an
 * assistant) on the expanded face, every representation the rule reads, the parts, the worked computation, the ladder
 * and the nearest improvement. The switcher and the comparison are the human's view state (`view.showRepresentation`,
 * `view.compareRepresentations`), so an assistant can switch them for them; "Draw every line in Lines this way" pins the
 * representation for the rule's family (`view.pinRepresentation`).
 */
import { useMemo } from "react";
import { pinnedRep } from "@workspace/v2-affordances";
import { useAffordance } from "@workspace/v2-affordances/react";
import { ExpandedFace, moves as candidatesOf, ObjectChip, proposalText, shortTitle, type Move } from "@workspace/v2-views";
import { representation } from "@workspace/v2-core";
import { decodeState, objectTypeOf, objectWord, useGame, useGameScope, useMoves, useMyAgents, useMyObject, useMyRule, useOthersAt } from "@/sdk";
import { contestedLines, foldTugs } from "./tug-of-war";
import { useReplaying, useView } from "@/core/affordance-runtime";
import { useOpenPane } from "@/dock/open-pane";
import { bitsText, pointsText } from "@/core/words";
import { BitsHelp } from "@/core/score-help";
import { toast } from "@/hooks/use-toast";
import { activeOp, compareOp, switcherOf, whyLine, type SwitchOp } from "./lines";
import { requestForge } from "./forge-request";
import { targetOf } from "./hold";
import { requestChat } from "./chat-draft";

/** How many candidates the face lists when it shows the others' totals at them (the server reads at most four). */
const CANDIDATES = 4;

const failed = (title: string) => (e: unknown) => toast({ title, description: e instanceof Error ? e.message : String(e), variant: "destructive" });

function FocusedLine({ objectId, reps }: { objectId: string; reps: readonly string[] }) {
  const { seated } = useGameScope();
  const view = useView();
  const o = useMyObject(objectId);
  const my = useMyRule();
  // A contested line (a tug-of-war in the act log) offers "Hold it here" first: the shared act-log subscription, folded.
  const moves = useMoves();
  const agents = useMyAgents();
  const contested = useMemo(() => contestedLines(foldTugs(moves.results)).has(objectId), [moves.results, objectId]);
  const show = useAffordance("view.showRepresentation");
  const compare = useAffordance("view.compareRepresentations");
  const pin = useAffordance("view.pinRepresentation");
  const header = useGame();
  const replaying = useReplaying();
  const openPane = useOpenPane(replaying ? "replay" : header?.phase ?? "live");
  const state = useMemo(() => (o ? decodeState(o.state, header?.variant) : null), [o?.state, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const word = objectWord(header?.variant);
  // The candidates, and the others' total bits at each (one live read for the object's few candidate states).
  const rule0 = seated ? my?.rule ?? null : null, value0 = my?.bits ?? undefined;
  const candidates = useMemo(() => (rule0 && state ? candidatesOf(rule0, state, value0, { k: CANDIDATES }) : []), [rule0, state, value0]);
  const calls = useMemo(() => candidates.map(m => m.call as { mutator: string; site: number; args: Record<string, string> }), [candidates]);
  // After the end too (the state is frozen): what each candidate would have earned. Proposing and holding are live only.
  const others = useOthersAt(replaying ? null : objectId, calls);
  if (!o || !state) return <p className="p-4 text-sm text-muted-foreground">Loading this {word.one}…</p>;
  const rule = my?.rule ?? null;
  if (!seated || !rule) {
    return (
      <div className="space-y-2 p-4 text-sm" data-testid="line-expanded">
        <p className="font-semibold">{word.One} {o.number}: <ObjectChip type={objectTypeOf(header?.variant)} state={state} /></p>
        <p className="text-muted-foreground">{seated ? "This version of the app cannot draw your rule yet: reload the page to update it." : `You hold no rule in this game, so there is no score to explain on this ${word.one}.`}</p>
      </div>
    );
  }
  const primary = my!.row.primary;
  const { active, compare: compared } = switcherOf(reps, primary);
  const run = (op: SwitchOp) => (op.id === "view.showRepresentation" ? show.run(op.args) : compare.run(op.args)).catch(failed("The view did not change"));
  const pinned = pinnedRep(view, rule.family.id, primary);
  const v = o.value;
  // "Hold it here" sets the agent up with this line's hold, filled in, as the button under the face does.
  const holdTarget = targetOf(state, rule.type.id);
  const holdAction = (agents?.length ?? 0) > 0 && !replaying && header?.phase !== "ended" && holdTarget !== null
    ? () => void requestForge({ kind: "hold", numbers: [o.number], target: holdTarget }, openPane)
    : undefined;
  const live = (agents?.length ?? 0) > 0 && !replaying && header?.phase !== "ended";
  const othersAt = others && v ? { now: v.want, at: (after: unknown) => others.get(rule.type.encode(after)) ?? null } : undefined;
  const propose = othersAt && !replaying && header?.phase !== "ended"
    ? (m: Move<unknown>) => void requestChat(proposalText(rule.type, o.number, m.after, m.bits ?? 0, othersAt.at(m.after) ?? 0), openPane)
    : undefined;
  const holdMove = live
    ? (m: Move<unknown>) => { const t = targetOf(m.after, rule.type.id); if (t !== null) void requestForge({ kind: "hold", numbers: [o.number], target: t }, openPane); }
    : undefined;
  const holdable = (m: Move<unknown>) => targetOf(m.after, rule.type.id) !== null;
  return (
    <div className="space-y-3 p-3" data-testid="line-expanded" data-line={o.number}>
      <div className="space-y-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{word.One} {o.number}</span>
          {v && <span data-testid="text-line-points">{bitsText(v.rarityBits)} · <b>{pointsText(v.points)}</b></span>}
          {v && <BitsHelp testId="button-bits-help-line" />}
        </p>
        {v && <p className="text-xs text-muted-foreground" data-testid="text-line-formula">{whyLine({ rarity: v.rarityBits, want: v.want }, {})}</p>}
      </div>
      {/* "Hold it here" on a contested line sets the agent up, as the button below does. */}
      <ExpandedFace rule={rule} state={state} value={my!.bits ?? undefined} active={active} compare={compared}
        moves={candidates} others={othersAt} onPropose={propose} onHoldMove={holdMove} holdable={holdable} hold={contested ? { number: o.number, language: agents?.[0]?.language === "python" ? "python" : "typescript", ...(holdAction ? { onHold: holdAction } : {}) } : undefined}
        onActive={rep => void run(activeOp(objectId, rep, compared))} onCompare={rep => void run(compareOp(objectId, active, rep))} />
      <button type="button" className="mr-4 text-xs underline underline-offset-4" data-testid="button-open-what-if" onClick={() => void openPane("what-if")}>
        Try a change on this {word.one}
      </button>
      {/* A deal, one press from the line it is about: the forge opens with its control filled in, to read and save. */}
      {(agents?.length ?? 0) > 0 && !replaying && header?.phase !== "ended" && (() => {
        const target = targetOf(state, rule.type.id);
        return (<>
          {target !== null && <button type="button" className="mr-4 text-xs underline underline-offset-4" data-testid="button-hold-here"
            onClick={() => void requestForge({ kind: "hold", numbers: [o.number], target }, openPane)}>Hold this {word.one} here</button>}
          <button type="button" className="mr-4 text-xs underline underline-offset-4" data-testid="button-leave-here"
            onClick={() => void requestForge({ kind: "leave", numbers: [o.number] }, openPane)}>Leave this {word.one} alone</button>
        </>);
      })()}
      {pinned !== active && pin.available && (
        <button type="button" className="text-xs underline underline-offset-4" data-testid="button-pin-representation"
          onClick={() => void pin.run({ rep: active, family: rule.family.id }).catch(failed(`${word.Many} did not change`))}>
          Draw every {word.one} in {word.Many} this way ({shortTitle(representation(rule.type, active).title)})
        </button>
      )}
    </div>
  );
}

export function LinePane() {
  const focus = useView().focus;
  const word = objectWord(useGame()?.variant);
  if (!focus) return <p className="p-4 text-sm text-muted-foreground" data-testid="line-empty">Pick a {word.one} in {word.Many} to see it here.</p>;
  return <FocusedLine key={focus.objectId} objectId={focus.objectId} reps={focus.reps} />;
}
