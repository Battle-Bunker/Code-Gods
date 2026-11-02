/**
 * "How this scores" (annotations-design.md, game-utilities explain/workings.ts): the player's own utility worked from the
 * board to its bits: the raw score by kind of piece, how rare it is, the −log₂ maths, then any defence goal and the net
 * bits. Shown only for the viewer's own goal (the goal provider), and in replays through the replay explainer.
 */
import type { ScoreWorkings } from "@workspace/game-utilities";
import { workingsText } from "./workings-text.ts";

const YOURS = { color: "var(--dim-yours, currentColor)" } as const;

/** The rarity curve: one bar per score, as tall as its bits (taller = rarer); this board's bar is solid. */
function Curve({ w }: { w: ScoreWorkings }) {
  const pts = w.rarity.curve;
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map(p => p.bits), 0.001), here = w.rarity.ordinal[0], H = 28, bw = 100 / pts.length;
  return (
    <svg viewBox={`0 0 100 ${H}`} className="h-10 w-full max-w-[16rem]" role="img" data-testid="how-curve"
      aria-label={`Rarity by score: the more you score, the rarer. Your score, ${here}, is highlighted.`} preserveAspectRatio="none">
      {pts.map((p, i) => {
        const h = Math.max(1, (p.bits / max) * (H - 2)), mine = p.score === here;
        return <rect key={p.score} x={i * bw + 0.5} y={H - h} width={Math.max(0.5, bw - 1)} height={h} fill="currentColor" opacity={mine ? 1 : 0.28} data-here={mine || undefined} />;
      })}
    </svg>
  );
}

export function HowThisScores({ workings, noun = "board" }: { workings: ScoreWorkings; noun?: string }) {
  const t = workingsText(workings, noun);
  return (
    <section className="max-w-md space-y-3 border-t pt-3 text-xs leading-snug" data-testid="how-this-scores" aria-label="How this scores">
      <h3 className="text-sm font-semibold">How this scores</h3>
      <div data-testid="how-raw">
        <h4 className="font-semibold">{t.rawTitle}</h4>
        <ul className="mt-1 space-y-0.5">
          {t.rawLines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3"><span>{l.text}</span><span className="whitespace-nowrap font-mono font-semibold">{l.points}</span></li>
          ))}
        </ul>
        <p className="mt-1 font-semibold">{t.rawTotal}</p>
      </div>
      <div data-testid="how-rarity" className="space-y-1">
        <h4 className="font-semibold">{t.rarityTitle}</h4>
        {t.rarityLines.map((l, i) => <p key={i}>{l}</p>)}
        <Curve w={workings} />
      </div>
      <div data-testid="how-bits" className="space-y-1">
        <h4 className="font-semibold">{t.bitsTitle}</h4>
        <p className="font-mono">{t.bitsLines[0]}</p>
        {t.bitsLines.slice(1).map((l, i) => <p key={i}>{l}</p>)}
      </div>
      {(t.defenceLines.length > 0 || t.netLines.length > 0) && (
        <div data-testid="how-net" className="space-y-1">
          <h4 className="font-semibold">4. What counts in the game</h4>
          {t.defenceLines.map((l, i) => <p key={i}>{l}</p>)}
          {t.netLines.map((l, i) => <p key={i} style={i === 0 ? YOURS : undefined} className={i === 0 ? "font-mono" : undefined}>{l}</p>)}
        </div>
      )}
    </section>
  );
}
