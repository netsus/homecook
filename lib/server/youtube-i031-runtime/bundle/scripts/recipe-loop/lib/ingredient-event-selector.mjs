export const EVENT_WINDOW_SEC = 6;

const compact = (value) => String(value ?? "").replace(/(\d)([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/gu, "$1 $2")
  .normalize("NFKC").replace(/⁄/gu, "/").replace(/\s+/gu, " ").trim();
const NOISE = /https?:|구독|좋아요|이벤트|쿠폰|할인|구매|협찬|광고/iu;
const VERB_STEM = "넣|붓|두르|뿌리|섞|볶|끓|썰|다지|굽|삶|데치|버무리|재우|찌|졸이|식히|쓰|사용";
const LOCAL_GUARD = new RegExp(`안\\s*(?:${VERB_STEM})|(?:${VERB_STEM})(?:지|으려고|려고|을\\s*예정|ㄹ\\s*예정|(?:으|이|하)?면(?!서))|않|없이|말고|대신|또는|혹은|\\bor\\b|원하(?:면|시면)|있으면|없으면|(?:넣어|사용해|써)도|수\\s*있|예정|계획`, "u");
const GENERIC_ACTION = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${VERB_STEM})(?:어|아|고|구|구요|으|는|면서|세요|습니다|다|기|자|었|였|해|한|지|줘|주|니까|려고|는다)`, "u");
const ACTUAL_USE = /(?:^|[^\p{L}\p{N}])(?:쓰(?:고|는|면서|세요|지|니까|려고|였|인다|어요|었습니다)|씁니다|썼(?:다|어요|습니다)|사용(?:합니다|했다|했어요|했습니다|해요|하세요|하고|하는|하면서|하니까))/u;
const GUARDED_EVENT_NUMERIC = /\d+(?:\.\d+)?\s*(?:g|kg|mg|ml|mL|컵|큰술|작은술|스푼|개|쪽|장|봉|줌|꼬집|모|대|포기|송이|조각|캔|통|병|마리|잎)/gu;
const PROXY_GUARD = /[~〜～–—]|이상|이하|미만|초과|(?:^|\s)(?:총|전체|합계)|대신|또는|혹은|\bor\b|않|없이|생략|제외|원하(?:면|시면)|있으면|없으면|예정|계획/iu;
const frameTime = (frame) => {
  const value = frame?.timestampSec ?? frame?.timestamp_sec;
  return value === null || value === undefined ? Number.NaN : Number(value);
};
const stripTimestamp = (text) => compact(text).replace(/^\[[\d:.]+\]\s*/u, "");

function validFrames(frames) {
  const seen = new Set();
  return frames.filter((frame) => typeof frame?.path === "string" && frame.path && Number.isFinite(frameTime(frame)) && frameTime(frame) >= 0)
    .sort((a, b) => frameTime(a) - frameTime(b) || a.path.localeCompare(b.path))
    .filter((frame) => seen.has(frame.path) ? false : (seen.add(frame.path), true));
}

export function guardedEventNumericKeys(text) {
  const source = compact(text);
  if (NOISE.test(source) || PROXY_GUARD.test(source)) return [];
  return [...source.matchAll(GUARDED_EVENT_NUMERIC)].map((match) => compact(match[0]).toLowerCase());
}

export function hasClosedPositiveAction(text) {
  return stripTimestamp(text).split(/,(?!\d)|(?<!\d),|[;.!?。]/u)
    .some((clause) => (GENERIC_ACTION.test(clause) || ACTUAL_USE.test(clause)) && !LOCAL_GUARD.test(clause));
}

function cueFor(entry) {
  if (!entry || entry.kind === "frame" || !Number.isFinite(entry.timestampSec) || entry.timestampSec < 0 || NOISE.test(entry.text)) return null;
  const numericKeys = guardedEventNumericKeys(entry.text);
  const clauses = stripTimestamp(entry.text).split(/,(?!\d)|(?<!\d),|[;.!?。]/u);
  const actualUse = clauses.some((clause) => ACTUAL_USE.test(clause) && !LOCAL_GUARD.test(clause));
  const action = actualUse || hasClosedPositiveAction(entry.text);
  const ocr = entry.kind === "ocr";
  const score = (numericKeys.length ? 4 : 0) + (actualUse ? 3 : action ? 2 : 0) + (ocr ? 1 : 0);
  return score ? { entry, numericKeys, action, actualUse, ocr, score } : null;
}

export function buildTimedEvidenceEvents(ledger, windowSec = EVENT_WINDOW_SEC) {
  const seenIdentity = new Set();
  const cues = ledger.map(cueFor).filter(Boolean)
    .sort((a, b) => a.entry.timestampSec - b.entry.timestampSec || a.entry.id.localeCompare(b.entry.id))
    .filter((cue) => {
      const identity = `${cue.entry.id}|${cue.entry.timestampSec}|${cue.entry.kind}|${cue.entry.source_provider ?? ""}`;
      if (seenIdentity.has(identity)) return false;
      seenIdentity.add(identity); return true;
    });
  const clusters = [];
  for (const cue of cues) {
    let cluster = clusters.at(-1);
    const clusterNumeric = new Set(cluster?.cues.flatMap((item) => item.numericKeys) ?? []);
    const distinctNumeric = cue.numericKeys.length && clusterNumeric.size
      && cue.numericKeys.some((numericKey) => !clusterNumeric.has(numericKey));
    if (!cluster || cue.entry.timestampSec - cluster.startSec > windowSec || distinctNumeric) {
      cluster = { startSec: cue.entry.timestampSec, cues: [] }; clusters.push(cluster);
    }
    cluster.cues.push(cue);
  }
  return clusters.map((cluster) => {
    const numericCues = cluster.cues.filter((cue) => cue.numericKeys.length);
    const actualUse = cluster.cues.some((cue) => cue.actualUse);
    const action = cluster.cues.some((cue) => cue.action);
    const ocrCues = cluster.cues.filter((cue) => cue.ocr);
    const sortedTimes = cluster.cues.map((cue) => cue.entry.timestampSec).sort((a, b) => a - b);
    const representative = numericCues.length ? numericCues : ocrCues.length ? ocrCues : cluster.cues;
    const times = representative.map((cue) => cue.entry.timestampSec).sort((a, b) => a - b);
    return { id: cluster.cues.map((cue) => cue.entry.id).join("+"), timestampSec: times[Math.floor((times.length - 1) / 2)],
      startSec: cluster.startSec, endSec: sortedTimes.at(-1), score: (numericCues.length ? 4 : 0) + (actualUse ? 3 : action ? 2 : 0) + (ocrCues.length ? 1 : 0),
      cueIds: cluster.cues.map((cue) => cue.entry.id), numericProxyKeys: [...new Set(numericCues.flatMap((cue) => cue.numericKeys))] };
  });
}

function gap(timestamp, selected, duration) {
  const boundaries = [0, ...selected.map(frameTime), duration].sort((a, b) => a - b);
  for (let index = 1; index < boundaries.length; index += 1) if (timestamp >= boundaries[index - 1] && timestamp <= boundaries[index]) {
    const start = boundaries[index - 1]; const end = boundaries[index];
    return { width: end - start, midpointDistance: Math.abs(timestamp - (start + end) / 2) };
  }
  return { width: duration, midpointDistance: Math.abs(timestamp - duration / 2) };
}

export function selectPreservingIngredientEventFrames({ frames = [], ledger = [], oldSelected = [], limit = 8, durationSec = null,
  eventWindowSec = EVENT_WINDOW_SEC, legacyQuantityPredicate } = {}) {
  if (typeof legacyQuantityPredicate !== "function") throw Object.assign(new Error("SELECTOR_PRESERVATION_LEGACY_PREDICATE_REQUIRED"),
    { code: "SELECTOR_PRESERVATION_LEGACY_PREDICATE_REQUIRED" });
  const available = validFrames(frames); const availableByPath = new Map(available.map((frame) => [frame.path, frame]));
  const count = Math.min(available.length, Math.max(1, Math.min(12, Math.floor(Number(limit) || 8))));
  const requestedDuration = Number(durationSec);
  const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? requestedDuration : Number.isFinite(frameTime(available.at(-1))) ? frameTime(available.at(-1)) : 0;
  const ledgerById = new Map(ledger.map((entry) => [entry.id, entry]));
  const invalidOldSelection = (reason) => {
    throw Object.assign(new Error(`SELECTOR_PRESERVATION_INVALID_OLD_SELECTION: ${reason}`), { code: "SELECTOR_PRESERVATION_INVALID_OLD_SELECTION" });
  };
  const uniqueOld = new Map();
  if (!Array.isArray(oldSelected) || oldSelected.length === 0) {
    if (available.length === 0) return [];
    invalidOldSelection("complete old selector output is required");
  }
  for (const item of oldSelected) {
    if (!item || typeof item.path !== "string" || !item.path || !Number.isFinite(frameTime(item)) || frameTime(item) < 0) invalidOldSelection("invalid old frame");
    const availableFrame = availableByPath.get(item.path);
    if (!availableFrame || frameTime(availableFrame) !== frameTime(item)) invalidOldSelection("old frame missing or timestamp mismatch");
    const existing = uniqueOld.get(item.path);
    if (existing && frameTime(existing) !== frameTime(item)) invalidOldSelection("duplicate old path has conflicting timestamp");
    if (!existing) uniqueOld.set(item.path, { ...item, _oldReasons: [item.selectionReason].filter(Boolean) });
    else {
      for (const reason of [item.selectionReason].filter(Boolean)) if (!existing._oldReasons.includes(reason)) existing._oldReasons.push(reason);
    }
  }
  if (uniqueOld.size !== count) invalidOldSelection("unique old frame count must equal effective budget");
  const normalizedOld = [...uniqueOld.values()].sort((a, b) => frameTime(a) - frameTime(b) || a.path.localeCompare(b.path));
  const reserved = new Map();
  const reserve = (item, tag) => {
    const frame = availableByPath.get(item.path); if (!frame) return;
    const row = reserved.get(item.path) ?? { ...frame, selectionReason: "reserved", reservationTags: [] };
    if (!row.reservationTags.includes(tag)) row.reservationTags.push(tag);
    reserved.set(item.path, row);
  };
  for (const item of normalizedOld) {
    const reasons = item._oldReasons ?? [item.selectionReason].filter(Boolean);
    if (reasons.includes("timeline-coverage")) reserve(item, "legacy-anchor");
    for (const reason of reasons.filter((value) => value.startsWith("evidence:"))) {
      const entry = ledgerById.get(reason.slice("evidence:".length));
      if (legacyQuantityPredicate(entry?.text ?? "")) reserve(item, "legacy-numeric-proxy");
    }
  }
  if (reserved.size > count) invalidOldSelection("reserved union exceeds effective budget");
  const selected = [...reserved.values()]; const used = new Set(reserved.keys());
  const events = buildTimedEvidenceEvents(ledger, eventWindowSec);
  while (selected.length < count && events.length) {
    const uncovered = events.filter((event) => !selected.some((frame) => Math.abs(frameTime(frame) - event.timestampSec) <= eventWindowSec));
    if (!uncovered.length) break;
    const bestScore = Math.max(...uncovered.map((event) => event.score));
    const event = uncovered.filter((item) => item.score === bestScore).map((item) => ({ item, gap: gap(item.timestampSec, selected, duration) }))
      .sort((a, b) => b.gap.width - a.gap.width || a.gap.midpointDistance - b.gap.midpointDistance
        || a.item.timestampSec - b.item.timestampSec || a.item.id.localeCompare(b.item.id))[0].item;
    const candidates = available.filter((frame) => !used.has(frame.path) && Math.abs(frameTime(frame) - event.timestampSec) <= eventWindowSec)
      .sort((a, b) => Math.abs(frameTime(a) - event.timestampSec) - Math.abs(frameTime(b) - event.timestampSec)
        || frameTime(a) - frameTime(b) || a.path.localeCompare(b.path));
    events.splice(events.indexOf(event), 1);
    if (!candidates.length) continue;
    const frame = candidates[0]; selected.push({ ...frame, selectionReason: `event:${event.id}`, event }); used.add(frame.path);
  }
  while (selected.length < count) {
    const candidates = available.filter((frame) => !used.has(frame.path)); if (!candidates.length) break;
    const frame = candidates.map((item) => ({ item, gap: gap(frameTime(item), selected, duration) }))
      .sort((a, b) => b.gap.width - a.gap.width || a.gap.midpointDistance - b.gap.midpointDistance
        || frameTime(a.item) - frameTime(b.item) || a.item.path.localeCompare(b.item.path))[0].item;
    selected.push({ ...frame, selectionReason: "timeline-gap-fill" }); used.add(frame.path);
  }
  return selected.sort((a, b) => frameTime(a) - frameTime(b) || a.path.localeCompare(b.path));
}
