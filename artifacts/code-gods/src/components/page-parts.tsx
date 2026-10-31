/**
 * The engine UI's page vocabulary (palette-and-pages.md §4): a key/value strip (≤ 4 pairs, the only place for
 * `label-mono`), sections (≤ 4 per page; collapsible ones remember their state per viewer), empty states that always
 * name a next step, and the error line. Static: entrance motion is the page's own `rise`, once.
 */
import { useEffect, useState, type ReactNode } from "react";

export function KeyValueStrip({ items }: { items: readonly { label: string; value: ReactNode; testId?: string }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      {items.slice(0, 4).map(i => (
        <div key={i.label} className="min-w-0">
          <dt className="label-mono">{i.label}</dt>
          <dd className="text-base break-words" data-testid={i.testId}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const readOpen = (key: string | undefined, fallback: boolean) => {
  if (!key) return fallback;
  try { const v = window.localStorage.getItem(`section:${key}`); return v === null ? fallback : v === "1"; } catch { return fallback; }
};

/** A page section; `collapsible` ones are a disclosure with a one-line summary, remembered per viewer under `persistKey`. */
export function Section({ title, count, summary, collapsible, defaultOpen = true, persistKey, action, children, testId, className = "" }: {
  title: string; count?: number; summary?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; persistKey?: string;
  action?: ReactNode; children: ReactNode; testId?: string; className?: string;
}) {
  const [open, setOpen] = useState(() => readOpen(persistKey, defaultOpen));
  useEffect(() => { if (persistKey) try { window.localStorage.setItem(`section:${persistKey}`, open ? "1" : "0"); } catch { /* a convenience */ } }, [open, persistKey]);
  const heading = <><span className="font-medium">{title}</span>{count !== undefined && <span className="text-muted-foreground"> ({count})</span>}</>;
  if (collapsible) {
    return (
      <details open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)} className={`border bg-card ${className}`} data-testid={testId}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm flex items-baseline gap-2">
          <span aria-hidden className="text-muted-foreground">{open ? "▾" : "▸"}</span>{heading}
          {!open && summary && <span className="text-muted-foreground truncate"> · {summary}</span>}
        </summary>
        <div className="border-t">{children}</div>
      </details>
    );
  }
  return (
    <section className={`border bg-card ${className}`} data-testid={testId}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm">
        <h2>{heading}</h2>{action}
      </div>
      {children}
    </section>
  );
}

/** An empty state: a short title, one sentence, and an action or the palette command to use. */
export function EmptyState({ title, body, action, testId }: { title: string; body: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="px-4 py-8 text-center space-y-2" data-testid={testId}>
      <p className="font-display text-xl">{title}</p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="status-error" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="underline" data-testid="button-retry">Retry</button>}
    </div>
  );
}

/** The page's one status sentence and its single next step (primary button, ≤ 2 text links). */
export function NextStepBar({ status, primary, secondary, testId = "text-viewer-seat" }: { status: string; primary?: ReactNode; secondary?: ReactNode; testId?: string }) {
  return (
    <div className="space-y-3" data-testid="next-step">
      <p className="text-lg" data-testid={testId}>{status}</p>
      {(primary || secondary) && <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{primary}{secondary}</div>}
    </div>
  );
}
