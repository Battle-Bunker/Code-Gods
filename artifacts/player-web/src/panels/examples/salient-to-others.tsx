/**
 * Salient to others, not to me: lines the other players want (their summed bits above zero) while your own bits on
 * them are zero. Bargaining chips: you lose little by letting them be shaped. While the game runs the others' figures
 * are blurred, so the chart and the table say "about".
 */
import { CareScatter, carePoints, definePanel, fmtBits, objectWord, useDigest, useGame, useOthersBlurred } from "@sdk";

export default definePanel({
  title: "Salient to others, not me",
  placement: "right",
  size: "md",
  Component() {
    const digest = useDigest();
    const approx = useOthersBlurred();
    const word = objectWord(useGame()?.variant);
    if (digest === undefined) return <p className="text-xs italic opacity-60">Loading…</p>;
    const points = carePoints(digest?.packed);
    const chips = points.filter(p => p.kind === "others").sort((a, b) => b.want - a.want);
    return (
      <div className="space-y-2 text-xs" data-testid="example-salient">
        <CareScatter points={points} word={word} approx={approx} />
        <p className="opacity-70">{chips.length} of {points.length} {word.many} matter to the others but not to you.</p>
        <table className="w-full tabular-nums">
          <thead><tr className="text-left opacity-70"><th>{word.one}</th><th className="text-right">others' want</th><th className="text-right">yours</th></tr></thead>
          <tbody>
            {chips.slice(0, 8).map(p => (
              <tr key={p.number}><td>#{p.number}</td><td className="text-right">{approx ? "about " : ""}{fmtBits(p.want)}</td><td className="text-right">{fmtBits(p.rarity)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});
