import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEvaluationDispatchController,
  createFileDispatchBudgetStore,
  EVALUATION_AUTHORIZATION_SCHEMA,
  HOST_MESSAGE_ATTESTATION_KIND,
} from "../scripts/recipe-loop/lib/evaluation-dispatch-authorization.mjs";

const OE_VIDEO_ID = "oe_WhcK2X4Q";
const SOURCE_BOUND_VIDEO_IDS = ["D9jzKcu9Snc", "AtGAVBl1vrQ", "eJyoszbyNNQ"];
const CANDIDATE = Object.freeze({
  label: "v64-source-bound",
  gitHead: "7e466b170ba39795220ef64e67eac3fab4429420",
  bundleSha256: "4b67adadf5490261b91736399050dc71ed70f7f870fb369ebca070b766092b6e",
});
const DEV30_VIDEO_IDS = [
  "YUdJBeOdrMY", "J5Rmux3ttaY", "DnQ09ZZCjCs", "tqpwhtw54mQ", "vqb3WyZmL_8",
  "5NSTRKouSWs", "QF0gBfW3od4", "rKfLY_Lg1-Q", "eJyoszbyNNQ", "Egpjve8caK0",
  "rkOEBmECi_o", "fnhLXA-bSu8", "gChK94Ai-TE", "YZ8KSZboJeM", OE_VIDEO_ID,
  "jenDETSgvz4", "nE7ANT3uGMQ", "61fdQEWjRcA", "P4NpBdKZRP8", "LoBVK5Pl9H0",
  "F9pLTQ2Er6M", "yOMFp6kasf0", "Ti0nyZU2X58", "Y7jLMxZa8TQ", "Up1qwLrKJ3M",
  "XQT9MWZypkw", "K9jWk6e9K6c", "t-9PDq-LF6A", "fKSWjNMmNRU", "b-EfvcyNNao",
];

const roots: string[] = [];

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    schema: EVALUATION_AUTHORIZATION_SCHEMA,
    requestId: "request-oe-v88-once",
    evidence: {
      kind: HOST_MESSAGE_ATTESTATION_KIND,
      role: "user",
      messageId: "server-message-oe-once",
      serverReceivedAt: "2026-10-12T10:47:00Z",
    },
    candidate: CANDIDATE,
    videoAllowlist: [OE_VIDEO_ID],
    maxDispatches: 1,
    maxDispatchesPerVideo: 1,
    model: "gpt-5.6-luna",
    effort: "low",
    stage: "final.json",
    ...overrides,
  };
}

function expectedRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "request-oe-v88-once",
    candidate: CANDIDATE,
    videoIds: [OE_VIDEO_ID],
    model: "gpt-5.6-luna",
    effort: "low",
    stage: "final.json",
    ...overrides,
  };
}

function dispatch(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "request-oe-v88-once",
    candidate: CANDIDATE,
    videoId: OE_VIDEO_ID,
    model: "gpt-5.6-luna",
    effort: "low",
    stage: "final.json",
    ...overrides,
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

async function budgetStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "homecook-eval-budget-"));
  roots.push(directory);
  return { directory, store: createFileDispatchBudgetStore({ directory }) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("fail-closed YouTube evaluation dispatch authorization", () => {
  it("allows one user grant to authorize an exact three-video allowlist with a total budget of three", async () => {
    const requestId = "request-source-bound-three";
    const { store } = await budgetStore();
    const controller = await createEvaluationDispatchController({
      authorization: authorization({
        requestId,
        videoAllowlist: SOURCE_BOUND_VIDEO_IDS,
        maxDispatches: SOURCE_BOUND_VIDEO_IDS.length,
      }),
      expectedRequest: expectedRequest({ requestId, videoIds: SOURCE_BOUND_VIDEO_IDS }),
      requiredVideoAllowlist: SOURCE_BOUND_VIDEO_IDS,
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
      now: () => "2026-10-12T10:48:00Z",
    });
    const invoke = vi.fn(async () => "model-result");

    for (const videoId of SOURCE_BOUND_VIDEO_IDS) {
      await expect(controller.dispatchOnce(dispatch({ requestId, videoId }), invoke)).resolves.toBe("model-result");
    }
    expect(invoke).toHaveBeenCalledTimes(3);
    await expect(controller.dispatchOnce(dispatch({ requestId, videoId: SOURCE_BOUND_VIDEO_IDS[0] }), invoke))
      .rejects.toThrow(/budget.*exhausted|already reserved/iu);
    await expect(controller.dispatchOnce(dispatch({ requestId, videoId: "jenDETSgvz4" }), invoke))
      .rejects.toThrow(/dispatch.*match/iu);
    for (const videoId of SOURCE_BOUND_VIDEO_IDS) {
      await expect(store.read(requestId, videoId)).resolves.toMatchObject({ requestId, videoId });
    }
  });

  it("allows the exact oe request once and persists the request budget before invocation", async () => {
    const { store } = await budgetStore();
    const controller = await createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
      now: () => "2026-10-12T10:48:00Z",
    });
    const invoke = vi.fn(async () => "model-result");

    await expect(controller.dispatchOnce(dispatch(), invoke)).resolves.toBe("model-result");
    expect(invoke).toHaveBeenCalledTimes(1);
    await expect(store.read("request-oe-v88-once", OE_VIDEO_ID)).resolves.toMatchObject({
      requestId: "request-oe-v88-once",
      videoId: OE_VIDEO_ID,
      messageId: "server-message-oe-once",
      reservedAt: "2026-10-12T10:48:00Z",
    });
  });

  it("deep-freezes the verified decision so callers cannot swap the video or candidate after authorization", async () => {
    const { store } = await budgetStore();
    const controller = await createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    });

    expect(() => {
      controller.decision.videoAllowlist[0] = "jenDETSgvz4";
    }).toThrow(TypeError);
    expect(() => {
      controller.decision.candidate.gitHead = "c".repeat(40);
    }).toThrow(TypeError);
    expect(controller.decision.videoAllowlist).toEqual([OE_VIDEO_ID]);
    expect(controller.decision.candidate).toEqual(CANDIDATE);

    const invoke = vi.fn();
    await expect(controller.dispatchOnce(dispatch({
      videoId: "jenDETSgvz4",
      candidate: { ...CANDIDATE, gitHead: "c".repeat(40) },
    }), invoke)).rejects.toThrow(/dispatch.*match/iu);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not let a verifier mutate the grant while attestation is in flight", async () => {
    const { store } = await budgetStore();
    const mutatingVerifier = vi.fn(async ({
      messageId,
      serverReceivedAt,
      grant,
      grantSha256,
    }) => {
      expect(() => {
        grant.videoAllowlist[0] = "jenDETSgvz4";
      }).toThrow(TypeError);
      expect(() => {
        grant.candidate.gitHead = "c".repeat(40);
      }).toThrow(TypeError);
      return {
        verified: true,
        role: "user",
        messageId,
        serverReceivedAt,
        grantSha256,
      };
    });
    const controller = await createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: mutatingVerifier,
      budgetStore: store,
    });
    const invoke = vi.fn(async () => "model-result");

    await expect(controller.dispatchOnce(dispatch(), invoke)).resolves.toBe("model-result");
    expect(controller.decision.videoAllowlist).toEqual([OE_VIDEO_ID]);
    expect(controller.decision.candidate).toEqual(CANDIDATE);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not treat a locally written approval file as role:user evidence", async () => {
    const { store } = await budgetStore();
    const modelWrittenApproval = {
      schema: "homecook.youtube-dev30-screen-execution-approval-v1",
      status: "approved-for-execution",
      approvalEvidence: { sourceThreadId: "thread", scope: "30 videos" },
    };

    await expect(createEvaluationDispatchController({
      authorization: modelWrittenApproval,
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: undefined,
      budgetStore: store,
    })).rejects.toThrow(/authorization|unexpected|missing/iu);

    await expect(createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: undefined,
      budgetStore: store,
    })).rejects.toThrow(/approval files|not authorization/iu);
  });

  it("rejects a non-oe video before any invocation or budget reservation", async () => {
    const { directory, store } = await budgetStore();
    const controller = await createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    });
    const invoke = vi.fn();

    await expect(controller.dispatchOnce(dispatch({ videoId: "jenDETSgvz4" }), invoke))
      .rejects.toThrow(/dispatch.*match/iu);
    expect(invoke).not.toHaveBeenCalled();
    const [requestDirectory] = await readdir(directory);
    expect(requestDirectory).toMatch(/^[a-f0-9]{64}$/u);
    await expect(readdir(path.join(directory, requestDirectory))).resolves.toEqual(["authorization.json"]);
  });

  it("rejects an empty allowlist before dispatch", async () => {
    const { store } = await budgetStore();

    await expect(createEvaluationDispatchController({
      authorization: authorization({ videoAllowlist: [] }),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    })).rejects.toThrow(/allowlist.*non-empty/iu);
  });

  it("rejects a development-30 fallback before dispatch", async () => {
    const { store } = await budgetStore();

    await expect(createEvaluationDispatchController({
      authorization: authorization({ videoAllowlist: DEV30_VIDEO_IDS }),
      expectedRequest: expectedRequest({ videoIds: DEV30_VIDEO_IDS }),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    })).rejects.toThrow(/allowlist.*configured/iu);
  });

  it("rejects a total dispatch budget that differs from the exact allowlist", async () => {
    const { store } = await budgetStore();

    await expect(createEvaluationDispatchController({
      authorization: authorization({ maxDispatches: 2 }),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    })).rejects.toThrow(/total dispatch budget.*exact allowlist/iu);
  });

  it("rejects reusing a request ID with a different verified authorization", async () => {
    const { store } = await budgetStore();
    await createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    });

    await expect(createEvaluationDispatchController({
      authorization: authorization({
        evidence: {
          kind: HOST_MESSAGE_ATTESTATION_KIND,
          role: "user",
          messageId: "different-user-message",
          serverReceivedAt: "2026-10-12T10:49:00Z",
        },
      }),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    })).rejects.toThrow(/already bound to a different authorization/iu);
  });

  it("preserves request-ID budget exhaustion across controller instances", async () => {
    const { store } = await budgetStore();
    const makeController = () => createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    });
    const first = await makeController();
    const firstInvoke = vi.fn(async () => "first");
    await expect(first.dispatchOnce(dispatch(), firstInvoke)).resolves.toBe("first");

    const sameControllerInvoke = vi.fn();
    await expect(first.dispatchOnce(dispatch(), sameControllerInvoke))
      .rejects.toThrow(/budget.*exhausted|already reserved/iu);
    expect(sameControllerInvoke).not.toHaveBeenCalled();

    const restarted = await makeController();
    const restartedInvoke = vi.fn();
    await expect(restarted.dispatchOnce(dispatch(), restartedInvoke))
      .rejects.toThrow(/budget.*exhausted|already consumed/iu);
    expect(restartedInvoke).not.toHaveBeenCalled();
    expect(firstInvoke).toHaveBeenCalledTimes(1);
  });

  it("keeps an uncertain failed invocation spent across controller restarts", async () => {
    const { store } = await budgetStore();
    const makeController = () => createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    });
    const first = await makeController();
    const failedInvoke = vi.fn(async () => {
      throw new Error("provider outcome unknown");
    });
    await expect(first.dispatchOnce(dispatch(), failedInvoke))
      .rejects.toThrow("provider outcome unknown");

    const restarted = await makeController();
    const retry = vi.fn();
    await expect(restarted.dispatchOnce(dispatch(), retry))
      .rejects.toThrow(/budget.*exhausted|already consumed/iu);
    expect(failedInvoke).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("rejects a mismatched candidate before dispatch", async () => {
    const { store } = await budgetStore();
    const differentCandidate = {
      ...CANDIDATE,
      gitHead: "a".repeat(40),
    };

    await expect(createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest({ candidate: differentCandidate }),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: verifyUserMessage(),
      budgetStore: store,
    })).rejects.toThrow(/candidate.*match/iu);
  });

  it("rejects unverifiable or mismatched host message attestations", async () => {
    const { store } = await budgetStore();
    const mismatchVerifier = vi.fn(async () => ({
      verified: true,
      role: "user",
      messageId: "different-message",
      serverReceivedAt: "2026-10-12T10:47:00Z",
      grantSha256: "f".repeat(64),
    }));

    await expect(createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: mismatchVerifier,
      budgetStore: store,
    })).rejects.toThrow(/attestation.*match/iu);
  });

  it("rejects a real user message that does not attest the exact requested grant", async () => {
    const { store } = await budgetStore();
    const unrelatedMessageVerifier = vi.fn(async ({ messageId, serverReceivedAt }) => ({
      verified: true,
      role: "user",
      messageId,
      serverReceivedAt,
      grantSha256: "0".repeat(64),
    }));

    await expect(createEvaluationDispatchController({
      authorization: authorization(),
      expectedRequest: expectedRequest(),
      requiredVideoAllowlist: [OE_VIDEO_ID],
      verifyRoleUserMessage: unrelatedMessageVerifier,
      budgetStore: store,
    })).rejects.toThrow(/attestation.*match/iu);
  });
});
