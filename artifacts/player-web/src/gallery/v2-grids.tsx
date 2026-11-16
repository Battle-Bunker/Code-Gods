/**
 * The grids part of the engine v2 views gallery (v2.tsx): the grid object type's families and representations, read
 * at run time (a revised pool appears here as it stands).
 *
 * 1. A board without a rule (the view a spectator sees), and every representation of it on its own.
 * 2. A storyboard on the pool's first family: its goal card and act log lines for three moves.
 * 3. Every family on example boards (the best, a middling and a low one from a seeded walk): the chip, the compact face
 *    and the expanded face.
 */
import type { ReactNode } from "react";
import { applyCall, evaluateObject, isInvalid, rng, walkStep, type RuleFamily, type Score } from "@workspace/v2-core";
import { grid4, gridPresets, gridType, type GridState } from "@workspace/v2-grid";
import { pickExamples, valueFor } from "./values";
import { annotate, bitsLine, CompactFace, defaultRep, ExpandedFace, GoalCard, MoveLine, ObjectChip, RepView, type RuleRef } from "@workspace/v2-views";

type Family = RuleFamily<GridState, unknown>;
/** The secondaries a preset deals with this family (its first dealt parameters), or the family's own when none deals it. */
function dealtOf(family: Family): { params: unknown; secondaries: readonly string[] } {
  const r = gridPresets.flatMap(p => p.rules).find(x => x.family === family.id);
  return r ? { params: r.params, secondaries: r.tieBreakers.filter((t): t is string => t !== null) } : { params: family.dealable(grid4)[0], secondaries: family.tieBreakers.map(t => t.id) };
}
/** The family dealt with its k-th dealt secondary (the gallery's example boards take them in turn). */
const ruleOf = (family: Family, k = 0): RuleRef<GridState, unknown> => {
  const d = dealtOf(family);
  return { type: gridType, family, params: d.params, variant: grid4, tieBreaker: d.secondaries.length ? d.secondaries[k % d.secondaries.length]! : null };
};

/** A hand-written board for the board-only views: every representation has something to show on it. */
const SHOWN: GridState = gridType.decode("3113/0480/2222/9003");

/** Boards from a seeded walk: the best, a middling and a low one by the rule's bits (its first tie-breaker's value function). */
function exampleBoards(family: Family): GridState[] {
  const r = rng(`gallery:${family.id}`);
  const rule = ruleOf(family);
  const params = rule.params;
  const value = valueFor(grid4.id, family.id, params, rule.tieBreaker);
  const met: { state: GridState; score: Score }[] = [];
  let s = gridType.origin(grid4);
  for (let i = 0; i < 4000; i++) {
    s = walkStep(gridType, grid4, s, r);
    const score = evaluateObject(gridType, family, params, s, grid4, rule.tieBreaker).score;
    if (score !== null) met.push({ state: s, score });
  }
  const boards = pickExamples(met, value);
  return boards.length ? boards : [SHOWN];
}

/** The board after a call, by a grid mutator (an invalid call leaves it as it was). */
function after(s: GridState, mutator: string, args: Record<string, string>): { state: GridState; what: string } {
  const m = gridType.mutators.find(x => x.id === mutator)!;
  const r = applyCall(gridType, grid4, s, { mutator, site: 0, args });
  return { state: isInvalid(r) ? s : r.result, what: m.describe(m.args(grid4).decode(args)) };
}

function Cell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <figure className="g-cell" data-wide={wide ? "" : undefined}><figcaption>{title}</figcaption>{children}</figure>;
}

function BoardViews() {
  return (
    <>
      <h3>A board without a rule, and every way to see it</h3>
      <p className="g-note">A spectator sees the board itself. Each view below is one representation of the same board.</p>
      <div className="g-dealt-grid" data-grid-views="">
        <Cell title="no rule, compact"><RepView type={gridType} state={SHOWN} rep={defaultRep(gridType)} size="compact" /></Cell>
        {gridType.representations.map(r => (
          <Cell key={r.id} title={r.title}><RepView type={gridType} state={SHOWN} rep={r.id} size="expanded" /></Cell>
        ))}
      </div>
    </>
  );
}

function Storyboard() {
  const rule = ruleOf(gridType.families[0] as Family);
  const m1 = after(SHOWN, "cells.add", { cell: "r0c0", k: "4" });
  const m2 = after(m1.state, "tally.add", { line: "row2", k: "1" });
  const m3 = after(m2.state, "cells.swap", { a: "r1c1", b: "r3c0" });
  return (
    <>
      <h3>On the goal card</h3>
      <GoalCard rule={rule} example={SHOWN} />
      <h3>In the act log</h3>
      <div className="g-log">
        <MoveLine rule={rule} before={SHOWN} after={m1.state} who="Your agent Tally-1" what={m1.what} points={{ before: 3.1, after: 6.4, want: 1.2 }} />
        <MoveLine rule={rule} before={m1.state} after={m2.state} who="Ada's agent" what={m2.what} points={{ before: 6.4, after: 5.2, want: 1.2 }} />
        <MoveLine rule={rule} before={m2.state} after={m3.state} who="Your agent Tally-1" what={m3.what} points={{ before: 5.2, after: 4.8, want: 1.0, wantBefore: 1.2 }} />
      </div>
    </>
  );
}

function FamilySection({ f }: { f: Family }) {
  const { secondaries } = dealtOf(f);
  return (
    <section className="g-rule" data-family={f.id}>
      <h3>{f.title}</h3>
      <p className="g-note">Dealt with one of: {secondaries.map(id => f.tieBreakers.find(t => t.id === id)?.title ?? id).join("; ") || "no secondary"}. Each example board below is shown with the next of them.</p>
      {exampleBoards(f).map((s, k) => {
        const rule = ruleOf(f, k);
        const a = annotate(rule, s);
        return (
          <div key={gridType.encode(s)} className="g-row" data-grid={gridType.encode(s)}>
            <div className="g-small">
              <Cell title="chip"><ObjectChip type={gridType} state={s} extra={bitsLine(a)} /></Cell>
              <Cell title="compact"><CompactFace rule={rule} state={s} annotation={a} next /></Cell>
            </div>
            <Cell title="expanded" wide><ExpandedFace rule={rule} state={s} /></Cell>
          </div>
        );
      })}
    </section>
  );
}

export function GridsSection({ only }: { only: string | null }) {
  const families = (gridType.families as readonly Family[]).filter(f => !only || f.id === only);
  return (
    <section className="g-section" id="grids" data-section="grids">
      <h2>Grids: the 4 × 4 board of digits</h2>
      {!only && <BoardViews />}
      {!only && <Storyboard />}
      <h3>Every grid family on example boards</h3>
      {families.map(f => <FamilySection key={f.id} f={f} />)}
    </section>
  );
}
