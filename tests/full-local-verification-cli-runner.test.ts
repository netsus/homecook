import { execFileSync } from "node:child_process";
import {
  chmodSync,
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

function fakeGitDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "homecook-full-local-git-"));
  temporaryDirectories.push(directory);
  const git = join(directory, "git");
  writeFileSync(git, `#!/bin/sh
case "$1" in
  fetch) exit 0 ;;
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
    expect(runDryRun(
      "scripts/verify-personal-recipe-editor-full-local.mjs",
    )).toMatchObject({
      ok: true,
      mode: "post-merge-full-local-read-only",
      target: "self-hosted-local-auth-db-storage-single-authority",
      source_of_record_status: "live-remote-read-only-pre-floor",
      restore_manifest_status: "pending-manual-evidence",
      external_personal_write_status: "dark",
      merge_sha: mergeSha,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    });
  });
});
