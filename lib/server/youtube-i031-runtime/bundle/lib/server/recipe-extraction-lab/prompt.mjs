// 추출 프롬프트 빌더. 루프가 ITER마다 이 파일을 주로 수정해 추출 품질을 끌어올린다.
// 현재는 텍스트 source evidence packet을 먼저 주고, 필요 시 영상 시각 분석을 보강 단서로 요청한다.

import { formatEvidencePacketsForPrompt } from "./candidate-packets.mjs";
import { formatPublicSourcePacketsForPrompt } from "./public-source-packets.mjs";
import { formatTimestamp } from "./source-evidence.mjs";

export const PROMPT_VERSION = "single-recipe-four-source-v2";
export const PUBLIC_SOURCE_PROMPT_VERSION = "public-source-gpt-v2-dehardcoded";

const MAX_RECIPE_HINTS = 12;
const TIMESTAMP_RE = /(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*[~-]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?/g;
const TITLE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const MENU_HEADING_RE = /^\*?\s*(?:메뉴|menus?|menu list)\s*\*?\s*[:：]?\s*$/iu;
const DESCRIPTION_MENU_STOP_RE = /^(?:\*?\s*(?:재료|ingredients?|ingredient|만들기|조리|레시피|recipe|instructions?|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|bgm|music|음악|문의|email|인스타|instagram)\s*\*?\s*[:：]?|\[[^\]]{2,100}\]|https?:\/\/)/iu;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/;
const NOISE_CANDIDATE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|재료|ingredients?|instructions?|레시피|recipe|시식|먹방|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|주방용품|용품|bgm|music|음악|문의|email|인스타|instagram|facebook|camera|equipment)(?:$|[\s:：\-])/i;
const ACTION_ONLY_RE = /(썰|자르|다지|넣|볶|끓|굽|삶|튀|섞|무치|버무리|졸이|익히|헹구|씻|예열|가열|보관|담|올리|뿌리|간하|완성|먹)/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|생채|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|꼬치|갈비|야끼|치즈|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

function stripDecorations(text) {
  return compact(text)
    .replace(TIMESTAMP_RE, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[()[\]{}<>]/g, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
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
  const separatorParts = cleaned.split(TITLE_SEPARATOR_RE).map(stripDecorations).filter(Boolean);
  const initialParts = separatorParts.length > 1 ? separatorParts : [cleaned];
  const parts = initialParts.flatMap((part) => {
    const particleMatch = part.match(/^(.{2,30}?)(?:와|과)\s+(.{2,30})$/u);
    return particleMatch
      ? [particleMatch[1], particleMatch[2]].map(stripDecorations).filter(Boolean)
      : [part];
  });
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

function descriptionMenuCandidateLines(description) {
  const lines = String(description ?? "").split(/\r?\n/);
  const candidates = [];

  for (const [headingLineIndex, rawLine] of lines.entries()) {
    const line = compact(rawLine);
    if (!MENU_HEADING_RE.test(line)) continue;

    let collectedForHeading = 0;
    for (let lineIndex = headingLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
      const candidateLine = compact(lines[lineIndex]);
      if (!candidateLine) {
        if (collectedForHeading > 0) break;
        continue;
      }
      if (MENU_HEADING_RE.test(candidateLine) || DESCRIPTION_MENU_STOP_RE.test(candidateLine)) break;
      const cleaned = stripDecorations(candidateLine);
      if (!cleaned || cleaned.length < 2 || cleaned.length > 80) {
        if (collectedForHeading > 0) break;
        continue;
      }
      candidates.push(cleaned);
      collectedForHeading += 1;
      if (collectedForHeading >= MAX_RECIPE_HINTS) break;
    }
  }

  return candidates;
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
  if (candidates.length > 0) return candidates;

  let hasDescriptionMenuCandidates = false;
  for (const line of descriptionMenuCandidateLines(video.description)) {
    const beforeCount = candidates.length;
    pushUniqueCandidate(candidates, seen, line);
    if (candidates.length > beforeCount) hasDescriptionMenuCandidates = true;
    if (candidates.length >= MAX_RECIPE_HINTS) return candidates;
  }
  if (hasDescriptionMenuCandidates) return candidates;

  for (const part of String(video.title ?? "").split(/\s*(?:ㅣ|\|)\s*/)) {
    pushUniqueCandidate(candidates, seen, part);
    if (candidates.length >= MAX_RECIPE_HINTS) return candidates;
  }

  return candidates;
}

export function buildSourceText({ video, transcript, authorComments }, { recipeMode = "multi" } = {}) {
  const blocks = [];
  const recipeHints = recipeMode === "single" ? [] : buildRecipeCandidateHints({ video });
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
    const text = transcript.segments
      .map((s, index) => {
        const segmentText = compact(s?.text);
        if (!segmentText) return null;
        const timestamp = Number.isFinite(s?.startMs) ? formatTimestamp(s.startMs) : null;
        const lineIndex = Number.isInteger(s?.lineIndex) ? s.lineIndex : index;
        return timestamp ? `[${timestamp}] ${segmentText}` : `[line ${lineIndex}] ${segmentText}`;
      })
      .filter(Boolean)
      .join("\n");
    if (text.trim()) blocks.push(`[SOURCE: transcript(${transcript.language ?? "?"})]\n${text.trim()}`);
  }
  return blocks.join("\n\n");
}

export function buildExtractionPrompt({ video, sourceText, useVisual, evidencePackets, recipeMode = "multi" }) {
  const visualClause = useVisual
    ? `이 영상을 직접 시청할 수 있다. 텍스트 소스가 빈약하거나 분량이 명시되지 않은 부분은 영상의 화면·발화·자막을 근거로 채워라.`
    : `영상은 볼 수 없다. 아래 텍스트 소스만으로 추출하라.`;
  const packetClause = recipeMode !== "single" && Array.isArray(evidencePackets) && evidencePackets.length > 0
    ? `\nEvidence packets:\n${formatEvidencePacketsForPrompt(evidencePackets)}\n\nEvidencePacket 사용 규칙:\n- EvidencePacket은 정답이 아니라 증거 봉투다. recipes[]는 packet 단위로 만들고 packet 밖 후보를 새로 만들지 않는다.\n- basis=source cue는 basis=visual cue보다 우선한다. 텍스트에 명시된 amount/unit을 visual-estimate로 덮어쓰지 않는다.\n- packet에 없는 계량·단계는 일반 요리 상식으로 invent하지 말고 null 또는 누락 상태로 둔다.\n- visualFrameCues가 있을 때만 visual-estimate를 쓸 수 있다.\n`
    : "";

  if (recipeMode === "single") {
    return `너는 유튜브 요리 영상 한 편에서 하나의 레시피를 추출하는 전문가다. ${visualClause}

영상 제목: ${video?.title ?? ""}

텍스트 소스:
${sourceText || "(텍스트 소스 없음)"}

규칙:
1. recipes[]에는 정확히 하나의 레시피만 출력한다. 소스·토핑·곁들임·맛 변형은 그 레시피 안에 합친다.
2. 설명란, 작성자 댓글, 시간 자막, 선택 프레임의 화면 글자를 서로 대조한다. 이벤트·광고·구매·BGM·구독 문구는 재료와 단계에서 제외한다.
3. 재료는 실제 조리에 사용된 항목만 넣고, 각 재료의 한국어 표준명이 적어도 한 만들기 단계에 등장하게 한다. 근거 없는 재료는 요리 상식으로 추가하지 않는다.
4. 분량은 설명란/작성자 댓글의 명시값 > 발화 자막 > 화면 자막 > 시각 추정 순서로 판단한다. amount와 unit은 같은 근거에서 한 쌍으로 고르고, 근거가 없으면 둘 다 null로 둔다.
5. 화면 자막 분량은 첨부된 선택 프레임의 onscreenText 또는 quantityCues에 재료명과 수량이 함께 있을 때만 amountBasis=onscreen으로 쓴다. 화면 모양만 추정했으면 visual-estimate다.
6. 만들기 단계는 영상 시간 순서대로 명령형 한국어 한 문장씩 쓰고, 실제 공정·상태 전환 1개당 한 단계가 되게 한다. 먼저 손질/양념 만들기/기구 세팅/가열/재료 투입/섞기·버무리기/뒤집기/불세기·시간 조절/졸이기·익힘 확인/담기 공정을 시간순으로 대조한다. 서로 다른 목적·대상·열 상태는 분리하고, 같은 대상과 목적의 짧은 연속 동작만 한 문장으로 합친다. 각 단계에는 대상 재료와 조리 동작을 명시하고 불세기·시간·상태 기준 중 확인 가능한 정보를 함께 쓴다. 인사말·시식·단순 완성 멘트는 단계로 만들지 않는다.
7. ingredients와 steps가 비어 있는 결과는 출력하지 않는다. 출력 직전에 한 레시피인지, amount/unit이 함께 있는지, 모든 재료가 단계에 쓰였는지 확인한다.

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

  return `너는 유튜브 요리 영상에서 레시피를 추출하는 전문가다. ${visualClause}

영상 제목: ${video?.title ?? ""}

텍스트 소스:
${sourceText || "(텍스트 소스 없음)"}
${packetClause}

규칙:
1. 영상이 실제로 조리 과정을 보여주는 요리를 모두 찾아 recipes[]로 분리한다. 시판품을 활용해도 조리 동작(손질·양념·가열·조립)이 있으면 포함하고, 시식·외식·재탕 언급만 있는 것은 제외한다. 완성된 기존 요리에 양념 하나를 추가하거나 맛 변형만 보여주는 장면은 별도 recipe로 분리하지 말고 기존 요리의 재료와 단계로 합친다.
2. 다중 레시피 영상이면 [SOURCE: recipe_candidate_hints], 제목, 설명란 타임라인을 체크리스트처럼 대조하고, 먼저 실제 조리 장면이 있는 후보를 내부적으로 전부 열거한 뒤 recipes[]에 빠짐없이 넣는다. 후보가 A&B, A/B, A·B, A+B처럼 결합되어 있으면 실제 조리 장면이 각각 있는 한 별도 recipes[]로 분리한다. 제목이 "A와 B" 또는 "A과 B"처럼 와/과로 결합되어 있고 양쪽이 각각 요리명 후보라면 같은 기준으로 분리한다. 단, 한 요리의 소스·토핑·곁들임만 뜻하면 과분리하지 않는다. 후보명이 조금 달라도 같은 요리이면 source와 장면 근거가 같은 경우에만 같은 evidence packet으로 묶는다.
3. 자막이 빈약하거나 노이즈가 있으면 영상 화면·발화·조리 흐름으로 누락 구간을 채운다. 설명란 타임라인에 있는 후보를 뺐다면, 그 후보가 조리 장면이 없거나 시식/구매/외식 언급뿐인 경우여야 한다. 여러 후보가 있을 때는 후보별로 evidence packet을 내부적으로 만든다. evidence packet은 후보 제목, 관련 텍스트/발화/자막, 관련 영상 장면, 재료 후보, 단계 후보를 한 묶음으로 가진다. 각 후보의 근거끼리 섞지 않는다. recipes[]는 evidence packet 단위로 만들고, 한 packet의 양념·곁들임·고명·단계를 다른 packet으로 옮기지 않는다.
4. 재료(ingredients): 조리에 실제로 쓰이는 식재료·양념만. name은 한국어 표준명, 외국어·원문 표기는 nameAliases에. 재료의 정체성과 형태를 보존하고, 가공식품·완제품 소스·양념장·원물 채소·분말 양념을 서로 마음대로 치환하지 마라. 만들기 단계에 등장하지 않는 재료는 넣지 마라. 설명란·댓글·자막에 "재료명 수량단위" 목록이 있으면 먼저 그 목록을 훑고, 실제 조리 장면에 쓰인 항목만 recipes[].ingredients에 반영한다. 이벤트, 구매 인증, 댓글 이벤트, 선물, 쿠폰, 할인, 배송, 상품 출고, 추첨 안내의 수량이나 상품명은 실제 조리 투입량이 아니므로 재료명·재료 분량으로 쓰지 않는다. 출력 직전 각 recipes[]마다 ingredients[]를 steps[]와 대조해 단계에서 실제 쓰인 재료가 빠졌는지 점검한다. source와 영상에 없는 양념·향채·고명은 추측해서 추가하지 않는다. 재료 목록, 자막, 발화, 화면이 서로 다르면 실제 조리 투입 장면과 발화/자막 근거가 같은 재료 정체성을 가리키는지 먼저 확인하고, 근거가 약하면 원문 표기를 nameAliases에 보존한다. 같은 재료가 다른 말로 반복될 때는 의미가 같은 항목만 하나로 합치고, 서로 다른 형태는 합치지 않는다.
5. 분량(amount/unit): 텍스트 명시 > 발화 > 화면 자막 > 시각 추정 순서로 판단한다. amount와 unit은 같은 출처에서 한 쌍으로 고르고, 더 높은 우선순위 출처가 값과 단위 또는 단위 family(g/ml/컵/큰술/작은술/개 등)를 명시하면 화면상 양이 다르게 보여도 그 명시 단위를 unit에 쓴다. "굴소스 1큰술", "양파 반 개", "물 500ml", "두부 1모"처럼 재료명과 수량단위가 붙어 있거나 괄호 안에 있으면 amount에는 숫자·범위·분수만, unit에는 원 단위 family를 표준 한국어 단위로 분리한다. amount는 숫자·범위·분수만 넣고, "적당량/약간/취향껏/넉넉히/1:1 비율" 같은 정성·비율 표현은 amount에 넣지 않는다. 명시 텍스트·자막·발화에 amount/unit이 없으면 무리하게 채우지 말고 null로 둔다. visual-estimate는 source amount/unit gap이 있고, 같은 evidence packet의 실제 frame 근거에서 target 재료와 기준 물체가 보이거나 개수 셈 근거가 있을 때만 허용한다. 단위는 선택한 출처의 단위를 amount와 unit로 분리해 보존하고, 다른 출처의 시각 단위와 섞거나 g↔ml, 컵↔ml, 숟가락↔g처럼 다른 단위로 환산하지 않는다. 레시피에 일부만 쓰는 포장 수량·상품 전체 수량과 실제 조리 투입량을 구분하고, 실제 조리 투입량이 불분명하면 상품 전체 수량으로 대체하지 않는다. visual-estimate 재료도 조리에 실제로 쓰인 경우에만 ingredients에 넣고, 그 재료가 처음 투입되는 만들기 단계에는 재료명을 반드시 적는다. amountBasis로 근거를 표기한다(stated/spoken/onscreen/visual-estimate). 어떤 근거에서도 수량 단서가 없으면 amount와 unit은 null이다.
6. 만들기(steps): 명령형 한국어 한 문장씩, 영상 진행 순서대로 쓰되 실제 공정·상태 전환 1개당 한 단계가 되게 한다. 먼저 내부적으로 "손질/양념 만들기/기구 세팅/가열/재료 투입/섞기·버무리기/뒤집기/불세기·시간 조절/졸이기·익힘 확인/담기" 공정 비트를 순서대로 적고, 서로 다른 목적·대상·열 상태는 분리한다. 반대로 같은 대상과 같은 목적의 연속 미세동작은 "양파와 대파를 넣고 숨이 죽을 때까지 볶는다"처럼 한 문장으로 합쳐 과분할하지 않는다. 각 단계는 핵심 재료명 또는 조리 대상명으로 시작하거나 초반에 명시하고, 구체 동작과 상태 기준을 함께 쓴다. "넣는다", "섞는다", "익힌다"처럼 핵심 명사와 상태 기준이 없는 단계는 금지한다. 핵심 재료명은 ingredients[]의 한국어 표준명과 같은 표기로 통일한다. "이것", "그것", "위 재료", "준비한 것", "재료", "양념들", "적당히"처럼 대명사나 일반어만으로 대상·상태를 대신하지 않는다. 각 재료가 steps 안에서 처음 등장하는 단계에는 반드시 ingredients[]의 표준 재료명을 그대로 적고, 이후 단계에서도 대명사 대신 표준 재료명이나 명확한 조리 대상명을 쓴다. 기구·온도·시간·불세기·상태 기준 중 화면이나 발화에서 보이는 명사를 1개 이상 함께 넣는다. 재료 투입 순서가 맛에 영향을 주면 영상의 실제 순서를 따르고, 재료가 처음 들어가는 단계에는 그 재료명을 명시한다. 인사말·잡담·시식 멘트와 "완성한다"만 있는 단계는 제외하고, 필요하면 "그릇에 담고 토핑을 올린다"처럼 실제 마무리 동작을 쓴다.

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

export function buildPublicSourceExtractionPrompt({ video, publicSourceBundle }) {
  return `너는 유튜브 요리 영상의 공개 소스에서 레시피를 추출하는 전문가다. 영상 URL을 직접 열지 말고, 아래 public source packet만 근거로 사용하라.

영상 제목: ${video?.title ?? publicSourceBundle?.video?.title ?? ""}

중요 조건:
- 이 저장소의 golden.json, train/validation 정답, 이전 추출 결과, grade 파일은 절대 읽지 마세요. 데이터 누수를 막기 위함입니다.
- 아래 public source packet은 제목, 설명란, 공개 자막, 작성자 댓글에서 만든 근거 묶음이다. 정답이 아니라 공개 입력이다.
- public source packet 안에 Candidate ledgers가 있으면 그것을 레시피별 1순위 근거로 사용하고, Timeline sections는 보조 근거로만 사용한다.
- Candidate ledger 안의 weak visual assist는 이전 keyframe selector가 고른 프레임 설명이다. source-backed 근거보다 약하지만, 같은 candidate에서 배추/버섯처럼 구체 재료명이 보이면 재료 정체성 확인용으로만 사용한다. 수량은 만들지 않는다.
- 자막이 비어 있거나 일부 언어만 있어도 blocked로 끝내지 말고 제공된 근거 안에서 추출하라. 근거 없는 수량은 amount와 unit을 null로 둔다.
- 여러 레시피가 있으면 반드시 recipes[]로 분리한다.
- 출력은 한국어로 작성한다.
- 최종 답변은 JSON만 출력한다.

Public source packets:
${formatPublicSourcePacketsForPrompt(publicSourceBundle)}

레시피 분리 규칙:
1. description timeline section을 1순위 후보로 삼는다.
2. description_menu section은 설명란의 메뉴 목록에서 온 후보이다. 타임라인이 없어도 Candidate ledger의 canonicalTitle 하나를 기본 recipes[] 하나로 유지한다.
3. section 제목이 A&B, A/B, A·B, A+B, A와 B, A과 B처럼 결합되어 있고 각 항목이 요리명 후보이면 별도 recipes[]로 분리한다.
4. 한 요리의 소스, 토핑, 곁들임만 따로 나온 장면은 별도 recipe로 만들지 말고 관련 recipe의 재료와 단계에 합친다.
5. section 밖의 근거를 다른 recipe에 섞지 않는다.
6. Candidate ledger의 canonicalTitle 하나를 기본적으로 recipes[] 하나로 만든다. titleAliases는 원문 별칭으로만 보고 최종 title을 오염시키지 않는다.

재료 규칙:
1. 조리에 실제로 쓰인 식재료와 양념만 넣는다.
2. source packet의 ingredient/source, amount/source, step/source를 대조해 재료를 만든다.
3. "초록색 줄기채소", "갈색 소스" 같은 색/상태 이름은 최후의 수단이다. 자막/설명에서 구체 재료명이 보이면 구체명으로 쓴다.
4. 완제품 소스, 양념장, 원물 채소, 분말 양념을 서로 마음대로 바꾸지 않는다.
5. 단계에 쓰인 핵심 재료가 ingredients[]에서 빠지지 않게 마지막에 대조한다.
6. 단계에 전혀 쓰이지 않는 재료는 넣지 않는다.
7. Candidate ledger의 must-keep ingredient는 공개 source-backed 재료 후보이므로, 같은 candidate의 단계 근거와 모순되지 않으면 ingredients[]에 포함한다.
8. weak visual ingredient는 source-backed 재료보다 약한 보조 후보이다. 같은 candidate의 source 흐름과 맞고 조리 단계에 실제로 들어가는 재료일 때만 ingredients[]에 넣고, amountBasis는 unknown 또는 null로 둔다.

분량 규칙:
1. 설명/자막의 명시값 > 발화 자막 > 문맥상 계산 가능한 값 > unknown 순서로 믿는다.
2. amount는 숫자, 범위, 분수만 넣고 "약간", "적당량", "취향껏" 같은 말은 amount에 넣지 않는다.
3. unit은 큰술, 작은술, 컵, g, ml, 개, 장, 줌, 팩처럼 분리해서 쓴다.
4. 첫 버전에서는 화면만 보고 추정한 visual-estimate를 새로 만들지 않는다. packet에 명시/문맥 근거가 없으면 amount와 unit은 null이다.
5. 각 재료에는 source_note를 추가해 "description timeline", "subtitle:en", "source-json caption"처럼 근거를 짧게 적는다.

만들기 단계 규칙:
1. 실제 공정과 상태 변화가 드러나게 쓴다.
2. "넣는다", "섞는다"처럼 대상이 없는 문장은 피하고, 핵심 재료명이나 조리 대상을 문장에 넣는다.
3. source packet의 시간 순서를 따른다.
4. 인사말, 잡담, 시식 멘트, 광고 문구, 단순 완성 멘트는 제외한다.
5. 한 단계에는 핵심 공정 1개를 담되, 같은 공정의 짧은 연결동작은 한 문장으로 묶을 수 있다.

JSON만 출력:
{
  "recipes": [
    {
      "title": "요리명",
      "ingredients": [
        { "name": "...", "nameAliases": [], "amount": "...", "unit": "...", "amountBasis": "stated|spoken|onscreen|derived|unknown", "source_note": "...", "optional": false, "groupLabel": null }
      ],
      "steps": ["...", "..."]
    }
  ]
}`;
}
