import type { ClaimedYoutubeExtractionJob, YoutubeExtractionWorkerFailureCode } from
  "@/lib/server/youtube-async-extraction";
import workerTiming from "@/lib/server/youtube-extraction-worker-timing.json";
const YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS = workerTiming.lease_seconds;
// Keep inventory line anchors stable; this adapter is itself a fenced write surface.

interface RpcResult { data: unknown; error: unknown }
interface RestrictedRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

function record(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireSuccess(result: RpcResult, operation: string) {
  if (result.error) throw new Error(`${operation} failed`);
  return result.data;
}

function booleanResult(result: RpcResult, operation: string) {
  const data = requireSuccess(result, operation);
  if (typeof data === "boolean") return data;
  if (typeof data === "number") return data > 0;
  const row = record(data);
  return row
    ? row.applied === true
      || row.updated === true
      || row.finalized === true
      || row.released === true
      || Number(row.affected_count ?? 0) > 0
    : false;
}

function fencedRecordResult(result: RpcResult, operation: string) {
  const data = requireSuccess(result, operation);
  const row = record(Array.isArray(data) ? data[0] : data);
  if (!row || row.applied !== true) throw new Error(`${operation} lost its lease fence`);
  return row;
}

type YoutubeExtractionWorkerCacheOperation =
  | "transcript_read"
  | "transcript_upsert"
  | "transcript_touch"
  | "llm_read"
  | "llm_upsert"
  | "llm_touch"
  | "visual_read"
  | "visual_upsert"
  | "visual_touch";

interface YoutubeExtractionWorkerFence {
  jobId: string;
  workerId: string;
  leaseGeneration: number;
}

interface YoutubeExtractionWorkerWriteFence extends YoutubeExtractionWorkerFence {
  permitGeneration: number;
}

export function createYoutubeExtractionWorkerRpcAdapter(client: RestrictedRpcClient) {
  return {
    async readCatalog(input: YoutubeExtractionWorkerFence) {
      return fencedRecordResult(await client.rpc(
        "read_youtube_extraction_worker_catalog",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
        },
      ), "read worker catalog");
    },
    async accessCache(input: YoutubeExtractionWorkerWriteFence & {
      operation: YoutubeExtractionWorkerCacheOperation;
      payload: Record<string, unknown>;
    }) {
      return fencedRecordResult(await client.rpc(
        "access_youtube_extraction_worker_cache",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          permit_generation: input.permitGeneration,
          cache_operation: input.operation,
          payload: input.payload,
        },
      ), "access worker cache");
    },
    async reserveQuota(input: YoutubeExtractionWorkerWriteFence & {
      provider: "external_transcript_api" | "gemini";
      units: 1;
    }) {
      return fencedRecordResult(await client.rpc(
        "reserve_youtube_extraction_worker_quota",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          permit_generation: input.permitGeneration,
          provider: input.provider,
          units: input.units,
        },
      ), "reserve worker quota");
    },
    async recordEvent(input: YoutubeExtractionWorkerWriteFence & {
      kind: "transcript" | "llm" | "visual";
      payload: Record<string, unknown>;
    }) {
      return fencedRecordResult(await client.rpc(
        "record_youtube_extraction_worker_event",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          permit_generation: input.permitGeneration,
          event_kind: input.kind,
          payload: input.payload,
        },
      ), "record worker event");
    },
    async resolveMethods(input: YoutubeExtractionWorkerWriteFence & {
      methodLabels: string[];
    }) {
      return fencedRecordResult(await client.rpc(
        "resolve_youtube_extraction_worker_methods",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          permit_generation: input.permitGeneration,
          method_labels: input.methodLabels,
        },
      ), "resolve worker methods");
    },
    async updateTitle(input: YoutubeExtractionWorkerWriteFence & { title: string }) {
      return booleanResult(await client.rpc(
        "update_youtube_extraction_job_title",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          permit_generation: input.permitGeneration,
          title: input.title,
        },
      ), "update job title");
    },
    async claimJob({ workerId, allowedSnapshotDigest }: {
      workerId: string;
      allowedSnapshotDigest: string;
    }): Promise<ClaimedYoutubeExtractionJob | null> {
      const data = requireSuccess(await client.rpc("claim_youtube_extraction_job", {
        worker_id: workerId,
        allowed_snapshot_digest: allowedSnapshotDigest,
        lease_seconds: YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS,
      }), "claim job");
      const row = record(Array.isArray(data) ? data[0] : data);
      if (!row) return null;
      if (
        typeof row.job_id !== "string"
        || typeof row.youtube_video_id !== "string"
        || typeof row.lease_generation !== "number"
        || typeof row.policy_snapshot_digest !== "string"
        || !record(row.result_affecting_options)
      ) {
        throw new Error("claim job returned an invalid projection");
      }
      return {
        id: row.job_id,
        videoId: row.youtube_video_id,
        leaseGeneration: row.lease_generation,
        policySnapshotDigest: row.policy_snapshot_digest,
        resultAffectingOptions: row.result_affecting_options as Record<string, unknown>,
      };
    },
    async claimPermit({ workerId }: { workerId: string }) {
      const data = requireSuccess(await client.rpc("claim_youtube_extractor_permit", {
        worker_id: workerId,
        lease_seconds: YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS,
      }), "claim permit");
      const row = record(Array.isArray(data) ? data[0] : data);
      return row?.claimed === true && typeof row.permit_generation === "number"
        ? { permitGeneration: row.permit_generation }
        : null;
    },
    async requeueWithoutAttempt(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      minimumDelaySeconds: number;
      maximumDelaySeconds: number;
    }) {
      return booleanResult(await client.rpc(
        "requeue_youtube_extraction_job_without_attempt",
        {
          job_id: input.jobId,
          worker_id: input.workerId,
          lease_generation: input.leaseGeneration,
          min_delay_seconds: input.minimumDelaySeconds,
          max_delay_seconds: input.maximumDelaySeconds,
        },
      ), "requeue without attempt");
    },
    async startAttempt(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      permitGeneration: number;
    }) {
      return booleanResult(await client.rpc("start_youtube_extraction_attempt", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        permit_generation: input.permitGeneration,
      }), "start attempt");
    },
    async finalize(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      permitGeneration: number;
      finalizedDraft: unknown;
    }) {
      return booleanResult(await client.rpc("finalize_youtube_extraction_job", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        finalized_draft_json: {
          ...(record(input.finalizedDraft) ?? { draft: input.finalizedDraft }),
          worker_permit_generation: input.permitGeneration,
        },
      }), "finalize job");
    },
    async failOrRetry(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      permitGeneration: number;
      errorCode: YoutubeExtractionWorkerFailureCode;
    }) {
      return booleanResult(await client.rpc("fail_or_retry_youtube_extraction_job", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        permit_generation: input.permitGeneration,
        error_code: input.errorCode,
      }), "fail or retry job");
    },
    async releasePermit(input: { workerId: string; permitGeneration: number }) {
      return booleanResult(await client.rpc("release_youtube_extractor_permit", {
        worker_id: input.workerId,
        permit_generation: input.permitGeneration,
      }), "release permit");
    },
    async heartbeatJob(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      permitGeneration: number;
    }) {
      return booleanResult(await client.rpc("heartbeat_youtube_extraction_job", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        permit_generation: input.permitGeneration,
        lease_seconds: YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS,
      }), "heartbeat job");
    },
    async heartbeatPermit(input: YoutubeExtractionWorkerWriteFence) {
      return booleanResult(await client.rpc("heartbeat_youtube_extractor_permit", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        permit_generation: input.permitGeneration,
        lease_seconds: YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS,
      }), "heartbeat permit");
    },
    async resolveDraft(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      permitGeneration: number;
      videoId: string;
      runtimeResult: unknown;
    }) {
      return requireSuccess(await client.rpc("resolve_youtube_extraction_job_draft", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        permit_generation: input.permitGeneration,
        youtube_video_id: input.videoId,
        runtime_result: input.runtimeResult,
      }), "resolve draft");
    },
  };
}
