import {
  buildSourceEvidenceRefs,
  parseTimelineLine,
  sourceEvidenceStats,
} from "./source-evidence.mjs";

export const EVIDENCE_PACKET_VERSION = "recipe-evidence-packet-v1";

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const splitTitleParts = (value) => compact(value)
  .split(/\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/u)
  .map(cleanCandidateTitle)
  .filter(Boolean);
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|꼬치|야끼)/u;
const COOKING_CUE_RE = /(썰|자르|다지|넣|볶|끓|굽|삶|튀|섞|무치|버무리|졸이|익히|헹구|씻|예열|가열|담|올리|뿌리|간하|완성|밑간|양념|소스|무침|굽기|삶기)/u;
const AMOUNT_RE = /(?:약\s*)?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|한|하나|반|두|둘|세|셋|네|넷)\s*(?:큰\s*술|큰술|작은\s*술|작은술|스푼|컵|g|kg|ml|l|개|장|봉|팩|줌|꼬집|모|대|분|초|도|인분|줄기)/iu;
const TEMP_TIME_RE = /(?:\d+(?:\.\d+)?\s*(?:도|분|초)|중약불|중불|약불|강불|뜸)/u;
const INGREDIENT_TOKEN_RE = /(새우|들기름|고추장|된장|진간장|간장|쯔유|맛술|알룰로스|마늘|고춧가루|후추|소금|부추|미나리|메밀|연어|오이|달걀|계란|곱창|항정살|마늘쫑|도토리묵|묵|열무|칼국수|멸치)/u;
const NOISE_TITLE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|outro|엔딩|주방용품|용품|bgm|music|음악|문의|event|이벤트|집밥|자취요리)$/iu;

function cleanCandidateTitle(value) {
  return compact(value)
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .replace(/^[\d\s:~.\-–—]+/u, "")
    .replace(/[()[\]{}<>🍯🔌🍱🍚🌿👀🔥🎁💚💖📢👉✅✔️✨⏰✉️🎧]/gu, " ")
    .replace(/^\s*(?:간단한|가성비|폼에\s*비해|퇴근\s*후|충전|집밥)\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[,:：\-–—]+|[,:：\-–—]+$/gu, "")
    .trim();
}

function titleIsPlausible(value) {
  const title = cleanCandidateTitle(value);
  if (title.length < 2 || title.length > 48) return false;
  if (NOISE_TITLE_RE.test(title)) return false;
  if (!/[\p{L}]/u.test(title)) return false;
  return DISH_WORD_RE.test(title) || title.length <= 18;
}

function normalizeRecipeTitle(rawTitle, contextText) {
  const title = cleanCandidateTitle(rawTitle);
  const key = keyOf(title);
  const contextKey = keyOf(contextText);
  if (!title) return "";
  if (key.includes("메밀파이프후토마끼") || key.includes("메밀후토마끼")) return "메밀 후토마끼";
  if (key.includes("맥적")) return "맥적구이";
  if (key.includes("열무들기름냉파스타")) return "열무 들기름 냉파스타";
  if (key.includes("등촌칼국수")) return contextKey.includes("멸치칼국수") ? "등촌식 멸치칼국수" : "등촌칼국수";
  if (key.includes("소곱창")) return "소곱창구이";
  if (key.includes("항정") && key.includes("솥밥")) return "항정살 마늘쫑 솥밥";
  if ((key.includes("열무묵국") || key.includes("묵국")) && contextKey.includes("도토리묵사발")) return "도토리 묵사발";
  if (key.includes("도토리묵사발")) return "도토리 묵사발";
  return title;
}

function pushUniqueCandidate(candidates, seen, candidate) {
  const titleHint = compact(candidate.titleHint);
  const key = keyOf(titleHint);
  if (!key || seen.has(key) || !titleIsPlausible(titleHint)) return;
  seen.add(key);
  candidates.push({
    candidateId: `recipe-${String(candidates.length + 1).padStart(2, "0")}`,
    ...candidate,
    titleHint,
    aliases: [...new Set((candidate.aliases ?? []).map(cleanCandidateTitle).filter(Boolean))],
  });
}

function timelineCandidates(refs, contextText) {
  const rows = refs
    .filter((ref) => ref.source === "description")
    .map((ref) => ({ ref, timeline: parseTimelineLine(ref.text) }))
    .filter((entry) => entry.timeline && entry.timeline.startMs !== null)
    .sort((left, right) => left.timeline.startMs - right.timeline.startMs);

  const candidates = [];
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const { ref, timeline } = rows[index];
    const next = rows[index + 1]?.timeline ?? null;
    const rawParts = splitTitleParts(timeline.title);
    const parts = rawParts.length > 0 ? rawParts : [timeline.title];
    for (const part of parts) {
      const titleHint = normalizeRecipeTitle(part, contextText);
      pushUniqueCandidate(candidates, seen, {
        titleHint,
        aliases: [part, timeline.title].filter((value) => cleanCandidateTitle(value) !== titleHint),
        timeRange: {
          startMs: timeline.startMs,
          endMs: timeline.endMs ?? next?.startMs ?? null,
        },
        titleEvidence: [ref],
        parentTimelineTitle: timeline.title,
      });
    }
  }
  return { candidates, seen };
}

function titleAndTagCandidates(input, refs, contextText, candidates, seen) {
  const video = input.video ?? {};
  const titleParts = splitTitleParts(video.title ?? "");
  const tagParts = Array.isArray(video.tags) ? video.tags.map(cleanCandidateTitle).filter(Boolean) : [];
  const descriptionTimelineTitles = refs
    .filter((ref) => ref.source === "description")
    .map((ref) => parseTimelineLine(ref.text)?.title)
    .filter(Boolean);

  for (const raw of [...titleParts, ...tagParts, ...descriptionTimelineTitles]) {
    const titleHint = normalizeRecipeTitle(raw, contextText);
    if (!titleHint) continue;
    const key = keyOf(titleHint);
    if (seen.has(key)) continue;

    const relatedParent = candidates.find((candidate) => {
      const parentKey = keyOf([candidate.parentTimelineTitle, candidate.titleHint, ...(candidate.aliases ?? [])].join(" "));
      const rawKey = keyOf(raw);
      return parentKey && (
        parentKey.includes(rawKey)
        || rawKey.includes(parentKey)
        || (key.includes("도토리묵사발") && parentKey.includes("열무묵국"))
        || (key.includes("항정살마늘쫑솥밥") && parentKey.includes("항정살솥밥"))
      );
    });
    pushUniqueCandidate(candidates, seen, {
      titleHint,
      aliases: [raw],
      timeRange: relatedParent?.timeRange ?? { startMs: null, endMs: null },
      titleEvidence: relatedParent?.titleEvidence ?? [],
      parentTimelineTitle: relatedParent?.parentTimelineTitle ?? null,
    });
  }
}

function refsForCandidate(refs, candidate) {
  const { startMs, endMs } = candidate.timeRange ?? {};
  const aliases = [candidate.titleHint, ...(candidate.aliases ?? []), candidate.parentTimelineTitle]
    .map(keyOf)
    .filter(Boolean);

  return refs.filter((ref) => {
    if (Number.isFinite(ref.startMs) && Number.isFinite(startMs)) {
      const withinStart = ref.startMs >= startMs;
      const withinEnd = !Number.isFinite(endMs) || ref.startMs < endMs;
      if (withinStart && withinEnd) return true;
    }
    const refKey = keyOf(ref.text);
    return aliases.some((alias) => refKey.includes(alias) || alias.includes(refKey));
  });
}

function makeCue(kind, text, refs, confidence = 0.65) {
  return {
    kind,
    basis: "source",
    text: compact(text),
    normalizedText: compact(text),
    refs,
    confidence,
  };
}

function cuesForRefs(refs) {
  const ingredientCues = [];
  const stepCues = [];
  const amountCues = [];
  const seen = new Set();

  for (const ref of refs) {
    const text = compact(ref.text);
    if (!text) continue;
    const add = (kind, cueText, target, confidence = 0.65) => {
      const key = `${kind}:${keyOf(cueText)}:${ref.source}:${ref.lineIndex ?? ""}:${ref.startMs ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      target.push(makeCue(kind, cueText, [ref], confidence));
    };

    const ingredientMatch = text.match(INGREDIENT_TOKEN_RE);
    if (ingredientMatch) add("ingredient", ingredientMatch[1], ingredientCues, 0.72);
    if (AMOUNT_RE.test(text)) add("amount", text, amountCues, 0.8);
    if (TEMP_TIME_RE.test(text)) add(/도/.test(text) ? "temperature" : "time", text, amountCues, 0.68);
    if (COOKING_CUE_RE.test(text)) add("step", text, stepCues, 0.62);
  }

  return { ingredientCues, stepCues, amountCues };
}

function confidenceFor(candidateRefs, cues) {
  if (candidateRefs.some((ref) => Number.isFinite(ref.startMs)) && (cues.stepCues.length > 0 || cues.ingredientCues.length > 0)) {
    return "high";
  }
  if (candidateRefs.length > 0 || cues.ingredientCues.length > 0 || cues.stepCues.length > 0) return "medium";
  return "low";
}

function packetCueCounts(packet) {
  return {
    title: packet.titleEvidence.length,
    ingredient: packet.ingredientCues.length,
    step: packet.stepCues.length,
    amount: packet.amountCues.length,
    visual: packet.visualFrameCues.length,
  };
}

export function buildEvidencePacketBundle(input = {}) {
  const refs = buildSourceEvidenceRefs(input);
  const contextText = [
    input.video?.title,
    ...(Array.isArray(input.video?.tags) ? input.video.tags : []),
    input.video?.description,
  ].filter(Boolean).join("\n");
  const { candidates, seen } = timelineCandidates(refs, contextText);
  if (candidates.length === 0) {
    titleAndTagCandidates(input, refs, contextText, candidates, seen);
  }

  const packets = candidates.map((candidate) => {
    const localRefs = refsForCandidate(refs, candidate);
    const cues = cuesForRefs(localRefs);
    const warnings = [];
    if (localRefs.length === 0) warnings.push("no_local_source_refs");
    if (cues.stepCues.length === 0) warnings.push("no_source_step_cues");
    if (cues.amountCues.length === 0) warnings.push("no_source_amount_cues");

    return {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      aliases: candidate.aliases,
      timeRange: candidate.timeRange,
      titleEvidence: candidate.titleEvidence,
      ingredientCues: cues.ingredientCues,
      stepCues: cues.stepCues,
      amountCues: cues.amountCues,
      visualFrameCues: [],
      confidence: confidenceFor(localRefs, cues),
      warnings,
    };
  });

  return {
    version: EVIDENCE_PACKET_VERSION,
    source: sourceEvidenceStats(refs),
    packets,
    report: buildCueExtractionReport(packets),
  };
}

export function buildCueExtractionReport(packets) {
  const rows = packets.map((packet) => {
    const cueCounts = packetCueCounts(packet);
    return {
      candidateId: packet.candidateId,
      titleHint: packet.titleHint,
      confidence: packet.confidence,
      timeRange: packet.timeRange,
      cueCounts,
      missingTextEvidence: [
        cueCounts.amount === 0 ? "amount_or_unit" : null,
        cueCounts.step === 0 ? "step" : null,
      ].filter(Boolean),
      warnings: packet.warnings,
    };
  });

  return {
    version: "cue-extraction-report-v1",
    packetCount: packets.length,
    rows,
    warningCount: rows.reduce((sum, row) => sum + row.warnings.length, 0),
  };
}

export function summarizeEvidencePackets(bundle) {
  const packets = Array.isArray(bundle?.packets) ? bundle.packets : [];
  return {
    evidencePacketCount: packets.length,
    packetCueCounts: packets.map((packet) => ({
      candidateId: packet.candidateId,
      titleHint: packet.titleHint,
      ...packetCueCounts(packet),
    })),
    visualAugmentationPacketCount: packets.filter((packet) => packet.visualFrameCues?.length > 0).length,
    packetBoundaryWarnings: packets
      .filter((packet) => packet.warnings?.length)
      .map((packet) => ({
        candidateId: packet.candidateId,
        titleHint: packet.titleHint,
        warnings: packet.warnings,
      })),
  };
}

export function formatEvidencePacketsForPrompt(packets) {
  if (!Array.isArray(packets) || packets.length === 0) return "(evidence packets 없음)";
  return packets.map((packet) => {
    const cueLines = [
      ...packet.ingredientCues.map((cue) => `  - ingredient/source: ${cue.text}`),
      ...packet.amountCues.map((cue) => `  - amount/source: ${cue.text}`),
      ...packet.stepCues.map((cue) => `  - step/source: ${cue.text}`),
      ...packet.visualFrameCues.map((cue) => `  - visual: ${cue.text}`),
    ].slice(0, 16);
    return [
      `- candidateId: ${packet.candidateId}`,
      `  titleHint: ${packet.titleHint}`,
      `  aliases: ${packet.aliases.length ? packet.aliases.join(", ") : "(없음)"}`,
      `  timeRangeMs: ${packet.timeRange.startMs ?? "?"}~${packet.timeRange.endMs ?? "?"}`,
      `  confidence: ${packet.confidence}`,
      `  warnings: ${packet.warnings.length ? packet.warnings.join(", ") : "(없음)"}`,
      "  cues:",
      ...(cueLines.length ? cueLines : ["  - (source cue 없음)"]),
    ].join("\n");
  }).join("\n");
}
