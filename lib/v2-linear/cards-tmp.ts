import { lineType, lineQ } from "./src/index.ts";
const ids = process.argv.slice(2);
for (const f of lineType.families as any[]) {
  if (ids.length && !ids.includes(f.id)) continue;
  const d = f.dealable(lineQ);
  console.log(`## ${f.id} (${d.length} dealable on line-q) ${JSON.stringify(d.slice(0, 2))}`);
  console.log(f.card(d[0], null));
  for (const t of f.tieBreakers) console.log(`  - ${t.id}: ${t.sentence(d[0])}`);
}
