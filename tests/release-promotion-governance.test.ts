import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("release promotion governance docs", () => {
  it("routes release promotion authority to the canonical runbook", () => {
    const agents = read("AGENTS.md");
    const currentPlan = read("docs/engineering/current-mac-production-plan.md");
    const releaseRunbook = read("docs/engineering/local-mac-production-release-promotion.md");
    const gitWorkflow = read("docs/engineering/git-workflow.md");
    const agentWorkflow = read("docs/engineering/agent-workflow-overview.md");
    const handoff = read("docs/engineering/codex-task-handoff.md");

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
  });
});
