import { useEffect } from "react";
import { useLocation } from "wouter";
import { Page, usePage } from "@/site/components/layout";
import { Action } from "@/site/components/action";
import { invitedTo } from "@/site/lib/routes";

/**
 * The one screen a signed-out visitor sees, at every path (core/app.tsx SignInGate): sign-in is required for everything
 * on the site (owner decision 2026-11-02). Signing in comes back to the same path (useSession's login: returnTo).
 */
const STEPS = [
  ["Join or create a room", "A room is a table for 3 to 8 players; AI players can fill seats."],
  ["Write a tiny agent and bargain in chat", "Agents change the shared world; deals in the public chat decide whose wishes win."],
  ["Most points wins", "A first game lasts five minutes, with a countdown; your points are what the objects are worth to you and to the others when it ends."],
] as const;

/** One sentence, three steps, one button. */
function Landing() {
  const { run } = usePage();
  const [location] = useLocation();
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-14 md:py-24 rise">
      <h1 className="font-display text-6xl md:text-8xl leading-[0.92]">Gods bargain.<br /><em className="text-primary">Universes</em> execute.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">A negotiation game for programmers: players share one running world, write tiny agents that change it, and bargain over what it should become.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Action k="ui.auth.signIn" tone="primary" onClick={() => run("ui.auth.signIn")} testId="button-login" className="px-6 py-3 text-base" />
        <span className="text-sm text-muted-foreground" data-testid="text-sign-in-for">{invitedTo(location) ?? "Got an invite link? Sign in, then open it."}</span>
      </div>
      <section className="mt-16 border-t pt-8">
        <h2 className="text-sm font-medium">How a game goes</h2>
        <ol className="mt-4 grid gap-6 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="font-mono text-accent text-sm">{i + 1}</span>
              <h3 className="font-display text-2xl mt-1">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function SignIn() {
  useEffect(() => { document.title = "Code Gods"; }, []);
  return <Page placeholder="Search or do anything…" crumbs={[]}><Landing /></Page>;
}
