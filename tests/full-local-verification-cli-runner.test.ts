import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const mergeSha = "b96d83e55c276e7125e28b09b4999bccfbfb1a7a";
const temporaryDirectories: string[] = [];

function fakeGitDirectory({ assertHardenedEnvironment = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "homecook-full-local-git-"));
  temporaryDirectories.push(directory);
  const git = join(directory, "git");
  writeFileSync(git, `#!/bin/sh
${assertHardenedEnvironment ? `if [ "$GIT_CONFIG_GLOBAL" != "/dev/null" ] || [ "$GIT_CONFIG_NOSYSTEM" != "1" ] || [ "$GIT_SSH_COMMAND" != "ssh -F /dev/null" ]; then
  printf '%s\\n' 'unsafe git environment' >&2
  exit 9
fi` : ""}
if [ "$1" = "--no-replace-objects" ] && [ "$2" = "merge-base" ]; then
  exit 0
fi
case "$1" in
  fetch) exit 0 ;;
  remote) printf '%s\n' 'https://github.com/netsus/homecook.git' ;;
  rev-parse)
    case "$2" in
      HEAD|origin/master) printf '%s\\n' '${mergeSha}' ;;
      --git-path) printf '%s\\n' '${directory}/grafts-does-not-exist' ;;
      *) exit 2 ;;
    esac
    ;;
  merge-base) exit 0 ;;
  status) exit 0 ;;
  *) exit 2 ;;
esac
`, "utf8");
  chmodSync(git, 0o755);
  return directory;
}

function maliciousHomeDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "homecook-malicious-home-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, ".ssh"));
  writeFileSync(join(directory, ".gitconfig"), `[url "ssh://attacker.invalid/"]
  insteadOf = https://github.com/
[credential]
  helper = !printf credential-helper-ran >&2
`, "utf8");
  writeFileSync(join(directory, ".ssh", "config"), `Host *
  ProxyCommand printf ssh-config-ran >&2
`, "utf8");
  return directory;
}

function runDryRun(script: string) {
  const gitDirectory = fakeGitDirectory();
  return JSON.parse(execFileSync(
    process.execPath,
    [script, "--mode", "post-merge-full-local-read-only", "--dry-run"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        HOME: process.env.HOME,
        HOMECOOK_AUTH_AUTHORITY: "local",
        HOMECOOK_DATA_AUTHORITY: "local",
        LANG: "C.UTF-8",
        NODE_ENV: "test",
        PATH: `${gitDirectory}${delimiter}${process.env.PATH ?? ""}`,
      },
    },
  ));
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("shared full-local verification CLI runner", () => {
  it("preserves the recipe snapshot CLI dry-run contract through the shared runner", () => {
    const cli = readFileSync(
      "scripts/verify-recipe-snapshot-authority-full-local.mjs",
      "utf8",
    );

    expect(cli).toContain("full-local-verification-cli-runner.mjs");
    expect(cli).not.toContain('from "node:child_process"');
    expect(runDryRun(
      "scripts/verify-recipe-snapshot-authority-full-local.mjs",
    )).toMatchObject({
      ok: true,
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      read_only: true,
      requires_merged_origin_master: true,
      requires_clean_tree: true,
      manual_only_status: "pending",
      merge_sha: mergeSha,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
  });

  it("preserves the personal editor CLI dry-run contract through the shared runner", () => {
    const cli = readFileSync(
      "scripts/verify-personal-recipe-editor-full-local.mjs",
      "utf8",
    );

    expect(cli).toContain("full-local-verification-cli-runner.mjs");
    expect(cli).not.toContain('from "node:child_process"');
    const dryRun = runDryRun(
      "scripts/verify-personal-recipe-editor-full-local.mjs",
    );
    expect(dryRun).toMatchObject({
      ok: true,
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      source_of_record_status: "live-remote-read-only-pre-floor",
      restore_manifest_status: "pending-manual-evidence",
      external_personal_write_status: "dark",
      merge_sha: mergeSha,
      production_writes: 0,
      staging_writes: 0,
      remote_application_write_status: "not-observed-dry-run",
    });
    expect(dryRun).not.toHaveProperty("remote_application_writes");
  });

  it("blocks inherited Git global/system/SSH configuration while fetch dry-run still succeeds", () => {
    const gitDirectory = fakeGitDirectory({ assertHardenedEnvironment: true });
    const output = execFileSync(
      process.execPath,
      [
        "scripts/verify-personal-recipe-editor-full-local.mjs",
        "--mode",
        "post-merge-full-local-read-only",
        "--dry-run",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          HOME: maliciousHomeDirectory(),
          HOMECOOK_AUTH_AUTHORITY: "local",
          HOMECOOK_DATA_AUTHORITY: "local",
          LANG: "C.UTF-8",
          NODE_ENV: "test",
          PATH: `${gitDirectory}${delimiter}${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(JSON.parse(output)).toMatchObject({ ok: true, merge_sha: mergeSha });
    expect(output).not.toMatch(/attacker|credential-helper|ssh-config/iu);
  });

  it("returns an opaque error when psql emits malformed secret-bearing JSON", () => {
    const executableDirectory = fakeGitDirectory({
      assertHardenedEnvironment: true,
    });
    const psql = join(executableDirectory, "psql");
    writeFileSync(psql, `#!/bin/sh
printf '%s' '{"secret":"database-secret-sentinel"'
`, "utf8");
    chmodSync(psql, 0o755);

    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-personal-recipe-editor-full-local.mjs",
        "--mode",
        "post-merge-full-local-read-only",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          HOME: maliciousHomeDirectory(),
          HOMECOOK_AUTH_AUTHORITY: "local",
          HOMECOOK_DATA_AUTHORITY: "local",
          LANG: "C.UTF-8",
          NODE_ENV: "test",
          PATH: `${executableDirectory}${delimiter}${process.env.PATH ?? ""}`,
          PERSONAL_RECIPE_EDITOR_FULL_LOCAL_DATABASE_URL:
            "postgresql://local_user:local_password@127.0.0.1:5432/homecook_local",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/database verifier returned invalid JSON/iu);
    expect(result.stderr).not.toContain("database-secret-sentinel");
    expect(result.stdout).toBe("");
  });
});
