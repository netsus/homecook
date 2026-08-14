import workerTiming from
  "@/lib/server/youtube-extraction-worker-timing.json";

export const YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS =
  workerTiming.lease_seconds;
export const YOUTUBE_EXTRACTION_WORKER_HEARTBEAT_INTERVAL_MS =
  workerTiming.heartbeat_interval_seconds * 1000;
