import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

function requireAbsolute(value, label) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(`${label} must be absolute.`);
  return value;
}

function runExistingHelper(relativeScript, args, { experimentalVm = false } = {}) {
  const script = realpathSync(resolve(REPO_ROOT, relativeScript));
  const commandArgs = [...(experimentalVm ? ["--experimental-vm-modules"] : []), script, ...args];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      HOME: process.env.HOME,
      LANG: "C",
      LC_ALL: "C",
      NODE_OPTIONS: "",
      PATH: "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR,
    },
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20 * 60 * 1000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Campaign lower-level helper failed: ${relativeScript}.`);
  }
  const lines = String(result.stdout).trim().split("\n").filter(Boolean);
  try {
    return JSON.parse(lines.at(-1) ?? "{}");
  } catch {
    throw new Error(`Campaign lower-level helper returned invalid JSON: ${relativeScript}.`);
  }
}

export function createDefaultCampaignReleaseOperations({ runHelper = runExistingHelper } = {}) {
  return Object.freeze({
    plan(options) {
      if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) {
        throw new Error("plan requires --release-sha with an exact lowercase SHA.");
      }
      const result = spawnSync("/usr/bin/git", ["rev-parse", "origin/master"], {
        cwd: REPO_ROOT, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0 || String(result.stdout).trim() !== options.releaseSha) {
        throw new Error("plan release SHA must equal origin/master.");
      }
      return { command: "plan", release_sha: options.releaseSha, executable: true };
    },
    prepare(options) {
      const releaseSha = options.releaseSha;
      if (!/^[0-9a-f]{40}$/u.test(releaseSha ?? "")) {
        throw new Error("prepare requires --release-sha with an exact lowercase SHA.");
      }
      const productionEnv = requireAbsolute(options.productionEnvAuthority, "--production-env-authority");
      return runHelper("scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs", [
        "--release-sha", releaseSha,
        "--production-env-authority", productionEnv,
        ...(options.homeDir ? ["--home-dir", requireAbsolute(options.homeDir, "--home-dir")] : []),
        "--json",
      ], { experimentalVm: true });
    },
    rehearse(options) {
      return runHelper("scripts/local-mac-production-rehearsal-run.mjs", [
        "--candidate", requireAbsolute(options.candidate, "--candidate"),
        "--production-env-authority", requireAbsolute(
          options.productionEnvAuthority,
          "--production-env-authority",
        ),
        "--json",
      ]);
    },
    rollback(options) {
      if (!options.activeTransaction) throw new Error("rollback requires --active-transaction.");
      const passthrough = options.rawArgs.filter((token, index, all) => {
        if (token === "--" || token === "--json") return false;
        if (token === "--active-transaction" || all[index - 1] === "--active-transaction") return false;
        if (token === "--authority-root" || all[index - 1] === "--authority-root") return false;
        return true;
      });
      return runHelper("scripts/youtube-extraction-worker-mac-production.mjs", [
        "rollback", ...passthrough, "--json",
      ]);
    },
  });
}
