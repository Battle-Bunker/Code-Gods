/**
 * The bidding screen of the room page (integration plan §5.9; docs/bid-phase.md): while the room's start is in its
 * bid phase, every seated human may bid a handicap (whole percents off their own final total) on the rule families
 * they want, or pass. Bids are sealed: nothing here shows another player's. Every change goes through the `bid.*`
 * affordances; the screen reads one live query (`v2/bids:state`).
 */
import { useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { failureText } from "@/site/components/action";
import { useNow } from "@/core/game-timer";
import { clock, rarityText } from "@/core/words";
import { ErrorLine } from "@/site/components/page-parts";
import { errMsg } from "@/site/lib/errors";

const CHIPS = [5, 10, 20, 40];

function FamilyRow({ family, title, card, top, mine, busy, onBid, onWithdraw }: {
  family: string; title: string; card: string; top: number; mine?: number; busy: boolean;
  onBid(percent: number): void; onWithdraw(): void;
}) {
  const [text, setText] = useState(mine ? String(mine) : "");
  const percent = Math.round(Number(text));
  const valid = Number.isFinite(percent) && percent >= 1 && percent <= 100;
  return (
    <li className="space-y-2 px-4 py-3" data-testid={`bid-family-${family}`}>
      <p className="font-medium">{title} <span className="text-xs font-normal text-muted-foreground">top of its ladder {rarityText(top)}</span></p>
      <p className="text-sm text-muted-foreground">{card}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {mine ? <span data-testid={`text-my-bid-${family}`}>Your bid: {mine}% off your final total.</span> : <span className="text-muted-foreground">No bid.</span>}
        {CHIPS.map(c => <button key={c} type="button" disabled={busy} className="border px-2 py-1 disabled:opacity-50" onClick={() => onBid(c)} data-testid={`button-bid-${family}-${c}`}>{c}%</button>)}
        <input value={text} onChange={e => setText(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label={`Your bid on ${title}, in percent`} className="h-8 w-16 border px-2" placeholder="%" />
        <button type="button" disabled={busy || !valid} className="border px-2 py-1 disabled:opacity-50" onClick={() => onBid(percent)} data-testid={`button-bid-${family}`}>Bid</button>
        {mine ? <button type="button" disabled={busy} className="underline underline-offset-4 text-muted-foreground" onClick={onWithdraw} data-testid={`button-withdraw-${family}`}>Take it back</button> : null}
      </div>
    </li>
  );
}

export function Bidding({ roomId }: { roomId: string }) {
  const q = useLive(api.v2.bids.state, { roomId });
  const place = useAffordance("bid.place");
  const withdraw = useAffordance("bid.withdraw");
  const done = useAffordance("bid.done");
  const now = useNow(500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  if (q.error) return <ErrorLine message={`The bidding could not load: ${errMsg(q.error)}`} />;
  if (!s?.open) return null;
  const act = async (f: () => Promise<unknown>) => { setBusy(true); setError(null); try { await f(); } catch (e) { setError(failureText(e)); } finally { setBusy(false); } };
  const left = s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : 0;
  const canBid = place.available && !s.done;
  return (
    <section className="border-2 border-primary bg-card" data-testid="panel-bidding">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Bid for the rule you want</h2>
          <p className="text-sm text-muted-foreground">Bid a share of your own final total on a rule family; the highest bid wins that family for its bidder alone. Bids are secret: the other players do not see yours. Or pass, and you are dealt a rule as usual.</p>
        </div>
        <div role="timer" aria-live="off" className="font-mono" data-testid="bidding-countdown"><span className="text-xs text-muted-foreground">Ends in </span><span className="text-2xl font-semibold tabular-nums">{clock(left)}</span></div>
      </header>
      {canBid ? (
        <ul className="divide-y">
          {s.families.map(f => {
            const mine = s.mine.find(b => b.family === f.family)?.percent;
            return <FamilyRow key={f.family} {...f} mine={mine} busy={busy}
              onBid={p => void act(() => place.run({ family: f.family, percent: p }))} onWithdraw={() => void act(() => withdraw.run({ family: f.family }))} />;
          })}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm" data-testid="text-bidding-waiting">{s.done ? "You're done bidding. The rules are dealt when everyone is done or the clock runs out." : place.reason ?? "The players are bidding for their rules."}</p>
      )}
      {error && <p className="px-4 pb-2 text-sm text-destructive" role="alert">{error}</p>}
      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm">
        {canBid && (
          <button type="button" disabled={busy || !done.available} className="bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-50" onClick={() => void act(() => done.run({}))} data-testid="button-bidding-done">
            {s.mine.length ? "Done bidding" : "Pass"}
          </button>
        )}
        <span className="text-muted-foreground" data-testid="text-bidding-players">{s.players.map(p => `${p.name}${p.done ? " ✓" : ""}`).join(" · ")}</span>
      </footer>
    </section>
  );
}
