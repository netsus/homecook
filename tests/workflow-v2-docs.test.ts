import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
      "docs/engineering/workflow-v2/omo-replay-acceptance.md",
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
      "docs/engineering/workflow-v2/schemas/replay-acceptance.schema.json",
      "docs/engineering/workflow-v2/templates/work-item.example.json",
      "docs/engineering/workflow-v2/templates/workflow-status.example.json",
      "docs/engineering/workflow-v2/templates/promotion-evidence.example.json",
      "docs/engineering/workflow-v2/templates/replay-acceptance.example.json",
      ".workflow-v2/promotion-evidence.json",
      ".workflow-v2/replay-acceptance.json",
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
    const schemaProperties = schema.properties as Record<string, unknown>;
    const closeoutSchema = schemaProperties.closeout as { properties: Record<string, unknown> };

    expect(schemaProperties).toHaveProperty("closeout");
    expect(example).toHaveProperty("closeout.phase", "collecting");
    expect(example).toHaveProperty("closeout.docs_projection.roadmap_lifecycle", "planned");
    expect(example).toHaveProperty("closeout.verification_projection.required_checks", "pending");
    expect(example).toHaveProperty("closeout.merge_gate_projection.approval_state", "not_started");
    expect(example).toHaveProperty("closeout.recovery_summary.manual_patch_count", 0);
    expect(closeoutSchema.properties).toHaveProperty("repair_summary");
    expect(example).toHaveProperty("closeout.repair_summary.codex_repairable_count", 0);
    expect(example).toHaveProperty("closeout.repair_summary.evidence_sources", []);
  });

  it("keeps workflow status example aligned with the schema enums and required fields", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/workflow-status.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/workflow-status.example.json");

    expect(validateKnownShape(schema, example)).toEqual([]);
  });

  it("exposes a reusable validator command contract for workflow v2 examples", () => {
    const results = validateWorkflowV2Examples({ rootDir: repoRoot });

    expect(results).toHaveLength(4);
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

  it("fails the workflow validator when the canonical GPT-only handoff contract drifts", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "workflow-v2-handoff-"));

    try {
      cpSync(join(repoRoot, "docs"), join(fixtureRoot, "docs"), { recursive: true });
      mkdirSync(join(fixtureRoot, ".opencode"), { recursive: true });
      cpSync(join(repoRoot, ".opencode/README.md"), join(fixtureRoot, ".opencode/README.md"));
      cpSync(join(repoRoot, "CLAUDE.md"), join(fixtureRoot, "CLAUDE.md"));

      const handoffPath = join(fixtureRoot, "docs/engineering/codex-task-handoff.md");
      const driftedHandoff = readFileSync(handoffPath, "utf8").replace(
        "서로 다른 task ID와 서로 다른 새 세션을 사용한다.",
        "같은 작업에서 검토할 수 있다.",
      );
      writeFileSync(handoffPath, driftedHandoff, "utf8");

      const handoffResult = validateWorkflowV2DocContract({ rootDir: fixtureRoot })
        .find((result) => result.name === "workflow-v2-doc-contract:codex-task-handoff");

      expect(handoffResult?.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("keeps repo-local independent Codex agent descriptions aligned", () => {
    const opencodeConfig = readJson("opencode.json");
    const ohMyOpencodeConfig = readJson(".opencode/oh-my-opencode.json");
    const expectedDescription =
      "Homecook independent Codex stage reviewer for task-separated review and final authority work.";

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
    const auditorResetRequirements = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-auditor-reset-requirements.md"),
      "utf8",
    );
    const opencodeReadme = readFileSync(join(repoRoot, ".opencode/README.md"), "utf8");
    const codexTaskHandoff = readFileSync(
      join(repoRoot, "docs/engineering/codex-task-handoff.md"),
      "utf8",
    );
    const sessionOrchestrator = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-session-orchestrator.md"),
      "utf8",
    );
    const claudeEntry = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
    const roadmap = readFileSync(join(repoRoot, "docs/workpacks/README.md"), "utf8");
    const template = readFileSync(join(repoRoot, "docs/workpacks/_template/README.md"), "utf8");
    const designConsultant = readFileSync(join(repoRoot, "docs/engineering/design-consultant-sop.md"), "utf8");

    expect(agents).toContain("## Language Policy");
    expect(agents).toContain("사용자-facing 응답은 특별한 요청이 없는 한 항상 한국어로 작성한다.");
    expect(sliceWorkflow).toContain("**Codex `frontend-implementer` 새 작업**");
    expect(sliceWorkflow).toContain("같은 작업의 서브에이전트는 독립 Stage 작업을 대신하지 않는다.");
    expect(overview).toContain("## Codex 새 작업 public stage 흐름");
    expect(overview).toContain("Claude는 더 이상 사용하지 않는다.");
    expect(workflowReadme).toContain("## 현재 사용 가능한 OMO 범위");
    expect(workflowReadme).toContain("`pnpm omo:replay:update`");
    expect(workflowReadme).toContain(
      "새 Codex 작업 handoff는 모든 product Stage의 기본 경로다.",
    );
    expect(workflowReadme).toContain(
      "live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
    );
    expect(workflowReadme).toContain("legacy scheduler/tick은 신규 Stage actor 실행에 사용하지 않는다.");
    expect(promotionReadiness).toContain("#### `manual-handoff-policy`");
    expect(promotionReadiness).toContain(
      "Codex 새 작업 handoff는 모든 product Stage의 기본 경로다.",
    );
    expect(promotionReadiness).toContain("#### `live-smoke-standard`");
    expect(promotionReadiness).toContain("#### `scheduler-standard`");
    expect(promotionReadiness).toContain("team-shared default scheduler는 현재 `macOS launchd`로 고정한다.");
    expect(promotionReadiness).toContain("active auditor blocker (`H-OMO-001`, `H-OMO-006`)");
    expect(promotionReadiness).toContain(
      "closeout authority overlap blocker `H-GOV-001`은 canonical owner, compatibility note, shared helper wiring 정렬로 해소됐고 더 이상 active auditor blocker로 보지 않는다.",
    );
    expect(auditorResetRequirements).toContain(
      "현재 finding registry stable set은 `H-CI-001`, `H-GOV-001`, `H-OMO-001`~`H-OMO-006`까지 넓어졌다.",
    );
    expect(auditorResetRequirements).toContain(
      "current baseline에서 auditor가 `H-OMO-001`, `H-OMO-006`를 blocker로 보고 있으면",
    );
    expect(auditorResetRequirements).toContain(
      "resolved governance overlap `H-GOV-001`이 current baseline에서 active blocker가 아니라면",
    );
    expect(auditorResetRequirements).not.toContain(
      "현재 finding registry는 `H-CI-001`, `H-GOV-001`, `H-OMO-001` 세 개만 가진다.",
    );
    expect(opencodeReadme).toContain("## Allowed OMO Commands");
    expect(opencodeReadme).toContain("## Suspended Commands");
    expect(opencodeReadme).toContain("`provider=retired`, `bin=disabled`");
    expect(opencodeReadme).toContain("다른 task ID와 다른 새 세션을 사용한다.");
    expect(codexTaskHandoff).toContain("별도 ChatGPT/Codex 작업(새 task ID, 새 세션)");
    expect(codexTaskHandoff).toContain("서로 다른 task ID와 서로 다른 새 세션을 사용한다.");
    expect(sessionOrchestrator).toContain("## Historical Session Model");
    expect(sessionOrchestrator).toContain(
      "현재 Homecook 운영 규칙은 `Stage 1/2/4 작성`과 `internal 1.5 / Stage 3 / Stage 5 / final authority / Stage 6 검토`를 서로 다른 ChatGPT/Codex task ID와 새 세션으로 분리한다.",
    );
    expect(claudeEntry).toContain("# Claude 진입점 폐기 안내");
    expect(claudeEntry).toContain("Homecook은 Claude를 더 이상 사용하지 않는다.");
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
      "canonical closeout projection / repair semantics의 기준은 `omo-canonical-closeout-state.md`를 따른다. `bookkeeping-authority-matrix.md`는 전환이 끝날 때까지 writable closeout surface compatibility note로 유지한다.",
    );
    expect(workflowReadme).toContain(
      "현재 executable baseline은 `.workflow-v2/status.json` summary projection consistency, `validate:closeout-sync`의 doc-surface drift check, PR body `Closeout Sync` / `Merge Gate` generated section, `omo:reconcile` current-vocabulary repair consumer를 포함한다.",
    );
    expect(workflowReadme).toContain(
      "representative replay lane 결과를 replay ledger에 남길 때는 `pnpm omo:replay:update`를 사용한다.",
    );
    expect(workflowReadme).toContain(
      "`Actual Verification` evidence는 source PR/manual surface를 계속 우선하고, markdown 전체 rewrite/sync patcher는 아직 포함하지 않는다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline: `work-item closeout schema + repair_summary projection + tracked status projection helper + human-facing projection payload helper + validator guard`까지 구현됐다.",
    );
    expect(canonicalCloseout).toContain(
      "PR body의 `Closeout Sync` / `Merge Gate` 기본 section generation, README / acceptance doc-surface drift check, current-vocabulary closeout repair consumer는 연결됐고, README / acceptance markdown rewrite와 `Actual Verification` full projection은 아직 후속 단계다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline은 `status` projection helper뿐 아니라 README / acceptance / PR body용 generated payload, repair summary projection, projection readiness validator를 포함한다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline의 consumer는 PR body `Closeout Sync` / `Merge Gate` 기본 section generation, `validate:closeout-sync`의 README / acceptance drift check, `omo:reconcile`의 current-vocabulary closeout repair까지 연결됐다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 README / acceptance baseline은 current markdown surface vocabulary에 맞춘 deterministic sync contract와 repair consumer까지만 포함하고, unsupported state 전체를 rewrite하는 patcher는 아직 아니다.",
    );
    expect(canonicalCloseout).toContain(
      "현재 baseline은 compatibility note downgrade까지 반영됐고, 이후에는 appendix화 또는 제거 여부만 남는다.",
    );
    expect(canonicalCloseout).toContain("markdown 전체 rewrite는 아직 남아 있다.");
    expect(authorityMatrix).toContain(
      "이 문서는 canonical closeout ownership / projection semantics를 정의하는 문서가 아니다.",
    );
    expect(authorityMatrix).toContain(
      "이 문서는 전환 기간 동안 `docs/omo-closeout-<slice>` branch가 만질 수 있는",
    );
    expect(authorityMatrix).toContain(
      "closeout repair는 아래 4개 surface 안에서만 docs-side sync를 수행한다.",
    );
    expect(authorityMatrix).toContain(
      "`validate:closeout-sync`와 `omo:reconcile`는 canonical closeout snapshot을 기준으로 이 note의 writable surface 범위 안에서만 doc-side drift를 검사/수리한다.",
    );
    expect(authorityMatrix).toContain(
      "`validate:workflow-v2`와 `omo-github` PR body baseline은 canonical closeout snapshot 기준 generated payload를 다루며, 이 note는 body semantics를 정의하지 않는다.",
    );
    expect(canonicalCloseout).toContain("markdown 전체 rewrite는 아직 남아 있다.");
  });

  it("documents the thin supervisor boundary for Codex-orchestrated OMO", () => {
    const workflowReadme = readFileSync(join(repoRoot, "docs/engineering/workflow-v2/README.md"), "utf8");
    const governanceMap = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-governance-surface-map.md"),
      "utf8",
    );
    const autonomousSupervisor = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-autonomous-supervisor.md"),
      "utf8",
    );
    const dispatchContract = readFileSync(
      join(repoRoot, "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md"),
      "utf8",
    );

    expect(workflowReadme).toContain("Codex는 conductor, OMO는 rail");
    expect(governanceMap).toContain("### 2. Codex Orchestrator");
    expect(governanceMap).toContain("product stage actor 기본 읽기 경로에는 `workflow-v2` maintainer spec을 넣지 않는다.");
    expect(autonomousSupervisor).toContain("이 문서는 product stage actor 기본 읽기가 아니라 OMO implementation maintainer spec이다.");
    expect(autonomousSupervisor).toContain("supervisor는 semantic reviewer가 아니라 rail executor다.");
    expect(dispatchContract).not.toContain("docs/engineering/workflow-v2/omo-autonomous-supervisor.md");
    expect(dispatchContract).not.toContain("docs/engineering/workflow-v2/schemas/work-item.schema.json");
    expect(dispatchContract).not.toContain("docs/engineering/workflow-v2/templates/work-item.example.json");
  });

  it("returns a combined validation bundle with no errors", () => {
    const results = validateWorkflowV2Bundle({ rootDir: repoRoot });

    expect(results.some((result) => result.name === "source-of-truth-sync")).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });
});
