/**
 * The command palette, minimal: a trigger and a dialog listing commands for a query (searchCommands). WP3 replaces the
 * rendering with the cmdk implementation; the Command/PaletteContext contract stays.
 */
import { useEffect, useState, type JSX } from "react";
import { searchCommands } from "./commands.ts";
import type { Command, PaletteContext } from "./types.ts";

export type PaletteOpenInit = { query?: string; page?: string };

export function PaletteTrigger({ placeholder, onOpen, compact }: { placeholder: string; onOpen(init?: PaletteOpenInit): void; compact?: boolean }): JSX.Element {
  return (
    <button type="button" data-testid="button-palette" onClick={() => onOpen()} aria-label={placeholder}
      className="inline-flex items-center gap-2 border border-current px-2.5 py-1 text-xs font-semibold">
      <span aria-hidden>☰</span>{!compact && <span className="opacity-70">{placeholder}</span>}
    </button>
  );
}

export function CommandPalette({ commands, context, open, onOpenChange, placeholder, suggested }: {
  commands: readonly Command[]; context: PaletteContext; open: boolean; onOpenChange(open: boolean): void; placeholder: string;
  suggested?: readonly string[]; recentKey?: string;
}): JSX.Element | null {
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  if (!open) return null;
  const rows = searchCommands(commands, query, context);
  const shown = !query && suggested?.length ? rows.filter(r => suggested.includes(r.command.id)).concat(rows.filter(r => !suggested.includes(r.command.id))) : rows;
  const run = (command: Command) => {
    const p = command.performer;
    if (p.kind === "navigate") location.assign(typeof p.to === "function" ? p.to() : p.to);
    else if (p.kind === "submit") void p.run();
    else if (p.kind === "local") p.run();
    onOpenChange(false);
  };
  return (
    <div role="dialog" aria-modal="true" data-testid="dialog-palette" className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg bg-card text-card-foreground border border-[hsl(var(--card-border))] shadow-2xl" onClick={e => e.stopPropagation()}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          onKeyDown={e => { if (e.key === "Escape") onOpenChange(false); if (e.key === "Enter" && shown[0]?.availability.ok) run(shown[0].command); }}
          className="w-full bg-transparent border-b border-[hsl(var(--card-border))] px-3 py-2 text-sm outline-none" />
        <ul className="max-h-[50vh] overflow-auto py-1 text-sm">
          {shown.length === 0 && <li className="px-3 py-2 opacity-60">Nothing matches.</li>}
          {shown.map(({ command, availability }) => (
            <li key={command.id}>
              <button type="button" disabled={!availability.ok} title={availability.ok ? command.human.tooltip : availability.reason}
                onClick={() => run(command)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left disabled:opacity-40 hover:bg-muted">
                <span>{command.human.title}</span>
                <span className="ml-auto text-[11px] opacity-60">{availability.ok ? command.group : availability.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
