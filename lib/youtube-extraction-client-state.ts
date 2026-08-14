export const YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY = "homecook.youtube-extraction-jobs";
export const YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY =
  "homecook.youtube-extraction-registered-acks";
export const YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT = "homecook:youtube-extraction-job-enqueued";
export const YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT = "homecook:youtube-extraction-session-registered";

function readStoredIds(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...new Set(ids)].slice(-20)));
  } catch {
    // Same-page reconciliation still runs from the dispatched event.
  }
}

export function trackYoutubeExtractionJob(jobId: string) {
  if (typeof window === "undefined") return;

  try {
    writeStoredIds(
      YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY,
      [...readStoredIds(YOUTUBE_EXTRACTION_JOBS_STORAGE_KEY), jobId],
    );
  } catch {
    // The event still enables same-page polling when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent(YOUTUBE_EXTRACTION_JOB_ENQUEUED_EVENT));
}

export function notifyYoutubeExtractionSessionRegistered(extractionId: string) {
  if (typeof window === "undefined") return;
  writeStoredIds(
    YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY,
    [...readStoredIds(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY), extractionId],
  );
  window.dispatchEvent(new CustomEvent(
    YOUTUBE_EXTRACTION_SESSION_REGISTERED_EVENT,
    { detail: { extractionId } },
  ));
}

export function readPendingYoutubeExtractionRegistrationAcks() {
  return readStoredIds(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY);
}

export function forgetYoutubeExtractionRegistrationAck(extractionId: string) {
  writeStoredIds(
    YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY,
    readStoredIds(YOUTUBE_EXTRACTION_REGISTERED_ACKS_STORAGE_KEY)
      .filter((id) => id !== extractionId),
  );
}
