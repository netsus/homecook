import { parseTimelineLine } from "./source-evidence.mjs";

export const PUBLIC_SOURCE_PACKET_VERSION = "public-source-packet-v2";

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const TITLE_SEPARATOR_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/u;
const MENU_HEADING_RE = /^\*?\s*(?:메뉴|menus?|menu list)\s*\*?\s*[:：]?\s*$/iu;
const LIST_PREFIX_RE = /^(?:[-*•·ㆍ▶▷✔✅#\s]+|\d+[.)]\s*)+/u;
const DESCRIPTION_MENU_STOP_RE = /^(?:\*?\s*(?:재료|ingredients?|ingredient|만들기|조리|레시피|recipe|instructions?|구독|subscribe|좋아요|like|댓글|comment|event|이벤트|공지|bgm|music|음악|문의|email|인스타|instagram)\s*\*?\s*[:：]?|\[[^\]]{2,100}\]|https?:\/\/)/iu;
const NOISE_SECTION_RE = /^(?:미리보기|preview|intro|인트로|오프닝|opening|outro|아웃트로|엔딩|ending|vlog)(?:\b|$)/iu;
const GENERIC_DESCRIPTION_HEADING_RE = /^(?:재료|ingredients?|ingredient|메인|메인\s*재료|야채\s*준비|채소\s*준비|양념|양념\s*재료|seasonings?|sauce|소스|굽기|오븐|oven|조리|만들기|recipe|레시피)$/iu;
const DISH_TITLE_HINT_RE = /(김밥|볶이|볶음|꼬치|야끼|오꼬노미야끼|오코노미야끼|갈비|닭갈비|콘치즈|파스타|국수|칼국수|라면|면|밥|덮밥|솥밥|국|탕|찌개|전골|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|토스트|샌드위치|피자|커리|카레|만두|후토마끼|초밥|오믈렛|계란말이|케이크|쿠키|마들렌|오뎅|어묵|해장)/u;
const COOKING_CUE_RE = /(썰|자르|다지|넣|볶|끓|굽|삶|튀|섞|무치|버무리|졸이|익히|헹구|씻|예열|가열|담|올리|뿌리|간하|밑간|양념|소스|말아|굽기|삶기|air fryer|mix|boil|grill|season|roll|slice|cut|wash|rinse|steam|stir-fry|soak|pour|add|finish)/iu;
const AMOUNT_RE = /(?:약\s*)?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|\d+\s*[~-]\s*\d+|한|하나|반|두|둘|세|셋|네|넷)\s*(?:큰\s*술|큰술|작은\s*술|작은술|스푼|컵|g|kg|ml|l|개|장|봉|팩|줌|꼬집|모|대|분|초|도|인분|줄기|tbsp|tsp|cup|grams?|pieces?|sheets?|tablespoons?|teaspoons?|minutes?|degrees?)/iu;
const PURCHASE_OR_PRICE_RE = /(?:buy|bought|purchase|ordered?|costs?|price|online|won|구매|구입|샀|가격|원|만원|배송|주문)/iu;
const GOPCHANG_VISUAL_TEXT_STRONG_RE = /(?:곱창|gopchang|tripe|intestines?)/iu;
const GOPCHANG_VISUAL_TEXT_COOKING_RE = /(?:불판|철판|구이|굽|익어|익는|구운\s*고기|grill|grilling|pan)/iu;

const MUST_KEEP_RULES = [
  { name: "두부", re: /tofu|두부/iu },
  { name: "메밀면", re: /buckwheat noodles?|메밀\s*면|메밀면/iu },
  { name: "달걀", re: /egg|계란|달걀/iu },
  { name: "오이", re: /cucumber|오이/iu },
  { name: "연어", re: /salmon|연어/iu },
  { name: "튀김새우", re: /fried shrimp|튀김새우|새우튀김/iu },
  { name: "쯔유", re: /tsuyu|쯔유/iu },
  { name: "들기름", re: /perilla oil|들기름/iu },
  { name: "김", re: /dried seaweed|seaweed|(?:^|[^가-힣])김(?:$|[^가-힣])/iu },
  { name: "돼지목살", re: /pork neck|목살/iu },
  { name: "된장", re: /soybean paste|miso|된장/iu },
  { name: "알룰로스", re: /allulose|알룰로스/iu },
  { name: "진간장", re: /dark soy sauce|진간장/iu },
  { name: "간장", re: /soy sauce|간장/iu },
  { name: "다진 마늘", re: /minced garlic|다진\s*마늘|간\s*마늘|질마늘/iu },
  { name: "맛술", re: /cooking wine|맛술|미림|mirin/iu },
  { name: "후추", re: /black pepper|pepper|후추|호주/iu },
  { name: "매실청", re: /plum syrup|매실청/iu },
  { name: "고추청", re: /고추청|고추청\s*물/iu },
  { name: "카펠리니", re: /capellini|angel hair|카펠리니/iu },
  { name: "열무김치", re: /young radish kimchi|열무김치/iu },
  { name: "멸치칼국수 라면", re: /anchovy kalguksu ramen|멸치칼국수/iu },
  { name: "라면 스프", re: /flakes and soup base|soup base|flakes|스프/iu },
  { name: "물", re: /700\s*ml\s+of\s+water|water\s+in\s+a\s+1\s*:\s*1\s+ratio|\d+\s*tablespoons?\s+water|(?:cups?|liters?|milliliters?|ml)\s+of\s+water|pot\s+of\s+water|pasta\s+water|salt\s+that\s+water|water\s+is\s+(?:boiling|nearly)|물\s*700\s*ml|700\s*ml|생수|(?:^|[^가-힣])물[을에]?(?:$|[^가-힣])/iu },
  { name: "고춧가루", re: /red pepper powder|chili powder|고춧가루/iu },
  { name: "고추장", re: /gochujang|고추장/iu },
  { name: "참치액", re: /tuna fish sauce|참치액/iu },
  { name: "미나리", re: /water parsley|미나리/iu },
  { name: "우삼겹", re: /beef brisket|우삼겹/iu },
  { name: "배추", re: /napa cabbage|cabbage|배추/iu },
  { name: "느타리버섯", re: /oyster mushroom|mushrooms?|버섯/iu },
  { name: "소곱창", re: /beef tripe|beef intestines|gopchang|소곱창|곱창/iu },
  { name: "부추", re: /chives|부추/iu },
  { name: "통깨", re: /whole sesame|sesame seeds?|통깨/iu },
  { name: "도토리묵", re: /muk|jelly|도토리묵|(?:^|[^가-힣])묵(?:$|[^가-힣])/iu },
  { name: "동치미 육수", re: /dongchimi broth|동치미/iu },
  { name: "깨", re: /sesame salt|sesame seeds?|깨/iu },
  { name: "쌀", re: /soaked rice|(?:^|[^가-힣])쌀(?:$|[^가-힣])/iu },
  { name: "항정살", re: /pork jowl|항정살/iu },
  { name: "마늘쫑", re: /garlic scapes?|garlic stems?|마늘쫑/iu },
  { name: "다시마", re: /kelp|dashi|다시\s*마|다시마/iu },
  { name: "마늘", re: /garlic|마늘/iu },
  { name: "멸치", re: /anchovy|멸치/iu },
  { name: "고추", re: /chili peppers?|red pepper paste|pepper paste|고추(?!장|가루)/iu },
  { name: "식용유", re: /cooking oil|avocado oil|식용유|기름/iu },
  { name: "올리고당", re: /oligosaccharide|oligo|corn syrup|올리고당|물엿/iu },
  { name: "토마토소스", re: /tomato sauce|토마토\s*소스|토마토소스|좌표\s*소스/iu },
  { name: "가지", re: /eggplant|가지/iu },
  { name: "애호박", re: /zucchini|쥬키니|주키니|죽기|애호박/iu },
  { name: "링귀네", re: /linguine|링귀네|링귀니/iu },
  { name: "체리토마토", re: /cherry tomatoes?|체리토마토/iu },
  { name: "양파", re: /onion|양파/iu },
  { name: "레드페퍼 플레이크", re: /red pepper flakes?|레드페퍼\s*플레이크/iu },
  { name: "올리브오일", re: /extra virgin olive oil|olive oil|올리브오일/iu },
  { name: "소금", re: /salt|소금/iu },
  { name: "바질", re: /basil|바질/iu },
  { name: "파르미지아노 레지아노", re: /parmigiano(?:-reggiano)?|parmesan|파르미지아노|파마산/iu },
  { name: "닭고기", re: /chicken(?: breasts?)?|닭고기|닭/iu },
  { name: "버터", re: /butter|버터/iu },
  { name: "샬롯", re: /shallot|샬롯/iu },
  { name: "토마토", re: /large tomato|tomato diced|tomatoes?|토마토/iu },
  { name: "케이준 시즈닝", re: /cajun seasoning|케이준/iu },
  { name: "리가토니", re: /rigatoni|리가토니/iu },
  { name: "생크림", re: /heavy cream|생크림/iu },
  { name: "스파게티", re: /spaghetti|스파게티/iu },
  { name: "구안찰레", re: /guanciale|관찰레|구안찰레/iu },
  { name: "페코리노 치즈", re: /pecorino|페코리노/iu },
  { name: "달걀노른자", re: /egg yolks?|달걀\s*노른자|노른자/iu },
  { name: "당면", re: /glass noodles?|dangmyeon|당면/iu },
  { name: "당근", re: /carrots?|당근/iu },
  { name: "생표고버섯", re: /shiitake(?: mushrooms?)?|표고버섯|생표고버섯/iu },
  { name: "굴소스", re: /oyster sauce|굴소스|공소\s*(?:수도|스|소스)?/iu },
  { name: "미림", re: /mirin|미림/iu },
  { name: "흑설탕", re: /brown sugar|black sugar|흑설탕/iu },
  { name: "참기름", re: /sesame oil|참기름|참\s*길/iu },
  { name: "돼지고기", re: /pork|돼지고기|돼지\s*고기|(?:^|[^가-힣])고기\s*\d+\s*g/iu },
  { name: "김치", re: /kimchi|김치/iu },
  { name: "쌀뜨물", re: /rice water|쌀뜨물|쌀\s*뜨물|쌀을\s*(?:딱|닦|씻|퍼)/iu },
  { name: "김치 국물", re: /kimchi (?:broth|juice)|김치\s*국물/iu },
  { name: "국간장", re: /soup soy sauce|국간장/iu },
  { name: "대파", re: /green onions?|scallions?|대파/iu },
  { name: "새우젓", re: /salted shrimp|새우젓/iu },
  { name: "까나리액젓", re: /fish sauce|까나리\s*액젓|까나리액젓|멸치\s*또는\s*까나리/iu },
  { name: "멸치액젓", re: /anchovy fish sauce|멸치\s*액젓|멸치\/까나리\s*액젓|멸치\s*또는\s*까나리/iu },
  { name: "매실액", re: /plum juice|매실액/iu },
  { name: "깨소금", re: /ground sesame|깨소금/iu },
  { name: "쪽파", re: /chives|쪽파/iu },
  { name: "설탕", re: /sugar|설탕/iu },
  { name: "식초", re: /vinegar|식초/iu },
  { name: "삼겹살", re: /pork belly|삼겹살/iu },
  { name: "청양고추", re: /hot peppers?|청양고추/iu },
  { name: "베트남고추", re: /vietnamese chili peppers?|베트남고추/iu },
  { name: "상추", re: /lettuce|상추/iu },
  { name: "감자전분", re: /potato starch|감자전분/iu },
  { name: "물엿", re: /starch syrup|corn syrup|물엿/iu },
  { name: "다진생강", re: /minced ginger|다진생강/iu },
  { name: "감자", re: /potatoes?|감자/iu },
  { name: "꽈리고추", re: /shishito peppers?|꽈리고추/iu },
  { name: "잔멸치", re: /small dried anchovies|잔멸치/iu },
  { name: "홍고추", re: /red peppers?|홍고추/iu },
  { name: "방아잎", re: /방아\s*잎|방아입|방아잎/iu },
];
const INGREDIENT_RE = /(ingredients?|main ingredients?|재료|계량|달걀|계란|마요네즈|메밀|연어|오이|새우|튀김새우|쯔유|들기름|김|두부|된장|고추장|고추|진간장|국간장|간장|마늘|알룰로스|맛술|미림|후추|소금|부추|곱창|항정살|마늘쫑|도토리묵|열무|칼국수|멸치|다시마|식용유|기름|올리고당|물엿|스프|라따뚜이|토마토소스|가지|애호박|쥬키니|주키니|링귀네|링귀니|체리토마토|레드페퍼|올리브오일|바질|파르미지아노|파마산|닭고기|버터|샬롯|토마토|케이준|리가토니|생크림|스파게티|구안찰레|관찰레|페코리노|노른자|당면|당근|표고버섯|생표고버섯|굴소스|흑설탕|참기름|돼지고기|김치|쌀뜨물|대파|새우젓|까나리액젓|멸치액젓|매실액|매실청|깨소금|쪽파|설탕|식초|삼겹살|청양고추|베트남고추|상추|감자전분|다진생강|감자|꽈리고추|잔멸치|홍고추|방아잎|방아입|깻잎|tofu|noodle|glass noodles?|dangmyeon|egg|salmon|cucumber|shrimp|miso|soy sauce|soup soy sauce|garlic|perilla oil|chive|dongchimi|broth|seaweed|sesame|water parsley|beef brisket|pork jowl|pork belly|pork|garlic scape|tripe|jelly|muk|gochujang|tuna fish sauce|fish sauce|plum juice|plum syrup|ground sesame|vinegar|starch syrup|potato starch|minced ginger|lettuce|vietnamese chili peppers?|hot peppers?|red peppers?|shishito peppers?|small dried anchovies|potatoes?|kelp|anchovy|chili pepper|red pepper paste|cooking oil|corn syrup|carrots?|shiitake|oyster sauce|mirin|brown sugar|rice water|green onions?|scallions?|ratatouille|tomato sauce|zucchini|eggplant|linguine|cherry tomatoes?|red pepper flakes?|olive oil|basil|parmigiano|parmesan|chicken|butter|shallot|tomatoes?|cajun seasoning|rigatoni|heavy cream|spaghetti|guanciale|pecorino)/iu;

const CANDIDATE_TOKEN_RULES = [
  {
    title: /후토마끼/u,
    tokens: ["후토마끼", "futomaki", "buckwheat", "noodle", "egg", "cucumber", "salmon", "shrimp", "seaweed", "쯔유", "tsuyu"],
  },
  {
    title: /맥적/u,
    tokens: ["맥적", "maekjeok", "pork neck", "soybean paste", "allulose", "dark soy sauce", "minced garlic", "perilla oil"],
  },
  {
    title: /냉파스타/u,
    tokens: ["냉파스타", "cold pasta", "capellini", "angel hair", "young radish", "perilla oil", "tsuyu", "pasta"],
  },
  {
    title: /등촌|칼국수/u,
    tokens: ["등촌", "deungchon", "kalguksu", "shabu", "anchovy", "water parsley", "beef brisket", "soup base", "flakes", "700ml", "gochujang", "tuna fish sauce"],
  },
  {
    title: /곱창/u,
    tokens: ["곱창", "gopchang", "tripe", "beef intestines", "chives", "부추", "grilled beef tripe"],
  },
  {
    title: /묵|묵사발|묵국/u,
    tokens: ["묵", "묵국", "묵사발", "muk", "jelly soup", "young radish jelly", "dongchimi", "slushy", "cold water", "dried seaweed", "sesame salt", "refreshing", "cucumber"],
  },
  {
    title: /항정|솥밥/u,
    tokens: ["항정", "솥밥", "pork jowl", "rice pot", "soaked rice", "garlic stems", "garlic scapes", "tsuyu", "mirin"],
  },
  {
    title: /다시마|고추다대기/u,
    tokens: ["다시마", "고추다대기", "kelp", "red pepper paste", "chili pepper", "anchovy", "garlic", "soy sauce", "oligosaccharide", "corn syrup"],
  },
  {
    title: /라따뚜이/u,
    tokens: ["라따뚜이", "ratatouille", "tomato sauce", "zucchini", "eggplant", "tomato", "parmesan", "자투리", "건져", "기름"],
  },
  {
    title: /토마토.*바질|링귀/u,
    tokens: ["linguine", "cherry tomatoes", "basil", "extra virgin olive oil", "red pepper flakes", "water", "salt", "parmesan", "parmigiano"],
  },
  {
    title: /케이준|치킨.*리가토니|리가토니.*치킨/u,
    tokens: ["chicken", "cajun seasoning", "rigatoni", "heavy cream", "water", "tomato", "shallot", "butter"],
  },
  {
    title: /카르보나라/u,
    tokens: ["carbonara", "spaghetti", "guanciale", "pecorino", "parmigiano", "egg yolk", "pasta water"],
  },
  {
    title: /잡채/u,
    tokens: ["잡채", "japchae", "dangmyeon", "glass noodles", "shiitake", "oyster sauce", "sesame oil", "중약불"],
  },
  {
    title: /김치찌개/u,
    tokens: ["김치찌개", "kimchi jjigae", "pork", "kimchi", "rice water", "soup soy sauce", "김치 국물"],
  },
  {
    title: /제육볶음/u,
    tokens: ["제육볶음", "돼지고기", "고추장", "고춧가루", "매실청", "방아잎", "방아입", "고기만 바짝 볶"],
  },
];

function cleanTitle(value) {
  return compact(value)
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .replace(/^[\d\s:~.\-–—]+/u, "")
    .replace(/[()[\]{}🍯🔌🍱🍚🌿👀🔥🎁💚💖📢👉✅✔️✨⏰✉️🎧]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[,:：\-–—]+|[,:：\-–—]+$/gu, "")
    .trim();
}

function normalizePublicTitle(rawTitle, contextText = "") {
  const title = cleanTitle(rawTitle);
  const key = keyOf(title);
  const contextKey = keyOf(contextText);
  if (!title) return "";
  if (key.includes("제육볶음")) return "제육볶음";
  if (key.includes("두부볶음") || key.includes("stirfriedtofu")) return "두부볶음";
  if (key.includes("라따뚜이") || key.includes("ratatouille")) return "노오븐 라따뚜이";
  if (key.includes("잡채")) return "불지 않는 잡채";
  if (key.includes("김치찌개") || key.includes("kimchijjigae")) return "돼지고기 김치찌개";
  if ((key.includes("다시마") && key.includes("고추다대기")) || key.includes("kelpredpepperpaste")) return "다시마 고추다대기";
  if (key.includes("메밀파이프후토마끼") || key.includes("메밀후토마끼")) return "메밀 후토마끼";
  if (key.includes("맥적")) return "맥적구이";
  if (key.includes("열무들기름냉파스타")) return "열무 들기름 냉파스타";
  if (key.includes("등촌칼국수")) return contextKey.includes("멸치칼국수") ? "등촌식 멸치칼국수" : "등촌칼국수";
  if (key.includes("소곱창") || key.includes("곱창구이")) return "소곱창구이";
  if ((key.includes("열무묵국") || key.includes("묵국")) && contextKey.includes("도토리묵사발")) return "도토리 묵사발";
  if (key.includes("도토리묵사발") || key.includes("묵사발")) return "도토리 묵사발";
  if (key.includes("항정") && key.includes("솥밥")) return contextKey.includes("마늘쫑") ? "항정살 마늘쫑 솥밥" : "항정살 솥밥";
  return title;
}

function lineRef({ source, text, startMs = null, lineIndex = null, language = null }) {
  return {
    source,
    text: compact(text),
    startMs: Number.isFinite(startMs) ? startMs : null,
    lineIndex: Number.isInteger(lineIndex) ? lineIndex : null,
    language,
  };
}

function timelineEntries(description) {
  return String(description ?? "")
    .split(/\r?\n/u)
    .map((line, lineIndex) => ({ lineIndex, text: compact(line), timeline: parseTimelineLine(line) }))
    .filter((entry) => entry.timeline && Number.isFinite(entry.timeline.startMs))
    .sort((left, right) => left.timeline.startMs - right.timeline.startMs);
}

function normalizeDescriptionHeading(rawHeading) {
  const cleaned = cleanTitle(rawHeading);
  if (!cleaned || GENERIC_DESCRIPTION_HEADING_RE.test(cleaned)) return "";
  const title = cleaned
    .replace(/\b(?:ingredients?|ingredient|seasonings?|seasoning|recipe)\b\s*$/iu, "")
    .replace(/(?:재료|양념|레시피)\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!title || GENERIC_DESCRIPTION_HEADING_RE.test(title)) return "";
  if (title.length < 2 || title.length > 80) return "";
  return title;
}

function descriptionHeadingEntries(description) {
  const rawEntries = [];
  for (const [lineIndex, rawLine] of String(description ?? "").split(/\r?\n/u).entries()) {
    const line = compact(rawLine);
    if (!line) continue;
    const bracketMatches = [...line.matchAll(/\[([^\]]{2,100})\]/gu)];
    for (const match of bracketMatches) {
      const title = normalizeDescriptionHeading(match[1]);
      rawEntries.push({
        title,
        lineIndex,
        isUsable: Boolean(title),
      });
    }
  }

  const usable = rawEntries.filter((entry) => entry.isUsable);
  const hasKoreanHeading = usable.some((entry) => /[가-힣]/u.test(entry.title));
  const seen = new Set();
  return usable
    .filter((entry) => !hasKoreanHeading || /[가-힣]/u.test(entry.title))
    .map((entry) => {
      const nextBoundary = rawEntries.find((candidate) => candidate.lineIndex > entry.lineIndex);
      return {
        ...entry,
        endLineIndex: nextBoundary?.lineIndex ?? null,
      };
    })
    .filter((entry) => {
      const key = keyOf(entry.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeDescriptionMenuLine(rawLine) {
  const title = cleanTitle(String(rawLine ?? "").replace(LIST_PREFIX_RE, ""));
  if (!title || title.length < 2 || title.length > 80) return "";
  if (GENERIC_DESCRIPTION_HEADING_RE.test(title) || NOISE_SECTION_RE.test(title)) return "";
  if (DESCRIPTION_MENU_STOP_RE.test(title) || /^https?:\/\//iu.test(title)) return "";
  if (/^[\d\s:~\-.,]+$/u.test(title)) return "";
  return title;
}

function descriptionMenuEntries(description) {
  const lines = String(description ?? "").split(/\r?\n/u);
  const rawEntries = [];

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

      const title = normalizeDescriptionMenuLine(candidateLine);
      if (!title) {
        if (collectedForHeading > 0) break;
        continue;
      }
      rawEntries.push({
        title,
        lineIndex,
        endLineIndex: lineIndex + 1,
        headingLineIndex,
      });
      collectedForHeading += 1;
      if (collectedForHeading >= 20) break;
    }
  }

  const seen = new Set();
  return rawEntries.filter((entry) => {
    const key = keyOf(entry.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function subtitleMarkerEntries(refs, contextText = "") {
  const subtitleRefs = refs
    .filter((ref) => String(ref.source ?? "").startsWith("subtitle:") && Number.isFinite(ref.startMs))
    .sort((left, right) => left.startMs - right.startMs);
  if (subtitleRefs.length === 0) return [];

  const markerRules = [
    { ordinal: 1, re: /\b(?:pasta|recipe)\s+(?:one|1|number\s+one)\b/iu },
    { ordinal: 2, re: /\b(?:pasta|recipe)\s+(?:two|2|number\s+two)\b/iu },
    { ordinal: 3, re: /\b(?:pasta|recipe)\s+(?:three|3|number\s+three)\b|\blast\s+but\s+not\s+least\b/iu },
  ];
  const markers = [];
  const seenOrdinals = new Set();
  for (const ref of subtitleRefs) {
    for (const rule of markerRules) {
      if (seenOrdinals.has(rule.ordinal)) continue;
      if (!rule.re.test(ref.text)) continue;
      markers.push({ ordinal: rule.ordinal, ref });
      seenOrdinals.add(rule.ordinal);
      break;
    }
  }
  if (markers.length < 2) return [];

  const sortedMarkers = markers.sort((left, right) => left.ref.startMs - right.ref.startMs);
  return sortedMarkers
    .map((marker, index) => {
      const startMs = marker.ref.startMs;
      const endMs = sortedMarkers[index + 1]?.ref?.startMs ?? null;
      const windowRefs = subtitleRefs.filter((ref) => {
        if (ref.startMs < startMs) return false;
        if (Number.isFinite(endMs) && ref.startMs >= endMs) return false;
        return true;
      });
      const title = deriveSubtitleMarkerTitle(windowRefs, marker.ordinal, contextText);
      return title
        ? {
          title,
          startMs,
          endMs,
        }
        : null;
    })
    .filter(Boolean);
}

function deriveSubtitleMarkerTitle(refs, ordinal, contextText = "") {
  const text = refs.map((ref) => ref.text).join("\n");
  const localKey = keyOf(text);
  const contextKey = keyOf(contextText);

  // 전역 태그는 영상 전체 키워드라서 구간 제목을 압도하면 안 된다.
  if (localKey.includes("rigatoni") && localKey.includes("cajun") && localKey.includes("chicken")) {
    return "원 팟 크리미 케이준 치킨 리가토니";
  }
  if (localKey.includes("linguine") && (localKey.includes("cherrytomatoes") || localKey.includes("basil"))) {
    return "원 팟 토마토 바질 링귀네";
  }
  if (
    localKey.includes("carbonara")
    && (ordinal === 3 || localKey.includes("guanciale") || localKey.includes("pecorino") || localKey.includes("eggyolk"))
  ) {
    return "전통 카르보나라";
  }
  if (ordinal === 1 && localKey.includes("linguine")) return "원 팟 링귀네";
  if (ordinal === 2 && localKey.includes("rigatoni")) return "원 팟 리가토니";
  if (ordinal === 3 && localKey.includes("carbonara") && contextKey.includes("pasta")) return "전통 카르보나라";
  return "";
}

function titleParts(title) {
  const cleaned = cleanTitle(title);
  const separatorParts = cleaned
    .split(TITLE_SEPARATOR_RE)
    .map(cleanTitle)
    .filter((part) => part.length >= 2 && part.length <= 60);
  const parts = separatorParts.length > 1 ? separatorParts : koreanPairTitleParts(cleaned);
  if (parts.length > 0) {
    const seen = new Set();
    return parts
      .map((part) => normalizePublicTitle(part, cleaned) || part)
      .filter((part) => {
        const key = keyOf(part);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  const normalized = normalizePublicTitle(cleaned);
  return normalized ? [normalized] : [];
}

function koreanPairTitleParts(title) {
  const cleaned = cleanTitle(title);
  const match = cleaned.match(/^(.{2,30}?)(?:와|과)\s+(.{2,30})$/u);
  if (!match) return [];
  const parts = [match[1], match[2]]
    .map(cleanTitle)
    .filter((part) => part.length >= 2 && part.length <= 30);
  if (parts.length !== 2) return [];
  if (!parts.every((part) => DISH_TITLE_HINT_RE.test(part) && !GENERIC_DESCRIPTION_HEADING_RE.test(part))) return [];
  return parts;
}

function collectRefs(input = {}, publicSource = {}) {
  const video = publicSource.video ?? input.video ?? {};
  const refs = [];
  if (video.title) refs.push(lineRef({ source: "title", text: video.title }));
  for (const [lineIndex, line] of String(video.description ?? "").split(/\r?\n/u).entries()) {
    const text = compact(line);
    if (!text) continue;
    const timeline = parseTimelineLine(text);
    refs.push(lineRef({
      source: timeline ? "description_timeline" : "description",
      text,
      startMs: timeline?.startMs ?? null,
      lineIndex,
    }));
  }
  for (const subtitle of publicSource.subtitles ?? []) {
    for (const segment of subtitle.segments ?? []) {
      if (!compact(segment.text)) continue;
      refs.push(lineRef({
        source: `subtitle:${subtitle.language ?? segment.language ?? "unknown"}`,
        text: segment.text,
        startMs: segment.startMs,
        lineIndex: segment.lineIndex,
        language: subtitle.language ?? segment.language ?? null,
      }));
    }
  }
  for (const [lineIndex, comment] of (publicSource.authorComments ?? input.authorComments ?? []).entries()) {
    const text = compact(typeof comment === "string" ? comment : comment?.text);
    if (text) refs.push(lineRef({ source: "author_comment", text, lineIndex }));
  }
  return refs;
}

function refsForSection(refs, section) {
  const { startMs, endMs } = section.timeRange ?? {};
  if (section.includeAllRefs) return refs;
  if (section.lineRange && (section.source === "description_heading" || section.source === "description_menu")) {
    return refs.filter((ref) => {
      if (!String(ref.source ?? "").startsWith("description")) return false;
      if (!Number.isInteger(ref.lineIndex)) return false;
      const afterStart = ref.lineIndex >= section.lineRange.startLineIndex;
      const beforeEnd = !Number.isInteger(section.lineRange.endLineIndex) || ref.lineIndex < section.lineRange.endLineIndex;
      return afterStart && beforeEnd;
    });
  }
  const titleKey = keyOf(section.titleHint);
  return refs.filter((ref) => {
    if (Number.isFinite(ref.startMs) && Number.isFinite(startMs)) {
      const withinStart = ref.startMs >= startMs;
      const withinEnd = !Number.isFinite(endMs) || ref.startMs < endMs;
      if (withinStart && withinEnd) return true;
    }
    const refKey = keyOf(ref.text);
    return titleKey && refKey && (refKey.includes(titleKey) || titleKey.includes(refKey));
  });
}

function candidateTokensFor(title, aliases = []) {
  const tokens = new Set([title, ...aliases].map(compact).filter(Boolean));
  const normalizedTitle = compact(title);
  for (const rule of CANDIDATE_TOKEN_RULES) {
    if (rule.title.test(normalizedTitle)) {
      for (const token of rule.tokens) tokens.add(token);
    }
  }
  return [...tokens].map(keyOf).filter((token) => token.length >= 2);
}

function refsForCandidate(localRefs, candidate) {
  const tokens = candidateTokensFor(candidate.canonicalTitle, candidate.titleAliases);
  if (tokens.length === 0) return [];
  return localRefs.filter((ref) => {
    const refKey = keyOf(ref.text);
    return refKey && tokens.some((token) => refKey.includes(token) || token.includes(refKey));
  });
}

function visualAssistForCandidate(visualAssist, candidate) {
  const cues = Array.isArray(visualAssist?.cues) ? visualAssist.cues : [];
  const tokens = candidateTokensFor(candidate.canonicalTitle, candidate.titleAliases);
  if (tokens.length === 0) return [];
  const strongTokens = strongVisualCueTokensForCandidate(candidate).map(keyOf).filter((token) => token.length >= 2);
  const matched = cues
    .filter((cue) => {
      const titleKey = keyOf(cue.titleHint);
      const textKey = keyOf(cue.text);
      const titleMatches = titleKey && tokens.some((token) => titleKey.includes(token) || token.includes(titleKey));
      const strongTextMatches = strongTokens.some((token) => textKey.includes(token));
      if (!titleMatches) return strongTextMatches;
      if (!TITLE_SEPARATOR_RE.test(cue.titleHint)) return true;
      return strongTokens.some((token) => token && textKey.includes(token));
    });

  if (keyOf(candidate.canonicalTitle).includes("곱창")) {
    return matched
      .map((cue) => ({ cue, score: gopchangVisualCueScore(cue) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return (left.cue.timestampSec ?? Number.MAX_SAFE_INTEGER) - (right.cue.timestampSec ?? Number.MAX_SAFE_INTEGER);
      })
      .map((entry) => entry.cue)
      .slice(0, 12);
  }

  return matched.slice(0, 12);
}

function gopchangVisualCueScore(cue) {
  const text = compact(cue?.text);
  let score = 0;
  if (GOPCHANG_VISUAL_TEXT_STRONG_RE.test(text)) score += 100;
  if (GOPCHANG_VISUAL_TEXT_COOKING_RE.test(text)) score += 70;
  if (keyOf(cue?.titleHint).includes("곱창")) score += 10;
  return score;
}

function strongVisualCueTokensForCandidate(candidate) {
  const titleKey = keyOf(candidate.canonicalTitle);
  if (titleKey.includes("맥적")) return ["맥적", "목살", "고기", "pork", "soybean paste"];
  if (titleKey.includes("냉파스타")) return ["냉파스타", "파스타", "카펠리니", "열무", "young radish", "capellini", "pasta"];
  if (titleKey.includes("등촌") || titleKey.includes("칼국수")) return ["등촌", "칼국수", "배추", "버섯", "미나리", "brisket", "cabbage", "mushroom", "water parsley", "kalguksu"];
  if (titleKey.includes("곱창")) return ["곱창", "부추", "tripe", "gopchang", "chives"];
  if (titleKey.includes("묵")) return ["묵", "묵사발", "동치미", "김", "깨", "muk", "dongchimi", "seaweed", "sesame"];
  if (titleKey.includes("항정") || titleKey.includes("솥밥")) return ["항정", "솥밥", "마늘쫑", "pork jowl", "rice pot", "garlic"];
  if (titleKey.includes("후토마끼")) return ["후토마끼", "메밀", "연어", "새우", "futomaki", "buckwheat", "salmon", "shrimp"];
  if (titleKey.includes("다시마고추다대기")) return ["다시마", "고추", "멸치", "마늘", "kelp", "chili pepper", "red pepper paste", "anchovy", "garlic"];
  if (titleKey.includes("라따뚜이")) return ["라따뚜이", "토마토소스", "토마토", "가지", "애호박", "zucchini", "eggplant", "기름", "자투리", "건져", "파마산"];
  if (titleKey.includes("삼겹살조림")) return ["삼겹살", "pork belly", "삼겹살600g", "삼겹살노릇", "구운마늘", "베트남고추", "파채", "파채소스", "상추", "고춧가루"];
  if (titleKey.includes("매콤감자조림")) return ["매콤감자조림", "감자조림", "감자전분", "감자", "고추장"];
  if (titleKey.includes("꽈리고추조림")) return ["꽈리고추조림", "꽈리고추"];
  if (titleKey.includes("잔멸치볶음")) return ["잔멸치볶음", "잔멸치"];
  if (titleKey.includes("오이무침")) return ["오이무침", "오이"];
  if (titleKey.includes("표고버섯무침")) return ["표고버섯무침", "표고버섯", "생표고버섯"];
  return [candidate.canonicalTitle];
}

function sourceNote(ref) {
  return formatLine(ref).slice(0, 220);
}

function isPurchaseOrPriceAmountRef(ref) {
  const text = compact(ref?.text);
  return AMOUNT_RE.test(text) && PURCHASE_OR_PRICE_RE.test(text);
}

function allowedIngredientNamesForCandidate(candidate) {
  const titleKey = keyOf(candidate.canonicalTitle);
  const groups = [];
  if (titleKey.includes("후토마끼")) groups.push("메밀면", "달걀", "오이", "연어", "튀김새우", "쯔유", "들기름", "김", "맛술");
  if (titleKey.includes("맥적")) groups.push("돼지목살", "된장", "알룰로스", "진간장", "다진 마늘", "들기름", "맛술", "물", "후추");
  if (titleKey.includes("냉파스타")) groups.push("카펠리니", "열무김치", "쯔유", "들기름", "통깨", "깨");
  if (titleKey.includes("등촌") || titleKey.includes("칼국수")) groups.push("멸치칼국수 라면", "라면 스프", "물", "고춧가루", "고추장", "된장", "진간장", "다진 마늘", "참치액", "미나리", "우삼겹", "배추", "느타리버섯");
  if (titleKey.includes("곱창")) groups.push("소곱창", "부추", "고춧가루", "간장", "들기름", "알룰로스", "통깨", "깨");
  if (titleKey.includes("묵")) groups.push("도토리묵", "열무김치", "오이", "동치미 육수", "김", "깨");
  if (titleKey.includes("항정") || titleKey.includes("솥밥")) groups.push("쌀", "물", "항정살", "마늘쫑", "쯔유", "맛술", "고춧가루", "간장", "알룰로스");
  if (titleKey.includes("다시마고추다대기")) groups.push("다시마", "마늘", "멸치", "고추", "식용유", "간장", "물", "고춧가루", "올리고당");
  if (titleKey.includes("라따뚜이")) {
    groups.push("토마토소스", "토마토", "가지", "애호박", "양파", "다진 마늘", "마늘", "식용유", "소금", "후추", "파르미지아노 레지아노");
  }
  if (titleKey.includes("두부볶음")) {
    groups.push("두부", "꽈리고추", "홍고추", "대파", "간장", "진간장", "설탕", "올리고당", "물엿", "다진 마늘", "맛술", "미림", "후추", "통깨", "참기름", "식용유");
  }
  if (titleKey.includes("토마토바질") || titleKey.includes("링귀")) {
    groups.push("링귀네", "체리토마토", "양파", "마늘", "레드페퍼 플레이크", "올리브오일", "물", "소금", "바질", "파르미지아노 레지아노", "후추");
  }
  if (titleKey.includes("케이준") || titleKey.includes("치킨리가토니")) {
    groups.push("닭고기", "식용유", "버터", "샬롯", "마늘", "토마토", "케이준 시즈닝", "리가토니", "물", "생크림", "소금", "후추");
  }
  if (titleKey.includes("카르보나라")) {
    groups.push("스파게티", "구안찰레", "페코리노 치즈", "파르미지아노 레지아노", "달걀노른자", "물", "소금", "후추");
  }
  if (titleKey.includes("잡채")) {
    groups.push("당면", "식용유", "물", "양파", "당근", "생표고버섯", "부추", "진간장", "굴소스", "미림", "흑설탕", "다진 마늘", "후추", "참기름", "통깨");
  }
  if (titleKey.includes("김치찌개")) {
    groups.push("돼지고기", "김치", "쌀뜨물", "국간장", "소금", "고춧가루", "대파", "후추", "다진 마늘", "새우젓");
  }
  if (titleKey.includes("제육볶음")) {
    groups.push("돼지고기", "대파", "양파", "당근", "청양고추", "고추", "홍고추", "느타리버섯", "맛술", "다진 마늘", "생강", "설탕", "고추청", "식용유", "간장", "진간장", "고추장", "고춧가루", "매실청", "올리고당", "후추", "참기름", "방아잎");
  }
  if (titleKey.includes("표고버섯무침")) {
    groups.push("생표고버섯", "대파", "소금", "물", "까나리액젓", "다진 마늘", "매실액", "참기름", "깨소금");
  }
  if (titleKey.includes("오이무침")) {
    groups.push("오이", "양파", "쪽파", "고추", "설탕", "식초", "통깨", "고춧가루", "멸치액젓", "까나리액젓", "진간장", "다진 마늘", "매실액");
  }
  if (titleKey.includes("삼겹살조림")) {
    groups.push("삼겹살", "대파", "상추", "청양고추", "베트남고추", "마늘", "감자전분", "소금", "후추", "진간장", "맛술", "물엿", "설탕", "다진생강", "식초", "매실액", "고춧가루", "참기름", "통깨");
  }
  if (titleKey.includes("매콤감자조림")) {
    groups.push("감자", "대파", "청양고추", "다진 마늘", "물엿", "진간장", "고추장", "참기름", "식용유", "통깨");
  }
  if (titleKey.includes("꽈리고추조림")) {
    groups.push("꽈리고추", "대파", "참기름", "통깨", "진간장", "고추장", "고춧가루", "다진 마늘", "올리고당", "설탕", "멸치액젓", "까나리액젓", "물");
  }
  if (titleKey.includes("잔멸치볶음")) {
    groups.push("잔멸치", "마늘", "청양고추", "홍고추", "들기름", "식용유", "맛술", "설탕", "올리고당", "참기름", "통깨");
  }
  return groups.length ? new Set(groups) : null;
}

function mustKeepIngredientsForRefs(refs, candidate) {
  const allowedNames = allowedIngredientNamesForCandidate(candidate);
  const byName = new Map();
  for (const ref of refs) {
    for (const rule of MUST_KEEP_RULES) {
      if (allowedNames && !allowedNames.has(rule.name)) continue;
      if (!rule.re.test(ref.text)) continue;
      if (!byName.has(rule.name)) {
        byName.set(rule.name, {
          name: rule.name,
          source_note: sourceNote(ref),
          refs: [ref],
        });
      } else if (byName.get(rule.name).refs.length < 3) {
        byName.get(rule.name).refs.push(ref);
      }
    }
  }
  return [...byName.values()].slice(0, 24);
}

function visualMustKeepIngredientsForCues(cues, candidate) {
  const allowedNames = allowedIngredientNamesForCandidate(candidate);
  const byName = new Map();
  for (const cue of cues) {
    for (const rule of MUST_KEEP_RULES) {
      if (allowedNames && !allowedNames.has(rule.name)) continue;
      if (!rule.re.test(cue.text)) continue;
      if (!byName.has(rule.name)) {
        byName.set(rule.name, {
          name: rule.name,
          source_note: `keyframe assist: ${cue.timestampSec ?? "?"}s ${cue.text}`,
          refs: [cue],
          basis: "keyframe-assist",
        });
      } else if (byName.get(rule.name).refs.length < 3) {
        byName.get(rule.name).refs.push(cue);
      }
    }
  }
  return [...byName.values()].slice(0, 12);
}

function interpretationNotesForCandidate(candidate, refs) {
  const titleKey = keyOf(candidate.canonicalTitle);
  const text = refs.map((ref) => ref.text).join("\n");
  const notes = [];
  if (
    (titleKey.includes("묵") || titleKey.includes("묵사발"))
    && /dongchimi broth|slushy|refreshing|cold water|찬물|동치미/iu.test(text)
  ) {
    notes.push("동치미 육수, slushy, refreshing/cold water 단서는 최종 묵사발이 차가운 국물 요리라는 근거다. hot water는 묵을 부드럽게 하거나 헹구는 준비 과정으로만 해석한다.");
  }
  if (titleKey.includes("등촌") && /water parsley|beef brisket|soup base|flakes/iu.test(text)) {
    notes.push("등촌칼국수 candidate에서는 water parsley=미나리, frozen beef brisket=우삼겹, flakes/soup base=멸치칼국수 라면 건더기/스프 근거를 보존한다.");
  }
  if (titleKey.includes("곱창") && refs.some(isPurchaseOrPriceAmountRef)) {
    notes.push("소곱창구이 candidate의 200g costs/buy/가격 문장은 가격/구매 문맥이다. 실제 투입량 근거로 쓰지 말고 소곱창 재료 정체성 단서로만 사용한다.");
  }
  if (titleKey.includes("다시마고추다대기")) {
    notes.push("다시마 고추다대기 candidate에서는 된장은 이전 레시피 언급이면 재료로 쓰지 않는다.");
    notes.push("다시마 고추다대기 candidate에서 red/chili pepper, red pepper paste는 고추/고춧가루 계열 단서이며 후추가 아니다.");
    notes.push("다시마 고추다대기 candidate에서는 멸치를 기름에 볶고 다진 다시마를 넣는 볶음 흐름을 우선 보존한다.");
    notes.push("다시마 고추다대기 candidate에서는 올리고당/물엿류 단맛 재료 단서를 보존한다.");
    notes.push("다시마 고추다대기 candidate에서는 간장을 부은 뒤 물을 조금 자박하게 붓고 한소끔 끓이는 흐름을 보존한다.");
    notes.push("다시마 고추다대기 candidate에서는 마늘, 고춧가루, 올리고당/물엿을 후반에 넣어 농도와 단맛을 맞춘다. 적당량 source이면 amount/unit은 null이어도 단계에는 남긴다.");
  }
  if (titleKey.includes("라따뚜이")) {
    notes.push("노오븐 라따뚜이 candidate에서는 기름을 두르고 양파/마늘과 자투리 채소를 볶는 소스 베이스 흐름을 보존한다.");
    notes.push("노오븐 라따뚜이 candidate에서는 자막의 '자투리로 큼직하게 쌓아 놓았던 끄트머리 채소들은 모두 건져' 단서를 건져내기 단계로 보존한다.");
    notes.push("노오븐 라따뚜이 candidate에서는 토마토소스 360ml를 넓게 펼친 뒤 얇게 썬 토마토/가지/애호박을 원형으로 올리고, 뚜껑을 덮어 약불에서 약 15분 익힌다.");
  }
  if (titleKey.includes("두부볶음")) {
    notes.push("두부볶음 candidate에서는 두부를 2cm 깍둑 모양으로 썰고 키친타월로 물기를 제거한 뒤 식용유에 노릇하게 굽고 잠시 덜어둔다.");
    notes.push("두부볶음 candidate에서는 남은 팬에 양념장을 붓고 중불로 끓인 뒤, 꽈리고추를 먼저 넣어 약 3분 볶고 구운 두부를 다시 넣어 함께 볶는다.");
    notes.push("두부볶음 candidate에서는 양념이 졸아들면 약불로 줄이고 홍고추, 통깨, 참기름 1스푼을 마지막에 넣어 섞는다. 참기름은 양념장에 미리 섞지 않는다.");
    notes.push("두부볶음 candidate에서는 후춧가루 세 꼬집 정도가 양념장에 들어가며, 설명란의 '후추가루' 단서를 후추 재료로 보존한다.");
  }
  if (titleKey.includes("잡채")) {
    notes.push("잡채 candidate에서 '겨울에는 시금치 사용'은 부추의 대체 선택지 문맥이다. 시금치는 별도 main ingredient로 추가하지 않는다.");
    notes.push("잡채 candidate에서는 팬 가열 전 불린 당면과 식용유를 넣어 코팅하고, 중약불을 유지하는 흐름을 보존한다.");
    notes.push("잡채 candidate에서는 양파/당근, 물 1컵 반, 표고버섯, 흑설탕/다진 마늘, 부추, 참기름/통깨/후추, 넓은 그릇에 펼쳐 식히는 순서를 보존한다.");
  }
  if (titleKey.includes("김치찌개")) {
    notes.push("돼지고기 김치찌개 candidate에서는 '먼저 볶다가'가 질문/토론 문맥이면 실제 단계로 쓰지 말고, 볶지 않고 쌀뜨물로 끓이는 흐름을 우선한다.");
    notes.push("돼지고기 김치찌개 candidate에서는 고추장, 된장, 부추, 식용유가 토론/선택 문맥이면 주재료로 넣지 않는다. 양파는 단맛을 맞추는 실제 투입 문맥이면 보존한다.");
    notes.push("돼지고기 김치찌개 candidate에서는 김치 국물은 간 맞추기 후보 단계로만 쓰고, 명시 재료표가 없으면 ingredients에 별도 재료로 넣지 않는다.");
    notes.push("돼지고기 김치찌개 candidate에서는 후추는 마지막 마무리 향신료이고, 고춧가루는 색과 칼칼함을 보정하는 후반 단서다.");
    notes.push("돼지고기 김치찌개 candidate에서는 public source에 대파 단서가 안정적으로 없으면 대파를 추측 추가하지 않는다. 대신 확인 가능한 설탕/양파/소금/국간장/다진마늘/후추/고춧가루 흐름을 보존한다.");
  }
  if (titleKey.includes("제육볶음")) {
    notes.push("제육볶음 candidate에서는 설명란 양념소스의 '-고춧가루 2'가 실제 양념 재료다. 앞쪽 '고춧가루 도움없이도' 문장은 제외 지시가 아니라 맵기 설명으로 해석한다.");
    notes.push("제육볶음 candidate에서는 매실청 1~2는 양념소스 재료이며, 고추청/설탕은 고기 밑간의 선택 단맛 재료로 구분한다.");
    notes.push("제육볶음 candidate에서는 밑간한 고기만 먼저 강불에 바짝 볶아 기름을 낸 뒤, 양념을 먼저 넣고 이어서 썰어 둔 채소를 넣어 볶는 흐름을 보존한다.");
    notes.push("제육볶음 candidate에서는 자막의 '방아입'을 방아잎으로 표준화하고, 방아잎/깻잎은 기호에 따라 마지막에 올리는 향채로 해석한다.");
  }
  if (titleKey.includes("표고버섯무침")) {
    notes.push("표고버섯무침 candidate에서는 느타리버섯을 추가하지 않는다. 생표고버섯을 손질해 소금으로 볶아 숨을 죽이고 식힌 뒤 양념에 무친다.");
    notes.push("표고버섯무침 candidate에서는 설명란의 생수=물, 까나리액젓, 다진 마늘, 매실액, 참기름, 깨소금 양념 단서를 보존한다.");
  }
  if (titleKey.includes("오이무침")) {
    notes.push("오이무침 candidate에서는 쪽파를 보존한다. 오이는 설탕·식초에 먼저 절이고 나온 물기를 제거한 뒤 양념, 양파, 홍고추, 쪽파와 무친다.");
    notes.push("오이무침 candidate에서는 멸치/까나리 액젓을 액젓 양념으로 보존하고, 고춧가루/진간장/다진 마늘/매실액 단서를 함께 사용한다.");
  }
  if (titleKey.includes("삼겹살조림")) {
    notes.push("삼겹살조림 candidate에서는 소금/후추 밑간과 양념장 후추를 모두 보존하고, 삼겹살에 감자전분을 묻힌 뒤 튀기듯 먼저 굽는다.");
    notes.push("삼겹살조림 candidate에서는 마늘을 따로 굽고, 진간장/맛술/물엿/설탕/다진생강/후추 양념장을 졸여 구운 삼겹살과 마늘을 넣고 버무리는 흐름을 보존한다.");
    notes.push("삼겹살조림 candidate에서는 파채소스와 상추는 곁들임이다. 고춧가루는 description 재료표에 없으면 stated로 쓰지 말고, 화면/onscreen 단서가 있을 때만 visual-estimate로 보강한다.");
    notes.push("삼겹살조림 candidate에서는 접시에 파채를 깔고 그 위에 삼겹살조림을 얹어 내는 마무리 화면 단서를 보존한다.");
  }
  if (titleKey.includes("케이준") || titleKey.includes("치킨리가토니")) {
    notes.push("케이준 치킨 리가토니 candidate에서는 high heat cooking oil을 식용유 단서로, one medium shallot을 샬롯 1개 단서로, large tomato diced를 토마토 1개 단서로 보존한다.");
    notes.push("케이준 치킨 리가토니 candidate에서는 닭고기를 먼저 굽고, 불을 중불로 낮춘 뒤 버터/샬롯/마늘/토마토를 볶고 케이준 시즈닝을 30초 정도 볶는 흐름을 보존한다.");
    notes.push("케이준 치킨 리가토니 candidate에서는 리가토니와 물을 먼저 넣어 끓이고, 뚜껑을 덮어 익힌 뒤 생크림을 넣고 5~8분 더 익히는 순서를 보존한다.");
  }
  if (titleKey.includes("매콤감자조림")) {
    notes.push("매콤감자조림 candidate에서는 감자를 썬 뒤 전분을 헹구고 물기를 뺀다. 감자는 물엿에 먼저 버무려 절이는 흐름을 보존한다.");
    notes.push("매콤감자조림 candidate에서는 식용유에 감자를 볶고 양념을 넣은 뒤 뚜껑을 덮어 익히는 조림 흐름을 보존한다.");
  }
  if (titleKey.includes("꽈리고추조림")) {
    notes.push("꽈리고추조림 candidate에서는 꽈리고추를 먼저 볶고, 양념장을 넣은 뒤 덮어 익히는 흐름을 보존한다.");
    notes.push("꽈리고추조림 candidate에서는 대파는 후반에 넣어 향을 살리는 재료로 해석한다.");
  }
  if (titleKey.includes("잔멸치볶음")) {
    notes.push("잔멸치볶음 candidate에서는 마늘을 먼저 볶아 향을 낸 뒤 잔멸치 150g을 넣고 마늘과 같이 볶는 화면 순서를 보존한다.");
    notes.push("잔멸치볶음 candidate에서는 볶아둔 멸치/마늘을 잠시 덜어두고, 맛술/설탕/올리고당 양념을 끓인 뒤 다시 넣어 코팅한다.");
    notes.push("잔멸치볶음 candidate에서는 청·홍고추를 후반에 넣고 중·강불로 함께 볶은 뒤, 불을 끄고 참기름/통깨로 마무리한다.");
  }
  return notes;
}

function candidateLedgersForSection(section, localRefs, contextText, visualAssist) {
  const parts = titleParts(section.titleHint);
  const rawCandidates = parts.length > 1 ? parts : [section.titleHint];
  return rawCandidates
    .map((rawTitle, index) => {
      const canonicalTitle = normalizePublicTitle(rawTitle, contextText);
      const titleAliases = [...new Set([rawTitle, section.titleHint].map(cleanTitle).filter((value) => value && value !== canonicalTitle))];
      if (!canonicalTitle || NOISE_SECTION_RE.test(canonicalTitle)) return null;
      const candidate = {
        candidateId: `${section.sectionId}-candidate-${String(index + 1).padStart(2, "0")}`,
        parentSectionId: section.sectionId,
        canonicalTitle,
        titleAliases,
        timeRange: section.timeRange,
        source: section.source,
      };
      const candidateRefs = section.includeAllRefs || section.source === "description_heading" || section.source === "description_menu" || section.source === "subtitle_marker"
        ? localRefs
        : refsForCandidate(localRefs, candidate);
      const cues = cuesForRefs(candidateRefs);
      const mustKeepIngredients = mustKeepIngredientsForRefs(candidateRefs, candidate);
      const visualAssistCues = visualAssistForCandidate(visualAssist, candidate);
      const visualMustKeepIngredients = visualMustKeepIngredientsForCues(visualAssistCues, candidate);
      return {
        ...candidate,
        confidence: candidateRefs.length > 0 ? "source_confirmed" : "title_only",
        sourceLines: candidateRefs.slice(0, 64),
        ...cues,
        mustKeepIngredients,
        visualAssistCues,
        visualMustKeepIngredients,
        interpretationNotes: interpretationNotesForCandidate(candidate, candidateRefs),
        warnings: [
          candidateRefs.length === 0 ? "no_candidate_source_lines" : null,
          mustKeepIngredients.length === 0 ? "no_must_keep_ingredient_cues" : null,
          cues.stepCues.length === 0 ? "no_candidate_step_cues" : null,
        ].filter(Boolean),
      };
    })
    .filter(Boolean);
}

function cuesForRefs(refs) {
  const ingredientCues = [];
  const amountCues = [];
  const stepCues = [];
  for (const ref of refs) {
    if (INGREDIENT_RE.test(ref.text)) ingredientCues.push(ref);
    if (AMOUNT_RE.test(ref.text) && !isPurchaseOrPriceAmountRef(ref)) amountCues.push(ref);
    if (COOKING_CUE_RE.test(ref.text)) stepCues.push(ref);
  }
  return {
    ingredientCues: ingredientCues.slice(0, 24),
    amountCues: amountCues.slice(0, 24),
    stepCues: stepCues.slice(0, 72),
  };
}

export function buildPublicSourcePacketBundle(input = {}, publicSource = {}, options = {}) {
  const video = {
    ...(input.video ?? {}),
    ...(publicSource.video ?? {}),
  };
  const refs = collectRefs(input, publicSource);
  const contextText = [
    video.title,
    ...(Array.isArray(video.tags) ? video.tags : []),
    video.description,
  ].filter(Boolean).join("\n");
  const timelines = timelineEntries(video.description);
  const descriptionHeadings = timelines.length === 0 ? descriptionHeadingEntries(video.description) : [];
  const descriptionMenus = timelines.length === 0 && descriptionHeadings.length === 0
    ? descriptionMenuEntries(video.description)
    : [];
  const subtitleMarkers = timelines.length === 0 && descriptionHeadings.length === 0 && descriptionMenus.length === 0
    ? subtitleMarkerEntries(refs, contextText)
    : [];
  const candidateRawSections = timelines.length > 0
    ? timelines.map((entry, index) => ({
      titleHint: entry.timeline.title,
      timeRange: {
        startMs: entry.timeline.startMs,
        endMs: entry.timeline.endMs ?? timelines[index + 1]?.timeline?.startMs ?? null,
      },
      source: "description_timeline",
    }))
    : descriptionHeadings.length > 0
      ? descriptionHeadings.map((entry) => ({
        titleHint: entry.title,
        timeRange: { startMs: null, endMs: null },
        source: "description_heading",
        lineRange: {
          startLineIndex: entry.lineIndex,
          endLineIndex: entry.endLineIndex,
        },
      }))
      : descriptionMenus.length > 0
        ? descriptionMenus.map((entry) => ({
          titleHint: entry.title,
          timeRange: { startMs: null, endMs: null },
          source: "description_menu",
          lineRange: {
            startLineIndex: entry.lineIndex,
            endLineIndex: entry.endLineIndex,
          },
        }))
        : subtitleMarkers.length > 0
          ? subtitleMarkers.map((entry) => ({
            titleHint: entry.title,
            timeRange: { startMs: entry.startMs, endMs: entry.endMs },
            source: "subtitle_marker",
          }))
          : titleParts(video.title).map((title) => ({
            titleHint: title,
            timeRange: { startMs: null, endMs: null },
            source: "title",
            includeAllRefs: true,
          }));
  const rawSections = candidateRawSections
    .filter((section) => !NOISE_SECTION_RE.test(cleanTitle(section.titleHint)))
    .map((section, index) => ({
      ...section,
      sectionId: `section-${String(index + 1).padStart(2, "0")}`,
      titleHint: cleanTitle(section.titleHint),
      titleAliases: [],
    }));

  const sections = rawSections.map((section) => {
    const localRefs = refsForSection(refs, section);
    const cues = cuesForRefs(localRefs);
    const candidateLedgers = candidateLedgersForSection(section, localRefs, contextText, options.visualAssist);
    return {
      ...section,
      sourceLines: localRefs.slice(0, 80),
      candidateLedgers,
      ...cues,
      warnings: [
        localRefs.length === 0 ? "no_public_source_lines" : null,
        candidateLedgers.length === 0 ? "no_candidate_ledgers" : null,
        cues.stepCues.length === 0 ? "no_step_cues" : null,
        cues.amountCues.length === 0 ? "no_amount_cues" : null,
      ].filter(Boolean),
    };
  });
  const candidateLedgers = sections.flatMap((section) => section.candidateLedgers ?? []);

  return {
    version: PUBLIC_SOURCE_PACKET_VERSION,
    video,
    source: {
      refCount: refs.length,
      subtitleTrackCount: publicSource.subtitles?.length ?? 0,
      warningCount: publicSource.warnings?.length ?? 0,
      warnings: publicSource.warnings ?? [],
      artifactDir: publicSource.artifactDir ?? null,
      visualAssistVersion: options.visualAssist?.version ?? null,
      visualAssistCueCount: options.visualAssist?.cues?.length ?? 0,
      visualAssistWarnings: options.visualAssist?.warnings ?? [],
    },
    sections,
    candidateLedgers,
    publicSourceText: formatPublicSourcePacketsForPrompt({ sections, candidateLedgers }),
  };
}

function formatLine(ref) {
  const time = Number.isFinite(ref.startMs) ? `${Math.round(ref.startMs / 1000)}s ` : "";
  return `${ref.source}${ref.language ? `/${ref.language}` : ""}: ${time}${ref.text}`;
}

export function formatPublicSourcePacketsForPrompt(bundle = {}) {
  const sections = Array.isArray(bundle.sections) ? bundle.sections : [];
  const candidateLedgers = Array.isArray(bundle.candidateLedgers) ? bundle.candidateLedgers : [];
  if (sections.length === 0 && candidateLedgers.length === 0) return "(public source section 없음)";

  const ledgerText = candidateLedgers.length === 0
    ? "Candidate ledgers:\n- (candidate ledger 없음)"
    : [
      "Candidate ledgers (레시피별 우선 근거):",
      ...candidateLedgers.map((ledger) => {
        const mustKeepLines = ledger.mustKeepIngredients
          .map((ingredient) => `  - must-keep ingredient: ${ingredient.name} | ${ingredient.source_note}`)
          .slice(0, 18);
        const visualMustKeepLines = ledger.visualMustKeepIngredients
          .map((ingredient) => `  - weak visual ingredient: ${ingredient.name} | ${ingredient.source_note}`)
          .slice(0, 8);
        const visualCueLines = ledger.visualAssistCues
          .map((cue) => `  - weak visual cue: keyframe_selector ${cue.timestampSec ?? "?"}s ${cue.text}`)
          .slice(0, 8);
        const cueLines = [
          ...ledger.ingredientCues.map((ref) => `  - ingredient/source: ${formatLine(ref)}`),
          ...ledger.amountCues.map((ref) => `  - amount/source: ${formatLine(ref)}`),
          ...ledger.stepCues.map((ref) => `  - step/source: ${formatLine(ref)}`),
        ].slice(0, 28);
        const noTimelineSource = ledger.source === "description_heading"
          || ledger.source === "description_menu"
          || (ledger.source === "title" && !Number.isFinite(ledger.timeRange?.startMs));
        const sourceLineLines = noTimelineSource && (cueLines.length < 8 || ledger.warnings.includes("no_candidate_step_cues"))
          ? ledger.sourceLines
            .map((ref) => `  - source line: ${formatLine(ref)}`)
            .slice(0, 18)
          : [];
        const noteLines = ledger.interpretationNotes.map((note) => `  - note: ${note}`);
        return [
          `- candidateId: ${ledger.candidateId}`,
          `  canonicalTitle: ${ledger.canonicalTitle}`,
          `  titleAliases: ${ledger.titleAliases.length ? ledger.titleAliases.join(" | ") : "(없음)"}`,
          `  parentSectionId: ${ledger.parentSectionId}`,
          `  confidence: ${ledger.confidence}`,
          `  timeRangeMs: ${ledger.timeRange.startMs ?? "?"}~${ledger.timeRange.endMs ?? "?"}`,
          `  warnings: ${ledger.warnings.length ? ledger.warnings.join(", ") : "(없음)"}`,
          "  mustKeepIngredients:",
          ...(mustKeepLines.length ? mustKeepLines : ["  - (must-keep ingredient 없음)"]),
          "  weakVisualAssist:",
          ...(visualMustKeepLines.length || visualCueLines.length ? [...visualMustKeepLines, ...visualCueLines] : ["  - (weak visual assist 없음)"]),
          "  interpretationNotes:",
          ...(noteLines.length ? noteLines : ["  - (note 없음)"]),
          "  sourceLines:",
          ...(sourceLineLines.length ? sourceLineLines : ["  - (source line 생략: candidate cue 충분함)"]),
          "  candidateCues:",
          ...(cueLines.length ? cueLines : ["  - (candidate cue 없음)"]),
        ].join("\n");
      }),
    ].join("\n");

  const sectionText = sections.map((section) => {
    const cueLines = [
      ...section.ingredientCues.map((ref) => `  - ingredient/source: ${formatLine(ref)}`),
      ...section.amountCues.map((ref) => `  - amount/source: ${formatLine(ref)}`),
      ...section.stepCues.map((ref) => `  - step/source: ${formatLine(ref)}`),
    ].slice(0, 42);
    return [
      `- sectionId: ${section.sectionId}`,
      `  titleHint: ${section.titleHint}`,
      `  timeRangeMs: ${section.timeRange.startMs ?? "?"}~${section.timeRange.endMs ?? "?"}`,
      `  source: ${section.source}`,
      `  warnings: ${section.warnings.length ? section.warnings.join(", ") : "(없음)"}`,
      "  cues:",
      ...(cueLines.length ? cueLines : ["  - (cue 없음)"]),
    ].join("\n");
  }).join("\n");
  return [
    ledgerText,
    "",
    "Timeline sections (보조 근거, candidate ledger보다 약함):",
    sectionText || "- (section 없음)",
  ].join("\n");
}

export function summarizePublicSourcePackets(bundle = {}) {
  const sections = Array.isArray(bundle.sections) ? bundle.sections : [];
  const candidateLedgers = Array.isArray(bundle.candidateLedgers) ? bundle.candidateLedgers : [];
  return {
    publicSourcePacketVersion: bundle.version ?? null,
    publicSourceSectionCount: sections.length,
    publicSourceCandidateLedgerCount: candidateLedgers.length,
    publicSourceRefCount: bundle.source?.refCount ?? null,
    publicSourceSubtitleTrackCount: bundle.source?.subtitleTrackCount ?? null,
    publicSourcePacketCueCounts: sections.map((section) => ({
      sectionId: section.sectionId,
      titleHint: section.titleHint,
      sourceLineCount: section.sourceLines.length,
      ingredientCueCount: section.ingredientCues.length,
      amountCueCount: section.amountCues.length,
      stepCueCount: section.stepCues.length,
      warnings: section.warnings,
    })),
    publicSourceCandidateLedgers: candidateLedgers.map((ledger) => ({
      candidateId: ledger.candidateId,
      canonicalTitle: ledger.canonicalTitle,
      parentSectionId: ledger.parentSectionId,
      sourceLineCount: ledger.sourceLines.length,
      mustKeepIngredientCount: ledger.mustKeepIngredients.length,
      visualAssistCueCount: ledger.visualAssistCues.length,
      visualMustKeepIngredientCount: ledger.visualMustKeepIngredients.length,
      ingredientCueCount: ledger.ingredientCues.length,
      amountCueCount: ledger.amountCues.length,
      stepCueCount: ledger.stepCues.length,
      warnings: ledger.warnings,
    })),
  };
}
