import { instantiate, objectType, seededRng } from "@workspace/game-types";
import { familiesFor, available, canonicalSupport, context, evaluator } from "../src/index.ts";
const insts = [instantiate("Int",{}), instantiate("Int",{min:0,max:9999}), instantiate("string",{maxLength:16}), instantiate("string",{maxLength:128}),
  ...[[5,"base10","rgby"],[5,"base10","rgb"],[5,"cards","rainbow6"],[4,"base12","rgby"],[6,"base16","rainbow6"],[5,"cards","rgb"]].map(([size,symbols,colours])=>instantiate("Grid",{size,symbols,colours}))];
for (const inst of insts) {
  const T = objectType(inst.objectType), codec = T.codec(inst), ctx = context(inst), rng = seededRng(1);
  const wires = Array.from({length: 2000}, () => codec.encode(T.spawn(inst, rng)));
  let tables = 0; const rows: string[] = [];
  for (const f of familiesFor(inst.objectType)) {
    if (!available(f, inst).ok) continue;
    const cs = canonicalSupport(f, ctx); tables += cs.length;
    const ev = evaluator({familyId: f.id, params: cs[0]}, inst);
    const t0 = performance.now(); for (const w of wires) ev(w); const us = (performance.now()-t0)*1000/wires.length;
    rows.push(`${f.id}:${cs.length}:${us.toFixed(1)}us`);
  }
  console.log(inst.key, "tables", tables, rows.join(" "));
}
