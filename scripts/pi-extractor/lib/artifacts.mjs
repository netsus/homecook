import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const QUANTITY_PATTERN = /(?<amount>\d+(?:\.\d+)?(?:\/\d+)?)\s*(?<unit>g|kg|ml|l|큰술|작은술|개|컵|스푼|t|T|분|도|℃|%)/iu;
const ACTION_CUE_PATTERN = /넣|붓|바르|바른|뿌리|섞|올리|굽|채우|묻히|덜|담|끓|볶|부어|발라/iu;
const MIN_CANDIDATE_OUTPUT_RANGE_SECONDS = 5;
const MAX_COMPACT_EVIDENCE_BULLETS = 8;

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function safeTargetSegment(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9가-힣_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 50) || "unknown";
}

function maxCaptionEndSec(sourcePacket) {
  const ends = (sourcePacket?.captions?.segments ?? [])
    .map((segment) => Number(segment.endMs))
    .filter(Number.isFinite)
    .map((endMs) => endMs / 1000);
  return ends.length ? Math.max(...ends) : null;
}

function timecodeToSeconds(value) {
  const parts = String(value ?? "").split(":").map((part) => Number(part));
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (minutes >= 60 || seconds >= 60) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function optionalRangeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeTextEntities(value) {
  return String(value ?? "")
    .replace(/&amp;|&#38;/giu, "&")
    .replace(/&vert;|&#124;/giu, "|")
    .replace(/&nbsp;|&#160;/giu, " ");
}

function normalizeTimelineText(value) {
  return decodeTextEntities(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function cueTokens(value) {
  return uniqueStrings(decodeTextEntities(value).split(/[\s/&|ㅣ,·・+:\-()[\]{}]+/u))
    .map((token) => normalizeTimelineText(token))
    .filter((token) => [...token].length >= 2);
}

function commonPrefixLength(first, second) {
  const firstChars = [...first];
  const secondChars = [...second];
  let length = 0;
  while (length < firstChars.length && length < secondChars.length && firstChars[length] === secondChars[length]) {
    length += 1;
  }
  return length;
}

function timelineTokenMatchScore(candidateToken, timelineToken) {
  if (!candidateToken || !timelineToken) return 0;
  const candidateLength = [...candidateToken].length;
  const timelineLength = [...timelineToken].length;
  if (candidateLength < 2 || timelineLength < 2) return 0;
  if (candidateToken === timelineToken) return 20;
  if (timelineToken.includes(candidateToken) || candidateToken.includes(timelineToken)) {
    return Math.min(candidateLength, timelineLength) >= 2 ? 12 : 0;
  }
  const prefixLength = commonPrefixLength(candidateToken, timelineToken);
  return prefixLength >= 2 ? 6 : 0;
}

function parseTimelineLine(line) {
  const match = String(line ?? "").match(/(?<time>(?:\d{1,2}:)?\d{1,2}:\d{2})\s+(?<title>.+)$/u);
  if (!match?.groups || match.index > 12) return null;
  const startSec = timecodeToSeconds(match.groups.time);
  if (!Number.isFinite(startSec)) return null;
  return {
    title: match.groups.title.trim(),
    startSec,
  };
}

function lineRecordsFromText(text) {
  const rawLines = String(text ?? "").split(/\r?\n/u);
  const records = [];
  let refIndex = 0;
  for (const [rawIndex, rawLine] of rawLines.entries()) {
    const normalized = rawLine.replace(/\s+/gu, " ").trim();
    if (!normalized) continue;
    refIndex += 1;
    records.push({
      rawIndex,
      refIndex,
      sourceIndex: refIndex - 1,
      text: normalized,
    });
  }
  return { rawLines, records };
}

function timelineEntriesFromRecords(records, duration) {
  const entries = [];
  for (const record of records) {
    const parsed = parseTimelineLine(record.text);
    if (!parsed) continue;
    entries.push({
      line: record.text,
      title: parsed.title,
      startSec: parsed.startSec,
      sourceIndex: record.sourceIndex,
      rawIndex: record.rawIndex,
    });
  }
  entries.sort((first, second) => first.startSec - second.startSec || first.sourceIndex - second.sourceIndex);
  return entries.map((entry, index) => {
    const nextStart = entries[index + 1]?.startSec;
    const fallbackEnd = Number.isFinite(duration) && duration > entry.startSec ? duration : entry.startSec + 180;
    const endSec = Number.isFinite(nextStart) && nextStart > entry.startSec ? nextStart : fallbackEnd;
    return {
      ...entry,
      endSec,
      kind: "description-timeline",
      tokens: cueTokens(entry.title),
      normalizedTitle: normalizeTimelineText(entry.title),
    };
  });
}

function isMenuHeadingLine(line) {
  const text = String(line ?? "").replace(/[^\p{Letter}\p{Number}]+/gu, "").toLowerCase();
  return text === "메뉴" || text === "menu" || text === "menus";
}

function isMenuListItemLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return false;
  if (parseTimelineLine(text)) return false;
  if (/https?:\/\/|www\.|@/iu.test(text)) return false;
  if (/재료|양념|기타|만드는\s*법|만들기|레시피|타임라인|챕터|chapter|timeline|문의|구매|이벤트|event/iu.test(text)) return false;
  if (QUANTITY_PATTERN.test(text)) return false;
  return [...text].length <= 80;
}

function descriptionMenuGroupEntries(sourcePacket) {
  const duration = Number(sourcePacket?.video?.durationSeconds) || maxCaptionEndSec(sourcePacket);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const { records } = lineRecordsFromText(sourcePacket?.video?.description);
  const headingIndex = records.findIndex((record) => isMenuHeadingLine(record.text));
  if (headingIndex < 0) return [];
  const menuLines = [];
  for (const record of records.slice(headingIndex + 1)) {
    if (!isMenuListItemLine(record.text)) {
      if (menuLines.length > 0) break;
      continue;
    }
    menuLines.push(record);
  }
  if (menuLines.length === 0) return [];
  const slice = duration / menuLines.length;
  return menuLines.map((record, index) => ({
    kind: "description-menu-group",
    line: record.text,
    title: record.text,
    startSec: Math.round(slice * index),
    endSec: Math.round(slice * (index + 1)),
    sourceIndex: record.sourceIndex,
    rawIndex: record.rawIndex,
    tokens: cueTokens(record.text),
    normalizedTitle: normalizeTimelineText(record.text),
  }));
}

function candidateTitleTokens(candidate) {
  return uniqueStrings([
    candidate?.title,
    candidate?.titleHint,
    ...(candidate?.aliases ?? []),
  ]).flatMap((value) => cueTokens(value));
}

function candidateTitleMatchScore(candidate, line) {
  const lineText = String(line ?? "");
  const normalizedLine = normalizeTimelineText(lineText);
  return candidateTitleTokens(candidate).reduce((best, token) => {
    if (!token) return best;
    if (normalizedLine.includes(token)) return Math.max(best, 30);
    const tokenScore = Math.max(0, ...cueTokens(lineText).map((lineToken) => timelineTokenMatchScore(token, lineToken)));
    return Math.max(best, tokenScore);
  }, 0);
}

function descriptionMenuGroupTimeRange(candidate, sourcePacket, allCandidates) {
  const entries = descriptionMenuGroupEntries(sourcePacket);
  if (entries.length === 0) return null;
  for (const entry of entries) {
    const matches = (allCandidates ?? [])
      .map((entryCandidate, index) => ({
        candidate: entryCandidate,
        index,
        score: candidateTitleMatchScore(entryCandidate, entry.line),
      }))
      .filter((match) => match.score > 0)
      .sort((first, second) => {
        const firstToken = candidateTitleTokens(first.candidate).find((token) => entry.normalizedTitle.includes(token));
        const secondToken = candidateTitleTokens(second.candidate).find((token) => entry.normalizedTitle.includes(token));
        const firstPosition = firstToken ? entry.normalizedTitle.indexOf(firstToken) : Number.MAX_SAFE_INTEGER;
        const secondPosition = secondToken ? entry.normalizedTitle.indexOf(secondToken) : Number.MAX_SAFE_INTEGER;
        return firstPosition - secondPosition || first.index - second.index;
      });
    const matchIndex = matches.findIndex((match) => match.candidate.candidateId === candidate.candidateId);
    if (matchIndex < 0) continue;
    const groupStart = entry.startSec;
    const groupEnd = entry.endSec;
    const matchCount = Math.max(1, matches.length);
    const slice = (groupEnd - groupStart) / matchCount;
    return {
      startSec: Math.round(groupStart + (slice * matchIndex)),
      endSec: Math.round(groupStart + (slice * (matchIndex + 1))),
      basis: "description-menu-group-even-split",
      cueText: entry.line,
      menuGroupIndex: entries.indexOf(entry),
      menuGroupCandidateCount: matchCount,
    };
  }
  return null;
}

function buildTimelineScopes(rawLines, timelineEntries) {
  return timelineEntries.map((entry, index) => {
    const nextEntry = timelineEntries[index + 1] ?? null;
    const rawEndExclusive = nextEntry?.rawIndex ?? rawLines.length;
    return {
      rawStart: entry.rawIndex,
      rawEndExclusive,
      startSec: entry.startSec,
      endSec: entry.endSec,
      cueText: entry.line,
    };
  });
}

function scopeLineRecordsByTimeline({ rawLines, records }, duration) {
  const timelineEntries = timelineEntriesFromRecords(records, duration);
  if (timelineEntries.length === 0) return records;
  const scopes = buildTimelineScopes(rawLines, timelineEntries);
  return records.map((record) => {
    const scope = scopes.find((entry) => record.rawIndex >= entry.rawStart && record.rawIndex < entry.rawEndExclusive);
    if (!scope) return { ...record, timelineScopeStatus: "unscoped" };
    return {
      ...record,
      startSec: scope.startSec,
      endSec: scope.endSec,
      timelineCueText: scope.cueText,
      timelineScopeStatus: "scoped",
    };
  });
}

function extractDescriptionTimelineEntries(sourcePacket) {
  const duration = Number(sourcePacket?.video?.durationSeconds) || maxCaptionEndSec(sourcePacket);
  const lineRecords = lineRecordsFromText(sourcePacket?.video?.description);
  return timelineEntriesFromRecords(lineRecords.records, duration);
}

function descriptionTimelineTimeRange(candidate, sourcePacket) {
  const entries = extractDescriptionTimelineEntries(sourcePacket);
  if (entries.length === 0) return null;
  const candidateTokens = uniqueStrings([
    ...candidateCueTokens(candidate),
    ...cueTokens(candidate?.title),
    ...(candidate?.aliases ?? []).flatMap((alias) => cueTokens(alias)),
  ]).map((token) => normalizeTimelineText(token)).filter((token) => [...token].length >= 2);
  if (candidateTokens.length === 0) return null;

  let best = null;
  for (const entry of entries) {
    const score = candidateTokens.reduce((total, candidateToken) => {
      const fullTitleScore = entry.normalizedTitle.includes(candidateToken) ? 30 : 0;
      const tokenScore = Math.max(0, ...entry.tokens.map((timelineToken) => timelineTokenMatchScore(candidateToken, timelineToken)));
      return total + Math.max(fullTitleScore, tokenScore);
    }, 0);
    if (score > 0 && (!best || score > best.score || (score === best.score && entry.startSec < best.entry.startSec))) {
      best = { entry, score };
    }
  }
  if (!best) return null;
  return {
    startSec: best.entry.startSec,
    endSec: best.entry.endSec,
    basis: "description-timeline",
    cueText: best.entry.line,
  };
}

function normalizeTimeRange(candidate, index, count, sourcePacket, allCandidates = []) {
  const raw = candidate?.timeRange;
  const start = Number(raw?.startSec);
  const end = Number(raw?.endSec);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start >= MIN_CANDIDATE_OUTPUT_RANGE_SECONDS) {
    return { startSec: start, endSec: end, basis: "candidate-output" };
  }
  const timelineRange = descriptionTimelineTimeRange(candidate, sourcePacket);
  if (timelineRange) return timelineRange;
  const captionCueRange = captionCueTimeRange(candidate, sourcePacket);
  if (captionCueRange) return captionCueRange;
  const menuGroupRange = descriptionMenuGroupTimeRange(candidate, sourcePacket, allCandidates);
  if (menuGroupRange) return menuGroupRange;
  const duration = Number(sourcePacket?.video?.durationSeconds) || maxCaptionEndSec(sourcePacket);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { startSec: null, endSec: null, basis: "unknown" };
  }
  if (count <= 1) {
    return { startSec: 0, endSec: Math.round(duration), basis: "whole-video" };
  }
  const slice = duration / count;
  return {
    startSec: Math.round(slice * index),
    endSec: Math.round(slice * (index + 1)),
    basis: "even-split-fallback",
  };
}

function candidateCueTokens(candidate) {
  return uniqueStrings([
    candidate?.title,
    candidate?.titleHint,
    ...(String(candidate?.title ?? "").split(/[\s/&|ㅣ,]+/u)),
    ...(String(candidate?.titleHint ?? "").split(/[\s/&|ㅣ,]+/u)),
    ...(candidate?.aliases ?? []),
    ...(candidate?.ingredientNames ?? []),
  ]).filter((token) => [...token].length >= 2);
}

function captionCueTimeRange(candidate, sourcePacket) {
  const tokens = candidateCueTokens(candidate);
  if (tokens.length === 0) return null;
  const matched = (sourcePacket?.captions?.segments ?? [])
    .filter((segment) => tokens.some((token) => String(segment.text ?? "").includes(token)))
    .map((segment) => {
      const startMs = Number(segment.startMs);
      const endMs = Number(segment.endMs);
      const fallbackEndMs = Number.isFinite(startMs) ? startMs + 2500 : null;
      return {
        startSec: Number.isFinite(startMs) ? startMs / 1000 : null,
        endSec: Number.isFinite(endMs) ? endMs / 1000 : fallbackEndMs === null ? null : fallbackEndMs / 1000,
      };
    })
    .filter((segment) => Number.isFinite(segment.startSec) && Number.isFinite(segment.endSec) && segment.endSec >= segment.startSec);
  if (matched.length === 0) return null;
  const startSec = Math.max(0, Math.floor(Math.min(...matched.map((segment) => segment.startSec)) - 20));
  const endSec = Math.ceil(Math.max(...matched.map((segment) => segment.endSec)) + 60);
  return { startSec, endSec, basis: "caption-cue" };
}

export function buildCandidateLedger({ sourcePacket, candidateOutput }) {
  const rawCandidates = candidateOutput.candidates ?? [];
  const candidates = rawCandidates.map((candidate, index) => {
    const timeRange = normalizeTimeRange(candidate, index, rawCandidates.length, sourcePacket, rawCandidates);
    return {
      candidateId: candidate.candidateId,
      titleHint: candidate.title,
      aliases: uniqueStrings([candidate.title, ...(candidate.aliases ?? [])]),
      timeRange,
      sourceCues: uniqueStrings([
        ...(candidate.evidence ?? []),
        ...(candidate.sourceCues ?? []),
        timeRange?.cueText ? `description:${timeRange.cueText}` : null,
        sourcePacket?.video?.title ? "title" : null,
        sourcePacket?.video?.description ? "description" : null,
      ]),
      ingredientNames: uniqueStrings(candidate.ingredientNames ?? []),
      sharedIngredientSeeds: uniqueStrings(candidate.sharedIngredientSeeds ?? []),
      confidence: Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0.7,
      uncertainties: uniqueStrings(candidate.uncertainties ?? []),
    };
  });
  return {
    schemaVersion: 1,
    kind: "candidate-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    candidates,
  };
}

export function buildVisualLedger({ sourcePacket, candidateLedger }) {
  return {
    schemaVersion: 1,
    kind: "visual-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    collectionStatus: "not-requested",
    note: "No frame extractor was invoked for this MVP run; visual-estimate values must not be invented from this empty ledger.",
    candidates: candidateLedger.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      timeRange: candidate.timeRange,
      frames: [],
      observed: [],
      onscreenText: [],
      quantityCues: [],
    })),
  };
}

function sourceEntries(sourcePacket) {
  const entries = [];
  const duration = Number(sourcePacket?.video?.durationSeconds) || maxCaptionEndSec(sourcePacket);
  if (sourcePacket?.video?.title) {
    entries.push({ type: "title", ref: "title", text: sourcePacket.video.title });
  }
  const descriptionRecords = scopeLineRecordsByTimeline(lineRecordsFromText(sourcePacket?.video?.description), duration);
  for (const record of descriptionRecords) {
    entries.push({
      type: "description",
      ref: `description:${record.refIndex}`,
      text: record.text,
      startSec: record.startSec,
      endSec: record.endSec,
      timelineCueText: record.timelineCueText,
      timelineScopeStatus: record.timelineScopeStatus,
    });
  }
  const authorComments = Array.isArray(sourcePacket?.authorComments)
    ? sourcePacket.authorComments
    : Array.isArray(sourcePacket?.authorComments?.comments)
    ? sourcePacket.authorComments.comments.map((comment) => comment.text)
    : [];
  for (const [index, text] of authorComments.entries()) {
    if (!cleanString(text)) continue;
    const commentLineRecords = lineRecordsFromText(text);
    const hasTimeline = commentLineRecords.records.some((record) => parseTimelineLine(record.text));
    if (!hasTimeline) {
      entries.push({ type: "author-comment", ref: `author-comment:${index + 1}`, text });
      continue;
    }
    const commentRecords = scopeLineRecordsByTimeline(commentLineRecords, duration);
    for (const record of commentRecords) {
      entries.push({
        type: "author-comment",
        ref: `author-comment:${index + 1}:${record.refIndex}`,
        text: record.text,
        startSec: record.startSec,
        endSec: record.endSec,
        timelineCueText: record.timelineCueText,
        timelineScopeStatus: record.timelineScopeStatus,
      });
    }
  }
  for (const segment of sourcePacket?.captions?.segments ?? []) {
    if (!cleanString(segment.text)) continue;
    const startMs = Number(segment.startMs);
    const startSec = Number.isFinite(startMs) ? Math.round(startMs / 1000) : null;
    entries.push({
      type: "caption",
      ref: startSec === null ? "caption" : `transcript:${startSec}s`,
      text: segment.text,
      startSec,
    });
  }
  return entries;
}

function candidateRangeKey(candidate) {
  const start = optionalRangeNumber(candidate?.timeRange?.startSec);
  const end = optionalRangeNumber(candidate?.timeRange?.endSec);
  if (start === null || end === null || end <= start) return null;
  return `${Math.round(start * 1000)}:${Math.round(end * 1000)}`;
}

function candidateEvidenceRange(candidate, allCandidates = []) {
  const range = candidate?.timeRange ?? {};
  const start = optionalRangeNumber(range.startSec);
  const end = optionalRangeNumber(range.endSec);
  if (start === null || end === null || end <= start) return range;
  const key = candidateRangeKey(candidate);
  const group = key
    ? (allCandidates ?? []).filter((entry) => candidateRangeKey(entry) === key)
    : [];
  if (group.length <= 1) return range;
  const index = group.findIndex((entry) => entry.candidateId === candidate.candidateId);
  if (index < 0) return range;
  const span = (end - start) / group.length;
  return {
    ...range,
    startSec: start + (span * index),
    endSec: start + (span * (index + 1)),
    basis: "shared-range-evidence-slice",
    parentRange: range,
    sliceIndex: index,
    sliceCount: group.length,
  };
}

function entryWithinCandidateRange(entry, candidate, allCandidates = []) {
  if (!candidate) return true;
  const rangeScopedTypes = new Set(["caption", "description", "author-comment"]);
  if (!rangeScopedTypes.has(entry?.type)) return true;
  if (entry?.timelineScopeStatus === "unscoped") return false;
  const startSec = Number(entry.startSec);
  if (!Number.isFinite(startSec)) return true;
  const range = candidateEvidenceRange(candidate, allCandidates);
  const rangeStart = optionalRangeNumber(range.startSec);
  const rangeEnd = optionalRangeNumber(range.endSec);
  const beforeEnd = rangeEnd === null
    ? true
    : entry?.type === "caption"
    ? startSec <= rangeEnd
    : startSec < rangeEnd;
  return (rangeStart === null || startSec >= rangeStart) && beforeEnd;
}

function sourceEntriesForCandidate(sourcePacket, candidate, allCandidates = []) {
  return sourceEntries(sourcePacket).filter((entry) => entryWithinCandidateRange(entry, candidate, allCandidates));
}

function sourceEvidenceCanOpenVisualTarget(ref) {
  return /^(?:description|author-comment|caption|transcript)(?::|$)/u.test(String(ref ?? ""));
}

function amountCueFromText(text, ingredientName, sourceType, sourceRef) {
  const compactIngredient = String(ingredientName).replace(/\s+/gu, "");
  const flexibleIngredient = [...compactIngredient]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s*");
  const line = String(text ?? "");
  const exactIndex = line.indexOf(ingredientName);
  const afterName = exactIndex >= 0 ? line.slice(exactIndex + ingredientName.length) : "";
  const match = afterName.match(QUANTITY_PATTERN)
    ?? line.match(new RegExp(`${flexibleIngredient}\\s*${QUANTITY_PATTERN.source}`, "iu"));
  if (!match?.groups?.amount || !match?.groups?.unit) return null;
  const amountBasis = sourceType === "caption" ? "spoken" : "stated";
  return {
    amount: match.groups.amount,
    unit: match.groups.unit,
    amountBasis,
    evidence: [sourceRef],
  };
}

function lineMentionsIngredient(line, ingredientName) {
  const rawLine = String(line ?? "");
  const rawIngredient = String(ingredientName ?? "").trim();
  const compactIngredient = rawIngredient.replace(/\s+/gu, "");
  if ([...compactIngredient].length <= 1) {
    const escaped = compactIngredient.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(^|[^가-힣A-Za-z0-9])${escaped}(?:\\s*\\([^)]*\\))?(?:을|를|이|가|은|는|도|만|에|으로|로)?([^가-힣A-Za-z0-9]|$)`, "u").test(rawLine);
  }
  const normalizedLine = String(line ?? "").replace(/\s+/gu, "");
  const normalizedIngredient = compactIngredient;
  return Boolean(normalizedIngredient && normalizedLine.includes(normalizedIngredient));
}

function extractCaptionEvidence(sourcePacket, candidate, allCandidates = []) {
  const names = candidate.ingredientNames ?? [];
  const range = candidateEvidenceRange(candidate, allCandidates);
  return (sourcePacket?.captions?.segments ?? [])
    .filter((segment) => {
      const startSec = Number(segment.startMs) / 1000;
      const inRange = Number.isFinite(startSec)
        && (range.startSec === null || startSec >= Number(range.startSec))
        && (range.endSec === null || startSec <= Number(range.endSec));
      return inRange && names.some((name) => lineMentionsIngredient(segment.text, name));
    })
    .slice(0, 24)
    .map((segment) => ({
      ref: `transcript:${Math.round(Number(segment.startMs) / 1000)}s`,
      text: segment.text,
    }));
}

function extractStepEvidence(sourcePacket, candidate, allCandidates = []) {
  return sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)
    .filter((entry) => entry.type === "caption" || entry.type === "description" || entry.type === "author-comment")
    .filter((entry) => ACTION_CUE_PATTERN.test(entry.text))
    .slice(0, 24)
    .map((entry) => ({
      ref: entry.ref,
      text: entry.text,
      type: entry.type,
      startSec: Number.isFinite(Number(entry.startSec)) ? Number(entry.startSec) : null,
    }));
}

function extractVisualStepEvidence(visual) {
  const frames = Array.isArray(visual?.frames) ? visual.frames : [];
  const entries = [];
  for (const frame of frames) {
    const frameRef = cleanString(frame?.ref);
    if (!frameRef) continue;
    const lines = Array.isArray(frame?.onscreenText) ? frame.onscreenText : [];
    for (const [index, line] of lines.entries()) {
      const text = cleanString(line);
      if (!text || !ACTION_CUE_PATTERN.test(text)) continue;
      entries.push({
        ref: `${frameRef}:onscreenText:${index + 1}`,
        text,
        type: "visual-onscreen",
        frameRef,
      });
    }
  }
  return entries.slice(0, 12);
}

function compactEvidenceText(value, maxLength = 180) {
  const text = cleanString(value)?.replace(/\s+/gu, " ");
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactEvidenceKeywordPool(candidate, sourceDraftRecipe) {
  return uniqueStrings([
    candidate?.title,
    candidate?.titleHint,
    ...(candidate?.aliases ?? []),
    ...(candidate?.ingredientNames ?? []),
    ...(candidate?.sharedIngredientSeeds ?? []),
    ...((sourceDraftRecipe?.ingredients ?? []).map((ingredient) => ingredient.name)),
    ...((sourceDraftRecipe?.ingredientIdentityHints ?? []).map((hint) => hint.name)),
    ...((sourceDraftRecipe?.possibleIngredientHints ?? []).map((hint) => hint.name)),
  ]);
}

function lineMatchesEvidenceKeyword(line, keywords) {
  const normalizedLine = normalizeTimelineText(line);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeTimelineText(keyword);
    return Boolean(
      normalizedKeyword
      && (lineMentionsIngredient(line, keyword)
        || normalizedLine.includes(normalizedKeyword)
        || normalizedKeyword.includes(normalizedLine)),
    );
  });
}

function compactSourceEvidenceBullets({ descriptionEvidence, transcriptEvidence, stepEvidence, candidate, sourceDraftRecipe }) {
  const keywords = compactEvidenceKeywordPool(candidate, sourceDraftRecipe);
  const rawEntries = [
    ...(stepEvidence ?? []).map((entry) => ({ ...entry, compactKind: "step" })),
    ...(transcriptEvidence ?? []).map((entry) => ({ ...entry, compactKind: ACTION_CUE_PATTERN.test(entry.text) ? "step" : "source" })),
    ...(descriptionEvidence ?? []).map((entry) => ({ ...entry, compactKind: ACTION_CUE_PATTERN.test(entry.text) ? "step" : "source" })),
  ];
  const seen = new Set();
  const bullets = [];
  for (const entry of rawEntries) {
    const text = compactEvidenceText(entry.text);
    if (!text) continue;
    const hasSignal = ACTION_CUE_PATTERN.test(text)
      || QUANTITY_PATTERN.test(text)
      || lineMatchesEvidenceKeyword(text, keywords);
    if (!hasSignal) continue;
    const key = `${entry.ref ?? ""}::${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const source = String(entry.ref ?? "").startsWith("transcript:")
      ? "transcript"
      : entry.type ?? "source";
    bullets.push({
      ref: entry.ref,
      source,
      kind: entry.compactKind,
      text,
      startSec: Number.isFinite(Number(entry.startSec)) ? Number(entry.startSec) : null,
    });
    if (bullets.length >= 4) break;
  }
  return bullets;
}

function compactVisualEvidenceValues(values, keywords, { requireSignal = false } = {}) {
  const entries = uniqueStrings(values ?? []).map((value) => compactEvidenceText(value)).filter(Boolean);
  const filtered = entries.filter((entry) => (
    ACTION_CUE_PATTERN.test(entry)
    || QUANTITY_PATTERN.test(entry)
    || lineMatchesEvidenceKeyword(entry, keywords)
  ));
  return (filtered.length > 0 || requireSignal ? filtered : entries).slice(0, 6);
}

function compactVisualFrameBullets({ visualEvidence, visualStepEvidence, candidate, sourceDraftRecipe }) {
  const keywords = compactEvidenceKeywordPool(candidate, sourceDraftRecipe);
  const visualStepByFrame = new Map();
  for (const entry of visualStepEvidence ?? []) {
    const frameRef = cleanString(entry.frameRef);
    const text = compactEvidenceText(entry.text);
    if (!frameRef || !text) continue;
    const list = visualStepByFrame.get(frameRef) ?? [];
    list.push(text);
    visualStepByFrame.set(frameRef, list);
  }
  const seen = new Set();
  const bullets = [];
  for (const frame of visualEvidence ?? []) {
    const ref = cleanString(frame?.ref);
    if (!ref) continue;
    const observed = uniqueStrings(frame.observed ?? [])
      .map((value) => compactEvidenceText(value))
      .filter(Boolean)
      .slice(0, 6);
    const onscreenText = compactVisualEvidenceValues([
      ...(frame.onscreenText ?? []),
      ...(visualStepByFrame.get(ref) ?? []),
    ], keywords, { requireSignal: true });
    const quantityCues = compactVisualEvidenceValues(frame.quantityCues, keywords, { requireSignal: true });
    if (observed.length === 0 && onscreenText.length === 0 && quantityCues.length === 0) continue;
    const contentKey = JSON.stringify({ observed, onscreenText, quantityCues });
    if (seen.has(contentKey)) continue;
    seen.add(contentKey);
    const bullet = {
      ref,
      source: "frame",
      kind: "visual-frame",
      observed,
      onscreenText,
      quantityCues,
      confidence: Number.isFinite(Number(frame.confidence)) ? Number(frame.confidence) : null,
    };
    if (frame.range) bullet.range = frame.range;
    bullets.push(bullet);
    if (bullets.length >= 4) break;
  }
  return bullets;
}

function buildCompactEvidenceBullets({
  descriptionEvidence,
  transcriptEvidence,
  stepEvidence,
  visualStepEvidence,
  visualEvidence,
  candidate,
  sourceDraftRecipe,
}) {
  return [
    ...compactSourceEvidenceBullets({ descriptionEvidence, transcriptEvidence, stepEvidence, candidate, sourceDraftRecipe }),
    ...compactVisualFrameBullets({ visualEvidence, visualStepEvidence, candidate, sourceDraftRecipe }),
  ].slice(0, MAX_COMPACT_EVIDENCE_BULLETS);
}

function captionSegmentsForIngredient(sourcePacket, candidate, ingredientName, {
  beforeSec = 8,
  afterSec = 12,
  maxRanges = 3,
  allCandidates = [],
} = {}) {
  const range = candidateEvidenceRange(candidate, allCandidates);
  const segments = (sourcePacket?.captions?.segments ?? [])
    .map((segment) => {
      const startSec = Number(segment.startMs) / 1000;
      const rawEndMs = Number(segment.endMs);
      const endSec = Number.isFinite(rawEndMs) && rawEndMs > Number(segment.startMs)
        ? rawEndMs / 1000
        : startSec + 2.5;
      return {
        text: String(segment.text ?? ""),
        startSec,
        endSec,
      };
    })
    .filter((segment) => Number.isFinite(segment.startSec))
    .filter((segment) => {
      const inRange = (range.startSec === null || segment.startSec >= Number(range.startSec))
        && (range.endSec === null || segment.startSec <= Number(range.endSec));
      const hasIngredient = lineMentionsIngredient(segment.text, ingredientName);
      return inRange && hasIngredient;
    })
    .slice(0, maxRanges);
  return segments.map((segment) => ({
    startSec: Math.max(0, Math.floor(segment.startSec - beforeSec)),
    endSec: Math.ceil(segment.endSec + afterSec),
    basis: ACTION_CUE_PATTERN.test(segment.text) ? "caption-ingredient-action-cue" : "caption-ingredient-cue",
    cueText: segment.text,
  }));
}

export function extractAmountFromSource(sourcePacket, ingredientName, candidate = null, allCandidates = []) {
  if (!ingredientName) return null;
  for (const entry of sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)) {
    if (!lineMentionsIngredient(entry.text, ingredientName)) continue;
    const cue = amountCueFromText(entry.text, ingredientName, entry.type, entry.ref);
    if (cue) return cue;
  }
  return null;
}

function ingredientEvidenceEntriesForCandidate(sourcePacket, candidate, ingredientName, allCandidates = []) {
  return sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)
    .filter((entry) => lineMentionsIngredient(entry.text, ingredientName));
}

function lineHasIngredientConfirmationContext(text, ingredientName) {
  const line = String(text ?? "");
  if (QUANTITY_PATTERN.test(line)) return true;
  if (ACTION_CUE_PATTERN.test(line)) return true;
  if (/재료|ingredients?|양념|소스|드레싱|반죽|육수|고명|토핑|마무리|준비/iu.test(line)) return true;
  const withoutTimecode = line.replace(/(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/gu, " ");
  const normalizedLine = normalizeTimelineText(withoutTimecode);
  const normalizedIngredient = normalizeTimelineText(ingredientName);
  if (!normalizedLine || !normalizedIngredient) return false;
  const remainder = normalizedLine.replaceAll(normalizedIngredient, "");
  return [...remainder].length > 1;
}

function sourceEntryConfirmsIngredient(entry, candidate, ingredientName) {
  if (!entry || !lineMentionsIngredient(entry.text, ingredientName)) return false;
  if (entry.type === "title") return false;
  if (entry.type === "caption") return true;
  if (amountCueFromText(entry.text, ingredientName, entry.type, entry.ref)) return true;
  if (parseTimelineLine(entry.text) && candidateTitleMatchScore(candidate, entry.text) > 0) return false;
  if (lineHasIngredientConfirmationContext(entry.text, ingredientName)) return true;
  return true;
}

function amountCueFromEntries(entries, ingredientName) {
  for (const entry of entries) {
    const cue = amountCueFromText(entry.text, ingredientName, entry.type, entry.ref);
    if (cue) return cue;
  }
  return null;
}

function ingredientSourceAnalysis(sourcePacket, candidate, ingredientName, allCandidates = []) {
  const entries = ingredientEvidenceEntriesForCandidate(sourcePacket, candidate, ingredientName, allCandidates);
  const confirmedEntries = entries.filter((entry) => sourceEntryConfirmsIngredient(entry, candidate, ingredientName));
  const amountCue = amountCueFromEntries(confirmedEntries, ingredientName);
  const sourceEvidence = amountCue?.evidence?.length
    ? amountCue.evidence
    : confirmedEntries.length > 0
    ? uniqueStrings([...entries.map((entry) => entry.ref), ...confirmedEntries.map((entry) => entry.ref)]).slice(0, 6)
    : [];
  const explicitSourceType = amountCue
    ? amountCue.amountBasis === "spoken" ? "caption" : "description"
    : confirmedEntries[0]?.type ?? null;
  return {
    confirmed: sourceEvidence.length > 0,
    entries,
    confirmedEntries,
    identityEvidence: entries.map((entry) => entry.ref).slice(0, 6),
    amountCue,
    sourceEvidence,
    explicitSourceType,
  };
}

function ingredientIdentityHint(name, analysis) {
  return {
    name,
    sourceEvidence: analysis.identityEvidence,
    reasonCode: "dish_identity_only",
    reason: "title/menu identity evidence is preserved as recipe identity, not a confirmed ingredient",
  };
}

function possibleIngredientHintFromIdentityHint(hint) {
  return {
    name: hint.name,
    sourceEvidence: hint.sourceEvidence ?? [],
    reasonCode: hint.reasonCode ?? "dish_identity_only",
    reason: "identity hint is preserved only for detail/visual interpretation, not confirmed ingredients",
  };
}

function candidateTitleMentionsIngredient(candidate, ingredientName) {
  return uniqueStrings([
    candidate?.title,
    candidate?.titleHint,
    ...(candidate?.aliases ?? []),
  ]).some((title) => sameIngredient(title, ingredientName));
}

function sharedSeedEvidenceScore(sourcePacket, candidate, ingredientName, allCandidates = []) {
  // Candidate titles are weak identity hints for shared seeds; scoped source evidence must carry promotion.
  let score = candidateTitleMentionsIngredient(candidate, ingredientName) ? 1 : 0;
  for (const entry of ingredientEvidenceEntriesForCandidate(sourcePacket, candidate, ingredientName, allCandidates)) {
    if (entry.type === "caption") {
      score += 5;
      continue;
    }
    if ((entry.type === "description" || entry.type === "author-comment") && Number.isFinite(Number(entry.startSec))) {
      score += 4;
      continue;
    }
    if ((entry.type === "description" || entry.type === "author-comment") && candidateTitleMatchScore(candidate, entry.text) > 0) {
      score += 3;
    }
  }
  return score;
}

function candidateIngredientNamesWithScopedSharedSeeds(sourcePacket, candidate, allCandidates = []) {
  const directIngredients = uniqueStrings(candidate.ingredientNames ?? []);
  const sharedSeeds = uniqueStrings(candidate.sharedIngredientSeeds ?? []);
  const reassignedSeeds = sharedSeeds.filter((seed) => {
    if (directIngredients.some((ingredient) => sameIngredient(ingredient, seed))) return false;
    return sharedSeedEvidenceScore(sourcePacket, candidate, seed, allCandidates) >= 3;
  });
  return uniqueStrings([...directIngredients, ...reassignedSeeds]);
}

function extractDescriptionEvidence(sourcePacket, candidate, allCandidates = []) {
  const names = candidate.ingredientNames ?? [];
  return sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)
    .filter((entry) => {
      const titleMatch = candidateTitleMatchScore(candidate, entry.text) > 0;
      const ingredientMatch = names.some((name) => lineMentionsIngredient(entry.text, name));
      if (isMenuListItemLine(entry.text) && !parseTimelineLine(entry.text)) {
        return titleMatch || ingredientMatch;
      }
      return titleMatch || ingredientMatch || /재료|만들|굽|볶|끓|섞|반죽|오븐/iu.test(entry.text);
    })
    .slice(0, 30)
    .map((entry) => ({ ref: entry.ref, text: entry.text }));
}

function hasUsableCandidateRecallRange(candidate) {
  const start = optionalRangeNumber(candidate?.timeRange?.startSec);
  const end = optionalRangeNumber(candidate?.timeRange?.endSec);
  if (start === null || end === null || end <= start) return false;
  return !new Set(["unknown", "even-split-fallback"]).has(candidate?.timeRange?.basis);
}

function candidateRecallEvidence(sourcePacket, candidate, allCandidates = []) {
  if (!hasUsableCandidateRecallRange(candidate)) return null;
  const entries = sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)
    .filter((entry) => entry.type === "description" || entry.type === "author-comment" || entry.type === "caption");
  if (entries.length === 0) return null;
  const actionEntries = entries.filter((entry) => ACTION_CUE_PATTERN.test(entry.text));
  if (actionEntries.length === 0) return null;
  const ingredientNames = uniqueStrings(candidate?.ingredientNames ?? []);
  const onlyDishIdentitySeeds = ingredientNames.length > 0
    && ingredientNames.every((ingredient) => candidateTitleMentionsIngredient(candidate, ingredient));
  if (actionEntries.length === 0 && onlyDishIdentitySeeds) return null;
  const identityEntries = entries.filter((entry) => candidateTitleMatchScore(candidate, entry.text) > 0 || cleanString(entry.timelineCueText));
  const evidenceEntries = uniqueStrings([
    ...actionEntries.map((entry) => entry.ref),
    ...identityEntries.map((entry) => entry.ref),
    ...entries.map((entry) => entry.ref),
  ]).slice(0, 8);
  if (evidenceEntries.length === 0) return null;
  return {
    targetType: "candidate_visual_recall",
    visualTargetAllowed: true,
    sourceEvidence: evidenceEntries,
    actionCueCount: actionEntries.length,
    textCues: uniqueStrings([...actionEntries, ...identityEntries].map((entry) => entry.text)).slice(0, 8),
    candidateTimeRange: candidate.timeRange,
    reasonCode: "source_poor_candidate_visual_recall",
    reason: "candidate has no confirmed source ingredients, but scoped public source/action cues can seed visual recall",
  };
}

function candidateActionCueRanges(sourcePacket, candidate, {
  beforeSec = 8,
  afterSec = 12,
  maxRanges = 3,
  allCandidates = [],
} = {}) {
  return sourceEntriesForCandidate(sourcePacket, candidate, allCandidates)
    .filter((entry) => entry.type === "caption" || entry.type === "description" || entry.type === "author-comment")
    .filter((entry) => ACTION_CUE_PATTERN.test(entry.text))
    .map((entry) => ({
      entry,
      startSec: optionalRangeNumber(entry.startSec),
    }))
    .filter((entry) => entry.startSec !== null)
    .slice(0, maxRanges)
    .map(({ entry, startSec }) => ({
      startSec: Math.max(0, Math.floor(startSec - beforeSec)),
      endSec: Math.ceil(startSec + afterSec),
      basis: "candidate-action-cue",
      cueText: entry.text,
    }));
}

export function buildVisualTargetLedger({
  sourcePacket,
  candidateLedger,
  gapLedger = null,
  maxRanges = 3,
  windowBeforeSec = 8,
  windowAfterSec = 12,
  descriptionOnlySweep = true,
  maxTargetsPerCandidate = 4,
  maxTotalTargetsPerCase = 16,
} = {}) {
  const sourceCueEntries = sourceEntries(sourcePacket)
    .filter((entry) => entry.type === "description" || entry.type === "author-comment");
  const targets = [];
  const skippedTargets = [];
  const allowedGaps = Array.isArray(gapLedger?.gaps)
    ? gapLedger.gaps.filter((gap) => gap.visualTargetAllowed === true)
    : null;
  const allCandidates = candidateLedger.candidates ?? [];
  const gapKey = (candidateId, ingredient) => `${candidateId ?? ""}::${cleanString(ingredient)?.replace(/\s+/gu, "") ?? ""}`;
  const allowedGapMap = new Map((allowedGaps ?? []).map((gap) => [gapKey(gap.candidateId, gap.ingredient), gap]));
  for (const candidate of allCandidates) {
    let candidateTargetCount = 0;
    const candidateAllowedGaps = allowedGaps
      ? allowedGaps.filter((gap) => gap.candidateId === candidate.candidateId)
      : [];
    for (const gap of candidateAllowedGaps.filter((entry) => entry.targetType === "candidate_visual_recall")) {
      if (candidateTargetCount >= maxTargetsPerCandidate) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          targetType: gap.targetType,
          reasonCode: "max_targets_per_candidate",
        });
        continue;
      }
      if (targets.length >= maxTotalTargetsPerCase) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          targetType: gap.targetType,
          reasonCode: "max_total_targets_per_case",
        });
        continue;
      }
      const preferredTimeRanges = candidateActionCueRanges(sourcePacket, candidate, {
        beforeSec: windowBeforeSec,
        afterSec: windowAfterSec,
        maxRanges,
        allCandidates,
      });
      const fallbackPolicy = preferredTimeRanges.length > 0
        ? "candidate-action-cue"
        : "candidate-visual-recall-sweep";
      targets.push({
        targetId: `${candidate.candidateId}:candidate-visual-recall`,
        candidateId: candidate.candidateId,
        targetType: "candidate_visual_recall",
        ingredient: null,
        gapType: gap.gapType,
        sourceEvidence: gap.sourceEvidence ?? [],
        reason: "source_poor_candidate_visual_recall",
        textCues: uniqueStrings([...(gap.textCues ?? []), ...preferredTimeRanges.map((range) => range.cueText)]).slice(0, 10),
        preferredTimeRanges: preferredTimeRanges.map((range) => {
          const publicRange = { ...range };
          delete publicRange.cueText;
          return publicRange;
        }),
        fallbackPolicy,
        candidateTimeRange: candidate.timeRange,
      });
      candidateTargetCount += 1;
    }
    const ingredients = allowedGaps
      ? candidateAllowedGaps.filter((gap) => gap.targetType !== "candidate_visual_recall").map((gap) => gap.ingredient)
      : candidate.ingredientNames ?? [];
    for (const ingredient of ingredients) {
      const gap = allowedGapMap.get(gapKey(candidate.candidateId, ingredient)) ?? null;
      if (allowedGaps && !gap) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          ingredient,
          reasonCode: "gap_ledger_not_allowed",
        });
        continue;
      }
      if (candidateTargetCount >= maxTargetsPerCandidate) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          ingredient,
          reasonCode: "max_targets_per_candidate",
        });
        continue;
      }
      if (targets.length >= maxTotalTargetsPerCase) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          ingredient,
          reasonCode: "max_total_targets_per_case",
        });
        continue;
      }
      const amountCue = extractAmountFromSource(sourcePacket, ingredient, candidate, allCandidates);
      if (amountCue) continue;
      const descriptionCues = sourceCueEntries
        .filter((entry) => entryWithinCandidateRange(entry, candidate, allCandidates))
        .filter((entry) => lineMentionsIngredient(entry.text, ingredient))
        .map((entry) => entry.text)
        .slice(0, 6);
      const preferredTimeRanges = captionSegmentsForIngredient(sourcePacket, candidate, ingredient, {
        beforeSec: windowBeforeSec,
        afterSec: windowAfterSec,
        maxRanges,
        allCandidates,
      });
      const hasDescriptionCue = descriptionCues.length > 0;
      const hasCaptionCue = preferredTimeRanges.length > 0;
      const shouldTarget = hasDescriptionCue || hasCaptionCue;
      if (!shouldTarget) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          ingredient,
          reasonCode: "no_source_or_caption_target_cue",
        });
        continue;
      }
      const descriptionOnly = hasDescriptionCue && !hasCaptionCue;
      if (descriptionOnly && !descriptionOnlySweep) {
        skippedTargets.push({
          candidateId: candidate.candidateId,
          ingredient,
          reasonCode: "description_only_sweep_disabled",
        });
        continue;
      }
      const fallbackPolicy = descriptionOnly ? "description-only-sweep" : "none";
      targets.push({
        targetId: `${candidate.candidateId}:${safeTargetSegment(ingredient)}`,
        candidateId: candidate.candidateId,
        ingredient,
        gapType: gap?.gapType ?? "legacy_amount_gap",
        sourceEvidence: gap?.sourceEvidence ?? [],
        reason: descriptionOnly ? "description_has_ingredient_without_amount" : "caption_or_action_cue_without_amount",
        textCues: uniqueStrings([...descriptionCues, ...preferredTimeRanges.map((range) => range.cueText)]).slice(0, 10),
        preferredTimeRanges: preferredTimeRanges.map((range) => {
          const publicRange = { ...range };
          delete publicRange.cueText;
          return publicRange;
        }),
        fallbackPolicy,
        candidateTimeRange: candidate.timeRange,
      });
      candidateTargetCount += 1;
    }
  }
  return {
    schemaVersion: 1,
    kind: "visual-target-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    settings: {
      maxRanges,
      windowBeforeSec,
      windowAfterSec,
      descriptionOnlySweep,
      maxTargetsPerCandidate,
      maxTotalTargetsPerCase,
      gapGated: Boolean(gapLedger),
    },
    targets,
    skippedTargets,
    warnings: skippedTargets.filter((target) => target.reasonCode.startsWith("max_")),
  };
}

export function buildSourceDraft({ sourcePacket, candidateLedger }) {
  const allCandidates = candidateLedger.candidates ?? [];
  const recipes = (candidateLedger.candidates ?? []).map((candidate) => {
    const ingredientNames = candidateIngredientNamesWithScopedSharedSeeds(sourcePacket, candidate, allCandidates);
    const ingredients = [];
    const ingredientIdentityHints = [];
    for (const ingredient of ingredientNames) {
      const analysis = ingredientSourceAnalysis(sourcePacket, candidate, ingredient, allCandidates);
      if (!analysis.confirmed) {
        ingredientIdentityHints.push(ingredientIdentityHint(ingredient, analysis));
        continue;
      }
      ingredients.push({
        name: ingredient,
        amount: analysis.amountCue?.amount ?? null,
        unit: analysis.amountCue?.unit ?? null,
        amountBasis: analysis.amountCue?.amountBasis ?? null,
        sourceEvidence: analysis.sourceEvidence,
        sourceAmountPresent: Boolean(analysis.amountCue?.amount),
        sourceUnitPresent: Boolean(analysis.amountCue?.unit),
        explicitSourceType: analysis.explicitSourceType,
        confidence: 0.65,
      });
    }
    return {
      candidateId: candidate.candidateId,
      title: candidate.titleHint,
      sourceCues: candidate.sourceCues,
      ingredients,
      ingredientIdentityHints,
      possibleIngredientHints: ingredientIdentityHints.map(possibleIngredientHintFromIdentityHint),
      candidateRecallEvidence: ingredients.length === 0
        ? candidateRecallEvidence(sourcePacket, candidate, allCandidates)
        : null,
    };
  });
  return {
    schemaVersion: 1,
    kind: "source-draft",
    videoId: sourcePacket?.video?.videoId ?? null,
    sourceDraftMode: "existing-artifacts",
    inputs: ["sourcePacket", "candidateResult", "candidateLedger"],
    recipes,
  };
}

export function buildGapLedger({ sourceDraft }) {
  const gaps = [];
  for (const recipe of sourceDraft?.recipes ?? []) {
    if ((recipe.ingredients ?? []).length === 0 && recipe.candidateRecallEvidence?.visualTargetAllowed === true) {
      gaps.push({
        candidateId: recipe.candidateId,
        ingredient: null,
        field: "recipe.visualRecall",
        gapType: "source_poor_candidate_visual_recall",
        targetType: "candidate_visual_recall",
        sourceAmountPresent: false,
        sourceUnitPresent: false,
        explicitSourceType: null,
        sourceEvidence: recipe.candidateRecallEvidence.sourceEvidence ?? [],
        textCues: recipe.candidateRecallEvidence.textCues ?? [],
        candidateTimeRange: recipe.candidateRecallEvidence.candidateTimeRange ?? null,
        whyVisualNeeded: "confirmed source ingredients are empty, but scoped public source/action cues make candidate-level visual recall useful",
        visualTargetAllowed: true,
      });
    }
    for (const ingredient of recipe.ingredients ?? []) {
      const hasSourceEvidence = Array.isArray(ingredient.sourceEvidence) && ingredient.sourceEvidence.length > 0;
      const hasVisualTargetSourceEvidence = (ingredient.sourceEvidence ?? []).some(sourceEvidenceCanOpenVisualTarget);
      const sourceAmountPresent = ingredient.sourceAmountPresent === true;
      const sourceUnitPresent = ingredient.sourceUnitPresent === true;
      let gapType = "no_visual_needed";
      let visualTargetAllowed = false;
      if (hasSourceEvidence && !hasVisualTargetSourceEvidence && (!sourceAmountPresent || !sourceUnitPresent)) {
        gapType = "ingredient_identity_unclear";
      } else if (hasSourceEvidence && (!sourceAmountPresent || !sourceUnitPresent)) {
        gapType = !sourceAmountPresent ? "amount_missing_visual_possible" : "unit_missing_visual_possible";
        visualTargetAllowed = true;
      } else if (!hasSourceEvidence) {
        gapType = "ingredient_identity_unclear";
      }
      gaps.push({
        candidateId: recipe.candidateId,
        ingredient: ingredient.name,
        field: !sourceAmountPresent
          ? `ingredients[${ingredient.name}].amount`
          : !sourceUnitPresent
          ? `ingredients[${ingredient.name}].unit`
          : null,
        gapType,
        sourceAmountPresent,
        sourceUnitPresent,
        explicitSourceType: ingredient.explicitSourceType,
        sourceEvidence: ingredient.sourceEvidence ?? [],
        whyVisualNeeded: visualTargetAllowed
          ? "재료명은 source에 있지만 amount/unit이 source에 없음"
          : gapType === "no_visual_needed"
          ? "source에 amount/unit 근거가 있음"
          : hasSourceEvidence && !hasVisualTargetSourceEvidence
          ? "title-only source 근거라 1차 visual target 금지"
          : "재료 source 근거가 부족해 1차 visual target 금지",
        visualTargetAllowed,
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "gap-ledger",
    videoId: sourceDraft?.videoId ?? null,
    sourceDraftMode: sourceDraft?.sourceDraftMode ?? null,
    gaps,
    summary: {
      totalGaps: gaps.length,
      visualTargetAllowedCount: gaps.filter((gap) => gap.visualTargetAllowed).length,
      noVisualNeededCount: gaps.filter((gap) => gap.gapType === "no_visual_needed").length,
    },
  };
}

export function buildEvidencePackets({ sourcePacket, candidateLedger, visualLedger, visualTargetLedger = null, visualEstimates = null, sourceDraft = null, gapLedger = null }) {
  const allCandidates = candidateLedger.candidates ?? [];
  const packets = candidateLedger.candidates.map((candidate) => {
    const sourceDraftRecipe = (sourceDraft?.recipes ?? []).find((recipe) => recipe.candidateId === candidate.candidateId) ?? null;
    const visual = visualLedger.candidates.find((entry) => entry.candidateId === candidate.candidateId) ?? null;
    const visualEvidence = visualFramesForCandidateEvidence(visualLedger, visual, candidate, allCandidates);
    const scopedVisual = visual ? { ...visual, frames: visualEvidence } : null;
    const visualFrameRefs = new Set(visualEvidence.map((frame) => frame.ref).filter(Boolean));
    const descriptionEvidence = extractDescriptionEvidence(sourcePacket, candidate, allCandidates);
    const transcriptEvidence = extractCaptionEvidence(sourcePacket, candidate, allCandidates);
    const stepEvidence = extractStepEvidence(sourcePacket, candidate, allCandidates);
    const visualStepEvidence = extractVisualStepEvidence(scopedVisual);
    const compactEvidenceBullets = buildCompactEvidenceBullets({
      descriptionEvidence,
      transcriptEvidence,
      stepEvidence,
      visualStepEvidence,
      visualEvidence,
      candidate,
      sourceDraftRecipe,
    });
    const amountCues = candidate.ingredientNames
      .map((name) => ({ name, cue: extractAmountFromSource(sourcePacket, name, candidate, allCandidates) }))
      .filter((entry) => entry.cue)
      .map((entry) => ({
        ingredient: entry.name,
        amount: entry.cue.amount,
        unit: entry.cue.unit,
        basis: entry.cue.amountBasis,
        evidenceRef: entry.cue.evidence,
      }));
    return {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      timeRange: candidate.timeRange,
      ingredientNames: candidate.ingredientNames,
      sharedIngredientSeeds: candidate.sharedIngredientSeeds,
      sourceCues: candidate.sourceCues,
      descriptionEvidence,
      transcriptEvidence,
      stepEvidence,
      visualStepEvidence,
      compactEvidenceBullets,
      visualEvidence,
      visualTargets: (visualTargetLedger?.targets ?? []).filter((target) => target.candidateId === candidate.candidateId),
      visualEstimates: (visualEstimates?.visualEstimates ?? [])
        .filter((estimate) => estimate.candidateId === candidate.candidateId)
        .filter((estimate) => visualFrameRefs.size === 0 || frameRefsFromEntries(estimate.evidence).some((ref) => visualFrameRefs.has(ref))),
      sourceDraft: sourceDraftRecipe,
      ingredientIdentityHints: sourceDraftRecipe?.ingredientIdentityHints ?? [],
      possibleIngredientHints: sourceDraftRecipe?.possibleIngredientHints ?? [],
      gapLedger: (gapLedger?.gaps ?? []).filter((gap) => gap.candidateId === candidate.candidateId),
      amountCues,
      uncertainties: candidate.uncertainties,
    };
  });
  return {
    schemaVersion: 1,
    kind: "evidence-packets",
    videoId: sourcePacket?.video?.videoId ?? null,
    packets,
  };
}

function visualFrameOverlapsEvidenceRange(frame, candidate, allCandidates = []) {
  const frameRange = frame?.range ?? {};
  const frameStart = optionalRangeNumber(frameRange.startSec);
  const frameEnd = optionalRangeNumber(frameRange.endSec);
  if (frameStart === null && frameEnd === null) return true;
  const evidenceRange = candidateEvidenceRange(candidate, allCandidates);
  const rangeStart = optionalRangeNumber(evidenceRange.startSec);
  const rangeEnd = optionalRangeNumber(evidenceRange.endSec);
  if (rangeStart === null || rangeEnd === null) return true;
  const start = frameStart ?? frameEnd;
  const end = frameEnd ?? frameStart;
  if (start === null || end === null) return true;
  return end > rangeStart && start < rangeEnd;
}

function identityTextForFrame(frame) {
  return normalizeTimelineText([
    ...(Array.isArray(frame?.observed) ? frame.observed : []),
    ...(Array.isArray(frame?.onscreenText) ? frame.onscreenText : []),
    ...(Array.isArray(frame?.quantityCues) ? frame.quantityCues : []),
  ].join(" "));
}

function candidateFrameIdentitySignals(candidate) {
  const full = uniqueStrings([
    ...(candidate?.ingredientNames ?? []),
    ...(candidate?.sharedIngredientSeeds ?? []),
  ]).map((value) => normalizeTimelineText(value)).filter((value) => [...value].length >= 2);
  const title = candidateTitleTokens(candidate).filter((value) => [...value].length >= 2);
  const suffixes = full
    .filter((value) => [...value].length >= 3)
    .map((value) => [...value].at(-1))
    .filter((value) => value && !new Set(["국", "탕", "밥", "면", "전", "장", "물", "살"]).has(value));
  return {
    full: uniqueStrings(full),
    title: uniqueStrings(title),
    suffixes: uniqueStrings(suffixes),
  };
}

function visualFrameIdentityScore(frame, candidate) {
  const text = identityTextForFrame(frame);
  if (!text) return 0;
  const signals = candidateFrameIdentitySignals(candidate);
  let score = 0;
  for (const token of signals.full) {
    if (text.includes(token)) score += 20;
  }
  for (const token of signals.title) {
    if (text.includes(token)) score += 12;
  }
  for (const token of signals.suffixes) {
    if (text.includes(token)) score += 4;
  }
  return score;
}

function visualFrameIdentityOwner(frame, candidates) {
  const scored = (candidates ?? [])
    .map((candidate) => ({
      candidate,
      score: visualFrameIdentityScore(frame, candidate),
    }))
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score);
  if (scored.length === 0) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  return scored[0].candidate;
}

function sharedRangeGroup(candidate, allCandidates = []) {
  const key = candidateRangeKey(candidate);
  if (!key) return [candidate];
  return (allCandidates ?? []).filter((entry) => candidateRangeKey(entry) === key);
}

function visualFramesForCandidateEvidence(visualLedger, visual, candidate, allCandidates = []) {
  const ownFrames = (visual?.frames ?? []).filter((frame) => visualFrameOverlapsEvidenceRange(frame, candidate, allCandidates));
  const group = sharedRangeGroup(candidate, allCandidates);
  if (group.length <= 1) return ownFrames;
  const groupIds = new Set(group.map((entry) => entry.candidateId));
  const frames = [];
  for (const visualEntry of visualLedger?.candidates ?? []) {
    if (!groupIds.has(visualEntry.candidateId)) continue;
    for (const frame of visualEntry.frames ?? []) {
      const owner = visualFrameIdentityOwner(frame, group);
      const originalOwnerId = visualEntry.candidateId;
      if (owner?.candidateId === candidate.candidateId) {
        frames.push(frame);
        continue;
      }
      if (!owner && originalOwnerId === candidate.candidateId && visualFrameOverlapsEvidenceRange(frame, candidate, allCandidates)) {
        frames.push(frame);
      }
    }
  }
  const seen = new Set();
  return frames.filter((frame) => {
    const key = frame?.ref ?? JSON.stringify(frame);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasFrameEvidence(estimate) {
  return frameRefsFromEntries(estimate?.evidence).length > 0;
}

function frameRefsInText(text) {
  return String(text ?? "").match(/frame:[^:\s,;)\]}]+(?::[^:\s,;)\]}]+)?:\d+/gu) ?? [];
}

function frameRefsFromEntries(entries) {
  return uniqueStrings((entries ?? []).flatMap(frameRefsInText));
}

function hasCountEvidence(estimate) {
  const countEvidence = cleanString(estimate?.countEvidence);
  if (!countEvidence) return false;
  const evidenceFrameRefs = new Set(frameRefsFromEntries(estimate?.evidence));
  if (evidenceFrameRefs.size === 0) return false;
  const countFrameRefs = frameRefsInText(countEvidence);
  return countFrameRefs.some((entry) => evidenceFrameRefs.has(entry));
}

function requiresReferenceObjectForVisualEstimate(estimate) {
  const ingredient = String(estimate?.ingredient ?? "");
  const unit = String(estimate?.unit ?? "");
  if (/^(?:개|쪽|알|장|줄기|송이|줌)$/u.test(unit)) return false;
  if (/^(?:g|kg|ml|l|큰술|작은술|컵|스푼|t|T)$/iu.test(unit)) return true;
  return /(?:소스|양념|장$|간장|식초|기름|오일|물|육수|우유|크림|술|와인|맛술|럼|시럽|꿀|액젓|고추장|된장|쌈장|마요|마요네즈|케첩|가루|분말|설탕|소금|후추|고춧가루|밀가루|전분)/u.test(ingredient);
}

function hasVisibleEstimateGate(estimate) {
  if (estimate?.targetVisible !== true) return false;
  if (estimate?.referenceObjectVisible === true) return true;
  return hasCountEvidence(estimate) && !requiresReferenceObjectForVisualEstimate(estimate);
}

export function applyVisualEstimateRepair({ output, visualEstimates }) {
  const recipes = (output.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: [...(recipe.ingredients ?? [])],
    steps: [...(recipe.steps ?? [])],
    uncertainties: [...(recipe.uncertainties ?? [])],
  }));
  const repairLog = [...(output.repairLog ?? [])];
  let patchIndex = repairLog.length + 1;

  for (const estimate of visualEstimates?.visualEstimates ?? []) {
    if (!estimate?.amount || !estimate?.unit) continue;
    if (estimate.amountBasis !== "visual-estimate") continue;
    if (Number(estimate.confidence ?? 0) < 0.2) continue;
    if (!hasFrameEvidence(estimate)) continue;
    if (!hasVisibleEstimateGate(estimate)) continue;
    const recipe = recipes.find((entry) => entry.candidateId === estimate.candidateId)
      ?? recipes.find((entry) => (entry.ingredients ?? []).some((ingredient) => sameIngredient(ingredient.name, estimate.ingredient)));
    if (!recipe) continue;
    const ingredient = recipe.ingredients.find((entry) => sameIngredient(entry.name, estimate.ingredient));
    if (!ingredient) continue;
    if (ingredient.amount !== null && ingredient.amount !== undefined && ingredient.unit !== null && ingredient.unit !== undefined) continue;
    const before = {
      name: ingredient.name,
      amount: ingredient.amount ?? null,
      unit: ingredient.unit ?? null,
      amountBasis: ingredient.amountBasis ?? null,
    };
    ingredient.amount = estimate.amount;
    ingredient.unit = estimate.unit;
    ingredient.amountBasis = "visual-estimate";
    ingredient.confidence = Math.max(Number(ingredient.confidence ?? 0), Number(estimate.confidence ?? 0));
    ingredient.evidence = uniqueStrings([...(ingredient.evidence ?? []), ...(estimate.evidence ?? [])]);
    repairLog.push({
      patchId: `visual-repair-${patchIndex++}`,
      candidateId: recipe.candidateId ?? estimate.candidateId,
      field: "amount",
      before,
      after: {
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        amountBasis: ingredient.amountBasis,
      },
      evidenceRef: estimate.evidence,
      reasonCode: "visual_estimate_from_reference_object",
      reason: estimate.reason ?? null,
      confidence: Number(estimate.confidence ?? 0),
      targetVisible: estimate.targetVisible === true,
      referenceObjectVisible: estimate.referenceObjectVisible === true,
      countEvidence: estimate.countEvidence ?? null,
    });
  }

  return { recipes, repairLog };
}

function frameEntriesFromVisualLedger(visualLedger) {
  const frames = [];
  for (const target of visualLedger?.targets ?? []) {
    for (const frame of target.frames ?? []) {
      frames.push({
        ...frame,
        targetId: frame.targetId ?? target.targetId,
        candidateId: frame.candidateId ?? target.candidateId,
        ingredient: frame.ingredient ?? target.ingredient,
      });
    }
  }
  for (const candidate of visualLedger?.candidates ?? []) {
    for (const frame of candidate.frames ?? []) {
      frames.push({
        ...frame,
        candidateId: frame.candidateId ?? candidate.candidateId,
      });
    }
  }
  return frames;
}

export function validateFinalVisualEvidenceContract(output, { visualLedger = null, visualEstimates = null, auditMode = false } = {}) {
  const recipes = (output.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients ?? []).map((ingredient) => ({ ...ingredient })),
    steps: [...(recipe.steps ?? [])],
    uncertainties: [...(recipe.uncertainties ?? [])],
  }));
  const repairLog = [...(output.repairLog ?? [])];
  const warnings = [];
  let failureCount = 0;
  const framesByRef = new Map(frameEntriesFromVisualLedger(visualLedger).filter((frame) => frame.ref).map((frame) => [frame.ref, frame]));
  const estimates = visualEstimates?.visualEstimates ?? [];
  const consumedFrameRefs = new Set(repairLog.flatMap((entry) => Array.isArray(entry.evidenceRef) ? entry.evidenceRef : []).filter((ref) => String(ref).startsWith("frame:")));
  let patchIndex = repairLog.length + 1;

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients ?? []) {
      if (ingredient.amountBasis !== "visual-estimate") continue;
      if (ingredient.amount === null && ingredient.unit === null) continue;
      const frameRefs = uniqueStrings([
        ...(Array.isArray(ingredient.evidence) ? ingredient.evidence : []),
        ...[...consumedFrameRefs],
      ].filter((ref) => String(ref).startsWith("frame:")));
      let matchedEstimate = null;
      const validFrameRef = frameRefs.find((frameRef) => {
        const frame = framesByRef.get(frameRef);
        if (!frame) return false;
        if (recipe.candidateId && frame.candidateId && recipe.candidateId !== frame.candidateId) return false;
        if (frame.ingredient && !sameIngredient(frame.ingredient, ingredient.name)) return false;
        const estimate = estimates.find((entry) => (entry.evidence ?? []).includes(frameRef));
        if (!estimate) return false;
        if (estimate.candidateId && recipe.candidateId && estimate.candidateId !== recipe.candidateId) return false;
        if (!sameIngredient(estimate.ingredient, ingredient.name)) return false;
        if (!hasVisibleEstimateGate(estimate)) return false;
        matchedEstimate = estimate;
        return true;
      });
      if (validFrameRef) {
        if (!consumedFrameRefs.has(validFrameRef)) {
          repairLog.push({
            patchId: `visual-consumption-${patchIndex++}`,
            candidateId: recipe.candidateId ?? matchedEstimate?.candidateId ?? null,
            field: `ingredients[${ingredient.name}].amount`,
            before: null,
            after: {
              name: ingredient.name,
              amount: ingredient.amount ?? null,
              unit: ingredient.unit ?? null,
              amountBasis: ingredient.amountBasis ?? null,
            },
            evidenceRef: matchedEstimate?.evidence ?? [validFrameRef],
            reasonCode: "visual_estimate_from_reference_object",
            reason: matchedEstimate?.reason ?? "detail output consumed frame-backed visual estimate",
            confidence: Number(matchedEstimate?.confidence ?? ingredient.confidence ?? 0.4),
            targetVisible: matchedEstimate?.targetVisible === true,
            referenceObjectVisible: matchedEstimate?.referenceObjectVisible === true,
            countEvidence: matchedEstimate?.countEvidence ?? null,
          });
          consumedFrameRefs.add(validFrameRef);
        }
        continue;
      }
      failureCount += 1;
      const before = {
        name: ingredient.name,
        amount: ingredient.amount ?? null,
        unit: ingredient.unit ?? null,
        amountBasis: ingredient.amountBasis ?? null,
      };
      warnings.push({
        candidateId: recipe.candidateId ?? null,
        ingredient: ingredient.name,
        reasonCode: "visual_evidence_contract_failed",
        frameRefs,
      });
      if (auditMode) continue;
      ingredient.amount = null;
      ingredient.unit = null;
      ingredient.amountBasis = null;
      ingredient.evidence = Array.isArray(ingredient.evidence)
        ? ingredient.evidence.filter((entry) => !String(entry).startsWith("frame:"))
        : ingredient.evidence;
      repairLog.push({
        patchId: `visual-contract-fallback-${patchIndex++}`,
        candidateId: recipe.candidateId ?? null,
        field: `ingredients[${ingredient.name}].amount`,
        before,
        after: {
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          amountBasis: ingredient.amountBasis,
        },
        evidenceRef: frameRefs,
        reasonCode: "visual_evidence_contract_fallback",
        reason: "final visual-estimate lacked a valid consumed frame estimate",
        confidence: 1,
      });
    }
  }

  return {
    output: { ...output, recipes, repairLog },
    warnings,
    failureCount,
  };
}

function sameIngredient(left, right) {
  const l = cleanString(left)?.replace(/\s+/gu, "");
  const r = cleanString(right)?.replace(/\s+/gu, "");
  return Boolean(l && r && (l === r || l.includes(r) || r.includes(l)));
}

function commonSuffixLength(left, right) {
  const l = [...String(left ?? "")];
  const r = [...String(right ?? "")];
  let count = 0;
  while (count < l.length && count < r.length && l[l.length - 1 - count] === r[r.length - 1 - count]) {
    count += 1;
  }
  return count;
}

function titleSeparatorBetween(sourceTitle, leftTitle, rightTitle) {
  const leftIndex = sourceTitle.indexOf(leftTitle);
  const rightIndex = sourceTitle.indexOf(rightTitle, leftIndex + leftTitle.length);
  if (leftIndex < 0 || rightIndex < 0) return null;
  return sourceTitle.slice(leftIndex + leftTitle.length, rightIndex);
}

function shouldMergeAdjacentCandidates(sourceTitle, left, right) {
  const separator = titleSeparatorBetween(sourceTitle, left.title, right.title);
  if (separator === null) return false;
  if (/[ㅣ|,&,/·•:;+\-]/u.test(separator)) return false;
  if (separator.replace(/\s+/gu, "") !== "") return false;
  return commonSuffixLength(left.title, right.title) >= 2;
}

function splitMenuGroupTitle(title) {
  return uniqueStrings(decodeTextEntities(title)
    .split(/\s*(?:&|\/|\+|,|，|ㅣ|\|)\s*/u)
    .flatMap((part) => part.split(/(?:과|와|랑|하고|및)\s+/u))
    .map((part) => part.trim())
    .filter((part) => [...part].length >= 2));
}

function normalizedPartsAppearInOrder(parts, normalizedText) {
  let offset = 0;
  for (const part of parts) {
    const index = normalizedText.indexOf(part, offset);
    if (index < 0) return false;
    offset = index + part.length;
  }
  return true;
}

function descriptionGroupEntries(sourcePacket) {
  return [
    ...descriptionMenuGroupEntries(sourcePacket),
    ...extractDescriptionTimelineEntries(sourcePacket),
  ];
}

function descriptionGroupLineForTitle(sourcePacket, title) {
  const normalizedTitle = normalizeTimelineText(title);
  if (!normalizedTitle) return null;
  const titleParts = splitMenuGroupTitle(title)
    .map((part) => normalizeTimelineText(part))
    .filter((part) => [...part].length >= 2);
  return descriptionGroupEntries(sourcePacket)
    .find((entry) => {
      if (entry.normalizedTitle.includes(normalizedTitle)) return true;
      if (normalizedTitle.includes(entry.normalizedTitle)) return true;
      return titleParts.length > 1 && normalizedPartsAppearInOrder(titleParts, entry.normalizedTitle);
    }) ?? null;
}

function assignMenuGroupIngredients(parts, sourceIngredients) {
  const assignments = parts.map(() => []);
  const shared = [];
  for (const ingredient of sourceIngredients) {
    const matches = parts
      .map((title, index) => ({ index, matches: sameIngredient(ingredient, title) }))
      .filter((entry) => entry.matches);
    if (matches.length === 1) {
      assignments[matches[0].index].push(ingredient);
      continue;
    }
    shared.push(ingredient);
  }
  return { assignments, shared: uniqueStrings(shared) };
}

function splitDescriptionMenuGroupCandidate(candidate, sourcePacket) {
  const menuLine = descriptionGroupLineForTitle(sourcePacket, candidate?.title);
  if (!menuLine) return null;
  const parts = splitMenuGroupTitle(candidate.title);
  if (parts.length <= 1) return null;
  const sourceIngredients = uniqueStrings(candidate.ingredientNames ?? []);
  const ingredientAssignment = assignMenuGroupIngredients(parts, sourceIngredients);
  const splitCandidates = parts.map((title, index) => ({
    ...candidate,
    candidateId: `${candidate.candidateId}.${index + 1}`,
    title,
    aliases: uniqueStrings([title]),
    ingredientNames: uniqueStrings(ingredientAssignment.assignments[index] ?? []),
    sharedIngredientSeeds: uniqueStrings([...(candidate.sharedIngredientSeeds ?? []), ...ingredientAssignment.shared]),
    evidence: uniqueStrings([...(candidate.evidence ?? []), `description:${menuLine.line}`]),
    sourceCues: uniqueStrings([...(candidate.sourceCues ?? []), `description:${menuLine.line}`]),
    uncertainties: uniqueStrings([
      ...(candidate.uncertainties ?? []),
      "description 메뉴 묶음 후보를 연결어 기준으로 분리",
      "묶음 후보 재료 seed는 sharedIngredientSeeds로만 보존하고 후보 확정 재료로 복사하지 않음",
    ]),
  }));
  return { menuLine, splitCandidates };
}

export function applyGenericCandidateRepair({ candidateOutput, sourcePacket }) {
  const sourceTitle = sourcePacket?.video?.title ?? "";
  const splitCandidates = [];
  const candidateRepairLog = [...(candidateOutput.candidateRepairLog ?? [])];
  let patchIndex = candidateRepairLog.length + 1;

  for (const candidate of candidateOutput.candidates ?? []) {
    const split = splitDescriptionMenuGroupCandidate(candidate, sourcePacket);
    if (!split) {
      splitCandidates.push(candidate);
      continue;
    }
    splitCandidates.push(...split.splitCandidates);
    candidateRepairLog.push({
      patchId: `candidate-repair-${patchIndex++}`,
      field: "candidate",
      before: candidate,
      after: split.splitCandidates,
      evidenceRef: [`description:${split.menuLine.line}`],
      reasonCode: split.menuLine.kind === "description-timeline"
        ? "split_description_group_candidate"
        : "split_description_menu_group_candidate",
      confidence: 0.65,
    });
  }

  const repaired = [];
  let index = 0;

  while (index < splitCandidates.length) {
    const current = splitCandidates[index];
    const next = splitCandidates[index + 1];
    if (next && shouldMergeAdjacentCandidates(sourceTitle, current, next)) {
      const merged = {
        ...current,
        title: `${current.title} ${next.title}`,
        ingredientNames: uniqueStrings([...(current.ingredientNames ?? []), ...(next.ingredientNames ?? [])]),
        evidence: uniqueStrings([...(current.evidence ?? []), ...(next.evidence ?? []), "title:whitespace-variant-merge"]),
        uncertainties: uniqueStrings([
          ...(current.uncertainties ?? []),
          ...(next.uncertainties ?? []),
          "제목에서 강한 구분자 없이 공백으로 이어진 같은 계열 음식명을 한 후보로 병합",
        ]),
      };
      repaired.push(merged);
      candidateRepairLog.push({
        patchId: `candidate-repair-${patchIndex++}`,
        field: "candidate",
        before: [current, next],
        after: merged,
        evidenceRef: ["title"],
        reasonCode: "merge_whitespace_variant_titles",
        confidence: 0.65,
      });
      index += 2;
      continue;
    }
    repaired.push(current);
    index += 1;
  }

  return {
    ...candidateOutput,
    candidates: repaired,
    candidateRepairLog,
  };
}

export function applyGenericRepair({ output, candidateOutput, sourcePacket }) {
  const recipes = (output.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: [...(recipe.ingredients ?? [])],
    steps: [...(recipe.steps ?? [])],
    uncertainties: [...(recipe.uncertainties ?? [])],
  }));
  const repairLog = [...(output.repairLog ?? [])];
  let patchIndex = repairLog.length + 1;
  const allCandidates = candidateOutput.candidates ?? [];

  for (const recipe of recipes) {
    const candidate = candidateOutput.candidates.find((entry) => entry.candidateId === recipe.candidateId)
      ?? candidateOutput.candidates.find((entry) => sameIngredient(entry.title, recipe.title));
    if (!candidate) continue;
    const directIngredientNames = uniqueStrings(candidate.ingredientNames ?? []);
    const repairIngredientNames = candidateIngredientNamesWithScopedSharedSeeds(sourcePacket, candidate, allCandidates);
    recipe.ingredients = recipe.ingredients.filter((ingredient) => {
      const analysis = ingredientSourceAnalysis(sourcePacket, candidate, ingredient.name, allCandidates);
      if (analysis.confirmed || frameRefsFromEntries(ingredient.evidence).length > 0) return true;
      repairLog.push({
        patchId: `generic-repair-${patchIndex++}`,
        candidateId: recipe.candidateId ?? candidate.candidateId,
        field: "ingredient",
        before: ingredient,
        after: null,
        evidenceRef: Array.isArray(ingredient.evidence) ? ingredient.evidence : analysis.identityEvidence,
        reasonCode: "remove_dish_identity_only_ingredient",
        confidence: 0.8,
      });
      return false;
    });
    for (const ingredientName of repairIngredientNames) {
      const existing = recipe.ingredients.find((ingredient) => sameIngredient(ingredient.name, ingredientName));
      const analysis = ingredientSourceAnalysis(sourcePacket, candidate, ingredientName, allCandidates);
      const amountCue = analysis.amountCue;
      const sourceEvidence = analysis.sourceEvidence;
      const isDirectIngredient = directIngredientNames.some((entry) => sameIngredient(entry, ingredientName));
      if (!analysis.confirmed && !existing) continue;
      if (!existing) {
        const evidence = amountCue?.evidence?.length
          ? amountCue.evidence
          : sourceEvidence.length > 0
          ? sourceEvidence
          : isDirectIngredient && analysis.confirmed
          ? candidate.evidence ?? []
          : [];
        const added = {
          name: ingredientName,
          amount: amountCue?.amount ?? null,
          unit: amountCue?.unit ?? null,
          amountBasis: amountCue?.amountBasis ?? null,
          confidence: amountCue ? 0.75 : 0.45,
          evidence,
        };
        recipe.ingredients.push(added);
        repairLog.push({
          patchId: `generic-repair-${patchIndex++}`,
          candidateId: recipe.candidateId ?? candidate.candidateId,
          field: "ingredient",
          before: null,
          after: added,
          evidenceRef: added.evidence,
          reasonCode: "missing_evidence_backed_ingredient",
          confidence: added.confidence,
        });
        continue;
      }
      if ((existing.amount === null || existing.amount === undefined || existing.unit === null || existing.unit === undefined) && amountCue) {
        const before = { amount: existing.amount ?? null, unit: existing.unit ?? null, amountBasis: existing.amountBasis ?? null };
        existing.amount = amountCue.amount;
        existing.unit = amountCue.unit;
        existing.amountBasis = amountCue.amountBasis;
        existing.evidence = uniqueStrings([...(existing.evidence ?? []), ...amountCue.evidence]);
        existing.confidence = Math.max(Number(existing.confidence ?? 0), 0.75);
        repairLog.push({
          patchId: `generic-repair-${patchIndex++}`,
          candidateId: recipe.candidateId ?? candidate.candidateId,
          field: "amount",
          before,
          after: { amount: existing.amount, unit: existing.unit, amountBasis: existing.amountBasis },
          evidenceRef: amountCue.evidence,
          reasonCode: "amount_from_source_packet",
          confidence: 0.75,
        });
      }
    }
  }
  return { recipes, repairLog };
}

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function hashFile(filePath) {
  return hashText(await readFile(filePath, "utf8"));
}

export async function freezePiExtraction({ projectRoot = process.cwd(), dataRoot = "notebooks/recipe_loop_data", split = "train", outTag, ids = null }) {
  if (!outTag) throw new Error("outTag is required");
  const splitDir = path.join(projectRoot, dataRoot, split);
  const resolvedIds = ids ?? (await readdir(splitDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const cases = [];
  for (const id of resolvedIds) {
    const runDir = path.join(splitDir, id, "runs", outTag);
    const files = {};
    for (const fileName of [
      "result.json",
      "candidate-ledger.json",
      "source-draft.json",
      "gap-ledger.json",
      "visual-target-ledger.json",
      "visual-ledger.json",
      "visual-estimates.json",
      "evidence-packets.json",
      "file-access-manifest.json",
      "source-packet.json",
    ]) {
      const filePath = path.join(runDir, fileName);
      files[fileName] = existsSync(filePath)
        ? { exists: true, sha256: await hashFile(filePath), bytes: (await readFile(filePath)).length }
        : { exists: false, sha256: null, bytes: 0 };
    }
    let manifest = null;
    const manifestPath = path.join(runDir, "file-access-manifest.json");
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    }
    cases.push({
      videoId: id,
      runDir: path.relative(projectRoot, runDir),
      completed: files["result.json"].exists,
      forbiddenReadCount: manifest?.forbiddenReadEvents?.length ?? null,
      readEvents: manifest?.readEvents ?? [],
      files,
    });
  }
  const freeze = {
    schemaVersion: 1,
    kind: "pi-extraction-freeze",
    split,
    outTag,
    frozenAt: new Date().toISOString(),
    policy: {
      gradingAllowedAfterFreeze: true,
      goldenReadDuringFreeze: false,
    },
    caseCount: cases.length,
    completedCount: cases.filter((item) => item.completed).length,
    forbiddenReadCount: cases.reduce((sum, item) => sum + Number(item.forbiddenReadCount ?? 0), 0),
    cases,
  };
  const freezePath = path.join(splitDir, `_pi_freeze.${outTag}.json`);
  await writeFile(freezePath, JSON.stringify(freeze, null, 2) + "\n", "utf8");
  return { freeze, freezePath };
}
