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

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(path, withE2EAuthOverrideHeaders(init));
    let payload: ApiResponse<T>;
    try {
      payload = await response.json() as ApiResponse<T>;
    } catch {
      return INVALID_RESPONSE;
    }
    if (!response.ok || !payload.success) {
      return payload.error
        ? { success: false, data: null, error: payload.error }
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

export function fetchYoutubeExtractionJob(jobId: string) {
  return request<YoutubeExtractionJobData>(
    `/api/v1/recipes/youtube/extraction-jobs/${encodeURIComponent(jobId)}`,
    { cache: "no-store" },
  );
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
