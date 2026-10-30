import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const isBuild = process.argv.includes('build');
// Static builds do not bind a port and can run outside the managed workflow.
const rawPort = process.env.PORT ?? (isBuild ? '18323' : undefined);

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Static builds (served by the engine's static hosting at "/") default to base "/".
const basePath = process.env.BASE_PATH ?? (isBuild ? '/' : undefined);

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

/**
 * Dev mode: the engine's site URL (HTTP actions: login, session cookie, JWT minting, /api/config).
 * `/api` is proxied there so the page keeps one origin. The engine's token and logout routes accept
 * only their own Origin (CSRF), so the proxy presents the engine's origin. Login itself finishes on the
 * engine's callback URL; the session cookie is host-scoped, so run this dev server on the same host as
 * the site URL (e.g. both on 127.0.0.1), or set the engine env var CODE_GODS_SITE_URL to this server's
 * origin so the whole flow (callback included) runs through the proxy.
 */
const siteUrl = (process.env.CODE_GODS_SITE_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const siteOrigin = new URL(siteUrl).origin;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/api': {
        target: siteUrl,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', siteOrigin);
          });
        },
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
