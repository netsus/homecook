const TOKEN_RE = /[0-9A-Za-z가-힣]+/g;
const GUARD_STOPWORDS = new Set([
  "validation",
  "holdout",
  "train",
  "case",
  "reason",
  "sample",
  "samples",
  "issue",
  "issues",
  "문제",
  "지적",
  "경향",
  "다수",
  "반복",
  "1회",
]);

function normalizeReason(reason) {
  return String(reason ?? "").replace(/\s+/g, " ").trim();
}

function tokensFrom(text) {
  return (String(text ?? "").match(TOKEN_RE) ?? [])
    .filter((token) => token.length >= 2)
    .filter((token) => !GUARD_STOPWORDS.has(token));
}

export function summarizeReasonFrequencies({ reasons, sampleN }) {
  const denominator = Math.max(1, Number(sampleN) || reasons.length || 1);
  const counts = new Map();
  const order = [];
  for (const reason of reasons ?? []) {
    const normalized = normalizeReason(reason);
    if (!normalized) continue;
    if (!counts.has(normalized)) order.push(normalized);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return order
    .map((text) => ({ text, count: counts.get(text), label: `${counts.get(text)}/${denominator}` }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.text) - order.indexOf(b.text))
    .map(({ label, count, text }) => ({ label, count, text }));
}

export function buildReasonAggregationPrompt({ split, videoId, sampleN, reasons }) {
  const protectedSplit = split === "validation" || split === "holdout";
  return `너는 레시피 의미 채점 reason 집계 전용 보조자다.
점수를 매기지 마라. 합격을 판단하지 마라. 입력에 등장한 지적만 사용하고 없는 문제를 만들지 마라.
각 문제에 몇/${sampleN}이 지적했는지 (x/${sampleN}) 라벨을 붙여라. 1회만 나온 문제도 버리지 마라.
split이 validation/holdout이면 구체 재료·분량·정답 문장을 절대 명명하지 말고 범주로만 써라.
현재 split: ${split}${protectedSplit ? " (보호 split: 범주형만 허용)" : " (공개 split: 상세 허용)"}
videoId: ${videoId}
judge reason samples:
${(reasons ?? []).map((reason, index) => `${index + 1}. ${normalizeReason(reason)}`).join("\n")}`;
}

export function guardAggregatedReasonOutput({ reasons, output }) {
  const inputTokens = new Set(tokensFrom((reasons ?? []).join("\n")));
  const outputTokens = tokensFrom(output);
  const ungrounded = [...new Set(outputTokens.filter((token) => !inputTokens.has(token)))];
  return {
    success: ungrounded.length === 0,
    ungrounded,
  };
}
