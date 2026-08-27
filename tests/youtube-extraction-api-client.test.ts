import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueYoutubeExtraction,
  fetchYoutubeExtractionJob,
  fetchYoutubeExtractionNotifications,
  fetchYoutubeExtractionSession,
  markYoutubeExtractionDelivered,
  markYoutubeExtractionSeen,
} from "@/lib/api/youtube-extraction-jobs";

const fetchMock = vi.fn<typeof fetch>();

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("YouTube async extraction API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("enqueues only the exact URL or retry request union", async () => {
    fetchMock.mockResolvedValue(response({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-14T01:00:00.000Z",
      },
      error: null,
    }, 202));

    await enqueueYoutubeExtraction({ youtube_url: "https://youtu.be/abcdefghijk" });
    await enqueueYoutubeExtraction({
      retry_job_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/recipes/youtube/extraction-jobs",
      expect.objectContaining({
        body: JSON.stringify({ youtube_url: "https://youtu.be/abcdefghijk" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/recipes/youtube/extraction-jobs",
      expect.objectContaining({
        body: JSON.stringify({
          retry_job_id: "22222222-2222-4222-8222-222222222222",
        }),
        method: "POST",
      }),
    );
  });

  it("uses the exact status, session, list, delivered, and seen contracts", async () => {
    fetchMock.mockResolvedValue(response({ success: true, data: {}, error: null }));

    await fetchYoutubeExtractionJob("job-id");
    await fetchYoutubeExtractionSession("extraction-id");
    await fetchYoutubeExtractionNotifications("unseen-completed", {
      cursor: "signed cursor",
      limit: 12,
    });
    await markYoutubeExtractionDelivered(["delivery-key"]);
    await markYoutubeExtractionSeen(["11111111-1111-4111-8111-111111111111"]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/recipes/youtube/extraction-jobs/job-id",
      "/api/v1/recipes/youtube/extractions/extraction-id",
      "/api/v1/users/me/youtube-extraction-jobs?view=unseen-completed&limit=12&cursor=signed+cursor",
      "/api/v1/users/me/youtube-extraction-jobs/delivered",
      "/api/v1/users/me/youtube-extraction-jobs/seen",
    ]);
    expect(fetchMock.mock.calls.slice(0, 3).map(([, init]) => init?.cache)).toEqual([
      "no-store",
      "no-store",
      "no-store",
    ]);
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ delivery_keys: ["delivery-key"] }),
      method: "POST",
    }));
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        job_ids: ["11111111-1111-4111-8111-111111111111"],
      }),
      method: "POST",
    }));
  });

  it("preserves the additive progress object from the status response", async () => {
    fetchMock.mockResolvedValue(response({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "processing",
        submitted_at: "2026-08-27T00:00:00.000Z",
        started_at: "2026-08-27T00:00:01.000Z",
        completed_at: null,
        result: null,
        error: null,
        can_retry: false,
        progress: {
          attempt: 1,
          stage: "model_analysis",
          confirmed_percent: 65,
          updated_at: "2026-08-27T00:00:30.000Z",
          remaining_seconds_low: null,
          remaining_seconds_high: null,
          estimate_confidence: null,
          delayed: false,
        },
      },
      error: null,
    }));

    const result = await fetchYoutubeExtractionJob(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.data?.progress).toMatchObject({
      stage: "model_analysis",
      confirmed_percent: 65,
    });
  });

  it("preserves official API errors and normalizes offline failures", async () => {
    fetchMock
      .mockResolvedValueOnce(response({
        success: false,
        data: null,
        error: {
          code: "POLICY_CHANGED",
          message: "추출 설정이 바뀌었어요. 다시 시도해 주세요.",
          fields: [],
        },
      }, 409))
      .mockRejectedValueOnce(new TypeError("offline"));

    const stale = await enqueueYoutubeExtraction({
      youtube_url: "https://youtu.be/abcdefghijk",
    });
    const offline = await fetchYoutubeExtractionNotifications("archive");

    expect(stale.error?.code).toBe("POLICY_CHANGED");
    expect(offline).toEqual({
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
        fields: [],
      },
    });
  });
});
