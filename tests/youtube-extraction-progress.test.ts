import { describe, expect, it } from "vitest";

import {
  YOUTUBE_EXTRACTION_ETA_V1,
  canPromoteYoutubeExtractionEta,
  estimateYoutubeExtractionEta,
  projectYoutubeExtractionProgress,
  youtubeExtractionDurationBucket,
} from "@/lib/server/youtube-extraction-progress";
import { projectYoutubeExtractionJob } from "@/lib/server/youtube-async-extraction";

const promotedModel = {
  version: "youtube-extraction-eta-v1" as const,
  isolatedSuccessfulRuns: 20,
  successfulStageTelemetry: 50,
  holdoutCoverage: 0.8,
  bucketSampleCounts: {
    unknown: 10,
    short: 10,
    medium: 10,
    long: 10,
  },
  ranges: {
    short: {
      model_analysis: {
        totalSecondsLow: 120,
        totalSecondsHigh: 240,
        confidence: "low" as const,
      },
    },
  },
};

describe("YouTube truthful progress estimator", () => {
  it("uses the approved unknown/short/medium/long duration buckets", () => {
    expect(youtubeExtractionDurationBucket(null)).toBe("unknown");
    expect(youtubeExtractionDurationBucket(60)).toBe("short");
    expect(youtubeExtractionDurationBucket(61)).toBe("medium");
    expect(youtubeExtractionDurationBucket(300)).toBe("medium");
    expect(youtubeExtractionDurationBucket(301)).toBe("long");
    expect(youtubeExtractionDurationBucket(86_401)).toBe("unknown");
  });

  it("requires every promotion gate and keeps the production model hidden", () => {
    expect(canPromoteYoutubeExtractionEta(promotedModel)).toBe(true);
    expect(canPromoteYoutubeExtractionEta({
      ...promotedModel,
      holdoutCoverage: 0.799,
    })).toBe(false);
    expect(canPromoteYoutubeExtractionEta({
      ...promotedModel,
      bucketSampleCounts: { ...promotedModel.bucketSampleCounts, long: 9 },
    })).toBe(false);
    expect(canPromoteYoutubeExtractionEta(YOUTUBE_EXTRACTION_ETA_V1)).toBe(false);
  });

  it("subtracts elapsed time from a promoted range and never changes the stage floor", () => {
    expect(estimateYoutubeExtractionEta({
      stage: "model_analysis",
      stageStartedAt: "2026-08-27T00:00:00.000Z",
      videoDurationSeconds: 60,
      now: new Date("2026-08-27T00:01:00.000Z"),
      model: promotedModel,
    })).toEqual({
      remainingSecondsLow: 60,
      remainingSecondsHigh: 180,
      estimateConfidence: "low",
      delayed: false,
    });
  });

  it("hides numeric ETA after the range upper and when promotion or evidence is missing", () => {
    expect(estimateYoutubeExtractionEta({
      stage: "model_analysis",
      stageStartedAt: "2026-08-27T00:00:00.000Z",
      videoDurationSeconds: 60,
      now: new Date("2026-08-27T00:04:01.000Z"),
      model: promotedModel,
    })).toEqual({
      remainingSecondsLow: null,
      remainingSecondsHigh: null,
      estimateConfidence: null,
      delayed: true,
    });
    expect(estimateYoutubeExtractionEta({
      stage: "model_analysis",
      stageStartedAt: "2026-08-27T00:00:00.000Z",
      videoDurationSeconds: 60,
      now: new Date("2026-08-27T00:01:00.000Z"),
      model: YOUTUBE_EXTRACTION_ETA_V1,
    })).toEqual({
      remainingSecondsLow: null,
      remainingSecondsHigh: null,
      estimateConfidence: null,
      delayed: false,
    });
  });
});

describe("YouTube public progress projection", () => {
  const now = new Date("2026-08-27T00:01:00.000Z");

  it("derives the exact eight-key progress object from a DB snapshot", () => {
    const progress = projectYoutubeExtractionProgress({
      status: "processing",
      snapshot: {
        attempt: 1,
        stage: "model_analysis",
        stage_started_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:00:30.000Z",
        video_duration_seconds: 60,
      },
      now,
      etaModel: YOUTUBE_EXTRACTION_ETA_V1,
    });

    expect(progress).toEqual({
      attempt: 1,
      stage: "model_analysis",
      confirmed_percent: 65,
      updated_at: "2026-08-27T00:00:30.000Z",
      remaining_seconds_low: null,
      remaining_seconds_high: null,
      estimate_confidence: null,
      delayed: false,
    });
    expect(Object.keys(progress ?? {}).sort()).toEqual([
      "attempt",
      "confirmed_percent",
      "delayed",
      "estimate_confidence",
      "remaining_seconds_high",
      "remaining_seconds_low",
      "stage",
      "updated_at",
    ]);
  });

  it("returns null for terminal, legacy, invalid, and retry-backoff snapshots", () => {
    expect(projectYoutubeExtractionProgress({
      status: "succeeded",
      snapshot: {
        attempt: 1,
        stage: "finalizing",
        stage_started_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:00:30.000Z",
        video_duration_seconds: 60,
      },
      now,
    })).toBeNull();
    expect(projectYoutubeExtractionProgress({
      status: "processing",
      snapshot: null,
      now,
    })).toBeNull();
    expect(projectYoutubeExtractionProgress({
      status: "queued",
      snapshot: {
        attempt: 1,
        stage: "model_analysis",
        stage_started_at: "2026-08-27T00:00:00.000Z",
        updated_at: "2026-08-27T00:00:30.000Z",
        video_duration_seconds: 60,
      },
      now,
    })).toBeNull();
    expect(projectYoutubeExtractionProgress({
      status: "processing",
      snapshot: {
        attempt: 0,
        stage: "model_analysis",
        stage_started_at: "2026-08-27T00:00:30.000Z",
        updated_at: "2026-08-27T00:00:20.000Z",
        video_duration_seconds: 60,
      },
      now,
    })).toBeNull();
  });

  it("adds the always-present progress key without changing terminal semantics", () => {
    const projected = projectYoutubeExtractionJob({
      id: "11111111-1111-4111-8111-111111111111",
      status: "processing",
      youtube_video_id: "abc123DEF45",
      created_at: "2026-08-27T00:00:00.000Z",
      started_at: "2026-08-27T00:00:01.000Z",
      completed_at: null,
      error_code: null,
      progress: {
        attempt: 1,
        stage: "source_fetch",
        stage_started_at: "2026-08-27T00:00:01.000Z",
        updated_at: "2026-08-27T00:00:01.000Z",
        video_duration_seconds: null,
      },
    }, now);

    expect(Object.keys(projected).sort()).toEqual([
      "can_retry",
      "completed_at",
      "error",
      "job_id",
      "progress",
      "result",
      "started_at",
      "status",
      "submitted_at",
    ]);
    expect(projected.progress).toMatchObject({
      attempt: 1,
      stage: "source_fetch",
      confirmed_percent: 10,
    });
  });
});
