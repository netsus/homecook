import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

/** @typedef {{ status: number | null, error?: Error }} PlannerNutritionPostgresCommandResult */
/** @typedef {"running" | "stopped" | "unknown"} PlannerNutritionPostgresClusterState */
/** @typedef {"alive" | "dead" | "missing" | "unknown"} PlannerNutritionPostmasterPidState */
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

/** @returns {PlannerNutritionPostmasterPidState} */
function probePostmasterPid(dataDirectory, pathExists, readText, isProcessAlive) {
  const pidPath = path.join(dataDirectory, "postmaster.pid");
  if (!pathExists(pidPath)) return "missing";
  try {
    const pidText = (readText(pidPath, "utf8").split("\n", 1)[0] ?? "").trim();
    if (!/^[1-9]\d*$/.test(pidText)) return "unknown";
    const pid = Number.parseInt(pidText, 10);
    if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown";
    return isProcessAlive(pid) ? "alive" : "dead";
  } catch {
    return "unknown";
  }
}

function runCommandSafely(command, commandName, args) {
  try {
    return command(commandName, args);
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error : new Error("PostgreSQL command failed"),
    };
  }
}

/** @returns {PlannerNutritionPostgresClusterState} */
function probeClusterState({
  dataDirectory,
  pgCtlPath,
  command,
  pathExists,
  readText,
  isProcessAlive,
}) {
  if (!pathExists(dataDirectory)) return "stopped";

  const statusResult = runCommandSafely(
    command,
    pgCtlPath,
    ["-D", dataDirectory, "status"],
  );
  const pidState = probePostmasterPid(
    dataDirectory,
    pathExists,
    readText,
    isProcessAlive,
  );

  if (pidState === "alive") return "running";
  if (statusResult.error === undefined && statusResult.status === 0) return "running";
  if (
    statusResult.error === undefined &&
    statusResult.status === 3 &&
    (pidState === "missing" || pidState === "dead")
  ) {
    return "stopped";
  }
  return "unknown";
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
  const probe = () => probeClusterState({
    dataDirectory,
    pgCtlPath,
    command,
    pathExists,
    readText,
    isProcessAlive,
  });
  const clusterMayExist = lifecycleState?.startAttempted === true ||
    lifecycleState?.started === true || pathExists(dataDirectory);

  let clusterState = clusterMayExist ? probe() : "stopped";
  if (clusterMayExist && clusterState !== "stopped") {
    runCommandSafely(command, pgCtlPath, [
      "-D", dataDirectory, "-m", "fast", "-w", "stop",
    ]);
    clusterState = probe();
    if (clusterState !== "stopped") {
      runCommandSafely(command, pgCtlPath, [
        "-D", dataDirectory, "-m", "immediate", "-w", "stop",
      ]);
      clusterState = probe();
    }
  }

  if (clusterMayExist && clusterState === "running") {
    throw new Error(
      `Planner nutrition PostgreSQL cleanup failed; live cluster data preserved at ${dataDirectory}`,
    );
  }
  if (clusterMayExist && clusterState === "unknown") {
    throw new Error(
      `Planner nutrition PostgreSQL cleanup state could not be confirmed; data preserved at ${dataDirectory}`,
    );
  }

  removeRoot(root);
  if (pathExists(root)) {
    throw new Error("Planner nutrition PostgreSQL temporary directory cleanup failed");
  }
}
