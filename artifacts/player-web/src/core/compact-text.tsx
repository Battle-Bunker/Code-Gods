/**
 * A sentence with its very large numbers short (core/compact-numbers.ts: "3²⁰", "6.97 billion"), each a button that
 * shows the exact value when tapped and the short one when tapped again (playtest round 26, 07: a log line must fit a
 * phone row).
 */
import { useState } from "react";
import { splitBigNumbers } from "./compact-numbers";

function Big({ exact, short }: { exact: string; short: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="underline decoration-dotted underline-offset-2" title={exact} aria-label={open ? short : exact}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }} data-testid="button-big-number">{open ? exact : short}</button>
  );
}

export function CompactText({ text }: { text: string }) {
  const parts = splitBigNumbers(text);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{text}</>;
  return <>{parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <Big key={i} exact={p.exact} short={p.short} />))}</>;
}
