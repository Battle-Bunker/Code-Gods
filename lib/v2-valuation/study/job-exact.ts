import { writeFileSync } from "node:fs";
import { lineZ, primeGradient, primeLanding } from "@workspace/v2-linear";
import { exactRungsSeparable } from "../src/exact.ts";
const [which, out] = [process.argv[2]!, process.argv[3]!];
const jobs = { "pg-prime": [primeGradient, "prime", ["m", "m"]], "pg-cprime": [primeGradient, "cPrime", ["m", "c"]], "pl-big": [primeLanding, "big-prime", ["c", "c"]], "pl-pg": [primeLanding, "prime-gradient", ["c", "m"]] } as const;
const [f, tb, on] = jobs[which as keyof typeof jobs];
const t = Date.now();
const r = exactRungsSeparable(f as never, {}, lineZ, tb, on as never, 40);
writeFileSync(out, JSON.stringify({ which, ms: Date.now() - t, ...r }));
