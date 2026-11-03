/**
 * One draw's calibration table for the rule gallery's goal card ("How this scores": rarity and bits), from the
 * engine's GET /api/rule-tables (artifacts/engine/convex/calibration/draw.ts), keyed by the instantiation and the draw,
 * with your Convex JWT, the way a seat's tables come (sdk/transport.ts loadTables). Static data: the browser keeps an
 * answer for an hour (the route's Cache-Control); requests in flight are shared, and nothing is cached here. Until it arrives (or if the draw has no table yet) the
 * card explains without that section.
 */
import { useEffect, useState } from "react";
import type { Instantiation } from "@workspace/game-types";
import type { CalibrationTable, Params } from "@workspace/game-utilities";
import { appAccessToken, engineSite } from "@/core/connection";

export interface RuleScoring { tables: { reward: CalibrationTable }; netBits: (typeof import("@workspace/game-core"))["netBits"] }

/** The route's path for a draw on an instantiation. */
export const ruleTablesPath = (instanceKey: string, familyId: string, params: Params) =>
  `/api/rule-tables?${new URLSearchParams({ instance: instanceKey, family: familyId, params: JSON.stringify(params) })}`;

const inFlight = new Map<string, Promise<RuleScoring>>();
function load(path: string): Promise<RuleScoring> {
  let request = inFlight.get(path);
  if (!request) {
    request = (async () => {
      const token = await appAccessToken();
      if (!token) throw new Error("Not signed in");
      const [response, core] = await Promise.all([
        fetch(`${engineSite().replace(/\/$/, "")}${path}`, { headers: { authorization: `Bearer ${token}` } }),
        import("@workspace/game-core"),
      ]);
      if (!response.ok) {
        throw new Error(response.status === 404 ? "This draw has no calibration table yet." : `The calibration table did not load (HTTP ${response.status}).`);
      }
      const { reward } = await response.json() as { reward: CalibrationTable };
      return { tables: { reward }, netBits: core.netBits };
    })();
    inFlight.set(path, request);
    void request.finally(() => inFlight.delete(path)).catch(() => {});
  }
  return request;
}

/** The draw's scoring inputs once loaded, else undefined. */
export function useRuleScoring(inst: Instantiation, familyId: string, params: Params | null): RuleScoring | undefined {
  const path = params ? ruleTablesPath(inst.key, familyId, params) : null;
  const [loaded, setLoaded] = useState<{ path: string; scoring: RuleScoring }>();
  useEffect(() => {
    if (!path) return;
    let live = true;
    load(path).then(scoring => { if (live) setLoaded({ path, scoring }); }, error => console.warn("[rule gallery] score workings unavailable:", error));
    return () => { live = false; };
  }, [path]);
  return loaded && loaded.path === path ? loaded.scoring : undefined;
}
