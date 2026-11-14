import { writeFileSync } from "node:fs";
import { lineZ, primeGradient, primeLanding } from "@workspace/v2-linear";
import { dominantRungs } from "../src/exact.ts";
const [which, out] = [process.argv[2]!, process.argv[3]!];
const jobs = { "pg-prime": [primeGradient, "prime"], "pg-cprime": [primeGradient, "cPrime"], "pl-big": [primeLanding, "big-prime"], "pl-pg": [primeLanding, "prime-gradient"] } as const;
const [f, tb] = jobs[which as keyof typeof jobs];
writeFileSync(out, JSON.stringify({ which, dom: dominantRungs(f as never, {}, lineZ, tb, 30) }));
