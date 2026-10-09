import { describe, expect, it } from "vitest";

import { buildI031ParsedRecipe } from "@/lib/server/youtube-import";
import type { YoutubeI031ExtractionResult } from "@/lib/server/youtube-i031-runtime";
import { validateSourceAnchoredResult } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";

type TrialIngredient = YoutubeI031ExtractionResult["recipe"]["ingredients"][number] & {
  quantityState?: "explicit" | "estimated" | "to_taste" | "unknown" | "conflicting";
  amountBasis?: string | null;
  originalName?: string;
  alternativeNames?: string[];
  evidenceRefs?: Array<{
    source_method: "description" | "comment" | "caption" | "visual";
    source_provider: string;
    snippet: string;
    line_index?: number | null;
    start_ms?: number | null;
    end_ms?: number | null;
    frame_ts_ms?: number | null;
    locator_hash?: string | null;
  }>;
};

function extraction(ingredients: TrialIngredient[]): YoutubeI031ExtractionResult {
  return {
    identity: {} as YoutubeI031ExtractionResult["identity"],
    recipe: { title: "시험 요리", ingredients, steps: ["잘 섞는다."] },
    meta: {
      modelCallCount: 1,
      frameCount: 8,
      selectedFrameCount: 8,
      selectorBypassed: true,
      screenOcrStatus: "ok",
      sourceAvailability: { description: true, authorComment: false, transcript: true, onscreen: true },
      timings: { frameExtractMs: 1, selectorMs: 0, finalMs: 1, totalFreshMs: 2, ocrTotalMs: 1 },
    },
  };
}

const textEvidence = [{
  source_method: "description" as const,
  source_provider: "youtube",
  line_index: 4,
  snippet: "두부 1모",
  locator_hash: "literal-owner",
}];

describe("Luna trial quantity bridge", () => {
  it("marks verified explicit text and visual quantities as sourced", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "두부", amount: "1", unit: "모", optional: false, groupLabel: null,
        quantityState: "explicit", amountBasis: "stated", originalName: "큰 사이즈 두부",
        alternativeNames: ["부침용 두부"], evidenceRefs: textEvidence },
      { name: "물", amount: "300", unit: "ml", optional: false, groupLabel: null,
        quantityState: "explicit", amountBasis: "onscreen", evidenceRefs: [{ source_method: "visual",
          source_provider: "macos-vision-ocr", frame_ts_ms: 1200, snippet: "물 300ml" }] },
    ]));

    expect(parsed.ingredients[0]).toMatchObject({
      amount: 1,
      unit: "모",
      ingredientType: "QUANT",
      quantitySource: "text_explicit",
      quantityReviewRequired: false,
      rawText: "큰 사이즈 두부 1모",
      quantityEvidenceRefs: [expect.objectContaining({ snippet: "두부 1모", line_index: 4 })],
    });
    expect(parsed.ingredients[1]).toMatchObject({
      amount: 300,
      unit: "ml",
      quantitySource: "text_explicit",
      quantityReviewRequired: false,
    });
  });

  it("keeps estimated numbers visible as approximate and review-required", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "참기름", amount: "1", unit: "큰술", optional: false, groupLabel: null,
        quantityState: "estimated", amountBasis: "source-adjustable", evidenceRefs: [{ source_method: "visual",
          source_provider: "macos-vision-ocr", frame_ts_ms: 1000, snippet: "참기름 1큰술 정도" }] },
    ]));

    expect(parsed.ingredients[0]).toMatchObject({
      amount: 1,
      unit: "큰술",
      ingredientType: "QUANT",
      displayText: "참기름 약 1큰술",
      scalable: false,
      quantitySource: "recipe_inferred",
      quantityReviewRequired: true,
      quantityConfidence: 0.65,
    });
  });

  it("does not turn unknown or conflicting rows into quantities or to-taste rows", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "소금", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "unknown", evidenceRefs: [{ source_method: "caption", source_provider: "youtube", snippet: "소금" }] },
      { name: "마늘", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "conflicting", evidenceRefs: [{ source_method: "description", source_provider: "youtube", snippet: "마늘 1~2쪽" }] },
    ]));

    for (const ingredient of parsed.ingredients) {
      expect(ingredient).toMatchObject({
        amount: null,
        unit: null,
        ingredientType: "QUANT",
        quantitySource: "unknown",
        quantityReviewRequired: true,
      });
    }
  });

  it("uses TO_TASTE only for an explicitly verified to_taste state", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "후추", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "to_taste", evidenceRefs: [{ source_method: "caption", source_provider: "youtube", snippet: "후추 약간" }] },
      { name: "시각 소금", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "to_taste", evidenceRefs: [{ source_method: "visual", source_provider: "frame", snippet: "영상 장면" }] },
      { name: "OCR 소금", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "to_taste", evidenceRefs: [{ source_method: "visual", source_provider: "macos-vision-ocr", snippet: "소금 약간" }] },
    ]));

    expect(parsed.ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      ingredientType: "TO_TASTE",
      displayText: "후추 약간",
      quantitySource: "text_explicit",
      quantityReviewRequired: false,
    });
    expect(parsed.ingredients[1]).toMatchObject({
      ingredientType: "QUANT",
      amount: null,
      unit: null,
      quantitySource: "unknown",
      quantityReviewRequired: true,
    });
    expect(parsed.ingredients[2]).toMatchObject({
      ingredientType: "TO_TASTE",
      quantitySource: "text_explicit",
      quantityReviewRequired: false,
    });
  });

  it("fails closed when explicit metadata is incomplete and preserves legacy behavior when metadata is absent", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "불완전 오일", amount: "1", unit: "큰술", optional: false, groupLabel: null,
        quantityState: "explicit", evidenceRefs: [] },
      { name: "레거시 오일", amount: "1", unit: "큰술", optional: false, groupLabel: null },
      { name: "레거시 소금", amount: null, unit: null, optional: false, groupLabel: null },
    ]));

    expect(parsed.ingredients[0]).toMatchObject({ amount: null, unit: null, ingredientType: "QUANT",
      quantitySource: "unknown", quantityReviewRequired: true });
    expect(parsed.ingredients[1]).toMatchObject({ amount: 1, unit: "큰술", ingredientType: "QUANT",
      quantitySource: "unknown", quantityReviewRequired: false });
    expect(parsed.ingredients[2]).toMatchObject({ amount: null, unit: null, ingredientType: "TO_TASTE",
      quantitySource: "unknown", quantityReviewRequired: false });
  });

  it("fails closed for partial metadata and inconsistent state/basis/source combinations", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "부분 메타", amount: "1", unit: "개", optional: false, groupLabel: null, originalName: "부분 메타 원문" },
      { name: "잘못된 명시", amount: "1", unit: "개", optional: false, groupLabel: null,
        quantityState: "explicit", amountBasis: "visual-estimate", evidenceRefs: textEvidence },
      { name: "잘못된 추정", amount: "1", unit: "개", optional: false, groupLabel: null,
        quantityState: "estimated", amountBasis: "stated", evidenceRefs: textEvidence },
      { name: "잘못된 미확인", amount: null, unit: null, optional: false, groupLabel: null,
        quantityState: "unknown", amountBasis: "stated", evidenceRefs: textEvidence },
      { name: "잘못된 프레임 명시", amount: "1", unit: "개", optional: false, groupLabel: null,
        quantityState: "explicit", amountBasis: "onscreen", evidenceRefs: [{ source_method: "visual",
          source_provider: "codex-vision-keyframes", snippet: "영상 장면" }] },
    ]));

    for (const ingredient of parsed.ingredients) {
      expect(ingredient).toMatchObject({
        ingredientType: "QUANT",
        amount: null,
        unit: null,
        quantitySource: "unknown",
        quantityReviewRequired: true,
      });
    }
  });

  it("bounds evidence to the existing draft limit", () => {
    const parsed = buildI031ParsedRecipe(extraction([
      { name: "두부", amount: "1", unit: "모", optional: false, groupLabel: null,
        quantityState: "explicit", evidenceRefs: Array.from({ length: 8 }, (_, index) => ({
          source_method: "caption" as const,
          source_provider: "youtube",
          snippet: `두부 1모 ${index}`,
        })) },
    ]));

    expect(parsed.ingredients[0].quantityEvidenceRefs).toHaveLength(6);
  });

  it("matches the actual v63 verifier contract for OCR text quantities", () => {
    const ledgerBase = {
      kind: "ocr",
      scopeLabel: null,
      scopeContext: null,
      ingredientSection: false,
      inheritedUnit: null,
      inheritedOriginalUnit: null,
      unitEvidenceId: null,
      scopeKind: null,
      measurementBasis: null,
      source_method: "visual",
      source_provider: "macos-vision-ocr",
      line_index: null,
      timestampSec: 1,
    };
    const checked = validateSourceAnchoredResult({ recipes: [{ title: "OCR", ingredients: [
      { name: "참기름", sourceName: "참기름", amount: "1", unit: "큰술", quantityState: "estimated", optional: false,
        evidence: [{ id: "O1", quote: "참기름 1큰술 정도" }] },
      { name: "소금", sourceName: "소금", amount: null, unit: null, quantityState: "to_taste", optional: false,
        evidence: [{ id: "O2", quote: "소금 약간" }] },
    ], steps: ["섞는다."] }] }, [
      { ...ledgerBase, id: "O1", text: "참기름 1큰술 정도" },
      { ...ledgerBase, id: "O2", text: "소금 약간", timestampSec: 2 },
    ]);

    expect(checked.json.recipes[0].ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "참기름", amount: "1", unit: "큰술", quantityState: "estimated" }),
      expect.objectContaining({ name: "소금", amount: null, unit: null, quantityState: "to_taste" }),
    ]));
  });
});
