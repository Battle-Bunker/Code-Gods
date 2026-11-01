/** A centred full-page message: connecting, sign-in, which room, errors (the player client's non-game screens). */
import type { ReactNode } from "react";

export function Screen({ title, children, testId, wide = false }: { title: string; children?: ReactNode; testId?: string; wide?: boolean }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-8">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} space-y-4`} data-testid={testId}>
        <h1 className="font-serif text-3xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}
