import type {
  YoutubeExtractionEstimateConfidence,
  YoutubeExtractionJobStatus,
  YoutubeExtractionProgress,
  YoutubeExtractionProgressStage,
} from "@/types/youtube-extraction";

export type YoutubeExtractionDurationBucket =
  | "unknown"
  | "short"
  | "medium"
  | "long";

export interface YoutubeExtractionProgressSnapshot {
  attempt: number;
  stage: YoutubeExtractionProgressStage;
  stage_started_at: string;
  updated_at: string;
  video_duration_seconds: number | null;
}

interface YoutubeExtractionEtaRange {
  totalSecondsLow: number;
  totalSecondsHigh: number;
  confidence: YoutubeExtractionEstimateConfidence;
}

export interface YoutubeExtractionEtaModel {
  version: "youtube-extraction-eta-v1";
  isolatedSuccessfulRuns: number;
  successfulStageTelemetry: number;
  holdoutCoverage: number;
  bucketSampleCounts: Record<YoutubeExtractionDurationBucket, number>;
  ranges: Partial<Record<
    YoutubeExtractionDurationBucket,
    Partial<Record<YoutubeExtractionProgressStage, YoutubeExtractionEtaRange>>
  >>;
}

const EMPTY_ETA = Object.freeze({
  remainingSecondsLow: null,
  remainingSecondsHigh: null,
  estimateConfidence: null,
  delayed: false,
});

const STAGE_FLOORS: Readonly<Record<
  YoutubeExtractionProgressStage,
  YoutubeExtractionProgress["confirmed_percent"]
>> = Object.freeze({
  queued: 0,
  source_fetch: 10,
  video_download: 25,
  frame_extraction: 45,
  model_analysis: 65,
  finalizing: 90,
});

const STAGES = new Set<YoutubeExtractionProgressStage>(
  Object.keys(STAGE_FLOORS) as YoutubeExtractionProgressStage[],
);
const BUCKETS: YoutubeExtractionDurationBucket[] = [
  "unknown",
  "short",
  "medium",
  "long",
];

export const YOUTUBE_EXTRACTION_ETA_V1: YoutubeExtractionEtaModel = Object.freeze({
  version: "youtube-extraction-eta-v1",
  isolatedSuccessfulRuns: 0,
  successfulStageTelemetry: 0,
  holdoutCoverage: 0,
  bucketSampleCounts: Object.freeze({
    unknown: 0,
    short: 0,
    medium: 0,
    long: 0,
  }),
  ranges: Object.freeze({}),
});

export function youtubeExtractionDurationBucket(
  videoDurationSeconds: number | null,
): YoutubeExtractionDurationBucket {
  if (
    !Number.isInteger(videoDurationSeconds)
    || videoDurationSeconds === null
    || videoDurationSeconds < 1
    || videoDurationSeconds > 86_400
  ) return "unknown";
  if (videoDurationSeconds <= 60) return "short";
  if (videoDurationSeconds <= 300) return "medium";
  return "long";
}

export function canPromoteYoutubeExtractionEta(model: YoutubeExtractionEtaModel) {
  return model.version === "youtube-extraction-eta-v1"
    && Number.isInteger(model.isolatedSuccessfulRuns)
    && model.isolatedSuccessfulRuns >= 20
    && Number.isInteger(model.successfulStageTelemetry)
    && model.successfulStageTelemetry >= 50
    && Number.isFinite(model.holdoutCoverage)
    && model.holdoutCoverage >= 0.8
    && model.holdoutCoverage <= 1
    && BUCKETS.every((bucket) =>
      Number.isInteger(model.bucketSampleCounts[bucket])
      && model.bucketSampleCounts[bucket] >= 10);
}

export function estimateYoutubeExtractionEta({
  stage,
  stageStartedAt,
  videoDurationSeconds,
  now,
  model,
}: {
  stage: YoutubeExtractionProgressStage;
  stageStartedAt: string;
  videoDurationSeconds: number | null;
  now: Date;
  model: YoutubeExtractionEtaModel;
}) {
  if (!canPromoteYoutubeExtractionEta(model)) return { ...EMPTY_ETA };
  const range = model.ranges[youtubeExtractionDurationBucket(videoDurationSeconds)]?.[stage];
  const startedAt = Date.parse(stageStartedAt);
  if (
    !range
    || !Number.isInteger(range.totalSecondsLow)
    || !Number.isInteger(range.totalSecondsHigh)
    || range.totalSecondsLow < 0
    || range.totalSecondsLow > range.totalSecondsHigh
    || (range.confidence !== "low" && range.confidence !== "medium")
    || !Number.isFinite(startedAt)
    || !Number.isFinite(now.getTime())
    || now.getTime() < startedAt
  ) return { ...EMPTY_ETA };

  const elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1_000);
  if (elapsedSeconds > range.totalSecondsHigh) {
    return { ...EMPTY_ETA, delayed: true };
  }
  return {
    remainingSecondsLow: Math.max(0, range.totalSecondsLow - elapsedSeconds),
    remainingSecondsHigh: Math.max(0, range.totalSecondsHigh - elapsedSeconds),
    estimateConfidence: range.confidence,
    delayed: false,
  };
}

function validSnapshot(value: unknown): value is YoutubeExtractionProgressSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const stageStartedAt = typeof snapshot.stage_started_at === "string"
    ? Date.parse(snapshot.stage_started_at)
    : Number.NaN;
  const updatedAt = typeof snapshot.updated_at === "string"
    ? Date.parse(snapshot.updated_at)
    : Number.NaN;
  return Number.isInteger(snapshot.attempt)
    && Number(snapshot.attempt) >= 0
    && typeof snapshot.stage === "string"
    && STAGES.has(snapshot.stage as YoutubeExtractionProgressStage)
    && (snapshot.stage === "queued" ? snapshot.attempt === 0 : Number(snapshot.attempt) >= 1)
    && Number.isFinite(stageStartedAt)
    && Number.isFinite(updatedAt)
    && updatedAt >= stageStartedAt
    && (
      snapshot.video_duration_seconds === null
      || (Number.isInteger(snapshot.video_duration_seconds)
        && Number(snapshot.video_duration_seconds) >= 1
        && Number(snapshot.video_duration_seconds) <= 86_400)
    );
}

export function projectYoutubeExtractionProgress({
  status,
  snapshot,
  now,
  etaModel = YOUTUBE_EXTRACTION_ETA_V1,
}: {
  status: YoutubeExtractionJobStatus;
  snapshot: unknown;
  now: Date;
  etaModel?: YoutubeExtractionEtaModel;
}): YoutubeExtractionProgress | null {
  if ((status !== "queued" && status !== "processing") || !validSnapshot(snapshot)) {
    return null;
  }
  if (status === "queued" && (snapshot.attempt !== 0 || snapshot.stage !== "queued")) {
    return null;
  }
  const eta = estimateYoutubeExtractionEta({
    stage: snapshot.stage,
    stageStartedAt: snapshot.stage_started_at,
    videoDurationSeconds: snapshot.video_duration_seconds,
    now,
    model: etaModel,
  });
  return {
    attempt: snapshot.attempt,
    stage: snapshot.stage,
    confirmed_percent: STAGE_FLOORS[snapshot.stage],
    updated_at: snapshot.updated_at,
    remaining_seconds_low: eta.remainingSecondsLow,
    remaining_seconds_high: eta.remainingSecondsHigh,
    estimate_confidence: eta.estimateConfidence,
    delayed: eta.delayed,
  };
}
