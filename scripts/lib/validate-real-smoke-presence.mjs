import { readAutomationSpec } from "./omo-automation-spec.mjs";
import {
  extractMarkdownSection,
  normalizeInlineCode,
  parseDraftState,
  readMarkdownLabelValue,
  readPullRequestBody,
  resolveBranchName,
  resolveSliceBranchContext,
} from "./validator-shared.mjs";

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
  const environment = analyzeEvidenceValue(readMarkdownLabelValue(sectionText, "environment"));
  const scope = analyzeEvidenceValue(readMarkdownLabelValue(sectionText, "scope"));
  const result = analyzeEvidenceValue(readMarkdownLabelValue(sectionText, "result"));

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
  const branchName = resolveBranchName({ rootDir, env });
  const branchContext = resolveSliceBranchContext(branchName, {
    includeBackend: true,
  });
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
  const prBody = readPullRequestBody({
    rootDir,
    env,
    preferredBody,
  });
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
