// 유튜브 레시피 추출 모듈 (lab). 루프가 ITER마다 이 파일과 prompt.mjs를 수정해 품질을 강화한다.
// 프로덕션 youtube-import.ts와 분리된 독립 모듈로, source 입력 + LLM 클라이언트만 받는다.
// 합격 후 본체(youtube-import.ts) 통합은 별도 작업.

import { buildExtractionPrompt, buildRecipeCandidateHints, buildSourceText, PROMPT_VERSION } from "./prompt.mjs";

const VALID_BASIS = new Set(["stated", "spoken", "onscreen", "visual-estimate"]);
const norm = (value) => (value ?? "").replace(/\s+/g, "").toLowerCase();
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const keyOf = (value) => compact(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const COMBINED_TITLE_RE = /\s*(?:[&＆/·ㆍ+]|ㅣ|\|)\s*/;
const QUALITATIVE_AMOUNT_RE = /(적당량|약간|조금|소량|넉넉|듬뿍|충분히|취향|기호|원하는\s*만큼|필요한\s*만큼|알맞게|to\s*taste)/i;
const RATIO_AMOUNT_RE = /(?:\d+\s*:\s*\d+|비율|동량|반반)/;
const DISH_WORD_RE = /(밥|덮밥|솥밥|죽|국|탕|찌개|전골|칼국수|국수|면|라면|파스타|냉파스타|우동|볶음|무침|조림|구이|튀김|전|찜|수육|스테이크|샐러드|김밥|후토마끼|초밥|토스트|샌드위치|피자|커리|카레|만두|묵국|묵사발|오믈렛|계란말이|케이크|쿠키|라떼|스무디|soup|stew|pasta|noodle|rice|salad|sandwich|toast|pizza|curry|cake|cookie)/i;
const TITLE_KEYWORD_STOPWORDS = new Set(["물", "소스", "양념", "기름", "식용유", "들기름", "참기름", "간장", "진간장", "된장", "고추장", "고춧가루", "설탕", "소금", "후추", "마늘", "다진마늘", "맛술", "식초", "올리고당", "알룰로스"]);
const TITLE_TOKEN_STRIP_RE = /(식용유|들기름|참기름|진간장|간장|된장|고추장|고춧가루|설탕|소금|후추|맛술|식초|올리고당|알룰로스)/g;
const KOREAN_AMOUNT_WORDS = new Map([
  ["한", "1"], ["하나", "1"], ["반", "1/2"],
  ["두", "2"], ["둘", "2"], ["세", "3"], ["셋", "3"],
  ["네", "4"], ["넷", "4"], ["다섯", "5"], ["여섯", "6"],
]);
const UNIT_ALIASES = new Map([
  ["큰 술", "큰술"], ["큰스푼", "큰술"], ["밥숟갈", "큰술"], ["밥숟가락", "큰술"], ["tbsp", "큰술"], ["tablespoon", "큰술"], ["tablespoons", "큰술"], ["T", "큰술"],
  ["작은 술", "작은술"], ["티스푼", "작은술"], ["tsp", "작은술"], ["teaspoon", "작은술"], ["teaspoons", "작은술"],
  ["그램", "g"], ["밀리리터", "ml"], ["리터", "l"],
  ["알", "개"], ["매", "장"],
]);
const UNIT_WORD_RE = /(큰\s*술|큰스푼|밥숟갈|밥숟가락|작은\s*술|티스푼|tbsp|tablespoons?|tsp|teaspoons?|컵|cup|g|그램|kg|ml|밀리리터|l|리터|개|알|쪽|장|매|줄|팩|봉|줌|꼬집|모|인분|덩이|대|포기|송이|토막|조각)/i;
const AMOUNT_VALUE_RE_SOURCE = String.raw`(?:\d+(?:\.\d+)?|\d+\s*/\s*\d+)`;
const AMOUNT_RANGE_RE_SOURCE = String.raw`${AMOUNT_VALUE_RE_SOURCE}(?:\s*[~-]\s*${AMOUNT_VALUE_RE_SOURCE})?`;
const KOREAN_AMOUNT_RE_SOURCE = [...KOREAN_AMOUNT_WORDS.keys()]
  .sort((a, b) => b.length - a.length)
  .join("|");
const EMBEDDED_AMOUNT_UNIT_RE = new RegExp(
  String.raw`(?:^|\s)(${AMOUNT_RANGE_RE_SOURCE}|${KOREAN_AMOUNT_RE_SOURCE})\s*${UNIT_WORD_RE.source}(?:\s*(?:정도|가량))?\s*$`,
  "i",
);

function normalizeIngredient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const embedded = extractEmbeddedAmountFromName(raw.name);
  const name = embedded.name;
  if (!name) return null;
  const rawAmount = compact(raw.amount);
  const rawUnit = compact(raw.unit);
  let amountUnit = normalizeAmountUnit(rawAmount || embedded.amount, rawUnit || embedded.unit);
  if (!amountUnit.amount && embedded.amount) amountUnit = normalizeAmountUnit(embedded.amount, embedded.unit);
  return {
    name,
    nameAliases: Array.isArray(raw.nameAliases) ? raw.nameAliases.filter((a) => typeof a === "string") : [],
    amount: amountUnit.amount,
    unit: amountUnit.unit,
    amountBasis: amountUnit.amount && VALID_BASIS.has(raw.amountBasis) ? raw.amountBasis : (amountUnit.amount ? "visual-estimate" : null),
    optional: raw.optional === true,
    groupLabel: raw.groupLabel ?? null,
  };
}

function extractEmbeddedAmountFromName(rawName) {
  const original = compact(rawName);
  if (!original) return { name: "" };

  const match = original.match(EMBEDDED_AMOUNT_UNIT_RE);
  if (!match) return { name: original };

  const strippedName = compact(original.replace(EMBEDDED_AMOUNT_UNIT_RE, ""));
  if (!strippedName) return { name: original };

  const amountUnit = normalizeAmountUnit(match[1], match[2]);
  if (!amountUnit.amount) return { name: original };

  return { name: strippedName, amount: amountUnit.amount, unit: amountUnit.unit };
}

function normalizeUnit(unit) {
  const text = compact(unit);
  if (!text || text === "없음" || QUALITATIVE_AMOUNT_RE.test(text)) return null;
  const squashed = text.replace(/\s+/g, "");
  const lowered = squashed.toLowerCase();
  return UNIT_ALIASES.get(text) ?? UNIT_ALIASES.get(squashed) ?? UNIT_ALIASES.get(lowered) ?? text;
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

function titleParts(title, recipeHints) {
  const rawParts = String(title ?? "").split(COMBINED_TITLE_RE).map(compact).filter(Boolean);
  if (rawParts.length < 2) return null;
  const refined = rawParts.map((part) => refineTitlePart(part, recipeHints));
  return refined.every((part) => part.length >= 2) ? refined : null;
}

function refineTitlePart(part, recipeHints) {
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
  return matches[0] ?? part;
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
  if (/묵국|묵사발|묵/.test(titleKey)) ["묵", "도토리묵", "육수", "동치미"].forEach((v) => keywords.add(v));
  return [...keywords].filter((v) => v.length >= 2 && !TITLE_KEYWORD_STOPWORDS.has(v));
}

function scoreTextForTitle(text, title) {
  const blob = keyOf(text);
  if (!blob) return 0;
  let score = 0;
  const titleKey = keyOf(title);
  if (/솥밥|덮밥|볶음밥|rice/.test(titleKey) && /(쌀|뜸|밥)/.test(blob)) score += 2;
  if (/묵국|묵사발|묵/.test(titleKey) && /(묵|육수|동치미)/.test(blob)) score += 2;
  for (const keyword of keywordSetForTitle(title)) {
    const key = keyOf(keyword);
    if (!key || !blob.includes(key)) continue;
    score += key.length >= 3 ? 3 : 1;
  }
  return score;
}

function assignStepIndexes(steps, parts) {
  const direct = steps.map((step) => {
    const scores = parts.map((part) => scoreTextForTitle(step, part));
    const best = Math.max(...scores);
    if (best <= 0) return -1;
    const bestIndex = scores.indexOf(best);
    return scores.filter((score) => score === best).length === 1 ? bestIndex : -1;
  });
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
  const parts = titleParts(recipe.title, recipeHints);
  if (!parts) return [recipe];
  const assignments = assignStepIndexes(recipe.steps, parts);
  if (!assignments) return [recipe];

  const split = parts.map((part, idx) => {
    const steps = recipe.steps.filter((_, stepIdx) => assignments[stepIdx] === idx);
    const ingredients = recipe.ingredients.filter((ingredient) =>
      ingredientUsedInSteps(ingredient, steps) || scoreTextForTitle(ingredient.name, part) > 0);
    return { title: part, ingredients, steps };
  });

  if (split.some((item) => item.steps.length === 0 || item.ingredients.length === 0)) return [recipe];
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

function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title ?? "").trim() || "제목 미상";
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s) => (typeof s === "string" ? s : s?.instruction)).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
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

  let recipes = Array.isArray(json?.recipes) ? json.recipes.map(normalizeRecipe).filter(Boolean) : [];
  const splitResult = splitCombinedRecipes(recipes, recipeHints);
  recipes = splitResult.recipes;

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
      droppedUnusedVisualIngredients: droppedUnused,
    },
  };
}
