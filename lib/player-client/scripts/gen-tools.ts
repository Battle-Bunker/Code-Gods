/** Writes src/tools.schema.json from the zod definitions in src/tools.ts (`pnpm --filter @workspace/player-client gen:tools`). */
import { writeFileSync } from "node:fs";
import { toolJsonSchemas } from "../src/tools.ts";

const file = new URL("../src/tools.schema.json", import.meta.url);
writeFileSync(file, JSON.stringify(toolJsonSchemas(), null, 2) + "\n");
console.log(`wrote ${file.pathname}`);
