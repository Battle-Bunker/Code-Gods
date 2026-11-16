/**
 * The room's Setup combobox (archive/engine-v1 site/components/setup-picker.tsx, ported): one searchable list of every
 * game setup, the system's first (the deployed presets; the Lab last, for administrators), then everyone's saved setups
 * by name, or the best matches of a search (v2/setups:search). Each saved row shows its name, whose it is ("You" or the
 * owner's name) and what it plays, with Edit (yours only; otherwise the reason) and Duplicate, which make and open your
 * copy on the configure page. Picking a row applies it to the room at once, through `room.settings`, with Undo.
 *
 * Reads (read-architecture R1): the saved setups are a paged skeleton (v2/setups:shared or :search) loaded while the
 * popover is open, a page more as it scrolls, and each row subscribes to its own setup (v2/setups:get) while it shows.
 */
import { useState, type UIEvent } from "react";
import { useLocation } from "wouter";
import { Command as Cmdk } from "cmdk";
import { ChevronsUpDown, Copy, Pencil, Plus, Search } from "lucide-react";
import { api } from "@workspace/engine/convex/_generated/api";
import { PRESETS, presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useAffordance } from "@workspace/v2-affordances/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastAction } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { ErrorLine } from "@/site/components/page-parts";
import { Tip, failureText } from "@/site/components/action";
import { useLive, useLivePages } from "@/site/lib/convex";
import { configurePath } from "@/site/lib/routes";
import { presetRows, setupBlurb } from "@/site/lib/setup-picker";
import { errMsg } from "@/site/lib/errors";
import { toast } from "@/hooks/use-toast";
import type { Room } from "@/sdk/types";

const PAGE = 20;
/** Within this many pixels of the list's end, the next page loads. */
const LOAD_AHEAD = 120;

/** The room's setup in words: the saved setup it runs, else its preset. */
export const setupTitle = (room: Pick<Room, "preset" | "setup">) => room.setup?.name ?? presetOf(room.preset).title;

/** The picker inside its own error boundary: a failed page takes down only the picker, never the room page. */
export function SetupCombobox({ room, admin, locked }: { room: Room; admin: boolean; locked: string | null }) {
  return (
    <ErrorBoundary FallbackComponent={({ error }) => <div data-testid="setup-picker-error"><ErrorLine message={`The list of setups could not be loaded: ${errMsg(error)}`} /></div>}>
      <Picker room={room} admin={admin} locked={locked} />
    </ErrorBoundary>
  );
}

function Picker({ room, admin, locked }: { room: Room; admin: boolean; locked: string | null }) {
  const [, navigate] = useLocation();
  const settings = useAffordance("room.settings");
  const duplicate = useAffordance("setups.duplicate");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim();
  const shared = useLivePages(api.v2.setups.shared, open && !q ? {} : "skip", { initialNumItems: PAGE });
  const found = useLivePages(api.v2.setups.search, open && q ? { q } : "skip", { initialNumItems: PAGE });
  const saved = q ? found : shared;
  const systems = presetRows(PRESETS, { admin, current: room.preset, query });

  /** Applies a setup at once (v1); Undo puts the room back as it was. */
  const apply = async (args: { preset: string } | { setupId: string }, title: string) => {
    setOpen(false);
    if (locked || busy) return;
    const before = room.setup ? { setupId: room.setup.setupId } : { preset: room.preset, overrides: Object.fromEntries(Object.entries(room.overrides).filter(([k]) => k !== "timeScale")) };
    setBusy(true);
    try {
      await settings.run(args as never);
      toast({
        title: `Next game: ${title}`,
        action: <ToastAction altText="Undo the setup change" data-testid="button-undo-setup" onClick={() => void settings.run(before as never).catch(e => toast({ title: "The setup did not change back", description: failureText(e), variant: "destructive" }))}>Undo</ToastAction>,
      });
    } catch (e) {
      toast({ title: "The setup did not change", description: failureText(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  /** Duplicate (and Edit of another's setup): your own copy at once, opened on the configure page (v1). */
  const copy = async (setupId: string) => {
    setOpen(false);
    try {
      const r = await duplicate.run({ setupId }) as { setupId: string; name: string };
      toast({ title: `Made “${r.name}”` });
      navigate(configurePath(room.code, r.setupId));
    } catch (e) { toast({ title: "The setup was not copied", description: failureText(e), variant: "destructive" }); }
  };
  const more = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (saved.status === "CanLoadMore" && el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_AHEAD) saved.loadMore(PAGE);
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-controls="setup-picker-list" aria-label={`Setup for the next game: ${setupTitle(room)}`} disabled={busy} data-testid="select-setup"
          className="flex min-w-0 w-full sm:w-[24rem] items-center gap-2 border bg-background px-2 py-1.5 text-left text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium" data-testid="text-current-setup">{setupTitle(room)}</span>
            <span className="text-muted-foreground"> · {room.setup ? presetOf(room.preset).title : "System"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,36rem)] p-0" data-testid="popover-setups">
        <Cmdk shouldFilter={false} loop label="Game setups" className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Cmdk.Input value={query} onValueChange={setQuery} placeholder="Search setups by name…" data-testid="input-setup-search"
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          {locked && <p className="border-b px-3 py-2 text-xs text-muted-foreground" data-testid="text-setup-locked">{locked}</p>}
          <Cmdk.List id="setup-picker-list" className="max-h-[min(60vh,26rem)] overflow-y-auto p-1" onScroll={more}>
            <Cmdk.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{q ? `No setup matches “${query}”.` : "No setups yet."}</Cmdk.Empty>
            {systems.length > 0 && (
              <Cmdk.Group heading="System" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
                {systems.map(({ preset: p, lab }) => (
                  <Cmdk.Item key={p.id} value={`preset:${p.id}`} onSelect={() => void apply({ preset: p.id }, p.title)} data-testid={`row-setup-preset-${p.id}`}
                    className="flex items-start gap-2 px-2 py-2 text-sm cursor-pointer aria-selected:bg-muted data-[selected=true]:bg-muted">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        <span className="font-medium">{p.title}</span>
                        {!room.setup && p.id === room.preset && <span className="text-primary"> (current)</span>}
                        <span className="text-muted-foreground"> · System</span>
                        {lab && <span className="text-accent" data-testid={`text-setup-lab-${p.id}`}> · Lab</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">{setupBlurb(p)}</span>
                    </span>
                    <Tip text="System setups cannot be edited: change their settings on the configure page, or keep yours as a setup there.">
                      <button type="button" aria-disabled aria-label={`Edit ${p.title}`} className="p-1.5 opacity-40 cursor-not-allowed" data-testid={`button-edit-setup-preset-${p.id}`}
                        onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}><Pencil className="h-4 w-4" /></button>
                    </Tip>
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            )}
            {saved.results.length > 0 && (
              <Cmdk.Group heading={q ? "Saved setups, best match first" : "Saved setups"} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
                {saved.results.map(r => (
                  <SavedRow key={r.setupId} setupId={r.setupId} name={r.name} current={room.setup?.setupId === r.setupId}
                    onPick={title => void apply({ setupId: r.setupId }, title)} onCopy={() => void copy(r.setupId)}
                    onEdit={() => { setOpen(false); navigate(configurePath(room.code, r.setupId)); }} />
                ))}
              </Cmdk.Group>
            )}
            {saved.status === "LoadingMore" && <p className="px-3 py-2 text-xs text-muted-foreground">Loading more…</p>}
          </Cmdk.List>
          <div className="border-t p-2 space-y-1">
            <button type="button" data-testid="button-new-setup" onClick={() => { setOpen(false); navigate(`${configurePath(room.code)}#field-save-setup`); }}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-muted"><Plus className="h-4 w-4" />New setup</button>
            <p className="px-2 text-xs text-muted-foreground">New setup opens every setting; keep them under a name there. Duplicate makes your own copy at once and opens it.</p>
          </div>
        </Cmdk>
      </PopoverContent>
    </Popover>
  );
}

/** One saved setup: its name at once, the rest from its own subscription (v2/setups:get) while it shows. */
function SavedRow({ setupId, name, current, onPick, onEdit, onCopy }: { setupId: string; name: string; current: boolean; onPick: (title: string) => void; onEdit: () => void; onCopy: () => void }) {
  const s = useLive(api.v2.setups.get, { setupId }).data;
  const who = !s ? "…" : s.mine ? "You" : s.ownerName;
  const blocked = s && !s.mine ? `Only ${s.ownerName} can edit this setup: duplicate it` : null;
  return (
    <Cmdk.Item value={`setup:${setupId}`} onSelect={() => onPick(s?.name ?? name)} data-testid={`row-setup-${name}`}
      className="flex items-start gap-2 px-2 py-2 text-sm cursor-pointer aria-selected:bg-muted data-[selected=true]:bg-muted">
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="font-medium">{s?.name ?? name}</span>
          {current && <span className="text-primary"> (current)</span>}
          <span className="text-muted-foreground" data-testid={`text-setup-owner-${name}`}> · {who}</span>
        </span>
        {/* The line is there before the row's own read arrives, so rows never grow under the pointer. */}
        <span className="block text-xs text-muted-foreground truncate">{s ? `${presetOf(s.preset).title}: ${setupBlurb(presetOf(s.preset))}` : "…"}</span>
      </span>
      <Tip text={blocked ?? "Opens this setup on the configure page to edit it."}>
        <button type="button" aria-disabled={!!blocked || undefined} aria-label={`Edit ${name}`} data-testid={`button-edit-setup-${name}`}
          className={`p-1.5 ${blocked ? "opacity-40 cursor-not-allowed" : "hover:bg-background"}`}
          onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (!blocked) onEdit(); }}><Pencil className="h-4 w-4" /></button>
      </Tip>
      <Tip text="Makes your own copy at once and opens it.">
        <button type="button" aria-label={`Duplicate ${name}`} data-testid={`button-duplicate-setup-${name}`} className="p-1.5 hover:bg-background"
          onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onCopy(); }}><Copy className="h-4 w-4" /></button>
      </Tip>
    </Cmdk.Item>
  );
}
