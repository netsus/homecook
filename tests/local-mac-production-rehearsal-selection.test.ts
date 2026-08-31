import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as selectionModule from "../scripts/lib/local-mac-production-rehearsal-selection.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";

const temporaryRoots: string[] = [];
const NOW = new Date("2026-08-31T00:00:00.000Z");

function temporaryRoot(label: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), label)));
  temporaryRoots.push(root);
  return root;
}

function buildSelection(overrides: Record<string, unknown> = {}) {
  return selectionModule.buildRehearsalSelection({
    schema: selectionModule.REHEARSAL_SELECTION_SCHEMA,
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    selected_sha: "a".repeat(40),
    selected_tree: "b".repeat(40),
    observed_master_sha: "c".repeat(40),
    observed_master_tree: "d".repeat(40),
    selected_at: NOW.toISOString(),
    expires_at: "2026-08-31T12:00:00.000Z",
    approver_role: "human-release-approver",
    approver_id: "user-release-approval",
    approval_digest: "e".repeat(64),
    ...overrides,
  }, { now: NOW });
}

function createSelectionArtifact() {
  const root = temporaryRoot("homecook-selection-read-");
  const artifactRootInput = join(root, "selections");
  mkdirSync(artifactRootInput, { mode: 0o700 });
  chmodSync(artifactRootInput, 0o700);
  const artifactRoot = realpathSync(artifactRootInput);
  const selection = buildSelection();
  const path = selectionModule.writeRehearsalSelectionCreateOnly({
    selection,
    selectionRoot: artifactRoot,
    repoRoot: process.cwd(),
    now: NOW,
  });
  return { path, selection };
}

function git(cwd: string, args: string[]) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "selection@test.invalid",
      GIT_AUTHOR_NAME: "Selection Test",
      GIT_COMMITTER_EMAIL: "selection@test.invalid",
      GIT_COMMITTER_NAME: "Selection Test",
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function createGitHistory() {
  const root = temporaryRoot("homecook-selection-git-");
  const origin = join(root, "origin.git");
  const repository = join(root, "repository");
  mkdirSync(origin);
  mkdirSync(repository);
  git(origin, ["init", "--bare", "--initial-branch=master"]);
  git(repository, ["init", "--initial-branch=master"]);
  git(repository, ["remote", "add", "origin", origin]);
  writeFileSync(join(repository, "release.txt"), "ancestor\n");
  git(repository, ["add", "release.txt"]);
  git(repository, ["commit", "-m", "ancestor"]);
  const selectedSha = git(repository, ["rev-parse", "HEAD"]);
  const selectedTree = git(repository, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(repository, "release.txt"), "current\n");
  git(repository, ["commit", "-am", "current"]);
  const observedMasterSha = git(repository, ["rev-parse", "HEAD"]);
  const observedMasterTree = git(repository, ["rev-parse", "HEAD^{tree}"]);
  git(repository, ["push", "-u", "origin", "master"]);
  return { origin: realpathSync(origin), repository: realpathSync(repository), selectedSha, selectedTree, observedMasterSha, observedMasterTree };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release rehearsal selection authority", () => {
  it("publishes a closed canonical selection schema", () => {
    const schema = JSON.parse(readFileSync(
      "scripts/schemas/local-mac-production-rehearsal-selection.schema.json",
      "utf8",
    ));
    expect(schema).toMatchObject({
      $id: selectionModule.REHEARSAL_SELECTION_SCHEMA,
      additionalProperties: false,
      required: [
        "schema", "canonicalization", "repository", "source_ref", "selected_sha", "selected_tree",
        "observed_master_sha", "observed_master_tree", "selected_at", "expires_at", "approver_role",
        "approver_id", "approval_digest", "selection_digest",
      ],
    });
  });

  it("reads the private canonical artifact through stable no-follow file authority", () => {
    const { path, selection } = createSelectionArtifact();

    const readSelection = (selectionModule as unknown as {
      readRehearsalSelectionArtifact?: (path: string, options: { repoRoot: string; now: Date }) => unknown;
    }).readRehearsalSelectionArtifact;
    if (typeof readSelection !== "function") throw new Error("selection reader is unavailable");
    const result = readSelection(path, { repoRoot: process.cwd(), now: NOW });

    expect(result).toEqual(selection);
    expect(readFileSync(path, "utf8")).toBe(canonicalizeJcs(selection));
  });

  it("resolves an approved full-history origin/master ancestor and both exact trees", () => {
    const history = createGitHistory();

    const result = selectionModule.resolveRehearsalSelectionSource({
      releaseSha: history.selectedSha,
      rootDir: history.repository,
    });

    expect(result).toEqual({
      selected_sha: history.selectedSha,
      selected_tree: history.selectedTree,
      observed_master_sha: history.observedMasterSha,
      observed_master_tree: history.observedMasterTree,
    });
  });

  it("rejects overwrite, expiry, digest tampering, and same-path substitution", () => {
    const { path, selection } = createSelectionArtifact();
    const selectionRoot = realpathSync(dirname(path));
    expect(() => selectionModule.writeRehearsalSelectionCreateOnly({
      selection,
      selectionRoot,
      repoRoot: process.cwd(),
      now: NOW,
    })).toThrow(/create|exist|duplicate|overwrite/iu);

    expect(() => selectionModule.validateRehearsalSelection(selection, {
      now: new Date(selection.expires_at),
      requireFresh: true,
    })).toThrow(/expired|valid|fresh/iu);

    writeFileSync(path, canonicalizeJcs({ ...selection, approver_id: "tampered" }), { mode: 0o600 });
    expect(() => selectionModule.readRehearsalSelectionArtifact(path, {
      repoRoot: process.cwd(),
      now: NOW,
    })).toThrow(/digest|canonical|invalid|selection/iu);

    writeFileSync(path, canonicalizeJcs(selection), { mode: 0o600 });
    const movedPath = `${path}.moved`;
    expect(() => selectionModule.readRehearsalSelectionArtifact(path, {
      repoRoot: process.cwd(),
      now: NOW,
      afterOpen: () => {
        renameSync(path, movedPath);
        writeFileSync(path, canonicalizeJcs(selection), { mode: 0o600 });
      },
    })).toThrow(/changed|identity|parent|path|race/iu);
  });

  it("keeps a selected ancestor valid after normal master advancement but rejects force-push divergence", () => {
    const history = createGitHistory();
    const selection = buildSelection({
      selected_sha: history.selectedSha,
      selected_tree: history.selectedTree,
      observed_master_sha: history.observedMasterSha,
      observed_master_tree: history.observedMasterTree,
    });
    writeFileSync(join(history.repository, "release.txt"), "advanced\n");
    git(history.repository, ["commit", "-am", "advance master"]);
    const advancedMasterSha = git(history.repository, ["rev-parse", "HEAD"]);
    git(history.repository, ["push", "origin", "master"]);

    const resolveCandidateAuthority = (selectionModule as unknown as {
      resolveCandidateRehearsalSourceAuthority?: (input: {
        releaseSha: string;
        rootDir: string;
        selection: ReturnType<typeof buildSelection>;
      }) => Record<string, unknown>;
    }).resolveCandidateRehearsalSourceAuthority;
    if (typeof resolveCandidateAuthority !== "function") throw new Error("candidate selection resolver is unavailable");
    expect(resolveCandidateAuthority({
      releaseSha: history.selectedSha,
      rootDir: history.repository,
      selection,
    })).toMatchObject({
      mode: "approved_ancestor",
      current_master_sha: advancedMasterSha,
      release_sha: history.selectedSha,
      release_tree: history.selectedTree,
      selection_digest: selection.selection_digest,
    });

    git(history.repository, ["checkout", "--orphan", "rewritten"]);
    writeFileSync(join(history.repository, "release.txt"), "rewritten\n");
    git(history.repository, ["add", "release.txt"]);
    git(history.repository, ["commit", "-m", "rewrite master"]);
    git(history.repository, ["push", "--force", "origin", "HEAD:master"]);

    expect(() => resolveCandidateAuthority({
      releaseSha: history.selectedSha,
      rootDir: history.repository,
      selection,
    })).toThrow(/force|diverg|ancestor|observed|master/iu);
  });

  it("rejects shallow fetched history before accepting even a current-tip selection source", () => {
    const history = createGitHistory();
    const shallowRoot = temporaryRoot("homecook-selection-shallow-");
    const shallowRepository = join(shallowRoot, "repository");
    git(shallowRoot, ["clone", "--depth", "1", `file://${history.origin}`, shallowRepository]);

    expect(() => selectionModule.resolveRehearsalSelectionSource({
      releaseSha: history.observedMasterSha,
      rootDir: shallowRepository,
    })).toThrow(/shallow|history|ambiguous/iu);
  });
});
