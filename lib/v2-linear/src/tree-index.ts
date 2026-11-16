/**
 * The tree families built after the first two (tree-nt-*.ts, tree-geo*.ts, tree-rep-*.ts): undealt tuple families with
 * large parameter sets, one list. Walk-throughs: docs/engine-v2/tree-families/.
 */
import { smoothMixed, tower } from "./tree-nt-more.ts";
import { legRatio, quadrantSquare } from "./tree-geo-shapes.ts";
import { borrowedBottom, partWay } from "./tree-rep-more.ts";
import { drawnStep } from "./tree-rep-step.ts";

export * from "./tree-nt-more.ts";
export * from "./tree-geo-shapes.ts";
export * from "./tree-rep-more.ts";
export * from "./tree-rep-step.ts";
export const treeMoreFamilies = [smoothMixed, tower, legRatio, quadrantSquare, borrowedBottom, drawnStep, partWay] as const;
