// 추출 프롬프트 빌더. 루프가 ITER마다 이 파일을 주로 수정해 추출 품질을 끌어올린다.
// 현재는 텍스트 소스 + 영상 시각 분석을 함께 주고 구조화 레시피를 요청한다.

export const PROMPT_VERSION = "iter16-evidence-packet-title-ingredient";

const MAX_RECIPE_HINTS = 12;
const TIMESTAMP_RE = /(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*[~-]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?/g;
const TITLE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/;
const NOISE_CANDIDATE_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|재료|ingredients?|instructions?|레시피|recipe|시식|먹방|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|주방용품|용품|bgm|music|음악|문의|email|인스타|instagram|facebook|camera|equipment)(?:$|[\s:：\-])/i;
const ACTION_ONLY_RE = /(썰|자르|다지|넣|볶|끓|굽|삶|튀|섞|무치|버무리|졸이|익히|헹구|씻|예열|가열|보관|담|올리|뿌리|간하|완성|먹)/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|꼬치|야끼|치즈|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;

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
1. 영상이 실제로 조리 과정을 보여주는 요리를 모두 찾아 recipes[]로 분리한다. 시판품을 활용해도 조리 동작(손질·양념·가열·조립)이 있으면 포함하고, 시식·외식·재탕 언급만 있는 것은 제외한다. 완성된 기존 요리에 양념 하나를 추가하거나 맛 변형만 보여주는 장면은 별도 recipe로 분리하지 말고 기존 요리의 재료와 단계로 합친다.
2. 다중 레시피 영상이면 [SOURCE: recipe_candidate_hints], 제목, 설명란 타임라인을 체크리스트처럼 대조하고, 먼저 실제 조리 장면이 있는 후보를 내부적으로 전부 열거한 뒤 recipes[]에 빠짐없이 넣는다. 후보가 A&B, A/B, A·B, A+B처럼 결합되어 있으면 실제 조리 장면이 각각 있는 한 별도 recipes[]로 분리한다. 제목이 "A와 B" 또는 "A과 B"처럼 와/과로 결합되어 있고 양쪽이 각각 요리명 후보라면 같은 기준으로 분리한다. 단, 한 요리의 소스·토핑·곁들임만 뜻하면 과분리하지 않는다. 후보명이 조금 달라도 같은 요리이면 같은 evidence packet으로 묶는다(예: "맥적"과 "맥적구이", "등촌칼국수"와 "등촌식 멸치칼국수", "항정살 마늘쫑 솥밥"과 "마늘쫑 항정솥밥").
3. 자막이 빈약하거나 노이즈가 있으면 영상 화면·발화·조리 흐름으로 누락 구간을 채운다. 설명란 타임라인에 있는 후보를 뺐다면, 그 후보가 조리 장면이 없거나 시식/구매/외식 언급뿐인 경우여야 한다. 여러 후보가 있을 때는 후보별로 evidence packet을 내부적으로 만든다. evidence packet은 후보 제목, 관련 텍스트/발화/자막, 관련 영상 장면, 재료 후보, 단계 후보를 한 묶음으로 가진다. 각 후보의 근거끼리 섞지 않는다. recipes[]는 evidence packet 단위로 만들고, 한 packet의 양념·곁들임·고명·단계를 다른 packet으로 옮기지 않는다.
4. 재료(ingredients): 조리에 실제로 쓰이는 식재료·양념만. name은 한국어 표준명, 외국어·원문 표기는 nameAliases에. 재료의 정체성과 형태를 보존하고, 가공식품·완제품 소스·양념장·원물 채소·분말 양념을 서로 마음대로 치환하지 마라. 예를 들어 완제품 소스나 양념장이 실제로 쓰였으면 원물 재료로 풀어 쓰지 말고, 원물 채소가 실제로 쓰였으면 비슷한 완제품으로 바꾸지 않는다. 만들기 단계에 등장하지 않는 재료는 넣지 마라. 설명란·댓글·자막에 "재료명 수량단위" 목록이 있으면 먼저 그 목록을 훑고, 실제 조리 장면에 쓰인 항목만 recipes[].ingredients에 반영한다. 이벤트, 구매 인증, 댓글 이벤트, 선물, 쿠폰, 할인, 배송, 상품 출고, 추첨 안내의 수량이나 상품명은 실제 조리 투입량이 아니므로 재료명·재료 분량으로 쓰지 않는다. 출력 직전 각 recipes[]마다 ingredients[]를 steps[]와 대조해, 양념장·고춧가루 종류·젓갈류(예: 새우젓)·간 조절 재료·곁들임 소스·무침 양념·고명·마무리 향채·마무리 토핑처럼 단계에서 쓰인 재료가 빠졌는지 점검하고 빠진 항목은 보충한다. 단, source와 영상에 없는 소량 양념·향채·고명은 추측해서 추가하지 않는다. 재료 목록, 자막, 발화, 화면이 서로 다르면 실제 조리 투입 장면과 발화/자막 근거가 같은 재료 정체성을 가리키는지 먼저 확인하고, 근거가 약하면 더 일반적인 추정 재료로 바꾸지 말고 원문 표기를 nameAliases에 보존한다. "양념 돼지고기", "갈색 소스", "갈색 액체 양념", "초록 잎채소", "초록색 줄기채소"처럼 색·상태만 말하는 임시 이름은 최후의 수단이다. 텍스트·자막·발화·화면에서 구체 재료가 보이면 반드시 된장, 진간장, 다진 마늘, 들기름, 고춧가루, 부추, 통깨처럼 구체명으로 쓴다. 이미 구체명으로 잡힌 재료를 더 일반적인 임시 이름으로 덮어쓰지 않는다. 같은 재료가 제목·설명·댓글·자막에서 다른 말로 반복될 때는 의미가 같은 항목을 중복하지 말고 하나로 합치되, 서로 다른 형태(예: 원물, 절임, 소스, 분말, 완제품)는 같은 재료로 합치지 않는다. 국/찌개는 자동자막이 깨져도 영상 화면·자막 카드·투입 장면을 우선 확인해 양파·설탕·소금·후추·고추류처럼 단맛/간/향을 조절하는 부재료가 보이면 소량이어도 남긴다. 특히 김치찌개·돼지고기찌개류는 김치·고기·쌀뜨물만으로 끝내지 말고, 국간장 뒤에 들어가는 설탕/양파, 간 맞추기용 소금/새우젓, 마지막 후추, 청양고추와 별도로 보이는 붉은 고추를 최종 체크리스트로 재대조한다. 붉은 곁들임 소스나 파채소스처럼 색이 있는 소스에 가루 양념을 넣는 장면이 보이면 고춧가루·후추 같은 분말 양념도 누락하지 않는다. 냉파스타·국수·샐러드의 고명은 실제로 올린 재료만 남기고, 비슷해 보인다는 이유만으로 들깨가루·쪽파 같은 고명을 추가하지 않는다. 반대로 단계 근거가 전혀 없는 재료는 보충하지 않는다.
5. 분량(amount/unit): 텍스트 명시 > 발화 > 화면 자막 > 시각 추정 순으로 최대한 채워 amount null을 피한다. amount와 unit은 같은 출처에서 한 쌍으로 고르고, 더 높은 우선순위 출처가 값과 단위 또는 단위 family(g/ml/컵/큰술/작은술/개 등)를 명시하면 화면상 양이 다르게 보여도 그 명시 단위를 unit에 쓴다. "굴소스 1큰술", "양파 반 개", "물 500ml", "두부 1모"처럼 재료명과 수량단위가 붙어 있거나 괄호 안에 있으면 amount에는 숫자·범위·분수만, unit에는 원 단위 family를 표준 한국어 단위로 분리한다. amount는 숫자·범위·분수만 넣고, "적당량/약간/취향껏/넉넉히/1:1 비율" 같은 정성·비율 표현은 amount에 넣지 않는다. 다만 말로는 정성 표현뿐이어도 화면에서 투입량이 보이면 1 꼬집, 1 작은술, 1 큰술, 1 줌, 1/2 컵처럼 관찰 가능한 단위와 근사 숫자를 넣고 amountBasis는 반드시 "visual-estimate"로 둔다. 화면에 보이는 통채소·슬라이스 채소·버섯·치즈·기름·소금·후추·깨·고명은 실제로 조리에 쓰였으면 "보였지만 수량 미상"으로 null 처리하지 말고 개/줌/큰술/작은술/꼬집 같은 가장 가까운 단위로 근사한다. 국/찌개 액체는 컵·국자·병이 보일 때 한 번 넣은 용기 개수만 적지 말고 최종 냄비에 들어간 전체 대략량을 컵 단위로 추정한다. 정확한 수치가 없어도 영상에서 개수, 스푼 수, 컵·줌·꼬집·팩·봉·모 같은 단위, 한 번에 넣는 대략적 양이 보이면 거짓 정밀값 대신 정직한 근사값을 amount에 넣는다. 레시피에 일부만 쓰는 포장 수량·상품 전체 수량과 실제 조리 투입량을 구분하고, 실제 조리 투입량이 불분명하면 상품 전체 수량으로 대체하지 않는다. 솥밥은 쌀과 물/육수의 비율, 물 1컵처럼 밥 짓는 액체, 뜸 들임 조건을 빠뜨리지 말고, 고기·토핑은 포장 수량이 아니라 실제 올린 양을 기준으로 한다. 작은술/티스푼/tsp/teaspoon은 unit "작은술", 큰술/밥숟가락/T/tbsp/tablespoon은 unit "큰술"로 구분한다. visual-estimate 재료도 조리에 실제로 쓰인 경우에만 ingredients에 넣고, 그 재료가 처음 투입되는 만들기 단계에는 재료명을 반드시 적는다. 단위는 선택한 출처의 단위를 amount와 unit로 분리해 보존하고, 다른 출처의 시각 단위와 섞거나 g↔ml, 컵↔ml, 숟가락↔g처럼 다른 단위로 환산하지 않는다. amountBasis로 근거를 표기한다(stated/spoken/onscreen/visual-estimate). 텍스트·발화·자막·영상 어느 쪽에서도 수량 단서가 전혀 없을 때만 amount를 null로 둔다.
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
