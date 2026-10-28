import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';


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

const basePath = process.env.BASE_PATH ?? (isBuild ? "/player/" : undefined);

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
      name: "unconfigured-player-daemon",
      configureServer(server) {
        server.middlewares.use(`${basePath.replace(/\/$/, "")}/daemon`, (_req, res) => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ error: "Use the authenticated local player daemon; authoritative wiring is coordinator-owned." }));
        });
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
