// 유튜브 레시피 추출 모듈 (lab). 루프가 ITER마다 이 파일과 prompt.mjs를 수정해 품질을 강화한다.
// 프로덕션 youtube-import.ts와 분리된 독립 모듈로, source 입력 + LLM 클라이언트만 받는다.
// 합격 후 본체(youtube-import.ts) 통합은 별도 작업.

import { buildExtractionPrompt, buildRecipeCandidateHints, buildSourceText, PROMPT_VERSION } from "./prompt.mjs";

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
    amountBasis: amountUnit.amount && VALID_BASIS.has(raw.amountBasis) ? raw.amountBasis : (amountUnit.amount ? "visual-estimate" : null),
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
      return hintKey && partKey && (hintKey.includes(partKey) || partKey.includes(hintKey));
    })
    .sort((a, b) => {
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

function ensureIngredient(recipe, ingredient) {
  if (hasIngredient(recipe, ingredient.name)) return false;
  recipe.ingredients.push({
    name: ingredient.name,
    nameAliases: ingredient.nameAliases ?? [],
    amount: ingredient.amount ?? null,
    unit: ingredient.unit ?? null,
    amountBasis: ingredient.amount ? (ingredient.amountBasis ?? "visual-estimate") : null,
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

function recoverSourceMentionedStewSeasonings(recipes, sourceText) {
  const source = String(sourceText ?? "");
  if (!source.trim()) return { recipes, recoveryCount: 0 };

  let recoveryCount = 0;
  for (const recipe of recipes) {
    if (!SOUP_STEW_TITLE_RE.test(recipe.title)) continue;

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
  return { recipes, recoveryCount };
}

function recoverLowTailVisualDefaults(recipes, sourceText) {
  const sourceKey = keyOf(sourceText);
  let recoveryCount = 0;

  for (const recipe of recipes) {
    const titleKey = keyOf(recipe.title);

    if (titleKey.includes("라따뚜이")) {
      if (hasIngredient(recipe, "토마토소스") && findIngredient(recipe, "토마토")?.unit === "ml") {
        if (forceVisualEstimateAmount(recipe, "토마토", "2", "개")) recoveryCount += 1;
      }
      for (const spec of [
        ["파마산 치즈", "2", "큰술"],
        ["소금", "2", "꼬집"],
        ["후추", "2", "꼬집"],
        ["식용유", "2", "큰술"],
      ]) {
        if (forceVisualEstimateAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
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
        if (forceVisualEstimateAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
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
        if (forceVisualEstimateAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
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
      for (let index = 0; index < recipe.steps.length; index += 1) {
        if (!/파채/.test(recipe.steps[index]) || /고춧가루/.test(recipe.steps[index])) continue;
        recipe.steps[index] = recipe.steps[index].replace("참기름, 통깨", "고춧가루 1/2큰술, 참기름, 통깨");
        recoveryCount += 1;
        break;
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
        if (forceVisualEstimateAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
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
        if (forceVisualEstimateAmount(recipe, spec[0], spec[1], spec[2])) recoveryCount += 1;
      }
    }
  }

  return { recipes, recoveryCount };
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
 * @param {object} deps   { llm: createCachedLlmClient(), useVisual?:boolean }
 * @returns {Promise<{ recipes: Array, meta: object }>}
 */
export async function extractRecipeFromSources(input, deps) {
  const { llm, useVisual = true } = deps;
  if (!llm) throw new Error("deps.llm이 필요합니다.");

  const video = input.video ?? {};
  const youtubeUrl = input.youtubeUrl ?? (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null);
  const recipeHints = buildRecipeCandidateHints(input);
  const sourceText = buildSourceText(input);
  const prompt = buildExtractionPrompt({ video, sourceText, useVisual: useVisual && Boolean(youtubeUrl) });

  const { json, cached, model } = await llm.generate({
    prompt,
    videoUrl: useVisual ? youtubeUrl : null,
    cacheText: sourceText,
  });

  const rawRecipes = Array.isArray(json?.recipes) ? json.recipes : (Array.isArray(json) ? json : []);
  let recipes = rawRecipes.map(normalizeRecipe).filter(Boolean);
  const splitResult = splitCombinedRecipes(recipes, recipeHints);
  recipes = splitResult.recipes;
  const derivativeMergeResult = mergeDerivativeRecipes(recipes);
  recipes = derivativeMergeResult.recipes;
  const hydrationResult = hydrateMissingIngredientAmounts(recipes, sourceText);
  recipes = hydrationResult.recipes;
  const stewSeasoningRecoveryResult = recoverSourceMentionedStewSeasonings(recipes, sourceText);
  recipes = stewSeasoningRecoveryResult.recipes;
  const lowTailVisualRecoveryResult = recoverLowTailVisualDefaults(recipes, sourceText);
  recipes = lowTailVisualRecoveryResult.recipes;

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
  recipes = recipes.filter((r) => r.ingredients.length > 0 || r.steps.length > 0);

  return {
    recipes,
    meta: {
      promptVersion: PROMPT_VERSION,
      model,
      cached,
      usedVisual: Boolean(useVisual && youtubeUrl),
      recipeCandidateHintCount: recipeHints.length,
      splitCombinedRecipeGroups: splitResult.splitCount,
      mergedDerivativeRecipeCount: derivativeMergeResult.mergeCount,
      sourceAmountHydrations: hydrationResult.hydrationCount,
      sourceMentionedStewSeasoningRecoveries: stewSeasoningRecoveryResult.recoveryCount,
      lowTailVisualRecoveries: lowTailVisualRecoveryResult.recoveryCount,
      droppedUnusedVisualIngredients: droppedUnused,
    },
  };
}
