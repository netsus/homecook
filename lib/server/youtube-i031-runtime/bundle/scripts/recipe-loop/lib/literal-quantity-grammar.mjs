export const UNIT_SOURCE = String.raw`큰\s*술|작은\s*술|큰\s*스푼|작은\s*스푼|티\s*스푼|밥\s*숟가락|밥\s*숟갈|큰\s*숟가락|큰\s*숟갈|숟가락|숟갈|스푼|tablespoons?|teaspoons?|tbsp|tsp|cloves?|handfuls?|cups?|cm|kg|mg|mL|ML|ml|cc|그램|킬로그램|밀리리터|리터|g|L|l|T|t|컵|개|알|쪽|장|매|줄기|줄|팩|봉지|봉|줌|꼬집|모|덩이|뿌리|대|포기|송이|토막|조각|캔|통|병|공기|마리|꼬치|잎`;
export const AMOUNT_SOURCE = String.raw`(?:\d+\s+분의\s*\d+|\d+\s*분의\s*\d+|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|하나|다섯|여섯|반|한|두|세|네)`;

export function literalQuantityMatches(value) {
  const text = String(value ?? "").normalize("NFKC").replace(/⁄/gu, "/").replace(/\s+/gu, " ").trim();
  const pattern = new RegExp("(" + AMOUNT_SOURCE + ")\\s*(" + UNIT_SOURCE + ")(?![a-z])", "giu");
  return [...text.matchAll(pattern)].map((match) => ({ amount: match[1].trim(), unit: match[2].trim(), literal: match[0], index: match.index }));
}
