import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { devServerHosts, tokenHandler } from '@workspace/player-client/engine';

const isBuild = process.argv.includes("build");
// Defaults: dev server on port 22772 at "/"; a static build is hosted by the engine at "/player/".
const rawPort = process.env.PORT || "22772";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || (isBuild ? "/player/" : "/");

const hostedDev = !!process.env.CODE_GODS_SITE_URL;
// Hosts this dev server answers for (DNS-rebinding guard, for Vite and the token endpoint) and the origin of
// its launch link: loopback, CODE_GODS_ALLOWED_HOSTS, CODE_GODS_PUBLIC_ORIGIN and a detected dev container
// (Replit, GitHub Codespaces, Gitpod). See devServerHosts in lib/player-client/src/engine.ts.
const { allowedHosts, publicOrigin } = devServerHosts(process.env, port);

function mountToken(server: { middlewares: { use(handler: ReturnType<typeof tokenHandler>): unknown }; httpServer?: { once(event: "listening", listener: () => void): unknown } | null }) {
  const handler = tokenHandler({ allowedHosts });
  server.middlewares.use(handler);
  server.httpServer?.once("listening", () => console.log(`\n  Code Gods: open your player app with its launch link (keep it private):\n  ${handler.launchUrl(publicOrigin)}\n`));
}

const panelsDir = path.resolve(import.meta.dirname, 'src/panels') + path.sep;
const registryFile = path.resolve(import.meta.dirname, 'src/shell/registry.ts');

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
    allowedHosts,
    // One broken panel must never cover the game: panel errors show inside their own frame.
    hmr: { overlay: false },
    // Hosted-mode development against a local engine: CODE_GODS_SITE_URL=http://127.0.0.1:3211
    ...(process.env.CODE_GODS_SITE_URL ? { proxy: { '/api': { target: process.env.CODE_GODS_SITE_URL, changeOrigin: true } } } : {}),
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts,
  },
});
