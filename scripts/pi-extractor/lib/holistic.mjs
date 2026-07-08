import { parsePiRawOutput } from "./schema.mjs";

export const HOLISTIC_PROMPT_VERSION = "pi-holistic-video-draft-v1";

const SOURCE_AMOUNT_BASIS = new Set(["stated", "spoken", "onscreen"]);
const VISUAL_AMOUNT_BASIS = "visual-estimate";

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(cleanString).filter(Boolean))];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function textMentions(text, value) {
  const needle = normalizeKey(value);
  const haystack = normalizeKey(text);
  return Boolean(needle && haystack && (haystack.includes(needle) || needle.includes(haystack)));
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

function compactText(value, maxLength = 180) {
  const text = cleanString(value);
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeTimeRange(value) {
  if (!isObject(value)) return null;
  const startSec = optionalNumber(value.startSec);
  const endSec = optionalNumber(value.endSec);
  return {
    startSec,
    endSec: endSec !== null && startSec !== null && endSec <= startSec ? null : endSec,
    basis: cleanString(value.basis) ?? "inferred",
  };
}

function clampVisualNeedRange(range, maxWindowSec = 16) {
  const normalized = normalizeTimeRange(range);
  if (!normalized) return null;
  const startSec = optionalNumber(normalized.startSec);
  const endSec = optionalNumber(normalized.endSec);
  const limit = Math.max(4, optionalNumber(maxWindowSec, 16));
  if (startSec === null || endSec === null || endSec <= startSec || endSec - startSec <= limit) return normalized;
  const midpoint = startSec + (endSec - startSec) / 2;
  return {
    startSec: Math.max(0, midpoint - limit / 2),
    endSec: midpoint + limit / 2,
    basis: `${normalized.basis ?? "holistic-visual-need"}-clamped-window`,
    originalRange: normalized,
  };
}

function normalizeHolisticIngredient(value) {
  const source = isObject(value) ? value : {};
  return {
    ...source,
    name: cleanString(source.name) ?? cleanString(source.ingredient) ?? cleanString(source.item),
    amount: cleanString(source.amount),
    unit: cleanString(source.unit),
    amountBasis: cleanString(source.amountBasis ?? source.basis),
    evidence: normalizeStringArray(source.evidence),
    needsVisualEstimate: source.needsVisualEstimate === true,
    uncertainty: cleanString(source.uncertainty),
  };
}

function normalizeHolisticStep(value, index) {
  if (typeof value === "string") {
    return {
      text: value.trim(),
      evidence: [],
      confidence: 0.4,
    };
  }
  const source = isObject(value) ? value : {};
  return {
    ...source,
    text: cleanString(source.text) ?? cleanString(source.instruction) ?? cleanString(source.description) ?? `단계 ${index + 1}`,
    evidence: normalizeStringArray(source.evidence),
    confidence: Math.max(0, Math.min(1, optionalNumber(source.confidence, 0.4))),
  };
}

function normalizeVisualNeed(value, index, recipe) {
  const source = isObject(value) ? value : {};
  return {
    ...source,
    targetType: cleanString(source.targetType) ?? "ingredient_amount",
    ingredient: cleanString(source.ingredient) ?? cleanString(source.name),
    reason: cleanString(source.reason) ?? "holistic draft requested visual check",
    candidateTimeRange: normalizeTimeRange(source.candidateTimeRange) ?? recipe.timeRange,
    suggestedFrameRefs: normalizeStringArray(source.suggestedFrameRefs),
    evidence: normalizeStringArray(source.evidence),
    visualNeedId: cleanString(source.visualNeedId) ?? `${recipe.candidateId}:need-${index + 1}`,
  };
}

function normalizeHolisticRecipe(value, index) {
  const source = isObject(value) ? value : {};
  const candidateId = cleanString(source.candidateId) ?? `r${index + 1}`;
  const title = cleanString(source.title) ?? `레시피 ${index + 1}`;
  const recipe = {
    ...source,
    candidateId,
    title,
    timeRange: normalizeTimeRange(source.timeRange),
    ingredients: Array.isArray(source.ingredients) ? source.ingredients.map(normalizeHolisticIngredient).filter((ingredient) => ingredient.name) : [],
    steps: Array.isArray(source.steps) ? source.steps.map(normalizeHolisticStep).filter((step) => step.text) : [],
    uncertainties: normalizeStringArray(source.uncertainties),
  };
  recipe.visualNeeds = Array.isArray(source.visualNeeds)
    ? source.visualNeeds.map((need, needIndex) => normalizeVisualNeed(need, needIndex, recipe)).filter((need) => need.ingredient)
    : [];
  return recipe;
}

export function normalizeHolisticDraft(value) {
  const parsed = parsePiRawOutput(value) ?? {};
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : isObject(parsed.recipe) ? [parsed.recipe] : [];
  return {
    ...parsed,
    schemaVersion: 1,
    kind: "holistic-draft",
    recipes: recipes.map(normalizeHolisticRecipe),
    globalUncertainties: normalizeStringArray(parsed.globalUncertainties),
  };
}

export function validateHolisticDraft(draft) {
  const errors = [];
  if (!isObject(draft)) return ["holistic draft must be an object"];
  if (!Array.isArray(draft.recipes)) return ["holistic draft recipes must be an array"];
  draft.recipes.forEach((recipe, recipeIndex) => {
    if (!cleanString(recipe.candidateId)) errors.push(`recipes[${recipeIndex}].candidateId is required`);
    if (!cleanString(recipe.title)) errors.push(`recipes[${recipeIndex}].title is required`);
    if (!Array.isArray(recipe.ingredients)) errors.push(`recipes[${recipeIndex}].ingredients must be an array`);
    if (!Array.isArray(recipe.steps)) errors.push(`recipes[${recipeIndex}].steps must be an array`);
  });
  return errors;
}

export function assertValidHolisticDraft(draft) {
  const errors = validateHolisticDraft(draft);
  if (errors.length) {
    throw new Error(`Pi holistic draft schema validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function normalizeVideoUnderstandingStory(value, index) {
  const source = isObject(value) ? value : {};
  return {
    ...source,
    candidateId: cleanString(source.candidateId) ?? `story-${index + 1}`,
    title: cleanString(source.title) ?? `요리 흐름 ${index + 1}`,
    plainStory: cleanString(source.plainStory ?? source.story ?? source.summary) ?? "",
    timeRange: normalizeTimeRange(source.timeRange),
    mainIngredients: normalizeStringArray(source.mainIngredients ?? source.ingredients),
    stepOutline: normalizeStringArray(source.stepOutline ?? source.steps),
    sourceRefs: normalizeStringArray(source.sourceRefs ?? source.evidence),
    uncertainties: normalizeStringArray(source.uncertainties),
    confidence: Math.max(0, Math.min(1, optionalNumber(source.confidence, 0.4))),
  };
}

export function normalizeVideoUnderstanding(value, { videoId = null } = {}) {
  const parsed = parsePiRawOutput(value) ?? {};
  const dishStories = Array.isArray(parsed.dishStories)
    ? parsed.dishStories
    : Array.isArray(parsed.recipes)
      ? parsed.recipes
      : [];
  return {
    ...parsed,
    schemaVersion: 1,
    kind: "video-understanding",
    videoId: cleanString(parsed.videoId) ?? videoId,
    globalStory: cleanString(parsed.globalStory ?? parsed.summary) ?? "",
    dishStories: dishStories.map(normalizeVideoUnderstandingStory),
    crossDishNotes: normalizeStringArray(parsed.crossDishNotes),
    uncertainties: normalizeStringArray(parsed.uncertainties ?? parsed.globalUncertainties),
  };
}

export function validateVideoUnderstanding(understanding) {
  const errors = [];
  if (!isObject(understanding)) return ["video understanding must be an object"];
  if (!Array.isArray(understanding.dishStories)) return ["video understanding dishStories must be an array"];
  understanding.dishStories.forEach((story, storyIndex) => {
    if (!cleanString(story.candidateId)) errors.push(`dishStories[${storyIndex}].candidateId is required`);
    if (!cleanString(story.title)) errors.push(`dishStories[${storyIndex}].title is required`);
    if (!Array.isArray(story.mainIngredients)) errors.push(`dishStories[${storyIndex}].mainIngredients must be an array`);
    if (!Array.isArray(story.stepOutline)) errors.push(`dishStories[${storyIndex}].stepOutline must be an array`);
    if (!Array.isArray(story.sourceRefs)) errors.push(`dishStories[${storyIndex}].sourceRefs must be an array`);
  });
  return errors;
}

export function assertValidVideoUnderstanding(understanding) {
  const errors = validateVideoUnderstanding(understanding);
  if (errors.length) {
    throw new Error(`Pi video understanding schema validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function normalizeRecipeBoundaryTimeRange(value, candidateIds, candidateById) {
  const explicit = normalizeTimeRange(value);
  const candidateRanges = candidateIds
    .map((candidateId) => candidateById.get(candidateId)?.timeRange)
    .filter(Boolean);
  const starts = candidateRanges
    .map((range) => optionalNumber(range?.startSec, null))
    .filter((second) => second !== null);
  const ends = candidateRanges
    .map((range) => optionalNumber(range?.endSec, null))
    .filter((second) => second !== null);
  return {
    startSec: explicit?.startSec ?? (starts.length ? Math.min(...starts) : null),
    endSec: explicit?.endSec ?? (ends.length ? Math.max(...ends) : null),
    basis: explicit?.basis ?? (candidateRanges.length ? "recipe-boundary-merged-candidates" : "inferred"),
  };
}

function normalizeRecipeBoundaryUnit(value, index, { candidateById }) {
  const source = isObject(value) ? value : {};
  const candidateIds = normalizeStringArray(source.candidateIds ?? source.sourceCandidateIds ?? source.recipeSourceCandidateIds);
  const firstCandidate = candidateById.get(candidateIds[0]) ?? null;
  return {
    ...source,
    recipeUnitId: cleanString(source.recipeUnitId ?? source.unitId ?? source.candidateId) ?? `r${index + 1}`,
    title: cleanString(source.title) ?? cleanString(firstCandidate?.title) ?? `레시피 ${index + 1}`,
    candidateIds,
    timeRange: normalizeRecipeBoundaryTimeRange(source.timeRange, candidateIds, candidateById),
    dishIdentityEvidence: normalizeStringArray(source.dishIdentityEvidence ?? source.evidence ?? source.sourceRefs),
    stageSummary: normalizeStringArray(source.stageSummary ?? source.stages ?? source.stepOutline),
    reason: cleanString(source.reason),
    confidence: Math.max(0, Math.min(1, optionalNumber(source.confidence, 0.4))),
  };
}

function normalizeSkippedBoundaryCandidate(value) {
  const source = isObject(value) ? value : { candidateId: value };
  return {
    ...source,
    candidateId: cleanString(source.candidateId),
    reasonCode: cleanString(source.reasonCode) ?? "not_independent_recipe",
    reason: cleanString(source.reason),
    evidence: normalizeStringArray(source.evidence ?? source.sourceRefs),
  };
}

export function normalizeRecipeBoundaryPlan(value, { videoId = null, candidates = [] } = {}) {
  const parsed = parsePiRawOutput(value) ?? {};
  const candidateById = new Map((candidates ?? [])
    .map((candidate) => [cleanString(candidate?.candidateId), candidate])
    .filter(([candidateId]) => candidateId));
  const recipeUnits = Array.isArray(parsed.recipeUnits)
    ? parsed.recipeUnits
    : Array.isArray(parsed.units)
      ? parsed.units
      : [];
  const skippedCandidates = Array.isArray(parsed.skippedCandidates)
    ? parsed.skippedCandidates
    : Array.isArray(parsed.skipped)
      ? parsed.skipped
      : [];
  return {
    ...parsed,
    schemaVersion: 1,
    kind: "recipe-boundary-plan",
    videoId: cleanString(parsed.videoId) ?? videoId,
    recipeUnits: recipeUnits.map((unit, index) => normalizeRecipeBoundaryUnit(unit, index, { candidateById })),
    skippedCandidates: skippedCandidates.map(normalizeSkippedBoundaryCandidate).filter((candidate) => candidate.candidateId),
    uncertainties: normalizeStringArray(parsed.uncertainties),
  };
}

export function validateRecipeBoundaryPlan(plan, {
  allowedCandidateIds = [],
  allowedEvidenceRefs = null,
} = {}) {
  const errors = [];
  if (!isObject(plan)) return ["recipe boundary plan must be an object"];
  if (!Array.isArray(plan.recipeUnits)) return ["recipe boundary plan recipeUnits must be an array"];
  if (!Array.isArray(plan.skippedCandidates)) return ["recipe boundary plan skippedCandidates must be an array"];

  const candidateOrder = new Map((allowedCandidateIds ?? []).map((candidateId, index) => [candidateId, index]));
  const knownCandidates = new Set(allowedCandidateIds ?? []);
  const allowedRefs = allowedEvidenceRefs ? new Set(allowedEvidenceRefs) : null;
  const seen = new Map();
  const markCandidate = (candidateId, path) => {
    if (!candidateId) {
      errors.push(`${path} candidateId is required`);
      return;
    }
    if (!knownCandidates.has(candidateId)) {
      errors.push(`${path} unknown candidateId: ${candidateId}`);
    }
    if (seen.has(candidateId)) {
      errors.push(`${path} duplicate candidate assignment: ${candidateId}`);
    } else {
      seen.set(candidateId, path);
    }
  };
  const checkEvidence = (refs, path) => {
    if (!allowedRefs) return;
    for (const ref of refs ?? []) {
      if (!allowedRefs.has(ref)) errors.push(`${path} invalid evidence ref: ${ref}`);
    }
  };

  let previousUnitFirstIndex = -1;
  plan.recipeUnits.forEach((unit, unitIndex) => {
    const path = `recipeUnits[${unitIndex}]`;
    if (!cleanString(unit.recipeUnitId)) errors.push(`${path}.recipeUnitId is required`);
    if (!Array.isArray(unit.candidateIds) || unit.candidateIds.length === 0) {
      errors.push(`${path}.candidateIds must contain at least one candidate`);
    }
    let previousInsideUnitIndex = -1;
    let firstInsideUnitIndex = null;
    for (const candidateId of unit.candidateIds ?? []) {
      markCandidate(candidateId, `${path}.candidateIds`);
      const candidateIndex = candidateOrder.get(candidateId);
      if (candidateIndex === undefined) continue;
      if (firstInsideUnitIndex === null) firstInsideUnitIndex = candidateIndex;
      if (candidateIndex <= previousInsideUnitIndex) {
        errors.push(`${path}.candidateIds must stay in source order`);
      }
      previousInsideUnitIndex = candidateIndex;
    }
    if (firstInsideUnitIndex !== null && firstInsideUnitIndex <= previousUnitFirstIndex) {
      errors.push(`${path} must stay in source order`);
    }
    if (firstInsideUnitIndex !== null) previousUnitFirstIndex = firstInsideUnitIndex;
    checkEvidence(unit.dishIdentityEvidence, `${path}.dishIdentityEvidence`);
  });

  plan.skippedCandidates.forEach((candidate, skippedIndex) => {
    const path = `skippedCandidates[${skippedIndex}]`;
    markCandidate(candidate.candidateId, path);
    checkEvidence(candidate.evidence, `${path}.evidence`);
  });

  for (const candidateId of knownCandidates) {
    if (!seen.has(candidateId)) errors.push(`missing candidate assignment: ${candidateId}`);
  }
  return errors;
}

export function assertValidRecipeBoundaryPlan(plan, options = {}) {
  const errors = validateRecipeBoundaryPlan(plan, options);
  if (errors.length) {
    throw new Error(`Pi recipe boundary plan validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function videoUnderstandingAllowedRefs(holisticSourcePacket) {
  return new Set(uniqueStrings([
    ...(holisticSourcePacket?.refs ?? []),
    ...(holisticSourcePacket?.timelineEvents ?? []).map((entry) => entry.ref),
    ...(holisticSourcePacket?.candidateSourcePackets ?? []).flatMap((packet) => (
      packet.sourceEntries ?? []
    ).map((entry) => entry.ref)),
  ]));
}

function videoUnderstandingCandidateIds(holisticSourcePacket) {
  const ids = (holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [])
    .map((candidate) => cleanString(candidate.candidateId))
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function evaluateVideoUnderstandingStory(story, { allowedRefs, candidateIds }) {
  const reasons = [];
  const storyRefs = normalizeStringArray(story.sourceRefs);
  const supportedRefs = storyRefs.filter((ref) => allowedRefs.has(ref));
  if (candidateIds && !candidateIds.has(story.candidateId)) reasons.push("unknown_candidate_id");
  if ((story.plainStory ?? "").length < 8) reasons.push("plain_story_too_short");
  if (supportedRefs.length === 0) reasons.push("missing_supported_source_refs");
  if ((story.mainIngredients ?? []).length === 0 && (story.stepOutline ?? []).length === 0) {
    reasons.push("missing_ingredient_or_step_outline");
  }
  if (Number(story.confidence ?? 0) < 0.35) reasons.push("low_confidence");
  return {
    accepted: reasons.length === 0,
    reasons,
    supportedRefs,
  };
}

const KOREAN_PARTICLE_SUFFIXES = [
  "으로",
  "부터",
  "까지",
  "에게",
  "한테",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "로",
  "와",
  "과",
  "에",
  "의",
  "도",
  "만",
];

function textTokens(value) {
  return uniqueStrings(String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2));
}

function tokenVariants(token) {
  const normalized = cleanString(token);
  if (!normalized) return [];
  const variants = [normalized];
  for (const suffix of KOREAN_PARTICLE_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 2) {
      variants.push(normalized.slice(0, -suffix.length));
    }
  }
  return uniqueStrings(variants);
}

function entryTextMatches(entry, value) {
  const text = cleanString(entry?.text);
  if (!text || !cleanString(value)) return false;
  if (textMentions(text, value)) return true;
  const haystack = normalizeKey(text);
  return textTokens(value).some((token) => tokenVariants(token).some((variant) => {
    const needle = normalizeKey(variant);
    return needle.length >= 2 && haystack.includes(needle);
  }));
}

function pushUniqueEntry(entries, seen, entry) {
  const ref = cleanString(entry?.ref);
  if (!ref || seen.has(ref)) return;
  seen.add(ref);
  entries.push(entry);
}

function buildUnderstandingSourceIndex(holisticSourcePacket) {
  const entryByRef = new Map();
  const addEntry = (entry) => {
    const ref = cleanString(entry?.ref);
    if (!ref || entryByRef.has(ref)) return;
    entryByRef.set(ref, entry);
  };
  for (const entry of holisticSourcePacket?.entries ?? []) addEntry(entry);
  for (const entry of holisticSourcePacket?.timelineEvents ?? []) addEntry(entry);
  const candidateEntriesById = new Map();
  for (const packet of holisticSourcePacket?.candidateSourcePackets ?? []) {
    const candidateId = cleanString(packet?.candidateId);
    if (!candidateId) continue;
    const entries = [];
    const seen = new Set();
    for (const entry of packet.sourceEntries ?? []) {
      addEntry(entry);
      pushUniqueEntry(entries, seen, entry);
    }
    candidateEntriesById.set(candidateId, entries);
  }
  return { entryByRef, candidateEntriesById };
}

function entriesForUnderstandingStory(story, { entryByRef, candidateEntriesById }) {
  const entries = [];
  const seen = new Set();
  for (const ref of story.sourceRefs ?? []) {
    pushUniqueEntry(entries, seen, entryByRef.get(ref));
  }
  for (const entry of candidateEntriesById.get(story.candidateId) ?? []) {
    pushUniqueEntry(entries, seen, entry);
  }
  return entries.filter((entry) => entry?.type !== "frame");
}

function matchedEntryRefs(entries, value) {
  return entries.filter((entry) => entryTextMatches(entry, value)).map((entry) => entry.ref);
}

export function auditVideoUnderstandingAlignment(videoUnderstanding, holisticSourcePacket, {
  candidateInjectionDisabled = false,
} = {}) {
  const allowedRefs = videoUnderstandingAllowedRefs(holisticSourcePacket);
  const candidateIds = videoUnderstandingCandidateIds(holisticSourcePacket);
  const sourceIndex = buildUnderstandingSourceIndex(holisticSourcePacket);
  const storyAudits = (videoUnderstanding?.dishStories ?? []).map((story) => {
    const evaluation = evaluateVideoUnderstandingStory(story, { allowedRefs, candidateIds });
    const storyRefs = normalizeStringArray(story.sourceRefs);
    const sourceEntries = entriesForUnderstandingStory(story, sourceIndex);
    const supportedMainIngredients = [];
    const unsupportedMainIngredients = [];
    for (const ingredient of story.mainIngredients ?? []) {
      if (matchedEntryRefs(sourceEntries, ingredient).length > 0) {
        supportedMainIngredients.push(ingredient);
      } else {
        unsupportedMainIngredients.push(ingredient);
      }
    }
    const stepAlignment = (story.stepOutline ?? []).map((step) => {
      const matchedRefs = matchedEntryRefs(sourceEntries, step);
      return {
        step,
        status: matchedRefs.length > 0 ? "source-aligned" : evaluation.supportedRefs.length > 0 ? "weak" : "unsupported",
        matchedRefs,
      };
    });
    const revisionNotes = [];
    if (unsupportedMainIngredients.length > 0) {
      revisionNotes.push(`source에서 확인되지 않는 재료는 draft에서 확정하지 않는다: ${unsupportedMainIngredients.join(", ")}`);
    }
    if (stepAlignment.some((step) => step.status !== "source-aligned")) {
      revisionNotes.push("source와 약하게만 맞는 stepOutline은 확정 단계가 아니라 uncertainty 또는 visualNeeds 후보로 둔다.");
    }
    const unsupportedRefs = storyRefs.filter((ref) => !allowedRefs.has(ref));
    if (unsupportedRefs.length > 0) {
      revisionNotes.push(`허용되지 않은 sourceRef는 evidence로 쓰지 않는다: ${unsupportedRefs.join(", ")}`);
    }
    if (candidateInjectionDisabled) {
      revisionNotes.push("다중 후보 understanding 주입은 아직 비활성화되어 draft에는 방향키로 넣지 않는다.");
    }
    if (evaluation.reasons.length > 0) {
      revisionNotes.push(`understanding gate 실패 이유: ${evaluation.reasons.join(", ")}`);
    }
    const draftRole = evaluation.accepted && !candidateInjectionDisabled ? "orientation" : "log-only";
    return {
      candidateId: story.candidateId,
      title: story.title,
      draftRole,
      confidence: story.confidence,
      supportedRefs: evaluation.supportedRefs,
      unsupportedRefs,
      supportedMainIngredients,
      unsupportedMainIngredients,
      stepAlignment,
      revisionNotes: uniqueStrings(revisionNotes),
    };
  });
  const orientationStoryCount = storyAudits.filter((story) => story.draftRole === "orientation").length;
  return {
    schemaVersion: 1,
    kind: "video-understanding-audit",
    summary: {
      storyCount: storyAudits.length,
      orientationStoryCount,
      logOnlyStoryCount: storyAudits.length - orientationStoryCount,
      allowedRefCount: allowedRefs.size,
      candidateScoped: Boolean(candidateIds),
      candidateInjectionDisabled,
    },
    storyAudits,
  };
}

export function selectUsableVideoUnderstanding(videoUnderstanding, holisticSourcePacket, {
  forceLogOnly = false,
  logOnlyReason = "understanding_injection_disabled",
} = {}) {
  const allowedRefs = videoUnderstandingAllowedRefs(holisticSourcePacket);
  const candidateIds = videoUnderstandingCandidateIds(holisticSourcePacket);
  const multiCandidateInjectionDisabled = Boolean(candidateIds && candidateIds.size > 1);
  const injectionDisabled = multiCandidateInjectionDisabled || forceLogOnly;
  const audit = auditVideoUnderstandingAlignment(videoUnderstanding, holisticSourcePacket, {
    candidateInjectionDisabled: injectionDisabled,
  });
  const acceptedStories = [];
  const rejectedStories = [];
  for (const story of videoUnderstanding?.dishStories ?? []) {
    const evaluation = evaluateVideoUnderstandingStory(story, { allowedRefs, candidateIds });
    if (evaluation.accepted && !injectionDisabled) {
      acceptedStories.push({
        ...story,
        sourceRefs: evaluation.supportedRefs,
      });
    } else {
      rejectedStories.push({
        candidateId: story.candidateId,
        title: story.title,
        reasons: uniqueStrings([
          ...evaluation.reasons,
          ...(multiCandidateInjectionDisabled ? ["multi_candidate_understanding_injection_disabled"] : []),
          ...(forceLogOnly ? [logOnlyReason] : []),
        ]),
        sourceRefs: story.sourceRefs,
      });
    }
  }
  const usable = acceptedStories.length > 0;
  return {
    understanding: {
      ...videoUnderstanding,
      dishStories: acceptedStories,
      uncertainties: uniqueStrings([
        ...(videoUnderstanding?.uncertainties ?? []),
        ...(usable ? [] : ["video understanding was not injected into draft because no story passed the source-backed quality gate"]),
      ]),
    },
    usage: {
      schemaVersion: 1,
      kind: "video-understanding-usage",
      usable,
      acceptedStoryCount: acceptedStories.length,
      rejectedStoryCount: rejectedStories.length,
      rejectedStories,
      allowedRefCount: allowedRefs.size,
      candidateScoped: Boolean(candidateIds),
      reason: usable
        ? "source-backed video understanding stories will be used as draft orientation"
        : multiCandidateInjectionDisabled
          ? "video understanding was logged but not injected because multi-candidate story injection is not yet reliable enough"
          : forceLogOnly
            ? "video understanding was logged but not injected because this run uses a log-only understanding gate"
        : "video understanding was skipped for draft orientation because every story failed the quality gate",
    },
    audit,
  };
}

function descriptionEntries(sourcePacket, maxEntries = 80) {
  return String(sourcePacket?.video?.description ?? "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .slice(0, maxEntries)
    .map((text, index) => ({
      ref: `description:${index + 1}`,
      type: "description",
      text,
    }));
}

function authorCommentEntries(sourcePacket, maxEntries = 10) {
  return (sourcePacket?.authorComments ?? [])
    .map((comment) => String(comment ?? "").replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .slice(0, maxEntries)
    .map((text, index) => ({
      ref: `author-comment:${index + 1}`,
      type: "author-comment",
      text,
    }));
}

function captionEntries(sourcePacket, maxEntries = 300) {
  return (sourcePacket?.captions?.segments ?? [])
    .filter((segment) => cleanString(segment?.text))
    .slice(0, maxEntries)
    .map((segment, index) => {
      const startSec = optionalNumber(Number(segment.startMs) / 1000, index);
      return {
        ref: `transcript:${Math.max(0, Math.round(startSec))}s`,
        type: "caption",
        text: String(segment.text).replace(/\s+/gu, " ").trim(),
        startSec,
      };
    });
}

function storyboardEntries(visualLedger, maxEntries = 24) {
  const groups = [];
  for (const candidate of visualLedger?.candidates ?? []) {
    const frames = [];
    for (const frame of candidate.frames ?? []) {
      const ref = cleanString(frame?.ref);
      if (!ref) continue;
      frames.push({
        ref,
        type: "frame",
        text: [
          ...(frame.observed ?? []).map((entry) => `observed:${entry}`),
          ...(frame.onscreenText ?? []).map((entry) => `onscreen:${entry}`),
          ...(frame.quantityCues ?? []).map((entry) => `quantity:${entry}`),
        ].join(" / "),
        observed: uniqueStrings(frame.observed ?? []),
        onscreenText: uniqueStrings(frame.onscreenText ?? []),
        quantityCues: uniqueStrings(frame.quantityCues ?? []),
        range: frame.range ?? null,
      });
    }
    if (frames.length > 0) groups.push(frames);
  }
  if (groups.length === 0) return [];
  const selected = [];
  const seen = new Set();
  const pushFrame = (frame) => {
    if (selected.length >= maxEntries || seen.has(frame.ref)) return;
    seen.add(frame.ref);
    selected.push(frame);
  };
  const perCandidateFloor = Math.max(1, Math.floor(maxEntries / groups.length));
  for (const group of groups) {
    for (const frame of group.slice(0, perCandidateFloor)) {
      pushFrame(frame);
    }
  }
  for (const group of groups) {
    for (const frame of group.slice(perCandidateFloor)) {
      pushFrame(frame);
    }
  }
  return selected;
}

function timelineEventEntries(videoTimeline, maxEntries = 40) {
  return (videoTimeline?.events ?? []).slice(0, maxEntries).map((event) => {
    const ref = `event:${event.eventId}`;
    const assignmentText = (event.candidateAssignments ?? [])
      .map((assignment) => `${assignment.candidateId}:${assignment.status}`)
      .join(" / ");
    return {
      ref,
      type: "timeline-event",
      text: [
        event.action,
        event.stateChange ? `state:${event.stateChange}` : null,
        (event.visibleIngredients ?? []).length ? `ingredients:${event.visibleIngredients.join(", ")}` : null,
        assignmentText ? `assignments:${assignmentText}` : null,
      ].filter(Boolean).join(" / "),
      timeRange: event.timeRange ?? null,
      evidence: event.evidence ?? [],
      candidateAssignments: event.candidateAssignments ?? [],
      visibleIngredients: event.visibleIngredients ?? [],
      onscreenText: event.onscreenText ?? [],
      quantityCues: event.quantityCues ?? [],
    };
  }).filter((entry) => cleanString(entry.text));
}

function entryInCandidateRange(entry, candidate) {
  if (entry?.type !== "caption") return false;
  const startSec = optionalNumber(entry.startSec, null);
  const rangeStart = optionalNumber(candidate?.timeRange?.startSec, null);
  const rangeEnd = optionalNumber(candidate?.timeRange?.endSec, null);
  if (startSec === null || rangeStart === null || rangeEnd === null) return false;
  return startSec >= rangeStart - 8 && startSec <= rangeEnd + 8;
}

function descriptionIndexFromRef(ref) {
  const match = String(ref ?? "").match(/^description:(\d+)$/u);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

function firstDescriptionEvidenceIndex(candidate) {
  return (candidate?.sourceEvidence ?? [])
    .map(descriptionIndexFromRef)
    .filter((index) => index !== null)
    .sort((left, right) => left - right)[0] ?? null;
}

function entryInCandidateDescriptionSection(entry, candidate, candidates) {
  if (entry?.type !== "description") return false;
  const entryIndex = descriptionIndexFromRef(entry.ref);
  const startIndex = firstDescriptionEvidenceIndex(candidate);
  if (entryIndex === null || startIndex === null || entryIndex < startIndex) return false;
  const nextStart = candidates
    .filter((other) => other?.candidateId !== candidate?.candidateId)
    .map(firstDescriptionEvidenceIndex)
    .filter((index) => index !== null && index > startIndex)
    .sort((left, right) => left - right)[0] ?? null;
  return nextStart === null ? true : entryIndex < nextStart;
}

function buildCandidateSourcePackets(entries, candidateTimelineIndex, maxEntriesPerCandidate = 48) {
  const candidates = candidateTimelineIndex?.candidates ?? [];
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const entryByRef = new Map(entries.map((entry) => [entry.ref, entry]));
  return candidates.map((candidate) => {
    const refs = new Set([
      "title",
      ...(candidate.sourceEvidence ?? []),
      ...(candidate.supportingEvents ?? []).map((eventId) => `event:${eventId}`),
      ...(candidate.unclearEvents ?? []).map((eventId) => `event:${eventId}`),
    ]);
    const selected = [];
    const seen = new Set();
    const push = (entry) => {
      if (!entry || seen.has(entry.ref) || selected.length >= maxEntriesPerCandidate) return;
      if (entry.type === "frame") return;
      seen.add(entry.ref);
      selected.push(entry);
    };
    for (const ref of refs) push(entryByRef.get(ref));
    for (const entry of entries) {
      if (entryInCandidateDescriptionSection(entry, candidate, candidates)) push(entry);
      if (entryInCandidateRange(entry, candidate)) push(entry);
    }
    return {
      candidateId: candidate.candidateId,
      title: candidate.title,
      timeRange: candidate.timeRange ?? null,
      supportingEvents: candidate.supportingEvents ?? [],
      unclearEvents: candidate.unclearEvents ?? [],
      sourceEntries: selected,
    };
  });
}

export function buildHolisticSourcePacket(sourcePacket, visualLedger = null, {
  maxDescriptionEntries = 80,
  maxCaptionEntries = 300,
  maxFrameEntries = 24,
  includeStoryboardEntries = true,
  videoTimeline = null,
  candidateTimelineIndex = null,
  maxTimelineEvents = 40,
} = {}) {
  const entries = [
    {
      ref: "title",
      type: "title",
      text: sourcePacket?.video?.title ?? "",
    },
    ...descriptionEntries(sourcePacket, maxDescriptionEntries),
    ...authorCommentEntries(sourcePacket),
    ...captionEntries(sourcePacket, maxCaptionEntries),
    ...timelineEventEntries(videoTimeline, maxTimelineEvents),
    ...(includeStoryboardEntries ? storyboardEntries(visualLedger, maxFrameEntries) : []),
  ].filter((entry) => cleanString(entry.text) || entry.type === "frame");
  const timelineEvents = entries.filter((entry) => entry.type === "timeline-event");
  const candidateSourcePackets = buildCandidateSourcePackets(entries, candidateTimelineIndex);
  return {
    schemaVersion: 1,
    kind: "holistic-source-packet",
    video: sourcePacket.video,
    truncation: sourcePacket.truncation,
    entries,
    refs: entries.map((entry) => entry.ref),
    storyboard: entries.filter((entry) => entry.type === "frame"),
    videoTimeline: videoTimeline ? {
      schemaVersion: videoTimeline.schemaVersion,
      kind: videoTimeline.kind,
      videoId: videoTimeline.videoId,
      events: (videoTimeline.events ?? []).slice(0, maxTimelineEvents),
      summary: videoTimeline.summary ?? null,
    } : null,
    timelineEvents,
    candidateTimelineIndex: candidateTimelineIndex ?? null,
    candidateSourcePackets,
  };
}

export function buildVideoUnderstandingPrompt(holisticSourcePacket, { timelineMode = false } = {}) {
  const candidateTimelineIndex = holisticSourcePacket?.candidateTimelineIndex ?? null;
  const exampleCandidateId = candidateTimelineIndex?.candidates?.[0]?.candidateId ?? "whole";
  return [
    "너는 유튜브 레시피 영상을 한 번에 이해하기 위한 중간 메모를 쓰는 도우미다.",
    "목표: 최종 레시피를 바로 쓰지 말고, 영상 전체가 어떤 요리 흐름인지 사람 말로 먼저 정리한다.",
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    "- 아래 HOLISTIC_SOURCE_PACKET만 사용한다.",
    "- VIDEO_UNDERSTANDING은 다음 draft의 방향키일 뿐이다. 최종 evidence로 쓰이지 않는다.",
    "- 근거 없는 일반 레시피 지식으로 재료 양이나 단계를 채우지 마라.",
    "- 불확실한 내용은 uncertainties에 남긴다.",
    ...(timelineMode ? [
      "- CANDIDATE_SOURCE_PACKETS가 있으면 candidate별 묶음을 먼저 보고 요리 흐름을 나눈다.",
      "- candidateId는 CANDIDATE_TIMELINE_INDEX에 있는 값만 사용한다.",
    ] : []),
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "스키마:",
    JSON.stringify({
      globalStory: "영상 전체의 요리 흐름을 2~4문장으로 설명",
      dishStories: [{
        candidateId: exampleCandidateId,
        title: "요리명 또는 후보명",
        plainStory: "이 후보에서 실제로 무엇을 만드는지 쉬운 문장으로 설명",
        timeRange: { startSec: 0, endSec: 120, basis: "video-timeline|description|caption|inferred" },
        mainIngredients: ["주요 재료"],
        stepOutline: ["큰 조리 흐름 1", "큰 조리 흐름 2"],
        sourceRefs: ["description:1", "transcript:45s", "event:e1"],
        uncertainties: ["헷갈리는 지점"],
        confidence: 0.6,
      }],
      crossDishNotes: ["여러 레시피가 섞이는 경우의 구분 메모"],
      uncertainties: ["전체 영상 이해의 한계"],
    }, null, 2),
    "",
    ...(timelineMode ? [
      "[CANDIDATE_TIMELINE_INDEX]",
      JSON.stringify(candidateTimelineIndex ?? { candidates: [] }, null, 2),
      "",
      "[CANDIDATE_SOURCE_PACKETS]",
      JSON.stringify(holisticSourcePacket?.candidateSourcePackets ?? [], null, 2),
      "",
    ] : []),
    "[HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(holisticSourcePacket, null, 2),
  ].join("\n");
}

export function buildRecipeBoundaryPlanPrompt(holisticSourcePacket, {
  videoUnderstandingAudit = null,
} = {}) {
  const candidates = holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [];
  const exampleCandidateIds = candidates.slice(0, Math.min(2, candidates.length)).map((candidate) => candidate.candidateId);
  const exampleCandidateId = exampleCandidateIds[0] ?? "storyboard-1";
  return [
    "너는 유튜브 레시피 영상의 후보 구간들을 실제 레시피 단위로 묶는 도우미다.",
    "목표: 레시피를 쓰지 말고, 후보 구간(candidate)들이 같은 요리인지 다른 요리인지 판단해 recipe-boundary-plan JSON만 만든다.",
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    "- 아래 HOLISTIC_SOURCE_PACKET, CANDIDATE_TIMELINE_INDEX, CANDIDATE_SOURCE_PACKETS, VIDEO_UNDERSTANDING_AUDIT만 사용한다.",
    "- 이 단계에서 재료표, 재료양, 만들기 단계를 작성하지 마라. 오직 레시피 경계만 판단한다.",
    "- candidateId는 CANDIDATE_TIMELINE_INDEX에 있는 값만 사용한다.",
    "- 많은 candidate window가 하나의 레시피를 이룰 수 있다.",
    "- 시간 구간이 바뀌었다는 이유만으로 레시피를 나누지 마라.",
    "- 인접 후보가 애매하고 새 레시피 시작 신호가 없으면 하나의 recipeUnit으로 합쳐라.",
    "- 새 번호/새 제목/재료 묶음 초기화/두 번째 레시피 같은 명확한 신호가 있으면 recipeUnit을 분리하라.",
    "- 인트로, 아웃트로, 시식, 반복 설명, 광고성 구간은 recipeUnit으로 만들지 말고 skippedCandidates에 넣어라.",
    "- 모든 candidate는 recipeUnits[].candidateIds 또는 skippedCandidates[]에 정확히 한 번만 들어가야 한다.",
    "- evidence에는 아래 packet 안에 있는 source ref, event ref, frame ref만 넣어라.",
    "- 확실하지 않은 판단은 uncertainties에 남긴다.",
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "스키마:",
    JSON.stringify({
      recipeUnits: [{
        recipeUnitId: "r1",
        title: "실제 요리명",
        candidateIds: exampleCandidateIds.length > 0 ? exampleCandidateIds : [exampleCandidateId],
        timeRange: { startSec: 0, endSec: 120, basis: "recipe-boundary-plan" },
        dishIdentityEvidence: ["title", "description:1", "event:e1"],
        stageSummary: ["요리 흐름 요약 1", "요리 흐름 요약 2"],
        reason: "같은 요리가 인접 후보들에 걸쳐 이어진다.",
        confidence: 0.7,
      }],
      skippedCandidates: [{
        candidateId: exampleCandidateId,
        reasonCode: "intro_outro_or_repetition",
        reason: "독립 레시피가 아니라 반복 설명이다.",
        evidence: ["description:1"],
      }],
      uncertainties: [],
    }, null, 2),
    "",
    "[CANDIDATE_TIMELINE_INDEX]",
    JSON.stringify(holisticSourcePacket?.candidateTimelineIndex ?? { candidates: [] }, null, 2),
    "",
    "[CANDIDATE_SOURCE_PACKETS]",
    JSON.stringify(holisticSourcePacket?.candidateSourcePackets ?? [], null, 2),
    "",
    ...(videoUnderstandingAudit ? [
      "[VIDEO_UNDERSTANDING_AUDIT]",
      JSON.stringify(videoUnderstandingAudit, null, 2),
      "",
    ] : []),
    "[HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(holisticSourcePacket, null, 2),
  ].join("\n");
}

const AMOUNT_PATTERN = /([가-힣A-Za-z][가-힣A-Za-z0-9\s·()./-]{0,28}?)\s*([0-9]+(?:[./][0-9]+)?|[0-9]+(?:\.[0-9]+)?|반|한|두|세|네)\s*(큰술|작은술|스푼|티스푼|컵|개|g|kg|ml|L|장|대|쪽|줌|모|봉|팩|캔|알|마리|인분|줄|꼬집|조각|T|t)(?=$|[^가-힣A-Za-z0-9])/giu;
const AMOUNT_LINE_PREFIX_PATTERN = /^\s*[-*•]?\s*/u;

function amountBasisForSourceEntry(entry) {
  if (entry?.type === "caption" || entry?.type === "transcript") return "spoken";
  if (entry?.type === "frame") return "onscreen";
  return "stated";
}

function normalizeIngredientNameFromAmountMatch(value) {
  const text = cleanString(value);
  if (!text) return null;
  const withoutPrefix = text
    .replace(AMOUNT_LINE_PREFIX_PATTERN, "")
    .replace(/[:：,，/]+$/gu, "")
    .replace(/^(재료|양념|소스|선택|필수|마무리|토핑)\s*/u, "")
    .trim();
  if (!withoutPrefix || withoutPrefix.length > 24) return null;
  return withoutPrefix;
}

function extractAmountMemoryFromEntry(entry) {
  const text = cleanString(entry?.text);
  if (!text) return [];
  const memories = [];
  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.trim();
    if (!normalizedLine) continue;
    AMOUNT_PATTERN.lastIndex = 0;
    for (const match of normalizedLine.matchAll(AMOUNT_PATTERN)) {
      const name = normalizeIngredientNameFromAmountMatch(match[1]);
      if (!name) continue;
      memories.push({
        name,
        role: "unknown",
        memoryPriority: "supporting",
        amountCandidates: [{
          amount: match[2],
          unit: match[3],
          basis: amountBasisForSourceEntry(entry),
          evidence: [entry.ref].filter(Boolean),
        }],
        uncertainty: null,
      });
    }
  }
  return memories;
}

function mergeIngredientMemory(memories) {
  const byKey = new Map();
  for (const memory of memories) {
    const key = normalizeKey(memory.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name: memory.name,
        role: memory.role ?? "unknown",
        memoryPriority: memory.memoryPriority ?? "supporting",
        amountCandidates: memory.amountCandidates ?? [],
        evidence: uniqueStrings([
          ...(memory.evidence ?? []),
          ...(memory.amountCandidates ?? []).flatMap((candidate) => candidate.evidence ?? []),
        ]),
        uncertainty: memory.uncertainty ?? null,
      });
      continue;
    }
    existing.amountCandidates = [
      ...existing.amountCandidates,
      ...(memory.amountCandidates ?? []),
    ];
    existing.evidence = uniqueStrings([
      ...existing.evidence,
      ...(memory.evidence ?? []),
      ...(memory.amountCandidates ?? []).flatMap((candidate) => candidate.evidence ?? []),
    ]);
    if (memory.memoryPriority === "core") existing.memoryPriority = "core";
  }
  return [...byKey.values()].map((memory) => ({
    ...memory,
    amountCandidates: (memory.amountCandidates ?? []).slice(0, 4),
  })).slice(0, 24);
}

function buildStepMemoryFromPacket(candidatePacket) {
  const stageSummary = normalizeStringArray(candidatePacket?.stageSummary);
  const fromBoundary = stageSummary.map((stage, index) => ({
    order: index + 1,
    action: stage,
    stage: "boundary-summary",
    memoryPriority: "core",
    evidence: normalizeStringArray(candidatePacket?.boundaryEvidence),
  }));
  const fromEvents = (candidatePacket?.sourceEntries ?? [])
    .filter((entry) => entry?.type === "timeline-event")
    .map((entry, index) => ({
      order: fromBoundary.length + index + 1,
      action: compactText(entry.text, 140),
      stage: "timeline-event",
      memoryPriority: "core",
      evidence: uniqueStrings([entry.ref, ...(entry.evidence ?? [])]),
    }))
    .filter((step) => step.action);
  const seen = new Set();
  return [...fromBoundary, ...fromEvents].filter((step) => {
    const key = normalizeKey(step.action);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function visualNeedHintsFromMemory({ ingredientMemory, stepMemory, candidatePacket }) {
  const sourceRefs = new Set((candidatePacket?.sourceEntries ?? []).map((entry) => entry.ref).filter(Boolean));
  return ingredientMemory
    .filter((memory) => (memory.amountCandidates ?? []).length === 0 && memory.memoryPriority === "core")
    .slice(0, 3)
    .map((memory) => ({
      targetType: "ingredient_amount",
      ingredient: memory.name,
      reason: "recipe unit working memory has a core ingredient without source-backed amount",
      candidateTimeRange: candidatePacket?.timeRange ?? null,
      suggestedEvidence: uniqueStrings([
        ...memory.evidence,
        ...stepMemory.flatMap((step) => step.evidence ?? []),
      ]).filter((ref) => typeof ref === "string" && (sourceRefs.has(ref) || ref.startsWith("event:"))),
    }));
}

const GENERIC_VISUAL_DESCRIPTOR_PATTERN = /(?:초록색?|녹색|파란색?|파랑|노란색?|노랑|주황색?|빨간색?|붉은|갈색|검은색?|까만|하얀|흰색?|분홍색?|핑크|보라색?).{0,10}(?:채소|야채|재료|속재료|고명|묵|고기|소스|가루|토핑)|(?:속재료|고명류|채소류|야채류|고기류|소스류|가루류|토핑류|무언가|어떤\s*재료|재료\s*확인|미확인\s*재료)/u;

function isGenericVisualDescriptorName(value) {
  const text = cleanString(value);
  if (!text) return false;
  return GENERIC_VISUAL_DESCRIPTOR_PATTERN.test(text);
}

function sourceMentionsIngredientName(candidatePacket, name) {
  return (candidatePacket?.sourceEntries ?? [])
    .filter((entry) => entry?.type !== "frame")
    .some((entry) => textMentions(entry.text, name));
}

function nonFrameEvidence(evidence) {
  return normalizeStringArray(evidence).filter((ref) => !ref.startsWith("frame:"));
}

function ingredientIdentityStateFromMemory(memory, candidatePacket) {
  const surfaceName = cleanString(memory?.name);
  if (!surfaceName) return null;
  const genericDescriptor = isGenericVisualDescriptorName(surfaceName);
  const sourceEvidence = nonFrameEvidence(memory.evidence);
  const sourceNamed = !genericDescriptor && (sourceEvidence.length > 0 || sourceMentionsIngredientName(candidatePacket, surfaceName));
  const nameStatus = genericDescriptor
    ? "generic_visual_descriptor"
    : sourceNamed
    ? "source_named"
    : "unresolved";
  return {
    surfaceName,
    resolvedName: sourceNamed ? surfaceName : null,
    nameStatus,
    role: cleanString(memory.role) ?? null,
    evidence: normalizeStringArray(memory.evidence),
    finalNameAllowed: nameStatus !== "generic_visual_descriptor",
    ...(nameStatus !== "source_named" ? {
      unresolvedQuestion: genericDescriptor
        ? `${surfaceName}: 실제 재료명이 아니라 화면 묘사이므로 final 재료명으로 확정하지 않는다.`
        : `${surfaceName}: source-backed 이름인지 후속 확인 필요`,
    } : {}),
  };
}

function coreStepFlowFromMemory(unit) {
  return (unit?.stepMemory ?? [])
    .filter((step) => cleanString(step?.action))
    .map((step, index) => ({
      order: optionalNumber(step.order, index + 1),
      action: cleanString(step.action),
      basis: "source_or_step_memory",
      evidence: normalizeStringArray(step.evidence),
      ...(cleanString(step.stage) ? { stage: cleanString(step.stage) } : {}),
    }))
    .filter((step) => step.action)
    .slice(0, 12);
}

function sourceBackedAmountsFromIngredientMemory(ingredientMemory, {
  maxAmounts = 24,
  evidenceMax = 4,
} = {}) {
  const amounts = [];
  const seen = new Set();
  for (const memory of ingredientMemory ?? []) {
    const ingredient = cleanString(memory?.name);
    if (!ingredient) continue;
    for (const candidate of memory?.amountCandidates ?? []) {
      const amount = cleanString(candidate?.amount);
      const unit = cleanString(candidate?.unit);
      const amountBasis = cleanString(candidate?.amountBasis ?? candidate?.basis);
      if (!amount || !unit || !SOURCE_AMOUNT_BASIS.has(amountBasis)) continue;
      const evidence = normalizeStringArray([
        ...(candidate?.evidence ?? []),
        ...(memory?.evidence ?? []),
      ]).slice(0, evidenceMax);
      const key = [
        normalizeKey(ingredient),
        normalizeKey(amount),
        normalizeKey(unit),
        amountBasis,
        evidence.join("|"),
      ].join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      amounts.push({
        ingredient,
        amount,
        unit,
        amountBasis,
        evidence,
        preservePolicy: "preserve_or_explain",
      });
      if (amounts.length >= maxAmounts) return amounts;
    }
  }
  return amounts;
}

export function buildRecipeUnitUnderstandingState({
  recipeUnitWorkingMemory,
  holisticSourcePacket,
} = {}) {
  const candidatePackets = new Map((holisticSourcePacket?.candidateSourcePackets ?? [])
    .map((packet) => [packet.candidateId, packet]));
  const units = (recipeUnitWorkingMemory?.units ?? []).map((unit) => {
    const candidatePacket = candidatePackets.get(unit.recipeUnitId) ?? null;
    const ingredientIdentityState = (unit.ingredientMemory ?? [])
      .map((memory) => ingredientIdentityStateFromMemory(memory, candidatePacket))
      .filter(Boolean);
    const unresolvedIdentityQuestions = ingredientIdentityState
      .filter((entry) => entry.nameStatus !== "source_named")
      .map((entry) => ({
        surfaceName: entry.surfaceName,
        candidateNames: [],
        reason: entry.unresolvedQuestion,
      }));
    const sourceBackedAmounts = sourceBackedAmountsFromIngredientMemory(unit.ingredientMemory);
    return {
      recipeUnitId: unit.recipeUnitId,
      title: unit.title ?? null,
      sourceCandidateIds: normalizeStringArray(unit.sourceCandidateIds),
      timeRange: unit.timeRange ?? null,
      dishIdentity: {
        status: unit.dishIdentity?.summary ? "source_named" : "unresolved",
        name: cleanString(unit.title),
        summary: unit.dishIdentity?.summary ?? null,
        evidence: normalizeStringArray(unit.dishIdentity?.evidence),
        uncertainties: normalizeStringArray(unit.uncertainties),
      },
      ingredientIdentityState,
      coreStepFlow: coreStepFlowFromMemory(unit),
      sourceBackedAmounts,
      unresolvedIdentityQuestions,
    };
  });
  return {
    schemaVersion: 1,
    kind: "recipe-unit-understanding-state",
    videoId: cleanString(recipeUnitWorkingMemory?.videoId ?? holisticSourcePacket?.video?.videoId),
    units,
    summary: {
      unitCount: units.length,
      ingredientIdentityCount: units.reduce((sum, unit) => sum + unit.ingredientIdentityState.length, 0),
      genericVisualDescriptorCount: units.reduce(
        (sum, unit) => sum + unit.ingredientIdentityState.filter((entry) => entry.nameStatus === "generic_visual_descriptor").length,
        0,
      ),
      finalNameBlockedCount: units.reduce(
        (sum, unit) => sum + unit.ingredientIdentityState.filter((entry) => !entry.finalNameAllowed).length,
        0,
      ),
      unresolvedIdentityQuestionCount: units.reduce((sum, unit) => sum + unit.unresolvedIdentityQuestions.length, 0),
      sourceBackedAmountCount: units.reduce((sum, unit) => sum + unit.sourceBackedAmounts.length, 0),
    },
  };
}

function uniqueEntriesByRefForMap(entries) {
  const byRef = new Map();
  for (const entry of entries ?? []) {
    if (!entry?.ref || byRef.has(entry.ref)) continue;
    byRef.set(entry.ref, entry);
  }
  return [...byRef.values()];
}

function wholeVideoMapSourceEntries(holisticSourcePacket) {
  return uniqueEntriesByRefForMap([
    ...(holisticSourcePacket?.entries ?? []),
    ...(holisticSourcePacket?.timelineEvents ?? []),
    ...(holisticSourcePacket?.candidateSourcePackets ?? []).flatMap((packet) => packet.sourceEntries ?? []),
  ]);
}

function candidatePacketRefs(candidatePacket) {
  return new Set(uniqueStrings([
    ...(candidatePacket?.sourceEntries ?? []).map((entry) => entry?.ref),
    ...(candidatePacket?.supportingEvents ?? []).map((eventId) => `event:${eventId}`),
    ...(candidatePacket?.unclearEvents ?? []).map((eventId) => `event:${eventId}`),
    ...(candidatePacket?.boundaryEvidence ?? []),
  ]));
}

function suspiciousAmountIngredientReason(name, entry) {
  const text = cleanString(name);
  if (!text) return "empty_ingredient_name";
  const sourceType = cleanString(entry?.type);
  if (text.length > 24) return "ingredient_name_too_long";
  if (/[\n\r]/u.test(text)) return "ingredient_name_has_newline";
  if (/(?:하시는|거죠|그수|이제|그러면|주세요|입니다|했|하면|넣|섞|볶|굽|끓|해요|하셔|정도|그리고|살짝|이번엔|오늘은)/u.test(text)) {
    return "ingredient_name_looks_like_sentence";
  }
  if ((sourceType === "caption" || sourceType === "transcript") && /\s/u.test(text)) {
    const tokenCount = text.split(/\s+/u).filter(Boolean).length;
    if (tokenCount >= 3) return "spoken_amount_match_too_phrase_like";
    if (/(?:은|는|이|가|을|를|죠|요|다|고|서|면)$/u.test(text)) return "spoken_amount_name_has_sentence_particle";
  }
  return null;
}

function rawAmountCandidatesFromEntries(entries) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of entries ?? []) {
    const memories = extractAmountMemoryFromEntry(entry);
    for (const memory of memories) {
      for (const candidate of memory.amountCandidates ?? []) {
        const amount = cleanString(candidate.amount);
        const unit = cleanString(candidate.unit);
        const ingredient = cleanString(memory.name);
        const evidence = normalizeStringArray(candidate.evidence);
        const key = [entry?.ref, ingredient, amount, unit].join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        const item = {
          ingredient,
          amount,
          unit,
          amountBasis: candidate.basis ?? amountBasisForSourceEntry(entry),
          evidence,
          sourceType: entry?.type ?? null,
          sourceRef: entry?.ref ?? null,
          textSnippet: compactText(entry?.text, 160),
        };
        const rejectReason = suspiciousAmountIngredientReason(ingredient, entry);
        if (!ingredient || !amount || !unit || evidence.length === 0 || rejectReason) {
          rejected.push({
            ...item,
            reason: rejectReason ?? "missing_amount_unit_or_evidence",
          });
          continue;
        }
        accepted.push(item);
      }
    }
  }
  return { accepted, rejected };
}

function amountCandidateMatchesIngredient(candidate, ingredientName) {
  const candidateKey = normalizeKey(candidate?.ingredient);
  const ingredientKey = normalizeKey(ingredientName);
  if (!candidateKey || !ingredientKey) return false;
  return candidateKey === ingredientKey
    || textMentions(candidate?.ingredient, ingredientName)
    || textMentions(ingredientName, candidate?.ingredient);
}

function mapUnitById(recipeUnitUnderstandingState) {
  return new Map((recipeUnitUnderstandingState?.units ?? [])
    .map((unit) => [unit.recipeUnitId, unit]));
}

function mapUnitTitle(unitState, candidatePacket, candidateTimeline) {
  return cleanString(unitState?.title)
    ?? cleanString(candidatePacket?.title)
    ?? cleanString(candidateTimeline?.title)
    ?? "레시피";
}

function mapIngredientNames(unitState, unitAcceptedAmounts) {
  return uniqueStrings([
    ...(unitState?.ingredientIdentityState ?? [])
      .filter((entry) => entry?.nameStatus === "source_named" && entry?.finalNameAllowed !== false)
      .map((entry) => entry.resolvedName ?? entry.surfaceName),
    ...unitAcceptedAmounts.map((candidate) => candidate.ingredient),
  ]).slice(0, 30);
}

function knownAmountSlotFromCandidate(candidate) {
  return {
    status: "known",
    amount: candidate.amount,
    unit: candidate.unit,
    amountBasis: candidate.amountBasis,
    evidence: normalizeStringArray(candidate.evidence),
    reason: "raw source entry에서 ingredient/amount/unit이 다시 검증됨",
  };
}

function unknownAmountSlot(reason) {
  return {
    status: "unknown",
    amount: null,
    unit: null,
    amountBasis: null,
    evidence: [],
    reason,
  };
}

function mapStepSpine(unitState, candidatePacket) {
  const fromState = (unitState?.coreStepFlow ?? [])
    .map((step, index) => ({
      order: step.order ?? index + 1,
      text: cleanString(step.text ?? step.action),
      evidence: normalizeStringArray(step.evidence),
      confidence: optionalNumber(step.confidence, null),
    }))
    .filter((step) => step.text);
  if (fromState.length > 0) return fromState;
  return (candidatePacket?.stageSummary ?? [])
    .map((text, index) => ({
      order: index + 1,
      text: cleanString(text),
      evidence: normalizeStringArray(candidatePacket?.boundaryEvidence),
      confidence: null,
    }))
    .filter((step) => step.text);
}

function normalizeMapAmountSlot(slot) {
  const status = cleanString(slot?.status) ?? "unknown";
  return {
    status: ["known", "unknown", "visual_needed", "ambiguous"].includes(status) ? status : "unknown",
    amount: cleanString(slot?.amount),
    unit: cleanString(slot?.unit),
    amountBasis: cleanString(slot?.amountBasis),
    evidence: normalizeStringArray(slot?.evidence),
    reason: cleanString(slot?.reason),
  };
}

function normalizeMapIngredientSlot(slot) {
  const name = cleanString(slot?.name ?? slot?.ingredient);
  if (!name) return null;
  return {
    name,
    role: cleanString(slot?.role) ?? "unknown",
    evidence: normalizeStringArray(slot?.evidence),
    amountSlot: normalizeMapAmountSlot(slot?.amountSlot ?? slot),
  };
}

function normalizeMapUnit(unit) {
  const recipeUnitId = cleanString(unit?.recipeUnitId ?? unit?.candidateId);
  if (!recipeUnitId) return null;
  return {
    recipeUnitId,
    title: cleanString(unit?.title),
    sourceCandidateIds: normalizeStringArray(unit?.sourceCandidateIds ?? unit?.candidateIds),
    timeRange: normalizeTimeRange(unit?.timeRange),
    dishIntent: {
      name: cleanString(unit?.dishIntent?.name ?? unit?.title),
      evidence: normalizeStringArray(unit?.dishIntent?.evidence),
      reason: cleanString(unit?.dishIntent?.reason),
    },
    ingredientSlots: (unit?.ingredientSlots ?? unit?.ingredients ?? [])
      .map(normalizeMapIngredientSlot)
      .filter(Boolean),
    stepSpine: (unit?.stepSpine ?? unit?.steps ?? [])
      .map((step, index) => ({
        order: optionalNumber(step?.order, index + 1),
        text: cleanString(step?.text ?? step?.action),
        evidence: normalizeStringArray(step?.evidence),
        confidence: optionalNumber(step?.confidence, null),
      }))
      .filter((step) => step.text),
    visualGaps: (unit?.visualGaps ?? [])
      .map((gap) => ({
        targetType: cleanString(gap?.targetType) ?? "ingredient_amount",
        ingredient: cleanString(gap?.ingredient),
        reason: cleanString(gap?.reason),
        evidence: normalizeStringArray(gap?.evidence),
      }))
      .filter((gap) => gap.ingredient),
    rejectedAmountCandidates: (unit?.rejectedAmountCandidates ?? [])
      .map((candidate) => ({
        ingredient: cleanString(candidate?.ingredient),
        amount: cleanString(candidate?.amount),
        unit: cleanString(candidate?.unit),
        sourceRef: cleanString(candidate?.sourceRef),
        sourceType: cleanString(candidate?.sourceType),
        reason: cleanString(candidate?.reason),
        textSnippet: compactText(candidate?.textSnippet, 160),
      }))
      .filter((candidate) => candidate.ingredient || candidate.sourceRef),
    uncertainties: normalizeStringArray(unit?.uncertainties),
  };
}

export function buildWholeVideoRecipeMapFromInputs({
  holisticSourcePacket,
  recipeUnitUnderstandingState,
} = {}) {
  const allEntries = wholeVideoMapSourceEntries(holisticSourcePacket);
  const amountCandidates = rawAmountCandidatesFromEntries(allEntries);
  const unitStateById = mapUnitById(recipeUnitUnderstandingState);
  const candidatePackets = holisticSourcePacket?.candidateSourcePackets ?? [];
  const timelineById = new Map((holisticSourcePacket?.candidateTimelineIndex?.candidates ?? [])
    .map((candidate) => [candidate.candidateId, candidate]));
  const units = candidatePackets.map((candidatePacket) => {
    const recipeUnitId = candidatePacket.candidateId;
    const unitState = unitStateById.get(recipeUnitId) ?? null;
    const candidateRefs = candidatePacketRefs(candidatePacket);
    const unitAcceptedAmounts = amountCandidates.accepted
      .filter((candidate) => normalizeStringArray(candidate.evidence).some((ref) => candidateRefs.has(ref)));
    const unitRejectedAmounts = amountCandidates.rejected
      .filter((candidate) => normalizeStringArray(candidate.evidence).some((ref) => candidateRefs.has(ref)) || candidateRefs.has(candidate.sourceRef));
    const ingredientNames = mapIngredientNames(unitState, unitAcceptedAmounts);
    const ingredientSlots = ingredientNames.map((name) => {
      const amountCandidate = unitAcceptedAmounts.find((candidate) => amountCandidateMatchesIngredient(candidate, name));
      const identity = (unitState?.ingredientIdentityState ?? [])
        .find((entry) => amountCandidateMatchesIngredient({ ingredient: entry.resolvedName ?? entry.surfaceName }, name));
      return {
        name,
        role: identity?.role ?? "unknown",
        evidence: uniqueStrings([
          ...(identity?.evidence ?? []),
          ...(amountCandidate?.evidence ?? []),
        ]),
        amountSlot: amountCandidate
          ? knownAmountSlotFromCandidate(amountCandidate)
          : unknownAmountSlot("source packet 안에서 원본 amount/unit 근거를 재검증하지 못함"),
      };
    });
    const visualGaps = ingredientSlots
      .filter((slot) => slot.amountSlot.status !== "known")
      .map((slot) => ({
        targetType: "ingredient_amount",
        ingredient: slot.name,
        reason: "source-backed amount가 없어서 필요한 경우 visual estimate 후보로만 남긴다.",
        evidence: slot.evidence,
      }));
    return normalizeMapUnit({
      recipeUnitId,
      title: mapUnitTitle(unitState, candidatePacket, timelineById.get(recipeUnitId)),
      sourceCandidateIds: candidatePacket.recipeSourceCandidateIds ?? [recipeUnitId],
      timeRange: unitState?.timeRange ?? candidatePacket.timeRange,
      dishIntent: {
        name: mapUnitTitle(unitState, candidatePacket, timelineById.get(recipeUnitId)),
        evidence: uniqueStrings([
          ...(unitState?.dishIdentity?.evidence ?? []),
          ...(candidatePacket.boundaryEvidence ?? []),
        ]),
        reason: unitState?.dishIdentity?.summary ?? candidatePacket.boundaryReason ?? null,
      },
      ingredientSlots,
      stepSpine: mapStepSpine(unitState, candidatePacket),
      visualGaps,
      rejectedAmountCandidates: unitRejectedAmounts,
      uncertainties: [
        ...(unitState?.unresolvedIdentityQuestions ?? []).map((question) => question?.reason ?? question?.surfaceName ?? question).filter(Boolean),
      ],
    });
  }).filter(Boolean);
  return {
    schemaVersion: 1,
    kind: "whole-video-recipe-map",
    videoId: cleanString(recipeUnitUnderstandingState?.videoId ?? holisticSourcePacket?.video?.videoId),
    generationMode: "source-revalidated-deterministic",
    units,
    rejectedAmountCandidates: amountCandidates.rejected,
    summary: {
      unitCount: units.length,
      ingredientSlotCount: units.reduce((sum, unit) => sum + unit.ingredientSlots.length, 0),
      knownAmountSlotCount: units.reduce(
        (sum, unit) => sum + unit.ingredientSlots.filter((slot) => slot.amountSlot.status === "known").length,
        0,
      ),
      visualGapCount: units.reduce((sum, unit) => sum + unit.visualGaps.length, 0),
      rejectedAmountCandidateCount: amountCandidates.rejected.length,
    },
  };
}

export function normalizeWholeVideoRecipeMap(value, {
  holisticSourcePacket = null,
  recipeUnitUnderstandingState = null,
} = {}) {
  const parsed = parsePiRawOutput(value) ?? {};
  if (!Array.isArray(parsed.units) && holisticSourcePacket) {
    return buildWholeVideoRecipeMapFromInputs({ holisticSourcePacket, recipeUnitUnderstandingState });
  }
  const units = (parsed.units ?? parsed.recipeUnits ?? [])
    .map(normalizeMapUnit)
    .filter(Boolean);
  return {
    schemaVersion: optionalNumber(parsed.schemaVersion, 1),
    kind: "whole-video-recipe-map",
    videoId: cleanString(parsed.videoId ?? recipeUnitUnderstandingState?.videoId ?? holisticSourcePacket?.video?.videoId),
    generationMode: cleanString(parsed.generationMode) ?? "pi",
    units,
    rejectedAmountCandidates: (parsed.rejectedAmountCandidates ?? [])
      .map((candidate) => ({
        ingredient: cleanString(candidate?.ingredient),
        amount: cleanString(candidate?.amount),
        unit: cleanString(candidate?.unit),
        sourceRef: cleanString(candidate?.sourceRef),
        sourceType: cleanString(candidate?.sourceType),
        reason: cleanString(candidate?.reason),
        textSnippet: compactText(candidate?.textSnippet, 160),
      }))
      .filter((candidate) => candidate.ingredient || candidate.sourceRef),
    summary: {
      unitCount: units.length,
      ingredientSlotCount: units.reduce((sum, unit) => sum + unit.ingredientSlots.length, 0),
      knownAmountSlotCount: units.reduce(
        (sum, unit) => sum + unit.ingredientSlots.filter((slot) => slot.amountSlot.status === "known").length,
        0,
      ),
      visualGapCount: units.reduce((sum, unit) => sum + unit.visualGaps.length, 0),
      rejectedAmountCandidateCount: (parsed.rejectedAmountCandidates ?? []).length,
    },
  };
}

export function assertValidWholeVideoRecipeMap(map) {
  if (!isObject(map) || !Array.isArray(map.units)) {
    throw new Error("whole_video_recipe_map_invalid");
  }
  const seen = new Set();
  for (const unit of map.units) {
    if (!unit.recipeUnitId) throw new Error("whole_video_recipe_map_unit_id_missing");
    if (seen.has(unit.recipeUnitId)) throw new Error(`whole_video_recipe_map_duplicate_unit:${unit.recipeUnitId}`);
    seen.add(unit.recipeUnitId);
    if (!Array.isArray(unit.ingredientSlots)) throw new Error(`whole_video_recipe_map_ingredients_invalid:${unit.recipeUnitId}`);
    for (const slot of unit.ingredientSlots) {
      if (!slot.name) throw new Error(`whole_video_recipe_map_ingredient_name_missing:${unit.recipeUnitId}`);
      if (slot.amountSlot.status === "known" && (!slot.amountSlot.amount || !slot.amountSlot.unit)) {
        throw new Error(`whole_video_recipe_map_known_amount_missing:${unit.recipeUnitId}:${slot.name}`);
      }
    }
  }
  return true;
}

export function auditWholeVideoRecipeMap(map, {
  holisticSourcePacket,
} = {}) {
  const entries = wholeVideoMapSourceEntries(holisticSourcePacket);
  const rawAmounts = rawAmountCandidatesFromEntries(entries);
  const candidateRefUniverse = new Set((holisticSourcePacket?.candidateSourcePackets ?? [])
    .flatMap((packet) => [...candidatePacketRefs(packet)]));
  const acceptedByKey = new Set(rawAmounts.accepted.flatMap((candidate) => (
    normalizeStringArray(candidate.evidence).map((ref) => [
      normalizeKey(candidate.ingredient),
      normalizeKey(candidate.amount),
      normalizeKey(candidate.unit),
      ref,
    ].join("::"))
  )));
  const warnings = [];
  const expectedUnitIds = new Set((holisticSourcePacket?.candidateSourcePackets ?? [])
    .map((packet) => packet.candidateId)
    .filter(Boolean));
  const mapUnitIds = new Set((map?.units ?? [])
    .map((unit) => unit.recipeUnitId)
    .filter(Boolean));
  for (const expectedUnitId of expectedUnitIds) {
    if (mapUnitIds.has(expectedUnitId)) continue;
    warnings.push({
      type: "map_unit_missing_candidate_packet",
      recipeUnitId: expectedUnitId,
      reason: "candidate source packet에는 recipe unit이 있지만 whole-video map에는 없다.",
    });
  }
  for (const mapUnitId of mapUnitIds) {
    if (expectedUnitIds.has(mapUnitId)) continue;
    warnings.push({
      type: "map_unit_extra",
      recipeUnitId: mapUnitId,
      reason: "whole-video map에만 있고 candidate source packet에는 없는 recipe unit이다.",
    });
  }
  for (const rejected of rawAmounts.rejected) {
    warnings.push({
      type: "rejected_suspicious_amount_candidate",
      ingredient: rejected.ingredient,
      amount: rejected.amount,
      unit: rejected.unit,
      sourceRef: rejected.sourceRef,
      reason: rejected.reason,
      textSnippet: rejected.textSnippet,
    });
  }
  for (const accepted of rawAmounts.accepted) {
    const refs = normalizeStringArray(accepted.evidence);
    if (refs.length > 0 && !refs.some((ref) => candidateRefUniverse.has(ref)) && accepted.sourceRef !== "title") {
      warnings.push({
        type: "source_amount_not_in_candidate_packet",
        ingredient: accepted.ingredient,
        amount: accepted.amount,
        unit: accepted.unit,
        sourceRef: accepted.sourceRef,
        reason: "top-level source에는 amount가 있지만 후보 source packet에는 포함되지 않았다.",
      });
    }
  }
  for (const unit of map?.units ?? []) {
    for (const slot of unit.ingredientSlots ?? []) {
      if (slot.amountSlot?.status !== "known") continue;
      const keys = normalizeStringArray(slot.amountSlot.evidence).map((ref) => [
        normalizeKey(slot.name),
        normalizeKey(slot.amountSlot.amount),
        normalizeKey(slot.amountSlot.unit),
        ref,
      ].join("::"));
      if (!keys.some((key) => acceptedByKey.has(key))) {
        warnings.push({
          type: "known_amount_without_valid_raw_evidence",
          recipeUnitId: unit.recipeUnitId,
          ingredient: slot.name,
          amount: slot.amountSlot.amount,
          unit: slot.amountSlot.unit,
          evidence: slot.amountSlot.evidence,
          reason: "whole-video map의 known amount가 원본 source entry 재검증을 통과하지 못했다.",
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    kind: "whole-video-recipe-map-audit",
    videoId: map?.videoId ?? holisticSourcePacket?.video?.videoId ?? null,
    warnings,
    summary: {
      warningCount: warnings.length,
      sourceAmountCandidateCount: rawAmounts.accepted.length,
      rejectedAmountCandidateCount: rawAmounts.rejected.length,
      candidatePacketSourceRefCount: candidateRefUniverse.size,
      passed: warnings.filter((warning) => [
        "known_amount_without_valid_raw_evidence",
        "map_unit_missing_candidate_packet",
        "map_unit_extra",
      ].includes(warning.type)).length === 0,
    },
  };
}

export function buildWholeVideoRecipeMapPrompt({
  holisticSourcePacket,
  recipeBoundaryPlan,
  recipeUnitWorkingMemory,
  recipeUnitUnderstandingState,
  videoUnderstandingAudit,
} = {}) {
  return [
    "너는 유튜브 레시피 영상 전체를 먼저 이해해 recipe map을 만드는 도우미다.",
    "목표: final recipe를 쓰지 말고, 전체 영상에서 각 recipe unit의 요리 정체성, 검증된 수량, 아직 비어 있는 수량, 핵심 조리 흐름만 지도처럼 정리한다.",
    "",
    "중요한 제한:",
    "- golden.json, grade, 이전 result, 비교 HTML을 절대 읽지 마라.",
    "- recipe-unit-understanding-state의 sourceBackedAmounts를 그대로 복사하지 말고, 아래 HOLISTIC_SOURCE_PACKET의 원본 source entry에서 ingredient/amount/unit/evidence를 다시 확인해 known amount로 올려라.",
    "- 자막/음성에서 문장 일부가 재료명처럼 잘린 amount 후보는 rejectedAmountCandidates에 넣고 known amount로 쓰지 마라.",
    "- 후보 source packet에서 빠진 top-level description/comment 수량은 known으로 단정하지 말고 uncertainties 또는 rejected/gap에 남겨라.",
    "- amount가 source로 검증되지 않으면 unknown 또는 visual_needed로 남긴다. 일반 레시피 지식으로 채우지 않는다.",
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "스키마:",
    JSON.stringify({
      units: [{
        recipeUnitId: "r1",
        title: "요리명",
        sourceCandidateIds: ["storyboard-1"],
        timeRange: { startSec: 0, endSec: 120, basis: "recipe-boundary-plan" },
        dishIntent: { name: "요리명", evidence: ["title", "description:1"], reason: "근거 요약" },
        ingredientSlots: [{
          name: "재료명",
          role: "main|seasoning|garnish|unknown",
          evidence: ["description:1"],
          amountSlot: {
            status: "known|unknown|visual_needed|ambiguous",
            amount: "100 또는 null",
            unit: "g 또는 null",
            amountBasis: "stated|spoken|onscreen|null",
            evidence: ["description:1"],
            reason: "왜 이렇게 판단했는지",
          },
        }],
        stepSpine: [{ order: 1, text: "핵심 조리 흐름", evidence: ["event:e1"], confidence: 0.7 }],
        visualGaps: [{ targetType: "ingredient_amount", ingredient: "재료명", reason: "source 수량 없음", evidence: ["event:e1"] }],
        rejectedAmountCandidates: [{ ingredient: "잘못 잘린 이름", amount: "30", unit: "g", sourceRef: "transcript:30s", reason: "문장 일부" }],
        uncertainties: [],
      }],
      rejectedAmountCandidates: [],
    }, null, 2),
    "",
    "[RECIPE_BOUNDARY_PLAN]",
    JSON.stringify(recipeBoundaryPlan ?? null, null, 2),
    "",
    "[RECIPE_UNIT_WORKING_MEMORY]",
    JSON.stringify(recipeUnitWorkingMemory ?? null, null, 2),
    "",
    "[RECIPE_UNIT_UNDERSTANDING_STATE]",
    JSON.stringify(recipeUnitUnderstandingState ?? null, null, 2),
    "",
    ...(videoUnderstandingAudit ? [
      "[VIDEO_UNDERSTANDING_AUDIT]",
      JSON.stringify(videoUnderstandingAudit, null, 2),
      "",
    ] : []),
    "[HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(holisticSourcePacket, null, 2),
  ].join("\n");
}

export function buildCandidateRecipeMapContract(wholeVideoRecipeMap, candidateId, {
  maxBytes = 1400,
} = {}) {
  const unit = (wholeVideoRecipeMap?.units ?? []).find((item) => item.recipeUnitId === candidateId);
  if (!unit) {
    return {
      contract: null,
      bytes: 0,
      maxBytes,
      budgetExceeded: false,
      truncated: false,
      source: "whole-video-recipe-map",
    };
  }
  const compact = {
    schemaVersion: 1,
    kind: "recipe-map-contract",
    source: "whole-video-recipe-map",
    recipeUnitId: unit.recipeUnitId,
    title: unit.title,
    sourceCandidateIds: unit.sourceCandidateIds,
    timeRange: unit.timeRange,
    dishIntent: unit.dishIntent,
    knownAmountSlots: unit.ingredientSlots
      .filter((slot) => slot.amountSlot?.status === "known")
      .map((slot) => ({
        name: slot.name,
        amount: slot.amountSlot.amount,
        unit: slot.amountSlot.unit,
        amountBasis: slot.amountSlot.amountBasis,
        evidence: truncateRefs(slot.amountSlot.evidence, 4),
      })),
    unknownAmountSlots: unit.ingredientSlots
      .filter((slot) => slot.amountSlot?.status !== "known")
      .map((slot) => ({
        name: slot.name,
        status: slot.amountSlot?.status ?? "unknown",
        evidence: truncateRefs(slot.evidence, 4),
        reason: slot.amountSlot?.reason ?? null,
      })),
    stepSpine: unit.stepSpine.slice(0, 12).map((step) => ({
      order: step.order,
      text: step.text,
      evidence: truncateRefs(step.evidence, 4),
    })),
    visualGaps: unit.visualGaps.slice(0, 12),
    uncertainties: unit.uncertainties,
  };
  const bytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
  return {
    contract: compact,
    bytes,
    maxBytes,
    budgetExceeded: bytes > maxBytes,
    truncated: false,
    source: "whole-video-recipe-map",
  };
}

export function auditCandidateMapAdherence(finalOutput, wholeVideoRecipeMap) {
  const warnings = [];
  let checkedKnownAmountCount = 0;
  let preservedKnownAmountCount = 0;
  let checkedStepSpineCount = 0;
  let preservedStepSpineCount = 0;
  for (const unit of wholeVideoRecipeMap?.units ?? []) {
    const recipe = (finalOutput?.recipes ?? []).find((item) => item.candidateId === unit.recipeUnitId) ?? null;
    if (!recipe) {
      warnings.push({
        type: "recipe_missing_for_map_unit",
        recipeUnitId: unit.recipeUnitId,
        reason: "whole-video map에는 recipe unit이 있지만 final draft에는 없다.",
      });
      continue;
    }
    for (const slot of unit.ingredientSlots ?? []) {
      if (slot.amountSlot?.status !== "known") continue;
      checkedKnownAmountCount += 1;
      const ingredient = (recipe.ingredients ?? []).find((item) => amountCandidateMatchesIngredient({ ingredient: item.name }, slot.name));
      if (ingredient && normalizeKey(ingredient.amount) === normalizeKey(slot.amountSlot.amount) && normalizeKey(ingredient.unit) === normalizeKey(slot.amountSlot.unit)) {
        preservedKnownAmountCount += 1;
        continue;
      }
      warnings.push({
        type: ingredient ? "map_known_amount_changed" : "map_known_ingredient_missing",
        recipeUnitId: unit.recipeUnitId,
        ingredient: slot.name,
        expectedAmount: slot.amountSlot.amount,
        expectedUnit: slot.amountSlot.unit,
        actualAmount: ingredient?.amount ?? null,
        actualUnit: ingredient?.unit ?? null,
        reason: "RECIPE_MAP_CONTRACT의 known amount가 후보 draft에 보존되지 않았다.",
      });
    }
    for (const step of unit.stepSpine ?? []) {
      checkedStepSpineCount += 1;
      const matched = (recipe.steps ?? []).some((recipeStep) => (
        textMentions(recipeStep.text ?? recipeStep, step.text)
        || evidenceIntersects(step.evidence, recipeStep.evidence)
      ));
      if (matched) {
        preservedStepSpineCount += 1;
        continue;
      }
      warnings.push({
        type: "map_step_spine_missing",
        recipeUnitId: unit.recipeUnitId,
        step: step.text,
        evidence: step.evidence,
        reason: "RECIPE_MAP_CONTRACT의 stepSpine이 후보 draft steps에 반영되지 않았다.",
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "candidate-map-adherence-audit",
    videoId: wholeVideoRecipeMap?.videoId ?? finalOutput?.videoId ?? null,
    warnings,
    summary: {
      mapUnitCount: wholeVideoRecipeMap?.units?.length ?? 0,
      checkedKnownAmountCount,
      preservedKnownAmountCount,
      checkedStepSpineCount,
      preservedStepSpineCount,
      warningCount: warnings.length,
      passed: warnings.length === 0,
    },
  };
}

function truncateRefs(refs, maxRefs = 4) {
  return normalizeStringArray(refs).slice(0, maxRefs);
}

function recipeUnitUnderstandingPromptPayloadFromUnit(unit, {
  includeUnresolvedQuestions = true,
  includeBlockedReasons = true,
  allowedMax = 20,
  blockedMax = 20,
  sourceAmountMax = 16,
  coreStepMax = 12,
  evidenceMax = 4,
} = {}) {
  const ingredientStates = unit?.ingredientIdentityState ?? [];
  const allowedIngredientNames = ingredientStates
    .filter((entry) => entry?.nameStatus === "source_named" && entry?.finalNameAllowed !== false)
    .slice(0, allowedMax)
    .map((entry) => ({
      name: cleanString(entry.resolvedName ?? entry.surfaceName),
      status: "source_named",
      role: cleanString(entry.role) ?? null,
      evidence: truncateRefs(entry.evidence, evidenceMax),
    }))
    .filter((entry) => entry.name);
  const blockedIngredientNames = ingredientStates
    .filter((entry) => entry?.nameStatus === "generic_visual_descriptor" || entry?.finalNameAllowed === false)
    .slice(0, blockedMax)
    .map((entry) => ({
      surfaceName: cleanString(entry.surfaceName),
      ...(includeBlockedReasons ? {
        reason: cleanString(entry.unresolvedQuestion) ?? "실제 재료명이 아니라 화면 묘사이므로 final 재료명으로 확정하지 않는다.",
      } : {}),
    }))
    .filter((entry) => entry.surfaceName);
  const unresolvedIdentityQuestions = includeUnresolvedQuestions
    ? (unit?.unresolvedIdentityQuestions ?? [])
      .slice(0, 8)
      .map((question) => (
        typeof question === "string"
          ? question
          : cleanString(question?.reason) ?? cleanString(question?.surfaceName)
      ))
      .filter(Boolean)
    : [];
  const sourceBackedAmounts = (unit?.sourceBackedAmounts ?? [])
    .slice(0, sourceAmountMax)
    .map((entry) => ({
      ingredient: cleanString(entry?.ingredient),
      amount: cleanString(entry?.amount),
      unit: cleanString(entry?.unit),
      amountBasis: cleanString(entry?.amountBasis),
      evidence: truncateRefs(entry?.evidence, evidenceMax),
      preservePolicy: cleanString(entry?.preservePolicy) ?? "preserve_or_explain",
    }))
    .filter((entry) => entry.ingredient && entry.amount && entry.unit);
  return {
    kind: "candidate-recipe-unit-understanding-state-prompt",
    schemaVersion: 1,
    videoId: null,
    recipeUnitId: unit?.recipeUnitId ?? null,
    recipeSourceCandidateIds: normalizeStringArray(unit?.sourceCandidateIds),
    title: cleanString(unit?.title),
    dishIdentity: {
      status: cleanString(unit?.dishIdentity?.status) ?? "unresolved",
      name: cleanString(unit?.dishIdentity?.name),
      summary: cleanString(unit?.dishIdentity?.summary),
      evidence: truncateRefs(unit?.dishIdentity?.evidence, evidenceMax),
      uncertainties: normalizeStringArray(unit?.dishIdentity?.uncertainties).slice(0, 4),
    },
    coreStepFlow: (unit?.coreStepFlow ?? [])
      .filter((step) => cleanString(step?.action))
      .slice(0, coreStepMax)
      .map((step, index) => ({
        order: optionalNumber(step.order, index + 1),
        action: cleanString(step.action),
        evidence: truncateRefs(step.evidence, evidenceMax),
    })),
    allowedIngredientNames,
    blockedIngredientNames,
    sourceBackedAmounts,
    unresolvedIdentityQuestions,
  };
}

function payloadBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function buildCandidateRecipeUnitUnderstandingPromptPayload(recipeUnitUnderstandingState, candidateId, {
  maxBytes = 4000,
} = {}) {
  if (!isObject(recipeUnitUnderstandingState) || !Array.isArray(recipeUnitUnderstandingState.units)) return null;
  const unit = recipeUnitUnderstandingState.units.find((item) => item?.recipeUnitId === candidateId);
  if (!unit) return null;
  const variants = [
    {},
    { includeUnresolvedQuestions: false },
    { includeUnresolvedQuestions: false, includeBlockedReasons: false },
    { includeUnresolvedQuestions: false, includeBlockedReasons: false, allowedMax: 12, blockedMax: 12, sourceAmountMax: 12, evidenceMax: 3 },
    { includeUnresolvedQuestions: false, includeBlockedReasons: false, allowedMax: 8, blockedMax: 8, sourceAmountMax: 8, coreStepMax: 10, evidenceMax: 2 },
    { includeUnresolvedQuestions: false, includeBlockedReasons: false, allowedMax: 4, blockedMax: 6, sourceAmountMax: 4, coreStepMax: 8, evidenceMax: 1 },
    { includeUnresolvedQuestions: false, includeBlockedReasons: false, allowedMax: 4, blockedMax: 4, sourceAmountMax: 2, coreStepMax: 4, evidenceMax: 0 },
  ];
  let selected = null;
  let truncated = false;
  for (const [index, variant] of variants.entries()) {
    const payload = recipeUnitUnderstandingPromptPayloadFromUnit(unit, variant);
    payload.videoId = recipeUnitUnderstandingState.videoId ?? null;
    const bytes = payloadBytes(payload);
    selected = { payload, bytes };
    truncated = index > 0;
    if (bytes <= maxBytes) break;
  }
  return {
    state: selected?.payload ?? null,
    bytes: selected?.bytes ?? 0,
    truncated,
    budgetExceeded: selected ? selected.bytes > maxBytes : false,
    maxBytes,
  };
}

function recipeUnitUnderstandingStateForPrompt(recipeUnitUnderstandingState, candidateId) {
  return buildCandidateRecipeUnitUnderstandingPromptPayload(recipeUnitUnderstandingState, candidateId)?.state ?? null;
}

function compactStoryAuditForIntegratedBrief(story, {
  evidenceMax = 1,
  ingredientMax = 4,
  stepMax = 4,
  revisionNoteMax = 2,
  includeWarnings = true,
} = {}) {
  const sourceAlignedSteps = (story?.stepAlignment ?? [])
    .filter((step) => cleanString(step?.step))
    .slice(0, stepMax)
    .map((step) => ({
      step: cleanString(step.step),
      status: cleanString(step.status) ?? "unknown",
      matchedRefs: truncateRefs(step.matchedRefs, evidenceMax),
    }));
  return {
    candidateId: cleanString(story?.candidateId),
    title: cleanString(story?.title),
    draftRole: cleanString(story?.draftRole),
    supportedRefs: truncateRefs(story?.supportedRefs, evidenceMax),
    supportedMainIngredients: normalizeStringArray(story?.supportedMainIngredients).slice(0, ingredientMax),
    stepAlignment: sourceAlignedSteps,
    ...(includeWarnings ? {
      warnings: {
        unsupportedMainIngredients: normalizeStringArray(story?.unsupportedMainIngredients).slice(0, ingredientMax),
        revisionNotes: normalizeStringArray(story?.revisionNotes).slice(0, revisionNoteMax),
      },
    } : {}),
  };
}

function candidateIntegratedBriefFromInputs({
  recipeUnitUnderstandingState,
  videoUnderstandingAudit,
  candidateId,
  recipeSourceCandidateIds = [],
  options = {},
}) {
  const {
    allowedMax = 6,
    blockedMax = 3,
    sourceAmountMax = 4,
    coreStepMax = 6,
    storyMax = 2,
    evidenceMax = 1,
    includeWarnings = true,
    includeBlocked = true,
  } = options;
  const unit = (recipeUnitUnderstandingState?.units ?? [])
    .find((item) => item?.recipeUnitId === candidateId) ?? null;
  const sourceIds = new Set(recipeSourceCandidateIds);
  const storyAudits = (videoUnderstandingAudit?.storyAudits ?? [])
    .filter((story) => story?.candidateId === candidateId || sourceIds.has(story?.candidateId))
    .filter((story) => (story?.supportedRefs ?? []).length > 0)
    .slice(0, storyMax)
    .map((story) => compactStoryAuditForIntegratedBrief(story, {
      evidenceMax,
      includeWarnings,
    }));
  const statePayload = unit
    ? recipeUnitUnderstandingPromptPayloadFromUnit(unit, {
      includeUnresolvedQuestions: false,
      includeBlockedReasons: includeBlocked,
      allowedMax,
      blockedMax,
      sourceAmountMax,
      coreStepMax,
      evidenceMax,
    })
    : null;
  if (!unit && storyAudits.length === 0) return null;
  return {
    kind: "candidate-integrated-brief",
    schemaVersion: 1,
    videoId: cleanString(recipeUnitUnderstandingState?.videoId),
    candidateId,
    recipeUnitId: candidateId,
    recipeSourceCandidateIds: normalizeStringArray(recipeSourceCandidateIds),
    source: "recipe-unit-state+understanding-audit",
    title: cleanString(unit?.title) ?? cleanString(storyAudits[0]?.title),
    dishIdentity: statePayload?.dishIdentity ?? null,
    sourceNamedIngredientNames: statePayload?.allowedIngredientNames ?? [],
    blockedIngredientNames: includeBlocked ? statePayload?.blockedIngredientNames ?? [] : [],
    sourceBackedAmounts: statePayload?.sourceBackedAmounts ?? [],
    coreStepFlow: statePayload?.coreStepFlow ?? [],
    understandingOrientation: {
      storyCount: storyAudits.length,
      rawStoryInjected: false,
      stories: storyAudits,
    },
    unresolvedIdentityQuestionCount: Array.isArray(unit?.unresolvedIdentityQuestions)
    ? unit.unresolvedIdentityQuestions.length
    : 0,
  };
}

function compactIntegratedBriefEntries(values, limit, mapEntry) {
  const entries = Array.isArray(values) ? values : [];
  return entries.slice(0, limit).map(mapEntry).filter(Boolean);
}

function trimCandidateIntegratedBriefToBudget(brief, maxBytes) {
  if (!brief) return null;
  const buildTrimmed = ({
    allowedMax,
    blockedMax,
    sourceAmountMax,
    coreStepMax,
    evidenceMax,
    textMax,
    includeDishIdentity = true,
    includeStories = false,
  }) => ({
    kind: brief.kind,
    schemaVersion: brief.schemaVersion,
    videoId: cleanString(brief.videoId),
    candidateId: cleanString(brief.candidateId),
    recipeUnitId: cleanString(brief.recipeUnitId),
    recipeSourceCandidateIds: normalizeStringArray(brief.recipeSourceCandidateIds),
    source: brief.source,
    title: compactText(brief.title, textMax),
    dishIdentity: includeDishIdentity && brief.dishIdentity ? {
      status: cleanString(brief.dishIdentity.status) ?? "unresolved",
      name: compactText(brief.dishIdentity.name, textMax),
      summary: compactText(brief.dishIdentity.summary, textMax),
      evidence: truncateRefs(brief.dishIdentity.evidence, evidenceMax),
    } : null,
    sourceNamedIngredientNames: compactIntegratedBriefEntries(
      brief.sourceNamedIngredientNames,
      allowedMax,
      (entry) => ({
        name: compactText(entry?.name, textMax),
        status: cleanString(entry?.status),
        role: compactText(entry?.role, Math.max(24, Math.floor(textMax / 2))),
        evidence: truncateRefs(entry?.evidence, evidenceMax),
      }),
    ).filter((entry) => entry.name),
    blockedIngredientNames: compactIntegratedBriefEntries(
      brief.blockedIngredientNames,
      blockedMax,
      (entry) => ({
        surfaceName: compactText(entry?.surfaceName, textMax),
      }),
    ).filter((entry) => entry.surfaceName),
    sourceBackedAmounts: compactIntegratedBriefEntries(
      brief.sourceBackedAmounts,
      sourceAmountMax,
      (entry) => ({
        ingredient: compactText(entry?.ingredient, textMax),
        amount: compactText(entry?.amount, 24),
        unit: compactText(entry?.unit, 24),
        amountBasis: cleanString(entry?.amountBasis),
        evidence: truncateRefs(entry?.evidence, evidenceMax),
        preservePolicy: cleanString(entry?.preservePolicy) ?? "preserve_or_explain",
      }),
    ).filter((entry) => entry.ingredient && entry.amount && entry.unit),
    coreStepFlow: compactIntegratedBriefEntries(
      brief.coreStepFlow,
      coreStepMax,
      (step, index) => ({
        order: optionalNumber(step?.order, index + 1),
        action: compactText(step?.action, textMax),
        evidence: truncateRefs(step?.evidence, evidenceMax),
      }),
    ).filter((step) => step.action),
    understandingOrientation: {
      storyCount: brief.understandingOrientation?.storyCount ?? 0,
      rawStoryInjected: false,
      stories: includeStories ? compactIntegratedBriefEntries(
        brief.understandingOrientation?.stories,
        1,
        (story) => compactStoryAuditForIntegratedBrief(story, {
          evidenceMax,
          ingredientMax: 2,
          stepMax: 2,
          revisionNoteMax: 1,
          includeWarnings: false,
        }),
      ) : [],
    },
    unresolvedIdentityQuestionCount: optionalNumber(brief.unresolvedIdentityQuestionCount, 0),
  });
  const variants = [
    { allowedMax: 4, blockedMax: 1, sourceAmountMax: 3, coreStepMax: 4, evidenceMax: 1, textMax: 90, includeDishIdentity: true, includeStories: false },
    { allowedMax: 3, blockedMax: 1, sourceAmountMax: 2, coreStepMax: 3, evidenceMax: 1, textMax: 70, includeDishIdentity: true, includeStories: false },
    { allowedMax: 2, blockedMax: 0, sourceAmountMax: 1, coreStepMax: 2, evidenceMax: 1, textMax: 60, includeDishIdentity: true, includeStories: false },
    { allowedMax: 1, blockedMax: 0, sourceAmountMax: 1, coreStepMax: 1, evidenceMax: 0, textMax: 50, includeDishIdentity: false, includeStories: false },
  ];
  let selected = null;
  for (const options of variants) {
    const trimmed = buildTrimmed(options);
    selected = trimmed;
    if (payloadBytes(trimmed) <= maxBytes) return trimmed;
  }
  return selected;
}

export function buildCandidateIntegratedBrief({
  recipeUnitUnderstandingState,
  videoUnderstandingAudit,
  candidateId,
  recipeSourceCandidateIds = [],
  maxBytes = 1400,
} = {}) {
  if (!cleanString(candidateId)) return null;
  const variants = [
    { allowedMax: 8, blockedMax: 4, sourceAmountMax: 4, coreStepMax: 6, storyMax: 2, evidenceMax: 1, includeWarnings: true, includeBlocked: true },
    { allowedMax: 6, blockedMax: 3, sourceAmountMax: 4, coreStepMax: 4, storyMax: 2, evidenceMax: 1, includeWarnings: true, includeBlocked: true },
    { allowedMax: 4, blockedMax: 2, sourceAmountMax: 2, coreStepMax: 4, storyMax: 1, evidenceMax: 1, includeWarnings: true, includeBlocked: true },
    { allowedMax: 3, blockedMax: 1, sourceAmountMax: 2, coreStepMax: 3, storyMax: 1, evidenceMax: 0, includeWarnings: false, includeBlocked: true },
    { allowedMax: 2, blockedMax: 0, sourceAmountMax: 1, coreStepMax: 2, storyMax: 1, evidenceMax: 0, includeWarnings: false, includeBlocked: false },
  ];
  let selected = null;
  let truncated = false;
  for (const [index, options] of variants.entries()) {
    const brief = candidateIntegratedBriefFromInputs({
      recipeUnitUnderstandingState,
      videoUnderstandingAudit,
      candidateId,
      recipeSourceCandidateIds,
      options,
    });
    if (!brief) return null;
    const bytes = payloadBytes(brief);
    selected = { brief, bytes };
    truncated = index > 0;
    if (bytes <= maxBytes) break;
  }
  if (selected?.brief && selected.bytes > maxBytes) {
    const trimmed = trimCandidateIntegratedBriefToBudget(selected.brief, maxBytes);
    selected = {
      brief: trimmed,
      bytes: payloadBytes(trimmed),
    };
    truncated = true;
  }
  return {
    brief: selected?.brief ?? null,
    bytes: selected?.bytes ?? 0,
    truncated,
    budgetExceeded: selected ? selected.bytes > maxBytes : false,
    maxBytes,
    source: "recipe-unit-state+understanding-audit",
  };
}

function storyAuditForRecipeUnit(videoUnderstandingAudit, candidateId, recipeSourceCandidateIds = []) {
  const sourceIds = new Set(recipeSourceCandidateIds);
  const storyAudits = (videoUnderstandingAudit?.storyAudits ?? [])
    .filter((story) => story?.candidateId === candidateId || sourceIds.has(story?.candidateId));
  return storyAudits.length ? storyAudits : [];
}

export function buildRecipeUnitWorkingMemory(holisticSourcePacket, {
  videoUnderstandingAudit = null,
} = {}) {
  const candidatePackets = holisticSourcePacket?.candidateSourcePackets ?? [];
  const units = candidatePackets.map((candidatePacket) => {
    const storyAudits = storyAuditForRecipeUnit(
      videoUnderstandingAudit,
      candidatePacket.candidateId,
      candidatePacket.recipeSourceCandidateIds ?? [],
    );
    const auditIngredientMemory = storyAudits.flatMap((story) => (
      normalizeStringArray(story.supportedMainIngredients).map((name) => ({
        name,
        role: "main",
        memoryPriority: "core",
        amountCandidates: [],
        evidence: normalizeStringArray(story.supportedRefs),
        uncertainty: null,
      }))
    ));
    const amountIngredientMemory = (candidatePacket.sourceEntries ?? []).flatMap(extractAmountMemoryFromEntry);
    const ingredientMemory = mergeIngredientMemory([
      ...auditIngredientMemory,
      ...amountIngredientMemory,
    ]);
    const stepMemory = buildStepMemoryFromPacket(candidatePacket);
    return {
      recipeUnitId: candidatePacket.candidateId,
      title: candidatePacket.title ?? null,
      sourceCandidateIds: normalizeStringArray(candidatePacket.recipeSourceCandidateIds),
      timeRange: candidatePacket.timeRange ?? null,
      dishIdentity: {
        summary: compactText([
          candidatePacket.title,
          candidatePacket.boundaryReason,
          ...(candidatePacket.stageSummary ?? []),
        ].filter(Boolean).join(" / "), 220),
        evidence: normalizeStringArray(candidatePacket.boundaryEvidence),
      },
      ingredientMemory,
      stepMemory,
      visualNeedHints: visualNeedHintsFromMemory({ ingredientMemory, stepMemory, candidatePacket }),
      understandingAudit: storyAudits.length ? {
        storyCount: storyAudits.length,
        supportedRefs: uniqueStrings(storyAudits.flatMap((story) => story.supportedRefs ?? [])),
        revisionNotes: uniqueStrings(storyAudits.flatMap((story) => story.revisionNotes ?? [])),
      } : null,
      uncertainties: uniqueStrings([
        ...(storyAudits.flatMap((story) => story.unsupportedMainIngredients ?? [])
          .map((name) => `${name}: video understanding audit에서 source 미지원 재료로 표시됨`)),
      ]),
    };
  });
  return {
    schemaVersion: 1,
    kind: "recipe-unit-working-memory",
    videoId: cleanString(holisticSourcePacket?.video?.videoId),
    units,
    summary: {
      unitCount: units.length,
      ingredientMemoryCount: units.reduce((sum, unit) => sum + unit.ingredientMemory.length, 0),
      stepMemoryCount: units.reduce((sum, unit) => sum + unit.stepMemory.length, 0),
      visualNeedHintCount: units.reduce((sum, unit) => sum + unit.visualNeedHints.length, 0),
    },
  };
}

function recipeUnitWorkingMemoryForPrompt(recipeUnitWorkingMemory, candidateId) {
  if (!isObject(recipeUnitWorkingMemory) || !Array.isArray(recipeUnitWorkingMemory.units)) return null;
  const unit = recipeUnitWorkingMemory.units.find((item) => item?.recipeUnitId === candidateId);
  return unit ? {
    schemaVersion: recipeUnitWorkingMemory.schemaVersion ?? 1,
    kind: "candidate-recipe-unit-working-memory",
    videoId: recipeUnitWorkingMemory.videoId ?? null,
    unit,
  } : null;
}

export function buildHolisticDraftPrompt(holisticSourcePacket, {
  timelineMode = false,
  videoUnderstanding = null,
  understandingAudit = null,
} = {}) {
  const candidateTimelineIndex = holisticSourcePacket?.candidateTimelineIndex ?? null;
  const exampleCandidateId = candidateTimelineIndex?.candidates?.[0]?.candidateId ?? "r1";
  const hasVideoUnderstanding = isObject(videoUnderstanding) && Array.isArray(videoUnderstanding.dishStories);
  const hasUnderstandingAudit = isObject(understandingAudit) && Array.isArray(understandingAudit.storyAudits);
  const promptGoal = timelineMode
    ? "목표: 제목, 설명란, 고정댓글, 자막, video timeline event를 종합해서 실제 만든 레시피들을 candidateId별로 분리한다."
    : "목표: 제목, 설명란, 고정댓글, 자막, storyboard frame을 먼저 종합해서 실제 만든 레시피들을 모두 분리한다.";
  const packetRule = timelineMode
    ? "- 아래 HOLISTIC_SOURCE_PACKET에 들어 있는 공개 YouTube source와 video timeline event 요약만 사용한다. raw frame dump나 이전 storyboard dump는 사용하지 않는다."
    : "- 아래 HOLISTIC_SOURCE_PACKET에 들어 있는 공개 YouTube source와 허용 frame 요약만 사용한다.";
  const timelineRules = timelineMode ? [
    "- candidateId는 CANDIDATE_TIMELINE_INDEX에 있는 값만 사용한다. 새 candidateId나 recipeId를 만들지 않는다.",
    "- CANDIDATE_SOURCE_PACKETS는 candidate별로 잘라낸 description/caption/timeline 근거다. 각 recipe를 쓸 때 이 묶음을 먼저 사용한다.",
    "- steps는 supporting event와 같은 candidateSourcePacket 안의 description/caption 근거를 주 근거로 삼는다.",
    "- timeline event가 압축되어 있어도 같은 candidate timeRange 안의 caption/description 근거가 명확하면 재료와 단계를 채운다.",
    "- excluded event의 내용은 레시피에 넣지 않는다. unclear event는 같은 candidateSourcePacket의 source 근거가 뒷받침할 때만 조심스럽게 사용한다.",
    "- event:e1 같은 timeline event ref를 evidence에 넣고, 가능한 경우 그 event가 가진 source/frame ref도 함께 넣는다.",
    "- timeline이 약한 후보는 단계를 추측하지 말고 uncertainties 또는 visualNeeds로 남긴다.",
  ] : [];
  const understandingRules = hasVideoUnderstanding ? [
    "- 먼저 VIDEO_UNDERSTANDING으로 영상의 큰 요리 흐름을 잡고, 세부 재료/양/단계는 반드시 CANDIDATE_SOURCE_PACKETS 또는 HOLISTIC_SOURCE_PACKET 근거로 확인한다.",
    "- VIDEO_UNDERSTANDING은 방향키다. final evidence ref로 쓰지 말고, evidence에는 source ref/event ref/frame ref만 넣는다.",
    "- VIDEO_UNDERSTANDING과 source packet이 충돌하면 source packet을 우선하고 uncertainties에 남긴다.",
    ...(hasUnderstandingAudit ? [
      "- VIDEO_UNDERSTANDING_AUDIT은 이해 메모를 source와 대조한 수정 지침이다. draft는 raw story가 아니라 audit의 revisionNotes를 반영한 이해를 따른다.",
      "- audit에서 unsupportedMainIngredients로 표시된 재료는 확정 재료로 쓰지 말고, 꼭 필요하면 uncertainties에만 남긴다.",
      "- audit에서 stepAlignment.status가 weak 또는 unsupported인 단계는 확정 단계가 아니라 uncertainty 또는 visualNeeds 후보로 둔다.",
    ] : []),
  ] : [];
  return [
    "너는 유튜브 레시피 영상을 전체적으로 이해한 뒤 레시피 정답지 초안을 쓰는 도우미다.",
    promptGoal,
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    packetRule,
    ...timelineRules,
    "- 일반 레시피 지식으로 재료 양이나 단계를 채우지 말고, 근거가 없으면 null 또는 uncertainties로 남긴다.",
    "- 모든 재료, amount/unit, 단계에는 가능한 한 evidence ref를 붙인다.",
    "- amount/unit이 부족하지만 화면으로 확인할 수 있어 보이면 visualNeeds에 넣고, 임의 추정하지 않는다.",
    "- 같은 timeRange에 여러 레시피가 있으면 어떤 근거가 어느 레시피에 속하는지 분리해서 쓴다.",
    ...understandingRules,
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "허용 evidence ref 예시:",
    "- title",
    "- description:1",
    "- author-comment:1",
    "- transcript:45s",
    "- event:e1",
    "- frame:whole:1",
    "",
    "스키마:",
    JSON.stringify({
      recipes: [{
        candidateId: exampleCandidateId,
        title: "요리명",
        timeRange: { startSec: 0, endSec: 120, basis: "description-timeline|caption|visual-storyboard|inferred" },
        ingredients: [{
          name: "재료명",
          amount: "1 또는 null",
          unit: "큰술 또는 null",
          amountBasis: "stated|spoken|onscreen|visual-estimate|null",
          evidence: ["description:1", "transcript:45s", "frame:whole:1"],
          needsVisualEstimate: false,
          uncertainty: null,
        }],
        steps: [{
          text: "조리 단계",
          evidence: ["transcript:45s", "frame:whole:1"],
          confidence: 0.7,
        }],
        visualNeeds: [{
          targetType: "ingredient_amount",
          ingredient: "재료명",
          reason: "source에 양이 없고 화면 계량 장면이 보임",
          candidateTimeRange: { startSec: 0, endSec: 120, basis: "draft" },
          suggestedFrameRefs: ["frame:whole:1"],
        }],
        uncertainties: ["근거 한계"],
      }],
      globalUncertainties: [],
    }, null, 2),
    "",
    ...(hasVideoUnderstanding ? [
      "[VIDEO_UNDERSTANDING]",
      JSON.stringify(videoUnderstanding, null, 2),
      "",
    ] : []),
    ...(hasUnderstandingAudit ? [
      "[VIDEO_UNDERSTANDING_AUDIT]",
      JSON.stringify(understandingAudit, null, 2),
      "",
    ] : []),
    ...(timelineMode ? [
      "[CANDIDATE_TIMELINE_INDEX]",
      JSON.stringify(candidateTimelineIndex ?? { candidates: [] }, null, 2),
      "",
      "[CANDIDATE_SOURCE_PACKETS]",
      JSON.stringify(holisticSourcePacket?.candidateSourcePackets ?? [], null, 2),
      "",
    ] : []),
    "[HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(holisticSourcePacket, null, 2),
  ].join("\n");
}

export function buildCandidateFirstHolisticDraftPrompt(candidateScopedSourcePacket, {
  understandingAudit = null,
  candidateIntegratedBrief = null,
  recipeMapContract = null,
  recipeUnitWorkingMemory = null,
  recipeUnitUnderstandingState = null,
  recipeUnitUnderstandingPromptPayload = null,
} = {}) {
  const candidatePacket = candidateScopedSourcePacket?.candidateSourcePackets?.[0] ?? {};
  const candidateTimeline = candidateScopedSourcePacket?.candidateTimelineIndex?.candidates?.[0] ?? {};
  const candidateId = cleanString(candidatePacket.candidateId ?? candidateTimeline.candidateId) ?? "r1";
  const title = cleanString(candidatePacket.title ?? candidateTimeline.title) ?? "후보 레시피";
  const recipeSourceCandidateIds = normalizeStringArray(candidatePacket.recipeSourceCandidateIds);
  const scopedWorkingMemory = recipeUnitWorkingMemoryForPrompt(recipeUnitWorkingMemory, candidateId);
  const scopedUnderstandingState = recipeUnitUnderstandingPromptPayload
    ?? recipeUnitUnderstandingStateForPrompt(recipeUnitUnderstandingState, candidateId);
  const recipeBoundaryRules = recipeSourceCandidateIds.length > 0 ? [
    "- 이 candidate는 recipe-boundary-plan이 여러 원래 candidate를 하나의 실제 요리로 묶은 recipe unit이다.",
    `- recipeSourceCandidateIds ${JSON.stringify(recipeSourceCandidateIds)} 안의 source와 event는 같은 요리 범위로 보고 함께 사용한다.`,
    "- recipeSourceCandidateIds 밖의 source나 event는 이 recipe unit에 합치지 않는다.",
    "- recipeSourceCandidateIds 안의 구간을 다시 여러 recipe로 쪼개지 말고, 반드시 recipe draft 1개로 작성한다.",
  ] : [];
  const hasUnderstandingAudit = isObject(understandingAudit) && Array.isArray(understandingAudit.storyAudits);
  const hasCandidateIntegratedBrief = isObject(candidateIntegratedBrief);
  const hasRecipeMapContract = isObject(recipeMapContract);
  const hasWorkingMemory = isObject(scopedWorkingMemory);
  const hasUnderstandingState = isObject(scopedUnderstandingState) && !hasCandidateIntegratedBrief && !hasRecipeMapContract;
  return [
    "너는 다중 레시피 영상에서 후보 하나만 맡아 레시피 초안을 쓰는 도우미다.",
    "목표: 아래 candidate 하나를 다른 candidate와 섞지 않고, 제목/설명란/고정댓글/자막/video timeline event 근거로 recipe draft 1개를 만든다.",
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    "- 아래 CANDIDATE_SOURCE_PACKET과 CANDIDATE_TIMELINE_ENTRY만 우선 사용한다.",
    hasRecipeMapContract
      ? "- raw VIDEO_UNDERSTANDING과 CANDIDATE_UNDERSTANDING_AUDIT은 제공되지 않는다. RECIPE_MAP_CONTRACT 하나만 후보별 전체 이해 계약으로 사용한다."
      : hasCandidateIntegratedBrief
      ? "- raw VIDEO_UNDERSTANDING과 CANDIDATE_UNDERSTANDING_AUDIT은 제공되지 않는다. CANDIDATE_INTEGRATED_BRIEF 하나만 후보별 이해 메모로 사용한다."
      : "- raw VIDEO_UNDERSTANDING은 제공되지 않는다. CANDIDATE_UNDERSTANDING_AUDIT은 source-backed 수정 메모일 뿐이다.",
    "- 다른 candidate의 재료, 수량, 단계는 절대 합치지 않는다.",
    ...recipeBoundaryRules,
    "- candidateId는 반드시 아래 값 그대로 쓴다: " + candidateId,
    "- 확정 근거가 없는 재료 양이나 단계는 일반 레시피 지식으로 채우지 말고 null 또는 uncertainties로 남긴다.",
    "- amount/unit이 부족하지만 화면으로 확인할 수 있어 보이면 visualNeeds에 넣고 임의 추정하지 않는다.",
    "- 모든 재료, amount/unit, 단계에는 가능한 한 evidence ref를 붙인다.",
    "- recipe가 맞는지 불확실해도 후보를 삭제하지 말고, source-backed로 보이는 최소 recipe 1개와 uncertainties를 남긴다.",
    ...(hasCandidateIntegratedBrief ? [
      "- CANDIDATE_INTEGRATED_BRIEF는 이 recipe unit의 요리 정체성, source-backed 분량, 핵심 조리 흐름을 짧게 압축한 orientation이다.",
      "- CANDIDATE_INTEGRATED_BRIEF는 final evidence가 아니다. final evidence에는 source/event/frame ref만 넣는다.",
      "- brief의 sourceBackedAmounts에 있는 amount/unit은 source에서 이미 나온 분량이다. 같은 재료를 final ingredients에 쓰면 해당 amount/unit과 amountBasis를 보존한다.",
      "- brief의 understandingOrientation.stories는 raw story가 아니라 source-backed audit 요약이다. warnings에 있는 unsupported 재료는 확정 재료로 쓰지 않는다.",
      "- brief의 blockedIngredientNames에 있는 surfaceName은 final ingredient name으로 쓰지 말고 uncertainties에 남긴다.",
    ] : []),
    ...(hasRecipeMapContract ? [
      "- RECIPE_MAP_CONTRACT는 전체 영상을 먼저 이해해 만든 후보별 계약이다. final evidence는 아니며, final evidence에는 source/event/frame ref만 넣는다.",
      "- knownAmountSlots의 amount/unit은 원본 source entry에서 다시 검증된 분량이다. 같은 재료를 final ingredients에 쓰면 amount/unit/amountBasis를 보존한다.",
      "- unknownAmountSlots는 일반 지식으로 채우지 않는다. source가 없으면 amount/unit은 null로 두거나 visualNeeds로 남긴다.",
      "- visualGaps는 visual-estimate 후보일 뿐이다. 화면 확인 없이 final amount로 확정하지 않는다.",
      "- stepSpine은 이 recipe unit의 핵심 조리 흐름이다. 단계 작성 시 이 흐름을 우선 반영하고, 없는 단계를 상상해서 추가하지 않는다.",
    ] : []),
    ...(hasWorkingMemory ? [
      "- RECIPE_UNIT_WORKING_MEMORY는 이 recipe unit을 쓰기 전에 보존해야 할 작은 작업 메모다. 최종 evidence가 아니라 draft orientation으로만 사용한다.",
      "- memoryPriority가 core인 ingredientMemory와 stepMemory는 요리 정체성과 흐름을 잡는 중심 단서로 사용한다.",
      "- amountCandidates가 있는 재료는 source-backed 분량 후보를 임의로 비우지 말고, 충돌하거나 불확실하면 uncertainties에 남긴다.",
      "- visualNeedHints는 곧바로 정답으로 쓰지 말고 visualNeeds 후보로만 연결한다.",
    ] : []),
    ...(hasUnderstandingState ? [
      "- RECIPE_UNIT_UNDERSTANDING_STATE는 evidence 조각 저장소가 아니라, 이 recipe unit이 무엇을 만들고 어떤 흐름인지에 대한 1차 이해 객체다.",
      "- 먼저 dishIdentity와 coreStepFlow를 읽고 조리 흐름을 잡은 뒤, 재료는 그 흐름을 설명하는 데 필요한 범위만 채운다.",
      "- allowedIngredientNames에 있는 source_named 재료명은 가장 안전한 final ingredient name이다.",
      "- sourceBackedAmounts에 있는 amount/unit은 source에서 이미 나온 분량이다. 같은 재료를 final ingredients에 쓰면 해당 amount/unit과 amountBasis를 보존한다.",
      "- sourceBackedAmounts를 보존하지 못하면 해당 재료명의 uncertainties 또는 repairLog급 이유를 반드시 남긴다.",
      "- visualNeeds는 sourceBackedAmounts로 채울 수 없는 빈칸만 남긴다. source-backed 분량을 무시하고 visual-estimate 대상으로 보내지 않는다.",
      "- blockedIngredientNames에 있는 surfaceName은 final ingredient name으로 쓰지 말고 uncertainties에 남긴다.",
      "- unresolvedIdentityQuestions는 확정하지 말아야 할 질문이다. 현재 CANDIDATE_SOURCE_PACKET의 evidence가 직접 뒷받침하지 않으면 final 재료명으로 쓰지 않는다.",
      "- unresolvedIdentityQuestions는 후속 확인 메모이며, 확인되지 않은 새 재료명을 상상해서 만들지 않는다.",
    ] : []),
    "- 출력은 설명 없이 JSON 객체 하나만 반환한다.",
    "",
    "허용 evidence ref 예시:",
    "- title",
    "- description:1",
    "- author-comment:1",
    "- transcript:45s",
    "- event:e1",
    "- frame:r1:1",
    "",
    "스키마:",
    JSON.stringify({
      recipes: [{
        candidateId,
        ...(recipeSourceCandidateIds.length ? { recipeSourceCandidateIds } : {}),
        title,
        timeRange: { startSec: 0, endSec: 120, basis: "candidate-timeline|description-timeline|caption|inferred" },
        ingredients: [{
          name: "재료명",
          amount: "1 또는 null",
          unit: "큰술 또는 null",
          amountBasis: "stated|spoken|onscreen|visual-estimate|null",
          evidence: ["description:1", "event:e1"],
          needsVisualEstimate: false,
          uncertainty: null,
        }],
        steps: [{
          text: "조리 단계",
          evidence: ["event:e1", "transcript:45s"],
          confidence: 0.7,
        }],
        visualNeeds: [{
          targetType: "ingredient_amount",
          ingredient: "재료명",
          reason: "source에 양이 없고 화면 계량 장면이 보임",
          candidateTimeRange: { startSec: 0, endSec: 120, basis: "draft" },
          suggestedFrameRefs: [],
        }],
        uncertainties: ["근거 한계"],
      }],
      globalUncertainties: [],
    }, null, 2),
    "",
    "[CANDIDATE_TIMELINE_ENTRY]",
    JSON.stringify(candidateTimeline, null, 2),
    "",
    "[CANDIDATE_SOURCE_PACKET]",
    JSON.stringify(candidatePacket, null, 2),
    "",
    ...(hasCandidateIntegratedBrief ? [
      "[CANDIDATE_INTEGRATED_BRIEF]",
      JSON.stringify(candidateIntegratedBrief, null, 2),
      "",
    ] : []),
    ...(hasRecipeMapContract ? [
      "[RECIPE_MAP_CONTRACT]",
      JSON.stringify(recipeMapContract, null, 2),
      "",
    ] : []),
    ...(!hasCandidateIntegratedBrief && !hasRecipeMapContract && hasUnderstandingAudit ? [
      "[CANDIDATE_UNDERSTANDING_AUDIT]",
      JSON.stringify(understandingAudit, null, 2),
      "",
    ] : []),
    ...(hasWorkingMemory ? [
      "[RECIPE_UNIT_WORKING_MEMORY]",
      JSON.stringify(scopedWorkingMemory, null, 2),
      "",
    ] : []),
    ...(hasUnderstandingState ? [
      "[RECIPE_UNIT_UNDERSTANDING_STATE]",
      JSON.stringify(scopedUnderstandingState, null, 2),
      "",
    ] : []),
    "[CANDIDATE_SCOPED_HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(candidateScopedSourcePacket, null, 2),
  ].join("\n");
}

function blockedIngredientNamesByCandidate(recipeUnitUnderstandingState) {
  const map = new Map();
  for (const unit of recipeUnitUnderstandingState?.units ?? []) {
    const blocked = new Set((unit.ingredientIdentityState ?? [])
      .filter((entry) => entry?.finalNameAllowed === false)
      .map((entry) => normalizeKey(entry.surfaceName))
      .filter(Boolean));
    map.set(unit.recipeUnitId, blocked);
  }
  return map;
}

function auditGenericVisualDescriptorLeaks(output, recipeUnitUnderstandingState, passName) {
  const blockedByCandidate = blockedIngredientNamesByCandidate(recipeUnitUnderstandingState);
  const issues = [];
  for (const recipe of output?.recipes ?? []) {
    const blockedNames = blockedByCandidate.get(recipe.candidateId) ?? new Set();
    for (const ingredient of recipe.ingredients ?? []) {
      const nameKey = normalizeKey(ingredient.name);
      const genericPatternMatch = isGenericVisualDescriptorName(ingredient.name);
      const blockedByState = Boolean(nameKey && blockedNames.has(nameKey));
      if (!genericPatternMatch && !blockedByState) continue;
      issues.push({
        recipeUnitId: recipe.candidateId ?? null,
        type: "generic_visual_descriptor_as_final_ingredient",
        value: ingredient.name,
        severity: passName === "before-deterministic-demotion" ? "demote_then_recheck" : "block_final",
        reason: blockedByState
          ? "recipe-unit-understanding-state에서 finalNameAllowed=false로 표시된 재료명"
          : "실제 재료명이 아니라 화면 색/모양 묘사로 보이는 재료명",
      });
    }
  }
  return {
    name: passName,
    issues,
  };
}

function quantityKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "")
    .trim();
}

function evidenceIntersects(left, right) {
  const rightRefs = new Set(normalizeStringArray(right));
  return normalizeStringArray(left).some((ref) => rightRefs.has(ref));
}

function amountMatches(expected, ingredient) {
  return Boolean(
    quantityKey(expected?.amount)
    && quantityKey(expected?.unit)
    && quantityKey(expected?.amount) === quantityKey(ingredient?.amount)
    && quantityKey(expected?.unit) === quantityKey(ingredient?.unit),
  );
}

function findRecipeForUnit(finalOutput, unit) {
  const unitId = cleanString(unit?.recipeUnitId);
  const sourceIds = new Set(normalizeStringArray(unit?.sourceCandidateIds));
  return (finalOutput?.recipes ?? []).find((recipe) => (
    cleanString(recipe?.candidateId) === unitId
    || normalizeStringArray(recipe?.recipeSourceCandidateIds).some((candidateId) => sourceIds.has(candidateId))
  )) ?? null;
}

function findIngredientForSourceBackedAmount(recipe, expectedAmount) {
  const expectedNameKey = normalizeKey(expectedAmount?.ingredient);
  const expectedEvidence = normalizeStringArray(expectedAmount?.evidence);
  return (recipe?.ingredients ?? []).find((ingredient) => {
    const ingredientNameKey = normalizeKey(ingredient?.name);
    if (expectedNameKey && ingredientNameKey === expectedNameKey) return true;
    return evidenceIntersects(expectedEvidence, ingredient?.evidence);
  }) ?? null;
}

function sourceBackedAmountExplanationText(finalOutput, recipe) {
  const repairText = (finalOutput?.repairLog ?? [])
    .filter((entry) => !recipe?.candidateId || !entry?.candidateId || entry.candidateId === recipe.candidateId)
    .map((entry) => [
      entry.field,
      entry.before,
      entry.after,
      entry.reasonCode,
      entry.reason,
      ...(entry.evidenceRef ?? []),
    ].filter(Boolean).join(" "))
    .join(" ");
  return uniqueStrings([
    ...(recipe?.uncertainties ?? []),
    ...(finalOutput?.globalUncertainties ?? []),
    repairText,
  ]).join(" ");
}

function sourceBackedAmountExplained(finalOutput, recipe, expectedAmount) {
  const text = sourceBackedAmountExplanationText(finalOutput, recipe);
  const mentionsIngredient = textMentions(text, expectedAmount?.ingredient)
    || evidenceIntersects(expectedAmount?.evidence, recipe?.uncertainties ?? []);
  const mentionsAmountIssue = /(?:amount|unit|분량|수량|계량|근거|충돌|불확실|null|누락|제외|unsupported)/iu.test(text);
  return mentionsIngredient && mentionsAmountIssue;
}

export function auditRecipeUnitAmountPreservation(finalOutput, recipeUnitUnderstandingState) {
  if (!isObject(recipeUnitUnderstandingState) || !Array.isArray(recipeUnitUnderstandingState.units)) {
    return {
      schemaVersion: 1,
      kind: "recipe-unit-amount-preservation-audit",
      videoId: recipeUnitUnderstandingState?.videoId ?? null,
      warnings: [],
      summary: {
        sourceBackedAmountCount: 0,
        preservedCount: 0,
        explainedMissingCount: 0,
        warningCount: 0,
        passed: true,
      },
    };
  }

  const warnings = [];
  let sourceBackedAmountCount = 0;
  let preservedCount = 0;
  let explainedMissingCount = 0;
  for (const unit of recipeUnitUnderstandingState.units) {
    const recipe = findRecipeForUnit(finalOutput, unit);
    for (const expectedAmount of unit?.sourceBackedAmounts ?? []) {
      sourceBackedAmountCount += 1;
      if (!recipe) {
        warnings.push({
          recipeUnitId: unit.recipeUnitId ?? null,
          type: "recipe_missing_for_source_backed_amount",
          ingredient: expectedAmount.ingredient,
          expectedAmount: expectedAmount.amount,
          expectedUnit: expectedAmount.unit,
          evidence: normalizeStringArray(expectedAmount.evidence),
          reason: "source-backed amount existed, but the final recipe unit is missing",
        });
        continue;
      }
      const ingredient = findIngredientForSourceBackedAmount(recipe, expectedAmount);
      if (ingredient && amountMatches(expectedAmount, ingredient)) {
        preservedCount += 1;
        continue;
      }
      if (sourceBackedAmountExplained(finalOutput, recipe, expectedAmount)) {
        explainedMissingCount += 1;
        continue;
      }
      warnings.push({
        recipeUnitId: unit.recipeUnitId ?? null,
        type: ingredient ? "source_backed_amount_changed_or_missing" : "source_backed_ingredient_missing",
        ingredient: expectedAmount.ingredient,
        expectedAmount: expectedAmount.amount,
        expectedUnit: expectedAmount.unit,
        actualAmount: ingredient?.amount ?? null,
        actualUnit: ingredient?.unit ?? null,
        evidence: normalizeStringArray(expectedAmount.evidence),
        reason: ingredient
          ? "source-backed amount/unit was not preserved and no explanation was found"
          : "source-backed ingredient was not present in final ingredients and no explanation was found",
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "recipe-unit-amount-preservation-audit",
    videoId: recipeUnitUnderstandingState.videoId ?? null,
    warnings,
    summary: {
      sourceBackedAmountCount,
      preservedCount,
      explainedMissingCount,
      warningCount: warnings.length,
      passed: warnings.length === 0,
    },
  };
}

function recipeUnitExpectedEntries(recipeBoundaryPlan) {
  const sourceCandidateIdsForUnit = (unit) => {
    const primary = normalizeStringArray(unit?.candidateIds);
    if (primary.length) return primary;
    const sourceCandidateIds = normalizeStringArray(unit?.sourceCandidateIds);
    if (sourceCandidateIds.length) return sourceCandidateIds;
    return normalizeStringArray(unit?.recipeSourceCandidateIds);
  };
  return (recipeBoundaryPlan?.recipeUnits ?? []).map((unit) => ({
    recipeUnitId: cleanString(unit?.recipeUnitId),
    title: cleanString(unit?.title),
    recipeSourceCandidateIds: sourceCandidateIdsForUnit(unit),
    timeRange: unit?.timeRange ?? null,
  })).filter((unit) => unit.recipeUnitId);
}

function recipeUnitFinalEntries(finalOutput) {
  return (finalOutput?.recipes ?? []).map((recipe) => ({
    candidateId: cleanString(recipe?.candidateId),
    title: cleanString(recipe?.title),
    recipeSourceCandidateIds: normalizeStringArray(recipe?.recipeSourceCandidateIds),
    timeRange: recipe?.timeRange ?? null,
  }));
}

function linkedExpectedUnitsForRecipe(finalRecipe, expectedUnits) {
  const finalCandidateId = cleanString(finalRecipe?.candidateId);
  const finalSourceIds = new Set(normalizeStringArray(finalRecipe?.recipeSourceCandidateIds));
  return expectedUnits.filter((unit) => (
    unit.recipeUnitId === finalCandidateId
    || unit.recipeSourceCandidateIds.some((candidateId) => finalSourceIds.has(candidateId))
  ));
}

export function auditRecipeUnitConsistency(finalOutput, {
  recipeBoundaryPlan = null,
} = {}) {
  const expectedUnits = recipeUnitExpectedEntries(recipeBoundaryPlan);
  const finalRecipes = recipeUnitFinalEntries(finalOutput);
  const expectedUnitIds = new Set(expectedUnits.map((unit) => unit.recipeUnitId));
  const warnings = [];
  const links = [];
  const representedUnitIds = new Set();

  if (expectedUnits.length !== finalRecipes.length) {
    warnings.push({
      code: "recipe_count_mismatch",
      expectedUnitCount: expectedUnits.length,
      finalRecipeCount: finalRecipes.length,
      message: "recipe-boundary-plan unit count and final recipe count differ",
    });
  }

  for (const recipe of finalRecipes) {
    const linkedUnits = linkedExpectedUnitsForRecipe(recipe, expectedUnits);
    const linkedRecipeUnitIds = linkedUnits.map((unit) => unit.recipeUnitId);
    linkedRecipeUnitIds.forEach((unitId) => representedUnitIds.add(unitId));
    links.push({
      finalCandidateId: recipe.candidateId,
      linkedRecipeUnitIds,
      matchBasis: linkedUnits.some((unit) => unit.recipeUnitId === recipe.candidateId)
        ? "candidateId"
        : linkedUnits.length > 0
          ? "recipeSourceCandidateIds"
          : "none",
    });

    if (linkedUnits.length === 0) {
      warnings.push({
        code: "extra_final_recipe",
        finalCandidateId: recipe.candidateId,
        title: recipe.title,
        recipeSourceCandidateIds: recipe.recipeSourceCandidateIds,
        message: "final recipe does not map to any recipe-boundary-plan unit",
      });
      continue;
    }

    if (!recipe.candidateId || !expectedUnitIds.has(recipe.candidateId)) {
      warnings.push({
        code: "identity_contract_mismatch",
        finalCandidateId: recipe.candidateId,
        expectedRecipeUnitIds: linkedRecipeUnitIds,
        recipeSourceCandidateIds: recipe.recipeSourceCandidateIds,
        message: "final recipe candidateId is not the recipeUnitId even though it maps to a known recipe unit",
      });
    }

    if (linkedUnits.length > 1) {
      warnings.push({
        code: "possible_unit_merge",
        finalCandidateId: recipe.candidateId,
        linkedRecipeUnitIds,
        recipeSourceCandidateIds: recipe.recipeSourceCandidateIds,
        message: "one final recipe appears to combine multiple recipe-boundary-plan units",
      });
    }
  }

  for (const unit of expectedUnits) {
    if (!representedUnitIds.has(unit.recipeUnitId)) {
      warnings.push({
        code: "missing_recipe_unit",
        recipeUnitId: unit.recipeUnitId,
        title: unit.title,
        recipeSourceCandidateIds: unit.recipeSourceCandidateIds,
        message: "recipe-boundary-plan unit is not represented in final recipes",
      });
    }
  }

  return {
    schemaVersion: 1,
    kind: "unit-consistency-audit",
    videoId: cleanString(recipeBoundaryPlan?.videoId ?? finalOutput?.videoId),
    expectedUnits,
    finalRecipes,
    links,
    warnings,
    summary: {
      expectedUnitCount: expectedUnits.length,
      finalRecipeCount: finalRecipes.length,
      representedUnitCount: representedUnitIds.size,
      missingUnitCount: warnings.filter((warning) => warning.code === "missing_recipe_unit").length,
      extraFinalRecipeCount: warnings.filter((warning) => warning.code === "extra_final_recipe").length,
      possibleMergeCount: warnings.filter((warning) => warning.code === "possible_unit_merge").length,
      identityMismatchCount: warnings.filter((warning) => warning.code === "identity_contract_mismatch").length,
      warningCount: warnings.length,
      passed: warnings.length === 0,
    },
  };
}

export function applyRecipeUnitUnderstandingDemotion(finalOutput, recipeUnitUnderstandingState) {
  if (!isObject(recipeUnitUnderstandingState) || !Array.isArray(recipeUnitUnderstandingState.units)) {
    return {
      output: finalOutput,
      selfAudit: null,
    };
  }
  const beforePass = auditGenericVisualDescriptorLeaks(
    finalOutput,
    recipeUnitUnderstandingState,
    "before-deterministic-demotion",
  );
  const blockedByCandidate = blockedIngredientNamesByCandidate(recipeUnitUnderstandingState);
  const demotedRepairLog = [];
  let patchIndex = (finalOutput.repairLog ?? []).length + 1;
  const recipes = (finalOutput.recipes ?? []).map((recipe) => {
    const blockedNames = blockedByCandidate.get(recipe.candidateId) ?? new Set();
    const keptIngredients = [];
    const demotedNames = [];
    for (const ingredient of recipe.ingredients ?? []) {
      const nameKey = normalizeKey(ingredient.name);
      const shouldDemote = isGenericVisualDescriptorName(ingredient.name)
        || Boolean(nameKey && blockedNames.has(nameKey));
      if (!shouldDemote) {
        keptIngredients.push(ingredient);
        continue;
      }
      demotedNames.push(ingredient.name);
      demotedRepairLog.push({
        patchId: `recipe-unit-understanding-${patchIndex++}`,
        candidateId: recipe.candidateId ?? null,
        field: "ingredient",
        before: ingredient.name,
        after: null,
        evidenceRef: normalizeStringArray(ingredient.evidence),
        reasonCode: "generic_visual_descriptor_demoted",
        confidence: 0.82,
      });
    }
    return {
      ...recipe,
      ingredients: keptIngredients,
      uncertainties: uniqueStrings([
        ...(recipe.uncertainties ?? []),
        ...demotedNames.map((name) => `${name}: 실제 재료명이 아니라 화면 묘사로 보여 final 재료명에서 제외됨`),
      ]),
    };
  });
  const demotedOutput = {
    ...finalOutput,
    recipes,
    repairLog: [
      ...(finalOutput.repairLog ?? []),
      ...demotedRepairLog,
    ],
  };
  const afterPass = auditGenericVisualDescriptorLeaks(
    demotedOutput,
    recipeUnitUnderstandingState,
    "after-deterministic-demotion",
  );
  const amountPreservation = auditRecipeUnitAmountPreservation(demotedOutput, recipeUnitUnderstandingState);
  const selfAudit = {
    schemaVersion: 1,
    kind: "recipe-unit-draft-self-audit",
    videoId: recipeUnitUnderstandingState.videoId ?? null,
    passes: [beforePass, afterPass],
    amountPreservation,
    summary: {
      beforeDemotionBlockCount: beforePass.issues.length,
      afterDemotionBlockCount: afterPass.issues.length,
      demotedIngredientCount: demotedRepairLog.length,
      failedAfterDemotion: afterPass.issues.length > 0,
      sourceBackedAmountCount: amountPreservation.summary.sourceBackedAmountCount,
      amountPreservationWarningCount: amountPreservation.summary.warningCount,
      amountPreservationExplainedMissingCount: amountPreservation.summary.explainedMissingCount,
      amountPreservationPassed: amountPreservation.summary.passed,
    },
  };
  return {
    output: demotedOutput,
    selfAudit,
  };
}

export function buildHolisticFinalPrompt({ draft, audit, visualEstimates }) {
  return [
    "이 파일은 deterministic final writer 입력이다. 최종 result.json은 이 감사 결과에서 근거 있는 항목만 사용해 만든다.",
    "규칙: unsupported 항목은 final result에 넣지 않는다. unsupported amount/unit은 null로 둔다.",
    "",
    "[HOLISTIC_DRAFT]",
    JSON.stringify(draft, null, 2),
    "",
    "[HOLISTIC_EVIDENCE_AUDIT]",
    JSON.stringify(audit, null, 2),
    "",
    "[VISUAL_ESTIMATES]",
    JSON.stringify(visualEstimates ?? { visualEstimates: [] }, null, 2),
  ].join("\n");
}

function compactVisualLedgerForPrompt(visualLedger, maxFrames = 80) {
  const frames = [];
  for (const candidate of visualLedger?.candidates ?? []) {
    for (const frame of candidate.frames ?? []) {
      if (!frame?.ref) continue;
      frames.push({
        ref: frame.ref,
        candidateId: frame.candidateId ?? candidate.candidateId,
        targetId: frame.targetId ?? null,
        ingredient: frame.ingredient ?? null,
        range: frame.range ?? candidate.timeRange ?? null,
        observed: uniqueStrings(frame.observed ?? candidate.observed ?? []),
        onscreenText: uniqueStrings(frame.onscreenText ?? candidate.onscreenText ?? []),
        quantityCues: uniqueStrings(frame.quantityCues ?? candidate.quantityCues ?? []),
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "holistic-visual-repair-context",
    videoId: visualLedger?.videoId ?? null,
    frames: frames.slice(0, maxFrames),
    errors: visualLedger?.errors ?? [],
  };
}

export function buildHolisticVisualRepairPrompt({ draft, holisticSourcePacket, visualLedger }) {
  return [
    "너는 유튜브 레시피 초안을 visual evidence로만 보강하는 도우미다.",
    "목표: HOLISTIC_DRAFT에서 빠진 재료와 만들기 단계를 VISUAL_REPAIR_CONTEXT의 frame 근거가 있을 때만 보강한다.",
    "",
    "중요한 제한:",
    "- 로컬 파일, golden.json, grade, 이전 result, 비교 HTML, 이전 추출 결과를 읽지 마라.",
    "- 아래 HOLISTIC_SOURCE_PACKET과 VISUAL_REPAIR_CONTEXT만 사용한다.",
    "- 일반 레시피 지식으로 보강하지 마라. frame의 observed/onscreenText/quantityCues에 없는 재료·단계·양은 만들지 마라.",
    "- 재료를 추가할 때는 evidence에 반드시 frame ref 또는 source ref를 넣는다.",
    "- amount/unit은 quantityCues나 onscreenText에 명시된 경우만 stated/onscreen으로 넣고, 어림값이면 null로 둔다.",
    "- visualNeeds는 한 target에 한 재료만 넣는다. '오이/연어/부추'처럼 여러 재료를 묶지 마라.",
    "- 기존 candidateId와 title은 유지한다. 불확실하면 uncertainties에 남긴다.",
    "- 출력은 설명 없이 holistic draft JSON 객체 하나만 반환한다.",
    "",
    "[HOLISTIC_SOURCE_PACKET]",
    JSON.stringify(holisticSourcePacket, null, 2),
    "",
    "[HOLISTIC_DRAFT]",
    JSON.stringify(draft, null, 2),
    "",
    "[VISUAL_REPAIR_CONTEXT]",
    JSON.stringify(compactVisualLedgerForPrompt(visualLedger), null, 2),
  ].join("\n");
}

function refsInText(text) {
  return String(text ?? "").match(/(?:title|description:\d+(?::\d+)?|author-comment:\d+(?::\d+)?|transcript:\d+s|event:[A-Za-z0-9_-]+|frame:[^:\s,;)\]}]+(?::[^:\s,;)\]}]+)?:\d+)/gu) ?? [];
}

function evidenceRefs(evidence) {
  return uniqueStrings((evidence ?? []).flatMap((entry) => refsInText(entry)));
}

function sourceEntriesForAudit(holisticSourcePacket, visualLedger = null) {
  return [
    ...(holisticSourcePacket?.entries ?? []),
    ...storyboardEntries(visualLedger),
  ];
}

function validEvidence(evidence, allowedRefs) {
  const allowed = new Set(allowedRefs);
  return evidenceRefs(evidence).filter((ref) => allowed.has(ref));
}

function evidenceMentionsValue(entries, value, { frameOnly = false } = {}) {
  return entries.some((entry) => {
    if (frameOnly && entry.type !== "frame") return false;
    return textMentions(entry.text, value)
      || (entry.observed ?? []).some((item) => textMentions(item, value))
      || (entry.onscreenText ?? []).some((item) => textMentions(item, value))
      || (entry.quantityCues ?? []).some((item) => textMentions(item, value));
  });
}

function recipeTitleSourceSupported(recipe, sourceEntries) {
  const nonFrameEntries = sourceEntries.filter((entry) => entry.type !== "frame");
  return evidenceMentionsValue(nonFrameEntries, recipe.title);
}

function estimateKey(candidateId, ingredient) {
  return `${candidateId ?? ""}::${normalizeKey(ingredient)}`;
}

function frameRefsFromEvidence(evidence) {
  return evidenceRefs(evidence).filter((ref) => ref.startsWith("frame:"));
}

function acceptedVisualEstimateMap(visualEstimates) {
  const map = new Map();
  for (const estimate of visualEstimates?.visualEstimates ?? []) {
    if (!estimate?.amount || !estimate?.unit) continue;
    if (estimate.amountBasis !== VISUAL_AMOUNT_BASIS) continue;
    if (frameRefsFromEvidence(estimate.evidence).length === 0) continue;
    map.set(estimateKey(estimate.candidateId, estimate.ingredient), estimate);
  }
  return map;
}

function auditIngredient({ recipe, ingredient, sourceEntries, allowedRefs, visualEstimateMap }) {
  const refs = validEvidence(ingredient.evidence, allowedRefs);
  const identitySupported = refs.length > 0 || evidenceMentionsValue(sourceEntries, ingredient.name);
  const visualEstimate = visualEstimateMap.get(estimateKey(recipe.candidateId, ingredient.name));
  const amountBasis = cleanString(ingredient.amountBasis);
  const sourceAmountSupported = Boolean(
    ingredient.amount
    && ingredient.unit
    && SOURCE_AMOUNT_BASIS.has(amountBasis)
    && refs.length > 0,
  );
  const visualAmountSupported = Boolean(visualEstimate);
  const amountSupported = sourceAmountSupported || visualAmountSupported;
  const auditedIngredient = {
    name: ingredient.name,
    amount: visualEstimate?.amount ?? (sourceAmountSupported ? ingredient.amount : null),
    unit: visualEstimate?.unit ?? (sourceAmountSupported ? ingredient.unit : null),
    amountBasis: visualEstimate ? VISUAL_AMOUNT_BASIS : sourceAmountSupported ? amountBasis : null,
    confidence: visualEstimate ? visualEstimate.confidence ?? 0.45 : refs.length > 0 ? 0.65 : 0.35,
    evidence: uniqueStrings([...(refs.length ? refs : ingredient.evidence), ...(visualEstimate?.evidence ?? [])]).slice(0, 8),
  };
  const status = identitySupported ? "kept" : "unsupported";
  const amountStatus = amountSupported || !ingredient.amount ? "kept" : "downgraded";
  return {
    status,
    amountStatus,
    ingredient: auditedIngredient,
    original: ingredient,
    evidenceRefs: refs,
    visualEstimate: visualEstimate ?? null,
    reason: status === "unsupported"
      ? "ingredient identity has no source/frame support"
      : amountStatus === "downgraded"
      ? "amount/unit lacked supported source or frame evidence"
      : "ingredient passed holistic evidence audit",
  };
}

function auditStep({ step, sourceEntries, allowedRefs }) {
  const refs = validEvidence(step.evidence, allowedRefs);
  const supported = refs.length > 0;
  return {
    status: supported ? "kept" : "unsupported",
    text: step.text,
    original: step,
    evidenceRefs: refs,
    confidence: step.confidence,
    reason: supported ? "step has cited source/frame evidence" : "step lacked cited source/frame evidence",
    sourceHintMatched: !supported && sourceEntries.some((entry) => textMentions(entry.text, step.text)),
  };
}

export function auditHolisticDraft({ draft, holisticSourcePacket, visualLedger = null, visualEstimates = null }) {
  const sourceEntries = sourceEntriesForAudit(holisticSourcePacket, visualLedger);
  const allowedRefs = uniqueStrings([
    ...(holisticSourcePacket?.refs ?? []),
    ...sourceEntries.map((entry) => entry.ref),
  ]);
  const visualEstimateMap = acceptedVisualEstimateMap(visualEstimates);
  const recipes = draft.recipes.map((recipe) => {
    const sourceBackedRecipe = recipeTitleSourceSupported(recipe, sourceEntries);
    const visualOnlyRecipe = !sourceBackedRecipe && recipe.timeRange?.basis === "visual-storyboard";
    const ingredientAudits = recipe.ingredients.map((ingredient) => auditIngredient({
      recipe,
      ingredient,
      sourceEntries,
      allowedRefs,
      visualEstimateMap,
    }));
    const stepAudits = recipe.steps.map((step) => auditStep({ step, sourceEntries, allowedRefs }));
    return {
      status: visualOnlyRecipe ? "unsupported_recipe" : "kept",
      candidateId: recipe.candidateId,
      recipeSourceCandidateIds: normalizeStringArray(recipe.recipeSourceCandidateIds),
      title: recipe.title,
      timeRange: recipe.timeRange,
      ingredients: ingredientAudits,
      steps: stepAudits,
      visualNeeds: recipe.visualNeeds,
      uncertainties: recipe.uncertainties,
      summary: {
        keptIngredients: ingredientAudits.filter((entry) => entry.status === "kept").length,
        unsupportedIngredients: ingredientAudits.filter((entry) => entry.status !== "kept").length,
        downgradedAmounts: ingredientAudits.filter((entry) => entry.status === "kept" && entry.amountStatus === "downgraded").length,
        keptSteps: stepAudits.filter((entry) => entry.status === "kept").length,
        unsupportedSteps: stepAudits.filter((entry) => entry.status !== "kept").length,
      },
      reason: visualOnlyRecipe ? "recipe title was introduced only by visual storyboard and was not source-backed" : "recipe passed source-backed title audit",
    };
  });
  return {
    schemaVersion: 1,
    kind: "holistic-evidence-audit",
    videoId: holisticSourcePacket?.video?.videoId ?? null,
    promptVersion: HOLISTIC_PROMPT_VERSION,
    allowedRefs,
    recipes,
    summary: {
      recipeCount: recipes.length,
      keptRecipes: recipes.filter((recipe) => recipe.status === "kept").length,
      unsupportedRecipes: recipes.filter((recipe) => recipe.status !== "kept").length,
      keptIngredients: recipes.reduce((sum, recipe) => sum + recipe.summary.keptIngredients, 0),
      unsupportedIngredients: recipes.reduce((sum, recipe) => sum + recipe.summary.unsupportedIngredients, 0),
      downgradedAmounts: recipes.reduce((sum, recipe) => sum + recipe.summary.downgradedAmounts, 0),
      keptSteps: recipes.reduce((sum, recipe) => sum + recipe.summary.keptSteps, 0),
      unsupportedSteps: recipes.reduce((sum, recipe) => sum + recipe.summary.unsupportedSteps, 0),
    },
  };
}

function safeTargetSegment(value) {
  return String(value ?? "target")
    .replace(/[^a-z0-9가-힣_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60) || "target";
}

function isGroupedVisualIngredient(value) {
  return /(?:\/|,|·|&|\+|또는|혹은|및|\s와\s|\s과\s)/u.test(String(value ?? ""));
}

function recipeNeedsVisualRecall(recipe) {
  const ingredients = recipe.ingredients ?? [];
  const missingAmountCount = ingredients.filter((ingredient) => !ingredient.amount || !ingredient.unit).length;
  const sparseSteps = (recipe.steps ?? []).length < 3;
  const uncertaintyText = (recipe.uncertainties ?? []).join(" ");
  return ingredients.length > 0
    && (
      sparseSteps
      || missingAmountCount >= Math.max(2, Math.ceil(ingredients.length * 0.6))
      || /(?:부족|불명|확인 불가|제공되지|source에 없음|source에서 확정되지)/u.test(uncertaintyText)
    );
}

export function buildHolisticCandidateLedger({ draft, sourcePacket }) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds);
  return {
    schemaVersion: 1,
    kind: "candidate-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    candidates: draft.recipes.map((recipe, index) => ({
      candidateId: recipe.candidateId,
      titleHint: recipe.title,
      title: recipe.title,
      ingredientNames: recipe.ingredients.map((ingredient) => ingredient.name).filter(Boolean),
      evidence: ["holistic-draft"],
      sourceCues: ["holistic-draft"],
      timeRange: recipe.timeRange ?? {
        startSec: 0,
        endSec: duration,
        basis: duration ? "holistic-duration-fallback" : "holistic-unknown-duration",
      },
      uncertainties: recipe.uncertainties,
      order: index,
    })),
  };
}

function parseTimelineSecond(value) {
  const text = String(value ?? "");
  const match = text.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/u);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function timelineTitle(value) {
  return String(value ?? "")
    .replace(/^\s*(?:(?:\d{1,2}:)?\d{1,2}:\d{2})\s*/u, "")
    .replace(/[👀🍱🍚🌿🔌🍯]+/gu, "")
    .trim();
}

function splitRecipeTitleHints(value) {
  const title = cleanString(value);
  if (!title) return [];
  const parts = title
    .split(/\s*(?:&|\/|,|，|\+|·|ㆍ|ㅣ|\||그리고)\s*/u)
    .map((part) => part.replace(/^\d+[.)]\s*/u, "").trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !/(?:미리보기|preview|인트로|intro|아웃트로|outro)/iu.test(part));
  return parts.length > 1 ? uniqueStrings(parts).slice(0, 4) : [title];
}

function hasMultiRecipeHint(value) {
  return splitRecipeTitleHints(value).length > 1;
}

function captionRefsForRange(sourcePacket, startSec, endSec, maxRefs = 2) {
  return (sourcePacket?.captions?.segments ?? [])
    .map((segment) => {
      const start = optionalNumber(Number(segment?.startMs) / 1000, null);
      return {
        startSec: start,
        ref: start !== null ? `transcript:${Math.max(0, Math.round(start))}s` : null,
      };
    })
    .filter((entry) => entry.startSec !== null && entry.ref && entry.startSec >= startSec && entry.startSec <= endSec)
    .slice(0, maxRefs)
    .map((entry) => entry.ref);
}

function buildStoryboardCandidate({
  candidateId,
  title,
  evidence,
  sourceCues,
  timeRange,
  order,
  siblingGroup = null,
  siblingIndex = null,
  siblingCount = null,
  uncertainties = [],
}) {
  return {
    candidateId,
    titleHint: title,
    title,
    ingredientNames: [],
    evidence,
    sourceCues,
    timeRange,
    uncertainties,
    order,
    ...(siblingGroup ? { siblingGroup, siblingIndex, siblingCount } : {}),
  };
}

function siblingTimeRange(timeRange, siblingIndex, siblingCount) {
  const start = optionalNumber(timeRange?.startSec, null);
  const end = optionalNumber(timeRange?.endSec, null);
  if (start === null || end === null || end <= start || siblingCount <= 1) return timeRange;
  const span = (end - start) / siblingCount;
  return {
    startSec: start + (span * siblingIndex),
    endSec: start + (span * (siblingIndex + 1)),
    basis: "timeline-sibling-slice",
    parentRange: timeRange,
    sliceIndex: siblingIndex,
    sliceCount: siblingCount,
  };
}

function storyboardTimelineEntries(sourcePacket, { maxCandidates = 8, enableTimelineUnderstanding = false } = {}) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds);
  const lines = String(sourcePacket?.video?.description ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = lines
    .map((line, index) => ({
      line,
      lineIndex: index,
      startSec: parseTimelineSecond(line),
      title: timelineTitle(line),
    }))
    .filter((entry) => entry.startSec !== null && entry.title)
    .filter((entry) => !/(?:미리보기|preview)/iu.test(entry.title))
    .sort((left, right) => left.startSec - right.startSec);
  if (entries.length === 0) return [];
  const candidates = [];
  for (const [index, entry] of entries.entries()) {
    const next = entries[index + 1];
    const endSec = next?.startSec ?? duration ?? entry.startSec + 90;
    const timeRange = {
        startSec: entry.startSec,
        endSec: endSec > entry.startSec ? endSec : entry.startSec + 60,
        basis: "description-timeline-storyboard",
    };
    const siblingTitles = enableTimelineUnderstanding ? splitRecipeTitleHints(entry.title) : [entry.title];
    for (const [siblingIndex, title] of siblingTitles.entries()) {
      if (candidates.length >= maxCandidates) return candidates;
      const hasSiblings = siblingTitles.length > 1;
      candidates.push(buildStoryboardCandidate({
        candidateId: hasSiblings ? `storyboard-${index + 1}-${siblingIndex + 1}` : `storyboard-${index + 1}`,
        title,
        evidence: [`description:${entry.lineIndex + 1}`],
        sourceCues: hasSiblings ? ["description-timeline", "timeline-sibling-probe"] : ["description-timeline"],
        timeRange: hasSiblings ? siblingTimeRange(timeRange, siblingIndex, siblingTitles.length) : timeRange,
        order: candidates.length,
        siblingGroup: hasSiblings ? `storyboard-${index + 1}` : null,
        siblingIndex: hasSiblings ? siblingIndex : null,
        siblingCount: hasSiblings ? siblingTitles.length : null,
        uncertainties: hasSiblings ? ["same timeline row contains multiple recipe names; verify separation with storyboard frames"] : [],
      }));
    }
  }
  return candidates;
}

function buildCoarseStoryboardCandidates(sourcePacket, { maxCandidates = 8, maxWindowSec = 90 } = {}) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds);
  const title = cleanString(sourcePacket?.video?.title) ?? "whole video";
  if (!duration || duration <= 0) {
    return [buildStoryboardCandidate({
      candidateId: "whole",
      title,
      evidence: ["holistic-source"],
      sourceCues: ["holistic-source"],
      timeRange: {
        startSec: 0,
        endSec: duration,
        basis: duration ? "holistic-full-video" : "holistic-unknown-duration",
      },
      order: 0,
    })];
  }
  const count = Math.min(
    Math.max(1, maxCandidates),
    Math.max(1, Math.ceil(duration / Math.max(30, maxWindowSec))),
  );
  const windowSec = duration / count;
  return Array.from({ length: count }, (_, index) => {
    const startSec = Math.max(0, windowSec * index);
    const endSec = index === count - 1 ? duration : Math.min(duration, windowSec * (index + 1));
    const captionRefs = captionRefsForRange(sourcePacket, startSec, endSec);
    return buildStoryboardCandidate({
      candidateId: count === 1 ? "whole" : `coarse-${index + 1}`,
      title: count === 1 ? title : `${title} 구간 ${index + 1}`,
      evidence: uniqueStrings(["title", ...captionRefs]),
      sourceCues: uniqueStrings(["title", "coarse-video-window", captionRefs.length ? "caption-window" : null]),
      timeRange: {
        startSec,
        endSec,
        basis: "coarse-video-window",
      },
      uncertainties: ["description timeline missing or weak; this is a bounded visual probe window"],
      order: index,
    });
  });
}

export function recommendHolisticTimelineFrameBudget(sourcePacket, {
  enableTimelineUnderstanding = false,
  configuredFrameBudget = null,
  baseBudget = 16,
  multiRecipeBudget = 32,
  weakTimelineBudget = 48,
  maxBudget = 72,
} = {}) {
  const configured = configuredFrameBudget === null || configuredFrameBudget === undefined
    ? null
    : optionalNumber(configuredFrameBudget, null);
  if (!enableTimelineUnderstanding) return Math.max(1, configured ?? 8);
  if (configured !== null) return Math.max(1, Math.min(maxBudget, configured));
  const timelineEntries = storyboardTimelineEntries(sourcePacket, { maxCandidates: 64 });
  const text = `${sourcePacket?.video?.title ?? ""}\n${sourcePacket?.video?.description ?? ""}`;
  const recommended = timelineEntries.length === 0
    ? weakTimelineBudget
    : timelineEntries.length > 1 || hasMultiRecipeHint(text)
      ? multiRecipeBudget
      : baseBudget;
  return Math.max(1, Math.min(maxBudget, recommended));
}

export function buildHolisticStoryboardCandidateLedger(sourcePacket, {
  maxCandidates = 8,
  enableTimelineUnderstanding = false,
  frameBudget = null,
  coarseAsWholeRecipeCandidate = false,
} = {}) {
  const duration = optionalNumber(sourcePacket?.video?.durationSeconds);
  const timelineCandidates = storyboardTimelineEntries(sourcePacket, { maxCandidates, enableTimelineUnderstanding });
  const budget = frameBudget === null || frameBudget === undefined ? null : optionalNumber(frameBudget, null);
  const withFrameBudget = (candidates) => candidates.map((candidate) => ({
    ...candidate,
    ...(budget !== null ? { storyboardFrameBudget: Math.max(1, Math.ceil(budget / Math.max(1, candidates.length))) } : {}),
  }));
  if (timelineCandidates.length > 0) {
    const candidates = withFrameBudget(timelineCandidates);
    return {
      schemaVersion: 1,
      kind: "candidate-ledger",
      videoId: sourcePacket?.video?.videoId ?? null,
      candidates,
      summary: {
        timelineUnderstandingEnabled: enableTimelineUnderstanding,
        timelineSource: "description-timeline",
        totalCandidates: candidates.length,
        totalFrameBudget: budget,
      },
    };
  }
  if (enableTimelineUnderstanding) {
    const candidates = withFrameBudget(buildCoarseStoryboardCandidates(sourcePacket, {
      maxCandidates: coarseAsWholeRecipeCandidate ? 1 : maxCandidates,
    }));
    return {
      schemaVersion: 1,
      kind: "candidate-ledger",
      videoId: sourcePacket?.video?.videoId ?? null,
      candidates,
      summary: {
        timelineUnderstandingEnabled: true,
        timelineSource: "coarse-video-window",
        coarseAsWholeRecipeCandidate,
        totalCandidates: candidates.length,
        totalFrameBudget: budget,
      },
    };
  }
  return {
    schemaVersion: 1,
    kind: "candidate-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    candidates: [buildStoryboardCandidate({
      candidateId: "whole",
      title: sourcePacket?.video?.title ?? "whole video",
      evidence: ["holistic-source"],
      sourceCues: ["holistic-source"],
      timeRange: {
        startSec: 0,
        endSec: duration,
        basis: duration ? "holistic-full-video" : "holistic-unknown-duration",
      },
      order: 0,
    })],
  };
}

function visualNeedsFromDraft(draft) {
  const needs = [];
  const seen = new Set();
  for (const recipe of draft.recipes ?? []) {
    const pushNeed = (need) => {
      const key = estimateKey(recipe.candidateId, need.ingredient);
      if (seen.has(key)) return;
      seen.add(key);
      needs.push({ recipe, need });
    };
    for (const need of recipe.visualNeeds ?? []) {
      if (need.targetType !== "ingredient_amount") continue;
      if (!need.ingredient) continue;
      pushNeed(need);
    }
    for (const ingredient of recipe.ingredients ?? []) {
      if (ingredient.needsVisualEstimate !== true) continue;
      pushNeed({
        targetType: "ingredient_amount",
        ingredient: ingredient.name,
        reason: ingredient.uncertainty ?? "holistic draft marked ingredient amount for visual estimate",
        candidateTimeRange: recipe.timeRange,
        suggestedFrameRefs: [],
        evidence: ingredient.evidence,
      });
    }
  }
  return needs;
}

function recipeMapUnitForCandidate(wholeVideoRecipeMap, candidateId) {
  return (wholeVideoRecipeMap?.units ?? []).find((unit) => (
    unit.recipeUnitId === candidateId
    || normalizeStringArray(unit.sourceCandidateIds).includes(candidateId)
  )) ?? null;
}

function recipeMapAllowsVisualNeed(wholeVideoRecipeMap, recipe, need) {
  if (!wholeVideoRecipeMap) return true;
  const unit = recipeMapUnitForCandidate(wholeVideoRecipeMap, recipe?.candidateId);
  if (!unit) return true;
  return (unit.visualGaps ?? []).some((gap) => (
    (gap.targetType ?? "ingredient_amount") === "ingredient_amount"
    && amountCandidateMatchesIngredient({ ingredient: gap.ingredient }, need?.ingredient)
  ));
}

export function buildHolisticVisualTargetLedger({
  draft,
  sourcePacket,
  wholeVideoRecipeMap = null,
  maxTargetsPerRecipe = 3,
  maxTotalTargets = 12,
  maxWindowSec = 16,
  includeSparseRecallTargets = true,
  amountTargetsOnly = false,
} = {}) {
  const targets = [];
  const skippedTargets = [];
  const perRecipeCount = new Map();
  const targetKeys = new Set();
  const sparseRecipeIds = new Set(
    includeSparseRecallTargets
      ? (draft.recipes ?? []).filter(recipeNeedsVisualRecall).map((recipe) => recipe.candidateId)
      : [],
  );
  const pushTarget = ({ recipe, need, targetType = "ingredient_amount", groupedTarget = false, range = null }) => {
    if (targets.length >= maxTotalTargets) {
      skippedTargets.push({
        candidateId: recipe.candidateId,
        ingredient: need.ingredient,
        reasonCode: "max_total_targets_reached",
      });
      return;
    }
    const count = perRecipeCount.get(recipe.candidateId) ?? 0;
    if (count >= maxTargetsPerRecipe) {
      skippedTargets.push({
        candidateId: recipe.candidateId,
        ingredient: need.ingredient,
        reasonCode: "max_targets_per_recipe_reached",
      });
      return;
    }
    const key = `${recipe.candidateId}:${targetType}:${normalizeKey(need.ingredient)}`;
    if (targetKeys.has(key)) return;
    targetKeys.add(key);
    perRecipeCount.set(recipe.candidateId, count + 1);
    targets.push({
      targetId: `${recipe.candidateId}:${safeTargetSegment(need.ingredient)}`,
      candidateId: recipe.candidateId,
      targetType,
      ingredient: need.ingredient,
      reason: groupedTarget ? `${need.reason} (grouped visual need; use for recipe visual recall, not amount estimate)` : need.reason,
      sourceEvidence: normalizeStringArray(need.evidence),
      textCues: normalizeStringArray([need.reason]),
      preferredTimeRanges: range ? [{ ...range, basis: range.basis ?? "holistic-visual-need" }] : [],
      candidateTimeRange: recipe.timeRange,
      fallbackPolicy: range ? "holistic-visual-need-range" : targetType === "candidate_visual_recall" ? "candidate-visual-recall-sweep" : "description-only-sweep",
    });
  };
  if (includeSparseRecallTargets) {
    for (const recipe of draft.recipes ?? []) {
      if (!sparseRecipeIds.has(recipe.candidateId)) continue;
      pushTarget({
        recipe,
        need: {
          ingredient: "recipe-detail",
          reason: "draft has sparse steps or many missing amounts; collect visual recall for this recipe section",
          evidence: [recipe.title, ...(recipe.ingredients ?? []).flatMap((ingredient) => ingredient.evidence ?? [])],
          suggestedFrameRefs: [],
        },
        targetType: "candidate_visual_recall",
        groupedTarget: false,
        range: null,
      });
    }
  }
  for (const { recipe, need } of visualNeedsFromDraft(draft)) {
    const groupedTarget = isGroupedVisualIngredient(need.ingredient);
    if (!recipeMapAllowsVisualNeed(wholeVideoRecipeMap, recipe, need)) {
      skippedTargets.push({
        candidateId: recipe.candidateId,
        ingredient: need.ingredient,
        reasonCode: "recipe_map_visual_gap_missing",
      });
      continue;
    }
    if (amountTargetsOnly && groupedTarget) {
      skippedTargets.push({
        candidateId: recipe.candidateId,
        ingredient: need.ingredient,
        reasonCode: "timeline_ledger_amount_only_grouped_target_skipped",
      });
      continue;
    }
    if (
      amountTargetsOnly
      && normalizeStringArray(need.evidence).length === 0
    ) {
      skippedTargets.push({
        candidateId: recipe.candidateId,
        ingredient: need.ingredient,
        reasonCode: "timeline_ledger_missing_visual_evidence_skipped",
      });
      continue;
    }
    if (sparseRecipeIds.has(recipe.candidateId)) continue;
    pushTarget({
      recipe,
      need,
      targetType: groupedTarget ? "candidate_visual_recall" : "ingredient_amount",
      groupedTarget,
      range: groupedTarget ? null : clampVisualNeedRange(need.candidateTimeRange ?? recipe.timeRange, maxWindowSec),
    });
  }
  return {
    schemaVersion: 1,
    kind: "visual-target-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    targets,
    skippedTargets,
    summary: {
      totalTargets: targets.length,
      skippedTargets: skippedTargets.length,
      visualTargetAllowedCount: targets.length,
      recipeMapVisualGapFilterEnabled: Boolean(wholeVideoRecipeMap),
      recipeMapVisualGapSkippedCount: skippedTargets
        .filter((target) => target.reasonCode === "recipe_map_visual_gap_missing").length,
    },
    warnings: skippedTargets.filter((target) => target.reasonCode.startsWith("max_")),
  };
}

export function buildFinalOutputFromHolisticAudit(audit) {
  const recipes = audit.recipes.filter((recipe) => recipe.status === "kept").map((recipe) => {
    const ingredients = recipe.ingredients
      .filter((entry) => entry.status === "kept")
      .map((entry) => entry.ingredient);
    const steps = recipe.steps
      .filter((entry) => entry.status === "kept")
      .map((entry) => entry.text);
    const uncertainties = uniqueStrings([
      ...recipe.uncertainties,
      ...recipe.ingredients.filter((entry) => entry.status !== "kept").map((entry) => `${entry.original.name}: ${entry.reason}`),
      ...recipe.ingredients.filter((entry) => entry.amountStatus === "downgraded").map((entry) => `${entry.original.name}: amount/unit set to null because evidence was unsupported`),
      ...recipe.steps.filter((entry) => entry.status !== "kept").map((entry) => `단계 제외: ${entry.text}`),
    ]);
    return {
      title: recipe.title,
      candidateId: recipe.candidateId,
      ...(recipe.recipeSourceCandidateIds?.length ? { recipeSourceCandidateIds: recipe.recipeSourceCandidateIds } : {}),
      ingredients,
      steps,
      uncertainties,
    };
  });
  const repairLog = [];
  let patchIndex = 1;
  for (const recipe of audit.recipes) {
    if (recipe.status !== "kept") {
      repairLog.push({
        patchId: `holistic-${patchIndex++}`,
        candidateId: recipe.candidateId,
        field: "recipe",
        before: recipe.title,
        after: null,
        evidenceRef: [],
        reasonCode: "holistic_visual_only_recipe_removed",
        reason: recipe.reason,
        confidence: 0.85,
      });
      continue;
    }
    for (const entry of recipe.ingredients) {
      if (entry.status !== "kept") {
        repairLog.push({
          patchId: `holistic-${patchIndex++}`,
          candidateId: recipe.candidateId,
          field: "ingredient",
          before: entry.original.name,
          after: null,
          evidenceRef: entry.evidenceRefs,
          reasonCode: "holistic_unsupported_ingredient_removed",
          confidence: 0.8,
        });
      } else if (entry.amountStatus === "downgraded") {
        repairLog.push({
          patchId: `holistic-${patchIndex++}`,
          candidateId: recipe.candidateId,
          field: "amount",
          before: `${entry.original.amount ?? ""}${entry.original.unit ?? ""}`.trim() || null,
          after: null,
          evidenceRef: entry.evidenceRefs,
          reasonCode: "holistic_unsupported_amount_null_fallback",
          confidence: 0.8,
        });
      }
    }
    for (const entry of recipe.steps) {
      if (entry.status === "kept") continue;
      repairLog.push({
        patchId: `holistic-${patchIndex++}`,
        candidateId: recipe.candidateId,
        field: "step",
        before: entry.text,
        after: null,
        evidenceRef: entry.evidenceRefs,
        reasonCode: "holistic_unsupported_step_removed",
        confidence: 0.75,
      });
    }
  }
  return { recipes, repairLog };
}
