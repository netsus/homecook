import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  type FlatDraftAdaptation,
  type ParsedRecipeCandidate,
  type RecipeCandidateSelection,
} from "@/lib/server/youtube-description-parser";
import {
  findSegmentForSourceLine,
  type YoutubePublicTextSource,
  type YoutubeSourceSegment,
} from "@/lib/server/youtube-caption-normalizer";
import type { YoutubeRecipeEvidenceRef } from "@/types/recipe";

export interface YoutubeRawRecipeCandidate {
  candidateId: string;
  title: string;
  startMs: number | null;
  endMs: number | null;
  confidence: number;
  draft: FlatDraftAdaptation;
  evidenceRefs: YoutubeRecipeEvidenceRef[];
}

export interface YoutubeMultiRecipeExtraction {
  source: YoutubePublicTextSource;
  candidates: YoutubeRawRecipeCandidate[];
}

function candidateSelection(candidate: ParsedRecipeCandidate): RecipeCandidateSelection {
  return {
    outcome: "selected_single_recipe",
    candidate,
    reasons: ["multi recipe candidate window"],
    warnings: [],
  };
}

function candidateHasRecipeSignal(candidate: ParsedRecipeCandidate) {
  return candidate.components.some((component) =>
    component.ingredients.length > 0 || component.steps.length > 0,
  );
}

function titleForCandidate(candidate: ParsedRecipeCandidate, index: number) {
  const title = candidate.title
    ?.replace(/^\s*(?:recipe\s*)?\d+\s*[：:.)-]?\s*/iu, "")
    .replace(
      /^\s*(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(?:\s*번째)?(?:\s*(?:레시피|요리|메뉴|반찬|음식))?\s*/u,
      "",
    )
    .trim();

  return title || `요리 ${index + 1}`;
}

function buildEvidenceRefs({
  candidate,
  source,
  segments,
}: {
  candidate: ParsedRecipeCandidate;
  source: YoutubePublicTextSource;
  segments: YoutubeSourceSegment[];
}): YoutubeRecipeEvidenceRef[] {
  const sourceLines = new Set<number>();

  for (const component of candidate.components) {
    for (const ingredient of component.ingredients) {
      sourceLines.add(ingredient.sourceLine);
    }
    for (const step of component.steps) {
      sourceLines.add(step.sourceLine);
    }
  }

  return [...sourceLines]
    .sort((left, right) => left - right)
    .map((sourceLine) => {
      const segment = findSegmentForSourceLine(segments, sourceLine);
      const startMs = segment?.startMs ?? null;
      const endMs = startMs === null
        ? null
        : startMs + (segment?.durationMs ?? 0);

      return {
        source,
        line_index: sourceLine,
        start_ms: startMs,
        end_ms: endMs,
        text: segment?.text,
      };
    });
}

function candidateTimeRange(evidenceRefs: YoutubeRecipeEvidenceRef[]) {
  const starts = evidenceRefs
    .map((ref) => ref.start_ms)
    .filter((value): value is number => typeof value === "number");
  const ends = evidenceRefs
    .map((ref) => ref.end_ms ?? ref.start_ms)
    .filter((value): value is number => typeof value === "number");

  return {
    startMs: starts.length > 0 ? Math.min(...starts) : null,
    endMs: ends.length > 0 ? Math.max(...ends) : null,
  };
}

const CONVERSATIONAL_COOKING_ACTION_RE =
  /(불려|씻|썰|자르|다지|묻히|채우|볶|끓|쪄|찌|익히|굽|부치|넣|풀|끄|식혀|담|우려|제거|갈|블렌더|무치|말|준비|완성|만들)/u;
const CONVERSATIONAL_NOISE_RE =
  /(안녕하세요|구독자|시청|감사|병원|책|운동|공구|제품|공부|출근|공부|주방을\s*정리|도시락과\s*아침|맛있게\s*먹|도시락에\s*가득|아침을\s*차려|구입\s*가능|다음\s*주|목표|강의|취미|스텐팬|달라붙|고온\s*예열|인덕션|풍미|살아나요|와인\s*꼭\s*사세요|필리터리)/u;
const COMPLETION_RE = /(완성이에요|완성입니다|완성했어요|마무리|보기\s*좋게\s*담)/u;
const INGREDIENT_TRAILING_RE = /\s*(?:약간|조금|소량|적당량|톡톡|살짝)\s*$/u;

interface ConversationalLine {
  sourceLine: number;
  text: string;
  startMs: number | null;
  durationMs: number | null;
  language: string | null;
  trackKind: string | null;
}

interface ConversationalWindow {
  lines: ConversationalLine[];
}

function isConversationalCaptionSource(source: YoutubePublicTextSource) {
  return source === "caption" || source === "transcript";
}

function normalizeConversationalText(value: string) {
  return value
    .replace(/[🥰💕🐶😊🤗😅♡]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function splitCaptionTextIntoLines(text: string): ConversationalLine[] {
  return text
    .split(/\n+|(?<=[.。!?])\s+/u)
    .map((line) => normalizeConversationalText(line))
    .filter(Boolean)
    .map((line, index) => ({
      sourceLine: index,
      text: line,
      startMs: null,
      durationMs: null,
      language: null,
      trackKind: null,
    }));
}

function buildConversationalLines(text: string, segments: YoutubeSourceSegment[]) {
  if (segments.length === 0) {
    return splitCaptionTextIntoLines(text);
  }

  return segments
    .map((segment) => ({
      sourceLine: segment.lineIndex,
      text: normalizeConversationalText(segment.text),
      startMs: segment.startMs,
      durationMs: segment.durationMs,
      language: segment.language,
      trackKind: segment.trackKind,
    }))
    .filter((line) => line.text.length > 0);
}

function splitIngredientTokens(text: string) {
  return text
    .replace(/[.。!]$/u, "")
    .split(/\s*(?:[,，]|\s\/\s)\s*/u)
    .map((token) =>
      token
        .replace(/^그리고\s+/u, "")
        .replace(/^(?:다진|채\s*썬|썬|데친|삶은|구운)\s+/u, "")
        .replace(INGREDIENT_TRAILING_RE, "")
        .replace(/\s+(?:은|는|을|를|이|가|도|만)$/u, "")
        .replace(/(?:은|는|을|를|만)$/u, "")
        .trim(),
    )
    .filter((token) =>
      token.length >= 1
      && token.length <= 24
      && !CONVERSATIONAL_NOISE_RE.test(token)
      && !CONVERSATIONAL_COOKING_ACTION_RE.test(token)
    );
}

function isIngredientListLine(text: string) {
  if (CONVERSATIONAL_NOISE_RE.test(text) || CONVERSATIONAL_COOKING_ACTION_RE.test(text)) {
    return false;
  }

  return splitIngredientTokens(text).length >= 2;
}

function extractRecipeStartTitle(text: string) {
  if (CONVERSATIONAL_NOISE_RE.test(text)) {
    return null;
  }

  const normalized = text
    .replace(/[.。!]$/u, "")
    .replace(/^(?:이제|오늘은|아침에\s*먹기\s*좋은|언제나\s*맛있는|따뜻한|속편한)\s+/u, "")
    .trim();
  const match = normalized.match(/(.{2,40}?)(?:도)?\s*(?:빠르게\s*)?(?:만들어요|만듭니다|만들게요|만들기)$/u);
  const title = match?.[1]
    ?.replace(/^(?:가족\s*모두\s*좋아하는|남편이\s*좋아하는|맛있는|따뜻한)\s+/u, "")
    .replace(/^(?:한번|한\s*번|준비한|예쁜|물기를\s*제거한)\s+/u, "")
    .replace(/\s*(?:을|를)?\s*(?:썰어서|썰어|자르고|자른|다져|다진).*$/u, "")
    .replace(/에\s+.*$/u, "")
    .replace(/\s+(?:을|를|은|는|이|가)$/u, "")
    .replace(/(?:을|를|은|는)$/u, "")
    .trim();

  return title && title.length >= 2 ? title : null;
}

function extractIngredientTokensFromCookingLine(text: string) {
  const tokens: string[] = [];
  const prefix = text.match(/^(.{2,80}?)(?:만\s*)?(?:넣|둘러|뿌려|섞|볶|무치|갈)/u)?.[1];

  if (prefix && /[,，]/u.test(prefix)) {
    tokens.push(...splitIngredientTokens(prefix));
  }

  for (const match of text.matchAll(/([가-힣A-Za-z][가-힣A-Za-z\s]{0,18}?)(?:을|를|은|는|도)?\s*(?:넣|둘러|뿌려|올려|섞|볶|무치|갈)/gu)) {
    const token = match[1]
      ?.replace(/^(?:부족한\s*간은|찬물에\s*우려낸|물기를\s*제거한|바로)\s*/u, "")
      .replace(/^.*부족한\s*간은\s*/u, "")
      .replace(/\s*(?:을|를)?\s*(?:많이|조금|살짝|바로|고루).*$/u, "")
      .replace(/\s+(?:은|는|을|를|이|가|도|만)$/u, "")
      .replace(/(?:은|는|을|를|만)$/u, "")
      .trim();

    if (
      token
      && token.length <= 24
      && !CONVERSATIONAL_NOISE_RE.test(token)
      && !CONVERSATIONAL_COOKING_ACTION_RE.test(token)
      && !["간", "불", "맛"].includes(token)
    ) {
      tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

function extractIngredientTokensFromLine(text: string) {
  return [
    ...(isIngredientListLine(text) ? splitIngredientTokens(text) : []),
    ...extractIngredientTokensFromCookingLine(text),
  ];
}

function isCookingLine(text: string) {
  return !CONVERSATIONAL_NOISE_RE.test(text) && CONVERSATIONAL_COOKING_ACTION_RE.test(text);
}

function isRecipeSignalLine(line: ConversationalLine) {
  return isIngredientListLine(line.text) || isCookingLine(line.text) || extractRecipeStartTitle(line.text) !== null;
}

function windowHasStep(lines: ConversationalLine[]) {
  return lines.some((line) => isCookingLine(line.text));
}

function windowHasIngredientList(lines: ConversationalLine[]) {
  return lines.some((line) => isIngredientListLine(line.text));
}

function windowHasExplicitTitle(lines: ConversationalLine[]) {
  return lines.some((line) => extractRecipeStartTitle(line.text));
}

function shouldStartNewConversationalWindow(
  current: ConversationalLine[],
  line: ConversationalLine,
) {
  if (current.length === 0) {
    return false;
  }

  const previous = current.at(-1);
  const gapMs = typeof previous?.startMs === "number" && typeof line.startMs === "number"
    ? line.startMs - previous.startMs
    : 0;
  const hasCurrentRecipe = windowHasStep(current) || windowHasIngredientList(current);

  if (!hasCurrentRecipe) {
    return false;
  }

  if (extractRecipeStartTitle(line.text)) {
    return true;
  }

  if (
    gapMs >= 30_000
    && isIngredientListLine(line.text)
    && !windowHasIngredientList(current)
    && !windowHasExplicitTitle(current)
  ) {
    return true;
  }

  if (gapMs >= 45_000 && (isIngredientListLine(line.text) || isCookingLine(line.text))) {
    return true;
  }

  if (previous && COMPLETION_RE.test(previous.text) && (isIngredientListLine(line.text) || isCookingLine(line.text))) {
    return true;
  }

  return false;
}

function splitConversationalWindows(lines: ConversationalLine[]) {
  const windows: ConversationalWindow[] = [];
  let current: ConversationalLine[] = [];

  for (const line of lines) {
    if (!isRecipeSignalLine(line)) {
      continue;
    }

    if (shouldStartNewConversationalWindow(current, line)) {
      if (current.length > 0) {
        windows.push({ lines: current });
      }
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    windows.push({ lines: current });
  }

  return windows.filter((window) => windowHasStep(window.lines));
}

function inferConversationalTitle(window: ConversationalWindow, index: number) {
  const explicit = window.lines
    .map((line) => extractRecipeStartTitle(line.text))
    .find((title): title is string => Boolean(title));

  if (explicit) {
    return explicit;
  }

  const completion = window.lines
    .map((line) => line.text.match(/(.{2,28}?)\s*완성이에요/u)?.[1]?.trim())
    .find((title): title is string => Boolean(title));

  if (completion) {
    return completion;
  }

  const dishMention = window.lines
    .map((line) =>
      line.text.match(/([가-힣A-Za-z0-9\s]{2,24}?(?:찌개|전골|무침|볶음|말이|국|밥|주스|샐러드|조림|구이|튀김|찜|전))(?:\s|[.。!]|$)/u)?.[1]
        ?.replace(/^(?:예쁜|맛있는|따뜻한|속편한|남편이\s*좋아하는|가족\s*모두\s*좋아하는)\s+/u, "")
        .trim(),
    )
    .find((title): title is string => Boolean(title));

  if (dishMention) {
    return dishMention;
  }

  const firstStep = window.lines.find((line) => isCookingLine(line.text))?.text ?? "";
  const washedSubject = firstStep
    .match(/^(?:한번|한\s*번)\s*씻은\s+(.{1,18}?)(?:을|를)?\s*(?:썰|자르|준비)/u)?.[1]
    ?.trim();

  if (washedSubject) {
    return washedSubject;
  }

  const subject = firstStep
    .replace(/[.。!]$/u, "")
    .match(/^(.{2,24}?)(?:은|는|을|를|에|도)?\s*(?:씻|썰|자르|다지|묻히|채우|볶|끓|쪄|찌|익히|굽|부치|넣|풀|식혀|담|우려|제거|갈|준비)/u)
    ?.[1]
    ?.replace(/^(?:한번|한\s*번|준비한|예쁜|물기를\s*제거한)\s+/u, "")
    .replace(/\s*(?:을|를)?\s*(?:썰어서|썰어|자르고|자른|다져|다진).*$/u, "")
    .replace(/에\s+.*$/u, "")
    .replace(/\s+(?:을|를|은|는|이|가)$/u, "")
    .replace(/(?:을|를|은|는)$/u, "")
    .trim();

  return subject && subject.length >= 2 ? subject : `요리 ${index + 1}`;
}

function buildConversationalPseudoDescription(window: ConversationalWindow, title: string) {
  const ingredientTokens = [
    ...new Set(window.lines.flatMap((line) => extractIngredientTokensFromLine(line.text))),
  ];
  const stepTexts = window.lines
    .filter((line) => isCookingLine(line.text))
    .map((line) => line.text.replace(/[.。!]$/u, "").trim())
    .filter(Boolean);

  return [
    `${title} 재료`,
    ...ingredientTokens,
    "만드는 법",
    ...stepTexts.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function conversationalEvidenceRefs(
  window: ConversationalWindow,
  source: YoutubePublicTextSource,
): YoutubeRecipeEvidenceRef[] {
  return window.lines.map((line) => ({
    source,
    line_index: line.sourceLine,
    start_ms: line.startMs,
    end_ms: line.startMs === null ? null : line.startMs + (line.durationMs ?? 0),
    text: line.text,
  }));
}

function buildRawCandidate({
  candidate,
  candidateId,
  evidenceRefs,
  fallbackTitle,
}: {
  candidate: ParsedRecipeCandidate;
  candidateId: string;
  evidenceRefs: YoutubeRecipeEvidenceRef[];
  fallbackTitle: string;
}): YoutubeRawRecipeCandidate {
  const draft = adaptCandidateToFlatDraft(candidateSelection(candidate));
  const { startMs, endMs } = candidateTimeRange(evidenceRefs);

  return {
    candidateId,
    title: fallbackTitle,
    startMs,
    endMs,
    confidence: candidate.confidence,
    draft,
    evidenceRefs,
  };
}

function extractConversationalCaptionCandidates({
  title,
  text,
  source,
  segments,
}: {
  title: string;
  text: string;
  source: YoutubePublicTextSource;
  segments: YoutubeSourceSegment[];
}) {
  const lines = buildConversationalLines(text, segments);
  const windows = splitConversationalWindows(lines);
  const candidates: YoutubeRawRecipeCandidate[] = [];

  for (const [index, window] of windows.entries()) {
    const candidateTitle = inferConversationalTitle(window, index);
    const pseudoDescription = buildConversationalPseudoDescription(window, candidateTitle);
    const document = parseYoutubeRecipeDescription({ title, description: pseudoDescription });
    const parsedCandidate = document.recipes.find(candidateHasRecipeSignal);

    if (!parsedCandidate) {
      continue;
    }

    const ingredientCount = parsedCandidate.components.reduce(
      (sum, component) => sum + component.ingredients.length,
      0,
    );
    const stepCount = parsedCandidate.components.reduce(
      (sum, component) => sum + component.steps.length,
      0,
    );

    if (ingredientCount === 0 && stepCount < 2) {
      continue;
    }

    candidates.push(buildRawCandidate({
      candidate: {
        ...parsedCandidate,
        title: candidateTitle,
        confidence: Math.max(parsedCandidate.confidence, 0.58),
      },
      candidateId: `candidate-${candidates.length + 1}`,
      evidenceRefs: conversationalEvidenceRefs(window, source),
      fallbackTitle: candidateTitle,
    }));
  }

  return candidates.length >= 2 ? candidates : [];
}

export function extractYoutubeMultiRecipeCandidates({
  title,
  text,
  source,
  segments,
}: {
  title: string;
  text: string;
  source: YoutubePublicTextSource;
  segments: YoutubeSourceSegment[];
}): YoutubeMultiRecipeExtraction | null {
  const document = parseYoutubeRecipeDescription({ title, description: text });
  const structuredCandidates = document.recipes.filter(candidateHasRecipeSignal);

  if (structuredCandidates.length < 2) {
    if (!isConversationalCaptionSource(source)) {
      return null;
    }

    const conversationalCandidates = extractConversationalCaptionCandidates({
      title,
      text,
      source,
      segments,
    });

    return conversationalCandidates.length >= 2
      ? { source, candidates: conversationalCandidates }
      : null;
  }

  const candidates = structuredCandidates.map((candidate, index): YoutubeRawRecipeCandidate => {
    const evidenceRefs = buildEvidenceRefs({ candidate, source, segments });

    return buildRawCandidate({
      candidate,
      candidateId: `candidate-${index + 1}`,
      evidenceRefs,
      fallbackTitle: titleForCandidate(candidate, index),
    });
  });

  return { source, candidates };
}
