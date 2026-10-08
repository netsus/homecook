#!/usr/bin/env node
import {
  executePrelaunchYoutubeWorkerInstall,
  loadPrelaunchYoutubeWorkerInstallManifest,
  PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION,
  preparePrelaunchYoutubeWorkerInstall,
} from "./lib/prelaunch-youtube-worker-install.mjs";

async function main(argv = process.argv.slice(2)) {
  if (argv.length && !(argv.length === 2 && argv[0] === "--execute" && argv[1] === PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION)) {
    throw new Error(`Usage: node scripts/install-prelaunch-youtube-worker.mjs [--execute ${PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION}]`);
  }
  const manifest = await loadPrelaunchYoutubeWorkerInstallManifest();
  const prepared = await preparePrelaunchYoutubeWorkerInstall(manifest);
  if (!argv.length) return { status: "ready-dry-run", changed: false, plan: prepared.plan };
  return executePrelaunchYoutubeWorkerInstall(prepared, argv[1]);
}

main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "prelaunch worker install failed"}\n`); process.exitCode = 1; });
