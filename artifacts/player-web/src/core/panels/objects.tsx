/**
 * Objects by payoff, the default panel: the world's objects ranked by what they pay you. Each row: the rank, the object
 * (marked with what makes up your score, by default), a payoff rectangle (width: your bits, height: what the others
 * care, so the area is the payoff; one scale for every row), `yours × others = payoff`, the relative payoff bar, and
 * "why?" for the full breakdown. Before the world runs, the empty state says what will appear and offers the one next
 * step. The assistant chooses the sort, the filter, how many, which to highlight, list or grid, and whether to mark.
 */
import { useMemo, useState } from "react";
import { AnnotationLegend, ScoreBreakdown, annotationLegend, mergeAnnotations, type Annotation } from "@workspace/object-views";
import { ObjectGrid, ObjectView, formatBits, useAnnotations, useMyCard, useObjectContext, useObjects, type LiveObject } from "@/sdk";
import { useNow } from "@/core/game/situation";
import { PanelEmpty, PrimaryButton, TextButton, referObject, useObjectRanks, type PanelProps } from "./kit";
import { payoffRect, payoffScale, type PayoffScale } from "./payoff-geometry";
import { useNextStep } from "./use-next-step";

const FILTERS: Record<string, (o: LiveObject) => boolean> = {
  all: () => true,
  positive: o => o.payoff > 0,
  contested: o => o.own.netBits > 0 && o.peerCare > 0,
  chips: o => o.peerCare > 0 && o.own.netBits <= 0,
};
const SORTS: Record<string, (o: LiveObject) => number> = { payoff: o => o.payoff, mine: o => o.own.netBits, othersCare: o => o.peerCare };
export const PAYOFF_CAPTION = "width: your bits · height: what the others care · area: your payoff";
const BOX = { width: 84, height: 26 };
const NO_MARKS: readonly Annotation[] = [];

/** The payoff rectangle of one row (geometry in ./payoff-geometry.ts). */
function PayoffRectangle({ o, scale }: { o: LiveObject; scale: PayoffScale }) {
  const g = payoffRect({ own: o.own.netBits, care: o.peerCare }, scale, BOX);
  const w = Math.max(g.width, g.kind === "none" ? 0 : 1);
  const title = `your bits ${formatBits(o.own.netBits)} × others' care ${formatBits(o.peerCare)} = payoff ${formatBits(o.payoff)}`;
  return (
    <svg width={BOX.width + 2} height={BOX.height + 2} viewBox={`-1 -1 ${BOX.width + 2} ${BOX.height + 2}`} className="shrink-0 overflow-visible"
      role="img" aria-label={title} data-testid={`payoff-rect-${o.id}`} data-kind={g.kind}>
      <title>{title}</title>
      <line x1={0} x2={BOX.width} y1={BOX.height} y2={BOX.height} stroke="hsl(var(--card-border, var(--border)))" strokeWidth={1} />
      {scale.maxLoss > 0 && <line x1={g.axis} x2={g.axis} y1={0} y2={BOX.height} stroke="hsl(var(--muted-foreground) / 0.5)" strokeWidth={1} />}
      {g.kind === "gain" && <rect x={g.x} y={g.y} width={w} height={g.height} fill="hsl(var(--accent) / 0.55)" stroke="hsl(var(--accent))" strokeWidth={1} />}
      {g.kind === "loss" && (g.height > 0
        ? <rect x={g.x} y={g.y} width={w} height={g.height} fill="none" stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeDasharray="3 2" />
        : <line x1={g.x} x2={g.x + w} y1={BOX.height - 1} y2={BOX.height - 1} stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="3 2" />)}
      {g.kind === "flat" && <line x1={g.x} x2={g.x + w} y1={BOX.height - 1} y2={BOX.height - 1} stroke="hsl(var(--accent))" strokeWidth={2} />}
    </svg>
  );
}

/** Before the world runs (the default panel in the lobby and during planning): what will appear here, and the next step. */
function BeforeTheWorld({ paneId, phase, noun }: Pick<PanelProps<"objects">, "paneId" | "phase"> & { noun: string }) {
  const { step, go, situation } = useNextStep(paneId, phase);
  const now = useNow();
  const until = situation.obs?.planningEndsAt;
  const left = phase === "planning" && until && until > now ? Math.ceil((until - now) / 1000) : null;
  const when = phase === "lobby" ? "When the game starts and the world runs" : `When the world starts${left ? ` (in ${left} s)` : ""}`;
  return (
    <PanelEmpty testId="panel-empty-objects" action={<PrimaryButton onClick={go} testId="button-next-step">{step.label}</PrimaryButton>}>
      {when}, its {noun}s appear here, best first: each one marked with what makes up your score, and a rectangle whose width is
      your bits and whose height is what the others care, so its area is your payoff. Next: {step.why}
    </PanelEmpty>
  );
}

export default function Objects({ paneId, params, phase }: PanelProps<"objects">) {
  const objects = useObjects({ hz: 1 });
  const card = useMyCard();
  const { ctx, noun } = useObjectContext();
  const ranks = useObjectRanks(objects);
  const [open, setOpen] = useState<string | null>(null);
  const comparative = card?.penalty?.comparative;
  const shown = useMemo(() => objects.filter(FILTERS[params.filter] ?? FILTERS.all).sort((a, b) => SORTS[params.sortBy](b) - SORTS[params.sortBy](a)).slice(0, params.limit),
    [objects, params.filter, params.sortBy, params.limit]);
  const marks = useAnnotations(shown, { utility: params.annotate });
  const legend = useMemo(() => annotationLegend(mergeAnnotations(...shown.map(o => marks.get(o.id)))), [shown, marks]);
  const scale = useMemo(() => payoffScale(shown.map(o => ({ own: o.own.netBits, care: o.peerCare }))), [shown]);
  const max = Math.max(1e-9, ...shown.map(o => Math.abs(o.payoff)));
  const highlight = new Set(params.highlight);
  const sum = (f: (o: LiveObject) => number) => objects.reduce((s, o) => s + f(o), 0);

  if (!objects.length && (phase === "lobby" || phase === "planning")) return <BeforeTheWorld paneId={paneId} phase={phase} noun={noun} />;
  if (!objects.length) return <PanelEmpty testId="panel-empty-objects">The world holds no {noun}s yet. They spawn once the world starts running.</PanelEmpty>;
  if (!shown.length) return <PanelEmpty>No {noun} matches this view right now ({objects.length} in the world).</PanelEmpty>;
  const header = (
    <header className="space-y-1">
      <p className="font-mono text-[11px] text-muted-foreground" data-testid="text-payoff-caption">{PAYOFF_CAPTION}</p>
      <AnnotationLegend entries={legend} className="text-muted-foreground" testId="objects-annotation-legend" />
    </header>
  );
  if (params.layout === "grid") {
    return (
      <div className="space-y-3">
        {header}
        <ObjectGrid objects={shown} max={params.limit} annotations={(o: LiveObject) => marks.get(o.id)}
          badge={(o: LiveObject) => `#${ranks.get(o.id)} · ${formatBits(o.payoff)}`} onSelect={id => referObject(ranks.get(id))} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {header}
      <ol className="divide-y divide-[hsl(var(--card-border))]">
        {shown.map(o => (
          <li key={o.id} data-testid={`row-object-${o.id}`} className={`min-w-0 py-2 ${highlight.has(o.id) ? "bg-[hsl(var(--primary)/0.06)]" : ""}`}>
            <div className="flex min-w-0 items-start gap-3">
              <button type="button" onClick={() => referObject(ranks.get(o.id))} title="Ask your assistant about this object"
                className="w-7 shrink-0 pt-0.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground">#{ranks.get(o.id)}</button>
              <span className="max-w-[40%] shrink-0 truncate font-mono text-xs"><ObjectView value={o.value} {...ctx} showTitle annotations={marks.get(o.id) ?? NO_MARKS} /></span>
              <PayoffRectangle o={o} scale={scale} />
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
