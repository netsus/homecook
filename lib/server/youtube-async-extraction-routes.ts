import {
  YOUTUBE_ASYNC_POLICY,
  buildYoutubeExtractionFingerprint,
  decodeYoutubeExtractionCursor,
  encodeYoutubeExtractionCursor,
  isYoutubeAsyncExtractionEnabled,
  parseYoutubeExtractionJobRequest,
  projectYoutubeExtractionJob,
  type YoutubeExtractionJobProjectionRow,
} from "@/lib/server/youtube-async-extraction";
import {
  createRouteHandlerClient,
  createYoutubeAsyncExtractionInternalClient,
} from "@/lib/supabase/server";

interface RpcResult {
  data: unknown;
  error: unknown;
}

interface InternalClient { rpc: Rpc }

type Rpc = (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

interface AuthenticatedRequest {
  userId: string;
  rpc: Rpc;
}

interface SessionRow {
  id: string;
  status: "draft" | "consumed" | "expired";
  draft_json: unknown;
  recipe_id: string | null;
  expires_at: string;
}

interface ListJobRow extends YoutubeExtractionJobProjectionRow {
  youtube_video_id: string;
  video_title_snapshot: string | null;
  completion_delivery_key: string;
  completion_delivered_at: string | null;
  completion_seen_at: string | null;
}

interface HandlerDependencies {
  authenticate(): Promise<AuthenticatedRequest | null>;
  readJob(userId: string, jobId: string): Promise<(YoutubeExtractionJobProjectionRow & {
    youtube_video_id?: string;
  }) | null>;
  readSession(userId: string, extractionId: string): Promise<SessionRow | null>;
  listJobs(
    userId: string,
    view: "unseen-completed" | "archive",
    cursor: { completedAt: string; jobId: string } | null,
    limit: number,
  ): Promise<ListJobRow[]>;
  markDelivered(userId: string, deliveryKeys: string[], rpc: Rpc): Promise<number>;
  markSeen(userId: string, jobIds: string[], rpc: Rpc): Promise<number>;
  fingerprintKeys(): { current: string; previous: string | null };
  cursorSecret(): string;
  asyncEnabled(): boolean;
  now(): Date;
  sleep?(milliseconds: number): Promise<void>;
  syncWaitStartBudgetMs?: number;
  syncWaitProcessingBudgetMs?: number;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function success(data: unknown, status = 200) {
  return json({ success: true, data, error: null }, status);
}

function failure(
  code: string,
  message: string,
  status: number,
  fields: Array<{ field: string; reason: string }> = [],
) {
  return json({
    success: false,
    data: null,
    error: { code, message, fields },
  }, status);
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function errorText(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message ?? record.details ?? record.hint ?? "");
  }
  return String(error ?? "");
}

function enqueueRpcFailure(error: unknown) {
  const text = errorText(error);
  const known = [
    "POLICY_CHANGED",
    "RATE_LIMITED",
    "QUEUE_UNAVAILABLE",
  ] as const;
  const code = known.find((candidate) => text.includes(candidate)) ?? "QUEUE_UNAVAILABLE";
  if (code === "POLICY_CHANGED") {
    return failure(code, "추출 설정이 바뀌었어요. 다시 시도해 주세요.", 409);
  }
  if (code === "RATE_LIMITED") {
    return failure(code, "추출 요청 한도를 확인해 주세요.", 429);
  }
  return failure(code, "추출 작업을 접수할 수 없어요. 잠시 후 다시 시도해 주세요.", 503);
}

function validateStringArray(
  body: unknown,
  field: "delivery_keys" | "job_ids",
  validate: (value: string) => boolean,
) {
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !Array.isArray((body as Record<string, unknown>)[field])
  ) {
    return null;
  }
  const raw = (body as Record<string, unknown>)[field] as unknown[];
  if (raw.length < 1 || raw.length > 50 || raw.some((value) =>
    typeof value !== "string" || !validate(value))) {
    return null;
  }
  const unique = [...new Set(raw as string[])];
  return unique.length === raw.length ? unique : null;
}

function requireAuth(auth: AuthenticatedRequest | null) {
  return auth ?? failure("UNAUTHORIZED", "로그인이 필요해요.", 401);
}

function isResponse(value: AuthenticatedRequest | Response): value is Response {
  return value instanceof Response;
}

export function createYoutubeAsyncExtractionHandlers(deps: HandlerDependencies) {
  return {
    async enqueue(request: Request, submissionMode: "background_notify" | "sync_wait" = "background_notify") {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) {
        return auth;
      }
      const parsed = parseYoutubeExtractionJobRequest(await readJson(request));
      if ("code" in parsed) {
        return parsed.code === "INVALID_URL"
          ? failure("INVALID_URL", "유효한 유튜브 URL을 입력해 주세요.", 422, [
              { field: "youtube_url", reason: "invalid_url" },
            ])
          : failure("VALIDATION_ERROR", "요청 형식을 확인해 주세요.", 422, [
              { field: parsed.field, reason: "invalid_union" },
            ]);
      }
      if (!deps.asyncEnabled()) {
        return failure("FEATURE_DISABLED", "유튜브 가져오기는 준비 중이에요.", 404);
      }
      let videoId = parsed.kind === "url" ? parsed.videoId : null;
      if (parsed.kind === "retry") {
        const source = await deps.readJob(auth.userId, parsed.jobId);
        if (!source) {
          return failure("JOB_NOT_FOUND", "추출 작업을 찾을 수 없어요.", 404);
        }
        const projection = projectYoutubeExtractionJob(source, deps.now());
        if (!projection.can_retry || typeof source.youtube_video_id !== "string") {
          return failure("JOB_NOT_RETRYABLE", "다시 시도할 수 없는 추출 작업이에요.", 409);
        }
        videoId = source.youtube_video_id;
      }
      if (!videoId) {
        return failure("JOB_NOT_FOUND", "추출 작업을 찾을 수 없어요.", 404);
      }
      let keys: ReturnType<HandlerDependencies["fingerprintKeys"]>;
      try {
        keys = deps.fingerprintKeys();
      } catch {
        return failure("QUEUE_UNAVAILABLE", "추출 작업을 접수할 수 없어요. 잠시 후 다시 시도해 주세요.", 503);
      }
      const current = buildYoutubeExtractionFingerprint({
        secret: keys.current,
        userId: auth.userId,
        videoId,
        policy: YOUTUBE_ASYNC_POLICY,
      });
      const previous = keys.previous
        ? buildYoutubeExtractionFingerprint({
            secret: keys.previous,
            userId: auth.userId,
            videoId,
            policy: YOUTUBE_ASYNC_POLICY,
          })
        : null;
      const rpcResult = await auth.rpc("enqueue_youtube_extraction_job", {
        video_id: videoId,
        expected_policy_version: YOUTUBE_ASYNC_POLICY.policyVersion,
        expected_policy_snapshot_digest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
        current_key_version: YOUTUBE_ASYNC_POLICY.fingerprintKeyVersion,
        current_digest: current.digest,
        previous_key_version: previous
          ? YOUTUBE_ASYNC_POLICY.previousFingerprintKeyVersion
          : null,
        previous_digest: previous?.digest ?? null,
        submission_mode: submissionMode,
      });
      if (rpcResult.error) {
        return enqueueRpcFailure(rpcResult.error);
      }
      const result = rpcResult.data as Record<string, unknown> | null;
      if (!result) {
        return failure("QUEUE_UNAVAILABLE", "추출 작업을 접수할 수 없어요. 잠시 후 다시 시도해 주세요.", 503);
      }
      return success({
        job_id: result.job_id,
        status: result.status,
        deduplicated: result.deduplicated,
        submitted_at: result.submitted_at,
      }, 202);
    },

    async syncWait(request: Request) {
      const enqueueResponse = await this.enqueue(request.clone(), "sync_wait");
      const enqueueBody = await enqueueResponse.clone().json() as {
        success: boolean;
        data: { job_id?: unknown } | null;
      };
      if (!enqueueBody.success || typeof enqueueBody.data?.job_id !== "string") {
        return enqueueResponse;
      }
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const jobId = enqueueBody.data.job_id;
      const sleep = deps.sleep ?? ((milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
      const startDeadline = Date.now() + (deps.syncWaitStartBudgetMs ?? 30_000);
      let observedStarted = false;
      const processingDeadline = () => Date.now() + (deps.syncWaitProcessingBudgetMs ?? 20 * 60 * 1000 + 30_000);
      let terminalDeadline = Number.POSITIVE_INFINITY;
      while (Date.now() <= (observedStarted ? terminalDeadline : startDeadline)) {
        const row = await deps.readJob(auth.userId, jobId);
        if (!row) {
          return failure("QUEUE_UNAVAILABLE", "추출 작업을 확인하지 못했어요.", 503);
        }
        if (!observedStarted && row.started_at !== null) {
          observedStarted = true;
          terminalDeadline = processingDeadline();
        }
        const projection = projectYoutubeExtractionJob(row, deps.now());
        if (projection.status === "succeeded" && projection.result) {
          const session = await deps.readSession(auth.userId, projection.result.extraction_id);
          if (session?.status === "draft") {
            return success(session.draft_json);
          }
        }
        if (projection.status === "failed" || projection.status === "expired") {
          const code = projection.error?.code;
          if (code === "NOT_RECIPE_VIDEO") {
            return failure("NOT_RECIPE_VIDEO", "이 영상은 요리 레시피가 아닌 것 같아요.", 422);
          }
          if (code === "QUOTA_EXCEEDED") {
            return failure("QUOTA_EXCEEDED", "오늘 추출 한도를 모두 사용했어요.", 429);
          }
          return failure("PROVIDER_ERROR", "레시피를 추출하지 못했어요.", 502);
        }
        await sleep(250);
      }
      return observedStarted
        ? failure("EXTRACTION_TIMEOUT", "추출 시간이 초과됐어요. 작업 결과는 나중에 확인할 수 있어요.", 504)
        : failure("QUEUE_BUSY", "추출 작업이 밀려 있어요. 잠시 후 다시 시도해 주세요.", 503);
    },

    async status(_request: Request, jobId: string) {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const row = await deps.readJob(auth.userId, jobId);
      return row
        ? success(projectYoutubeExtractionJob(row, deps.now()))
        : failure("JOB_NOT_FOUND", "추출 작업을 찾을 수 없어요.", 404);
    },

    async session(_request: Request, extractionId: string) {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const row = await deps.readSession(auth.userId, extractionId);
      if (!row) {
        return failure("EXTRACTION_NOT_FOUND", "추출 결과를 찾을 수 없어요.", 404);
      }
      if (row.status === "consumed" && row.recipe_id) {
        return success({
          status: "consumed",
          draft: null,
          recipe_id: row.recipe_id,
          recipe_path: `/recipes/${row.recipe_id}`,
        });
      }
      if (row.status !== "draft" || Date.parse(row.expires_at) <= deps.now().getTime()) {
        return failure("EXTRACTION_EXPIRED", "결과가 만료됐어요. 다시 추출해 주세요.", 410);
      }
      return success({
        status: "draft",
        draft: row.draft_json,
        recipe_id: null,
        recipe_path: null,
      });
    },

    async list(request: Request) {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const url = new URL(request.url);
      const view = url.searchParams.get("view");
      const limitText = url.searchParams.get("limit");
      const limit = limitText === null ? 20 : Number(limitText);
      if (
        (view !== "unseen-completed" && view !== "archive")
        || !Number.isInteger(limit)
        || limit < 1
        || limit > 50
      ) {
        return failure("VALIDATION_ERROR", "목록 조건을 확인해 주세요.", 422);
      }
      let cursor: { completedAt: string; jobId: string } | null = null;
      const encodedCursor = url.searchParams.get("cursor");
      if (encodedCursor) {
        try {
          cursor = decodeYoutubeExtractionCursor({
            cursor: encodedCursor,
            secret: deps.cursorSecret(),
            userId: auth.userId,
            view,
          });
        } catch {
          return failure("INVALID_CURSOR", "목록 커서를 확인해 주세요.", 422);
        }
      }
      let rows = await deps.listJobs(auth.userId, view, cursor, limit + 1);
      if (cursor) {
        rows = rows.filter((row) =>
          row.completed_at !== null
          && (row.completed_at < cursor.completedAt
            || (row.completed_at === cursor.completedAt && row.id < cursor.jobId)));
      }
      const page = rows.slice(0, limit);
      const items = page.map((row) => {
        const projection = projectYoutubeExtractionJob(row, deps.now());
        return {
          job_id: projection.job_id,
          status: projection.status,
          submitted_at: projection.submitted_at,
          completed_at: projection.completed_at,
          video_title_snapshot: row.video_title_snapshot,
          thumbnail_url: `https://i.ytimg.com/vi/${row.youtube_video_id}/hqdefault.jpg`,
          delivery_key: row.completion_delivery_key,
          delivered_at: row.completion_delivered_at,
          seen_at: row.completion_seen_at,
          result: projection.result,
          error: projection.error,
          can_retry: projection.can_retry,
        };
      });
      const tail = page.at(-1);
      const nextCursor = rows.length > limit && tail?.completed_at
        ? encodeYoutubeExtractionCursor({
            secret: deps.cursorSecret(),
            userId: auth.userId,
            view,
            completedAt: tail.completed_at,
            jobId: tail.id,
          })
        : null;
      return success({ items, next_cursor: nextCursor });
    },

    async delivered(request: Request) {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const values = validateStringArray(
        await readJson(request),
        "delivery_keys",
        (value) => value.trim().length > 0 && value.length <= 200,
      );
      if (!values) return failure("VALIDATION_ERROR", "전달 항목을 확인해 주세요.", 422);
      const count = await deps.markDelivered(auth.userId, values, auth.rpc);
      return success({ delivered_count: count });
    },

    async seen(request: Request) {
      const auth = requireAuth(await deps.authenticate());
      if (isResponse(auth)) return auth;
      const values = validateStringArray(
        await readJson(request),
        "job_ids",
        (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value),
      );
      if (!values) return failure("VALIDATION_ERROR", "확인 항목을 확인해 주세요.", 422);
      const count = await deps.markSeen(auth.userId, values, auth.rpc);
      return success({ seen_count: count });
    },
  };
}

function requireSecret(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} is unavailable`);
  }
  return value;
}

function internalClient() {
  const client = createYoutubeAsyncExtractionInternalClient();
  if (!client) throw new Error("youtube async extraction store unavailable");
  return client as unknown as InternalClient;
}

export const youtubeAsyncExtractionHandlers = createYoutubeAsyncExtractionHandlers({
  async authenticate() {
    const client = await createRouteHandlerClient();
    const result = await client.auth.getUser();
    return result.data.user
      ? { userId: result.data.user.id, rpc: client.rpc.bind(client) as Rpc }
      : null;
  },
  async readJob(userId, jobId) {
    try {
      const result = await internalClient().rpc("read_youtube_extraction_job_projection", {
        user_id: userId,
        job_id: jobId,
      });
      return result.error ? null : result.data as (YoutubeExtractionJobProjectionRow & {
        youtube_video_id?: string;
      }) | null;
    } catch {
      return null;
    }
  },
  async readSession(userId, extractionId) {
    try {
      const result = await internalClient().rpc("read_youtube_extraction_session_projection", {
        user_id: userId,
        extraction_id: extractionId,
      });
      return result.error ? null : result.data as SessionRow | null;
    } catch {
      return null;
    }
  },
  async listJobs(userId, view, cursor, limit) {
    try {
      const result = await internalClient().rpc("list_youtube_extraction_job_projections", {
        user_id: userId,
        list_view: view,
        retention_floor: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        cursor_completed_at: cursor?.completedAt ?? null,
        cursor_job_id: cursor?.jobId ?? null,
        row_limit: limit,
      });
      return result.error || !Array.isArray(result.data)
        ? []
        : result.data as ListJobRow[];
    } catch {
      return [];
    }
  },
  async markDelivered(userId, deliveryKeys, rpc) {
    const result = await rpc("mark_youtube_extraction_jobs_delivered", {
      user_id: userId,
      delivery_keys: deliveryKeys,
    });
    if (result.error) return 0;
    return Number((result.data as Record<string, unknown> | null)?.delivered_count ?? result.data ?? 0);
  },
  async markSeen(userId, jobIds, rpc) {
    const result = await rpc("mark_youtube_extraction_jobs_seen", {
      user_id: userId,
      job_ids: jobIds,
    });
    if (result.error) return 0;
    return Number((result.data as Record<string, unknown> | null)?.seen_count ?? result.data ?? 0);
  },
  fingerprintKeys() {
    return {
      current: requireSecret("HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V1"),
      previous: process.env.HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_PREVIOUS?.trim()
        || null,
    };
  },
  cursorSecret() {
    return requireSecret("HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1");
  },
  asyncEnabled: isYoutubeAsyncExtractionEnabled,
  now: () => new Date(),
});
