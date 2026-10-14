import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, CircleDot, Hand, LogOut, Pause, RotateCw, Send, ShieldCheck, Sparkles, User, Wand2 } from "lucide-react";
import {
  beginApproval, connectSession, disconnect, getObservation, pollApproval, sendCommand,
  isDaemonMode, loginUrl, subscribeObservation, isServerIdle, resumeServer, trackHumanActivity,
  type Observation, type Command, type CommandResult,
} from "@/player-api";

type Lang = "python" | "typescript";
type UUID = ReturnType<typeof crypto.randomUUID>;
type Stage = "connecting" | "session-error" | "login" | "room" | "approving" | "live";
type Validation = { source: string; language: Lang; result: CommandResult };
type Unknown = { command: Command; commandId: UUID; error: string };

const POLL_MS = 1500;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (v: number | string) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v);

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

export default function Console() {
  const [idle,setIdle]=useState(isServerIdle);
  useEffect(()=>{
    const sleep=()=>setIdle(true);
    const expired=()=>{setIdle(false);setStage(isDaemonMode() ? "room" : "login");setApprovalError("Player credentials expired. Reapprove this player.");};
    window.addEventListener("player-idle",sleep);
    window.addEventListener("player-expired",expired);
    const cleanup=trackHumanActivity();
    return ()=>{window.removeEventListener("player-idle",sleep);window.removeEventListener("player-expired",expired);cleanup();};
  },[]);
  const [stage, setStage] = useState<Stage>("connecting");
  const [sessionError, setSessionError] = useState("");
  const [roomId, setRoomId] = useState(() => new URLSearchParams(location.search).get("room") ?? "");
  const [approval, setApproval] = useState<{ verificationUri: string; userCode: string } | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [obs, setObs] = useState<Observation | null>(null);
  const [obsError, setObsError] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [language, setLanguage] = useState<Lang>("python");
  const [source, setSource] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [unknown, setUnknown] = useState<Unknown | null>(null);
  const [chat, setChat] = useState("");
  const langTouched = useRef(false);
  const identityEpoch = useRef(0);
  const commandBusy = useRef(false);

  const resetIdentity = useCallback(() => {
    identityEpoch.current++; commandBusy.current=false;
    setApproval(null); setApprovalError(""); setObs(null); setObsError(""); setLastSync(null);
    setSource(""); setValidation(null); setNotice(null); setUnknown(null); setChat(""); setBusy(null);
    langTouched.current = false;
  }, []);

  const connect = useCallback(async () => {
    setStage("connecting"); setSessionError("");
    try { const session=await connectSession(); setStage(session.connected ? "live" : session.requiresLogin ? "login" : "room"); }
    catch (e) { setSessionError(msg(e)); setStage("session-error"); }
  }, []);

  useEffect(() => { void connect(); }, [connect]);

  // Approval polling
  useEffect(() => {
    if (idle || stage !== "approving" || !approval) return;
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await pollApproval();
        if (!alive) return;
        setApprovalError("");
        if (r.status === "approved") { setStage("live"); return; }
      } catch (e) { if (alive) setApprovalError(msg(e)); }
      if (alive) t = setTimeout(tick, 2000);
    };
    t = setTimeout(tick, 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [stage, approval, idle]);

  // Observation polling
  useEffect(() => {
    if (idle || stage !== "live") return;
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const accept = (o:Observation) => {
      if(!alive) return;
      setObs(o);
      setObsError(""); setLastSync(Date.now());
      if(!langTouched.current) setLanguage(o.language);
    };
    const unsubscribe = subscribeObservation(accept, error => {if(alive) setObsError(error);});
    const tick = async () => {
      try {
        const o = (await getObservation()) as Observation;
        if (!alive) return;
        accept(o);
      } catch (e) {
        if (!alive) return;
        setObs(null); setObsError(msg(e));
      }
      if (alive && !isServerIdle()) t = setTimeout(tick, POLL_MS);
    };
    if(isDaemonMode()) void tick();
    return () => { alive = false; clearTimeout(t); unsubscribe(); };
  }, [stage, idle]);

  const start = async () => {
    const id = roomId.trim(); if (!id) return;
    setApprovalError(""); setBusy("approval");
    try { const a = await beginApproval(id); setApproval(a); setStage(a ? "approving" : "live"); }
    catch (e) { setApprovalError(msg(e)); }
    finally { setBusy(null); }
  };

  const leave = async () => {
    setBusy("disconnect");
    resetIdentity(); setRoomId(""); setStage("connecting");
    try { await disconnect(); } catch { /* old responses cannot restore cleared state */ }
    if(isDaemonMode()) {setSessionError("Disconnected. Open a new private daemon launch link to reconnect."); setStage("session-error");}
    else setStage("room");
  };

  const run = async (command: Command, commandId: UUID = crypto.randomUUID()) => {
    if(commandBusy.current) return;
    commandBusy.current=true;
    const epoch=identityEpoch.current;
    setBusy(command.type); setNotice(null);
    const snapshot = { source, language };
    try {
      const r = (await sendCommand(command, commandId)) as CommandResult;
      if(identityEpoch.current!==epoch) return;
      setUnknown(null);
      setNotice({ ok: r.accepted, text: r.message || (r.accepted ? "Accepted." : "Rejected.") });
      if (command.type === "validate" && r.validation) setValidation({ ...snapshot, source: command.source, language: command.language, result: r });
      if (command.type === "chat" && r.accepted) setChat("");
      try { const fresh=await getObservation(); if(identityEpoch.current===epoch) {setObs(previous=>previous && previous.revision>fresh.revision?previous:fresh);setLastSync(Date.now());} } catch { /* polling supplies the visible connection error */ }
      return r;
    } catch (e) {
      if(identityEpoch.current!==epoch) return;
      setUnknown({ command, commandId, error: msg(e) });
      return undefined;
    } finally { if(identityEpoch.current===epoch) {setBusy(null);commandBusy.current=false;} }
  };

  const gameplay = !!obs && stage === "live" && !idle && !unknown && !obsError;
  const currentValidation = validation && validation.source === source && validation.language === language ? validation.result.validation : undefined;
  const canSummon = gameplay && !!validation?.result.accepted && !!currentValidation?.valid && currentValidation.cost <= (obs?.self.energy??0) && language===obs?.language && source.trim().length > 0;

  const ranked = useMemo(() => (obs ? [...obs.objects].sort((a, b) => b.payoff - a.payoff) : []), [obs]);
  const analytics = useMemo(() => {
    if (!obs) return [];
    const sum = (f: (o: Observation["objects"][number]) => number) => obs.objects.reduce((s, o) => s + f(o), 0);
    const pay = sum((o) => o.payoff);
    const rank = obs.leaderboard.slice().sort((a, b) => b.score - a.score).findIndex((l) => l.godId === obs.self.godId);
    return [
      { k: "Energy", v: fmt(obs.self.energy) },
      { k: "Total payoff", v: fmt(pay) },
      { k: "Own value Σ", v: fmt(sum((o) => o.ownValue)) },
      { k: "Others Σ", v: fmt(sum((o) => o.othersSum)) },
      { k: "Agent cost Σ", v: fmt(obs.agents.reduce((s, a) => s + a.cost, 0)) },
      { k: "Rank", v: rank >= 0 ? `${rank + 1} / ${obs.leaderboard.length}` : "—" },
    ];
  }, [obs]);

  /* ---------- pre-live screens ---------- */
  if (stage !== "live") {
    return (
      <div className="min-h-[100dvh] grid md:grid-cols-[1.1fr_1fr]">
        <aside className="bg-sidebar text-sidebar-foreground p-8 md:p-14 flex flex-col justify-between gap-10">
          <div className="flex items-center gap-3"><Sigil /><span className="label !text-sidebar-foreground/70">Code Gods / Player console</span></div>
          <div>
            <h1 className="font-serif text-5xl md:text-7xl leading-[0.95] rise">Rule by<br /><em className="text-primary">executable</em><br />decree.</h1>
            <p className="mt-6 max-w-md text-sidebar-foreground/70 rise">Your private desk for a public pantheon. Sign in on the room’s server, join a room, write the transformation you want the world to obey, and argue for it out loud.</p>
          </div>
          <ol className="font-mono text-xs space-y-1.5 text-sidebar-foreground/60">
            {["Replit sign-in or private daemon launch", "Join room / approve device", "Observe, validate, summon"].map((s, i) => {
              const idx = stage === "connecting" || stage === "session-error" ? 0 : stage === "room" ? 1 : 1;
              return <li key={s} className={i <= idx ? "text-sidebar-foreground" : ""}>{String(i + 1).padStart(2, "0")} — {s}</li>;
            })}
          </ol>
        </aside>
        <main className="p-8 md:p-14 flex items-center">
          <div className="w-full max-w-md rise">
            {stage === "connecting" && (
              <div data-testid="status-connecting" className="space-y-3">
                <p className="label">Establishing session</p>
                <div className="h-10 bg-muted beat" /><div className="h-10 bg-muted beat w-2/3" />
              </div>
            )}
            {stage === "session-error" && (
              <div className="space-y-5">
                <p className="label !text-destructive">No session</p>
                <p data-testid="text-session-error" className="font-serif text-2xl">{sessionError}</p>
                <p className="text-sm text-muted-foreground">{isDaemonMode() ? "Use the private launch link saved by your player daemon. Its upstream API host is configured when launching the daemon." : "Use a room link on this server and sign in with Replit. For an editable Replit client or Agent, launch the player daemon against the room server’s /api/player/v1 URL."}</p>
                <Btn testId="button-retry-session" onClick={connect}><RotateCw size={14} /> Retry</Btn>
                {!isDaemonMode() && <a className="block underline text-sm" href={loginUrl()}>Sign in with Replit</a>}
              </div>
            )}
            {stage === "login" && (
              <div className="space-y-5">
                <p className="label">Verified human identity</p>
                <h2 className="font-serif text-3xl">Sign in to the pantheon.</h2>
                <p className="text-sm text-muted-foreground">Use Replit sign-in on this server. Your full identity name is shown in the room; chat is public. A room link from another host must be opened on that host.</p>
                <a data-testid="link-login" href={loginUrl()} className="inline-flex bg-primary text-primary-foreground px-4 py-2 font-semibold">Sign in with Replit</a>
              </div>
            )}
            {stage === "room" && (
              <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void start(); }}>
                <p className="label">Session established</p>
                <label className="block">
                  <span className="font-serif text-3xl">Which room?</span>
                  <input data-testid="input-room-id" value={roomId} onChange={(e) => setRoomId(e.target.value)} maxLength={2048} placeholder="Room UUID or room link"
                    className="mt-3 w-full bg-card border border-[hsl(var(--input))] px-3 py-3 font-mono text-lg outline-none focus:border-primary transition-colors" />
                </label>
                <p className="text-sm text-muted-foreground">{isDaemonMode() ? "Your daemon connects to its configured authoritative API host. Approve this device on that server with your Replit account." : "Paste a room UUID or a room link from this server. No room names or private chat are used."}</p>
                {approvalError && <p data-testid="text-approval-error" className="text-sm text-destructive">{approvalError}</p>}
                <Btn testId="button-begin-approval" type="submit" tone="fire" disabled={!roomId.trim() || busy === "approval"}>
                  <ShieldCheck size={14} /> {busy === "approval" ? "Connecting" : isDaemonMode() ? "Request device approval" : "Join room"}
                </Btn>
              </form>
            )}
            {stage === "approving" && approval && (
              <div className="space-y-5">
                <p className="label flex items-center gap-2"><CircleDot size={10} className="text-primary beat" /> Awaiting approval · room {roomId}</p>
                <div className="panel p-5">
                  <p className="label">Your code</p>
                  <p data-testid="text-user-code" className="font-mono text-4xl tracking-[0.2em] mt-1 select-all">{approval.userCode}</p>
                </div>
                <a data-testid="link-verification" href={approval.verificationUri} target="_blank" rel="noreferrer"
                  className="block font-mono text-sm underline decoration-primary underline-offset-4 break-all hover:text-primary">{approval.verificationUri}</a>
                <p className="text-sm text-muted-foreground">Open the link, confirm the code. This page polls and continues on its own.</p>
                {approvalError && <p data-testid="text-approval-error" className="text-sm text-destructive">{approvalError}</p>}
                <Btn testId="button-cancel-approval" tone="ghost" onClick={leave}>Cancel and disconnect</Btn>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  /* ---------- live console ---------- */
  const self = obs?.self;
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3"><Sigil /><div>
          <p className="font-serif text-lg leading-none" data-testid="text-self-label">{self?.label ?? "—"}</p>
          <p className="label !text-sidebar-foreground/60">{self ? `${self.godId}${self.isAI ? " · AI" : " · human"}` : "identity unknown"}</p>
        </div></div>
        <div className="flex gap-5 font-mono text-xs">
          <span><span className="opacity-50">room </span><span data-testid="text-room">{obs?.roomId ?? roomId}</span></span>
          <span><span className="opacity-50">phase </span><span data-testid="text-phase" className="text-primary uppercase">{obs?.phase ?? "—"}</span></span>
          <span><span className="opacity-50">rev </span>{obs?.revision ?? "—"}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span data-testid="status-connection" className="font-mono text-xs flex items-center gap-1.5">
            <span className={`w-2 h-2 ${obsError ? "bg-primary beat" : obs ? "bg-[hsl(var(--accent))]" : "bg-muted beat"}`} />
            {obsError ? "disconnected" : obs ? `synced ${lastSync ? new Date(lastSync).toLocaleTimeString() : ""}` : "observing"}
          </span>
          <button data-testid="button-disconnect" onClick={leave} className="font-mono text-xs flex items-center gap-1 opacity-70 hover:opacity-100"><LogOut size={13} /> disconnect</button>
        </div>
      </header>

      {idle && <div role="status" className="p-4 border border-primary">Server idle after human inactivity. <button onClick={()=>void resumeServer().then(()=>{setObs(null);setIdle(false);setObsError("");}).catch(e=>setObsError(msg(e)))}>Resume / reconnect</button></div>}
      {obsError && (
        <div data-testid="banner-obs-error" className="bg-primary text-primary-foreground px-6 py-2 text-sm flex items-center gap-2">
          <CircleDot size={12} className="beat" /> {obsError} Gameplay is disabled until observation resumes. {idle ? "Polling and reconnect are stopped." : `Retrying every ${POLL_MS / 1000}s.`}
        </div>
      )}
      {unknown && (
        <div data-testid="banner-unknown" className="bg-[hsl(var(--chart-4))] text-secondary px-6 py-2 text-sm flex flex-wrap items-center gap-3">
          <span><strong className="font-mono uppercase">{unknown.command.type}</strong> outcome unknown: {unknown.error}</span>
          <span className="font-mono text-xs opacity-70">id {unknown.commandId.slice(0, 8)}</span>
          <button data-testid="button-retry-command" disabled={!!busy} onClick={() => run(unknown.command, unknown.commandId)} className="underline font-semibold">Retry same command</button>
        </div>
      )}

      <div className="flex-1 grid gap-3 p-3 md:p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
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
            <textarea data-testid="input-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={16384} spellCheck={false}
              aria-label="Transformation source"
              placeholder={language === "python" ? "lambda x: x" : "(x) => x"}
              className="w-full h-64 resize-y bg-[hsl(232_38%_14%)] text-[hsl(40_33%_92%)] font-mono text-[13px] leading-relaxed p-3 outline-none border-l-4 border-primary caret-[hsl(var(--primary))]" />
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
                  <p className="font-mono text-xs"><strong>{currentValidation.valid ? "VALID" : "INVALID"}</strong> · cost {fmt(currentValidation.cost)}</p>
                  {currentValidation.diagnostics.length > 0 ? (
                    <ul className="mt-1 font-mono text-xs space-y-0.5 text-muted-foreground">{currentValidation.diagnostics.map((d, i) => <li key={i}>› {d}</li>)}</ul>
                  ) : <p className="font-mono text-xs text-muted-foreground mt-1">no diagnostics</p>}
                </div>
              ) : <p className="label">{validation ? "Source changed since validation. Validate again." : "Validate before summoning."}</p>}
            </div>
            {notice && <p data-testid="text-notice" className={`mt-2 text-sm ${notice.ok ? "text-[hsl(var(--accent))]" : "text-destructive"}`}>{notice.text}</p>}
          </Panel>

          <Panel title="Your agents" meta={obs?.agents.length ?? 0}>
            {!obs ? <Empty>Waiting for observation.</Empty> : obs.agents.length === 0 ? <Empty>No agents summoned yet.</Empty> : (
              <ul className="space-y-2">
                {obs.agents.map((a) => (
                  <li key={a.id} data-testid={`row-agent-${a.id}`} className="border border-[hsl(var(--card-border))]">
                    <div className="flex justify-between px-3 py-1.5 font-mono text-xs bg-muted"><span>{a.id} · {a.language}</span><span>cost {fmt(a.cost)}</span></div>
                    <pre className="px-3 py-2 font-mono text-[11px] max-h-28 overflow-auto whitespace-pre-wrap">{a.source}</pre>
                    <button data-testid={`button-load-agent-${a.id}`} onClick={() => { langTouched.current = true; setLanguage(a.language); setSource(a.source); }} className="label px-3 pb-2 hover:!text-primary">load into forge</button>
                  </li>
                ))}
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
          <Panel title="Your value function">
            {obs ? <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-40 overflow-auto">{obs.self.valueSource}</pre> : <Empty>Available after room approval.</Empty>}
          </Panel>
          <Panel title="Objects by payoff" meta={obs?.objects.length ?? 0} className="flex-1">
            {!obs ? <Empty>Waiting for observation.</Empty> : ranked.length === 0 ? <Empty>The world holds no objects yet.</Empty> : (
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full font-mono text-xs">
                  <thead className="sticky top-0 bg-card"><tr className="label text-left">
                    <th className="py-1 pr-2">#</th><th className="pr-2">object</th><th className="pr-2">value</th><th className="text-right pr-2">own</th><th className="text-right pr-2">others Σ</th><th className="text-right">payoff</th>
                  </tr></thead>
                  <tbody>
                    {ranked.map((o, i) => (
                      <tr key={o.id} data-testid={`row-object-${o.id}`} className="border-t border-[hsl(var(--card-border))] hover:bg-muted transition-colors">
                        <td className="py-1.5 pr-2 opacity-50">{i + 1}</td>
                        <td className="pr-2 truncate max-w-[90px]">{o.id}</td>
                        <td className="pr-2 truncate max-w-[90px]">{fmt(o.value)}</td>
                        <td className="text-right pr-2">{fmt(o.ownValue)}</td>
                        <td className="text-right pr-2 opacity-70">{fmt(o.othersSum)}</td>
                        <td className={`text-right font-semibold ${o.payoff >= 0 ? "text-[hsl(var(--accent))]" : "text-primary"}`}>{fmt(o.payoff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Your transformations" meta={obs?.transformations.length ?? 0}>
            {!obs ? <Empty>Waiting for observation.</Empty> : obs.transformations.length === 0 ? <Empty>No transformations applied yet.</Empty> : (
              <ul className="font-mono text-xs space-y-1 max-h-48 overflow-auto">
                {obs.transformations.map((t) => (
                  <li key={t.id} data-testid={`row-transformation-${t.id}`} className="flex gap-2 items-center">
                    <span className="opacity-50 w-20 truncate">{t.agentId}</span>
                    <span className="truncate">{fmt(t.before)}</span><span className="text-primary">→</span><span className="truncate font-semibold">{fmt(t.after)}</span>
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
                {obs.leaderboard.slice().sort((a, b) => b.score - a.score).map((l, i) => (
                  <li key={l.godId} data-testid={`row-leader-${l.godId}`} className={`flex items-center gap-2 px-2 py-1.5 text-sm ${l.godId === self?.godId ? "bg-secondary text-secondary-foreground" : ""}`}>
                    <span className="font-mono text-xs w-5 opacity-60">{i + 1}</span>
                    {l.isAI ? <Bot size={13} /> : <User size={13} />}
                    <span className="break-words min-w-0 flex-1">{l.label}</span>
                    {l.isAI && <span className="font-mono text-[9px] px-1 border border-current">AI</span>}
                    <span className="font-mono">{fmt(l.score)}</span>
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
