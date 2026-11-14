/**
 * What others care about (integration plan §1.6): every line as a dot, across your ✨ rarity, up how much the others
 * want it, from the viewer's digest written by the tick (`v2/play:digest`, one document). You never see another
 * player's rule, only the others' total want, so the corners say who cares: both of you (your points), only the others
 * (worth offering in a deal), only you (no points until they want it too), nobody yet.
 */
import { useMemo } from "react";
import { useDigest, useGameScope } from "@/sdk";
import { CareScatter, slotColour } from "@/components/charts";
import { CARE_KINDS, careCounts, carePoints } from "./chart-model";

export function OthersCarePane() {
  const { seated } = useGameScope();
  const digest = useDigest();
  const points = useMemo(() => carePoints(digest?.packed), [digest?.packed]);
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="others-care-spectator">You are watching: this shows a player's own lines, so it is empty for a spectator.</p>;
  if (digest === undefined) return <p className="p-4 text-sm text-muted-foreground">Loading your lines…</p>;
  if (!points.length) return <p className="p-4 text-sm text-muted-foreground" data-testid="others-care-empty">Once the world runs, every line shows here as a dot: how rare it is by your rule, and how much the others want it.</p>;
  const counts = careCounts(points);
  return (
    <div className="space-y-3 p-3 text-sm" data-testid="others-care">
      <p className="text-xs text-muted-foreground">
        How much the others want a line is their ✨ rarities for it, added up. You never see their rules, only that total: it shows what they care about.
      </p>
      <CareScatter points={points} />
      <ul className="space-y-1 text-xs" data-testid="others-care-counts">
        {CARE_KINDS.map(k => (
          <li key={k.kind} className="flex items-center gap-2" data-testid={`care-count-${k.kind}`}>
            <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: slotColour(k.slot) }} />
            <span className="flex-1">{k.label}</span>
            <span className="tabular-nums">{counts[k.kind]} {counts[k.kind] === 1 ? "line" : "lines"}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Your points from a line are the two multiplied, so dots high and to the right earn the most. A bigger dot is several lines on one spot.</p>
    </div>
  );
}
