import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type {
  YoutubeExtractionDeliveredData,
  YoutubeExtractionEnqueueBody,
  YoutubeExtractionEnqueueData,
  YoutubeExtractionJobData,
  YoutubeExtractionNotificationListData,
  YoutubeExtractionNotificationView,
  YoutubeExtractionSeenData,
  YoutubeExtractionSessionData,
} from "@/types/youtube-extraction";

const NETWORK_ERROR: ApiResponse<never> = {
  success: false,
  data: null,
  error: {
    code: "NETWORK_ERROR",
    message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
    fields: [],
  },
};

const INVALID_RESPONSE: ApiResponse<never> = {
  success: false,
  data: null,
  error: {
    code: "INVALID_RESPONSE",
    message: "서버 응답을 해석하지 못했어요.",
    fields: [],
  },
};

export function classifyYoutubeExtractionPollError(code: string | undefined) {
  if (code === "UNAUTHORIZED" || code === "ACCOUNT_SESSION_STALE") return "auth";
  if (["JOB_NOT_FOUND", "NOT_FOUND", "FORBIDDEN", "FEATURE_DISABLED", "VALIDATION_ERROR"].includes(code ?? "")) {
    return "terminal";
  }
  return "transient";
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(path, withE2EAuthOverrideHeaders(init));
    let payload: ApiResponse<T>;
    try {
      payload = await response.json() as ApiResponse<T>;
    } catch {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return {
          success: false,
          data: null,
          error: {
            code: response.status === 401 ? "UNAUTHORIZED" : response.status === 403 ? "FORBIDDEN" : "NOT_FOUND",
            message: response.status === 401 ? "다시 로그인해 주세요." : "작업을 확인할 수 없어요.",
            fields: [],
          },
        };
      }
      return INVALID_RESPONSE;
    }
    if (!response.ok || !payload.success) {
      return payload.error
        ? {
            success: false,
            data: null,
            error: {
              ...payload.error,
              code: response.status === 401 ? "UNAUTHORIZED"
                : response.status === 403 ? "FORBIDDEN" : payload.error.code,
            },
          }
        : INVALID_RESPONSE;
    }
    return { success: true, data: payload.data, error: null };
  } catch {
    return NETWORK_ERROR;
  }
}

function jsonPost(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  };
}

export function enqueueYoutubeExtraction(body: YoutubeExtractionEnqueueBody) {
  return request<YoutubeExtractionEnqueueData>(
    "/api/v1/recipes/youtube/extraction-jobs",
    jsonPost(body),
  );
}

export async function fetchYoutubeExtractionJob(jobId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await request<YoutubeExtractionJobData>(
      `/api/v1/recipes/youtube/extraction-jobs/${encodeURIComponent(jobId)}`,
      { cache: "no-store", signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchYoutubeExtractionSession(extractionId: string) {
  return request<YoutubeExtractionSessionData>(
    `/api/v1/recipes/youtube/extractions/${encodeURIComponent(extractionId)}`,
    { cache: "no-store" },
  );
}

export function fetchYoutubeExtractionNotifications(
  view: YoutubeExtractionNotificationView,
  options: { cursor?: string; limit?: number } = {},
) {
  const params = new URLSearchParams({ view });
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  return request<YoutubeExtractionNotificationListData>(
    `/api/v1/users/me/youtube-extraction-jobs?${params.toString()}`,
    { cache: "no-store" },
  );
}

export function markYoutubeExtractionDelivered(deliveryKeys: string[]) {
  return request<YoutubeExtractionDeliveredData>(
    "/api/v1/users/me/youtube-extraction-jobs/delivered",
    jsonPost({ delivery_keys: deliveryKeys }),
  );
}

export function markYoutubeExtractionSeen(jobIds: string[]) {
  return request<YoutubeExtractionSeenData>(
    "/api/v1/users/me/youtube-extraction-jobs/seen",
    jsonPost({ job_ids: jobIds }),
  );
}
