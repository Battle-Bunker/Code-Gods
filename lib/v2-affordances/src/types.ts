/**
 * The affordance directory's vocabulary (docs/engine-v2/affordances.md, integration plan §2.5). An affordance is one
 * operation a human or an assistant can perform, declared once; every surface (the embedded assistant, the remote
 * assistant over MCP, the CLI, the command palette, the app's buttons) and every server function is generated from
 * the directory, never written by hand.
 */
import type { z } from "zod/v4";

/** Where the viewer is. A game's phase is a context, so availability by phase is declared, not restated per surface. */
export const CONTEXTS = ["signedOut", "home", "room", "planning", "live", "paused", "ended", "replay", "admin"] as const;
export type Context = (typeof CONTEXTS)[number];
/** The contexts inside a game that is not over. */
export const IN_GAME = ["planning", "live", "paused"] as const satisfies readonly Context[];
/** Every context with a room in view (the room page and every game screen). */
export const IN_ROOM = ["room", "planning", "live", "paused", "ended", "replay"] as const satisfies readonly Context[];
/** Every context a signed-in human can be in. */
export const SIGNED_IN = ["home", ...IN_ROOM, "admin"] as const satisfies readonly Context[];

/** Who may call it. Not a ladder: an owner need not be seated, and a seated player need not own the room. */
export const CALLERS = ["anyone", "signedIn", "member", "seated", "owner", "admin"] as const;
export type Caller = (typeof CALLERS)[number];

/** The surfaces generated from the directory. UI buttons (`useAffordance`) and the server are not optional surfaces. */
export const SURFACES = ["assistant", "mcp", "cli", "palette"] as const;
export type Surface = (typeof SURFACES)[number];
/** The only allowed reason to leave a surface out: OAuth and device approval must be a human's own click. */
export type Exemption = "consent";

export type Scope = "none" | "room" | "game";
export type Group = "play" | "agents" | "objects" | "view" | "replay" | "room" | "owner" | "account" | "help";
export type Effect = "read" | "write" | "destructive";
export type Confirm = "none" | "inline" | "summary" | "modal";
/** The permission an MCP or CLI credential carries; `read` sees only read affordances, `act` adds the player's writes. */
export type Grant = "read" | "act" | "owner";

/** What the caller is, in the room in view (all false for a signed-out visitor). */
export interface Principal {
  signedIn: boolean;
  member: boolean;
  seated: boolean;
  owner: boolean;
  admin: boolean;
}

/** The game in view, as its header says (cold fields only; enough for dynamic checks). */
export interface GameFacts {
  phase: "planning" | "live" | "paused" | "ended";
  /** The viewer's energy now, when seated (for `spends: "energy"` checks). */
  energy?: number;
  /** Whether the viewer has used their one pause. */
  pauseUsed?: boolean;
  /** Seats filled and the preset's minimum, for start checks. */
  players?: number;
  minPlayers?: number;
  /** The viewer's live agents. */
  agents?: number;
}

/** Everything availability depends on. Built by the app from its subscriptions, by the server from the game header. */
export interface AffordanceContext {
  context: Context;
  principal: Principal;
  /** A delegated credential's permission (MCP, CLI); a human at the app has none, so nothing is narrowed. */
  grant?: Grant;
  game?: GameFacts;
}

/** Whether an affordance can run now; `hidden` rows are never listed (they cannot apply to this viewer). */
export type Availability = { ok: true } | { ok: false; reason: string; fix?: string; hidden?: boolean };

export interface Affordance<Id extends string = string, I extends z.ZodObject = z.ZodObject, O extends z.ZodType = z.ZodType> {
  /** `namespace.verb`, e.g. "agent.summon", "object.read", "view.pinRepresentation". */
  id: Id;
  /** ≤ 60 characters, verb first: "Summon an agent". */
  title: string;
  /** ≤ 600 characters, for a model: what it does, when to use it, what comes back. */
  description: string;
  /** ≤ 240 characters, for a human. */
  tooltip: string;
  /** Palette search aliases ("kick bot"). At least one. */
  keywords: readonly string[];
  group: Group;
  /** zod v4 object: JSON Schema for tools and the CLI, Convex validation in `defineOp`, form fields. */
  params: I;
  /** zod v4; model surfaces wrap every result as untrusted game data. */
  result: O;
  /** Where it is offered. */
  contexts: readonly Context[];
  /** Who may call it. */
  caller: Caller;
  effect: Effect;
  /** Shown before running; the assistant asks before spending. */
  spends?: "energy" | "aiBudget";
  confirm: Confirm;
  /** server: one Convex function (`defineOp`); client: a view operation on the human's layout. */
  runs: "server" | "client";
  /**
   * What it acts in besides its params: the room or the game in view (the app passes its id) or bound (an MCP or CLI
   * credential is bound to one room, whose current game is the game). `none`: global (home, account).
   */
  scope: Scope;
  /** Dynamic checks beyond context and caller (energy, phase details, seats). Pure; never reads the network. */
  available?(ctx: AffordanceContext, args?: Partial<z.input<I>>): Availability;
  surfaces?: { except: readonly Surface[]; because: Exemption };
}

/** Any affordance, for code that handles the directory generically. */
// biome-ignore lint: the directory is heterogeneous by design.
export type AnyAffordance = Affordance<string, z.ZodObject, z.ZodType>;
