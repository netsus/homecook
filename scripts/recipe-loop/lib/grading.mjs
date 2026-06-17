// 결정적 채점 로직. 추출 결과(result) vs 정답(golden)을 비교해 점수를 낸다.
// AI 의미 채점과 별개로, 코드만으로 확정 가능한 지표를 담당한다.

const norm = (value) => String(value ?? "").replace(/\s+/g, "").toLowerCase();
const CANARY_CASES = {
  validation: new Set(["YZ8KSZboJeM"]),
};
const REDACTED_CANARY_HIT = "leak canary token redacted";
const REMOVED_CANARY = Symbol("removed-canary");
const AMOUNT_REASON_KEYS = ["unit_mismatch", "value_out_of_band", "model_missing", "amountBasis_band_diff"];
const STEP_NEAR_THRESHOLD_LO = 0.35;
const STEP_COVERAGE_THRESHOLD = 0.4;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function configuredCanaryIds(split) {
  return CANARY_CASES[split] ?? new Set();
}

export function hasConfiguredCanarySplit(split) {
  return configuredCanaryIds(split).size > 0;
}

export function isConfiguredCanaryCase(split, videoId) {
  return configuredCanaryIds(split).has(videoId);
}

function normalizedContainsAny(value, canaries) {
  const text = norm(typeof value === "string" ? value : JSON.stringify(value ?? ""));
  return canaries.some((canary) => canary.normalizedNames.some((name) => name && text.includes(name)));
}

function ingredientLooksCanary(value, canaries) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const relevant = [value.name, ...(value.nameAliases ?? [])].filter(Boolean).join(" ");
  return normalizedContainsAny(relevant, canaries);
}

function collectFlaggedCanaries(golden) {
  const removed = [];
  for (const recipe of golden?.recipes ?? []) {
    for (const ingredient of recipe?.ingredients ?? []) {
      if (ingredient?.isLeakCanary === true) {
        removed.push(cloneJson(ingredient));
      }
    }
  }
  return removed;
}

export function canaryTokensFromRemoved(removed) {
  return (removed ?? []).map((ingredient, index) => {
    const names = [ingredient?.name, ...(ingredient?.nameAliases ?? [])].filter(Boolean);
    return {
      canaryId: ingredient?.canaryId || `canary_${index + 1}`,
      category: "ingredient_name",
      normalizedNames: [...new Set(names.map(norm).filter(Boolean))],
    };
  }).filter((canary) => canary.normalizedNames.length > 0);
}

export function stripCanaryByFlag(golden, { split, videoId } = {}) {
  const expectedCanary = isConfiguredCanaryCase(split, videoId);
  const removed = collectFlaggedCanaries(golden);
  if (expectedCanary && removed.length === 0) {
    throw new Error(`canary drift: ${split}/${videoId} missing flagged leak canary ingredient`);
  }

  const cleanGolden = cloneJson(golden);
  for (const recipe of cleanGolden?.recipes ?? []) {
    recipe.ingredients = (recipe.ingredients ?? []).filter((ingredient) => ingredient?.isLeakCanary !== true);
  }

  const tokens = canaryTokensFromRemoved(removed);
  if (expectedCanary && tokens.length === 0) {
    throw new Error(`canary drift: ${split}/${videoId} flagged leak canary has no scannable token`);
  }
  if (tokens.length > 0 && normalizedContainsAny(cleanGolden?.recipes ?? [], tokens)) {
    throw new Error(`canary strip failed: ${split}/${videoId} clean golden still contains canary token`);
  }

  return { cleanGolden, removed };
}

export function scanForCanaries({ sourceKind, scope, split, videoId, value, canaries }) {
  if (sourceKind === "golden") {
    throw new Error("canary scan only accepts predicted artifacts, not golden input");
  }
  const hits = [];
  const text = norm(typeof value === "string" ? value : JSON.stringify(value ?? ""));
  for (const canary of canaries ?? []) {
    if (canary.normalizedNames.some((name) => name && text.includes(name))) {
      hits.push({
        scope,
        split,
        videoId,
        canaryId: canary.canaryId,
        category: canary.category,
      });
    }
  }
  return {
    success: hits.length === 0,
    status: hits.length === 0 ? "clean" : "leak_detected",
    hit_count: hits.length,
    hits,
    redacted_hits: hits.length ? [REDACTED_CANARY_HIT] : [],
  };
}

export function stripCanaryByToken(value, canaries) {
  if (!canaries?.length) return cloneJson(value);
  const strip = (node) => {
    if (typeof node === "string") {
      return normalizedContainsAny(node, canaries) ? "[leak canary token redacted]" : node;
    }
    if (Array.isArray(node)) {
      return node.map(strip).filter((item) => item !== REMOVED_CANARY);
    }
    if (!node || typeof node !== "object") return node;
    if (ingredientLooksCanary(node, canaries)) return REMOVED_CANARY;
    const out = {};
    for (const [key, child] of Object.entries(node)) {
      const cleaned = strip(child);
      if (cleaned !== REMOVED_CANARY) out[key] = cleaned;
    }
    return out;
  };
  return strip(cloneJson(value));
}

export function prepareCanaryGradingInputs({ split, videoId, golden, result, resultScope }) {
  const { cleanGolden, removed } = stripCanaryByFlag(golden, { split, videoId });
  const tokens = canaryTokensFromRemoved(removed);
  const canaryLeak = scanForCanaries({
    sourceKind: "predicted",
    scope: resultScope,
    split,
    videoId,
    value: result,
    canaries: tokens,
  });
  return {
    cleanGolden,
    cleanResult: stripCanaryByToken(result, tokens),
    canaryLeak,
  };
}

function emptyCanaryLeak(status, success) {
  return {
    success,
    status,
    hit_count: 0,
    hits: [],
    redacted_hits: [],
  };
}

export function summarizeCanaryLeaks({ split, ids, rows }) {
  const configured = configuredCanaryIds(split);
  if (configured.size === 0) return emptyCanaryLeak("not_applicable", true);
  const coveredConfiguredIds = ids.filter((id) => configured.has(id));
  if (coveredConfiguredIds.length === 0) return emptyCanaryLeak("not_covered", false);

  const rowById = new Map(rows.map((row) => [row.videoId, row]));
  const missingCovered = coveredConfiguredIds.some((id) => !rowById.get(id)?.canaryLeak);
  if (missingCovered) return emptyCanaryLeak("not_covered", false);

  const hitsByKey = new Map();
  for (const row of rows) {
    for (const hit of row.canaryLeak?.hits ?? []) {
      hitsByKey.set([hit.scope, hit.split, hit.videoId, hit.canaryId, hit.category].join("\u0000"), hit);
    }
  }
  const hits = [...hitsByKey.values()];
  if (hits.length > 0) {
    return {
      success: false,
      status: "leak_detected",
      hit_count: hits.length,
      hits,
      redacted_hits: [REDACTED_CANARY_HIT],
    };
  }
  return emptyCanaryLeak("clean", true);
}

// golden step은 {order,instruction,evidence} 객체, 추출 결과 step은 문자열일 수 있다. 문자열로 통일.
const stepText = (step) => (typeof step === "string" ? step : (step?.instruction ?? ""));

// 재료명 정규화: 공백 제거 + 조리 수식어 제거 + 핵심 명사 추출.
const MODIFIERS = ["다진", "채썬", "채 썬", "썬", "곱게", "굵게", "잘게", "얇게", "삶은", "데친", "볶은", "구운", "불린", "깐"];
export function canonicalIngredientName(name) {
  let n = String(name ?? "").replace(/\([^)]*\)/g, "").trim();
  for (const m of MODIFIERS) {
    if (n.startsWith(m)) n = n.slice(m.length).trim();
  }
  return norm(n);
}

// 두 재료명이 같은 재료를 가리키는지. 기본은 정규화 exact match만 허용한다.
// 포함관계는 nameAliases에 명시된 별칭이 관여할 때만 제한적으로 허용한다.
function namesMatch(a, b, { allowAliasSubstring = false } = {}) {
  const ca = canonicalIngredientName(a);
  const cb = canonicalIngredientName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length > cb.length ? ca : cb;
  if (allowAliasSubstring && shorter.length >= 2 && longer.length >= 3 && longer.includes(shorter)) return true;
  return false;
}

function allNames(ing) {
  return [
    ...(ing.name ? [{ value: ing.name, alias: false }] : []),
    ...(ing.nameAliases ?? []).filter(Boolean).map((value) => ({ value, alias: true })),
  ];
}

function ingredientMatches(goldenIng, predIng) {
  for (const gn of allNames(goldenIng)) {
    for (const pn of allNames(predIng)) {
      if (namesMatch(gn.value, pn.value, { allowAliasSubstring: gn.alias || pn.alias })) return true;
    }
  }
  return false;
}

// 단위 정규화 (동의어 통합).
const UNIT_ALIAS = {
  "큰술": "tbsp", "밥숟갈": "tbsp", "숟갈": "tbsp", "숟가락": "tbsp", "스푼": "tbsp", "t": "tbsp", "tbsp": "tbsp", "왕큰술": "tbsp",
  "작은술": "tsp", "tsp": "tsp", "티스푼": "tsp",
  "컵": "cup", "cup": "cup",
  "g": "g", "그램": "g", "kg": "kg",
  "ml": "ml", "리터": "l", "l": "l",
  "개": "ea", "알": "ea", "쪽": "ea", "장": "sheet", "줄": "ea", "팩": "pack", "줌": "handful", "꼬집": "pinch",
};
function canonicalUnit(unit) {
  if (!unit) return null;
  const u = norm(unit);
  return UNIT_ALIAS[u] ?? u;
}

// 분량 수치 파싱 ("1/2","2~3","약 200" 등 → 중앙값 숫자).
function parseAmountValue(amount) {
  if (amount === null || amount === undefined) return null;
  const s = String(amount).replace(/약|approximately|~about/gi, "").trim();
  const range = s.match(/([\d.]+)\s*[~\-]\s*([\d.]+)/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  const num = s.match(/[\d.]+/);
  return num ? parseFloat(num[0]) : null;
}

function emptyDeductionReasons() {
  return {
    amount: {
      total: 0,
      counts: Object.fromEntries(AMOUNT_REASON_KEYS.map((key) => [key, 0])),
    },
    step: {
      uncoveredCount: 0,
      nearThresholdCount: 0,
      bestSimilarity: { min: null, avg: null, max: null, count: 0 },
      buckets: { below_threshold: 0, near_threshold: 0 },
    },
  };
}

function summarizeDeductionEvents({ amountReasons = [], stepUncovered = [] } = {}, { includeDetails = false } = {}) {
  const summary = emptyDeductionReasons();
  for (const item of amountReasons) {
    if (!AMOUNT_REASON_KEYS.includes(item.reason)) continue;
    summary.amount.total += 1;
    summary.amount.counts[item.reason] += 1;
  }

  const similarities = stepUncovered
    .map((item) => item.bestSimilarity)
    .filter((value) => value !== null && value !== undefined);
  summary.step.uncoveredCount = stepUncovered.length;
  summary.step.nearThresholdCount = stepUncovered.filter((item) => item.nearThreshold).length;
  summary.step.buckets.near_threshold = summary.step.nearThresholdCount;
  summary.step.buckets.below_threshold = Math.max(0, stepUncovered.length - summary.step.nearThresholdCount);
  if (similarities.length > 0) {
    summary.step.bestSimilarity = {
      min: round(Math.min(...similarities)),
      avg: round(similarities.reduce((a, b) => a + b, 0) / similarities.length),
      max: round(Math.max(...similarities)),
      count: similarities.length,
    };
  }
  if (includeDetails) {
    summary.amount.items = amountReasons.map((item) => ({
      ingredientIndex: item.ingredientIndex,
      reason: item.reason,
    }));
    summary.step.uncovered = stepUncovered.map((item) => ({
      stepIndex: item.stepIndex,
      bestSimilarity: item.bestSimilarity,
      nearThreshold: item.nearThreshold,
    }));
  }
  return summary;
}

export function mergeDeductionReasonSummaries(summaries = []) {
  const merged = emptyDeductionReasons();
  let similarityWeightedSum = 0;
  for (const summary of summaries) {
    if (!summary) continue;
    const amountCounts = summary.amount?.counts ?? {};
    for (const key of AMOUNT_REASON_KEYS) {
      const count = amountCounts[key] ?? 0;
      merged.amount.counts[key] += count;
      merged.amount.total += count;
    }
    const step = summary.step ?? {};
    merged.step.uncoveredCount += step.uncoveredCount ?? 0;
    merged.step.nearThresholdCount += step.nearThresholdCount ?? 0;
    merged.step.buckets.near_threshold += step.nearThresholdCount ?? 0;
    merged.step.buckets.below_threshold += Math.max(0, (step.uncoveredCount ?? 0) - (step.nearThresholdCount ?? 0));
    const best = step.bestSimilarity ?? {};
    const count = best.count ?? 0;
    if (count > 0) {
      merged.step.bestSimilarity.min = merged.step.bestSimilarity.min === null ? best.min : Math.min(merged.step.bestSimilarity.min, best.min);
      merged.step.bestSimilarity.max = merged.step.bestSimilarity.max === null ? best.max : Math.max(merged.step.bestSimilarity.max, best.max);
      merged.step.bestSimilarity.count += count;
      similarityWeightedSum += (best.avg ?? 0) * count;
    }
  }
  if (merged.step.bestSimilarity.count > 0) {
    merged.step.bestSimilarity.avg = round(similarityWeightedSum / merged.step.bestSimilarity.count);
    merged.step.bestSimilarity.min = round(merged.step.bestSimilarity.min);
    merged.step.bestSimilarity.max = round(merged.step.bestSimilarity.max);
  }
  return merged;
}

// 분량이 "충분히 가깝다"고 볼지: 단위 일치 + 수치 비율 0.5~2배 이내(시각추정은 더 관대).
function compareAmount(goldenIng, predIng) {
  const gUnit = canonicalUnit(goldenIng.unit);
  const pUnit = canonicalUnit(predIng.unit);
  const gVal = parseAmountValue(goldenIng.amount);
  const pVal = parseAmountValue(predIng.amount);
  if (gVal === null || gVal === undefined) {
    return { scored: false, provided: pVal !== null && pVal !== undefined, matched: null };
  }
  if (pVal === null || pVal === undefined) {
    return { scored: true, provided: false, matched: false, reason: "model_missing" };
  }
  if (gUnit !== pUnit) return { scored: true, provided: true, matched: false, reason: "unit_mismatch" };
  if (gVal === 0 || pVal === 0) {
    const matched = gVal === pVal;
    return { scored: true, provided: true, matched, reason: matched ? null : "value_out_of_band" };
  }
  const ratio = gVal / pVal;
  const tolerant = goldenIng.amountBasis === "visual-estimate" || predIng.amountBasis === "visual-estimate";
  const strictMatched = ratio >= 0.5 && ratio <= 2;
  const tolerantMatched = ratio >= 0.34 && ratio <= 3;
  const matched = tolerant ? tolerantMatched : strictMatched;
  const reason = matched ? null : (!tolerant && tolerantMatched ? "amountBasis_band_diff" : "value_out_of_band");
  return { scored: true, provided: true, matched, reason, ratio: round(ratio) };
}

// 단계 커버리지: golden step의 핵심 토큰(2글자+ 명사 추정)이 예측 step들에 등장하는 비율.
const STEP_STOPWORDS = new Set([
  "그리고", "그다음", "다음", "준다", "준비", "넣고", "넣어", "넣는다", "한다", "해서", "후에", "정도", "위해",
  "조금", "약간", "함께", "고루", "골고루", "다시", "그대로", "되면", "면서", "올린다", "썰어", "만든다",
]);
// 공백 제거 전 원문에서 토큰을 뽑는다(조사 일부 제거 위해 어간 2글자 prefix도 함께 본다).
function stepTokens(text) {
  const raw = String(text).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? [];
  return raw.filter((t) => !STEP_STOPWORDS.has(t));
}

function stepTokenSet(step) {
  return new Set(stepTokens(stepText(step)).flatMap((t) => [t, t.slice(0, 2)]));
}

function stepSimilarity(goldenStep, predStep) {
  const tokens = stepTokens(stepText(goldenStep));
  if (tokens.length === 0) return 1;
  const predTokens = stepTokenSet(predStep);
  const hit = tokens.filter((t) => predTokens.has(t) || predTokens.has(t.slice(0, 2))).length;
  return hit / tokens.length;
}

function stepCoverage(goldenSteps, predSteps) {
  if (goldenSteps.length === 0) return { covered: 0, total: 0, ratio: 1 };
  let covered = 0;
  const usedPred = new Set();
  const uncovered = [];
  for (const [stepIndex, gsRaw] of goldenSteps.entries()) {
    const tokens = stepTokens(stepText(gsRaw));
    if (tokens.length === 0) { covered += 1; continue; }
    let bestIdx = -1;
    let bestScore = 0;
    predSteps.forEach((predStep, idx) => {
      if (usedPred.has(idx)) return;
      const score = stepSimilarity(gsRaw, predStep);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0 && bestScore >= STEP_COVERAGE_THRESHOLD) {
      usedPred.add(bestIdx);
      covered += 1;
    } else {
      uncovered.push({
        stepIndex,
        bestSimilarity: round(bestScore),
        nearThreshold: bestScore >= STEP_NEAR_THRESHOLD_LO && bestScore < STEP_COVERAGE_THRESHOLD,
      });
    }
  }
  return { covered, total: goldenSteps.length, ratio: covered / goldenSteps.length, uncovered };
}

// 다중 레시피: golden recipe ↔ predicted recipe를 (제목 + 재료 겹침) 유사도로 매칭.
// 1) 높은 유사도부터 그리디 매칭 → 2) 남은 golden/predicted를 유사도 순으로 추가 짝지음
//    (제목 표기 차이 "찜"↔"볶음"로 정답 추출이 0점 처리되는 것을 방지).
function recipeSimilarity(g, p) {
  return Math.max(titleSimilarity(g.title, p.title), ingredientOverlap(g, p));
}
function ingredientOverlap(g, p) {
  const ga = new Set(g.ingredients.map((i) => canonicalIngredientName(i.name)).filter(Boolean));
  const pa = new Set(p.ingredients.map((i) => canonicalIngredientName(i.name)).filter(Boolean));
  if (ga.size === 0 || pa.size === 0) return 0;
  let inter = 0;
  for (const t of ga) if (pa.has(t)) inter += 1;
  return inter / Math.min(ga.size, pa.size);
}
function matchRecipes(goldenRecipes, predRecipes) {
  const candidates = [];
  goldenRecipes.forEach((g, gi) => predRecipes.forEach((p, pi) => {
    candidates.push({ gi, pi, score: recipeSimilarity(g, p) });
  }));
  candidates.sort((a, b) => b.score - a.score);

  const goldenPred = new Map();
  const usedPred = new Set();
  // 1) 유사도 0.3 이상 그리디 매칭
  for (const c of candidates) {
    if (c.score < 0.3) break;
    if (goldenPred.has(c.gi) || usedPred.has(c.pi)) continue;
    goldenPred.set(c.gi, c.pi); usedPred.add(c.pi);
  }
  // 2) 남은 golden을 남은 predicted와 유사도 순으로 짝지음(임계값 없음 — 1:1은 항상 매칭)
  for (const c of candidates) {
    if (goldenPred.has(c.gi) || usedPred.has(c.pi)) continue;
    goldenPred.set(c.gi, c.pi); usedPred.add(c.pi);
  }

  const pairs = goldenRecipes.map((g, gi) =>
    goldenPred.has(gi) ? { golden: g, pred: predRecipes[goldenPred.get(gi)] } : { golden: g, pred: null });
  const unmatchedPred = predRecipes.filter((_, idx) => !usedPred.has(idx));
  return { pairs, unmatchedPred };
}
function titleSimilarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) return 1;
  const ta = new Set(stepTokens(a));
  const tb = new Set(stepTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
    else if ([...tb].some((u) => u.includes(t) || t.includes(u))) inter += 0.5;
  }
  return inter / Math.min(ta.size, tb.size);
}

function scoreRecipePair(golden, pred) {
  if (!pred) {
    return { matched: false, ingredientF1: 0, ingredientPrecision: 0, ingredientRecall: 0, amountMatchRate: 0, amountCoverage: 0, amountComparable: 0, stepCoverage: 0, goldenIngredients: golden.ingredients.length, deductionReasons: emptyDeductionReasons() };
  }
  let tp = 0;
  const matchedGolden = [];
  const predMatched = new Set();
  golden.ingredients.forEach((g, ingredientIndex) => {
    const pIdx = pred.ingredients.findIndex((p, idx) => !predMatched.has(idx) && ingredientMatches(g, p));
    if (pIdx >= 0) { tp += 1; predMatched.add(pIdx); matchedGolden.push({ g, p: pred.ingredients[pIdx], ingredientIndex }); }
  });
  const precision = pred.ingredients.length ? tp / pred.ingredients.length : 0;
  const recall = golden.ingredients.length ? tp / golden.ingredients.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  let amountComparable = 0, amountProvided = 0, amountHit = 0;
  const amountReasons = [];
  for (const { g, p, ingredientIndex } of matchedGolden) {
    const comparison = compareAmount(g, p);
    if (!comparison.scored) continue;
    amountComparable += 1;
    if (comparison.provided) amountProvided += 1;
    if (comparison.matched) amountHit += 1;
    if (!comparison.matched && comparison.reason) {
      amountReasons.push({ ingredientIndex, reason: comparison.reason });
    }
  }
  const cov = stepCoverage(golden.steps, pred.steps);

  return {
    matched: true,
    ingredientF1: f1,
    ingredientPrecision: precision,
    ingredientRecall: recall,
    amountMatchRate: amountComparable ? amountHit / amountComparable : null,
    amountCoverage: amountComparable ? amountProvided / amountComparable : null,
    amountComparable,
    stepCoverage: cov.ratio,
    goldenIngredients: golden.ingredients.length,
    deductionReasons: summarizeDeductionEvents({
      amountReasons,
      stepUncovered: cov.uncovered ?? [],
    }, { includeDetails: true }),
  };
}

export function gradeDeterministic(result, golden) {
  const goldenRecipes = golden.recipes ?? [];
  const predRecipes = result.recipes ?? [];
  const { pairs, unmatchedPred } = matchRecipes(goldenRecipes, predRecipes);

  const recipeScores = pairs.map(({ golden: g, pred: p }) => ({ title: g.title, ...scoreRecipePair(g, p) }));
  const matchedCount = recipeScores.filter((r) => r.matched).length;

  const weight = (r) => Math.max(1, r.goldenIngredients);
  const wsum = recipeScores.reduce((a, r) => a + weight(r), 0) || 1;
  const wavg = (key) => recipeScores.reduce((a, r) => a + (r[key] ?? 0) * weight(r), 0) / wsum;

  const amountRates = recipeScores.map((r) => r.amountMatchRate).filter((v) => v !== null && v !== undefined);
  const avgAmount = amountRates.length ? amountRates.reduce((a, b) => a + b, 0) / amountRates.length : null;

  return {
    recipeCountGolden: goldenRecipes.length,
    recipeCountPredicted: predRecipes.length,
    recipeCountMatch: goldenRecipes.length === predRecipes.length,
    recipesMatched: matchedCount,
    recipesMissed: goldenRecipes.length - matchedCount,
    recipesExtra: unmatchedPred.length,
    ingredientF1: round(wavg("ingredientF1")),
    ingredientPrecision: round(wavg("ingredientPrecision")),
    ingredientRecall: round(wavg("ingredientRecall")),
    amountMatchRate: avgAmount === null || avgAmount === undefined ? null : round(avgAmount),
    amountCoverage: round(wavg("amountCoverage")),
    stepCoverage: round(wavg("stepCoverage")),
    deductionReasons: mergeDeductionReasonSummaries(recipeScores.map((r) => r.deductionReasons)),
    perRecipe: recipeScores.map((r) => ({
      title: r.title,
      matched: r.matched,
      ingredientF1: round(r.ingredientF1),
      amountMatchRate: r.amountMatchRate === null || r.amountMatchRate === undefined ? null : round(r.amountMatchRate),
      amountCoverage: r.amountCoverage === null || r.amountCoverage === undefined ? null : round(r.amountCoverage),
      stepCoverage: round(r.stepCoverage),
      deductionReasons: r.deductionReasons,
    })),
  };
}

function round(v) {
  return v === null || v === undefined ? null : Math.round(v * 1000) / 1000;
}
