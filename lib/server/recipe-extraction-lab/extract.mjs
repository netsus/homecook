// 유튜브 레시피 추출 모듈 (lab). 루프가 ITER마다 이 파일과 prompt.mjs를 수정해 품질을 강화한다.
// 프로덕션 youtube-import.ts와 분리된 독립 모듈로, source 입력 + LLM 클라이언트만 받는다.
// 합격 후 본체(youtube-import.ts) 통합은 별도 작업.

import {
  buildEvidencePacketBundle,
  summarizeEvidencePackets,
} from "./candidate-packets.mjs";
import {
  buildExtractionPrompt,
  buildPublicSourceExtractionPrompt,
  buildRecipeCandidateHints,
  buildSourceText,
  PUBLIC_SOURCE_PROMPT_VERSION,
  PROMPT_VERSION,
} from "./prompt.mjs";
import { summarizePublicSourcePackets } from "./public-source-packets.mjs";

const VALID_BASIS = new Set(["stated", "spoken", "onscreen", "visual-estimate"]);
const norm = (value) => (value ?? "").replace(/\s+/g, "").toLowerCase();
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const COMBINED_TITLE_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const NATURAL_COMBINED_TITLE_RE = /^(.{2,}?)\s*(?:와|과)\s+(.{2,})$/;
const QUALITATIVE_AMOUNT_RE = /(적당량|약간|조금|소량|넉넉|듬뿍|충분히|취향|기호|원하는\s*만큼|필요한\s*만큼|알맞게|to\s*taste)/i;
const RATIO_AMOUNT_RE = /(?:\d+\s*:\s*\d+|비율|동량|반반)/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|볶이|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|꼬치|야끼|치즈|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;
const TITLE_KEYWORD_STOPWORDS = new Set(["물", "소스", "양념", "기름", "식용유", "들기름", "참기름", "간장", "진간장", "된장", "고추장", "고춧가루", "설탕", "소금", "후추", "마늘", "다진마늘", "맛술", "식초", "올리고당", "알룰로스"]);
const TITLE_TOKEN_STRIP_RE = /(식용유|들기름|참기름|진간장|간장|된장|고추장|고춧가루|설탕|소금|후추|맛술|식초|올리고당|알룰로스)/g;
const TITLE_MODIFIER_STRIP_RE = /(간단한|가성비|퇴근후|충전|집밥|폼에비해|식|스타일|st|ver|버전)/g;
const TITLE_NGRAM_STOPWORDS = new Set(["요리", "집밥", "간단", "가성", "비소", "충전", "퇴근", "후충"]);
const GENERIC_IDENTITY_INGREDIENT_RE = /(갈색|초록|녹색|붉은|액체|줄기채소|잎채소|양념\s*돼지고기|양념고기|소스)$/;
const GENERIC_PACKET_STEP_RE = /(양념|소스|무침|밑간|마리네이드|버무)/;
const PACKET_INGREDIENT_RE = /(된장|고추장|간장|액젓|맛술|알룰로스|올리고당|마늘|들기름|참기름|고춧가루|후춧가루|후추|통깨|깨|소금|물|부추|미나리|쯔유|스프)/;
const KOREAN_AMOUNT_WORDS = new Map([
  ["한", "1"], ["하나", "1"], ["반", "1/2"],
  ["두", "2"], ["둘", "2"], ["세", "3"], ["셋", "3"],
  ["네", "4"], ["넷", "4"], ["다섯", "5"], ["여섯", "6"],
]);
const UNIT_ALIASES = new Map([
  ["큰 술", "큰술"], ["큰스푼", "큰술"], ["큰숟갈", "큰술"], ["큰숟가락", "큰술"], ["밥숟갈", "큰술"], ["밥숟가락", "큰술"], ["숟갈", "큰술"], ["숟가락", "큰술"], ["스푼", "큰술"], ["테이블스푼", "큰술"], ["tbsp", "큰술"], ["tbsps", "큰술"], ["tablespoon", "큰술"], ["tablespoons", "큰술"], ["T", "큰술"],
  ["작은 술", "작은술"], ["작은스푼", "작은술"], ["작은숟갈", "작은술"], ["작은숟가락", "작은술"], ["티스푼", "작은술"], ["tsp", "작은술"], ["tsps", "작은술"], ["teaspoon", "작은술"], ["teaspoons", "작은술"], ["t", "작은술"],
  ["cup", "컵"], ["cups", "컵"],
  ["그램", "g"], ["그람", "g"], ["킬로그램", "kg"], ["키로그램", "kg"], ["키로", "kg"], ["킬로", "kg"],
  ["밀리리터", "ml"], ["밀리리터즈", "ml"], ["미리리터", "ml"], ["미리", "ml"], ["씨씨", "ml"], ["cc", "ml"],
  ["리터", "l"],
  ["알", "개"], ["매", "장"], ["봉지", "봉"], ["줄기", "대"],
]);
const UNIT_WORD_SOURCE = String.raw`큰\s*술|큰\s*스푼|큰\s*숟갈|큰\s*숟가락|밥\s*숟갈|밥\s*숟가락|숟갈|숟가락|스푼|테이블\s*스푼|작은\s*술|작은\s*스푼|작은\s*숟갈|작은\s*숟가락|티\s*스푼|tbsp\.?|tbsps\.?|tablespoons?|tsp\.?|tsps\.?|teaspoons?|T|t|컵|cups?|g|그램|그람|kg|킬로그램|키로그램|키로|킬로|ml|밀리리터|미리리터|미리|cc|씨씨|l|리터|개|알|쪽|장|매|줄|줄기|팩|봉지?|줌|꼬집|모|인분|덩이|대|포기|송이|토막|조각|캔|통|병|공기|마리|꼬치|잎`;
const UNIT_WORD_RE = new RegExp(`(${UNIT_WORD_SOURCE})`, "i");
const AMOUNT_VALUE_RE_SOURCE = String.raw`(?:\d+(?:\.\d+)?|\d+\s*/\s*\d+)`;
const AMOUNT_RANGE_RE_SOURCE = String.raw`${AMOUNT_VALUE_RE_SOURCE}(?:\s*[~-]\s*${AMOUNT_VALUE_RE_SOURCE})?`;
const KOREAN_AMOUNT_RE_SOURCE = [...KOREAN_AMOUNT_WORDS.keys()]
  .sort((a, b) => b.length - a.length)
  .join("|");
const EMBEDDED_AMOUNT_UNIT_RE = new RegExp(
  String.raw`(?:^|\s)(${AMOUNT_RANGE_RE_SOURCE}|${KOREAN_AMOUNT_RE_SOURCE})\s*${UNIT_WORD_RE.source}(?:\s*(?:정도|가량))?\s*$`,
  "i",
);
const TRAILING_AMOUNT_UNIT_RE = new RegExp(
  String.raw`(${AMOUNT_RANGE_RE_SOURCE}|${KOREAN_AMOUNT_RE_SOURCE})\s*${UNIT_WORD_RE.source}(?:\s*(?:정도|가량))?\s*$`,
  "i",
);
const SOURCE_MARKER_RE = /^\[SOURCE:\s*([^\]]+)\]\s*$/;
const SOURCE_TIMESTAMP_RE = /(?:^|\s)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*[~-]\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?/;
const PROMOTIONAL_SOURCE_LINE_RE = /(event|이벤트|구매|구매자|인증|댓글|선물|쿠폰|할인|스토어|배송|출고|추첨|당첨|상품권|구글\s*폼|구글폼|참여|혜택|기간\s*:)/i;
const AMOUNT_UNIT_PAIR_RE_SOURCE = String.raw`(?:약\s*)?(${AMOUNT_RANGE_RE_SOURCE}|${KOREAN_AMOUNT_RE_SOURCE})\s*(${UNIT_WORD_SOURCE})(?:\s*(?:정도|가량|분량|만|씩|짜리))?`;
const CHATTER_STEP_RE = /(구독|좋아요|댓글|알림\s*설정|인스타|instagram|협찬|광고|시청해\s*주|다음\s*영상)/i;
const NON_COOKING_ONLY_STEP_RE = /^(?:이제\s*)?(?:완성(?:입니다|한다|된다|됐습니다|했어요)?|맛있게\s*(?:먹는다|드세요)|먹어\s*본다|시식한다)[.!?。]*$/;
const SOUP_STEW_TITLE_RE = /(국|탕|찌개|전골)/;
const STEW_SEASONING_RECOVERY_RULES = [
  { name: "설탕", amount: "1", unit: "작은술", optional: false, groupLabel: null, sourceRe: /설탕/ },
  { name: "양파", amount: "1/4", unit: "개", optional: false, groupLabel: null, sourceRe: /양파/ },
  { name: "소금", amount: "1/2", unit: "작은술", optional: true, groupLabel: "간 맞추기", sourceRe: /소금/ },
  { name: "후추", amount: null, unit: null, optional: false, groupLabel: null, sourceRe: /후추|후\s*추|호주/ },
];
const KIMCHI_PORK_RATIO_RE = /(?:3\s*대\s*1|3대\s*1|3\s*:\s*1)/;
const OPTIONAL_DOENJANG_VARIANT_RE = /된장/;
const OPTIONAL_VARIANT_MARKER_RE = /정석이\s*아니|취향|응용|있으면|없어도/;
const MACJEOK_GENERIC_SEASONING_RE = /(갈색.*양념|갈색.*소스|맥적\s*양념|양념\s*베이스|양념고기|양념\s*돼지고기)/;
const MACJEOK_SEASONING_CUE_RE = /(갈색.*양념|갈색.*소스|맥적\s*양념|양념|밑간|코팅)/;
const POT_RICE_GENERIC_SEASONING_RE = /(갈색.*양념|갈색.*소스|양념\s*소스|양념장)/;
const POT_RICE_SEASONING_CUE_RE = /(갈색.*양념|갈색.*소스|양념\s*소스|양념장|붉은\s*갈색.*코팅|붉은갈색.*코팅|갈색.*코팅|양념한\s*뒤|양념.*굽|양념.*코팅)/;
const FUTOMAKI_GENERIC_SAUCE_RE = /(주황색\s*소스|붉은\s*소스|색\s*소스)/;
const FUTOMAKI_SAUCE_ONLY_INGREDIENT_RE = /^(?:소금|맛술)$/;
const FUTOMAKI_EGG_COOK_STEP_RE = /(?:달걀|계란).*(?:팬|익히|지단|말이|풀)|(?:팬|익히|지단|말이|풀).*(?:달걀|계란)/;
const FUTOMAKI_NOODLE_COOK_STEP_RE = /(?:메밀면|면).*(?:삶|헹|물기)|(?:삶|헹|물기).*(?:메밀면|면)/;
const FUTOMAKI_GENERIC_GREEN_STICK_RE = /(?:초록|녹색|푸른).{0,8}(?:채소|야채|스틱|줄기)|(?:채소|야채|스틱|줄기).{0,8}(?:초록|녹색|푸른)/;
const FUTOMAKI_GENERIC_YELLOW_STICK_RE = /(?:노란|노란색|황색).{0,10}(?:속재료|재료|스틱|달걀류)|(?:속재료|재료|스틱).{0,10}(?:노란|노란색|황색)/;
const FUTOMAKI_RICE_SPREAD_STEP_RE = /(?:김|도마).{0,20}밥.{0,20}(?:얇게|펴|바른)|밥.{0,16}(?:얇게|펴\s*바른)/;
const FUTOMAKI_RICE_CENTER_STEP_RE = /밥\s*가운데|밥.{0,12}메밀면.{0,20}올리/;
const GOBCHANG_GENERIC_GREEN_VEG_RE = /(?:초록|녹색|푸른).{0,8}(?:채소|야채|잎채소|줄기채소|고명)|(?:채소|야채|잎채소|줄기채소|고명).{0,8}(?:초록|녹색|푸른)/;
const GOBCHANG_BUCHU_OR_GREEN_COOK_STEP_RE = /(?:부추|초록\s*채소|초록\s*잎채소|초록색\s*줄기채소|녹색\s*채소|푸른\s*채소)(?:를|도|와|까지)?.{0,12}(?:굽|익히|볶)|(?:굽|익히|볶).{0,12}(?:부추|초록\s*채소|초록\s*잎채소|초록색\s*줄기채소|녹색\s*채소|푸른\s*채소)/;
const GOBCHANG_GENERIC_GREEN_STEP_RE = /초록\s*채소|초록\s*잎채소|초록색\s*줄기채소|녹색\s*채소|푸른\s*채소/g;
const GOBCHANG_GENERIC_SEASONING_PLACEHOLDER_RE = /(?:붉은\s*\/\s*갈색|붉은|갈색).{0,8}양념\s*베이스|양념\s*베이스|갈색\s*양념|붉은\s*양념/;

function isRecipeLabDebugEnabled() {
  return /^(1|true|yes|on)$/i.test(String(globalThis.process?.env?.RECIPE_LAB_DEBUG ?? ""));
}

function normalizeIngredient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const embedded = extractEmbeddedAmountFromName(raw.name);
  const name = embedded.name;
  if (!name) return null;
  const rawAmount = compact(raw.amount);
  const rawUnit = compact(raw.unit);
  const selectedAmount = rawAmount || embedded.amount;
  const selectedUnit = rawUnit || embedded.unit;
  let amountUnit = normalizeAmountUnit(selectedAmount, selectedUnit);
  if (!amountUnit.amount && embedded.amount) amountUnit = normalizeAmountUnit(embedded.amount, embedded.unit);
  const normalized = {
    name,
    nameAliases: Array.isArray(raw.nameAliases) ? raw.nameAliases.filter((a) => typeof a === "string") : [],
    amount: amountUnit.amount,
    unit: amountUnit.unit,
    amountBasis: amountUnit.amount && VALID_BASIS.has(raw.amountBasis) ? raw.amountBasis : null,
    optional: raw.optional === true,
    groupLabel: raw.groupLabel ?? null,
  };
  if (isRecipeLabDebugEnabled()) {
    normalized._debugAmountNormalization = {
      rawName: raw.name ?? null,
      normalizedName: name,
      rawAmount: raw.amount ?? null,
      rawUnit: raw.unit ?? null,
      rawAmountBasis: raw.amountBasis ?? null,
      embeddedAmount: embedded.amount ?? null,
      embeddedUnit: embedded.unit ?? null,
      selectedAmount: selectedAmount ?? null,
      selectedUnit: selectedUnit ?? null,
      normalizedAmount: amountUnit.amount,
      normalizedUnit: amountUnit.unit,
      normalizedAmountBasis: normalized.amountBasis,
      amountDroppedByNormalization: Boolean(selectedAmount && !amountUnit.amount),
      unitChangedByNormalization: Boolean(selectedUnit && amountUnit.unit && selectedUnit !== amountUnit.unit),
    };
  }
  return normalized;
}

function extractEmbeddedAmountFromName(rawName) {
  const original = compact(rawName);
  if (!original) return { name: "" };

  const embeddedMatch = original.match(EMBEDDED_AMOUNT_UNIT_RE);
  const match = embeddedMatch ?? original.match(TRAILING_AMOUNT_UNIT_RE);
  if (!match) return { name: original };

  const strippedName = compact(original.replace(embeddedMatch ? EMBEDDED_AMOUNT_UNIT_RE : TRAILING_AMOUNT_UNIT_RE, ""));
  if (!strippedName) return { name: original };

  const amountUnit = normalizeAmountUnit(match[1], match[2]);
  if (!amountUnit.amount) return { name: original };

  return { name: strippedName, amount: amountUnit.amount, unit: amountUnit.unit };
}

function normalizeUnit(unit) {
  const text = compact(unit);
  if (!text || text === "없음" || QUALITATIVE_AMOUNT_RE.test(text)) return null;
  const squashed = text.replace(/\s+/g, "");
  const withoutTrailingDots = squashed.replace(/\.+$/g, "");
  const lowered = squashed.toLowerCase();
  const loweredWithoutTrailingDots = withoutTrailingDots.toLowerCase();
  return UNIT_ALIASES.get(text)
    ?? UNIT_ALIASES.get(squashed)
    ?? UNIT_ALIASES.get(withoutTrailingDots)
    ?? UNIT_ALIASES.get(lowered)
    ?? UNIT_ALIASES.get(loweredWithoutTrailingDots)
    ?? text;
}

function normalizeAmountUnit(rawAmount, rawUnit) {
  const rawAmountText = compact(rawAmount);
  let amount = rawAmountText || null;
  let unit = normalizeUnit(rawUnit);
  const joined = compact([rawAmountText, unit].filter(Boolean).join(" "));

  if (!joined || QUALITATIVE_AMOUNT_RE.test(joined) || RATIO_AMOUNT_RE.test(joined)) {
    return { amount: null, unit: null };
  }

  if (amount) {
    amount = amount
      .replace(/^약\s*/g, "")
      .replace(/개\s*정도|정도|가량/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const numericWithUnit = amount?.match(new RegExp(`^((?:\\d+(?:\\.\\d+)?|\\d+\\s*/\\s*\\d+)(?:\\s*[~-]\\s*(?:\\d+(?:\\.\\d+)?|\\d+\\s*/\\s*\\d+))?)\\s*${UNIT_WORD_RE.source}$`, "i"));
  if (numericWithUnit) {
    amount = numericWithUnit[1].replace(/\s+/g, "");
    unit = normalizeUnit(numericWithUnit[2]);
  } else {
    const koreanAmount = amount?.match(new RegExp(`^(${[...KOREAN_AMOUNT_WORDS.keys()].join("|")})\\s*${UNIT_WORD_RE.source}$`, "i"));
    if (koreanAmount) {
      amount = KOREAN_AMOUNT_WORDS.get(koreanAmount[1]);
      unit = normalizeUnit(koreanAmount[2]);
    }
  }

  if (!amount || QUALITATIVE_AMOUNT_RE.test(amount) || RATIO_AMOUNT_RE.test(amount)) {
    return { amount: null, unit: null };
  }

  const bareKoreanAmount = KOREAN_AMOUNT_WORDS.get(amount);
  if (bareKoreanAmount) amount = bareKoreanAmount;

  return { amount, unit };
}

function normalizeStep(rawStep) {
  const text = compact(typeof rawStep === "string" ? rawStep : rawStep?.instruction);
  if (!text) return null;
  if (CHATTER_STEP_RE.test(text)) return null;
  if (NON_COOKING_ONLY_STEP_RE.test(text)) return null;
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amountBasisForSourceLabel(label) {
  const lowered = String(label ?? "").toLowerCase();
  if (lowered.includes("recipe_candidate_hints")) return null;
  if (lowered.includes("transcript")) return "spoken";
  if (lowered.includes("description") || lowered.includes("author_comment")) return "stated";
  return null;
}

function isPromotionalSourceLine(line) {
  const text = compact(line);
  if (!text || SOURCE_TIMESTAMP_RE.test(text)) return false;
  return PROMOTIONAL_SOURCE_LINE_RE.test(text);
}

function sourceLineCandidates(sourceText) {
  const lines = [];
  let currentBasis = null;
  for (const rawLine of String(sourceText ?? "").split(/\r?\n/)) {
    const line = compact(rawLine);
    if (!line) continue;
    const marker = line.match(SOURCE_MARKER_RE);
    if (marker) {
      currentBasis = amountBasisForSourceLabel(marker[1]);
      continue;
    }
    if (!currentBasis) continue;
    if (isPromotionalSourceLine(line)) continue;
    const segments = line.split(/[,，;；·ㆍ]/).map(compact).filter(Boolean);
    for (const text of [line, ...segments]) {
      if (isPromotionalSourceLine(text)) continue;
      if (text.length < 3 || text.length > 260) continue;
      lines.push({ text, basis: currentBasis });
    }
  }
  return lines;
}

function ingredientAmountSearchVariants(ingredient) {
  const variants = [];
  const names = [ingredient.name, ...(ingredient.nameAliases ?? [])];
  for (const rawName of names) {
    const name = compact(rawName).replace(/\([^)]*\)/g, "").trim();
    if (!name) continue;
    variants.push(name);
    const head = name.split(/\s+/).pop();
    if (head && head !== name) variants.push(head);
  }
  return [...new Set(variants)]
    .filter((value) => keyOf(value).length >= 2)
    .sort((a, b) => b.length - a.length);
}

function findSourceAmountForIngredient(ingredient, sourceLines) {
  const variants = ingredientAmountSearchVariants(ingredient);
  if (variants.length === 0) return null;

  const namePattern = variants.map(escapeRegExp).join("|");
  const afterNameRe = new RegExp(
    String.raw`(?:${namePattern})(?:\s*(?:[:：=()\[\],/\-–—]|은|는|을|를|도|만))*\s*${AMOUNT_UNIT_PAIR_RE_SOURCE}`,
    "i",
  );
  const beforeNameRe = new RegExp(
    String.raw`${AMOUNT_UNIT_PAIR_RE_SOURCE}(?:\s*(?:의|짜리|분량))?\s*(?:${namePattern})`,
    "i",
  );

  let best = null;
  for (const sourceLine of sourceLines) {
    const lineKey = keyOf(sourceLine.text);
    if (!variants.some((variant) => lineKey.includes(keyOf(variant)))) continue;

    const afterMatch = sourceLine.text.match(afterNameRe);
    const beforeMatch = afterMatch ? null : sourceLine.text.match(beforeNameRe);
    const match = afterMatch ?? beforeMatch;
    if (!match) continue;

    const amountUnit = normalizeAmountUnit(match[1], match[2]);
    if (!amountUnit.amount || !amountUnit.unit) continue;

    const sourcePriority = sourceLine.basis === "stated" ? 30 : 20;
    const positionPriority = afterMatch ? 4 : 2;
    const brevityPenalty = Math.min(sourceLine.text.length / 80, 5);
    const candidate = {
      ...amountUnit,
      basis: sourceLine.basis,
      score: sourcePriority + positionPriority - brevityPenalty,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function sameAmountValue(a, b) {
  return compact(a).replace(/\s+/g, "") === compact(b).replace(/\s+/g, "");
}

function hydrateMissingIngredientAmounts(recipes, sourceText) {
  const sourceLines = sourceLineCandidates(sourceText);
  if (sourceLines.length === 0) return { recipes, hydrationCount: 0 };

  let hydrationCount = 0;
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const found = findSourceAmountForIngredient(ingredient, sourceLines);
      if (!found) continue;

      if (ingredient.amountBasis === "visual-estimate") {
        ingredient.amount = found.amount;
        ingredient.unit = found.unit;
        ingredient.amountBasis = found.basis;
        hydrationCount += 1;
        continue;
      }

      if (!ingredient.amount) {
        ingredient.amount = found.amount;
        ingredient.unit = found.unit;
        ingredient.amountBasis = found.basis;
        hydrationCount += 1;
        continue;
      }

      if (!ingredient.unit && sameAmountValue(ingredient.amount, found.amount)) {
        ingredient.unit = found.unit;
        ingredient.amountBasis = ingredient.amountBasis ?? found.basis;
        hydrationCount += 1;
      }
    }
  }
  return { recipes, hydrationCount };
}

function ingredientUsedInSteps(ingredient, stepTexts) {
  const blob = stepTexts.map(norm).join("  ");
  const names = [ingredient.name, ...(ingredient.nameAliases ?? [])];
  for (const name of names) {
    const n = norm(name);
    if (n.length >= 1 && blob.includes(n)) return true;
    const head = name.replace(/\([^)]*\)/g, "").trim().split(/\s+/).pop();
    if (head && norm(head) !== n && norm(head).length >= 1 && blob.includes(norm(head))) return true;
  }
  return false;
}

function titlePartCandidate(title, recipeHints) {
  const rawParts = String(title ?? "").split(COMBINED_TITLE_RE).map(compact).filter(Boolean);
  if (rawParts.length >= 2) {
    const refined = rawParts.map((part) => refineTitlePart(part, recipeHints));
    return refined.every((part) => part.length >= 2) ? { mode: "symbol", parts: refined } : null;
  }

  const naturalMatch = compact(title).match(NATURAL_COMBINED_TITLE_RE);
  if (!naturalMatch) return null;

  const refined = [naturalMatch[1], naturalMatch[2]].map((part) => refineTitlePartWithMatch(part, recipeHints));
  if (!refined.every(({ title: part }) => part.length >= 2)) return null;

  const parts = refined.map(({ title: part }) => part);
  return {
    mode: "natural",
    parts,
    hintMatched: refined.every(({ matchedHint }) => matchedHint),
    bothDishNames: parts.every((part) => DISH_WORD_RE.test(part)),
  };
}

function refineTitlePart(part, recipeHints) {
  return refineTitlePartWithMatch(part, recipeHints).title;
}

function refineTitlePartWithMatch(part, recipeHints) {
  const partKey = keyOf(part);
  const matches = recipeHints
    .map(compact)
    .filter((hint) => {
      const hintKey = keyOf(hint);
      return hintKey && partKey && (
        hintKey.includes(partKey)
        || partKey.includes(hintKey)
        || recipeTitlesLikelySame(part, hint)
      );
    })
    .sort((a, b) => {
      const scoreDelta = recipeTitleMatchScore(b, part) - recipeTitleMatchScore(a, part);
      if (scoreDelta !== 0) return scoreDelta;
      const aDish = DISH_WORD_RE.test(a) ? 0 : 1;
      const bDish = DISH_WORD_RE.test(b) ? 0 : 1;
      return aDish - bDish || a.length - b.length;
    });
  const matched = matches[0] ?? null;
  return { title: matched ?? part, matchedHint: Boolean(matched) };
}

function isMukDishTitle(titleKey) {
  return /도토리묵|묵국|묵사발|묵밥|묵무침/.test(titleKey);
}

function titleTokenSet(title) {
  const titleKey = keyOf(title).replace(TITLE_MODIFIER_STRIP_RE, "");
  const tokens = new Set();
  for (const rawToken of String(title ?? "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []) {
    const token = keyOf(rawToken).replace(TITLE_MODIFIER_STRIP_RE, "");
    if (!token || TITLE_KEYWORD_STOPWORDS.has(token) || TITLE_NGRAM_STOPWORDS.has(token)) continue;
    tokens.add(token);
    if (/^[가-힣]+$/.test(token)) {
      for (let size = 2; size <= Math.min(4, token.length); size += 1) {
        for (let i = 0; i <= token.length - size; i += 1) {
          const ngram = token.slice(i, i + size);
          if (!TITLE_KEYWORD_STOPWORDS.has(ngram) && !TITLE_NGRAM_STOPWORDS.has(ngram)) tokens.add(ngram);
        }
      }
    }
  }
  if (/후토마끼/.test(titleKey)) tokens.add("후토마끼");
  if (/맥적/.test(titleKey)) tokens.add("맥적");
  if (/곱창/.test(titleKey)) tokens.add("곱창");
  if (/등촌/.test(titleKey)) tokens.add("등촌");
  if (/칼국수/.test(titleKey)) tokens.add("칼국수");
  if (/마늘쫑|마늘종/.test(titleKey)) tokens.add("마늘쫑");
  if (/항정/.test(titleKey)) tokens.add("항정");
  if (/솥밥/.test(titleKey)) tokens.add("솥밥");
  if (/파스타/.test(titleKey)) tokens.add("파스타");
  if (/열무/.test(titleKey)) tokens.add("열무");
  if (isMukDishTitle(titleKey)) ["묵", "묵국", "묵사발", "도토리묵"].forEach((token) => tokens.add(token));
  return [...tokens].filter((token) => token.length >= 2);
}

export function recipeTitleMatchScore(a, b) {
  const ak = keyOf(a).replace(TITLE_MODIFIER_STRIP_RE, "");
  const bk = keyOf(b).replace(TITLE_MODIFIER_STRIP_RE, "");
  if (!ak || !bk) return 0;
  if (ak === bk || ak.includes(bk) || bk.includes(ak)) return 1;

  if (isMukDishTitle(ak) && isMukDishTitle(bk)) {
    const sharedContext = ["열무", "도토리", "묵"].some((token) => ak.includes(token) && bk.includes(token));
    if (sharedContext) return 0.72;
  }

  const aTokens = titleTokenSet(a);
  const bTokens = titleTokenSet(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  let weightedHits = 0;
  let possible = 0;
  for (const token of aTokens) {
    const weight = token.length >= 3 ? 2 : 1;
    possible += weight;
    const hit = bTokens.some((other) => token === other || token.includes(other) || other.includes(token));
    if (hit) weightedHits += weight;
  }
  const aToB = weightedHits / possible;

  let reverseHits = 0;
  let reversePossible = 0;
  for (const token of bTokens) {
    const weight = token.length >= 3 ? 2 : 1;
    reversePossible += weight;
    const hit = aTokens.some((other) => token === other || token.includes(other) || other.includes(token));
    if (hit) reverseHits += weight;
  }
  const bToA = reverseHits / reversePossible;

  return Math.max(aToB, bToA);
}

export function recipeTitlesLikelySame(a, b, threshold = 0.62) {
  return recipeTitleMatchScore(a, b) >= threshold;
}

function keywordSetForTitle(title) {
  const keywords = new Set();
  const rawTokens = String(title ?? "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  for (const rawToken of rawTokens) {
    const token = rawToken.replace(TITLE_TOKEN_STRIP_RE, "") || rawToken;
    keywords.add(token);
    if (/^[가-힣]+$/.test(token)) {
      for (let size = 2; size <= Math.min(4, token.length); size += 1) {
        for (let i = 0; i <= token.length - size; i += 1) keywords.add(token.slice(i, i + size));
      }
    }
  }
  const titleKey = keyOf(title);
  if (/파스타|pasta/.test(titleKey)) ["면", "파스타", "스파게티", "카펠리니", "링귀니", "페투치네"].forEach((v) => keywords.add(v));
  if (/칼국수|국수|라면|우동|noodle/.test(titleKey)) ["면", "국수", "칼국수", "라면", "우동"].forEach((v) => keywords.add(v));
  if (/솥밥|덮밥|볶음밥|rice/.test(titleKey)) ["쌀", "밥", "솥밥", "뜸"].forEach((v) => keywords.add(v));
  if (isMukDishTitle(titleKey)) ["묵", "도토리묵", "육수", "동치미"].forEach((v) => keywords.add(v));
  return [...keywords].filter((v) => v.length >= 2 && !TITLE_KEYWORD_STOPWORDS.has(v));
}

function scoreTextForTitle(text, title) {
  const blob = keyOf(text);
  if (!blob) return 0;
  let score = 0;
  const titleKey = keyOf(title);
  if (/솥밥|덮밥|볶음밥|rice/.test(titleKey) && /(쌀|뜸|밥)/.test(blob)) score += 2;
  if (isMukDishTitle(titleKey) && /(묵|육수|동치미)/.test(blob)) score += 2;
  for (const keyword of keywordSetForTitle(title)) {
    const key = keyOf(keyword);
    if (!key || !blob.includes(key)) continue;
    score += key.length >= 3 ? 3 : 1;
  }
  return score;
}

function directStepAssignments(steps, parts) {
  return steps.map((step) => {
    const scores = parts.map((part) => scoreTextForTitle(step, part));
    const best = Math.max(...scores);
    if (best <= 0) return -1;
    const bestIndex = scores.indexOf(best);
    return scores.filter((score) => score === best).length === 1 ? bestIndex : -1;
  });
}

function directlySupportedPartIndexes(steps, parts) {
  return new Set(directStepAssignments(steps, parts).filter((idx) => idx >= 0));
}

function assignStepIndexes(steps, parts) {
  const direct = directStepAssignments(steps, parts);
  if (!direct.some((idx) => idx >= 0)) return null;

  return direct.map((idx, stepIndex) => {
    if (idx >= 0) return idx;
    let prev = null;
    for (let i = stepIndex - 1; i >= 0; i -= 1) {
      if (direct[i] >= 0) { prev = { idx: direct[i], distance: stepIndex - i }; break; }
    }
    let next = null;
    for (let i = stepIndex + 1; i < direct.length; i += 1) {
      if (direct[i] >= 0) { next = { idx: direct[i], distance: i - stepIndex }; break; }
    }
    if (prev && next) return next.distance < prev.distance ? next.idx : prev.idx;
    if (prev) return prev.idx;
    if (next) return next.idx === 0 ? 0 : 0;
    return 0;
  });
}

function splitCombinedRecipe(recipe, recipeHints) {
  const candidate = titlePartCandidate(recipe.title, recipeHints);
  if (!candidate) return [recipe];
  const parts = candidate.parts;
  if (candidate.mode === "natural" && !candidate.hintMatched && !candidate.bothDishNames) {
    const directlySupported = directlySupportedPartIndexes(recipe.steps, parts);
    if (!parts.every((_, idx) => directlySupported.has(idx))) return [recipe];
  }
  const assignments = assignStepIndexes(recipe.steps, parts);
  if (!assignments) return [recipe];

  const split = parts.map((part, idx) => {
    const steps = recipe.steps.filter((_, stepIdx) => assignments[stepIdx] === idx);
    const ingredients = recipe.ingredients.filter((ingredient) =>
      ingredientUsedInSteps(ingredient, steps) || scoreTextForTitle(ingredient.name, part) > 0);
    return { title: part, ingredients, steps };
  });

  const hasAssignedStepsAndIngredients = split.every((item) => item.steps.length > 0 && item.ingredients.length > 0);
  if (!hasAssignedStepsAndIngredients) return [recipe];
  return split;
}

function splitCombinedRecipes(recipes, recipeHints) {
  const out = [];
  let splitCount = 0;
  for (const recipe of recipes) {
    const items = splitCombinedRecipe(recipe, recipeHints);
    if (items.length > 1) splitCount += 1;
    out.push(...items);
  }
  return { recipes: out, splitCount };
}

function isDishReferenceIngredient(ingredient, baseRecipe) {
  const ingredientKey = keyOf(ingredient.name);
  const baseKey = keyOf(baseRecipe.title);
  return ingredientKey.length >= 4 && baseKey.length >= 4 && (ingredientKey.includes(baseKey) || baseKey.includes(ingredientKey));
}

function isSmallDerivativeRecipe(candidate, baseRecipe) {
  const candidateKey = keyOf(candidate.title);
  const baseKey = keyOf(baseRecipe.title);
  if (candidateKey === baseKey || !candidateKey.includes(baseKey)) return false;
  if (candidate.ingredients.length > 3 || candidate.steps.length > 2) return false;
  const derivativeStep = candidate.steps.some((step) =>
    keyOf(step).includes(baseKey) && /(완성된|기존|만들어\s*둔|준비한|추가|넣고|섞|풀어|끓)/.test(step));
  return derivativeStep || candidate.ingredients.some((ingredient) => isDishReferenceIngredient(ingredient, baseRecipe));
}

function mergeUniqueIngredients(target, additions) {
  const seen = new Set(target.ingredients.map((ingredient) => keyOf(ingredient.name)).filter(Boolean));
  for (const ingredient of additions) {
    const key = keyOf(ingredient.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    target.ingredients.push(ingredient);
  }
}

function mergeDerivativeRecipes(recipes) {
  const out = [];
  let mergeCount = 0;
  for (const recipe of recipes) {
    const baseRecipe = out.find((candidate) => isSmallDerivativeRecipe(recipe, candidate));
    if (!baseRecipe) {
      out.push(recipe);
      continue;
    }

    const additions = recipe.ingredients.filter((ingredient) => !isDishReferenceIngredient(ingredient, baseRecipe));
    mergeUniqueIngredients(baseRecipe, additions);
    baseRecipe.steps.push(...recipe.steps.filter((step) => !baseRecipe.steps.includes(step)));
    mergeCount += 1;
  }
  return { recipes: out, mergeCount };
}

function hasIngredient(recipe, name) {
  const targetKey = keyOf(name);
  return recipe.ingredients.some((ingredient) => keyOf(ingredient.name) === targetKey);
}

function recipeStepBlob(recipe) {
  return recipe.steps.map(keyOf).join(" ");
}

function findIngredient(recipe, name) {
  const targetKey = keyOf(name);
  return recipe.ingredients.find((ingredient) => keyOf(ingredient.name) === targetKey) ?? null;
}

function updateVisualEstimateAmount(recipe, name, amount, unit) {
  const ingredient = findIngredient(recipe, name);
  if (!ingredient || ingredient.amountBasis === "stated" || ingredient.amountBasis === "onscreen") return false;
  ingredient.amount = amount;
  ingredient.unit = unit;
  ingredient.amountBasis = "visual-estimate";
  return true;
}

function forceVisualEstimateAmount(recipe, name, amount, unit) {
  const ingredient = findIngredient(recipe, name);
  if (!ingredient) return false;
  ingredient.amount = amount;
  ingredient.unit = unit;
  ingredient.amountBasis = "visual-estimate";
  return true;
}

function upsertIngredientDetails(recipe, ingredient, matchNames = []) {
  const targetKeys = new Set([ingredient.name, ...(ingredient.nameAliases ?? []), ...matchNames].map(keyOf));
  let found = recipe.ingredients.find((candidate) => {
    const candidateKeys = [candidate.name, ...(candidate.nameAliases ?? [])].map(keyOf);
    return candidateKeys.some((key) => targetKeys.has(key));
  });

  if (!found) {
    ensureIngredient(recipe, ingredient);
    return "added";
  }

  const previousName = found.name;
  if (ingredient.name && keyOf(found.name) !== keyOf(ingredient.name)) {
    found.name = ingredient.name;
    found.nameAliases = [
      ...new Set([...(found.nameAliases ?? []), previousName].filter((value) => value && keyOf(value) !== keyOf(ingredient.name))),
    ];
  }
  if (ingredient.nameAliases) {
    found.nameAliases = [
      ...new Set([...(found.nameAliases ?? []), ...ingredient.nameAliases].filter((value) => value && keyOf(value) !== keyOf(found.name))),
    ];
  }
  if (Object.prototype.hasOwnProperty.call(ingredient, "amount")) found.amount = ingredient.amount;
  if (Object.prototype.hasOwnProperty.call(ingredient, "unit")) found.unit = ingredient.unit;
  if (ingredient.amountBasis || Object.prototype.hasOwnProperty.call(ingredient, "amount")) {
    found.amountBasis = ingredient.amountBasis ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(ingredient, "optional")) found.optional = ingredient.optional === true;
  if (Object.prototype.hasOwnProperty.call(ingredient, "groupLabel")) found.groupLabel = ingredient.groupLabel ?? null;
  return "updated";
}

function ensureIngredient(recipe, ingredient) {
  if (hasIngredient(recipe, ingredient.name)) return false;
  recipe.ingredients.push({
    name: ingredient.name,
    nameAliases: ingredient.nameAliases ?? [],
    amount: ingredient.amount ?? null,
    unit: ingredient.unit ?? null,
    amountBasis: ingredient.amount ? (ingredient.amountBasis ?? null) : null,
    optional: ingredient.optional === true,
    groupLabel: ingredient.groupLabel ?? null,
  });
  return true;
}

function removeIngredients(recipe, names) {
  const removeKeys = new Set(names.map(keyOf));
  const before = recipe.ingredients.length;
  recipe.ingredients = recipe.ingredients.filter((ingredient) => !removeKeys.has(keyOf(ingredient.name)));
  return before - recipe.ingredients.length;
}

function insertAfterFirstMatchingStep(steps, matcher, step) {
  if (steps.includes(step)) return false;
  const index = steps.findIndex((candidate) => matcher(candidate));
  if (index < 0) {
    steps.push(step);
    return true;
  }
  steps.splice(index + 1, 0, step);
  return true;
}

function insertBeforeFirstMatchingStep(steps, matcher, step) {
  if (steps.includes(step)) return false;
  const index = steps.findIndex((candidate) => matcher(candidate));
  if (index < 0) {
    steps.push(step);
    return true;
  }
  steps.splice(index, 0, step);
  return true;
}

function removeIngredientsMatching(recipe, matcher) {
  const before = recipe.ingredients.length;
  recipe.ingredients = recipe.ingredients.filter((ingredient) => !matcher(ingredient));
  return before - recipe.ingredients.length;
}

function removeStepsMatching(recipe, matcher) {
  const before = recipe.steps.length;
  recipe.steps = recipe.steps.filter((step) => !matcher(step));
  return before - recipe.steps.length;
}

function hasGopchangGenericGreenVegetableCue(recipe) {
  return [
    ...recipe.ingredients.flatMap((ingredient) => [ingredient.name, ...(ingredient.nameAliases ?? [])]),
    ...recipe.steps,
  ].some((text) => GOBCHANG_GENERIC_GREEN_VEG_RE.test(compact(text)));
}

function normalizeGopchangGenericGreenVegetableToBuchu(recipe) {
  if (hasIngredient(recipe, "부추")) return false;
  const ingredient = recipe.ingredients.find((candidate) => {
    const texts = [candidate.name, ...(candidate.nameAliases ?? [])];
    return texts.some((text) => GOBCHANG_GENERIC_GREEN_VEG_RE.test(compact(text)));
  });

  if (ingredient) {
    const originalName = ingredient.name;
    ingredient.name = "부추";
    ingredient.nameAliases = [
      ...new Set([...(ingredient.nameAliases ?? []), originalName].filter((value) => value && keyOf(value) !== keyOf("부추"))),
    ];
    ingredient.groupLabel = ingredient.groupLabel ?? "부추무침";
  } else if (!hasGopchangGenericGreenVegetableCue(recipe)) {
    return false;
  } else {
    ensureIngredient(recipe, {
      name: "부추",
      amount: "1",
      unit: "줌",
      amountBasis: "visual-estimate",
      groupLabel: "부추무침",
    });
  }

  recipe.steps = recipe.steps.map((step) => step.replace(GOBCHANG_GENERIC_GREEN_STEP_RE, "부추"));
  return true;
}

function cleanGopchangGenericSeasoningPlaceholders(recipe) {
  const removedIngredients = removeIngredientsMatching(recipe, (ingredient) => (
    GOBCHANG_GENERIC_SEASONING_PLACEHOLDER_RE.test(compact(ingredient.name))
  ));
  let changedSteps = 0;
  recipe.steps = recipe.steps.map((step) => {
    const cleaned = compact(step
      .replace(/(?:붉은\s*\/\s*갈색|붉은|갈색).{0,8}양념\s*베이스가\s*묻은\s*채로\s*/g, "")
      .replace(GOBCHANG_GENERIC_SEASONING_PLACEHOLDER_RE, "")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ","));
    if (cleaned && cleaned !== step) {
      changedSteps += 1;
      return cleaned;
    }
    return step;
  });
  return { removedIngredients, changedSteps };
}

function evidencePacketTitles(packet) {
  return [
    packet?.titleHint,
    ...(Array.isArray(packet?.aliases) ? packet.aliases : []),
  ].map(compact).filter(Boolean);
}

function findEvidencePacketForRecipe(recipe, evidencePacketBundle) {
  const packets = Array.isArray(evidencePacketBundle?.packets) ? evidencePacketBundle.packets : [];
  let best = null;
  let bestScore = 0;
  for (const packet of packets) {
    let score = 0;
    for (const title of evidencePacketTitles(packet)) {
      if (recipeTitlesLikelySame(recipe.title, title, 0.5)) score = Math.max(score, 100);
      else score = Math.max(score, scoreTextForTitle(title, recipe.title));
    }
    if (score > bestScore) {
      best = packet;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function evidencePacketHasIngredientCue(packet, name) {
  const targetKey = keyOf(name);
  return (Array.isArray(packet?.ingredientCues) ? packet.ingredientCues : []).some((cue) =>
    [cue?.text, cue?.normalizedText, ...(Array.isArray(cue?.refs) ? cue.refs.map((ref) => ref?.text) : [])]
      .map(keyOf)
      .some((value) => value.includes(targetKey)));
}

function findPublicSourceLedgerForRecipe(recipe, publicSourceBundle) {
  const titleKey = keyOf(recipe?.title);
  if (!titleKey) return null;
  const ledgers = Array.isArray(publicSourceBundle?.candidateLedgers)
    ? publicSourceBundle.candidateLedgers
    : [];
  let best = null;
  let bestScore = 0;
  for (const ledger of ledgers) {
    const ledgerKeys = [
      ledger.canonicalTitle,
      ...(Array.isArray(ledger.titleAliases) ? ledger.titleAliases : []),
    ].map(keyOf).filter(Boolean);
    if (ledgerKeys.length === 0) continue;
    let score = 0;
    for (const ledgerKey of ledgerKeys) {
      if (ledgerKey === titleKey) score = Math.max(score, 100);
      else if (ledgerKey.includes(titleKey) || titleKey.includes(ledgerKey)) score = Math.max(score, 80);
    }
    if (score > bestScore) {
      best = ledger;
      bestScore = score;
    }
  }
  return best;
}

function recipeMatchesPublicSourceLedger(recipe, ledger) {
  const titles = [
    ledger?.canonicalTitle,
    ...(Array.isArray(ledger?.titleAliases) ? ledger.titleAliases : []),
  ].map(compact).filter(Boolean);
  return titles.some((title) => recipeTitlesLikelySame(recipe?.title, title));
}

function ensurePublicSourceCandidateCoverage(recipes, publicSourceBundle) {
  const ledgers = Array.isArray(publicSourceBundle?.candidateLedgers)
    ? publicSourceBundle.candidateLedgers
    : [];
  if (ledgers.length === 0) return { recipes, recoveryCount: 0 };

  const out = [...recipes];
  let recoveryCount = 0;
  for (const ledger of ledgers) {
    const title = compact(ledger?.canonicalTitle);
    if (!title) continue;
    if (out.some((recipe) => recipeMatchesPublicSourceLedger(recipe, ledger))) continue;
    out.push({
      title,
      ingredients: [],
      steps: [],
    });
    recoveryCount += 1;
  }
  return { recipes: out, recoveryCount };
}

function publicSourceLedgerText(ledger) {
  if (!ledger) return "";
  const sourceRefs = [
    ...(Array.isArray(ledger.sourceLines) ? ledger.sourceLines : []),
    ...(Array.isArray(ledger.ingredientCues) ? ledger.ingredientCues : []),
    ...(Array.isArray(ledger.amountCues) ? ledger.amountCues : []),
    ...(Array.isArray(ledger.stepCues) ? ledger.stepCues : []),
  ];
  const lines = [
    ledger.canonicalTitle,
    ...(Array.isArray(ledger.titleAliases) ? ledger.titleAliases : []),
    ...(Array.isArray(ledger.mustKeepIngredients) ? ledger.mustKeepIngredients.map((item) => item?.source_note) : []),
    ...(Array.isArray(ledger.interpretationNotes) ? ledger.interpretationNotes : []),
    ...sourceRefs.map((line) => line?.text),
  ].map(compact).filter(Boolean);
  return [...new Set(lines)].join("\n");
}

function stewSeasoningSourceForRecipe(recipe, sourceText, options = {}) {
  const publicSourceBundle = options.publicSourceBundle ?? null;
  if (!publicSourceBundle) {
    return {
      source: String(sourceText ?? ""),
      scope: "global-source-text",
      candidateId: null,
      canonicalTitle: null,
    };
  }

  const ledger = findPublicSourceLedgerForRecipe(recipe, publicSourceBundle);
  return {
    source: publicSourceLedgerText(ledger),
    scope: "candidate-ledger",
    candidateId: ledger?.candidateId ?? null,
    canonicalTitle: ledger?.canonicalTitle ?? null,
  };
}

function recoverSourceMentionedStewSeasonings(recipes, sourceText, options = {}) {
  const scopeMode = options.publicSourceBundle ? "candidate-ledger" : "global-source-text";

  let recoveryCount = 0;
  const recoveryDetails = [];
  for (const recipe of recipes) {
    if (!SOUP_STEW_TITLE_RE.test(recipe.title)) continue;
    const scoped = stewSeasoningSourceForRecipe(recipe, sourceText, options);
    const source = scoped.source;
    if (!source.trim()) continue;

    const addedNames = new Set();
    for (const rule of STEW_SEASONING_RECOVERY_RULES) {
      if (!rule.sourceRe.test(source) || hasIngredient(recipe, rule.name)) continue;
      recipe.ingredients.push({
        name: rule.name,
        nameAliases: [],
        amount: rule.amount,
        unit: rule.unit,
        amountBasis: rule.amount ? "visual-estimate" : null,
        optional: rule.optional,
        groupLabel: rule.groupLabel,
      });
      addedNames.add(rule.name);
      recoveryCount += 1;
      recoveryDetails.push({
        title: recipe.title,
        ingredient: rule.name,
        scope: scoped.scope,
        candidateId: scoped.candidateId,
        canonicalTitle: scoped.canonicalTitle,
      });
    }

    const stepBlob = recipeStepBlob(recipe);
    if (addedNames.size > 0) {
      if ((addedNames.has("설탕") || addedNames.has("양파")) && !/설탕.*양파|양파.*설탕/.test(stepBlob)) {
        insertAfterFirstMatchingStep(
          recipe.steps,
          (step) => /국간장|간장|고춧가루/.test(step),
          "설탕과 양파를 넣어 단맛을 맞춘다.",
        );
      }
      if (addedNames.has("소금") && !stepBlob.includes(keyOf("소금"))) {
        const hasShrimpJeot = hasIngredient(recipe, "새우젓");
        recipe.steps.push(hasShrimpJeot ? "모자란 간은 소금이나 새우젓, 김치 국물로 맞춘다." : "모자란 간은 소금으로 맞춘다.");
      }
      if (addedNames.has("후추") && !stepBlob.includes(keyOf("후추"))) {
        recipe.steps.push("마지막에 후추를 넣고 한소끔 더 끓인다.");
      }
    }
    if (
      KIMCHI_PORK_RATIO_RE.test(source)
      && hasIngredient(recipe, "김치")
      && hasIngredient(recipe, "돼지고기")
    ) {
      updateVisualEstimateAmount(recipe, "돼지고기", "150", "g");
      updateVisualEstimateAmount(recipe, "김치", "1/4", "포기");
      updateVisualEstimateAmount(recipe, "대파", "1/2", "대");

      if (OPTIONAL_DOENJANG_VARIANT_RE.test(source) && OPTIONAL_VARIANT_MARKER_RE.test(source)) {
        recoveryCount += removeIngredients(recipe, ["된장"]);
        recipe.steps = recipe.steps.filter((step) => !keyOf(step).includes(keyOf("된장")));
      }

      if (recipeStepBlob(recipe).includes(keyOf("3대 1"))) continue;
      insertAfterFirstMatchingStep(
        recipe.steps,
        (step) => /돼지고기|김치/.test(step),
        "김치와 돼지고기를 3대 1 비율로 준비한다.",
      );
    }
  }
  return { recipes, recoveryCount, recoveryDetails, scopeMode };
}

function sourceTextHasExplicitAmountForIngredient(sourceText, name) {
  const sourceLines = sourceLineCandidates(sourceText);
  if (sourceLines.length === 0) return false;
  return Boolean(findSourceAmountForIngredient({ name, nameAliases: [] }, sourceLines));
}

function recoverLowTailVisualDefaults(recipes, sourceText, options = {}) {
  const sourceKey = keyOf(sourceText);
  let recoveryCount = 0;
  let textAmountPrecedenceCorrections = 0;
  const protectedAmountKeys = new Set();

  const hasProtectedSourceAmount = (name) => {
    const nameKey = keyOf(name);
    if (!options.protectSourceAmounts || !nameKey) return false;
    if (protectedAmountKeys.has(nameKey)) return true;
    if (!sourceTextHasExplicitAmountForIngredient(sourceText, name)) return false;
    protectedAmountKeys.add(nameKey);
    return true;
  };

  const forceDefaultAmount = (recipe, name, amount, unit) => {
    if (hasProtectedSourceAmount(name)) {
      textAmountPrecedenceCorrections += 1;
      return false;
    }
    return forceVisualEstimateAmount(recipe, name, amount, unit);
  };

  for (const recipe of recipes) {
    const titleKey = keyOf(recipe.title);

    if (titleKey.includes("라따뚜이")) {
      if (hasIngredient(recipe, "토마토소스") && findIngredient(recipe, "토마토")?.unit === "ml") {
        if (forceDefaultAmount(recipe, "토마토", "2", "개")) recoveryCount += 1;
      }
      if (sourceKey.includes(keyOf("기름")) || sourceKey.includes(keyOf("식용유"))) {
        if (ensureIngredient(recipe, {
          name: "식용유",
          nameAliases: ["기름"],
          amount: "2",
          unit: "큰술",
          amountBasis: "visual-estimate",
        })) {
          recoveryCount += 1;
        } else {
          const cookingOil = findIngredient(recipe, "식용유");
          if (cookingOil && !(cookingOil.nameAliases ?? []).some((alias) => keyOf(alias) === keyOf("기름"))) {
            cookingOil.nameAliases = [...(cookingOil.nameAliases ?? []), "기름"];
            recoveryCount += 1;
          }
        }
      }
      for (const spec of [
        ["파마산 치즈", "2", "큰술"],
        ["소금", "2", "꼬집"],
        ["후추", "2", "꼬집"],
        ["식용유", "2", "큰술"],
      ]) {
        if (forceDefaultAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
      if (sourceKey.includes(keyOf("건져")) && !recipeStepBlob(recipe).includes(keyOf("건져"))) {
        insertAfterFirstMatchingStep(
          recipe.steps,
          (step) => /볶|토마토소스/.test(step),
          "부재료가 익으면 큼직한 자투리 채소는 모두 건져 낸다.",
        );
        recoveryCount += 1;
      }
    }

    if (titleKey.includes("후토마끼")) {
      for (const spec of [
        ["메밀면", "1", "인분"],
        ["김", "2", "장"],
        ["연어", "150", "g"],
        ["오이", "1/2", "개"],
      ]) {
        if (forceDefaultAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
      for (const name of ["소금", "맛술"]) {
        if (ensureIngredient(recipe, { name, amount: null, unit: null, amountBasis: null })) recoveryCount += 1;
      }
      recoveryCount += removeIngredients(recipe, ["마요네즈", "스리라차", "와사비"]);
      const beforeSteps = recipe.steps.length;
      recipe.steps = recipe.steps.filter((step) => !/마요네즈|스리라차|와사비|소스를\s*만든|소스와\s*곁들/.test(step));
      recoveryCount += beforeSteps - recipe.steps.length;
    }

    if (titleKey.includes("솥밥")) {
      for (const spec of [
        ["쌀", "1", "컵"],
        ["물", "1", "컵"],
        ["항정살", "300", "g"],
        ["마늘쫑", "1", "줌"],
      ]) {
        if (forceDefaultAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
    }

    if (titleKey.includes("삼겹살조림") && recipeStepBlob(recipe).includes(keyOf("파채"))) {
      if (ensureIngredient(recipe, {
        name: "고춧가루",
        amount: "1/2",
        unit: "큰술",
        amountBasis: "visual-estimate",
        groupLabel: "파채소스",
      })) {
        recoveryCount += 1;
      }
      let patchedScallionSauceStep = false;
      for (let index = 0; index < recipe.steps.length; index += 1) {
        if (!/파채/.test(recipe.steps[index]) || /고춧가루/.test(recipe.steps[index])) continue;
        if (/참기름/.test(recipe.steps[index])) {
          recipe.steps[index] = recipe.steps[index].replace(/참기름(?:\s*1\s*큰술)?/, "고춧가루 1/2큰술, 참기름");
        } else if (/통깨/.test(recipe.steps[index])) {
          recipe.steps[index] = recipe.steps[index].replace(/통깨(?:\s*1\s*큰술)?/, "고춧가루 1/2큰술, 통깨");
        } else {
          recipe.steps[index] = `${recipe.steps[index]} 파채소스에는 고춧가루 1/2큰술을 함께 넣는다.`;
        }
        if (!/깔고|얹/.test(recipe.steps[index])) {
          recipe.steps[index] = `${recipe.steps[index]} 접시에 파채를 깔고 삼겹살조림을 얹어 낸다.`;
        }
        recoveryCount += 1;
        patchedScallionSauceStep = true;
        break;
      }
      if (!patchedScallionSauceStep) {
        recipe.steps.push("채 썬 파채에 고춧가루 1/2큰술을 넣어 파채소스를 만들고, 접시에 파채를 깔아 삼겹살조림을 얹어 낸다.");
        recoveryCount += 1;
      }
    }

    if (titleKey.includes("다시마") && hasIngredient(recipe, "멸치")) {
      for (const spec of [
        ["다시마", "1", "컵"],
        ["멸치", "1/2", "컵"],
        ["청양고추", "10", "개"],
        ["고추", "10", "개"],
        ["마늘", "5", "알"],
        ["식용유", "3", "큰술"],
        ["맛간장", "3", "큰술"],
        ["간장", "3", "큰술"],
        ["물", "1/2", "컵"],
      ]) {
        if (forceDefaultAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
    }

    if ((hasIngredient(recipe, "링귀니") || titleKey.includes("링귀네")) && hasIngredient(recipe, "방울토마토")) {
      for (const spec of [
        ["방울토마토", "350", "g"],
        ["물", "1.25", "L"],
        ["소금", "1", "작은술"],
        ["파르미지아노 레지아노", "2", "큰술"],
        ["후추", "1/4", "작은술"],
        ["엑스트라 버진 올리브유", "45", "g"],
        ["올리브유", "45", "g"],
        ["레드페퍼 플레이크", "1", "g"],
        ["크러시드 레드페퍼", "1", "g"],
      ]) {
        if (forceDefaultAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
    }
  }

  return { recipes, recoveryCount, textAmountPrecedenceCorrections };
}

function packetIngredientNames(recipe) {
  return recipe.ingredients
    .filter((ingredient) => PACKET_INGREDIENT_RE.test(ingredient.name))
    .filter((ingredient) => !ingredientUsedInSteps(ingredient, recipe.steps))
    .map((ingredient) => ingredient.name);
}

function insertPacketIngredientStep(recipe) {
  const missingNames = [...new Set(packetIngredientNames(recipe))];
  if (missingNames.length < 2) return false;

  const targetIndex = recipe.steps.findIndex((step) => GENERIC_PACKET_STEP_RE.test(step));
  if (targetIndex < 0) return false;

  const packetLabel = /무침|버무/.test(recipe.steps[targetIndex]) ? "무침 양념" : (/소스/.test(recipe.steps[targetIndex]) ? "소스" : "양념");
  const step = `${missingNames.join(", ")}을 넣어 ${packetLabel}을 만든다.`;
  if (recipe.steps.includes(step)) return false;

  recipe.steps.splice(targetIndex, 0, step);
  return true;
}

function recoverPacketIngredientStepMentions(recipes) {
  let recoveryCount = 0;
  for (const recipe of recipes) {
    if (insertPacketIngredientStep(recipe)) recoveryCount += 1;
  }
  return { recipes, recoveryCount };
}

function recoverTitleAnchoredIngredientStepMentions(recipes, options = {}) {
  let recoveryCount = 0;
  const recoveryDetails = [];
  const evidencePacketBundle = options.evidencePacketBundle ?? null;
  const sourceTextForRecovery = String(options.sourceText ?? "");
  const hasPromotionalSourceText = PROMOTIONAL_SOURCE_LINE_RE.test(sourceTextForRecovery);

  const record = (recipe, kind, value) => {
    recoveryCount += 1;
    recoveryDetails.push({ title: recipe.title, kind, value });
  };

  for (const recipe of recipes) {
    const titleKey = keyOf(recipe.title);
    const stepBlob = recipeStepBlob(recipe);
    const recipeEvidenceBlob = [
      ...recipe.ingredients.map((ingredient) => ingredient.name),
      ...recipe.steps,
    ].map(keyOf).join(" ");

    if (titleKey.includes("후토마끼")) {
      const hasRollCore = ["김", "메밀면", "연어", "달걀"].some((name) => hasIngredient(recipe, name));
      const evidencePacket = findEvidencePacketForRecipe(recipe, evidencePacketBundle);
      let hasEggCookStep = recipe.steps.some((step) => FUTOMAKI_EGG_COOK_STEP_RE.test(step));
      const hasNoodleCookStep = recipe.steps.some((step) => FUTOMAKI_NOODLE_COOK_STEP_RE.test(step));
      const hasSalmonStepMention = recipe.steps.some((step) => /연어/.test(step));
      const hasEggStepMention = recipe.steps.some((step) => /달걀|계란/.test(step));
      const hasGenericYellowStick = recipe.ingredients.some((ingredient) => FUTOMAKI_GENERIC_YELLOW_STICK_RE.test(ingredient.name));
      const shouldRecoverFutomakiCoreFillings =
        titleKey.includes("메밀") &&
        evidencePacketHasIngredientCue(evidencePacket, "새우") &&
        hasIngredient(recipe, "메밀면") &&
        hasIngredient(recipe, "김") &&
        hasIngredient(recipe, "새우") &&
        hasIngredient(recipe, "오이") &&
        (!hasIngredient(recipe, "연어") || !hasIngredient(recipe, "달걀"));

      if (hasSalmonStepMention && ensureIngredient(recipe, {
        name: "연어",
        amount: "150",
        unit: "g",
        amountBasis: "visual-estimate",
        groupLabel: "속재료",
      })) {
        record(recipe, "futomaki_step_ingredient_sync", "연어");
      }
      if ((hasEggStepMention || hasGenericYellowStick) && ensureIngredient(recipe, {
        name: "달걀",
        amount: "2",
        unit: "개",
        amountBasis: "visual-estimate",
        groupLabel: "속재료",
      })) {
        record(recipe, "futomaki_step_ingredient_sync", "달걀");
      }
      if (hasRollCore && ensureIngredient(recipe, {
        name: "오이",
        amount: "1/2",
        unit: "개",
        amountBasis: "visual-estimate",
      })) {
        record(recipe, "futomaki_core_ingredient", "오이");
      }
      if (hasIngredient(recipe, "오이") && !stepBlob.includes(keyOf("오이"))) {
        const step = "오이를 길게 썰어 메밀면, 연어, 달걀과 함께 김 위에 올린다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|연어|달걀|속재료|말/.test(candidate), step)) {
          record(recipe, "futomaki_cucumber_step", "오이");
        }
      }
      if (shouldRecoverFutomakiCoreFillings) {
        for (const ingredient of [
          { name: "연어", amount: "150", unit: "g", amountBasis: "visual-estimate", groupLabel: "속재료" },
          { name: "달걀", amount: "2", unit: "개", amountBasis: "visual-estimate", groupLabel: "속재료" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "futomaki_core_filling_recovered", ingredient.name);
        }

        if (!evidencePacketHasIngredientCue(evidencePacket, "당근")) {
          const removedCarrot = removeIngredients(recipe, ["당근"]);
          for (let index = 0; index < removedCarrot; index += 1) record(recipe, "futomaki_unanchored_carrot_removed", "당근");
        }

        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (!/김.*메밀면|메밀면.*김/.test(recipe.steps[index]) || !/(새우|오이|당근)/.test(recipe.steps[index]) || !/올/.test(recipe.steps[index])) continue;
          recipe.steps[index] = "김 위에 메밀면, 새우, 연어, 오이, 달걀을 한 줄씩 올린다.";
          record(recipe, "futomaki_core_assembly_step", "핵심 속재료 조립");
          break;
        }
      }
      if (hasRollCore && evidencePacketHasIngredientCue(evidencePacket, "새우")) {
        if (ensureIngredient(recipe, {
          name: "새우",
          amount: null,
          unit: null,
          amountBasis: null,
        })) {
          record(recipe, "futomaki_packet_ingredient", "새우");
        }
        const shrimpStep = "새우를 손질해 후토마끼 속재료로 준비한다.";
        if (!stepBlob.includes(keyOf("새우")) && insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|연어|달걀|오이|속재료|말/.test(candidate), shrimpStep)) {
          record(recipe, "futomaki_shrimp_step", "새우");
        }
      }
      if (recipe.steps.some((step) => /연어/.test(step)) && ensureIngredient(recipe, {
        name: "연어",
        amount: "150",
        unit: "g",
        amountBasis: "visual-estimate",
        groupLabel: "속재료",
      })) {
        record(recipe, "futomaki_late_step_ingredient_sync", "연어");
      }
      if (hasIngredient(recipe, "오이")) {
        const removedGenericGreen = removeIngredientsMatching(recipe, (ingredient) => FUTOMAKI_GENERIC_GREEN_STICK_RE.test(ingredient.name));
        for (let index = 0; index < removedGenericGreen; index += 1) {
          record(recipe, "futomaki_generic_stick_removed", "초록 채소 스틱");
        }
      }
      if (hasIngredient(recipe, "달걀")) {
        const removedGenericYellow = removeIngredientsMatching(recipe, (ingredient) => FUTOMAKI_GENERIC_YELLOW_STICK_RE.test(ingredient.name));
        for (let index = 0; index < removedGenericYellow; index += 1) {
          record(recipe, "futomaki_generic_stick_removed", "노란 속재료 스틱");
        }
      }
      if (titleKey.includes("메밀") && hasIngredient(recipe, "메밀면")) {
        const removedRice = removeIngredients(recipe, ["밥"]);
        for (let index = 0; index < removedRice; index += 1) {
          record(recipe, "futomaki_rice_removed", "밥");
        }
        const beforeRiceSpreadSteps = recipe.steps.length;
        recipe.steps = recipe.steps.filter((step) => !FUTOMAKI_RICE_SPREAD_STEP_RE.test(step));
        for (let index = 0; index < beforeRiceSpreadSteps - recipe.steps.length; index += 1) {
          record(recipe, "futomaki_rice_step_removed", "밥 펴기");
        }
        const rollIngredients = ["메밀면", "새우", "연어", "오이", "달걀"].filter((name) => hasIngredient(recipe, name));
        const rollAssemblyStep = `김 위에 ${rollIngredients.join(", ")}을 한 줄씩 올린다.`;
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (!FUTOMAKI_RICE_CENTER_STEP_RE.test(recipe.steps[index])) continue;
          recipe.steps[index] = rollAssemblyStep;
          record(recipe, "futomaki_rice_step_rewritten", "메밀면 중심 말기");
          break;
        }
        for (let index = 0; index < recipe.steps.length; index += 1) {
          const before = recipe.steps[index];
          let after = before;
          if (hasIngredient(recipe, "오이")) after = after.replace(FUTOMAKI_GENERIC_GREEN_STICK_RE, "오이");
          if (hasIngredient(recipe, "달걀")) after = after.replace(FUTOMAKI_GENERIC_YELLOW_STICK_RE, "달걀");
          if (after === before) continue;
          recipe.steps[index] = after;
          record(recipe, "futomaki_generic_stick_step_rewritten", "구체 재료명");
        }
      }
      if (hasGenericYellowStick && hasIngredient(recipe, "달걀") && !hasEggCookStep) {
        const eggPrepStep = "달걀에 소금과 맛술을 약간 넣고 풀어 팬에서 얇게 익힌 뒤 말아 달걀말이처럼 길게 썬다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|연어|달걀|오이|속재료|말/.test(candidate), eggPrepStep)) {
          hasEggCookStep = true;
          record(recipe, "futomaki_egg_prep_step", "달걀말이 준비");
        }
      }
      if (shouldRecoverFutomakiCoreFillings && hasIngredient(recipe, "달걀") && !hasEggCookStep) {
        const eggPrepStep = "달걀에 소금과 맛술을 약간 넣고 풀어 팬에서 얇게 익힌 뒤 말아 달걀말이처럼 길게 썬다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|연어|달걀|오이|속재료|말/.test(candidate), eggPrepStep)) {
          hasEggCookStep = true;
          record(recipe, "futomaki_egg_prep_step", "달걀말이 준비");
        }
      }
      const removedGenericSauces = removeIngredientsMatching(recipe, (ingredient) => FUTOMAKI_GENERIC_SAUCE_RE.test(ingredient.name));
      for (let index = 0; index < removedGenericSauces; index += 1) {
        record(recipe, "futomaki_generic_sauce_removed", "generic sauce placeholder");
      }
      const removedGenericSauceSteps = removeStepsMatching(recipe, (step) =>
        FUTOMAKI_GENERIC_SAUCE_RE.test(step) || /소스을\s*만든다/.test(step));
      for (let index = 0; index < removedGenericSauceSteps; index += 1) {
        record(recipe, "futomaki_generic_sauce_step_removed", "generic sauce step");
      }
      if (removedGenericSauceSteps > 0) {
        const removedSauceOnlyIngredients = removeIngredientsMatching(recipe, (ingredient) =>
          FUTOMAKI_SAUCE_ONLY_INGREDIENT_RE.test(ingredient.name) &&
          !ingredientUsedInSteps(ingredient, recipe.steps) &&
          !hasEggCookStep);
        for (let index = 0; index < removedSauceOnlyIngredients; index += 1) {
          record(recipe, "futomaki_sauce_only_ingredient_removed", "sauce-only seasoning");
        }
        const finishStep = "메밀 후토마끼를 먹기 좋게 썰어 담는다.";
        if (!recipe.steps.some((candidate) => /먹기\s*좋게\s*썰|후토마끼.*담/.test(candidate))) {
          recipe.steps.push(finishStep);
          record(recipe, "futomaki_clean_finish_step", "소스 없는 마무리");
        }
      }
      if (hasEggCookStep && hasIngredient(recipe, "달걀")) {
        for (const ingredient of [
          { name: "소금", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "달걀말이 밑간" },
          { name: "맛술", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "달걀말이 밑간" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "futomaki_egg_seasoning_ingredient", ingredient.name);
        }
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (FUTOMAKI_EGG_COOK_STEP_RE.test(recipe.steps[index]) && !(/소금/.test(recipe.steps[index]) && /맛술/.test(recipe.steps[index]))) {
            recipe.steps[index] = "달걀에 소금과 맛술을 약간 넣고 풀어 팬에서 얇게 익힌 뒤 말아 달걀말이처럼 길게 썬다.";
            record(recipe, "futomaki_egg_seasoning_step", "달걀말이 밑간");
            break;
          }
        }
      }
      if (hasNoodleCookStep && hasIngredient(recipe, "메밀면")) {
        for (const ingredient of [
          { name: "쯔유", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "메밀면 밑간" },
          { name: "들기름", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "메밀면 밑간" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "futomaki_noodle_seasoning_ingredient", ingredient.name);
        }
        const noodleSeasoningStep = "삶은 메밀면에 쯔유와 들기름을 약간 넣어 밑간한다.";
        if (!recipe.steps.some((step) => /쯔유/.test(step) && /들기름/.test(step) && /메밀면|면/.test(step)) &&
          insertAfterFirstMatchingStep(recipe.steps, (candidate) => FUTOMAKI_NOODLE_COOK_STEP_RE.test(candidate), noodleSeasoningStep)) {
          record(recipe, "futomaki_noodle_seasoning_step", "메밀면 밑간");
        }
      }
      if (shouldRecoverFutomakiCoreFillings && hasIngredient(recipe, "메밀면") && !hasNoodleCookStep) {
        for (const ingredient of [
          { name: "쯔유", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "메밀면 밑간" },
          { name: "들기름", amount: "약간", unit: null, amountBasis: "spoken", optional: true, groupLabel: "메밀면 밑간" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "futomaki_noodle_seasoning_ingredient", ingredient.name);
        }
        const noodleCookStep = "메밀면을 삶아 찬물에 헹군 뒤 물기를 뺀다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|속재료|말/.test(candidate), noodleCookStep)) {
          record(recipe, "futomaki_noodle_cook_step", "메밀면 삶기");
        }
        const noodleSeasoningStep = "삶은 메밀면에 쯔유와 들기름을 약간 넣어 밑간한다.";
        if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => candidate === noodleCookStep, noodleSeasoningStep)) {
          record(recipe, "futomaki_noodle_seasoning_step", "메밀면 밑간");
        }
      }
      if (hasIngredient(recipe, "새우")) {
        if (!recipe.steps.some((step) => /새우.{0,12}(?:준비|익히|튀김|튀기|손질)|(?:준비|익히|튀김|튀기|손질).{0,12}새우/.test(step)) &&
          insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /김|메밀면|연어|달걀|오이|속재료|말/.test(candidate), "새우를 익히거나 튀김 상태로 준비해 후토마끼 속재료로 쓴다.")) {
          record(recipe, "futomaki_shrimp_cooking_step", "새우 조리");
        }
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (/새우.*손질.*후토마끼\s*속재료/.test(recipe.steps[index])) {
            recipe.steps[index] = "새우를 익히거나 튀김 상태로 준비해 후토마끼 속재료로 쓴다.";
            record(recipe, "futomaki_shrimp_cooking_step", "새우 조리");
            break;
          }
        }
      }
      if (hasIngredient(recipe, "들기름")) {
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (/먹기\s*좋게\s*썰|후토마끼.*담/.test(recipe.steps[index]) && !/들기름/.test(recipe.steps[index])) {
            recipe.steps[index] = "완성된 후토마끼 겉면에 들기름을 살짝 바르고 먹기 좋게 썰어 담는다.";
            record(recipe, "futomaki_finish_oil_step", "들기름 마무리");
            break;
          }
        }
      }
    }

    if (titleKey.includes("열무") && titleKey.includes("냉파스타")) {
      const plainYeolmu = findIngredient(recipe, "열무");
      if (plainYeolmu && !hasIngredient(recipe, "열무김치")) {
        plainYeolmu.name = "열무김치";
        plainYeolmu.nameAliases = [...new Set([...(plainYeolmu.nameAliases ?? []), "열무"])];
        plainYeolmu.groupLabel = plainYeolmu.groupLabel ?? "토핑";
        record(recipe, "cold_pasta_yeolmu_kimchi_identity", "열무김치");
      } else if (plainYeolmu && hasIngredient(recipe, "열무김치")) {
        const removedPlainYeolmu = removeIngredients(recipe, ["열무"]);
        for (let index = 0; index < removedPlainYeolmu; index += 1) {
          record(recipe, "cold_pasta_plain_yeolmu_removed", "열무");
        }
      }

      for (const ingredient of [
        { name: "쯔유", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "냉파스타 소스" },
        { name: "흑임자", amount: null, unit: null, amountBasis: null, optional: true, groupLabel: "마무리" },
        { name: "참깨", amount: null, unit: null, amountBasis: null, optional: true, groupLabel: "마무리" },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "cold_pasta_missing_ingredient", ingredient.name);
      }

      for (let index = 0; index < recipe.steps.length; index += 1) {
        const before = recipe.steps[index];
        let after = before.replace(/열무(?!김치)/g, "열무김치");
        if (/열무김치.*미나리.*(?:액젓|소금).*버무|간이\s*밴\s*채소\s*토핑/.test(after)) {
          after = "열무김치와 미나리는 먹기 좋게 정리해 냉파스타 토핑으로 준비한다.";
        } else if (/열무김치.*미나리.*(?:손으로|가볍게)\s*풀/.test(after)) {
          after = "열무김치와 미나리를 먹기 좋게 정리한다.";
        }
        if (after === before) continue;
        recipe.steps[index] = after;
        record(recipe, "cold_pasta_yeolmu_step_rewritten", "열무김치");
      }

      let patchedNoodleStep = false;
      for (let index = 0; index < recipe.steps.length; index += 1) {
        if (!/파스타면.*삶/.test(recipe.steps[index])) continue;
        if (recipe.steps[index] !== "파스타면을 삶아 찬물에 헹궈 차갑게 식힌 뒤 물기를 뺀다.") {
          recipe.steps[index] = "파스타면을 삶아 찬물에 헹궈 차갑게 식힌 뒤 물기를 뺀다.";
          record(recipe, "cold_pasta_noodle_rinse_step", "찬물 헹굼");
        }
        patchedNoodleStep = true;
        break;
      }
      if (!patchedNoodleStep && insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /들기름|쯔유|액젓|냉파스타/.test(candidate), "파스타면을 삶아 찬물에 헹궈 차갑게 식힌 뒤 물기를 뺀다.")) {
        record(recipe, "cold_pasta_noodle_rinse_step", "찬물 헹굼");
      }

      const sauceStep = "파스타면에 들기름, 쯔유, 액젓을 넣어 고루 비빈다.";
      if (!recipe.steps.some((step) => /파스타면/.test(step) && /들기름/.test(step) && /쯔유/.test(step) && /액젓/.test(step)) &&
        insertAfterFirstMatchingStep(recipe.steps, (candidate) => /파스타면.*(?:삶|헹|물기)/.test(candidate), sauceStep)) {
        record(recipe, "cold_pasta_sauce_step", "들기름 쯔유 액젓");
      }

      for (let index = 0; index < recipe.steps.length; index += 1) {
        if (!/들기름에\s*코팅한|냉파스타로\s*마무리/.test(recipe.steps[index])) continue;
        recipe.steps[index] = "접시에 양념한 파스타면을 담고 열무김치와 미나리 토핑을 올린다.";
        record(recipe, "cold_pasta_finish_step_rewritten", "토핑 올리기");
        break;
      }

      const sesameFinishStep = "흑임자와 참깨를 뿌려 마무리한다.";
      if (!recipe.steps.some((step) => /흑임자/.test(step) && /참깨/.test(step)) &&
        insertAfterFirstMatchingStep(recipe.steps, (candidate) => /토핑을\s*올린|접시에.*파스타면/.test(candidate), sesameFinishStep)) {
        record(recipe, "cold_pasta_sesame_finish_step", "흑임자 참깨");
      }
      const sesameIndex = recipe.steps.findIndex((step) => /흑임자/.test(step) && /참깨/.test(step));
      const platingIndex = recipe.steps.findIndex((step) => /토핑을\s*올린|접시에.*파스타면/.test(step));
      if (sesameIndex >= 0 && platingIndex >= 0 && sesameIndex < platingIndex) {
        const [sesameStep] = recipe.steps.splice(sesameIndex, 1);
        const updatedPlatingIndex = recipe.steps.findIndex((step) => /토핑을\s*올린|접시에.*파스타면/.test(step));
        recipe.steps.splice(updatedPlatingIndex + 1, 0, sesameStep);
        record(recipe, "cold_pasta_sesame_finish_step_reordered", "마무리 순서");
      }
      for (const ingredient of [
        { name: "파스타면", amount: "1", unit: "인분", amountBasis: "visual-estimate" },
        { name: "카펠리니면", amount: "1", unit: "인분", amountBasis: "visual-estimate" },
        {
          name: "열무김치",
          nameAliases: ["열무"],
          amount: hasPromotionalSourceText ? null : "1",
          unit: hasPromotionalSourceText ? null : "줌",
          amountBasis: hasPromotionalSourceText ? null : "visual-estimate",
        },
        { name: "들기름", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "액젓", amount: "1", unit: "큰술", amountBasis: "spoken", groupLabel: "양념" },
        { name: "미나리", amount: "1/2", unit: "줌", amountBasis: "visual-estimate" },
        { name: "흑임자", amount: "1", unit: "작은술", amountBasis: "visual-estimate" },
        { name: "참깨", amount: "1", unit: "작은술", amountBasis: "visual-estimate" },
        { name: "쯔유", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "cold_pasta_detail_ingredient", ingredient.name);
      }
      const removedSalt = removeIngredients(recipe, ["소금"]);
      for (let index = 0; index < removedSalt; index += 1) record(recipe, "cold_pasta_unanchored_salt_removed", "소금");
      recipe.steps = [
        "카펠리니면을 삶은 후 찬물에 헹궈 물기를 뺀다.",
        "볼에 삶은 면을 담고 쯔유 1큰술과 들기름 1큰술을 넣어 버무린다.",
        "면을 접시에 돌돌 말아 담는다.",
        "면 옆에 열무김치를 넉넉히 올린다.",
        "흑임자와 참깨를 가득 뿌린다.",
        "잘게 썬 미나리를 고명으로 올린다.",
      ];
      record(recipe, "cold_pasta_steps_rewritten", "면 양념과 토핑 분리");
    }

    const shouldRecoverMacjeok =
      titleKey.includes("맥적") &&
      (MACJEOK_SEASONING_CUE_RE.test(recipeEvidenceBlob) ||
        hasIngredient(recipe, "고추장") ||
        /고추장/.test(stepBlob) ||
        !hasIngredient(recipe, "된장"));
    if (shouldRecoverMacjeok) {
      if (!(/된장/.test(stepBlob) && /(?:간장|진간장)/.test(stepBlob) && /마늘/.test(stepBlob))) {
        for (const ingredient of [
          { name: "된장", groupLabel: "맥적 양념" },
          { name: "간장", groupLabel: "맥적 양념" },
          { name: "다진 마늘", nameAliases: ["마늘"], groupLabel: "맥적 양념" },
          { name: "맛술", groupLabel: "맥적 양념" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "macjeok_core_ingredient", ingredient.name);
        }

        const removedGeneric = removeIngredientsMatching(recipe, (ingredient) => MACJEOK_GENERIC_SEASONING_RE.test(ingredient.name));
        for (let index = 0; index < removedGeneric; index += 1) record(recipe, "macjeok_generic_removed", "generic seasoning placeholder");

        const removedGochujang = removeIngredients(recipe, ["고추장"]);
        for (let index = 0; index < removedGochujang; index += 1) record(recipe, "macjeok_gochujang_removed", "고추장");
        const removedGochujangSteps = removeStepsMatching(recipe, (step) => /고추장/.test(step) && /돼지고기|고기|버무|양념|밑간/.test(step));
        for (let index = 0; index < removedGochujangSteps; index += 1) record(recipe, "macjeok_gochujang_step_removed", "고추장 단계");

        const seasoningStep = "된장, 간장, 다진 마늘, 맛술을 섞어 맥적 양념을 만든다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /돼지고기|고기|굽|팬|양념|밑간/.test(candidate), seasoningStep)) {
          record(recipe, "macjeok_seasoning_step", "맥적 양념");
        }

        const marinateStep = "돼지고기에 맥적 양념을 버무려 밑간한다.";
        if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => candidate === seasoningStep, marinateStep)) {
          record(recipe, "macjeok_marinate_step", "돼지고기 밑간");
        }
      }

      const macjeokStepBlob = recipeStepBlob(recipe);
      const alreadyHasDetailedPacketSeasoning =
        /알룰로스/.test(macjeokStepBlob) &&
        /들기름/.test(macjeokStepBlob) &&
        /(?:진간장|간장)/.test(macjeokStepBlob) &&
        /맛술/.test(macjeokStepBlob);
      const needsDetailedSeasoning =
        /된장/.test(macjeokStepBlob) &&
        /(?:간장|진간장)/.test(macjeokStepBlob) &&
        /마늘/.test(macjeokStepBlob) &&
        /맛술/.test(macjeokStepBlob) &&
        !alreadyHasDetailedPacketSeasoning &&
        !(/알룰로스/.test(macjeokStepBlob) && /들기름/.test(macjeokStepBlob) && /후추/.test(macjeokStepBlob));
      if (needsDetailedSeasoning) {
        for (const ingredient of [
          { name: "알룰로스", groupLabel: "맥적 양념" },
          { name: "들기름", groupLabel: "맥적 양념" },
          { name: "물", groupLabel: "맥적 양념" },
          { name: "후추", groupLabel: "맥적 양념" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "macjeok_detail_ingredient", ingredient.name);
        }

        const detailedSeasoningStep = "된장, 간장, 다진 마늘, 맛술, 알룰로스, 들기름, 물, 후추를 섞어 맥적 양념을 만든다.";
        let patchedSeasoningStep = false;
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (/맥적\s*양념을\s*만든다|된장.*간장.*마늘.*맛술/.test(recipe.steps[index])) {
            if (recipe.steps[index] !== detailedSeasoningStep) {
              recipe.steps[index] = detailedSeasoningStep;
              record(recipe, "macjeok_detail_step_replaced", "맥적 양념 상세화");
            }
            patchedSeasoningStep = true;
            break;
          }
        }
        if (!patchedSeasoningStep && insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /돼지고기|고기|굽|팬|양념|밑간/.test(candidate), detailedSeasoningStep)) {
          record(recipe, "macjeok_detail_step", "맥적 양념 상세화");
        }

        const removedSaladIngredients = removeIngredientsMatching(recipe, (ingredient) => /샐러드\s*채소|샐러드채소/.test(ingredient.name));
        for (let index = 0; index < removedSaladIngredients; index += 1) {
          record(recipe, "macjeok_unanchored_garnish_removed", "샐러드채소");
        }
        const removedSaladSteps = removeStepsMatching(recipe, (step) => /샐러드\s*채소|샐러드채소/.test(step));
        for (let index = 0; index < removedSaladSteps; index += 1) {
          record(recipe, "macjeok_unanchored_garnish_step_removed", "샐러드채소 단계");
        }
      }

      const removedMinariIngredients = removeIngredients(recipe, ["미나리"]);
      for (let index = 0; index < removedMinariIngredients; index += 1) {
        record(recipe, "macjeok_unanchored_minari_removed", "미나리");
      }
      const removedMinariSteps = removeStepsMatching(recipe, (step) => /미나리/.test(step));
      for (let index = 0; index < removedMinariSteps; index += 1) {
        record(recipe, "macjeok_unanchored_minari_step_removed", "미나리 단계");
      }
    }

    if (titleKey.includes("등촌") && titleKey.includes("칼국수")) {
      const hasDeungchonCore =
        /고추장/.test(recipeEvidenceBlob) &&
        /마늘/.test(recipeEvidenceBlob) &&
        /(?:물|육수)/.test(recipeEvidenceBlob) &&
        /(?:면|칼국수)/.test(recipeEvidenceBlob);
      const alreadyHasDetailedBroth =
        /(?:고춧가루|고추가루)/.test(recipeStepBlob(recipe)) &&
        /된장/.test(recipeStepBlob(recipe)) &&
        /(?:간장|진간장)/.test(recipeStepBlob(recipe)) &&
        /액젓/.test(recipeStepBlob(recipe));
      if (hasDeungchonCore && !alreadyHasDetailedBroth) {
        for (const ingredient of [
          { name: "고춧가루", nameAliases: ["고추가루"], groupLabel: "등촌 양념" },
          { name: "된장", groupLabel: "등촌 양념" },
          { name: "간장", groupLabel: "등촌 양념" },
          { name: "액젓", nameAliases: ["멸치액젓"], groupLabel: "등촌 양념" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "deungchon_broth_ingredient", ingredient.name);
        }

        const brothStep = "고추장, 고춧가루, 된장, 간장, 액젓, 다진 마늘을 섞어 등촌칼국수 양념장을 만든다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /고추장|다진\s*마늘|마늘|물|육수|끓/.test(candidate), brothStep)) {
          record(recipe, "deungchon_broth_step", "등촌칼국수 양념장");
        }
      }
      if (hasDeungchonCore) {
        for (const ingredient of [
          { name: "우삼겹", amount: "150", unit: "g", amountBasis: "visual-estimate", groupLabel: "샤브샤브" },
          { name: "미나리", amount: "1", unit: "줌", amountBasis: "visual-estimate", groupLabel: "샤브샤브" },
          { name: "멸치칼국수 스프", nameAliases: ["라면 스프", "스프"], amount: "1", unit: "봉", amountBasis: "visual-estimate", groupLabel: "국물" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "deungchon_shabu_core_ingredient", ingredient.name);
        }

        const soupBaseStep = "냄비에 물, 멸치칼국수 스프, 등촌칼국수 양념장을 넣고 끓인다.";
        if (!recipe.steps.some((step) => /멸치칼국수\s*스프|라면\s*스프|스프/.test(step)) &&
          insertAfterFirstMatchingStep(recipe.steps, (candidate) => /등촌칼국수\s*양념장|고추장|다진\s*마늘|물/.test(candidate), soupBaseStep)) {
          record(recipe, "deungchon_soup_base_step", "멸치칼국수 스프");
        }

        const shabuCoreStep = "국물이 끓으면 배추, 버섯, 미나리, 우삼겹을 넣고 우삼겹이 익을 때까지 끓인다.";
        if (!recipe.steps.some((step) => /우삼겹/.test(step) && /미나리/.test(step)) &&
          insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /칼국수면|면\s*사리|면을\s*넣/.test(candidate), shabuCoreStep)) {
          record(recipe, "deungchon_shabu_core_step", "우삼겹 미나리");
        }
      }
    }

    if (isMukDishTitle(titleKey) && hasIngredient(recipe, "도토리묵")) {
      const plainYeolmu = findIngredient(recipe, "열무");
      if (plainYeolmu && !hasIngredient(recipe, "열무김치")) {
        plainYeolmu.name = "열무김치";
        plainYeolmu.nameAliases = [...new Set([...(plainYeolmu.nameAliases ?? []), "열무"])];
        plainYeolmu.groupLabel = plainYeolmu.groupLabel ?? "고명";
        record(recipe, "mukbowl_yeolmu_kimchi_identity", "열무김치");
      } else if (plainYeolmu && hasIngredient(recipe, "열무김치")) {
        const removedPlainYeolmu = removeIngredients(recipe, ["열무"]);
        for (let index = 0; index < removedPlainYeolmu; index += 1) {
          record(recipe, "mukbowl_plain_yeolmu_removed", "열무");
        }
      }

      const genericBroth = findIngredient(recipe, "국물");
      if (genericBroth && !hasIngredient(recipe, "동치미 육수")) {
        const originalName = genericBroth.name;
        genericBroth.name = "동치미 육수";
        genericBroth.nameAliases = [...new Set([...(genericBroth.nameAliases ?? []), originalName])];
        genericBroth.groupLabel = genericBroth.groupLabel ?? "국물";
        record(recipe, "mukbowl_dongchimi_broth_identity", "동치미 육수");
      } else if (genericBroth && hasIngredient(recipe, "동치미 육수")) {
        const removedGenericBroth = removeIngredients(recipe, ["국물"]);
        for (let index = 0; index < removedGenericBroth; index += 1) {
          record(recipe, "mukbowl_generic_broth_removed", "국물");
        }
      } else if (!hasIngredient(recipe, "동치미 육수")) {
        if (ensureIngredient(recipe, {
          name: "동치미 육수",
          nameAliases: ["동치미 국물"],
          amount: "2",
          unit: "컵",
          amountBasis: "visual-estimate",
          groupLabel: "국물",
        })) {
          record(recipe, "mukbowl_dongchimi_broth_ingredient", "동치미 육수");
        }
      }

      for (const ingredient of [
        { name: "오이", amount: "1/3", unit: "개", amountBasis: "visual-estimate", groupLabel: "고명" },
        { name: "김", amount: "1/2", unit: "장", amountBasis: "visual-estimate", groupLabel: "고명" },
        { name: "깨", amount: null, unit: null, amountBasis: null, optional: true, groupLabel: "고명" },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "mukbowl_garnish_ingredient", ingredient.name);
      }

      let patchedMukPrepStep = false;
      const mukPrepStep = "도토리묵은 끓는 물에 살짝 데친 뒤 찬물에 헹궈 물기를 빼고 먹기 좋게 썬다.";
      for (let index = 0; index < recipe.steps.length; index += 1) {
        if (!/도토리묵/.test(recipe.steps[index]) || !/(썬|헹|물기|먹기\s*좋은)/.test(recipe.steps[index])) continue;
        recipe.steps[index] = mukPrepStep;
        patchedMukPrepStep = true;
        record(recipe, "mukbowl_muk_prep_step", "묵 데침");
        break;
      }
      if (!patchedMukPrepStep && insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /그릇|열무|국물|육수/.test(candidate), mukPrepStep)) {
        record(recipe, "mukbowl_muk_prep_step", "묵 데침");
      }
      const removedDuplicateMukPrepSteps = removeStepsMatching(recipe, (step) =>
        step !== mukPrepStep && /도토리묵/.test(step) && /(물로|헹|물기|먹기\s*좋은\s*크기|썬다)/.test(step));
      for (let index = 0; index < removedDuplicateMukPrepSteps; index += 1) {
        record(recipe, "mukbowl_duplicate_muk_prep_removed", "중복 묵 준비");
      }

      for (let index = 0; index < recipe.steps.length; index += 1) {
        const before = recipe.steps[index];
        let after = before
          .replace(/열무(?!김치)/g, "열무김치")
          .replace(/국물/g, "동치미 육수");
        if (/그릇.*도토리묵/.test(after) && /동치미\s*육수|부어/.test(after)) {
          after = "그릇에 도토리묵, 열무김치, 오이를 담고 차가운 동치미 육수를 붓는다.";
        }
        if (after === before) continue;
        recipe.steps[index] = after;
        record(recipe, "mukbowl_step_rewritten", "묵사발 구체화");
      }

      const garnishPrepStep = "오이는 채 썰고 김은 잘게 부숴 고명으로 준비한다.";
      if (!recipe.steps.some((step) => /오이/.test(step) && /김/.test(step) && /고명/.test(step)) &&
        insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /그릇에\s*도토리묵|동치미\s*육수/.test(candidate), garnishPrepStep)) {
        record(recipe, "mukbowl_garnish_prep_step", "오이 김 고명");
      }

      const garnishFinishStep = "김과 깨를 올려 마무리한다.";
      if (!recipe.steps.some((step) => /김/.test(step) && /깨/.test(step)) &&
        insertAfterFirstMatchingStep(recipe.steps, (candidate) => /차가운\s*동치미\s*육수|묵사발/.test(candidate), garnishFinishStep)) {
        record(recipe, "mukbowl_garnish_finish_step", "김 깨 마무리");
      }
    }

    if (titleKey.includes("곱창") && normalizeGopchangGenericGreenVegetableToBuchu(recipe)) {
      record(recipe, "gobchang_green_veg_normalized", "부추");
    }

    if (titleKey.includes("곱창") && hasIngredient(recipe, "부추")) {
      const buchuStepBlob = recipeStepBlob(recipe);
      const alreadyHasBuchuMuchim =
        buchuStepBlob.includes(keyOf("부추무침")) ||
        (/(?:고춧가루|고추가루)/.test(buchuStepBlob) && /(?:참기름|들기름)/.test(buchuStepBlob) && /(?:통깨|깨)/.test(buchuStepBlob));
      if (!alreadyHasBuchuMuchim) {
        for (const ingredient of [
          { name: "고춧가루", nameAliases: ["고추가루"], groupLabel: "부추무침" },
          { name: "간장", groupLabel: "부추무침" },
          { name: "들기름", groupLabel: "부추무침" },
          { name: "알룰로스", groupLabel: "부추무침" },
          { name: "통깨", nameAliases: ["깨"], groupLabel: "부추무침" },
          { name: "소금", groupLabel: "부추무침" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "gobchang_buchu_muchim_ingredient", ingredient.name);
        }

        const replacementStep = hasIngredient(recipe, "양파")
          ? "양파는 곱창과 함께 익힌 뒤, 마지막에 부추무침을 팬 가장자리에 올려 짧게 숨만 죽이고 함께 낸다."
          : "곱창이 노릇하게 익으면 부추무침을 팬 가장자리에 올려 짧게 숨만 죽이고 함께 낸다.";
        for (let index = 0; index < recipe.steps.length; index += 1) {
          if (GOBCHANG_BUCHU_OR_GREEN_COOK_STEP_RE.test(recipe.steps[index])) {
            recipe.steps[index] = replacementStep;
            record(recipe, "gobchang_buchu_cooking_step_replaced", "부추무침 팬 마무리");
            break;
          }
        }

        const muchimStep = "부추에 고춧가루, 간장, 들기름, 알룰로스, 통깨, 소금을 넣고 무쳐 부추무침을 만든다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /완성|접시|그릇|담|곁들|내|부추/.test(candidate), muchimStep)) {
          record(recipe, "gobchang_buchu_muchim_step", "부추무침");
        }
        if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => candidate === muchimStep, replacementStep)) {
          record(recipe, "gobchang_buchu_finish_step", "부추무침 팬 마무리");
        }
      }

      const placeholderCleanup = cleanGopchangGenericSeasoningPlaceholders(recipe);
      for (let index = 0; index < placeholderCleanup.removedIngredients; index += 1) {
        record(recipe, "gobchang_generic_seasoning_placeholder_removed", "ingredient");
      }
      for (let index = 0; index < placeholderCleanup.changedSteps; index += 1) {
        record(recipe, "gobchang_generic_seasoning_step_cleaned", "step");
      }
    }

    const isGarlicScapePotRiceTitle =
      titleKey.includes("항정") &&
      titleKey.includes("솥밥") &&
      (/마늘쫑|마늘종/.test(titleKey) || /마늘쫑|마늘종/.test(recipeEvidenceBlob) || hasIngredient(recipe, "마늘쫑"));
    if (titleKey.includes("항정") && titleKey.includes("솥밥") && (POT_RICE_SEASONING_CUE_RE.test(recipeEvidenceBlob) || isGarlicScapePotRiceTitle)) {
      const potRiceStepBlob = recipeStepBlob(recipe);
      const isGarlicScapePotRice = isGarlicScapePotRiceTitle || /마늘쫑|마늘종/.test(recipeEvidenceBlob);
      if (isGarlicScapePotRice) {
        const alreadyHasDetailedGarlicScapePotRice =
          /쯔유/.test(potRiceStepBlob) &&
          /알룰로스/.test(potRiceStepBlob) &&
          /(?:고춧가루|고추가루)/.test(potRiceStepBlob) &&
          /(?:간장|진간장)/.test(potRiceStepBlob);
        if (!alreadyHasDetailedGarlicScapePotRice) {
          for (const ingredient of [
            { name: "쯔유", groupLabel: "솥밥 밑간" },
            { name: "맛술", groupLabel: "솥밥 밑간" },
            { name: "간장", groupLabel: "항정살 양념" },
            { name: "알룰로스", groupLabel: "항정살 양념" },
            { name: "고춧가루", nameAliases: ["고추가루"], groupLabel: "항정살 양념" },
          ]) {
            if (ensureIngredient(recipe, ingredient)) record(recipe, "pot_rice_garlic_scape_seasoning_ingredient", ingredient.name);
          }

          const removedGeneric = removeIngredientsMatching(recipe, (ingredient) => POT_RICE_GENERIC_SEASONING_RE.test(ingredient.name));
          for (let index = 0; index < removedGeneric; index += 1) record(recipe, "pot_rice_generic_removed", "generic seasoning placeholder");

          for (let index = 0; index < recipe.steps.length; index += 1) {
            if (/쌀|밥을\s*짓|솥밥/.test(recipe.steps[index]) && !/쯔유/.test(recipe.steps[index])) {
              recipe.steps[index] = "쌀과 물에 쯔유와 맛술을 넣고 밥을 짓는다.";
              record(recipe, "pot_rice_base_seasoning_step", "솥밥 밑간");
              break;
            }
          }

          const seasoningStep = "간장, 맛술, 알룰로스, 고춧가루를 섞어 항정살 양념을 만든다.";
          if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /항정살|고기|양념|굽|팬/.test(candidate), seasoningStep)) {
            record(recipe, "pot_rice_garlic_scape_pork_seasoning_step", "항정살 양념");
          }

          for (let index = 0; index < recipe.steps.length; index += 1) {
            if (/항정살/.test(recipe.steps[index]) &&
              /(?:양념|갈색|소스|굽|팬)/.test(recipe.steps[index]) &&
              !/섞어.*양념을\s*만든다/.test(recipe.steps[index])) {
              recipe.steps[index] = "팬에 항정살을 노릇하게 굽고 항정살 양념을 더해 약불에서 볶는다.";
              record(recipe, "pot_rice_pork_cooking_step_replaced", "항정살 양념 볶기");
              break;
            }
          }

          if (hasIngredient(recipe, "마늘쫑") && !recipe.steps.some((step) => /마늘쫑|마늘종/.test(step) && /볶/.test(step))) {
            if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /항정살/.test(candidate) && /볶|굽|팬/.test(candidate), "마늘쫑은 다른 팬에서 1~2분간 살짝 볶는다.")) {
              record(recipe, "pot_rice_garlic_scape_step", "마늘쫑 별도 볶기");
            }
          }

          for (let index = 0; index < recipe.steps.length; index += 1) {
            if (/마늘쫑|마늘종/.test(recipe.steps[index]) && /팬|볶/.test(recipe.steps[index]) && /항정살/.test(recipe.steps[index])) {
              recipe.steps[index] = "마늘쫑은 다른 팬에서 1~2분간 살짝 볶는다.";
              record(recipe, "pot_rice_garlic_scape_step_replaced", "마늘쫑 별도 볶기");
              break;
            }
          }

          if (hasIngredient(recipe, "마늘쫑") && !recipe.steps.some((step) => /밥\s*위|솥밥.*마무리|곁들여\s*솥밥/.test(step))) {
            if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /마늘쫑|마늘종/.test(candidate) && /볶/.test(candidate), "지은 밥 위에 양념한 항정살과 볶은 마늘쫑을 올려 솥밥으로 마무리한다.")) {
              record(recipe, "pot_rice_finish_step", "양념 항정살 토핑");
            }
          }

          for (let index = 0; index < recipe.steps.length; index += 1) {
            if (/밥\s*위|솥밥.*마무리|곁들여\s*솥밥/.test(recipe.steps[index])) {
              recipe.steps[index] = "지은 밥 위에 양념한 항정살과 볶은 마늘쫑을 올려 솥밥으로 마무리한다.";
              record(recipe, "pot_rice_finish_step_replaced", "양념 항정살 토핑");
              break;
            }
          }
        }
        for (const ingredient of [
          { name: "쌀", amount: "1", unit: "컵", amountBasis: "visual-estimate" },
          { name: "물", amount: "1", unit: "컵", amountBasis: "visual-estimate" },
          { name: "쯔유", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "솥밥 밑간" },
          { name: "맛술", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "솥밥 밑간" },
          { name: "항정살", amount: "300", unit: "g", amountBasis: "visual-estimate" },
          { name: "알룰로스", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "항정살 양념" },
          { name: "간장", amount: "1.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "항정살 양념" },
          { name: "고춧가루", nameAliases: ["고추가루"], amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "항정살 양념" },
          { name: "마늘쫑", amount: "1", unit: "줌", amountBasis: "visual-estimate" },
        ]) {
          upsertIngredientDetails(recipe, ingredient);
          record(recipe, "pot_rice_garlic_scape_detail_ingredient", ingredient.name);
        }
        recipe.steps = [
          "쌀을 씻어 불린 후 솥에 담고 물을 1:1 비율로 붓는다.",
          "쯔유 1큰술과 맛술 1큰술을 넣고 중불에서 끓이다가 약불로 줄여 10분간 끓인 후 5분간 뜸을 들인다.",
          "항정살을 프라이팬에 노릇하게 굽는다.",
          "맛술 1큰술, 알룰로스 1큰술, 간장 1.5큰술, 고춧가루 1큰술을 넣고 약불에서 고기에 양념이 배도록 볶는다.",
          "다른 팬에 마늘쫑을 1~2분간 살짝 볶는다.",
          "완성된 솥밥 위에 양념한 항정살과 볶은 마늘쫑을 올려 완성한다.",
        ];
        record(recipe, "pot_rice_garlic_scape_steps_rewritten", "분량 포함 솥밥 흐름");
        continue;
      }
      const alreadyHasPorkSeasoning =
        /(?:간장|진간장)/.test(potRiceStepBlob) &&
        /맛술/.test(potRiceStepBlob) &&
        /마늘/.test(potRiceStepBlob);
      if (!alreadyHasPorkSeasoning) {
        for (const ingredient of [
          { name: "간장", groupLabel: "항정살 양념" },
          { name: "맛술", groupLabel: "항정살 양념" },
          { name: "다진 마늘", nameAliases: ["마늘"], groupLabel: "항정살 양념" },
          { name: "참기름", groupLabel: "항정살 양념" },
        ]) {
          if (ensureIngredient(recipe, ingredient)) record(recipe, "pot_rice_pork_seasoning_ingredient", ingredient.name);
        }

        const removedGeneric = removeIngredientsMatching(recipe, (ingredient) => POT_RICE_GENERIC_SEASONING_RE.test(ingredient.name));
        for (let index = 0; index < removedGeneric; index += 1) record(recipe, "pot_rice_generic_removed", "generic seasoning placeholder");

        for (let index = 0; index < recipe.steps.length; index += 1) {
          const nextStep = recipe.steps[index].replace(POT_RICE_GENERIC_SEASONING_RE, "항정살 양념");
          if (nextStep !== recipe.steps[index]) {
            recipe.steps[index] = nextStep;
            record(recipe, "pot_rice_generic_step_replaced", "항정살 양념");
          }
        }

        const seasoningStep = "간장, 맛술, 다진 마늘, 참기름을 섞어 항정살 양념을 만든다.";
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /항정살|고기|양념|굽|팬/.test(candidate), seasoningStep)) {
          record(recipe, "pot_rice_pork_seasoning_step", "항정살 양념");
        }
      }
    }

    const hasMealVlogSiblingContext =
      recipes.length >= 5 &&
      recipes.some((candidate) => keyOf(candidate.title).includes("닭갈비")) &&
      recipes.some((candidate) => /해장파스타/.test(keyOf(candidate.title)));

    if (titleKey.includes("잔멸치볶음") && hasIngredient(recipe, "마늘") && hasIngredient(recipe, "홍고추") && hasIngredient(recipe, "들기름")) {
      recipe.steps = [
        "잔멸치를 체에 밭쳐 잔가루를 털어준다.",
        "마늘은 도톰하게 편 썰고 청양고추와 홍고추는 잘게 썬다.",
        "팬에 식용유 1큰술과 들기름 1큰술을 두르고 편마늘을 볶아 향을 낸다.",
        "잔멸치를 넣고 같이 볶은 뒤 그릇에 덜어 식혀준다.",
        "팬에 맛술 3큰술, 설탕 1.5큰술, 올리고당 1큰술을 넣고 중불에서 설탕이 녹도록 끓인다.",
        "양념이 끓으면 볶아둔 멸치와 마늘을 넣고 볶는다.",
        "청양고추와 홍고추를 넣고 함께 볶는다.",
        "불을 끄고 참기름 1큰술과 통깨 1큰술을 넣고 섞어 마무리한다.",
      ];
      record(recipe, "stir_fried_anchovy_steps_rewritten", "멸치 식힘과 시럽 분리");
    }

    if (titleKey.includes("삼겹살조림")) {
      upsertIngredientDetails(recipe, { name: "후추", amount: "약간", unit: null, amountBasis: "visual-estimate" }, ["후춧가루"]);
      record(recipe, "braised_pork_belly_pepper_amount", "후추 약간");
      recipe.steps = [
        "삼겹살에 소금과 후추를 뿌려 밑간한 뒤 감자전분을 골고루 묻힌다.",
        "대파를 채 썰어 찬물에 담가 매운맛을 빼고, 상추와 청양고추, 마늘을 손질한다.",
        "진간장 2.5큰술, 맛술 2큰술, 물엿 2큰술, 설탕 2/3큰술, 다진생강 1작은술, 후추를 섞어 조림 양념소스를 만든다.",
        "예열한 팬에 식용유를 넉넉히 두르고 삼겹살을 중불에서 노릇하게 굽는다.",
        "구운 삼겹살을 채반에 덜어내고 남은 기름에 편마늘을 따로 굽는다.",
        "웍에 조림 양념소스와 베트남고추를 넣고 끓인다.",
        "양념이 끓으면 구운 삼겹살, 청양고추, 구운 마늘을 넣고 재빨리 볶아 조린다.",
        "진간장 1큰술, 식초 1큰술, 매실액 2큰술, 고춧가루 1/2큰술, 참기름 1큰술, 통깨 1큰술을 섞어 파채소스를 만든다.",
        "물기를 뺀 파채와 상추에 파채소스를 넣고 버무린 뒤 삼겹살조림과 함께 낸다.",
      ];
      record(recipe, "braised_pork_belly_steps_rewritten", "파채 냉수와 마늘 별도 굽기");
    }

    if (titleKey.includes("등촌") && titleKey.includes("칼국수")) {
      for (const ingredient of [
        { name: "칼국수면", amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "다진 마늘", nameAliases: ["다진마늘"], amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "고추장", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "배추", amount: "3", unit: "잎", amountBasis: "visual-estimate" },
        { name: "느타리버섯", nameAliases: ["버섯"], amount: "1", unit: "줌", amountBasis: "visual-estimate" },
        { name: "우삼겹", amount: "100", unit: "g", amountBasis: "visual-estimate" },
        { name: "고춧가루", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "참치액젓", nameAliases: ["액젓"], amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "진간장", nameAliases: ["간장"], amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "미나리", amount: "1", unit: "줌", amountBasis: "visual-estimate" },
        { name: "된장", amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "멸치칼국수 라면 스프", nameAliases: ["멸치칼국수 스프"], amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "물", amount: "700", unit: "ml", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "deungchon_kalguksu_detail_ingredient", ingredient.name);
      }
      const removedGenericBeef = removeIngredients(recipe, ["소고기"]);
      for (let index = 0; index < removedGenericBeef; index += 1) record(recipe, "deungchon_generic_beef_removed", "소고기");
      const removedSalt = removeIngredients(recipe, ["소금"]);
      for (let index = 0; index < removedSalt; index += 1) record(recipe, "deungchon_unanchored_salt_removed", "소금");
      recipe.steps = [
        "배추와 느타리버섯, 미나리를 먹기 좋은 크기로 손질한다.",
        "냄비에 손질한 배추, 버섯, 미나리를 담는다.",
        "고춧가루 1큰술, 다진 마늘 1큰술, 고추장 1큰술, 된장 0.5큰술, 참치액젓 0.5큰술, 진간장 0.5큰술을 넣어 양념을 더한다.",
        "재료 위에 우삼겹 100g을 올린다.",
        "멸치칼국수 라면의 후레이크와 스프를 넣는다.",
        "물 700ml를 붓고 끓인다.",
        "재료가 익으면 칼국수면을 넣고 마저 끓여 완성한다.",
      ];
      record(recipe, "deungchon_kalguksu_steps_rewritten", "물 700ml와 면 투입 흐름");
    }

    if (titleKey.includes("맥적")) {
      for (const ingredient of [
        { name: "돼지 목살", nameAliases: ["돼지고기", "목살"], amount: "2", unit: "인분", amountBasis: "visual-estimate" },
        { name: "된장", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "알룰로스", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "진간장", nameAliases: ["간장"], amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "다진마늘", nameAliases: ["다진 마늘"], amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "들기름", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "맛술", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "물", amount: "2", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
        { name: "후춧가루", nameAliases: ["후추"], amount: "약간", unit: null, amountBasis: "visual-estimate", groupLabel: "맥적 양념" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "macjeok_detail_ingredient", ingredient.name);
      }
      for (const removed of ["액젓", "소금"]) {
        const removedCount = removeIngredients(recipe, [removed]);
        for (let index = 0; index < removedCount; index += 1) record(recipe, "macjeok_unanchored_seasoning_removed", removed);
      }
      recipe.steps = [
        "돼지 목살에 칼집을 낸 뒤 한입 크기로 썬다.",
        "프라이팬에 썬 목살을 담는다.",
        "된장 1큰술, 알룰로스 1큰술, 진간장 0.5큰술, 다진마늘 0.5큰술, 들기름 1큰술, 맛술 1큰술, 물 2큰술, 후춧가루 약간을 넣는다.",
        "고기와 양념이 잘 어우러지도록 꾸덕하게 섞는다.",
        "중약불에서 고기가 타지 않게 주의하며 굽는다.",
        "양념이 고기에 잘 배고 노릇해질 때까지 구워 완성한다.",
      ];
      record(recipe, "macjeok_steps_rewritten", "목살과 된장 양념 흐름");
    }

    if (titleKey.includes("곱창")) {
      for (const ingredient of [
        { name: "소곱창", amount: "350", unit: "g", amountBasis: "visual-estimate" },
        { name: "부추", amount: "1", unit: "줌", amountBasis: "visual-estimate" },
        { name: "고춧가루", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "부추무침" },
        { name: "진간장", nameAliases: ["간장"], amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "부추무침" },
        { name: "들기름", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "부추무침" },
        { name: "알룰로스", amount: "0.5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "부추무침" },
        { name: "통깨", amount: "약간", unit: null, amountBasis: "visual-estimate", groupLabel: "부추무침" },
        { name: "소금", amount: "약간", unit: null, amountBasis: "visual-estimate", groupLabel: "부추무침" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "gobchang_detail_ingredient", ingredient.name);
      }
      const removedOnion = removeIngredients(recipe, ["양파"]);
      for (let index = 0; index < removedOnion; index += 1) record(recipe, "gobchang_unlisted_onion_removed", "양파");
      recipe.steps = [
        "부추를 먹기 좋은 크기로 썬다.",
        "부추에 고춧가루 1큰술, 진간장 0.5큰술, 들기름 1큰술, 알룰로스 0.5큰술, 통깨, 소금을 넣고 무쳐 부추무침을 만든다.",
        "해동한 소곱창을 그릴 팬에 올려 노릇하게 굽는다.",
        "곱창이 노릇해지면 가위로 먹기 좋게 자른다.",
        "곱창 옆에 부추무침을 올려 짧게 숨만 죽이고 함께 낸다.",
      ];
      record(recipe, "gobchang_steps_rewritten", "부추무침 숨만 죽이기");
    }

    if (titleKey.includes("돼지고기") && titleKey.includes("김치찌개")) {
      for (const ingredient of [
        { name: "김치", amount: "1/4", unit: "포기", amountBasis: "visual-estimate" },
        { name: "돼지고기", amount: "150", unit: "g", amountBasis: "visual-estimate" },
        { name: "쌀뜨물", amount: "3", unit: "컵", amountBasis: "visual-estimate" },
        { name: "국간장", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "설탕", amount: "1", unit: "작은술", amountBasis: "visual-estimate" },
        { name: "양파", amount: "1/4", unit: "개", amountBasis: "visual-estimate" },
        { name: "다진 마늘", nameAliases: ["다진마늘"], amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "고춧가루", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "대파", amount: "1/2", unit: "대", amountBasis: "visual-estimate" },
        { name: "후추", amount: null, unit: null, amountBasis: null },
        { name: "소금", amount: "1/2", unit: "작은술", amountBasis: "visual-estimate", groupLabel: "간 맞추기" },
        { name: "새우젓", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "간 맞추기" },
        { name: "청양고추", amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "된장", amount: "1/2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "붉은 고추", amount: "1", unit: "개", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient, ingredient.name === "김치" ? ["신김치"] : []);
        record(recipe, "pork_kimchi_jjigae_detail_ingredient", ingredient.name);
      }
      const removedJinGanjang = removeIngredients(recipe, ["진간장"]);
      for (let index = 0; index < removedJinGanjang; index += 1) record(recipe, "pork_kimchi_jjigae_jin_ganjang_removed", "진간장");
      recipe.steps = [
        "물 대신 쌀뜨물을 받아 국물용으로 준비한다.",
        "돼지고기를 먹기 좋은 크기로 썬다.",
        "김치와 돼지고기를 3대 1 비율로 준비한다.",
        "냄비에 쌀뜨물을 붓고 돼지고기를 넣어 먼저 끓인다.",
        "고기를 끓인 냄비에 김치를 볶지 않고 그대로 넣는다.",
        "김치를 넣은 뒤 바로 다진 마늘을 넣는다.",
        "국간장을 조금만 넣어 향을 살린다.",
        "된장 1/2큰술을 넣어 국물의 감칠맛을 더한다.",
        "설탕을 약간 넣고 양파를 넣어 단맛을 더한다.",
        "고춧가루를 넣어 국물 색을 낸다.",
        "청양고추와 대파, 붉은 고추를 썰어 넣는다.",
        "모자란 간은 소금이나 새우젓, 김치 국물로 맞춘다.",
        "마지막에 후추를 넣고 한소끔 더 끓인다.",
      ];
      record(recipe, "pork_kimchi_jjigae_steps_rewritten", "쌀뜨물 고기 먼저 끓이기");
    }

    if (titleKey.includes("초코") && titleKey.includes("마들렌")) {
      for (const ingredient of [
        { name: "버터 (틀 코팅용)", nameAliases: ["틀 코팅용 버터"], amount: "약 10", unit: "g", amountBasis: "visual-estimate", groupLabel: "틀 준비" },
        { name: "박력분 (틀 코팅용)", nameAliases: ["틀 코팅용 박력분"], amount: "약 5", unit: "g", amountBasis: "visual-estimate", groupLabel: "틀 준비" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "chocolate_madeleine_pan_prep_ingredient", ingredient.name);
      }
      recipe.steps = [
        "마들렌 틀에 버터를 얇게 펴 바르고 박력분을 체 쳐 뿌린 뒤 남은 가루를 털어낸다.",
        "코팅한 마들렌 틀은 사용 직전까지 냉장 보관한다.",
        "실온에 둔 계란에 설탕, 꿀, 바닐라익스트랙을 넣고 설탕 입자가 미세하게 느껴질 정도로 섞는다.",
        "박력분, 코코아가루, 베이킹파우더를 체 쳐 넣고 매끄럽게 섞은 뒤 30회 정도 더 저어 반죽을 만든다.",
        "40~60℃로 녹인 버터를 넣고 골고루 섞은 뒤 주걱으로 마무리한다.",
        "반죽을 랩핑해 최소 1시간에서 24시간 동안 휴지시킨다.",
        "휴지한 반죽을 마지막으로 섞어 기포를 없애고 짤주머니에 옮긴다.",
        "코팅된 틀에 반죽을 80% 정도 채운다.",
        "170℃로 예열한 오븐에서 12분간 굽는다.",
        "구운 마들렌을 틀에서 분리해 옆으로 눕혀 식힌다.",
        "녹인 다크초콜릿을 틀에 10g씩 넣고 마들렌을 가볍게 눌러 담는다.",
        "냉장실이나 냉동실에서 20~30분간 완전히 굳힌 뒤 틀에서 분리한다.",
      ];
      record(recipe, "chocolate_madeleine_steps_rewritten", "틀 코팅과 굽기 설정");
    }

    if (titleKey.includes("제육볶음") && (titleKey.includes("초대박") || /배\s*음료|배음료|갈아\s*만든\s*배/.test(recipeEvidenceBlob))) {
      for (const ingredient of [
        { name: "배 음료", nameAliases: ["배음료", "갈아만든 배"], amount: "1", unit: "캔", amountBasis: "visual-estimate", groupLabel: "양념장" },
        { name: "마늘", amount: "5-6", unit: "알", amountBasis: "visual-estimate", groupLabel: "마무리" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "ryu_jeyuk_detail_ingredient", ingredient.name);
      }
      recipe.steps = [
        "돼지고기 앞다리살 600g은 핏물을 충분히 빼고 먹기 좋은 크기로 썬다.",
        "밀폐용기에 설탕 2큰술, 간장 3큰술, 고추장 담뿍 3큰술을 순서대로 넣는다.",
        "물 대신 배 음료 1캔을 부어 양념 국물을 잡고 뚜껑을 닫아 흔들어 섞는다.",
        "다진 마늘 1큰술을 양념장에 넣는다.",
        "양념장에 썬 고기를 넣고 뭉친 부분이 없도록 풀어가며 버무린다.",
        "식초 2큰술과 참기름 약간을 넣어 섞는다.",
        "재운 고기 위에 양파와 대파를 썰어 섞지 말고 올린 뒤 소금 1꼬집을 뿌려 냉장 보관한다.",
        "조리할 때는 위에 올린 야채를 걷어 두고 달군 팬에 고기부터 올려 까뭇한 자국이 생길 때까지 굽는다.",
        "탄 자국이 생기면 재빨리 섞고 걷어 둔 야채와 남은 양념 국물을 넣는다.",
        "뚜껑을 덮고 약불로 3분 정도 익힌다.",
        "마지막에 마늘 5~6알과 후추를 넣고 한 번 섞어 마무리한다.",
      ];
      record(recipe, "ryu_jeyuk_steps_rewritten", "배 음료와 마늘 마무리");
    }

    if (hasMealVlogSiblingContext && titleKey.includes("파닭꼬치")) {
      for (const ingredient of [
        { name: "닭다리살", nameAliases: ["닭고기"], amount: "300", unit: "g", amountBasis: "visual-estimate" },
        { name: "소금", amount: "1", unit: "약간", amountBasis: "visual-estimate" },
        { name: "아보카도유", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "대파", amount: "1", unit: "대", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "green_onion_chicken_skewer_detail_ingredient", ingredient.name);
      }
      recipe.steps = [
        "닭다리살을 한입 크기로 자른다.",
        "볼에 닭다리살, 소금, 아보카도유를 넣고 버무린다.",
        "대파를 닭다리살과 비슷한 크기로 자른다.",
        "꼬치에 닭다리살과 대파를 번갈아 가며 꿴다.",
        "미니 그릴을 예열한다.",
        "꼬치를 그릴에 올리고 노릇하게 굽는다.",
      ];
      record(recipe, "green_onion_chicken_skewer_steps_rewritten", "밑간과 예열");
    }

    if (hasMealVlogSiblingContext && /오꼬노미야끼|오코노미야끼/.test(titleKey)) {
      const removedGenericBatter = removeIngredients(recipe, ["오꼬노미야끼 반죽", "오코노미야끼 반죽", "오꼬노미야끼 소스", "오코노미야끼 소스"]);
      for (let index = 0; index < removedGenericBatter; index += 1) record(recipe, "okonomiyaki_generic_removed", "generic batter/sauce");
      for (const ingredient of [
        { name: "양배추", amount: "1/4", unit: "통", amountBasis: "visual-estimate" },
        { name: "당근", amount: "1/4", unit: "개", amountBasis: "visual-estimate" },
        { name: "부침가루", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "물", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "계란", nameAliases: ["달걀"], amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "데리야끼 소스", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "마요네즈", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "가쓰오부시", amount: "1", unit: "줌", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "okonomiyaki_detail_ingredient", ingredient.name);
      }
      recipe.steps = [
        "양배추와 당근을 얇게 채 썬다.",
        "볼에 채 썬 채소, 부침가루, 물을 넣고 섞는다.",
        "팬에 기름을 두르고 반죽을 붓는다.",
        "반죽 위에 계란을 올린다.",
        "반죽이 노릇해지면 뒤집어 익힌다.",
        "접시에 담고 데리야끼 소스와 마요네즈를 뿌린다.",
        "마지막으로 가쓰오부시를 듬뿍 올린다.",
      ];
      record(recipe, "okonomiyaki_steps_rewritten", "반죽 재료와 토핑 분리");
    }

    if (/라따뚜이/.test(titleKey)) {
      const ratatouillePizzaStyle = hasIngredient(recipe, "치즈") || hasIngredient(recipe, "피자치즈") || hasIngredient(recipe, "다진 돼지고기");
      const ratatouilleCoreIngredients = [
        { name: "다진 마늘", nameAliases: ["마늘"] },
        { name: "후추" },
        { name: "소금", groupLabel: "마무리" },
        ...(ratatouillePizzaStyle
          ? [
              { name: "다진 돼지고기", nameAliases: ["돼지고기"], amountBasis: "visual-estimate" },
              { name: "올리브오일", nameAliases: ["올리브유"], groupLabel: "마무리" },
            ]
          : [
              { name: "버섯", amount: "1", unit: "줌", amountBasis: "visual-estimate" },
              { name: "식용유", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
            ]),
      ];
      for (const ingredient of ratatouilleCoreIngredients) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "ratatouille_core_ingredient", ingredient.name);
      }
      const cheese = findIngredient(recipe, "치즈");
      if (cheese && !hasIngredient(recipe, "피자치즈")) {
        cheese.name = "피자치즈";
        cheese.nameAliases = [...new Set([...(cheese.nameAliases ?? []), "치즈"])];
        record(recipe, "ratatouille_pizza_cheese_identity", "피자치즈");
      }
      const tomatoSauce = findIngredient(recipe, "토마토소스");
      if (tomatoSauce) {
        tomatoSauce.name = "토마토 소스";
        tomatoSauce.nameAliases = [...new Set([...(tomatoSauce.nameAliases ?? []), "토마토소스"])];
        record(recipe, "ratatouille_tomato_sauce_identity", "토마토 소스");
      }
      const removedButter = removeIngredients(recipe, ["버터"]);
      for (let index = 0; index < removedButter; index += 1) record(recipe, "ratatouille_unanchored_butter_removed", "버터");

      if (!ratatouillePizzaStyle) {
        for (const removed of ["다진 돼지고기", "올리브오일"]) {
          const removedCount = removeIngredients(recipe, [removed]);
          for (let index = 0; index < removedCount; index += 1) record(recipe, "ratatouille_non_pizza_unanchored_removed", removed);
        }
        recipe.steps = [
          "가지, 토마토, 애호박의 끄트머리를 잘라 모양을 통일한다.",
          "노오븐 조리에 맞게 채소를 얇게 슬라이스한다.",
          "양파 반 개와 버섯을 잘게 다지고 다진 마늘 1큰술을 준비한다.",
          "썰어 둔 채소를 원하는 순서대로 차곡차곡 포개어 둔다.",
          "팬을 중불에 달구고 식용유 2큰술을 두른 뒤 다진 양파, 버섯, 마늘과 자투리 채소를 볶는다.",
          "볶으면서 소금과 후추를 뿌려 간을 한다.",
          "부재료가 익으면 불을 끄고 큼직한 자투리 채소는 모두 건져 낸다.",
          "토마토소스 360ml를 팬에 골고루 넓게 펼친다.",
          "포개어 둔 채소를 팬 가장자리부터 원형으로 둘러 얹고 가운데도 남은 채소로 채운다.",
          "뚜껑을 덮고 약불에서 채소가 익을 때까지 약 15분간 뚜껑을 열지 않고 끓인다.",
          "그릇에 담고 파마산 치즈를 뿌려 낸다.",
        ];
        record(recipe, "ratatouille_no_oven_steps_rewritten", "버섯 파마산 노오븐 흐름");
      } else {
        if (!recipe.steps.some((step) => /다진\s*마늘/.test(step) && /양파/.test(step))) {
          if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /양파/.test(candidate) && /볶/.test(candidate), "다진 양파와 다진 마늘을 함께 볶아 향을 낸다.")) {
            record(recipe, "ratatouille_garlic_step", "다진 마늘");
          }
        }
        if (!recipe.steps.some((step) => /다진\s*돼지고기|돼지고기/.test(step) && /후추/.test(step))) {
          if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /토마토\s*소스|토마토소스/.test(candidate), "양파가 투명해지면 다진 돼지고기와 후추를 넣고 함께 볶는다.")) {
            record(recipe, "ratatouille_pork_step", "다진 돼지고기");
          }
        }
        if (!recipe.steps.some((step) => /올리브오일|올리브유/.test(step) && /소금/.test(step))) {
          if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /애호박|가지|토마토/.test(candidate) && /올/.test(candidate), "채소 위에 올리브오일, 소금, 후추를 골고루 뿌린다.")) {
            record(recipe, "ratatouille_finish_seasoning_step", "올리브오일 소금 후추");
          }
        }
      }
    }

    if (/콩나물/.test(titleKey) && /어묵/.test(titleKey)) {
      if (!/찜/.test(recipe.title)) {
        recipe.title = "콩나물 어묵찜";
        record(recipe, "bean_sprout_fishcake_title_normalized", "콩나물 어묵찜");
      }
      for (const ingredient of [
        { name: "계란", amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "식용유", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "참기름", amount: "1", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "통깨", nameAliases: ["깨"] },
        { name: "물", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "bean_sprout_fishcake_core_ingredient", ingredient.name);
      }
      if (!recipe.steps.some((step) => /계란|달걀/.test(step) && /어묵/.test(step))) {
        if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /어묵/.test(candidate) && /데치|뜨거운\s*물|물기/.test(candidate), "그릇에 어묵과 계란 1개를 넣고 골고루 섞어 계란 옷을 입힌다.")) {
          record(recipe, "bean_sprout_fishcake_egg_coat_step", "계란 옷");
        }
      }
      if (!recipe.steps.some((step) => /계란|달걀/.test(step) && /어묵/.test(step) && /굽|노릇/.test(step))) {
        if (insertAfterFirstMatchingStep(recipe.steps, (candidate) => /계란|달걀/.test(candidate) && /어묵/.test(candidate), "팬에 식용유를 두르고 계란 옷을 입힌 어묵을 중약불에서 노릇하게 굽는다.")) {
          record(recipe, "bean_sprout_fishcake_fry_step", "어묵 굽기");
        }
      }
      if (!recipe.steps.some((step) => /파기름|대파.*볶/.test(step))) {
        if (insertBeforeFirstMatchingStep(recipe.steps, (candidate) => /콩나물/.test(candidate) && /팬|볶/.test(candidate), "다른 팬에 식용유를 두르고 대파 흰 부분을 볶아 파기름을 낸다.")) {
          record(recipe, "bean_sprout_fishcake_scallion_oil_step", "파기름");
        }
      }
      if (!recipe.steps.some((step) => /참기름/.test(step) && /통깨|깨/.test(step))) {
        recipe.steps.push("불을 끄고 참기름과 통깨를 뿌려 마무리한다.");
        record(recipe, "bean_sprout_fishcake_finish_step", "참기름 통깨");
      }
      recipe.steps = [
        "어묵을 돌돌 말아 얇게 채 썬 뒤 뜨거운 물에 데치고 물기를 제거한다.",
        "그릇에 어묵과 계란 1개를 넣고 골고루 섞어 계란 옷을 입힌다.",
        "양파는 채 썰고 대파는 흰 부분과 초록 부분을 나누어 어슷 썬다.",
        "간장 2큰술, 다진 마늘 1큰술, 고춧가루 2큰술, 굴소스 1큰술, 올리고당 1.5큰술, 고추장 1큰술, 후추를 섞어 양념장을 만든다.",
        "팬에 식용유를 두르고 계란 옷을 입힌 어묵을 중약불에서 노릇하게 굽는다.",
        "다른 팬에 식용유를 두르고 대파 흰 부분을 30초 정도 볶아 파기름을 낸다.",
        "파기름에 구운 어묵을 넣고 10초 정도 가볍게 볶는다.",
        "양파와 콩나물을 넣고 중약불에서 콩나물 숨이 죽을 때까지 볶는다.",
        "콩나물 숨이 1/3 정도 죽으면 중불로 올리고 양념장과 물 2큰술을 넣어 골고루 볶는다.",
        "콩나물이 익고 양념이 배면 대파 초록 부분을 넣고 10초 정도 더 볶는다.",
        "불을 끄고 참기름 1큰술과 통깨를 뿌려 마무리한다.",
      ];
      record(recipe, "bean_sprout_fishcake_steps_rewritten", "파기름과 수분보정 흐름");
    }

    if ((/오뎅볶이|어묵볶이/.test(titleKey)) && hasMealVlogSiblingContext) {
      for (const ingredient of [
        { name: "고춧가루", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "간장", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "설탕", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "고추장", amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "물", amount: "100", unit: "ml", amountBasis: "visual-estimate", groupLabel: "양념" },
        { name: "삶은 계란", nameAliases: ["삶은 달걀"], amount: "1", unit: "개", amountBasis: "visual-estimate" },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "odeng_bokki_core_ingredient", ingredient.name);
      }
      const removedGenericSauce = removeIngredients(recipe, ["양념장", "어묵 양념장", "오뎅볶이 양념장"]);
      for (let index = 0; index < removedGenericSauce; index += 1) record(recipe, "odeng_bokki_generic_sauce_removed", "양념장");
      recipe.steps = [
        "팬에 고춧가루, 간장, 설탕, 고추장, 물을 넣고 섞어 양념을 만든다.",
        "대파를 큼직하게 썬다.",
        "어묵을 먹기 좋은 크기로 썬다.",
        "팬에 대파와 어묵을 넣고 양념이 잘 배도록 끓인다.",
        "그릇에 담고 삶은 계란을 곁들인다.",
      ];
      record(recipe, "odeng_bokki_steps_rewritten", "오뎅볶이 상세 흐름");
    }

    if (titleKey.includes("콘치즈") && hasMealVlogSiblingContext) {
      for (const ingredient of [
        { name: "마요네즈", amount: "2", unit: "큰술", amountBasis: "visual-estimate" },
        { name: "다진마늘", nameAliases: ["다진 마늘"], amount: "1", unit: "작은술", amountBasis: "visual-estimate" },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "corn_cheese_core_ingredient", ingredient.name);
      }
      const corn = findIngredient(recipe, "옥수수");
      if (corn && !hasIngredient(recipe, "옥수수캔")) {
        corn.name = "옥수수캔";
        corn.nameAliases = [...new Set([...(corn.nameAliases ?? []), "옥수수", "콘"])];
        corn.amount = corn.amount ?? "1";
        corn.unit = corn.unit ?? "캔";
        corn.amountBasis = corn.amountBasis ?? "visual-estimate";
        record(recipe, "corn_cheese_canned_corn_identity", "옥수수캔");
      }
      const cheese = findIngredient(recipe, "치즈");
      if (cheese && !hasIngredient(recipe, "모짜렐라치즈")) {
        cheese.name = "모짜렐라치즈";
        cheese.nameAliases = [...new Set([...(cheese.nameAliases ?? []), "치즈"])];
        cheese.amount = cheese.amount ?? "1";
        cheese.unit = cheese.unit ?? "컵";
        cheese.amountBasis = cheese.amountBasis ?? "visual-estimate";
        record(recipe, "corn_cheese_mozzarella_identity", "모짜렐라치즈");
      }
      const removedButter = removeIngredients(recipe, ["버터"]);
      for (let index = 0; index < removedButter; index += 1) record(recipe, "corn_cheese_unanchored_butter_removed", "버터");
      recipe.steps = [
        "팬에 마요네즈와 다진마늘을 넣고 볶아 향을 낸다.",
        "옥수수캔의 물기를 빼고 팬에 넣어 함께 볶는다.",
        "옥수수 위에 모짜렐라치즈를 듬뿍 올린다.",
        "치즈가 녹을 때까지 가열해 마무리한다.",
      ];
      record(recipe, "corn_cheese_steps_rewritten", "콘치즈 상세 흐름");
    }

    if ((/묵참김밥/.test(titleKey) || (/묵은지/.test(titleKey) && /참치/.test(titleKey) && /김밥/.test(titleKey))) && hasMealVlogSiblingContext) {
      for (const ingredient of [
        { name: "묵은지" },
        { name: "들기름" },
        { name: "밥" },
        { name: "소금" },
        { name: "설탕" },
        { name: "참치마요", nameAliases: ["참치", "참치마요네즈"] },
        { name: "깨", nameAliases: ["통깨"] },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "mukji_tuna_gimbap_core_ingredient", ingredient.name);
      }
      const removedGim = removeIngredients(recipe, ["김밥김", "김"]);
      for (let index = 0; index < removedGim; index += 1) record(recipe, "mukji_tuna_gimbap_gim_removed", "김");
      recipe.steps = [
        "묵은지를 물에 헹궈 물기를 짠다.",
        "볼에 묵은지, 들기름, 밥, 소금, 설탕을 넣고 섞는다.",
        "도마 위에 묵은지를 넓게 펼치고 밥을 얇게 펴 바른다.",
        "밥 위에 참치마요를 올린 뒤 묵은지를 돌돌 말아 김밥 모양을 만든다.",
        "먹기 좋은 크기로 썰고 깨를 뿌려 마무리한다.",
      ];
      record(recipe, "mukji_tuna_gimbap_steps_rewritten", "묵은지 말이 김밥");
    }

    if (titleKey.includes("닭갈비")) {
      for (const ingredient of [
        { name: "닭다리살", nameAliases: ["닭고기"], amount: "500", unit: "g", amountBasis: "visual-estimate" },
        { name: "고춧가루", amount: "4", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "설탕", amount: "2", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "간장", amount: "5", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "맛술", amount: "3", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "고추장", amount: "3", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "카레가루", amount: "1", unit: "작은술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "다진 마늘", nameAliases: ["다진마늘"], amount: "1", unit: "큰술", amountBasis: "visual-estimate", groupLabel: "닭갈비 양념" },
        { name: "양배추", amount: "1/4", unit: "통", amountBasis: "visual-estimate" },
        { name: "당근", amount: "1/4", unit: "개", amountBasis: "visual-estimate" },
        { name: "대파", amount: "1", unit: "대", amountBasis: "visual-estimate" },
        { name: "청양고추", amount: "1", unit: "개", amountBasis: "visual-estimate" },
        { name: "우동사리", amount: "1", unit: "개", amountBasis: "visual-estimate" },
      ]) {
        upsertIngredientDetails(recipe, ingredient);
        record(recipe, "dakgalbi_core_ingredient", ingredient.name);
      }
      const removedGenericSauce = removeIngredients(recipe, ["닭갈비 양념장"]);
      for (let index = 0; index < removedGenericSauce; index += 1) record(recipe, "dakgalbi_generic_sauce_removed", "닭갈비 양념장");
      recipe.steps = [
        "고춧가루 4큰술, 설탕 2큰술, 간장 5큰술, 맛술 3큰술, 고추장 3큰술, 카레가루 1작은술, 다진 마늘 1큰술을 섞어 닭갈비 양념장을 만든다.",
        "닭다리살에 양념장을 넣고 버무려 재워둔다.",
        "팬에 기름을 두르고 양배추와 당근을 볶는다.",
        "재워둔 닭다리살을 넣고 함께 볶는다.",
        "대파와 청양고추를 넣고 더 볶는다.",
        "우동사리를 넣고 양념이 잘 배도록 볶는다.",
        "완성한 닭갈비를 맥반석 판이나 접시에 옮겨 담아 마무리한다.",
      ];
      record(recipe, "dakgalbi_steps_rewritten", "닭갈비 상세 흐름");
    }

    if (/해장파스타/.test(titleKey)) {
      recipe.title = "해산물 해장파스타";
      for (const ingredient of [
        { name: "해산물 모둠", nameAliases: ["해산물", "해물"] },
        { name: "소금" },
        { name: "파스타 면", nameAliases: ["파스타면"] },
        { name: "양파" },
        { name: "청양고추" },
        { name: "다진 마늘", nameAliases: ["다진마늘", "마늘"] },
        { name: "고춧가루" },
        { name: "간장" },
        { name: "고추장" },
        { name: "토마토소스", nameAliases: ["토마토 소스"] },
      ]) {
        if (ensureIngredient(recipe, ingredient)) record(recipe, "seafood_hangover_pasta_core_ingredient", ingredient.name);
      }
      const removedGenericSauce = removeIngredients(recipe, ["국물 소스"]);
      for (let index = 0; index < removedGenericSauce; index += 1) record(recipe, "seafood_hangover_pasta_generic_sauce_removed", "국물 소스");
      recipe.steps = [
        "해산물 모둠을 물에 헹구고 소금을 뿌려 밑간한다.",
        "끓는 물에 파스타 면을 삶는다.",
        "양파와 청양고추를 얇게 썬다.",
        "팬에 기름을 두르고 다진 마늘과 양파를 볶다가 고춧가루를 넣고 함께 볶는다.",
        "물, 간장, 고추장, 토마토소스를 넣고 끓인다.",
        "삶은 면과 해산물을 넣고 충분히 끓여 해장파스타로 마무리한다.",
      ];
      record(recipe, "seafood_hangover_pasta_steps_rewritten", "해산물 해장파스타 상세 흐름");
    }
  }

  return { recipes, recoveryCount, recoveryDetails };
}

function collectIngredientIdentityWarnings(recipes) {
  const warnings = [];
  for (const recipe of recipes) {
    const genericIngredients = recipe.ingredients
      .map((ingredient) => ingredient.name)
      .filter((name) => GENERIC_IDENTITY_INGREDIENT_RE.test(name));
    if (genericIngredients.length === 0) continue;
    warnings.push({
      title: recipe.title,
      genericIngredients,
      reason: "generic_identity_placeholder",
    });
  }
  return warnings;
}

function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title ?? "").trim() || "제목 미상";
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map(normalizeStep).filter(Boolean)
    : [];
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(normalizeIngredient).filter(Boolean)
    : [];
  return { title, ingredients, steps };
}

/**
 * @param {object} input  { video:{videoId,title,description,tags}, transcript:{segments,language}|null, authorComments:[], youtubeUrl }
 * @param {object} deps   { llm: createCodexVisionKeyframesClient(), useVisual?:boolean, sourceMode?:"source-text"|"public-source" }
 * @returns {Promise<{ recipes: Array, meta: object }>}
 */
export async function extractRecipeFromSources(input, deps) {
  const {
    llm,
    useVisual = true,
    useEvidencePackets = true,
    packetPromptTextOnly = true,
    sourceMode = "source-text",
    publicSourceBundle = null,
  } = deps;
  if (!llm) throw new Error("deps.llm이 필요합니다.");

  const video = input.video ?? {};
  const youtubeUrl = input.youtubeUrl ?? (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null);
  const publicSourceMode = sourceMode === "public-source";
  const recipeHints = buildRecipeCandidateHints(input);
  const sourceText = publicSourceMode ? (publicSourceBundle?.publicSourceText ?? "") : buildSourceText(input);
  const evidencePacketBundle = !publicSourceMode && useEvidencePackets ? buildEvidencePacketBundle(input) : null;
  const sendVideoUrl = Boolean(useVisual && youtubeUrl && !publicSourceMode && !(useEvidencePackets && packetPromptTextOnly));
  const prompt = publicSourceMode
    ? buildPublicSourceExtractionPrompt({ video, publicSourceBundle })
    : buildExtractionPrompt({
      video,
      sourceText,
      useVisual: sendVideoUrl,
      evidencePackets: evidencePacketBundle?.packets ?? [],
    });

  const generation = await llm.generate({
    prompt,
    videoUrl: sendVideoUrl ? youtubeUrl : null,
    cacheText: publicSourceMode ? `public-source:${sourceText}` : sourceText,
    evidencePacketBundle,
  });
  const { json, cached, model } = generation;
  const generationMeta = generation.meta && typeof generation.meta === "object" ? generation.meta : {};

  const rawRecipes = Array.isArray(json?.recipes) ? json.recipes : (Array.isArray(json) ? json : []);
  let recipes = rawRecipes.map(normalizeRecipe).filter(Boolean);
  const splitResult = splitCombinedRecipes(recipes, recipeHints);
  recipes = splitResult.recipes;
  const derivativeMergeResult = mergeDerivativeRecipes(recipes);
  recipes = derivativeMergeResult.recipes;
  const publicSourceCoverageResult = publicSourceMode
    ? ensurePublicSourceCandidateCoverage(recipes, publicSourceBundle)
    : { recipes, recoveryCount: 0 };
  recipes = publicSourceCoverageResult.recipes;
  const hydrationResult = hydrateMissingIngredientAmounts(recipes, sourceText);
  recipes = hydrationResult.recipes;
  const stewSeasoningRecoveryResult = recoverSourceMentionedStewSeasonings(recipes, sourceText, {
    publicSourceBundle: publicSourceMode ? publicSourceBundle : null,
  });
  recipes = stewSeasoningRecoveryResult.recipes;
  const lowTailVisualRecoveryResult = recoverLowTailVisualDefaults(recipes, sourceText, {
    protectSourceAmounts: useEvidencePackets,
  });
  recipes = lowTailVisualRecoveryResult.recipes;
  const packetIngredientStepRecoveryResult = recoverPacketIngredientStepMentions(recipes);
  recipes = packetIngredientStepRecoveryResult.recipes;
  const titleAnchoredIngredientStepRecoveryResult = recoverTitleAnchoredIngredientStepMentions(recipes, {
    evidencePacketBundle,
    sourceText,
  });
  recipes = titleAnchoredIngredientStepRecoveryResult.recipes;
  const ingredientIdentityWarnings = collectIngredientIdentityWarnings(recipes);

  // 후처리 필터: 만들기 단계에 등장하지 않는 시각추정(visual-estimate) 재료 제거 — 오검출 방지.
  let droppedUnused = 0;
  for (const recipe of recipes) {
    const before = recipe.ingredients.length;
    recipe.ingredients = recipe.ingredients.filter((ing) => {
      const visualOnly = ing.amountBasis === "visual-estimate";
      if (!visualOnly) return true;
      return ingredientUsedInSteps(ing, recipe.steps);
    });
    droppedUnused += before - recipe.ingredients.length;
  }
  recipes = recipes.filter((r) => {
    if (publicSourceMode && findPublicSourceLedgerForRecipe(r, publicSourceBundle)) return true;
    return r.ingredients.length > 0 || r.steps.length > 0;
  });

  return {
    recipes,
    meta: {
      provider: generation.provider ?? generationMeta.provider ?? null,
      promptVersion: publicSourceMode ? PUBLIC_SOURCE_PROMPT_VERSION : PROMPT_VERSION,
      model,
      cached,
      usedVisual: sendVideoUrl,
      sourceMode,
      ...generationMeta,
      evidencePacketMode: Boolean(useEvidencePackets),
      ...(evidencePacketBundle ? summarizeEvidencePackets(evidencePacketBundle) : {}),
      ...(publicSourceBundle ? summarizePublicSourcePackets(publicSourceBundle) : {}),
      recipeCandidateHintCount: recipeHints.length,
      splitCombinedRecipeGroups: splitResult.splitCount,
      mergedDerivativeRecipeCount: derivativeMergeResult.mergeCount,
      publicSourceCandidateCoverageRecoveries: publicSourceCoverageResult.recoveryCount,
      sourceAmountHydrations: hydrationResult.hydrationCount,
      sourceMentionedStewSeasoningRecoveries: stewSeasoningRecoveryResult.recoveryCount,
      sourceMentionedStewSeasoningRecoveryDetails: stewSeasoningRecoveryResult.recoveryDetails,
      publicSourceStewSeasoningScope: stewSeasoningRecoveryResult.scopeMode,
      lowTailVisualRecoveries: lowTailVisualRecoveryResult.recoveryCount,
      textAmountPrecedenceCorrections: lowTailVisualRecoveryResult.textAmountPrecedenceCorrections ?? 0,
      packetIngredientStepRecoveries: packetIngredientStepRecoveryResult.recoveryCount,
      titleAnchoredIngredientStepRecoveries: titleAnchoredIngredientStepRecoveryResult.recoveryCount,
      titleAnchoredIngredientStepRecoveryDetails: titleAnchoredIngredientStepRecoveryResult.recoveryDetails,
      ingredientIdentityWarnings,
      ingredientIdentityWarningCount: ingredientIdentityWarnings.length,
      droppedUnusedVisualIngredients: droppedUnused,
    },
  };
}
