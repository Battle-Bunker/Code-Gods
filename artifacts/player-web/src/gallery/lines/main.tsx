/**
 * The line annotations storyboards (docs/engine-v2/annotations-design.md §9), as running pages on the dev server:
 *   /annotations-lines.html                      every storyboard, listed
 *   ?rule=<family>&frame=line|select|compare|others|compact|goal|scale   one frame
 *   &scheme=dark                                 the dark scheme
 * e2e/annotations-lines.ts captures them into docs/screenshots/annotations-lines/.
 */
import { StrictMode, useMemo, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { q, type Q } from "@workspace/v2-core";
import { fromMC, type LineState } from "@workspace/v2-linear";
import "@workspace/v2-views/styles.css";
import "./style.css";
import { read, ruleOf, type Role, type ViewId } from "./model";
import { ActLine, Chip, GoalLinked, OneLine, Others, Row, toldContributor } from "./ui";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });

interface Story { family: string; tb: string; params?: unknown; line: LineState; number: number; title: string; others?: LineState[] }
const STORIES: Record<string, Story> = {
  "prime-landing": { family: "prime-landing", tb: "big-prime", line: mc(6, 25), number: 7, title: "Prime Landing", others: [mc(6, 23), mc(4, 30)] },
  "square-area": { family: "square-area", tb: "spf", line: mc(-1, 7), number: 3, title: "Square Area", others: [mc(-2, 10), mc(2, 30)] },
  "whole-crossing": { family: "whole-crossing", tb: "k-gpf", line: mc(3, 7), number: 12, title: "Whole Crossing", others: [mc(3, 6), mc(5, 2)] },
  treasure: { family: "treasure", tb: "m-spf", params: { k: 2, T: 37 }, line: mc(15, 6), number: 5, title: "Treasure", others: [mc(16, 5), mc(10, 20)] },
  "divisibility-ladder": { family: "divisibility-ladder", tb: "m-spf", line: mc(12, 12), number: 9, title: "Divisibility Ladder", others: [mc(60, 60), mc(5, 3)] },
};

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
const ruleId = params.get("rule");
const frame = params.get("frame") ?? "line";
const width = Math.min(window.innerWidth, 1400) - 32;
const wide = window.innerWidth >= 900;

function Frame({ s, f }: { s: Story; f: string }): ReactElement {
  const rule = useMemo(() => ruleOf(s.family, s.tb, s.params), [s]);
  const r = useMemo(() => read(rule, s.line), [rule, s.line]);
  switch (f) {
    case "select": return <OneLine r={r} number={s.number} wide={wide} width={width} initialSel={"main" as Role} initialCompare={wide ? undefined : r.reads.find(v => v !== r.primary) ?? null} howOpen />;
    case "compare": return <OneLine r={r} number={s.number} wide={wide} width={width} initialCompare={"table" as ViewId} />;
    case "others": {
      const ada = read(ruleOf("prime-landing", "big-prime"), s.line);
      const shared = r.moves.find(m => read(ada.rule, m.after, false).level > ada.level) ?? null;
      return (
        <OneLine r={r} number={s.number} wide={wide} width={width} told={[toldContributor(ada, "Ada")]}>
          <Others r={r} told={ada} shared={shared} />
        </OneLine>
      );
    }
    case "compact": {
      const rows = [s.line, ...(s.others ?? [])].map(l => read(rule, l));
      const after = r.moves[0] ? read(rule, r.moves[0].after, false) : r;
      return (
        <div className="la-compact">
          <h3>Lines (rows)</h3>
          <div className="la-rows">{rows.map((x, i) => <Row key={i} r={x} number={[s.number, 2, 14][i]!} width={width} />)}</div>
          <h3>Chip and chat</h3>
          <p className="la-chat"><b>Ada:</b> can you get <Chip r={r} /> to a prime? I need its y-intercept.</p>
          <h3>Act log</h3>
          <ActLine before={r} after={after} who="Your agent Lander-1" />
        </div>
      );
    }
    case "goal": return <GoalLinked r={r} number={s.number} />;
    default: return <OneLine r={r} number={s.number} wide={wide} width={width} />;
  }
}

function Scale(): ReactElement {
  const pl = useMemo(() => read(ruleOf("prime-landing", "m-gpf"), mc(290, 59)), []);
  const sa = useMemo(() => read(ruleOf("square-area", "spf"), mc(290, 59)), []);
  return (
    <>
      <OneLine r={pl} number={4} wide={wide} width={width} />
      <OneLine r={sa} number={4} wide={wide} width={width} />
    </>
  );
}

function Index(): ReactElement {
  const frames = ["line", "select", "compare", "others", "compact", "goal"];
  return (
    <div>
      <h1>Line annotations: storyboards</h1>
      <p className="la-muted">docs/engine-v2/annotations-design.md §9. Real rules, element values, prices and calibrated bits (line-z); others' bits are illustrative.</p>
      <ul>
        {Object.entries(STORIES).map(([id, s]) => (
          <li key={id}>{s.title}: {frames.map(f => <a key={f} href={`?rule=${id}&frame=${f}`} style={{ marginRight: 10 }}>{f}</a>)}</li>
        ))}
        <li><a href="?rule=scale">Scale: y = 290x + 59</a></li>
      </ul>
    </div>
  );
}

function Page(): ReactElement {
  const s = ruleId ? STORIES[ruleId] : undefined;
  return (
    <div data-v2v-scheme={scheme}>
      <main className="v2v la-page" data-scheme={scheme}>
        {ruleId === "scale" ? <Scale /> : s ? <><h2 className="la-story-title">{s.title} · {frame}</h2><Frame s={s} f={frame} /></> : <Index />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
