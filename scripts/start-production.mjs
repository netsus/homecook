import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { normalizeNextRoutesManifest } from "./lib/next-routes-manifest.mjs";
import { normalizeProductionStartArgs } from "./lib/start-production-args.mjs";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const startArgs = normalizeProductionStartArgs(process.argv.slice(2));

normalizeNextRoutesManifest();

const child = spawn(
  process.execPath,
  [nextBin, "start", ...startArgs],
  {
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
