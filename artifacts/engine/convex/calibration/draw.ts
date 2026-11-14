/**
 * One draw's calibration table by instantiation, over HTTP: GET
 * /api/rule-tables?instance=<key>&family=<familyId>&params=<JSON>, for any signed-in caller (the Convex JWT in
 * `Authorization: Bearer`). The rule gallery (artifacts/player-web site/pages/rule-family.tsx) belongs to no room or
 * game, so its goal card's "How this scores" asks by what decides a table: the instantiation (object type and type
 * args) and the draw (family and params, which must be in the family's support there), under the default (uniform)
 * prior. Calibration tables are public knowledge of the rules (no player's goal is named). Unlike a seat's tables, a
 * URL here names no table version, so a deploy may ship a newer table for it: the browser keeps an answer for an hour
 * (`Cache-Control: private, max-age=3600`). Served like a game's tables (calibration/node.ts tablesOf): shipped,
 * analytic (built in memory) or computed earlier; a draw without one is a 404 and never schedules a computation.
 */
import { defaultSettingsFor } from "@workspace/game-core";
import { applicable, context, family, instantiateKey, isPlayableInstantiation, paramsKey } from "@workspace/game-utilities";
import { internal } from "../_generated/api";
import { httpAction, internalQuery } from "../_generated/server";
import { requireViewer } from "../auth/access";
import { BEARER_CORS } from "../auth/routes";
import { json, refusal } from "../lib/http";

/** Throws unless the caller is signed in (sign-in is required for everything). */
export const signedIn = internalQuery({ args: {}, handler: async ctx => { await requireViewer(ctx); return null; } });

const reply = (body: unknown, status: number) => json(body, status, BEARER_CORS);
const USAGE = "GET /api/rule-tables?instance=<instantiation key>&family=<family id>&params=<JSON object>";

/** The instantiation and draw a request names, or the reason it names none. */
export function drawOf(url: URL): { settings: ReturnType<typeof defaultSettingsFor>; familyId: string; params: Record<string, unknown> } | { error: string } {
  const key = url.searchParams.get("instance"), familyId = url.searchParams.get("family"), raw = url.searchParams.get("params");
  if (!key || !familyId || raw === null || key.length > 128 || familyId.length > 64 || raw.length > 1024) return { error: USAGE };
  let inst, f, params: unknown;
  try { inst = instantiateKey(key); } catch { return { error: `Unknown instantiation ${key}` }; }
  if (!isPlayableInstantiation(inst)) return { error: `${inst.key} is not a playable board` };
  try { f = family(familyId); } catch { return { error: `Unknown rule family ${familyId}` }; }
  try { params = JSON.parse(raw); } catch { return { error: "params must be a JSON object" }; }
  if (!params || typeof params !== "object" || Array.isArray(params)) return { error: "params must be a JSON object" };
  // Only a draw a game could deal here: params in the family's finite support, never made-up params.
  const wanted = paramsKey(params);
  if (!f.support(context(inst)).some(p => paramsKey(p) === wanted)) return { error: `Those params are not a ${familyId} draw on ${inst.key}` };
  let ok;
  try { ok = applicable(f, inst, params as Record<string, never>); } catch { return { error: `${familyId} cannot be dealt on ${inst.key}` }; }
  if (!ok.ok) return { error: `${familyId} cannot be dealt on ${inst.key}: ${ok.reason}` };
  return { settings: defaultSettingsFor(inst.objectType, undefined, inst.args), familyId, params: params as Record<string, unknown> };
}

export const download = httpAction(async (ctx, request) => {
  try {
    await ctx.runQuery(internal.calibration.draw.signedIn, {});
    const draw = drawOf(new URL(request.url));
    if ("error" in draw) return reply({ error: draw.error, code: "BAD_REQUEST" }, 400);
    const [reward] = JSON.parse(await ctx.runAction(internal.calibration.node.tablesOf, { settings: draw.settings, draws: [{ familyId: draw.familyId, params: draw.params }] })) as unknown[];
    return json({ reward }, 200, { ...BEARER_CORS, "Cache-Control": "private, max-age=3600" });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return reply(refused.body, refused.status);
    console.error("rule tables download failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Internal error" }, 500);
  }
});
export const preflight = httpAction(async () => new Response(null, { status: 204, headers: BEARER_CORS }));
