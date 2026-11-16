/** The shipped agents of the dynamic families (src/dynamic-catalogue.ts) score lines as the engine's utility does, in both languages. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, q, Qn } from "@workspace/v2-core";
import { dynamicFamilies, fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import { births, EngineHost, sandboxes, scoreSource, startersFor } from "../src/index.ts";

const boxes = sandboxes();
const lines: LineState[] = [
  ...[[q(7), q(81)], [q(3, 2), q(1, 8)], [q(1031), q(243)], [q(1, 13), q(-27)], [q(17, 5), q(1, 23)], [q(-1, 9), q(1, 3)], [q(11), q(64)], [q(2, 7), q(-48)], [q(0), q(0)], [q(3, 4), q(25, 4)], [q(-7, 10), q(-13, 10)], [q(-1, 8), q(21)], [q(1031), q(5, 3)]].map(([m, c]) => ({ lines: [fromMC(m!, c!)] })),
  ...births(lineType, lineQ, "dyn-scores", 20).filter(s => s.lines[0]!.b !== 0n),
];

async function agentUtilities(language: "typescript" | "python", family: string, params: unknown): Promise<(number | null)[]> {
  const mc = lines.map(s => { const l = s.lines[0]!; return [`${-l.a}/${l.b}`, `${-l.c}/${l.b}`]; });
  const probe = language === "python"
    ? `\nP = ${JSON.stringify(params)}\nPAIRS = ${JSON.stringify(mc)}\n\n\ndef agent(offer):\n    out = []\n    for m, c in PAIRS:\n        s = score(Fraction(m), Fraction(c), P, None)\n        out.append("null" if s is None else repr(float(s[0])))\n    return [move("probe", r=";".join(out))]\n`
    : `\nconst P = ${JSON.stringify(params)}, PAIRS = ${JSON.stringify(mc)};\nfunction agent(offer) {\n  return [move("probe", { r: PAIRS.map(([m, c]) => { const s = score(Q.from(m), Q.from(c), P, null); return s === null ? "null" : String(s[0]); }).join(";") })];\n}\n`;
  const host = new EngineHost({ type: lineType, variant: lineQ, state: lines[0]!, rule: { family, params }, energy: 0 });
  const res = await (await boxes.get(language)).act({ source: scoreSource(family, null, language) + probe, offer: { object: 0 }, seed: "1", host, limits: { stepBudget: 10_000_000, wallMs: 30_000 } });
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  return (JSON.parse(res.calls)[0].args.r as string).split(";").map(x => (x === "null" ? null : Number(x)));
}

test("each dynamic family's agents compute the engine's utility, in both languages", async () => {
  for (const f of dynamicFamilies) for (const params of f.dealable(lineQ)) {
    const engine = lines.map(s => { const sc = evaluateSite(lineType, f as never, params, s, lineQ, 0, null).score; return sc === null || sc[0] === null ? null : Qn.toNumber(sc[0]!); });
    for (const language of ["typescript", "python"] as const) {
      const agent = await agentUtilities(language, f.id, params);
      agent.forEach((a, i) => {
        const e = engine[i]!, what = `${f.id} ${JSON.stringify(params)} ${language} on ${lineType.encode(lines[i]!)}`;
        if (e === null || a === null) assert.equal(a, e, what);
        else assert.ok(Math.abs(a - e) <= 1e-6 * Math.max(1, Math.abs(e)), `${what}: ${a} against ${e}`);
      });
    }
  }
});

test("each dynamic family ships the four starters", () => {
  for (const f of dynamicFamilies) assert.equal(startersFor(f.id, "python").length, 4);
});
