const PROMPT_VERSION = "pi-recipe-source-only-mvp1-staged-v2";

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
  const quantityPattern = /\d+(?:\.\d+)?\s*(?:g|kg|ml|l|큰술|작은술|개|컵|스푼|t|T|분|도|℃|%)\b/iu;

  for (const line of lines) {
    if (/재료|ingredients?/iu.test(line)) recipeBlock = true;
    if (rejectPattern.test(line) && !quantityPattern.test(line)) continue;
    if (recipeBlock || recipeKeywordPattern.test(line) || quantityPattern.test(line)) {
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
    "- 화면만 보고 어림잡은 양은 amountBasis를 visual-estimate로 표시하고 confidence를 낮게 둔다.",
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

function evidencePacketText(evidencePacket) {
  if (!evidencePacket) return "";
  return [
    "후보별 근거 묶음:",
    "visualEvidence는 같은 유튜브 영상 프레임을 Pi 이미지 입력으로 분석한 결과다. 보인 재료/자막/계량 단서만 근거로 사용한다.",
    JSON.stringify({
      candidateId: evidencePacket.candidateId,
      titleHint: evidencePacket.titleHint,
      timeRange: evidencePacket.timeRange,
      ingredientNames: evidencePacket.ingredientNames,
      amountCues: evidencePacket.amountCues,
      descriptionEvidence: evidencePacket.descriptionEvidence?.slice(0, 12),
      transcriptEvidence: evidencePacket.transcriptEvidence?.slice(0, 12),
      visualEvidence: evidencePacket.visualEvidence?.slice(0, 12),
      visualTargets: evidencePacket.visualTargets?.slice(0, 12),
      visualEstimates: evidencePacket.visualEstimates?.slice(0, 12),
      uncertainties: evidencePacket.uncertainties,
    }, null, 0),
  ].join("\n");
}

function buildFastCandidatePrompt(sourcePacket) {
  return [
    "아래 공개 유튜브 입력만 사용한다. 로컬 파일, 웹검색, 도구 사용 금지. 설명 없이 JSON만 반환.",
    "레시피 후보와 핵심 재료명만 짧게 뽑는다.",
    "제목에서 후보를 나눌 때는 ㅣ, |, &, 쉼표, 챕터 같은 강한 구분자를 우선한다. 단순 공백으로 이어진 비슷한 음식명/변형명은 한 후보로 묶는다.",
    "스키마: {\"candidates\":[{\"candidateId\":\"r1\",\"title\":\"요리명\",\"ingredientNames\":[\"재료명\"],\"evidence\":[\"description\"],\"uncertainties\":[]}]}",
    "",
    sourcePacketToFastText(sourcePacket),
  ].join("\n");
}

function buildFastDetailPrompt(sourcePacket, candidate, evidencePacket = null) {
  return [
    "아래 공개 유튜브 입력만 사용한다. 로컬 파일, 웹검색, 도구 사용 금지. 설명 없이 JSON만 반환.",
    "후보 1개만 처리한다. 재료 양은 근거가 있으면 최대한 채우고, 없으면 null이다.",
    "steps는 제목/자막/설명/visualEvidence 중 조리 순서를 암시하는 단서가 조금이라도 있으면 2~6개의 거친 단계로 쓴다. 완전히 근거가 없을 때만 빈 배열로 둔다.",
    "visualEvidence가 있으면 보이는 재료와 화면 자막만 참고하고, 일반 레시피 지식으로 빈칸을 채우지 않는다.",
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
    JSON.stringify(options.evidencePacket ?? null, null, 2),
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
