/** Rewrites the generated catalogue table in docs/engine-api.md (`pnpm --filter @workspace/player-client gen:catalog`). */
import { readFileSync, writeFileSync } from "node:fs";
import { withCatalogDoc } from "../src/catalog-doc.ts";

const file = new URL("../../../docs/engine-api.md", import.meta.url);
writeFileSync(file, withCatalogDoc(readFileSync(file, "utf8")));
console.log(`wrote ${file.pathname}`);
