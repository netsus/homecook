// 결정적 채점 로직. 추출 결과(result) vs 정답(golden)을 비교해 점수를 낸다.
// AI 의미 채점과 별개로, 코드만으로 확정 가능한 지표를 담당한다.

const norm = (value) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

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

// 두 재료명이 같은 재료를 가리키는지 (정규화 일치 또는 포함관계).
function namesMatch(a, b) {
  const ca = canonicalIngredientName(a);
  const cb = canonicalIngredientName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.length >= 2 && cb.length >= 2 && (ca.includes(cb) || cb.includes(ca))) return true;
  return false;
}

function allNames(ing) {
  return [ing.name, ...(ing.nameAliases ?? [])].filter(Boolean);
}

function ingredientMatches(goldenIng, predIng) {
  for (const gn of allNames(goldenIng)) {
    for (const pn of allNames(predIng)) {
      if (namesMatch(gn, pn)) return true;
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

// 분량이 "충분히 가깝다"고 볼지: 단위 일치 + 수치 비율 0.5~2배 이내(시각추정은 더 관대).
function amountClose(goldenIng, predIng) {
  const gUnit = canonicalUnit(goldenIng.unit);
  const pUnit = canonicalUnit(predIng.unit);
  const gVal = parseAmountValue(goldenIng.amount);
  const pVal = parseAmountValue(predIng.amount);
  if (gVal === null || gVal === undefined || pVal === null || pVal === undefined) return null; // 비교 불가
  if (gUnit !== pUnit) return false;
  if (gVal === 0 || pVal === 0) return gVal === pVal;
  const ratio = gVal / pVal;
  const tolerant = goldenIng.amountBasis === "visual-estimate" || predIng.amountBasis === "visual-estimate";
  const lo = tolerant ? 0.34 : 0.5;
  const hi = tolerant ? 3 : 2;
  return ratio >= lo && ratio <= hi;
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
function stepCoverage(goldenSteps, predSteps) {
  if (goldenSteps.length === 0) return { covered: 0, total: 0, ratio: 1 };
  const predTokens = new Set(predSteps.flatMap((s) => stepTokens(stepText(s)).flatMap((t) => [t, t.slice(0, 2)])));
  let covered = 0;
  for (const gsRaw of goldenSteps) {
    const tokens = stepTokens(stepText(gsRaw));
    if (tokens.length === 0) { covered += 1; continue; }
    const hit = tokens.filter((t) => predTokens.has(t) || predTokens.has(t.slice(0, 2))).length;
    if (hit / tokens.length >= 0.4) covered += 1;
  }
  return { covered, total: goldenSteps.length, ratio: covered / goldenSteps.length };
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
    return { matched: false, ingredientF1: 0, ingredientPrecision: 0, ingredientRecall: 0, amountMatchRate: 0, amountComparable: 0, stepCoverage: 0, goldenIngredients: golden.ingredients.length };
  }
  let tp = 0;
  const matchedGolden = [];
  const predMatched = new Set();
  golden.ingredients.forEach((g) => {
    const pIdx = pred.ingredients.findIndex((p, idx) => !predMatched.has(idx) && ingredientMatches(g, p));
    if (pIdx >= 0) { tp += 1; predMatched.add(pIdx); matchedGolden.push({ g, p: pred.ingredients[pIdx] }); }
  });
  const precision = pred.ingredients.length ? tp / pred.ingredients.length : 0;
  const recall = golden.ingredients.length ? tp / golden.ingredients.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  let amountComparable = 0, amountHit = 0;
  for (const { g, p } of matchedGolden) {
    const close = amountClose(g, p);
    if (close === null) continue;
    amountComparable += 1;
    if (close) amountHit += 1;
  }
  const cov = stepCoverage(golden.steps, pred.steps);

  return {
    matched: true,
    ingredientF1: f1,
    ingredientPrecision: precision,
    ingredientRecall: recall,
    amountMatchRate: amountComparable ? amountHit / amountComparable : null,
    amountComparable,
    stepCoverage: cov.ratio,
    goldenIngredients: golden.ingredients.length,
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
    stepCoverage: round(wavg("stepCoverage")),
    perRecipe: recipeScores.map((r) => ({
      title: r.title,
      matched: r.matched,
      ingredientF1: round(r.ingredientF1),
      amountMatchRate: r.amountMatchRate === null || r.amountMatchRate === undefined ? null : round(r.amountMatchRate),
      stepCoverage: round(r.stepCoverage),
    })),
  };
}

function round(v) {
  return v === null || v === undefined ? null : Math.round(v * 1000) / 1000;
}
