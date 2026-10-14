import type { Observation } from "./protocol.ts";
export type AnalyticsPlugin = (observation: Readonly<Observation>) => Record<string, number>;
export const rankedObjects = (observation: Observation) => [...observation.objects].sort((a,b) => b.payoff-a.payoff);
export const summary: AnalyticsPlugin = observation => ({
  objectCount: observation.objects.length,
  totalPayoff: observation.objects.reduce((n,o) => n+o.payoff,0),
  meanOwnValue: observation.objects.length ? observation.objects.reduce((n,o)=>n+o.ownValue,0)/observation.objects.length : 0,
});
