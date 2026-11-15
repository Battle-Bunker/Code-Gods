/**
 * Lines (the `objects` pane): which lines earn you points, and why. A virtualised list over the skeleton of ids in the
 * human's order (`v2/play:objectIds`, page by page as the end comes into view), each visible row its own subscription
 * to its line (`v2/play:object`), dropped when it scrolls away (docs/convex-read-architecture.md R1). A row: the line
 * drawn in your rule's main view (or the representation pinned for the family) with its marks, your bits (rarity) and points,
 * the points rectangle (width = your bits, height = the others' bits added together, area = your points: ux-lessons 2.8)
 * and "Why?" from the rule's main part. Clicking a row opens it in One line (`view.openObject`). The order is the human's
 * view state (`view.sortObjects`), so an assistant can sort it for them. A spectator sees every line by number, as text.
 */
import { isPaid, seenShort, seenWords } from "./seen";
import { bitsText, num, othersNote, pointsText, scoreFormula, BLURRED_NOTE } from "@/core/words";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stableOrder } from "./stable-order";
import { pinnedRep } from "@workspace/v2-affordances";
import { useAffordance } from "@workspace/v2-affordances/react";
import type { Score } from "@workspace/v2-core";
import { annotate, CompactFace, ObjectChip, type Annotation } from "@workspace/v2-views";
import { decodeState, defaultRepOf, objectTypeOf, objectWord, useDigest, useGame, useGameScope, useMoves, useMyObject, useMyRule, useObjectIds, useReplaySource, useSpectatorObjectIds, type GameRule, useOthersBlurred } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { usePaneOps } from "@/dock/open-pane";
import { VirtualRows } from "@/components/virtual-rows";
import { BitsHelp } from "@/core/score-help";
import { listMaxHeight } from "@/lib/virtual-window";
import { contestedLines, foldTugs } from "./tug-of-war";
import { toast } from "@/hooks/use-toast";
import { AffordanceButton } from "@/site/components/action";
import { digestScale, payoffRect, serverSort, SORTS, whyLine, widen, type PayoffScale } from "./lines";

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
      <span className="inline-flex items-center gap-1">{swatch(YOURS)}width: <span style={{ color: YOURS }}>your bits</span></span>
      <span className="inline-flex items-center gap-1">{swatch(OTHERS)}height: <span style={{ color: OTHERS }}>others' bits</span></span>
      <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-2.5 w-3" style={{ background: AREA }} />area: your points</span>
      <BitsHelp testId="button-bits-help-lines" />
      <span className="basis-full" data-testid="text-others-note">{othersNote(word.one)}{blurred ? ` ${BLURRED_NOTE}` : ""}</span>
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
    </label>
  );
}

function LineRow({ objectId, number, rule, value, rep, scale, focused, contested, onOpen, variant }: {
  objectId: string; number: number; rule: GameRule | null; value: ((u: Score) => number) | null; rep: string; scale: PayoffScale; focused: boolean; contested: boolean; onOpen: (objectId: string) => void; variant: string;
}) {
  const blurred = useOthersBlurred();
  const o = useMyObject(objectId);
  const word = objectWord(variant);
  const state = useMemo(() => (o ? decodeState(o.state, variant) : null), [o?.state, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const a: Annotation | null = useMemo(() => (rule && state ? annotate(rule, state) : null), [rule, state]);
  const open = () => onOpen(objectId);
  const shell = (body: ReactNode) => (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      data-testid={`row-line-${number}`} aria-label={`Open ${word.one} ${number}`} aria-current={focused || undefined}
      className={`flex h-full min-w-0 cursor-pointer items-start gap-3 overflow-hidden border-t border-[hsl(var(--card-border))] px-3 py-2 hover:bg-muted/50 ${focused ? "bg-primary/10" : ""}`}>
      {body}
    </div>
  );
  if (o && isPaid(o) && o.knownAt === null) return shell(<span className="text-xs text-muted-foreground" data-testid={`text-seen-line-${number}`}>{word.One} {number}: {seenShort(o)}</span>);
  if (!o || !state || !variant) return shell(<span className="text-xs text-muted-foreground">{word.One} {number} …</span>);
  const v = o.value;
  const main = a?.sites[0]?.parts[0];
  return shell(<>
    <div className="shrink-0" data-testid={`marks-line-${number}`} data-rep={rep}>
      {rule ? <CompactFace rule={rule} state={state} annotation={a ?? undefined} rep={rep} value={value ?? undefined} toScore /> : <ObjectChip type={objectTypeOf(variant)} state={state} />}
    </div>
    <div className="min-w-0 flex-1 space-y-1.5 text-xs">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{word.One} {number}</span>
        {contested && <span className="border border-destructive/60 px-1 text-[10px] font-medium uppercase text-destructive" data-testid={`badge-contested-line-${number}`}
          title={`Your agent and another player's keep moving this ${word.one} back and forth: both of you burn energy. Talk to them.`}>tug-of-war</span>}
        {v && <span data-testid={`text-points-line-${number}`}>{bitsText(v.rarityBits)} · <b>{pointsText(v.points)}</b></span>}
        {isPaid(o) && <span className="text-muted-foreground" data-testid={`text-seen-line-${number}`} title={seenWords(o) ?? undefined}>{seenShort(o)}</span>}
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

/** In a game with paid looks: what you see is as last seen; one press pays to see every one as it is now. */
function LookAll({ firstId, many }: { firstId: string | null; many: string }) {
  const first = useMyObject(firstId);   // the first row's own subscription: a paid game's reads carry knownAt
  if (!isPaid(first)) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-xs text-muted-foreground" data-testid="look-all">
      <span>You see the {many} as you last saw them. Looking costs energy.</span>
      <AffordanceButton id="object.look" args={{}} label={`Look at every ${many.replace(/s$/, "")} now`} busyLabel="Looking…" tone="quiet" className="px-2 py-1 text-xs" testId="button-look-all" />
    </div>
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
  const ids = useObjectIds(serverSort(view.objects.sort));
  const openObject = useAffordance("view.openObject");
  const panes = usePaneOps(useReplaySource() ? "replay" : header?.phase ?? "live");
  const scale = useMemo(() => digestScale(digest?.packed), [digest?.packed]);
  const rule = my?.rule ?? null;
  const rep = rule ? pinnedRep(view, rule.family.id, my!.row.primary) : defaultRepOf(header?.variant);
  const onOpen = useCallback(async (objectId: string) => {
    // The pane first (the arrangement on screen kept, at most five), then the line in it.
    if (!await panes.open("object")) return;
    try { await openObject.run({ objectId }); }
    catch (e) { toast({ title: `The ${objectWord(header?.variant).one} did not open`, description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  }, [panes, openObject]);
  const { status, loadMore } = ids;
  // Hold the order while the player points at the list (and a second after a tap): the rows must not move under them.
  const [hold, setHold] = useState<string[] | null>(null);
  const holdRef = useRef<{ order: string[] | null; timer?: ReturnType<typeof setTimeout> }>({ order: null });
  const results = useMemo(() => stableOrder(hold, ids.results), [hold, ids.results]);
  const grab = () => { clearTimeout(holdRef.current.timer); if (!holdRef.current.order) { holdRef.current.order = results.map(r => r.objectId); setHold(holdRef.current.order); } };
  const release = (after: number) => { clearTimeout(holdRef.current.timer); holdRef.current.timer = setTimeout(() => { holdRef.current.order = null; setHold(null); }, after); };
  useEffect(() => () => clearTimeout(holdRef.current.timer), []);
  const onNearEnd = useCallback(() => { if (status === "CanLoadMore") loadMore(30); }, [status, loadMore]);
  if (status === "LoadingFirstPage") return <p className="p-4 text-sm text-muted-foreground">Loading your lines…</p>;
  if (!results.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="lines-empty">
        When the world starts, its lines appear here, best for you first: each drawn the way your rule reads it, with a rectangle whose width is
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
      <LookAll firstId={results[0]?.objectId ?? null} many={objectWord(header?.variant).many} />
      <VirtualRows rows={results} rowHeight={ROW_H} maxHeight={maxHeight} keyOf={r => r.objectId} onNearEnd={onNearEnd} testId="lines-list"
        render={r => <LineRow objectId={r.objectId} number={r.number} rule={rule} value={my?.bits ?? null} rep={rep} scale={scale} focused={view.focus?.objectId === r.objectId} contested={contested.has(r.objectId)} onOpen={onOpen} variant={header?.variant ?? ""} />} />
    </div>
  );
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
    </div>
  );
}

export function LinesPane() {
  return useGameScope().seated ? <SeatedLines /> : <SpectatorLines />;
}
