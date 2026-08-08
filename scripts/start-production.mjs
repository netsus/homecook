import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeNextRoutesManifest } from "./lib/next-routes-manifest.mjs";
import { relayChildLifecycle } from "./lib/process-signal-relay.mjs";
import { normalizeProductionStartArgs } from "./lib/start-production-args.mjs";
import { prepareStartProductionRuntimeEnv } from "./lib/start-production-runtime.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");
const startArgs = normalizeProductionStartArgs(process.argv.slice(2));
const runtimeEnv = prepareStartProductionRuntimeEnv({ repositoryRoot });

normalizeNextRoutesManifest();

const child = spawn(
  process.execPath,
  [nextBin, "start", ...startArgs],
  {
    env: runtimeEnv,
    stdio: "inherit",
  },
);

relayChildLifecycle(child, {
  errorMessage: "Unable to start the Next.js production process.",
  nullExitCode: 0,
});
