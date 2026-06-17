// 추출 프롬프트 빌더. 루프가 ITER마다 이 파일을 주로 수정해 추출 품질을 끌어올린다.
// 현재는 텍스트 소스 + 영상 시각 분석을 함께 주고 구조화 레시피를 요청한다.

export const PROMPT_VERSION = "amount-step-balance-1";

const MAX_RECIPE_HINTS = 12;
const TIMESTAMP_RE = /(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*[~-]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?/g;
const TITLE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/;
const NOISE_CANDIDATE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|재료|ingredients?|instructions?|레시피|recipe|시식|먹방|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|주방용품|용품|bgm|music|음악|문의|email|인스타|instagram|facebook|camera|equipment)(?:$|[\s:：\-])/i;
const ACTION_ONLY_RE = /(썰|자르|다지|넣|볶|끓|굽|삶|튀|섞|무치|버무리|졸이|익히|헹구|씻|예열|가열|보관|담|올리|뿌리|간하|완성|먹)/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

function stripDecorations(text) {
  return compact(text)
    .replace(TIMESTAMP_RE, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/[🍯🔌🍱🍚🌿👀🔥🎁💚💖📢👉✅✔️✨⏰✉️🎧]/g, " ")
    .replace(LIST_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,:：\-–—]+|[,:：\-–—]+$/g, "")
    .trim();
}

function isPlausibleRecipeCandidate(text) {
  const cleaned = stripDecorations(text);
  if (cleaned.length < 2 || cleaned.length > 80) return false;
  if (/https?:\/\//i.test(cleaned) || NOISE_CANDIDATE_RE.test(cleaned)) return false;
  if (/^[\d\s:~\-.,]+$/.test(cleaned)) return false;
  if (ACTION_ONLY_RE.test(cleaned) && !DISH_WORD_RE.test(cleaned)) return false;
  return /[\p{L}]/u.test(cleaned);
}

function splitRecipeCandidate(text) {
  const cleaned = stripDecorations(text);
  if (!cleaned) return [];
  const parts = cleaned.split(TITLE_SEPARATOR_RE).map(stripDecorations).filter(Boolean);
  if (parts.length <= 1) return isPlausibleRecipeCandidate(cleaned) ? [cleaned] : [];
  const plausible = parts.filter(isPlausibleRecipeCandidate);
  return plausible.length >= 2 ? plausible : (isPlausibleRecipeCandidate(cleaned) ? [cleaned] : []);
}

function pushUniqueCandidate(candidates, seen, raw) {
  for (const item of splitRecipeCandidate(raw)) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
    if (candidates.length >= MAX_RECIPE_HINTS) return;
  }
}

export function buildRecipeCandidateHints(input = {}) {
  const video = input.video ?? input ?? {};
  const candidates = [];
  const seen = new Set();

  for (const line of String(video.description ?? "").split(/\r?\n/)) {
    if (!TIMESTAMP_RE.test(line)) {
      TIMESTAMP_RE.lastIndex = 0;
      continue;
    }
    TIMESTAMP_RE.lastIndex = 0;
    pushUniqueCandidate(candidates, seen, line);
    if (candidates.length >= MAX_RECIPE_HINTS) return candidates;
  }

  for (const part of String(video.title ?? "").split(/\s*(?:ㅣ|\|)\s*/)) {
    pushUniqueCandidate(candidates, seen, part);
    if (candidates.length >= MAX_RECIPE_HINTS) return candidates;
  }

  return candidates;
}

export function buildSourceText({ video, transcript, authorComments }) {
  const blocks = [];
  const recipeHints = buildRecipeCandidateHints({ video });
  if (recipeHints.length > 0) {
    blocks.push(`[SOURCE: recipe_candidate_hints]\n${recipeHints.map((name, idx) => `${idx + 1}. ${name}`).join("\n")}`);
  }
  if (video?.description?.trim()) {
    blocks.push(`[SOURCE: description]\n${video.description.trim()}`);
  }
  if (Array.isArray(authorComments) && authorComments.length > 0) {
    const text = authorComments.map((c) => (typeof c === "string" ? c : c.text)).filter(Boolean).join("\n---\n");
    if (text.trim()) blocks.push(`[SOURCE: author_comment]\n${text.trim()}`);
  }
  if (transcript?.segments?.length) {
    const text = transcript.segments.map((s) => s.text).filter(Boolean).join(" ");
    if (text.trim()) blocks.push(`[SOURCE: transcript(${transcript.language ?? "?"})]\n${text.trim()}`);
  }
  return blocks.join("\n\n");
}

export function buildExtractionPrompt({ video, sourceText, useVisual }) {
  const visualClause = useVisual
    ? `이 영상을 직접 시청할 수 있다. 텍스트 소스가 빈약하거나 분량이 명시되지 않은 부분은 영상의 화면·발화·자막을 근거로 채워라.`
    : `영상은 볼 수 없다. 아래 텍스트 소스만으로 추출하라.`;

  return `너는 유튜브 요리 영상에서 레시피를 추출하는 전문가다. ${visualClause}

영상 제목: ${video?.title ?? ""}

텍스트 소스:
${sourceText || "(텍스트 소스 없음)"}

규칙:
1. 영상이 실제로 조리 과정을 보여주는 요리를 모두 찾아 recipes[]로 분리한다. 시판품을 활용해도 조리 동작(손질·양념·가열·조립)이 있으면 포함하고, 시식·외식·재탕 언급만 있는 것은 제외한다.
2. 다중 레시피 영상이면 [SOURCE: recipe_candidate_hints], 제목, 설명란 타임라인을 체크리스트처럼 대조한다. 후보가 A&B, A/B, A·B, A+B처럼 결합되어 있으면 실제 조리 장면이 각각 있는 한 별도 recipes[]로 분리한다. 단, 한 요리의 소스·토핑·곁들임만 뜻하면 과분리하지 않는다.
3. 자막이 빈약하거나 노이즈가 있으면 영상 화면·발화·조리 흐름으로 누락 구간을 채운다. 설명란 타임라인에 있는 후보를 뺐다면, 그 후보가 조리 장면이 없거나 시식/구매/외식 언급뿐인 경우여야 한다.
4. 재료(ingredients): 조리에 실제로 쓰이는 식재료·양념만. name은 한국어 표준명, 외국어·원문 표기는 nameAliases에. 만들기 단계에 등장하지 않는 재료는 넣지 마라.
5. 분량(amount/unit): 텍스트 명시 > 발화 > 화면 자막 > 시각 추정 순으로 최대한 채워 amount null을 피한다. amount는 숫자·범위·분수만 넣고, "적당량/약간/취향껏/넉넉히/1:1 비율" 같은 정성·비율 표현은 amount에 넣지 않는다. 정확한 수치가 없어도 영상에서 개수, 스푼 수, 컵·줌·꼬집·팩·봉·모 같은 단위, 한 번에 넣는 대략적 양이 보이면 합리적인 근사값을 amount에 넣고 amountBasis는 반드시 "visual-estimate"로 둔다. 단위는 출처나 화면에서 판단한 단위를 amount와 unit로 분리해 보존하고, g↔ml, 컵↔ml, 숟가락↔g처럼 다른 단위로 환산하지 않는다. amountBasis로 근거를 표기한다(stated/spoken/onscreen/visual-estimate). 텍스트·발화·자막·영상 어느 쪽에서도 수량 단서가 전혀 없을 때만 amount를 null로 둔다.
6. 만들기(steps): 명령형 한국어 한 문장씩, 영상 진행 순서대로 쓰되 중간 크기의 의미 단위로 맞춘다. 같은 재료군을 연속해서 넣고 섞는 짧은 동작은 한 단계로 묶고, 손질, 양념 만들기, 재료 투입 전환, 가열·휴지·성형·담기처럼 공정이 바뀌는 지점은 나눈다. 너무 짧은 "넣는다", "섞는다" 단독 단계를 남발하지 말고, 각 단계에 핵심 재료명·동작·상태 기준을 함께 포함한다. 조리기구 설정(오븐/에어프라이어 온도·시간), 불 세기, 시간, 상태 판단 기준을 포함한다. 재료 투입 순서가 맛에 영향을 주면 영상의 실제 순서를 따르고, 재료가 처음 들어가는 단계에는 그 재료명을 명시한다. 인사말·잡담·시식 멘트는 제외한다.

JSON만 출력:
{
  "recipes": [
    {
      "title": "요리명",
      "ingredients": [
        { "name": "...", "nameAliases": [], "amount": "...", "unit": "...", "amountBasis": "stated|spoken|onscreen|visual-estimate", "optional": false, "groupLabel": null }
      ],
      "steps": ["...", "..."]
    }
  ]
}`;
}
