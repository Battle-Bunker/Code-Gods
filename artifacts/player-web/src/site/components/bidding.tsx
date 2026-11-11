/**
 * The bidding screen of the room page (docs/bid-phase.md; engine convex/bidding.ts): while a start is in its bid
 * phase, every player may bid a handicap (a percentage off their own final score) on the rules they want, or pass.
 * One primary button (Pass with no bids, Done bidding with some); every change is sent at once and shows at once (an
 * optimistic update of the viewer's one `bidding.mine` subscription, undone by Convex if the engine refuses).
 * Spectators and members who joined after the start watch the clock; the owner may cancel. Bids are sealed: nothing
 * here shows another player's.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api, useLive } from "@/site/lib/convex";
import type { RoomState } from "@/site/lib/types";
import { usePage } from "@/site/components/layout";
import { errMsg } from "@/site/lib/errors";
import { routeHref } from "@/core/routes";
import { galleryFamilies, gallerySearch, instOf } from "@/site/lib/rule-gallery";
import {
  BID_CHIPS, bidExample, bidSummary, countdownText, doneLine, everyonesBids, parsePercent, placeBid, primaryLabel, secondsLeft, stepPercent, withdrawBid,
  type Bid, type BidFamily, type RoomBidding, type TableRow,
} from "@/site/lib/bidding";
import { Spinner } from "@/components/ui/spinner";
import { Minus, Plus } from "lucide-react";

function useNow(ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** The bid phase's clock: read on request by a screen reader, never announced every second. */
function Countdown({ endsAt }: { endsAt: number }) {
  const now = useNow();
  const text = countdownText(endsAt, now), left = secondsLeft(endsAt, now);
  return (
    <div role="timer" aria-live="off" aria-label={left > 0 ? `Bidding ends in ${left} seconds` : "Bidding is ending"}
      className="flex shrink-0 items-baseline gap-2 font-mono" data-testid="bidding-countdown">
      <span className="label-mono text-xs text-muted-foreground">Ends in</span>
      <span className={`text-2xl font-semibold tabular-nums sm:text-3xl ${left > 0 && left <= 10 ? "text-primary" : ""}`} data-testid="bidding-countdown-value">{text}</span>
    </div>
  );
}

/** The owner's way out: the room's end command, which cancels a bid phase (nothing is dealt). Two presses, as other one-way actions here. */
function CancelBidding() {
  const { act } = usePage();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={pending} data-testid="button-cancel-bidding"
        className={`min-h-11 text-sm underline underline-offset-4 disabled:opacity-50 ${armed ? "text-destructive font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => {
          if (!armed) { setArmed(true); return; }
          setPending(true); setError(null);
          act.endGame().catch(e => setError(errMsg(e))).finally(() => { setPending(false); setArmed(false); });
        }}>
        {armed ? "Press again to cancel the bidding" : "Cancel bidding"}
      </button>
      {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
    </span>
  );
}

/** One rule of the pool: what it is, the viewer's bid on it, and the controls that change it. */
function FamilyCard({ family, bid, min, max, href, others, onPlace, onWithdraw }: {
  family: BidFamily; bid: number | undefined; min: number; max: number; href: string | null;
  /** Open bidding: everyone's bids on this rule, highest first (absent while bids are secret). */
  others?: readonly { godId: string; name: string; percent: number; mine: boolean }[];
  onPlace: (percent: number) => Promise<unknown>; onWithdraw: () => Promise<unknown>;
}) {
  const inputId = useId();
  const [raw, setRaw] = useState(bid === undefined ? "" : String(bid));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  // The field follows the bid (a chip, the stepper, another tab) unless it is being typed in.
  useEffect(() => { if (!focused) setRaw(bid === undefined ? "" : String(bid)); }, [bid, focused]);
  const send = (call: Promise<unknown>) => {
    setError(null); setPending(n => n + 1);
    call.catch(e => setError(errMsg(e))).finally(() => setPending(n => n - 1));
  };
  const place = (percent: number) => { if (percent !== bid) send(onPlace(percent)); };
  const commit = () => {
    if (raw.trim() === "") { setError(null); setRaw(bid === undefined ? "" : String(bid)); return; }
    const parsed = parsePercent(raw, min, max);
    if ("error" in parsed) { setError(parsed.error); return; }
    place(parsed.percent);
  };
  const down = stepPercent(bid, -1, min, max), up = stepPercent(bid, 1, min, max);
  const step = "inline-flex h-11 w-11 items-center justify-center border bg-background hover:bg-muted disabled:opacity-35 disabled:hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <li className={`flex flex-col gap-3 border p-3 sm:p-4 ${bid !== undefined ? "border-primary bg-primary/5" : "bg-background"}`} data-testid={`bid-family-${family.id}`} data-bid={bid ?? ""}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-3xl leading-none">{family.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{family.name}</h3>
          <p className="text-sm text-muted-foreground">{family.theme}</p>
        </div>
        {bid !== undefined && <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-primary" data-testid={`text-bid-${family.id}`}>{bid}%</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Your bid on ${family.name}`}>
        {BID_CHIPS.filter(c => c >= min && c <= max).map(c => (
          <button key={c} type="button" aria-pressed={bid === c} onClick={() => place(c)} data-testid={`chip-bid-${family.id}-${c}`}
            className={`h-11 min-w-12 border px-2 text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${bid === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {c}%
          </button>
        ))}
        <span className="inline-flex items-center">
          <button type="button" className={step} disabled={down === null} onClick={() => down !== null && place(down)} aria-label={`Bid 1% less on ${family.name}`} data-testid={`button-bid-less-${family.id}`}><Minus aria-hidden className="h-4 w-4" /></button>
          <label htmlFor={inputId} className="sr-only">Your bid on {family.name}, in percent ({min} to {max})</label>
          <input id={inputId} inputMode="numeric" autoComplete="off" value={raw} placeholder="%" aria-invalid={!!error || undefined}
            onChange={e => { setRaw(e.target.value); setError(null); }} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); commit(); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
            className={`h-11 w-12 border-y bg-background text-center font-mono text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring ${error ? "border-destructive" : ""}`}
            data-testid={`input-bid-${family.id}`} />
          <button type="button" className={step} disabled={up === null} onClick={() => up !== null && place(up)} aria-label={`Bid 1% more on ${family.name}`} data-testid={`button-bid-more-${family.id}`}><Plus aria-hidden className="h-4 w-4" /></button>
        </span>
        {pending > 0 && <Spinner aria-label="Saving your bid" className="size-4 text-muted-foreground" />}
      </div>
      {others && (
        <p className="text-sm text-muted-foreground" data-testid={`text-all-bids-${family.id}`}>
          {others.length ? <>Bids: {others.map((b, i) => <span key={b.godId}>{i > 0 && ", "}<span className={`whitespace-nowrap ${b.mine ? "font-semibold text-foreground" : ""}`}>{b.mine ? "you" : b.name} {b.percent}%</span></span>)}</> : "No bids yet"}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        {href
          ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center underline underline-offset-4 decoration-border hover:decoration-foreground" data-testid={`link-bid-card-${family.id}`}
              aria-label={`See the full card of ${family.name} (opens in a new tab)`}>See the full card</a>
          : <span />}
        {bid !== undefined && (
          <button type="button" className="inline-flex min-h-9 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => send(onWithdraw())} data-testid={`button-bid-remove-${family.id}`}
            aria-label={`Remove your bid on ${family.name}`}>Remove bid</button>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert" data-testid={`error-bid-${family.id}`}>{error}</p>}
    </li>
  );
}

function YourBids({ bids, families, done }: { bids: readonly Bid[]; families: readonly BidFamily[]; done: boolean }) {
  const rows = bidSummary(bids, families);
  return (
    <p className="min-w-0 text-sm" data-testid="text-your-bids">
      <span className="text-muted-foreground">Your bids: </span>
      {rows.length ? rows.map((r, i) => <span key={r.familyId}>{i > 0 && ", "}<span className="whitespace-nowrap">{r.name} <span className="font-mono font-semibold tabular-nums">{r.percent}%</span></span></span>) : done ? "none" : "none yet"}
    </p>
  );
}

/** Open bidding (the setup's bid visibility): every player's bids per rule, live, highest first; who is done. */
function EveryonesBids({ table, families, meId }: { table: readonly TableRow[]; families: readonly BidFamily[]; meId?: string }) {
  const rules = everyonesBids(table, families, meId);
  return (
    <div className="space-y-2 border-t px-4 py-3 text-sm" data-testid="panel-everyones-bids" aria-live="polite">
      <h3 className="font-semibold">Everyone's bids</h3>
      {rules.length === 0 ? <p className="text-muted-foreground">Nobody has bid yet.</p> : (
        <ul className="space-y-1">
          {rules.map(r => (
            <li key={r.familyId} className="flex flex-wrap gap-x-2" data-testid={`row-everyones-bids-${r.familyId}`}>
              <span><span aria-hidden>{r.emoji} </span>{r.name}:</span>
              <span>{r.bids.map((b, i) => (
                <span key={b.godId}>{i > 0 && ", "}<span className={`whitespace-nowrap ${b.mine ? "font-semibold text-primary" : ""}`}>{b.mine ? "you" : b.name} <span className="font-mono tabular-nums">{b.percent}%</span></span></span>
              ))}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground" data-testid="text-bidders-done">
        {table.map((p, i) => <span key={p.godId}>{i > 0 && " · "}{p.godId === meId ? "You" : p.name}: {p.done ? "done" : "bidding"}</span>)}
      </p>
    </div>
  );
}

/** The room's open bid phase, for whoever is looking: a player bids or passes; everyone else watches the clock. */
export function Bidding({ room, bidding, isOwner, meId }: { room: RoomState; bidding: RoomBidding; isOwner: boolean; meId?: string }) {
  const args = useMemo(() => ({ roomId: room.id }), [room.id]);
  const mine = useLive(api.bidding.mine, args);
  const view = mine.data;
  const placeBase = useMutation(api.bidding.place), withdrawBase = useMutation(api.bidding.withdraw), doneBase = useMutation(api.bidding.done);
  // The viewer's own bids change at once in the one subscription every part of the screen reads; a refusal undoes it.
  const place = useMemo(() => placeBase.withOptimisticUpdate((store, a) => {
    const cur = store.getQuery(api.bidding.mine, { roomId: a.roomId });
    if (cur) store.setQuery(api.bidding.mine, { roomId: a.roomId }, { ...cur, bids: placeBid(cur.bids, a.familyId, a.percent), done: false, waitingFor: cur.waitingFor + (cur.done ? 1 : 0) });
  }), [placeBase]);
  const withdraw = useMemo(() => withdrawBase.withOptimisticUpdate((store, a) => {
    const cur = store.getQuery(api.bidding.mine, { roomId: a.roomId });
    if (cur) store.setQuery(api.bidding.mine, { roomId: a.roomId }, { ...cur, bids: withdrawBid(cur.bids, a.familyId), done: false, waitingFor: cur.waitingFor + (cur.done ? 1 : 0) });
  }), [withdrawBase]);
  const setDone = useMemo(() => doneBase.withOptimisticUpdate((store, a) => {
    const cur = store.getQuery(api.bidding.mine, { roomId: a.roomId });
    const done = a.done ?? true;
    if (cur && cur.done !== done) store.setQuery(api.bidding.mine, { roomId: a.roomId }, { ...cur, done, waitingFor: Math.max(0, cur.waitingFor + (done ? -1 : 1)) });
  }), [doneBase]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finish = (done: boolean) => {
    setPending(true); setError(null);
    setDone({ roomId: room.id, done }).catch(e => setError(errMsg(e))).finally(() => setPending(false));
  };

  // "See the full card": the rule's page in the gallery, on this room's board (a new tab: the clock is running here).
  const cardHref = useMemo(() => {
    try {
      const setup = { objectType: room.objectInstance.objectType, typeArgs: room.objectInstance.args };
      const annotated = new Set(galleryFamilies(instOf(setup)));
      const search = gallerySearch(setup);
      return (id: string) => (annotated.has(id) ? routeHref(import.meta.env.BASE_URL, { kind: "ruleFamily", family: id }, search) : null);
    } catch { return () => null; }
  }, [room.objectInstance]);

  const seated = !!view?.seated;
  // Done hides the rules, so the screen gets much shorter: keep its top (the clock, "You are done…") on screen.
  const panel = useRef<HTMLElement>(null);
  const done = !!view?.done;
  useEffect(() => {
    const el = panel.current;
    if (done && el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [done]);
  const frame = "border-2 border-primary bg-card";
  const head = (title: string) => (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <h2 className="font-display text-3xl leading-none md:text-4xl" data-testid="text-bidding-title">{title}</h2>
      <Countdown endsAt={bidding.endsAt} />
    </div>
  );

  if (mine.error) {
    return (
      <section className={`${frame} space-y-3 px-4 py-4`} data-testid="panel-bidding" aria-label="Bidding">
        {head("The players are bidding for their rules")}
        <p className="text-sm text-destructive" role="alert">{errMsg(mine.error)}</p>
        {isOwner && <CancelBidding />}
      </section>
    );
  }
  if (!view || !seated) {
    // A spectator, a member who joined after the start, or the first moment before the viewer's own view arrives.
    return (
      <section className={`${frame} space-y-3 px-4 py-4`} data-testid="panel-bidding" data-seated="false" aria-label="Bidding">
        {head("The players are bidding for their rules")}
        <p className="max-w-[68ch] text-sm" data-testid="text-bidding-watch">
          {bidding.players} players have {bidding.seconds} seconds to bid for the rule they want, or pass. The rules are dealt and the game starts by itself when everyone is done or the time is up.
          {view && !isOwner ? " You watch this game." : ""}
        </p>
        {isOwner && <CancelBidding />}
      </section>
    );
  }

  const bidOn = new Map(view.bids.map(b => [b.familyId, b.percent]));
  const allBids = view.table ? new Map(everyonesBids(view.table, view.families, meId).map(r => [r.familyId, r.bids])) : null;
  return (
    <section ref={panel} className={`${frame} scroll-mt-20`} data-testid="panel-bidding" data-seated="true" data-done={view.done ? "true" : "false"} aria-label="Bidding">
      <div className="space-y-3 px-4 pt-4 pb-4">
        {head("Bid for your rule")}
        <div className="max-w-[72ch] space-y-1 text-sm">
          <p data-testid="text-bidding-meaning">{view.meaning}</p>
          <p className="text-muted-foreground" data-testid="text-bidding-example">{bidExample(view.pricing)}</p>
          <p className="text-muted-foreground" data-testid="text-bidding-visibility">
            {view.table ? "Bids are open: every player sees everyone's bids as they change." : "Bids are secret: the other players do not see yours."}
          </p>
        </div>
      </div>
      {!view.done && (
        <ul className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="The rules you can bid on" data-testid="list-bid-families">
          {view.families.map(f => (
            <FamilyCard key={f.id} family={f} bid={bidOn.get(f.id)} min={view.minPercent} max={view.maxPercent} href={cardHref(f.id)} others={allBids ? allBids.get(f.id) ?? [] : undefined}
              onPlace={percent => place({ roomId: room.id, familyId: f.id, percent })} onWithdraw={() => withdraw({ roomId: room.id, familyId: f.id })} />
          ))}
        </ul>
      )}
      {view.table && <EveryonesBids table={view.table} families={view.families} meId={meId} />}
      {/* The one button stays in reach: the bar sticks to the bottom of the screen while the rules scroll. */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="bar-bidding">
        <div className="min-w-0 space-y-1" aria-live="polite">
          {view.done && <p className="font-medium" data-testid="text-bidding-done">{doneLine(view.bids, view.waitingFor)}</p>}
          <YourBids bids={view.bids} families={view.families} done={view.done} />
          {error && <p className="text-sm text-destructive" role="alert" data-testid="error-bidding">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:flex-nowrap">
          {view.done ? (
            <button type="button" disabled={pending} onClick={() => finish(false)} data-testid="button-bidding-change"
              className="min-h-11 text-sm underline underline-offset-4 hover:decoration-foreground disabled:opacity-50">Change my bids</button>
          ) : (
            <button type="button" aria-busy={pending || undefined} onClick={() => { if (!pending) finish(true); }} data-testid="button-bidding-done"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:min-w-44">
              {pending && <Spinner aria-hidden className="size-4" />}{primaryLabel(view.bids)}
            </button>
          )}
          {isOwner && <CancelBidding />}
        </div>
      </div>
    </section>
  );
}

/** A bid phase that could not be dealt: why, as a failed preparation shows it (the owner starts again). */
export function BiddingFailed({ error }: { error: string }) {
  return (
    <section className="border bg-card px-4 py-3 space-y-2 text-sm" data-testid="panel-bidding-failed" aria-live="polite">
      <p className="text-destructive" role="alert" data-testid="text-bidding-error">Bidding failed: {error}</p>
    </section>
  );
}
