import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  validateHumanSurfaceProjectionContract,
  validateStatusItemAgainstCanonicalCloseout,
} from "./omo-closeout-state.mjs";
import { validateSourceOfTruthSync } from "./validate-source-of-truth-sync.mjs";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function joinPath(basePath, segment) {
  return basePath ? `${basePath}.${segment}` : segment;
}

export function validateKnownShape(schema, data, basePath = "") {
  const errors = [];
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const properties =
    schema?.properties && typeof schema.properties === "object" ? schema.properties : {};

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [
      {
        path: basePath || "<root>",
        message: "Expected object value.",
      },
    ];
  }

  for (const key of required) {
    if (!(key in data)) {
      errors.push({
        path: joinPath(basePath, key),
        message: "Missing required field.",
      });
    }
  }

  for (const [key, definition] of Object.entries(properties)) {
    if (!(key in data)) continue;

    const value = data[key];
    const currentPath = joinPath(basePath, key);

    if (Array.isArray(definition.enum) && !definition.enum.includes(value)) {
      errors.push({
        path: currentPath,
        message: `Value must be one of: ${definition.enum.join(", ")}`,
      });
    }

    if (definition.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      errors.push(...validateKnownShape(definition, value, currentPath));
      continue;
    }

    if (definition.type === "array" && Array.isArray(value) && definition.items) {
      const itemDefinition =
        typeof definition.items === "object" && definition.items !== null ? definition.items : null;

      if (Array.isArray(itemDefinition?.enum)) {
        value.forEach((item, index) => {
          if (!itemDefinition.enum.includes(item)) {
            errors.push({
              path: `${currentPath}[${index}]`,
              message: `Value must be one of: ${itemDefinition.enum.join(", ")}`,
            });
          }
        });
      }

      if (
        itemDefinition?.type === "object" &&
        value.every((item) => item && typeof item === "object" && !Array.isArray(item))
      ) {
        value.forEach((item, index) => {
          errors.push(...validateKnownShape(itemDefinition, item, `${currentPath}[${index}]`));
        });
      }
    }
  }

  return errors;
}

export function validateWorkflowV2Examples({ rootDir = process.cwd() } = {}) {
  const baseDir = path.join(rootDir, "docs/engineering/workflow-v2");
  const targets = [
    {
      name: "work-item",
      schemaPath: path.join(baseDir, "schemas/work-item.schema.json"),
      examplePath: path.join(baseDir, "templates/work-item.example.json"),
    },
    {
      name: "workflow-status",
      schemaPath: path.join(baseDir, "schemas/workflow-status.schema.json"),
      examplePath: path.join(baseDir, "templates/workflow-status.example.json"),
    },
    {
      name: "promotion-evidence",
      schemaPath: path.join(baseDir, "schemas/promotion-evidence.schema.json"),
      examplePath: path.join(baseDir, "templates/promotion-evidence.example.json"),
    },
    {
      name: "replay-acceptance",
      schemaPath: path.join(baseDir, "schemas/replay-acceptance.schema.json"),
      examplePath: path.join(baseDir, "templates/replay-acceptance.example.json"),
    },
  ];

  return targets.map((target) => {
    const schema = readJson(target.schemaPath);
    const example = readJson(target.examplePath);

    return {
      ...target,
      errors: validateKnownShape(schema, example),
    };
  });
}

function normalizeStringArray(values) {
  return [...values].sort();
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractMarkdownSection(text, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedHeading}\\n([\\s\\S]*?)(?=^##\\s|\\Z)`, "m");
  const match = text.match(pattern);
  return match?.[1] ?? "";
}

function containsAll(text, fragments) {
  return fragments
    .filter((fragment) => !text.includes(fragment))
    .map((fragment) => ({
      path: fragment,
      message: `Missing required fragment: ${fragment}`,
    }));
}

function containsNone(text, fragments) {
  return fragments
    .filter((fragment) => text.includes(fragment))
    .map((fragment) => ({
      path: fragment,
      message: `Unexpected stale fragment is still present: ${fragment}`,
    }));
}

export function validateWorkflowV2TrackedState({ rootDir = process.cwd() } = {}) {
  const workflowDir = path.join(rootDir, ".workflow-v2");
  if (!existsSync(workflowDir)) {
    return [];
  }

  const workItemSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/work-item.schema.json"),
  );
  const statusSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/workflow-status.schema.json"),
  );
  const promotionEvidenceSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/promotion-evidence.schema.json"),
  );
  const replayAcceptanceSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/replay-acceptance.schema.json"),
  );
  const workItemsDir = path.join(workflowDir, "work-items");
  const statusPath = path.join(workflowDir, "status.json");
  const promotionEvidencePath = path.join(workflowDir, "promotion-evidence.json");
  const replayAcceptancePath = path.join(workflowDir, "replay-acceptance.json");
  const results = [];

  const workItemFiles = existsSync(workItemsDir)
    ? readdirSync(workItemsDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(workItemsDir, name))
    : [];

  const workItems = workItemFiles.map((filePath) => {
    const data = readJson(filePath);
    const errors = validateKnownShape(workItemSchema, data);
    results.push({
      name: `tracked-work-item:${path.basename(filePath)}`,
      errors,
    });
    return data;
  });

  if (!existsSync(statusPath)) {
    results.push({
      name: "tracked-status",
      errors: [
        {
          path: ".workflow-v2.status.json",
          message: "Missing .workflow-v2/status.json",
        },
      ],
    });
    return results;
  }

  const statusData = readJson(statusPath);
  const statusErrors = validateKnownShape(statusSchema, statusData);
  const crossErrors = [];

  const workItemsById = new Map(workItems.map((item) => [item.id, item]));
  const statusItems = Array.isArray(statusData.items) ? statusData.items : [];

  for (const statusItem of statusItems) {
    const workItem = workItemsById.get(statusItem.id);
    if (!workItem) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}`,
        message: `Missing matching work item for status entry '${statusItem.id}'.`,
      });
      continue;
    }

    if (statusItem.preset !== workItem.preset) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}.preset`,
        message: `Preset mismatch with work item '${statusItem.id}'.`,
      });
    }

    const statusChecks = Array.isArray(statusItem.required_checks) ? statusItem.required_checks : [];
    const workItemChecks = Array.isArray(workItem.verification?.required_checks)
      ? workItem.verification.required_checks
      : [];

    if (JSON.stringify(normalizeStringArray(statusChecks)) !== JSON.stringify(normalizeStringArray(workItemChecks))) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}.required_checks`,
        message: `Required checks mismatch with work item '${statusItem.id}'.`,
      });
    }

    crossErrors.push(
      ...validateStatusItemAgainstCanonicalCloseout({
        statusItem,
        closeout: workItem.closeout,
        pathPrefix: `.workflow-v2/status.json.items.${statusItem.id}`,
      }),
    );
  }

  for (const workItem of workItems) {
    const found = statusItems.some((statusItem) => statusItem.id === workItem.id);
    crossErrors.push(
      ...validateHumanSurfaceProjectionContract({
        closeout: workItem.closeout,
        workItemId: workItem.id,
        pathPrefix: `.workflow-v2/work-items/${workItem.id}.json.closeout`,
      }),
    );

    if (!found) {
      crossErrors.push({
        path: `.workflow-v2/work-items/${workItem.id}.json`,
        message: `Missing matching status entry for work item '${workItem.id}'.`,
      });
    }
  }

  results.push({
    name: "tracked-status",
    errors: [...statusErrors, ...crossErrors],
  });

  if (!existsSync(promotionEvidencePath)) {
    results.push({
      name: "tracked-promotion-evidence",
      errors: [
        {
          path: ".workflow-v2/promotion-evidence.json",
          message: "Missing .workflow-v2/promotion-evidence.json",
        },
      ],
    });
    return results;
  }

  results.push({
    name: "tracked-promotion-evidence",
    errors: validateKnownShape(promotionEvidenceSchema, readJson(promotionEvidencePath)),
  });

  if (!existsSync(replayAcceptancePath)) {
    results.push({
      name: "tracked-replay-acceptance",
      errors: [
        {
          path: ".workflow-v2/replay-acceptance.json",
          message: "Missing .workflow-v2/replay-acceptance.json",
        },
      ],
    });
    return results;
  }

  results.push({
    name: "tracked-replay-acceptance",
    errors: validateKnownShape(replayAcceptanceSchema, readJson(replayAcceptancePath)),
  });

  return results;
}

export function validateWorkflowV2DocContract({ rootDir = process.cwd() } = {}) {
  const sliceWorkflowPath = path.join(rootDir, "docs/engineering/slice-workflow.md");
  const agentWorkflowOverviewPath = path.join(rootDir, "docs/engineering/agent-workflow-overview.md");
  const workflowReadmePath = path.join(rootDir, "docs/engineering/workflow-v2/README.md");
  const supervisorDocPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
  );
  const sessionOrchestratorPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-session-orchestrator.md",
  );
  const liteArchitecturePath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-lite-architecture.md",
  );
  const dispatchContractPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
  );
  const claudeProviderPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-claude-cli-provider.md",
  );
  const claudeEntryPath = path.join(rootDir, "CLAUDE.md");
  const workpacksRoadmapPath = path.join(rootDir, "docs/workpacks/README.md");
  const workpackTemplatePath = path.join(rootDir, "docs/workpacks/_template/README.md");
  const designConsultantPath = path.join(rootDir, "docs/engineering/design-consultant-sop.md");
  const opencodeReadmePath = path.join(rootDir, ".opencode/README.md");
  const promotionReadinessPath = path.join(rootDir, "docs/engineering/workflow-v2/promotion-readiness.md");
  const auditorResetRequirementsPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-auditor-reset-requirements.md",
  );
  const replayAcceptancePath = path.join(rootDir, "docs/engineering/workflow-v2/omo-replay-acceptance.md");
  const canonicalCloseoutPath = path.join(
    rootDir,
    "docs/engineering/workflow-v2/omo-canonical-closeout-state.md",
  );
  const bookkeepingAuthorityMatrixPath = path.join(
    rootDir,
    "docs/engineering/bookkeeping-authority-matrix.md",
  );

  const sliceWorkflow = readText(sliceWorkflowPath);
  const agentWorkflowOverview = readText(agentWorkflowOverviewPath);
  const workflowReadme = readText(workflowReadmePath);
  const supervisorDoc = readText(supervisorDocPath);
  const sessionOrchestrator = readText(sessionOrchestratorPath);
  const liteArchitecture = readText(liteArchitecturePath);
  const dispatchContract = readText(dispatchContractPath);
  const claudeProviderDoc = readText(claudeProviderPath);
  const claudeEntry = readText(claudeEntryPath);
  const workpacksRoadmap = readText(workpacksRoadmapPath);
  const workpackTemplate = readText(workpackTemplatePath);
  const designConsultant = readText(designConsultantPath);
  const opencodeReadme = readText(opencodeReadmePath);
  const promotionReadiness = readText(promotionReadinessPath);
  const auditorResetRequirements = readText(auditorResetRequirementsPath);
  const replayAcceptance = readText(replayAcceptancePath);
  const canonicalCloseout = readText(canonicalCloseoutPath);
  const bookkeepingAuthorityMatrix = readText(bookkeepingAuthorityMatrixPath);
  const nextLockedScope = extractMarkdownSection(workflowReadme, "## Next Locked Scope");

  const sliceWorkflowErrors = [
    ...containsAll(sliceWorkflow, [
      "| 4 | 프론트엔드 구현 | **Claude** |",
      "| 5 | 디자인 리뷰 | **Codex** |",
      "| 6 | 프론트엔드 PR 리뷰 | **Codex** |",
      "**Codex**가 1·3·4단계를 요청받으면:",
      "Codex는 Stage 4 internal subphase인 authority_precheck만 담당합니다.",
    ]),
    ...containsNone(sliceWorkflow, [
      "**Codex**가 1·3단계를 요청받으면:",
    ]),
  ];

  const agentWorkflowOverviewErrors = [
    ...containsAll(agentWorkflowOverview, [
      "## Claude public stage 흐름",
      "Stage 1 문서 작성",
      "internal 1.5 docs gate repair / final owner 수행",
      "Stage 3 백엔드 리뷰 / Stage 4 프론트 구현 수행",
      "authority-required slice면 Stage 5 final_authority_gate 수행",
      "## Codex review / closeout 흐름",
      "internal 1.5 docs gate review 수행",
      "Stage 2 백엔드 구현 수행",
      "Stage 5 public 디자인 리뷰와 Stage 6 FE PR 리뷰 / closeout 수행",
    ]),
    ...containsNone(agentWorkflowOverview, [
      "## Claude 리뷰 흐름",
      "→ PR 코드 리뷰 (AGENTS.md 기준)",
      "→ 디자인 피드백 (Tailwind/레이아웃/공용 컴포넌트)",
    ]),
  ];

  const workflowReadmeErrors = [
    ...containsAll(workflowReadme, [
      "## Executable Baseline",
      "`pnpm omo:supervise`",
      "`pnpm omo:tick`",
      "`pnpm omo:tick:watch`",
      "`pnpm omo:reconcile`",
      "`pnpm omo:promotion:update`",
      "`pnpm omo:replay:update`",
      "`pnpm omo:status`",
      "`pnpm omo:tail`",
      "`pnpm validate:omo-bookkeeping`",
      "low/medium autonomous slice에 대해 Stage 1~6 무인 merge까지 포함",
      "authority-required UI는 Claude Stage 4 구현 뒤 Codex `authority_precheck`, Codex Stage 5 public review, Claude `final_authority_gate`를 거친다.",
      "stage owner review artifact + authority gate pass(해당 시) + 전체 PR checks + external smoke",
      "manual merge handoff",
      "manual handoff는 `high-risk` / `anchor-extension` / `exceptional recovery`에 한정된 예외 경로다.",
      "provider wait와 budget issue는 기본적으로 `pause + scheduled resume`를 사용한다.",
      "live smoke는 일반 PR CI 전체 강제가 아니라 `external_smokes[]`가 선언된 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.",
      "live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
      "scheduler standard는 team-shared default를 `macOS launchd`로 고정하고, non-macOS 환경은 `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending` fallback으로 다룬다.",
      "scheduler install/config 변경 뒤와 최소 `slice-batch-review`마다 1회 `pnpm omo:scheduler:verify -- --work-item <id>`와 `pnpm omo:tick:watch -- --work-item <id>`를 함께 확인한다.",
      "macOS에서는 `omo:supervise`, `omo:start`, `omo:continue`가 execute mode에서 work item launchd scheduler를 자동 bootstrap/refresh한다.",
      "public code stage 실행이 필요할 때 `--mode execute`를 사용한다.",
      "slice6 기준 public Stage 4는 Claude execute path를 사용할 수 있고, Stage 5 `final_authority_gate`는 review gate이므로 execute 대상이 아니라 review artifact 경로로 다룬다.",
      "promotion-readiness.md",
      "omo-replay-acceptance.md",
      ".workflow-v2/promotion-evidence.json",
      ".workflow-v2/replay-acceptance.json",
      "Stage 1 bootstrap부터 시작한다.",
      "internal 1.5 docs gate",
      "canonical closeout projection / repair semantics의 기준은 `omo-canonical-closeout-state.md`를 따른다. `bookkeeping-authority-matrix.md`는 전환이 끝날 때까지 writable closeout surface compatibility note로 유지한다.",
      "현재 executable baseline은 `.workflow-v2/status.json` summary projection consistency, `validate:closeout-sync`의 doc-surface drift check, PR body `Closeout Sync` / `Merge Gate` generated section, `omo:reconcile` current-vocabulary repair consumer를 포함한다.",
      "`Actual Verification` evidence는 source PR/manual surface를 계속 우선하고, markdown 전체 rewrite/sync patcher는 아직 포함하지 않는다.",
    ]),
    ...containsNone(workflowReadme, [
      "Codex stage에 한해 `--mode execute`를 사용한다.",
    ]),
  ];

  for (const fragment of ["omo:supervise", "omo:tick", "omo:tick:watch", "omo:reconcile"]) {
    if (nextLockedScope.includes(fragment)) {
      workflowReadmeErrors.push({
        path: "docs/engineering/workflow-v2/README.md#next-locked-scope",
        message: `Already-implemented command is still documented as future scope: ${fragment}`,
      });
    }
  }

  const supervisorDocErrors = [
    ...containsAll(supervisorDoc, [
      "`pnpm omo:scheduler:install -- --work-item <id>`",
      "`pnpm omo:scheduler:verify -- --work-item <id>`",
      "`pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name>`",
      "`pnpm omo:smoke:providers`",
      "GitHub formal approval을 merge gate로 사용하지 않는다",
      "current head 기준 전체 PR checks green + Stage 6 Codex approve artifact + authority gate pass(해당 시) + external smoke pass 뒤 자동 merge한다",
      "authority_precheck",
      "Stage 5 public actor는 Codex다.",
      "final_authority_gate",
      "authority-required frontend PR은 `merge_pending` 직전과 `mergePullRequest` 직전에 모두 `design_authority.status === \"reviewed\"`와 final authority verdict `pass`를 재검증한다.",
      "strict slice에서 Stage 2는 `$ralph` skill 기반 loop를 기본 실행 표면으로 사용하고, Stage 4는 현재 OMO-lite runner 기준으로 `single_pass`를 기본 실행 표면으로 유지한다.",
      "manual merge handoff",
      "product slice에서 tracked work item/workpack이 없어도 Stage 1 Claude author로 bootstrap 시작한다.",
      "Stage 1 docs PR은 즉시 merge하지 않고",
      "`doc_gate_review`는 Codex",
      "`doc_gate_repair`는 Claude",
      "execute kickoff인 `omo:supervise`, `omo:start`, `omo:continue`는 해당 work item launchd scheduler를 자동 bootstrap/refresh한다.",
    ]),
    ...containsNone(supervisorDoc, [
      "Stage 2/4는 strict slice에서 `$ralph` skill 기반 loop를 기본 실행 표면으로 사용한다.",
    ]),
  ];

  const sessionOrchestratorErrors = [
    ...containsAll(sessionOrchestrator, [
      "Stage `1 / 3 / 4` -> `claude_primary`",
      "Stage `2 / 5 / 6` -> `codex_primary`",
      "Stage 5 `final_authority_gate` -> `claude_primary`",
      "Stage 1/3/4의 public actor는 Claude다.",
      "Stage 2/5/6의 public actor는 Codex다.",
    ]),
  ];

  const liteArchitectureErrors = [
    ...containsAll(liteArchitecture, [
      "Claude primary session은 Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`에서 재사용한다.",
      "Codex primary session은 Stage `2 / 5 / 6`와 Stage 4 `authority_precheck`에서 재사용한다.",
      "Stage 4 프론트 구현",
      "Stage 5 authority-required slice의 final authority gate",
    ]),
  ];

  const dispatchContractErrors = [
    ...containsAll(dispatchContract, [
      "### Stage 4 → Claude",
      "### Stage 5 → Codex",
      "### Stage 5 → Claude (`subphase=final_authority_gate`)",
      "### Stage 6 → Codex",
      "### Internal 1.5 → Claude (`stage=2`, `subphase=doc_gate_repair`)",
      "### Internal 1.5 → Codex (`stage=2`, `subphase=doc_gate_review`)",
      "`actor == codex`인 dispatch는 `codex_primary` session으로 실행한다.",
      "`actor == claude`인 dispatch는 `claude_primary` session으로 실행한다.",
      "strict slice여도 Stage 4는 현재 `single_pass`로 실행",
      "OMO actual execution은 Stage 2에서 `$ralph` skill-only",
      "Stage 4 actual execution은 현재 `single_pass`",
    ]),
    ...containsNone(dispatchContract, [
      "OMO actual execution은 Stage 2/4에서 `$ralph` skill-only",
    ]),
  ];

  const claudeProviderErrors = [
    ...containsAll(claudeProviderDoc, [
      "Claude Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`의 기본 실행 표면은 `raw claude CLI`다.",
      "Codex Stage `2 / 5 / 6`와 Stage 4 `authority_precheck`는 기존 `OpenCode` provider를 유지한다.",
    ]),
  ];

  const opencodeReadmeErrors = [
    ...containsAll(opencodeReadme, [
      "`pnpm omo:supervise -- --work-item <id>`",
      "`pnpm omo:tick -- --all`",
      "`pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name>`",
      "`pnpm omo:smoke:providers`",
      "`pnpm omo:scheduler:install -- --work-item <id>`",
      "`pnpm omo:scheduler:verify -- --work-item <id>`",
      "`pnpm omo:promotion:update`",
      "Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`의 기본 provider는 raw `claude` CLI다.",
      "Stage `1 / 3 / 4`는 `claude_primary`, Stage `2 / 5 / 6`은 `codex_primary` 세션을 재사용한다.",
      "## Manual Handoff Standard",
      "provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.",
      "## Live Smoke Standard",
      "canonical evidence는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
      "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox repo rehearsal 중 더 이른 쪽을 따른다.",
      "## Scheduler Standard",
      "team-shared default scheduler는 현재 `macOS launchd`다.",
      "execute mode kickoff 명령은 macOS에서 work item별 launchd scheduler를 자동 보장하고, `omo:scheduler:install`은 repair/custom cadence 용도로 남긴다.",
      "non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.",
      "최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.",
      "macOS에서는 `launchd` 예시를 우선 제공한다",
      "promotion-readiness.md",
      ".workflow-v2/promotion-evidence.json",
    ]),
  ];

  const promotionReadinessErrors = [
    ...containsAll(promotionReadiness, [
      "## Required Gates",
      "## Pilot Gates",
      "`omo-canonical-closeout-state`가 closeout ownership / projection semantics를 잠그고, `bookkeeping-authority-matrix`는 transition-period writable closeout surface만 기록한다.",
      "`.workflow-v2/replay-acceptance.json`에 기록한다.",
      "pnpm omo:replay:update",
      "representative replay acceptance summary가 `pass`",
      "authority-required-ui",
      "external-smoke",
      "bugfix-patch",
      ".workflow-v2/promotion-evidence.json",
      "slice06",
      "pnpm omo:promotion:update",
      "#### `manual-handoff-policy`",
      "manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.",
      "#### `live-smoke-standard`",
      "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox rehearsal 중 더 이른 쪽을 따른다.",
      "#### `scheduler-standard`",
      "team-shared default scheduler는 현재 `macOS launchd`로 고정한다.",
      "최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.",
    ]),
  ];

  const replayAcceptanceErrors = [
    ...containsAll(replayAcceptance, [
      "`.workflow-v2/replay-acceptance.json`",
      "`slice06-authority-replay`",
      "`slice07-fullstack-replay`",
      "`bugfix-patch-replay`",
      "`control-plane-smoke-replay`",
      "`pnpm omo:replay:update`",
      "`manual_runtime_json_edit_free`",
      "`canonical_closeout_validated`",
      "`auditor_result_recorded`",
    ]),
  ];

  const auditorResetRequirementsErrors = [
    ...containsAll(auditorResetRequirements, [
      "현재 finding registry stable set은 `H-CI-001`, `H-GOV-001`, `H-OMO-001`~`H-OMO-006`까지 넓어졌다.",
      "current baseline에서 auditor가 `H-OMO-001`, `H-OMO-006`를 blocker로 보고 있으면",
      "resolved governance overlap `H-GOV-001`이 current baseline에서 active blocker가 아니라면",
    ]),
    ...containsNone(auditorResetRequirements, [
      "현재 finding registry는 `H-CI-001`, `H-GOV-001`, `H-OMO-001` 세 개만 가진다.",
      "auditor가 `H-GOV-001`, `H-OMO-001`, `H-OMO-006`를 blocker로 보고 있으면",
    ]),
  ];

  const canonicalCloseoutErrors = [
    ...containsAll(canonicalCloseout, [
      "현재 baseline: `work-item closeout schema + tracked status projection helper + human-facing projection payload helper + validator guard`까지 구현됐다.",
      "PR body의 `Closeout Sync` / `Merge Gate` 기본 section generation, README / acceptance doc-surface drift check, current-vocabulary closeout repair consumer는 연결됐고, README / acceptance markdown rewrite와 `Actual Verification` full projection은 아직 후속 단계다.",
      "현재 baseline은 `status` projection helper뿐 아니라 README / acceptance / PR body용 generated payload와 projection readiness validator를 포함한다.",
      "현재 baseline의 consumer는 PR body `Closeout Sync` / `Merge Gate` 기본 section generation, `validate:closeout-sync`의 README / acceptance drift check, `omo:reconcile`의 current-vocabulary closeout repair까지 연결됐다.",
      "현재 README / acceptance baseline은 current markdown surface vocabulary에 맞춘 deterministic sync contract와 repair consumer까지만 포함하고, unsupported state 전체를 rewrite하는 patcher는 아직 아니다.",
      "현재 baseline은 compatibility note downgrade까지 반영됐고, 이후에는 appendix화 또는 제거 여부만 남는다.",
      "markdown 전체 rewrite는 아직 남아 있다.",
    ]),
  ];

  const bookkeepingAuthorityMatrixErrors = [
    ...containsAll(bookkeepingAuthorityMatrix, [
      "이 문서는 canonical closeout ownership / projection semantics를 정의하는 문서가 아니다.",
      "이 문서는 전환 기간 동안 `docs/omo-closeout-<slice>` branch가 만질 수 있는",
      "closeout repair는 아래 4개 surface 안에서만 docs-side sync를 수행한다.",
      "`.workflow-v2/status.json`",
      "`validate:closeout-sync`와 `omo:reconcile`는 canonical closeout snapshot을 기준으로 이 note의 writable surface 범위 안에서만 doc-side drift를 검사/수리한다.",
      "`validate:workflow-v2`와 `omo-github` PR body baseline은 canonical closeout snapshot 기준 generated payload를 다루며, 이 note는 body semantics를 정의하지 않는다.",
    ]),
  ];

  const claudeEntryErrors = [
    ...containsAll(claudeEntry, [
      "슬라이스 개발 1·3·4단계와 authority-required slice의 final authority gate 담당.",
      "2·5·6단계(Codex 담당)",
    ]),
    ...containsNone(claudeEntry, [
      "슬라이스 개발 1·3·5·6단계 담당. 2·4단계(Codex 담당)",
    ]),
  ];

  const workpacksRoadmapErrors = [
    ...containsAll(workpacksRoadmap, [
      "| `planned` → `docs` | Stage 1 docs PR 오픈 시 |",
      "| `docs` → `in-progress` | Stage 1 merge + Stage 2 착수 시 |",
      "| `in-progress` → `merged` | Stage 6 frontend closeout이 merge까지 반영된 시점 |",
      "위 이벤트가 발생한 PR 또는 closeout bookkeeping update에 포함해 갱신한다.",
    ]),
    ...containsNone(workpacksRoadmap, [
      "| `in-progress` → `merged` | Stage 6 FE PR merge 시 | Claude |",
    ]),
  ];

  const workpackTemplateErrors = [
    ...containsAll(workpackTemplate, [
      "Stage 4 완료 후, public review 준비 상태",
      "Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과",
      "→ `pending-review` (Stage 4 완료 후)",
      "→ `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)",
    ]),
    ...containsNone(workpackTemplate, [
      "Stage 4 완료, Claude Stage 5 디자인 리뷰 필요",
      "→ `pending-review` (Stage 4 완료, Codex가 변경)",
      "→ `confirmed` (Stage 5 리뷰 통과, Claude가 변경)",
    ]),
  ];

  const designConsultantErrors = [
    ...containsAll(designConsultant, [
      "↓ Stage 4 완료 후",
      "↓ Stage 5 public review 통과 후",
      "authority-required slice는 final authority gate까지 통과 후",
      "Stage 5 public review / final authority gate",
    ]),
    ...containsNone(designConsultant, [
      "↓ Stage 4 완료, Codex가 변경",
      "↓ Stage 5 리뷰 통과, Claude가 변경",
      "Stage 5 (Claude 직접)",
    ]),
  ];

  return [
    {
      name: "workflow-v2-doc-contract:slice-workflow",
      errors: sliceWorkflowErrors,
    },
    {
      name: "workflow-v2-doc-contract:agent-workflow-overview",
      errors: agentWorkflowOverviewErrors,
    },
    {
      name: "workflow-v2-doc-contract:README",
      errors: workflowReadmeErrors,
    },
    {
      name: "workflow-v2-doc-contract:supervisor",
      errors: supervisorDocErrors,
    },
    {
      name: "workflow-v2-doc-contract:session-orchestrator",
      errors: sessionOrchestratorErrors,
    },
    {
      name: "workflow-v2-doc-contract:lite-architecture",
      errors: liteArchitectureErrors,
    },
    {
      name: "workflow-v2-doc-contract:dispatch-contract",
      errors: dispatchContractErrors,
    },
    {
      name: "workflow-v2-doc-contract:claude-provider",
      errors: claudeProviderErrors,
    },
    {
      name: "workflow-v2-doc-contract:opencode",
      errors: opencodeReadmeErrors,
    },
    {
      name: "workflow-v2-doc-contract:promotion-readiness",
      errors: promotionReadinessErrors,
    },
    {
      name: "workflow-v2-doc-contract:auditor-reset-requirements",
      errors: auditorResetRequirementsErrors,
    },
    {
      name: "workflow-v2-doc-contract:replay-acceptance",
      errors: replayAcceptanceErrors,
    },
    {
      name: "workflow-v2-doc-contract:canonical-closeout",
      errors: canonicalCloseoutErrors,
    },
    {
      name: "workflow-v2-doc-contract:bookkeeping-authority-matrix",
      errors: bookkeepingAuthorityMatrixErrors,
    },
    {
      name: "workflow-v2-doc-contract:claude-entry",
      errors: claudeEntryErrors,
    },
    {
      name: "workflow-v2-doc-contract:workpacks-roadmap",
      errors: workpacksRoadmapErrors,
    },
    {
      name: "workflow-v2-doc-contract:workpack-template",
      errors: workpackTemplateErrors,
    },
    {
      name: "workflow-v2-doc-contract:design-consultant",
      errors: designConsultantErrors,
    },
  ];
}

export function validateWorkflowV2Bundle({ rootDir = process.cwd() } = {}) {
  return [
    ...validateWorkflowV2Examples({ rootDir }),
    ...validateWorkflowV2TrackedState({ rootDir }),
    ...validateWorkflowV2DocContract({ rootDir }),
    ...validateSourceOfTruthSync({ rootDir }),
  ];
}
