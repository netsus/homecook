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
  "스푼",
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
const KOREAN_NUMBER_WORDS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  반: 0.5,
};
const AMOUNT_SIGNAL_PATTERN = `(?:[0-9]+\\/[0-9]+|[0-9]+(?:[.,][0-9]+)?(?:\\s*[~\\-–]\\s*[0-9]+(?:[.,][0-9]+)?)?)\\s*(?:${UNIT_PATTERN})(?=\\s|[+＋,，/)]|$)`;
const AMOUNT_SIGNAL_RE = new RegExp(AMOUNT_SIGNAL_PATTERN, "iu");
const NUMERIC_INGREDIENT_RE = new RegExp(
  `^(.+?)(?:\\s*[：:]\\s*|\\s*)` +
    `([0-9]+\\/[0-9]+|[0-9]+(?:[.,][0-9]+)?(?:\\s*[~\\-–]\\s*[0-9]+(?:[.,][0-9]+)?)?)\\s*` +
    `(${UNIT_PATTERN})(?:\\s*\\([^)]*\\))?\\s*$`,
  "iu",
);
const COMPOUND_INGREDIENT_SEPARATOR_RE = /\s*[+＋]\s*/u;

function stripOuterBrackets(value: string) {
  const trimmed = value.trim();
  const pairs: Record<string, string> = {
    "[": "]",
    "(": ")",
    "【": "】",
    "{": "}",
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
  const ordinalMatch = withoutTimestamp.match(/^(?:step\s*)?(\d+)[.)]\s*/iu);
  const withoutOrdinal = ordinalMatch
    ? withoutTimestamp.slice(ordinalMatch[0].length)
    : withoutTimestamp;

  const text = stripOuterBrackets(
    withoutOrdinal
      .replace(/^[\s>]*(?:[-–—•·*✅✓✔︎✔️📌🧂🍳]+)\s*/u, "")
      .replace(/^[^\p{L}\p{N}#\[(]+/u, "")
      .replace(/\s+/gu, " ")
      .trim(),
  );

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

  return (
    normalized.startsWith("#")
    || normalized.startsWith("http://")
    || normalized.startsWith("https://")
    || normalized.includes("bgm")
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
    || normalized.includes("인스타")
    || normalized.includes("블로그")
  );
}

function cleanupComponentLabel(value: string) {
  const label = stripOuterBrackets(value)
    .replace(/(?:기본\s*)?재료$/u, "")
    .replace(/ingredients?$/iu, "")
    .replace(/(?:만드는\s*법|만드는\s*방법|만들기|조리\s*법|조리법|method|directions?)$/iu, "")
    .replace(/^for\s+(?:the\s+)?/iu, "")
    .replace(/[：:]+$/u, "")
    .trim();

  return label || null;
}

function getIngredientHeadingComponent(text: string) {
  const normalized = text.toLowerCase();

  if (/^(?:기본\s*)?(?:재료|준비\s*재료|재료\s*준비|준비물|ingredients?)$/u.test(normalized)) {
    return null;
  }

  if (/^(?:for\s+(?:the\s+)?)?(?:dough|filling|cream|topping|sauce)\s+ingredients?$/iu.test(text)) {
    return cleanupComponentLabel(text);
  }

  if (/^.+\s+(?:재료|ingredients?)$/iu.test(text)) {
    return cleanupComponentLabel(text);
  }

  return undefined;
}

function getStepHeadingComponent(text: string) {
  const normalized = text.toLowerCase();

  if (/^(?:순서|조리\s*(?:과정|순서|방법|법)|조리법|만드는\s*(?:법|방법|순서)|만들기|요리\s*(?:법|과정)|레시피\s*순서|steps?|directions?|method)$/u.test(normalized)) {
    return null;
  }

  if (/^.+\s*(?:만드는\s*법|만드는\s*방법|만들기|조리\s*법|조리법|method|directions?)$/iu.test(text)) {
    return cleanupComponentLabel(text);
  }

  return undefined;
}

function isRecipeHeading(text: string) {
  const normalized = text.toLowerCase();

  return (
    /^(?:recipe\s*)?\d+\s*(?:번째\s*)?레시피$/iu.test(normalized)
    || /^(?:첫|두|세|네)\s*번째\s*레시피$/u.test(normalized)
    || /^recipe\s*\d+$/iu.test(normalized)
  );
}

function isComponentOnlyHeading(text: string) {
  if (!text || text.length > 32 || hasAmountSignal(text) || hasCookingAction(text) || hasSentenceEnding(text)) {
    return false;
  }

  const normalized = text.toLowerCase().trim();

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

function hasCookingAction(text: string) {
  return /(씻|자르|잘라|썰|썬다|볶|끓|삶|굽|구워|버무|섞|넣|절여|절이|올려|발라|뿌려|익혀|튀겨|찐|쪄|데쳐|풀|두르|맞춰|채우|채워|완성|식히|식힌|섞어|섞으|만들)/u.test(text);
}

function hasSpecificCookingAction(text: string) {
  return /(씻|자르|잘라|썰|썬다|썰어|볶아|볶고|볶아요|볶는다|끓여|끓이|끓인다|삶|굽|구워|버무|섞|넣|절여|절이|올려|발라|뿌려|익혀|튀겨|찐|쪄|데쳐|풀|두르|맞춰|채우|채워|완성|식히|식힌|섞어|섞으)/u.test(text);
}

function hasSentenceEnding(text: string) {
  return /(?:요|다|니다|세요|\.|!|。)$/u.test(text.trim());
}

function hasAmountSignal(text: string) {
  return AMOUNT_SIGNAL_RE.test(text) || /(?:약간|조금|적당량|취향껏|취향에\s*따라|한\s*꼬집)$/u.test(text);
}

function parseRecipeAmount(value: string) {
  const normalizedValue = value.trim();

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
  return value
    .replace(/[：:]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
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

  const parseText = line.text.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  const numericMatch = parseText.match(NUMERIC_INGREDIENT_RE);
  if (numericMatch) {
    const amount = parseRecipeAmount(numericMatch[2]);
    const name = normalizeIngredientName(numericMatch[1]);

    if (!name || amount === null || hasCookingAction(name)) {
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

  const koreanAmountMatch = line.text.match(/^(.+?)\s*(한|두|세|네|반)\s*(꼬집|줌|컵|개|큰술|작은술)$/u);
  if (koreanAmountMatch) {
    const name = normalizeIngredientName(koreanAmountMatch[1]);
    const amount = KOREAN_NUMBER_WORDS[koreanAmountMatch[2]];
    const unit = koreanAmountMatch[3];

    if (!name || amount === undefined) {
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

  const toTasteMatch = line.text.match(/^(.+?)\s*(?:약간|조금|적당량|취향껏|취향에\s*따라|원하는\s*만큼)$/u);
  if (toTasteMatch) {
    const name = normalizeIngredientName(toTasteMatch[1]);

    if (!name) {
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

  const tapToTasteMatch = line.text.match(/^(.+?)\s+(?:톡)+$/u);
  if (tapToTasteMatch) {
    const name = normalizeIngredientName(tapToTasteMatch[1]);

    if (!name) {
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

  if (!allowAmountless || line.text.length > 60 || hasCookingAction(line.text) || hasSentenceEnding(line.text)) {
    return null;
  }

  return {
    name: normalizeIngredientName(line.text),
    amount: null,
    unit: null,
    ingredientType: "TO_TASTE",
    displayText: formatIngredientDisplayText({
      name: normalizeIngredientName(line.text),
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
  if (!line.text || isNoiseText(line.text) || line.text.length < 4) {
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

  return {
    instruction: formatStepInstruction(line.text, componentLabel),
    rawText: line.raw.trim(),
    componentLabel,
    sourceLine: line.index,
    originalOrdinal: line.ordinal,
    confidence: line.ordinal !== null || hasCookingAction(line.text) ? 0.9 : 0.7,
    flags: [],
  };
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

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const classification = classifyLine(line, lines.slice(index + 1));

    if (classification.kind === "blank" || classification.kind === "heading.recipe") {
      continue;
    }

    if (classification.kind === "noise") {
      if (shouldResetSectionOnNoise(line.text)) {
        section = null;
        componentLabel = null;
      }
      continue;
    }

    if (classification.kind === "heading.ingredients") {
      section = "ingredients";
      componentLabel = classification.componentLabel === null
        ? null
        : resolveComponentLabel(components, classification.componentLabel);
      getComponent(components, componentLabel, line.index);
      continue;
    }

    if (classification.kind === "heading.steps") {
      section = "steps";
      componentLabel = classification.componentLabel === null
        ? null
        : resolveComponentLabel(components, classification.componentLabel);
      getComponent(components, componentLabel, line.index);
      continue;
    }

    if (classification.kind === "heading.component") {
      componentLabel = resolveComponentLabel(components, classification.componentLabel);
      section = classification.preferredSection ?? section;
      getComponent(components, componentLabel, line.index);
      continue;
    }

    if (section === "ingredients") {
      const ingredients = parseIngredientLines(line, {
        allowAmountless: true,
        componentLabel,
      });

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        continue;
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

    if (!section && classification.kind === "ingredient_candidate") {
      const ingredients = parseIngredientLines(line, {
        allowAmountless: false,
        componentLabel,
      });

      if (ingredients.length > 0) {
        getComponent(components, componentLabel, line.index).ingredients.push(...ingredients);
        continue;
      }
    }

    if (!section && classification.kind === "step_candidate") {
      if (line.ordinal === null && !hasSpecificCookingAction(line.text)) {
        continue;
      }

      const step = parseStepLine(line, {
        componentLabel,
        requireCookingAction: true,
      });

      if (step) {
        getComponent(components, componentLabel, line.index).steps.push(step);
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
          message: `원본 조리 순서 번호가 ${ordinals.join(", ")}처럼 비연속이라 중간 단계 누락 가능성이 있어요.`,
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
  componentLabel,
}: {
  name: string;
  amount: number | null;
  unit: string | null;
  componentLabel: string | null;
}) {
  const prefix = componentLabel ? `[${componentLabel}] ` : "";

  if (amount === null || !unit) {
    return `${prefix}${name} 약간`;
  }

  return `${prefix}${name} ${amount}${unit}`;
}

function formatStepInstruction(instruction: string, componentLabel: string | null) {
  return componentLabel ? `[${componentLabel}] ${instruction}` : instruction;
}

function formatAmount(amount: number, unit: string) {
  return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))}${unit}`;
}

function aggregateIngredients(ingredients: ParsedIngredient[]) {
  const grouped = new Map<string, ParsedIngredient[]>();

  for (const ingredient of ingredients) {
    const key = ingredient.name.trim().toLowerCase();
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
    const componentPrefix = componentLabels.length > 0 ? `[${componentLabels.join("+")}] ` : "";
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
      componentLabel: componentLabels.length > 0 ? componentLabels.join("+") : null,
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
    draftWarnings: ["설명란에서 구조화된 재료와 조리 과정을 찾지 못했어요. 직접 추가해서 등록할 수 있어요."],
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
  const steps = selection.candidate.components.flatMap((component) =>
    component.steps.map((step) => step.instruction),
  );
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
    draftWarnings: [...new Set(warningMessages)],
    blockingIssues,
    includeIncompleteStepFallback: true,
    selectionOutcome: selection.outcome,
  };
}
