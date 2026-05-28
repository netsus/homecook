type IngredientType = "QUANT" | "TO_TASTE";
type SectionKind = "ingredients" | "steps";
type LineKind =
  | "blank"
  | "noise"
  | "heading.recipe"
  | "heading.component"
  | "heading.ingredients"
  | "heading.steps"
  | "ingredient_candidate"
  | "step_candidate"
  | "note";

export interface SourceLine {
  index: number;
  raw: string;
  text: string;
  normalized: string;
  ordinal: number | null;
}

export interface ParseWarning {
  code: string;
  message: string;
  sourceLine?: number;
}

export interface ParsedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: IngredientType;
  displayText: string;
  rawText: string;
  componentLabel: string | null;
  sourceLine: number;
  confidence: number;
  flags: string[];
  scalable: boolean;
}

export interface ParsedStep {
  instruction: string;
  rawText: string;
  componentLabel: string | null;
  sourceLine: number;
  originalOrdinal: number | null;
  confidence: number;
  flags: string[];
}

export interface ParsedRecipeComponent {
  label: string | null;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
  sourceRange: {
    startLine: number;
    endLine: number;
  };
}

export interface ParsedRecipeCandidate {
  title: string | null;
  kind: "single" | "multi_component" | "ambiguous";
  components: ParsedRecipeComponent[];
  sourceRange: {
    startLine: number;
    endLine: number;
  };
  confidence: number;
}

export interface ParsedDescriptionDocument {
  sourceTitle: string;
  recipes: ParsedRecipeCandidate[];
  globalNoiseLines: SourceLine[];
  parseWarnings: ParseWarning[];
  metrics: {
    totalLines: number;
    ingredientCandidateLines: number;
    stepCandidateLines: number;
    noiseLines: number;
  };
}

export type RecipeCandidateSelection =
  | {
      outcome: "selected_single_recipe";
      candidate: ParsedRecipeCandidate;
      reasons: string[];
      warnings: ParseWarning[];
    }
  | {
      outcome: "selected_first_candidate";
      candidate: ParsedRecipeCandidate;
      discardedCandidates: ParsedRecipeCandidate[];
      reasons: string[];
      warnings: ParseWarning[];
    }
  | {
      outcome: "ambiguous_multi_recipe";
      candidates: ParsedRecipeCandidate[];
      reasons: string[];
    }
  | {
      outcome: "duplicate_component_ingredient_conflict";
      candidate: ParsedRecipeCandidate;
      conflicts: Array<{
        name: string;
        componentLabels: string[];
      }>;
    }
  | {
      outcome: "no_structured_recipe";
      reasons: string[];
    };

export interface FlatDraftIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: IngredientType;
  displayText: string;
  rawText: string;
  componentLabel: string | null;
  sourceLine: number;
  confidence: number;
  flags: string[];
  scalable: boolean;
}

export interface FlatDraftAdaptation {
  ingredients: FlatDraftIngredient[];
  steps: string[];
  stepComponentLabels: Array<string | null>;
  draftWarnings: string[];
  blockingIssues: string[];
  includeIncompleteStepFallback: boolean;
  selectionOutcome: RecipeCandidateSelection["outcome"];
}

interface Classification {
  kind: LineKind;
  ingredientScore: number;
  stepScore: number;
  headingScore: number;
  noiseScore: number;
  componentLabel: string | null;
  preferredSection: SectionKind | null;
}

const KNOWN_UNITS = [
  "kg",
  "g",
  "ml",
  "l",
  "L",
  "T",
  "t",
  "큰술",
  "작은술",
  "티스푼",
  "스푼",
  "종이컵",
  "컵",
  "개",
  "장",
  "대",
  "모",
  "공기",
  "알",
  "꼬집",
  "줌",
  "쪽",
  "봉",
  "캔",
  "팩",
  "줄",
  "술",
  "통",
  "포기",
  "송이",
  "마리",
  "덩이",
  "숟가락",
  "토막",
  "조각",
  "묶음",
  "방울",
  "근",
  "봉지",
  "병",
  "잔",
  "다발",
  "가닥",
  "움큼",
  "톨",
  "cc",
  "oz",
  "cup",
  "tbsp",
  "tsp",
] as const;
const UNIT_PATTERN = KNOWN_UNITS.join("|");
const COMPONENT_KEYWORDS = [
  "반죽",
  "필링",
  "크림",
  "토핑",
  "소스",
  "시럽",
  "아이싱",
  "가나슈",
  "가니쉬",
  "양념",
  "양념장",
  "밑간",
  "육수",
  "드레싱",
  "dough",
  "filling",
  "cream",
  "topping",
  "sauce",
  "syrup",
] as const;
const NON_SEPARATING_INGREDIENT_COMPONENT_LABELS = [
  "양념",
  "양념장",
  "밑간",
] as const;
const KOREAN_NUMBER_WORDS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  반: 0.5,
};
const VULGAR_FRACTION_PATTERN = "[¼½⅓⅔⅛⅜⅝⅞]";
const AMOUNT_NUMBER_PATTERN = `${VULGAR_FRACTION_PATTERN}|[0-9]+\\/[0-9]+|[0-9]+(?:[.,][0-9]+)?`;
const AMOUNT_RANGE_PATTERN = `(?:${AMOUNT_NUMBER_PATTERN})(?:\\s*[~\\-–]\\s*[0-9]+(?:[.,][0-9]+)?)?`;
const AMOUNT_SIGNAL_PATTERN = `(?:${AMOUNT_RANGE_PATTERN})\\s*(?:${UNIT_PATTERN})(?:씩)?(?=\\s|[~\\-–+＋,，/)]|$)`;
const AMOUNT_SIGNAL_RE = new RegExp(AMOUNT_SIGNAL_PATTERN, "iu");
const NUMERIC_INGREDIENT_RE = new RegExp(
  `^(.+?)(?:\\s*[：:]\\s*|\\s*)` +
    `(${AMOUNT_RANGE_PATTERN})\\s*` +
    `(${UNIT_PATTERN})(?:씩)?(?:\\s*\\([^)]*\\))?\\s*$`,
  "iu",
);
const LEADING_NUMERIC_INGREDIENT_RE = new RegExp(
  `^(${AMOUNT_RANGE_PATTERN})\\s*` +
    `(${UNIT_PATTERN})(?:씩)?\\s+` +
    `(.+?)(?:\\s*\\([^)]*\\))?\\s*$`,
  "iu",
);
const UNIT_SUFFIXED_RANGE_INGREDIENT_RE = new RegExp(
  `^(.+?)(?:\\s*[：:]\\s*|\\s*)` +
    `(${AMOUNT_NUMBER_PATTERN})\\s*` +
    `(${UNIT_PATTERN})\\s*[~\\-–]\\s*` +
    `[0-9]+(?:[.,][0-9]+)?\\s*(?:${UNIT_PATTERN})?(?:\\s*\\([^)]*\\))?\\s*$`,
  "iu",
);
const COMPOUND_INGREDIENT_SEPARATOR_RE = /\s*[+＋]\s*/u;

function stripDecorativeMarks(value: string) {
  return value
    .replace(/[\u200d\ufe0f]/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/^[\s\-–—•·*★☆✅✓✔︎✔️📌🧂🍳]+/gu, "")
    .replace(/[\s\-–—•·*★☆✅✓✔︎✔️📌]+$/gu, "")
    .trim();
}

function stripOuterBrackets(value: string) {
  const trimmed = value.trim();
  const pairs: Record<string, string> = {
    "[": "]",
    "(": ")",
    "【": "】",
    "{": "}",
    "《": "》",
    "〈": "〉",
    "「": "」",
    "『": "』",
  };
  const first = trimmed[0];
  const last = trimmed.at(-1);

  if (first && pairs[first] === last) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeLineText(raw: string) {
  const withoutTimestamp = raw
    .trim()
    .replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/u, "");

  const withNormalizedOrdinals = withoutTimestamp
    .replace(/(\d)️?⃣/gu, "$1) ")
    .replace(/[①-⑳]/gu, (ch) => `${ch.charCodeAt(0) - 0x2460 + 1}) `);

  const withNormalizedTildes = withNormalizedOrdinals
    .replace(/[～∼]/gu, "~")
    .replace(/~{2,}/gu, "~");

  const ordinalMatch = withNormalizedTildes.match(/^(?:step\s*)?(\d+)[.)]\s*/iu);
  const withoutOrdinal = ordinalMatch
    ? withNormalizedTildes.slice(ordinalMatch[0].length)
    : withNormalizedTildes;

  const text = stripOuterBrackets(
    withoutOrdinal
      .replace(/^[\s>]*(?:[-–—•·*✅✓✔︎✔️📌🧂🍳]+)\s*/u, "")
      .replace(/^[^\p{L}\p{N}#\[(]+/u, "")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .replace(/^[《〈「『]+|[》〉」』]+$/gu, "")
    .replace(/[\s*★☆✅✓✔︎✔️📌]+$/gu, "")
    .trim();

  return {
    text,
    normalized: text.toLowerCase(),
    ordinal: ordinalMatch ? Number(ordinalMatch[1]) : null,
  };
}

function normalizeLines(description: string): SourceLine[] {
  return description.split(/\r?\n/u).map((raw, index) => {
    const normalized = normalizeLineText(raw);

    return {
      index,
      raw,
      text: normalized.text,
      normalized: normalized.normalized,
      ordinal: normalized.ordinal,
    };
  });
}

function isNoiseText(text: string) {
  const normalized = text.trim().toLowerCase();

  if (
    isSeparatorText(normalized)
    || normalized.startsWith("#")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.includes("http://")
    || normalized.includes("https://")
    || /^@\w/u.test(normalized)
  ) {
    return true;
  }

  if (isMeasurementGuideText(normalized)) {
    return true;
  }

  const hasRecipeSignal = hasCookingAction(normalized)
    || AMOUNT_SIGNAL_RE.test(normalized)
    || /(?:약간|조금|적당량|소량|취향껏|한\s*꼬집|한\s*줌|한\s*움큼)/u.test(normalized);

  if (hasRecipeSignal) {
    return false;
  }

  return (
    normalized.includes("bgm")
    || normalized.includes("instagram")
    || normalized.includes("제품 정보")
    || normalized.includes("구매 링크")
    || normalized.includes("출처")
    || normalized.includes("인스타")
    || normalized.includes("블로그")
    || normalized.includes("구독")
    || normalized.includes("좋아요")
    || normalized.includes("알림")
    || normalized.includes("비즈니스 문의")
    || normalized.includes("business")
    || normalized.includes("music")
    || normalized.includes("음악")
    || normalized.includes("협찬")
    || normalized.includes("팔로우")
    || normalized.includes("follow")
    || normalized.includes("광고")
    || normalized.includes("tiktok")
    || normalized.includes("틱톡")
    || normalized.includes("facebook")
    || normalized.includes("페이스북")
    || normalized.includes("카메라")
  );
}

function isSeparatorText(normalized: string) {
  return /^[\s\-–—_=|~·•*━─]+$/u.test(normalized);
}

function isMeasurementGuideText(normalized: string) {
  const compact = normalized.replace(/\s+/gu, "");

  return (
    normalized.includes("계량도구")
    || (
      /(?:계량|ml|종이컵)/iu.test(normalized)
      && /(?:스푼|큰술|작은술|컵|숟가락)/u.test(normalized)
      && /[：:=|\-–—]/u.test(normalized)
    )
    || /^(?:큰술|작은술|스푼|컵)\s*[：:=]\s*[a-z]/iu.test(normalized)
    || /^(?:큰술|작은술|스푼|컵)\s*[-–—]\s*계량/u.test(normalized)
    || /^[0-9]+컵\s*\([^)]*\)\s*=/iu.test(normalized)
    || /^[0-9]+스푼\s*=/iu.test(normalized)
    || compact.includes("1스푼=15ml")
    || compact.includes("1컵=200ml")
  );
}

function shouldResetSectionOnNoise(text: string) {
  const normalized = text.trim().toLowerCase();

  return (
    normalized.startsWith("#")
    || normalized.includes("bgm")
    || normalized.includes("구독")
    || normalized.includes("좋아요")
    || normalized.includes("알림")
    || normalized.includes("출처")
    || normalized.includes("instagram")
    || normalized.includes("http://")
    || normalized.includes("https://")
    || normalized.includes("인스타")
    || normalized.includes("블로그")
    || normalized.includes("music")
    || normalized.includes("음악")
    || normalized.includes("협찬")
    || normalized.includes("팔로우")
    || normalized.includes("follow")
    || normalized.includes("광고")
    || normalized.includes("제품 정보")
    || normalized.includes("구매 링크")
    || normalized.includes("비즈니스 문의")
    || normalized.includes("business")
  );
}

function isSectionStopperHeading(text: string) {
  const normalized = text.trim();

  if (normalized.length > 60 || hasCookingAction(normalized)) {
    return false;
  }

  const lower = normalized.toLowerCase();

  return (
    (/추천/u.test(lower) && /분/u.test(lower))
    || /^(?:사용\s*할|사용할)\s*요리$/u.test(lower)
    || /^(?:인스타그램|instagram|contact|e-mail|email|블로그|blog)$/iu.test(lower)
    || /^보관\s*(?:법|방법|팁|tip)?$/u.test(lower)
    || /^주의\s*사항?$/u.test(lower)
    || /^(?:사용\s*(?:한\s*)?)?(?:제품|도구|기구|장비|그릇|용품)\s*(?:정보|소개)?$/u.test(lower)
    || /^촬영\s*(?:장비|기기|도구)?$/u.test(lower)
    || /^영양\s*(?:정보|성분)?$/u.test(lower)
    || /^칼로리\s*(?:정보)?$/u.test(lower)
    || /^(?:자주\s*묻는\s*질문|faq)$/iu.test(lower)
    || /^더보기$/u.test(lower)
    || /^(?:관련|추천)\s*(?:영상|동영상|레시피)$/u.test(lower)
    || /^(?:other|related)\s*(?:videos?|recipes?)/iu.test(lower)
    || /^(?:태그|tags?)$/iu.test(lower)
    || /^(?:copyright|저작권)/iu.test(lower)
  );
}

function cleanupComponentLabel(value: string) {
  const label = stripOuterBrackets(value)
    .replace(/(?:기본\s*)?재료$/u, "")
    .replace(/ingredients?$/iu, "")
    .replace(/(?:만드는\s*법|만드는\s*방법|만드는\s*과정|만들기|조리\s*법|조리법|요리\s*순서|method|directions?)$/iu, "")
    .replace(/^for\s+(?:the\s+)?/iu, "")
    .replace(/[：:]+$/u, "")
    .trim();

  return label.replace(/^쿠기\s+토핑$/u, "쿠키 토핑") || null;
}

function getIngredientHeadingComponent(text: string) {
  const normalized = text.toLowerCase();
  const headingCore = stripOuterBrackets(
    stripDecorativeMarks(text)
      .replace(/^(\[[^\]]+\])\s*[：:].*$/u, "$1")
      .replace(/^([^：:]+)[：:].*$/u, "$1")
      .replace(/\s+/gu, " ")
      .trim(),
  ).toLowerCase();

  if (
    /^(?:기본\s*)?(?:재료|준비\s*재료|재료\s*준비|준비물|ingredients?)\s*(?:\([^)]*\))?\s*$/u.test(normalized)
    || /^(?:양념\s*및\s*)?(?:재료|양념\s*재료|양념장\s*재료)$/u.test(headingCore)
    || /(?:재료\s*준비|준비\s*재료)$/u.test(headingCore)
  ) {
    return null;
  }

  if (/^(?:for\s+(?:the\s+)?)?(?:dough|filling|cream|topping|sauce)\s+ingredients?$/iu.test(text)) {
    return cleanupComponentLabel(text);
  }

  if (/^.+\s+(?:재료|ingredients?)$/iu.test(headingCore)) {
    return cleanupComponentLabel(headingCore);
  }

  return undefined;
}

function getStepHeadingComponent(text: string) {
  const normalized = text.toLowerCase();

  if (/^(?:순서|조리\s*(?:과정|순서|방법|법)|조리법|만드는\s*(?:법|방법|과정|순서)|만들기|요리\s*(?:법|과정|순서)|레시피(?:\s*순서)?|steps?|directions?|method)\s*(?:\([^)]*\))?\s*$/u.test(normalized)) {
    return null;
  }

  if (/^.+\s*(?:만드는\s*법|만드는\s*방법|만드는\s*과정|만들기|조리\s*법|조리법|요리\s*순서|method|directions?)$/iu.test(text)) {
    return cleanupComponentLabel(text);
  }

  return undefined;
}

function isRecipeHeading(text: string) {
  const normalized = text.toLowerCase();

  return (
    /^(?:recipe\s*)?\d+\s*(?:번째\s*)?레시피$/iu.test(normalized)
    || /^recipe\s*\d+\s*[：: ]+\S.{0,40}$/iu.test(normalized)
    || /^\d+\s*[：: ]+\S.{0,40}레시피\S*$/iu.test(normalized)
    || /^(?:첫|두|세|네)\s*번째\s*레시피$/u.test(normalized)
    || /^(?:첫|두|세|네)\s*번째\s*레시피\s+\S.{0,40}$/u.test(normalized)
    || /^recipe\s*\d+$/iu.test(normalized)
  );
}

function isComponentOnlyHeading(text: string) {
  if (!text || text.length > 32 || hasAmountSignal(text) || hasCookingAction(text) || hasSentenceEnding(text)) {
    return false;
  }

  const normalized = stripDecorativeMarks(text)
    .replace(/[：:]+$/u, "")
    .toLowerCase()
    .trim();

  return COMPONENT_KEYWORDS.some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase();

    return normalized === normalizedKeyword
      || (
        normalized.endsWith(normalizedKeyword)
        && normalized.length <= 20
        && normalized.split(/\s+/u).length <= 3
      );
  });
}

function shouldSeparateIngredientComponent(label: string | null) {
  if (!label) {
    return false;
  }

  const normalized = stripDecorativeMarks(label)
    .replace(/[：:]+$/u, "")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();

  return !NON_SEPARATING_INGREDIENT_COMPONENT_LABELS.some((keyword) =>
    normalized === keyword || normalized === `${keyword} 재료`,
  );
}

function isShortIngredientBlockHeadingFromLookahead(line: SourceLine, lookahead: SourceLine[]) {
  const text = line.text;
  const raw = line.raw.trim();

  if (!/^[[(【「『《]/u.test(raw)) {
    return false;
  }

  if (!text || text.length > 32 || hasAmountSignal(text) || hasCookingAction(text) || hasSentenceEnding(text)) {
    return false;
  }

  const meaningfulLines = lookahead
    .filter((current) => current.text && !isNoiseText(current.text))
    .slice(0, 3);

  if (meaningfulLines.length === 0) {
    return false;
  }

  return meaningfulLines.some((current) => {
    const scores = scoreLine(current);

    return scores.ingredientScore >= 5 && scores.ingredientScore >= scores.stepScore + 2;
  });
}

function hasCookingAction(text: string) {
  return /(씻|자르|잘라|썰|썬다|볶|끓|삶|굽|구워|버무|섞|넣|절여|절이|절인|올려|얹|발라|뿌려|익혀|익히|튀겨|찐|쪄|데쳐|풀|두르|맞춰|채우|채워|완성|식히|식힌|섞어|섞으|만들|준비|제거|다져|다지|비벼|비비|무쳐|무치|조려|졸여|졸이|졸인|헹궈|헹구|담가|담근|갈아|갈고|갈아|끼우|으깨|펴|재워|재우|빚어|치대|부어|부치|지져|걸러|불려|불리|불린|말아|간하|간해|간합|간하면|마무리)/u.test(text);
}

function hasSpecificCookingAction(text: string) {
  return /(씻|자르|잘라|썰|썬다|썰어|볶아|볶고|볶아요|볶는다|끓여|끓이|끓인다|삶|굽|구워|버무|섞|넣|절여|절이|절인|올려|얹|발라|뿌려|익혀|익히|튀겨|찐|쪄|데쳐|풀|두르|맞춰|채우|채워|완성|식히|식힌|섞어|섞으|준비|제거|다져|다지|비벼|비비|무쳐|무치|조려|졸여|졸이|헹궈|헹구|담가|담근|갈아|갈고|끼우|으깨|재워|재우|빚어|치대|부어|부치|지져|걸러|불려|불리|불린|말아|간하|간해|간합|간하면|마무리)/u.test(text);
}

function hasSentenceEnding(text: string) {
  return /(?:요|다|니다|세요|\.|!|。)$/u.test(text.trim());
}

function hasAmountSignal(text: string) {
  return AMOUNT_SIGNAL_RE.test(text) || /(?:약간|조금|적당량|소량|취향껏|취향에\s*따라|한\s*꼬집|한\s*줌|한\s*움큼|\s+(?:톡)+)$/u.test(text);
}

function parseRecipeAmount(value: string) {
  const normalizedValue = value.trim();
  const vulgarFractions: Record<string, number> = {
    "¼": 0.25,
    "½": 0.5,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
  };

  if (normalizedValue in vulgarFractions) {
    return vulgarFractions[normalizedValue];
  }

  if (/[~\-–]/u.test(normalizedValue)) {
    const [firstValue] = normalizedValue.split(/[~\-–]/u);
    return parseRecipeAmount(firstValue);
  }

  if (normalizedValue.includes("/")) {
    const [numerator, denominator] = normalizedValue.split("/").map(Number);

    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const parsed = Number(normalizedValue.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIngredientName(value: string) {
  let normalized = stripDecorativeMarks(value)
    .replace(/[：:]+$/u, "")
    .replace(/\s*[-–—]+\s*$/u, "")
    .replace(/\s*\([^)]*$/u, "")
    .replace(/\([^)]*\)/gu, "")
    .replace(/\s+[A-Za-z][A-Za-z\s.'-]*$/u, "")
    .replace(/\s*(?:또는|혹은|or)\s+.+$/iu, "")
    .replace(new RegExp(`\\s*${AMOUNT_RANGE_PATTERN}\\s*(?:${UNIT_PATTERN})(?:씩)?$`, "iu"), "")
    .replace(/([^\d\s])\s*\d+(?:[./]\d+)?$/u, "$1")
    .replace(/\s+(?:큰\s*거|큰거|크게|깎아서|탈탈~?|솔솔)$/u, "")
    .replace(/\s+(?:은|는|을|를|이|가|에|으로|로)$/u, "")
    .replace(/(?:은|는|을|를|가|에|으로|로)$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  normalized = normalized
    .replace(/^(.+?)(?:은|는)\s+재료의\s+.+$/u, "$1")
    .replace(/^(?:그리고|또|및)\s+/u, "")
    .replace(/^소금\s+후추$/u, "후추")
    .replace(/^재료\s+/u, "")
    .replace(/^저렴이\s+/u, "")
    .replace(/^저당\s+/u, "")
    .replace(/^냉동\s*/u, "")
    .replace(/^가루\s+/u, "")
    .replace(/^(?:데친|손질한|볶아둔|익힌|채썬|채\s*썬)\s+/u, "")
    .replace(/^다진\s+(?!마늘$)/u, "")
    .replace(/^청[.\s·/]*홍\s*고추$/u, "홍고추")
    .replace(/^게란(?:\s+.*)?$/u, "계란")
    .trim();

  return normalized;
}

function normalizeIngredientCandidateText(value: string) {
  const stripped = stripDecorativeMarks(value)
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/\s*\([^)]*$/u, "")
    .trim();
  const altAfterAmountRe = new RegExp(
    `^(.+?${AMOUNT_RANGE_PATTERN}\\s*(?:${UNIT_PATTERN})(?:씩)?)(?:\\s*(?:or|또는|혹은)\\s+.+)$`,
    "iu",
  );

  return stripped.replace(altAfterAmountRe, "$1").trim();
}

function isInvalidIngredientName(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    !normalized
    || /^[a-z][a-z\s.'-]*$/iu.test(normalized)
    || /^[\d\s=|/.,:：+\-–—()]+$/u.test(normalized)
    || /^\d+\s*도\s*\d+\s*분/u.test(normalized)
    || (/^.+(?:밥|덮밥|볶음)$/u.test(normalized) && normalized !== "밥")
    || /(?:레시피|멤버십|가입|사용할\s*요리|계량|숟가락보다|키친타월|핏물|제거|올린\s*뒤|구매|링크|http|영상\s*속|만드는\s*법|보관|냉장|드세요|괜찮)/iu.test(normalized)
    || /^의\s*\d/u.test(normalized)
  );
}

function parseIngredientLine(
  line: SourceLine,
  {
    allowAmountless,
    componentLabel,
  }: {
    allowAmountless: boolean;
    componentLabel: string | null;
  },
): ParsedIngredient | null {
  if (!line.text || isNoiseText(line.text)) {
    return null;
  }

  const parseText = normalizeIngredientCandidateText(line.text);
  const numericMatch = parseText.match(UNIT_SUFFIXED_RANGE_INGREDIENT_RE)
    ?? parseText.match(NUMERIC_INGREDIENT_RE);
  if (numericMatch) {
    const amount = parseRecipeAmount(numericMatch[2]);
    const name = normalizeIngredientName(numericMatch[1]);

    if (!name || amount === null || hasCookingAction(name) || /[,，]/u.test(name) || isInvalidIngredientName(name)) {
      return null;
    }

    return {
      name,
      amount,
      unit: numericMatch[3].trim(),
      ingredientType: "QUANT",
      displayText: formatIngredientDisplayText({
        name,
        amount,
        unit: numericMatch[3].trim(),
        componentLabel,
      }),
      rawText: line.raw.trim(),
      componentLabel,
      sourceLine: line.index,
      confidence: 0.95,
      flags: [],
      scalable: true,
    };
  }

  const leadingNumericMatch = parseText.match(LEADING_NUMERIC_INGREDIENT_RE);
  if (leadingNumericMatch) {
    const amount = parseRecipeAmount(leadingNumericMatch[1]);
    const name = normalizeIngredientName(leadingNumericMatch[3]);

    if (!name || amount === null || hasCookingAction(name) || /[,，]/u.test(name) || isInvalidIngredientName(name)) {
      return null;
    }

    return {
      name,
      amount,
      unit: leadingNumericMatch[2].trim(),
      ingredientType: "QUANT",
      displayText: formatIngredientDisplayText({
        name,
        amount,
        unit: leadingNumericMatch[2].trim(),
        componentLabel,
      }),
      rawText: line.raw.trim(),
      componentLabel,
      sourceLine: line.index,
      confidence: 0.95,
      flags: ["leading_amount"],
      scalable: true,
    };
  }

  const koreanAmountMatch = parseText.match(/^(.+?)\s*(한|두|세|네|반)\s*(꼬집|줌|컵|개|큰술|작은술)$/u);
  if (koreanAmountMatch) {
    const name = normalizeIngredientName(koreanAmountMatch[1]);
    const amount = KOREAN_NUMBER_WORDS[koreanAmountMatch[2]];
    const unit = koreanAmountMatch[3];

    if (!name || amount === undefined || isInvalidIngredientName(name)) {
      return null;
    }

    return {
      name,
      amount,
      unit,
      ingredientType: "QUANT",
      displayText: formatIngredientDisplayText({ name, amount, unit, componentLabel }),
      rawText: line.raw.trim(),
      componentLabel,
      sourceLine: line.index,
      confidence: 0.85,
      flags: ["korean_amount_word"],
      scalable: true,
    };
  }

  const toTasteMatch = parseText.match(/^(.+?)\s*(?:약간|조금|적당량|소량|취향껏|취향에\s*따라|원하는\s*만큼|한\s*꼬집|한\s*줌|한\s*움큼)$/u);
  if (toTasteMatch) {
    const name = normalizeIngredientName(toTasteMatch[1]);

    if (!name || /[,，]/u.test(name) || isInvalidIngredientName(name)) {
      return null;
    }

    return {
      name,
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      displayText: formatIngredientDisplayText({ name, amount: null, unit: null, componentLabel }),
      rawText: line.raw.trim(),
      componentLabel,
      sourceLine: line.index,
      confidence: 0.8,
      flags: ["to_taste"],
      scalable: false,
    };
  }

  const tapToTasteMatch = parseText.match(/^(.+?)\s+(?:톡)+$/u);
  if (tapToTasteMatch) {
    const name = normalizeIngredientName(tapToTasteMatch[1]);

    if (!name || isInvalidIngredientName(name)) {
      return null;
    }

    return {
      name,
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      displayText: formatIngredientDisplayText({ name, amount: null, unit: null, componentLabel }),
      rawText: line.raw.trim(),
      componentLabel,
      sourceLine: line.index,
      confidence: 0.8,
      flags: ["to_taste_tap"],
      scalable: false,
    };
  }

  if (!allowAmountless || line.text.length > 60 || hasCookingAction(line.text) || hasSentenceEnding(line.text) || /[,，]/u.test(line.text)) {
    return null;
  }

  const amountlessName = normalizeIngredientName(parseText);

  if (isInvalidIngredientName(amountlessName)) {
    return null;
  }

  return {
    name: amountlessName,
    amount: null,
    unit: null,
    ingredientType: "TO_TASTE",
    displayText: formatIngredientDisplayText({
      name: amountlessName,
      amount: null,
      unit: null,
      componentLabel,
    }),
    rawText: line.raw.trim(),
    componentLabel,
    sourceLine: line.index,
    confidence: 0.75,
    flags: ["amountless_section_item"],
    scalable: false,
  };
}

function splitCompoundIngredientSegments(text: string) {
  if (!text.includes("+") && !text.includes("＋")) {
    return [text];
  }

  const segments = text
    .split(COMPOUND_INGREDIENT_SEPARATOR_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 1 ? segments : [text];
}

function isParsedIngredient(ingredient: ParsedIngredient | null): ingredient is ParsedIngredient {
  return ingredient !== null;
}

function parseIngredientLines(
  line: SourceLine,
  options: {
    allowAmountless: boolean;
    componentLabel: string | null;
  },
) {
  const segments = splitCompoundIngredientSegments(line.text);

  if (segments.length === 1) {
    const ingredient = parseIngredientLine(line, options);
    return ingredient ? [ingredient] : [];
  }

  const parsedSegments = segments.map((segment) =>
    parseIngredientLine({
      ...line,
      raw: segment,
      text: segment,
      normalized: segment.toLowerCase(),
      ordinal: null,
    }, options),
  );

  if (parsedSegments.every(isParsedIngredient)) {
    return parsedSegments.map((ingredient) => ({
      ...ingredient,
      flags: [...new Set([...ingredient.flags, "compound_ingredient_line"])],
    }));
  }

  const ingredient = parseIngredientLine(line, options);
  return ingredient ? [ingredient] : [];
}

function parseCommaSeparatedIngredients(
  line: SourceLine,
  options: { componentLabel: string | null },
): ParsedIngredient[] {
  if (!line.text.includes(",") && !line.text.includes("，")) {
    return [];
  }

  const segments = line.text
    .split(/\s*(?:[,，]|(?<!\d)[.。](?!\d))\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return [];
  }

  const results = segments.map((segment) =>
    parseIngredientLine(
      {
        ...line,
        raw: segment,
        text: segment,
        normalized: segment.toLowerCase(),
        ordinal: null,
      },
      { allowAmountless: true, componentLabel: options.componentLabel },
    ),
  );

  if (results.every(isParsedIngredient)) {
    return results.map((ingredient) => ({
      ...ingredient,
      flags: [...new Set([...ingredient.flags, "comma_separated"])],
    }));
  }

  return [];
}

function cleanupInlineIngredientName(value: string) {
  let cleaned = stripOuterBrackets(value)
    .replace(/^.*?[：:]\s*/u, "")
    .replace(/^.*?(?:필요한\s*것|준비\s*재료|재료(?:는|로는)?|소스는)\s*/u, "")
    .replace(new RegExp(`^.*(?:${AMOUNT_RANGE_PATTERN})\\s*(?:${UNIT_PATTERN})\\s*(?:와|과|및)\\s*`, "iu"), "")
    .replace(/^(?:(?:오늘은|남은|냉장고에\s*남은|마지막에|넉넉하게|살짝|충분히|그리고|또|와|과|및|에|를|을|은|는|로|으로)\s*)+/u, "")
    .replace(/^.*?(?:은|는)\s+(?=[\p{L}])/u, "")
    .replace(/^.*?(?:썰고|익히고|볶고|불리고|넣어|올려|다가|고)\s+(?=[\p{L}])/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  cleaned = cleaned
    .replace(/\s+(?:은|는|을|를|이|가|에|와|과|으로|로|정도면?|정도)\s*$/u, "")
    .replace(/(?:은|는|을|를|으로|로)$/u, "")
    .replace(/(?:정도면?|정도)$/u, "")
    .trim();

  const tokens = cleaned.split(/\s+/u).filter(Boolean);
  if (tokens.length > 3) {
    cleaned = tokens.at(-1) ?? "";
  }

  return normalizeIngredientName(cleaned);
}

function makeParsedIngredient({
  line,
  name,
  amount,
  unit,
  ingredientType,
  componentLabel,
  confidence,
  flags,
  scalable,
}: {
  line: SourceLine;
  name: string;
  amount: number | null;
  unit: string | null;
  ingredientType: IngredientType;
  componentLabel: string | null;
  confidence: number;
  flags: string[];
  scalable: boolean;
}): ParsedIngredient | null {
  const normalizedName = cleanupInlineIngredientName(name);

  if (
    !normalizedName
    || normalizedName.length > 40
    || hasCookingAction(normalizedName)
    || isNoiseText(normalizedName)
    || isInvalidIngredientName(normalizedName)
  ) {
    return null;
  }

  return {
    name: normalizedName,
    amount,
    unit,
    ingredientType,
    displayText: formatIngredientDisplayText({
      name: normalizedName,
      amount,
      unit,
      componentLabel,
    }),
    rawText: line.raw.trim(),
    componentLabel,
    sourceLine: line.index,
    confidence,
    flags,
    scalable,
  };
}

function parseInlineQuantifiedIngredients(
  line: SourceLine,
  options: { componentLabel: string | null },
): ParsedIngredient[] {
  const ingredients: ParsedIngredient[] = [];
  const quantifiedIngredientRe = new RegExp(
    `(?:^|[,，.]|\\s[/+]\\s*|(?:와|과|및|에|를|을|은|는|다가|고)\\s+|\\s(?:와|과|및|에|를|을|은|는|다가|고)\\s*)` +
      `([^,，/+。.!\\n]{1,40}?)\\s*(${AMOUNT_RANGE_PATTERN}|한|두|세|네|반)\\s*(${UNIT_PATTERN})(?=\\s|[,，/+.)]|와|과|을|를|은|는|에|로|으로|$)`,
    "giu",
  );

  for (const match of line.text.matchAll(quantifiedIngredientRe)) {
    const amountToken = match[2];
    const amount = KOREAN_NUMBER_WORDS[amountToken] ?? parseRecipeAmount(amountToken);
    const unit = match[3].trim();
    const ingredient = makeParsedIngredient({
      line,
      name: match[1],
      amount,
      unit,
      ingredientType: "QUANT",
      componentLabel: options.componentLabel,
      confidence: 0.78,
      flags: ["inline_quantified"],
      scalable: true,
    });

    if (ingredient && amount !== null) {
      ingredients.push(ingredient);
    }
  }

  const looseQuantifiedIngredientRe = new RegExp(
    `(?<![\\p{L}\\p{N}])([^,，/+。.!\\n]{1,48}?)\\s*(${AMOUNT_RANGE_PATTERN}|한|두|세|네|반)\\s*(${UNIT_PATTERN})(?=\\s|[,，/+.)]|와|과|을|를|은|는|에|로|으로|$)`,
    "giu",
  );

  for (const match of line.text.matchAll(looseQuantifiedIngredientRe)) {
    const amountToken = match[2];
    const amount = KOREAN_NUMBER_WORDS[amountToken] ?? parseRecipeAmount(amountToken);
    const unit = match[3].trim();
    const ingredient = makeParsedIngredient({
      line,
      name: match[1],
      amount,
      unit,
      ingredientType: "QUANT",
      componentLabel: options.componentLabel,
      confidence: 0.68,
      flags: ["inline_quantified_loose"],
      scalable: true,
    });

    if (ingredient && amount !== null) {
      ingredients.push(ingredient);
    }
  }

  const connectorQuantifiedIngredientRe = new RegExp(
    `(?:썰어|볶다가|끓이다가|다가|고|에|와|과)\\s+([\\p{L}][\\p{L}\\s]{0,24}?)\\s*(${AMOUNT_RANGE_PATTERN}|한|두|세|네|반)\\s*(${UNIT_PATTERN})(?=\\s|[,，/+.)]|와|과|을|를|은|는|에|로|으로|$)`,
    "giu",
  );

  for (const match of line.text.matchAll(connectorQuantifiedIngredientRe)) {
    const amountToken = match[2];
    const amount = KOREAN_NUMBER_WORDS[amountToken] ?? parseRecipeAmount(amountToken);
    const unit = match[3].trim();
    const ingredient = makeParsedIngredient({
      line,
      name: match[1],
      amount,
      unit,
      ingredientType: "QUANT",
      componentLabel: options.componentLabel,
      confidence: 0.72,
      flags: ["inline_quantified_connector"],
      scalable: true,
    });

    if (ingredient && amount !== null) {
      ingredients.push(ingredient);
    }
  }

  const waterAmountRe = new RegExp(`(?:^|\\s)(물)\\s*(${AMOUNT_RANGE_PATTERN})\\s*(ml|l|L)(?=\\s|와|과|을|를|에|$)`, "giu");
  for (const match of line.text.matchAll(waterAmountRe)) {
    const amount = parseRecipeAmount(match[2]);
    const ingredient = makeParsedIngredient({
      line,
      name: match[1],
      amount,
      unit: match[3],
      ingredientType: "QUANT",
      componentLabel: options.componentLabel,
      confidence: 0.72,
      flags: ["inline_water_amount"],
      scalable: true,
    });

    if (ingredient && amount !== null) {
      ingredients.push(ingredient);
    }
  }

  return dedupeIngredients(ingredients);
}

function parseInlineToTasteIngredients(
  line: SourceLine,
  options: { componentLabel: string | null },
): ParsedIngredient[] {
  const ingredients: ParsedIngredient[] = [];
  const toTasteRe = /(?:^|[,，.]|(?:와|과|및|에|를|을|은|는|다가|고)\s+|\s(?:와|과|및|에|를|을|은|는|다가|고)\s*)([^,，/+。.!]{1,28}?)(?:은|는|을|를)?\s*(?:약간|조금|적당량|소량|취향껏|살짝|\s+(?:톡)+)(?=\s|[,，.。!]|으로|로|을|를|와|과|은|는|에|$)/gu;

  for (const match of line.text.matchAll(toTasteRe)) {
    const ingredient = makeParsedIngredient({
      line,
      name: match[1],
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      componentLabel: options.componentLabel,
      confidence: 0.7,
      flags: ["inline_to_taste"],
      scalable: false,
    });

    if (ingredient) {
      ingredients.push(ingredient);
    }
  }

  return ingredients;
}

function dedupeIngredients(ingredients: ParsedIngredient[]) {
  const seen = new Set<string>();
  const deduped: ParsedIngredient[] = [];

  for (const ingredient of ingredients) {
    const duplicateIndex = deduped.findIndex((existing) =>
      existing.sourceLine === ingredient.sourceLine
      && existing.amount === ingredient.amount
      && existing.unit === ingredient.unit
      && existing.componentLabel === ingredient.componentLabel
      && (
        existing.name.endsWith(ingredient.name)
        || ingredient.name.endsWith(existing.name)
      ),
    );

    if (duplicateIndex !== -1) {
      const existing = deduped[duplicateIndex];

      if (ingredient.name.length > existing.name.length) {
        const existingKey = [
          existing.name.trim().toLowerCase(),
          existing.amount ?? "",
          existing.unit ?? "",
          existing.componentLabel ?? "",
        ].join("|");
        seen.delete(existingKey);
        deduped.splice(duplicateIndex, 1);
      } else {
        continue;
      }
    }

    const key = [
      ingredient.name.trim().toLowerCase(),
      ingredient.amount ?? "",
      ingredient.unit ?? "",
      ingredient.componentLabel ?? "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(ingredient);
  }

  return deduped.sort((left, right) => {
    if (left.sourceLine !== right.sourceLine) {
      return left.sourceLine - right.sourceLine;
    }

    const leftIndex = left.rawText.indexOf(left.name);
    const rightIndex = right.rawText.indexOf(right.name);

    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

function normalizeLooseParsedIngredient(ingredient: ParsedIngredient): ParsedIngredient | null {
  const name = cleanupInlineIngredientName(ingredient.name);

  if (!name) {
    return null;
  }

  if (isInvalidIngredientName(name)) {
    return null;
  }

  return {
    ...ingredient,
    name,
    displayText: formatIngredientDisplayText({
      name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      componentLabel: ingredient.componentLabel,
    }),
  };
}

function parseLooseIngredientLines(
  line: SourceLine,
  options: { componentLabel: string | null },
) {
  if (!line.text || isNoiseText(line.text)) {
    return [];
  }

  const slashOrCommaLine = /[,，]|\s\/\s/u.test(line.text);
  if (slashOrCommaLine) {
    const normalizedLine = {
      ...line,
      text: line.text
        .replace(/^.*?[：:]\s*/u, "")
        .replace(/^.*?(?:필요한\s*것|재료(?:는|로는)?|소스는)\s*/u, "")
        .replace(/(?:입니다|면\s*충분합니다|입니다\.|[.。])\s*$/u, "")
        .trim(),
      normalized: line.normalized,
    };
    const segments = normalizedLine.text
      .split(/\s*(?:[,，]|\s\/\s)\s*/u)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.some(hasAmountSignal)) {
      return [];
    }

    const parsedSegments = segments
      .flatMap((segment) => parseIngredientLines({
        ...normalizedLine,
        raw: segment,
        text: segment,
        normalized: segment.toLowerCase(),
        ordinal: null,
      }, { allowAmountless: true, componentLabel: options.componentLabel }))
      .map(normalizeLooseParsedIngredient)
      .filter((ingredient): ingredient is ParsedIngredient => ingredient !== null);

    if (parsedSegments.length >= 2) {
      return dedupeIngredients(parsedSegments);
    }
  }

  return dedupeIngredients([
    ...parseInlineQuantifiedIngredients(line, options),
    ...parseInlineToTasteIngredients(line, options),
  ]);
}

function splitProseStepTexts(text: string) {
  const sentences = text
    .split(/(?<=[.。!])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const results: string[] = [];

  for (const sentence of sentences) {
    const splitOnProgress = sentence.split(/(?<=다가)\s+|(?<=굽고)\s+|(?<=썰고)\s+|(?<=익히고)\s+|(?<=불리고)\s+|(?<=끼우고)\s+/u)
      .map((part) => part.trim())
      .filter(Boolean);

    if (splitOnProgress.length > 1 && splitOnProgress.every((part) => hasCookingAction(part))) {
      results.push(...splitOnProgress);
      continue;
    }

    results.push(sentence);
  }

  return results;
}

function parseProseStepLines(
  line: SourceLine,
  options: { componentLabel: string | null },
) {
  return splitProseStepTexts(line.text)
    .map((text) => parseStepLine(
      {
        ...line,
        text,
        normalized: text.toLowerCase(),
      },
      {
        componentLabel: options.componentLabel,
        requireCookingAction: true,
      },
    ))
    .filter((step): step is ParsedStep => step !== null);
}

function parseStepLine(
  line: SourceLine,
  {
    componentLabel,
    requireCookingAction,
  }: {
    componentLabel: string | null;
    requireCookingAction: boolean;
  },
): ParsedStep | null {
  if (!line.text || isNoiseText(line.text) || isRecipeNoteText(line.text) || line.text.length < 4) {
    return null;
  }

  if (getIngredientHeadingComponent(line.text) !== undefined || getStepHeadingComponent(line.text) !== undefined) {
    return null;
  }

  if (isComponentOnlyHeading(line.text)) {
    return null;
  }

  if (requireCookingAction && !hasCookingAction(line.text)) {
    return null;
  }

  if (!hasCookingAction(line.text)) {
    if (hasAmountSignal(line.text)) {
      return null;
    }

    if (line.text.length <= 20 && !hasSentenceEnding(line.text)) {
      return null;
    }
  }

  return {
    instruction: formatStepInstruction(line.text),
    rawText: line.raw.trim(),
    componentLabel,
    sourceLine: line.index,
    originalOrdinal: line.ordinal,
    confidence: line.ordinal !== null || hasCookingAction(line.text) ? 0.9 : 0.7,
    flags: [],
  };
}

function isRecipeNoteText(text: string) {
  const normalized = text.trim();

  return /(?:영상\s*(?:속|에서는)|실제\s*영상|나중에\s*넣|빠져서|참고|tip|팁)/iu.test(normalized);
}

function scoreLine(line: SourceLine): Omit<Classification, "kind" | "componentLabel" | "preferredSection"> {
  let ingredientScore = 0;
  let stepScore = 0;
  let headingScore = 0;
  let noiseScore = 0;

  if (!line.text) {
    return { ingredientScore, stepScore, headingScore, noiseScore };
  }

  if (isNoiseText(line.text)) {
    noiseScore += 8;
    ingredientScore -= 8;
    stepScore -= 8;
  }

  if (hasAmountSignal(line.text)) {
    ingredientScore += 5;
    stepScore -= 3;
  }

  if (/(?:약간|조금|적당량|한\s*꼬집|취향껏)$/u.test(line.text)) {
    ingredientScore += 4;
  }

  if (line.ordinal !== null) {
    stepScore += 2;
  }

  if (hasCookingAction(line.text)) {
    stepScore += 4;
    ingredientScore -= 4;
  }

  if (hasSentenceEnding(line.text)) {
    stepScore += 1;
  }

  if (line.text.length <= 40 && !hasCookingAction(line.text)) {
    ingredientScore += 2;
  }

  if (line.text.length > 120) {
    ingredientScore -= 3;
  }

  if (isRecipeHeading(line.text) || getIngredientHeadingComponent(line.text) !== undefined || getStepHeadingComponent(line.text) !== undefined) {
    headingScore += 6;
  }

  if (isComponentOnlyHeading(line.text)) {
    headingScore += 4;
  }

  return { ingredientScore, stepScore, headingScore, noiseScore };
}

function classifyLine(
  line: SourceLine,
  lookahead: SourceLine[],
): Classification {
  const scores = scoreLine(line);

  if (!line.text) {
    return { kind: "blank", componentLabel: null, preferredSection: null, ...scores };
  }

  if (scores.noiseScore >= 8) {
    return { kind: "noise", componentLabel: null, preferredSection: null, ...scores };
  }

  if (isRecipeHeading(line.text)) {
    return { kind: "heading.recipe", componentLabel: null, preferredSection: null, ...scores };
  }

  const ingredientHeadingComponent = getIngredientHeadingComponent(line.text);
  if (ingredientHeadingComponent !== undefined) {
    return {
      kind: "heading.ingredients",
      componentLabel: ingredientHeadingComponent,
      preferredSection: "ingredients",
      ...scores,
    };
  }

  const stepHeadingComponent = getStepHeadingComponent(line.text);
  if (stepHeadingComponent !== undefined) {
    return {
      kind: "heading.steps",
      componentLabel: stepHeadingComponent,
      preferredSection: "steps",
      ...scores,
    };
  }

  if (isComponentOnlyHeading(line.text)) {
    const preferredSection = inferComponentSectionFromLookahead(lookahead);

    return {
      kind: "heading.component",
      componentLabel: cleanupComponentLabel(line.text),
      preferredSection,
      ...scores,
    };
  }

  if (isShortIngredientBlockHeadingFromLookahead(line, lookahead)) {
    return {
      kind: "heading.component",
      componentLabel: cleanupComponentLabel(line.text),
      preferredSection: "ingredients",
      ...scores,
    };
  }

  if (scores.ingredientScore >= 5 && scores.ingredientScore >= scores.stepScore + 2) {
    return { kind: "ingredient_candidate", componentLabel: null, preferredSection: null, ...scores };
  }

  if (scores.stepScore >= 4 && scores.stepScore >= scores.ingredientScore + 1) {
    return { kind: "step_candidate", componentLabel: null, preferredSection: null, ...scores };
  }

  return { kind: "note", componentLabel: null, preferredSection: null, ...scores };
}

function inferComponentSectionFromLookahead(lines: SourceLine[]): SectionKind | null {
  const meaningfulLines = lines.filter((current) => current.text && !isNoiseText(current.text));
  const firstLine = meaningfulLines[0];

  if (firstLine) {
    const firstScores = scoreLine(firstLine);

    if (firstScores.ingredientScore >= 5 && firstScores.ingredientScore >= firstScores.stepScore + 2) {
      return "ingredients";
    }

    if (firstScores.stepScore >= 4 && firstScores.stepScore >= firstScores.ingredientScore + 1) {
      return "steps";
    }
  }

  let ingredientCount = 0;
  let stepCount = 0;

  for (const line of meaningfulLines.slice(0, 3)) {
    const scores = scoreLine(line);

    if (getIngredientHeadingComponent(line.text) !== undefined) {
      ingredientCount += 2;
    } else if (getStepHeadingComponent(line.text) !== undefined) {
      stepCount += 2;
    } else if (scores.ingredientScore >= 5 && scores.ingredientScore >= scores.stepScore + 2) {
      ingredientCount += 1;
    } else if (scores.stepScore >= 4 && scores.stepScore >= scores.ingredientScore + 1) {
      stepCount += 1;
    }
  }

  if (ingredientCount > stepCount) return "ingredients";
  if (stepCount > ingredientCount) return "steps";
  return null;
}

function getComponent(
  components: ParsedRecipeComponent[],
  label: string | null,
  sourceLine: number,
) {
  const existing = components.find((component) => component.label === label);
  if (existing) {
    existing.sourceRange.endLine = Math.max(existing.sourceRange.endLine, sourceLine);
    return existing;
  }

  const component: ParsedRecipeComponent = {
    label,
    ingredients: [],
    steps: [],
    sourceRange: {
      startLine: sourceLine,
      endLine: sourceLine,
    },
  };
  components.push(component);
  return component;
}

function resolveComponentLabel(
  components: ParsedRecipeComponent[],
  label: string | null,
) {
  if (!label) {
    return null;
  }

  const normalizedLabel = label.toLowerCase();
  const existing = components.find((component) => {
    if (!component.label) {
      return false;
    }

    const normalizedExisting = component.label.toLowerCase();
    return normalizedExisting === normalizedLabel
      || normalizedExisting.includes(normalizedLabel)
      || normalizedLabel.includes(normalizedExisting);
  });

  return existing?.label ?? label;
}

function getHeadingInlinePayload(text: string) {
  const match = text.match(/^[^：:]+[：:]\s*(.+)$/u);
  const payload = match?.[1]?.trim() ?? "";

  if (!payload || /^[\d\s~\-–—./]+$/u.test(payload)) {
    return null;
  }

  if (!payload.includes(",") && !payload.includes("，") && /(?:분량|기준|계량|servings?)/iu.test(payload)) {
    return null;
  }

  return payload;
}

function parseHeadingInlineIngredients(
  line: SourceLine,
  options: { componentLabel: string | null },
) {
  const payload = getHeadingInlinePayload(line.text);

  if (!payload) {
    return [];
  }

  const payloadLine: SourceLine = {
    ...line,
    raw: payload,
    text: payload,
    normalized: payload.toLowerCase(),
    ordinal: null,
  };

  const commaSplit = parseCommaSeparatedIngredients(payloadLine, options);
  if (commaSplit.length > 0) {
    return commaSplit;
  }

  return parseLooseIngredientLines(payloadLine, options);
}

function splitRecipeRanges(lines: SourceLine[]) {
  const headings = lines.filter((line) => isRecipeHeading(line.text));

  if (headings.length < 2) {
    return [{
      title: null,
      lines,
    }];
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];

    return {
      title: heading.text,
      lines: lines.filter((line) =>
        line.index > heading.index && (!next || line.index < next.index),
      ),
    };
  });
}

function parseCandidate(title: string | null, lines: SourceLine[]): ParsedRecipeCandidate {
  const components: ParsedRecipeComponent[] = [];
  let section: SectionKind | null = null;
  let componentLabel: string | null = null;
  let afterSectionStopper = false;
  let hasStructuredSectionHeading = false;
  let hasParsedIngredient = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const classification = classifyLine(line, lines.slice(index + 1));

    if (classification.kind === "blank" || classification.kind === "heading.recipe") {
      continue;
    }

    if (isSectionStopperHeading(line.text)) {
      section = null;
      componentLabel = null;
      afterSectionStopper = true;
      continue;
    }

    if (classification.kind === "noise") {
      if (shouldResetSectionOnNoise(line.text)) {
        section = null;
        componentLabel = null;
        afterSectionStopper = true;
      }
      continue;
    }

    if (classification.kind === "heading.ingredients") {
      section = "ingredients";
      hasStructuredSectionHeading = true;
      afterSectionStopper = false;
      componentLabel = classification.componentLabel === null
        ? null
        : resolveComponentLabel(components, classification.componentLabel);
      const component = getComponent(components, componentLabel, line.index);
      const inlineIngredients = parseHeadingInlineIngredients(line, { componentLabel });

      if (inlineIngredients.length > 0) {
        component.ingredients.push(...inlineIngredients);
        hasParsedIngredient = true;
      }
      continue;
    }

    if (classification.kind === "heading.steps") {
      section = "steps";
      hasStructuredSectionHeading = true;
      afterSectionStopper = false;
      componentLabel = classification.componentLabel === null
        ? null
        : resolveComponentLabel(components, classification.componentLabel);
      getComponent(components, componentLabel, line.index);
      continue;
    }

    if (classification.kind === "heading.component") {
      componentLabel = resolveComponentLabel(components, classification.componentLabel);
      section = classification.preferredSection ?? section;
      hasStructuredSectionHeading = true;
      afterSectionStopper = false;
      getComponent(components, componentLabel, line.index);
      continue;
    }

    if (section === "ingredients") {
      const commaSplit = parseCommaSeparatedIngredients(line, { componentLabel });
      if (commaSplit.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...commaSplit);
        hasParsedIngredient = true;
        continue;
      }

      const ingredients = parseIngredientLines(line, {
        allowAmountless: true,
        componentLabel,
      });

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        hasParsedIngredient = true;
        continue;
      }

      const looseIngredients = parseLooseIngredientLines(line, { componentLabel });

      if (looseIngredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...looseIngredients);
        hasParsedIngredient = true;
        continue;
      }

      if (hasParsedIngredient && hasCookingAction(line.text)) {
        const steps = parseProseStepLines(line, { componentLabel });

        if (steps.length > 0) {
          getComponent(components, componentLabel, line.index).steps.push(...steps);
          section = "steps";
          continue;
        }
      }
    }

    if (section === "steps") {
      const step = parseStepLine(line, {
        componentLabel,
        requireCookingAction: false,
      });

      if (step) {
        getComponent(components, componentLabel, line.index).steps.push(step);
        continue;
      }
    }

    if (!section && !afterSectionStopper && classification.kind === "ingredient_candidate") {
      let ingredients = parseLooseIngredientLines(line, { componentLabel });

      if (ingredients.length === 0) {
        ingredients = parseIngredientLines(line, {
          allowAmountless: false,
          componentLabel,
        });
      }

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        hasParsedIngredient = true;

        if (!hasCookingAction(line.text)) {
          continue;
        }
      }
    }

    if (!section && !afterSectionStopper && classification.kind !== "ingredient_candidate") {
      const ingredients = parseLooseIngredientLines(line, { componentLabel });

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        hasParsedIngredient = true;
      }
    }

    if (!section && !afterSectionStopper && classification.kind === "ingredient_candidate") {
      const ingredients = parseIngredientLines(line, {
        allowAmountless: false,
        componentLabel,
      });

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        hasParsedIngredient = true;
        continue;
      }
    }

    if (!section && !afterSectionStopper && (classification.kind === "step_candidate" || hasCookingAction(line.text))) {
      if (!hasStructuredSectionHeading && !hasParsedIngredient && line.ordinal === null && !hasAmountSignal(line.text)) {
        continue;
      }

      if (line.ordinal === null && !hasSpecificCookingAction(line.text)) {
        continue;
      }

      const steps = parseProseStepLines(line, { componentLabel });

      if (steps.length > 0) {
        getComponent(components, componentLabel, line.index).steps.push(...steps);
      }
    }
  }

  const nonEmptyComponents = components.filter((component) =>
    component.ingredients.length > 0 || component.steps.length > 0,
  );
  const componentCount = nonEmptyComponents.filter((component) => component.label !== null).length;
  const ingredientCount = nonEmptyComponents.reduce((sum, component) => sum + component.ingredients.length, 0);
  const stepCount = nonEmptyComponents.reduce((sum, component) => sum + component.steps.length, 0);
  const confidence = Math.min(0.99, 0.35 + ingredientCount * 0.05 + stepCount * 0.08 + componentCount * 0.04);

  return {
    title,
    kind: componentCount > 1 ? "multi_component" : "single",
    components: nonEmptyComponents,
    sourceRange: {
      startLine: lines[0]?.index ?? 0,
      endLine: lines.at(-1)?.index ?? 0,
    },
    confidence,
  };
}

function buildParseWarnings(recipes: ParsedRecipeCandidate[]) {
  const warnings: ParseWarning[] = [];

  for (const recipe of recipes) {
    const ordinals = recipe.components
      .flatMap((component) => component.steps)
      .map((step) => step.originalOrdinal)
      .filter((ordinal): ordinal is number => ordinal !== null);

    if (ordinals.length < 2) {
      continue;
    }

    for (let index = 1; index < ordinals.length; index += 1) {
      if (ordinals[index] !== ordinals[index - 1] + 1) {
        warnings.push({
          code: "non_contiguous_step_ordinals",
          message: `원본 만들기 번호가 ${ordinals.join(", ")}처럼 비연속이라 중간 항목 누락 가능성이 있어요.`,
        });
        break;
      }
    }
  }

  return warnings;
}

export function parseYoutubeRecipeDescription(input: {
  title: string;
  description: string;
}): ParsedDescriptionDocument {
  const lines = normalizeLines(input.description);
  const ranges = splitRecipeRanges(lines);
  const recipes = ranges
    .map((range) => parseCandidate(range.title, range.lines))
    .filter((recipe) => recipe.components.length > 0);
  const parseWarnings = buildParseWarnings(recipes);
  const classifications = lines.map((line, index) => classifyLine(line, lines.slice(index + 1)));

  return {
    sourceTitle: input.title,
    recipes,
    globalNoiseLines: lines.filter((line) => isNoiseText(line.text)),
    parseWarnings,
    metrics: {
      totalLines: lines.length,
      ingredientCandidateLines: classifications.filter((classification) => classification.kind === "ingredient_candidate").length,
      stepCandidateLines: classifications.filter((classification) => classification.kind === "step_candidate").length,
      noiseLines: classifications.filter((classification) => classification.kind === "noise").length,
    },
  };
}

function candidateIngredientCount(candidate: ParsedRecipeCandidate) {
  return candidate.components.reduce((sum, component) => sum + component.ingredients.length, 0);
}

function candidateStepCount(candidate: ParsedRecipeCandidate) {
  return candidate.components.reduce((sum, component) => sum + component.steps.length, 0);
}

function candidateScore(candidate: ParsedRecipeCandidate) {
  return candidateIngredientCount(candidate) * 2 + candidateStepCount(candidate) * 3 + candidate.confidence;
}

export function selectPrimaryRecipeCandidate(
  document: ParsedDescriptionDocument,
): RecipeCandidateSelection {
  const structuredCandidates = document.recipes.filter((candidate) =>
    candidateIngredientCount(candidate) > 0 || candidateStepCount(candidate) > 0,
  );

  if (structuredCandidates.length === 0) {
    return {
      outcome: "no_structured_recipe",
      reasons: ["no ingredient or step candidates"],
    };
  }

  if (structuredCandidates.length === 1) {
    return {
      outcome: "selected_single_recipe",
      candidate: structuredCandidates[0],
      reasons: ["single structured candidate"],
      warnings: document.parseWarnings,
    };
  }

  const [firstCandidate, secondCandidate] = structuredCandidates;
  const firstScore = candidateScore(firstCandidate);
  const secondScore = candidateScore(secondCandidate);

  if (candidateIngredientCount(firstCandidate) >= 2 && candidateStepCount(firstCandidate) >= 1) {
    return {
      outcome: "selected_first_candidate",
      candidate: firstCandidate,
      discardedCandidates: structuredCandidates.slice(1),
      reasons: [
        firstScore >= secondScore + 4
          ? "first candidate dominates other candidates"
          : "current contract imports one recipe, so the first structured candidate is used",
      ],
      warnings: [
        ...document.parseWarnings,
        {
          code: "selected_first_candidate",
          message: "여러 레시피가 감지되어 첫 번째 후보만 가져왔어요.",
        },
      ],
    };
  }

  return {
    outcome: "ambiguous_multi_recipe",
    candidates: structuredCandidates,
    reasons: ["multiple recipe candidates without a clear first import target"],
  };
}

function formatIngredientDisplayText({
  name,
  amount,
  unit,
}: {
  name: string;
  amount: number | null;
  unit: string | null;
  componentLabel: string | null;
}) {
  if (amount === null || !unit) {
    return `${name} 약간`;
  }

  return `${name} ${amount}${unit}`;
}

function formatStepInstruction(instruction: string) {
  return instruction;
}

function formatAmount(amount: number, unit: string) {
  return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))}${unit}`;
}

function aggregateIngredients(ingredients: ParsedIngredient[]) {
  const grouped = new Map<string, ParsedIngredient[]>();

  for (const ingredient of ingredients) {
    const key = [
      shouldSeparateIngredientComponent(ingredient.componentLabel)
        ? ingredient.componentLabel?.trim().toLowerCase()
        : "",
      ingredient.name.trim().toLowerCase(),
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), ingredient]);
  }

  const warnings: string[] = [];
  const flattened: FlatDraftIngredient[] = [];

  for (const group of grouped.values()) {
    if (group.length === 1) {
      const ingredient = group[0];
      flattened.push({
        ...ingredient,
        displayText: formatIngredientDisplayText({
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          componentLabel: ingredient.componentLabel,
        }),
      });
      continue;
    }

    const canAggregate = group.every((ingredient) =>
      ingredient.ingredientType === "QUANT"
      && typeof ingredient.amount === "number"
      && ingredient.unit === group[0].unit,
    );

    if (!canAggregate) {
      warnings.push(`${group[0].name} 재료가 서로 다른 단위로 여러 번 나와 직접 확인이 필요해요.`);
      flattened.push(group[0]);
      continue;
    }

    const unit = group[0].unit;
    const amount = group.reduce((sum, ingredient) => sum + (ingredient.amount ?? 0), 0);
    const componentLabels = [...new Set(group.map((ingredient) => ingredient.componentLabel).filter((label): label is string => Boolean(label)))];
    const separatedComponentLabels = componentLabels.filter(shouldSeparateIngredientComponent);
    const outputComponentLabels = separatedComponentLabels.length > 0
      ? separatedComponentLabels
      : componentLabels.length === 1 && group.every((ingredient) => ingredient.componentLabel === componentLabels[0])
        ? componentLabels
        : [];
    const componentPrefix = outputComponentLabels.length > 0 ? `[${outputComponentLabels.join("+")}] ` : "";
    const parts = group.map((ingredient) => {
      const label = ingredient.componentLabel ?? "공통";
      return `${label} ${formatAmount(ingredient.amount ?? 0, unit ?? "")}`;
    });

    warnings.push("같은 재료를 컴포넌트별로 합산했어요. 인분을 바꾸면 괄호 안 원본 수량은 자동으로 바뀌지 않아요.");
    flattened.push({
      name: group[0].name,
      amount,
      unit,
      ingredientType: "QUANT",
      displayText: `${componentPrefix}${group[0].name} ${formatAmount(amount, unit ?? "")} (${parts.join(" + ")})`,
      rawText: group.map((ingredient) => ingredient.rawText).join(" / "),
      componentLabel: outputComponentLabels.length > 0 ? outputComponentLabels.join("+") : null,
      sourceLine: group[0].sourceLine,
      confidence: Math.min(...group.map((ingredient) => ingredient.confidence)),
      flags: [...new Set(group.flatMap((ingredient) => ingredient.flags).concat("aggregated_component_amounts"))],
      scalable: true,
    });
  }

  return {
    ingredients: flattened,
    warnings: [...new Set(warnings)],
  };
}

function adaptNoStructuredDraft(selectionOutcome: RecipeCandidateSelection["outcome"]): FlatDraftAdaptation {
  return {
    ingredients: [],
    steps: [],
    stepComponentLabels: [],
    draftWarnings: ["설명란에서 구조화된 재료와 만들기를 찾지 못했어요. 직접 추가해서 등록할 수 있어요."],
    blockingIssues: ["ingredients", "steps"],
    includeIncompleteStepFallback: false,
    selectionOutcome,
  };
}

export function adaptCandidateToFlatDraft(
  selection: RecipeCandidateSelection,
): FlatDraftAdaptation {
  if (
    selection.outcome === "no_structured_recipe"
    || selection.outcome === "ambiguous_multi_recipe"
    || selection.outcome === "duplicate_component_ingredient_conflict"
  ) {
    return adaptNoStructuredDraft(selection.outcome);
  }

  const allIngredients = selection.candidate.components.flatMap((component) => component.ingredients);
  const aggregation = aggregateIngredients(allIngredients);
  const flatSteps = selection.candidate.components
    .flatMap((component) => component.steps)
    .sort((left, right) => left.sourceLine - right.sourceLine);
  const steps = flatSteps.map((step) => step.instruction);
  const warningMessages = [
    ...selection.warnings.map((warning) => warning.message),
    ...aggregation.warnings,
  ];
  const blockingIssues: string[] = [];

  if (aggregation.ingredients.length === 0) {
    blockingIssues.push("ingredients");
  }

  return {
    ingredients: aggregation.ingredients,
    steps,
    stepComponentLabels: flatSteps.map((step) => step.componentLabel),
    draftWarnings: [...new Set(warningMessages)],
    blockingIssues,
    includeIncompleteStepFallback: true,
    selectionOutcome: selection.outcome,
  };
}
