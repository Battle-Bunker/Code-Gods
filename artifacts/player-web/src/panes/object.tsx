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
import { ExpandedFace, ObjectChip, shortTitle } from "@workspace/v2-views";
import { lineType } from "@workspace/v2-linear";
import { representation } from "@workspace/v2-core";
import { decodeState, useGameScope, useMyObject, useMyRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { pointsText, rarityText } from "@/core/words";
import { toast } from "@/hooks/use-toast";
import { activeOp, compareOp, switcherOf, whyLine, type SwitchOp } from "./lines";

const failed = (title: string) => (e: unknown) => toast({ title, description: e instanceof Error ? e.message : String(e), variant: "destructive" });

function FocusedLine({ objectId, reps }: { objectId: string; reps: readonly string[] }) {
  const { seated } = useGameScope();
  const view = useView();
  const o = useMyObject(objectId);
  const my = useMyRule();
  const show = useAffordance("view.showRepresentation");
  const compare = useAffordance("view.compareRepresentations");
  const pin = useAffordance("view.pinRepresentation");
  const state = useMemo(() => (o ? decodeState(o.state) : null), [o?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!o || !state) return <p className="p-4 text-sm text-muted-foreground">Loading this line…</p>;
  const rule = my?.rule ?? null;
  if (!seated || !rule) {
    return (
      <div className="space-y-2 p-4 text-sm" data-testid="line-expanded">
        <p className="font-semibold">Line {o.number}: <ObjectChip type={lineType} state={state} /></p>
        <p className="text-muted-foreground">{seated ? "This version of the app cannot draw your rule yet: reload the page to update it." : "You hold no rule in this game, so there is no score to explain on this line."}</p>
      </div>
    );
  }
  const primary = my!.row.primary;
  const { active, compare: compared } = switcherOf(reps, primary);
  const run = (op: SwitchOp) => (op.id === "view.showRepresentation" ? show.run(op.args) : compare.run(op.args)).catch(failed("The view did not change"));
  const pinned = pinnedRep(view, rule.family.id, primary);
  const v = o.value;
  return (
    <div className="space-y-3 p-3" data-testid="line-expanded" data-line={o.number}>
      <div className="space-y-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">Line {o.number}</span>
          {v && <span data-testid="text-line-points">{rarityText(v.rarityBits)} · <b>{pointsText(v.points)}</b></span>}
        </p>
        {v && <p className="text-xs text-muted-foreground">{whyLine({ rarity: v.rarityBits, want: v.want, points: v.points }, {})}</p>}
      </div>
      <ExpandedFace rule={rule} state={state} rarities={my!.rarities} active={active} compare={compared}
        onActive={rep => void run(activeOp(objectId, rep, compared))} onCompare={rep => void run(compareOp(objectId, active, rep))} />
      {pinned !== active && pin.available && (
        <button type="button" className="text-xs underline underline-offset-4" data-testid="button-pin-representation"
          onClick={() => void pin.run({ rep: active, family: rule.family.id }).catch(failed("Lines did not change"))}>
          Draw every line in Lines this way ({shortTitle(representation(rule.type, active).title)})
        </button>
      )}
    </div>
  );
}

export function LinePane() {
  const focus = useView().focus;
  if (!focus) return <p className="p-4 text-sm text-muted-foreground" data-testid="line-empty">Pick a line in Lines to see it here.</p>;
  return <FocusedLine key={focus.objectId} objectId={focus.objectId} reps={focus.reps} />;
}
