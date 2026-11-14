/**
 * The line annotations storyboards (docs/engine-v2/annotations-design.md §9), drawn by the real v2-views faces on the
 * real rules and their calibrated value functions (owner decision 23: no steps):
 *   /annotations-lines.html                                   every storyboard, listed
 *   ?rule=<family>&frame=line|compare|compact|goal            one frame;   ?rule=scale   y = 290x + 59
 *   ?rational=<family>                                        a rational line under that family on line-q (lines-beginner)
 *   &scheme=dark                                              the dark scheme
 * e2e/annotations-lines.ts checks them in a browser and captures docs/screenshots/annotations-lines/.
 */
import { StrictMode, useMemo, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { q, type Q } from "@workspace/v2-core";
import { beginnerPool, divisibilityLadder, fromMC, lineQ, lineType, lineZ, primeLanding, squareArea, treasure, wholeCrossing, type LineState } from "@workspace/v2-linear";
import { tieBreakersOn } from "@workspace/v2-core";
import { CompactFace, ExpandedFace, GoalCard, MoveLine, moves, ObjectChip, type RuleRef } from "@workspace/v2-views";
import "@workspace/v2-views/styles.css";
import "./style.css";
import { valueFor } from "../values";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });

interface Story { title: string; rule: RuleRef<LineState, unknown>; line: LineState; number: number; others: LineState[] }
const rule = (family: RuleRef<LineState, unknown>["family"], tieBreaker: string): RuleRef<LineState, unknown> =>
  ({ type: lineType, family, params: family.dealable(lineZ)[0], variant: lineZ, tieBreaker });
const STORIES: Record<string, Story> = {
  "prime-landing": { title: "Prime Landing", rule: rule(primeLanding, "big-prime"), line: mc(6, 25), number: 7, others: [mc(6, 23), mc(4, 30)] },
  "square-area": { title: "Square Area", rule: rule(squareArea, "spf"), line: mc(-1, 7), number: 3, others: [mc(-2, 10), mc(2, 30)] },
  "whole-crossing": { title: "Whole Crossing", rule: rule(wholeCrossing, "k-gpf"), line: mc(3, 7), number: 12, others: [mc(3, 6), mc(5, 2)] },
  treasure: { title: "Treasure", rule: rule(treasure, "m-spf"), line: mc(15, 6), number: 5, others: [mc(16, 5), mc(10, 20)] },
  "divisibility-ladder": { title: "Divisibility Ladder", rule: rule(divisibilityLadder, "m-spf"), line: mc(12, 12), number: 9, others: [mc(60, 60), mc(5, 3)] },
};

/**
 * Rational lines (lines-beginner plays on line-q): one per pool family, a line whose gradient and y-intercept are
 * fractions with different denominators, chosen so the family's parts are defined on it (a coin line needs a, b > 0).
 */
const RATIONAL_LINE: Record<string, LineState> = { "exact-change": mc(q(-3, 4), q(9, 2)), "pythagorean-area": mc(q(-5, 3), q(11, 4)), ruler: mc(q(3, 4), q(-7, 3)) };
const rationalStory = (family: string): Story | undefined => {
  const f = beginnerPool.find(x => x.id === family);
  if (!f) return undefined;
  const tb = tieBreakersOn(f, lineQ)[0]?.id ?? null;
  const r = { type: lineType, family: f, params: f.dealable(lineQ)[0], variant: lineQ, tieBreaker: tb } as RuleRef<LineState, unknown>;
  return { title: `${f.id} on a rational line`, rule: r, line: RATIONAL_LINE[family] ?? mc(q(2, 3), q(7, 4)), number: 7, others: [mc(q(-5, 2), q(17, 6)), mc(q(13, 5), q(29, 7))] };
};

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
const ruleId = params.get("rule");
const frame = params.get("frame") ?? "line";
const valueOf = (r: RuleRef<LineState, unknown>) => valueFor(r.variant.id, r.family.id, r.params, r.tieBreaker);

function Frame({ s, f }: { s: Story; f: string }): ReactElement {
  const value = useMemo(() => valueOf(s.rule), [s]);
  switch (f) {
    case "compare": return <ExpandedFace rule={s.rule} state={s.line} value={value} initialRep={s.rule.family.main.rep} compare="table" />;
    case "goal": return <GoalCard rule={s.rule} example={s.others[0]!} value={value} mine={{ state: s.line, name: `Line ${s.number}` }} />;
    case "compact": {
      const first = moves(s.rule, s.line, value, { k: 1 })[0];
      return (
        <div className="la-compact">
          <h3>Lines (rows)</h3>
          <div className="la-rows">
            {[s.line, ...s.others].map((l, i) => (
              <div key={i} className="la-row" data-row={i}>
                <CompactFace rule={s.rule} state={l} value={value} next={i === 0} />
                <div className="la-row-text"><b>Line {[s.number, 2, 14][i]}</b> <ObjectChip type={lineType} state={l} /></div>
              </div>
            ))}
          </div>
          <h3>Act log</h3>
          {first && <MoveLine rule={s.rule} before={s.line} after={first.after} who="Your agent Lander-1" what={first.words} value={value} points={{ before: 6.6, after: 10.3, want: 3.1 }} />}
        </div>
      );
    }
    default: return <ExpandedFace rule={s.rule} state={s.line} value={value} />;
  }
}

function Scale(): ReactElement {
  const pl = rule(primeLanding, "m-gpf"), sa = rule(squareArea, "spf");
  return (
    <>
      <ExpandedFace rule={pl} state={mc(290, 59)} value={valueOf(pl)} />
      <ExpandedFace rule={sa} state={mc(290, 59)} value={valueOf(sa)} />
    </>
  );
}

function Index(): ReactElement {
  return (
    <div>
      <h1>Line annotations: storyboards</h1>
      <p className="la-muted">docs/engine-v2/annotations-design.md §9, drawn by lib/v2-views on the real rules and their calibrated value functions.</p>
      <ul>
        {Object.entries(STORIES).map(([id, s]) => (
          <li key={id}>{s.title}: {["line", "compare", "compact", "goal"].map(f => <a key={f} href={`?rule=${id}&frame=${f}`} style={{ marginRight: 10 }}>{f}</a>)}</li>
        ))}
        <li><a href="?rule=scale">Scale: y = 290x + 59</a></li>
        {beginnerPool.map(f => <li key={f.id}><a href={`?rational=${f.id}`}>{f.id} on a rational line</a> · <a href={`?rational=${f.id}&frame=compact`}>compact</a></li>)}
      </ul>
    </div>
  );
}

function Page(): ReactElement {
  const rational = params.get("rational");
  const s = rational ? rationalStory(rational) : ruleId ? STORIES[ruleId] : undefined;
  return (
    <div data-v2v-scheme={scheme}>
      <main className="v2v la-page">
        {ruleId === "scale" && !rational ? <Scale /> : s ? <><h2 className="la-story-title">{s.title} · {frame}</h2><Frame s={s} f={frame} /></> : <Index />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
