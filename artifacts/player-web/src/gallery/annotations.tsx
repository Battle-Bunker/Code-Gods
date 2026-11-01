/**
 * Goal annotations gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /annotations.html): every annotated
 * family on First Steps (4×4, base 10, rgb) as its goal card shows it, plus compact grids whose hover view explains them.
 * Used to look at the annotations and to record the demo videos (docs/annotations-design.md §12).
 * `?family=<id>` shows one family; `?mode=<id>` one alternative mode demo.
 */
import React, { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { instantiate } from "@workspace/game-types";
import { context, explainer, family, story, whatIf } from "@workspace/game-utilities";
import { GoalBoard, GoalExplainerProvider, GridObject, PartScrubber, StoryPlayer, WhatIfBoard } from "@workspace/object-views";
import "../index.css";

const GRID = { size: 4, symbols: "base10", colours: "rgb" } as const;
const INST = instantiate("Grid", GRID);

export const SHOWCASE = [
  { familyId: "parity_painter", params: { P: 0, Q: 1, key: "parity" } },
  { familyId: "set_spotter", params: { diag: false } },
  { familyId: "number_bonds", params: { mode: "any" } },
  { familyId: "chessmaster", params: { A: 0, B: 1 } },
  { familyId: "honest_minesweeper", params: { X: 0 } },
  { familyId: "magic_accountant", params: { axis: "rows", T: 16 } },
  { familyId: "kingdom", params: { C: 0 } },
  { familyId: "picture_frame", params: { X: 0 } },
  { familyId: "mirrormancer", params: { axis: "LR", layer: "colour" } },
] as const;

/** A family without a lens: its example board shows the score only (no breakdown). */
const PLAIN = { familyId: "rainbow_steps" } as const;

/** Some live-looking boards for the compact list. */
const LIVE = ["2R,5R,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,5G", "7G,3B,0R,9R/1R,1G,1B,4G/5B,8R,2G,6B/0G,3R,6G,9B"];

function Family({ familyId, params }: { familyId: string; params: Record<string, unknown> }) {
  const goal = useMemo(() => explainer({ familyId, params: params as never }, INST)!, [familyId]);
  const f = family(familyId), example = useMemo(() => goal.example(), [goal]);
  return (
    <section className="space-y-4 border bg-card p-5" data-family={familyId}>
      <header>
        <h2 className="text-xl font-semibold"><span aria-hidden>{f.emoji} </span>{f.name}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed">{f.summary(params as never, context(INST))}</p>
      </header>
      <GoalExplainerProvider value={goal}>
        <div className="flex items-center gap-4 text-xs text-muted-foreground" data-testid={`live-${familyId}`}>
          <span>Live grids (hover one to open its rich view):</span>
          {LIVE.map(v => <GridObject key={v} value={v} grid={GRID} renderer="digits" />)}
        </div>
      </GoalExplainerProvider>
      {example && <GoalBoard goal={goal} value={example.value} grid={GRID} initialFocus={example.focus} caption={example.caption} testId={`example-${familyId}`} />}
    </section>
  );
}

function PlainFamily() {
  const params = family(PLAIN.familyId).support(context(INST))[0];
  const goal = useMemo(() => explainer({ familyId: PLAIN.familyId, params }, INST)!, []);
  const example = useMemo(() => goal.example(), [goal]);
  return (
    <section className="space-y-2 border bg-card p-5" data-plain-family={PLAIN.familyId}>
      <h2 className="text-lg font-semibold">Without a lens: {family(PLAIN.familyId).name}</h2>
      {example && <GoalBoard goal={goal} value={example.value} grid={GRID} caption={example.caption} testId="example-plain" />}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// alternative modes for hard rules (docs/annotations-design.md §11)
// ------------------------------------------------------------------------------------------------

const CASTLE = { familyId: "castle_keeper", params: { W: 0, mode: "plain", T: null } };
const CASTLE_BOARD = "1G,0R,0R,0R/2B,3G,0R,5B/0R,0R,4G,0R/2B,0R,0R,3G";
const FAR = { familyId: "far_apart", params: { A: 0, B: 1 } };
const FAR_BOARD = "3R,1R,0B,2G/4R,7B,5G,1B/0B,2R,6B,8G/9G,1B,3R,7G";
const MIRROR = { familyId: "mirrormancer", params: { axis: "LR", layer: "colour" } };

function Mode({ id, title, blurb, children }: { id: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border bg-card p-5" data-mode={id}>
      <header><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed">{blurb}</p></header>
      {children}
    </section>
  );
}

function Modes({ only }: { only: string | null }) {
  const mirror = useMemo(() => explainer(MIRROR, INST)!, []), far = useMemo(() => explainer(FAR, INST)!, []);
  const mirrorBoard = useMemo(() => mirror.example()!.value, [mirror]);
  const tale = useMemo(() => story(CASTLE, INST, CASTLE_BOARD)!, []);
  // Open on the cell whose changes swing the score most.
  const farFocus = useMemo(() => {
    let best = { r: 0, c: 0 }, spread = -1;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const d = whatIf(FAR, INST, FAR_BOARD, { r, c })!.entries.flat().map(e => e.delta);
      if (Math.max(...d) - Math.min(...d) > spread) { spread = Math.max(...d) - Math.min(...d); best = { r, c }; }
    }
    return best;
  }, []);
  return (
    <>
      {(!only || only === "scrubber") && (
        <Mode id="scrubber" title="Mode 1 · Count as you go (part scrubber)" blurb={`${family("mirrormancer").emoji} Mirrormancer: ${family("mirrormancer").summary(MIRROR.params as never, context(INST))} Step through every row with a running total.`}>
          <PartScrubber goal={mirror} value={mirrorBoard} grid={GRID} />
        </Mode>
      )}
      {(!only || only === "whatif") && (
        <Mode id="whatif" title="Mode 2 · What if this cell changed?" blurb={`${family("far_apart").emoji} Far Apart: ${family("far_apart").summary(FAR.params as never, context(INST))}`}>
          <WhatIfBoard draw={FAR} inst={INST} goal={far} value={FAR_BOARD} grid={GRID} initialFocus={farFocus} />
        </Mode>
      )}
      {(!only || only === "story") && (
        <Mode id="story" title="Mode 3 · Step-through story" blurb={`${family("castle_keeper").emoji} Castle Keeper: ${family("castle_keeper").summary(CASTLE.params as never, context(INST))}`}>
          <StoryPlayer story={tale} value={CASTLE_BOARD} grid={GRID} />
        </Mode>
      )}
    </>
  );
}

function Gallery() {
  const q = new URLSearchParams(location.search), only = q.get("family"), mode = q.get("mode");
  if (mode) return <main className="mx-auto max-w-5xl space-y-6 p-6"><Modes only={mode} /></main>;
  const shown = SHOWCASE.filter(s => !only || s.familyId === only);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {!only && <h1 className="text-2xl font-semibold">Goal annotations: First Steps</h1>}
      {shown.map(s => <Family key={s.familyId} familyId={s.familyId} params={s.params} />)}
      {!only && <PlainFamily />}
      {!only && <Modes only={null} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
