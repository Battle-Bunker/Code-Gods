import { poolOf, spaceOf, ruleName } from "./landscape-lib.ts";
const space = spaceOf("pair-q"), rules = poolOf("pair-q").rules;
const x = JSON.parse(process.argv[2]!) as number[];
const s = space.state(x)!;
console.log(JSON.stringify(s, (_, v) => (typeof v === "bigint" ? String(v) : v)));
for (const spec of process.argv.slice(3)) {
  const [family, params, tb] = spec.split("|");
  const rule = rules.find(r => r.family === family && JSON.stringify(r.params) === params && r.tieBreaker === tb);
  console.log(spec, rule ? space.bits(rule)(s).toFixed(2) : "not in pool");
}
