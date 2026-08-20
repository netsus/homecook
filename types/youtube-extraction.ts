import type { YoutubeRecipeExtractData } from "@/types/recipe";

export type YoutubeExtractionJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired";

export type YoutubeExtractionFailureCode =
  | "NOT_RECIPE_VIDEO"
  | "QUOTA_EXCEEDED"
  | "RUNTIME_UNAVAILABLE"
  | "ATTEMPTS_EXHAUSTED"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_EXPIRED";

export type YoutubeExtractionEnqueueBody =
  | { youtube_url: string }
  | { retry_job_id: string };

export interface YoutubeExtractionEnqueueData {
  job_id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  deduplicated: boolean;
  submitted_at: string;
}

export interface YoutubeExtractionFailure {
  code: YoutubeExtractionFailureCode;
  message: string;
  retryable: boolean;
}

export interface YoutubeExtractionResult {
  extraction_id: string;
  review_path: string | null;
  recipe_id: string | null;
  recipe_path: string | null;
}

export interface YoutubeExtractionJobData {
  job_id: string;
  status: YoutubeExtractionJobStatus;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: YoutubeExtractionResult | null;
  error: YoutubeExtractionFailure | null;
  can_retry: boolean;
}

export interface YoutubeExtractionSessionData {
  status: "draft" | "consumed";
  draft: YoutubeRecipeExtractData | null;
  recipe_id: string | null;
  recipe_path: string | null;
}

export interface YoutubeExtractionNotificationItem {
  job_id: string;
  status: YoutubeExtractionJobStatus;
  submitted_at: string;
  completed_at: string | null;
  video_title_snapshot: string | null;
  thumbnail_url: string;
  delivery_key: string;
  delivered_at: string | null;
  seen_at: string | null;
  result: YoutubeExtractionResult | null;
  error: YoutubeExtractionFailure | null;
  can_retry: boolean;
}

export type YoutubeExtractionNotificationView = "unseen-completed" | "archive";

export interface YoutubeExtractionNotificationListData {
  items: YoutubeExtractionNotificationItem[];
  next_cursor: string | null;
}

export interface YoutubeExtractionDeliveredData {
  delivered_count: number;
}

export interface YoutubeExtractionSeenData {
  seen_count: number;
}
