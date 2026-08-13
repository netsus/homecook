export const YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY = "homecook.youtube-extraction-jobs";
export const YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT = "homecook:youtube-extraction-job-enqueued";
export const YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT = "homecook:youtube-extraction-session-registered";

export function trackYoutubeExtractionJob(jobId: string) {
  if (typeof window === "undefined") return;

  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY) ?? "[]",
    ) as unknown;
    const ids = Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string")
      : [];
    window.sessionStorage.setItem(
      YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY,
      JSON.stringify([...new Set([...ids, jobId])].slice(-20)),
    );
  } catch {
    // The event still enables same-page polling when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent(YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT));
}

export function notifyYoutubeExtractionSessionRegistered(extractionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(
    YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT,
    { detail: { extractionId } },
  ));
}
