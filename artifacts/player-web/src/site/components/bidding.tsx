/**
 * The bidding screen of the room page (integration plan §5.9; docs/bid-phase.md): while the room's start is in its
 * bid phase, every seated human may bid a handicap (whole percents off their own final total) on the rule families
 * they want, or pass; spectators watch the clock and the owner may cancel (archive/engine-v1 site/components/bidding.tsx,
 * its layout and words). Bids are sealed unless the room bids in the open. Every change goes through the `bid.*`
 * affordances; the screen reads one live query (`v2/bids:state`).
 */
import { useEffect, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { bidExample, doneLine, everyonesBids, primaryLabel } from "@/site/lib/open-bids";
import { AffordanceButton, failureText } from "@/site/components/action";
import { useNow } from "@/core/game-timer";
import { bitsText, chanceText, clock } from "@/core/words";
import { ErrorLine } from "@/site/components/page-parts";
import { errMsg } from "@/site/lib/errors";

const CHIPS = [5, 10, 20, 40];

function FamilyRow({ family, title, card, top, mine, busy, onBid, onWithdraw }: {
  family: string; title: string; card: string; top: number; mine?: number; busy: boolean;
  onBid(percent: number): void; onWithdraw(): void;
}) {
  const [text, setText] = useState(mine ? String(mine) : "");
  // The box follows the bid as it stands (a chip, or taking it back).
  useEffect(() => { setText(mine ? String(mine) : ""); }, [mine]);
  const percent = Math.round(Number(text));
  const valid = Number.isFinite(percent) && percent >= 1 && percent <= 100;
  return (
    <li className="space-y-2 px-4 py-3" data-testid={`bid-family-${family}`}>
      <p className="font-medium">{title} <span className="text-xs font-normal text-muted-foreground">measured to {bitsText(top)} ({chanceText(top)} by chance), rarer scores worth more</span></p>
      <p className="text-sm text-muted-foreground">{card}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {mine ? <span data-testid={`text-my-bid-${family}`}>Your bid: {mine}% off your final total.</span> : <span className="text-muted-foreground">No bid.</span>}
        {CHIPS.map(c => <button key={c} type="button" disabled={busy} className="border px-2 py-1 disabled:opacity-50" onClick={() => onBid(c)} data-testid={`button-bid-${family}-${c}`}>{c}%</button>)}
        <input value={text} onChange={e => setText(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label={`Your bid on ${title}, in percent`} className="h-8 w-16 border px-2" placeholder="%"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!busy && valid) onBid(percent); } }} data-testid={`input-bid-${family}`} />
        <button type="button" disabled={busy || !valid} className="border px-2 py-1 disabled:opacity-50" onClick={() => onBid(percent)} data-testid={`button-bid-${family}`}>Bid</button>
        {mine ? <button type="button" disabled={busy} className="underline underline-offset-4 text-muted-foreground" onClick={onWithdraw} data-testid={`button-withdraw-${family}`}>Take it back</button> : null}
      </div>
    </li>
  );
}

/** Open bidding (the room's bid visibility; v1's EveryonesBids): every player's bids per rule, live, highest first. */
function EveryonesBids({ rules }: { rules: ReturnType<typeof everyonesBids> }) {
  return (
    <div className="space-y-2 border-t px-4 py-3 text-sm" data-testid="panel-everyones-bids" aria-live="polite">
      <h3 className="font-semibold">Everyone's bids</h3>
      {rules.length === 0 ? <p className="text-muted-foreground">Nobody has bid yet.</p> : (
        <ul className="space-y-1">
          {rules.map(r => (
            <li key={r.family} className="flex flex-wrap gap-x-2" data-testid={`row-everyones-bids-${r.family}`}>
              <span>{r.title}:</span>
              <span>{r.bids.map((b, i) => (
                <span key={`${b.who}-${i}`}>{i > 0 && ", "}<span className={`whitespace-nowrap ${b.mine ? "font-semibold text-primary" : ""}`}>{b.who} <span className="font-mono tabular-nums">{b.percent}%</span></span></span>
              ))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The bid phase's clock, re-rendered alone twice a second. */
function Countdown({ deadline }: { deadline: number }) {
  const now = useNow(500);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <div role="timer" aria-live="off" className="font-mono" data-testid="bidding-countdown"><span className="text-xs text-muted-foreground">Ends in </span><span className="text-2xl font-semibold tabular-nums">{clock(left)}</span></div>;
}

/** The owner's way out (v1's CancelBidding; W3 #888): every bid forgotten, nothing dealt. */
const CancelBidding = () => (
  <AffordanceButton id="bid.cancel" args={{}} label="Cancel bidding" busyLabel="Cancelling…" tone="quiet" className="px-2 py-1 text-xs" testId="button-cancel-bidding"
    confirmText="Cancel the bidding? Every bid is forgotten and nobody's bid is dealt: the rules are dealt as usual." />
);

/**
 * The bid phase on the room page (v1's layout and words): a bidder gets "Bid for your rule", the rules on offer, their
 * bids, and one primary button (Pass with no bids, Done bidding with some; then "Change my bids"); a spectator or a
 * member who joined after the start watches the clock; the owner may cancel either way.
 */
export function Bidding({ roomId, owner }: { roomId: string; owner: boolean }) {
  const q = useLive(api.v2.bids.state, { roomId });
  const place = useAffordance("bid.place");
  const withdraw = useAffordance("bid.withdraw");
  const done = useAffordance("bid.done");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  const head = (title: string) => (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <h2 className="min-w-0 flex-1 font-semibold" data-testid="text-bidding-title">{title}</h2>
      {s?.deadline && <Countdown deadline={s.deadline} />}
    </header>
  );
  if (q.error) return <ErrorLine message={`The bidding could not load: ${errMsg(q.error)}`} />;
  if (!s?.open) return null;
  const act = async (f: () => Promise<unknown>) => { setBusy(true); setError(null); try { await f(); } catch (e) { setError(failureText(e)); } finally { setBusy(false); } };
  const waitingFor = s.players.filter(p => !p.done).length;
  if (!s.bidder) {
    return (
      <section className="border-2 border-primary bg-card" data-testid="panel-bidding" data-seated="false">
        {head("The players are bidding for their rules")}
        <p className="px-4 py-3 text-sm" data-testid="text-bidding-watch">
          {s.players.length} players bid for the rule they want, or pass. The rules are dealt and the game starts by itself when everyone is done or the time is up.
        </p>
        <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm">
          {owner && <CancelBidding />}
          <span className="text-muted-foreground" data-testid="text-bidding-players">{s.players.map(p => `${p.name}${p.done ? " ✓" : ""}`).join(" · ")}</span>
        </footer>
      </section>
    );
  }
  const title = (f: string) => s.families.find(x => x.family === f)?.title ?? f;
  return (
    <section className="border-2 border-primary bg-card" data-testid="panel-bidding" data-seated="true" data-done={s.done ? "true" : "false"}>
      {head("Bid for your rule")}
      <div className="space-y-1 px-4 py-3 text-sm">
        <p className="text-muted-foreground" data-testid="text-bidding-example">{bidExample(s.pricing)}</p>
        <p className="text-muted-foreground" data-testid="text-bidding-visibility">{s.visibility === "open" ? "Bids are open: every player sees everyone's bids as they change." : "Bids are secret: the other players do not see yours."}</p>
      </div>
      {!s.done && (
        <ul className="divide-y border-t">
          {s.families.map(f => {
            const mine = s.mine.find(b => b.family === f.family)?.percent;
            return <FamilyRow key={f.family} {...f} mine={mine} busy={busy || !place.available}
              onBid={p => void act(() => place.run({ family: f.family, percent: p }))} onWithdraw={() => void act(() => withdraw.run({ family: f.family }))} />;
          })}
        </ul>
      )}
      {s.visibility === "open" && <EveryonesBids rules={everyonesBids(s.families, s.others, s.mine)} />}
      <footer className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1" aria-live="polite">
          {s.done && <p className="font-medium" data-testid="text-bidding-waiting">{doneLine(s.mine, waitingFor)}</p>}
          <p data-testid="text-your-bids"><span className="text-muted-foreground">Your bids: </span>
            {s.mine.length ? s.mine.map((b, i) => <span key={b.family}>{i > 0 && ", "}<span className="whitespace-nowrap">{title(b.family)} <span className="font-mono font-semibold tabular-nums">{b.percent}%</span></span></span>) : s.done ? "none" : "none yet"}
          </p>
          {error && <p className="text-destructive" role="alert">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {s.done ? (
            <button type="button" disabled={busy || !done.available} className="underline underline-offset-4 disabled:opacity-50" onClick={() => void act(() => done.run({ done: false }))} data-testid="button-bidding-change">Change my bids</button>
          ) : (
            <button type="button" disabled={busy || !done.available} className="bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-50" onClick={() => void act(() => done.run({}))} data-testid="button-bidding-done">
              {primaryLabel(s.mine)}
            </button>
          )}
          {owner && <CancelBidding />}
          <span className="text-muted-foreground" data-testid="text-bidding-players">{s.players.map(p => `${p.name}${p.done ? " ✓" : ""}`).join(" · ")}</span>
        </div>
      </footer>
    </section>
  );
}
