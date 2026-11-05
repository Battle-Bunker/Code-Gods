/**
 * Objects, the default panel: the world's objects, by default ranked by what they pay you. Each row: the rank, the object,
 * a payoff rectangle drawn to scale (width:
 * your bits, height: what the others care, on one scale, so equal values make a square and the area is the payoff),
 * its two values labelled on their edges, `yours × others = payoff`, the relative payoff bar, and "why?" for the full
 * breakdown. Colour coding, the same in every panel: "yours" petrol blue, "others" raspberry (lib/object-views
 * dimensions.ts); the rectangle's fill and the bar run one amber ramp from muted to strong by the payoff relative to
 * the best shown. Before the world runs, the empty state says what will appear and offers the one next
 * step. The list scrolls over the whole collection (docs/convex-read-architecture.md §4.3): a skeleton of ids in the
 * sort order (player.objectIds, `limit` rows a page, the next page loading as the end comes into view) and one
 * subscription per VISIBLE row (player.object): the list is virtualised, so a row scrolled away drops its subscription.
 * The footer's totals and the rectangles' scale come from player.totals; the grid shows one window (player.objectsPage).
 * Replays answer all of them at the playhead. The sort (a dropdown: payoff, your bits, others' care, most mutated,
 * newest, oldest, recently mutated) is the pane's `sortBy` parameter, set here or by the assistant, with the filter,
 * which to highlight, and list or grid.
 */
import { useCallback, useEffect, useState } from "react";
import { OBJECT_SORTS, OBJECT_SORT_LABELS, mutationLine, type ObjectSort } from "@workspace/player-client/objects-page";
import {
  ScoreBreakdown, dimensionVar, objectRowHeight, rampVar, relativeStrength,
} from "@workspace/object-views";
import { ObjectGrid, ObjectView, formatBits, useMyCard, useObjectContext, useDockState, type LiveObject } from "@/sdk";
import { useGameId, useMyObject, useMyTotals, useObjectRank, useObjectSkeleton, useObjectsPage, type MyObject, type MyTotals } from "@/sdk/hooks";
import { VirtualRows } from "@/components/virtual-rows";
import { useDockActions } from "@/dock/actions";
import { useNow } from "@/core/game/situation";
import { PanelEmpty, PrimaryButton, TextButton, referObject, type PanelProps } from "./kit";
import { payoffLabels, payoffRect, type PayoffScale } from "./payoff-geometry";
import { useNextStep } from "./use-next-step";
import { useReplayChanged } from "@/core/replay/parts";

/** The rectangle's box: the side the largest value fills, and room for the two edge labels. */
const SIDE = 44, LABEL_W = 36, LABEL_H = 13;
const YOURS = dimensionVar("yours"), OTHERS = dimensionVar("others");

/** The payoff rectangle of one row, to scale (geometry in ./payoff-geometry.ts), its edges and labels in the dimensions' colours. */
function PayoffRectangle({ o, scale, strength }: { o: Pick<LiveObject, "id" | "own" | "peerCare" | "payoff">; scale: PayoffScale; strength: number }) {
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

/** The sort order, settable by the player here and by the assistant (show_panel's sortBy): one dropdown, kept per pane. */
function SortSelector({ paneId, value }: { paneId: string; value: ObjectSort }) {
  const dock = useDockActions();
  const id = `objects-sort-${paneId}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]" data-testid="objects-sort">
      <label htmlFor={id} className="text-muted-foreground">Sort by</label>
      <select id={id} value={value} data-testid="select-objects-sort" onChange={e => dock.setParams(paneId, { sortBy: e.target.value })}
        className="rounded-sm border border-[hsl(var(--card-border))] bg-background px-1.5 py-0.5 text-foreground">
        {OBJECT_SORTS.map(sort => <option key={sort} value={sort}>{OBJECT_SORT_LABELS[sort]}</option>)}
      </select>
    </div>
  );
}

/** The totals' scales: the rectangles' (the largest |your bits| or others' care), the best payoff, the bar's largest |payoff|. */
const scalesOf = (t: MyTotals | null | undefined) => ({
  scale: { max: Math.max(t?.maxOwn ?? 0, t?.maxCare ?? 0) } as PayoffScale,
  best: Math.max(0, t?.maxPayoff ?? 0), max: Math.max(1e-9, Math.abs(t?.maxPayoff ?? 0), Math.abs(t?.minPayoff ?? 0)),
});
type Scales = ReturnType<typeof scalesOf>;

/** Space for one row: the object (a grid draws taller), the rectangle with its labels, four lines of text. */
const rowHeightFor = (ctx: Parameters<typeof objectRowHeight>[0]) => Math.max(SIDE + LABEL_H, objectRowHeight(ctx)) + 64;

type RowProps = {
  objectId: string; position: number; byPayoff: boolean; scales: Scales; world: number; highlighted: boolean; open: boolean; onOpen: (id: string) => void;
  ctx: ReturnType<typeof useObjectContext>["ctx"]; noun: string; comparative: string | undefined; changed: ReturnType<typeof useReplayChanged>;
};

/**
 * One visible row: its own subscription (player.object), dropped when the row scrolls away. Its "#N" is the object's
 * rank by your payoff (what the assistant means by "object #N"): its position when the list is by payoff and
 * unfiltered, else its own player.objectRank.
 */
function ObjectRow({ objectId, position, byPayoff, scales, world, highlighted, open, onOpen, ctx, noun, comparative, changed }: RowProps) {
  const o = useMyObject(objectId);
  const ranked = useObjectRank(byPayoff ? undefined : objectId);
  const rank = byPayoff ? position : ranked ?? undefined;
  const label = rank === undefined ? "#–" : `#${rank}`;
  if (!o) return <div className="h-full py-2 font-mono text-xs text-muted-foreground" data-testid={`object-row-loading-${objectId}`}>{label} …</div>;
  // A replay's playhead just changed it (docs/replay-design.md §6): it flashes, once per version reached.
  const change = changed.get(o.id), lit = !!change && change.after === o.value;
  const strength = relativeStrength(o.payoff, scales.best);
  return (
    <div key={lit ? `${o.id}:${change!.version}` : o.id} data-testid={`row-object-${o.id}`} className={`h-full min-w-0 overflow-hidden border-t border-[hsl(var(--card-border))] py-2 ${highlighted ? "bg-[hsl(var(--primary)/0.06)]" : ""} ${lit ? "replay-changed" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <button type="button" onClick={() => referObject(rank)} title="Ask your assistant about this object"
          className="w-7 shrink-0 pt-0.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground">{label}</button>
        <span className="max-w-[40%] shrink-0 truncate font-mono text-xs"><ObjectView value={o.value} compareTo={lit ? change!.before as never : undefined} {...ctx} showTitle /></span>
        <PayoffRectangle o={o} scale={scales.scale} strength={strength} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-mono text-[12px] leading-snug text-muted-foreground" data-testid={`text-payoff-${o.id}`}>
            <span style={{ color: YOURS }}>yours {formatBits(o.own.netBits)}</span> × <span style={{ color: OTHERS }}>others {formatBits(o.peerCare)}</span>{" "}
            <span className="whitespace-nowrap">= <b className={o.payoff < 0 ? "text-destructive" : "text-foreground"}>{formatBits(o.payoff)}</b></span>
          </span>
          <span className="relative block h-1.5 bg-muted" aria-hidden>
            <span className={`absolute inset-y-0 left-0 ${o.payoff < 0 ? "bg-destructive" : ""}`} data-testid={`payoff-bar-${o.id}`}
              style={{ width: `${Math.min(100, (100 * Math.abs(o.payoff)) / scales.max)}%`, ...(o.payoff < 0 ? {} : { background: rampVar(strength) }) }} />
          </span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground" data-testid={`text-mutations-${o.id}`}>{mutationLine(o, world)}</span>
          <span className="block truncate" data-testid={`text-rarity-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} compact /></span>
          <TextButton onClick={() => onOpen(o.id)} testId={`button-object-detail-${o.id}`}>{open ? "hide" : "why?"}</TextButton>
        </span>
      </div>
    </div>
  );
}

/** The full breakdown of the object whose "why?" is open, under the list (rows keep one height). */
function ObjectDetail({ objectId, noun, comparative }: { objectId: string; noun: string; comparative: string | undefined }) {
  const o: MyObject | null | undefined = useMyObject(objectId);
  if (!o) return null;
  return <div className="border-l-2 border-[hsl(var(--card-border))] pl-3" data-testid={`object-detail-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} /></div>;
}

/** The grid layout: one window of the collection (player.objectsPage, at most 90 objects) drawn as a board. */
function ObjectsGrid({ params }: Pick<PanelProps<"objects">, "params">) {
  const data = useObjectsPage({ sort: params.sortBy, filter: params.filter, limit: 90, hz: 1 });
  const shown = data?.rows ?? [];
  // The window's position is the payoff rank only when it is by payoff and unfiltered.
  const ranks = params.sortBy === "payoff" && params.filter === "all" ? new Map(shown.map((o, i) => [o.id, i + 1])) : new Map<string, number>();
  return <ObjectGrid objects={shown} max={shown.length} badge={(o: LiveObject) => (ranks.has(o.id) ? `#${ranks.get(o.id)} · ` : "") + formatBits(o.payoff)} onSelect={id => referObject(ranks.get(id))} />;
}

export default function Objects({ paneId, params, phase }: PanelProps<"objects">) {
  // A replay's playhead just changed these (docs/replay-design.md §6): their rows flash and grids outline the cells that moved.
  const changed = useReplayChanged();
  const gameId = useGameId();
  const totals = useMyTotals(gameId);
  const [pages, setPages] = useState(1);
  const view = `${params.sortBy}|${params.filter}|${params.limit}`;
  useEffect(() => setPages(1), [view]);   // a new sort or filter starts from the top
  const skeleton = useObjectSkeleton({ gameId, sort: params.sortBy, filter: params.filter, limit: Math.min(90, params.limit), pages });
  const loadMore = useCallback(() => { if (skeleton.loaded && skeleton.more) setPages(p => p + 1); }, [skeleton.loaded, skeleton.more]);
  // A filtered page can match nothing: read on without waiting for a scroll that cannot come.
  useEffect(() => { if (skeleton.loaded && skeleton.lastEmpty) loadMore(); }, [skeleton.loaded, skeleton.lastEmpty, loadMore]);
  const card = useMyCard();
  // The world time the ages are measured from: the live clock, or a replay's playhead (both answer the observation).
  const world = useDockState({ hz: 1 })?.economy?.worldSeconds ?? 0;
  const { ctx, noun } = useObjectContext();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setOpen(o => (o === id ? null : id)), []);
  const comparative = card?.penalty?.comparative;
  const scales = scalesOf(totals);
  const highlight = new Set(params.highlight);
  const total = totals?.objectCount ?? 0;
  const matching = params.filter === "all" ? total : params.filter === "chips" ? totals?.chips ?? 0 : totals?.contested ?? 0;

  if (!total && (phase === "lobby" || phase === "planning")) return <BeforeTheWorld paneId={paneId} phase={phase} noun={noun} />;
  // Loading (or the game's rows not filled yet): nothing rather than a wrong "no objects".
  if (!gameId || !totals) return null;
  if (!total) return <PanelEmpty testId="panel-empty-objects">The world holds no {noun}s yet. They spawn once the world starts running.</PanelEmpty>;
  if (skeleton.loaded && !skeleton.rows.length && !skeleton.more) return <PanelEmpty>No {noun} matches this view right now ({total} in the world).</PanelEmpty>;
  const header = (
    <header className="space-y-1.5">
      <SortSelector paneId={paneId} value={params.sortBy} />
      <PayoffKey />
    </header>
  );
  if (params.layout === "grid") return <div className="space-y-3">{header}<ObjectsGrid params={params} /></div>;
  return (
    <div className="space-y-3">
      {header}
      <VirtualRows rows={skeleton.rows} rowHeight={rowHeightFor(ctx)} maxHeight={640} keyOf={r => r.id} onNearEnd={loadMore} testId="list-objects"
        render={(r, i) => <ObjectRow objectId={r.id} position={i + 1} byPayoff={params.sortBy === "payoff" && params.filter === "all"} scales={scales} world={world}
          highlighted={highlight.has(r.id)} open={open === r.id} onOpen={toggle} ctx={ctx} noun={noun} comparative={comparative} changed={changed} />} />
      {skeleton.more && <TextButton onClick={loadMore} testId="button-objects-more">Load more ({skeleton.rows.length} of {matching})</TextButton>}
      {open && <ObjectDetail objectId={open} noun={noun} comparative={comparative} />}
      <p className="font-mono text-[11px] text-muted-foreground" data-testid="text-objects-footer">
        {skeleton.rows.length} of {matching}{params.filter !== "all" ? ` matching (${total} in all)` : ""} · Σ your net bits {formatBits(totals?.sumOwnNetBits ?? 0)} · Σ others' {formatBits(totals?.sumPeerNetBits ?? 0)}
      </p>
    </div>
  );
}
