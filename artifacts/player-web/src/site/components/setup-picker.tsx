/**
 * The room's Setup combobox (docs/ui-redesign.md §2.4): one searchable list of every game setup (cmdk, as the palette),
 * the system's first, then everyone's by name. Typing searches name, owner and summary on the server. Each row shows
 * the name, whose it is ("System", "You" or the owner's name) and its one-line summary, with Edit (unavailable, with
 * the reason, unless the viewer owns it) and Duplicate. Picking a row applies it to the room at once (the app offers
 * Undo). There is no "Custom" and no separate defaults: a new setup starts as a copy of the room's current one ("New
 * setup").
 *
 * Reads (read-architecture R1): the list is the catalogue's paged skeleton (setups.page, loaded while the popover is
 * open, a page more as it scrolls), and each row subscribes to its own setup (setups.row) only while it is on screen.
 */
import { useRef, useState, type UIEvent } from "react";
import { useLocation } from "wouter";
import { Command as Cmdk } from "cmdk";
import { ChevronsUpDown, Copy, Pencil, Plus, Search } from "lucide-react";
import type { RoomState, SetupEntry } from "@/site/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/site/components/action";
import { useRun } from "@/site/hooks/use-run";
import { usePage } from "@/site/components/layout";
import { PICKER_PAGE, useInView, useSetupPages, useSetupRow } from "@/site/hooks/use-setups";
import { editBlocker, ownerLabel } from "@/site/lib/setup-words";

export function setupTitle(room: Pick<RoomState, "setup">): string {
  return room.setup ? `${room.setup.name}${room.setup.deleted ? " (deleted)" : ""}` : "No setup";
}

/** Within this many pixels of the list's end, the next page loads. */
const LOAD_AHEAD = 120;

export function SetupPicker({ room }: { room: RoomState }) {
  const { act } = usePage();
  const [, navigate] = useLocation();
  const runner = useRun();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = useSetupRow(room.setup && !room.setup.deleted ? room.setup.id : undefined).data;
  const pages = useSetupPages(query, open);
  const frozen = room.activeGame;
  const duplicate = (id: string) => { setOpen(false); runner.run("Duplicate the setup", () => act.duplicateSetup(id)); };
  // Picking the current setup again re-applies it: the room takes the setup's settings as they are now.
  const pick = (id: string) => {
    setOpen(false);
    if (frozen) return;
    runner.run("Choose the next game's setup", () => act.applySetup(id));
  };
  const newSetup = () => {
    if (!room.setup) return;
    if (room.setup.deleted) { setOpen(false); navigate(`/rooms/${room.shortCode}/configure`); } else duplicate(room.setup.id);
  };
  const more = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (pages.status === "CanLoadMore" && el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_AHEAD) pages.loadMore(PICKER_PAGE);
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-controls="setup-picker-list" disabled={runner.pending} data-testid="select-setup"
          className="flex min-w-0 w-full sm:w-[24rem] items-center gap-2 border bg-background px-2 py-1.5 text-left text-sm outline-none focus:border-primary disabled:opacity-50">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium" data-testid="text-current-setup">{setupTitle(room)}</span>
            {current && <span className="text-muted-foreground"> · {ownerLabel(current)}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,36rem)] p-0" data-testid="popover-setups">
        <Cmdk shouldFilter={false} loop label="Game setups" className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Cmdk.Input value={query} onValueChange={setQuery} placeholder="Search by name, owner or summary…" data-testid="input-setup-search"
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          {frozen && <p className="border-b px-3 py-2 text-xs text-muted-foreground">A game is running: you can pick a setup after game {frozen.shortCode} ends.</p>}
          <Cmdk.List id="setup-picker-list" className="max-h-[min(60vh,26rem)] overflow-y-auto p-1" onScroll={more}>
            {pages.loading
              ? <Cmdk.Loading><p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading setups…</p></Cmdk.Loading>
              : <Cmdk.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{query.trim() ? `No setup matches “${query}”.` : "No setups yet."}</Cmdk.Empty>}
            {pages.results.map(entry => (
              <SetupRow key={entry.id} entry={entry} current={entry.id === room.setup?.id} onPick={() => pick(entry.id)} onDuplicate={() => duplicate(entry.id)}
                onEdit={() => { setOpen(false); navigate(`/rooms/${room.shortCode}/configure?setup=${encodeURIComponent(entry.id)}`); }} />
            ))}
            {pages.status === "LoadingMore" && <p className="px-3 py-2 text-xs text-muted-foreground">Loading more…</p>}
          </Cmdk.List>
          <div className="border-t p-2 space-y-1">
            <Tip k="ui.newSetup">
              <button type="button" disabled={!room.setup} data-testid="button-new-setup" onClick={newSetup}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-muted disabled:opacity-50"><Plus className="h-4 w-4" />New setup</button>
            </Tip>
            <p className="px-2 text-xs text-muted-foreground">Duplicate and New setup make your own copy at once and open it; if you do not need it, delete it from its page.</p>
          </div>
        </Cmdk>
      </PopoverContent>
    </Popover>
  );
}

/** One row: the skeleton's entry at once, its owner from its own subscription (setups.row) while it is on screen. */
function SetupRow({ entry, current, onPick, onEdit, onDuplicate }: { entry: SetupEntry; current: boolean; onPick: () => void; onEdit: () => void; onDuplicate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const row = useSetupRow(useInView(ref) ? entry.id : undefined).data;
  const who = row ? ownerLabel(row) : entry.system ? "System" : entry.mine ? "You" : "…";
  const blocked = row ? editBlocker(row) : entry.mine ? null : entry.system ? "System setups cannot be edited: duplicate it" : "Only its owner can edit this setup";
  return (
    <Cmdk.Item ref={ref} value={entry.id} onSelect={onPick} data-testid={`row-setup-${entry.id}`}
      className="flex items-start gap-2 px-2 py-2 text-sm cursor-pointer aria-selected:bg-muted data-[selected=true]:bg-muted">
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="font-medium">{row?.name ?? entry.name}</span>
          {current && <span className="text-primary"> (current)</span>}
          <span className="text-muted-foreground" data-testid={`text-setup-owner-${entry.id}`}> · {who}</span>
        </span>
        <span className="block text-xs text-muted-foreground line-clamp-2">{row?.summary ?? entry.summary}</span>
      </span>
      <Tip text={blocked ?? "Opens this setup on the configuration page to edit it."}>
        <button type="button" aria-disabled={!!blocked || undefined} aria-label={`Edit ${entry.name}`} data-testid={`button-edit-setup-${entry.id}`}
          className={`p-1.5 ${blocked ? "opacity-40 cursor-not-allowed" : "hover:bg-background"}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); if (!blocked) onEdit(); }}><Pencil className="h-4 w-4" /></button>
      </Tip>
      <Tip k="setups.duplicate">
        <button type="button" aria-label={`Duplicate ${entry.name}`} data-testid={`button-duplicate-setup-${entry.id}`} className="p-1.5 hover:bg-background"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDuplicate(); }}><Copy className="h-4 w-4" /></button>
      </Tip>
    </Cmdk.Item>
  );
}
