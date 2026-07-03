import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const QUANTITY_PATTERN = /(?<amount>\d+(?:\.\d+)?(?:\/\d+)?)\s*(?<unit>g|kg|ml|l|큰술|작은술|개|컵|스푼|t|T|분|도|℃|%)/iu;
const ACTION_CUE_PATTERN = /넣|붓|바르|바른|뿌리|섞|올리|굽|채우|묻히|덜|담|끓|볶|부어|발라/iu;

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function safeTargetSegment(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9가-힣_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 50) || "unknown";
}

function maxCaptionEndSec(sourcePacket) {
  const ends = (sourcePacket?.captions?.segments ?? [])
    .map((segment) => Number(segment.endMs))
    .filter(Number.isFinite)
    .map((endMs) => endMs / 1000);
  return ends.length ? Math.max(...ends) : null;
}

function normalizeTimeRange(candidate, index, count, sourcePacket) {
  const raw = candidate?.timeRange;
  const start = Number(raw?.startSec);
  const end = Number(raw?.endSec);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return { startSec: start, endSec: end, basis: "candidate-output" };
  }
  const captionCueRange = captionCueTimeRange(candidate, sourcePacket);
  if (captionCueRange) return captionCueRange;
  const duration = Number(sourcePacket?.video?.durationSeconds) || maxCaptionEndSec(sourcePacket);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { startSec: null, endSec: null, basis: "unknown" };
  }
  if (count <= 1) {
    return { startSec: 0, endSec: Math.round(duration), basis: "whole-video" };
  }
  const slice = duration / count;
  return {
    startSec: Math.round(slice * index),
    endSec: Math.round(slice * (index + 1)),
    basis: "even-split-fallback",
  };
}

function candidateCueTokens(candidate) {
  return uniqueStrings([
    candidate?.title,
    ...(String(candidate?.title ?? "").split(/[\s/&|ㅣ,]+/u)),
    ...(candidate?.ingredientNames ?? []),
  ]).filter((token) => [...token].length >= 2);
}

function captionCueTimeRange(candidate, sourcePacket) {
  const tokens = candidateCueTokens(candidate);
  if (tokens.length === 0) return null;
  const matched = (sourcePacket?.captions?.segments ?? [])
    .filter((segment) => tokens.some((token) => String(segment.text ?? "").includes(token)))
    .map((segment) => {
      const startMs = Number(segment.startMs);
      const endMs = Number(segment.endMs);
      const fallbackEndMs = Number.isFinite(startMs) ? startMs + 2500 : null;
      return {
        startSec: Number.isFinite(startMs) ? startMs / 1000 : null,
        endSec: Number.isFinite(endMs) ? endMs / 1000 : fallbackEndMs === null ? null : fallbackEndMs / 1000,
      };
    })
    .filter((segment) => Number.isFinite(segment.startSec) && Number.isFinite(segment.endSec) && segment.endSec >= segment.startSec);
  if (matched.length === 0) return null;
  const startSec = Math.max(0, Math.floor(Math.min(...matched.map((segment) => segment.startSec)) - 20));
  const endSec = Math.ceil(Math.max(...matched.map((segment) => segment.endSec)) + 60);
  return { startSec, endSec, basis: "caption-cue" };
}

export function buildCandidateLedger({ sourcePacket, candidateOutput }) {
  const candidates = candidateOutput.candidates.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    titleHint: candidate.title,
    aliases: uniqueStrings([candidate.title, ...(candidate.aliases ?? [])]),
    timeRange: normalizeTimeRange(candidate, index, candidateOutput.candidates.length, sourcePacket),
    sourceCues: uniqueStrings([
      ...(candidate.evidence ?? []),
      ...(candidate.sourceCues ?? []),
      sourcePacket?.video?.title ? "title" : null,
      sourcePacket?.video?.description ? "description" : null,
    ]),
    ingredientNames: uniqueStrings(candidate.ingredientNames ?? []),
    confidence: Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0.7,
    uncertainties: uniqueStrings(candidate.uncertainties ?? []),
  }));
  return {
    schemaVersion: 1,
    kind: "candidate-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    candidates,
  };
}

export function buildVisualLedger({ sourcePacket, candidateLedger }) {
  return {
    schemaVersion: 1,
    kind: "visual-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    collectionStatus: "not-requested",
    note: "No frame extractor was invoked for this MVP run; visual-estimate values must not be invented from this empty ledger.",
    candidates: candidateLedger.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      timeRange: candidate.timeRange,
      frames: [],
      observed: [],
      onscreenText: [],
      quantityCues: [],
    })),
  };
}

function sourceText(sourcePacket) {
  const authorComments = Array.isArray(sourcePacket?.authorComments)
    ? sourcePacket.authorComments
    : Array.isArray(sourcePacket?.authorComments?.comments)
    ? sourcePacket.authorComments.comments.map((comment) => comment.text)
    : [];
  return [
    sourcePacket?.video?.title,
    sourcePacket?.video?.description,
    ...authorComments,
    ...(sourcePacket?.captions?.segments ?? []).map((segment) => segment.text),
  ].filter(Boolean).join("\n");
}

function sourceLines(sourcePacket) {
  return sourceText(sourcePacket)
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function lineMentionsIngredient(line, ingredientName) {
  const rawLine = String(line ?? "");
  const rawIngredient = String(ingredientName ?? "").trim();
  const compactIngredient = rawIngredient.replace(/\s+/gu, "");
  if ([...compactIngredient].length <= 1) {
    const escaped = compactIngredient.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(^|[^가-힣A-Za-z0-9])${escaped}(?:\\s*\\([^)]*\\))?(?:을|를|이|가|은|는|도|만|에|으로|로)?([^가-힣A-Za-z0-9]|$)`, "u").test(rawLine);
  }
  const normalizedLine = String(line ?? "").replace(/\s+/gu, "");
  const normalizedIngredient = compactIngredient;
  return Boolean(normalizedIngredient && normalizedLine.includes(normalizedIngredient));
}

function extractCaptionEvidence(sourcePacket, candidate) {
  const names = candidate.ingredientNames ?? [];
  const range = candidate.timeRange ?? {};
  return (sourcePacket?.captions?.segments ?? [])
    .filter((segment) => {
      const startSec = Number(segment.startMs) / 1000;
      const inRange = Number.isFinite(startSec)
        && (range.startSec === null || startSec >= Number(range.startSec))
        && (range.endSec === null || startSec <= Number(range.endSec));
      return inRange && names.some((name) => lineMentionsIngredient(segment.text, name));
    })
    .slice(0, 24)
    .map((segment) => ({
      ref: `transcript:${Math.round(Number(segment.startMs) / 1000)}s`,
      text: segment.text,
    }));
}

function captionSegmentsForIngredient(sourcePacket, candidate, ingredientName, {
  beforeSec = 8,
  afterSec = 12,
  maxRanges = 3,
} = {}) {
  const range = candidate.timeRange ?? {};
  const segments = (sourcePacket?.captions?.segments ?? [])
    .map((segment) => {
      const startSec = Number(segment.startMs) / 1000;
      const rawEndMs = Number(segment.endMs);
      const endSec = Number.isFinite(rawEndMs) && rawEndMs > Number(segment.startMs)
        ? rawEndMs / 1000
        : startSec + 2.5;
      return {
        text: String(segment.text ?? ""),
        startSec,
        endSec,
      };
    })
    .filter((segment) => Number.isFinite(segment.startSec))
    .filter((segment) => {
      const inRange = (range.startSec === null || segment.startSec >= Number(range.startSec))
        && (range.endSec === null || segment.startSec <= Number(range.endSec));
      const hasIngredient = lineMentionsIngredient(segment.text, ingredientName);
      return inRange && hasIngredient;
    })
    .slice(0, maxRanges);
  return segments.map((segment) => ({
    startSec: Math.max(0, Math.floor(segment.startSec - beforeSec)),
    endSec: Math.ceil(segment.endSec + afterSec),
    basis: ACTION_CUE_PATTERN.test(segment.text) ? "caption-ingredient-action-cue" : "caption-ingredient-cue",
    cueText: segment.text,
  }));
}

export function extractAmountFromSource(sourcePacket, ingredientName) {
  if (!ingredientName) return null;
  const compactIngredient = String(ingredientName).replace(/\s+/gu, "");
  const flexibleIngredient = [...compactIngredient]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("\\s*");
  for (const line of sourceLines(sourcePacket)) {
    if (!lineMentionsIngredient(line, ingredientName)) continue;
    const exactIndex = line.indexOf(ingredientName);
    const afterName = exactIndex >= 0 ? line.slice(exactIndex + ingredientName.length) : "";
    const match = afterName.match(QUANTITY_PATTERN) ?? line.match(new RegExp(`${flexibleIngredient}\\s*${QUANTITY_PATTERN.source}`, "iu"));
    if (match?.groups?.amount && match?.groups?.unit) {
      return {
        amount: match.groups.amount,
        unit: match.groups.unit,
        amountBasis: "stated",
        evidence: ["sourcePacket:description"],
      };
    }
  }
  return null;
}

function extractDescriptionEvidence(sourcePacket, candidate) {
  const names = candidate.ingredientNames ?? [];
  return sourceLines(sourcePacket)
    .filter((line) => names.some((name) => lineMentionsIngredient(line, name)) || /재료|만들|굽|볶|끓|섞|반죽|오븐/iu.test(line))
    .slice(0, 30)
    .map((text, index) => ({ ref: `source:${index + 1}`, text }));
}

export function buildVisualTargetLedger({
  sourcePacket,
  candidateLedger,
  maxRanges = 3,
  windowBeforeSec = 8,
  windowAfterSec = 12,
  descriptionOnlySweep = true,
  maxTargetsPerCandidate = 8,
} = {}) {
  const descriptionLines = sourceLines({ ...sourcePacket, captions: { segments: [] } });
  const targets = [];
  for (const candidate of candidateLedger.candidates ?? []) {
    let candidateTargetCount = 0;
    for (const ingredient of candidate.ingredientNames ?? []) {
      if (candidateTargetCount >= maxTargetsPerCandidate) break;
      const amountCue = extractAmountFromSource(sourcePacket, ingredient);
      if (amountCue) continue;
      const descriptionCues = descriptionLines
        .filter((line) => lineMentionsIngredient(line, ingredient))
        .slice(0, 6);
      const preferredTimeRanges = captionSegmentsForIngredient(sourcePacket, candidate, ingredient, {
        beforeSec: windowBeforeSec,
        afterSec: windowAfterSec,
        maxRanges,
      });
      const hasDescriptionCue = descriptionCues.length > 0;
      const hasCaptionCue = preferredTimeRanges.length > 0;
      const shouldTarget = hasDescriptionCue || hasCaptionCue || candidate.sourceCues?.includes("description");
      if (!shouldTarget) continue;
      const descriptionOnly = hasDescriptionCue && !hasCaptionCue;
      if (descriptionOnly && !descriptionOnlySweep) continue;
      const fallbackPolicy = descriptionOnly ? "description-only-sweep" : "none";
      targets.push({
        targetId: `${candidate.candidateId}:${safeTargetSegment(ingredient)}`,
        candidateId: candidate.candidateId,
        ingredient,
        reason: descriptionOnly ? "description_has_ingredient_without_amount" : "caption_or_action_cue_without_amount",
        textCues: uniqueStrings([...descriptionCues, ...preferredTimeRanges.map((range) => range.cueText)]).slice(0, 10),
        preferredTimeRanges: preferredTimeRanges.map((range) => {
          const publicRange = { ...range };
          delete publicRange.cueText;
          return publicRange;
        }),
        fallbackPolicy,
        candidateTimeRange: candidate.timeRange,
      });
      candidateTargetCount += 1;
    }
  }
  return {
    schemaVersion: 1,
    kind: "visual-target-ledger",
    videoId: sourcePacket?.video?.videoId ?? null,
    settings: {
      maxRanges,
      windowBeforeSec,
      windowAfterSec,
      descriptionOnlySweep,
      maxTargetsPerCandidate,
    },
    targets,
  };
}

export function buildEvidencePackets({ sourcePacket, candidateLedger, visualLedger, visualTargetLedger = null, visualEstimates = null }) {
  const packets = candidateLedger.candidates.map((candidate) => {
    const visual = visualLedger.candidates.find((entry) => entry.candidateId === candidate.candidateId) ?? null;
    const descriptionEvidence = extractDescriptionEvidence(sourcePacket, candidate);
    const transcriptEvidence = extractCaptionEvidence(sourcePacket, candidate);
    const amountCues = candidate.ingredientNames
      .map((name) => ({ name, cue: extractAmountFromSource(sourcePacket, name) }))
      .filter((entry) => entry.cue)
      .map((entry) => ({
        ingredient: entry.name,
        amount: entry.cue.amount,
        unit: entry.cue.unit,
        basis: entry.cue.amountBasis,
        evidenceRef: entry.cue.evidence,
      }));
    return {
      candidateId: candidate.candidateId,
      titleHint: candidate.titleHint,
      timeRange: candidate.timeRange,
      ingredientNames: candidate.ingredientNames,
      sourceCues: candidate.sourceCues,
      descriptionEvidence,
      transcriptEvidence,
      visualEvidence: visual ? visual.frames : [],
      visualTargets: (visualTargetLedger?.targets ?? []).filter((target) => target.candidateId === candidate.candidateId),
      visualEstimates: (visualEstimates?.visualEstimates ?? []).filter((estimate) => estimate.candidateId === candidate.candidateId),
      amountCues,
      uncertainties: candidate.uncertainties,
    };
  });
  return {
    schemaVersion: 1,
    kind: "evidence-packets",
    videoId: sourcePacket?.video?.videoId ?? null,
    packets,
  };
}

function hasFrameEvidence(estimate) {
  return (estimate?.evidence ?? []).some((entry) => String(entry).startsWith("frame:"));
}

function hasVisualReason(estimate) {
  return /숟가락|스푼|컵|계량|병|그릇|팬|손|채워|붓|바르|뿌리|담|표면|기준|reference|fill|pour/iu.test(String(estimate?.reason ?? ""));
}

export function applyVisualEstimateRepair({ output, visualEstimates }) {
  const recipes = (output.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: [...(recipe.ingredients ?? [])],
    steps: [...(recipe.steps ?? [])],
    uncertainties: [...(recipe.uncertainties ?? [])],
  }));
  const repairLog = [...(output.repairLog ?? [])];
  let patchIndex = repairLog.length + 1;

  for (const estimate of visualEstimates?.visualEstimates ?? []) {
    if (!estimate?.amount || !estimate?.unit) continue;
    if (estimate.amountBasis !== "visual-estimate") continue;
    if (Number(estimate.confidence ?? 0) < 0.35) continue;
    if (!hasFrameEvidence(estimate)) continue;
    if (!hasVisualReason(estimate)) continue;
    const recipe = recipes.find((entry) => entry.candidateId === estimate.candidateId)
      ?? recipes.find((entry) => (entry.ingredients ?? []).some((ingredient) => sameIngredient(ingredient.name, estimate.ingredient)));
    if (!recipe) continue;
    const ingredient = recipe.ingredients.find((entry) => sameIngredient(entry.name, estimate.ingredient));
    if (!ingredient) continue;
    if (ingredient.amount !== null && ingredient.amount !== undefined && ingredient.unit !== null && ingredient.unit !== undefined) continue;
    const before = {
      name: ingredient.name,
      amount: ingredient.amount ?? null,
      unit: ingredient.unit ?? null,
      amountBasis: ingredient.amountBasis ?? null,
    };
    ingredient.amount = estimate.amount;
    ingredient.unit = estimate.unit;
    ingredient.amountBasis = "visual-estimate";
    ingredient.confidence = Math.max(Number(ingredient.confidence ?? 0), Number(estimate.confidence ?? 0));
    ingredient.evidence = uniqueStrings([...(ingredient.evidence ?? []), ...(estimate.evidence ?? [])]);
    repairLog.push({
      patchId: `visual-repair-${patchIndex++}`,
      candidateId: recipe.candidateId ?? estimate.candidateId,
      field: "amount",
      before,
      after: {
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        amountBasis: ingredient.amountBasis,
      },
      evidenceRef: estimate.evidence,
      reasonCode: "visual_estimate_from_reference_object",
      reason: estimate.reason ?? null,
      confidence: Number(estimate.confidence ?? 0),
    });
  }

  return { recipes, repairLog };
}

function sameIngredient(left, right) {
  const l = cleanString(left)?.replace(/\s+/gu, "");
  const r = cleanString(right)?.replace(/\s+/gu, "");
  return Boolean(l && r && (l === r || l.includes(r) || r.includes(l)));
}

function commonSuffixLength(left, right) {
  const l = [...String(left ?? "")];
  const r = [...String(right ?? "")];
  let count = 0;
  while (count < l.length && count < r.length && l[l.length - 1 - count] === r[r.length - 1 - count]) {
    count += 1;
  }
  return count;
}

function titleSeparatorBetween(sourceTitle, leftTitle, rightTitle) {
  const leftIndex = sourceTitle.indexOf(leftTitle);
  const rightIndex = sourceTitle.indexOf(rightTitle, leftIndex + leftTitle.length);
  if (leftIndex < 0 || rightIndex < 0) return null;
  return sourceTitle.slice(leftIndex + leftTitle.length, rightIndex);
}

function shouldMergeAdjacentCandidates(sourceTitle, left, right) {
  const separator = titleSeparatorBetween(sourceTitle, left.title, right.title);
  if (separator === null) return false;
  if (/[ㅣ|,&,/·•:;+\-]/u.test(separator)) return false;
  if (separator.replace(/\s+/gu, "") !== "") return false;
  return commonSuffixLength(left.title, right.title) >= 2;
}

export function applyGenericCandidateRepair({ candidateOutput, sourcePacket }) {
  const sourceTitle = sourcePacket?.video?.title ?? "";
  const repaired = [];
  const candidateRepairLog = [...(candidateOutput.candidateRepairLog ?? [])];
  let index = 0;
  let patchIndex = candidateRepairLog.length + 1;

  while (index < candidateOutput.candidates.length) {
    const current = candidateOutput.candidates[index];
    const next = candidateOutput.candidates[index + 1];
    if (next && shouldMergeAdjacentCandidates(sourceTitle, current, next)) {
      const merged = {
        ...current,
        title: `${current.title} ${next.title}`,
        ingredientNames: uniqueStrings([...(current.ingredientNames ?? []), ...(next.ingredientNames ?? [])]),
        evidence: uniqueStrings([...(current.evidence ?? []), ...(next.evidence ?? []), "title:whitespace-variant-merge"]),
        uncertainties: uniqueStrings([
          ...(current.uncertainties ?? []),
          ...(next.uncertainties ?? []),
          "제목에서 강한 구분자 없이 공백으로 이어진 같은 계열 음식명을 한 후보로 병합",
        ]),
      };
      repaired.push(merged);
      candidateRepairLog.push({
        patchId: `candidate-repair-${patchIndex++}`,
        field: "candidate",
        before: [current, next],
        after: merged,
        evidenceRef: ["title"],
        reasonCode: "merge_whitespace_variant_titles",
        confidence: 0.65,
      });
      index += 2;
      continue;
    }
    repaired.push(current);
    index += 1;
  }

  return {
    ...candidateOutput,
    candidates: repaired,
    candidateRepairLog,
  };
}

export function applyGenericRepair({ output, candidateOutput, sourcePacket }) {
  const recipes = (output.recipes ?? []).map((recipe) => ({
    ...recipe,
    ingredients: [...(recipe.ingredients ?? [])],
    steps: [...(recipe.steps ?? [])],
    uncertainties: [...(recipe.uncertainties ?? [])],
  }));
  const repairLog = [...(output.repairLog ?? [])];
  let patchIndex = repairLog.length + 1;

  for (const recipe of recipes) {
    const candidate = candidateOutput.candidates.find((entry) => entry.candidateId === recipe.candidateId)
      ?? candidateOutput.candidates.find((entry) => sameIngredient(entry.title, recipe.title));
    if (!candidate) continue;
    for (const ingredientName of candidate.ingredientNames ?? []) {
      const existing = recipe.ingredients.find((ingredient) => sameIngredient(ingredient.name, ingredientName));
      const amountCue = extractAmountFromSource(sourcePacket, ingredientName);
      if (!existing) {
        const added = {
          name: ingredientName,
          amount: amountCue?.amount ?? null,
          unit: amountCue?.unit ?? null,
          amountBasis: amountCue?.amountBasis ?? null,
          confidence: amountCue ? 0.75 : 0.45,
          evidence: amountCue?.evidence ?? candidate.evidence ?? [],
        };
        recipe.ingredients.push(added);
        repairLog.push({
          patchId: `generic-repair-${patchIndex++}`,
          candidateId: recipe.candidateId ?? candidate.candidateId,
          field: "ingredient",
          before: null,
          after: added,
          evidenceRef: added.evidence,
          reasonCode: "missing_evidence_backed_ingredient",
          confidence: added.confidence,
        });
        continue;
      }
      if ((existing.amount === null || existing.amount === undefined || existing.unit === null || existing.unit === undefined) && amountCue) {
        const before = { amount: existing.amount ?? null, unit: existing.unit ?? null, amountBasis: existing.amountBasis ?? null };
        existing.amount = amountCue.amount;
        existing.unit = amountCue.unit;
        existing.amountBasis = amountCue.amountBasis;
        existing.evidence = uniqueStrings([...(existing.evidence ?? []), ...amountCue.evidence]);
        existing.confidence = Math.max(Number(existing.confidence ?? 0), 0.75);
        repairLog.push({
          patchId: `generic-repair-${patchIndex++}`,
          candidateId: recipe.candidateId ?? candidate.candidateId,
          field: "amount",
          before,
          after: { amount: existing.amount, unit: existing.unit, amountBasis: existing.amountBasis },
          evidenceRef: amountCue.evidence,
          reasonCode: "amount_from_source_packet",
          confidence: 0.75,
        });
      }
    }
  }
  return { recipes, repairLog };
}

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function hashFile(filePath) {
  return hashText(await readFile(filePath, "utf8"));
}

export async function freezePiExtraction({ projectRoot = process.cwd(), dataRoot = "notebooks/recipe_loop_data", split = "train", outTag, ids = null }) {
  if (!outTag) throw new Error("outTag is required");
  const splitDir = path.join(projectRoot, dataRoot, split);
  const resolvedIds = ids ?? (await readdir(splitDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const cases = [];
  for (const id of resolvedIds) {
    const runDir = path.join(splitDir, id, "runs", outTag);
    const files = {};
    for (const fileName of [
      "result.json",
      "candidate-ledger.json",
      "visual-target-ledger.json",
      "visual-ledger.json",
      "visual-estimates.json",
      "evidence-packets.json",
      "file-access-manifest.json",
      "source-packet.json",
    ]) {
      const filePath = path.join(runDir, fileName);
      files[fileName] = existsSync(filePath)
        ? { exists: true, sha256: await hashFile(filePath), bytes: (await readFile(filePath)).length }
        : { exists: false, sha256: null, bytes: 0 };
    }
    let manifest = null;
    const manifestPath = path.join(runDir, "file-access-manifest.json");
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    }
    cases.push({
      videoId: id,
      runDir: path.relative(projectRoot, runDir),
      completed: files["result.json"].exists,
      forbiddenReadCount: manifest?.forbiddenReadEvents?.length ?? null,
      readEvents: manifest?.readEvents ?? [],
      files,
    });
  }
  const freeze = {
    schemaVersion: 1,
    kind: "pi-extraction-freeze",
    split,
    outTag,
    frozenAt: new Date().toISOString(),
    policy: {
      gradingAllowedAfterFreeze: true,
      goldenReadDuringFreeze: false,
    },
    caseCount: cases.length,
    completedCount: cases.filter((item) => item.completed).length,
    forbiddenReadCount: cases.reduce((sum, item) => sum + Number(item.forbiddenReadCount ?? 0), 0),
    cases,
  };
  const freezePath = path.join(splitDir, `_pi_freeze.${outTag}.json`);
  await writeFile(freezePath, JSON.stringify(freeze, null, 2) + "\n", "utf8");
  return { freeze, freezePath };
}
