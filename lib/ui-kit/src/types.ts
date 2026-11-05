/**
 * The shared command palette's vocabulary (docs/ui-redesign.md §2.5). A Command is one catalogue entry (or a
 * client-only `ui.*` action of the same human shape) plus a performer: what happens when it runs. Pure types.
 */
import type { Phase } from "@workspace/player-client/panels";
import type { PaletteGroup } from "@workspace/player-client/catalog";
import type { ToolName } from "@workspace/player-client/tools";

export type { PaletteGroup, Phase };
export type Confirm = "none" | "inline" | "summary" | "modal";

/** The palette's sections, in display order (docs/research/ui-redesign/palette-and-pages.md §2.3). */
export type PaletteSection = "suggested" | "actions" | "views" | "goto" | "settings" | "help";

/**
 * A pick page's list as a live subscription holds it now: `options` undefined while it loads, `error` when it failed.
 * `useOptions` is a React hook the page calls while it is shown (with the query typed, for a list the server searches),
 * so the subscription lives exactly that long.
 */
export type LiveOptions = {
  options: readonly PickOption[] | undefined; error?: string | null;
  /** The options are the server's answer to the query typed (a search index): shown in its order, not filtered again. */
  searched?: boolean;
};

/**
 * A nested palette page: pick one option from a list, fill one validated field, or read a short text (a gloss, the
 * shortcuts, connection instructions). A pick's `onPick` and a field's `onSubmit` may return another page, which the
 * palette opens next. Server data is live (`useOptions`, `useLines`: hooks over a subscription, held while the page
 * is shown); `options` and `lines` are for what the client already holds.
 */
export type PaletteFormPage =
  | ({ kind: "pick"; title: string; onPick: (id: string) => Promise<unknown> | unknown; empty?: string }
    & ({ options: () => Promise<readonly PickOption[]> | readonly PickOption[]; useOptions?: undefined } | { useOptions: (query: string) => LiveOptions; options?: undefined }))
  | { kind: "field"; title: string; label: string; placeholder?: string; initial?: string; validate?: (value: string) => string | null; consequence?: (value: string) => string; onSubmit: (value: string) => Promise<unknown> | unknown }
  | ({ kind: "info"; title: string; copy?: { label: string; text: string } }
    & ({ lines: readonly string[]; useLines?: undefined } | { useLines: () => readonly string[]; lines?: undefined }));
/** One choice of a pick page; `unavailable` dims it with that reason. */
export type PickOption = { id: string; label: string; detail?: string; keywords?: readonly string[]; unavailable?: string };

export type Performer =
  | { kind: "navigate"; to: string | (() => string) }
  | { kind: "form"; page: PaletteFormPage }
  | { kind: "submit"; run: () => Promise<unknown> }
  /** Pre-fills the assistant composer with an editable draft; never sends. */
  | { kind: "handoff"; draft: string; tool?: ToolName }
  | { kind: "local"; run: () => void };

/** A hand-off to the assistant: an editable draft and the tool it will probably call ("may ask to: save_panel"). */
export type HandoffDraft = { text: string; tool?: ToolName };

/**
 * Whether a command can run now. `fix`, when it is another command's id, makes Enter on the dimmed row run that
 * command instead ("Start game. Needs 3 players. → Add an AI player ↵"); otherwise it is shown as text.
 */
export type Availability = { ok: true } | { ok: false; reason: string; fix?: string; hidden?: boolean };

export interface Command {
  id: string;
  human: { title: string; tooltip: string };
  group: PaletteGroup;
  /** Aliases newcomers bring with them ("kick bot"); a row matched through one shows it. */
  keywords?: readonly string[];
  shortcut?: string;
  confirm?: Confirm;
  performer: Performer;
  available: (ctx: PaletteContext) => Availability;
  /** Ordering within the empty-query list (higher first, then by title); it never hides a row. */
  defaultScore?: number;
  /** A property of the command, not of how the palette opened: listed only once a query is typed (e.g. one row per glossary term). */
  typedOnly?: boolean;
  /** The section it is listed under; derived from `group` (navigation goes to "Go to") when absent. */
  section?: PaletteSection;
  /** The summary card of a "summary" confirmation ("4 players · Classic grid · Python"). */
  summary?: (ctx: PaletteContext) => string;
  /** The verb on a modal's confirm button ("End game G9TQ"); the title otherwise. */
  confirmLabel?: string;
}

export interface PaletteContext {
  /** Engine UI roles, in rank order; the player client maps its credential onto member/seated/owner. */
  role: "visitor" | "signed-in" | "member" | "seated" | "owner";
  admin: boolean;
  /** The player client's credential permission. */
  permission?: "read" | "act" | "owner";
  phase?: Phase;
  assistantOn: boolean;
  /** The pane the palette was opened for ("this pane" commands). */
  scope?: { paneId: string };
}
