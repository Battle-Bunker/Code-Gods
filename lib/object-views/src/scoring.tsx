/**
 * Kid-facing score components: ✨ rarity, ⚠️ penalty warnings, a god's own score breakdown for one
 * object, and the scoring explainer. Disclosure: peers appear only as one aggregate (their summed net
 * bits and the floored peer care), never individually.
 */
import { formatBits, penaltyLine, penaltyPercent, rarityText } from "./rarity.ts";

export function Rarity({ bits, noun = "object", compact = false, className = "" }: { bits: number; noun?: string; compact?: boolean; className?: string }) {
  const r = rarityText(bits, noun);
  const title = `${r.sentence} ${r.rarerThan}. Each ✨ means twice as rare.`;
  if (compact) {
    return (
      <span className={`whitespace-nowrap ${className}`} title={title} data-testid="rarity">
        <span aria-label={`${r.sparkles} sparkle bits`}>✨ {r.sparkles}</span> · {r.oneIn}
      </span>
    );
  }
  return (
    <div className={`space-y-0.5 ${className}`} data-testid="rarity">
      <p className="text-sm font-medium">{r.everyday ? r.oneIn[0].toUpperCase() + r.oneIn.slice(1) : <>🌟 {r.oneIn}</>} <span className="font-mono" aria-label={`${r.sparkles} sparkle bits`}>✨ {r.sparkles}</span></p>
      <p className="text-xs text-muted-foreground">{r.sentence} {r.everyday ? "" : `That is ${r.rarerThan}.`}</p>
    </div>
  );
}

export function PenaltyWarning({ bits, comparative, noun = "object", className = "" }: { bits: number; comparative: string; noun?: string; className?: string }) {
  const line = penaltyLine(bits, comparative, noun);
  const bad = penaltyPercent(bits) > 50;
  return (
    <span className={`${bad ? "text-destructive font-medium" : "text-muted-foreground"} ${className}`} data-testid="penalty-warning"
      title={`${formatBits(bits)} ⚠️ penalty bits. A defence goal only counts when an object is worse than usual.`}>
      {line}{bad && <span className="font-mono"> ({formatBits(bits)} ⚠️)</span>}
    </span>
  );
}

export interface OwnScore {
  rewardBits: number;
  penaltyBits?: number;
  netBits: number;
  ordinal?: number | readonly number[];
}
export interface PersonalScore {
  own: OwnScore;
  /** Σ over every OTHER god of their net bits: one aggregate, never individuals. */
  peerNetBits: number;
  /** max(0, peerNetBits). */
  peerCare: number;
  /** own.netBits × peerCare. */
  payoff: number;
}

const num = (x: number, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }).replace("-", "−");

/** Your own view of one object: ✨ rarity, ⚠️ (if you have a defence goal), net bits, peer care, points. */
export function ScoreBreakdown({ score, noun = "object", comparative, compact = false }: { score: PersonalScore; noun?: string; comparative?: string; compact?: boolean }) {
  const { own, peerNetBits, peerCare, payoff } = score;
  const nobody = peerCare <= 0;
  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" data-testid="score-breakdown">
        <Rarity bits={own.rewardBits} noun={noun} compact />
        {own.penaltyBits !== undefined && comparative && <PenaltyWarning bits={own.penaltyBits} comparative={comparative} noun={noun} />}
      </span>
    );
  }
  const ordinal = own.ordinal === undefined ? undefined : Array.isArray(own.ordinal) ? `(${own.ordinal.join(", ")})` : String(own.ordinal);
  return (
    <div className="space-y-2 text-sm" data-testid="score-breakdown">
      {ordinal !== undefined && <p className="font-mono text-xs">utility({noun}) → {ordinal}</p>}
      <Rarity bits={own.rewardBits} noun={noun} />
      {own.penaltyBits !== undefined && comparative && <p><PenaltyWarning bits={own.penaltyBits} comparative={comparative} noun={noun} /></p>}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-xs">
        <dt className="text-muted-foreground">your net bits</dt><dd className="text-right tabular-nums" data-testid="score-own">{num(own.netBits)}</dd>
        <dt className="text-muted-foreground">everyone else, together</dt><dd className="text-right tabular-nums" data-testid="score-peers">{num(peerNetBits)}</dd>
        <dt className="text-muted-foreground">peer care (never below 0)</dt><dd className="text-right tabular-nums">{num(peerCare)}</dd>
        <dt className="font-semibold">points</dt><dd className="text-right tabular-nums font-semibold" data-testid="score-payoff">{num(own.netBits)} × {num(peerCare)} = {num(payoff)}</dd>
      </dl>
      {nobody && <p className="text-xs text-muted-foreground">The others don't care about this {noun} (together), so nobody scores from it.</p>}
    </div>
  );
}

/** The scoring rules in kid words. `id` lets a page link to it (#how-scoring-works). */
export function HowScoringWorks({ noun = "object", open = false, id = "how-scoring-works" }: { noun?: string; open?: boolean; id?: string }) {
  const nouns = noun.endsWith("s") ? noun : `${noun}s`;
  return (
    <details id={id} open={open} className="text-sm border bg-card/50" data-testid="how-scoring-works">
      <summary className="cursor-pointer px-3 py-2 font-medium">How scoring works</summary>
      <div className="px-3 pb-3 space-y-2 text-muted-foreground">
        <p><b className="text-foreground">✨ Rarity bits.</b> Your utility function scores every {noun}. The server compares that score with thousands of random {nouns}: if only 1 random {noun} in 8 does as well, that is ✨ 3 bits. Each ✨ means twice as rare.</p>
        <p><b className="text-foreground">⚠️ Defence goals.</b> Some gods also have something they want to stop. It takes bits away only when a {noun} is worse than usual for it.</p>
        <p><b className="text-foreground">Net bits.</b> Your ✨ minus your ⚠️ (if you have one). Everyone gets their own net bits for every {noun}.</p>
        <p><b className="text-foreground">Points.</b> For each {noun}: your bits × max(0, the other gods' bits added up). Your total is the sum over every {noun} in the world now.</p>
        <p><b className="text-foreground">If the others don't care, nobody scores.</b> A {noun} only you love earns you nothing. You see the others only as one total, never one by one.</p>
      </div>
    </details>
  );
}

/** Per-act cost parts (bits), when the server reports them: decision (naming the moves), erasure, motion. */
export type ActCostBreakdown = { decision?: number; decisionBits?: number; erasure?: number; motion?: number } & { [part: string]: number | undefined };

const PART_LABELS: Record<string, string> = {
  decision: "choosing the moves", decisionBits: "choosing the moves", erasure: "information erased", motion: "how much moved",
};

/**
 * An agent's price: the one-off summon cost (paid from god energy) and the expected cost per act (paid
 * from the agent's own energy), with an optional breakdown of the per-act cost.
 */
export function AgentCost({ summonCost, expectedActCost, breakdown, agentEnergyPerSecond, godEnergy }: {
  summonCost: number; expectedActCost: number; breakdown?: ActCostBreakdown; agentEnergyPerSecond?: number; godEnergy?: number;
}) {
  const parts = Object.entries(breakdown ?? {}).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]));
  const f = (x: number) => formatBits(x);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-xs" data-testid="validation-costs">
      <dt className="text-muted-foreground">summon cost</dt>
      <dd data-testid="text-summon-cost">{f(summonCost)} bits from your energy{godEnergy !== undefined && summonCost > godEnergy ? ` (you have ${f(godEnergy)})` : ""}</dd>
      <dt className="text-muted-foreground">expected per act</dt>
      <dd data-testid="text-expected-act-cost">{f(expectedActCost)} bits{agentEnergyPerSecond && agentEnergyPerSecond > 0 ? ` · about one act every ${f(expectedActCost / agentEnergyPerSecond)}s of world time` : ""}</dd>
      {parts.map(([k, v]) => (
        <div key={k} className="contents" data-testid={`cost-part-${k}`}>
          <dt className="text-muted-foreground pl-3">· {PART_LABELS[k] ?? k}</dt><dd>{f(v)} bits</dd>
        </div>
      ))}
    </dl>
  );
}
