/**
 * Objects by payoff, the default panel: the world's objects ranked by what they pay you. Each row: the rank, the object
 * (marked with what makes up your score, by default, as quiet underlines), a payoff rectangle drawn to scale (width:
 * your bits, height: what the others care, on one scale, so equal values make a square and the area is the payoff),
 * its two values labelled on their edges, `yours × others = payoff`, the relative payoff bar, and "why?" for the full
 * breakdown. Colour coding, the same in every panel: "yours" petrol blue, "others" raspberry (lib/object-views
 * dimensions.ts); the rectangle's fill and the bar run one amber ramp from muted to strong by the payoff relative to
 * the best shown. Before the world runs, the empty state says what will appear and offers the one next
 * step. The assistant chooses the sort, the filter, how many, which to highlight, list or grid, and whether to mark.
 */
import { useMemo, useState } from "react";
import {
  AnnotationLegend, ScoreBreakdown, SCORE_RAMP, annotationLegend, dimensionVar, mergeAnnotations, rampVar, relativeStrength, type Annotation,
} from "@workspace/object-views";
import { ObjectGrid, ObjectView, formatBits, useAnnotations, useMyCard, useObjectContext, useObjects, type LiveObject } from "@/sdk";
import { useNow } from "@/core/game/situation";
import { PanelEmpty, PrimaryButton, TextButton, referObject, useObjectRanks, type PanelProps } from "./kit";
import { payoffLabels, payoffRect, payoffScale, type PayoffScale } from "./payoff-geometry";
import { useNextStep } from "./use-next-step";

const FILTERS: Record<string, (o: LiveObject) => boolean> = {
  all: () => true,
  positive: o => o.payoff > 0,
  contested: o => o.own.netBits > 0 && o.peerCare > 0,
  chips: o => o.peerCare > 0 && o.own.netBits <= 0,
};
const SORTS: Record<string, (o: LiveObject) => number> = { payoff: o => o.payoff, mine: o => o.own.netBits, othersCare: o => o.peerCare };
export const PAYOFF_CAPTION = "width: your bits · height: what the others care · area: your payoff";
/** The rectangle's box: the side the largest value fills, and room for the two edge labels. */
const SIDE = 44, LABEL_W = 30, LABEL_H = 13;
const NO_MARKS: readonly Annotation[] = [];
const YOURS = dimensionVar("yours"), OTHERS = dimensionVar("others");

/** The payoff rectangle of one row, to scale (geometry in ./payoff-geometry.ts), its edges and labels in the dimensions' colours. */
function PayoffRectangle({ o, scale, strength }: { o: LiveObject; scale: PayoffScale; strength: number }) {
  const g = payoffRect({ own: o.own.netBits, care: o.peerCare }, scale, SIDE);
  const at = payoffLabels(g, SIDE, { gap: 3, below: 11, halfLabel: 10 });
  const title = `your bits ${formatBits(o.own.netBits)} × others' care ${formatBits(o.peerCare)} = payoff ${formatBits(o.payoff)}`;
  const top = SIDE - g.height;
  return (
    <svg width={SIDE + LABEL_W} height={SIDE + LABEL_H} viewBox={`0 0 ${SIDE + LABEL_W} ${SIDE + LABEL_H}`} className="shrink-0 overflow-visible"
      role="img" aria-label={title} data-testid={`payoff-rect-${o.id}`} data-kind={g.kind} data-width={g.width.toFixed(2)} data-height={g.height.toFixed(2)}>
      <title>{title}</title>
      {g.kind === "gain" && <rect x={0} y={top} width={g.width} height={g.height} style={{ fill: rampVar(strength) }} data-testid="payoff-fill" />}
      {g.kind === "loss" && <rect x={0.75} y={top + 0.75} width={Math.max(0, g.width - 1.5)} height={Math.max(0, g.height - 1.5)} fill="none"
        stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeDasharray="3 2" />}
      {/* The two dimensions' edges: the bottom (width: your bits) and the right (height: what the others care). */}
      {g.width > 0 && <line x1={0} x2={g.width} y1={SIDE - 1} y2={SIDE - 1} style={{ stroke: YOURS }} strokeWidth={2} />}
      {g.height > 0 && <line x1={Math.max(1, g.width - 1)} x2={Math.max(1, g.width - 1)} y1={top} y2={SIDE} style={{ stroke: OTHERS }} strokeWidth={2} />}
      <text x={at.width.x} y={at.width.y} textAnchor="middle" className="font-mono text-[10px] tabular-nums" style={{ fill: YOURS }} data-testid="payoff-label-yours">{formatBits(o.own.netBits)}</text>
      <text x={at.height.x} y={at.height.y} dominantBaseline="middle" className="font-mono text-[10px] tabular-nums" style={{ fill: OTHERS }} data-testid="payoff-label-others">{formatBits(o.peerCare)}</text>
    </svg>
  );
}

/** The colour coding, taught once: the two dimensions' colours and the ramp. */
function PayoffKey() {
  const swatch = (colour: string) => <span aria-hidden className="inline-block h-[3px] w-3 align-middle" style={{ background: colour }} />;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground" data-testid="text-payoff-caption" aria-label={PAYOFF_CAPTION}>
      <span className="inline-flex items-center gap-1">{swatch(YOURS)}<span>width: <span style={{ color: YOURS }}>your bits</span></span></span>
      <span className="inline-flex items-center gap-1">{swatch(OTHERS)}<span>height: <span style={{ color: OTHERS }}>what the others care</span></span></span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="inline-block h-2.5 w-6 align-middle"
          style={{ background: `linear-gradient(to right, var(--cg-ramp-low, ${SCORE_RAMP.light.low}), var(--cg-ramp-high, ${SCORE_RAMP.light.high}))` }} />
        area: your payoff, low → high
      </span>
    </p>
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
      your bits and whose height is what the others care, on one scale, so its area is your payoff. Next: {step.why}
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
  const best = Math.max(0, ...shown.map(o => o.payoff));
  const highlight = new Set(params.highlight);
  const sum = (f: (o: LiveObject) => number) => objects.reduce((s, o) => s + f(o), 0);

  if (!objects.length && (phase === "lobby" || phase === "planning")) return <BeforeTheWorld paneId={paneId} phase={phase} noun={noun} />;
  if (!objects.length) return <PanelEmpty testId="panel-empty-objects">The world holds no {noun}s yet. They spawn once the world starts running.</PanelEmpty>;
  if (!shown.length) return <PanelEmpty>No {noun} matches this view right now ({objects.length} in the world).</PanelEmpty>;
  const header = (
    <header className="space-y-1">
      <PayoffKey />
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
              <PayoffRectangle o={o} scale={scale} strength={relativeStrength(o.payoff, best)} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-mono text-[12px] leading-snug text-muted-foreground" data-testid={`text-payoff-${o.id}`}>
                  <span style={{ color: YOURS }}>yours {formatBits(o.own.netBits)}</span> × <span style={{ color: OTHERS }}>others {formatBits(o.peerCare)}</span>{" "}
                  <span className="whitespace-nowrap">= <b className={o.payoff < 0 ? "text-destructive" : "text-foreground"}>{formatBits(o.payoff)}</b></span>
                </span>
                <span className="relative block h-1.5 bg-muted" aria-hidden>
                  <span className={`absolute inset-y-0 left-0 ${o.payoff < 0 ? "bg-destructive" : ""}`} data-testid={`payoff-bar-${o.id}`}
                    style={{ width: `${(100 * Math.abs(o.payoff)) / max}%`, ...(o.payoff < 0 ? {} : { background: rampVar(relativeStrength(o.payoff, best)) }) }} />
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
