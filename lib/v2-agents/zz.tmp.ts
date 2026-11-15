import { summonBits } from "./src/summon.ts";
import { readFileSync } from "node:fs";
for (const [lang, ext] of [["typescript", "ts"], ["python", "py"]] as const) console.log(lang, summonBits(lang, readFileSync(`agents/square-area/simple.${ext}`, "utf8")).energy.toFixed(0));
