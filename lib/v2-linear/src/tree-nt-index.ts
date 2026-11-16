/**
 * The number-theory tree families (tree-nt-*.ts): undealt tuple families with large parameter sets, registered on the
 * line type here, in one place. Walk-throughs: docs/engine-v2/tree-families/.
 */
import { primeTop } from "./tree-nt-prime-top.ts";

export * from "./tree-nt-shared.ts";
export * from "./tree-nt-prime-top.ts";
export const treeNtFamilies = [primeTop] as const;
