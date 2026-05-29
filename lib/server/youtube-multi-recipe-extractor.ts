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
    return null;
  }

  const candidates = structuredCandidates.map((candidate, index): YoutubeRawRecipeCandidate => {
    const draft = adaptCandidateToFlatDraft(candidateSelection(candidate));
    const evidenceRefs = buildEvidenceRefs({ candidate, source, segments });
    const { startMs, endMs } = candidateTimeRange(evidenceRefs);

    return {
      candidateId: `candidate-${index + 1}`,
      title: titleForCandidate(candidate, index),
      startMs,
      endMs,
      confidence: candidate.confidence,
      draft,
      evidenceRefs,
    };
  });

  return { source, candidates };
}
