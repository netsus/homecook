import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeNextRoutesManifest } from "./lib/next-routes-manifest.mjs";
import { loadFullLocalAppSecretEnv } from "./lib/full-local-app-runtime-env.mjs";
import { relayChildLifecycle } from "./lib/process-signal-relay.mjs";
import { normalizeProductionStartArgs } from "./lib/start-production-args.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");
const startArgs = normalizeProductionStartArgs(process.argv.slice(2));
const fullLocalSecretEnv = loadFullLocalAppSecretEnv({
  repositoryRoot,
  secretDirectory: process.env.HOMECOOK_FULL_LOCAL_SECRET_DIR,
});

normalizeNextRoutesManifest();

const child = spawn(
  process.execPath,
  [nextBin, "start", ...startArgs],
  {
    env: { ...process.env, ...fullLocalSecretEnv },
    stdio: "inherit",
  },
);

relayChildLifecycle(child, {
  errorMessage: "Unable to start the Next.js production process.",
  nullExitCode: 0,
});
