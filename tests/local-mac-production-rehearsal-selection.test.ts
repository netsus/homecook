import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  REHEARSAL_SELECTION_CONFIRMATION,
  authorizeRehearsalCandidateSource,
  buildRehearsalSelection,
  parseAndValidateRehearsalSelection,
  readRehearsalSelectionAuthority,
  writeRehearsalSelectionCreateOnly,
} from "../scripts/lib/local-mac-production-rehearsal-selection.mjs";
import { canonicalizeJcs } from "../scripts/lib/rfc8785-jcs.mjs";

const SELECTED_SHA = "1".repeat(40);
const SELECTED_TREE = "2".repeat(40);
const OBSERVED_MASTER_SHA = "3".repeat(40);
const OBSERVED_MASTER_TREE = "4".repeat(40);
const NOW = new Date("2026-08-31T03:00:00.000Z");

function privateDirectory() {
  const root = mkdtempSync(join(tmpdir(), "homecook-rehearsal-selection-"));
  chmodSync(root, 0o700);
  const selections = join(root, "selections");
  mkdirSync(selections, { mode: 0o700 });
  return realpathSync(selections);
}

function validSelectionInput() {
  return {
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    selected_release_sha: SELECTED_SHA,
    selected_release_tree: SELECTED_TREE,
    observed_master_sha: OBSERVED_MASTER_SHA,
    observed_master_tree: OBSERVED_MASTER_TREE,
    selected_at: "2026-08-31T02:55:00.000Z",
    valid_until: "2026-08-31T07:00:00.000Z",
    approval: {
      approved_by: "release-coordinator",
      approval_id: "approval-20260831-001",
      issuer_task_id: "019ff12c-dc8b-7752-9319-398a68cacb6e",
      confirmation_digest: "",
    },
  };
}

function validSelection() {
  return buildRehearsalSelection({
    ...validSelectionInput(),
    confirmation: REHEARSAL_SELECTION_CONFIRMATION,
  });
}

function history(overrides: Record<string, unknown> = {}) {
  return {
    shallow: false,
    selected_commit_exists: true,
    observed_master_commit_exists: true,
    selected_tree: SELECTED_TREE,
    observed_master_tree: OBSERVED_MASTER_TREE,
    selected_is_ancestor_of_observed_master: true,
    merge_base_sha: SELECTED_SHA,
    ...overrides,
  };
}

describe("release rehearsal selection artifact", () => {
  it("builds a closed JCS artifact with separate approval and artifact digests", () => {
    const selection = validSelection();
    const parsed = parseAndValidateRehearsalSelection(canonicalizeJcs(selection), { now: NOW });

    expect(parsed).toEqual(selection);
    expect(parsed).toMatchObject({
      schema: "homecook.local-mac-production-rehearsal-selection.v1",
      canonicalization: "RFC8785-JCS+SHA256",
      repository: "netsus/homecook",
      source_ref: "refs/heads/master",
      selected_release_sha: SELECTED_SHA,
      selected_release_tree: SELECTED_TREE,
      observed_master_sha: OBSERVED_MASTER_SHA,
      observed_master_tree: OBSERVED_MASTER_TREE,
      local_authority: "rehearsal-selection-only",
    });
    expect(selection.approval.confirmation_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(selection.approval_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(selection.selection_digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set([
      selection.approval.confirmation_digest,
      selection.approval_digest,
      selection.selection_digest,
    ]).size).toBe(3);
  });

  it("rejects unknown, duplicate, digest-tampered, stale, and future-dated artifacts", () => {
    const selection = validSelection();
    expect(() => parseAndValidateRehearsalSelection(
      canonicalizeJcs({ ...selection, authority: "production" }),
      { now: NOW },
    )).toThrow(/unknown|authority/iu);
    expect(() => parseAndValidateRehearsalSelection(
      canonicalizeJcs(selection).replace('"repository":', '"repository":"netsus/homecook","repository":'),
      { now: NOW },
    )).toThrow(/duplicate/iu);
    expect(() => parseAndValidateRehearsalSelection(
      canonicalizeJcs({ ...selection, selected_release_tree: "5".repeat(40) }),
      { now: NOW },
    )).toThrow(/digest/iu);
    expect(() => parseAndValidateRehearsalSelection(
      canonicalizeJcs(buildRehearsalSelection({
        ...validSelectionInput(),
        confirmation: REHEARSAL_SELECTION_CONFIRMATION,
        valid_until: NOW.toISOString(),
      })),
      { now: NOW },
    )).toThrow(/expired/iu);
    expect(() => parseAndValidateRehearsalSelection(
      canonicalizeJcs(buildRehearsalSelection({
        ...validSelectionInput(),
        confirmation: REHEARSAL_SELECTION_CONFIRMATION,
        selected_at: "2026-08-31T03:00:00.001Z",
      })),
      { now: NOW },
    )).toThrow(/future/iu);
    expect(() => buildRehearsalSelection({
      ...validSelectionInput(),
      confirmation: REHEARSAL_SELECTION_CONFIRMATION,
      valid_until: "2026-09-01T02:55:00.001Z",
    })).toThrow(/24|expiry|valid_until/iu);
  });

  it("writes once and reads only a private uid-owned mode-0600 nlink-1 regular file", () => {
    const parent = privateDirectory();
    const path = join(parent, "selection.json");
    const selection = validSelection();

    writeRehearsalSelectionCreateOnly({ path, selection, now: NOW });
    expect(lstatSync(path).mode & 0o7777).toBe(0o600);
    expect(lstatSync(path).uid).toBe(process.getuid?.());
    expect(lstatSync(path).nlink).toBe(1);
    expect(readRehearsalSelectionAuthority(path, { now: NOW }).selection).toEqual(selection);
    expect(() => writeRehearsalSelectionCreateOnly({ path, selection, now: NOW })).toThrow(/exists|create-only/iu);

    const hardlink = join(parent, "selection-hardlink.json");
    linkSync(path, hardlink);
    expect(() => readRehearsalSelectionAuthority(path, { now: NOW })).toThrow(/nlink|hard.?link/iu);
  });

  it("rejects symlink targets, public parents, and path replacement during a read", () => {
    const parent = privateDirectory();
    const realPath = join(parent, "real.json");
    writeFileSync(realPath, canonicalizeJcs(validSelection()), { mode: 0o600 });
    const symlinkPath = join(parent, "selection-link.json");
    symlinkSync(realPath, symlinkPath);
    expect(() => readRehearsalSelectionAuthority(symlinkPath, { now: NOW })).toThrow(/symlink|nofollow|regular/iu);

    const publicParent = mkdtempSync(join(tmpdir(), "homecook-rehearsal-selection-public-"));
    chmodSync(publicParent, 0o755);
    const publicPath = join(publicParent, "selection.json");
    writeFileSync(publicPath, canonicalizeJcs(validSelection()), { mode: 0o600 });
    expect(() => readRehearsalSelectionAuthority(publicPath, { now: NOW })).toThrow(/private|0700/iu);

    expect(() => readRehearsalSelectionAuthority(realPath, {
      now: NOW,
      afterOpen: () => chmodSync(realPath, 0o400),
    })).toThrow(/identity|changed|0600/iu);
  });
});

describe("release rehearsal candidate source authorization", () => {
  it("keeps current-tip candidate compatibility without a selection artifact", async () => {
    const resolveHistory = vi.fn();
    const result = await authorizeRehearsalCandidateSource({
      releaseSha: OBSERVED_MASTER_SHA,
      observedMasterSha: OBSERVED_MASTER_SHA,
      observedMasterTree: OBSERVED_MASTER_TREE,
      selectionAuthority: null,
      now: NOW,
      resolveHistory,
    });

    expect(result).toEqual({
      mode: "current-tip",
      release_sha: OBSERVED_MASTER_SHA,
      release_tree: OBSERVED_MASTER_TREE,
      observed_master_sha: OBSERVED_MASTER_SHA,
      observed_master_tree: OBSERVED_MASTER_TREE,
      selection_digest: null,
      selection_valid_until: null,
    });
    expect(resolveHistory).not.toHaveBeenCalled();
  });

  it("accepts an explicitly selected exact ancestor with complete unambiguous history", async () => {
    const selectionAuthority = { selection: validSelection(), revalidate: vi.fn() };
    const resolveHistory = vi.fn().mockResolvedValue(history());
    const result = await authorizeRehearsalCandidateSource({
      releaseSha: SELECTED_SHA,
      observedMasterSha: OBSERVED_MASTER_SHA,
      observedMasterTree: OBSERVED_MASTER_TREE,
      selectionAuthority,
      now: NOW,
      resolveHistory,
    });

    expect(result).toMatchObject({
      mode: "approved-ancestor",
      release_sha: SELECTED_SHA,
      release_tree: SELECTED_TREE,
      observed_master_sha: OBSERVED_MASTER_SHA,
      observed_master_tree: OBSERVED_MASTER_TREE,
      selection_digest: selectionAuthority.selection.selection_digest,
      selection_valid_until: "2026-08-31T07:00:00.000Z",
    });
    expect(resolveHistory).toHaveBeenCalledWith({
      selectedSha: SELECTED_SHA,
      observedMasterSha: OBSERVED_MASTER_SHA,
    });
  });

  it("rejects a raw ancestor without selection and any non-ancestor, shallow, ambiguous, or tree-mismatched history", async () => {
    const base = {
      releaseSha: SELECTED_SHA,
      observedMasterSha: OBSERVED_MASTER_SHA,
      observedMasterTree: OBSERVED_MASTER_TREE,
      now: NOW,
    };
    await expect(authorizeRehearsalCandidateSource({
      ...base,
      selectionAuthority: null,
      resolveHistory: vi.fn(),
    })).rejects.toThrow(/selection.*required|raw ancestor/iu);

    for (const invalidHistory of [
      history({ selected_is_ancestor_of_observed_master: false }),
      history({ shallow: true }),
      history({ selected_commit_exists: false }),
      history({ merge_base_sha: "5".repeat(40) }),
      history({ selected_tree: "5".repeat(40) }),
      history({ observed_master_tree: "5".repeat(40) }),
    ]) {
      await expect(authorizeRehearsalCandidateSource({
        ...base,
        selectionAuthority: { selection: validSelection(), revalidate: vi.fn() },
        resolveHistory: vi.fn().mockResolvedValue(invalidHistory),
      })).rejects.toThrow(/history|ancestor|tree|commit|ambiguous|shallow/iu);
    }
  });

  it("does not re-read a later origin/master value after candidate authorization begins", async () => {
    const laterMaster = "9".repeat(40);
    const laterTree = "8".repeat(40);
    const resolveHistory = vi.fn().mockResolvedValue(history({
      observed_master_tree: laterTree,
      selection_observed_master_commit_exists: true,
      selection_observed_master_tree: OBSERVED_MASTER_TREE,
      selected_is_ancestor_of_selection_observed_master: true,
      selection_observed_master_is_ancestor_of_current: true,
      selection_observed_master_merge_base_sha: OBSERVED_MASTER_SHA,
    }));
    const result = await authorizeRehearsalCandidateSource({
      releaseSha: SELECTED_SHA,
      observedMasterSha: laterMaster,
      observedMasterTree: laterTree,
      selectionAuthority: { selection: validSelection(), revalidate: vi.fn() },
      now: NOW,
      resolveHistory,
    });

    expect(resolveHistory).toHaveBeenCalledTimes(1);
    expect(result.release_sha).toBe(SELECTED_SHA);
    expect(result.release_tree).toBe(SELECTED_TREE);
    expect(result.observed_master_sha).toBe(laterMaster);
  });
});

describe("release rehearsal selection schema", () => {
  it("publishes the same closed required field set used by the runtime", () => {
    const schema = JSON.parse(readFileSync(
      "scripts/schemas/local-mac-production-rehearsal-selection.schema.json",
      "utf8",
    ));
    expect(schema).toMatchObject({
      $id: "homecook.local-mac-production-rehearsal-selection.v1",
      type: "object",
      additionalProperties: false,
      required: [
        "schema",
        "canonicalization",
        "repository",
        "source_ref",
        "selected_release_sha",
        "selected_release_tree",
        "observed_master_sha",
        "observed_master_tree",
        "selected_at",
        "valid_until",
        "local_authority",
        "approval",
        "approval_digest",
        "selection_digest",
      ],
    });
    expect(schema.properties.approval.additionalProperties).toBe(false);
  });
});
