import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

function unavailableFullBundleRollback() {
  throw new Error(
    "Full campaign bundle rollback requires the active production lock and transactional app/full-local/worker recovery adapter.",
  );
}

function unavailableFullBundlePromotion() {
  throw new Error(
    "Full campaign bundle promotion requires the production lock and transactional app/full-local/worker adapter.",
  );
}

function authorityVerifyArgs(root) {
  const inputs = join(root, "campaign-inputs");
  return [
    "verify",
    "--manifest", join(root, "campaign-manifest.json"),
    "--attestation-authority", join(root, "campaign-attestation-authority.json"),
    "--attestation-bundle", join(root, "attestation.jsonl"),
    "--predicate", join(root, "campaign-predicate.json"),
    "--check-runs", join(inputs, "check-runs.json"),
    "--bundle", join(inputs, "bundle.tar"),
    "--backup-archive", join(inputs, "backup.archive"),
    "--bundle-authority", join(inputs, "bundle-authority.json"),
    "--rehearsal-receipt", join(inputs, "rehearsal-receipt.json"),
    "--production-snapshot", join(inputs, "production-snapshot.json"),
    "--backup-receipt", join(inputs, "backup-receipt.json"),
    "--approval-authority", join(inputs, "approval-authority.json"),
    "--live-inventory", join(root, "live-production-inventory.json"),
    "--json",
  ];
}

export function createDefaultCampaignReleaseOperations({
  runHelper = runExistingHelper,
  runFullBundleRollback = unavailableFullBundleRollback,
  runFullBundlePromotion = unavailableFullBundlePromotion,
} = {}) {
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
    verify(options) {
      const root = requireAbsolute(options.authorityRoot, "--authority-root");
      return runHelper(
        "scripts/marketing-campaign-fast-release-authority.mjs",
        authorityVerifyArgs(root),
      );
    },
    promote(options, { clock }) {
      const root = requireAbsolute(options.authorityRoot, "--authority-root");
      const verified = runHelper(
        "scripts/marketing-campaign-fast-release-authority.mjs",
        authorityVerifyArgs(root),
      );
      return runFullBundlePromotion({ authorityRoot: root, clock, verified });
    },
    rollback(options) {
      if (!options.activeTransaction) throw new Error("rollback requires --active-transaction.");
      if (!options.authorityRoot) throw new Error("rollback requires --authority-root.");
      return runFullBundleRollback({
        activeTransactionPath: requireAbsolute(options.activeTransaction, "--active-transaction"),
        authorityRoot: requireAbsolute(options.authorityRoot, "--authority-root"),
      });
    },
  });
}
