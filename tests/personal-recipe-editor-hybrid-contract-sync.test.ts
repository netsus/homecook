import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "personal-recipe-editor-decoupling";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

describe("personal recipe editor hybrid contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;

  it("uses only the current official document tuple", () => {
    const workItem = readJson(workItemPath);
    const docsRefs = workItem.docs_refs as Record<string, unknown>;
    const readme = read(readmePath);
    const acceptance = read(acceptancePath);

    expect(docsRefs.source_of_truth).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.26.md",
      "docs/화면정의서-v1.5.30.md",
      "docs/유저flow맵-v1.3.28.md",
      "docs/db설계-v1.3.27.md",
      "docs/api문서-v1.2.30.md",
    ]);
    expect(readme).toContain("docs/요구사항기준선-v1.7.26.md");
    expect(readme).toContain("docs/api문서-v1.2.30.md");
    expect(acceptance).toContain("요구사항기준선-v1.7.26.md");
    expect(acceptance).toContain("api문서-v1.2.30.md");
    expect(readme).not.toContain("requirements v1.7.25");
    expect(acceptance).not.toContain("api문서-v1.2.29.md");
  });

  it("records the actual predecessor state without making slice 4 a slice 5 dependency", () => {
    const readme = read(readmePath);
    const workItem = readJson(workItemPath);
    const dependencies = workItem.dependencies as string[];
    const roadmap = read("docs/workpacks/README.md");

    expect(readme).toContain("recipe-visibility-read-hardening` PR #1228");
    expect(readme).toContain("31-recipe-media-tags");
    expect(readme).toContain("36e-recipe-tags-frontend");
    expect(readme).toContain("PR #1218");
    expect(readme).toContain("PR #1219");
    expect(readme).toContain("hybrid delta/reverification");
    expect(readme).toContain("#4 is not a #5 implementation predecessor");
    expect(dependencies).toContain(
      "recipe-visibility-read-hardening Stage 2 through Stage 6 merged as PR #1228",
    );
    expect(dependencies.some((dependency) => dependency.includes("#4"))).toBe(false);
    expect(roadmap).toMatch(
      /\|\s*3\s*\|\s*B\s*\|\s*`recipe-visibility-read-hardening`\s*\|\s*merged\s*\|[^|]*PR #1228/,
    );
    expect(roadmap).toMatch(
      /\|\s*4\s*\|\s*B\s*\|\s*`recipe-snapshot-authority-foundation`\s*\|\s*in-progress\s*\|/,
    );
    expect(roadmap).toMatch(
      /\|\s*5\s*\|\s*C\s*\|\s*`personal-recipe-editor-decoupling`\s*\|\s*docs\s*\|\s*#3;/,
    );
  });

  it("locks the hybrid boundary in machine-readable automation and acceptance IDs", () => {
    const automation = readJson(automationPath);
    const backend = automation.backend as Record<string, unknown>;
    const invariants = backend.invariants as string[];
    const backendVerifyCommands = backend.verify_commands as string[];
    const blockedConditions = automation.blocked_conditions as string[];
    const acceptance = read(acceptancePath);

    expect(invariants).toEqual(
      expect.arrayContaining([
        "hybrid-remote-auth-control-plane-and-local-application-data-storage-boundary",
        "local-auth-users-zero-and-private-identity-epoch-mirror",
        "session-liveness-hmac-binding-and-exact-remote-claim-gateway",
        "browser-direct-local-data-storage-and-service-role-user-path-zero",
        "remote-application-db-storage-writes-zero",
        "external-personal-write-remains-dark",
      ]),
    );
    expect(blockedConditions).toEqual(
      expect.arrayContaining([
        "current-official-document-tuple-or-hybrid-auth-local-data-contract-drift",
        "hybrid-verifier-treated-as-existing-or-complete-without-tdd-and-merged-exact-sha-evidence",
        "local-auth-users-nonzero-browser-direct-local-data-storage-or-service-role-user-fallback",
        "remote-application-db-storage-write-or-external-personal-write-before-approved-activation",
      ]),
    );
    expect(acceptance).toContain("omo:id=accept-editor-hybrid-session-boundary");
    expect(acceptance).toContain("omo:id=accept-editor-hybrid-client-boundary");
    expect(acceptance).toContain("omo:id=accept-editor-hybrid-verifier");
    expect(backendVerifyCommands).not.toContain(
      "node scripts/verify-personal-recipe-editor-hybrid.mjs --mode post-merge-read-only",
    );
  });

  it("keeps the relock and future editor externally dark", () => {
    const readme = read(readmePath);
    const workItem = readJson(workItemPath);
    const verification = workItem.verification as Record<string, unknown>;
    const requiredChecks = verification.required_checks as string[];
    const verifyCommands = verification.verify_commands as string[];
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const statusChecks = statusItem?.required_checks as string[];
    const statusNotes = statusItem?.notes as string;

    expect(readme).toContain("verify-personal-recipe-editor-hybrid.mjs");
    expect(readme).toContain("external personal write remains dark");
    expect(readme).toContain("future standalone shell context reservation");
    expect(readme).toContain("does not add a new MYPAGE or RECIPEBOOK entry");
    expect(readme).toContain("390px primary 2-button row");
    expect(readme).toContain("mobile gesture-back");
    expect(readme).toContain("capability-off hides the personal CTA and route");
    expect(requiredChecks).toContain(
      "node scripts/verify-personal-recipe-editor-hybrid.mjs --mode post-merge-read-only",
    );
    expect(verifyCommands).not.toContain(
      "node scripts/verify-personal-recipe-editor-hybrid.mjs --mode post-merge-read-only",
    );
    expect(statusChecks).toContain(
      "node scripts/verify-personal-recipe-editor-hybrid.mjs --mode post-merge-read-only",
    );
    expect(statusNotes).toContain("external personal write dark");
    expect(statusNotes).toContain("future work");
  });

  it("keeps roadmap and workflow approval projections intentionally open", () => {
    const workItem = readJson(workItemPath);
    const workItemStatus = workItem.status as Record<string, unknown>;
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const workItemNotes = workItem.notes as string;
    const statusNotes = statusItem?.notes as string;
    const roadmap = read("docs/workpacks/README.md");

    expect(workItemStatus).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(statusItem).toMatchObject({
      branch: "docs/personal-recipe-editor-stage1-relock",
      pr_path: "https://github.com/netsus/homecook/pull/1237",
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(Date.parse(statusFile.updated_at as string)).toBeGreaterThanOrEqual(
      Date.parse("2026-07-30T12:47:39.000Z"),
    );
    expect(roadmap).toMatch(
      /\|\s*`personal-recipe-editor-decoupling`\s*\|\s*docs\s*\|/,
    );
    expect(workItemNotes).toContain(
      "required_checks is the full-lifecycle gate and verify_commands is the current executable subset",
    );
    expect(statusNotes).toContain(
      "required_checks is the full-lifecycle gate and verify_commands is the current executable subset",
    );
  });
});
