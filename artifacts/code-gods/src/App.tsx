import { useState, type ReactNode } from 'react';
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { markServerIdle, resumeServer, serverIdle, useServerIdle } from '@/hooks/use-server-idle';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Room from '@/pages/room';
import GameRedirect from '@/pages/game-redirect';
import Device from '@/pages/device';
import AdminAgents from '@/pages/admin-agents';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  queryCache:new QueryCache({onError:markServerIdle}),
  mutationCache:new MutationCache({onError:markServerIdle}),
  defaultOptions:{queries:{retry:(count,error)=>{
    markServerIdle(error);
    return !serverIdle() && count<2;
  },refetchOnWindowFocus:false,refetchOnReconnect:false}},
});

function IdleNotice() {
  const idle=useServerIdle();
  const [error,setError]=useState("");
  if(!idle)return null;
  return <div role="status" className="p-4 border border-primary">Server idle after human inactivity. Polling is stopped. <button onClick={()=>void resumeServer().then(()=>{setError("");void queryClient.invalidateQueries();}).catch(e=>setError(e.message))}>Resume / reconnect</button>{error && <p role="alert">{error}</p>}</div>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/rooms/:id" component={Room} />
        <Route path="/games/:code" component={GameRedirect} />
        <Route path="/device" component={Device} />
        <Route path="/admin/agents" component={AdminAgents} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <IdleNotice />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
