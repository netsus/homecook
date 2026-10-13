import { createHash } from "node:crypto";
import { mkdir, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const EVALUATION_AUTHORIZATION_SCHEMA =
  "homecook.youtube-evaluation-user-authorization-v1";
export const HOST_MESSAGE_ATTESTATION_KIND = "host-message-store-role-user";

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_OBJECT_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/u;
const CANDIDATE_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/u;
const FILE_BUDGET_STORE = Symbol("homecook.file-evaluation-dispatch-budget-store");

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} has unexpected or missing fields`);
  }
  return value;
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} must be a non-empty trimmed string`);
  }
  return value;
}

function exactVideoIds(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("EVALUATION_VIDEO_ALLOWLIST_REQUIRED", `${label} must be a non-empty array`);
  }
  if (value.some((videoId) => typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId))) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} contains an invalid video ID`);
  }
  if (new Set(value).size !== value.length) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} contains duplicates`);
  }
  return [...value];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateCandidate(value, label) {
  exactObject(value, label, ["bundleSha256", "gitHead", "label"]);
  if (!CANDIDATE_RE.test(value.label)
    || !GIT_OBJECT_RE.test(value.gitHead)
    || !SHA256_RE.test(value.bundleSha256)) {
    fail("EVALUATION_AUTHORIZATION_INVALID", `${label} is malformed`);
  }
  return { ...value };
}

function sameCandidate(left, right) {
  return left.label === right.label
    && left.gitHead === right.gitHead
    && left.bundleSha256 === right.bundleSha256;
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

function validServerTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

export async function authorizeEvaluationRequest({
  authorization,
  expectedRequest,
  requiredVideoAllowlist,
  requiredMaxDispatches = 1,
  verifyRoleUserMessage,
}) {
  // Trust only a host-owned verifier that reads the authoritative message store
  // and derives the grant from that role:user message. A callback that merely
  // echoes these arguments is not a security boundary and must never be wired
  // from the model/evaluation process.
  exactObject(authorization, "authorization", [
    "candidate",
    "effort",
    "evidence",
    "maxDispatches",
    "maxDispatchesPerVideo",
    "model",
    "requestId",
    "schema",
    "stage",
    "videoAllowlist",
  ]);
  exactObject(expectedRequest, "expectedRequest", [
    "candidate",
    "effort",
    "model",
    "requestId",
    "stage",
    "videoIds",
  ]);
  exactObject(authorization.evidence, "authorization.evidence", [
    "kind",
    "messageId",
    "role",
    "serverReceivedAt",
  ]);

  if (authorization.schema !== EVALUATION_AUTHORIZATION_SCHEMA) {
    fail("EVALUATION_AUTHORIZATION_INVALID", "authorization schema is not accepted");
  }
  if (!REQUEST_ID_RE.test(authorization.requestId)
    || authorization.requestId !== expectedRequest.requestId) {
    fail("EVALUATION_REQUEST_MISMATCH", "request ID does not match");
  }

  // This is host policy, not request data. The host wrapper must inject it from
  // trusted configuration and must never copy it from authorization/expectedRequest.
  const configuredAllowlist = exactVideoIds(requiredVideoAllowlist, "requiredVideoAllowlist");
  const authorizedAllowlist = exactVideoIds(authorization.videoAllowlist, "authorization.videoAllowlist");
  const requestedVideoIds = exactVideoIds(expectedRequest.videoIds, "expectedRequest.videoIds");
  if (!sameArray(authorizedAllowlist, configuredAllowlist)
    || !sameArray(requestedVideoIds, configuredAllowlist)) {
    fail("EVALUATION_VIDEO_ALLOWLIST_MISMATCH", "authorization and request must equal the configured allowlist");
  }
  if (!Number.isInteger(requiredMaxDispatches) || requiredMaxDispatches < 1
    || authorization.maxDispatches !== requiredMaxDispatches
    || authorization.maxDispatchesPerVideo !== 1
    || authorizedAllowlist.length !== requiredMaxDispatches) {
    fail("EVALUATION_DISPATCH_LIMIT_INVALID", "the total dispatch budget must equal the exact allowlist with one dispatch per video");
  }

  const authorizedCandidate = validateCandidate(authorization.candidate, "authorization.candidate");
  const requestedCandidate = validateCandidate(expectedRequest.candidate, "expectedRequest.candidate");
  if (!sameCandidate(authorizedCandidate, requestedCandidate)) {
    fail("EVALUATION_CANDIDATE_MISMATCH", "candidate identity does not match");
  }
  for (const field of ["model", "effort", "stage"]) {
    nonempty(authorization[field], `authorization.${field}`);
    nonempty(expectedRequest[field], `expectedRequest.${field}`);
    if (authorization[field] !== expectedRequest[field]) {
      fail("EVALUATION_REQUEST_MISMATCH", `${field} does not match`);
    }
  }

  const grant = deepFreeze({
    requestId: authorization.requestId,
    candidate: authorizedCandidate,
    videoAllowlist: authorizedAllowlist,
    maxDispatches: authorization.maxDispatches,
    maxDispatchesPerVideo: authorization.maxDispatchesPerVideo,
    model: authorization.model,
    effort: authorization.effort,
    stage: authorization.stage,
  });
  const grantSha256 = canonicalHash(grant);
  const evidence = authorization.evidence;
  if (evidence.kind !== HOST_MESSAGE_ATTESTATION_KIND
    || evidence.role !== "user"
    || !validServerTimestamp(evidence.serverReceivedAt)) {
    fail("EVALUATION_USER_MESSAGE_UNVERIFIED", "a host-verified role:user message is required");
  }
  nonempty(evidence.messageId, "authorization.evidence.messageId");
  if (typeof verifyRoleUserMessage !== "function") {
    fail("EVALUATION_USER_MESSAGE_UNVERIFIED", "approval files and model assertions are not authorization");
  }
  const attestation = await verifyRoleUserMessage({
    messageId: evidence.messageId,
    serverReceivedAt: evidence.serverReceivedAt,
    grant,
    grantSha256,
  });
  if (canonicalHash(grant) !== grantSha256) {
    fail("EVALUATION_USER_MESSAGE_UNVERIFIED", "verified grant changed during host attestation");
  }
  if (!attestation || attestation.verified !== true
    || attestation.role !== "user"
    || attestation.messageId !== evidence.messageId
    || attestation.serverReceivedAt !== evidence.serverReceivedAt
    || attestation.grantSha256 !== grantSha256) {
    fail("EVALUATION_USER_MESSAGE_UNVERIFIED", "host message attestation did not match");
  }

  const decision = {
    ...grant,
    message: {
      id: evidence.messageId,
      serverReceivedAt: evidence.serverReceivedAt,
      role: evidence.role,
    },
  };
  return deepFreeze({ ...decision, authorizationSha256: canonicalHash(decision) });
}

export function createFileDispatchBudgetStore({ directory }) {
  // The host must place this directory outside the model-readable/writable
  // sandbox. Exclusive creation makes concurrent/restarted attempts fail closed;
  // an uncertain partial marker deliberately remains spent.
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    fail("EVALUATION_BUDGET_STORE_INVALID", "budget directory must be absolute");
  }

  const requestKey = (requestId) => {
    if (!REQUEST_ID_RE.test(requestId)) {
      fail("EVALUATION_BUDGET_STORE_INVALID", "request ID is malformed");
    }
    return createHash("sha256").update(requestId).digest("hex");
  };

  const canonicalRequestDirectory = async (requestId) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const canonicalDirectory = await realpath(directory);
    const requestDirectory = path.join(canonicalDirectory, requestKey(requestId));
    await mkdir(requestDirectory, { recursive: true, mode: 0o700 });
    const canonicalRequest = await realpath(requestDirectory);
    if (canonicalRequest !== requestDirectory || path.dirname(canonicalRequest) !== canonicalDirectory) {
      fail("EVALUATION_BUDGET_STORE_INVALID", "request budget path escaped its directory");
    }
    return { canonicalDirectory, requestDirectory };
  };

  const persistExclusive = async (file, record, existsCode, existsMessage) => {
    let handle;
    try {
      handle = await open(file, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") fail(existsCode, existsMessage);
      fail("EVALUATION_BUDGET_PERSIST_FAILED", "could not reserve dispatch budget");
    }
    let directoryHandle;
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.sync();
      directoryHandle = await open(path.dirname(file), "r");
      await directoryHandle.sync();
    } catch {
      fail("EVALUATION_BUDGET_PERSIST_FAILED", "dispatch reservation could not be durably recorded");
    } finally {
      await directoryHandle?.close();
      await handle?.close();
    }
  };

  return Object.freeze({
    [FILE_BUDGET_STORE]: true,
    async bindAuthorization(record) {
      exactObject(record, "authorization budget", [
        "authorizationSha256",
        "candidate",
        "effort",
        "maxDispatches",
        "maxDispatchesPerVideo",
        "messageId",
        "model",
        "requestId",
        "stage",
        "videoAllowlist",
      ]);
      const { requestDirectory } = await canonicalRequestDirectory(record.requestId);
      const file = path.join(requestDirectory, "authorization.json");
      try {
        await persistExclusive(file, record, "EVALUATION_AUTHORIZATION_ALREADY_BOUND", "request ID already has an authorization budget");
      } catch (error) {
        if (error?.code !== "EVALUATION_AUTHORIZATION_ALREADY_BOUND") throw error;
        let existing;
        try {
          existing = JSON.parse(await readFile(file, "utf8"));
        } catch {
          fail("EVALUATION_BUDGET_PERSIST_FAILED", "existing authorization budget could not be read");
        }
        if (JSON.stringify(existing) !== JSON.stringify(record)) {
          fail("EVALUATION_REQUEST_BUDGET_CONFLICT", "request ID is already bound to a different authorization");
        }
      }
      return Object.freeze({ path: file, requestId: record.requestId });
    },
    async reserve(record) {
      exactObject(record, "dispatch record", [
        "authorizationSha256",
        "candidate",
        "effort",
        "messageId",
        "model",
        "requestId",
        "reservedAt",
        "stage",
        "videoId",
      ]);
      if (!VIDEO_ID_RE.test(record.videoId)) fail("EVALUATION_BUDGET_STORE_INVALID", "video ID is malformed");
      const { requestDirectory } = await canonicalRequestDirectory(record.requestId);
      const videoKey = createHash("sha256").update(record.videoId).digest("hex");
      const file = path.join(requestDirectory, `${videoKey}.json`);
      await persistExclusive(file, record, "EVALUATION_DISPATCH_BUDGET_EXHAUSTED",
        "video already consumed its dispatch budget for this request");
      return Object.freeze({ path: file, requestId: record.requestId });
    },
    async read(requestId, videoId) {
      if (!VIDEO_ID_RE.test(videoId)) fail("EVALUATION_BUDGET_STORE_INVALID", "video ID is malformed");
      const { requestDirectory } = await canonicalRequestDirectory(requestId);
      const videoKey = createHash("sha256").update(videoId).digest("hex");
      return JSON.parse(await readFile(path.join(requestDirectory, `${videoKey}.json`), "utf8"));
    },
  });
}

export async function createEvaluationDispatchController({
  authorization,
  expectedRequest,
  requiredVideoAllowlist,
  verifyRoleUserMessage,
  budgetStore,
  now = () => new Date().toISOString(),
}) {
  if (!budgetStore || budgetStore[FILE_BUDGET_STORE] !== true
    || typeof budgetStore.bindAuthorization !== "function" || typeof budgetStore.reserve !== "function") {
    fail("EVALUATION_BUDGET_STORE_INVALID", "a durable budget store is required");
  }
  const decision = await authorizeEvaluationRequest({
    authorization,
    expectedRequest,
    requiredVideoAllowlist,
    requiredMaxDispatches: requiredVideoAllowlist.length,
    verifyRoleUserMessage,
  });
  await budgetStore.bindAuthorization({
    requestId: decision.requestId,
    candidate: decision.candidate,
    videoAllowlist: decision.videoAllowlist,
    maxDispatches: decision.maxDispatches,
    maxDispatchesPerVideo: decision.maxDispatchesPerVideo,
    model: decision.model,
    effort: decision.effort,
    stage: decision.stage,
    messageId: decision.message.id,
    authorizationSha256: decision.authorizationSha256,
  });
  const reservedVideos = new Set();

  return Object.freeze({
    decision,
    async dispatchOnce(dispatch, invoke) {
      exactObject(dispatch, "dispatch", [
        "candidate",
        "effort",
        "model",
        "requestId",
        "stage",
        "videoId",
      ]);
      const candidate = validateCandidate(dispatch.candidate, "dispatch.candidate");
      if (dispatch.requestId !== decision.requestId
        || !decision.videoAllowlist.includes(dispatch.videoId)
        || !sameCandidate(candidate, decision.candidate)
        || dispatch.model !== decision.model
        || dispatch.effort !== decision.effort
        || dispatch.stage !== decision.stage) {
        fail("EVALUATION_DISPATCH_MISMATCH", "dispatch does not match the verified request");
      }
      if (reservedVideos.has(dispatch.videoId)) {
        fail("EVALUATION_DISPATCH_BUDGET_EXHAUSTED", "controller already reserved this video's dispatch");
      }
      if (typeof invoke !== "function") {
        fail("EVALUATION_DISPATCH_INVALID", "dispatch invocation must be a function");
      }
      const reservedAt = now();
      if (!validServerTimestamp(reservedAt)) {
        fail("EVALUATION_DISPATCH_INVALID", "reservation time must be an RFC3339 UTC timestamp");
      }
      const record = {
        requestId: decision.requestId,
        videoId: dispatch.videoId,
        candidate,
        model: dispatch.model,
        effort: dispatch.effort,
        stage: dispatch.stage,
        messageId: decision.message.id,
        authorizationSha256: decision.authorizationSha256,
        reservedAt,
      };
      await budgetStore.reserve(record);
      reservedVideos.add(dispatch.videoId);
      return invoke();
    },
  });
}
