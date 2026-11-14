/**
 * The object faces (integration plan §3.3): the compact face (the rule's primary representation, its marks, the step and
 * ✨ rarity), the parts list, the ladder ("steps to the top"), the representation switcher and the expanded face (every
 * representation the rule depends on, side by side on a wide card and as tabs on a narrow one, cross-highlighted by
 * meaning; the parts, the worked computation, the ladder and the nearest improvement).
 *
 * Player words only: points, ✨ rarity, ⚡ energy, "main part", "tie-breaker", "step n of N", the noun "line".
 */
import { useMemo, useState, type ReactElement } from "react";
import { representation, type ElementRef, type Mark, type ObjectType } from "@workspace/v2-core";
import { annotate, type Annotation, type Part, type RuleRef } from "./annotate.ts";
import { fmtRarity } from "./format.ts";
import { nearestImprovement, type Improvement } from "./improve.ts";
import { markRefs } from "./refs.ts";
import { ObjectChip, RepView } from "./rep-view.tsx";
import { key } from "./render/common.tsx";

/** "step 5 of 8" (or "5/8" short), or "not scoring". */
export function levelText(a: Annotation, short = false): string {
  if (a.score === null) return "not scoring";
  return short ? `${a.level}/${a.top}` : `step ${a.level} of ${a.top}`;
}

// ------------------------------------------------------------------ compact face

export interface CompactFaceProps<S, P> {
  readonly rule: RuleRef<S, P>;
  readonly state: S;
  /** Precomputed annotation (the caller may share it with other views); computed when absent. */
  readonly annotation?: Annotation;
  /** A representation the viewer pinned instead of the rule's primary. */
  readonly rep?: string;
  readonly site?: number;
  readonly before?: S;
}

/** The rule's primary representation at 160 × 100 with its marks, and "✨ 3.4 · step 5 of 8" beneath. */
export function CompactFace<S, P>(props: CompactFaceProps<S, P>): ReactElement {
  const a = props.annotation ?? annotate(props.rule, props.state);
  const site = props.site ?? 0;
  const e = a.sites[site]!.evaluation;
  const rep = props.rep ?? props.rule.family.primary;
  return (
    <div className="v2v v2v-compact-face" data-level={a.level}>
      <RepView type={props.rule.type} state={props.state} rep={rep} size="compact" site={site} marks={e.marks} terms={e.terms} before={props.before} />
      <div className="v2v-face-foot">
        {a.rarity !== null && <span className="v2v-rarity">{fmtRarity(a.rarity)}</span>}
        <span className="v2v-step" data-worst={a.score === null ? "" : undefined} title={a.worst ?? undefined}>{levelText(a, true)}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ parts list

export interface PartsListProps {
  readonly parts: readonly Part[];
  /** The part whose marks are lit (by index), or null. */
  readonly active: number | null;
  readonly onActive?: (i: number | null) => void;
}

/** One box per part: its name, its sentence, its step on its own ladder and the next step. */
export function PartsList({ parts, active, onActive }: PartsListProps): ReactElement {
  return (
    <ol className="v2v-parts">
      {parts.map((p, i) => (
        <li key={p.term} className="v2v-part" data-active={active === i ? "" : undefined} data-top={p.rung !== null && p.rung === p.rungs ? "" : undefined}
          tabIndex={0} onMouseEnter={() => onActive?.(i)} onMouseLeave={() => onActive?.(null)} onFocus={() => onActive?.(i)} onBlur={() => onActive?.(null)}>
          <div className="v2v-part-head">
            <span className="v2v-part-name">{p.name}</span>
            {p.rung !== null && <span className="v2v-part-step">step {p.rung} of {p.rungs}</span>}
          </div>
          <div className="v2v-part-sentence">{p.sentence}</div>
          {p.rung !== null && (
            <div className="v2v-part-rung">
              {p.rungLabel ? <span>✓ {p.rungLabel}</span> : <span>not on the first step yet</span>}
              {p.nextLabel && <span className="v2v-part-next">next: {p.nextLabel}</span>}
            </div>
          )}
          {p.rung !== null && p.rungs !== null && <Pips n={p.rungs} at={p.rung} />}
        </li>
      ))}
    </ol>
  );
}

function Pips({ n, at }: { n: number; at: number }) {
  return (
    <span className="v2v-pips" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} data-on={i < at ? "" : undefined} />)}
    </span>
  );
}

// ------------------------------------------------------------------ ladder

export interface LadderViewProps {
  readonly annotation: Annotation;
  /** ✨ rarity per rung (index = level), when the rule's artefact is known. */
  readonly rarities?: readonly number[];
}

/** "Steps to the top": every rung of the rule's ladder, the one reached marked, with ✨ rarity per step when known. */
export function LadderView({ annotation: a, rarities }: LadderViewProps): ReactElement {
  const rungs = a.ladder.slice(1).map((r, i) => ({ level: i + 1, label: r.label })).reverse();
  return (
    <div className="v2v-ladder">
      <div className="v2v-ladder-title">Steps to the top</div>
      <ol>
        {rungs.map(r => (
          <li key={r.level} data-reached={r.level <= a.level ? "" : undefined} data-here={r.level === a.level ? "" : undefined}>
            <span className="v2v-ladder-n">{r.level}</span>
            <span className="v2v-ladder-label">{r.label}</span>
            {rarities?.[r.level] !== undefined && <span className="v2v-rarity">{fmtRarity(rarities[r.level]!)}</span>}
            {r.level === a.level && <span className="v2v-ladder-here">this line</span>}
          </li>
        ))}
      </ol>
      {rarities && <p className="v2v-ladder-note">Each step up is rarer among random lines; rarer is worth more to you.</p>}
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

/** Tabs of every representation of the object type, the rule's own marked; "compare" pins a second one beside. */
export function RepSwitcher<S>(p: RepSwitcherProps<S>): ReactElement {
  return (
    <div className="v2v-switcher">
      <div className="v2v-tabs" role="tablist" aria-label="Ways to see this line">
        {p.type.representations.map(r => (
          <button key={r.id} type="button" role="tab" aria-selected={p.active === r.id} className="v2v-tab"
            data-depends={p.depends.includes(r.id) ? "" : undefined} data-primary={p.primary === r.id ? "" : undefined}
            title={r.title + (p.depends.includes(r.id) ? " (your rule reads this)" : "")} onClick={() => p.onActive(r.id)}>
            {shortTitle(r.title)}
          </button>
        ))}
      </div>
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

/** "slope-intercept: y = mx + c" → "slope-intercept"; "the line on the plane" → "the line on the plane". */
export const shortTitle = (t: string): string => t.split(":")[0]!.replace(/^the /, "").trim();

// ------------------------------------------------------------------ expanded face

export interface ExpandedFaceProps<S, P> {
  readonly rule: RuleRef<S, P>;
  readonly state: S;
  readonly site?: number;
  readonly before?: S;
  /** ✨ rarity per rung of the rule's ladder. */
  readonly rarities?: readonly number[];
  /** Show the nearest improvement (the viewer's own rule only). Default true. */
  readonly improvement?: boolean;
  /** The representation open first on a narrow card (default: the rule's primary). */
  readonly initialRep?: string;
}

export function ExpandedFace<S, P>(props: ExpandedFaceProps<S, P>): ReactElement {
  const { rule, state } = props;
  const site = props.site ?? 0;
  const a = useMemo(() => annotate(rule, state, { rarities: props.rarities }), [rule, state, props.rarities]);
  const imp: Improvement | null = useMemo(
    () => (props.improvement === false || a.level === a.top ? null : nearestImprovement(rule, state)),
    [rule, state, props.improvement, a.level, a.top],
  );
  const sa = a.sites[site]!;
  const e = sa.evaluation;
  const depends = rule.family.depends;
  const [active, setActive] = useState(props.initialRep ?? rule.family.primary);
  const [compare, setCompare] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [activePart, setActivePart] = useState<number | null>(null);
  const [hoverPart, setHoverPart] = useState<number | null>(null);

  // Pointing at an element lights its meaning everywhere and the part whose marks cite it.
  const onHover = (meaning: string | null, r: ElementRef | null) => {
    setHl(meaning);
    if (!r) { setHoverPart(null); return; }
    const k = key(r);
    const i = sa.parts.findIndex(p => p.marks.some(m => markRefs(m).some(x => key(x) === k)));
    setHoverPart(i >= 0 ? i : null);
  };
  // Indexes from an earlier line may outlive a change of line: ignore any past this line's parts.
  const part = (i: number | null) => (i !== null && i < sa.parts.length ? i : null);
  const lit = part(activePart) ?? part(hoverPart);
  const ap = part(activePart);
  const marks: readonly Mark[] = ap === null ? e.marks : sa.parts[ap]!.marks;

  const panels = [...new Set([...depends, active, ...(compare ? [compare] : [])])];
  const title = (id: string) => shortTitle(representation(rule.type, id).title);

  return (
    <div className="v2v v2v-expanded" data-level={a.level}>
      <header className="v2v-exp-head">
        <ObjectChip type={rule.type} state={state} />
        <span className="v2v-exp-level" data-worst={a.score === null ? "" : undefined}>
          {a.rarity !== null && <span className="v2v-rarity">{fmtRarity(a.rarity)}</span>} {levelText(a)}
        </span>
      </header>
      {a.worst && <p className="v2v-worst">This line does not score for your rule: {a.worst}.</p>}

      <RepSwitcher type={rule.type} depends={depends} primary={rule.family.primary} active={active} compare={compare} onActive={setActive} onCompare={setCompare} />
      <div className="v2v-panels" data-compare={compare ? "" : undefined}>
        {panels.map(id => (
          <section key={id} className="v2v-panel" data-active={id === active ? "" : undefined} data-compare={id === compare ? "" : undefined}
            data-depends={depends.includes(id) ? "" : undefined} aria-label={title(id)}>
            <h4 className="v2v-panel-title">
              {title(id)}
              {id === rule.family.primary && <span className="v2v-panel-tag">your rule's main view</span>}
              {!depends.includes(id) && <span className="v2v-panel-tag" data-other="">not read by your rule</span>}
            </h4>
            <RepView type={rule.type} state={state} rep={id} size="expanded" site={site} marks={marks} terms={e.terms}
              before={props.before} highlight={hl} onHover={onHover} />
          </section>
        ))}
      </div>

      <div className="v2v-exp-body">
        <PartsList parts={sa.parts} active={lit} onActive={setActivePart} />
        <details className="v2v-working">
          <summary>How it was worked out</summary>
          <ul>{sa.working.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
        {imp && (
          <p className="v2v-next" data-kind={imp.kind}>
            <span className="v2v-next-label">{imp.kind === "level" ? "Next step" : "Closer"}:</span> {imp.sentence}
          </p>
        )}
        {a.level === a.top && <p className="v2v-next" data-kind="top">This line is at the top of your ladder.</p>}
        <LadderView annotation={a} rarities={props.rarities} />
      </div>
    </div>
  );
}
