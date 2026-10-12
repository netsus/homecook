import { describe, expect, it } from "vitest";

import fixture from "@/tests/fixtures/youtube-source-bound-quantity-recovery-v2.json";
import {
  buildSinglePassEvidenceLedger,
} from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs";
import {
  buildSourceQuantityOwnerHints,
  SOURCE_QUANTITY_OWNER_HINT_VERSION,
} from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-quantity-owner-hints.mjs";
import {
  buildSourceAnchoredPrompt,
  validateSourceAnchoredResult,
} from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";

type FixtureCase = {
  case_id: string;
  source_text: string;
  ingredient: string;
  display_name?: string;
  submitted_evidence_text?: string;
};

function ledgerFor(testCase: FixtureCase) {
  return buildSinglePassEvidenceLedger({
    sourceText: testCase.source_text,
    sourceAnchored: true,
  });
}

function verify(
  testCase: FixtureCase,
  submitted: { quantityState?: string; amount?: string | null; unit?: string | null } = {},
) {
  const ledger = ledgerFor(testCase);
  const boundOwner = ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
    entry.sourceQuantityBindings?.some((binding) => binding.sourceName === testCase.ingredient));
  const evidenceEntry = testCase.submitted_evidence_text
    ? ledger.find((entry: { text?: string }) => entry.text === testCase.submitted_evidence_text)
    : boundOwner ?? ledger.find((entry: { text?: string }) => entry.text === testCase.ingredient)
      ?? ledger.find((entry: { kind: string }) => entry.kind === "text");
  if (!evidenceEntry) throw new Error(`missing evidence entry for ${testCase.case_id}`);

  const checked = validateSourceAnchoredResult({
    recipes: [{
      title: "원천 결속 수량 회귀",
      ingredients: [{
        name: testCase.display_name ?? testCase.ingredient,
        sourceName: testCase.ingredient,
        amount: submitted.amount ?? null,
        unit: submitted.unit ?? null,
        quantityState: submitted.quantityState ?? "unknown",
        optional: false,
        evidence: [{ id: evidenceEntry.id, quote: evidenceEntry.text }],
      }],
      steps: ["재료를 준비한다."],
    }],
  }, ledger);
  return { checked, ledger };
}

describe("server-bound description and author-comment quantity recovery", () => {
  it.each(fixture.positive_cases)("recovers only a server-bound primary quantity: $case_id", (testCase) => {
    const { checked } = verify(testCase);
    const row = checked.json.recipes[0].ingredients[0];

    expect(row).toMatchObject({
      originalName: testCase.ingredient,
      amount: testCase.expected.amount,
      unit: testCase.expected.unit,
      amountRawText: `${testCase.expected.amount}${testCase.expected.unit}`,
      quantityState: "explicit",
      amountBasis: "stated",
      evidenceRefs: [expect.objectContaining({ snippet: testCase.expected.owner_text })],
    });
    expect(checked.corrections).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered", actor: "SYSTEM" }),
    ]));
  });

  it("carries normalized name/quantity coordinates and keeps parenthetical mass as reference evidence", () => {
    const testCase = fixture.positive_cases.find(({ case_id }) => case_id === "matching-description-and-comment");
    if (!testCase) throw new Error("missing matching source fixture");
    const { checked, ledger } = verify(testCase);
    const owners = ledger.filter((entry: { sourceQuantityBindings?: unknown[] }) => entry.sourceQuantityBindings?.length);
    const onion = owners.flatMap((entry: { sourceQuantityBindings: Array<Record<string, unknown>> }) => entry.sourceQuantityBindings)
      .find((binding: Record<string, unknown>) => binding.sourceName === "양파");

    expect(onion).toMatchObject({
      sourceName: "양파",
      amount: "2",
      unit: "개",
      normalizedCoordinates: {
        name: { start: expect.any(Number), end: expect.any(Number) },
        quantity: { start: expect.any(Number), end: expect.any(Number) },
      },
      references: [{ amount: "500", unit: "g", normalizedCoordinates: { start: expect.any(Number), end: expect.any(Number) } }],
    });
    const row = checked.json.recipes[0].ingredients[0];
    expect(row).toMatchObject({ amount: "2", unit: "개", amountRawText: "2개" });
    expect(row.evidenceRefs[0].snippet).toBe("양파 2개(500g)");
    expect(row).not.toMatchObject({ amount: "500", unit: "g" });
  });

  it.each(fixture.guard_cases)("preserves a guarded source case: $case_id", (testCase) => {
    const { checked } = verify(testCase);
    const row = checked.json.recipes[0].ingredients[0];

    expect(row).toMatchObject({ amount: null, unit: null, quantityState: testCase.expected_state });
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });

  it.each(["·", "ㆍ", "▶", "1."])("normalizes the %s list marker without moving the owner span", (marker) => {
    const testCase = {
      case_id: `list-marker-${marker}`,
      source_text: `[SOURCE: description]\n[재료]\n${marker} 양파 2개\n${marker} 대파 1대`,
      ingredient: "양파",
    };
    const { checked, ledger } = verify(testCase);
    const owner = ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "양파"));

    expect(owner?.text).toBe(`${marker.normalize("NFKC")} 양파 2개`);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      originalName: "양파",
      amount: "2",
      unit: "개",
      quantityState: "explicit",
    });
  });

  it("requires the baseline verifier to bind the model row to the server owner", () => {
    const testCase = {
      ...fixture.positive_cases[0],
      submitted_evidence_text: "- 양파 2개(500g)",
    };
    const { checked } = verify(testCase);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "unknown" });
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });

  it("uses the server-bound source name instead of a conflicting model display name", () => {
    const testCase = {
      case_id: "model-display-name-mismatch",
      source_text: "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대",
      ingredient: "양파",
      display_name: "대파",
    };
    const { checked } = verify(testCase);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      originalName: "양파",
      amount: "2",
      unit: "개",
      quantityState: "explicit",
    });
  });

  it("does not let two model rows consume one server owner", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대",
      sourceAnchored: true,
    });
    const owner = ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "양파"));
    if (!owner) throw new Error("missing onion owner");
    const ingredient = {
      name: "양파",
      sourceName: "양파",
      amount: null,
      unit: null,
      quantityState: "unknown",
      optional: false,
      evidence: [{ id: owner.id, quote: owner.text }],
    };
    const checked = validateSourceAnchoredResult({
      recipes: [{ title: "중복 소유자", ingredients: [ingredient, { ...ingredient }], steps: ["준비한다."] }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients).toEqual([
      expect.objectContaining({ amount: null, unit: null, quantityState: "unknown" }),
      expect.objectContaining({ amount: null, unit: null, quantityState: "unknown" }),
    ]);
    expect(checked.corrections.filter((correction: { reason?: string }) =>
      correction.reason === "owner-claimed-by-multiple-rows")).toHaveLength(2);
  });

  it.each([
    ["cross-source alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 3개 또는 대파 1대"],
    ["cross-source conditional", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n원하면 양파 3개"],
    ["cross-source range", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 3~4개"],
    ["cross-source negation", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파는 넣지 마세요"],
    ["same-block repeated action", "[SOURCE: description]\n[재료]\n양파 2개\n양파는 나중에 더 넣어요\n대파 1대"],
    ["spaced Korean alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파나 대파 1대"],
    ["qualitative generous", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 넉넉히"],
    ["qualitative suitable", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 적당히"],
    ["qualitative extra", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 조금 더"],
    ["qualitative heaped", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 듬뿍"],
    ["qualitative many", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 많이"],
    ["qualitative small amount", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 소량"],
    ["comma Korean alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파나, 대파 1대"],
    ["slash Korean alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파나/대파 1대"],
    ["Korean slice action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 썰어주세요"],
    ["Korean cut action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파를 잘라주세요"],
    ["Korean chop action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파를 다져주세요"],
    ["Korean prepare action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 준비해주세요"],
    ["English slice action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 slice thinly"],
    ["English chop action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 chop finely"],
    ["English prepare action", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 prepare ahead"],
    ["English when condition", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\nwhen 양파 is available"],
    ["Korean use condition", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 사용 시"],
    ["Korean present condition", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파가 있다면"],
    ["Korean absent condition", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파가 없다면"],
    ["slash one-of alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파/대파 중 하나"],
    ["pipe one-of alternative", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 | 대파 중 하나"],
    ["Korean omit request", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 빼주세요"],
    ["Korean omit clause", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 빼고"],
    ["Korean add noun", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 추가"],
    ["Korean add request", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 추가해주세요"],
    ["Korean more", "[SOURCE: description]\n[재료]\n양파 2개\n대파 1대\n[SOURCE: author_comment]\n양파 더"],
  ])("keeps a bound amount reviewable when there is an unsafe %s mention", (_label, sourceText) => {
    const { checked } = verify({ case_id: _label, source_text: sourceText, ingredient: "양파" });

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "unknown" });
    expect(checked.corrections).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-review-required", reason: "source-related-unbound-mention" }),
    ]));
  });

  it("keeps separate author comments as separate source blocks and preserves their conflict", () => {
    const testCase = {
      case_id: "separate-author-comment-conflict",
      source_text: "[SOURCE: author_comment]\n[재료]\n양파 2개\n대파 1대\n---\n[재료]\n양파 3개\n대파 1대",
      ingredient: "양파",
    };
    const { checked, ledger } = verify(testCase);
    const onionBindings: Array<Record<string, unknown>> = ledger.flatMap((entry: { sourceQuantityBindings?: Array<Record<string, unknown>> }) =>
      entry.sourceQuantityBindings ?? []).filter((binding: Record<string, unknown>) => binding.sourceName === "양파");

    expect(onionBindings).toHaveLength(2);
    expect(new Set(onionBindings.map((binding) => binding.sourceBlockIndex)).size).toBe(2);
    expect(onionBindings.map((binding) => binding.sourceLineIndex)).toEqual([1, 5]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      quantityState: "conflicting",
    });
  });

  it("recovers one value when separate author comments agree exactly", () => {
    const testCase = {
      case_id: "separate-author-comments-agree",
      source_text: "[SOURCE: author_comment]\n[재료]\n양파 2개(500g)\n대파 1대\n---\n[재료]\n양파 2개(500g)\n대파 1대",
      ingredient: "양파",
    };
    const { checked } = verify(testCase);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: "2",
      unit: "개",
      quantityState: "explicit",
    });
  });

  it("recovers agreeing description and comment owners when the baseline verifies both", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: "[SOURCE: description]\n[재료]\n양파 2개(500g)\n대파 1대\n[SOURCE: author_comment]\n[재료]\n양파 2개(500g)\n대파 1대",
      sourceAnchored: true,
    });
    const owners = ledger.filter((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "양파"));
    expect(owners).toHaveLength(2);

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "일치 원천",
        ingredients: [{
          name: "양파",
          sourceName: "양파",
          amount: null,
          unit: null,
          quantityState: "unknown",
          optional: false,
          evidence: owners.map((owner: { id: string; text: string }) => ({ id: owner.id, quote: owner.text })),
        }],
        steps: ["양파를 준비한다."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: "2",
      unit: "개",
      quantityState: "explicit",
      evidenceRefs: [expect.objectContaining({ source_method: "description" })],
    });
  });

  it("does not join isolated headerless rows across separate author comments", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: "[SOURCE: author_comment]\n통삼겹살 500g\n---\n양파 2개",
      sourceAnchored: true,
    });

    expect(ledger.some((entry: { sourceQuantityBindings?: unknown[] }) => entry.sourceQuantityBindings?.length)).toBe(false);
  });

  it.each(["갈아", "데쳐", "삶아", "버무려", "으깨", "채 썰어", "손질해"])(
    "does not bind a Korean trailing cooking action: %s",
    (action) => {
      const ingredient = `양파 ${action}`;
      const { checked, ledger } = verify({
        case_id: `trailing-action-${action}`,
        source_text: `[SOURCE: description]\n[재료]\n${ingredient} 2개\n대파 1대`,
        ingredient,
      });

      expect(ledger.some((entry: { sourceQuantityBindings?: unknown[]; text?: string }) => entry.sourceQuantityBindings?.length
        && entry.text?.includes(ingredient))).toBe(false);
      expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
        amount: null,
        unit: null,
        quantityState: "unknown",
      });
    },
  );

  it.each(["양파가 없을 때", "양파를 원할 때", "양파가 있는 경우"])(
    "does not bind a Korean conditional clause: %s",
    (ingredient) => {
      const { checked, ledger } = verify({
        case_id: `conditional-clause-${ingredient}`,
        source_text: `[SOURCE: description]\n[재료]\n${ingredient} 2개\n대파 1대`,
        ingredient,
      });

      expect(ledger.some((entry: { sourceQuantityBindings?: unknown[]; text?: string }) => entry.sourceQuantityBindings?.length
        && entry.text?.includes(ingredient))).toBe(false);
      expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
        amount: null,
        unit: null,
        quantityState: "unknown",
      });
    },
  );

  it("does not treat a making heading as an ingredient section", () => {
    const { checked, ledger } = verify({
      case_id: "making-heading",
      source_text: "[SOURCE: description]\n[만들기]\n양파 2개",
      ingredient: "양파",
    });

    expect(ledger.some((entry: { sourceQuantityBindings?: unknown[] }) => entry.sourceQuantityBindings?.length)).toBe(false);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      quantityState: "unknown",
    });
  });

  it("keeps prompt owner hints unchanged while adding request-local author-comment bindings", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: "[SOURCE: author_comment]\n통삼겹살 500g\n양파 2개",
      sourceAnchored: true,
    });

    expect(ledger.some((entry: { sourceQuantityBindings?: unknown[] }) => entry.sourceQuantityBindings?.length)).toBe(true);
    expect(buildSourceQuantityOwnerHints(ledger)).toEqual({
      version: SOURCE_QUANTITY_OWNER_HINT_VERSION,
      status: "complete",
      maxHints: 64,
      hints: [],
    });
    const prompt = buildSourceAnchoredPrompt({ ledger, selectedFrames: [] });
    expect(prompt).not.toContain("sourceQuantityBindings");
    expect(prompt).not.toContain("source_block_index");
  });

  it.each(["explicit", "to_taste", "conflicting"])("does not overwrite an existing %s state", (quantityState) => {
    const testCase = fixture.positive_cases[1];
    const submitted = quantityState === "explicit"
      ? { quantityState, amount: "450", unit: "g" }
      : { quantityState, amount: null, unit: null };
    const { checked } = verify(testCase, submitted);

    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });
});
