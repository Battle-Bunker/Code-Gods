/**
 * The command palette's rows, generated from the affordance directory (owner decision 16; plan §2.5): every
 * affordance the viewer's context offers (`paletteFor`), with the same availability, reason and confirmation as its
 * button, and nothing written by hand. How a row runs:
 *
 * - no input needed: it runs at once through the runtime's `perform` (a server operation or a view operation);
 * - a read: it opens the pane that subscribes to that data (R7: the app makes no one-off reads), or the page;
 * - one value needed: a field (or, for a pane, a pick of the panes) asks for it, then runs;
 * - several values: an info page says where on the screen to do it (the assistant takes them in M3).
 */
import type { Command, PaletteFormPage, Performer } from "@workspace/ui-kit/core";
import { AFFORDANCES, paletteFor, type AffordanceContext, type AffordanceId, type OpOutcome, type PaletteEntry } from "@workspace/v2-affordances";
import { filePane, PANES, PANE_IDS, storedPane, type PaneId } from "@workspace/v2-client";
import type { z } from "zod/v4";
import { requestForge } from "../panes/forge-request.ts";
import { roomPath } from "../site/lib/routes.ts";

/** Reads that a pane shows live: the row opens that pane. */
export const READ_PANES: Partial<Record<AffordanceId, PaneId>> = {
  "game.standings": "race", "game.get": "overview", "rule.explain": "my-card", "rule.values": "my-card", "rule.worth": "my-card", "objects.list": "objects",
  "moves.list": "feed", "log.list": "feed", "agents.list": "agents", "agent.programs": "forge", "chat.list": "public-chat", "rep.mutators": "what-if",
  "panel.list": "my-panels", "panel.code": "my-panels",
  // The auction's result and the handicap show in Where am I; a line's views, quotes and score in One line and What if.
  "game.auction": "overview", "object.read": "object", "object.element": "object",
  "object.quote": "what-if", "object.score": "what-if",
  // The board at a moment (v1's get_board_at): beside the log it is built from.
  "game.boardAt": "feed",
  // The rules anyone could hold (v1's list_utility_candidates): beside what the others care about (W5's "Possible gods").
  "rule.fit": "others-care", "rule.candidates": "others-care",
};
/** Reads the room page shows (its members, past games, the rotation, the bid phase). */
export const ROOM_READS: ReadonlySet<string> = new Set(["room.get", "room.history", "game.rotation", "bid.state"]);
/** Reads the configure page shows (the owner's saved setups, under Setup). */
export const SETUP_READS: ReadonlySet<string> = new Set(["setups.page", "setups.get"]);
/** Reads the avatar menu shows (who you are, your connected apps). */
export const ACCOUNT_READS: ReadonlySet<string> = new Set(["account.whoami", "account.connections"]);
/** Reads the palette answers itself, in a notice (a command's status). */
export const NOTICE_READS: ReadonlySet<string> = new Set(["code.get", "code.list", "receipt.get", "server.info"]);

export interface PaletteHost {
  perform(id: AffordanceId, args: unknown): Promise<OpOutcome>;
  navigate(to: string): void;
  /** The room page's path, when a room is in view. */
  roomPath?: string;
  /** The dock's pane operations when it is on screen (pane rows open panes there, keeping the panes shown). */
  panes?: { open(pane: string): Promise<unknown>; close(pane: string): Promise<void> };
  /** A short confirmation once something typed in the palette was done (playtest: a chat sent from it said nothing). */
  notify?(title: string): void;
  /** The game's objects ("grid", "grids"): directory titles say "objects" (round 8b: "Leave objects alone" in a grid game). */
  noun?: { one: string; many: string };
  /** The viewer's stored panels (their one live list), so each enabled one can be opened as a pane. */
  storedPanels?: readonly { slug: string; title: string; enabled: boolean }[];
  /** Who is signed in, and the room in view's code (v1's "Who am I"). */
  me?: { name: string; email?: string | null };
  roomCode?: string;
  /** Copies the room's invite link (v1's "Copy room link"). */
  copyRoomLink?(): void;
  /** Opens the assistant and focuses its composer (v1's Ctrl+`), optionally on a new conversation or at its picker. */
  focusAssistant?(request?: { thread?: "new" | "pick" }): Promise<unknown>;
  /** The file panels (src/panels/*.tsx) this copy of the app has; none in safe mode. */
  filePanels?: readonly string[];
  /** Whether the page is in safe mode (?panels=off), and how to reload it in or out of it. */
  safeMode?: boolean;
  setSafeMode?(on: boolean): void;
}

/** The viewer's panels that can open as panes: enabled ones, and none in safe mode. */
const openablePanels = (host: PaletteHost) => (host.safeMode ? [] : (host.storedPanels ?? []).filter(p => p.enabled));

const run = async (host: PaletteHost, id: AffordanceId, args: unknown) => {
  const out = await host.perform(id, args);
  if (!out.ok) throw new Error(out.error.message);
  return out.result;
};

/** The one required parameter of an affordance, when it has exactly one (besides requestId). */
function soleParam(id: AffordanceId): { name: string; kind: "string" | "number" } | null {
  const shape = AFFORDANCES[id].params.shape as Record<string, z.ZodType>;
  const required = Object.entries(shape).filter(([k, s]) => k !== "requestId" && !s.safeParse(undefined).success);
  if (required.length !== 1) return null;
  const [name, schema] = required[0]!;
  // A typical value, long enough for a code's minimum length.
  if (schema.safeParse("ABCDEF").success) return { name, kind: "string" };
  if (schema.safeParse(1).success) return { name, kind: "number" };
  return null;
}

/** "You are Ada (ada@example.com), the owner and a player in room ABC123." (v1's whoami, from what the page knows). */
export function whoAmI(ctx: AffordanceContext, host: Pick<PaletteHost, "me" | "roomCode">): string {
  const p = ctx.principal;
  if (!p.signedIn) return "You are not signed in.";
  const who = host.me ? `${host.me.name}${host.me.email ? ` (${host.me.email})` : ""}` : "signed in";
  const roles = [p.owner ? "the owner" : null, p.seated ? "a player" : p.member ? "a spectator" : null].filter(Boolean);
  const where = host.roomCode ? (p.member ? `, ${roles.join(" and ")} in room ${host.roomCode}` : `, not a member of room ${host.roomCode}`) : "";
  return `You are ${who}${where}${p.admin ? ". You are an administrator" : ""}.`;
}

function performerFor(e: PaletteEntry, host: PaletteHost, ctx: AffordanceContext): Performer {
  const id = e.id as AffordanceId;
  if (ROOM_READS.has(id) && host.roomPath) return { kind: "navigate", to: host.roomPath };
  if (SETUP_READS.has(id) && host.roomPath) return { kind: "navigate", to: `${host.roomPath}/configure#section-setup` };
  // v1's "Who am I": who you are signed in as and what you are here; your connected apps are under the avatar.
  if (id === "account.whoami") return { kind: "form", page: { kind: "info", title: e.title, lines: [whoAmI(ctx, host), "Your account and connected apps are in the menu under your avatar (top right)."] } };
  if (ACCOUNT_READS.has(id)) return { kind: "form", page: { kind: "info", title: e.title, lines: ["Your account and connected apps are in the menu under your avatar (top right)."] } };
  if (id === "room.list") return { kind: "navigate", to: "/" };
  // The room's settings are a page of their own (v1's "Configure the room's setup"): every question, with a Review.
  if (id === "room.settings" && host.roomPath) return { kind: "navigate", to: `${host.roomPath}/configure` };
  // v1's "New setup…": the configure page's Save as a setup, with every setting to pick first.
  if (id === "setups.save" && host.roomPath) return { kind: "navigate", to: `${host.roomPath}/configure#field-save-setup` };
  const pane = READ_PANES[id];
  const panes = host.panes;
  if (pane && panes) return { kind: "submit", run: () => panes.open(pane) };
  if (id === "view.openPane" || id === "view.closePane") {
    const page: PaletteFormPage = {
      kind: "pick", title: e.title,
      options: () => [
        ...PANE_IDS.map(p => ({ id: p as string, label: paneLabel(p, host.noun), detail: lined(PANES[p].blurb, host.noun), keywords: PANES[p].keywords })),
        ...openablePanels(host).map(p => ({ id: storedPane(p.slug), label: p.title, detail: "Your panel", keywords: [p.slug, "panel", "your panel"] })),
        ...(host.filePanels ?? []).map(id => ({ id: filePane(id), label: id, detail: `File panel: src/panels/${id}.tsx`, keywords: [id, "file panel"] })),
      ],
      onPick: p => (panes ? (id === "view.openPane" ? panes.open(p) : panes.close(p)) : run(host, id, { pane: p })),
    };
    return { kind: "form", page };
  }
  // The forge's own controls (playtest round 7: the palette said only "use its controls on the screen"): open them, focused.
  if (id === "agent.leaveAlone" && panes) {
    return { kind: "submit", run: () => requestForge({ kind: "leave", numbers: [] }, p => panes.open(p)) };
  }
  // v1's Server info sheet: what this server runs, in a notice.
  if (id === "server.info") return { kind: "submit", run: async () => { const out = await run(host, id, {}); host.notify?.(serverInfoWords(out)); return out; } };
  if (!e.needsInput) return { kind: "submit", run: () => run(host, id, {}) };
  const sole = soleParam(id);
  if (sole) {
    return {
      kind: "form",
      page: {
        kind: "field", title: e.title, label: FIELD_LABELS[sole.name] ?? sole.name, placeholder: sole.name === "code" ? "ABC123" : "",
        validate: v => (!v.trim() ? "Type something first." : sole.kind === "number" && !Number.isFinite(Number(v)) ? "A number, please." : null),
        onSubmit: async v => {
          const out = await run(host, id, { [sole.name]: sole.kind === "number" ? Number(v) : v.trim() });
          host.notify?.(id === "receipt.get" ? receiptWords(out) : DONE[id] ?? `Done: ${e.title}.`);
          return out;
        },
      },
    };
  }
  return { kind: "form", page: { kind: "info", title: e.title, lines: [e.tooltip, "Use its controls on the screen; your assistant can also do it for you."] } };
}

/** A command's status in words (v1's "Check a command's status…"): applied, or safe to send again. */
export function receiptWords(result: unknown): string {
  const r = result as { applied: boolean; operation: string | null };
  return r.applied ? `That command (${r.operation}) went through.` : "That command did not apply: it is safe to send it again.";
}

/** The server's builds, sandboxes and tick in one line (v1's Server info). */
export function serverInfoWords(result: unknown): string {
  const r = result as { builds: Record<"app" | "functions", { build: string } | null>; sandboxes: { language: string; state: string; reason: string | null }[]; engine: { tickMs: number } };
  const builds = `app ${r.builds.app?.build ?? "not recorded"}, functions ${r.builds.functions?.build ?? "not recorded"}`;
  const sandboxes = r.sandboxes.map(s => `${s.language} ${s.state}${s.reason ? ` (${s.reason})` : ""}`).join(", ");
  return `Builds: ${builds}. Sandboxes: ${sandboxes}. A tick every ${r.engine.tickMs / 1000} s.`;
}

/** What a field's operation says once done. */
const DONE: Partial<Record<AffordanceId, string>> = { "chat.send": "Message sent to the room's chat.", "room.join": "You joined the room." };

/** A field's label in words: the parameter's name only when there is none. */
const FIELD_LABELS: Record<string, string> = { text: "Your message", code: "Room code", name: "Name", question: "Your question", id: "The command's request id" };

/** A pane's name in the game's words, as the dock's headers say it (usePaneName): "Grids", "One grid" in a grid game. */
export function paneLabel(p: PaneId, noun?: { one: string; many: string }): string {
  if (noun && p === "objects") return noun.many[0]!.toUpperCase() + noun.many.slice(1);
  if (noun && p === "object") return `One ${noun.one}`;
  return lined(PANES[p].title, noun) ?? PANES[p].title;
}
/** A pane's words written for lines ("Which lines earn you points") in the game's own words. */
export function lined(text: string | undefined, noun?: { one: string; many: string }): string | undefined {
  if (!text || !noun) return text;
  return text.replace(/\b([Ll])ine(s?)\b/g, (_, l: string, s: string) => { const w = s ? noun.many : noun.one; return l === "L" ? w[0]!.toUpperCase() + w.slice(1) : w; });
}

/** "Leave objects alone" in a grid game: "Leave grids alone" (any case, singular and plural). */
export function nouned(text: string, noun?: { one: string; many: string }): string {
  if (!noun) return text;
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  return text.replace(/\b([Aa])n ([Oo])bject\b/g, (_, a: string, o: string) => `${a} ${o === "O" ? cap(noun.one) : noun.one}`).replace(/\b([Oo])bject(s?)\b/g, (_, o: string, s: string) => (o === "O" ? cap : (w: string) => w)(s ? noun.many : noun.one));
}

/** Operations the palette answers by opening their control on the screen, not by running them. */
const OPENS_CONTROL = new Set<AffordanceId>(["agent.leaveAlone"]);

/** The palette's commands for this context. */
export function paletteCommands(ctx: AffordanceContext, host: PaletteHost): Command[] {
  const rows: Command[] = paletteFor(ctx).map(e => { const performer = performerFor(e, host, ctx); return {
    id: e.id,
    human: { title: nouned(e.title, host.noun), tooltip: nouned(e.tooltip, host.noun) },
    group: e.group,
    keywords: e.keywords,
    // A row that only opens the screen's own control confirms nothing: the control does (round 10: the palette asked first).
    // A row that opens a page confirms nothing either: the page's own Save does (room.settings opens the configure page).
    confirm: (OPENS_CONTROL.has(e.id as AffordanceId) && host.panes) || performer.kind === "navigate" ? "none" : e.confirm,
    performer,
    available: () => e.availability,
  }; });
  // Each pane by its own title, once a query is typed ("Lines" finds "Open Lines"); the dock's own pane plan opens it.
  const panes = host.panes;
  if (panes && ctx.game) {
    for (const p of PANE_IDS) {
      if (p === "assistant" && ctx.room?.aiOff) continue;
      rows.push({
        // In the game's own words (baseline-1: a grid game listed "Lines" and "One line").
        id: `pane:${p}`, human: { title: `Open ${paneLabel(p, host.noun)}`, tooltip: lined(PANES[p].blurb, host.noun) ?? PANES[p].blurb }, group: "view", keywords: [...PANES[p].keywords, ...(host.noun ? [host.noun.one, host.noun.many] : [])],
        typedOnly: true, performer: { kind: "submit", run: () => panes.open(p) }, available: () => ({ ok: true }),
      });
    }
  }
  if (panes && ctx.game) {
    // v1's "Open your panel: <title>", one per enabled panel.
    for (const p of openablePanels(host)) {
      rows.push({
        id: `panel:${p.slug}`, human: { title: `Open your panel: ${p.title}`, tooltip: "One of your panels, as a pane." }, group: "view", keywords: [p.slug, "panel", "your panel"],
        typedOnly: true, performer: { kind: "submit", run: () => panes.open(storedPane(p.slug)) }, available: () => ({ ok: true }),
      });
    }
  }
  if (panes && ctx.game) {
    // v1's "Open file panel: <id>", one per src/panels/*.tsx.
    for (const id of host.filePanels ?? []) {
      rows.push({
        id: `file:${id}`, human: { title: `Open file panel: ${id}`, tooltip: `src/panels/${id}.tsx, as a pane.` }, group: "view", keywords: [id, "file panel"],
        typedOnly: true, performer: { kind: "submit", run: () => panes.open(filePane(id)) }, available: () => ({ ok: true }),
      });
    }
  }
  // v1's "Focus assistant (Ctrl+`)".
  const focusAssistant = host.focusAssistant;
  if (focusAssistant && ctx.game && !ctx.room?.aiOff) {
    rows.push({
      id: "assistant-focus", human: { title: "Focus assistant (Ctrl+`)", tooltip: "Open your assistant and type to it. / does the same outside a field." },
      group: "view", keywords: ["assistant", "focus", "ask", "type", "chat with assistant"],
      performer: { kind: "submit", run: () => focusAssistant() }, available: () => ({ ok: true }),
    });
    // v1's "New conversation" and "Switch assistant conversation…".
    rows.push({
      id: "assistant-new", human: { title: "New conversation", tooltip: "Start a new conversation with your assistant." },
      group: "view", keywords: ["assistant", "new conversation", "new thread", "fresh"],
      performer: { kind: "submit", run: () => focusAssistant({ thread: "new" }) }, available: () => ({ ok: true }),
    });
    rows.push({
      id: "assistant-threads", human: { title: "Switch assistant conversation…", tooltip: "Pick another of your conversations with the assistant." },
      group: "view", keywords: ["assistant", "conversation", "thread", "switch", "history"],
      performer: { kind: "submit", run: () => focusAssistant({ thread: "pick" }) }, available: () => ({ ok: true }),
    });
  }
  // v1's "Copy room link": the room page's link, to invite people.
  const copyRoomLink = host.copyRoomLink;
  if (copyRoomLink && ctx.room) {
    rows.push({
      id: "room-copy-link", human: { title: "Copy room link", tooltip: "The room page's link, to invite people." }, group: "room",
      keywords: ["invite", "link", "share", "copy link", "room link"], performer: { kind: "local", run: () => copyRoomLink() }, available: () => ({ ok: true }),
    });
  }
  // v1's safe mode: reload the page with every panel of yours off (a panel that breaks the page can then be fixed), and back.
  const setSafeMode = host.setSafeMode;
  if (setSafeMode && ctx.game) {
    rows.push({
      id: "safe-mode",
      human: host.safeMode
        ? { title: "Leave safe mode: run your panels", tooltip: "Reload the page with your panels on." }
        : { title: "Safe mode: your panels off", tooltip: "Reload the page with none of your panels running (?panels=off)." },
      group: "view", keywords: ["safe mode", "panels off", "turn off panels", "broken panel"], typedOnly: true,
      performer: { kind: "local", run: () => setSafeMode(!host.safeMode) }, available: () => ({ ok: true }),
    });
  }
  return rows;
}

/**
 * Rows made from the typed query (v1's codeCommands): a code-shaped query offers "Open room CODE", which goes to that
 * room (the room page offers to join). Shown to a signed-in human only (site/components/layout.tsx).
 */
export function codeCommands(query: string): Command[] {
  const code = query.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,36}$/.test(code)) return [];
  return [{
    id: `dyn:room:${code}`, human: { title: `Open room ${code}`, tooltip: "Goes to that room; you can join it there." },
    group: "room", section: "goto", performer: { kind: "navigate", to: roomPath(code) }, available: () => ({ ok: true }),
  } as Command];
}
