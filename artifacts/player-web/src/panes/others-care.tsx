/**
 * What others care about (integration plan §1.6): every line as a dot, across your bits, up how much the others
 * want it, from the viewer's digest written by the tick (`v2/play:digest`, one document). You never see another
 * player's rule, only the others' total want, so the corners say who cares: both of you (your points), only the others
 * (worth offering in a deal), only you (no points until they want it too), nobody yet.
 */
import { useMemo } from "react";
import { objectWord, useDigest, useGame, useGameScope, useOthersBlurred, useRuleCandidates } from "@/sdk";
import { blurredNote } from "@/core/words";
import { CareScatter, slotColour } from "@/components/charts";
import { CARE_KINDS, careCounts, carePoints } from "./chart-model";

export function OthersCarePane() {
  const { seated } = useGameScope();
  const digest = useDigest();
  const blurred = useOthersBlurred();
  const w = objectWord(useGame()?.variant);
  const points = useMemo(() => carePoints(digest?.packed), [digest?.packed]);
  if (!seated) return <div className="space-y-3 p-3"><p className="text-sm text-muted-foreground" data-testid="others-care-spectator">You are watching, so there are no {w.many} of your own to show here.</p><PossibleGods /></div>;
  if (digest === undefined) return <p className="p-4 text-sm text-muted-foreground">Loading your {w.many}…</p>;
  if (!points.length) return <p className="p-4 text-sm text-muted-foreground" data-testid="others-care-empty">Once the world runs, every {w.one} shows here as a dot: how rare it is by your rule, and how much the others want it.</p>;
  const counts = careCounts(points);
  return (
    <div className="space-y-3 p-3 text-sm" data-testid="others-care">
      <p className="text-xs text-muted-foreground">
        How much the others want a {w.one} is their bits for it, added up (others' bits). You never see their rules, only that total: it shows what they care about.{blurred ? ` ${blurredNote(w.one)}` : ""}
      </p>
      <CareScatter points={points} word={w} approx={blurred} />
      <ul className="space-y-1 text-xs" data-testid="others-care-counts">
        {CARE_KINDS.map(k => (
          <li key={k.kind} className="flex items-center gap-2" data-testid={`care-count-${k.kind}`}>
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: slotColour(k.slot) }} />
            <span className="flex-1">{k.label}</span>
            <span className="tabular-nums">{counts[k.kind]} {counts[k.kind] === 1 ? w.one : w.many}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Your points from a {w.one} are the two multiplied, so dots high and to the right earn the most. A bigger dot is several {w.many} on one spot.</p>
      <PossibleGods />
    </div>
  );
}

/** v1's "Possible gods": every rule anyone in this game could hold (v2/play:candidates), never who holds which. */
function PossibleGods() {
  const rules = useRuleCandidates();
  const w = objectWord(useGame()?.variant);
  if (!rules?.length) return null;
  const families = [...new Set(rules.map(r => r.title))];
  return (
    <details className="text-xs" data-testid="possible-gods">
      <summary className="cursor-pointer font-medium text-foreground">Rules anyone here could hold ({rules.length})</summary>
      <p className="mt-1 text-muted-foreground">Every other player holds one of these, dealt at random from {families.length} kinds; nothing says who holds which. Compare them with the {w.many} the others want above to guess what they care about.</p>
      <ul className="mt-1 space-y-1.5" data-testid="list-possible-gods">
        {rules.map((r, i) => <li key={i} data-testid="row-possible-god"><span className="font-medium">{r.title}.</span> {r.card}</li>)}
      </ul>
    </details>
  );
}
