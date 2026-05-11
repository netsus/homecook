import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const WAVE1_PROTOTYPE_LOCK = {
  manifestPath: "ui/designs/reference/wave1-fixed-prototype/manifest.json",
  fixedPrototypePath: "ui/designs/prototypes/claude-design-260505-wave1",
  fixedPrototypeImplementationSha: "9bf7a34c6b422d0c9981d4c2968e3350d5a28892",
  parityMode: "exact-mobile",
  requiredUnclassifiedVisualDifferences: 0,
  requiredVisualBlockers: 0,
  requiredEvidence: [
    "fixed_prototype_sha",
    "reference_screenshot",
    "service_screenshot",
    "screenshot_diff",
    "computed_style_audit",
    "dom_geometry_audit",
    "remaining_difference_ledger",
  ],
};

const WAVE1_SERVICE_PORTING_SLICE_PATTERN = /^wave1-port-/;
const REFERENCE_SCREENSHOT_PATTERN =
  /ui\/designs\/reference\/wave1-fixed-prototype\/[A-Za-z0-9._/-]+\.png\b/;
const SERVICE_SCREENSHOT_PATTERN =
  /(?:ui\/designs\/evidence|qa\/visual\/parity|\.omx\/artifacts)\/[A-Za-z0-9._/-]+\.png\b/;
const VISUAL_VERDICT_LABEL_PATTERN =
  /(visual[\s-]*(?:verdict|parity)|시각\s*비교|비주얼\s*(?:비교|판정|점수)|디자인\s*비교)/i;
const BLOCKER_ZERO_PATTERN =
  /(?:blocker|블로커)[^\n]*(?:0\s*(?:개|건)?|none|없음)/i;
const SCREENSHOT_DIFF_PATTERN =
  /(?:screenshot\s*(?:diff|comparison)|스크린샷\s*(?:diff|비교)|이미지\s*비교)/i;
const COMPUTED_STYLE_AUDIT_PATTERN =
  /(?:computed[-\s]*style\s*audit|computed\s*style|스타일\s*(?:audit|감사|검증)|계산된\s*스타일)/i;
const DOM_GEOMETRY_AUDIT_PATTERN =
  /(?:(?:dom\s*)?geometry\s*audit|dom\s*geometry|geometry\s*audit|기하\s*(?:audit|감사|검증)|좌표\s*(?:audit|감사|검증)|요소\s*좌표)/i;
const UNCLASSIFIED_VISUAL_DIFFERENCE_ZERO_PATTERN =
  /(?:unclassified\s*visual\s*differences?|미분류\s*(?:visual|시각|디자인)?\s*차이|분류되지\s*않은\s*(?:시각|디자인)?\s*차이)[^\n]*(?:0\s*(?:개|건)?|none|없음|zero)/i;

function buildResult(errors) {
  return errors.length > 0 ? [{ name: "wave1-prototype-lock", errors }] : [];
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeSlice(slice) {
  return typeof slice === "string" ? slice.trim() : "";
}

function resolveSlice({ slice, env }) {
  const explicitSlice = normalizeSlice(slice ?? env?.SLICE);
  if (explicitSlice.length > 0) {
    return explicitSlice;
  }

  const branchName = normalizeSlice(env?.BRANCH_NAME ?? env?.GITHUB_HEAD_REF);
  const branchMatch = /^(?:feature\/(?:fe|be)-|docs\/omo-closeout-)(.+)$/.exec(branchName);
  return branchMatch?.[1] ?? "";
}

export function isWave1ServicePortingSlice(slice) {
  return WAVE1_SERVICE_PORTING_SLICE_PATTERN.test(normalizeSlice(slice));
}

function readPrBody({ rootDir, prBody, prBodyPath, env }) {
  if (typeof prBody === "string" && prBody.trim().length > 0) {
    return prBody;
  }

  const explicitPath =
    typeof prBodyPath === "string" && prBodyPath.trim().length > 0
      ? prBodyPath.trim()
      : env?.PR_BODY_FILE;
  if (typeof explicitPath === "string" && explicitPath.trim().length > 0) {
    const resolvedPath = resolve(rootDir, explicitPath.trim());
    if (existsSync(resolvedPath)) {
      return readFileSync(resolvedPath, "utf8");
    }
  }

  if (typeof env?.PR_BODY === "string" && env.PR_BODY.trim().length > 0) {
    return env.PR_BODY;
  }

  return null;
}

function collectScreenshotPaths(manifest) {
  if (!Array.isArray(manifest?.screenshots)) {
    return [];
  }

  return manifest.screenshots
    .map((entry) => entry?.path)
    .filter((entryPath) => typeof entryPath === "string" && entryPath.trim().length > 0)
    .map((entryPath) => entryPath.trim());
}

function validateManifest({ rootDir, manifestPath }) {
  const errors = [];
  const resolvedManifestPath = resolve(rootDir, manifestPath);

  if (!existsSync(resolvedManifestPath)) {
    return {
      manifest: null,
      errors: [
        {
          path: manifestPath,
          message: "Wave1 fixed prototype lock manifest is missing.",
        },
      ],
    };
  }

  let manifest;
  try {
    manifest = readJson(resolvedManifestPath);
  } catch (error) {
    return {
      manifest: null,
      errors: [
        {
          path: manifestPath,
          message: `Wave1 fixed prototype lock manifest is not valid JSON: ${error.message}`,
        },
      ],
    };
  }

  if (
    manifest.fixed_prototype_path !== WAVE1_PROTOTYPE_LOCK.fixedPrototypePath
  ) {
    errors.push({
      path: `${manifestPath}:fixed_prototype_path`,
      message:
        `Expected fixed prototype path ${WAVE1_PROTOTYPE_LOCK.fixedPrototypePath}.`,
    });
  }

  if (
    manifest.fixed_prototype_implementation_sha !==
    WAVE1_PROTOTYPE_LOCK.fixedPrototypeImplementationSha
  ) {
    errors.push({
      path: `${manifestPath}:fixed_prototype_implementation_sha`,
      message:
        `Expected fixed prototype SHA ${WAVE1_PROTOTYPE_LOCK.fixedPrototypeImplementationSha}.`,
    });
  }

  if (manifest.visual_layout_source_of_truth !== "fixed prototype") {
    errors.push({
      path: `${manifestPath}:visual_layout_source_of_truth`,
      message: "Wave1 visual/layout source of truth must remain `fixed prototype`.",
    });
  }

  if (Object.hasOwn(manifest, "required_visual_verdict_score")) {
    errors.push({
      path: `${manifestPath}:required_visual_verdict_score`,
      message: "Legacy visual verdict score thresholds are not allowed for Wave1 exact mobile parity.",
    });
  }

  if (manifest.parity_mode !== WAVE1_PROTOTYPE_LOCK.parityMode) {
    errors.push({
      path: `${manifestPath}:parity_mode`,
      message: `Expected parity mode ${WAVE1_PROTOTYPE_LOCK.parityMode}.`,
    });
  }

  if (
    Number(manifest.required_unclassified_visual_differences) !==
    WAVE1_PROTOTYPE_LOCK.requiredUnclassifiedVisualDifferences
  ) {
    errors.push({
      path: `${manifestPath}:required_unclassified_visual_differences`,
      message: "Wave1 exact mobile parity requires unclassified visual differences to be 0.",
    });
  }

  if (Number(manifest.required_visual_blockers) !== WAVE1_PROTOTYPE_LOCK.requiredVisualBlockers) {
    errors.push({
      path: `${manifestPath}:required_visual_blockers`,
      message: "Wave1 exact mobile parity requires visual blockers to be 0.",
    });
  }

  const requiredEvidence = Array.isArray(manifest.required_evidence)
    ? manifest.required_evidence
    : [];
  for (const evidence of WAVE1_PROTOTYPE_LOCK.requiredEvidence) {
    if (!requiredEvidence.includes(evidence)) {
      errors.push({
        path: `${manifestPath}:required_evidence`,
        message: `Missing required exact parity evidence key: ${evidence}`,
      });
    }
  }

  const screenshotPaths = collectScreenshotPaths(manifest);
  if (screenshotPaths.length === 0) {
    errors.push({
      path: `${manifestPath}:screenshots`,
      message: "Wave1 fixed prototype manifest must list committed reference screenshots.",
    });
  }

  const duplicatePaths = screenshotPaths.filter((entryPath, index) => screenshotPaths.indexOf(entryPath) !== index);
  for (const duplicatePath of [...new Set(duplicatePaths)]) {
    errors.push({
      path: `${manifestPath}:screenshots`,
      message: `Duplicate reference screenshot path: ${duplicatePath}`,
    });
  }

  for (const screenshotPath of screenshotPaths) {
    if (!screenshotPath.startsWith("ui/designs/reference/wave1-fixed-prototype/")) {
      errors.push({
        path: `${manifestPath}:screenshots`,
        message: `Reference screenshot must stay inside the fixed prototype reference directory: ${screenshotPath}`,
      });
      continue;
    }

    if (!existsSync(resolve(rootDir, screenshotPath))) {
      errors.push({
        path: screenshotPath,
        message: "Committed Wave1 fixed prototype reference screenshot is missing.",
      });
    }
  }

  return { manifest, errors };
}

function validatePortingPrBody({ body, slice }) {
  const errors = [];

  if (body === null) {
    return [
      {
        path: "PR_BODY_FILE",
        message:
          `Wave1 service porting slice ${slice} requires a PR body with prototype lock evidence.`,
      },
    ];
  }

  if (!body.includes(WAVE1_PROTOTYPE_LOCK.fixedPrototypeImplementationSha)) {
    errors.push({
      path: "PR_BODY",
      message:
        `Wave1 service porting PR must mention fixed prototype SHA ${WAVE1_PROTOTYPE_LOCK.fixedPrototypeImplementationSha}.`,
    });
  }

  if (!REFERENCE_SCREENSHOT_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must include at least one committed fixed prototype reference screenshot path.",
    });
  }

  if (!SERVICE_SCREENSHOT_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must include at least one generated service screenshot path.",
    });
  }

  if (!VISUAL_VERDICT_LABEL_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must record a visual parity comparison against the fixed prototype.",
    });
  }

  if (!SCREENSHOT_DIFF_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message: "Wave1 service porting PR must include screenshot diff evidence.",
    });
  }

  if (!COMPUTED_STYLE_AUDIT_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must include computed-style audit evidence for color, type, spacing, radius, border, shadow, and opacity.",
    });
  }

  if (!DOM_GEOMETRY_AUDIT_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message: "Wave1 service porting PR must include DOM geometry audit evidence.",
    });
  }

  if (!UNCLASSIFIED_VISUAL_DIFFERENCE_ZERO_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must record unclassified visual differences as 0.",
    });
  }

  if (!BLOCKER_ZERO_PATTERN.test(body)) {
    errors.push({
      path: "PR_BODY",
      message:
        "Wave1 service porting PR must record visual verdict blocker count as 0.",
    });
  }

  return errors;
}

export function validateWave1PrototypeLock({
  rootDir = process.cwd(),
  manifestPath = WAVE1_PROTOTYPE_LOCK.manifestPath,
  slice = null,
  prBody = null,
  prBodyPath = null,
  env = process.env,
} = {}) {
  const normalizedSlice = resolveSlice({ slice, env });
  const shouldEnforceWave1PortingGate = isWave1ServicePortingSlice(normalizedSlice);
  const shouldValidateManifest = normalizedSlice.length === 0 || shouldEnforceWave1PortingGate;
  const errors = shouldValidateManifest
    ? [...validateManifest({ rootDir, manifestPath }).errors]
    : [];

  if (shouldEnforceWave1PortingGate) {
    errors.push(
      ...validatePortingPrBody({
        body: readPrBody({ rootDir, prBody, prBodyPath, env }),
        slice: normalizedSlice,
      }),
    );
  }

  return buildResult(errors);
}
