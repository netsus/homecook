import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readSection(source: string, heading: string) {
  const marker = `### ${heading}`;
  const start = source.indexOf(marker);
  expect(start, `missing section: ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + marker.length);
  const nextHeading = rest.search(/^#{2,3} /mu);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function readSchemaTable(source: string, heading: string) {
  const rows = readSection(source, heading)
    .split("\n")
    .filter((line) => /^\| `[^`]+` \|/u.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        field: cells[0].replaceAll("`", ""),
        rule: cells[1],
      };
    });
  expect(rows.length, `empty schema table: ${heading}`).toBeGreaterThan(0);
  return rows;
}

describe("release promotion governance docs", () => {
  it("routes release promotion authority to the canonical runbook", () => {
    const agents = read("AGENTS.md");
    const currentPlan = read("docs/engineering/current-mac-production-plan.md");
    const releaseRunbook = read("docs/engineering/local-mac-production-release-promotion.md");
    const gitWorkflow = read("docs/engineering/git-workflow.md");
    const agentWorkflow = read("docs/engineering/agent-workflow-overview.md");
    const handoff = read("docs/engineering/codex-task-handoff.md");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(agents).toContain("docs/engineering/local-mac-production-release-promotion.md");
    expect(agents).toContain("`master` merge는 통합 evidence일 뿐 deployment approval이 아니다.");
    expect(agents).toContain("production-changing command를 실행하지 않는다.");

    expect(currentPlan).toContain("active-server release 승격 authority는 `docs/engineering/local-mac-production-release-promotion.md`가 가진다.");
    expect(currentPlan).toContain("bootstrap / rehearsal 기준이다.");
    expect(currentPlan).toContain("active-server deployment authority가 아니다");

    expect(releaseRunbook).toContain("release-promoter");
    expect(releaseRunbook).toContain("prod-*");
    expect(releaseRunbook).toContain("production-changing command");
    expect(releaseRunbook).toContain("FileVault");
    expect(releaseRunbook).toContain("app`, `full-local`, `YouTube worker`");
    expect(releaseRunbook).toContain("same-user direct shell access");
    expect(releaseRunbook).toContain("release_manifest_path");
    expect(releaseRunbook).toContain("release_lock_mode: read | write | none");
    expect(releaseRunbook).toContain("expected_running_release_sha");
    expect(releaseRunbook).toContain("tag + attestation");
    expect(releaseRunbook).toContain("build / install / restart / uninstall / db reset");
    expect(releaseRunbook).toContain("migration compatibility gate");
    expect(releaseRunbook).toContain("자동 rollback");
    expect(releaseRunbook).toContain("forward-fix");
    expect(releaseRunbook).toContain("production-release-approval");
    expect(releaseRunbook).toContain(
      "일반 development PR의 `master` 통합에는 mandatory human approval을 요구하지 않는다.",
    );
    expect(releaseRunbook).toContain(
      "human approval은 actual production release environment/tag promotion 단계에서만 요구한다.",
    );
    expect(releaseRunbook).toContain("unattributed Copilot");
    expect(releaseRunbook).toContain(
      "base approval count가 0이면 이 설정도 실제 추가 승인을 만들지 않으므로",
    );
    expect(releaseRunbook).toContain("master-only");
    expect(releaseRunbook).toContain("C1 activation_blocked");
    expect(releaseRunbook).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_ID");
    expect(releaseRunbook).toContain("HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY");
    expect(releaseRunbook).toContain("65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c");
    expect(releaseRunbook).toContain("content-addressed sealed execution snapshot");
    expect(releaseRunbook).toContain("snapshot은 실패 시 자동 삭제하지 않는다");
    expect(releaseRunbook).toContain("credential/config/policy 경로를 저장하지 않는다");

    expect(gitWorkflow).toContain("`master` merge는 통합 evidence다. production deployment approval은 아니다.");
    expect(gitWorkflow).toContain("prod-*");
    expect(gitWorkflow).toContain("release-promoter");

    expect(agentWorkflow).toContain("release promotion governance runbook");
    expect(agentWorkflow).toContain("서버 Mac release promotion governance는 `docs-governance`로 분류한다.");

    expect(handoff).toContain("production_mutation: false | release-promoter");
    expect(handoff).toContain("approved_release_sha: <full SHA or N/A>");
    expect(handoff).toContain("approved_release_tag: <prod tag or N/A>");
    expect(handoff).toContain("promotion_id: <id or N/A>");
    expect(handoff).toContain("release_lock_mode: read | write | none");
    expect(handoff).toContain("operator_approval_attestation: <artifact reference or N/A>");
    expect(handoff).toContain("expected_running_release_sha: <full SHA or N/A>");
    expect(handoff).toContain("release_manifest_path: <path or N/A>");

    expect(packageJson.scripts?.["release:production:plan"]).toBeTruthy();
    expect(packageJson.scripts?.["release:production:prepare"]).toBeTruthy();
    expect(packageJson.scripts?.["release:production:promote"]).toBeTruthy();
    expect(packageJson.scripts?.["release:production:status"]).toBeTruthy();
    expect(packageJson.scripts?.["release:production:verify"]).toBeTruthy();
  });

  it("separates untagged exact-SHA rehearsal from production authority", () => {
    const sourceOfTruth = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const currentPlan = read("docs/engineering/current-mac-production-plan.md");
    const releaseRunbook = read("docs/engineering/local-mac-production-release-promotion.md");
    const rehearsalContract = read(
      "docs/engineering/local-mac-production-release-rehearsal.md",
    );
    const workflowEntry = read("docs/engineering/workflow-v2/README.md");

    expect(sourceOfTruth).toContain(
      "docs/engineering/local-mac-production-release-rehearsal.md",
    );
    expect(currentPlan).toContain(
      "rehearsal authority는 `docs/engineering/local-mac-production-release-rehearsal.md`",
    );
    expect(releaseRunbook).toContain(
      "production promote의 receipt gate는 `docs/engineering/local-mac-production-release-rehearsal.md`",
    );
    expect(workflowEntry).toContain(
      "docs/engineering/local-mac-production-release-rehearsal.md",
    );

    expect(rehearsalContract).toContain("상태: **canonical / implementation split 1 in review**");
    expect(rehearsalContract).toContain("untagged exact-SHA candidate");
    expect(rehearsalContract).toContain("production authority tag");
    expect(rehearsalContract).toContain("동일 bytes");
    expect(rehearsalContract).toContain("O_NOFOLLOW");
    expect(rehearsalContract).toContain("external network");
    expect(rehearsalContract).toContain("synthetic fixtures");
    expect(rehearsalContract).toContain("no-production-mutation evidence");
    expect(rehearsalContract).toContain("mixed-state classify");
    expect(rehearsalContract).toContain("자동 복구");
    expect(rehearsalContract).toContain("최소 2회");
    expect(rehearsalContract).toContain("TDD acceptance");
    expect(rehearsalContract).toContain("독립 Codex security review");
    expect(rehearsalContract).toContain("공식 제품 5종");
  });

  it("locks the exact individual and repeatability receipt schemas structurally", () => {
    const rehearsalContract = read(
      "docs/engineering/local-mac-production-release-rehearsal.md",
    );
    const individual = readSchemaTable(
      rehearsalContract,
      "Individual run receipt exact schema",
    );
    const repeatability = readSchemaTable(
      rehearsalContract,
      "Repeatability receipt exact schema",
    );

    expect(individual.map(({ field }) => field)).toEqual([
      "schema",
      "canonicalization",
      "repository",
      "source_ref",
      "release_sha",
      "release_tree",
      "ci_head_sha",
      "ci_check_summary_digest",
      "build_id",
      "sealed_bundle_digest",
      "bundle_manifest_digest",
      "run_id",
      "issued_at",
      "completed_at",
      "toolchain",
      "images",
      "migration",
      "fixtures",
      "isolation",
      "runtime",
      "canaries",
      "network",
      "cleanup",
      "production_guard",
      "environment_snapshot",
      "threat_controls",
      "issuer_task_id",
      "receipt_digest",
    ]);
    expect(repeatability.map(({ field }) => field)).toEqual([
      "schema",
      "canonicalization",
      "repository",
      "source_ref",
      "release_sha",
      "release_tree",
      "build_id",
      "sealed_bundle_digest",
      "member_receipt_digests",
      "member_run_ids",
      "member_resource_identity_digests",
      "toolchain_digest",
      "image_set_digest",
      "migration_ledger_digest",
      "canary_set_digest",
      "cleanup_evidence_digests",
      "production_guard_digests",
      "completed_at",
      "valid_until",
      "status",
      "issuer_task_id",
      "repeatability_receipt_digest",
    ]);

    const repeatabilityRules = Object.fromEntries(
      repeatability.map(({ field, rule }) => [field, rule]),
    );
    const individualRules = Object.fromEntries(
      individual.map(({ field, rule }) => [field, rule]),
    );
    expect(individualRules.toolchain).toContain("candidate_builder");
    expect(individualRules.images).toContain("local_cache_provenance_digest");
    expect(individualRules.migration).toContain("applied_global_ledger_digest");
    expect(individualRules.isolation).toContain("resource_identity_digest");
    expect(individualRules.canaries).toContain("normalized_result_digest");
    expect(individualRules.cleanup).toContain("residue_resource_ids");
    expect(individualRules.production_guard).toContain(
      "production_snapshot_pre_digest",
    );
    expect(individualRules.production_guard).toContain(
      "production_snapshot_post_digest",
    );
    expect(individualRules.production_guard).toContain("mutation_attempt_count");
    expect(repeatabilityRules.member_receipt_digests).toContain("exact 2");
    expect(repeatabilityRules.member_receipt_digests).toContain("ascending");
    expect(repeatabilityRules.valid_until).toContain("completed_at + 24h");
    expect(repeatabilityRules.repeatability_receipt_digest).toContain(
      "repeatability_receipt_digest 제외",
    );
  });

  it("locks production manifest, predicate, tag, and server-verifier receipt binding", () => {
    const releaseRunbook = read(
      "docs/engineering/local-mac-production-release-promotion.md",
    );
    const binding = readSchemaTable(
      releaseRunbook,
      "Rehearsal authority binding exact fields",
    );

    expect(binding.map(({ field }) => field)).toEqual([
      "rehearsal_receipt_schema",
      "sealed_bundle_digest",
      "repeatability_receipt_digest",
      "rehearsal_receipt_valid_until",
    ]);
    for (const { rule } of binding) {
      expect(rule).toContain("manifest");
      expect(rule).toContain("subject");
      expect(rule).toContain("predicate");
      expect(rule).toContain("server verifier");
    }
    expect(releaseRunbook).toContain("activation_blocked: true");
    expect(releaseRunbook).toContain("local task/session ID는 감사 metadata일 뿐");
  });

  it("uses sealed_bundle_digest as the only rehearsal authority field name", () => {
    const rehearsalContract = read(
      "docs/engineering/local-mac-production-release-rehearsal.md",
    );
    const releaseRunbook = read(
      "docs/engineering/local-mac-production-release-promotion.md",
    );

    expect(rehearsalContract).toContain("`sealed_bundle_digest`");
    expect(releaseRunbook).toContain("`sealed_bundle_digest`");
    expect(rehearsalContract).not.toContain("`bundle_digest`");
    expect(releaseRunbook).not.toContain("`bundle_digest`");
  });
});
