import { type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth, displayName } from "@/hooks/use-auth";

export function Sigil({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r="18" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.2" />
      <g className="orbit" style={{ transformOrigin: "20px 20px" }}>
        <ellipse cx="20" cy="20" rx="18" ry="7" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" />
        <circle cx="38" cy="20" r="2.4" fill="hsl(var(--accent))" />
      </g>
      <path d="M15 14 L11 20 L15 26 M25 14 L29 20 L25 26" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.6" />
    </svg>
  );
}

export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { user, isAuthenticated, login, logout } = useAuth();
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
            <Sigil />
            <span className="font-display text-2xl leading-none">Code Gods</span>
            <span className="label-mono hidden sm:inline">/ pantheon server</span>
          </Link>
          <div className="flex-1" />
          {right}
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              {user?.isAdmin && <Link href="/admin/agents" className="label-mono hover:text-foreground" data-testid="link-admin-agents">AI library</Link>}
              <span className="text-sm hidden sm:inline" data-testid="text-username">{displayName(user)}</span>
              <button onClick={logout} className="label-mono hover:text-foreground border px-2.5 py-1.5" data-testid="button-logout">Log out</button>
            </div>
          ) : (
            <button onClick={login} className="text-sm bg-foreground text-background px-3 py-1.5" data-testid="button-login-header">Log in</button>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function Panel({ title, meta, children, className = "" }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border bg-card/90 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="label-mono !text-foreground">{title}</h2>
        {meta && <div className="label-mono">{meta}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="mx-auto mb-3 h-8 w-8 rounded-full border border-dashed border-muted-foreground/50" />
      <p className="font-display text-xl">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{body}</p>
    </div>
  );
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="status-error">
      <span className="font-mono text-xs">{message}</span>
      {onRetry && <button onClick={onRetry} className="label-mono !text-destructive underline" data-testid="button-retry">Retry</button>}
    </div>
  );
}
