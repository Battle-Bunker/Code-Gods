/**
 * Objects by payoff: which things in the world earn you points. A ranked list: the object, `yours × others = payoff`
 * and a bar; "why?" opens the full score breakdown. The assistant chooses the sort, the filter, how many, which to
 * highlight and list or grid.
 */
import { useMemo, useState } from "react";
import { ScoreBreakdown } from "@workspace/object-views";
import { ObjectGrid, ObjectView, formatBits, useMyCard, useObjectContext, useObjects, type LiveObject } from "@/sdk";
import { LensEmpty, TextButton, referObject, useObjectRanks, type LensProps } from "./kit";

const FILTERS: Record<string, (o: LiveObject) => boolean> = {
  all: () => true,
  positive: o => o.payoff > 0,
  contested: o => o.own.netBits > 0 && o.peerCare > 0,
  chips: o => o.peerCare > 0 && o.own.netBits <= 0,
};
const SORTS: Record<string, (o: LiveObject) => number> = { payoff: o => o.payoff, mine: o => o.own.netBits, othersCare: o => o.peerCare };

export default function Objects({ params }: LensProps<"objects">) {
  const objects = useObjects({ hz: 1 });
  const card = useMyCard();
  const { ctx, noun } = useObjectContext();
  const ranks = useObjectRanks(objects);
  const [open, setOpen] = useState<string | null>(null);
  const comparative = card?.penalty?.comparative;
  const shown = useMemo(() => objects.filter(FILTERS[params.filter] ?? FILTERS.all).sort((a, b) => SORTS[params.sortBy](b) - SORTS[params.sortBy](a)).slice(0, params.limit),
    [objects, params.filter, params.sortBy, params.limit]);
  const max = Math.max(1e-9, ...shown.map(o => Math.abs(o.payoff)));
  const highlight = new Set(params.highlight);
  const sum = (f: (o: LiveObject) => number) => objects.reduce((s, o) => s + f(o), 0);

  if (!objects.length) return <LensEmpty>The world holds no {noun}s yet. They spawn once the world starts running.</LensEmpty>;
  if (!shown.length) return <LensEmpty>No {noun} matches this view right now ({objects.length} in the world).</LensEmpty>;
  if (params.layout === "grid") {
    return <ObjectGrid objects={shown} max={params.limit} badge={(o: LiveObject) => `#${ranks.get(o.id)} · ${formatBits(o.payoff)}`} onSelect={id => referObject(ranks.get(id))} />;
  }
  return (
    <div className="space-y-4">
      <ol className="divide-y divide-[hsl(var(--card-border))]">
        {shown.map(o => (
          <li key={o.id} data-testid={`row-object-${o.id}`} className={`min-w-0 py-2 ${highlight.has(o.id) ? "bg-[hsl(var(--primary)/0.06)]" : ""}`}>
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" onClick={() => referObject(ranks.get(o.id))} title="Ask your assistant about this object"
                className="w-7 shrink-0 pt-0.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground">#{ranks.get(o.id)}</button>
              <span className="max-w-[40%] shrink-0 truncate font-mono text-xs"><ObjectView value={o.value} {...ctx} showTitle /></span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-mono text-[12px] text-muted-foreground">
                  yours {formatBits(o.own.netBits)} × others {formatBits(o.peerCare)} = <b className={o.payoff > 0 ? "text-[hsl(var(--accent))]" : o.payoff < 0 ? "text-destructive" : ""}>{formatBits(o.payoff)}</b>
                </span>
                <span className="relative block h-1.5 bg-muted" aria-hidden>
                  <span className={`absolute inset-y-0 left-0 ${o.payoff < 0 ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${(100 * Math.abs(o.payoff)) / max}%` }} />
                </span>
                <span className="block" data-testid={`text-rarity-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} compact /></span>
                <TextButton onClick={() => setOpen(open === o.id ? null : o.id)} testId={`button-object-detail-${o.id}`}>{open === o.id ? "hide" : "why?"}</TextButton>
              </span>
            </div>
            {open === o.id && <div className="ml-10 mt-2 border-l-2 border-[hsl(var(--card-border))] pl-3" data-testid={`object-detail-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} /></div>}
          </li>
        ))}
      </ol>
      <p className="font-mono text-[11px] text-muted-foreground">
        {shown.length} of {objects.length} · Σ your net bits {formatBits(sum(o => o.own.netBits))} · Σ others' {formatBits(sum(o => o.peerNetBits))}
      </p>
    </div>
  );
}
