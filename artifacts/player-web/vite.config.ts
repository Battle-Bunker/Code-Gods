import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile } from 'fs/promises';
import { build as viteBuild, defineConfig, type Plugin } from 'vite';
import { devServerHosts, tokenHandler } from '@workspace/player-client/engine';
import { compilePanel } from '@workspace/engine/convex/panels/compiler.ts';
import { devPageCsp, frameHtml, injectCsp, injectPageCsp } from './vite/csp';

const isBuild = process.argv.includes("build");
// Defaults: dev server on port 22772 at "/"; a static build is hosted by the engine at "/player/".
const rawPort = process.env.PORT || "22772";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || (isBuild ? "/player/" : "/");

const hostedDev = !!process.env.CODE_GODS_SITE_URL;
function mountToken(server: { middlewares: { use(handler: ReturnType<typeof tokenHandler>): unknown }; httpServer?: { once(event: "listening", listener: () => void): unknown } | null }) {
  // The hosts the token endpoint answers for (DNS-rebinding guard; Vite runs plugin middleware before its own
  // host check, which stays open so any proxy or tunnel can load the page) and the launch link's origin:
  // loopback, CODE_GODS_ALLOWED_HOSTS, CODE_GODS_PUBLIC_ORIGIN and a detected dev container (Replit, GitHub
  // Codespaces, Gitpod). See devServerHosts in lib/player-client/src/engine.ts.
  const { allowedHosts, publicOrigin } = devServerHosts(process.env, port);
  const handler = tokenHandler({ allowedHosts });
  server.middlewares.use(handler);
  server.httpServer?.once("listening", () => console.log(`\n  Code Gods: open your player app with its launch link (keep it private):\n  ${handler.launchUrl(publicOrigin)}\n`));
}

const panelsDir = path.resolve(import.meta.dirname, 'src/panels') + path.sep;
const registryFile = path.resolve(import.meta.dirname, 'src/shell/registry.ts');
const frameConfig = path.resolve(import.meta.dirname, 'vite.frame.config.ts');

/**
 * Stored panels in a dev server. The frame (panel-frame.html, panel-runtime.js, panel-frame.css) is built in memory
 * with vite.frame.config.ts on first use and rebuilt after an SDK, shell, frame or style change; the frame CSP names
 * this request's own origin. GET /__codegods/panel-compiled?file=x.tsx compiles a file panel with the engine's
 * compiler, for a file panel pane's "sandbox" toggle.
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
      server.watcher.on("change", file => { if (file.startsWith(src) && !file.startsWith(panelsDir)) built = undefined; });
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        // Paths relative to the app's base ("/" by default, "/player/" with BASE_PATH), as the client requests them.
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
          if (name === "__codegods/panel-compiled") {
            const file = url.searchParams.get("file") ?? "";
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            if (!/^[a-z0-9][a-z0-9-]*\.tsx$/i.test(file)) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: "file must be a src/panels/*.tsx name" })); return; }
            const source = await readFile(path.join(panelsDir, file), "utf8");
            try { res.end(JSON.stringify(compilePanel(source))); }
            catch (error) { res.end(JSON.stringify({ ok: false, error: (error as { data?: { message?: string } }).data?.message ?? String(error) })); }
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

/** The page's CSP as a meta tag (vite/csp.ts): the hosted /player/ policy in a build, frame-src 'self' in a dev server. */
const pageCspPlugins = (): Plugin[] => [
  { name: "code-gods-page-csp", apply: "build", transformIndexHtml: { order: "post", handler: html => injectPageCsp(html, process.env) } },
  { name: "code-gods-dev-page-csp", apply: "serve", transformIndexHtml: { order: "post", handler: html => injectCsp(html, devPageCsp()) } },
];

export default defineConfig({
  base: basePath,
  plugins: [
    {
      // Adding or deleting a panel only changes the registry's glob. Route those events to the registry
      // (which accepts its own update) so a re-created file name with a stale module node never forces a
      // full page reload.
      name: "code-gods-panels-hmr",
      apply: "serve",
      hotUpdate({ file, type, modules }) {
        if (this.environment.name !== "client" || !file.startsWith(panelsDir) || type === "update") return;
        const registry = this.environment.moduleGraph.getModuleById(registryFile);
        return registry ? [registry] : modules;
      },
    },
    {
      // A player app's engine token (lib/player-client tokenHandler): the room credential stays in this
      // server and the browser gets 10-minute JWTs from GET /__codegods/token. Not mounted for hosted-mode
      // development against an engine site (CODE_GODS_SITE_URL), where the client signs in on the site.
      name: "code-gods-engine-token",
      // A dev URL is public, so a browser needs the private launch link printed here (never served) first.
      configureServer(server) { if (!hostedDev) mountToken(server); },
      configurePreviewServer(server) { if (!hostedDev) mountToken(server); },
    },
    framePlugin(),
    ...pageCspPlugins(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@sdk': path.resolve(import.meta.dirname, 'src/sdk/index.ts'),
      '@sdk-transport': path.resolve(import.meta.dirname, 'src/sdk/transport.ts'),
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
    // Hosted-mode development against a local engine: CODE_GODS_SITE_URL=http://127.0.0.1:3211
    // Better Auth trusts only the engine's origin, so the proxy presents it (as artifacts/code-gods does).
    ...(process.env.CODE_GODS_SITE_URL ? { proxy: { '/api': {
      target: process.env.CODE_GODS_SITE_URL, changeOrigin: true,
      configure: (proxy: { on(event: 'proxyReq', fn: (req: { getHeader(n: string): unknown; setHeader(n: string, v: string): void }) => void): void }) => {
        proxy.on('proxyReq', req => { if (req.getHeader('origin')) req.setHeader('origin', new URL(process.env.CODE_GODS_SITE_URL!).origin); });
      },
    } } } : {}),
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
