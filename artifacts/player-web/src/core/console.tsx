/**
 * The core game console: the protected part of the client (src/core/). Panels in src/panels/ dock
 * around it and cannot replace it; keep player customisations in panels.
 *
 * All game state comes from Convex subscriptions (the observation updates once per engine tick), so a
 * hot update of any module never loses it. Commands go through the same authorised path as the room
 * assistant; an uncertain outcome keeps its envelope for an identical retry.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAction, useMutation } from "convex/react";
import { Bot, CircleDot, Hand, Pause, Send, Sparkles, User, Wand2 } from "lucide-react";
import { api } from "@workspace/engine/convex/_generated/api";
import {
  AgentCost, HelpersDrawer, HowScoringWorks, type ActCostBreakdown, ObjectView, ScoreBreakdown, TransformationView, UtilityCardView, formatBits, objectContext, objectNoun,
} from "@workspace/object-views";
import { GAME_COMMANDS, VERSION, type Command, type CommandResult, type Envelope, type Observation } from "@workspace/player-client";
import { useObservation, useRoom } from "@/sdk";

type Lang = "python" | "typescript";
type Validation = { source: string; language: Lang; result: CommandResult };
type Unknown = { envelope: Envelope; error: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | string) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v);

/** Rooms are lobbies between games; say where this player stands in that cycle. */
function LobbyStatus({ obs }: { obs: Observation }) {
  const room = obs.roomShortCode ? `/rooms/${encodeURIComponent(obs.roomShortCode)}` : undefined;
  const text = obs.phase === "lobby" ? "in the lobby · waiting for the owner to start a game"
    : obs.phase === "ended" ? "game over · results are in the room's history; the next game starts from the lobby"
    : obs.seated === false ? "spectating · you play in the next game" : undefined;
  if (!text) return null;
  return <span data-testid="text-lobby-status" className="opacity-70">{text}{obs.phase !== "lobby" && obs.gameShortCode && <> · <a className="underline" href={`/games/${encodeURIComponent(obs.gameShortCode)}`} target="_blank" rel="noreferrer">view game</a></>}{room && <> · <a className="underline" href={room} target="_blank" rel="noreferrer">room</a></>}</span>;
}

function Countdown({ obs }: { obs: Observation }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const until = obs.phase === "planning" ? obs.planningEndsAt : obs.phase === "paused" ? obs.pauseEndsAt : undefined;
  if (!until || until <= now) return null;
  return <span data-testid="text-countdown"><span className="opacity-50">{obs.phase === "planning" ? "world starts in " : "resumes in "}</span>{Math.ceil((until - now) / 1000)}s</span>;
}

function Panel({ title, meta, children, className = "" }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel rise flex flex-col min-h-0 ${className}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--card-border))]">
        <h2 className="label !text-[hsl(var(--foreground))]">{title}</h2>
        {meta && <span className="label">{meta}</span>}
      </header>
      <div className="p-4 min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-[hsl(var(--input))] px-4 py-6 text-center font-serif italic text-sm text-muted-foreground">{children}</div>;
}

function Btn({ children, onClick, disabled, tone = "ink", testId, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "ink" | "fire" | "ghost"; testId: string; type?: "button" | "submit" }) {
  const tones = {
    ink: "bg-secondary text-secondary-foreground",
    fire: "bg-primary text-primary-foreground",
    ghost: "bg-transparent border border-[hsl(var(--input))] text-foreground",
  };
  return (
    <button type={type} data-testid={testId} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 text-[13px] font-semibold transition-transform duration-150 active:translate-y-px hover:-translate-y-px disabled:opacity-35 disabled:pointer-events-none ${tones[tone]}`}>
      {children}
    </button>
  );
}

function Sigil() {
  return (
    <svg viewBox="0 0 40 40" className="w-9 h-9" aria-hidden>
      <rect x="1" y="1" width="38" height="38" fill="hsl(var(--primary))" />
      <path d="M12 12 L20 28 L28 12" stroke="hsl(var(--primary-foreground))" strokeWidth="3" fill="none" />
      <circle cx="20" cy="9" r="2.4" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}

/** Counts real input as human activity (at most once a minute): it keeps the engine from idle-parking. */
function useHumanActivity() {
  const touch = useMutation(api.activity.touch);
  useEffect(() => {
    let last = 0;
    const onInput = (event: Event) => {
      if (!event.isTrusted || Date.now() - last < 60_000) return;
      last = Date.now();
      void touch({}).catch(() => {});
    };
    window.addEventListener("pointerdown", onInput); window.addEventListener("keydown", onInput);
    return () => { window.removeEventListener("pointerdown", onInput); window.removeEventListener("keydown", onInput); };
  }, [touch]);
}

export default function Console({ header }: { header?: ReactNode }) {
  useHumanActivity();
  const { roomId, permission } = useRoom();
  const obs = useObservation({ hz: 4 });
  const submit = useAction(api.commands.submit);
  const [language, setLanguage] = useState<Lang>("python");
  const [source, setSource] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [unknown, setUnknown] = useState<Unknown | null>(null);
  const [chat, setChat] = useState("");
  const langTouched = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);
  const [openObject, setOpenObject] = useState<string | null>(null);
  useEffect(() => { if (obs && !langTouched.current) setLanguage(obs.language); }, [obs?.language]);
  const insert = (name: string) => {
    const el = editor.current;
    const at = el ? el.selectionStart : source.length, end = el ? el.selectionEnd : source.length;
    const next = source.slice(0, at) + name + source.slice(end);
    setSource(next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + name.length, at + name.length); } });
  };

  const send = async (envelope: Envelope) => {
    const command = envelope.command;
    setBusy(command.type); setNotice(null);
    try {
      const r = await submit({ roomId, envelope }) as CommandResult;
      setUnknown(null);
      // A failed validation already lists its diagnostics; don't repeat them below.
      if (!(command.type === "validate" && r.validation?.diagnostics.length)) setNotice({ ok: r.accepted, text: r.message || (r.accepted ? "Accepted." : "Rejected.") });
      if (command.type === "validate" && r.validation) setValidation({ source: command.source, language: command.language, result: r });
      if (command.type === "chat" && r.accepted) setChat("");
      return r;
    } catch (e) {
      // A transport failure leaves the outcome unknown: keep the envelope for an identical retry.
      setUnknown({ envelope, error: msg(e) });
      return undefined;
    } finally { setBusy(null); }
  };
  const run = (command: Command) => {
    if (busy) return;
    const envelope: Envelope = { version: VERSION, commandId: crypto.randomUUID(), command,
      ...(GAME_COMMANDS.includes(command.type) && obs?.gameId ? { gameId: obs.gameId } : {}) };
    return send(envelope);
  };

  const gameplay = !!obs && !unknown && permission !== "read";
  const currentValidation = validation && validation.source === source && validation.language === language ? validation.result.validation : undefined;
  const canSummon = gameplay && !!validation?.result.accepted && !!currentValidation?.valid && currentValidation.cost <= (obs?.self.energy ?? 0) && language === obs?.language && source.trim().length > 0;

  const ctx = objectContext(obs?.instance);
  const noun = objectNoun(obs?.instance?.objectType);
  const arg = obs?.instance?.objectType === "Grid" ? "grid" : "x";
  const comparative = obs?.self.utility?.penalty?.comparative;
  const ranked = useMemo(() => (obs ? [...obs.objects].sort((a, b) => b.payoff - a.payoff) : []), [obs]);
  const analytics = useMemo(() => {
    if (!obs) return [];
    const sum = (f: (o: Observation["objects"][number]) => number) => obs.objects.reduce((s, o) => s + f(o), 0);
    const total = sum((o) => o.payoff);
    const rank = obs.leaderboard.slice().sort((a, b) => b.totalPayoff - a.totalPayoff).findIndex((l) => l.godId === obs.self.godId);
    return [
      { k: "Energy", v: fmt(obs.self.energy) },
      { k: "Total payoff", v: fmt(total) },
      { k: "Own net bits Σ", v: fmt(sum((o) => o.own.netBits)) },
      { k: "Peer net bits Σ", v: fmt(sum((o) => o.peerNetBits)) },
      { k: "Agent bits spent Σ", v: fmt(obs.agents.reduce((s, a) => s + a.spent, 0)) },
      { k: "Rank", v: rank >= 0 ? `${rank + 1} / ${obs.leaderboard.length}` : "—" },
    ];
  }, [obs]);

    const self = obs?.self;
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3"><Sigil /><div>
          <p className="font-serif text-lg leading-none" data-testid="text-self-label">{self?.label ?? "—"}</p>
          <p className="label !text-sidebar-foreground/60">{self ? `${self.godId}${self.isAI ? " · AI" : " · human"}` : "identity unknown"}</p>
        </div></div>
        <div className="flex gap-5 font-mono text-xs">
          <span><span className="opacity-50">room </span><span data-testid="text-room">{obs?.roomShortCode ?? obs?.roomId ?? roomId}</span></span>
          {obs?.gameShortCode && <span><span className="opacity-50">game </span><span data-testid="text-game">{obs.gameShortCode}</span></span>}
          <span><span className="opacity-50">phase </span><span data-testid="text-phase" className="text-primary uppercase">{obs?.phase ?? "—"}</span></span>
          {obs && <Countdown obs={obs} />}
          {obs && <LobbyStatus obs={obs} />}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span data-testid="status-connection" className="font-mono text-xs flex items-center gap-1.5">
            <span className={`w-2 h-2 ${obs ? "bg-[hsl(var(--accent))]" : "bg-muted beat"}`} />
            {obs ? "live" : "observing"}{permission === "read" ? " · read-only" : ""}
          </span>
          {header}
        </div>
      </header>

      {unknown && (
        <div data-testid="banner-unknown" className="bg-[hsl(var(--chart-4))] text-secondary px-6 py-2 text-sm flex flex-wrap items-center gap-3">
          <span><strong className="font-mono uppercase">{unknown.envelope.command.type}</strong> outcome unknown: {unknown.error}</span>
          <span className="font-mono text-xs opacity-70">id {unknown.envelope.commandId.slice(0, 8)}</span>
          <button data-testid="button-retry-command" disabled={!!busy} onClick={() => void send(unknown.envelope)} className="underline font-semibold">Retry same command</button>
          <button className="underline opacity-70" onClick={() => setUnknown(null)}>Dismiss (I checked: it did not apply)</button>
        </div>
      )}

      <div className="flex-1 grid gap-3 p-3 @md:p-4 @3xl:grid-cols-2 @6xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* Column 1: forge */}
        <div className="flex flex-col gap-3 min-w-0">
          <Panel title="Forge" meta={`${new TextEncoder().encode(source).length} / 16384 bytes`}>
            <div className="flex items-center gap-2 mb-3">
              {(["python", "typescript"] as const).map((l) => (
                <button key={l} data-testid={`button-lang-${l}`} onClick={() => { langTouched.current = true; setLanguage(l); }}
                  className={`font-mono text-xs px-2.5 py-1 border transition-colors ${language === l ? "bg-secondary text-secondary-foreground border-secondary" : "border-[hsl(var(--input))] hover:border-secondary"}`}>{l}</button>
              ))}
              {obs && obs.language !== language && <span className="label !text-primary">room expects {obs.language}</span>}
            </div>
            <textarea ref={editor} data-testid="input-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={16384} spellCheck={false}
              aria-label="Agent source"
              placeholder={language === "python" ? `def agent(${arg}):\n    # return a list of moves, e.g. [swap(...)]\n    return []` : `function agent(${arg}) {\n  // return a list of moves, e.g. [swap(...)]\n  return [];\n}`}
              className="w-full h-64 resize-y bg-[hsl(232_38%_14%)] text-[hsl(40_33%_92%)] font-mono text-[13px] leading-relaxed p-3 outline-none border-l-4 border-primary caret-[hsl(var(--primary))]" />
            <p className="mt-1 text-xs text-muted-foreground">Write <code>{language === "python" ? `def agent(${arg}):` : `function agent(${arg})`}</code>. It reads the {noun} and returns at most 16 moves from the Room helpers; each act costs ⚡ bits from the agent's own energy.</p>
            {obs?.instance && <div className="mt-2"><HelpersDrawer helpers={obs.instance.helpers} language={language} onInsert={insert} /></div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn testId="button-validate" disabled={!gameplay || language!==obs?.language || !source.trim() || !!busy} onClick={() => run({ type: "validate", language, source })}>
                <Wand2 size={14} /> {busy === "validate" ? "Validating" : "Validate"}
              </Btn>
              <Btn testId="button-summon" tone="fire" disabled={!canSummon || !!busy} onClick={() => run({ type: "summon", language, source })}>
                <Sparkles size={14} /> {busy === "summon" ? "Summoning" : currentValidation ? `Summon · cost ${fmt(currentValidation.cost)}` : "Summon"}
              </Btn>
            </div>
            <div data-testid="panel-validation" className="mt-3 text-sm">
              {currentValidation ? (
                <div className={`border-l-4 pl-3 py-1 ${currentValidation.valid ? "border-[hsl(var(--accent))]" : "border-destructive"}`}>
                  <p className="font-mono text-xs"><strong>{currentValidation.valid ? "VALID" : "INVALID"}</strong></p>
                  <div className="mt-1"><AgentCost summonCost={currentValidation.cost} expectedActCost={currentValidation.expectedActCost}
                    breakdown={currentValidation.breakdown as ActCostBreakdown | undefined}
                    agentEnergyPerSecond={obs?.economy?.agentEnergyPerSecond} godEnergy={obs?.self.energy} /></div>
                  {currentValidation.diagnostics.length > 0 ? (
                    <ul className="mt-1 font-mono text-xs space-y-0.5 text-muted-foreground">{currentValidation.diagnostics.map((d, i) => <li key={i} className="whitespace-pre-wrap break-words">{d}</li>)}</ul>
                  ) : <p className="font-mono text-xs text-muted-foreground mt-1">no diagnostics</p>}
                </div>
              ) : <p className="label">{validation ? "Source changed since validation. Validate again." : "Validate before summoning."}</p>}
            </div>
            {notice && <p data-testid="text-notice" className={`mt-2 text-sm ${notice.ok ? "text-[hsl(var(--accent))]" : "text-destructive"}`}>{notice.text}</p>}
          </Panel>

          <Panel title="Your agents" meta={obs ? `${obs.agents.length}${obs.economy ? ` / ${obs.economy.maxAgentsPerGod}` : ""}` : 0}>
            {!obs ? <Empty>Waiting for observation.</Empty> : obs.agents.length === 0 ? <Empty>No agents summoned yet.</Empty> : (
              <ul className="space-y-2">
                {obs.agents.map((a) => {
                  const cap = Math.max(a.expectedActCost * (obs.economy?.agentBatteryActs ?? 2), 1e-9);
                  const status = a.energy < 0 ? "cooldown" : a.eligible ? "ready to act" : "charging";
                  const wait = !a.eligible && obs.economy && obs.economy.agentEnergyPerSecond > 0 ? (a.expectedActCost - a.energy) / obs.economy.agentEnergyPerSecond : null;
                  return (
                    <li key={a.id} data-testid={`row-agent-${a.id}`} className="border border-[hsl(var(--card-border))] min-w-0">
                      <div className="flex flex-wrap justify-between gap-x-2 px-3 py-1.5 font-mono text-xs bg-muted"><span className="truncate">{a.id} · {a.language}</span><span>summoned for {formatBits(a.summonCost)} bits</span></div>
                      <div className="px-3 pt-2 space-y-1" data-testid={`text-agent-energy-${a.id}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-[11px]">
                          <span>⚡ {formatBits(a.energy)} bits · {formatBits(a.expectedActCost)} per act (decision {formatBits(a.decisionBits)}{a.randomized ? ", uses random" : ""})</span>
                          <span data-testid={`text-agent-status-${a.id}`} className={a.energy < 0 ? "text-destructive font-semibold" : a.eligible ? "text-[hsl(var(--accent))] font-semibold" : ""}>{status}{wait !== null && wait > 0 ? ` · ~${formatBits(wait)}s` : ""}</span>
                        </div>
                        <div className="relative h-1.5 bg-muted overflow-hidden" aria-hidden>
                          <div className={`h-full ${a.energy < 0 ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${Math.min(100, (100 * Math.abs(a.energy)) / cap)}%` }} />
                          <div className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${Math.min(100, (100 * a.expectedActCost) / cap)}%` }} title="cost of one act" />
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">{a.acts} acts · {formatBits(a.spent)} bits spent</p>
                      </div>
                      <pre className="px-3 py-2 font-mono text-[11px] max-h-28 overflow-auto whitespace-pre-wrap break-words">{a.source}</pre>
                      <div className="flex flex-wrap gap-3 px-3 pb-2">
                        <button data-testid={`button-load-agent-${a.id}`} onClick={() => { langTouched.current = true; setLanguage(a.language); setSource(a.source); }} className="label hover:!text-primary">load into forge</button>
                        {confirmDestroy === a.id ? (<>
                          <button data-testid={`button-confirm-destroy-${a.id}`} disabled={!!busy} onClick={() => { setConfirmDestroy(null); void run({ type: "destroy", agentId: a.id }); }} className="label !text-destructive font-semibold">confirm destroy</button>
                          <button onClick={() => setConfirmDestroy(null)} className="label">keep</button>
                        </>) : (
                          <button data-testid={`button-destroy-agent-${a.id}`} disabled={!!busy || !gameplay} onClick={() => setConfirmDestroy(a.id)} className="label hover:!text-destructive" title="Free. It can't be undone.">destroy (free)</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Column 2: world */}
        <div className="flex flex-col gap-3 min-w-0">
          <Panel title="Analytics">
            {!obs ? <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-muted beat" />)}</div> : (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[hsl(var(--card-border))]">
                {analytics.map((m) => (
                  <div key={m.k} className="bg-card p-2.5"><dt className="label">{m.k}</dt><dd data-testid={`stat-${m.k}`} className="font-mono text-lg mt-0.5 truncate">{m.v}</dd></div>
                ))}
              </dl>
            )}
          </Panel>
          <Panel title="Your utility function" meta="private">
            {!obs ? <Empty>Available after room approval.</Empty> : !obs.self.utility ? <Empty>Dealt when the next game starts.</Empty> : (
              <div data-testid="panel-utility" className="space-y-3">
                <UtilityCardView card={obs.self.utility} />
                <HowScoringWorks noun={noun} />
              </div>
            )}
          </Panel>
          <Panel title="Objects by your points" meta={obs?.objects.length ?? 0} className="flex-1">
            {!obs ? <Empty>Waiting for observation.</Empty> : ranked.length === 0 ? <Empty>The world holds no objects yet.</Empty> : (
              <ol className="overflow-auto max-h-[520px] divide-y divide-[hsl(var(--card-border))]">
                {ranked.map((o, i) => (
                  <li key={o.id} data-testid={`row-object-${o.id}`} className="py-2 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="font-mono text-xs opacity-50 w-5 shrink-0 pt-0.5">{i + 1}</span>
                      <span className="shrink-0 font-mono text-xs max-w-[45%] truncate"><ObjectView value={o.value} {...ctx} showTitle /></span>
                      <span className="flex-1 min-w-0 space-y-0.5">
                        <span className="block" data-testid={`text-rarity-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} compact /></span>
                        <span className="block font-mono text-[11px] text-muted-foreground">yours {formatBits(o.own.netBits)} × others {formatBits(o.peerCare)} = <b className={o.payoff > 0 ? "text-[hsl(var(--accent))]" : ""}>{formatBits(o.payoff)}</b></span>
                        <button className="label hover:!text-primary" onClick={() => setOpenObject(openObject === o.id ? null : o.id)} aria-expanded={openObject === o.id} data-testid={`button-object-detail-${o.id}`}>{openObject === o.id ? "hide" : "why?"}</button>
                      </span>
                    </div>
                    {openObject === o.id && <div className="mt-2 ml-8 border-l-2 border-primary pl-3" data-testid={`object-detail-${o.id}`}><ScoreBreakdown score={o} noun={noun} comparative={comparative} /></div>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="Your transformations" meta={obs?.transformations.length ?? 0}>
            {!obs ? <Empty>Waiting for observation.</Empty> : obs.transformations.length === 0 ? <Empty>No transformations applied yet.</Empty> : (
              <ul className="font-mono text-xs space-y-2 max-h-72 overflow-auto">
                {obs.transformations.map((t) => (
                  <li key={t.id} data-testid={`row-transformation-${t.id}`} className="flex flex-wrap gap-x-2 gap-y-1 items-center min-w-0">
                    <span className="opacity-50 w-20 truncate">{t.agentId}</span>
                    <TransformationView before={t.before} after={t.after} {...ctx} />
                    {t.calls && <span className="opacity-70 whitespace-normal basis-full sm:basis-auto">{t.calls.map(c => c[0]).join("; ")}{t.cost !== undefined ? ` · ${formatBits(t.cost)} bits` : ""}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Column 3: council */}
        <div className="flex flex-col gap-3 min-w-0">
          <Panel title="Readiness">
            <p className="text-sm mb-3">You are <strong data-testid="text-ready">{self ? (self.ready ? "ready" : "not ready") : "—"}</strong>.</p>
            <div className="flex flex-wrap gap-2">
              <Btn testId="button-toggle-ready" tone={self?.ready ? "ghost" : "ink"} disabled={!gameplay || !!busy} onClick={() => self && run({ type: "ready", ready: !self.ready })}>
                <Hand size={14} /> {self?.ready ? "Withdraw ready" : "Declare ready"}
              </Btn>
               <Btn testId="button-pause" tone="ghost" disabled={!gameplay || !!busy || obs?.phase !== "running" || self?.pauseUsed} onClick={() => run({ type: "pause" })}><Pause size={14} /> {self?.pauseUsed ? "Pause used" : "Pause"}</Btn>
            </div>
          </Panel>
          <Panel title="Leaderboard">
            {!obs ? <Empty>Waiting for observation.</Empty> : obs.leaderboard.length === 0 ? <Empty>No gods ranked yet.</Empty> : (
              <ol className="space-y-1">
                {obs.leaderboard.slice().sort((a, b) => b.totalPayoff - a.totalPayoff).map((l, i) => (
                  <li key={l.godId} data-testid={`row-leader-${l.godId}`} className={`flex items-center gap-2 px-2 py-1.5 text-sm ${l.godId === self?.godId ? "bg-secondary text-secondary-foreground" : ""}`}>
                    <span className="font-mono text-xs w-5 opacity-60">{i + 1}</span>
                    {l.isAI ? <Bot size={13} /> : <User size={13} />}
                    <span className="break-words min-w-0 flex-1">{l.label}</span>
                    {l.isAI && <span className="font-mono text-[9px] px-1 border border-current">AI</span>}
                    <span className="font-mono">{fmt(l.totalPayoff)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="Public chat" meta="everyone sees this" className="flex-1">
            <div className="flex flex-col h-full gap-2">
              <ul className="flex-1 space-y-2 overflow-auto max-h-72 min-h-24">
                {!obs ? <Empty>Waiting for observation.</Empty> : obs.chat.length === 0 ? <Empty>Silence in the pantheon. Make the first argument.</Empty> :
                  obs.chat.map((c) => (
                    <li key={c.id} data-testid={`row-chat-${c.id}`} className="text-sm">
                      <span className={`font-semibold ${c.godId === self?.godId ? "text-primary" : ""}`}>{c.label}</span>
                      {c.isAI && <span className="ml-1 font-mono text-[9px] px-1 border border-current align-middle">AI</span>}
                      <p className="whitespace-pre-wrap break-words">{c.text}</p>
                    </li>
                  ))}
              </ul>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = chat.trim(); if (t) void run({ type: "chat", text: t }); }}>
                <input data-testid="input-chat" value={chat} onChange={(e) => setChat(e.target.value)} maxLength={2000} disabled={!gameplay} placeholder="Speak publicly"
                  className="flex-1 min-w-0 bg-transparent border border-[hsl(var(--input))] px-2 py-2 text-sm outline-none focus:border-primary disabled:opacity-40" />
                <Btn testId="button-send-chat" type="submit" disabled={!gameplay || !chat.trim() || !!busy}><Send size={14} /></Btn>
              </form>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
