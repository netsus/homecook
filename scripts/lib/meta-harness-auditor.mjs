import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function readJsonIfExists(filePath) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null;
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

function parseExplicitSampleSlices(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((slice) => slice.trim())
    .filter(Boolean);
}

function resolveSampleSlices(rootDir, explicitSlices) {
  if (explicitSlices.length > 0) {
    return explicitSlices;
  }

  const workpacksDir = path.join(rootDir, "docs/workpacks");
  if (!existsSync(workpacksDir)) {
    return [];
  }

  return readdirSync(workpacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{2}-/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .slice(0, 3);
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
  const trackedStateExists = existsSync(path.join(rootDir, ".workflow-v2/status.json"));

  const sliceMentionsCloseoutSurfaces =
    sliceWorkflowText.includes("Delivery Checklist") &&
    sliceWorkflowText.includes("roadmap status") &&
    sliceWorkflowText.includes("acceptance") &&
    sliceWorkflowText.includes("PR 본문");
  const workflowMentionsTrackedState =
    workflowReadmeText.includes(".workflow-v2/") &&
    workflowReadmeText.includes("omo:reconcile");

  if (!trackedStateExists || !sliceMentionsCloseoutSurfaces || !workflowMentionsTrackedState) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-GOV-001", {
      why_it_matters:
        "Closeout state currently spans workpack docs, PR evidence, and .workflow-v2 tracked state, which makes drift and reconcile work a first-class operational burden.",
      evidence_refs: [
        "docs/engineering/slice-workflow.md",
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
  const workflowReadmeText =
    readTextIfExists(path.join(rootDir, "docs/engineering/workflow-v2/README.md")) ?? "";
  const omoBaseText = readTextIfExists(path.join(rootDir, "docs/engineering/workflow-v2/omo-base.md")) ?? "";

  const hasPilotSignal =
    workflowReadmeText.includes("v1 절차") ||
    workflowReadmeText.includes("pilot") ||
    workflowReadmeText.includes("파일럿");
  const hasManualHandoffSignal =
    workflowReadmeText.includes("manual") || workflowReadmeText.includes("handoff");
  const hasSmokeSignal =
    workflowReadmeText.includes("live smoke") || workflowReadmeText.includes("on-demand");
  const hasSchedulerSignal =
    workflowReadmeText.includes("launchd") || workflowReadmeText.includes("macOS");
  const hasPolicyBoundarySignal = omoBaseText.includes("기준은 여전히 v1");

  if (!hasPilotSignal || (!hasManualHandoffSignal && !hasSmokeSignal && !hasSchedulerSignal)) {
    return [];
  }

  return [
    createFindingFromRegistry(resolvedRegistry, "H-OMO-001", {
      why_it_matters:
        "Current docs still describe OMO v2 as a pilot/runtime layer with manual handoff and on-demand operational checks, so promoting it to the default workflow now would be a premature cutover.",
      evidence_refs: [
        "docs/engineering/workflow-v2/README.md",
        ...(hasPolicyBoundarySignal ? ["docs/engineering/workflow-v2/omo-base.md"] : []),
      ],
      recommended_validation: [
        "Run the authority-required, external-smoke, and bugfix pilot set before changing the canonical workflow entrypoint.",
        "Re-run pnpm harness:audit after promotion-readiness evidence is updated.",
      ],
      suggested_next_step:
        "Keep OMO v2 in promotion-candidate mode, collect slice06 and parallel pilot evidence, and only cut over after the promotion checklist passes.",
    }),
  ];
}

export function collectMetaHarnessFindings({ rootDir = process.cwd() } = {}) {
  const registry = loadFindingRegistry(rootDir);

  return [
    ...detectPlaywrightWorkflowGap({ rootDir, registry }),
    ...detectBookkeepingOverlap({ rootDir, registry }),
    ...detectOmoPromotionRisk({ rootDir, registry }),
  ];
}

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

export function buildMetaHarnessPromotionReadiness({ findings, generatedAt }) {
  const blockers = findings
    .filter((finding) => finding.bucket === "promotion-blocker" || finding.id === "H-GOV-001")
    .map((finding) => finding.id);
  const verdict = blockers.length > 0 ? "not-ready" : "candidate";

  return {
    version: 1,
    generated_at: generatedAt,
    target: "OMO v2",
    verdict,
    summary:
      verdict === "not-ready"
        ? "OMO v2는 아직 기본 운영 경로 승격 전 단계이며, bookkeeping 경계와 promotion evidence를 더 잠가야 한다."
        : "OMO v2는 승격 후보 상태이며, 마지막 pilot evidence 정리만 남아 있다.",
    blockers,
    prerequisites: [
      "authority-required, external-smoke, bugfix pilot evidence refresh",
      "bookkeeping authoritative source matrix",
      "meta-harness-auditor recurring baseline audit",
    ],
    evidence_refs: findings.flatMap((finding) => finding.evidence_refs),
  };
}

export function renderMetaHarnessReport({
  sampledSlices,
  scorecard,
  findings,
  remediationPlan,
  promotionReadiness,
  auditContext,
}) {
  const lines = [];
  lines.push("# Meta Harness Audit Report");
  lines.push("");
  lines.push(`- Overall score: ${scorecard.overall_score}/5`);
  lines.push(`- Findings: ${findings.length}`);
  lines.push(`- Promotion readiness: ${promotionReadiness.verdict}`);
  lines.push(`- Sampled slices: ${sampledSlices.length > 0 ? sampledSlices.join(", ") : "none"}`);
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

  lines.push("");
  lines.push("## Promotion Readiness");
  lines.push("");
  lines.push(`- Verdict: ${promotionReadiness.verdict}`);
  lines.push(`- Summary: ${promotionReadiness.summary}`);

  if (promotionReadiness.blockers.length > 0) {
    lines.push(`- Blockers: ${promotionReadiness.blockers.join(", ")}`);
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
  const explicitSlices = inFlightSlice
    ? [...new Set([...sampleSlices, inFlightSlice])]
    : sampleSlices;
  const sampledSlices = resolveSampleSlices(rootDir, explicitSlices);
  const findings = collectMetaHarnessFindings({ rootDir });
  const scorecard = buildMetaHarnessScorecard({ findings, generatedAt });
  const remediationPlan = buildMetaHarnessRemediationPlan({ findings, generatedAt });
  const promotionReadiness = buildMetaHarnessPromotionReadiness({ findings, generatedAt });
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
  writeJsonFile(path.join(resolvedOutputDir, "remediation-plan.json"), remediationPlan);
  writeJsonFile(path.join(resolvedOutputDir, "promotion-readiness.json"), promotionReadiness);

  return {
    outputDir: resolvedOutputDir,
    sampledSlices,
    findings,
    scorecard,
    remediationPlan,
    promotionReadiness,
    auditContext,
  };
}
