#!/usr/bin/env node

import {
  SOURCE_BOUND_CLIENT_VERSION,
  SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT,
  SOURCE_BOUND_EVALUATION_TARGETS,
  SOURCE_BOUND_PIPELINE_IDENTITY,
  SOURCE_BOUND_VERIFIER_VERSION,
  inspectLocalSourceBoundCandidate,
  inspectSourceBoundEvaluationReadiness,
} from "./lib/source-bound-evaluation-runner.mjs";

const projectRoot = process.cwd();
const mode = process.argv[2] ?? "--preflight-only";
if (mode !== "--preflight-only") {
  throw new Error(
    "SOURCE_BOUND_EVALUATION_HOST_ADAPTER_REQUIRED: this CLI cannot execute provider calls; use a trusted support-tool adapter after a separate user approval",
  );
}

const [observedCandidate, readiness] = await Promise.all([
  inspectLocalSourceBoundCandidate({ projectRoot }),
  inspectSourceBoundEvaluationReadiness({ projectRoot, targets: SOURCE_BOUND_EVALUATION_TARGETS }),
]);

const readyCount = readiness.filter((target) => target.ready).length;
process.stdout.write(`${JSON.stringify({
  status: readyCount === readiness.length ? "ready-for-trusted-host-authorization" : "source-cache-incomplete",
  liveExecutionAvailableFromCli: false,
  candidate: {
    label: "v64-source-bound",
    gitHead: observedCandidate.candidate.gitHead,
    bundleSha256: observedCandidate.candidate.bundleSha256,
    pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY,
    clientVersion: SOURCE_BOUND_CLIENT_VERSION,
    verifierVersion: SOURCE_BOUND_VERIFIER_VERSION,
  },
  executionContract: SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT,
  targets: readiness,
  blockers: [
    ...(readyCount === readiness.length ? [] : ["all three immutable source snapshots are required"]),
    "a trusted support-tool adapter must verify a fresh role:user grant and provide the primitive provider call",
    "a host-owned budget directory outside the model-readable/writable sandbox is required",
  ],
}, null, 2)}\n`);
