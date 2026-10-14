import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRuntime } from "@workspace/game-runtime";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(artifactDir, "../..");

async function provisionPythonRuntime() {
  const environment = path.join(workspaceDir, ".pythonlibs");
  const python = path.join(environment, "bin/python3");
  function run(command, args) {
    const result = spawnSync(command, args, {
      cwd: workspaceDir, stdio: "inherit",
      env: { ...process.env, UV_PROJECT_ENVIRONMENT: environment },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Python runtime build step failed: ${command}`);
  }
  // Build-time only. Never install dependencies or run database migrations at startup.
  run("uv", ["sync", "--frozen", "--no-dev"]);
  run(python, ["-c", 'import importlib.metadata, wasmtime; assert importlib.metadata.version("wasmtime") == "49.0.0"']);
  // Ship generated assets alongside the runtime package, not in an ignored dev cache.
  run(python, ["lib/game-runtime/python/setup.py", "--destination",
    path.join(workspaceDir, "lib/game-runtime/dist/python-3.15.0")]);
  // Verify both external worker hosts against the assets just provisioned.
  // No API server, database, or paid model provider is started by these probes.
  for (const language of ["python", "typescript"]) {
    const runtime = createRuntime({ language, python, workers: 1 });
    try {
      for (const objectType of ["Int", "string"]) {
        const settings = { objectType, intMin: -100, intMax: 100, stringMaxLength: 1024 };
        const input = objectType === "Int" ? 37 : "build\0\nprobe";
        const source = language === "python" ? "lambda x: x"
          : objectType === "Int" ? "(x: number) => x" : "(x: string) => x";
        const { cost } = await runtime.inspect(source, settings);
        const { value } = await runtime.execute(source, input, settings);
        if (!Number.isSafeInteger(cost) || cost <= 0 || value !== input
            || (language === "python" && cost !== 6)) {
          throw new Error(`Packaged ${language} ${objectType} runtime build probe failed`);
        }
      }
    } finally { runtime.close(); }
  }
}

async function buildAll() {
  await provisionPythonRuntime();
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      // Runtime resolves sibling Wasm workers with import.meta.url; never bundle it.
      "@workspace/game-runtime",
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
