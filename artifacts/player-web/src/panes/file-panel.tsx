/**
 * A file panel as a pane (`file:<id>`, v1's shell/panel-frame.tsx): loads src/panels/<id>.tsx and contains every way it
 * can fail. A compile error (Vite reports it, or the import() rejects), a module without a panel, a render error, or
 * a panel that never finishes loading shows inline in this pane; the rest of the app keeps running. On each registry
 * generation (a hot update) the module is imported again and the panel remounts only if its module changed.
 *
 * A file panel is the developer's own source built with the app, so it runs in the page with the app's hooks
 * (src/panels/sdk.ts); a stored panel, which anyone's assistant may have written, runs sandboxed (./stored-panel.tsx).
 */
import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { isPanelDefinition, PANEL_SDK, type PanelDefinition } from "@/sdk/panel";
import { filePanelStore, useFilePanels, type FilePanelEntry } from "@/panels/store";
import "@/panels/registry";

type Status = { kind: "loading" } | { kind: "ready"; module: unknown; definition: PanelDefinition } | { kind: "failed"; message: string };

function resolve(entry: FilePanelEntry, module: unknown): Status {
  const value = (module as { default?: unknown }).default;
  if (isPanelDefinition(value) && value.sdk === PANEL_SDK) return { kind: "ready", module, definition: value };
  if (typeof value === "function") return { kind: "ready", module, definition: { title: entry.id, Component: value as PanelDefinition["Component"], sdk: PANEL_SDK } };
  return { kind: "failed", message: `${entry.file} must \`export default definePanel({ title, Component })\` (from "@sdk").` };
}

/**
 * A failed dynamic import only says "Failed to fetch dynamically imported module: URL". In dev, Vite answers that URL
 * with a 500 page that embeds the compiler error as JSON: show its message and code frame instead.
 */
async function describeLoadError(error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  const url = message.match(/dynamically imported module: (\S+)/)?.[1];
  if (!url || !import.meta.env.DEV) return message;
  try {
    const body = await (await fetch(url, { cache: "no-store" })).text();
    const json = body.match(/const error = (\{.*\})\s*$/m)?.[1];
    if (!json) return message;
    const parsed = JSON.parse(json) as { message?: string; frame?: string };
    const text = (parsed.message ?? message).replace(/^.*?(src\/panels\/)/, "$1");
    return parsed.frame && !text.includes(parsed.frame.trim()) ? `${text}\n\n${parsed.frame}` : text;
  } catch { return message; }
}

/** The module: in a dev server, the version of its last hot update (that version's import fails if it does not compile). */
const loadVersion = (entry: FilePanelEntry, stamp: number | undefined) =>
  import.meta.env.DEV && stamp ? import(/* @vite-ignore */ `${import.meta.env.BASE_URL}src/panels/${entry.file}?t=${stamp}`) : entry.load();

function useModule(entry: FilePanelEntry | undefined, generation: number, stamp: number | undefined): Status {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  useEffect(() => {
    if (!entry) return;
    let live = true;
    const timer = setTimeout(() => { if (live) setStatus(s => (s.kind === "loading" ? { kind: "failed", message: "This panel did not finish loading within 10 s." } : s)); }, 10_000);
    loadVersion(entry, stamp).then(module => {
      if (!live) return;
      setStatus(previous => (previous.kind === "ready" && previous.module === module ? previous : resolve(entry, module)));
      filePanelStore.clearBuildError(entry.file);
    }, async (error: unknown) => {
      const message = await describeLoadError(error);
      if (live) setStatus({ kind: "failed", message });
    }).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); };
  }, [entry, generation, stamp]);
  return status;
}

type BoundaryProps = { children: ReactNode; resetKey: unknown; file: string };
class PanelBoundary extends Component<BoundaryProps, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: BoundaryProps, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn(`[panel ${this.props.file}]`, error, info.componentStack); }
  render() {
    if (this.state.error) return <PanelError file={this.props.file} title="This panel crashed while rendering" message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function PanelError({ file, title, message, onRetry }: { file: string; title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" data-testid={`panel-error-${file}`} className="p-4 text-xs leading-snug">
      <p className="font-semibold text-destructive">{title}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono opacity-80">{message}</pre>
      <p className="mt-1 opacity-60">Edit <code>src/panels/{file}</code> and save; the pane updates by itself.</p>
      {onRetry && <button type="button" className="mt-2 underline" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function FilePanelPane({ id }: { id: string }) {
  const { entries, generation, buildErrors, stamps } = useFilePanels();
  const entry = entries.find(e => e.id === id);
  const status = useModule(entry, generation, entry && stamps[entry.file]);
  if (!entry) return <p className="p-4 text-sm text-muted-foreground" data-testid="file-panel-missing">There is no file panel "{id}" (src/panels/{id}.tsx) in this copy of the app. Close this pane.</p>;
  const buildError = buildErrors[entry.file];
  if (buildError) return <PanelError file={entry.file} title="This panel does not compile" message={buildError} />;
  if (status.kind === "loading") return <p className="p-4 text-xs opacity-60">Loading…</p>;
  if (status.kind === "failed") return <PanelError file={entry.file} title="This panel failed to load" message={status.message} />;
  const { Component: Panel } = status.definition;
  return (
    <div className="p-3 text-sm" data-testid={`file-panel-${id}`}>
      <PanelBoundary resetKey={status.module} file={entry.file}>
        <Suspense fallback={<p className="text-xs opacity-60">Loading…</p>}><Panel /></Suspense>
      </PanelBoundary>
    </div>
  );
}

