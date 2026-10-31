/**
 * The AI library (palette-and-pages.md §3.7): rows of name · model · status, one "New AI player", the editor on its
 * own route (/admin/agents/new, /admin/agents/:id) with Delete as a danger action behind a modal.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Page } from "@/components/layout";
import { Action } from "@/components/action";
import { EmptyState, ErrorLine, Section } from "@/components/page-parts";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errCode, errMsg } from "@/lib/errors";
import { useAdminAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, type AiAgent, type AiModel } from "@/hooks/use-agents";
import { Bot, KeyRound } from "lucide-react";

const MAX = 10000;
const field = "w-full border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
const price = (m: AiModel) => `$${m.inputUsdPerMillion} in / $${m.outputUsdPerMillion} out per million tokens`;

function conflictMsg(e: unknown) {
  if (errCode(e) === "CONFLICT") return `Someone else changed this AI player first. ${errMsg(e)}. Reload to see the latest version.`;
  return errMsg(e);
}

function Editor({ agent, models }: { agent: AiAgent | null; models: AiModel[] }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const del = useDeleteAgent();
  const providers = useMemo(() => [...new Set(models.map(m => m.provider))], [models]);
  const [name, setName] = useState(agent?.name ?? "");
  const [provider, setProvider] = useState(agent?.provider ?? providers[0] ?? "");
  const [model, setModel] = useState(agent?.model ?? models.find(m => m.provider === (agent?.provider ?? providers[0]))?.id ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const forProvider = models.filter(m => m.provider === provider);
  const sel = models.find(m => m.id === model && m.provider === provider);
  const unknownModel = !!model && !sel;
  const valid = name.trim().length > 0 && !!provider && !!model && prompt.trim().length > 0 && prompt.length <= MAX;
  const back = () => navigate("/admin/agents");
  const submit = () => {
    setErr(null); setPending(true);
    const d = { name: name.trim(), provider, model, prompt };
    const call = agent ? update({ ...d, id: agent.id, revision: agent.revision }) : create(d);
    call.then(() => { toast({ title: agent ? "AI player saved" : "AI player created" }); back(); }, e => setErr(agent ? conflictMsg(e) : errMsg(e))).finally(() => setPending(false));
  };
  return (
    <Section title={agent ? agent.name : "New AI player"} testId="panel-agent-editor">
      <div className="p-4 grid gap-3">
        <label className="space-y-1"><span className="text-sm">Name</span>
          <input value={name} maxLength={120} onChange={e => setName(e.target.value)} className={field} data-testid="input-agent-name" /></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1"><span className="text-sm">Provider</span>
            <select value={provider} onChange={e => { setProvider(e.target.value); setModel(models.find(m => m.provider === e.target.value)?.id ?? ""); }} className={field} data-testid="select-agent-provider">
              {!(providers as string[]).includes(provider) && <option value={provider}>{provider || "—"} (not offered)</option>}
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <label className="space-y-1"><span className="text-sm">Model</span>
            <select value={model} onChange={e => setModel(e.target.value)} className={field} data-testid="select-agent-model">
              {unknownModel && <option value={model}>{model} (no longer offered)</option>}
              {forProvider.map(m => <option key={m.id} value={m.id}>{m.label} · {price(m)}{m.configured ? "" : " · key missing"}</option>)}
            </select></label>
        </div>
        {sel && !sel.configured && <p className="text-xs text-destructive inline-flex items-center gap-1.5" data-testid="text-model-status"><KeyRound className="h-3 w-3" />This model's provider key is not set on the server; the AI player cannot play until it is.</p>}
        {unknownModel && <p className="text-xs text-accent">This model is no longer offered. Pick another before saving.</p>}
        <label className="space-y-1">
          <span className="flex justify-between text-sm"><span>Strategy prompt</span><span className={prompt.length > MAX ? "text-destructive" : "text-muted-foreground"} data-testid="text-prompt-count">{prompt.length.toLocaleString()} / {MAX.toLocaleString()}</span></span>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={12} className={`${field} resize-y leading-relaxed`} placeholder="How this AI player negotiates, plans and writes agents." data-testid="input-agent-prompt" />
        </label>
        {err && <ErrorLine message={err} />}
      </div>
      <div className="border-t p-3 flex flex-wrap gap-2">
        <button type="button" disabled={!valid || unknownModel || pending} onClick={submit} className="bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40" data-testid="button-save-agent">{pending ? "Saving…" : agent ? "Save changes" : "Create AI player"}</button>
        <button type="button" onClick={back} className="border px-3 py-2 text-sm" data-testid="button-cancel-agent">Cancel</button>
        <span className="flex-1" />
        {agent && <button type="button" onClick={() => setConfirmDelete(true)} className="border border-destructive/50 text-destructive px-3 py-2 text-sm" data-testid={`button-delete-agent-${agent.id}`}>Delete…</button>}
      </div>
      {agent && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
              <AlertDialogDescription>Rooms can no longer seat it; AI players already seated keep playing. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel autoFocus>Keep it</AlertDialogCancel>
              <AlertDialogAction data-testid={`button-confirm-delete-${agent.id}`} onClick={() => del({ id: agent.id, revision: agent.revision }).then(
                () => { toast({ title: `Deleted ${agent.name}` }); back(); },
                e => toast({ title: "Delete refused", description: conflictMsg(e), variant: "destructive" }))}>Delete {agent.name}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Section>
  );
}

export default function AdminAgents() {
  const { user, isLoading } = useAuth();
  const params = useParams<{ id?: string }>();
  const isAdmin = !!user?.isAdmin;
  const q = useAdminAgents(isAdmin);
  const models = q.data?.models ?? [];
  const missing = models.filter(m => !m.configured);
  const editing = params.id === "new" ? "new" : params.id ? q.data?.agents.find(a => a.id === params.id) ?? null : undefined;
  useEffect(() => { document.title = "AI library · Code Gods"; }, []);
  const crumbs = [{ label: "AI library", href: "/admin/agents" }, ...(editing === "new" ? [{ label: "New" }] : editing ? [{ label: editing.name }] : [])];
  return (
    <Page crumbs={crumbs}>
      <div className="mx-auto max-w-[1000px] px-4 md:px-6 py-8 space-y-6 rise">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="font-display text-5xl leading-none">AI players</h1>
          {isAdmin && editing === undefined && <Action k="aiTemplates.create" label="New AI player" tone="primary" href="/admin/agents/new" testId="button-new-agent" />}
        </div>
        {isLoading ? <Skeleton className="h-40" /> : !isAdmin ? (
          <section className="border bg-card"><EmptyState title="Admins only" body="Your account cannot manage the AI library." action={<Link href="/" className="underline underline-offset-4">Your rooms</Link>} /></section>
        ) : q.isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          : q.error ? <ErrorLine message={errMsg(q.error)} /> : !q.data ? null : (<>
          {missing.length > 0 && (
            <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive flex gap-2" data-testid="status-missing-credentials">
              <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No provider key for {[...new Set(missing.map(m => m.provider))].join(", ")}: set {[...new Set(missing.map(m => m.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"))].join(" and ")} on the deployment. AI players on those models cannot play.</span>
            </div>
          )}
          {editing === null ? <ErrorLine message="No such AI player. It may have been deleted." />
          : editing !== undefined ? <Editor key={editing === "new" ? "new" : `${editing.id}-${editing.revision}`} agent={editing === "new" ? null : editing} models={models} />
          : (
            <Section title="Library" count={q.data.agents.length}>
              {q.data.agents.length === 0 ? <EmptyState title="No AI players" body="Create one so room owners can fill seats with AI players." /> : (
                <ul className="divide-y">{q.data.agents.map(a => {
                  const m = models.find(x => x.id === a.model && x.provider === a.provider);
                  return (
                    <li key={a.id} data-testid={`row-agent-${a.id}`}>
                      <Link href={`/admin/agents/${a.id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/60" data-testid={`button-edit-agent-${a.id}`}>
                        <Bot className="h-4 w-4 text-accent shrink-0" />
                        <span className="flex-1 min-w-0"><span className="block font-medium truncate">{a.name}</span><span className="text-xs text-muted-foreground">{m?.label ?? a.model}</span></span>
                        <span className={`text-xs ${!m || !m.configured ? "text-destructive" : "text-muted-foreground"}`}>{!m ? "model not offered" : m.configured ? "ready" : "key missing"}</span>
                      </Link>
                    </li>
                  );
                })}</ul>
              )}
            </Section>
          )}
        </>)}
      </div>
    </Page>
  );
}
