import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Shell, Panel, Empty, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errors";
import { useAdminAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, type AiAgent, type AiModel } from "@/hooks/use-agents";
import { Bot, KeyRound, Pencil, Plus, Trash2, X, AlertTriangle } from "lucide-react";

const MAX = 10000;
const field = "w-full border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";

function conflictMsg(e: unknown) {
  if ((e as { status?: number } | null)?.status === 409) return `Someone else changed this agent first. ${errMsg(e)}. Reload to see the latest version.`;
  return errMsg(e);
}

function Editor({ agent, models, onDone }: { agent: AiAgent | null; models: AiModel[]; onDone: () => void }) {
  const { toast } = useToast();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))], [models]);
  const [name, setName] = useState(agent?.name ?? "");
  const [provider, setProvider] = useState(agent?.provider ?? providers[0] ?? "");
  const [model, setModel] = useState(agent?.model ?? models.find((m) => m.provider === (agent?.provider ?? providers[0]))?.id ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [err, setErr] = useState<string | null>(null);
  const forProvider = models.filter((m) => m.provider === provider);
  const sel = models.find((m) => m.id === model && m.provider === provider);
  const unknownModel = !!model && !sel;
  const valid = name.trim().length > 0 && !!provider && !!model && prompt.trim().length > 0 && prompt.length <= MAX;
  const pending = create.isPending || update.isPending;
  const submit = () => {
    setErr(null);
    const d = { name: name.trim(), provider, model, prompt };
    const ok = () => { toast({ title: agent ? "Agent saved" : "Agent created" }); onDone(); };
    if (agent) update.mutate({ ...d, id: agent.id, revision: agent.revision }, { onSuccess: ok, onError: (e) => setErr(conflictMsg(e)) });
    else create.mutate(d, { onSuccess: ok, onError: (e) => setErr(errMsg(e)) });
  };
  return (
    <Panel title={agent ? `Edit / ${agent.name}` : "New agent"} meta={agent ? `rev ${agent.revision}` : "draft"}>
      <div className="p-4 grid gap-3">
        <label className="space-y-1"><span className="label-mono">Name</span>
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={field} data-testid="input-agent-name" /></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label-mono">Provider</span>
            <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(models.find((m) => m.provider === e.target.value)?.id ?? ""); }} className={field} data-testid="select-agent-provider">
              {!providers.includes(provider) && <option value={provider}>{provider || "—"} (not in catalog)</option>}
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <label className="space-y-1"><span className="label-mono">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={field} data-testid="select-agent-model">
              {unknownModel && <option value={model}>{model} (not in catalog)</option>}
              {forProvider.map((m) => <option key={m.id} value={m.id}>{m.label}{m.configured ? "" : " — credentials missing"}</option>)}
            </select></label>
        </div>
        {sel && (
          <p className={`text-xs inline-flex items-center gap-1.5 ${sel.configured ? "text-muted-foreground" : "text-destructive"}`} data-testid="text-model-status">
            <KeyRound className="h-3 w-3" />
            {sel.configured ? "Server credentials configured" : "Server credentials missing — this agent cannot play until an admin sets the provider key."}
            <span className="font-mono ml-2">${sel.inputUsdPerMillion} in / ${sel.outputUsdPerMillion} out per M tokens</span>
          </p>
        )}
        {unknownModel && <p className="text-xs text-accent">This model is no longer offered by the server. Pick another before saving.</p>}
        <label className="space-y-1">
          <span className="flex justify-between"><span className="label-mono">System prompt</span>
            <span className={`label-mono ${prompt.length > MAX ? "!text-destructive" : ""}`} data-testid="text-prompt-count">{prompt.length.toLocaleString()} / {MAX.toLocaleString()}</span></span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12} className={`${field} resize-y leading-relaxed`} placeholder="Describe how this deity negotiates, schemes and writes code." data-testid="input-agent-prompt" />
        </label>
        {err && <ErrorLine message={err} />}
      </div>
      <div className="border-t p-3 flex gap-2">
        <button disabled={!valid || unknownModel || pending} onClick={submit} className="flex-1 bg-primary text-primary-foreground py-2 text-sm disabled:opacity-40" data-testid="button-save-agent">{pending ? "Saving…" : agent ? "Save changes" : "Create agent"}</button>
        <button onClick={onDone} className="border px-3 py-2 text-sm" data-testid="button-cancel-agent">Cancel</button>
      </div>
    </Panel>
  );
}

function Row({ a, models, onEdit }: { a: AiAgent; models: AiModel[]; onEdit: () => void }) {
  const { toast } = useToast();
  const del = useDeleteAgent();
  const [confirm, setConfirm] = useState(false);
  const m = models.find((x) => x.id === a.model && x.provider === a.provider);
  return (
    <li className="px-4 py-3 grid gap-2" data-testid={`row-agent-${a.id}`}>
      <div className="flex items-center gap-3">
        <Bot className="h-4 w-4 text-accent shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{a.name}</span>
          <span className="label-mono">{a.provider} / {m?.label ?? a.model} · rev {a.revision} · updated {new Date(a.updatedAt).toLocaleString()}</span>
        </span>
        {!m ? <span className="label-mono !text-accent">model not in catalog</span>
          : !m.configured && <span className="label-mono !text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />no credentials</span>}
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground" title="Edit" data-testid={`button-edit-agent-${a.id}`}><Pencil className="h-4 w-4" /></button>
        <button onClick={() => setConfirm(true)} className="text-muted-foreground hover:text-destructive" title="Delete" data-testid={`button-delete-agent-${a.id}`}><Trash2 className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap pl-7">{a.prompt}</p>
      {confirm && (
        <div className="ml-7 border border-destructive/40 bg-destructive/5 p-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1">Delete <b>{a.name}</b>? Rooms can no longer seat it.</span>
          <button disabled={del.isPending} onClick={() => del.mutate({ id: a.id, revision: a.revision }, {
            onSuccess: () => toast({ title: `Deleted ${a.name}` }),
            onError: (e) => { setConfirm(false); toast({ title: "Delete refused", description: conflictMsg(e), variant: "destructive" }); },
          })} className="bg-destructive text-destructive-foreground px-3 py-1.5 disabled:opacity-50" data-testid={`button-confirm-delete-${a.id}`}>Delete</button>
          <button onClick={() => setConfirm(false)} className="border px-3 py-1.5 inline-flex items-center gap-1"><X className="h-3 w-3" />Keep</button>
        </div>
      )}
    </li>
  );
}

export default function AdminAgents() {
  const { user, isLoading } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const q = useAdminAgents();
  const [editing, setEditing] = useState<AiAgent | "new" | null>(null);
  const models = q.data?.models ?? [];
  const missing = models.filter((m) => !m.configured);
  return (
    <Shell>
      <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-8 space-y-6">
        <div className="rise flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="label-mono">Admin / AI library</p>
            <h1 className="font-display text-5xl md:text-6xl leading-none mt-2">Agents</h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-xl">Named personas owners can seat in rooms. Model list and prices come from the server catalog.</p>
          </div>
          {isAdmin && <button onClick={() => setEditing("new")} className="bg-foreground text-background px-4 py-2 text-sm inline-flex items-center gap-2" data-testid="button-new-agent"><Plus className="h-4 w-4" />New agent</button>}
        </div>
        {isLoading ? <Skeleton className="h-40" /> : !isAdmin ? (
          <Panel title="Restricted"><Empty title="Admins only" body="Your account cannot manage the AI library." /><div className="pb-6 text-center"><Link href="/" className="label-mono underline">Back to rooms</Link></div></Panel>
        ) : q.isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          : q.isError ? <ErrorLine message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (<>
          {missing.length > 0 && (
            <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive flex gap-2" data-testid="status-missing-credentials">
              <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Credentials missing for: {missing.map((m) => `${m.provider}/${m.label}`).join(", ")}. Agents on these models cannot play.</span>
            </div>
          )}
          {editing && <Editor key={editing === "new" ? "new" : `${editing.id}-${editing.revision}`} agent={editing === "new" ? null : editing} models={models} onDone={() => setEditing(null)} />}
          <Panel title="Library" meta={`${q.data!.agents.length} agents`}>
            {q.data!.agents.length === 0 ? <Empty title="No agents" body="Create one so room owners can seat AI deities." /> : (
              <ul className="divide-y">{q.data!.agents.map((a) => <Row key={a.id} a={a} models={models} onEdit={() => setEditing(a)} />)}</ul>
            )}
          </Panel>
        </>)}
      </div>
    </Shell>
  );
}
