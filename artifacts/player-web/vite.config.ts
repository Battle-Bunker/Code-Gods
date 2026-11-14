import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { build as viteBuild, defineConfig, type Plugin } from 'vite';
import { devPageCsp, frameHtml, injectCsp, injectPageCsp } from './vite/csp';

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
const frameConfig = path.resolve(import.meta.dirname, 'vite.frame.config.ts');

/**
 * Stored panels in a dev server: the frame (panel-frame.html, panel-runtime.js, panel-frame.css) is built in memory with
 * vite.frame.config.ts on first use and rebuilt after a change under src/; the frame CSP names this request's own origin.
 */
function framePlugin(): Plugin {
  let built: Promise<Map<string, string>> | undefined;
  const build = () => built ??= viteBuild({ configFile: frameConfig, mode: "development", logLevel: "warn", build: { write: false } }).then(result => {
    const files = new Map<string, string>();
    for (const output of [result].flat() as { output: { fileName: string; type: string; code?: string; source?: string | Uint8Array }[] }[]) {
      for (const item of output.output) files.set(item.fileName, item.type === "chunk" ? item.code! : typeof item.source === "string" ? item.source : Buffer.from(item.source!).toString("utf8"));
    }
    return files;
  }).catch(error => { built = undefined; throw error; });
  const types: Record<string, string> = { "panel-runtime.js": "text/javascript", "panel-frame.css": "text/css" };
  return {
    name: "code-gods-panel-frame-dev",
    apply: "serve",
    configureServer(server) {
      const src = path.resolve(import.meta.dirname, 'src') + path.sep;
      for (const event of ["add", "change", "unlink"] as const) server.watcher.on(event, file => { if (file.startsWith(src)) built = undefined; });
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        const base = server.config.base;
        if (!url.pathname.startsWith(base)) { next(); return; }
        const name = url.pathname.slice(base.length);
        try {
          if (name === "panel-frame.html") {
            const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() || ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(frameHtml(`${proto}://${req.headers.host}`));
            return;
          }
          if (types[name]) {
            const body = (await build()).get(name);
            res.setHeader("Content-Type", types[name]);
            res.setHeader("Cache-Control", "no-store");
            res.end(body ?? "");
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.end(String((error as Error).message ?? error));
          return;
        }
        next();
      });
    },
  };
}

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
    framePlugin(),
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
