/**
 * The parity checks (integration plan §2.5) as a function, so this package's test, the engine's and the web app's
 * share one implementation. This file holds the checks the directory and its generators can answer alone:
 *   1. every affordance is reachable from the assistant, MCP, the CLI and the palette in at least one context,
 *      unless it declares the consent exemption (the only one allowed);
 *   4. for every context and caller, the assistant, MCP and the palette offer the same set;
 *   5. text limits, unique ids, keywords present, destructive and spending affordances confirm.
 * Check 2 (every server affordance has exactly one handler, every public v2 mutation or action is one) is
 * `handlerProblems` (server.ts) over a handler map, and `convexOpsProblems` (scan.ts) over `convex/v2`. Check 3 (the
 * app calls no v2 mutation or action except through `useAffordance`) comes with the React hook.
 */
import { z } from "zod/v4";
import { DIRECTORY, type Directory } from "./directory.ts";
import { assistantTools, cliCommands, jsonSchema, mcpTools, paletteFor, toolName } from "./surfaces.ts";
import { CONTEXTS, SURFACES, type AffordanceContext, type Principal, type Surface } from "./types.ts";

export const LIMITS = { title: 60, description: 600, tooltip: 240, keyword: 40 } as const;

const P = (p: Partial<Principal>): Principal => ({ signedIn: false, member: false, seated: false, owner: false, admin: false, ...p });
/** One principal of every kind a caller check distinguishes. */
export const PRINCIPALS: Readonly<Record<string, Principal>> = {
  visitor: P({}),
  signedIn: P({ signedIn: true }),
  member: P({ signedIn: true, member: true }),
  seated: P({ signedIn: true, member: true, seated: true }),
  owner: P({ signedIn: true, member: true, owner: true }),
  seatedOwner: P({ signedIn: true, member: true, seated: true, owner: true }),
  admin: P({ signedIn: true, admin: true }),
};

/** Every (context, principal) pair. Game facts are left unknown, so dynamic checks do not hide anything. */
export function allContexts(): AffordanceContext[] {
  return CONTEXTS.flatMap(context => Object.values(PRINCIPALS).map(principal => ({ context, principal })));
}

/** The surfaces under test: the real generators, or broken ones a test injects to see the checks fail. */
export interface Generators {
  assistant(ctx: AffordanceContext, dir: Directory): readonly string[];
  mcp(ctx: AffordanceContext, dir: Directory): readonly string[];
  palette(ctx: AffordanceContext, dir: Directory): readonly string[];
  cli(dir: Directory): readonly string[];
}
export const GENERATORS: Generators = {
  assistant: (ctx, dir) => assistantTools(ctx, dir).map(t => t.name),
  mcp: (ctx, dir) => mcpTools(ctx, dir).map(t => t.name),
  palette: (ctx, dir) => paletteFor(ctx, dir).map(e => toolName(e.id)),
  cli: dir => cliCommands(dir).map(c => toolName(c.id)),
};

export function parityProblems(all: Directory = DIRECTORY, gen: Generators = GENERATORS): string[] {
  const problems: string[] = [];
  // Schemas first: an affordance whose schema has no JSON Schema cannot be put on any surface, so it is reported
  // (check 5) and left out of the surface checks rather than crashing them.
  const dir = all.filter(a => {
    try { jsonSchema(a.params); jsonSchema(a.result, "output"); return true; }
    catch (e) { problems.push(`check 5: ${a.id} schema has no JSON Schema: ${(e as Error).message}`); return false; }
  });
  const reached = new Map<string, Set<Surface>>(dir.map(a => [toolName(a.id), new Set()]));
  const mark = (names: readonly string[], s: Surface) => { for (const n of names) reached.get(n)?.add(s); };
  const exempt = new Set(dir.filter(a => a.surfaces).map(a => toolName(a.id)));

  mark(gen.cli(dir), "cli");
  for (const ctx of allContexts()) {
    const sets = { assistant: gen.assistant(ctx, dir), mcp: gen.mcp(ctx, dir), palette: gen.palette(ctx, dir) };
    for (const [s, names] of Object.entries(sets)) mark(names, s as Surface);
    // Check 4: the same offer on every model and human surface (consent affordances aside).
    const key = (names: readonly string[]) => [...names].filter(n => !exempt.has(n)).sort().join(",");
    const [a, m, p] = [key(sets.assistant), key(sets.mcp), key(sets.palette)];
    if (a !== m || a !== p) {
      const all = new Set([...sets.assistant, ...sets.mcp, ...sets.palette].filter(n => !exempt.has(n)));
      const diff = [...all].filter(n => !(sets.assistant.includes(n) && sets.mcp.includes(n) && sets.palette.includes(n)));
      const who = Object.entries(PRINCIPALS).find(([, p]) => p === ctx.principal)?.[0];
      problems.push(`check 4: in ${ctx.context} as ${who}, the surfaces differ on ${diff.join(", ")}`);
    }
  }

  // Check 1: every affordance on every surface it does not declare a consent exemption for.
  for (const a of dir) {
    // Only consent exempts: any other declared reason leaves every surface required.
    const except = a.surfaces?.because === "consent" ? a.surfaces.except : [];
    if (a.surfaces && a.surfaces.because !== "consent") problems.push(`check 1: ${a.id} declares an exemption other than consent`);
    for (const s of SURFACES) {
      const on = reached.get(toolName(a.id))!.has(s);
      if (!except.includes(s) && !on) problems.push(`check 1: ${a.id} is not reachable from the ${s}`);
      if (except.includes(s) && on) problems.push(`check 1: ${a.id} is exempt from the ${s} but reachable from it`);
    }
  }

  // Check 5: the declarations themselves.
  const seen = new Set<string>();
  for (const a of all) {
    if (seen.has(toolName(a.id))) problems.push(`check 5: duplicate id ${a.id}`);
    seen.add(toolName(a.id));
    if (!/^[a-z]+\.[a-z][a-zA-Z]*$/.test(a.id)) problems.push(`check 5: ${a.id} is not "namespace.verb"`);
    if (!a.title || a.title.length > LIMITS.title || !/^[A-Z]/.test(a.title)) problems.push(`check 5: ${a.id} title must be 1–${LIMITS.title} characters, verb first, capitalised`);
    if (!a.description || a.description.length > LIMITS.description) problems.push(`check 5: ${a.id} description must be 1–${LIMITS.description} characters`);
    if (!a.tooltip || a.tooltip.length > LIMITS.tooltip) problems.push(`check 5: ${a.id} tooltip must be 1–${LIMITS.tooltip} characters`);
    if (a.keywords.length === 0 || a.keywords.some(k => !k.trim() || k.length > LIMITS.keyword)) problems.push(`check 5: ${a.id} needs keywords of 1–${LIMITS.keyword} characters`);
    if (a.contexts.length === 0) problems.push(`check 5: ${a.id} is offered in no context`);
    if (a.effect === "destructive" && a.confirm === "none") problems.push(`check 5: ${a.id} is destructive but does not confirm`);
    if (a.spends && a.confirm === "none") problems.push(`check 5: ${a.id} spends ${a.spends} but does not confirm`);
    if (a.runs === "client" && a.spends) problems.push(`check 5: ${a.id} is a view operation that spends`);
    if (a.runs === "server" && a.effect !== "read" && !("requestId" in a.params.shape)) problems.push(`check 5: ${a.id} writes on the server but takes no requestId`);
    if (!(a.params instanceof z.ZodObject)) problems.push(`check 5: ${a.id} params must be an object`);
  }
  return problems;
}
