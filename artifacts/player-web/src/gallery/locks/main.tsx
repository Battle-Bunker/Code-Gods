/**
 * The lock components (src/panes/locks-ui.tsx) on fixtures, for screenshots before the server side lands:
 *   /locks.html   (&scheme=dark)
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import { LockCreate, LockMark, LocksSection, type LockCheck, type LockView } from "@/panes/locks-ui";
import { breakLine } from "@/panes/locks-model";

if (new URLSearchParams(location.search).get("scheme") === "dark") document.documentElement.classList.add("dark");

const LOCKS: LockView[] = [
  { n: 1, title: "the gradient is -2", info: 9.2, energy: 46, settledAt: 0, rate: 0.038, code: { language: "python", source: "# the gradient is -2\ndef holds(line):\n    return line.m == -2\n" } },
  { n: 2, title: "the y-intercept is at least 40", info: 6.1, energy: 4, settledAt: 0, rate: 0.025, code: { language: "python", source: "# the y-intercept is at least 40\ndef holds(line):\n    return line.c >= 40\n" } },
  { n: 3, title: "the y-intercept is prime", info: 4.4, energy: 0.3, settledAt: 0, rate: 0.018 },
];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const check = async (_l: string, source: string): Promise<LockCheck> => {
  await wait(300);
  return source.includes(">= 100")
    ? { meets: false, words: "the y-intercept is at least 100", info: 8, fee: 8, rate: 0.033 }
    : { meets: true, words: "the y-intercept is prime", info: 4.4, fee: 4.4, rate: 0.018 };
};
const STARTERS = [
  { kind: "gradient", title: "Keep the gradient", language: "python" as const, source: "# the gradient stays -2\ndef holds(line):\n    return line.m == -2\n" },
  { kind: "floor", title: "A floor on the y-intercept", language: "python" as const, source: "# the y-intercept is at least 40\ndef holds(line):\n    return line.c >= 40\n" },
  { kind: "prime", title: "The y-intercept is prime", language: "python" as const, source: "# the y-intercept is prime\ndef holds(line):\n    return is_prime(line.c)\n" },
];

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
