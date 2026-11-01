import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { buildIdPlugin } from '@workspace/player-client/vite-build-id';

// Defaults: dev server on port 18323, base "/" (the engine's static hosting serves this UI at "/").
const rawPort = process.env.PORT || '18323';
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

/**
 * Dev mode: the engine's site URL (HTTP actions: login, session cookie, JWT minting, /api/config).
 * `/api` is proxied there so the page keeps one origin. The engine's token and logout routes accept
 * only their own Origin (CSRF), so the proxy presents the engine's origin. Login itself finishes on the
 * engine's callback URL; the session cookie is host-scoped, so run this dev server on the same host as
 * the site URL (e.g. both on 127.0.0.1), or set the engine deployment's env var SITE_URL to this server's
 * origin so the whole flow (callback included) runs through the proxy.
 */
const siteUrl = (process.env.CODE_GODS_SITE_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const siteOrigin = new URL(siteUrl).origin;

export default defineConfig({
  base: basePath,
  plugins: [
    // The build's id in index.html: open pages of an older build update themselves (lib/player-client/src/update.ts).
    buildIdPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
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
