import { lineType, lineQ, lineZ } from "@workspace/v2-linear";
import { gridType, grid4 } from "@workspace/v2-grid";
import { EngineHost } from "../src/host.ts";
import { births } from "../src/births.ts";
for (const [type, v, rule] of [[lineType, lineQ, { family: "m-meets-c", params: {} }], [lineType, lineZ, { family: "m-meets-c", params: {} }], [gridType, grid4, { family: gridType.families[0]!.id, params: {} }]] as const) {
  const reps = type.representations.map((r: { id: string }) => r.id);
  for (const s of births(type as never, v as never, "w", 3)) {
    const out: string[] = [];
    for (const rep of reps) {
      const h = new EngineHost({ type: type as never, variant: v as never, state: s, rule: rule as never, energy: 0 });
      const r = h.handle({ op: "view", rep } as never, { hostCallsLeft: 5 }) as { ok: boolean };
      out.push(`${rep}:${r.ok ? (h.readBits >= h.phi - 1e-9 ? "FULL" : h.readBits.toFixed(1)) : "x"}`);
    }
    console.log(v.id, (type as { encode: (s: unknown) => string }).encode(s), out.join(" "));
  }
}
