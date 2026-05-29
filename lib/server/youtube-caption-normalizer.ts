export type YoutubePublicTextSource = "description" | "comment" | "caption" | "transcript";

export interface YoutubeSourceSegment {
  source: YoutubePublicTextSource;
  lineIndex: number;
  text: string;
  startMs: number | null;
  durationMs: number | null;
  language: string | null;
  trackKind: string | null;
}

export function buildTextSegments({
  text,
  source,
  language = null,
  trackKind = null,
}: {
  text: string;
  source: YoutubePublicTextSource;
  language?: string | null;
  trackKind?: string | null;
}): YoutubeSourceSegment[] {
  return text
    .split(/\r?\n/u)
    .map((line, lineIndex) => ({
      source,
      lineIndex,
      text: line.replace(/\s+/gu, " ").trim(),
      startMs: null,
      durationMs: null,
      language,
      trackKind,
    }))
    .filter((segment) => segment.text.length > 0);
}

export function joinSegmentText(segments: YoutubeSourceSegment[]) {
  return segments
    .map((segment) => segment.text.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function summarizeSourceSegments(segments: YoutubeSourceSegment[]) {
  const first = segments[0];

  return {
    source: first?.source ?? "description",
    language: first?.language ?? null,
    track_kind: first?.trackKind ?? null,
    segment_count: segments.length,
  };
}

export function findSegmentForSourceLine(
  segments: YoutubeSourceSegment[],
  sourceLine: number,
) {
  return segments.find((segment) => segment.lineIndex === sourceLine) ?? null;
}
