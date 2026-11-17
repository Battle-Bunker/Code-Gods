/**
 * Lines (the `objects` pane): which lines earn you points, and why. A virtualised list over the skeleton of ids in the
 * human's order (`v2/playState:objectIds`, page by page as the end comes into view), each visible row its own subscription
 * to its line (`v2/play:object`), dropped when it scrolls away (docs/convex-read-architecture.md R1). A row: the line
 * drawn in your rule's main view (or the representation pinned for the family) with its marks, your bits (rarity) and points,
 * the points rectangle (width = your bits, height = the others' bits added together, area = your points: ux-lessons 2.8)
 * and "Why?" from the rule's main part. Pointing at a line's face (or tapping it) shows its detail over the list (components/object-hover.tsx). The order is the human's
 * view state (`view.sortObjects`), so an assistant can sort it for them. A spectator sees every line by number, as text.
 */
import { isPaid, KEEP_FRESH_SHARE, lookAllPrice, seenShort, watcherTypeOf } from "./seen";
import { watcherFor } from "@workspace/v2-agents/pure";
import { summonPrice } from "./forge-model";
import { SeenNote } from "./fresh-mark";
import { bitsText, num, othersNote, pointsText, scoreFormula, blurredNote } from "@/core/words";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stableOrder } from "./stable-order";
import { pinnedRep } from "@workspace/v2-affordances";
import { useAffordance } from "@workspace/v2-affordances/react";
import type { Score } from "@workspace/v2-core";
import { annotate, CompactFace, ObjectChip, type Annotation } from "@workspace/v2-views";
import { decodeState, defaultRepOf, objectTypeOf, objectWord, useDigest, useGame, useGameScope, useMoves, useMyAgents, useMyObject, useMyObjects, useMyRule, useObjectIds, useReplaySource, useSpectatorObjectIds, type GameRule, useOthersBlurred } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { ObjectHover } from "@/components/object-hover";
import { VirtualRows } from "@/components/virtual-rows";
import { BitsHelp } from "@/core/score-help";
import { listMaxHeight } from "@/lib/virtual-window";
import { contestedLines, foldTugs } from "./tug-of-war";
import { toast } from "@/hooks/use-toast";
import { AffordanceButton } from "@/site/components/action";
import { digestScale, listFooter, payoffRect, serverSort, SHOWS, SORTS, whyLine, widen, type PayoffScale } from "./lines";
import { NewMark, RetiredLines, TurnoverNote } from "./retired";

/** The rectangle's box: the side the largest value fills, and room for its two edge labels. */
const SIDE = 44, LABEL_W = 42, LABEL_H = 13;
const YOURS = "#1f6f8b", OTHERS = "#b8336a", AREA = "rgba(217, 150, 30, 0.55)";
/** A row: the compact face (160 × 100 and its foot) beside the numbers. */
const ROW_H = 214, SPECTATOR_ROW_H = 36;


function PointsRectangle({ number, rarity, want, scale, approx = false }: { number: number; rarity: number; want: number; scale: PayoffScale; approx?: boolean }) {
  const g = payoffRect({ rarity, want }, scale, SIDE);
  const title = scoreFormula(rarity, want, approx);
  const top = SIDE - g.height;
  const wText = num(rarity), hText = num(Math.max(0, want));   // a blurred sum below zero scores as none
  return (
    <svg width={SIDE + LABEL_W} height={SIDE + LABEL_H} viewBox={`0 0 ${SIDE + LABEL_W} ${SIDE + LABEL_H}`} className="shrink-0 overflow-visible"
      role="img" aria-label={title} data-testid={`points-rect-line-${number}`} data-kind={g.kind} data-width={g.width.toFixed(2)} data-height={g.height.toFixed(2)}>
      <title>{title}</title>
      {g.kind === "gain" && <rect x={0} y={top} width={g.width} height={g.height} fill={AREA} />}
      {g.width > 0 && <line x1={0} x2={g.width} y1={SIDE - 1} y2={SIDE - 1} stroke={YOURS} strokeWidth={2} />}
      {g.height > 0 && <line x1={Math.max(1, g.width - 1)} x2={Math.max(1, g.width - 1)} y1={top} y2={SIDE} stroke={OTHERS} strokeWidth={2} />}
      <text x={Math.max(wText.length * 3, g.width / 2)} y={SIDE + 11} textAnchor="middle" className="font-mono text-[10px] tabular-nums" fill={YOURS}>{wText}</text>
      <text x={g.width + 3} y={SIDE - g.height / 2} dominantBaseline="middle" className="font-mono text-[10px] tabular-nums" fill={OTHERS}>{hText}</text>
    </svg>
  );
}

/** The colour coding, said once above the list in the formula's words. */
function PointsKey() {
  const word = objectWord(useGame()?.variant);
  const blurred = useOthersBlurred();
  const swatch = (c: string) => <span aria-hidden className="inline-block h-[3px] w-3 align-middle" style={{ background: c }} />;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" data-testid="text-points-key">
      {/* One sentence, not a key to decode (round 26: "width · height · area" over tiny bars was a puzzle). */}
      <span data-testid="text-points-sentence">
        Each {word.one}'s box is its points for you: as wide as <span style={{ color: YOURS }}>your bits</span> {swatch(YOURS)} and
        as tall as <span style={{ color: OTHERS }}>the others' bits</span> {swatch(OTHERS)}, so the bigger the box{" "}
        <span aria-hidden className="inline-block h-2.5 w-3 align-middle" style={{ background: AREA }} />, the more points.
      </span>
      <BitsHelp testId="button-bits-help-lines" />
      <span className="basis-full" data-testid="text-others-note">{othersNote(word.one)}{blurred ? ` ${blurredNote(word.one)}` : ""}</span>
    </p>
  );
}

function SortControl() {
  const view = useView();
  const sort = useAffordance("view.sortObjects");
  return (
    <label className="flex items-center gap-1.5 text-xs" data-testid="lines-sort">
      <span className="text-muted-foreground">Sort by</span>
      <select value={view.objects.sort} disabled={!sort.available} title={sort.reason ?? sort.tooltip} data-testid="select-lines-sort"
        className="border border-[hsl(var(--card-border))] bg-background px-1.5 py-0.5"
        onChange={e => sort.run({ sort: e.target.value as (typeof SORTS)[number]["sort"] }).catch((err: Error) => toast({ title: "The order did not change", description: err.message, variant: "destructive" }))}>
        {SORTS.map(s => <option key={s.sort} value={s.sort}>{s.label}</option>)}
      </select>
      <ShowControl />
    </label>
  );
}

/** v1's filters: all lines, only those earning you points, only the contested ones (the view state, so an assistant can set it). */
function ShowControl() {
  const view = useView();
  const filter = useAffordance("view.filterObjects");
  const show = view.objects.filter.show ?? "all";
  return (
    <>
      <span className="ml-2 text-muted-foreground">Show</span>
      <select value={show} disabled={!filter.available} title={filter.reason ?? filter.tooltip} data-testid="select-lines-show"
        className="border border-[hsl(var(--card-border))] bg-background px-1.5 py-0.5"
        onChange={e => filter.run({ ...view.objects.filter, show: e.target.value as (typeof SHOWS)[number]["show"] }).catch((err: Error) => toast({ title: "The list did not change", description: err.message, variant: "destructive" }))}>
        {SHOWS.map(s => <option key={s.show} value={s.show}>{s.label}</option>)}
      </select>
    </>
  );
}

function LineRow({ objectId, number, rule, value, rep, scale, contested, variant }: {
  objectId: string; number: number; rule: GameRule | null; value: ((u: Score) => number) | null; rep: string; scale: PayoffScale; contested: boolean; variant: string;
}) {
  const blurred = useOthersBlurred();
  const o = useMyObject(objectId);
  const word = objectWord(variant);
  const state = useMemo(() => (o ? decodeState(o.state, variant) : null), [o?.state, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const a: Annotation | null = useMemo(() => (rule && state ? annotate(rule, state) : null), [rule, state]);
  const shell = (body: ReactNode) => (
    <div data-testid={`row-line-${number}`}
      className="flex h-full min-w-0 items-start gap-3 overflow-hidden border-t border-[hsl(var(--card-border))] px-3 py-2">
      {body}
    </div>
  );
  if (o && isPaid(o) && o.knownAt === null) return shell(<span className="text-xs text-muted-foreground" data-testid={`text-seen-line-${number}`}>{word.One} {number}: {seenShort(o)}</span>);
  if (!o || !state || !variant) return shell(<span className="text-xs text-muted-foreground">{word.One} {number} …</span>);
  const v = o.value;
  const main = a?.sites[0]?.parts[0];
  return shell(<>
    <ObjectHover objectId={objectId} label={`${word.One} ${number}`} className="shrink-0" testId={`marks-line-${number}`}>
      <span data-rep={rep}>
        {rule ? <CompactFace rule={rule} state={state} annotation={a ?? undefined} rep={rep} value={value ?? undefined} toScore /> : <ObjectChip type={objectTypeOf(variant)} state={state} />}
      </span>
    </ObjectHover>
    <div className="min-w-0 flex-1 space-y-1.5 text-xs">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{word.One} {number}</span>
        <NewMark bornAt={o.bornAt} number={number} />
        {contested && <span className="border border-destructive/60 px-1 text-[10px] font-medium uppercase text-destructive" data-testid={`badge-contested-line-${number}`}
          title={`Your agent and another player's keep moving this ${word.one} back and forth: both of you burn energy. Talk to them.`}>tug-of-war</span>}
        {v && <span data-testid={`text-points-line-${number}`}>{bitsText(v.rarityBits)} · <b>{pointsText(v.points)}</b></span>}
        {isPaid(o) && <SeenNote o={o} number={number} />}
      </p>
      {v && <PointsRectangle number={number} rarity={v.rarityBits} want={v.want} scale={widen(scale, v.rarityBits, v.want)} approx={blurred} />}
      {v && (
        <p className="line-clamp-5 text-muted-foreground" data-testid={`text-why-line-${number}`}>
          <span className="font-medium text-foreground">Why? </span>{whyLine({ rarity: v.rarityBits, want: v.want }, { sentence: main?.sentence, worst: a?.worst }, word.one, blurred)}
        </p>
      )}
    </div>
  </>);
}

/**
 * Every game pays to look (owner decisions 33, 35): what you see is as you last saw it. One press pays to see every
 * loaded one as it is now; another summons a Watcher, an agent that only looks, so they stay fresh on their own.
 */
function LookAll({ ids, many, one, variant }: { ids: readonly string[]; many: string; one: string; variant: string }) {
  const rows = useMyObjects(ids);   // the rows' own subscriptions (shared): each carries its look price
  const scale = useGame()?.priceScale ?? 1;
  const agents = useMyAgents();
  const price = lookAllPrice(rows);
  if (!rows.some(r => isPaid(r))) return null;
  const watching = agents?.some(a => a.name === "Watcher") ?? false;
  const watcher = watcherFor(watcherTypeOf(variant), "typescript");
  // Its summon price as agent.summon charges it (round 13: the confirmation said "It costs energy" and took 384).
  const watcherPrice = summonPrice("typescript", watcher.source, scale);
  // Decision 36: your agents tell you every one they touch, so a beginner keeps up without looking; looking and a
  // Watcher are extras for a player who wants their view sooner, never a step of the first game.
  return (
    <details className="px-3 text-xs text-muted-foreground" data-testid="look-all">
      <summary className="cursor-pointer" data-testid="details-look-more">Your agents tell you about every {one} they touch. Want to see them sooner?</summary>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {price !== null && <AffordanceButton id="object.look" args={{}} label={`Look at every ${one} now (${price.toFixed(2)} energy)`} busyLabel="Looking…" tone="secondary" className="px-2 py-1 text-xs" testId="button-look-all" />}
        {watching
          ? <span data-testid="text-watching">Your Watcher keeps them fresh.</span>
          : <AffordanceButton id="agent.summon" args={{ language: "typescript", source: watcher.source, name: "Watcher", share: KEEP_FRESH_SHARE }}
              label={`Keep my ${many} fresh`} busyLabel="Summoning…" tone="secondary" className="px-2 py-1 text-xs" testId="button-keep-fresh"
              confirmText={`Summon a Watcher for ${watcherPrice.toFixed(2)} energy: an agent that only looks, for ${Math.round(KEEP_FRESH_SHARE * 100)}% of your power. It looks at your ${many} one by one, so you see them sooner, without paying for each look yourself.`} />}
      </div>
    </details>
  );
}

function SeatedLines() {
  const header = useGame();
  const view = useView();
  const wide = useWide();
  const my = useMyRule();
  // Lines your agent and another player's are pulling back and forth now (the act log's folded entries).
  const moves = useMoves();
  const contested = useMemo(() => contestedLines(foldTugs(moves.results)), [moves.results]);
  const digest = useDigest();
  const ids = useObjectIds(serverSort(view.objects.sort), 30, view.objects.filter.show ?? "all");
  const scale = useMemo(() => digestScale(digest?.packed), [digest?.packed]);
  const rule = my?.rule ?? null;
  const rep = rule ? pinnedRep(view, rule.family.id, my!.row.primary) : defaultRepOf(header?.variant);
  const { status, loadMore } = ids;
  // Hold the order while the player points at the list (and a second after a tap): the rows must not move under them.
  const [hold, setHold] = useState<string[] | null>(null);
  const holdRef = useRef<{ order: string[] | null; timer?: ReturnType<typeof setTimeout> }>({ order: null });
  const results = useMemo(() => stableOrder(hold, ids.results), [hold, ids.results]);
  const grab = () => { clearTimeout(holdRef.current.timer); if (!holdRef.current.order) { holdRef.current.order = results.map(r => r.objectId); setHold(holdRef.current.order); } };
  const release = (after: number) => { clearTimeout(holdRef.current.timer); holdRef.current.timer = setTimeout(() => { holdRef.current.order = null; setHold(null); }, after); };
  useEffect(() => () => clearTimeout(holdRef.current.timer), []);
  const onNearEnd = useCallback(() => { if (status === "CanLoadMore") loadMore(30); }, [status, loadMore]);
  const loadedIds = useMemo(() => results.map(r => r.objectId), [results]);
  if (status === "LoadingFirstPage") return <p className="p-4 text-sm text-muted-foreground">Loading your {objectWord(header?.variant).many}…</p>;
  if (!results.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="lines-empty">
        The game's lines appear here as soon as it starts, best for you first: each drawn the way your rule reads it, with a rectangle whose width is
        your bits for it and whose height is the others' bits added together, so its area is your points.
      </p>
    );
  }
  const maxHeight = listMaxHeight({ phone: !wide, viewportHeight: typeof window === "undefined" ? 0 : window.innerHeight });
  return (
    <div className="space-y-2 pt-2" data-testid="lines" data-held={hold ? "" : undefined}
      onPointerEnter={grab} onPointerDown={grab} onPointerLeave={() => release(0)} onPointerUp={e => { if (e.pointerType !== "mouse") release(1000); }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3">
        <SortControl />
        <PointsKey />
      </div>
      <TurnoverNote />
      <LookAll ids={loadedIds} many={objectWord(header?.variant).many} one={objectWord(header?.variant).one} variant={header?.variant ?? ""} />
      <VirtualRows rows={results} rowHeight={ROW_H} maxHeight={maxHeight} keyOf={r => r.objectId} onNearEnd={onNearEnd} testId="lines-list"
        render={r => <LineRow objectId={r.objectId} number={r.number} rule={rule} value={my?.bits ?? null} rep={rep} scale={scale} contested={contested.has(r.objectId)} variant={header?.variant ?? ""} />} />
      <ListFooter text={listFooter({ shown: results.length, packed: header?.turnover ? undefined : digest?.packed, show: view.objects.filter.show ?? "all", more: status !== "Exhausted", many: objectWord(header?.variant).many })} />
      <RetiredLines />
    </div>
  );
}

/** How many rows are shown of how many (v1 objects-scroll's "N of M"); scrolling to the end loads the next page. */
function ListFooter({ text }: { text: string }) {
  return <p className="px-3 pb-1 text-xs text-muted-foreground" data-testid="text-objects-footer" aria-live="polite">{text}</p>;
}

function SpectatorRow({ objectId, number, variant }: { objectId: string; number: number; variant: string }) {
  const o = useMyObject(objectId);
  const word = objectWord(variant);
  const state = useMemo(() => (o ? decodeState(o.state, variant) : null), [o?.state, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full items-center gap-3 border-t border-[hsl(var(--card-border))] px-3 text-sm" data-testid={`row-line-${number}`}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{word.One} {number}</span>
      {state && variant ? <ObjectChip type={objectTypeOf(variant)} state={state} /> : <span className="text-xs text-muted-foreground">…</span>}
    </div>
  );
}

function SpectatorLines() {
  const wide = useWide();
  const { results, status, loadMore } = useSpectatorObjectIds();
  const variant = useGame()?.variant ?? "";
  const word = objectWord(variant);
  const onNearEnd = useCallback(() => { if (status === "CanLoadMore") loadMore(30); }, [status, loadMore]);
  if (status === "LoadingFirstPage") return <p className="p-4 text-sm text-muted-foreground">Loading the {word.many}…</p>;
  if (!results.length) return <p className="p-4 text-sm text-muted-foreground" data-testid="lines-empty">When the world starts, its {word.many} appear here.</p>;
  const maxHeight = listMaxHeight({ phone: !wide, viewportHeight: typeof window === "undefined" ? 0 : window.innerHeight });
  return (
    <div className="space-y-2 pt-2" data-testid="lines">
      <p className="px-3 text-xs text-muted-foreground">You're watching: every {word.one} in the world, by number. The players' points on them are theirs alone.</p>
      <VirtualRows rows={results} rowHeight={SPECTATOR_ROW_H} maxHeight={maxHeight} keyOf={r => r.objectId} onNearEnd={onNearEnd} testId="lines-list"
        render={r => <SpectatorRow objectId={r.objectId} number={r.number} variant={variant} />} />
      <ListFooter text={listFooter({ shown: results.length, packed: undefined, show: "all", more: status !== "Exhausted", many: word.many })} />
    </div>
  );
}

export function LinesPane() {
  return useGameScope().seated ? <SeatedLines /> : <SpectatorLines />;
}
