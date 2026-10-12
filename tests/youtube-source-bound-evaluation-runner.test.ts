import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT,
  SOURCE_BOUND_EVALUATION_TARGETS,
  SOURCE_BOUND_PIPELINE_IDENTITY,
  hashSourceBoundRuntimeBundle,
  inspectSourceBoundEvaluationReadiness,
  runSourceBoundThreeEvaluation,
} from "../scripts/recipe-loop/lib/source-bound-evaluation-runner.mjs";
import {
  createFileDispatchBudgetStore,
  EVALUATION_AUTHORIZATION_SCHEMA,
  HOST_MESSAGE_ATTESTATION_KIND,
} from "../scripts/recipe-loop/lib/evaluation-dispatch-authorization.mjs";

const roots: string[] = [];
const VIDEO_IDS = ["D9jzKcu9Snc", "AtGAVBl1vrQ", "eJyoszbyNNQ"];
const CANDIDATE = Object.freeze({
  label: "v64-source-bound",
  gitHead: "a".repeat(40),
  bundleSha256: "4b67adadf5490261b91736399050dc71ed70f7f870fb369ebca070b766092b6e",
});
type EvaluationTarget = {
  videoId: string;
  url: string;
  requiredSource: "description" | "author_comment";
  cacheStatus: "ready" | "diagnostic-only";
  sourcePath: string | null;
  sourceSha256: string | null;
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function authorization() {
  return {
    schema: EVALUATION_AUTHORIZATION_SCHEMA,
    requestId: "source-bound-three-request",
    evidence: {
      kind: HOST_MESSAGE_ATTESTATION_KIND,
      role: "user",
      messageId: "trusted-user-message",
      serverReceivedAt: "2026-10-12T12:00:00Z",
    },
    candidate: CANDIDATE,
    videoAllowlist: VIDEO_IDS,
    maxDispatches: 3,
    maxDispatchesPerVideo: 1,
    model: "gpt-5.6-luna",
    effort: "low",
    stage: "final.json",
  };
}

function expectedRequest() {
  return {
    requestId: "source-bound-three-request",
    candidate: CANDIDATE,
    videoIds: VIDEO_IDS,
    model: "gpt-5.6-luna",
    effort: "low",
    stage: "final.json",
  };
}

function verifyUserMessage() {
  return vi.fn(async ({ messageId, serverReceivedAt, grantSha256 }) => ({
    verified: true,
    role: "user",
    messageId,
    serverReceivedAt,
    grantSha256,
  }));
}

async function readyFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "homecook-source-bound-runner-"));
  roots.push(root);
  const targets: EvaluationTarget[] = [];
  for (const [index, videoId] of VIDEO_IDS.entries()) {
    const sourcePath = path.join("sources", videoId, "source.json");
    const absolute = path.join(root, sourcePath);
    const bytes = `${JSON.stringify({
      schemaVersion: 1,
      video: {
        videoId,
        url: index < 2
          ? `https://www.youtube.com/shorts/${videoId}`
          : `https://www.youtube.com/watch?v=${videoId}`,
        title: `fixture-${videoId}`,
        description: index === 2 ? "RECIPE\n250g Spaghetti" : "",
      },
      authorComments: {
        comments: index < 2 ? [{ text: `${index === 0 ? "통삼겹살 500g" : "돼지고기 앞다리살 400g"}` }] : [],
      },
    })}\n`;
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes, "utf8");
    targets.push({
      videoId,
      url: index < 2
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      requiredSource: index < 2 ? "author_comment" : "description",
      cacheStatus: "ready",
      sourcePath,
      sourceSha256: sha256(bytes),
    });
  }
  const budgetDirectory = path.join(root, "trusted-budget");
  return {
    root,
    targets,
    budgetStore: createFileDispatchBudgetStore({ directory: budgetDirectory }),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("source-bound three-video evaluation runner", () => {
  it("documents that only the description case is currently runnable from the repository cache", async () => {
    const [readiness, bundle] = await Promise.all([
      inspectSourceBoundEvaluationReadiness({
        projectRoot: process.cwd(),
        targets: SOURCE_BOUND_EVALUATION_TARGETS,
      }),
      hashSourceBoundRuntimeBundle(path.join(process.cwd(), "lib/server/youtube-i031-runtime/bundle")),
    ]);

    expect(readiness.map(({ videoId, ready, reason }) => ({ videoId, ready, reason }))).toEqual([
      { videoId: "D9jzKcu9Snc", ready: false, reason: "source-snapshot-not-cached" },
      { videoId: "AtGAVBl1vrQ", ready: false, reason: "source-snapshot-not-cached" },
      { videoId: "eJyoszbyNNQ", ready: true, reason: null },
    ]);
    expect(readiness[2]).toMatchObject({
      sourceSha256: "46dce89f7a2ae3d5986d7cd8306259e1f350d61761b38bdc9b0962f8a502f345",
    });
    expect(bundle.sha256).toBe(CANDIDATE.bundleSha256);
  });

  it("checks the exact contract and candidate immediately before each primitive provider call", async () => {
    const fixture = await readyFixture();
    const events: string[] = [];
    const inspectCandidate = vi.fn(async () => {
      events.push("candidate");
      return { candidate: CANDIDATE, pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY };
    });
    const invokeProviderOnce = vi.fn(async ({ videoId, executionContract }) => {
      events.push(`provider:${videoId}`);
      expect(executionContract).toEqual(SOURCE_BOUND_EVALUATION_EXECUTION_CONTRACT);
      return {
        output: { recipes: [] },
        telemetry: { modelCalls: 1, selectorCalls: 0, repairCalls: 0, retryCalls: 0 },
      };
    });

    const result = await runSourceBoundThreeEvaluation({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      targets: fixture.targets,
      projectRoot: fixture.root,
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: fixture.budgetStore,
      inspectCandidate,
      invokeProviderOnce,
      now: () => "2026-10-12T12:01:00Z",
    });

    expect(result.map((entry) => entry.videoId)).toEqual(VIDEO_IDS);
    expect(invokeProviderOnce).toHaveBeenCalledTimes(3);
    expect(events).toEqual(VIDEO_IDS.flatMap((videoId) => ["candidate", `provider:${videoId}`]));
  });

  it("fails before provider dispatch when any source snapshot is unavailable", async () => {
    const fixture = await readyFixture();
    const invokeProviderOnce = vi.fn();
    const unavailable = fixture.targets.map((target, index) => index === 0
      ? { ...target, cacheStatus: "diagnostic-only" as const, sourcePath: null, sourceSha256: null }
      : target);

    await expect(runSourceBoundThreeEvaluation({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      targets: unavailable,
      projectRoot: fixture.root,
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: fixture.budgetStore,
      inspectCandidate: async () => ({ candidate: CANDIDATE, pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY }),
      invokeProviderOnce,
    })).rejects.toThrow(/source snapshot.*not cached/iu);
    expect(invokeProviderOnce).not.toHaveBeenCalled();
  });

  it("spends the video budget but blocks the provider when the candidate changes at the last boundary", async () => {
    const fixture = await readyFixture();
    const invokeProviderOnce = vi.fn();
    const inspectCandidate = vi.fn(async () => ({
      candidate: { ...CANDIDATE, bundleSha256: "b".repeat(64) },
      pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY,
    }));

    await expect(runSourceBoundThreeEvaluation({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      targets: fixture.targets,
      projectRoot: fixture.root,
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: fixture.budgetStore,
      inspectCandidate,
      invokeProviderOnce,
    })).rejects.toThrow(/candidate.*changed/iu);
    expect(invokeProviderOnce).not.toHaveBeenCalled();
    await expect(fixture.budgetStore.read("source-bound-three-request", VIDEO_IDS[0]))
      .resolves.toMatchObject({ videoId: VIDEO_IDS[0] });
  });

  it("rejects hidden selector, repair, or retry calls reported by the provider adapter", async () => {
    const fixture = await readyFixture();
    const invokeProviderOnce = vi.fn(async () => ({
      output: { recipes: [] },
      telemetry: { modelCalls: 1, selectorCalls: 1, repairCalls: 0, retryCalls: 0 },
    }));

    await expect(runSourceBoundThreeEvaluation({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      targets: fixture.targets,
      projectRoot: fixture.root,
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: fixture.budgetStore,
      inspectCandidate: async () => ({ candidate: CANDIDATE, pipelineIdentity: SOURCE_BOUND_PIPELINE_IDENTITY }),
      invokeProviderOnce,
    })).rejects.toThrow(/provider call telemetry.*contract/iu);
    expect(invokeProviderOnce).toHaveBeenCalledTimes(1);
  });
});
