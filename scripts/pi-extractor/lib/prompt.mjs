const PROMPT_VERSION = "pi-recipe-source-only-mvp1-staged-v3";

function safeText(value, maxLength = 12000) {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n[truncated ${text.length - maxLength} chars]` : text;
}

function stripUrls(value) {
  return String(value ?? "").replace(/https?:\/\/\S+/giu, "").replace(/\s+$/gmu, "");
}

function compactRecipeText(value, maxLength = 4000) {
  const lines = stripUrls(value)
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const kept = [];
  let recipeBlock = false;
  const rejectPattern = /비즈니스|메일|구매시|수수료|프랜차이즈|팬트리점|궁금하시다면|직접 맛보고|구매|링크/iu;
  const recipeKeywordPattern = /재료|만드는\s*법|만들기|레시피|오븐|굽|섞|넣|반죽|발효|소스|양념|바르는\s*술/iu;
  const quantityPattern = /\d+(?:\.\d+)?\s*(?:g|kg|ml|l|큰술|작은술|개|컵|스푼|t|T|분|도|℃|%)/iu;
  const timelineHeadingPattern = /타임라인|챕터|chapter|timeline|timestamps?/iu;
  const timelineLinePattern = /(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}\s+\S/u;

  for (const line of lines) {
    if (/재료|ingredients?/iu.test(line)) recipeBlock = true;
    const hasTimelineCue = timelineHeadingPattern.test(line) || timelineLinePattern.test(line);
    if (rejectPattern.test(line) && !quantityPattern.test(line) && !hasTimelineCue) continue;
    if (hasTimelineCue || recipeBlock || recipeKeywordPattern.test(line) || quantityPattern.test(line)) {
      kept.push(line);
    }
  }

  const compacted = kept.length > 0 ? kept.join("\n") : stripUrls(value);
  return safeText(compacted, maxLength);
}

function normalizeCaptionSegments(source, { maxCaptionSegments = null } = {}) {
  const segments = source?.captions?.available && Array.isArray(source.captions.segments)
    ? source.captions.segments
    : [];
  const limitedSegments = Number.isInteger(maxCaptionSegments) && maxCaptionSegments >= 0
    ? segments.slice(0, maxCaptionSegments)
    : segments;
  return limitedSegments.map((segment) => ({
    startMs: Number.isFinite(segment.startMs) ? segment.startMs : null,
    endMs: Number.isFinite(segment.endMs) ? segment.endMs : null,
    text: safeText(segment.text, 500),
  })).filter((segment) => segment.text);
}

export function sourceToPiPublicPacket(source, {
  maxCaptionSegments = null,
  maxDescriptionChars = 16000,
  maxAuthorComments = 10,
  compactSourcePacket = false,
} = {}) {
  const video = source?.video ?? {};
  const videoId = video.videoId ?? null;
  const allCaptionSegments = source?.captions?.available && Array.isArray(source.captions.segments)
    ? source.captions.segments
    : [];
  const description = compactSourcePacket
    ? compactRecipeText(video.description, maxDescriptionChars)
    : safeText(video.description, maxDescriptionChars);
  return {
    packetVersion: "pi-public-youtube-source-packet-v1",
    truncation: {
      descriptionCharsTotal: typeof video.description === "string" ? video.description.length : 0,
      descriptionCharsIncluded: description.length,
      captionSegmentsTotal: allCaptionSegments.length,
      captionSegmentsIncluded: Number.isInteger(maxCaptionSegments) && maxCaptionSegments >= 0
        ? Math.min(maxCaptionSegments, allCaptionSegments.length)
        : allCaptionSegments.length,
      compactSourcePacket,
    },
    video: {
      videoId,
      title: video.title ?? null,
      url: video.url ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null),
      channelTitle: video.channelTitle ?? null,
      durationSeconds: Number.isFinite(Number(video.durationSeconds)) ? Number(video.durationSeconds) : null,
      description,
      tags: Array.isArray(video.tags) ? video.tags.slice(0, 30) : [],
    },
    captions: {
      language: source?.captions?.selectedTrack?.languageCode ?? source?.captions?.language ?? null,
      available: Boolean(source?.captions?.available),
      segments: normalizeCaptionSegments(source, { maxCaptionSegments }),
    },
    authorComments: Array.isArray(source?.authorComments?.comments)
      ? source.authorComments.comments.map((comment) => safeText(comment.text, 1000)).filter(Boolean).slice(0, maxAuthorComments)
      : [],
    descriptionSignal: source?.descriptionSignal ?? null,
  };
}

function buildToolInstruction(sourcePacket, { allowFetchContent = false, sourcePacketOnly = false } = {}) {
  const videoUrl = sourcePacket.video.url ?? "unknown";
  return sourcePacketOnly
    ? [
      "- smoke 실행에서는 extension 도구를 사용하지 말고 제공된 SOURCE_PACKET만 사용한다.",
      "- 추가 YouTube 조회, fetch_content, web_search를 모두 사용하지 않는다.",
    ]
    : allowFetchContent
    ? [
      "- 필요하면 extension 도구 youtube_video_details, youtube_transcript, fetch_content를 사용한다.",
      `- fetch_content를 쓸 때도 이 URL만 사용한다: ${videoUrl}`,
    ]
    : [
      "- MVP-1에서는 extension 도구 youtube_video_details, youtube_transcript만 사용한다.",
      "- fetch_content 영상 분석/프레임 추출은 MVP-3 이후에만 사용한다.",
    ];
}

function buildCommonRestrictionLines(sourcePacket, options = {}) {
  return [
    "중요한 제한:",
    "- 로컬 파일을 읽지 마라. 특히 golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽으면 안 된다.",
    "- 제공된 source packet과 같은 YouTube 페이지에서 확인 가능한 공개 정보만 사용한다.",
    "- 제3자 레시피 블로그, 일반 웹 검색 결과, 표준 레시피 지식으로 재료/양/단계를 채우지 마라.",
    ...buildToolInstruction(sourcePacket, options),
    "- web_search는 사용하지 마라.",
  ];
}

function buildAmountRuleLines() {
  return [
    "재료 양 규칙:",
    "- 명시 텍스트/자막/음성이 화면 추정보다 우선이다.",
    "- amountBasis는 stated, spoken, onscreen, visual-estimate 중 하나만 사용한다.",
    "- 근거가 없으면 amount, unit, amountBasis를 null로 둔다. unknown/estimated/text/visual 같은 새 값은 쓰지 않는다.",
    "- visual-estimate는 evidencePacket.visualEstimates에 targetVisible, referenceObjectVisible 또는 countEvidence, frame evidence가 같이 있는 경우에만 사용한다.",
    "- visualEvidence 프레임 목록만 보고 새 amount/unit을 만들지 않는다.",
  ];
}

function buildEvidenceBridgeRuleLines() {
  return [
    "possibleIngredientHints와 visualEvidence/visualStepEvidence를 함께 대조한다. hint는 확정 재료가 아니지만, frame/source 근거를 해석할 때의 라벨 후보로 쓴다.",
    "hint 이름이 frame/source 근거와 직접 이어질 때만 재료로 출력한다. 직접 근거가 없으면 재료로 승격하지 말고 uncertainties에 남긴다.",
    "source-poor 후보라도 frame/source 근거가 있으면 전처리/투입/섞기/익히기/마무리 중 확인된 흐름으로 최소 단계 skeleton을 만든다.",
  ];
}

function sourcePacketToFastText(sourcePacket) {
  const captionText = Array.isArray(sourcePacket?.captions?.segments)
    ? sourcePacket.captions.segments.map((segment) => segment.text).filter(Boolean).join(" ")
    : "";
  return [
    `제목: ${sourcePacket?.video?.title ?? ""}`,
    `설명/고정댓글 단서: ${[
      sourcePacket?.video?.description,
      ...(Array.isArray(sourcePacket?.authorComments) ? sourcePacket.authorComments : []),
    ].filter(Boolean).join("\n")}`,
    captionText ? `자막 단서: ${captionText}` : "",
  ].filter(Boolean).join("\n");
}

function compactPromptString(value, maxLength = 180) {
  const text = typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactVisualEvidenceForPrompt(frames) {
  return (frames ?? []).slice(0, 4).map((frame) => ({
    ref: frame.ref,
    observed: Array.isArray(frame.observed) ? frame.observed.map((entry) => compactPromptString(entry)).filter(Boolean).slice(0, 6) : [],
    onscreenText: Array.isArray(frame.onscreenText) ? frame.onscreenText.map((entry) => compactPromptString(entry)).filter(Boolean).slice(0, 4) : [],
    quantityCues: Array.isArray(frame.quantityCues) ? frame.quantityCues.map((entry) => compactPromptString(entry)).filter(Boolean).slice(0, 4) : [],
    confidence: Number.isFinite(Number(frame.confidence)) ? Number(frame.confidence) : null,
    range: frame.range ?? null,
  })).filter((frame) => frame.ref);
}

function evidencePacketForPrompt(evidencePacket) {
  if (!evidencePacket) return null;
  const compactBullets = Array.isArray(evidencePacket.compactEvidenceBullets)
    ? evidencePacket.compactEvidenceBullets.slice(0, 8)
    : [];
  const compactVisualEvidence = compactBullets.length > 0
    ? compactBullets
      .filter((entry) => entry.kind === "visual-frame")
      .map((entry) => ({
        ref: entry.ref,
        observed: entry.observed ?? [],
        onscreenText: entry.onscreenText ?? [],
        quantityCues: entry.quantityCues ?? [],
        confidence: entry.confidence ?? null,
        range: entry.range ?? null,
      }))
    : compactVisualEvidenceForPrompt(evidencePacket.visualEvidence);
  return {
    candidateId: evidencePacket.candidateId,
    titleHint: evidencePacket.titleHint,
    timeRange: evidencePacket.timeRange,
    ingredientNames: evidencePacket.ingredientNames,
    ingredientIdentityHints: evidencePacket.ingredientIdentityHints,
    possibleIngredientHints: evidencePacket.possibleIngredientHints,
    sharedIngredientSeeds: evidencePacket.sharedIngredientSeeds,
    amountCues: evidencePacket.amountCues,
    compactEvidenceBullets: compactBullets,
    descriptionEvidence: evidencePacket.descriptionEvidence?.slice(0, 8),
    transcriptEvidence: evidencePacket.transcriptEvidence?.slice(0, 8),
    stepEvidence: evidencePacket.stepEvidence?.slice(0, 8),
    visualStepEvidence: evidencePacket.visualStepEvidence?.slice(0, 8),
    sourceDraft: evidencePacket.sourceDraft,
    gapLedger: evidencePacket.gapLedger?.slice(0, 12),
    visualEvidence: compactVisualEvidence,
    visualTargets: evidencePacket.visualTargets?.map((target) => ({
      targetId: target.targetId,
      candidateId: target.candidateId,
      targetType: target.targetType ?? "ingredient_amount",
      ingredient: target.ingredient,
      reason: target.reason,
      textCues: target.textCues?.slice(0, 6),
      preferredTimeRanges: target.preferredTimeRanges?.slice(0, 3),
      fallbackPolicy: target.fallbackPolicy,
    })).slice(0, 8),
    visualEstimates: evidencePacket.visualEstimates?.slice(0, 8),
    uncertainties: evidencePacket.uncertainties,
  };
}

function evidencePacketText(evidencePacket) {
  if (!evidencePacket) return "";
  const promptPacket = evidencePacketForPrompt(evidencePacket);
  return [
    "후보별 근거 묶음:",
    "compactEvidenceBullets는 후보별 source/frame 근거를 작은 bullet로 압축한 목록이다.",
    "visualEvidence는 같은 유튜브 영상 프레임을 Pi 이미지 입력으로 분석한 결과다. 보인 재료/자막/계량 단서만 참고한다.",
    "visualEvidence.observed/onscreenText에 후보 구간의 추가 핵심 재료가 보이면 frame ref 근거와 함께 amount/unit=null로 추가할 수 있다.",
    "visualStepEvidence는 visualEvidence.onscreenText 중 조리 동작이 보이는 frame 근거다. source stepEvidence가 약할 때 단계 skeleton 보강에만 사용한다.",
    "ingredientIdentityHints/possibleIngredientHints는 확정 재료가 아니다. 요리 정체성과 visualEvidence 해석 힌트로만 사용한다.",
    ...buildEvidenceBridgeRuleLines(),
    "amount/unit을 visual-estimate로 채우려면 visualEstimates의 amount/unit/evidence를 사용한다. visualEvidence만 보고 새 추정값을 만들지 않는다.",
    JSON.stringify(promptPacket, null, 0),
  ].join("\n");
}

function buildFastCandidatePrompt(sourcePacket) {
  return [
    "아래 공개 유튜브 입력만 사용한다. 로컬 파일, 웹검색, 도구 사용 금지. 설명 없이 JSON만 반환.",
    "레시피 후보와 핵심 재료명만 짧게 뽑는다.",
    "제목에서 후보를 나눌 때는 ㅣ, |, &, 쉼표, 챕터 같은 강한 구분자를 우선한다. 단순 공백으로 이어진 비슷한 음식명/변형명은 한 후보로 묶는다.",
    "설명란 타임라인(예: 00:16 요리명)은 후보와 시간 범위의 강한 근거다.",
    "스키마: {\"candidates\":[{\"candidateId\":\"r1\",\"title\":\"요리명\",\"ingredientNames\":[\"재료명\"],\"evidence\":[\"description\"],\"timeRange\":{\"startSec\":16,\"endSec\":295},\"uncertainties\":[]}]}",
    "",
    sourcePacketToFastText(sourcePacket),
  ].join("\n");
}

function buildFastDetailPrompt(sourcePacket, candidate, evidencePacket = null) {
  return [
    "아래 공개 유튜브 입력만 사용한다. 로컬 파일, 웹검색, 도구 사용 금지. 설명 없이 JSON만 반환.",
    "후보 1개만 처리한다. 재료 양은 source 근거 또는 visualEstimates 근거가 있으면 채우고, 없으면 null이다.",
    "candidate.ingredientNames와 sourceDraft.ingredients는 시작점일 뿐이다. 설명/자막 근거에 같은 후보의 추가 재료, 양념, 물/기름, 마무리 재료가 보이면 함께 출력한다.",
    "ingredientIdentityHints/possibleIngredientHints는 확정 재료가 아니다. 요리 정체성과 visualEvidence 해석 힌트로만 사용한다.",
    "possibleIngredientHints에 있는 이름은 같은 후보의 설명/자막/화면 근거가 붙을 때만 재료로 출력하고, 근거가 약하면 uncertainty에 남긴다.",
    ...buildEvidenceBridgeRuleLines(),
    "sharedIngredientSeeds는 묶음 후보에서 온 미배정 재료 seed다. 같은 후보의 설명/자막/화면 근거가 있을 때만 확정 재료로 출력하고, 근거가 약하면 uncertainty에 남긴다.",
    "sourceDraft와 gapLedger를 먼저 읽고, gapLedger는 amount/unit 보완 필요 판단으로만 사용한다. gapLedger에 없는 source-backed 재료도 설명/자막 근거가 있으면 버리지 않는다.",
    "stepEvidence는 후보 timeRange 안 조리 동작 근거다. ingredientNames가 빈약해도 stepEvidence 순서대로 최소 단계 skeleton을 만들고, 근거 한계는 uncertainties에 남긴다.",
    "visualStepEvidence는 화면 글자 기반 조리 동작 근거다. source stepEvidence가 비어 있거나 약할 때만 frame ref를 근거로 단계 skeleton에 보강한다.",
    "steps는 제목/자막/설명/visualEvidence 중 조리 순서를 암시하는 단서가 조금이라도 있으면 2~6개의 거친 단계로 쓴다. 완전히 근거가 없을 때만 빈 배열로 둔다.",
    "steps에는 전처리, 양념/소스 만들기, 주재료 투입, 익히기/볶기/끓이기, 마무리 단서가 source에 있으면 빠뜨리지 말고 압축해 넣는다.",
    "visualEvidence가 있으면 보이는 재료와 화면 자막만 참고한다. 추가 재료를 넣을 때는 evidence에 해당 frame ref를 남기고, visualEvidence만으로 새 amount/unit을 만들지 않는다.",
    "visualEstimates에 targetVisible=true와 referenceObjectVisible=true 또는 countEvidence가 있고 frame evidence가 있을 때만 amountBasis=visual-estimate를 쓴다.",
    "amountBasis는 stated, spoken, onscreen, visual-estimate, null 중 하나다.",
    "스키마: {\"recipe\":{\"title\":\"요리명\",\"candidateId\":\"r1\",\"ingredients\":[{\"name\":\"재료명\",\"amount\":\"1\",\"unit\":\"g\",\"amountBasis\":\"stated\",\"confidence\":0.8,\"evidence\":[\"description\"]}],\"steps\":[\"조리 단계\"],\"uncertainties\":[]},\"repairLog\":[]}",
    "",
    `[CANDIDATE]\n${JSON.stringify(candidate)}`,
    "",
    evidencePacketText(evidencePacket),
    "",
    sourcePacketToFastText(sourcePacket),
  ].join("\n");
}

export function buildPiRecipeCandidatePrompt(sourcePacket, options = {}) {
  if (options.fastPrompt) return buildFastCandidatePrompt(sourcePacket);
  return [
    "너는 유튜브 레시피 영상에서 레시피 후보만 빠르게 찾는 도우미다.",
    "목표: 전체 조리법을 쓰지 말고, 이 영상에 나오는 레시피 후보와 핵심 재료명만 짧게 뽑는다.",
    "",
    ...buildCommonRestrictionLines(sourcePacket, options),
    "",
    "후보 추출 규칙:",
    "- 영상에 레시피가 여러 개면 모두 분리한다.",
    "- 제목의 ㅣ, |, &, 쉼표, 챕터는 강한 분리 신호다. 단순 공백으로 이어진 비슷한 음식명/변형명은 한 후보로 묶는다.",
    "- 설명란에 00:16 요리명 같은 타임라인/챕터가 있으면 description 근거로 보고, 가능하면 timeRange.startSec/endSec를 채운다.",
    "- 재료 양과 단계는 이 단계에서 자세히 쓰지 않는다.",
    "- 후보가 하나뿐이면 candidates 길이는 1이다.",
    "- 확실하지 않은 후보는 uncertainties에 이유를 남긴다.",
    "",
    "출력은 설명 없이 JSON 객체 하나만 반환한다. 스키마:",
    JSON.stringify({
      candidates: [{
        candidateId: "r1",
        title: "요리명",
        ingredientNames: ["재료명"],
        evidence: ["description", "transcript:00:01:12"],
        timeRange: { startSec: 16, endSec: 295 },
        uncertainties: ["불확실한 점"],
      }],
    }, null, 2),
    "",
    "[SOURCE_PACKET]",
    JSON.stringify(sourcePacket, null, 2),
  ].join("\n");
}

export function buildPiRecipeDetailPrompt(sourcePacket, candidate, options = {}) {
  if (options.fastPrompt) return buildFastDetailPrompt(sourcePacket, candidate, options.evidencePacket);
  return [
    "너는 유튜브 레시피 영상에서 후보 1개의 재료, 재료 양, 만들기 단계를 JSON으로 보강하는 도우미다.",
    "목표: CANDIDATE에 해당하는 레시피 하나만 처리한다. 다른 후보나 일반 레시피 지식으로 채우지 않는다.",
    "",
    ...buildCommonRestrictionLines(sourcePacket, options),
    "",
    ...buildAmountRuleLines(),
    "",
    "상세 보강 규칙:",
    "- CANDIDATE의 재료명은 단서일 뿐이며, source packet 근거가 있는 재료만 출력한다.",
    "- evidencePacket.ingredientIdentityHints와 possibleIngredientHints는 확정 재료가 아니다. 요리 정체성과 visualEvidence 해석 힌트로만 사용한다.",
    "- possibleIngredientHints의 이름은 같은 후보의 설명/자막/화면 근거가 붙을 때만 재료로 출력하고, 근거가 약하면 uncertainties에 남긴다.",
    ...buildEvidenceBridgeRuleLines().map((line) => `- ${line}`),
    "- evidencePacket.stepEvidence가 있으면 후보 구간 안 조리 동작 근거로 보고, 그 순서대로 최소 단계 skeleton을 만든다.",
    "- evidencePacket.visualStepEvidence는 frame 화면 글자에서 나온 조리 동작 근거다. source stepEvidence가 약할 때만 보강 근거로 사용하고 frame ref를 남긴다.",
    "- 단계는 동작 + 대상 + 상태가 드러나게 한국어로 짧게 쓴다.",
    "- 자막/설명/화면 단서가 불완전해도 후보명과 공개 단서가 조리 순서를 암시하면 거친 단계로 작성하고 uncertainties에 한계를 남긴다.",
    "- 수정/보강한 값은 repairLog에 근거 위치, 수정 전/후, confidence를 남긴다.",
    "",
    "출력은 설명 없이 JSON 객체 하나만 반환한다. 스키마:",
    JSON.stringify({
      recipe: {
        title: "요리명",
        candidateId: "r1",
        ingredients: [{
          name: "재료명",
          amount: "1 또는 null",
          unit: "큰술 또는 null",
          amountBasis: "stated|spoken|onscreen|visual-estimate|null",
          confidence: 0.8,
          evidence: ["description", "transcript:00:01:12", "frame:00:02:03"],
        }],
        steps: ["동작 + 대상 + 상태가 들어간 한국어 조리 단계"],
        uncertainties: ["불확실한 점"],
      },
      repairLog: [{
        patchId: "patch-1",
        candidateId: "r1",
        field: "ingredient|amount|step",
        before: null,
        after: "수정 후 값",
        evidenceRef: ["description 또는 transcript/frame 위치"],
        reasonCode: "missing_evidence_backed_ingredient",
        confidence: 0.7,
      }],
    }, null, 2),
    "",
    "[CANDIDATE]",
    JSON.stringify(candidate, null, 2),
    "",
    "[EVIDENCE_PACKET]",
    JSON.stringify(evidencePacketForPrompt(options.evidencePacket), null, 2),
    "",
    "[SOURCE_PACKET]",
    JSON.stringify(sourcePacket, null, 2),
  ].join("\n");
}

export function buildPiRecipePrompt(sourcePacket, options = {}) {
  return [
    "너는 유튜브 레시피 영상에서 구조화된 레시피 JSON만 추출하는 도우미다.",
    "",
    ...buildCommonRestrictionLines(sourcePacket, options),
    "",
    ...buildAmountRuleLines(),
    "",
    "출력은 설명 없이 JSON 객체 하나만 반환한다. 스키마:",
    JSON.stringify({
      recipes: [{
        title: "요리명",
        candidateId: "r1 또는 null",
        ingredients: [{
          name: "재료명",
          amount: "1 또는 null",
          unit: "큰술 또는 null",
          amountBasis: "stated|spoken|onscreen|visual-estimate|null",
          confidence: 0.8,
          evidence: ["description", "transcript:00:01:12", "frame:00:02:03"],
        }],
        steps: ["동작 + 대상 + 상태가 들어간 한국어 조리 단계"],
        uncertainties: ["불확실한 점"],
      }],
      repairLog: [{
        patchId: "patch-1",
        candidateId: "r1 또는 null",
        field: "ingredient|amount|step",
        before: null,
        after: "수정 후 값",
        evidenceRef: ["description 또는 transcript/frame 위치"],
        reasonCode: "missing_evidence_backed_ingredient",
        confidence: 0.7,
      }],
    }, null, 2),
    "",
    "[SOURCE_PACKET]",
    JSON.stringify(sourcePacket, null, 2),
  ].join("\n");
}

export { PROMPT_VERSION };
