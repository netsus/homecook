import type { ClaimedYoutubeExtractionJob } from
  "@/lib/server/youtube-async-extraction";

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
  return row ? row.applied === true || Number(row.affected_count ?? 0) > 0 : false;
}

export function createYoutubeExtractionWorkerRpcAdapter(client: RestrictedRpcClient) {
  return {
    async claimJob({ workerId, allowedSnapshotDigest }: {
      workerId: string;
      allowedSnapshotDigest: string;
    }): Promise<ClaimedYoutubeExtractionJob | null> {
      const data = requireSuccess(await client.rpc("claim_youtube_extraction_job", {
        worker_id: workerId,
        allowed_snapshot_digest: allowedSnapshotDigest,
        lease_seconds: 120,
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
        lease_seconds: 120,
      }), "claim permit");
      const row = record(Array.isArray(data) ? data[0] : data);
      return row && typeof row.permit_generation === "number"
        ? { permitGeneration: row.permit_generation }
        : null;
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
        permit_generation: input.permitGeneration,
        finalized_draft_json: input.finalizedDraft,
      }), "finalize job");
    },
    async failOrRetry(input: {
      jobId: string;
      workerId: string;
      leaseGeneration: number;
      errorCode: "RUNTIME_UNAVAILABLE" | "EXTRACTION_FAILED";
    }) {
      return booleanResult(await client.rpc("fail_or_retry_youtube_extraction_job", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
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
    }) {
      return booleanResult(await client.rpc("heartbeat_youtube_extraction_job", {
        job_id: input.jobId,
        worker_id: input.workerId,
        lease_generation: input.leaseGeneration,
        lease_seconds: 120,
      }), "heartbeat job");
    },
    async heartbeatPermit(input: { workerId: string; permitGeneration: number }) {
      return booleanResult(await client.rpc("heartbeat_youtube_extractor_permit", {
        worker_id: input.workerId,
        permit_generation: input.permitGeneration,
        lease_seconds: 120,
      }), "heartbeat permit");
    },
    async resolveDraft(input: {
      jobId: string;
      videoId: string;
      runtimeResult: unknown;
    }) {
      return requireSuccess(await client.rpc("resolve_youtube_extraction_job_draft", {
        job_id: input.jobId,
        youtube_video_id: input.videoId,
        runtime_result: input.runtimeResult,
      }), "resolve draft");
    },
  };
}
