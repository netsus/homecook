import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { normalizeYoutubeUrl } from "@/lib/youtube-url";

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export const YOUTUBE_ASYNC_POLICY_OPTIONS = Object.freeze({
  codexEffort: "low",
  frameMode: "hybrid",
  hybridAnchorBudget: 36,
  interval: 4,
  keyframeTotalLimit: 8,
  keyframesPerRecipe: 8,
  packetPromptTextOnly: false,
  publicSourceBundle: null,
  recipeMode: "single",
  screenOcrMode: "auto",
  selectorCandidateLimit: 12,
  selectorEffort: "low",
  singleRecipeOnly: true,
  sourceMode: "source-text",
  useApifyFallback: true,
  useEvidencePackets: false,
  useVisual: true,
} as const);

const POLICY_PIPELINE_IDENTITY =
  "9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("canonical JSON contains an unsupported value");
}

function buildPolicySnapshotDigest() {
  const preimage = canonicalJson({
    extractor_mode: "i031_codex_vision",
    pipeline_identity: POLICY_PIPELINE_IDENTITY,
    policy_version: 1,
    result_affecting_options: YOUTUBE_ASYNC_POLICY_OPTIONS,
    schema_identity: "youtube-extraction-policy-snapshot-v1",
  });
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

export const YOUTUBE_ASYNC_POLICY = Object.freeze({
  policyKey: "primary",
  policyVersion: 1,
  extractorMode: "i031_codex_vision",
  pipelineIdentity: POLICY_PIPELINE_IDENTITY,
  resultAffectingOptions: YOUTUBE_ASYNC_POLICY_OPTIONS,
  fingerprintKeyVersion: "1",
  previousFingerprintKeyVersion: null,
  previousFingerprintValidUntil: null,
  enabled: false,
  snapshotDigest: buildPolicySnapshotDigest(),
});

export type YoutubeExtractionPolicy = typeof YOUTUBE_ASYNC_POLICY;

export function isYoutubeAsyncExtractionEnabled(env: RuntimeEnv = process.env) {
  return env.HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION === "1";
}

function parseYoutubeVideoId(rawValue: unknown) {
  return normalizeYoutubeUrl(rawValue)?.videoId ?? null;
}

export type YoutubeExtractionJobRequest =
  | { kind: "url"; videoId: string }
  | { kind: "retry"; jobId: string }
  | { code: "VALIDATION_ERROR" | "INVALID_URL"; field: "body" | "youtube_url" };

export function parseYoutubeExtractionJobRequest(body: unknown): YoutubeExtractionJobRequest {
  if (!isRecord(body)) {
    return { code: "VALIDATION_ERROR", field: "body" };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || (keys[0] !== "youtube_url" && keys[0] !== "retry_job_id")) {
    return { code: "VALIDATION_ERROR", field: "body" };
  }
  if (keys[0] === "retry_job_id") {
    return typeof body.retry_job_id === "string" && UUID_PATTERN.test(body.retry_job_id)
      ? { kind: "retry", jobId: body.retry_job_id.toLowerCase() }
      : { code: "VALIDATION_ERROR", field: "body" };
  }
  const videoId = parseYoutubeVideoId(body.youtube_url);
  return videoId
    ? { kind: "url", videoId }
    : { code: "INVALID_URL", field: "youtube_url" };
}

export function buildYoutubeExtractionFingerprint({
  secret,
  userId,
  videoId,
  policy,
}: {
  secret: string;
  userId: string;
  videoId: string;
  policy: YoutubeExtractionPolicy;
}) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("fingerprint HMAC key must be at least 32 bytes");
  }
  const preimage = canonicalJson({
    extractor_mode: policy.extractorMode,
    pipeline_identity: policy.pipelineIdentity,
    policy_version: policy.policyVersion,
    result_affecting_options: policy.resultAffectingOptions,
    schema_identity: "youtube-extraction-fingerprint-v1",
    user_id: userId,
    youtube_video_id: videoId,
  });
  return {
    digest: createHmac("sha256", secret).update(preimage, "utf8").digest("hex"),
    preimage,
  };
}

const PUBLIC_FAILURES = Object.freeze({
  NOT_RECIPE_VIDEO: {
    message: "레시피 영상으로 확인되지 않았어요.",
    retryable: false,
  },
  QUOTA_EXCEEDED: {
    message: "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.",
    retryable: true,
  },
  RUNTIME_UNAVAILABLE: {
    message: "지금은 추출을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  ATTEMPTS_EXHAUSTED: {
    message: "추출을 완료하지 못했어요. 다시 시도해 주세요.",
    retryable: true,
  },
  EXTRACTION_FAILED: {
    message: "레시피를 추출하지 못했어요. 다시 시도해 주세요.",
    retryable: true,
  },
  EXTRACTION_EXPIRED: {
    message: "결과가 만료됐어요. 다시 추출해 주세요.",
    retryable: true,
  },
});

export type YoutubePublicFailureCode = keyof typeof PUBLIC_FAILURES;

export type YoutubeExtractionWorkerFailureCode =
  | "NOT_RECIPE_VIDEO"
  | "QUOTA_EXCEEDED"
  | "RUNTIME_UNAVAILABLE"
  | "EXTRACTION_FAILED"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "TRANSIENT_INTERNAL_ERROR";

const WORKER_FAILURE_CODES: readonly YoutubeExtractionWorkerFailureCode[] = [
  "NOT_RECIPE_VIDEO",
  "QUOTA_EXCEEDED",
  "RUNTIME_UNAVAILABLE",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "TRANSIENT_INTERNAL_ERROR",
  "EXTRACTION_FAILED",
];

export function classifyYoutubeExtractionWorkerError(
  error: unknown,
): YoutubeExtractionWorkerFailureCode {
  const record = error !== null && typeof error === "object"
    ? error as Record<string, unknown>
    : null;
  const evidence = [record?.code, record?.name, record?.message, error]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return WORKER_FAILURE_CODES.find((code) => evidence.includes(code))
    ?? "EXTRACTION_FAILED";
}

interface ExtractionSessionProjectionRow {
  id: string;
  status: "draft" | "consumed" | "expired";
  recipe_id: string | null;
  expires_at: string;
}

export interface YoutubeExtractionJobProjectionRow {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  extraction_session?: ExtractionSessionProjectionRow | null;
  [key: string]: unknown;
}

export function projectYoutubeExtractionJob(
  row: YoutubeExtractionJobProjectionRow,
  now = new Date(),
) {
  const session = row.extraction_session ?? null;
  const consumed = row.status === "succeeded"
    && session?.status === "consumed"
    && typeof session.recipe_id === "string";
  const expired = row.status === "succeeded"
    && session !== null
    && !consumed
    && session.status === "draft"
    && Date.parse(session.expires_at) <= now.getTime();
  const status = expired ? "expired" as const : row.status;
  const failureCode: YoutubePublicFailureCode | null = expired
    ? "EXTRACTION_EXPIRED"
    : row.status === "failed"
      && typeof row.error_code === "string"
      && row.error_code in PUBLIC_FAILURES
      ? row.error_code as YoutubePublicFailureCode
      : row.status === "failed"
        ? "EXTRACTION_FAILED"
        : null;
  const error = failureCode
    ? { code: failureCode, ...PUBLIC_FAILURES[failureCode] }
    : null;
  const result = row.status === "succeeded" && !expired && session
    ? {
        extraction_id: session.id,
        review_path: consumed ? null : `/menu/add/youtube?extractionId=${session.id}`,
        recipe_id: consumed ? session.recipe_id : null,
        recipe_path: consumed ? `/recipes/${session.recipe_id}` : null,
      }
    : null;
  return {
    job_id: row.id,
    status,
    submitted_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    result,
    error,
    can_retry: error?.retryable === true,
  };
}

interface CursorInput {
  secret: string;
  userId: string;
  view: "unseen-completed" | "archive";
  completedAt: string;
  jobId: string;
  now?: Date;
}

export function encodeYoutubeExtractionCursor(input: CursorInput) {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload = Buffer.from(canonicalJson({
    completed_at: input.completedAt,
    exp: issuedAt + 30 * 24 * 60 * 60,
    iat: issuedAt,
    job_id: input.jobId,
    user_id: input.userId,
    version: 1,
    view: input.view,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeYoutubeExtractionCursor({
  cursor,
  secret,
  userId,
  view,
  now = new Date(),
}: {
  cursor: string;
  secret: string;
  userId: string;
  view: "unseen-completed" | "archive";
  now?: Date;
}) {
  try {
    const [payload, signature, extra] = cursor.split(".");
    if (!payload || !signature || extra) {
      throw new Error();
    }
    const expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error();
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (
      !isRecord(decoded)
      || decoded.version !== 1
      || decoded.user_id !== userId
      || decoded.view !== view
      || typeof decoded.iat !== "number"
      || !Number.isInteger(decoded.iat)
      || typeof decoded.exp !== "number"
      || !Number.isInteger(decoded.exp)
      || decoded.exp <= decoded.iat
      || decoded.exp - decoded.iat !== 30 * 24 * 60 * 60
      || decoded.iat > Math.floor(now.getTime() / 1000)
      || decoded.exp <= Math.floor(now.getTime() / 1000)
      || typeof decoded.completed_at !== "string"
      || typeof decoded.job_id !== "string"
      || !UUID_PATTERN.test(decoded.job_id)
      || !Number.isFinite(Date.parse(decoded.completed_at))
    ) {
      throw new Error();
    }
    return { completedAt: decoded.completed_at, jobId: decoded.job_id };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export interface ClaimedYoutubeExtractionJob {
  id: string;
  videoId: string;
  leaseGeneration: number;
  policySnapshotDigest: string;
  resultAffectingOptions: Readonly<Record<string, unknown>>;
}

interface YoutubeExtractionWorkerAdapter {
  claimJob(input: {
    workerId: string;
    allowedSnapshotDigest: string;
  }): Promise<ClaimedYoutubeExtractionJob | null>;
  claimPermit(input: { workerId: string }): Promise<{ permitGeneration: number } | null>;
  requeueWithoutAttempt?(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
    minimumDelaySeconds: number;
    maximumDelaySeconds: number;
  }): Promise<boolean>;
  startAttempt(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
    permitGeneration: number;
  }): Promise<boolean>;
  finalize(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
    permitGeneration: number;
    finalizedDraft: unknown;
  }): Promise<boolean>;
  failOrRetry(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
    errorCode: YoutubeExtractionWorkerFailureCode;
  }): Promise<boolean>;
  releasePermit(input: {
    workerId: string;
    permitGeneration: number;
  }): Promise<boolean>;
  heartbeatJob(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
  }): Promise<boolean>;
  heartbeatPermit(input: {
    workerId: string;
    permitGeneration: number;
  }): Promise<boolean>;
}

export function createYoutubeExtractionWorker({
  adapter,
  extract,
  workerId,
  allowedSnapshotDigest,
  heartbeatIntervalMs = 30_000,
}: {
  adapter: YoutubeExtractionWorkerAdapter;
  extract(input: {
    jobId: string;
    workerId: string;
    leaseGeneration: number;
    permitGeneration: number;
    videoId: string;
    options: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
  }): Promise<{ draft: unknown }>;
  workerId: string;
  allowedSnapshotDigest: string;
  heartbeatIntervalMs?: number;
}) {
  return {
    async runOnce() {
      const job = await adapter.claimJob({ workerId, allowedSnapshotDigest });
      if (!job) {
        return "idle" as const;
      }
      if (job.policySnapshotDigest !== allowedSnapshotDigest) {
        return "snapshot-mismatch" as const;
      }
      const permit = await adapter.claimPermit({ workerId });
      if (!permit) {
        await adapter.requeueWithoutAttempt?.({
          jobId: job.id,
          workerId,
          leaseGeneration: job.leaseGeneration,
          minimumDelaySeconds: 1,
          maximumDelaySeconds: 4,
        });
        return "permit-unavailable" as const;
      }
      try {
        const started = await adapter.startAttempt({
          jobId: job.id,
          workerId,
          leaseGeneration: job.leaseGeneration,
          permitGeneration: permit.permitGeneration,
        });
        if (!started) {
          return "stale-fence" as const;
        }
        const controller = new AbortController();
        let rejectHeartbeat: ((error: Error) => void) | null = null;
        const heartbeatFailure = new Promise<never>((_resolve, reject) => {
          rejectHeartbeat = reject;
        });
        let heartbeatRunning = false;
        const heartbeat = async () => {
          if (heartbeatRunning || controller.signal.aborted) return;
          heartbeatRunning = true;
          try {
            const [jobAlive, permitAlive] = await Promise.all([
              adapter.heartbeatJob({
                jobId: job.id,
                workerId,
                leaseGeneration: job.leaseGeneration,
              }),
              adapter.heartbeatPermit({
                workerId,
                permitGeneration: permit.permitGeneration,
              }),
            ]);
            if (!jobAlive || !permitAlive) {
              controller.abort(new Error("YOUTUBE_EXTRACTION_FENCE_LOST"));
              rejectHeartbeat?.(new Error("YOUTUBE_EXTRACTION_FENCE_LOST"));
            }
          } catch {
            controller.abort(new Error("YOUTUBE_EXTRACTION_HEARTBEAT_FAILED"));
            rejectHeartbeat?.(new Error("YOUTUBE_EXTRACTION_HEARTBEAT_FAILED"));
          } finally {
            heartbeatRunning = false;
          }
        };
        const heartbeatTimer = setInterval(() => void heartbeat(), heartbeatIntervalMs);
        heartbeatTimer.unref?.();
        try {
          await heartbeat();
          const extracted = await Promise.race([
            extract({
              jobId: job.id,
              workerId,
              leaseGeneration: job.leaseGeneration,
              permitGeneration: permit.permitGeneration,
              videoId: job.videoId,
              options: job.resultAffectingOptions,
              signal: controller.signal,
            }),
            heartbeatFailure,
          ]);
          await heartbeat();
          if (controller.signal.aborted) return "stale-fence" as const;
          const finalized = await adapter.finalize({
            jobId: job.id,
            workerId,
            leaseGeneration: job.leaseGeneration,
            permitGeneration: permit.permitGeneration,
            finalizedDraft: extracted.draft,
          });
          return finalized ? "succeeded" as const : "stale-fence" as const;
        } catch (error) {
          if (controller.signal.aborted) {
            return "stale-fence" as const;
          }
          await adapter.failOrRetry({
            jobId: job.id,
            workerId,
            leaseGeneration: job.leaseGeneration,
            errorCode: classifyYoutubeExtractionWorkerError(error),
          });
          return "failed" as const;
        } finally {
          clearInterval(heartbeatTimer);
        }
      } finally {
        await adapter.releasePermit({
          workerId,
          permitGeneration: permit.permitGeneration,
        });
      }
    },
  };
}
