import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { engineToken } from './dev/engine-token';


const isBuild = process.argv.includes("build");
// Static builds do not bind a port and can run outside the managed workflow.
const rawPort = process.env.PORT ?? (isBuild ? "22772" : undefined);

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const panelsDir = path.resolve(import.meta.dirname, 'src/panels') + path.sep;
const registryFile = path.resolve(import.meta.dirname, 'src/shell/registry.ts');

const basePath = process.env.BASE_PATH ?? (isBuild ? "/player/" : "/");

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

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
      // A player app's engine token (dev/engine-token.ts): the credential stays in this server.
      name: "code-gods-engine-token",
      configureServer(server) {
        server.middlewares.use(`${basePath.replace(/\/$/, "")}/__codegods/token`, (req, res) => void engineToken(req, res));
      },
    },
    react(),
    tailwindcss(),
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
      '@sdk': path.resolve(import.meta.dirname, 'src/sdk/index.ts'),
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
    allowedHosts: true,
  },
});
