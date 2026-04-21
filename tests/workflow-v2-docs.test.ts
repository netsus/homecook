import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateKnownShape,
  validateWorkflowV2DocContract,
  validateWorkflowV2Bundle,
  validateWorkflowV2Examples,
  validateWorkflowV2TrackedState,
} from "../scripts/lib/validate-workflow-v2.mjs";

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

describe("workflow v2 docs", () => {
  it("includes the expected foundation documents", () => {
    const requiredDocs = [
      "docs/engineering/workflow-v2/README.md",
      "docs/engineering/workflow-v2/charter.md",
      "docs/engineering/workflow-v2/core.md",
      "docs/engineering/workflow-v2/presets.md",
      "docs/engineering/workflow-v2/approval-and-loops.md",
      "docs/engineering/workflow-v2/promotion-readiness.md",
      "docs/engineering/workflow-v2/slice06-pilot-checklist.md",
      "docs/engineering/workflow-v2/omo-lite-architecture.md",
      "docs/engineering/workflow-v2/omo-session-orchestrator.md",
      "docs/engineering/workflow-v2/omo-claude-cli-provider.md",
      "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
      "docs/engineering/workflow-v2/omo-lite-supervisor-spec.md",
      "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
      "docs/engineering/workflow-v2/profiles/TEMPLATE.md",
      "docs/engineering/workflow-v2/profiles/homecook.md",
      "docs/engineering/workflow-v2/migration.md",
      "docs/engineering/workflow-v2/schemas/work-item.schema.json",
      "docs/engineering/workflow-v2/schemas/workflow-status.schema.json",
      "docs/engineering/workflow-v2/schemas/promotion-evidence.schema.json",
      "docs/engineering/workflow-v2/templates/work-item.example.json",
      "docs/engineering/workflow-v2/templates/workflow-status.example.json",
      "docs/engineering/workflow-v2/templates/promotion-evidence.example.json",
      ".workflow-v2/promotion-evidence.json",
    ];

    for (const path of requiredDocs) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  it("keeps work item example aligned with the schema enums and required fields", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/work-item.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/work-item.example.json");

    expect(validateKnownShape(schema, example)).toEqual([]);
  });

  it("locks the canonical closeout snapshot shape in the work item schema and example", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/work-item.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/work-item.example.json");

    expect(schema.properties).toHaveProperty("closeout");
    expect(example).toHaveProperty("closeout.phase", "collecting");
    expect(example).toHaveProperty("closeout.docs_projection.roadmap_lifecycle", "planned");
    expect(example).toHaveProperty("closeout.verification_projection.required_checks", "pending");
    expect(example).toHaveProperty("closeout.merge_gate_projection.approval_state", "not_started");
    expect(example).toHaveProperty("closeout.recovery_summary.manual_patch_count", 0);
  });

  it("keeps workflow status example aligned with the schema enums and required fields", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/workflow-status.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/workflow-status.example.json");

    expect(validateKnownShape(schema, example)).toEqual([]);
  });

  it("exposes a reusable validator command contract for workflow v2 examples", () => {
    const results = validateWorkflowV2Examples({ rootDir: repoRoot });

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("validates tracked workflow v2 pilot state", () => {
    const results = validateWorkflowV2TrackedState({ rootDir: repoRoot });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("keeps the workflow-v2 entry docs aligned with the executable pilot baseline", () => {
    const results = validateWorkflowV2DocContract({ rootDir: repoRoot });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("keeps repo-local Claude agent descriptions aligned with current stage ownership", () => {
    const opencodeConfig = readJson("opencode.json");
    const ohMyOpencodeConfig = readJson(".opencode/oh-my-opencode.json");
    const expectedDescription =
      "Homecook Claude primary actor for Stage 1/3/4 and authority-required final authority gate session-orchestrated work.";

    expect((opencodeConfig.agent as Record<string, Record<string, unknown>>).athena.description).toBe(
      expectedDescription,
    );
    expect((ohMyOpencodeConfig.agents as Record<string, Record<string, unknown>>).athena.description).toBe(
      expectedDescription,
    );
  });

  it("keeps derived ownership docs aligned with slice-workflow stage ownership and status transitions", () => {
    const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    const sliceWorkflow = readFileSync(join(repoRoot, "docs/engineering/slice-workflow.md"), "utf8");
    const overview = readFileSync(join(repoRoot, "docs/engineering/agent-workflow-overview.md"), "utf8");
    const workflowReadme = readFileSync(join(repoRoot, "docs/engineering/workflow-v2/README.md"), "utf8");
    const promotionReadiness = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/promotion-readiness.md"),
      "utf8",
    );
    const opencodeReadme = readFileSync(join(repoRoot, ".opencode/README.md"), "utf8");
    const claudeEntry = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
    const roadmap = readFileSync(join(repoRoot, "docs/workpacks/README.md"), "utf8");
    const template = readFileSync(join(repoRoot, "docs/workpacks/_template/README.md"), "utf8");
    const designConsultant = readFileSync(join(repoRoot, "docs/engineering/design-consultant-sop.md"), "utf8");

    expect(agents).toContain("## Language Policy");
    expect(agents).toContain("사용자-facing 응답은 특별한 요청이 없는 한 항상 한국어로 작성한다.");
    expect(sliceWorkflow).toContain("**Codex**가 1·3·4단계를 요청받으면:");
    expect(sliceWorkflow).toContain("Codex는 Stage 4 internal subphase인 authority_precheck만 담당합니다.");
    expect(overview).toContain("## Claude public stage 흐름");
    expect(overview).toContain("## Codex review / closeout 흐름");
    expect(workflowReadme).toContain("public code stage 실행이 필요할 때 `--mode execute`를 사용한다.");
    expect(workflowReadme).not.toContain("Codex stage에 한해 `--mode execute`를 사용한다.");
    expect(workflowReadme).toContain(
      "manual handoff는 `high-risk` / `anchor-extension` / `exceptional recovery`에 한정된 예외 경로다.",
    );
    expect(workflowReadme).toContain("provider wait와 budget issue는 기본적으로 `pause + scheduled resume`를 사용한다.");
    expect(workflowReadme).toContain(
      "live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
    );
    expect(workflowReadme).toContain(
      "scheduler standard는 team-shared default를 `macOS launchd`로 고정하고, non-macOS 환경은 `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending` fallback으로 다룬다.",
    );
    expect(workflowReadme).toContain(
      "macOS에서는 `omo:supervise`, `omo:start`, `omo:continue`가 execute mode에서 work item launchd scheduler를 자동 bootstrap/refresh한다.",
    );
    expect(promotionReadiness).toContain("#### `manual-handoff-policy`");
    expect(promotionReadiness).toContain(
      "manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.",
    );
    expect(promotionReadiness).toContain("#### `live-smoke-standard`");
    expect(promotionReadiness).toContain("#### `scheduler-standard`");
    expect(promotionReadiness).toContain("team-shared default scheduler는 현재 `macOS launchd`로 고정한다.");
    expect(opencodeReadme).toContain("## Manual Handoff Standard");
    expect(opencodeReadme).toContain("## Live Smoke Standard");
    expect(opencodeReadme).toContain("## Scheduler Standard");
    expect(opencodeReadme).toContain(
      "execute mode kickoff 명령은 macOS에서 work item별 launchd scheduler를 자동 보장하고, `omo:scheduler:install`은 repair/custom cadence 용도로 남긴다.",
    );
    expect(opencodeReadme).toContain(
      "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox repo rehearsal 중 더 이른 쪽을 따른다.",
    );
    expect(opencodeReadme).toContain(
      "non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.",
    );
    expect(claudeEntry).toContain("슬라이스 개발 1·3·4단계와 authority-required slice의 final authority gate 담당.");
    expect(claudeEntry).toContain("2·5·6단계(Codex 담당)");
    expect(claudeEntry).toContain("사용자-facing 응답은 특별한 요청이 없는 한 한국어로 작성한다.");
    expect(roadmap).toContain("| `in-progress` → `merged` | Stage 6 frontend closeout이 merge까지 반영된 시점 |");
    expect(template).toContain("Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과");
    expect(designConsultant).toContain("authority-required slice는 final authority gate까지 통과 후");
  });

  it("documents the Phase 2 human-facing closeout projection baseline without claiming full markdown sync", () => {
    const workflowReadme = readFileSync(join(repoRoot, "docs/engineering/workflow-v2/README.md"), "utf8");
    const canonicalCloseout = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-canonical-closeout-state.md"),
      "utf8",
    );
    const authorityMatrix = readFileSync(
      join(repoRoot, "docs/engineering/bookkeeping-authority-matrix.md"),
      "utf8",
    );

    expect(workflowReadme).toContain(
      "현재 baseline에서는 `.workflow-v2/status.json` summary projection consistency와 README / acceptance / PR body용 generated payload contract를 함께 검증한다.",
    );
    expect(workflowReadme).toContain(
      "`validate:closeout-sync`는 work item `closeout` snapshot이 있으면 현재 roadmap / README / acceptance closeout surface가 canonical closeout generated doc-surface contract와 모순되지 않는지도 함께 본다.",
    );
    expect(workflowReadme).toContain(
      "현재 PR body baseline은 canonical closeout snapshot에서 `Closeout Sync` / `Merge Gate` 기본 섹션을 생성하고, `Actual Verification` evidence는 source PR/manual surface를 계속 우선한다.",
    );
    expect(workflowReadme).toContain(
      "현재 baseline은 human-facing surface용 generated payload/validator contract까지만 포함하고, markdown 전체 rewrite/sync patcher는 아직 포함하지 않는다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline: `work-item closeout schema + tracked status projection helper + human-facing projection payload helper + validator guard`까지 구현됐다.",
    );
    expect(canonicalCloseout).toContain(
      "PR body의 `Closeout Sync` / `Merge Gate` 기본 section generation과 README / acceptance doc-surface drift check는 연결됐고, README / acceptance markdown rewrite와 `Actual Verification` full projection은 아직 후속 단계다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline은 `status` projection helper뿐 아니라 README / acceptance / PR body용 generated payload와 projection readiness validator를 포함한다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline의 consumer는 PR body `Closeout Sync` / `Merge Gate` 기본 section generation과 `validate:closeout-sync`의 README / acceptance drift check까지 연결됐다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 README / acceptance baseline은 current markdown surface vocabulary에 맞춘 deterministic sync contract까지만 포함하고, unsupported state 전체를 rewrite하는 patcher는 아직 아니다.",
    );
    expect(canonicalCloseout).toContain("markdown 전체 rewrite는 아직 남아 있다.");
    expect(authorityMatrix).toContain(
      "`validate:closeout-sync`는 workpack closeout docs가 merged-ready 상태인지 보고, work item `closeout` snapshot이 있으면 roadmap / README / acceptance surface가 canonical generated doc-surface contract와 모순되지 않는지도 함께 본다.",
    );
    expect(authorityMatrix).toContain(
      "`validate:workflow-v2`는 canonical closeout snapshot이 README / acceptance / PR body generated payload baseline을 계산할 수 있는지, 그리고 projecting/completed snapshot의 evidence-bearing fields가 비어 있지 않은지 함께 본다.",
    );
    expect(authorityMatrix).toContain(
      "`omo-github` PR body baseline은 canonical closeout snapshot으로 `Closeout Sync` / `Merge Gate` 기본 section을 생성하지만, `Actual Verification` evidence는 source PR/manual surface를 계속 우선한다.",
    );
  });

  it("returns a combined validation bundle with no errors", () => {
    const results = validateWorkflowV2Bundle({ rootDir: repoRoot });

    expect(results.some((result) => result.name === "source-of-truth-sync")).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });
});
