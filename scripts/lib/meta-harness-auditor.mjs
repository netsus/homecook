import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BOOKKEEPING_AUTHORITY_DOC_PATH } from "./bookkeeping-authority.mjs";

function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function readJsonIfExists(filePath) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null;
}

function hasAllFragments(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

function relativePath(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
}

function walkFiles(rootDir, startDir) {
  if (!existsSync(startDir)) {
    return [];
  }

  const entries = readdirSync(startDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(rootDir, absolutePath));
      continue;
    }

    files.push(relativePath(rootDir, absolutePath));
  }

  return files;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "-");
}

function writeJsonFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
}

function timestampedFixDir(rootDir) {
  return path.join(rootDir, ".artifacts/meta-harness-auditor/fixes", timestampSlug());
}

function parseExplicitSampleSlices(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((slice) => slice.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

const RUNTIME_ANOMALY_SIGNAL_CONTRACT = {
  version: 1,
  required_fields: [
    "runtimeSignal",
    "reasonCode",
    "retryAt",
    "heartbeatFreshness",
    "activityFreshness",
    "liveProcessStatus",
  ],
  surfaces: [
    "omo:status",
    "omo:status:brief",
    "audit-context.json",
    "runtime-anomaly-summary.json",
    "report.md",
  ],
};

function listWorkpackSlices(rootDir) {
  const workpacksDir = path.join(rootDir, "docs/workpacks");
  if (!existsSync(workpacksDir)) {
    return [];
  }

  return readdirSync(workpacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{2}-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function resolveSliceNumberRef(allSlices, sliceNumber) {
  return allSlices.find((slice) => slice.startsWith(`${sliceNumber}-`)) ?? null;
}

function extractSliceRefsFromText(rootDir, text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return [];
  }

  const allSlices = listWorkpackSlices(rootDir);
  const matches = new Set(allSlices.filter((slice) => text.includes(slice)));

  for (const match of text.matchAll(/\bslice(\d{2})\b/gi)) {
    const resolved = resolveSliceNumberRef(allSlices, match[1]);
    if (resolved) {
      matches.add(resolved);
    }
  }

  return [...matches];
}

function readBulletField(body, field) {
  const match = body.match(new RegExp(`^- ${field}:\\s+(.+)$`, "m"));
  const rawValue = match?.[1]?.trim();
  if (!rawValue) {
    return null;
  }

  return rawValue.startsWith("`") && rawValue.endsWith("`") ? rawValue.slice(1, -1) : rawValue;
}

function readIncidentRegistryStatus(rootDir) {
  const incidentRegistryPath = path.join(rootDir, "docs/engineering/workflow-v2/omo-incident-registry.md");
  const incidentRegistryText = readTextIfExists(incidentRegistryPath) ?? "";

  if (!incidentRegistryText) {
    return {
      incidentRegistryPath,
      incidentRegistryText,
      exists: false,
      incidents: [],
      incidentIds: [],
      unresolvedIncidentIds: [],
      unresolvedSliceRefs: [],
      hasClosedByReplay: false,
    };
  }

  const incidents = [];
  const sectionPattern = /^### ([A-Z0-9-]+)\n([\s\S]*?)(?=^### |\Z)/gm;

  for (const match of incidentRegistryText.matchAll(sectionPattern)) {
    const id = match[1];
    const body = match[2] ?? "";
    const status = readBulletField(body, "status");
    const boundary = readBulletField(body, "boundary");
    const bucket = readBulletField(body, "bucket");
    const stageScope = readBulletField(body, "stage_scope");
    const symptom = readBulletField(body, "symptom");
    const currentRecovery = readBulletField(body, "current_recovery");

    incidents.push({
      id,
      status,
      boundary,
      bucket,
      stageScope,
      symptom,
      currentRecovery,
      body,
      sliceRefs: extractSliceRefsFromText(rootDir, body),
    });
  }

  const unresolvedIncidents = incidents.filter(
    (incident) =>
      (incident.status === "open" || incident.status === "backfill-required") &&
      incident.boundary !== "product-local" &&
      incident.boundary !== "separated-product-bug",
  );

  return {
    incidentRegistryPath,
    incidentRegistryText,
    exists: true,
    incidents,
    incidentIds: incidents.map((incident) => incident.id),
    unresolvedIncidentIds: unresolvedIncidents.map((incident) => incident.id),
    unresolvedSliceRefs: uniqueStrings(unresolvedIncidents.flatMap((incident) => incident.sliceRefs)),
    hasClosedByReplay: incidents.some((incident) => incident.status === "closed-by-replay"),
  };
}

function sortSlicesByRecency(allSlices, slices) {
  const order = new Map(allSlices.map((slice, index) => [slice, index]));
  return uniqueStrings(slices).sort((left, right) => (order.get(right) ?? -1) - (order.get(left) ?? -1));
}

function resolveSampleSlices(rootDir, explicitSlices, inFlightSlice = null) {
  if (explicitSlices.length > 0) {
    return uniqueStrings(explicitSlices);
  }

  const allSlices = listWorkpackSlices(rootDir);
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const recentSlices = [...allSlices].slice(-2);
  const prioritizedSlices = [
    inFlightSlice,
    ...sortSlicesByRecency(allSlices, incidentStatus.unresolvedSliceRefs),
    ...sortSlicesByRecency(allSlices, recentSlices),
    ...[...allSlices].reverse(),
  ];

  return uniqueStrings(prioritizedSlices).slice(0, 4);
}

function buildAuditCoverageStatus({ rootDir, sampledSlices, inFlightSlice = null, explicitSlices = [] }) {
  const allSlices = listWorkpackSlices(rootDir);
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const sampleSet = new Set(sampledSlices);
  const recentSlices = [...allSlices].slice(-2);
  const missingRecentSlices = recentSlices.filter((slice) => !sampleSet.has(slice));
  const inFlightMissing =
    typeof inFlightSlice === "string" && inFlightSlice.trim().length > 0 && !sampleSet.has(inFlightSlice)
      ? [inFlightSlice]
      : [];
  const uncoveredIncidentSlices = incidentStatus.unresolvedSliceRefs.filter((slice) => !sampleSet.has(slice));
  const coverageGapReasons = [];

  if (inFlightMissing.length > 0) {
    coverageGapReasons.push(`in-flight slice missing from audit sample: ${inFlightMissing.join(", ")}`);
  }

  if (missingRecentSlices.length > 0) {
    coverageGapReasons.push(`recent slices missing from audit sample: ${missingRecentSlices.join(", ")}`);
  }

  if (
    incidentStatus.unresolvedSliceRefs.length > 0 &&
    uncoveredIncidentSlices.length === incidentStatus.unresolvedSliceRefs.length
  ) {
    coverageGapReasons.push(
      `no unresolved-incident slice is represented in audit sample: ${incidentStatus.unresolvedSliceRefs.join(", ")}`,
    );
  }

  const missingEvidenceSummary = [];
  if (!incidentStatus.exists) {
    missingEvidenceSummary.push("incident registry missing");
  }

  return {
    selectionReason:
      explicitSlices.length > 0 ? "explicit sample slices provided" : "default recent/incident-aware sample",
    incidentIdsConsulted: incidentStatus.incidentIds,
    missingEvidenceSummary,
    confidenceDowngradeReasons: [...missingEvidenceSummary, ...coverageGapReasons],
    coverageGapReasons,
    incidentStatus,
    uncoveredIncidentSlices,
    explicitSlices: uniqueStrings(explicitSlices),
  };
}

function incidentMentionsAny(incident, fragments) {
  const haystack = [
    incident.id,
    incident.bucket,
    incident.stageScope,
    incident.symptom,
    incident.currentRecovery,
    incident.body,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();

  return fragments.some((fragment) => haystack.includes(fragment.toLowerCase()));
}

function summarizeIncidentFamily({ incidents, familyId, label, keywords }) {
  const matchedIncidents = incidents.filter((incident) => incidentMentionsAny(incident, keywords));

  return {
    id: familyId,
    label,
    incident_ids: matchedIncidents.map((incident) => incident.id),
    count: matchedIncidents.length,
  };
}

export function buildRuntimeAnomalySummary({ rootDir = process.cwd() } = {}) {
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const runtimeIncidents = incidentStatus.incidents.filter(
    (incident) =>
      (incident.status === "open" || incident.status === "backfill-required") &&
      incident.boundary !== "product-local" &&
      incident.boundary !== "separated-product-bug" &&
      (incident.bucket?.includes("D. Runtime / Observability Reset") ||
        incidentMentionsAny(incident, [
          "stale lock",
          "skip_locked",
          "stage_running",
          "blocked_retry",
          "human_escalation",
          "manual handoff",
          "retry_not_due",
        ])),
  );

  const familyBreakdown = [
    summarizeIncidentFamily({
      incidents: runtimeIncidents,
      familyId: "stale-lock",
      label: "stale lock / skip_locked / stage_running residue",
      keywords: ["stale lock", "skip_locked", "stage_running", "retry_not_due"],
    }),
    summarizeIncidentFamily({
      incidents: runtimeIncidents,
      familyId: "manual-recovery",
      label: "manual handoff / human escalation / manual recovery",
      keywords: ["manual handoff", "human_escalation", "manual", "recovery"],
    }),
    summarizeIncidentFamily({
      incidents: runtimeIncidents,
      familyId: "visibility",
      label: "operator visibility / heartbeat / transcript freshness gaps",
      keywords: ["operator", "visibility", "transcript", "stdout", "stderr", "heartbeat"],
    }),
  ].filter((family) => family.count > 0);

  return {
    version: 1,
    incident_ids: runtimeIncidents.map((incident) => incident.id),
    incident_count: runtimeIncidents.length,
    slice_refs: uniqueStrings(runtimeIncidents.flatMap((incident) => incident.sliceRefs)),
    operator_signal_contract: RUNTIME_ANOMALY_SIGNAL_CONTRACT,
    family_breakdown: familyBreakdown,
    representative_symptoms: runtimeIncidents
      .map((incident) => incident.symptom)
      .filter((symptom) => typeof symptom === "string" && symptom.length > 0)
      .slice(0, 5),
  };
}

export function buildPrCiRealityDriftSummary({ rootDir = process.cwd() } = {}) {
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const driftIncidents = incidentStatus.incidents.filter(
    (incident) =>
      (incident.status === "open" || incident.status === "backfill-required") &&
      incident.boundary !== "product-local" &&
      incident.boundary !== "separated-product-bug" &&
      (incident.bucket?.includes("E. PR / CI Integration Reset") ||
        incidentMentionsAny(incident, [
          "pr body",
          "policy ci",
          "policy fail",
          "no-op commit",
          "gh pr checks",
          "pr_checks_failed",
          "stale wait",
          "ci wait",
        ])),
  );

  const familyBreakdown = [
    summarizeIncidentFamily({
      incidents: driftIncidents,
      familyId: "pr-body-projection",
      label: "PR body evidence / policy rerun drift",
      keywords: ["pr body", "policy fail", "no-op commit", "body edit"],
    }),
    summarizeIncidentFamily({
      incidents: driftIncidents,
      familyId: "ci-snapshot",
      label: "current-head / CI snapshot drift",
      keywords: ["gh pr checks", "pr_checks_failed", "stale wait", "ci wait", "current head"],
    }),
  ].filter((family) => family.count > 0);

  return {
    version: 1,
    incident_ids: driftIncidents.map((incident) => incident.id),
    incident_count: driftIncidents.length,
    slice_refs: uniqueStrings(driftIncidents.flatMap((incident) => incident.sliceRefs)),
    family_breakdown: familyBreakdown,
    representative_symptoms: driftIncidents
      .map((incident) => incident.symptom)
      .filter((symptom) => typeof symptom === "string" && symptom.length > 0)
      .slice(0, 5),
  };
}

function readPromotionEvidenceStatus(rootDir) {
  const workflowReadmePath = path.join(rootDir, "docs/engineering/workflow-v2/README.md");
  const omoBasePath = path.join(rootDir, "docs/engineering/workflow-v2/omo-base.md");
  const checklistPath = path.join(rootDir, "docs/engineering/workflow-v2/promotion-readiness.md");
  const opencodeReadmePath = path.join(rootDir, ".opencode/README.md");
  const evidencePath = path.join(rootDir, ".workflow-v2/promotion-evidence.json");
  const workflowReadmeText = readTextIfExists(workflowReadmePath) ?? "";
  const omoBaseText = readTextIfExists(omoBasePath) ?? "";
  const checklistText = readTextIfExists(checklistPath) ?? "";
  const opencodeReadmeText = readTextIfExists(opencodeReadmePath) ?? "";
  const evidence = readJsonIfExists(evidencePath);
  const evidenceText = evidence ? JSON.stringify(evidence).toLowerCase() : "";

  const requiredLaneIds = ["authority-required-ui", "external-smoke", "bugfix-patch"];
  const pilotLanes = Array.isArray(evidence?.pilot_lanes) ? evidence.pilot_lanes : [];
  const operationalGates = Array.isArray(evidence?.operational_gates) ? evidence.operational_gates : [];
  const documentationGates = Array.isArray(evidence?.documentation_gates) ? evidence.documentation_gates : [];
  const manualHandoffStandardLocked =
    hasAllFragments(workflowReadmeText, [
      "manual handoff는 `high-risk` / `anchor-extension` / `exceptional recovery`에 한정된 예외 경로다.",
      "provider wait와 budget issue는 기본적으로 `pause + scheduled resume`를 사용한다.",
    ]) &&
    hasAllFragments(checklistText, [
      "manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.",
      "provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.",
    ]) &&
    hasAllFragments(opencodeReadmeText, [
      "## Manual Handoff Standard",
      "provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.",
      "handoff bundle은 아래를 반드시 포함한다.",
    ]);
  const liveSmokeStandardLocked =
    hasAllFragments(workflowReadmeText, [
      "live smoke는 일반 PR CI 전체 강제가 아니라 `external_smokes[]`가 선언된 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.",
      "live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
    ]) &&
    hasAllFragments(checklistText, [
      "live smoke는 `external_smokes[]`가 비어 있지 않은 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.",
      "canonical evidence는 source PR의 `Actual Verification`이며, closeout preflight는 같은 evidence를 재사용한다.",
      "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox rehearsal 중 더 이른 쪽을 따른다.",
    ]) &&
    hasAllFragments(opencodeReadmeText, [
      "## Live Smoke Standard",
      "canonical evidence는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.",
      "rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox repo rehearsal 중 더 이른 쪽을 따른다.",
    ]);
  const schedulerStandardLocked =
    hasAllFragments(workflowReadmeText, [
      "scheduler standard는 team-shared default를 `macOS launchd`로 고정하고, non-macOS 환경은 `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending` fallback으로 다룬다.",
      "scheduler install/config 변경 뒤와 최소 `slice-batch-review`마다 1회 `pnpm omo:scheduler:verify -- --work-item <id>`와 `pnpm omo:tick:watch -- --work-item <id>`를 함께 확인한다.",
    ]) &&
    hasAllFragments(checklistText, [
      "team-shared default scheduler는 현재 `macOS launchd`로 고정한다.",
      "non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.",
      "최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.",
    ]) &&
    hasAllFragments(opencodeReadmeText, [
      "## Scheduler Standard",
      "team-shared default scheduler는 현재 `macOS launchd`다.",
      "non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.",
      "최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.",
    ]);
  const incompleteLaneIds = requiredLaneIds.filter((laneId) => {
    const lane = pilotLanes.find((entry) => entry?.id === laneId);
    return !lane || lane.status !== "pass";
  });
  const incompleteOperationalGateIds = operationalGates
    .filter((gate) => gate?.status !== "pass")
    .map((gate) => gate.id)
    .filter(Boolean);
  if (
    operationalGates.some((gate) => gate?.id === "manual-handoff-policy" && gate?.status === "pass") &&
    !manualHandoffStandardLocked
  ) {
    incompleteOperationalGateIds.push("manual-handoff-policy");
  }
  if (
    operationalGates.some((gate) => gate?.id === "live-smoke-standard" && gate?.status === "pass") &&
    !liveSmokeStandardLocked
  ) {
    incompleteOperationalGateIds.push("live-smoke-standard");
  }
  if (
    operationalGates.some((gate) => gate?.id === "scheduler-standard" && gate?.status === "pass") &&
    !schedulerStandardLocked
  ) {
    incompleteOperationalGateIds.push("scheduler-standard");
  }
  const incompleteDocumentationGateIds = documentationGates
    .filter((gate) => gate?.status !== "pass")
    .map((gate) => gate.id)
    .filter(Boolean);

  return {
    workflowReadmePath,
    omoBasePath,
    checklistPath,
    opencodeReadmePath,
    evidencePath,
    workflowReadmeText,
    omoBaseText,
    checklistText,
    opencodeReadmeText,
    evidence,
    gateStatus: evidence?.promotion_gate?.status ?? "not-ready",
    blockers: Array.isArray(evidence?.promotion_gate?.blockers) ? evidence.promotion_gate.blockers : [],
    executionMode: evidence?.execution_mode ?? "pilot",
    incompleteLaneIds,
    incompleteOperationalGateIds,
    incompleteDocumentationGateIds,
    laneEvidenceRefs: pilotLanes.flatMap((lane) => lane?.workpack_refs ?? []).filter(Boolean),
    hasChecklistDoc: checklistText.length > 0,
    hasEvidenceLedger: Boolean(evidence),
    manualHandoffStandardLocked,
    liveSmokeStandardLocked,
    schedulerStandardLocked,
    hasPilotSignal:
      workflowReadmeText.includes("v1 절차") ||
      workflowReadmeText.includes("pilot") ||
      workflowReadmeText.includes("파일럿") ||
      (typeof evidence?.execution_mode === "string" && evidence.execution_mode !== "default"),
    hasManualHandoffSignal:
      !manualHandoffStandardLocked &&
      (workflowReadmeText.includes("manual") || workflowReadmeText.includes("handoff")),
    hasSmokeSignal:
      !liveSmokeStandardLocked &&
      (workflowReadmeText.includes("live smoke") || workflowReadmeText.includes("on-demand")),
    hasSchedulerSignal:
      !schedulerStandardLocked &&
      (workflowReadmeText.includes("launchd") || workflowReadmeText.includes("macOS")),
    hasPolicyBoundarySignal: omoBaseText.includes("기준은 여전히 v1"),
    hasReplaySignal: evidenceText.includes("replay"),
  };
}

function readReplayAcceptanceStatus(rootDir) {
  const replayPath = path.join(rootDir, ".workflow-v2/replay-acceptance.json");
  const replay = readJsonIfExists(replayPath);
  const lanes = Array.isArray(replay?.lanes) ? replay.lanes : [];
  const requiredLanes = lanes.filter((lane) => lane?.required === true);
  const incompleteRequiredLaneIds = requiredLanes
    .filter((lane) => lane?.status !== "pass")
    .map((lane) => lane?.id)
    .filter(Boolean);
  const summaryStatus = replay?.summary?.status ?? "not-started";

  return {
    replayPath,
    replay,
    exists: Boolean(replay),
    summaryStatus,
    requiredLaneIds: requiredLanes.map((lane) => lane?.id).filter(Boolean),
    incompleteRequiredLaneIds,
    hasPassedReplay:
      Boolean(replay) &&
      summaryStatus === "pass" &&
      incompleteRequiredLaneIds.length === 0,
  };
}

export function resolveAuditArgs(argv = []) {
  let outputDir;
  let sampleSlices = [];
  let checkpoint;
  let inFlightSlice;
  let reason;
  let cadenceEvent = "manual-ad-hoc";

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output-dir") {
      outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--sample-slices") {
      sampleSlices = parseExplicitSampleSlices(argv[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--checkpoint") {
      checkpoint = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--in-flight-slice") {
      inFlightSlice = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--reason") {
      reason = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--cadence-event") {
      cadenceEvent = argv[index + 1];
      index += 1;
    }
  }

  return { outputDir, sampleSlices, checkpoint, inFlightSlice, reason, cadenceEvent };
}

export function resolveFixArgs(argv = []) {
  let outputDir;
  let findingId;
  let reason;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output-dir") {
      outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--finding") {
      findingId = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--reason") {
      reason = argv[index + 1];
      index += 1;
    }
  }

  if (!findingId) {
    throw new Error("Missing required --finding <id>.");
  }

  return { outputDir, findingId, reason };
}

function loadFindingRegistry(rootDir) {
  const registry =
    readJsonIfExists(path.join(rootDir, "docs/engineering/meta-harness-auditor/finding-registry.json")) ?? {
      version: 1,
      findings: [],
    };

  return new Map(Array.isArray(registry.findings) ? registry.findings.map((entry) => [entry.id, entry]) : []);
}

function loadCadenceConfig(rootDir) {
  return (
    readJsonIfExists(path.join(rootDir, "docs/engineering/meta-harness-auditor/cadence.json")) ?? {
      version: 1,
      events: [],
    }
  );
}

function createFindingFromRegistry(registry, id, overrides) {
  const entry = registry.get(id);
  if (!entry) {
    throw new Error(`Missing finding registry entry for '${id}'.`);
  }

  return {
    id: entry.id,
    title: entry.title,
    severity: entry.severity,
    priority: entry.priority,
    bucket: entry.bucket,
    owner: entry.owner,
    safe_to_autofix: entry.safe_to_autofix,
    approval_required: entry.approval_required,
    ...overrides,
  };
}

export function findNestedLibFiles({ rootDir = process.cwd() } = {}) {
  return walkFiles(rootDir, path.join(rootDir, "lib")).filter((filePath) => filePath.startsWith("lib/"));
}

export function detectPlaywrightWorkflowGap({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const workflowPath = path.join(rootDir, ".github/workflows/playwright.yml");
  const workflowText = readTextIfExists(workflowPath);
  if (!workflowText) {
    return [];
  }

  const nestedFiles = findNestedLibFiles({ rootDir }).filter((filePath) => filePath.split("/").length > 2);
  const coversNestedLib = workflowText.includes("lib/**");

  if (coversNestedLib || nestedFiles.length === 0) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-CI-001", {
      why_it_matters:
        "Nested lib changes can bypass frontend QA workflows when the Playwright path filter only watches shallow lib entries.",
      evidence_refs: [
        ".github/workflows/playwright.yml",
        ...nestedFiles.slice(0, 3),
      ],
      recommended_validation: [
        "pnpm exec vitest run tests/meta-harness-auditor.test.ts",
        "Verify .github/workflows/playwright.yml includes lib/** coverage.",
      ],
      suggested_next_step:
        "Expand the Playwright workflow path filters to cover lib/** and add a regression test for workflow path coverage.",
    }),
  ];
}

export function detectBookkeepingOverlap({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const sliceWorkflowText = readTextIfExists(path.join(rootDir, "docs/engineering/slice-workflow.md")) ?? "";
  const workflowReadmeText =
    readTextIfExists(path.join(rootDir, "docs/engineering/workflow-v2/README.md")) ?? "";
  const workflowOverviewText =
    readTextIfExists(path.join(rootDir, "docs/engineering/agent-workflow-overview.md")) ?? "";
  const authorityMatrixText =
    readTextIfExists(path.join(rootDir, BOOKKEEPING_AUTHORITY_DOC_PATH)) ?? "";
  const closeoutValidatorText =
    readTextIfExists(path.join(rootDir, "scripts/lib/validate-closeout-sync.mjs")) ?? "";
  const bookkeepingValidatorText =
    readTextIfExists(path.join(rootDir, "scripts/lib/validate-omo-bookkeeping.mjs")) ?? "";
  const closeoutPolicyText =
    readTextIfExists(path.join(rootDir, "scripts/lib/omo-closeout-policy.mjs")) ?? "";
  const reconcileText = readTextIfExists(path.join(rootDir, "scripts/lib/omo-reconcile.mjs")) ?? "";
  const trackedStateExists = existsSync(path.join(rootDir, ".workflow-v2/status.json"));
  const authorityHelperExists = existsSync(path.join(rootDir, "scripts/lib/bookkeeping-authority.mjs"));

  const sliceMentionsCloseoutSurfaces =
    sliceWorkflowText.includes("Delivery Checklist") &&
    sliceWorkflowText.includes("roadmap status") &&
    sliceWorkflowText.includes("acceptance") &&
    sliceWorkflowText.includes("PR 본문");
  const workflowMentionsTrackedState =
    workflowReadmeText.includes(".workflow-v2/") &&
    workflowReadmeText.includes("omo:reconcile");
  const docsReferenceAuthorityMatrix =
    sliceWorkflowText.includes("bookkeeping-authority-matrix.md") &&
    workflowReadmeText.includes("bookkeeping-authority-matrix.md") &&
    workflowOverviewText.includes("bookkeeping-authority-matrix.md");
  const matrixDeclaresCrossLayerOwnership =
    authorityMatrixText.includes("docs/workpacks/README.md") &&
    authorityMatrixText.includes(".workflow-v2/status.json") &&
    authorityMatrixText.includes("PR body closeout evidence");
  const validatorsUseSharedAuthority =
    closeoutValidatorText.includes("resolveSliceBookkeepingPaths") &&
    bookkeepingValidatorText.includes("describeCloseoutWritableSurfaces") &&
    closeoutPolicyText.includes("bookkeeping-authority.mjs") &&
    reconcileText.includes("describeCloseoutWritableScopeForPr");

  if (!trackedStateExists || !sliceMentionsCloseoutSurfaces || !workflowMentionsTrackedState) {
    return [];
  }

  if (authorityHelperExists && docsReferenceAuthorityMatrix && matrixDeclaresCrossLayerOwnership && validatorsUseSharedAuthority) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-GOV-001", {
      why_it_matters:
        "Closeout state currently spans workpack docs, PR evidence, and .workflow-v2 tracked state, which makes drift and reconcile work a first-class operational burden.",
      evidence_refs: [
        "docs/engineering/slice-workflow.md",
        BOOKKEEPING_AUTHORITY_DOC_PATH,
        "docs/engineering/workflow-v2/README.md",
        ".workflow-v2/status.json",
      ],
      recommended_validation: [
        "pnpm validate:omo-bookkeeping",
        "pnpm validate:closeout-sync",
      ],
      suggested_next_step:
        "Define an authoritative source matrix for closeout and tracked-state fields, then narrow reconcile automation to projection-only surfaces.",
    }),
  ];
}

export function detectOmoPromotionRisk({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const status = readPromotionEvidenceStatus(rootDir);
  const hasOperationalRiskSignal =
    status.hasManualHandoffSignal || status.hasSmokeSignal || status.hasSchedulerSignal;
  const isReadyForDefaultCutover =
    status.hasChecklistDoc &&
    status.hasEvidenceLedger &&
    status.executionMode === "default" &&
    status.gateStatus === "ready" &&
    status.incompleteLaneIds.length === 0 &&
    status.incompleteOperationalGateIds.length === 0 &&
    status.incompleteDocumentationGateIds.length === 0 &&
    !status.hasPolicyBoundarySignal &&
    !status.hasPilotSignal &&
    !hasOperationalRiskSignal;

  if (isReadyForDefaultCutover) {
    return [];
  }

  const missingPieces = [
    ...(!status.hasChecklistDoc ? ["promotion checklist doc missing"] : []),
    ...(!status.hasEvidenceLedger ? ["promotion evidence ledger missing"] : []),
    ...status.incompleteDocumentationGateIds.map((id) => `documentation gate '${id}' not passed`),
    ...status.incompleteOperationalGateIds.map((id) => `operational gate '${id}' not passed`),
    ...status.incompleteLaneIds.map((id) => `pilot lane '${id}' not passed`),
  ];
  const suggestedNextStep =
    missingPieces.length > 0
      ? `Keep OMO v2 in promotion-candidate mode and close the remaining promotion gate items: ${missingPieces.join(", ")}. Update .workflow-v2/promotion-evidence.json after each slice06 or parallel pilot checkpoint.`
      : "Keep OMO v2 in promotion-candidate mode, collect slice06 and parallel pilot evidence, and only cut over after the promotion checklist passes.";

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-001", {
      why_it_matters:
        "Current docs and promotion evidence still describe OMO v2 as a promotion-candidate runtime with manual handoff, partial operational standards, or incomplete pilot lanes, so promoting it to the default workflow now would be a premature cutover.",
      evidence_refs: [
        "docs/engineering/workflow-v2/README.md",
        "docs/engineering/workflow-v2/promotion-readiness.md",
        ".workflow-v2/promotion-evidence.json",
        ...status.laneEvidenceRefs.slice(0, 3),
        ...(status.hasPolicyBoundarySignal ? ["docs/engineering/workflow-v2/omo-base.md"] : []),
      ],
      recommended_validation: [
        "Update .workflow-v2/promotion-evidence.json after each slice06 / parallel pilot checkpoint.",
        "Run the authority-required, external-smoke, and bugfix pilot set before changing the canonical workflow entrypoint.",
        "Re-run pnpm harness:audit after promotion-readiness evidence is updated.",
      ],
      suggested_next_step: suggestedNextStep,
    }),
  ];
}

/**
 * @typedef {{
 *   rootDir?: string;
 *   sampledSlices?: string[];
 *   inFlightSlice?: string | null;
 *   explicitSlices?: string[];
 *   registry?: Map<string, any>;
 * }} MetaHarnessCoverageOptions
 */

/**
 * @param {MetaHarnessCoverageOptions} [options]
 */
export function detectOmoAuditCoverageGap({
  rootDir = process.cwd(),
  sampledSlices = [],
  inFlightSlice = null,
  explicitSlices = [],
  registry,
} = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const effectiveSampledSlices =
    sampledSlices.length > 0 ? sampledSlices : resolveSampleSlices(rootDir, explicitSlices, inFlightSlice);
  const coverageStatus = buildAuditCoverageStatus({
    rootDir,
    sampledSlices: effectiveSampledSlices,
    inFlightSlice,
    explicitSlices,
  });

  if (coverageStatus.coverageGapReasons.length === 0) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-002", {
      why_it_matters:
        "The audit sample omits recent, in-flight, or incident-linked slices, so a green report can reflect sample bias instead of real OMO health.",
      evidence_refs: [
        ...effectiveSampledSlices.map((slice) => `docs/workpacks/${slice}/README.md`).slice(0, 4),
        relativePath(rootDir, coverageStatus.incidentStatus.incidentRegistryPath),
        ".workflow-v2/status.json",
      ],
      recommended_validation: [
        "Re-run pnpm harness:audit with the current in-flight slice and recent representative slices included.",
        "Confirm the audit sample covers recent merged slices and at least one unresolved-incident slice family.",
      ],
      suggested_next_step: `Expand the audit sample before trusting the scorecard: ${coverageStatus.coverageGapReasons.join("; ")}.`,
    }),
  ];
}

export function detectOmoPromotionDrift({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const promotionStatus = readPromotionEvidenceStatus(rootDir);
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const replayStatus = readReplayAcceptanceStatus(rootDir);
  const promotionClaimActive =
    promotionStatus.executionMode === "default" ||
    promotionStatus.gateStatus === "ready" ||
    promotionStatus.gateStatus === "candidate";

  if (!promotionClaimActive) {
    return [];
  }

  const missingPieces = [];
  if (!incidentStatus.exists) {
    missingPieces.push("incident registry missing");
  }
  if (incidentStatus.unresolvedIncidentIds.length > 0) {
    missingPieces.push(`unresolved incidents remain: ${incidentStatus.unresolvedIncidentIds.join(", ")}`);
  }
  const replayEvidencePresent = replayStatus.exists
    ? replayStatus.hasPassedReplay
    : promotionStatus.hasReplaySignal || incidentStatus.hasClosedByReplay;
  if (!replayEvidencePresent) {
    missingPieces.push("replay acceptance evidence missing");
  }

  if (missingPieces.length === 0) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-006", {
      why_it_matters:
        "Promotion verdicts can still drift to candidate/ready even when unresolved incident families or replay evidence gaps remain, which recreates false-green cutover risk.",
      evidence_refs: [
        "docs/engineering/workflow-v2/promotion-readiness.md",
        ".workflow-v2/promotion-evidence.json",
        ".workflow-v2/replay-acceptance.json",
        relativePath(rootDir, incidentStatus.incidentRegistryPath),
      ],
      recommended_validation: [
        "Re-run pnpm harness:audit after incident-aware promotion checks are updated.",
        "Do not restore candidate/ready until replay evidence and unresolved incident dispositions are recorded.",
      ],
      suggested_next_step: `Keep promotion verdict below ready until these gaps are resolved: ${missingPieces.join("; ")}.`,
    }),
  ];
}

export function detectOmoRuntimeAnomalyGap({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const runtimeSummary = buildRuntimeAnomalySummary({ rootDir });

  if (runtimeSummary.incident_count === 0) {
    return [];
  }

  const familySummary =
    runtimeSummary.family_breakdown.length > 0
      ? runtimeSummary.family_breakdown.map((family) => `${family.label}=${family.count}`).join(", ")
      : `${runtimeSummary.incident_count} unresolved runtime incident(s)`;

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-003", {
      why_it_matters:
        "Runtime anomalies such as stale locks, blocked retry loops, and manual handoff residue remain in the incident corpus, so auditor output must keep them visible instead of treating them as historical noise.",
      evidence_refs: [
        "docs/engineering/workflow-v2/omo-incident-registry.md",
        ".workflow-v2/status.json",
        ".opencode/README.md",
      ],
      recommended_validation: [
        "Re-run pnpm harness:audit after runtime anomaly detectors and summaries are updated.",
        "Confirm runtime findings remain active until replay or explicit disposition closes the incident family.",
      ],
      suggested_next_step: `Keep runtime anomaly findings active while these families remain unresolved: ${familySummary}.`,
    }),
  ];
}

export function detectOmoPrCiRealityDrift({ rootDir = process.cwd(), registry } = {}) {
  const resolvedRegistry = registry ?? loadFindingRegistry(rootDir);
  const driftSummary = buildPrCiRealityDriftSummary({ rootDir });

  if (driftSummary.incident_count === 0) {
    return [];
  }

  const familySummary =
    driftSummary.family_breakdown.length > 0
      ? driftSummary.family_breakdown.map((family) => `${family.label}=${family.count}`).join(", ")
      : `${driftSummary.incident_count} unresolved PR/CI drift incident(s)`;

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-005", {
      why_it_matters:
        "PR body evidence drift and stale CI snapshots create false merge-state narratives unless auditor output keeps those mismatches visible.",
      evidence_refs: [
        "docs/engineering/workflow-v2/omo-incident-registry.md",
        ".workflow-v2/promotion-evidence.json",
        "docs/engineering/workflow-v2/promotion-readiness.md",
      ],
      recommended_validation: [
        "Re-run pnpm harness:audit after PR body projection and CI snapshot checks are updated.",
        "Confirm PR/CI drift remains active until current-head reality and projection state converge.",
      ],
      suggested_next_step: `Keep PR/CI drift findings active while these families remain unresolved: ${familySummary}.`,
    }),
  ];
}

export function collectMetaHarnessFindings({
  rootDir = process.cwd(),
  sampledSlices = [],
  inFlightSlice = null,
  explicitSlices = [],
} = {}) {
  const registry = loadFindingRegistry(rootDir);

  return [
    ...detectPlaywrightWorkflowGap({ rootDir, registry }),
    ...detectBookkeepingOverlap({ rootDir, registry }),
    ...detectOmoAuditCoverageGap({ rootDir, sampledSlices, inFlightSlice, explicitSlices, registry }),
    ...detectOmoRuntimeAnomalyGap({ rootDir, registry }),
    ...detectOmoPrCiRealityDrift({ rootDir, registry }),
    ...detectOmoPromotionRisk({ rootDir, registry }),
    ...detectOmoPromotionDrift({ rootDir, registry }),
  ];
}

function ensureFixableFinding({ rootDir, findingId }) {
  const registry = loadFindingRegistry(rootDir);
  const entry = registry.get(findingId);

  if (!entry) {
    throw new Error(`Unknown finding ID '${findingId}'.`);
  }

  if (entry.stability !== "stable") {
    throw new Error(`Finding '${findingId}' is not a stable fix target.`);
  }

  if (!entry.safe_to_autofix || entry.approval_required) {
    throw new Error(`Finding '${findingId}' is not eligible for fix-one-finding mode.`);
  }

  return entry;
}

function replaceWorkflowCoveragePattern(text) {
  return text.replace(/(["'])lib\/\*\.ts\1/g, '$1lib/**$1');
}

function applyPlaywrightWorkflowGapFix({ rootDir }) {
  const workflowPath = path.join(rootDir, ".github/workflows/playwright.yml");
  const workflowText = readTextIfExists(workflowPath);

  if (!workflowText) {
    throw new Error("Cannot autofix H-CI-001 because .github/workflows/playwright.yml is missing.");
  }

  const nextText = replaceWorkflowCoveragePattern(workflowText);
  if (nextText === workflowText) {
    return [];
  }

  writeTextFile(workflowPath, nextText);
  return [".github/workflows/playwright.yml"];
}

const FIX_HANDLERS = {
  "H-CI-001": applyPlaywrightWorkflowGapFix,
};

function createBaseAxis(id, label) {
  return {
    id,
    label,
    score: 5,
    max_score: 5,
    confidence: "medium",
    trend: "unknown",
    rationale: "No blocking findings detected in this audit pass.",
    evidence_refs: [],
  };
}

function applyPenalty(axis, finding) {
  const penalty = finding.priority === "P0" ? 2 : finding.priority === "P1" ? 1.5 : 1;
  axis.score = Math.max(0, Number((axis.score - penalty).toFixed(1)));
  axis.confidence = "high";
  axis.trend = "flat";
  axis.rationale = `${axis.label} 영역에 ${finding.id} finding이 남아 있다.`;
  axis.evidence_refs = [...new Set([...axis.evidence_refs, ...finding.evidence_refs])];
}

export function buildMetaHarnessScorecard({ findings, generatedAt }) {
  const axes = {
    governance: createBaseAxis("governance", "governance"),
    contract_discipline: createBaseAxis("contract_discipline", "contract discipline"),
    frontend_harness: createBaseAxis("frontend_harness", "frontend harness"),
    backend_harness: createBaseAxis("backend_harness", "backend harness"),
    design_authority: createBaseAxis("design_authority", "design authority"),
    testing_qa: createBaseAxis("testing_qa", "testing / QA"),
    review_closeout: createBaseAxis("review_closeout", "review / closeout"),
    automation_omo_runtime: createBaseAxis("automation_omo_runtime", "automation / OMO runtime"),
  };

  for (const finding of findings) {
    if (finding.id === "H-CI-001") {
      applyPenalty(axes.frontend_harness, finding);
      applyPenalty(axes.testing_qa, finding);
      continue;
    }

    if (finding.id === "H-GOV-001") {
      applyPenalty(axes.governance, finding);
      applyPenalty(axes.review_closeout, finding);
      continue;
    }

    if (finding.id === "H-OMO-001") {
      applyPenalty(axes.automation_omo_runtime, finding);
      applyPenalty(axes.governance, finding);
      continue;
    }

    if (finding.id === "H-OMO-002") {
      applyPenalty(axes.governance, finding);
      applyPenalty(axes.automation_omo_runtime, finding);
      continue;
    }

    if (finding.id === "H-OMO-003") {
      applyPenalty(axes.automation_omo_runtime, finding);
      applyPenalty(axes.review_closeout, finding);
      continue;
    }

    if (finding.id === "H-OMO-005") {
      applyPenalty(axes.review_closeout, finding);
      applyPenalty(axes.automation_omo_runtime, finding);
      continue;
    }

    if (finding.id === "H-OMO-006") {
      applyPenalty(axes.automation_omo_runtime, finding);
      applyPenalty(axes.governance, finding);
    }
  }

  const axisValues = Object.values(axes);
  const average = axisValues.reduce((sum, axis) => sum + axis.score, 0) / axisValues.length;

  return {
    version: 1,
    generated_at: generatedAt,
    overall_score: Number(average.toFixed(1)),
    axes: axisValues,
  };
}

export function buildMetaHarnessRemediationPlan({ findings, generatedAt }) {
  const priorities = ["P0", "P1", "P2", "P3", "P4"].map((priority) => {
    const items = findings
      .filter((finding) => finding.priority === priority)
      .map((finding) => ({
        finding_id: finding.id,
        title: finding.title,
        bucket: finding.bucket,
        safe_to_autofix: finding.safe_to_autofix,
        approval_required: finding.approval_required,
        next_step: finding.suggested_next_step,
      }));

    return {
      priority,
      summary: items.length > 0 ? `${items.length} active finding(s)` : "No active findings",
      items,
    };
  });

  return {
    version: 1,
    generated_at: generatedAt,
    priorities,
  };
}

export function buildMetaHarnessPromotionReadiness({ rootDir = process.cwd(), findings, generatedAt }) {
  const status = readPromotionEvidenceStatus(rootDir);
  const incidentStatus = readIncidentRegistryStatus(rootDir);
  const replayStatus = readReplayAcceptanceStatus(rootDir);
  const blockers = findings
    .filter((finding) => finding.bucket === "promotion-blocker" || finding.id === "H-GOV-001")
    .map((finding) => finding.id);
  const verdict = blockers.length > 0 ? "not-ready" : status.gateStatus === "ready" ? "ready" : "candidate";
  const hasBookkeepingOverlapBlocker = blockers.includes("H-GOV-001");
  const summary =
    verdict === "not-ready"
      ? hasBookkeepingOverlapBlocker
        ? "OMO v2는 아직 기본 운영 경로 승격 전 단계이며, bookkeeping 경계와 promotion evidence를 더 잠가야 한다."
        : "OMO v2는 아직 기본 운영 경로 승격 전 단계이며, promotion evidence와 runtime/incident alignment를 더 잠가야 한다."
      : verdict === "ready"
        ? "OMO v2는 승격 gate를 통과한 상태다. 마지막 docs-governance cutover와 인간 승인이 남아 있다."
        : "OMO v2는 승격 후보 상태이며, 마지막 pilot evidence 정리만 남아 있다.";
  const prerequisites = [
    "authority-required, external-smoke, bugfix pilot evidence refresh",
    ...(hasBookkeepingOverlapBlocker ? ["bookkeeping authoritative source matrix"] : []),
    ...(blockers.some((id) => id === "H-OMO-001" || id === "H-OMO-006")
      ? ["promotion evidence / runtime incident alignment"]
      : []),
    "meta-harness-auditor recurring baseline audit",
  ];

  return {
    version: 1,
    generated_at: generatedAt,
    target: "OMO v2",
    verdict,
    summary,
    blockers,
    prerequisites,
    evidence_refs: [
      ...new Set([
        ...findings.flatMap((finding) => finding.evidence_refs),
        relativePath(rootDir, incidentStatus.incidentRegistryPath),
        relativePath(rootDir, status.checklistPath),
        relativePath(rootDir, status.evidencePath),
        relativePath(rootDir, replayStatus.replayPath),
      ]),
    ],
    promotion_evidence_status: status.gateStatus,
    missing_lane_ids: status.incompleteLaneIds,
    missing_operational_gate_ids: status.incompleteOperationalGateIds,
    missing_documentation_gate_ids: status.incompleteDocumentationGateIds,
    incident_blockers: incidentStatus.unresolvedIncidentIds,
    replay_evidence_present: replayStatus.exists
      ? replayStatus.hasPassedReplay
      : status.hasReplaySignal || incidentStatus.hasClosedByReplay,
  };
}

function buildIncidentCoverageBundle({ sampledSlices, coverageStatus, inFlightSlice = null, cadenceEvent, checkpoint }) {
  return {
    version: 1,
    sampled_slices: sampledSlices,
    sample_selection_reason: coverageStatus.selectionReason,
    incident_ids_consulted: coverageStatus.incidentIdsConsulted,
    unresolved_incident_ids: coverageStatus.incidentStatus.unresolvedIncidentIds,
    uncovered_incident_slices: coverageStatus.uncoveredIncidentSlices,
    missing_evidence_summary: coverageStatus.missingEvidenceSummary,
    confidence_downgrade_reasons: coverageStatus.confidenceDowngradeReasons,
    cadence_event: cadenceEvent,
    checkpoint: checkpoint ?? null,
    in_flight_slice: inFlightSlice ?? null,
  };
}

function buildPromotionRationaleBundle({ promotionReadiness, runtimeAnomalySummary, prCiRealityDriftSummary }) {
  const rationale = [];

  if (promotionReadiness.blockers.length > 0) {
    rationale.push(`blocking findings: ${promotionReadiness.blockers.join(", ")}`);
  }
  if (promotionReadiness.incident_blockers.length > 0) {
    rationale.push(`unresolved incidents: ${promotionReadiness.incident_blockers.join(", ")}`);
  }
  if (!promotionReadiness.replay_evidence_present) {
    rationale.push("replay acceptance evidence missing");
  }
  if (runtimeAnomalySummary.incident_count > 0) {
    rationale.push(`runtime anomaly incidents: ${runtimeAnomalySummary.incident_ids.join(", ")}`);
  }
  if (prCiRealityDriftSummary.incident_count > 0) {
    rationale.push(`pr/ci drift incidents: ${prCiRealityDriftSummary.incident_ids.join(", ")}`);
  }

  return {
    version: 1,
    verdict: promotionReadiness.verdict,
    blockers: promotionReadiness.blockers,
    promotion_evidence_status: promotionReadiness.promotion_evidence_status,
    replay_evidence_present: promotionReadiness.replay_evidence_present,
    incident_blockers: promotionReadiness.incident_blockers,
    rationale,
  };
}

export function renderMetaHarnessReport({
  sampledSlices,
  scorecard,
  findings,
  remediationPlan,
  promotionReadiness,
  auditContext,
  runtimeAnomalySummary,
  prCiRealityDriftSummary,
}) {
  const lines = [];
  lines.push("# Meta Harness Audit Report");
  lines.push("");
  lines.push(`- Overall score: ${scorecard.overall_score}/5`);
  lines.push(`- Findings: ${findings.length}`);
  lines.push(`- Promotion readiness: ${promotionReadiness.verdict}`);
  lines.push(`- Sampled slices: ${sampledSlices.length > 0 ? sampledSlices.join(", ") : "none"}`);
  if (auditContext?.sample_selection_reason) {
    lines.push(`- Sample selection reason: ${auditContext.sample_selection_reason}`);
  }
  if (Array.isArray(auditContext?.incident_ids_consulted) && auditContext.incident_ids_consulted.length > 0) {
    lines.push(`- Incident IDs consulted: ${auditContext.incident_ids_consulted.join(", ")}`);
  }
  lines.push(`- Cadence event: ${auditContext?.cadence_event ?? "manual-ad-hoc"}`);
  lines.push(`- Checkpoint: ${auditContext?.checkpoint ?? "none"}`);
  lines.push(`- In-flight slice: ${auditContext?.in_flight_slice ?? "none"}`);
  lines.push("");
  lines.push("## Scorecard");
  lines.push("");

  for (const axis of scorecard.axes) {
    lines.push(`- ${axis.label}: ${axis.score}/${axis.max_score} (${axis.confidence})`);
    lines.push(`  - ${axis.rationale}`);
  }

  lines.push("");
  lines.push("## Findings");
  lines.push("");

  if (findings.length === 0) {
    lines.push("- No active findings.");
  }

  for (const finding of findings) {
    lines.push(`- ${finding.id} [${finding.priority}] ${finding.title}`);
    lines.push(`  - severity: ${finding.severity}`);
    lines.push(`  - bucket: ${finding.bucket}`);
    lines.push(`  - why: ${finding.why_it_matters}`);
    lines.push(`  - next: ${finding.suggested_next_step}`);
  }

  if (
    (Array.isArray(auditContext?.missing_evidence_summary) && auditContext.missing_evidence_summary.length > 0) ||
    (Array.isArray(auditContext?.confidence_downgrade_reasons) &&
      auditContext.confidence_downgrade_reasons.length > 0)
  ) {
    lines.push("");
    lines.push("## Coverage Notes");
    lines.push("");

    if (Array.isArray(auditContext?.missing_evidence_summary) && auditContext.missing_evidence_summary.length > 0) {
      lines.push(`- Missing evidence: ${auditContext.missing_evidence_summary.join(", ")}`);
    }

    if (
      Array.isArray(auditContext?.confidence_downgrade_reasons) &&
      auditContext.confidence_downgrade_reasons.length > 0
    ) {
      lines.push(`- Confidence downgrade reasons: ${auditContext.confidence_downgrade_reasons.join(", ")}`);
    }
  }

  if (runtimeAnomalySummary?.incident_count > 0 || prCiRealityDriftSummary?.incident_count > 0) {
    lines.push("");
    lines.push("## Runtime And CI Signals");
    lines.push("");

    if (runtimeAnomalySummary?.incident_count > 0) {
      lines.push(`- Runtime anomaly incidents: ${runtimeAnomalySummary.incident_ids.join(", ")}`);
      if (Array.isArray(runtimeAnomalySummary.operator_signal_contract?.required_fields)) {
        lines.push(
          `- Runtime signal fields: ${runtimeAnomalySummary.operator_signal_contract.required_fields.join(", ")}`,
        );
      }
    }

    if (prCiRealityDriftSummary?.incident_count > 0) {
      lines.push(`- PR/CI drift incidents: ${prCiRealityDriftSummary.incident_ids.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("## Promotion Readiness");
  lines.push("");
  lines.push(`- Verdict: ${promotionReadiness.verdict}`);
  lines.push(`- Summary: ${promotionReadiness.summary}`);
  lines.push(`- Replay evidence present: ${promotionReadiness.replay_evidence_present ? "yes" : "no"}`);

  if (promotionReadiness.blockers.length > 0) {
    lines.push(`- Blockers: ${promotionReadiness.blockers.join(", ")}`);
  }

  if (Array.isArray(promotionReadiness.incident_blockers) && promotionReadiness.incident_blockers.length > 0) {
    lines.push(`- Incident blockers: ${promotionReadiness.incident_blockers.join(", ")}`);
  }

  lines.push("");
  lines.push("## Remediation Plan");
  lines.push("");

  for (const priority of remediationPlan.priorities) {
    lines.push(`- ${priority.priority}: ${priority.summary}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

/**
 * @param {{
 *   rootDir?: string,
 *   findingId: string,
 *   outputDir?: string,
 *   reason?: string,
 * }} options
 */
export function runMetaHarnessFix({
  rootDir = process.cwd(),
  findingId,
  outputDir,
  reason,
} = {}) {
  if (!findingId) {
    throw new Error("Missing findingId for fix-one-finding mode.");
  }

  const registryEntry = ensureFixableFinding({ rootDir, findingId });
  const activeFindingsBefore = collectMetaHarnessFindings({ rootDir });
  const activeFinding = activeFindingsBefore.find((finding) => finding.id === findingId) ?? null;
  const generatedAt = new Date().toISOString();
  const resolvedOutputDir = outputDir ? path.resolve(rootDir, outputDir) : timestampedFixDir(rootDir);
  const handler = FIX_HANDLERS[findingId];

  if (!handler) {
    throw new Error(`No fix handler is registered for '${findingId}'.`);
  }

  mkdirSync(resolvedOutputDir, { recursive: true });

  let changedFiles = [];
  let status = "noop";
  let summary = `Finding '${findingId}' is not currently active; no changes were needed.`;

  if (activeFinding) {
    changedFiles = handler({ rootDir, finding: activeFinding });
    status = changedFiles.length > 0 ? "applied" : "noop";
    summary =
      status === "applied"
        ? `Applied low-risk remediation for '${findingId}'.`
        : `Finding '${findingId}' was active but no file changes were required.`;
  }

  const activeFindingsAfter = collectMetaHarnessFindings({ rootDir });
  const postFixActive = activeFindingsAfter.some((finding) => finding.id === findingId);

  if (status === "applied" && postFixActive) {
    status = "blocked";
    summary = `Applied attempted remediation for '${findingId}', but the finding is still active.`;
  }

  const result = {
    version: 1,
    generated_at: generatedAt,
    mode: "fix-one-finding",
    finding_id: findingId,
    status,
    safe_to_autofix: registryEntry.safe_to_autofix,
    approval_required: registryEntry.approval_required,
    pre_fix_active: Boolean(activeFinding),
    post_fix_active: postFixActive,
    reason: reason ?? null,
    changed_files: changedFiles,
    recommended_validation: activeFinding?.recommended_validation ?? [],
    summary,
  };

  writeJsonFile(path.join(resolvedOutputDir, "fix-result.json"), result);

  if (status === "blocked") {
    throw new Error(summary);
  }

  return {
    outputDir: resolvedOutputDir,
    result,
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   outputDir?: string,
 *   sampleSlices?: string[],
 *   checkpoint?: string,
 *   inFlightSlice?: string,
 *   reason?: string,
 *   cadenceEvent?: string,
 * }} options
 */
export function runMetaHarnessAudit({
  rootDir = process.cwd(),
  outputDir,
  sampleSlices = [],
  checkpoint,
  inFlightSlice,
  reason,
  cadenceEvent = "manual-ad-hoc",
} = {}) {
  const generatedAt = new Date().toISOString();
  const cadenceConfig = loadCadenceConfig(rootDir);
  const explicitSlices = sampleSlices;
  const sampledSlices = resolveSampleSlices(rootDir, explicitSlices, inFlightSlice);
  const coverageStatus = buildAuditCoverageStatus({
    rootDir,
    sampledSlices,
    inFlightSlice,
    explicitSlices,
  });
  const incidentCoverage = buildIncidentCoverageBundle({
    sampledSlices,
    coverageStatus,
    inFlightSlice,
    cadenceEvent,
    checkpoint,
  });
  const findings = collectMetaHarnessFindings({
    rootDir,
    sampledSlices,
    inFlightSlice,
    explicitSlices,
  });
  const runtimeAnomalySummary = buildRuntimeAnomalySummary({ rootDir });
  const prCiRealityDriftSummary = buildPrCiRealityDriftSummary({ rootDir });
  const scorecard = buildMetaHarnessScorecard({ findings, generatedAt });
  const remediationPlan = buildMetaHarnessRemediationPlan({ findings, generatedAt });
  const promotionReadiness = buildMetaHarnessPromotionReadiness({ rootDir, findings, generatedAt });
  const promotionRationale = buildPromotionRationaleBundle({
    promotionReadiness,
    runtimeAnomalySummary,
    prCiRealityDriftSummary,
  });
  const auditContext = {
    version: 1,
    generated_at: generatedAt,
    run_mode: "audit-only",
    cadence_event: cadenceEvent,
    reason: reason ?? null,
    checkpoint: checkpoint ?? null,
    in_flight_slice: inFlightSlice ?? null,
    config_refs: [
      "docs/engineering/meta-harness-auditor/finding-registry.json",
      "docs/engineering/meta-harness-auditor/cadence.json",
    ],
    sampled_slices: sampledSlices,
    sample_selection_reason: coverageStatus.selectionReason,
    incident_ids_consulted: coverageStatus.incidentIdsConsulted,
    missing_evidence_summary: coverageStatus.missingEvidenceSummary,
    confidence_downgrade_reasons: coverageStatus.confidenceDowngradeReasons,
    runtime_anomaly_signal_contract: runtimeAnomalySummary.operator_signal_contract,
    required_inputs_checked: [
      "AGENTS.md",
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/engineering/*",
      "docs/workpacks/README.md",
      ".github/workflows/*",
      "package.json",
      "scripts/validate-*.mjs",
      "scripts/lib/*",
      ".workflow-v2/*",
      ".opencode/README.md",
      ...(existsSync(path.join(rootDir, "CLAUDE.md")) ? ["CLAUDE.md"] : []),
    ],
    optional_inputs_present: [
      ...(inFlightSlice ? [`in-flight-slice:${inFlightSlice}`] : []),
      ...(checkpoint ? [`checkpoint:${checkpoint}`] : []),
      ...(Array.isArray(cadenceConfig.events) && cadenceConfig.events.some((event) => event.id === cadenceEvent)
        ? [`cadence-event:${cadenceEvent}`]
        : []),
      ...(existsSync(path.join(rootDir, ".workflow-v2/status.json")) ? [".workflow-v2/status.json"] : []),
      ...(existsSync(path.join(rootDir, ".opencode/README.md")) ? [".opencode/README.md"] : []),
    ],
  };
  const report = renderMetaHarnessReport({
    sampledSlices,
    scorecard,
    findings,
    remediationPlan,
    promotionReadiness,
    auditContext,
    runtimeAnomalySummary,
    prCiRealityDriftSummary,
  });

  const resolvedOutputDir = outputDir
    ? path.resolve(rootDir, outputDir)
    : path.join(rootDir, ".artifacts/meta-harness-auditor", timestampSlug());

  mkdirSync(resolvedOutputDir, { recursive: true });

  writeTextFile(path.join(resolvedOutputDir, "report.md"), report);
  writeJsonFile(path.join(resolvedOutputDir, "audit-context.json"), auditContext);
  writeJsonFile(path.join(resolvedOutputDir, "scorecard.json"), scorecard);
  writeJsonFile(path.join(resolvedOutputDir, "findings.json"), {
    version: 1,
    generated_at: generatedAt,
    findings,
  });
  writeJsonFile(path.join(resolvedOutputDir, "incident-coverage.json"), incidentCoverage);
  writeJsonFile(path.join(resolvedOutputDir, "runtime-anomaly-summary.json"), runtimeAnomalySummary);
  writeJsonFile(path.join(resolvedOutputDir, "remediation-plan.json"), remediationPlan);
  writeJsonFile(path.join(resolvedOutputDir, "promotion-readiness.json"), promotionReadiness);
  writeJsonFile(path.join(resolvedOutputDir, "promotion-rationale.json"), promotionRationale);

  return {
    outputDir: resolvedOutputDir,
    sampledSlices,
    findings,
    scorecard,
    incidentCoverage,
    runtimeAnomalySummary,
    prCiRealityDriftSummary,
    remediationPlan,
    promotionReadiness,
    promotionRationale,
    auditContext,
  };
}
