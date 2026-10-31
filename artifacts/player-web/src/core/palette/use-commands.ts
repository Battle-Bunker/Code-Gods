/**
 * Wires the palette's command list (commands.ts) to this client: the player's situation, the dock, the panels, the
 * assistant, and the actions behind every command (the shared command runner, the owner functions, panels.*,
 * layout operations, hand-offs to the composer). Publishes the list for chips and the overview (registry.ts).
 */
import { useEffect, useMemo } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { SETTINGS_PRESETS } from "@workspace/game-core";
import { setObjectRenderer, useObjectRenderer } from "@workspace/object-views";
import { lensPanesOf, paneCaption } from "@workspace/player-client/layout";
import { LENSES } from "@workspace/player-client/lenses";
import type { Command, PaletteContext } from "@workspace/ui-kit";
import { useRoom } from "@/sdk";
import { useDock } from "@/dock/store";
import { useDockActions } from "@/dock/actions";
import { usePanels } from "@/dock/panels";
import { SAFE_MODE } from "@/shell/safe-mode";
import { composer } from "@/core/chat/composer";
import { useGameCommands, useRunner } from "@/core/game/runner";
import { useOwnerActions } from "@/core/game/owner";
import { useSituation } from "@/core/game/situation";
import { notify, notifyError } from "@/core/notices";
import { playerCommands, type PaletteActions, type PaletteState } from "./commands";
import { publishCommands, withHandoffs } from "./registry";

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
  const convex = useConvex();
  const status = useQuery(api.assistant.status, { roomId: room });
  const cancel = useMutation(api.assistant.cancel);
  const setPrefs = useMutation(api.assistant.setPrefs);
  const join = useMutation(api.rooms.join);
  const wake = useMutation(api.activity.touch);
  const setEnabled = useMutation(api.panels.setEnabled);
  const removePanel = useMutation(api.panels.remove);
  const rollback = useMutation(api.panels.rollback);
  const gridRenderer = useObjectRenderer("Grid") === "tiles" ? "tiles" : "digits";

  const state = useMemo((): PaletteState => {
    const lensCount = lensPanesOf(dock.layout).length;
    const panes = Object.values(dock.layout.panes).map(pane => ({
      id: pane.id, kind: pane.kind,
      label: pane.kind === "lens" ? LENSES[pane.lensId].title : paneCaption(pane),
      closable: pane.kind !== "assistant" && (pane.kind !== "lens" || lensCount > 1),
    }));
    const obs = s.obs;
    return {
      phase: obs?.phase, hasObservation: !!obs, permission, isOwner: s.isOwner, seated: s.seated, ready: s.ready, pauseUsed: s.pauseUsed,
      agents: (obs?.agents ?? []).map((a, i) => ({ id: a.id, label: `agent ${i + 1} (${a.language}, ${a.acts} acts)` })),
      unknownOutcome: !!runner.unknown, busy: !!runner.busy, assistantOn: !!status?.enabled,
      roomCode: obs?.roomShortCode ?? s.room?.shortCode, gameCode: obs?.gameShortCode,
      panes, scopePaneId, safeMode: SAFE_MODE,
      storedPanels: (panels.stored ?? []).map(p => ({ slug: p.slug, title: p.title, enabled: p.enabled, currentVersion: p.currentVersion })),
      filePanels: panels.fileIds ?? [],
      presets: SETTINGS_PRESETS.map(p => ({ id: p.id, label: p.label, detail: p.kid })),
      aiSeats: (s.room?.members ?? []).filter(m => m.kind === "ai").map(m => ({ id: m.id, label: m.name })),
      gridRenderer,
    };
  }, [dock.layout, s, permission, runner.unknown, runner.busy, status?.enabled, scopePaneId, panels.stored, panels.fileIds, gridRenderer]);

  const paletteActions = useMemo((): PaletteActions => ({
    submit: command => game.run(command),
    wake: () => wake({}).then(() => notify("The game is awake."), notifyError),
    join: () => join({ room: roomId }).catch(notifyError),
    whoami: () => notify(s.obs ? `You are ${s.obs.self.label}, with ${permission} rights in room ${s.obs.roomShortCode ?? roomId}.` : "Loading who you are…"),
    receipt: async commandId => {
      try {
        const receipt = await convex.query(api.receipts.get, { roomId, commandId }) as { accepted?: boolean; message?: string } | null;
        notify(receipt ? `${receipt.accepted ? "Accepted" : "Refused"}: ${receipt.message ?? ""}` : "The engine has no receipt for that command: it never arrived.");
      } catch (error) { notifyError(error); }
    },
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
      setAutoApprove: bits => setPrefs({ roomId: room, autoApproveSummonBits: bits }).then(() => notify(bits > 0 ? `Summons up to ${bits} bits run without a card.` : "Every summon asks you first."), notifyError),
      threads: async () => (await convex.query(api.assistant.threads, { roomId: room })).map(t => ({ id: t._id, label: t.title, detail: new Date(t.updatedAt).toLocaleString() })),
      openThread: id => { composer.setThread(id); composer.focus(); },
      newThread: () => { composer.setThread("new"); composer.focus(); },
      setPermission: p => { composer.setPermission(p); notify(p === "read" ? "Your assistant will only look, from your next message." : "Your assistant may act for you from your next message; it asks before anything public or costly."); },
      focus: () => composer.focus(),
      handoff: draft => composer.fill(draft),
    },
    dock: {
      show: actions.show, change: actions.change, close: actions.close, dockAssistant: actions.dockAssistant, preset: actions.preset, reset: actions.reset,
      maximise: actions.maximise, forgeEdit: () => actions.forgeEdit(),
    },
    links: {
      roomPage: () => `/rooms/${encodeURIComponent(state.roomCode ?? "")}`,
      gamePage: () => (state.gameCode ? `/games/${encodeURIComponent(state.gameCode)}` : null),
      copyRoomLink: () => { if (state.roomCode) void copy(roomUrl(state.roomCode), "Copied the room link."); },
      safeMode: on => {
        const params = new URLSearchParams(location.search);
        if (on) params.set("panels", "off"); else params.delete("panels");
        location.assign(`${location.pathname}${params.size ? `?${params}` : ""}`);
      },
    },
    objects: { setGridRenderer: id => { setObjectRenderer("Grid", id); } },
    notify,
  }), [game, wake, join, s.obs, permission, roomId, room, convex, owner, actions, setEnabled, removePanel, rollback, panels.stored, status, cancel, setPrefs, state.roomCode, state.gameCode]);

  const context = useMemo((): PaletteContext => ({
    role: s.isOwner ? "owner" : s.seated ? "seated" : "member", admin: false, permission, phase: s.obs?.phase, assistantOn: !!status?.enabled,
    ...(scopePaneId ? { scope: { paneId: scopePaneId } } : {}),
  }), [s.isOwner, s.seated, s.obs?.phase, permission, status?.enabled, scopePaneId]);
  const commands = useMemo(() => withHandoffs(playerCommands(state, paletteActions)), [state, paletteActions]);
  useEffect(() => { publishCommands(commands, context); }, [commands, context]);
  return { commands, context };
}
