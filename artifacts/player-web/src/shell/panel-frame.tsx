/**
 * One panel's frame: loads the panel module and contains every way it can fail. A compile error
 * (Vite reports it, or the import() rejects), a module without a panel, a render error, or a panel
 * that never finishes loading shows inline in this frame. The rest of the client keeps running.
 */
import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { isPanelDefinition, type PanelDefinition } from "./panel-types";
import type { PanelEntry } from "./panel-store";

type Loaded = { module: unknown; definition: PanelDefinition };
export type FrameStatus =
  | { kind: "loading" }
  | { kind: "ready"; loaded: Loaded }
  | { kind: "failed"; message: string };

function resolve(entry: PanelEntry, module: unknown): FrameStatus {
  const value = (module as { default?: unknown }).default;
  if (isPanelDefinition(value)) return { kind: "ready", loaded: { module, definition: value } };
  if (typeof value === "function") {
    return { kind: "ready", loaded: { module, definition: { title: entry.id, Component: value as PanelDefinition["Component"] } } };
  }
  return { kind: "failed", message: `${entry.file} must \`export default definePanel({ title, Component })\` (from "@sdk").` };
}

/**
 * A failed dynamic import only says "Failed to fetch dynamically imported module: URL". In dev, Vite
 * answers that URL with a 500 page that embeds the compiler error as JSON; show its message and code
 * frame instead, with the absolute path shortened to src/panels/….
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

/**
 * Load every panel module, and re-check them on each registry generation. A status object changes only
 * when its module object changed, so an edit to one panel remounts only that panel.
 */
export function usePanelModules(entries: readonly PanelEntry[], generation: number): Record<string, FrameStatus> {
  const [statuses, setStatuses] = useState<Record<string, FrameStatus>>({});
  useEffect(() => {
    let live = true;
    const update = (file: string, next: (previous: FrameStatus | undefined) => FrameStatus) =>
      setStatuses(all => {
        const value = next(all[file]);
        return value === all[file] ? all : { ...all, [file]: value };
      });
    const timers = entries.filter(entry => entry.load).map(entry => {
      const timer = setTimeout(() => {
        if (live) update(entry.file, s => !s || s.kind === "loading" ? { kind: "failed", message: "This panel did not finish loading within 10 s." } : s);
      }, 10_000);
      entry.load!().then(module => {
        if (live) update(entry.file, previous => previous?.kind === "ready" && previous.loaded.module === module ? previous : resolve(entry, module));
      }, async (error: unknown) => {
        const message = await describeLoadError(error);
        if (live) update(entry.file, () => ({ kind: "failed", message }));
      }).finally(() => clearTimeout(timer));
      return timer;
    });
    // Forget removed panels.
    setStatuses(all => {
      const keep = Object.fromEntries(Object.entries(all).filter(([file]) => entries.some(e => e.file === file)));
      return Object.keys(keep).length === Object.keys(all).length ? all : keep;
    });
    return () => { live = false; timers.forEach(clearTimeout); };
  }, [entries, generation]);
  return statuses;
}

type BoundaryProps = { children: ReactNode; resetKey: unknown; file: string; onError?: (error: Error) => void };
export class PanelBoundary extends Component<BoundaryProps, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: BoundaryProps, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[panel ${this.props.file}]`, error, info.componentStack);
    this.props.onError?.(error);
  }
  render() {
    if (this.state.error) {
      return <PanelError file={this.props.file} title="This panel crashed while rendering" message={this.state.error.message}
        onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

export function PanelError({ file, title, message, onRetry }: { file: string; title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" data-testid={`panel-error-${file}`} className="text-[12px] leading-snug">
      <p className="font-semibold text-destructive">{title}</p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] opacity-80">{message}</pre>
      <p className="mt-1 opacity-60">{file.startsWith("stored:")
        ? <>Save a fixed version of stored panel <code>{file.slice(7)}</code> (<code>pnpm player panel push</code>, or ask your agent); every client updates by itself.</>
        : <>Edit <code>src/panels/{file}</code> and save; the frame updates by itself.</>}</p>
      {onRetry && <button type="button" className="mt-2 underline" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** The body of a panel frame. */
export function PanelBody({ entry, status, buildError }: { entry: PanelEntry; status: FrameStatus; buildError?: string }) {
  if (buildError) return <PanelError file={entry.file} title="This panel does not compile" message={buildError} />;
  if (status.kind === "loading") return <p className="text-[12px] opacity-60">Loading…</p>;
  if (status.kind === "failed") return <PanelError file={entry.file} title="This panel failed to load" message={status.message} />;
  const { Component: Panel } = status.loaded.definition;
  return (
    <PanelBoundary resetKey={status.loaded.module} file={entry.file}>
      <Suspense fallback={<p className="text-[12px] opacity-60">Loading…</p>}>
        <Panel />
      </Suspense>
    </PanelBoundary>
  );
}
