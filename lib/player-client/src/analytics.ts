import type { Observation } from "./protocol.ts";
export type AnalyticsPlugin = (observation: Readonly<Observation>) => Record<string, number>;
export const rankedObjects = (observation: Observation) => [...observation.objects].sort((a,b) => b.score-a.score);
export const summary: AnalyticsPlugin = observation => ({
  objectCount: observation.objects.length,
  totalScore: observation.objects.reduce((n,o) => n+o.score,0),
  meanOwnUtility: observation.objects.length ? observation.objects.reduce((n,o)=>n+o.ownUtility,0)/observation.objects.length : 0,
});
