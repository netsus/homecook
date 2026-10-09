#!/usr/bin/env node
import {
  executeYoutubeResolutionWorkerInstall,
  loadYoutubeResolutionWorkerInstallManifest,
  prepareYoutubeResolutionWorkerInstall,
  YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION,
} from "./lib/prelaunch-youtube-resolution-worker-install.mjs";

async function main(argv = process.argv.slice(2)) {
  if (argv.length && !(argv.length === 2 && argv[0] === "--execute"
    && argv[1] === YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION)) {
    throw new Error(`Usage: node scripts/install-prelaunch-youtube-resolution-worker.mjs [--execute ${YOUTUBE_RESOLUTION_WORKER_INSTALL_CONFIRMATION}]`);
  }
  const manifest = await loadYoutubeResolutionWorkerInstallManifest();
  const prepared = await prepareYoutubeResolutionWorkerInstall(manifest);
  if (!argv.length) return { status: "ready-dry-run", changed: false, plan: prepared.plan };
  return executeYoutubeResolutionWorkerInstall(prepared, argv[1]);
}

main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "worker install failed"}\n`); process.exitCode = 1; });
