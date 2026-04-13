import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { readAutomationSpec } from "./omo-automation-spec.mjs";

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

const SMOKE_TOKENS = [
  "real db",
  "real-db",
  "schema",
  "bootstrap",
  "seed",
  "local supabase",
  "local demo",
  "smoke",
  "live",
  "dev:local-supabase",
  "dev:demo",
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
  const backendMatch = /^feature\/be-(.+)$/.exec(branchName);
  if (backendMatch) {
    return {
      kind: "feature-be",
      slice: backendMatch[1],
    };
  }

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

function readPrBody(rootDir, env, preferredBody = null) {
  if (typeof preferredBody === "string" && preferredBody.trim().length > 0) {
    return preferredBody;
  }

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
      value: "",
    };
  }

  const lowered = trimmed.toLowerCase();
  for (const token of SKIP_TOKENS) {
    if (lowered === token) {
      return {
        kind: "skipped",
        value: trimmed,
      };
    }

    if (lowered.startsWith(`${token} `) || lowered.startsWith(`${token} (`) || lowered.startsWith(`${token}:`)) {
      return {
        kind: "skipped",
        value: trimmed,
      };
    }
  }

  return {
    kind: "present",
    value: trimmed,
  };
}

function buildBodyPath(label) {
  return `PR_BODY:## Actual Verification:${label}`;
}

function hasSmokeSignal({
  environment,
  scope,
  result,
  externalSmokes,
}) {
  const normalized = [environment, scope, result]
    .map((value) => value.toLowerCase())
    .join(" ");

  if (SMOKE_TOKENS.some((token) => normalized.includes(token))) {
    return true;
  }

  return (Array.isArray(externalSmokes) ? externalSmokes : []).some((command) => {
    if (typeof command !== "string" || command.trim().length === 0) {
      return false;
    }

    return normalized.includes(command.trim().toLowerCase());
  });
}

function validateActualVerificationSection({
  sectionText,
  externalSmokes,
}) {
  const errors = [];
  const environment = analyzeEvidenceValue(readLabelValue(sectionText, "environment"));
  const scope = analyzeEvidenceValue(readLabelValue(sectionText, "scope"));
  const result = analyzeEvidenceValue(readLabelValue(sectionText, "result"));

  if (environment.kind !== "present") {
    errors.push({
      path: buildBodyPath("environment"),
      message: "Real smoke evidence is required for slices with external_smokes and cannot be omitted.",
    });
  }

  if (scope.kind !== "present") {
    errors.push({
      path: buildBodyPath("scope"),
      message: "Real smoke evidence is required for slices with external_smokes and cannot be omitted.",
    });
  }

  if (result.kind !== "present") {
    errors.push({
      path: buildBodyPath("result"),
      message: "Real smoke evidence is required for slices with external_smokes and cannot be omitted.",
    });
  }

  if (errors.length > 0) {
    return errors;
  }

  if (!hasSmokeSignal({
    environment: environment.value,
    scope: scope.value,
    result: result.value,
    externalSmokes,
  })) {
    errors.push({
      path: "PR_BODY:## Actual Verification",
      message:
        "Actual Verification must describe real smoke evidence (for example real DB, local Supabase, bootstrap, seed, or live smoke).",
    });
  }

  return errors;
}

/**
 * @param {{
 *   rootDir?: string;
 *   env?: NodeJS.ProcessEnv & { PR_IS_DRAFT?: string | boolean; SOURCE_PR_BODY?: string };
 * }} [options]
 */
export function validateRealSmokePresence({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const branchName = resolveBranchName(rootDir, env);
  const branchContext = resolveBranchContext(branchName);
  const prIsDraft = parseDraftState(env.PR_IS_DRAFT);

  if (
    !branchContext.slice ||
    (branchContext.kind !== "omo-closeout" && prIsDraft !== false)
  ) {
    return [];
  }

  const { automationSpec } = readAutomationSpec({
    rootDir,
    slice: branchContext.slice,
    required: false,
  });
  const externalSmokes = Array.isArray(automationSpec?.external_smokes)
    ? automationSpec.external_smokes
    : [];

  if (externalSmokes.length === 0) {
    return [];
  }

  const preferredBody =
    branchContext.kind === "omo-closeout" &&
    typeof env.SOURCE_PR_BODY === "string" &&
    env.SOURCE_PR_BODY.trim().length > 0
      ? env.SOURCE_PR_BODY
      : null;
  const prBody = readPrBody(rootDir, env, preferredBody);
  if (typeof prBody !== "string" || prBody.trim().length === 0) {
    return [
      {
        name: `real-smoke-presence:${branchContext.slice}`,
        errors: [
          {
            path: "PR_BODY:## Actual Verification",
            message:
              "Real smoke evidence is required for slices with external_smokes. Provide PR_BODY/PR_BODY_FILE or SOURCE_PR_BODY.",
          },
        ],
      },
    ];
  }

  const actualVerificationSection = extractMarkdownSection(prBody, "## Actual Verification");
  const errors = validateActualVerificationSection({
    sectionText: actualVerificationSection,
    externalSmokes,
  });

  if (errors.length === 0) {
    return [];
  }

  return [
    {
      name: `real-smoke-presence:${branchContext.slice}`,
      errors,
    },
  ];
}
