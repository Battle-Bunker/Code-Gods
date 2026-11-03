/**
 * Objects by payoff, the default panel: the world's objects ranked by what they pay you. Each row: the rank, the object,
 * a payoff rectangle drawn to scale (width:
 * your bits, height: what the others care, on one scale, so equal values make a square and the area is the payoff),
 * its two values labelled on their edges, `yours × others = payoff`, the relative payoff bar, and "why?" for the full
 * breakdown. Colour coding, the same in every panel: "yours" petrol blue, "others" raspberry (lib/object-views
 * dimensions.ts); the rectangle's fill and the bar run one amber ramp from muted to strong by the payoff relative to
 * the best shown. Before the world runs, the empty state says what will appear and offers the one next
 * step. The list scrolls over the whole collection (docs/convex-read-architecture.md §4.3): a skeleton of ids,
 * `limit` at a time by the sort's index (player.objectIds), more pages as the end comes into view, and one subscription
 * per visible row (player.object), virtualised so only rows in view mount; the footer and the scale come from your
 * totals (player.totals). Replays answer the same queries at the playhead. The sort (payoff, your bits, others' care) is
 * the pane's `sortBy` parameter, set here or by the assistant, with the filter, which to highlight, and list or grid.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScoreBreakdown, dimensionVar, rampVar, relativeStrength,
} from "@workspace/object-views";
import { ObjectView, formatBits, useMyCard, useObjectContext, type LiveObject } from "@/sdk";
import { useGameId, useObject, useObjectIdsPage, useTotals, type ObjectFilter, type ObjectIdsPage, type ObjectSort } from "@/sdk/hooks";
import { VirtualRows } from "@/components/virtual-rows";
import { useDockActions } from "@/dock/actions";
import { useNow } from "@/core/game/situation";
import { PanelEmpty, PrimaryButton, TextButton, referObject, type PanelProps } from "./kit";
import { payoffLabels, payoffRect, payoffScale, type PayoffScale } from "./payoff-geometry";
import { useNextStep } from "./use-next-step";
import { useReplayChanged } from "@/core/replay/parts";

/** The sort selector: the panel's `sortBy` parameter, which the assistant sets too. */
const SORT_CHOICES = [["payoff", "Payoff"], ["mine", "Your bits"], ["othersCare", "Others' care"]] as const;
/** The rectangle's box: the side the largest value fills, and room for the two edge labels. */
const SIDE = 44, LABEL_W = 36, LABEL_H = 13;
const YOURS = dimensionVar("yours"), OTHERS = dimensionVar("others");

/** The payoff rectangle of one row, to scale (geometry in ./payoff-geometry.ts), its edges and labels in the dimensions' colours. */
function PayoffRectangle({ o, scale, strength }: { o: LiveObject; scale: PayoffScale; strength: number }) {
  const g = payoffRect({ own: o.own.netBits, care: o.peerCare }, scale, SIDE);
  const yoursText = formatBits(o.own.netBits), othersText = formatBits(o.peerCare);
  // 10px monospace digits are about 6px wide: keep the bottom label's left end on the box.
  const at = payoffLabels(g, SIDE, { gap: 3, below: 11, halfLabel: yoursText.length * 3 });
  const title = `your bits ${formatBits(o.own.netBits)} × others' care ${formatBits(o.peerCare)} = payoff ${formatBits(o.payoff)}`;
  const top = SIDE - g.height;
  return (
    <svg width={SIDE + LABEL_W} height={SIDE + LABEL_H} viewBox={`0 0 ${SIDE + LABEL_W} ${SIDE + LABEL_H}`} className="shrink-0 overflow-visible"
      role="img" aria-label={title} data-testid={`payoff-rect-${o.id}`} data-kind={g.kind} data-width={g.width.toFixed(2)} data-height={g.height.toFixed(2)}>
      <title>{title}</title>
      {g.kind === "gain" && <rect x={0} y={top} width={g.width} height={g.height} style={{ fill: rampVar(strength) }} data-testid="payoff-fill" />}
      {g.kind === "loss" && (g.height > 1.5
        ? <rect x={0.75} y={top + 0.75} width={Math.max(0, g.width - 1.5)} height={g.height - 1.5} fill="none"
          stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeDasharray="3 2" data-testid="payoff-loss" />
        // A loss nobody else cares about has no height: a dashed line just above the edge still says "loss".
        : <line x1={0} x2={g.width} y1={SIDE - 4} y2={SIDE - 4} stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="3 2" data-testid="payoff-loss" />)}
      {/* The two dimensions' edges: the bottom (width: your bits) and the right (height: what the others care). */}
      {g.width > 0 && <line x1={0} x2={g.width} y1={SIDE - 1} y2={SIDE - 1} style={{ stroke: YOURS }} strokeWidth={2} />}
      {g.height > 0 && <line x1={Math.max(1, g.width - 1)} x2={Math.max(1, g.width - 1)} y1={top} y2={SIDE} style={{ stroke: OTHERS }} strokeWidth={2} />}
      <text x={at.width.x} y={at.width.y} textAnchor="middle" className="font-mono text-[10px] tabular-nums" style={{ fill: YOURS }} data-testid="payoff-label-yours">{yoursText}</text>
      <text x={at.height.x} y={at.height.y} dominantBaseline="middle" className="font-mono text-[10px] tabular-nums" style={{ fill: OTHERS }} data-testid="payoff-label-others">{othersText}</text>
    </svg>
  );
}

/** The key's gradient: stops from the same mix the fills use (linear light), so its middle matches a half-strength fill. */
const KEY_STOPS = [0, 0.25, 0.5, 0.75, 1].map(t => rampVar(t)).join(", ");

/** The colour coding, taught once: the two dimensions' colours and the ramp. */
function PayoffKey() {
  const swatch = (colour: string) => <span aria-hidden className="inline-block h-[3px] w-3 align-middle" style={{ background: colour }} />;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground" data-testid="text-payoff-caption">
      <span className="inline-flex items-center gap-1">{swatch(YOURS)}<span>width: <span style={{ color: YOURS }}>your bits</span></span></span>
      <span className="inline-flex items-center gap-1">{swatch(OTHERS)}<span>height: <span style={{ color: OTHERS }}>what the others care</span></span></span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="inline-block h-2.5 w-6 align-middle"
          style={{ background: `linear-gradient(to right, ${KEY_STOPS})` }} />
        area: your payoff, low → high
      </span>
    </p>
  );
}

/** Before the world runs (the default panel in the lobby and during planning): what will appear here, and the next step. */
function BeforeTheWorld({ paneId, phase, noun }: Pick<PanelProps<"objects">, "paneId" | "phase"> & { noun: string }) {
  const { step, go, offered, situation } = useNextStep(paneId, phase);
  const now = useNow();
  const until = situation.obs?.planningEndsAt;
  const left = phase === "planning" && until && until > now ? Math.ceil((until - now) / 1000) : null;
  const when = phase === "lobby" ? "When the game starts and the world runs" : `When the world starts${left ? ` (in ${left} s)` : ""}`;
  return (
    <PanelEmpty testId="panel-empty-objects" action={offered ? <PrimaryButton onClick={go} busy={step.busy} testId="button-next-step">{step.label}</PrimaryButton> : undefined}>
      {when}, its {noun}s appear here, best first: each one marked with what makes up your score, and a rectangle whose width is
      your bits and whose height is what the others care, on one scale, so its area is your payoff.{offered ? ` Next: ${step.why}` : ""}
    </PanelEmpty>
  );
}

/** The sort order, settable by the player here and by the assistant (show_panel's sortBy). */
function SortSelector({ paneId, value }: { paneId: string; value: string }) {
  const dock = useDockActions();
  return (
    <div role="radiogroup" aria-label="Sort objects by" className="flex flex-wrap items-center gap-1 font-mono text-[11px]" data-testid="objects-sort">
      <span className="text-muted-foreground">sort</span>
      {SORT_CHOICES.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} data-testid={`sort-${id}`} onClick={() => value !== id && dock.setParams(paneId, { sortBy: id })}
          className={`rounded-sm border px-1.5 py-0.5 ${value === id ? "border-foreground text-foreground" : "border-[hsl(var(--card-border))] text-muted-foreground hover:text-foreground"}`}>{label}</button>
      ))}
    </div>
  );
}

/** One skeleton page (player.objectIds), reported to the list; mounted while the list holds it. */
function SkeletonPage({ gameId, sort, filter, cursor, index, numItems, onPage }: {
  gameId: string; sort: ObjectSort; filter: ObjectFilter; cursor: string | null; index: number; numItems: number;
  onPage: (index: number, page: ObjectIdsPage) => void;
}) {
  const page = useObjectIdsPage(gameId, { sort, filter, cursor, numItems });
  useEffect(() => { if (page) onPage(index, page); }, [page, index, onPage]);
  return null;
}

/** The row's fixed height (the list is virtualised: only rows in view mount, each with its own subscription). */
const ROW_PX = 104;

/** One row: its own subscription (player.object), held while the row is in view. */
function ObjectRow({ id, rank, scale, best, max, highlighted, flash, open, onOpen, noun, comparative }: {
  id: string; rank: number; scale: PayoffScale; best: number; max: number; highlighted: boolean;
  flash: { version: number; before: unknown } | null; open: boolean; onOpen: () => void; noun: string; comparative?: string;
}) {
  const o = useObject(id);
  const { ctx } = useObjectContext();
  if (!o) return <div className="h-full border-b border-[hsl(var(--card-border))]" data-testid={`row-object-${id}`} />;
  return (
    <div data-testid={`row-object-${id}`}
      className={`h-full min-w-0 overflow-hidden border-b border-[hsl(var(--card-border))] py-2 ${highlighted ? "bg-[hsl(var(--primary)/0.06)]" : ""} ${flash ? "replay-changed" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <button type="button" onClick={() => referObject(rank)} title="Ask your assistant about this object"
          className="w-7 shrink-0 pt-0.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground">#{rank}</button>
        <span className="max-w-[40%] shrink-0 truncate font-mono text-xs"><ObjectView value={o.value} compareTo={flash ? flash.before as never : undefined} {...ctx} showTitle /></span>
        <PayoffRectangle o={o} scale={scale} strength={relativeStrength(o.payoff, best)} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-mono text-[12px] leading-snug text-muted-foreground" data-testid={`text-payoff-${id}`}>
            <span style={{ color: YOURS }}>yours {formatBits(o.own.netBits)}</span> × <span style={{ color: OTHERS }}>others {formatBits(o.peerCare)}</span>{" "}
            <span className="whitespace-nowrap">= <b className={o.payoff < 0 ? "text-destructive" : "text-foreground"}>{formatBits(o.payoff)}</b></span>
          </span>
          <span className="relative block h-1.5 bg-muted" aria-hidden>
            <span className={`absolute inset-y-0 left-0 ${o.payoff < 0 ? "bg-destructive" : ""}`} data-testid={`payoff-bar-${id}`}
              style={{ width: `${Math.min(100, (100 * Math.abs(o.payoff)) / max)}%`, ...(o.payoff < 0 ? {} : { background: rampVar(relativeStrength(o.payoff, best)) }) }} />
          </span>
          <span className="block truncate" data-testid={`text-rarity-${id}`}><ScoreBreakdown score={o as never} noun={noun} comparative={comparative} compact /></span>
          <TextButton onClick={onOpen} testId={`button-object-detail-${id}`}>{open ? "hide" : "why?"}</TextButton>
        </span>
      </div>
    </div>
  );
}

/** The opened row's full breakdown, under the list (rows are fixed-height). */
function ObjectDetail({ id, noun, comparative }: { id: string; noun: string; comparative?: string }) {
  const o = useObject(id);
  if (!o) return null;
  return <div className="border-l-2 border-[hsl(var(--card-border))] pl-3" data-testid={`object-detail-${id}`}><ScoreBreakdown score={o as never} noun={noun} comparative={comparative} /></div>;
}

/** One grid cell: its own subscription. */
function GridCell({ id, rank }: { id: string; rank: number }) {
  const o = useObject(id);
  const { ctx } = useObjectContext();
  return (
    <button type="button" onClick={() => referObject(rank)} data-testid={`row-object-${id}`}
      className="flex flex-col items-center gap-0.5 border border-[hsl(var(--card-border))] p-1 text-[10px] font-mono">
      {o ? <ObjectView value={o.value} {...ctx} /> : <span className="opacity-60">…</span>}
      <span>#{rank}{o ? ` · ${formatBits(o.payoff)}` : ""}</span>
    </button>
  );
}

export default function Objects({ paneId, params, phase }: PanelProps<"objects">) {
  // A replay's playhead just changed these (docs/replay-design.md §6): their rows flash and grids outline the cells that moved.
  const changed = useReplayChanged();
  const gameId = useGameId();
  const sort = params.sortBy as ObjectSort, filter = params.filter as ObjectFilter;
  const view = `${gameId}|${sort}|${filter}|${params.limit}`;
  // The skeleton: pages of ids chained by cursor, each its own subscription; the list asks for the next as its end nears.
  const [pages, setPages] = useState<{ view: string; list: ObjectIdsPage[] }>({ view, list: [] });
  const [wanted, setWanted] = useState(1);
  useEffect(() => { setPages({ view, list: [] }); setWanted(1); }, [view]);   // a new sort or filter starts from the top
  const onPage = useCallback((index: number, page: ObjectIdsPage) => setPages(p => {
    if (p.view !== view) return p;
    const list = p.list.slice(0, index + 1);
    list[index] = page;
    return { view, list };
  }), [view]);
  const loaded = pages.view === view ? pages.list : [];
  const ids = useMemo(() => {
    const seen = new Set<string>(), out: string[] = [];
    for (const page of loaded) for (const r of page?.page ?? []) if (!seen.has(r.id)) { seen.add(r.id); out.push(r.id); }
    return out;
  }, [loaded]);
  const done = loaded.length > 0 && !!loaded.at(-1)?.isDone;
  const cursors: (string | null)[] = [null];
  for (let i = 0; i < Math.min(wanted, loaded.length + 1) - 1; i++) { const p = loaded[i]; if (!p || p.isDone) break; cursors.push(p.continueCursor); }
  const more = useCallback(() => { if (!done && loaded.length >= wanted) setWanted(w => w + 1); }, [done, loaded.length, wanted]);
  const totals = useTotals(gameId);
  const card = useMyCard();
  const { noun } = useObjectContext();
  const [open, setOpen] = useState<string | null>(null);
  const comparative = card?.penalty?.comparative;
  // Scaled over every object (the tick's extremes), so a row draws the same whatever else is in view.
  const scale = useMemo(() => payoffScale([{ own: totals?.maxOwn ?? 0, care: totals?.maxCare ?? 0 }]), [totals?.maxOwn, totals?.maxCare]);
  const max = Math.max(1e-9, Math.abs(totals?.maxPayoff ?? 0), Math.abs(totals?.minPayoff ?? 0));
  const best = Math.max(0, totals?.maxPayoff ?? 0);
  const highlight = new Set(params.highlight);
  const total = totals?.objectCount ?? 0;
  const matching = filter === "all" ? total : filter === "chips" ? totals?.chips ?? 0 : totals?.contested ?? 0;
  const flashOf = (id: string) => { const ch = changed.get(id); return ch ? { version: ch.version, before: ch.before } : null; };
  const skeleton = gameId ? cursors.map((cursor, i) => (
    <SkeletonPage key={`${view}|${i}`} gameId={gameId} sort={sort} filter={filter} cursor={cursor} index={i} numItems={params.limit} onPage={onPage} />
  )) : null;

  if (gameId && totals === undefined) return <>{skeleton}</>;
  if (!total && (phase === "lobby" || phase === "planning")) return <>{skeleton}<BeforeTheWorld paneId={paneId} phase={phase} noun={noun} /></>;
  if (!total) return <>{skeleton}<PanelEmpty testId="panel-empty-objects">The world holds no {noun}s yet. They spawn once the world starts running.</PanelEmpty></>;
  if (loaded.length && done && !ids.length) return <>{skeleton}<PanelEmpty>No {noun} matches this view right now ({total} in the world).</PanelEmpty></>;
  const header = (
    <header className="space-y-1.5">
      <SortSelector paneId={paneId} value={params.sortBy} />
      <PayoffKey />
    </header>
  );
  const footer = (
    <p className="font-mono text-[11px] text-muted-foreground" data-testid="text-objects-footer">
      {ids.length} of {matching}{filter !== "all" ? ` matching (${total} in all)` : ""} · Σ your net bits {formatBits(totals?.sumOwnNetBits ?? 0)} · Σ others' {formatBits(totals?.sumPeerNetBits ?? 0)}
    </p>
  );
  if (params.layout === "grid") {
    return (
      <div className="space-y-3">
        {skeleton}
        {header}
        <div className="flex flex-wrap gap-2">{ids.map((id, i) => <GridCell key={id} id={id} rank={i + 1} />)}</div>
        {!done && <TextButton onClick={more} testId="button-objects-more">Load more ({ids.length} of {matching})</TextButton>}
        {footer}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {skeleton}
      {header}
      <VirtualRows rows={ids} rowHeight={ROW_PX} maxHeight={640}
        // A row the playhead just changed remounts, so its flash plays again.
        keyOf={id => { const f = changed.get(id); return f ? `${id}:${f.version}` : id; }} onNearEnd={more} testId="list-objects"
        render={(id, i) => <ObjectRow id={id} rank={i + 1} scale={scale} best={best} max={max} highlighted={highlight.has(id)} flash={flashOf(id)}
          open={open === id} onOpen={() => setOpen(open === id ? null : id)} noun={noun} comparative={comparative} />} />
      {open && <ObjectDetail id={open} noun={noun} comparative={comparative} />}
      {footer}
    </div>
  );
}
