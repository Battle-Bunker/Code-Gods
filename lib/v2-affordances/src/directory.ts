/**
 * THE directory: every operation any surface can perform, declared once (owner decision 16). `availableAffordances`
 * is the dynamic directory: what is offered in a context, to a caller, with its availability now. Every surface is
 * generated from it (surfaces.ts), and the server functions are bound to it (server.ts).
 */
import { accountOps } from "./ops/account.ts";
import { agentOps } from "./ops/agents.ts";
import { assistantOps } from "./ops/assistant.ts";
import { biddingOps } from "./ops/bidding.ts";
import { panelOps } from "./ops/panels.ts";
import { playOps } from "./ops/play.ts";
import { roomOps } from "./ops/rooms.ts";
import { viewOps } from "./ops/view.ts";
import type { AffordanceContext, AnyAffordance, Availability, Caller, Principal, Surface } from "./types.ts";

export const DIRECTORY = [...roomOps, ...biddingOps, ...playOps, ...agentOps, ...viewOps, ...accountOps, ...assistantOps, ...panelOps] as const;
export type Directory = readonly AnyAffordance[];

type Entry = (typeof DIRECTORY)[number];
export type AffordanceId = Entry["id"];
/** The declaration of one id, with its params and result types. */
export type AffordanceOf<Id extends AffordanceId> = Extract<Entry, { id: Id }>;
export type ServerAffordanceId = Extract<Entry, { runs: "server" }>["id"];
export type ClientAffordanceId = Extract<Entry, { runs: "client" }>["id"];

export const AFFORDANCES: { readonly [Id in AffordanceId]: AffordanceOf<Id> } =
  Object.fromEntries(DIRECTORY.map(a => [a.id, a])) as never;

export function isAffordanceId(id: string): id is AffordanceId {
  return Object.hasOwn(AFFORDANCES, id);
}

export function callerAllows(caller: Caller, p: Principal): boolean {
  switch (caller) {
    case "anyone": return true;
    case "signedIn": return p.signedIn;
    case "member": return p.member || p.owner;
    case "seated": return p.seated;
    case "owner": return p.owner;
    case "admin": return p.admin;
  }
}

/** A delegated credential's permission narrows what it is offered; a human at the app has no grant. */
export function grantAllows(a: AnyAffordance, ctx: AffordanceContext): boolean {
  switch (ctx.grant) {
    case undefined: case "owner": return true;
    case "act": return a.caller !== "owner" && a.caller !== "admin";
    case "read": return a.effect === "read" && !a.spends;
  }
}

/** How a server affordance is called in Convex: an action where the sandbox or a model runs, else by its effect. */
export function opKind(a: AnyAffordance): "query" | "mutation" | "action" {
  return a.action ? "action" : a.effect === "read" ? "query" : "mutation";
}

export function onSurface(a: AnyAffordance, surface: Surface): boolean {
  return !a.surfaces?.except.includes(surface);
}

export interface Offered { affordance: AnyAffordance; availability: Availability }

/**
 * The dynamic directory: every affordance offered in this context to this caller, with whether it can run now.
 * Offered means: the context is one of its contexts, the caller may call it, the grant allows it, and its own check
 * does not hide it. Unavailable rows stay (with reason and fix) so surfaces can say why.
 */
export function availableAffordances(ctx: AffordanceContext, dir: Directory = DIRECTORY): Offered[] {
  const out: Offered[] = [];
  for (const a of dir) {
    if (!a.contexts.includes(ctx.context) || !callerAllows(a.caller, ctx.principal) || !grantAllows(a, ctx)) continue;
    const availability = a.available?.(ctx) ?? { ok: true };
    if (!availability.ok && availability.hidden) continue;
    out.push({ affordance: a, availability });
  }
  return out;
}

/** Who is calling: a human at the app (a button, a form) or one of the generated surfaces. */
export type Via = Surface | "app";

/**
 * Why an affordance cannot run in this context now, or null when it can: the one check the server (`defineOp`), the
 * assistant and MCP executors and `useAffordance` all apply. A consent affordance refuses every caller but the human's
 * own click, whatever the tool lists showed: a delegated credential or an assistant cannot approve on the human's behalf.
 */
export function refusal(a: AnyAffordance, ctx: AffordanceContext, args?: Record<string, unknown>, via: Via = "app"): Availability & { ok: false } | null {
  if (via !== "app" && !onSurface(a, via) || ctx.grant !== undefined && a.surfaces?.because === "consent")
    return { ok: false, reason: "Only the human can do this, with their own click.", hidden: true };
  if (!callerAllows(a.caller, ctx.principal)) return { ok: false, reason: callerReason(a.caller), hidden: true };
  if (!grantAllows(a, ctx)) return { ok: false, reason: "This connection's permission does not allow it.", fix: "Reconnect with a wider permission." };
  if (!a.contexts.includes(ctx.context)) return { ok: false, reason: `Not available ${contextWords(ctx)}.` };
  const own = a.available?.(ctx, args as never);
  return own && !own.ok ? own : null;
}

function callerReason(caller: Caller): string {
  switch (caller) {
    case "anyone": return "";
    case "signedIn": return "Sign in first.";
    case "member": return "Join the room first.";
    case "seated": return "Only players with a seat in this game can do this.";
    case "owner": return "Only the room owner can do this.";
    case "admin": return "Only admins can do this.";
  }
}

function contextWords(ctx: AffordanceContext): string {
  switch (ctx.context) {
    case "signedOut": return "before signing in";
    case "home": return "outside a room";
    case "room": return "before the game starts";
    case "planning": return "during planning";
    case "live": return "while the game runs";
    case "paused": return "while the game is paused";
    case "ended": return "after the game";
    case "replay": return "in a replay";
    case "admin": return "on the admin pages";
  }
}
