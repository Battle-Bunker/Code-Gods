/**
 * The room's Setup combobox (docs/ui-redesign.md §2.4): one searchable list of every game setup (cmdk, as the palette),
 * the system's first, then everyone's. Typing filters by name, owner and summary; each row shows the name, whose it is
 * ("System", "You" or the owner's name) and its one-line summary, with Edit (unavailable, with the reason, unless the
 * viewer owns it) and Duplicate. Picking a row applies it to the room at once (the app offers Undo). There is no
 * "Custom" and no separate defaults: a new setup starts as a copy of the room's current one ("New setup").
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Command as Cmdk } from "cmdk";
import { ChevronsUpDown, Copy, Pencil, Plus, Search } from "lucide-react";
import type { RoomState, Setup } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/action";
import { useRun } from "@/hooks/use-run";
import { usePage } from "@/components/layout";
import { editBlocker, ownerLabel, searchSetups } from "@/lib/setup-words";

export function setupTitle(room: Pick<RoomState, "setup">): string {
  return room.setup ? `${room.setup.name}${room.setup.deleted ? " (deleted)" : ""}` : "No setup";
}

export function SetupPicker({ room }: { room: RoomState }) {
  const { setups, act } = usePage();
  const [, navigate] = useLocation();
  const runner = useRun();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const all = setups ?? [];
  const rows = searchSetups(all, query);
  const current = all.find(s => s.id === room.setup?.id);
  const frozen = room.activeGame;
  const configure = (id: string) => `/rooms/${room.shortCode}/configure?setup=${encodeURIComponent(id)}`;
  const duplicate = (id: string) => { setOpen(false); runner.run("Duplicate the setup", () => act.duplicateSetup(id)); };
  // Picking the current setup again re-applies it: the room takes the setup's settings as they are now.
  const pick = (s: Setup) => {
    setOpen(false);
    if (frozen) return;
    runner.run("Choose the next game's setup", () => act.applySetup(s.id));
  };
  const newSetup = () => {
    if (!room.setup) return;
    if (room.setup.deleted) { setOpen(false); navigate(`/rooms/${room.shortCode}/configure`); } else duplicate(room.setup.id);
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-controls="setup-picker-list" disabled={!setups || runner.pending} data-testid="select-setup"
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
          <Cmdk.List id="setup-picker-list" className="max-h-[min(60vh,26rem)] overflow-y-auto p-1">
            <Cmdk.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No setup matches “{query}”.</Cmdk.Empty>
            {rows.map(s => {
              const blocked = editBlocker(s);
              return (
                <Cmdk.Item key={s.id} value={s.id} onSelect={() => pick(s)} data-testid={`row-setup-${s.id}`}
                  className="flex items-start gap-2 px-2 py-2 text-sm cursor-pointer aria-selected:bg-muted data-[selected=true]:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-medium">{s.name}</span>
                      {s.id === room.setup?.id && <span className="text-primary"> (current)</span>}
                      <span className="text-muted-foreground" data-testid={`text-setup-owner-${s.id}`}> · {ownerLabel(s)}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground line-clamp-2">{s.summary}</span>
                  </span>
                  <Tip text={blocked ?? "Opens this setup on the configuration page to edit it."}>
                    <button type="button" aria-disabled={!!blocked || undefined} aria-label={`Edit ${s.name}`} data-testid={`button-edit-setup-${s.id}`}
                      className={`p-1.5 ${blocked ? "opacity-40 cursor-not-allowed" : "hover:bg-background"}`}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); if (!blocked) { setOpen(false); navigate(configure(s.id)); } }}><Pencil className="h-4 w-4" /></button>
                  </Tip>
                  <Tip k="setups.duplicate">
                    <button type="button" aria-label={`Duplicate ${s.name}`} data-testid={`button-duplicate-setup-${s.id}`} className="p-1.5 hover:bg-background"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); duplicate(s.id); }}><Copy className="h-4 w-4" /></button>
                  </Tip>
                </Cmdk.Item>
              );
            })}
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
