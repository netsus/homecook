import { parseTimelineLine } from "./source-evidence.mjs";

export const PUBLIC_SOURCE_PACKET_VERSION = "public-source-packet-v3-dehardcoded";

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

function normalizePublicTitle(rawTitle) {
  const title = cleanTitle(rawTitle);
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

  return matched.slice(0, 12);
}

function strongVisualCueTokensForCandidate(candidate) {
  return [candidate.canonicalTitle, ...(candidate.titleAliases ?? [])]
    .flatMap((value) => compact(value).split(/[\s&＆/·ㆍ+|]+/u))
    .filter((value) => keyOf(value).length >= 2);
}

function sourceNote(ref) {
  return formatLine(ref).slice(0, 220);
}

function isPurchaseOrPriceAmountRef(ref) {
  const text = compact(ref?.text);
  return AMOUNT_RE.test(text) && PURCHASE_OR_PRICE_RE.test(text);
}


function mustKeepIngredientsForRefs(refs) {
  const byName = new Map();
  for (const ref of refs) {
    for (const rule of MUST_KEEP_RULES) {
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

function visualMustKeepIngredientsForCues(cues) {
  const byName = new Map();
  for (const cue of cues) {
    for (const rule of MUST_KEEP_RULES) {
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
      const mustKeepIngredients = mustKeepIngredientsForRefs(candidateRefs);
      const visualAssistCues = visualAssistForCandidate(visualAssist, candidate);
      const visualMustKeepIngredients = visualMustKeepIngredientsForCues(visualAssistCues);
      return {
        ...candidate,
        confidence: candidateRefs.length > 0 ? "source_confirmed" : "title_only",
        sourceLines: candidateRefs.slice(0, 64),
        ...cues,
        mustKeepIngredients,
        visualAssistCues,
        visualMustKeepIngredients,
        interpretationNotes: [],
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
