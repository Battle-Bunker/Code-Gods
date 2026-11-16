/**
 * Locks on one object (docs/engine-v2/locks.md; the owner, 16 November): each lock's predicate in plain words, its
 * energy now, its upkeep and roughly how long it lasts; adding or taking energy, priced before the press; and making a
 * lock from a ready-made predicate or one written in the agent code editor, checked against the object before paying.
 * Presentational: the data and the operations come in as props, so the One line pane and the gallery share it.
 */
import { useState, type ReactNode } from "react";
import { lockEnergyAt } from "@workspace/v2-core";
import { CodeBox, LanguageSelect, type CodeLanguage } from "@/components/code-editor";
import { energyText, num } from "@/core/words";
import { fundLine, lastsText, shareLine } from "./locks-model";

export interface LockView {
  readonly n: number;
  /** The plain words (or the program's own description). */
  readonly title: string;
  /** The predicate's program, when it is one (shown folded). */
  readonly code?: { readonly language: string; readonly source: string } | null;
  /** Complexity in bits: the program's description plus what it reads (what upkeep and the fee are proportional to). */
  readonly bits: number;
  readonly energy: number;
  readonly settledAt: number;
  /** Upkeep, energy a world second. */
  readonly rate: number;
  /** Everything put in (opening and funds) and taken out, and the viewer's own part (costly signalling, locks.md §5). */
  readonly added: number;
  readonly taken: number;
  readonly mine: { readonly added: number; readonly taken: number };
  /** Additions and withdrawals as amounts and world times; the viewer's own marked, nobody named while live. */
  readonly history: readonly { readonly at: number; readonly op: "create" | "fund" | "drain"; readonly amount: number; readonly mine: boolean }[];
}

export interface LockCheck {
  readonly meets: boolean;
  readonly words: string;
  readonly bits?: number;
  readonly fee?: number;
  readonly rate?: number;
  /** Why it cannot be made (a program that does not run, the object's lock limit). */
  readonly why?: string | null;
}

export interface LockStarter { readonly kind: string; readonly title: string; readonly language: CodeLanguage; readonly source: string; readonly words: string }

/** The small mark beside an object in a list or on the board when it has any live lock. */
export function LockMark({ count, testId }: { count: number; testId?: string }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" role="img" aria-label={`${count} lock${count === 1 ? "" : "s"}`}
      title={`${count} lock${count === 1 ? "" : "s"} on it`} data-testid={testId} data-locks={count}>
      <LockGlyph />{count > 1 ? count : null}
    </span>
  );
}

const LockGlyph = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="shrink-0">
    <rect x="3" y="7" width="10" height="7" rx="1" fill="currentColor" />
    <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const amountOf = (s: string): number => { const x = Number(s); return Number.isFinite(x) && x > 0 ? x : 0; };

function FundForm({ lock, held, myEnergy, onFund, onClose }: {
  lock: LockView; held: number; myEnergy: number; onFund: (n: number, amount: number) => Promise<unknown>; onClose: () => void;
}) {
  const [dir, setDir] = useState<"add" | "take">("add");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signed = (dir === "add" ? 1 : -1) * amountOf(amount);
  const line = fundLine({ amount: signed, lockEnergy: held, myEnergy });
  const go = async () => {
    if (!line.ok || busy) return;
    setBusy(true); setError(null);
    try { await onFund(lock.n, signed); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2 border-t pt-2" data-testid={`form-lock-fund-${lock.n}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Add or take away" className="inline-flex border">
          {(["add", "take"] as const).map(d => (
            <button key={d} type="button" role="radio" aria-checked={dir === d} onClick={() => { setDir(d); if (d === "take" && amountOf(amount) > held) setAmount(String(Math.floor(held * 100) / 100)); }}
              className={`px-2 py-1 text-xs ${dir === d ? "bg-foreground text-background" : ""}`} data-testid={`button-lock-${d}-${lock.n}`}>
              {d === "add" ? "Add energy" : "Take energy away"}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1 text-xs">
          <span className="sr-only">Amount</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            className="h-8 w-24 border bg-background px-2 text-sm" data-testid={`input-lock-amount-${lock.n}`} />
          energy
        </label>
      </div>
      <p className={`text-xs ${line.ok ? "text-muted-foreground" : "text-destructive"}`} data-testid={`text-lock-fund-price-${lock.n}`}>{line.text}</p>
      <div className="flex gap-2">
        <button type="button" aria-disabled={!line.ok || busy || undefined} onClick={() => void go()}
          className={`border px-3 py-1.5 text-sm font-medium ${!line.ok || busy ? "opacity-50" : ""}`} data-testid={`button-lock-fund-go-${lock.n}`}>
          {busy ? "Working…" : dir === "add" ? "Add it" : "Take it away"}
        </button>
        <button type="button" onClick={onClose} className="px-2 text-xs underline underline-offset-4">Cancel</button>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function LockRow({ lock, worldNow, myEnergy, onFund }: { lock: LockView; worldNow: number | null; myEnergy: number | null; onFund?: (n: number, amount: number) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const held = worldNow === null ? lock.energy : lockEnergyAt(lock, worldNow);
  return (
    <li className="py-2" data-testid={`lock-${lock.n}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-muted-foreground"><LockGlyph /></span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium" data-testid={`text-lock-words-${lock.n}`}>{lock.title}</p>
          <p className="text-xs text-muted-foreground" data-testid={`text-lock-energy-${lock.n}`}>
            {held > 0 ? <>Holds {energyText(held)} · drains {num(lock.rate)} a second · lasts {lastsText(held, lock.rate)}</> : "Drained: it no longer holds."}
          </p>
          {lock.code && (
            <details className="text-xs">
              <summary className="cursor-pointer select-none text-muted-foreground">Its program ({num(lock.bits)} bits)</summary>
              <pre className="mt-1 max-h-40 overflow-auto border bg-[hsl(var(--muted))]/40 p-2 font-mono text-xs" data-testid={`text-lock-source-${lock.n}`}>{lock.code.source}</pre>
            </details>
          )}
          <p className="text-xs" data-testid={`text-lock-share-${lock.n}`}>{shareLine(lock)}</p>
          {lock.history.length > 0 && (
            <details className="text-xs" data-testid={`lock-history-${lock.n}`}>
              <summary className="cursor-pointer select-none text-muted-foreground">Its history ({lock.history.length})</summary>
              <ol className="mt-1 space-y-0.5">
                {lock.history.map((h, i) => (
                  <li key={i} data-mine={h.mine || undefined}>
                    {Math.round(h.at)} s: {h.op === "create" ? "made with" : h.op === "fund" ? "added" : "took out"} {num(h.amount)}{h.mine ? " (you)" : ""}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
        {onFund && myEnergy !== null && held > 0 && !open && (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 border px-2 py-1 text-xs" data-testid={`button-lock-energy-${lock.n}`}>Energy…</button>
        )}
      </div>
      {open && onFund && myEnergy !== null && <FundForm lock={lock} held={held} myEnergy={myEnergy} onFund={onFund} onClose={() => setOpen(false)} />}
    </li>
  );
}

/** The locks on one object: the list, then "Lock this …" (when the viewer may make one). */
export function LocksSection({ locks, noun, worldNow, myEnergy, onFund, create }: {
  locks: readonly LockView[] | undefined;
  noun: string;
  worldNow: number | null;
  /** The viewer's energy, when they may spend (null: watching, ended, replay). */
  myEnergy: number | null;
  onFund?: (n: number, amount: number) => Promise<unknown>;
  create?: ReactNode;
}) {
  return (
    <section className="space-y-1 border-t pt-2" aria-labelledby="locks-heading" data-testid="locks">
      <h3 id="locks-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locks</h3>
      {locks === undefined ? <p className="text-xs text-muted-foreground">Loading the locks…</p>
        : locks.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="text-no-locks">No locks on this {noun}. Anyone may move it.</p>
        : (
          <>
            <p className="text-xs text-muted-foreground">A move that breaks a lock is refused until someone takes its energy away.</p>
            <ul className="divide-y">{locks.map(l => <LockRow key={l.n} lock={l} worldNow={worldNow} myEnergy={myEnergy} onFund={onFund} />)}</ul>
          </>
        )}
      {create}
    </section>
  );
}

/**
 * Making a lock: a ready-made predicate or one written in the code editor (or asked of the assistant), checked against
 * the object as it is now, with its information, fee and upkeep shown before the press.
 */
export function LockCreate({ noun, starters, myEnergy, check, onCreate, onAsk }: {
  noun: string;
  starters: readonly LockStarter[];
  myEnergy: number;
  check: (language: CodeLanguage, source: string, words: string) => Promise<LockCheck>;
  onCreate: (language: CodeLanguage, source: string, words: string, amount: number) => Promise<unknown>;
  onAsk?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<CodeLanguage>(starters[0]?.language ?? "python");
  const [source, setSource] = useState(starters[0]?.source ?? "");
  const [words, setWords] = useState(starters[0]?.words ?? "");
  const [checked, setChecked] = useState<{ source: string; r: LockCheck } | null>(null);
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState<"check" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!open) {
    return (
      <div className="pt-1">
        {done && <p className="text-xs" role="status" data-testid="text-lock-made">✓ Locked.</p>}
        <button type="button" onClick={() => { setOpen(true); setDone(false); }} className="text-xs underline underline-offset-4" data-testid="button-lock-open">Lock this {noun}…</button>
      </div>
    );
  }
  const fresh = checked && checked.source === `${language}\0${source}\0${words}` ? checked.r : null;
  const opening = amountOf(amount);
  const total = fresh ? (fresh.fee ?? 0) + opening : null;
  const canPay = !!fresh && fresh.meets && !fresh.why && opening > 0 && total! <= myEnergy;
  const runCheck = async () => {
    setBusy("check"); setError(null);
    try { setChecked({ source: `${language}\0${source}\0${words}`, r: await check(language, source, words) }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const create = async () => {
    if (!canPay || busy) return;
    setBusy("create"); setError(null);
    try { await onCreate(language, source, words, opening); setOpen(false); setDone(true); setChecked(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  return (
    <div className="mt-2 space-y-2 border p-2" data-testid="form-lock-create">
      <p className="text-sm font-medium">Lock this {noun}</p>
      <p className="text-xs text-muted-foreground">A lock is a test the {noun} passes now. While the lock holds energy, no move may make the test fail. The rarer the test, the more it costs to make and to keep.</p>
      {starters.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ready-made locks">
          {starters.map(s => (
            <button key={s.kind} type="button" onClick={() => { setLanguage(s.language); setSource(s.source); setWords(s.words); }}
              className={`border px-2 py-1 text-xs ${source === s.source ? "bg-foreground text-background" : ""}`} data-testid={`button-lock-starter-${s.kind}`}>{s.title}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <LanguageSelect value={language} onChange={setLanguage} testId="select-lock-language" />
        {onAsk && <button type="button" onClick={onAsk} className="text-xs underline underline-offset-4" data-testid="button-lock-ask">Ask my assistant to write one</button>}
      </div>
      <CodeBox value={source} onChange={setSource} label="Lock test code" className="min-h-[120px]" testId="input-lock-code" />
      <label className="block text-xs">
        What it checks, in one line (others see this beside the program)
        <input value={words} maxLength={120} onChange={e => setWords(e.target.value)} className="mt-0.5 h-8 w-full border bg-background px-2 text-sm" data-testid="input-lock-words" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-disabled={!!busy || !source.trim() || undefined} onClick={() => !busy && source.trim() && void runCheck()}
          className="border px-3 py-1.5 text-sm" data-testid="button-lock-check" disabled={!words.trim() || undefined}>{busy === "check" ? "Checking…" : "Check it on this " + noun}</button>
      </div>
      {fresh && (
        <div className={`space-y-0.5 border-l-2 pl-2 text-xs ${fresh.meets && !fresh.why ? "border-emerald-600" : "border-destructive"}`} data-testid="text-lock-check" data-meets={fresh.meets || undefined}>
          <p className="font-medium">{fresh.why ? `✗ ${fresh.why}` : fresh.meets ? `✓ This ${noun} passes: ${fresh.words}.` : `✗ This ${noun} does not pass “${fresh.words}”, so it cannot be locked to it.`}</p>
          {!fresh.why && fresh.bits !== undefined && <p>{num(fresh.bits)} bits (its length plus what it reads): making it costs {energyText(fresh.fee ?? 0)}, and it drains {num(fresh.rate ?? 0)} energy a second.</p>}
        </div>
      )}
      {checked && !fresh && <p className="text-xs text-muted-foreground">The code changed since the check: check it again.</p>}
      {fresh?.meets && !fresh.why && (
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-1 text-xs">
            Put in
            <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              className="h-8 w-24 border bg-background px-2 text-sm" data-testid="input-lock-opening" />
            energy to start it (it lasts {lastsText(opening, fresh.rate ?? 0)}).
          </label>
          <p className={`text-xs ${canPay ? "text-muted-foreground" : "text-destructive"}`} data-testid="text-lock-total">
            {opening <= 0 ? "Put in some energy." : `In all ${energyText(total!)}: ${energyText(fresh.fee ?? 0)} to make it and ${energyText(opening)} in it. ${total! <= myEnergy ? `You keep ${energyText(myEnergy - total!)}.` : `You have ${energyText(myEnergy)}.`}`}
          </p>
          <button type="button" aria-disabled={!canPay || !!busy || undefined} onClick={() => void create()}
            className={`bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground ${!canPay || busy ? "opacity-50" : ""}`} data-testid="button-lock-create">
            {busy === "create" ? "Locking…" : "Make the lock"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <button type="button" onClick={() => setOpen(false)} className="text-xs underline underline-offset-4">Close</button>
    </div>
  );
}
