import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { devPageCsp, injectCsp, injectPageCsp } from './vite/csp';

const isBuild = process.argv.includes("build");
// Defaults: dev server on port 22772 at "/"; the engine hosts a build at "/" too. The app never assumes its prefix
// (src/core/routes.ts reads Vite's base), so BASE_PATH can mount it anywhere, behind a proxy path included.
const rawPort = process.env.PORT || "22772";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

/**
 * Site-mode development (CODE_GODS_SITE_URL, e.g. http://127.0.0.1:3211): the app signs in on the engine site with its
 * Google session, as the build the engine serves does. `/api` is proxied there so the page keeps one origin; the
 * engine's token and logout routes accept only their own Origin (CSRF), so the proxy presents the engine's origin.
 *
 * Account mode (VITE_CODE_GODS_ENGINE_URL, in the environment or a .env file): the app signs in to that engine
 * with an account grant from its /connect page (src/core/connection.ts), from this origin; no proxy, no token route.
 * Read from Vite's resolved env, so it is the same value the page is built or served with, in every mode.
 */
const hostedDev = !!process.env.CODE_GODS_SITE_URL;
const siteUrl = (process.env.CODE_GODS_SITE_URL ?? "").replace(/\/+$/, "");
/** The page's CSP as a meta tag (vite/csp.ts): the app's policy in a build, frame-src 'self' in a dev server. */
const pageCspPlugins = (): Plugin[] => [
  (() => {
    // The page's env as Vite resolved it (process.env and the mode's .env files), as the bundle sees it.
    let env: Record<string, string | undefined> = process.env;
    return { name: "code-gods-page-csp", apply: "build", configResolved(config) { env = { ...process.env, ...config.env }; },
      transformIndexHtml: { order: "post", handler: (html: string) => injectPageCsp(html, env) } } satisfies Plugin;
  })(),
  { name: "code-gods-dev-page-csp", apply: "serve", transformIndexHtml: { order: "post", handler: html => injectCsp(html, devPageCsp()) } },
];

export default defineConfig({
  base: basePath,
  plugins: [
    ...pageCspPlugins(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@sdk': path.resolve(import.meta.dirname, 'src/sdk/index.ts'),
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
    // One broken panel must never cover the game: panel errors show inside their own frame.
    hmr: { overlay: false },
    fs: {
      strict: true,
    },
    ...(hostedDev ? { proxy: { "/api": { target: siteUrl, changeOrigin: true, configure: (proxy: { on(event: "proxyReq", listener: (req: { getHeader(name: string): unknown; setHeader(name: string, value: string): void }) => void): void }) => {
      proxy.on("proxyReq", req => { if (req.getHeader("origin")) req.setHeader("origin", new URL(siteUrl).origin); });
    } } } } : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
