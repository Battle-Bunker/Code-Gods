/**
 * The object faces (integration plan §3.3; docs/engine-v2/annotations-design.md; owner decision 23): the compact face
 * (the rule's primary representation, its marks, the bits and one line per part), the contributor cards (each part's
 * source, reference and distance on a ruler), the moves that would make the object rarer with their prices and new
 * bits, the representation switcher (the rule's views first) and the expanded face.
 *
 * Player words only: points, rarity in bits (each bit = twice as rare) with "1 in N by chance", energy, "main part",
 * "tie-breaker", and the game's own noun ("line", "grid"), never "object". No steps and no thresholds.
 */
import { rovingIndex } from "./roving-keys.ts";
import { partGlyph, type Contributor } from "./contributors.ts";
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
/** Each part's name, said beside its symbol (a symbol never stands alone for a concept: the owner, 15 Nov). */
export const PART_NAME = { main: "main part", tb: "secondary preference" } as const;
/** A move that raises the bits for you and for the others: its one name, everywhere. */
export const GOOD_FOR_BOTH = "good for both";

/** "2.13 bits (1 in 4.4 by chance)", or "not scoring"; empty without the rule's value function. */
export function bitsLine(a: Annotation): string {
  if (a.score === null) return "not scoring";
  return a.bits === null ? "" : `${fmtBits(a.bits)} of energy`;
}

/** One part in one line: "● main part: y-intercept 25 · 2 above 23" / "◆ tie-breaker: that prime 23". */
export function partLine(p: Contributor): string {
  const g = `${partGlyph(p.depth)} ${p.name}:`;
  if (p.brief) return `${g} ${p.brief}`;
  const said = p.source.filter(x => x.text);
  const what = p.source.length > 3 ? p.title : said.map(x => `${x.label} ${x.text}`).join(", ");
  // A distance that already names what was read ("y-intercept 32 is nearest 31; …") is said once.
  if (p.distance && said.length) return p.distance.startsWith(what) ? `${g} ${p.distance}` : `${g} ${what} · ${p.distance}`;
  return `${g} ${p.title}: ${p.valueText}`;
}

/** The main part's one line, without its glyph (the Lines row's "Why?"). */
export function mainLine<S, P>(_rule: RuleRef<S, P>, _state: S, a: Annotation, site = 0): string {
  const p = a.sites[site]?.parts[0];
  return p ? partLine(p).replace(/^\S+ [^:]+: /, "") : "";
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
  /** When the object does not score (a vertical line, for a rule that reads its y-intercept): "To score: <the move>".
   *  On by default (playtest round 12: a rule that does not score says what would); false to leave it out. */
  readonly toScore?: boolean;
}

/** The rule's primary representation at 160 × 100 with its marks, the bits, one line per part, and the next move. */
export function CompactFace<S, P>(props: CompactFaceProps<S, P>): ReactElement {
  const a = props.annotation ?? annotate(props.rule, props.state, { value: props.value });
  const site = props.site ?? 0;
  const e = a.sites[site]!.evaluation;
  const parts = a.sites[site]!.parts;
  const rep = props.rep ?? props.rule.family.main.rep;
  // The next move (asked for), or, not scoring and asked for (`toScore`), the cheapest move that makes it score: one
  // search either way, only when the caller wants a hint.
  const next = useMemo(() => {
    if (props.next !== true && !((props.toScore ?? true) && a.score === null)) return props.next || null;
    if (a.score === null) return moves(props.rule, props.state, props.value, { k: 1 }).find(m => m.utility !== null) ?? null;
    return props.next === true ? moves(props.rule, props.state, props.value, { k: 1 })[0] ?? null : null;
  }, [props.next, props.toScore, props.rule, props.state, props.value, a.score]);
  const bits = bitsLine(a);
  return (
    <div className="v2v v2v-compact-face" data-scoring={a.score === null ? undefined : ""}>
      <RepView type={props.rule.type} state={props.state} rep={rep} size="compact" site={site} marks={a.sites[site]!.marks} terms={e.terms} roles={rolesOf(parts)} parts={parts}
        before={props.before} next={next ? next.after : undefined} />
      {bits && <div className="v2v-face-foot"><span className="v2v-rarity" data-worst={a.score === null ? "" : undefined} title={BITS_HELP}>{bits}</span></div>}
      {a.worst
        ? <div className="v2v-face-why">{a.worst}</div>
        : parts.map(p => <div key={p.term} className="v2v-face-part" data-role={p.role} title={p.sentence}>{partLine(p)}</div>)}
      {next && <div className="v2v-face-next" title={next.words} data-testid={a.score === null ? "text-to-score" : undefined}>{a.score === null ? "To score" : "next"}: {next.words}{a.score === null && next.text.length <= 28 && !next.words.includes(next.text) ? ` → ${next.text}` : ""}{next.bits !== null ? ` → ${fmtBits(next.bits)}` : ""}</div>}
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
  const label = `${partGlyph(part.depth)} ${r.valueText}`, lw = label.length * 6.2;
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
      <text className="v2v-ruler-label" data-value="" x={Math.min(W - lw / 2 - 2, Math.max(lw / 2 + 2, X(r.value)))} y={Y - 10} textAnchor="middle" aria-label={`${part.name}: ${r.valueText}`}><title>{`${part.name}: ${r.valueText}`}</title>{label}</text>
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
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(selected === i ? null : i); return; }
            if (e.key === "Escape") { onSelect?.(null); return; }
            // v1's GoalBoard: arrows, Home and End move between the scoring parts (focus lights each one's marks).
            const next = rovingIndex(e.key, i, parts.length);
            if (next === null || next === i) return;
            e.preventDefault();
            (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}>
          <div className="v2v-part-head">
            <span className="v2v-part-name">{partGlyph(p.depth)} {p.name[0]!.toUpperCase() + p.name.slice(1)}: {p.title}</span>
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
              {o === "points" ? "Best for points" : "Best for my energy"}
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
            <span className="v2v-move-reason">{cap1(m.reason)}{both && <b className="v2v-move-both" title="More bits for you and for the others"> · {GOOD_FOR_BOTH}</b>}</span>
            <span className="v2v-move-changes">{m.changes.join(" · ")}</span>
            {taken !== null
              ? <span className="v2v-move-bits" data-testid="text-move-unavailable">Not available: {noun} {taken} is already like this, and no two {noun}s may be the same.</span>
              : m.bits !== null && (others
                ? <span className="v2v-move-bits">→ {theirs !== null ? scoreFormula(m.bits, theirs, others.approx) : `your ${fmtBits(m.bits)} × others' …`}{points !== null && nowPoints !== null && <b className="v2v-move-delta"> ({about}{signed(points - nowPoints)} from now)</b>}</span>
                : <span className="v2v-move-bits">→ {fmtBits(m.bits)} of energy</span>)}
          </li>
        ))}
      </ol>
      <p className="v2v-moves-hint">{others
        ? "Points = your bits × the others' bits together. Climb a step at a time: a move marked “good for both” raises them for you and for the others at once. Their agents keep moving too, so the best next step keeps changing."
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

/** The rule's own views as tabs (its main view first, named "main view"); every other view under "More views"; "compare" adds one beside. */
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
              tabIndex={p.active === id || (!reads.includes(p.active) && id === reads[0]) ? 0 : -1}
              title={`${r.title} (your rule reads this)`} onClick={() => p.onActive(id)}
              onKeyDown={e => {
                // v1's explain modes: arrows, Home and End move to the next view and show it (a tab list's keys).
                const next = rovingIndex(e.key, reads.indexOf(id), reads.length);
                if (next === null || reads[next] === id) return;
                e.preventDefault();
                p.onActive(reads[next]!);
                (e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[data-depends]")[next])?.focus();
              }}>{shortTitle(r.title)}{p.primary === id && <span className="v2v-tab-main"> · main view</span>}</button>
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
            <option value="">choose</option>
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
  /**
   * A tree-valued rule's points tree (the server's value.parts): each dealt layer's bits by layer id, in rule order, then
   * "uniqueness" and "defence" corrections; they sum to the bits. Null or absent: the rule is not tree-valued.
   */
  readonly parts?: readonly ValuePart[] | null;
  /**
   * The locks on the object (docs/engine-v2/locks.md): each drawn as marks on the elements its predicate reads (a site-less
   * ref is this face's line) and listed under the parts. Not part of the rule's score. Absent: nothing changes.
   */
  readonly locks?: readonly FaceLock[];
}

/** A lock as the face draws it: its plain words, the elements its predicate reads and, when known, the energy it holds. */
export interface FaceLock { readonly id: string; readonly words: string; readonly refs: readonly ElementRef[]; readonly energy?: number }

/** A lock's marks on one site: a focus on each element it reads there and its words as a note on the first. */
export function lockMarks(locks: readonly FaceLock[], site: number): Mark[] {
  return locks.flatMap(l => {
    const refs = l.refs.filter(r => (r.site ?? site) === site).map(({ site: _site, ...r }) => r);
    if (!refs.length) return [];
    const term = `lock:${l.id}`;
    return [...refs.map(ref => ({ kind: "focus" as const, ref, term })), { kind: "note" as const, ref: refs[0]!, text: `Lock: ${l.words}`, term }];
  });
}

/** A layer's share of the viewer's own bits, or a correction on them (v2/play:object value.parts). */
export interface ValuePart { readonly layer: string; readonly bits: number }

const CORRECTION_WORDS: Record<string, string> = {
  uniqueness: "others holding the same",
  defence: "your defence goal",
};

/**
 * The points as a small tree in the card's words (coordinator, 16 Nov): "● nearest 31: 4.60 bits", "◆ 1 above 31:
 * +5.10 bits", …, "together 9.70 bits". Each layer's line is its part's own few words; a part the face does not know
 * (a layer not dealt here) is named by its id.
 */
export function PointsTree({ parts, of }: { parts: readonly ValuePart[]; of: readonly Part[] }): ReactElement {
  const total = parts.reduce((t, p) => t + p.bits, 0);
  return (
    <div className="v2v-points-tree" data-testid="points-tree">
      <h5>Your points from this, part by part</h5>
      <ul>
        {parts.map((v, i) => {
          const p = of.find(x => x.term === v.layer);
          const words = p ? `${partGlyph(p.depth)} ${p.brief ?? p.distance ?? `${p.title}: ${p.valueText}`}` : CORRECTION_WORDS[v.layer] ?? v.layer;
          return (
            <li key={`${v.layer}${i}`} data-layer={v.layer}>
              <span className="v2v-pt-words">{words}</span>{" "}
              <span className="v2v-pt-bits">{i === 0 ? fmtBits(v.bits) : `${signed(v.bits)} ${Math.abs(Math.round(v.bits * 100) / 100) === 1 ? "bit" : "bits"}`}</span>
            </li>
          );
        })}
      </ul>
      <p className="v2v-pt-total">together {fmtBits(total)}</p>
    </div>
  );
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
  const locked = useMemo(() => lockMarks(props.locks ?? [], site), [props.locks, site]);
  // A part selected draws only its own marks; otherwise the locks' marks join the rule's.
  const marks: readonly Mark[] = sel === null ? (locked.length ? [...sa.marks, ...locked] : sa.marks) : sa.parts[sel]!.marks;

  // The rule's own views side by side (the primary first), the active one and the compared one.
  const panels = [...new Set([rule.family.main.rep, ...depends, active, ...(compare ? [compare] : [])])];
  const title = (id: string) => shortTitle(representation(rule.type, id).title);
  const bits = bitsLine(a);
  const first = list[0];
  // Not scoring: what would make it score, the cheapest such move and its price (playtest round 12: Exact Change said
  // only why not, and its holder had no way forward).
  const toScore = useMemo(
    () => (a.score !== null || props.improvement === false ? null : list.find(m => m.utility !== null) ?? moves(rule, state, props.value, { k: 1 }).find(m => m.utility !== null) ?? null),
    [a.score, list, rule, state, props.value, props.improvement],
  );

  return (
    <div className="v2v v2v-expanded" data-scoring={a.score === null ? undefined : ""}>
      <header className="v2v-exp-head">
        <ObjectChip type={rule.type} state={state} />
        {bits && <span className="v2v-exp-level" data-worst={a.score === null ? "" : undefined} title={BITS_HELP}>{bits}</span>}
      </header>
      {a.worst && (
        <p className="v2v-worst">
          This {a.noun} does not score for your rule: {a.worst}.
          {toScore && <span data-testid="text-to-score"> To score: {toScore.words}{!toScore.words.includes(toScore.text) && toScore.text.length <= 40 ? ` (it becomes ${toScore.text})` : ""}, for {fmtEnergy(toScore.price.total)}.</span>}
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
              roles={rolesOf(sel === null ? sa.parts : [sa.parts[sel]!])} parts={sa.parts}
              before={props.before} next={first?.after} highlight={hl} onHover={onHover} />
          </section>
        ))}
      </div>

      <div className="v2v-exp-body">
        {/* Said beside the parts list, where the tap happened (playtest baseline-3: above the views, on a phone it was
            off-screen and the tester could not find it). */}
        {sel !== null && (
          <p className="v2v-selchip" role="status" data-role={sa.parts[sel]!.role}>
            {partGlyph(sa.parts[sel]!.depth)} {sa.parts[sel]!.name} selected: only its marks are drawn in the views{" "}
            <button type="button" aria-label="Clear the selection" onClick={() => setSelected(null)}>Clear</button>
          </p>
        )}
        <PartsList parts={sa.parts} active={lit} onActive={setHoverPart} selected={sel} onSelect={setSelected} />
        {props.locks && props.locks.length > 0 && (
          <ul className="v2v-locks" aria-label="The locks on it">
            {props.locks.map(l => <li key={l.id} data-lock={l.id}>Lock: {l.words}{l.energy !== undefined ? ` (held by ${fmtEnergy(l.energy)})` : ""}</li>)}
          </ul>
        )}
        {/* Lines' points become the sum of each layer's rarity (the owner's choice, 16 Nov): "counts first" would be false,
            so lines say nothing about how layers combine until the per-layer bits draw the points tree. */}
        {props.parts && props.parts.length > 0 && <PointsTree parts={props.parts} of={sa.parts} />}
        {sa.parts.length > 1 && a.noun !== "line" && !props.parts && <p className="v2v-combine">The main part counts first; {`each preference after it decides only between ${a.noun}s that are equally good on everything before it.`}</p>}
        {props.improvement !== false && (props.climb
          ? <div className="v2v-moves-col"><MovesList list={list} noun={a.noun} bits={a.bits} others={props.others} />{props.climb}</div>
          : <MovesList list={list} noun={a.noun} bits={a.bits} others={props.others} />)}
        <details className="v2v-working">
          <summary>How it was worked out</summary>
          <ul>{sa.working.map((w, i) => <li key={i}>{w}</li>)}</ul>
          {a.bits !== null && <p>{`${fmtBits(a.bits)} of energy. ${BITS_HELP}`}</p>}
        </details>
      </div>
    </div>
  );
}
