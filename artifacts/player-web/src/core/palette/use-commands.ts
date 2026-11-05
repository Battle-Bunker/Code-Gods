/**
 * Wires the palette's command list (commands.ts) to this client: the player's situation, the dock, the panels, the
 * assistant, and the actions behind every command (the shared command runner, the owner functions, panels.*,
 * layout operations, hand-offs to the composer). Publishes the list for chips and the overview (registry.ts).
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { setObjectRenderer, useGridRenderer } from "@workspace/object-views";
import { panelPanesOf, paneCaption } from "@workspace/player-client/layout";
import { PANELS } from "@workspace/player-client/panels";
import { liveOptions, type Command, type LiveOptions, type PaletteContext } from "@workspace/ui-kit";
import { useRoom } from "@/sdk";
import { useDock } from "@/dock/store";
import { useDockActions } from "@/dock/actions";
import { usePanels } from "@/dock/panels";
import { SAFE_MODE } from "@/shell/safe-mode";
import { composer } from "@/core/chat/composer";
import { useGameCommands, useRunner } from "@/core/game/runner";
import { useOwnerActions } from "@/core/game/owner";
import { useStartView } from "@/core/game/start";
import { useSituation } from "@/core/game/situation";
import { notify, notifyError } from "@/core/notices";
import { navigate, hrefTo } from "@/core/navigation";
import { useReplayController } from "@/core/replay/parts";
import { useLive } from "@/site/lib/convex";
import { playerCommands, type PaletteActions, type PaletteState } from "./commands";
import { publishCommands, withHandoffs } from "./registry";

const noSubscription = () => () => {};
const noView = () => null;
/** The replay on screen (the dock's replay mode), as the palette gates on it: playing, at the start, at the end. */
function useReplayState(): PaletteState["replay"] {
  const c = useReplayController();
  const v = useSyncExternalStore(c ? c.subscribe : noSubscription, c ? c.get : noView);
  const playing = !!v?.playing, atStart = v?.cursor === 0, atEnd = !!c && !!v && v.cursor >= c.end && v.world >= c.endWorld;
  return useMemo(() => (c ? { playing, atStart, atEnd } : undefined), [c, playing, atStart, atEnd]);
}

/** A command's status (receipts.get), live while the palette page showing it is open: it follows a late receipt. */
function useReceipt(roomId: string, commandId: string): readonly string[] {
  const r = useLive(api.receipts.get, { roomId, commandId });
  if (r.error) return [r.error.message];
  if (r.data === undefined) return ["Looking up the command…"];
  const receipt = r.data as { accepted?: boolean; message?: string } | null;
  return [receipt ? `${receipt.accepted ? "Accepted" : "Refused"}: ${receipt.message ?? ""}` : "The engine has no receipt for that command (yet): this page updates if one arrives."];
}

/** The current game's assistant conversations, live while the palette's pick page is open (and across a new game). */
function useThreads(roomId: Id<"rooms">): LiveOptions {
  const gameId = useLive(api.assistant.status, { roomId }).data?.game;
  const r = useLive(api.assistant.threads, gameId ? { roomId, gameId } : "skip");
  if (!gameId) return { options: [] };
  return liveOptions(r, t => ({ id: t._id, label: t.title, detail: new Date(t.updatedAt).toLocaleString() }));
}

const roomUrl = (code: string) => `${location.origin}/rooms/${encodeURIComponent(code)}`;
const copy = (text: string, done: string) => navigator.clipboard?.writeText(text).then(() => notify(done), () => notify(text));

export function usePlayerCommands(scopePaneId: string | null): { commands: Command[]; context: PaletteContext } {
  const { roomId, permission } = useRoom();
  const room = roomId as Id<"rooms">;
  const s = useSituation();
  const dock = useDock();
  const actions = useDockActions();
  const panels = usePanels();
  const runner = useRunner();
  const game = useGameCommands();
  const owner = useOwnerActions();
  const status = useQuery(api.assistant.status, { roomId: room });
  const cancel = useMutation(api.assistant.cancel);
  const setMode = useMutation(api.assistant.setMode);
  const join = useMutation(api.rooms.join);
  const wake = useMutation(api.activity.touch);
  const setEnabled = useMutation(api.panels.setEnabled);
  const removePanel = useMutation(api.panels.remove);
  const rollback = useMutation(api.panels.rollback);
  const gridRenderer = useGridRenderer();
  const start = useStartView();
  const starting = start.phase === "idle" ? undefined : start.phase;
  const replayController = useReplayController();
  const replay = useReplayState();

  const state = useMemo((): PaletteState => {
    const panelCount = panelPanesOf(dock.layout).length;
    const panes = Object.values(dock.layout.panes).map(pane => ({
      id: pane.id, kind: pane.kind,
      label: pane.kind === "panel" ? PANELS[pane.panelId].title : paneCaption(pane),
      closable: pane.kind !== "panel" || panelCount > 1,
    }));
    const obs = s.obs;
    return {
      phase: obs?.phase, hasObservation: !!obs, permission, isOwner: s.isOwner, seated: s.seated, ready: s.ready, pauseUsed: s.pauseUsed, preparing: !!s.room?.preparing, starting,
      agents: (obs?.agents ?? []).map((a, i) => ({ id: a.id, label: `agent ${i + 1} (${a.language}, ${a.acts} acts)` })),
      unknownOutcome: !!runner.unknown, busy: !!runner.busy, assistantOn: !!status?.enabled, assistantAvailable: status?.available !== false, aiEnabled: s.room?.aiEnabled !== false,
      roomCode: obs?.roomShortCode ?? s.room?.shortCode, gameCode: obs?.gameShortCode,
      panes, scopePaneId, safeMode: SAFE_MODE,
      storedPanels: (panels.stored ?? []).map(p => ({ slug: p.slug, title: p.title, enabled: p.enabled, currentVersion: p.currentVersion })),
      filePanels: panels.fileIds ?? [],
      aiSeats: (s.room?.members ?? []).filter(m => m.kind === "ai").map(m => ({ id: m.id, label: m.name })),
      gridRenderer,
      ...(replay ? { replay } : {}),
    };
  }, [dock.layout, s, permission, runner.unknown, runner.busy, status?.enabled, status?.available, scopePaneId, panels.stored, panels.fileIds, gridRenderer, starting, replay]);

  const paletteActions = useMemo((): PaletteActions => ({
    submit: command => game.run(command),
    wake: () => wake({}).then(() => notify("The game is awake."), notifyError),
    join: () => join({ room: roomId }).catch(notifyError),
    whoami: () => notify(s.obs ? `You are ${s.obs.self.label}, with ${permission} rights in room ${s.obs.roomShortCode ?? roomId}.` : "Loading who you are…"),
    useReceipt: commandId => useReceipt(roomId, commandId),
    copyObservation: () => { if (s.obs) void copy(JSON.stringify(s.obs, null, 2), "Copied the raw observation to your clipboard."); },
    owner,
    panels: {
      open: slug => actions.openPanel(slug),
      openFile: id => actions.openFile(id),
      setEnabled: (slug, enabled) => setEnabled({ slug, enabled }).then(() => notify(enabled ? "Panel turned on." : "Panel turned off."), notifyError),
      remove: slug => removePanel({ slug }).then(() => notify("Panel deleted."), notifyError),
      rollback: async slug => {
        const meta = panels.stored?.find(p => p.slug === slug);
        if (!meta || meta.currentVersion < 2) return;
        await rollback({ slug, version: meta.currentVersion - 1 }).then(() => notify(`Rolled back to version ${meta.currentVersion - 1}.`), notifyError);
      },
    },
    assistant: {
      cancel: () => (status?.activeTurn ? cancel({ turnId: status.activeTurn.turnId }).catch(notifyError) : Promise.resolve()),
      setMode: mode => setMode({ roomId: room, mode }).then(r => notify(`Your assistant is on ${r.label}.`), notifyError),
      // The current game's conversations only; a choice is kept for that game (composer.threadIn).
      useThreads: () => useThreads(room),
      openThread: id => { if (status) composer.setThread(status.game, id); composer.focus(); },
      newThread: () => { if (status) composer.setThread(status.game, "new"); composer.focus(); },
      setPermission: p => { composer.setPermission(p); composer.setOwnerConsent(p === "owner"); notify(p === "owner" ? "Your assistant may use owner powers from your next message." : "Your assistant plays without owner powers from your next message."); },
      focus: () => composer.focus(),
      handoff: draft => composer.fill(draft),
    },
    dock: {
      show: actions.show, change: actions.change, close: actions.close, dockAssistant: actions.dockAssistant, openAssistant: actions.openAssistant, preset: actions.preset, reset: actions.reset,
      maximise: actions.maximise, forgeEdit: () => actions.forgeEdit(),
    },
    links: {
      // The room page is a page of this app (one router), whatever its origin.
      roomPage: () => hrefTo({ kind: "room", room: state.roomCode ?? "" }),
      copyRoomLink: () => { if (state.roomCode) void copy(roomUrl(state.roomCode), "Copied the room link."); },
      safeMode: on => {
        const params = new URLSearchParams(location.search);
        if (on) params.set("panels", "off"); else params.delete("panels");
        location.assign(`${location.pathname}${params.size ? `?${params}` : ""}`);
      },
    },
    objects: { setGridRenderer: id => { setObjectRenderer("Grid", id); } },
    replay: {
      watch: () => { if (state.roomCode && state.gameCode) navigate(hrefTo({ kind: "game", room: state.roomCode, game: state.gameCode })); },
      toggle: () => replayController?.toggle(),
      start: () => replayController?.seek(0),
      end: () => replayController?.seekWorld(replayController.endWorld),
    },
    notify,
  }), [replayController, game, wake, join, s.obs, permission, roomId, room, owner, actions, setEnabled, removePanel, rollback, panels.stored, status, cancel, setMode, state.roomCode, state.gameCode]);

  const context = useMemo((): PaletteContext => ({
    role: s.isOwner ? "owner" : s.seated ? "seated" : "member", admin: false, permission, phase: s.obs?.phase, assistantOn: !!status?.enabled,
    ...(scopePaneId ? { scope: { paneId: scopePaneId } } : {}),
  }), [s.isOwner, s.seated, s.obs?.phase, permission, status?.enabled, scopePaneId]);
  const commands = useMemo(() => withHandoffs(playerCommands(state, paletteActions)), [state, paletteActions]);
  useEffect(() => { publishCommands(commands, context); }, [commands, context]);
  return { commands, context };
}
