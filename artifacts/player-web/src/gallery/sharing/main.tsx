/**
 * PROPOSAL, not wired into the game: storyboards for letting a player deliberately tell others what their rule wants
 * (docs/engine-v2/sharing-rules-design.md), drawn by the real v2-views faces on real rules and their calibrated value
 * functions:
 *   /sharing-rules.html?frame=show|received|suits|propose|sentence   (&scheme=dark)
 * Ada (you) holds Prime Landing; Bo holds Whole Crossing; they have pulled line 4 back and forth.
 * e2e/sharing-rules.ts captures docs/screenshots/sharing-rules/ at 1440 and 390.
 */
import { StrictMode, useMemo, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { applyPriced, evaluateObject, isInvalid, q, type Score } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, primeLanding, wholeCrossing, type LineState } from "@workspace/v2-linear";
import { CompactFace, ExpandedFace, GoalCard, ObjectChip, repText, type Move, type RuleRef } from "@workspace/v2-views";
import "@workspace/v2-views/styles.css";
import "./style.css";
import { valueFor } from "../values";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
const rule = (family: RuleRef<LineState, unknown>["family"], tieBreaker: string): RuleRef<LineState, unknown> =>
  ({ type: lineType, family, params: family.dealable(lineZ)[0], variant: lineZ, tieBreaker });
const ADA = rule(primeLanding, "big-prime"), BO = rule(wholeCrossing, "k-gpf");
const valueOf = (r: RuleRef<LineState, unknown>) => valueFor(r.variant.id, r.family.id, r.params, r.tieBreaker)!;
const LINE = 4, NOW = mc(3, 8);
const text = (s: LineState) => repText(lineType, s, "si");

/** Bits of a state for a rule: its value function on the rule's utility. */
const bitsOf = (r: RuleRef<LineState, unknown>, v: (u: Score) => number, s: LineState) => v(evaluateObject(r.type, r.family, r.params, s, r.variant, r.tieBreaker).score);

/**
 * "What suits us both" (proposal §2): from the two SHARED rules only, the line near this one whose product of the two
 * players' bits is largest, and the price to get there (a tilt then a shift, at the engine's own prices).
 */
function suitsBoth(now: LineState) {
  const va = valueOf(ADA), vb = valueOf(BO), b = bitsOf;
  const m0 = 3, c0 = 8;
  let best = { s: now, m: m0, c: c0, a: b(ADA, va, now), b: b(BO, vb, now), p: 0 };
  best.p = best.a * best.b;
  for (let m = m0 - 6; m <= m0 + 6; m++) for (let c = c0 - 40; c <= c0 + 40; c++) {
    if (m === 0) continue;
    const s = mc(m, c), x = b(ADA, va, s), y = b(BO, vb, s);
    if (x * y > best.p + 1e-9) best = { s, m, c, a: x, b: y, p: x * y };
  }
  // The price to get there: a tilt (the gradient) then a shift (the y-intercept), each priced by the engine.
  const tilt = lineType.mutators.find(m => m.id === "si.tilt")!, shift = lineType.mutators.find(m => m.id === "si.shift")!;
  const m1 = best.m, c1 = best.c;
  let price = 0, s: LineState = now;
  if (m1 !== m0) { const r = applyPriced(lineType, lineZ, s, tilt as never, 0, { k: q(m1 - m0) }); if (!isInvalid(r)) { price += r.price.total; s = r.result as LineState; } }
  if (c1 !== c0) { const r = applyPriced(lineType, lineZ, s, shift as never, 0, { k: q(c1 - c0) }); if (!isInvalid(r)) { price += r.price.total; s = r.result as LineState; } }
  return { ...best, price, now: { a: b(ADA, va, now), b: b(BO, vb, now) } };
}

function Banner(): ReactElement {
  return <p className="sr-banner">Proposal for the owner to decide: not in the game. Storyboard drawn by the real faces and rules.</p>;
}

function Frame({ f }: { f: string }): ReactElement {
  const va = useMemo(() => valueOf(ADA), []), vb = useMemo(() => valueOf(BO), []);
  const joint = useMemo(() => suitsBoth(NOW), []);
  switch (f) {
    case "show": return (
      <div className="sr-cols">
        <GoalCard rule={ADA} example={mc(6, 23)} value={va} mine={{ state: NOW, name: `Line ${LINE}` }} />
        <div className="sr-card">
          <h3>Show my rule card to…</h3>
          <div className="sr-menu">
            <label><input type="checkbox" defaultChecked /> Bo</label>
            <label><input type="checkbox" /> Cy</label>
            <label><input type="checkbox" /> Everyone at the table</label>
          </div>
          <p className="sr-muted">They will see your card: its sentence, your main part and your tie-breaker, and how rare any line is for you. They will not see your agents or your energy.</p>
          <p className="sr-muted"><b>Once shown, it stays shown for this game.</b> They have read it; hiding it again would only pretend they had not.</p>
          <span><span className="sr-btn">Show my card to Bo</span> <span className="sr-btn" data-quiet="">Cancel</span></span>
        </div>
      </div>
    );
    case "received": return (
      <div className="sr-cols">
        <div className="sr-card">
          <h3>Bo showed you his rule card</h3>
          <GoalCard rule={BO} example={mc(3, 6)} value={vb} />
        </div>
        <div className="sr-card">
          <h3>Line {LINE} <ObjectChip type={lineType} state={NOW} /></h3>
          <p>For you: <b>{fmt(va, ADA, NOW)} bits</b> · <span className="sr-for">for Bo: {fmt(vb, BO, NOW)} bits</span></p>
          <p className="sr-muted">Bo's parts drawn on your line, in his colours (◆ is his tie-breaker):</p>
          <CompactFace rule={BO} state={NOW} value={vb} />
        </div>
      </div>
    );
    case "suits": {
      const ghost = { call: { mutator: "settle", site: 0, args: {} }, words: `settle at ${text(joint.s)}`, price: { total: joint.price }, after: joint.s, utility: null, bits: joint.a, changes: [], text: text(joint.s), reason: "what suits you both" } as unknown as Move<LineState>;
      return (
        <div className="sr-cols">
          <div className="sr-card">
            <h3>What suits you both: line {LINE}</h3>
            <p className="sr-muted">From your rule and the card Bo showed you, nothing else: the line nearby where your bits × Bo's bits is largest (its ghost is drawn where the view can show it; here it lies outside, so it is written below).</p>
            <CompactFace rule={ADA} state={NOW} value={va} next={ghost} rep="cart" />
            <p>Now {text(NOW)}: you {joint.now.a.toFixed(2)} bits × Bo {joint.now.b.toFixed(2)} bits = <b>{(joint.now.a * joint.now.b).toFixed(2)}</b></p>
            <p>At <b>{text(joint.s)}</b>: you {joint.a.toFixed(2)} bits × Bo {joint.b.toFixed(2)} bits = <b>{joint.p.toFixed(2)}</b>, for {joint.price.toFixed(2)} energy to get there.</p>
            <span className="sr-btn">Propose: we both take the moves marked ↑ both on line {LINE}</span>
          </div>
          <ExpandedFace rule={ADA} state={NOW} value={va} />
        </div>
      );
    }
    case "propose": return (
      <div className="sr-cols">
        <div className="sr-card sr-chat">
          <h3>Chat</h3>
          <div className="sr-msg" data-mine=""><b>You → Bo</b>Line {LINE}: some moves raise the points for both of us; mine are marked ↑ both. Shall we both take those, a step at a time?</div>
          <div className="sr-msg"><b>Bo</b>Deal.</div>
        </div>
        <div className="sr-card">
          <h3>Then each agent climbs</h3>
          <p className="sr-muted">No destination is agreed or held (owner, 14 November: agents are hill climbers). Each side takes the moves that raise the points for both, one step at a time.</p>
        </div>
      </div>
    );
    default: return (
      <div className="sr-cols">
        <div className="sr-card sr-chat">
          <h3>Chat (the cheaper alternative: no card shown)</h3>
          <div className="sr-msg"><b>Bo</b>you keep pulling line 4, what do you want?</div>
          <div className="sr-msg" data-mine=""><b>You</b>{ADA.family.card(ADA.params, ADA.tieBreaker ?? null)}</div>
          <span><span className="sr-btn" data-quiet="">My rule in one sentence</span> <span className="sr-btn" data-quiet="">What I want on this line</span></span>
          <p className="sr-muted">The button pastes your card's sentence into the message box; you choose whether to send it, and you can edit it (or say something else). Bo cannot check it.</p>
        </div>
        <div className="sr-card">
          <h3>What Bo sees</h3>
          <p>Words only: no ● chain on his lines, no "for you: N bits", no "what suits you both". He has to trust and work it out.</p>
        </div>
      </div>
    );
  }
}

const fmt = (v: (u: Score) => number, r: RuleRef<LineState, unknown>, s: LineState) => bitsOf(r, v, s).toFixed(2);

const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div data-v2v-scheme={params.get("scheme") === "dark" ? "dark" : "light"}><div className="v2v sr-page">
      <Banner />
      <h1>Sharing rules: {({ show: "show my card", received: "a card shown to you", suits: "what suits us both", propose: "propose, accept, hold", sentence: "the cheaper alternative" } as Record<string, string>)[params.get("frame") ?? "sentence"] ?? ""}</h1>
      <Frame f={params.get("frame") ?? "sentence"} />
    </div></div>
  </StrictMode>,
);
