/**
 * The geometry tree families (tree-geo-*.ts; docs/engine-v2/tree-families/): undealt tuple families whose targets are
 * lengths, areas, points and directions, each with a large parameter space (tree-geo-kit.ts). Registered here, once.
 */
import { tangentRings } from "./tree-geo-rings.ts";

export * from "./tree-geo-kit.ts";
export * from "./tree-geo-rings.ts";
export const treeGeoFamilies = [tangentRings] as const;
