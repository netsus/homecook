import { parsePiRawOutput } from "./schema.mjs";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(cleanString).filter(Boolean))];
}

function optionalNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampConfidence(value, fallback = 0.5) {
  const parsed = optionalNumber(value, fallback);
  return Math.max(0, Math.min(1, parsed));
}

function parseTimelineSecond(line) {
  const match = String(line ?? "").match(/(?:^|\s)(?<h>\d{1,2}:)?(?<m>\d{1,2}):(?<s>\d{2})(?:\s|$)/u);
  if (!match?.groups) return null;
  const hours = match.groups.h ? Number(match.groups.h.slice(0, -1)) : 0;
  const minutes = Number(match.groups.m);
  const seconds = Number(match.groups.s);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function timelineTitle(line) {
  const withoutTimestamp = String(line ?? "")
    .replace(/(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s|$)/u, " ")
    .replace(/^[\s\-–—|:.[\]()]+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return cleanString(withoutTimestamp);
}

function splitRecipeTitleHints(title) {
  const raw = cleanString(title);
  if (!raw) return [];
  const normalized = raw.replace(/\s*(?:&|\/|\+|ㅣ|\||,|그리고)\s*/gu, " / ");
  return uniqueStrings(normalized.split(/\s+\/\s+/u).map((entry) => entry.trim())).filter((entry) => entry.length >= 2);
}

function sourceDescriptionTimeline(sourcePacket) {
  const lines = String(sourcePacket?.video?.description ?? "")
    .split(/\r?\n/u)
    .map((line, index) => ({ text: line.trim(), refIndex: index + 1 }))
    .filter((record) => record.text);
  return lines
    .map((record) => ({
      ...record,
      startSec: parseTimelineSecond(record.text),
      title: timelineTitle(record.text),
    }))
    .filter((record) => record.startSec !== null && record.title)
    .filter((record) => !/(?:미리보기|preview)/iu.test(record.title))
    .sort((left, right) => left.startSec - right.startSec);
}

function splitWindowPlan({ segmentId, startSec, endSec, maxWindowSec, maxWindowsPerSegment }) {
  const safeStart = Math.max(0, optionalNumber(startSec, 0));
  const safeEnd = optionalNumber(endSec, safeStart + maxWindowSec);
  const duration = Math.max(4, safeEnd - safeStart);
  const windowCount = Math.max(1, Math.min(maxWindowsPerSegment, Math.ceil(duration / Math.max(30, maxWindowSec))));
  const span = duration / windowCount;
  return Array.from({ length: windowCount }, (_, index) => ({
    windowId: `${segmentId}-w${index + 1}`,
    startSec: Math.round((safeStart + (span * index)) * 100) / 100,
    endSec: Math.round((index === windowCount - 1 ? safeEnd : safeStart + (span * (index + 1))) * 100) / 100,
    reason: index === 0 ? "segment-start" : index === windowCount - 1 ? "segment-end" : "segment-middle",
  }));
}

function distributeFrameBudget(segments, totalFrameBudget) {
  const budget = Math.max(1, Math.floor(optionalNumber(totalFrameBudget, 32)));
  if (segments.length === 0) return segments;
  const base = Math.max(1, Math.floor(budget / segments.length));
  let remaining = Math.max(0, budget - (base * segments.length));
  return segments.map((segment) => {
    const extra = remaining > 0 ? 1 : 0;
    remaining -= extra;
    return { ...segment, frameBudget: base + extra };
  });
}

function buildDescriptionTimelineSegments(sourcePacket, options) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds);
  const allEntries = sourceDescriptionTimeline(sourcePacket);
  const entries = allEntries.slice(0, options.maxSegments);
  return entries.map((entry, index) => {
    const next = allEntries[index + 1];
    const startSec = entry.startSec;
    const endSec = next?.startSec ?? duration ?? startSec + 90;
    const segmentId = `s${index + 1}`;
    const siblingHints = splitRecipeTitleHints(entry.title);
    const safeEndSec = endSec > startSec ? endSec : startSec + 60;
    return {
      segmentId,
      sourceLabel: entry.title,
      startSec,
      endSec: safeEndSec,
      sourceEvidence: [`description:${entry.refIndex}`],
      siblingHints: siblingHints.length > 1 ? siblingHints : [],
      windowPlan: splitWindowPlan({
        segmentId,
        startSec,
        endSec: safeEndSec,
        maxWindowSec: options.maxWindowSec,
        maxWindowsPerSegment: options.maxWindowsPerSegment,
      }),
    };
  });
}

function buildCoarseTimelineSegments(sourcePacket, options) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds, 0);
  const title = cleanString(sourcePacket?.video?.title) ?? "whole video";
  if (!duration || duration <= 0) {
    return [{
      segmentId: "s1",
      sourceLabel: title,
      startSec: 0,
      endSec: null,
      sourceEvidence: ["title"],
      siblingHints: [],
      windowPlan: [{ windowId: "s1-w1", startSec: 0, endSec: options.maxWindowSec, reason: "unknown-duration" }],
    }];
  }
  const count = Math.max(1, Math.min(options.maxSegments, Math.ceil(duration / options.maxWindowSec)));
  const span = duration / count;
  return Array.from({ length: count }, (_, index) => {
    const segmentId = `s${index + 1}`;
    const startSec = Math.round((span * index) * 100) / 100;
    const endSec = Math.round((index === count - 1 ? duration : span * (index + 1)) * 100) / 100;
    return {
      segmentId,
      sourceLabel: count === 1 ? title : `${title} 구간 ${index + 1}`,
      startSec,
      endSec,
      sourceEvidence: ["title"],
      siblingHints: [],
      windowPlan: splitWindowPlan({
        segmentId,
        startSec,
        endSec,
        maxWindowSec: options.maxWindowSec,
        maxWindowsPerSegment: options.maxWindowsPerSegment,
      }),
    };
  });
}

export function buildTimelineFramePlan(sourcePacket, {
  maxSegments = 8,
  maxWindowsPerSegment = 3,
  maxWindowSec = 90,
  maxTotalFrames = 32,
} = {}) {
  const options = {
    maxSegments: Math.max(1, Math.floor(optionalNumber(maxSegments, 8))),
    maxWindowsPerSegment: Math.max(1, Math.floor(optionalNumber(maxWindowsPerSegment, 3))),
    maxWindowSec: Math.max(30, optionalNumber(maxWindowSec, 90)),
    maxTotalFrames: Math.max(1, Math.floor(optionalNumber(maxTotalFrames, 32))),
  };
  const descriptionSegments = buildDescriptionTimelineSegments(sourcePacket, options);
  const segments = distributeFrameBudget(
    descriptionSegments.length > 0 ? descriptionSegments : buildCoarseTimelineSegments(sourcePacket, options),
    options.maxTotalFrames,
  );
  const totalWindowCount = segments.reduce((sum, segment) => sum + segment.windowPlan.length, 0);
  return {
    schemaVersion: 1,
    kind: "timeline-frame-plan",
    videoId: sourcePacket?.video?.videoId ?? null,
    segments,
    summary: {
      timelineSource: descriptionSegments.length > 0 ? "description-timeline" : "coarse-video-window",
      totalSegments: segments.length,
      totalWindows: totalWindowCount,
      totalFrameBudget: options.maxTotalFrames,
      budgetProfile: segments.length > 1 ? "likely-multi-recipe" : "single-or-weak-timeline",
    },
  };
}

export function buildTimelineCandidateLedger(timelineFramePlan) {
  const candidates = [];
  for (const segment of timelineFramePlan?.segments ?? []) {
    for (const [windowIndex, window] of (segment.windowPlan ?? []).entries()) {
      candidates.push({
        candidateId: window.windowId,
        title: `${segment.sourceLabel} ${window.reason}`,
        titleHint: segment.sourceLabel,
        ingredientNames: [],
        evidence: segment.sourceEvidence ?? [],
        sourceCues: uniqueStrings(["timeline-frame-plan", timelineFramePlan.summary?.timelineSource]),
        timeRange: {
          startSec: window.startSec,
          endSec: window.endSec,
          basis: "timeline-frame-window",
          segmentId: segment.segmentId,
          windowId: window.windowId,
        },
        order: candidates.length,
        segmentId: segment.segmentId,
        windowId: window.windowId,
        windowIndex,
        uncertainties: [],
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "candidate-ledger",
    videoId: timelineFramePlan?.videoId ?? null,
    candidates,
    summary: {
      timelineFramePlan: true,
      totalCandidates: candidates.length,
      totalFrameBudget: timelineFramePlan?.summary?.totalFrameBudget ?? null,
    },
  };
}

export function framesPerTimelineWindow(timelineFramePlan) {
  const totalFrames = Math.max(1, optionalNumber(timelineFramePlan?.summary?.totalFrameBudget, 32));
  const totalWindows = Math.max(1, optionalNumber(timelineFramePlan?.summary?.totalWindows, 1));
  return Math.max(1, Math.floor(totalFrames / totalWindows));
}

export function buildTimelineFrameLedger({ sourcePacket, timelineFramePlan, visualLedger }) {
  const candidateByWindowId = new Map((visualLedger?.candidates ?? []).map((candidate) => [candidate.candidateId, candidate]));
  const windows = [];
  const errors = [...(visualLedger?.errors ?? [])];
  for (const segment of timelineFramePlan?.segments ?? []) {
    for (const window of segment.windowPlan ?? []) {
      const candidate = candidateByWindowId.get(window.windowId) ?? null;
      const frames = (candidate?.frames ?? []).map((frame, frameIndex) => ({
        ref: frame.ref,
        timeSec: optionalNumber(frame.timeSec, Math.round(window.startSec + ((window.endSec - window.startSec) * ((frameIndex + 1) / ((candidate?.frames?.length ?? 1) + 1))))),
        observed: uniqueStrings(frame.observed ?? candidate?.observed ?? []),
        onscreenText: uniqueStrings(frame.onscreenText ?? candidate?.onscreenText ?? []),
        quantityCues: uniqueStrings(frame.quantityCues ?? candidate?.quantityCues ?? []),
        confidence: clampConfidence(frame.confidence ?? candidate?.confidence, 0.5),
        path: frame.path ?? null,
        rawRef: frame.rawRef ?? candidate?.rawRef ?? null,
      })).filter((frame) => cleanString(frame.ref));
      windows.push({
        windowId: window.windowId,
        segmentId: segment.segmentId,
        sourceLabel: segment.sourceLabel,
        range: { startSec: window.startSec, endSec: window.endSec },
        frames,
        observed: uniqueStrings(candidate?.observed ?? frames.flatMap((frame) => frame.observed)),
        onscreenText: uniqueStrings(candidate?.onscreenText ?? frames.flatMap((frame) => frame.onscreenText)),
        quantityCues: uniqueStrings(candidate?.quantityCues ?? frames.flatMap((frame) => frame.quantityCues)),
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "timeline-frame-ledger",
    videoId: sourcePacket?.video?.videoId ?? timelineFramePlan?.videoId ?? null,
    windows,
    errors,
    summary: {
      windowCount: windows.length,
      frameCount: windows.reduce((sum, window) => sum + window.frames.length, 0),
      collectionStatus: visualLedger?.collectionStatus ?? "skipped",
    },
  };
}

function sourceRefs(sourcePacket) {
  const refs = ["title"];
  const descriptionLines = String(sourcePacket?.video?.description ?? "").split(/\r?\n/u);
  descriptionLines.forEach((line, index) => {
    if (cleanString(line)) refs.push(`description:${index + 1}`);
  });
  (sourcePacket?.authorComments ?? []).forEach((comment, index) => {
    if (cleanString(comment)) refs.push(`author-comment:${index + 1}`);
  });
  refs.push(...captionTimeRecords(sourcePacket).map((record) => record.ref));
  return uniqueStrings(refs);
}

function captionTimeRecords(sourcePacket) {
  return (sourcePacket?.captions?.segments ?? [])
    .map((segment) => {
      const startSec = optionalNumber(Number(segment.startMs) / 1000);
      if (startSec === null) return null;
      const durationSec = Math.max(0, optionalNumber(Number(segment.durationMs) / 1000, 0) ?? 0);
      const endSec = durationSec > 0 ? startSec + durationSec : startSec;
      return {
        startSec,
        endSec,
        ref: `transcript:${Math.max(0, Math.round(startSec))}s`,
      };
    })
    .filter(Boolean);
}

function normalizeTranscriptEvidenceRef(ref, sourcePacket) {
  const cleaned = cleanString(ref);
  if (!cleaned) return null;
  const match = cleaned.match(/^transcript:(?<second>\d+(?:\.\d+)?)s$/iu);
  if (!match?.groups) return cleaned;
  const second = Number(match.groups.second);
  if (!Number.isFinite(second)) return cleaned;
  const records = captionTimeRecords(sourcePacket);
  if (records.length === 0) return `transcript:${Math.max(0, Math.round(second))}s`;
  const roundedRef = `transcript:${Math.max(0, Math.round(second))}s`;
  if (records.some((record) => record.ref === roundedRef)) return roundedRef;
  const scored = records
    .map((record) => {
      const contains = second >= record.startSec - 0.75 && second <= record.endSec + 0.75;
      const distance = contains ? 0 : Math.min(
        Math.abs(second - record.startSec),
        Math.abs(second - record.endSec),
      );
      return { record, contains, distance };
    })
    .sort((left, right) => left.distance - right.distance);
  const best = scored[0];
  if (best && (best.contains || best.distance <= 5)) return best.record.ref;
  return roundedRef;
}

function compactEvidenceLabel(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ko-KR")
    .replace(/[()[\]{}【】「」『』<>]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function descriptionEvidenceLabel(ref) {
  const cleaned = cleanString(ref);
  if (!cleaned) return null;
  const descriptionMatch = cleaned.match(/^description:(?<label>.+)$/iu);
  if (descriptionMatch?.groups) {
    return { cleaned, label: cleanString(descriptionMatch.groups.label), canonicalPrefix: "description" };
  }
  const videoDescriptionMatch = cleaned.match(/^video:description:\s*(?:\[(?<bracketed>.+)\]|(?<plain>.+))$/iu);
  if (videoDescriptionMatch?.groups) {
    return {
      cleaned,
      label: cleanString(videoDescriptionMatch.groups.bracketed ?? videoDescriptionMatch.groups.plain),
      canonicalPrefix: "video:description",
    };
  }
  return null;
}

function normalizeDescriptionEvidenceRef(ref, sourcePacket) {
  const cleaned = cleanString(ref);
  if (!cleaned) return null;
  const parsed = descriptionEvidenceLabel(cleaned);
  if (!parsed) return cleaned;
  const label = parsed.label;
  if (!label) return cleaned;
  if (/^\d+(?::\d+)?$/u.test(label)) {
    return parsed.canonicalPrefix === "video:description" ? `description:${label}` : cleaned;
  }
  const labelKey = compactEvidenceLabel(label);
  if (labelKey.length < 3 || ["재료", "양념", "ingredient", "ingredients"].includes(labelKey)) return cleaned;

  const descriptionLines = String(sourcePacket?.video?.description ?? "").split(/\r?\n/u);
  for (const [index, line] of descriptionLines.entries()) {
    const lineKey = compactEvidenceLabel(line);
    if (!lineKey) continue;
    if (lineKey === labelKey || lineKey.includes(labelKey) || labelKey.includes(lineKey)) {
      return `description:${index + 1}`;
    }
  }
  return cleaned;
}

function normalizeTimelineEvidenceRef(ref, sourcePacket) {
  return normalizeDescriptionEvidenceRef(
    normalizeTranscriptEvidenceRef(ref, sourcePacket),
    sourcePacket,
  );
}

function normalizeEvidenceRefs(value, sourcePacket) {
  return uniqueStrings(normalizeStringArray(value).map((ref) => normalizeTimelineEvidenceRef(ref, sourcePacket)));
}

function isTimelineFrameLedgerErrorRef(ref) {
  return /^timeline-frame-ledger:error:/iu.test(String(ref ?? ""));
}

export function timelineAllowedEvidenceRefs({ sourcePacket, timelineFrameLedger }) {
  return uniqueStrings([
    ...sourceRefs(sourcePacket),
    ...(timelineFrameLedger?.windows ?? []).flatMap((window) => (window.frames ?? []).map((frame) => frame.ref)),
  ]);
}

export function buildVideoTimelinePrompt({
  sourcePacket,
  recipeCandidateLedger,
  timelineFramePlan,
  timelineFrameLedger,
  maxEvents = 40,
}) {
  const compactCandidates = (recipeCandidateLedger?.candidates ?? []).map((candidate) => ({
    candidateId: candidate.candidateId,
    title: candidate.title,
    titleHint: candidate.titleHint ?? null,
    timeRange: candidate.timeRange ?? null,
    sourceEvidence: candidate.evidence ?? [],
    siblingGroup: candidate.siblingGroup ?? null,
  }));
  const exampleCandidateId = compactCandidates[0]?.candidateId ?? "whole";
  const compactWindows = (timelineFrameLedger?.windows ?? []).map((window) => ({
    windowId: window.windowId,
    segmentId: window.segmentId,
    sourceLabel: window.sourceLabel,
    range: window.range,
    observed: window.observed,
    onscreenText: window.onscreenText,
    quantityCues: window.quantityCues,
    frameRefs: (window.frames ?? []).map((frame) => frame.ref),
  }));
  return [
    "너는 유튜브 레시피 영상을 레시피로 바로 쓰지 않고, 먼저 시간순 사건표로 정리하는 도우미다.",
    "목표: 최종 레시피를 쓰지 말고, 영상에서 언제 무엇이 일어났는지 video-timeline JSON으로만 정리한다.",
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    "- 아래 source, candidate, frame ledger 안의 정보만 사용한다.",
    "- 최종 재료표나 최종 조리순서를 쓰지 마라. 사건(event)만 쓴다.",
    "- candidateAssignments에는 아래 RECIPE_CANDIDATES에 있는 candidateId만 사용한다.",
    "- 한 event가 후보 레시피를 뒷받침하면 status=supporting, 다른 레시피 사건이면 excluded, 애매하면 unclear로 둔다.",
    "- 모든 event에는 source ref 또는 frame ref를 evidence에 넣는다.",
    "- timeline-frame-ledger:error:* 값은 frame 수집 실패 로그다. evidence에 넣지 말고 uncertainties에만 설명한다.",
    "- 확실하지 않으면 uncertainties에 남기고 invented detail을 만들지 않는다.",
    `- event는 최대 ${maxEvents}개로 압축한다.`,
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "스키마:",
    JSON.stringify({
      events: [{
        eventId: "e1",
        segmentId: "s1",
        timeRange: { startSec: 0, endSec: 30 },
        action: "양파를 썰어 팬에 넣는다",
        visibleIngredients: ["양파"],
        tools: ["팬"],
        stateChange: "생양파에서 볶는 상태로 바뀜",
        onscreenText: [],
        quantityCues: [],
        dishCandidates: ["양파 볶음"],
        candidateAssignments: [{
          candidateId: exampleCandidateId,
          status: "supporting",
          reason: "event action and ingredients match this candidate",
        }],
        evidence: ["transcript:1s", "frame:s1-w1:1"],
        confidence: 0.7,
        uncertainties: [],
      }],
      summary: { eventCount: 1, unclearEventCount: 0 },
    }, null, 2),
    "",
    "[VIDEO]",
    JSON.stringify({
      videoId: sourcePacket?.video?.videoId ?? null,
      title: sourcePacket?.video?.title ?? null,
      durationSeconds: sourcePacket?.video?.durationSeconds ?? null,
      description: sourcePacket?.video?.description ?? "",
      captions: (sourcePacket?.captions?.segments ?? []).slice(0, 300),
      authorComments: sourcePacket?.authorComments ?? [],
    }, null, 2),
    "",
    "[RECIPE_CANDIDATES]",
    JSON.stringify(compactCandidates, null, 2),
    "",
    "[TIMELINE_FRAME_PLAN]",
    JSON.stringify(timelineFramePlan, null, 2),
    "",
    "[TIMELINE_FRAME_LEDGER]",
    JSON.stringify({ ...timelineFrameLedger, windows: compactWindows }, null, 2),
  ].join("\n");
}

function normalizeCandidateAssignments(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const source = isObject(entry) ? entry : { candidateId: entry };
      const status = cleanString(source.status);
      return {
        candidateId: cleanString(source.candidateId),
        status: status === "excluded" || status === "unclear" ? status : "supporting",
        reason: cleanString(source.reason),
      };
    }).filter((entry) => entry.candidateId);
  }
  if (cleanString(value)) {
    return [{ candidateId: cleanString(value), status: "supporting", reason: null }];
  }
  return [];
}

function normalizeTimeRange(value) {
  const source = isObject(value) ? value : {};
  const startSec = optionalNumber(source.startSec);
  const endSec = optionalNumber(source.endSec);
  return {
    startSec,
    endSec: endSec !== null && startSec !== null && endSec <= startSec ? null : endSec,
  };
}

export function normalizeVideoTimeline(value, { videoId = null, sourcePacket = null } = {}) {
  const parsed = parsePiRawOutput(value) ?? {};
  const events = Array.isArray(parsed.events)
    ? parsed.events
    : Array.isArray(parsed.timelineEvents)
    ? parsed.timelineEvents
    : [];
  const normalizedEvents = events.map((event, index) => {
    const source = isObject(event) ? event : {};
    const eventId = cleanString(source.eventId) ?? `e${index + 1}`;
    const normalizedEvidence = normalizeEvidenceRefs(source.evidence, sourcePacket);
    const frameLedgerErrorRefs = normalizedEvidence.filter(isTimelineFrameLedgerErrorRef);
    const evidence = normalizedEvidence.filter((ref) => !isTimelineFrameLedgerErrorRef(ref));
    return {
      eventId,
      segmentId: cleanString(source.segmentId),
      timeRange: normalizeTimeRange(source.timeRange),
      action: cleanString(source.action) ?? cleanString(source.text) ?? cleanString(source.description),
      visibleIngredients: normalizeStringArray(source.visibleIngredients ?? source.ingredients),
      tools: normalizeStringArray(source.tools),
      stateChange: cleanString(source.stateChange),
      onscreenText: normalizeStringArray(source.onscreenText),
      quantityCues: normalizeStringArray(source.quantityCues),
      dishCandidates: normalizeStringArray(source.dishCandidates),
      candidateAssignments: normalizeCandidateAssignments(
        source.candidateAssignments ?? source.assignments ?? source.candidateIds ?? source.candidateId,
      ),
      evidence,
      confidence: clampConfidence(source.confidence, 0.5),
      uncertainties: uniqueStrings([
        ...normalizeStringArray(source.uncertainties),
        ...frameLedgerErrorRefs.map((ref) => `${ref} frame collection failed; not usable as evidence`),
      ]),
    };
  }).filter((event) => event.action);
  return {
    schemaVersion: 1,
    kind: "video-timeline",
    videoId: cleanString(parsed.videoId) ?? videoId,
    events: normalizedEvents,
    summary: {
      eventCount: normalizedEvents.length,
      unclearEventCount: normalizedEvents.filter((event) => event.candidateAssignments.some((entry) => entry.status === "unclear")).length,
      ...(isObject(parsed.summary) ? parsed.summary : {}),
    },
    errors: normalizeStringArray(parsed.errors),
  };
}

export function repairVideoTimelineEvidenceRefs(timeline, { allowedEvidenceRefs = null } = {}) {
  const originalEvents = Array.isArray(timeline?.events) ? timeline.events : [];
  const allowedSet = allowedEvidenceRefs ? new Set(uniqueStrings(allowedEvidenceRefs)) : null;
  if (!allowedSet) {
    const repairLog = {
      schemaVersion: 1,
      kind: "timeline-evidence-ref-repair",
      videoId: cleanString(timeline?.videoId),
      summary: {
        eventCountBefore: originalEvents.length,
        eventCountAfter: originalEvents.length,
        repairedEventCount: 0,
        droppedEventCount: 0,
        removedEvidenceRefCount: 0,
        unknownEvidenceRefCount: 0,
      },
      unknownEvidenceRefs: [],
      repairs: [],
      droppedEvents: [],
    };
    return { timeline, repairLog, droppedEvents: [] };
  }

  const repairs = [];
  const droppedEvents = [];
  const unknownEvidenceRefs = [];
  const repairedEvents = [];
  let removedEvidenceRefCount = 0;
  for (const event of originalEvents) {
    const evidence = uniqueStrings(event?.evidence);
    const allowedEvidence = evidence.filter((ref) => allowedSet.has(ref));
    const droppedEvidence = evidence.filter((ref) => !allowedSet.has(ref));
    if (droppedEvidence.length > 0) {
      unknownEvidenceRefs.push(...droppedEvidence);
      removedEvidenceRefCount += droppedEvidence.length;
    }
    if (allowedEvidence.length === 0) {
      droppedEvents.push({
        eventId: cleanString(event?.eventId),
        segmentId: cleanString(event?.segmentId),
        action: cleanString(event?.action),
        candidateAssignments: Array.isArray(event?.candidateAssignments) ? event.candidateAssignments : [],
        originalEvidence: evidence,
        droppedEvidence,
        reasonCode: "timeline_event_without_allowed_evidence",
      });
      continue;
    }
    if (droppedEvidence.length > 0) {
      repairs.push({
        eventId: cleanString(event?.eventId),
        segmentId: cleanString(event?.segmentId),
        action: cleanString(event?.action),
        originalEvidence: evidence,
        keptEvidence: allowedEvidence,
        droppedEvidence,
        reasonCode: "unknown_timeline_evidence_ref_removed",
      });
      repairedEvents.push({ ...event, evidence: allowedEvidence });
    } else {
      repairedEvents.push(event);
    }
  }

  const uniqueUnknownEvidenceRefs = uniqueStrings(unknownEvidenceRefs);
  const summary = {
    eventCountBefore: originalEvents.length,
    eventCountAfter: repairedEvents.length,
    repairedEventCount: repairs.length,
    droppedEventCount: droppedEvents.length,
    removedEvidenceRefCount,
    unknownEvidenceRefCount: uniqueUnknownEvidenceRefs.length,
  };
  const repairedTimeline = {
    ...timeline,
    events: repairedEvents,
    summary: {
      ...(isObject(timeline?.summary) ? timeline.summary : {}),
      eventCount: repairedEvents.length,
      unclearEventCount: repairedEvents.filter((event) => (
        event.candidateAssignments ?? []
      ).some((entry) => entry.status === "unclear")).length,
      evidenceRefRepairCount: repairs.length,
      droppedEventCount: droppedEvents.length,
      unknownEvidenceRefCount: uniqueUnknownEvidenceRefs.length,
    },
  };
  const repairLog = {
    schemaVersion: 1,
    kind: "timeline-evidence-ref-repair",
    videoId: cleanString(timeline?.videoId),
    summary,
    unknownEvidenceRefs: uniqueUnknownEvidenceRefs,
    repairs,
    droppedEvents,
  };
  return { timeline: repairedTimeline, repairLog, droppedEvents };
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

export function validateVideoTimeline(timeline, {
  allowedCandidateIds = null,
  allowedEvidenceRefs = null,
} = {}) {
  const errors = [];
  if (!isObject(timeline)) return ["video timeline must be an object"];
  if (!Array.isArray(timeline.events)) return ["video timeline events must be an array"];
  const candidateSet = allowedCandidateIds ? new Set(allowedCandidateIds) : null;
  const evidenceSet = allowedEvidenceRefs ? new Set(allowedEvidenceRefs) : null;
  for (const [eventIndex, event] of timeline.events.entries()) {
    if (!cleanString(event.eventId)) errors.push(`events[${eventIndex}].eventId is required`);
    if (!cleanString(event.action)) errors.push(`events[${eventIndex}].action is required`);
    if (!Array.isArray(event.evidence) || event.evidence.length === 0) {
      errors.push(`events[${eventIndex}].evidence is required`);
    }
    if (evidenceSet) {
      for (const ref of event.evidence ?? []) {
        if (!evidenceSet.has(ref)) errors.push(`events[${eventIndex}].evidence has unknown ref: ${ref}`);
      }
    }
    if (!Array.isArray(event.candidateAssignments) || event.candidateAssignments.length === 0) {
      errors.push(`events[${eventIndex}].candidateAssignments is required`);
    }
    for (const [assignmentIndex, assignment] of (event.candidateAssignments ?? []).entries()) {
      if (!["supporting", "excluded", "unclear"].includes(assignment.status)) {
        errors.push(`events[${eventIndex}].candidateAssignments[${assignmentIndex}].status is invalid`);
      }
      if (candidateSet && !candidateSet.has(assignment.candidateId)) {
        errors.push(`events[${eventIndex}].candidateAssignments[${assignmentIndex}].candidateId is unknown: ${assignment.candidateId}`);
      }
    }
  }
  return errors;
}

export function assertValidVideoTimeline(timeline, options = {}) {
  const errors = validateVideoTimeline(timeline, options);
  if (errors.length > 0) {
    throw new Error(`Video timeline schema validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

export function buildCandidateTimelineIndex({ recipeCandidateLedger, videoTimeline }) {
  const eventById = new Map((videoTimeline?.events ?? []).map((event) => [event.eventId, event]));
  const candidates = (recipeCandidateLedger?.candidates ?? []).map((candidate) => {
    const supportingEvents = [];
    const excludedEvents = [];
    const unclearEvents = [];
    for (const event of videoTimeline?.events ?? []) {
      for (const assignment of event.candidateAssignments ?? []) {
        if (assignment.candidateId !== candidate.candidateId) continue;
        if (assignment.status === "supporting") supportingEvents.push(event.eventId);
        else if (assignment.status === "excluded") excludedEvents.push(event.eventId);
        else unclearEvents.push(event.eventId);
      }
    }
    return {
      candidateId: candidate.candidateId,
      title: candidate.title,
      sourceEvidence: candidate.evidence ?? [],
      timeRange: candidate.timeRange ?? null,
      siblingGroup: candidate.siblingGroup ?? null,
      supportingEvents,
      excludedEvents,
      unclearEvents,
      orderBasis: "source-order",
      confidence: supportingEvents.length > 0 ? 0.7 : unclearEvents.length > 0 ? 0.45 : 0.25,
    };
  });
  const assignedEventIds = new Set(candidates.flatMap((candidate) => [
    ...candidate.supportingEvents,
    ...candidate.excludedEvents,
    ...candidate.unclearEvents,
  ]));
  return {
    schemaVersion: 1,
    kind: "candidate-timeline-index",
    videoId: videoTimeline?.videoId ?? recipeCandidateLedger?.videoId ?? null,
    candidates,
    unassignedEvents: (videoTimeline?.events ?? [])
      .map((event) => event.eventId)
      .filter((eventId) => !assignedEventIds.has(eventId) && eventById.has(eventId)),
    summary: {
      candidateCount: candidates.length,
      supportingEventCount: candidates.reduce((sum, candidate) => sum + candidate.supportingEvents.length, 0),
      unclearEventCount: candidates.reduce((sum, candidate) => sum + candidate.unclearEvents.length, 0),
    },
  };
}

export function assertValidCandidateTimelineIndex(index) {
  const errors = [];
  if (!isObject(index)) errors.push("candidate timeline index must be an object");
  if (!Array.isArray(index?.candidates)) errors.push("candidate timeline index candidates must be an array");
  for (const [candidateIndex, candidate] of (index?.candidates ?? []).entries()) {
    if (!cleanString(candidate.candidateId)) errors.push(`candidates[${candidateIndex}].candidateId is required`);
    if (!Array.isArray(candidate.supportingEvents)) errors.push(`candidates[${candidateIndex}].supportingEvents must be an array`);
  }
  if (errors.length > 0) {
    throw new Error(`Candidate timeline index validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}
