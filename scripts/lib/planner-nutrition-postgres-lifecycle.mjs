import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

/** @typedef {{ status: number | null }} PlannerNutritionPostgresCommandResult */
/**
 * @typedef {{
 *   root: string,
 *   dataDirectory: string,
 *   pgCtlPath: string,
 *   lifecycleState?: { startAttempted: boolean, started: boolean },
 *   command?: (commandName: string, args: string[]) => PlannerNutritionPostgresCommandResult,
 *   pathExists?: (target: string) => boolean,
 *   readText?: (target: string, encoding: "utf8") => string,
 *   isProcessAlive?: (pid: number) => boolean,
 *   removeRoot?: (target: string) => void,
 * }} PlannerNutritionPostgresCleanupOptions
 */

function defaultCommand(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function defaultProcessIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function readPostmasterPid(dataDirectory, pathExists, readText) {
  const pidPath = path.join(dataDirectory, "postmaster.pid");
  if (!pathExists(pidPath)) return null;
  try {
    const pid = Number.parseInt(readText(pidPath, "utf8").split("\n", 1)[0] ?? "", 10);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clusterIsRunning({
  dataDirectory,
  pgCtlPath,
  command,
  pathExists,
  readText,
  isProcessAlive,
}) {
  if (!pathExists(dataDirectory)) return false;
  const status = command(pgCtlPath, ["-D", dataDirectory, "status"]);
  const pid = readPostmasterPid(dataDirectory, pathExists, readText);
  return status.status === 0 || (pid !== null && isProcessAlive(pid));
}

export async function runPlannerNutritionPostgresLifecycle({
  createRoot,
  reservePort,
  run,
  cleanup,
}) {
  const root = createRoot();
  const state = { startAttempted: false, started: false };
  try {
    const port = await reservePort();
    return await run({ root, port, state });
  } finally {
    await cleanup({ root, state });
  }
}

/** @param {PlannerNutritionPostgresCleanupOptions} options */
export function cleanupPlannerNutritionPostgresCluster({
  root,
  dataDirectory,
  pgCtlPath,
  lifecycleState,
  command = defaultCommand,
  pathExists = existsSync,
  readText = readFileSync,
  isProcessAlive = defaultProcessIsAlive,
  removeRoot = (target) => rmSync(target, { recursive: true, force: true }),
}) {
  const probe = () => clusterIsRunning({
    dataDirectory,
    pgCtlPath,
    command,
    pathExists,
    readText,
    isProcessAlive,
  });
  const clusterMayExist = lifecycleState?.startAttempted === true ||
    lifecycleState?.started === true || pathExists(dataDirectory);

  if (clusterMayExist && probe()) {
    const fastStop = command(pgCtlPath, [
      "-D", dataDirectory, "-m", "fast", "-w", "stop",
    ]);
    if (fastStop.status !== 0 || probe()) {
      command(pgCtlPath, [
        "-D", dataDirectory, "-m", "immediate", "-w", "stop",
      ]);
    }
  }

  if (clusterMayExist && probe()) {
    throw new Error(
      `Planner nutrition PostgreSQL cleanup failed; live cluster data preserved at ${dataDirectory}`,
    );
  }

  removeRoot(root);
  if (pathExists(root)) {
    throw new Error("Planner nutrition PostgreSQL temporary directory cleanup failed");
  }
}
