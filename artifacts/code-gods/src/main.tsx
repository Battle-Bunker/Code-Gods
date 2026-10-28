import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { loadConvexUrl } from '@/lib/convex';

import './index.css';

const root = createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
});

loadConvexUrl().then(
  (url) => {
    root.render(
      <ErrorBoundary>
        <App client={new ConvexReactClient(url)} />
      </ErrorBoundary>,
    );
  },
  (error: unknown) => {
    root.render(
      <div className="mx-auto max-w-lg px-4 py-20" role="alert" data-testid="status-config-error">
        <h1 className="font-display text-4xl">Engine unreachable</h1>
        <p className="mt-3 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        <button onClick={() => window.location.reload()} className="mt-6 border px-4 py-2">Retry</button>
      </div>,
    );
  },
);
