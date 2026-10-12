import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createEvaluationDispatchController } from "./evaluation-dispatch-authorization.mjs";

export const SOURCE_BOUND_PIPELINE_IDENTITY =
  "f0d7a43869f533050c7357afaa0994b4e01e980adbc2d9ece290859bf33cb6d0";
export const SOURCE_BOUND_CLIENT_VERSION =
  "codex-vision-source-anchored-v64-source-bound-quantity-recovery";
export const SOURCE_BOUND_VERIFIER_VERSION =
  "source-anchor-fidelity-v38-source-bound-quantity-recovery";

/**
 * @typedef {object} SourceBoundEvaluationTarget
 * @property {string} videoId
 * @property {string} url
 * @property {"description" | "author_comment"} requiredSource
 * @property {"ready" | "diagnostic-only"} cacheStatus
 * @property {string | null} sourcePath
 * @property {string | null} sourceSha256
 * @property {string | null | undefined} [diagnosticPath]
 * @property {string | null | undefined} [diagnosticSha256]
 */

export const SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT = Object.freeze({
  model: "gpt-5.6-luna",
  effort: "low",
  stage: "final.json",
  maximumCallsTotal: 3,
  maximumCallsPerVideo: 1,
  retryCalls: 0,
  selectorCalls: 0,
  repairCalls: 0,
});

/** @type {readonly SourceBoundEvaluationTarget[]} */
export const SOURCE_BOUND_EVALUATION_TARGETS = Object.freeze([
  Object.freeze({
    videoId: "D9jzKcu9Snc",
    url: "https://www.youtube.com/shorts/D9jzKcu9Snc",
    requiredSource: "author_comment",
    cacheStatus: "diagnostic-only",
    sourcePath: null,
    sourceSha256: null,
    diagnosticPath: ".diagnostics/youtube-description-quantity-20261012/diagnosis.json",
    diagnosticSha256: "9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1",
  }),
  Object.freeze({
    videoId: "AtGAVBl1vrQ",
    url: "https://www.youtube.com/shorts/AtGAVBl1vrQ",
    requiredSource: "author_comment",
    cacheStatus: "diagnostic-only",
    sourcePath: null,
    sourceSha256: null,
    diagnosticPath: ".diagnostics/youtube-description-quantity-20261012/diagnosis.json",
    diagnosticSha256: "9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1",
  }),
  Object.freeze({
    videoId: "eJyoszbyNNQ",
    url: "https://www.youtube.com/watch?v=eJyoszbyNNQ",
    requiredSource: "description",
    cacheStatus: "ready",
    sourcePath: "notebooks/recipe_loop_data/train/eJyoszbyNNQ/source.json",
    sourceSha256: "46dce89f7a2ae3d5986d7cd8306259e1f350d61761b38bdc9b0962f8a502f345",
    diagnosticPath: null,
    diagnosticSha256: null,
  }),
]);

const SHA256_RE = /^[a-f0-9]{64}$/u;
const EXPECTED_VIDEO_IDS = SOURCE_BOUND_EVALUATION_TARGETS.map((target) => target.videoId);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function hashSourceBoundRuntimeBundle(bundleRoot) {
  const root = await realpath(bundleRoot);
  const files = [];
  async function visit(relative = "") {
    const entries = (await readdir(path.join(root, relative), { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) {
        fail("SOURCE_BOUND_EVALUATION_BUNDLE_INVALID", "runtime bundle must not contain symlinks");
      }
      if (entry.isDirectory()) await visit(name);
      else files.push({ path: name, sha256: sha256(await readFile(path.join(root, name))) });
    }
  }
  await visit();
  return Object.freeze({ sha256: sha256(JSON.stringify(files)), files: Object.freeze(files) });
}

export async function inspectLocalSourceBoundCandidate({
  projectRoot,
  label = "v64-source-bound",
}) {
  const [{ stdout }, bundle] = await Promise.all([
    promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd: projectRoot }),
    hashSourceBoundRuntimeBundle(path.join(projectRoot, "lib/server/youtube-i031-runtime/bundle")),
  ]);
  return Object.freeze({
    candidate: Object.freeze({ label, gitHead: stdout.trim(), bundleSha256: bundle.sha256 }),
    pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY,
  });
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCandidate(left, right) {
  return left?.label === right?.label
    && left?.gitHead === right?.gitHead
    && left?.bundleSha256 === right?.bundleSha256;
}

function validateTargetSet(targets) {
  if (!Array.isArray(targets) || targets.length !== EXPECTED_VIDEO_IDS.length
    || !sameArray(targets.map((target) => target?.videoId), EXPECTED_VIDEO_IDS)) {
    fail("SOURCE_BOUND_EVALUATION_TARGET_MISMATCH", "the exact ordered three-video allowlist is required");
  }
  for (const target of targets) {
    if (!target || typeof target !== "object"
      || typeof target.url !== "string"
      || !["description", "author_comment"].includes(target.requiredSource)) {
      fail("SOURCE_BOUND_EVALUATION_TARGET_INVALID", "evaluation target metadata is malformed");
    }
  }
}

function validateExecutionContract(value) {
  const expected = SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT;
  const keys = Object.keys(expected);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
    || keys.some((key) => value[key] !== expected[key])) {
    fail("SOURCE_BOUND_EVALUATION_CONTRACT_MISMATCH",
      "execution must be final-only with three total calls, one per video, and no retry, selector, or repair calls");
  }
  return expected;
}

async function containedSourceFile(projectRoot, sourcePath) {
  const root = await realpath(projectRoot);
  const requested = path.resolve(root, sourcePath);
  const relative = path.relative(root, requested);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_INVALID", "source path escapes the project root");
  }
  let file;
  try {
    file = await realpath(requested);
  } catch {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_MISSING", "source snapshot file is missing");
  }
  if (!file.startsWith(`${root}${path.sep}`)) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_INVALID", "source snapshot resolves outside the project root");
  }
  return file;
}

function assertRequiredSource(source, target) {
  if (source?.video?.videoId !== target.videoId || source?.video?.url !== target.url) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_MISMATCH", "source snapshot video identity does not match its target");
  }
  if (target.requiredSource === "description"
    && (typeof source.video.description !== "string" || source.video.description.trim().length === 0)) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_MISMATCH", "target requires a non-empty cached description");
  }
  if (target.requiredSource === "author_comment") {
    const comments = source?.authorComments?.comments;
    if (!Array.isArray(comments)
      || !comments.some((comment) => typeof comment?.text === "string" && comment.text.trim().length > 0)) {
      fail("SOURCE_BOUND_EVALUATION_SOURCE_MISMATCH", "target requires a non-empty cached author comment");
    }
  }
}

async function loadTargetSource({ projectRoot, target }) {
  if (target.cacheStatus !== "ready" || typeof target.sourcePath !== "string"
    || !SHA256_RE.test(target.sourceSha256 ?? "")) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_UNAVAILABLE", `${target.videoId} source snapshot is not cached`);
  }
  const file = await containedSourceFile(projectRoot, target.sourcePath);
  const bytes = await readFile(file);
  if (sha256(bytes) !== target.sourceSha256) {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_CHANGED", `${target.videoId} source snapshot hash changed`);
  }
  let source;
  try {
    source = JSON.parse(bytes);
  } catch {
    fail("SOURCE_BOUND_EVALUATION_SOURCE_INVALID", `${target.videoId} source snapshot is not valid JSON`);
  }
  assertRequiredSource(source, target);
  return Object.freeze({ target: Object.freeze({ ...target }), file, source, sourceSha256: target.sourceSha256 });
}

export async function inspectSourceBoundEvaluationReadiness({
  projectRoot,
  targets = SOURCE_BOUND_EVALUATION_TARGETS,
}) {
  validateTargetSet(targets);
  const rows = [];
  for (const target of targets) {
    if (target.cacheStatus !== "ready" || typeof target.sourcePath !== "string"
      || !SHA256_RE.test(target.sourceSha256 ?? "")) {
      rows.push({ ...target, ready: false, reason: "source-snapshot-not-cached" });
      continue;
    }
    try {
      await loadTargetSource({ projectRoot, target });
      rows.push({ ...target, ready: true, reason: null });
    } catch (error) {
      rows.push({ ...target, ready: false, reason: error.code ?? "source-snapshot-invalid" });
    }
  }
  return rows;
}

function validateProviderTelemetry(value) {
  const telemetry = value?.telemetry;
  const expected = { modelCalls: 1, selectorCalls: 0, repairCalls: 0, retryCalls: 0 };
  if (!telemetry || typeof telemetry !== "object" || Array.isArray(telemetry)
    || Object.entries(expected).some(([key, count]) => telemetry[key] !== count)) {
    fail("SOURCE_BOUND_EVALUATION_PROVIDER_CONTRACT_VIOLATION",
      "provider call telemetry does not match the one-final-call contract");
  }
}

export async function runSourceBoundThreeEvaluation({
  authorization,
  expectedRequest,
  targets = SOURCE_BOUND_EVALUATION_TARGETS,
  projectRoot,
  verifyRoleUserMessage,
  budgetStore,
  inspectCandidate,
  invokeProviderOnce,
  executionContract = SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT,
  now = () => new Date().toISOString(),
}) {
  validateTargetSet(targets);
  const contract = validateExecutionContract(executionContract);
  if (typeof inspectCandidate !== "function" || typeof invokeProviderOnce !== "function") {
    fail("SOURCE_BOUND_EVALUATION_HOST_ADAPTER_REQUIRED",
      "a trusted candidate inspector and primitive provider adapter are required");
  }

  // Load and hash every source before binding any model-call budget. The two
  // diagnostic-only Shorts therefore make the repository default fail closed.
  const prepared = [];
  for (const target of targets) prepared.push(await loadTargetSource({ projectRoot, target }));

  const controller = await createEvaluationDispatchController({
    authorization,
    expectedRequest,
    requiredVideoAllowlist: EXPECTED_VIDEO_IDS,
    verifyRoleUserMessage,
    budgetStore,
    now,
  });
  if (controller.decision.model !== contract.model
    || controller.decision.effort !== contract.effort
    || controller.decision.stage !== contract.stage
    || controller.decision.maxDispatches !== contract.maximumCallsTotal
    || controller.decision.maxDispatchesPerVideo !== contract.maximumCallsPerVideo) {
    fail("SOURCE_BOUND_EVALUATION_CONTRACT_MISMATCH", "verified authorization does not match the execution contract");
  }

  const results = [];
  for (const input of prepared) {
    const dispatch = {
      requestId: controller.decision.requestId,
      candidate: controller.decision.candidate,
      videoId: input.target.videoId,
      model: contract.model,
      effort: contract.effort,
      stage: contract.stage,
    };
    const result = await controller.dispatchOnce(dispatch, async () => {
      // This is deliberately the last awaited check before the one primitive
      // provider call. The durable video budget has already been consumed.
      const observed = await inspectCandidate();
      if (!observed || !sameCandidate(observed.candidate, controller.decision.candidate)
        || observed.pipelineIdentity !== SOURCE_BOUND_PIPELINE_IDENTITY) {
        fail("SOURCE_BOUND_EVALUATION_CANDIDATE_CHANGED", "candidate changed at the provider dispatch boundary");
      }
      const providerResult = await invokeProviderOnce(Object.freeze({
        videoId: input.target.videoId,
        url: input.target.url,
        requiredSource: input.target.requiredSource,
        source: input.source,
        sourceSha256: input.sourceSha256,
        candidate: controller.decision.candidate,
        pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY,
        executionContract: contract,
      }));
      validateProviderTelemetry(providerResult);
      return providerResult;
    });
    results.push(Object.freeze({ videoId: input.target.videoId, result }));
  }
  return Object.freeze(results);
}
