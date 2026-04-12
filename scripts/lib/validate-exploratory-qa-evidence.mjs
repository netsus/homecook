import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

import { readAutomationSpec } from "./omo-automation-spec.mjs";

const REQUIRED_UI_RISKS = new Set(["new-screen", "high-risk", "anchor-extension"]);
const OPTIONAL_UI_RISKS = new Set(["low-risk"]);
const REQUIRED_ARTIFACT_FILES = [
  "exploratory-checklist.json",
  "exploratory-report.json",
  "eval-result.json",
];
const SKIP_TOKENS = [
  "n/a",
  "해당 없음",
  "없음",
  "생략",
  "미실행",
  "skip",
  "skipped",
  "not run",
  "not-run",
];

function resolveBranchName(rootDir, env) {
  const branchName = env.BRANCH_NAME ?? env.GITHUB_HEAD_REF;
  if (typeof branchName === "string" && branchName.trim().length > 0) {
    return branchName.trim();
  }

  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function parseDraftState(value) {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return null;
}

function resolveBranchContext(branchName) {
  const frontendMatch = /^feature\/fe-(.+)$/.exec(branchName);
  if (frontendMatch) {
    return {
      kind: "feature-fe",
      slice: frontendMatch[1],
    };
  }

  const closeoutMatch = /^docs\/omo-closeout-(.+)$/.exec(branchName);
  if (closeoutMatch) {
    return {
      kind: "omo-closeout",
      slice: closeoutMatch[1],
    };
  }

  return {
    kind: null,
    slice: null,
  };
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function readPrBody(rootDir, env) {
  if (typeof env.PR_BODY === "string" && env.PR_BODY.trim().length > 0) {
    return env.PR_BODY;
  }

  const bodyFilePath = env.PR_BODY_FILE;
  if (typeof bodyFilePath === "string" && bodyFilePath.trim().length > 0 && existsSync(bodyFilePath)) {
    return readText(bodyFilePath.trim());
  }

  const eventPath = env.GITHUB_EVENT_PATH;
  if (typeof eventPath === "string" && eventPath.trim().length > 0 && existsSync(eventPath)) {
    try {
      const event = JSON.parse(readText(resolve(rootDir, eventPath.trim())));
      const body = event?.pull_request?.body;
      if (typeof body === "string" && body.trim().length > 0) {
        return body;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(text, heading) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return "";
  }

  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n");
}

function readLabelValue(sectionText, label) {
  if (typeof sectionText !== "string" || sectionText.trim().length === 0) {
    return "";
  }

  const pattern = new RegExp(`^-\\s+${escapeRegExp(label)}:\\s*(.*)$`, "im");
  const match = sectionText.match(pattern);
  return (match?.[1] ?? "").trim();
}

function normalizeInlineCode(value) {
  return value.replace(/`/g, "").trim();
}

function analyzeEvidenceValue(value) {
  const trimmed = normalizeInlineCode(value ?? "");
  if (trimmed.length === 0) {
    return {
      kind: "missing",
      hasReason: false,
      value: "",
    };
  }

  const lowered = trimmed.toLowerCase();
  for (const token of SKIP_TOKENS) {
    if (lowered === token) {
      return {
        kind: "skipped",
        hasReason: false,
        value: trimmed,
      };
    }

    if (lowered.startsWith(`${token} `) || lowered.startsWith(`${token} (`) || lowered.startsWith(`${token}:`)) {
      return {
        kind: "skipped",
        hasReason: true,
        value: trimmed,
      };
    }
  }

  return {
    kind: "present",
    hasReason: true,
    value: trimmed,
  };
}

function findLocalArtifactBundle({ rootDir, slice }) {
  const artifactsDir = resolve(rootDir, ".artifacts", "qa", slice);
  if (!existsSync(artifactsDir)) {
    return null;
  }

  const candidates = readdirSync(artifactsDir)
    .map((entry) => join(artifactsDir, entry))
    .filter((entryPath) => existsSync(entryPath) && statSync(entryPath).isDirectory())
    .sort((a, b) => b.localeCompare(a));

  for (const candidate of candidates) {
    const missingFiles = REQUIRED_ARTIFACT_FILES.filter(
      (fileName) => !existsSync(join(candidate, fileName)),
    );

    if (missingFiles.length === 0) {
      return {
        path: candidate,
        missingFiles: [],
      };
    }
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return null;
  }

  return {
    path: firstCandidate,
    missingFiles: REQUIRED_ARTIFACT_FILES.filter(
      (fileName) => !existsSync(join(firstCandidate, fileName)),
    ),
  };
}

function resolveRequirement(uiRisk) {
  if (REQUIRED_UI_RISKS.has(uiRisk)) {
    return "required";
  }

  if (OPTIONAL_UI_RISKS.has(uiRisk)) {
    return "optional";
  }

  return "not-required";
}

function buildBodyPath(label) {
  return `PR_BODY:## QA Evidence:${label}`;
}

function validateRequiredBodyEvidence(sectionText) {
  const errors = [];
  const exploratory = analyzeEvidenceValue(readLabelValue(sectionText, "exploratory QA"));
  const qaEval = analyzeEvidenceValue(readLabelValue(sectionText, "qa eval"));
  const artifactPaths = analyzeEvidenceValue(readLabelValue(sectionText, "아티팩트 / 보고서 경로"));

  if (exploratory.kind !== "present") {
    errors.push({
      path: buildBodyPath("exploratory QA"),
      message: "Exploratory QA is required for this slice and cannot be omitted.",
    });
  }

  if (qaEval.kind !== "present") {
    errors.push({
      path: buildBodyPath("qa eval"),
      message: "qa eval evidence is required when exploratory QA is required.",
    });
  }

  if (artifactPaths.kind !== "present") {
    errors.push({
      path: buildBodyPath("아티팩트 / 보고서 경로"),
      message: "Artifact/report paths are required for exploratory QA evidence.",
    });
  } else {
    const missingRefs = ["exploratory-report.json", "eval-result.json"].filter(
      (fragment) => !artifactPaths.value.includes(fragment),
    );
    if (missingRefs.length > 0) {
      errors.push({
        path: buildBodyPath("아티팩트 / 보고서 경로"),
        message: `Artifact/report paths must reference ${missingRefs.join(", ")}.`,
      });
    }
  }

  return errors;
}

function validateOptionalBodyEvidence(sectionText) {
  const errors = [];
  const exploratory = analyzeEvidenceValue(readLabelValue(sectionText, "exploratory QA"));
  const qaEval = analyzeEvidenceValue(readLabelValue(sectionText, "qa eval"));
  const artifactPaths = analyzeEvidenceValue(readLabelValue(sectionText, "아티팩트 / 보고서 경로"));

  if (exploratory.kind === "missing") {
    errors.push({
      path: buildBodyPath("exploratory QA"),
      message: "Low-risk UI changes must still record exploratory QA execution or a skip rationale.",
    });
    return errors;
  }

  if (exploratory.kind === "skipped") {
    if (!exploratory.hasReason) {
      errors.push({
        path: buildBodyPath("exploratory QA"),
        message: "Skipped exploratory QA requires a rationale for low-risk UI changes.",
      });
    }

    if (qaEval.kind === "missing" || (qaEval.kind === "skipped" && !qaEval.hasReason)) {
      errors.push({
        path: buildBodyPath("qa eval"),
        message: "qa eval must record an executed result or an explicit N/A rationale.",
      });
    }

    if (artifactPaths.kind === "missing" || (artifactPaths.kind === "skipped" && !artifactPaths.hasReason)) {
      errors.push({
        path: buildBodyPath("아티팩트 / 보고서 경로"),
        message: "Artifact/report paths must record a real path or an explicit skip rationale.",
      });
    }

    return errors;
  }

  if (qaEval.kind !== "present") {
    errors.push({
      path: buildBodyPath("qa eval"),
      message: "Executed exploratory QA must include qa eval evidence.",
    });
  }

  if (artifactPaths.kind !== "present") {
    errors.push({
      path: buildBodyPath("아티팩트 / 보고서 경로"),
      message: "Executed exploratory QA must include artifact/report paths.",
    });
  } else {
    const missingRefs = ["exploratory-report.json", "eval-result.json"].filter(
      (fragment) => !artifactPaths.value.includes(fragment),
    );
    if (missingRefs.length > 0) {
      errors.push({
        path: buildBodyPath("아티팩트 / 보고서 경로"),
        message: `Artifact/report paths must reference ${missingRefs.join(", ")} when exploratory QA ran.`,
      });
    }
  }

  return errors;
}

function validateArtifactFallback({ slice, artifactBundle, requirement }) {
  if (requirement === "not-required") {
    return [];
  }

  if (!artifactBundle) {
    return [
      {
        path: `.artifacts/qa/${slice}`,
        message:
          "Exploratory QA evidence could not be validated from PR body. Provide PR_BODY/PR_BODY_FILE or keep a local .artifacts/qa bundle before ready-for-review.",
      },
    ];
  }

  if (artifactBundle.missingFiles.length > 0) {
    return [
      {
        path: artifactBundle.path,
        message: `Exploratory QA bundle is missing required files: ${artifactBundle.missingFiles.join(", ")}.`,
      },
    ];
  }

  return [];
}

export function validateExploratoryQaEvidence({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const branchName = resolveBranchName(rootDir, env);
  const branchContext = resolveBranchContext(branchName);
  const prIsDraft = parseDraftState(env.PR_IS_DRAFT);
  const strictMode =
    branchContext.kind === "feature-fe" && prIsDraft === false
      ? "ready-for-review"
      : branchContext.kind === "omo-closeout"
        ? "closeout"
        : null;

  if (!strictMode || !branchContext.slice) {
    return [];
  }

  const slice = branchContext.slice;
  const { automationSpec, automationSpecPath } = readAutomationSpec({
    rootDir,
    slice,
    required: false,
  });

  if (!automationSpec) {
    return [];
  }

  const uiRisk = automationSpec.frontend?.design_authority?.ui_risk ?? "not-required";
  const requirement = resolveRequirement(uiRisk);
  if (requirement === "not-required") {
    return [];
  }

  const prBody = readPrBody(rootDir, env);
  const qaEvidenceSection = extractMarkdownSection(prBody ?? "", "## QA Evidence");
  const artifactBundle = findLocalArtifactBundle({ rootDir, slice });
  const errors = [];

  if (qaEvidenceSection.trim().length > 0) {
    errors.push(
      ...(requirement === "required"
        ? validateRequiredBodyEvidence(qaEvidenceSection)
        : validateOptionalBodyEvidence(qaEvidenceSection)),
    );
  } else {
    errors.push(
      ...validateArtifactFallback({
        slice,
        artifactBundle,
        requirement,
      }),
    );
  }

  if (errors.length === 0) {
    return [];
  }

  return [
    {
      name: `exploratory-qa-evidence:${slice}`,
      errors: [
        {
          path: automationSpecPath,
          message: `Slice '${slice}' has ui_risk '${uiRisk}', so exploratory QA evidence must satisfy the ${strictMode} gate.`,
        },
        ...errors,
      ],
    },
  ];
}
