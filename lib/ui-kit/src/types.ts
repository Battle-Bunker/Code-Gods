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
 * A nested palette page: pick one option from a list, fill one validated field, or read a short text (a gloss, the
 * shortcuts, connection instructions). A pick's `onPick` may return another page, which the palette opens next.
 */
export type PaletteFormPage =
  | { kind: "pick"; title: string; options: () => Promise<readonly PickOption[]> | readonly PickOption[]; onPick: (id: string) => Promise<unknown> | unknown; empty?: string }
  | { kind: "field"; title: string; label: string; placeholder?: string; initial?: string; validate?: (value: string) => string | null; consequence?: (value: string) => string; onSubmit: (value: string) => Promise<unknown> | unknown }
  | { kind: "info"; title: string; lines: readonly string[]; copy?: { label: string; text: string } };
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
  /** Ordering within the empty-query view (higher first); 0 or absent keeps the row out of it until typed. */
  defaultScore?: number;
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
