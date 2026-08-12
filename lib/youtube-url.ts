const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/u;

export interface CanonicalYoutubeUrl {
  videoId: string;
  youtubeUrl: string;
}

export function buildCanonicalYoutubeUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function normalizeYoutubeUrl(value: unknown): CanonicalYoutubeUrl | null {
  const rawUrl = typeof value === "string" ? value.trim() : "";
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./u, "").toLowerCase();
    let videoId: string | null = null;
    if (
      host === "youtube.com"
      || host === "m.youtube.com"
      || host === "music.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else if (
        url.pathname.startsWith("/shorts/")
        || url.pathname.startsWith("/embed/")
      ) {
        videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
      }
    } else if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
      ? { videoId, youtubeUrl: buildCanonicalYoutubeUrl(videoId) }
      : null;
  } catch {
    return null;
  }
}
