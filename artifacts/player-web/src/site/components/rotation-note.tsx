/**
 * An ended game's place in its rotation (site/lib/rotation.ts, engine lib/dealRotation.ts): one line saying which game
 * of the rotation it was and whose rule you get next, then the points over the rotation's games so far, so a beginner
 * sees why one game is not the verdict. Used by the room page and the results panel.
 */
import { rotationStatus, type RotationGame } from "@/site/lib/rotation";

const points = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 1 });

export function RotationNote({ game, history, me }: { game: RotationGame | undefined; history: readonly RotationGame[] | undefined; me?: string }) {
  const s = game ? rotationStatus(game, history ?? [], me) : null;
  if (!s) return null;
  return (
    <div className="space-y-1 border-l-2 border-[hsl(var(--accent))] pl-3" data-testid="section-rotation">
      <p className="text-sm" data-testid="text-rotation-line">{s.line}</p>
      {s.totals && s.games > 1 && (
        <ol className="text-sm tabular-nums" data-testid="list-rotation-totals" aria-label={`Points over the rotation's ${s.games} games`}>
          <li className="text-xs text-muted-foreground">Points over the rotation's {s.games} games so far:</li>
          {s.totals.map((t, i) => (
            <li key={t.deityId} className={t.deityId === me ? "font-semibold" : ""}>{i + 1}. {t.name}{t.deityId === me ? " (you)" : ""}: {points(t.total)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
