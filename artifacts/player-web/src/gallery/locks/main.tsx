/**
 * The lock components (src/panes/locks-ui.tsx) on fixtures, for screenshots before the server side lands:
 *   /locks.html   (&scheme=dark)
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import { LockCreate, LockMark, LocksSection, type LockCheck, type LockView } from "@/panes/locks-ui";
import { breakLine } from "@/panes/locks-model";
import { lockStarters } from "@/panes/locks-starters";

if (new URLSearchParams(location.search).get("scheme") === "dark") document.documentElement.classList.add("dark");

const LOCKS: LockView[] = [
  { n: 1, title: "the y-intercept ≥ 10 and the triangle's area ≥ 20", bits: 323, energy: 46, settledAt: 0, rate: 0.084, added: 60, taken: 0, mine: { added: 20, taken: 0 },
    history: [{ at: 4, op: "create", amount: 20, mine: true }, { at: 9, op: "fund", amount: 25, mine: false }, { at: 15, op: "fund", amount: 15, mine: false }],
    code: { language: "python", source: lockStarters("python")[3]!.source } },
  { n: 2, title: "the gradient stays negative", bits: 132, energy: 4, settledAt: 0, rate: 0.034, added: 10, taken: 3, mine: { added: 0, taken: 0 },
    history: [{ at: 2, op: "create", amount: 10, mine: false }, { at: 12, op: "drain", amount: 3, mine: false }],
    code: { language: "python", source: lockStarters("python")[5]!.source } },
];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const check = async (_l: string, source: string, words: string): Promise<LockCheck> => {
  await wait(300);
  return source.includes("1000")
    ? { meets: false, words, why: "the object does not meet the lock's program, so it cannot be locked to it" }
    : { meets: true, words, bits: 161, fee: 10.06, rate: 0.042 };
};
const STARTERS = lockStarters("python");

function Page() {
  return (
    <main className="mx-auto max-w-xl space-y-6 bg-background p-4 text-foreground">
      <h1 className="text-lg font-semibold">Locks on fixtures</h1>
      <section className="border p-3"><p className="flex items-center gap-2 text-sm">Line 4 <LockMark count={3} testId="mark" /> · Line 7 <LockMark count={1} /> · Line 9 <LockMark count={0} /></p></section>
      <section className="border p-3">
        <LocksSection locks={LOCKS} noun="line" worldNow={20} myEnergy={63.5} onFund={async () => wait(400)}
          create={<LockCreate noun="line" starters={STARTERS} myEnergy={63.5} check={check} onCreate={async () => wait(400)} onAsk={() => alert("assistant")} />} />
      </section>
      <section className="border p-3"><LocksSection locks={[]} noun="grid" worldNow={20} myEnergy={null} /></section>
      <section className="border p-3 text-xs" data-testid="what-if-break">
        <p className="border-l-2 border-amber-500 pl-2">{breakLine([{ title: "the gradient is -2", removeCost: 45.24 }])}</p>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
