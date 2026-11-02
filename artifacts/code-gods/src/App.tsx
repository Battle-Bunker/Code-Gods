import { type ReactNode } from 'react';
import type { ConvexReactClient } from 'convex/react';
import { EngineProvider } from '@/lib/convex';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Room from '@/pages/room';
import Game from '@/pages/game';
import Device from '@/pages/device';
import Connect from '@/pages/connect';
import AdminAgents from '@/pages/admin-agents';
import Configure from '@/pages/configure';
import { roomPath } from '@/lib/routes';
import {
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        {/* Rooms contain games (lib/routes.ts); /games/:code is the old game link, redirected by the game page. */}
        <Route path="/rooms/:id/configure" component={Configure} />
        <Route path="/rooms/:roomId/games/:gameId" component={Game} />
        <Route path="/rooms/:id/games">{(p: { id: string }) => <Redirect to={roomPath(p.id)} replace />}</Route>
        <Route path="/rooms/:id" component={Room} />
        <Route path="/games/:code" component={Game} />
        <Route path="/device" component={Device} />
        <Route path="/connect" component={Connect} />
        <Route path="/admin/agents" component={AdminAgents} />
        <Route path="/admin/agents/:id" component={AdminAgents} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App({ client }: { client: ConvexReactClient }) {
  return (
    <EngineProvider client={client}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </EngineProvider>
  );
}

export default App;
