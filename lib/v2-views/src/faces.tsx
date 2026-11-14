/**
 * The object faces (integration plan §3.3; docs/engine-v2/annotations-design.md; owner decision 23): the compact face
 * (the rule's primary representation, its marks, the bits and one line per part), the contributor cards (each part's
 * source, reference and distance on a ruler), the moves that would make the object rarer with their prices and new
 * bits, the representation switcher (the rule's views first) and the expanded face.
 *
 * Player words only: points, rarity in bits (each bit = twice as rare) with "1 in N by chance", ⚡ energy, "main part",
 * "tie-breaker", and the game's own noun ("line", "grid"), never "object". No steps and no thresholds.
 */
import type { Contributor } from "./contributors.ts";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { representation, type ElementRef, type Mark, type ObjectType, type Score } from "@workspace/v2-core";
import { annotate, type Annotation, type Part, type RuleRef } from "./annotate.ts";
import { BITS_HELP, chanceText, fmtBits, fmtEnergy, fmtNum, pointsText, scoreFormula } from "./format.ts";
import { moves, type Move } from "./moves.ts";
import { markRefs, nounOf } from "./refs.ts";
import { ObjectChip, RepView } from "./rep-view.tsx";
import { key } from "./render/common.tsx";

/** The elements each part reads, for the views' identity badges. */
const rolesOf = (parts: readonly Contributor[]) => parts.flatMap(p => p.source.map(s => ({ ref: s.ref, role: p.role })));

export const GLYPH = { main: "●", tb: "◆" } as const;

/** "2.13 bits (1 in 4.4 by chance)", or "not scoring"; empty without the rule's value function. */
export function bitsLine(a: Annotation): string {
  if (a.score === null) return "not scoring";
  return a.bits === null ? "" : `${fmtBits(a.bits)} (${chanceText(a.bits)} by chance)`;
}

/** One part in one line: "● y-intercept 25 · 2 above 23" / "◆ that prime 23". */
export function partLine(p: Contributor): string {
  const g = GLYPH[p.role];
  const said = p.source.filter(x => x.text);
  if (p.distance && said.length) return `${g} ${p.source.length > 3 ? p.title : said.map(x => `${x.label} ${x.text}`).join(", ")} · ${p.distance}`;
  return `${g} ${p.title}: ${p.valueText}`;
}

/** The main part's one line, without its glyph (the Lines row's "Why?"). */
export function mainLine<S, P>(_rule: RuleRef<S, P>, _state: S, a: Annotation, site = 0): string {
  const p = a.sites[site]?.parts[0];
  return p ? partLine(p).slice(2) : "";
}

// ------------------------------------------------------------------ compact face

export interface CompactFaceProps<S, P> {
  readonly rule: RuleRef<S, P>;
  readonly state: S;
  /** Precomputed annotation (the caller may share it with other views); computed when absent. */
  readonly annotation?: Annotation;
  /** The rule's value function (bits of a utility); without it no bits are shown and moves rank by utility. */
  readonly value?: (u: Score) => number;
  /** A representation the viewer pinned instead of the rule's primary. */
  readonly rep?: string;
  readonly site?: number;
  readonly before?: S;
  /** The cheapest move that makes the object rarer, drawn as a hint: true computes it here (own rule only), or pass one. */
  readonly next?: boolean | Move<S> | null;
}

/** The rule's primary representation at 160 × 100 with its marks, the bits, one line per part, and the next move. */
export function CompactFace<S, P>(props: CompactFaceProps<S, P>): ReactElement {
  const a = props.annotation ?? annotate(props.rule, props.state, { value: props.value });
  const site = props.site ?? 0;
  const e = a.sites[site]!.evaluation;
  const parts = a.sites[site]!.parts;
  const rep = props.rep ?? props.rule.family.main.rep;
  const next = useMemo(
    () => (props.next === true ? (a.score === null && !props.value ? null : moves(props.rule, props.state, props.value, { k: 1 })[0] ?? null) : props.next || null),
    [props.next, props.rule, props.state, props.value, a.score],
  );
  const bits = bitsLine(a);
  return (
    <div className="v2v v2v-compact-face" data-scoring={a.score === null ? undefined : ""}>
      <RepView type={props.rule.type} state={props.state} rep={rep} size="compact" site={site} marks={e.marks} terms={e.terms} roles={rolesOf(parts)}
        before={props.before} next={next ? next.after : undefined} />
      {bits && <div className="v2v-face-foot"><span className="v2v-rarity" data-worst={a.score === null ? "" : undefined} title={BITS_HELP}>{bits}</span></div>}
      {a.worst
        ? <div className="v2v-face-why">{a.worst}</div>
        : parts.map(p => <div key={p.term} className="v2v-face-part" data-role={p.role} title={p.sentence}>{partLine(p)}</div>)}
      {next && <div className="v2v-face-next" title={next.words}>next: {next.words}{next.bits !== null ? ` → ${fmtBits(next.bits)}` : ""}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ ruler

/** A part's quantity on a magnified number line: the value, its reference (strong) and the reference's kind's neighbours. */
export function RulerView({ part, width = 300 }: { part: Part; width?: number }): ReactElement | null {
  const r = part.ruler;
  if (!r) return null;
  const xs = [r.value, ...r.refs.map(x => x.at)];
  let lo = Math.min(...xs), hi = Math.max(...xs);
  const span = Math.max(hi - lo, 2);
  lo -= span * 0.08; hi += span * 0.08;
  const W = width, H = 50, pad = 12, Y = 26;
  const X = (v: number) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  const label = `${GLYPH[part.role]} ${r.valueText}`, lw = label.length * 6.2;
  // Labels of the references, thinned where they would collide (the strong one always kept).
  const shown: { at: number; label: string; strong?: boolean }[] = [];
  for (const ref of [...r.refs].sort((a, b) => Number(!!b.strong) - Number(!!a.strong))) {
    if (shown.some(s => Math.abs(X(s.at) - X(ref.at)) < Math.max(s.label.length, ref.label.length) * 6.2 + 4)) continue;
    shown.push(ref);
  }
  return (
    <svg className="v2v-ruler" data-role={part.role} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${r.valueText}; ${r.refs.filter(x => x.strong).map(x => x.label).join(", ")}${part.distance ? `: ${part.distance}` : ""}`}>
      <line className="v2v-ruler-axis" x1={pad} x2={W - pad} y1={Y} y2={Y} />
      {r.refs.map(ref => <line key={ref.at} className="v2v-ruler-ref" data-strong={ref.strong ? "" : undefined} x1={X(ref.at)} x2={X(ref.at)} y1={Y - 7} y2={Y + 7} />)}
      {shown.map(ref => <text key={ref.at} className="v2v-ruler-label" data-strong={ref.strong ? "" : undefined} x={X(ref.at)} y={Y + 19} textAnchor="middle">{ref.label}</text>)}
      <circle className="v2v-ruler-value" cx={X(r.value)} cy={Y} r={4.5} />
      <text className="v2v-ruler-label" data-value="" x={Math.min(W - lw / 2 - 2, Math.max(lw / 2 + 2, X(r.value)))} y={Y - 10} textAnchor="middle">{label}</text>
    </svg>
  );
}

// ------------------------------------------------------------------ contributor cards

export interface PartsListProps {
  readonly parts: readonly Part[];
  /** The part whose marks are lit (by index), or null. */
  readonly active: number | null;
  readonly onActive?: (i: number | null) => void;
  /** A tapped part stays selected until tapped again or cleared. */
  readonly onSelect?: (i: number | null) => void;
  readonly selected?: number | null;
}

/** One card per part: what the rule wants, the part's quantity on its ruler, and what is better. Tap selects. */
export function PartsList({ parts, active, onActive, onSelect, selected }: PartsListProps): ReactElement {
  return (
    <ol className="v2v-parts">
      {parts.map((p, i) => (
        <li key={p.term} className="v2v-part" data-role={p.role} data-active={active === i ? "" : undefined} data-selected={selected === i ? "" : undefined}
          tabIndex={0} aria-pressed={selected === i} role="button"
          onMouseEnter={() => onActive?.(i)} onMouseLeave={() => onActive?.(null)} onFocus={() => onActive?.(i)} onBlur={() => onActive?.(null)}
          onClick={() => onSelect?.(selected === i ? null : i)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(selected === i ? null : i); } else if (e.key === "Escape") onSelect?.(null); }}>
          <div className="v2v-part-head">
            <span className="v2v-part-name">{GLYPH[p.role]} {p.name === "main part" ? "Main part" : "Tie-breaker"}: {p.title}</span>
            <span className="v2v-part-aim">{p.aim}</span>
          </div>
          <div className="v2v-part-sentence">{p.sentence}</div>
          {p.units.length > 0 && p.units.length <= 9 && <div className="v2v-part-units">{p.units.map(u => `${u.label}: ${u.text}`).join(" · ")}</div>}
          <RulerView part={p} />
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ moves

/** The moves that would make the object rarer: words, price, what they change, new bits. */
/** A move's result is written after it when short (a line's equation); a board's sixteen digits are left to its changes. */
const RESULT_MAX = 28;
const cap1 = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/**
 * The others' total bits at a candidate (playtest round 8: the sum over every other player, never one player's rule),
 * read by the app from the server; null while it loads. `taken` names the object that already holds a candidate's
 * state: objects are unique, so that move is not available.
 */
export interface OthersAt<S> {
  /** Their total now. */
  readonly now: number | null;
  readonly at: (after: S) => number | null;
  /** Live, with the others' numbers blurred (peerNoiseBits): the points are estimates, written with "about" and ≈. */
  readonly approx?: boolean;
  readonly taken?: (after: S) => number | null;
}

export interface MovesListProps<S> {
  readonly list: readonly Move<S>[];
  readonly noun: string;
  /** Your bits now (the points now, and the candidates that raise both). */
  readonly bits?: number | null;
  /** With the others' totals, each candidate shows the points it would earn, and the list climbs: best for points first. */
  readonly others?: OthersAt<S>;
}

type Order = "points" | "rarity";
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmtNum(Math.abs(n))}`;

/**
 * The candidate moves from here (owner, 14 November: agents are hill climbers; every strategy is incremental climbing
 * towards a state that pays both sides). With the others' totals, each move says the points it would earn and the change
 * from now, the best climb for the points comes first, a move that raises both sides is marked, and "stuck" says when no
 * single move raises the points.
 */
export function MovesList<S>({ list, noun, bits, others }: MovesListProps<S>): ReactElement {
  const [order, setOrder] = useState<Order>("points");
  if (!list.length) return <p className="v2v-next" data-kind="none">No single move makes this {noun} rarer for your rule.</p>;
  // Points are your bits × max(0, the others' total): a blurred total can read below zero (v1 disclosed it unclamped).
  const nowPoints = others?.now != null && bits != null ? bits * Math.max(0, others.now) : null;
  // Live, the others' numbers are blurred (peerNoiseBits): every points figure here is an estimate.
  const about = others?.approx ? "about " : "";
  const rows = list.map((m, i) => {
    const taken = others?.taken?.(m.after) ?? null;
    const theirs = others && taken === null ? others.at(m.after) : null;
    const points = m.bits !== null && theirs !== null ? m.bits * Math.max(0, theirs) : null;
    const both = m.bits !== null && bits != null && theirs !== null && others?.now != null && m.bits > bits && theirs > others.now;
    return { m, i, taken, theirs, points, both };
  });
  const rank = (r: (typeof rows)[number]) => (r.taken !== null ? -2 : order === "points" ? r.points ?? -1 : r.m.bits ?? -1);
  const sorted = others ? [...rows].sort((a, b) => rank(b) - rank(a) || a.i - b.i) : rows;
  // The climb is about points whichever order the list is in: the available move with the most points.
  const best = rows.filter(r => r.taken === null && r.points !== null).sort((a, b) => b.points! - a.points! || a.i - b.i)[0];
  const climbs = best && nowPoints !== null && best.points! > nowPoints + 1e-9;
  return (
    <div className="v2v-moves">
      <h4 className="v2v-moves-title">What would make it rarer</h4>
      {others && (
        <div className="v2v-move-order" role="group" aria-label="Order the moves">
          {(["points", "rarity"] as const).map(o => (
            <button key={o} type="button" aria-pressed={order === o} data-testid={`button-order-${o}`} onClick={() => setOrder(o)}>
              {o === "points" ? "Best for points" : "Best for my rarity"}
            </button>
          ))}
          {others.now !== null && <span className="v2v-move-now">The others now: {others.approx ? "about " : ""}{fmtBits(others.now)} together</span>}
        </div>
      )}
      {others && nowPoints !== null && best && (climbs
        ? <p className="v2v-climb" data-testid="text-climb">The climb from here: “{best.m.words}” takes your points from {about}{pointsText(nowPoints)} to {about}{pointsText(best.points!)}{best.both ? ", and raises the others' bits too" : ""}.</p>
        : <p className="v2v-climb" data-testid="text-climb" data-kind="stuck">Stuck here: no single move raises your points above {about}{pointsText(nowPoints)}. Each move by the others changes the landscape: look again after they move.</p>)}
      <ol>
        {sorted.map(({ m, i, taken, theirs, points, both }) => (
          <li key={i} className="v2v-move-option" data-first={i === 0 ? "" : undefined} data-both={both ? "" : undefined}
            data-unavailable={taken !== null ? "" : undefined} {...(points !== null ? { "data-points": String(points) } : {})}>
            <span className="v2v-move-words">{m.words[0]!.toUpperCase() + m.words.slice(1)}{!m.words.includes(m.text) && m.text.length <= RESULT_MAX && <span className="v2v-move-result"> → {m.text}</span>}</span>
            <span className="v2v-move-price">{fmtEnergy(m.price.total)}</span>
            <span className="v2v-move-reason">{cap1(m.reason)}{both && <b className="v2v-move-both" title="More bits for you and for the others"> · ↑ both of you</b>}</span>
            <span className="v2v-move-changes">{m.changes.join(" · ")}</span>
            {taken !== null
              ? <span className="v2v-move-bits" data-testid="text-move-unavailable">Not available: {noun} {taken} is already like this, and no two {noun}s may be the same.</span>
              : m.bits !== null && (others
                ? <span className="v2v-move-bits">→ {theirs !== null ? scoreFormula(m.bits, theirs, others.approx) : `your ${fmtBits(m.bits)} × others' …`}{points !== null && nowPoints !== null && <b className="v2v-move-delta"> ({about}{signed(points - nowPoints)} from now)</b>}</span>
                : <span className="v2v-move-bits">→ {fmtBits(m.bits)} ({chanceText(m.bits)} by chance)</span>)}
          </li>
        ))}
      </ol>
      <p className="v2v-moves-hint">{others
        ? "Points = your bits × the others' bits together. Climb a step at a time: a move marked ↑ both raises them for you and for the others, so nobody has a reason to undo it."
        : "The first is drawn dashed in the views that can show it. Tell your assistant the words, or let your agent find it."}</p>
    </div>
  );
}

// ------------------------------------------------------------------ switcher

export interface RepSwitcherProps<S> {
  readonly type: ObjectType<S>;
  readonly depends: readonly string[];
  readonly primary: string;
  readonly active: string;
  readonly compare: string | null;
  readonly onActive: (rep: string) => void;
  readonly onCompare: (rep: string | null) => void;
}

/** The rule's own views as tabs (its main view first, ★); every other view under "More views"; "compare" adds one beside. */
export function RepSwitcher<S>(p: RepSwitcherProps<S>): ReactElement {
  const reads = [p.primary, ...p.depends.filter(d => d !== p.primary)];
  const others = p.type.representations.filter(r => !reads.includes(r.id));
  return (
    <div className="v2v-switcher">
      <div className="v2v-tabs" role="tablist" aria-label={`Ways to see this ${nounOf(p.type)}`}>
        {reads.map(id => {
          const r = representation(p.type, id);
          return (
            <button key={id} type="button" role="tab" aria-selected={p.active === id} className="v2v-tab" data-depends="" data-primary={p.primary === id ? "" : undefined}
              title={`${r.title} (your rule reads this)`} onClick={() => p.onActive(id)}>{shortTitle(r.title)}</button>
          );
        })}
        {others.some(r => r.id === p.active) && (
          <button type="button" role="tab" aria-selected className="v2v-tab">{shortTitle(representation(p.type, p.active).title)}</button>
        )}
      </div>
      {others.length > 0 && (
        <label className="v2v-compare">
          More views{" "}
          <select value={others.some(r => r.id === p.active) ? p.active : ""} onChange={e => e.target.value && p.onActive(e.target.value)}>
            <option value="">▾</option>
            {others.map(r => <option key={r.id} value={r.id}>{shortTitle(r.title)}</option>)}
          </select>
        </label>
      )}
      <label className="v2v-compare">
        Compare with{" "}
        <select value={p.compare ?? ""} onChange={e => p.onCompare(e.target.value || null)}>
          <option value="">nothing</option>
          {p.type.representations.filter(r => r.id !== p.active).map(r => <option key={r.id} value={r.id}>{shortTitle(r.title)}</option>)}
        </select>
      </label>
    </div>
  );
}

/** "slope-intercept: y = mx + c" → "slope-intercept"; "the line on the plane" → "line on the plane". */
export const shortTitle = (t: string): string => t.split(":")[0]!.replace(/^the /, "").trim();

// ------------------------------------------------------------------ expanded face

export interface ExpandedFaceProps<S, P> {
  readonly rule: RuleRef<S, P>;
  readonly state: S;
  readonly site?: number;
  readonly before?: S;
  /** The rule's value function (bits of a utility), built once from its record with v2-valuation's valueLookup. */
  readonly value?: (u: Score) => number;
  /** Show the moves that would make it rarer (the viewer's own rule only). Default true. */
  readonly improvement?: boolean;
  /** The representation open first on a narrow card (default: the rule's primary). */
  readonly initialRep?: string;
  /**
   * A controlled switcher (the app keeps it in the human's view state, so an assistant can switch it for them): the
   * representation shown and the one compared beside it. Each falls back to the face's own state when absent.
   */
  readonly active?: string;
  readonly compare?: string | null;
  readonly onActive?: (rep: string) => void;
  readonly onCompare?: (rep: string | null) => void;
  /** The others' total bits now and at each candidate: the candidates then show points and climb by them. */
  readonly others?: OthersAt<S>;
  /** What happened on the object lately (the app's ClimbHistory), shown under the moves. */
  readonly climb?: ReactNode;
  /** The candidates, when the app computed them already (to read the others' totals at them); else the face finds them. */
  readonly moves?: readonly Move<S>[];
}

export function ExpandedFace<S, P>(props: ExpandedFaceProps<S, P>): ReactElement {
  const { rule, state } = props;
  const site = props.site ?? 0;
  const a = useMemo(() => annotate(rule, state, { value: props.value }), [rule, state, props.value]);
  const list = useMemo(
    () => (props.improvement === false ? [] : props.moves ?? moves(rule, state, props.value, { k: props.others ? 4 : 3 })),
    [rule, state, props.improvement, props.value, !!props.others, props.moves],
  );
  const sa = a.sites[site]!;
  const e = sa.evaluation;
  const depends = rule.family.depends;
  const [ownActive, setOwnActive] = useState(props.initialRep ?? rule.family.main.rep);
  const [ownCompare, setOwnCompare] = useState<string | null>(null);
  const active = props.active ?? ownActive;
  const compare = props.compare !== undefined ? props.compare : ownCompare;
  const setActive = (rep: string) => { setOwnActive(rep); props.onActive?.(rep); };
  const setCompare = (rep: string | null) => { setOwnCompare(rep); props.onCompare?.(rep); };
  const [hl, setHl] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverPart, setHoverPart] = useState<number | null>(null);

  // Pointing at an element lights its meaning everywhere and the part whose marks cite it.
  const onHover = (meaning: string | null, r: ElementRef | null) => {
    setHl(meaning);
    if (!r) { setHoverPart(null); return; }
    const k = key(r);
    const i = sa.parts.findIndex(p => p.marks.some(m => markRefs(m).some(x => key(x) === k)));
    setHoverPart(i >= 0 ? i : null);
  };
  // Indexes from an earlier object may outlive a change of object: ignore any past this one's parts.
  const part = (i: number | null) => (i !== null && i < sa.parts.length ? i : null);
  const sel = part(selected);
  const lit = sel ?? part(hoverPart);
  const marks: readonly Mark[] = sel === null ? e.marks : sa.parts[sel]!.marks;

  // The rule's own views side by side (the primary first), the active one and the compared one.
  const panels = [...new Set([rule.family.main.rep, ...depends, active, ...(compare ? [compare] : [])])];
  const title = (id: string) => shortTitle(representation(rule.type, id).title);
  const bits = bitsLine(a);
  const first = list[0];

  return (
    <div className="v2v v2v-expanded" data-scoring={a.score === null ? undefined : ""}>
      <header className="v2v-exp-head">
        <ObjectChip type={rule.type} state={state} />
        {bits && <span className="v2v-exp-level" data-worst={a.score === null ? "" : undefined} title={BITS_HELP}>{bits}</span>}
      </header>
      {a.worst && <p className="v2v-worst">This {a.noun} does not score for your rule: {a.worst}.</p>}
      {sel !== null && (
        <p className="v2v-selchip" data-role={sa.parts[sel]!.role}>
          {GLYPH[sa.parts[sel]!.role]} {sa.parts[sel]!.name} selected: only its marks are drawn{" "}
          <button type="button" aria-label="Clear the selection" onClick={() => setSelected(null)}>✕</button>
        </p>
      )}

      <RepSwitcher type={rule.type} depends={depends} primary={rule.family.main.rep} active={active} compare={compare} onActive={setActive} onCompare={setCompare} />
      <div className="v2v-panels" data-compare={compare ? "" : undefined}>
        {panels.map(id => (
          <section key={id} className="v2v-panel" data-active={id === active ? "" : undefined} data-compare={id === compare ? "" : undefined}
            data-depends={depends.includes(id) || id === rule.family.main.rep ? "" : undefined} aria-label={title(id)}>
            <h4 className="v2v-panel-title">
              {title(id)}
              {id === rule.family.main.rep && <span className="v2v-panel-tag">your rule's main view</span>}
              {!depends.includes(id) && id !== rule.family.main.rep && <span className="v2v-panel-tag" data-other="">not read by your rule</span>}
            </h4>
            <RepView type={rule.type} state={state} rep={id} size="expanded" site={site} marks={marks} terms={e.terms}
              roles={rolesOf(sel === null ? sa.parts : [sa.parts[sel]!])}
              before={props.before} next={first?.after} highlight={hl} onHover={onHover} />
          </section>
        ))}
      </div>

      <div className="v2v-exp-body">
        <PartsList parts={sa.parts} active={lit} onActive={setHoverPart} selected={sel} onSelect={setSelected} />
        {sa.parts.length > 1 && <p className="v2v-combine">The main part counts first; {`the tie-breaker decides between ${a.noun}s that are equally good on the main part.`}</p>}
        {props.improvement !== false && (props.climb
          ? <div className="v2v-moves-col"><MovesList list={list} noun={a.noun} bits={a.bits} others={props.others} />{props.climb}</div>
          : <MovesList list={list} noun={a.noun} bits={a.bits} others={props.others} />)}
        <details className="v2v-working">
          <summary>How it was worked out</summary>
          <ul>{sa.working.map((w, i) => <li key={i}>{w}</li>)}</ul>
          {a.bits !== null && <p>{`${fmtBits(a.bits)}: only ${chanceText(a.bits)} random ${a.noun}s are at least this good on both parts. ${BITS_HELP}`}</p>}
        </details>
      </div>
    </div>
  );
}
