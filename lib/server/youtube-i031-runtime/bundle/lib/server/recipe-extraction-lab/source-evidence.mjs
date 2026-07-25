const PROMOTIONAL_LINE_RE =
  /(event|이벤트|구매|구매자|인증|댓글|선물|쿠폰|할인|스토어|배송|출고|추첨|당첨|상품권|구글\s*폼|구글폼|참여|혜택|기간\s*:|주방용품|bgm|music|음악|문의|email|인스타|instagram|https?:\/\/)/i;
const TIMELINE_LINE_RE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s*[~-]\s*((?:\d{1,2}:)?\d{1,2}:\d{2}))?\s+(.+?)\s*$/;

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function parseTimestampMs(value) {
  const text = compact(value);
  if (!text) return null;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 3) return (((parts[0] * 60) + parts[1]) * 60 + parts[2]) * 1000;
  return null;
}

export function formatTimestamp(ms) {
  if (!Number.isFinite(ms)) return null;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.max(0, Math.floor(ms % 1000));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function sourceRef({ source, lineIndex, startMs = null, endMs = null, text, language = null, trackKind = null }) {
  return {
    source,
    lineIndex: Number.isInteger(lineIndex) ? lineIndex : null,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
    text: compact(text),
    language,
    trackKind,
  };
}

export function isPromotionalEvidenceLine(text) {
  const value = compact(text);
  if (!value) return true;
  if (TIMELINE_LINE_RE.test(value)) return false;
  return PROMOTIONAL_LINE_RE.test(value);
}

export function parseTimelineLine(text) {
  const match = compact(text).match(TIMELINE_LINE_RE);
  if (!match) return null;
  return {
    startMs: parseTimestampMs(match[1]),
    endMs: match[2] ? parseTimestampMs(match[2]) : null,
    title: compact(match[3]),
    rawText: compact(text),
  };
}

export function buildSourceEvidenceRefs(input = {}) {
  const refs = [];
  const video = input.video ?? {};

  for (const [index, line] of String(video.description ?? "").split(/\r?\n/u).entries()) {
    const text = compact(line);
    if (!text || isPromotionalEvidenceLine(text)) continue;
    refs.push(sourceRef({ source: "description", lineIndex: index, text }));
  }

  for (const [index, comment] of (Array.isArray(input.authorComments) ? input.authorComments : []).entries()) {
    const text = compact(typeof comment === "string" ? comment : comment?.text);
    if (!text || isPromotionalEvidenceLine(text)) continue;
    refs.push(sourceRef({ source: "comment", lineIndex: index, text }));
  }

  const transcript = input.transcript ?? null;
  for (const [index, segment] of (Array.isArray(transcript?.segments) ? transcript.segments : []).entries()) {
    const text = compact(segment?.text);
    if (!text || isPromotionalEvidenceLine(text)) continue;
    const startMs = Number.isFinite(segment?.startMs) ? segment.startMs : null;
    const durationMs = Number.isFinite(segment?.durationMs) ? segment.durationMs : null;
    refs.push(sourceRef({
      source: "transcript",
      lineIndex: Number.isInteger(segment?.lineIndex) ? segment.lineIndex : index,
      startMs,
      endMs: startMs !== null && durationMs !== null ? startMs + durationMs : null,
      text,
      language: segment?.language ?? transcript?.language ?? null,
      trackKind: segment?.trackKind ?? null,
    }));
  }

  return refs;
}

export function sourceEvidenceStats(refs) {
  const bySource = {};
  for (const ref of refs) {
    bySource[ref.source] = (bySource[ref.source] ?? 0) + 1;
  }
  return {
    refCount: refs.length,
    bySource,
    timedRefCount: refs.filter((ref) => Number.isFinite(ref.startMs)).length,
  };
}
