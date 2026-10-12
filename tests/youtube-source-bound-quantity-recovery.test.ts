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
      amountRawText: "amount_raw_text" in testCase.expected
        ? testCase.expected.amount_raw_text
        : `${testCase.expected.amount}${testCase.expected.unit}`,
      quantityState: "explicit",
      amountBasis: "source-bound-stated",
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

  it("treats a leading emoji as a list marker, not part of the bound ingredient name", () => {
    const testCase = fixture.positive_cases.find(({ case_id }) => case_id === "emoji-prefixed-headerless-comment-list");
    if (!testCase) throw new Error("missing emoji-prefixed source fixture");
    const { ledger } = verify(testCase);
    const binding = ledger.flatMap((entry: { sourceQuantityBindings?: Array<Record<string, unknown>> }) =>
      entry.sourceQuantityBindings ?? []).find((candidate: Record<string, unknown>) => candidate.sourceName === "통삼겹살");

    expect(binding).toMatchObject({
      sourceName: "통삼겹살",
      amount: "500",
      unit: "g",
      normalizedCoordinates: {
        name: { start: 3, end: 7 },
        quantity: { start: 8, end: 12 },
      },
    });
  });

  it("verifies an explicit quantity cited without its leading emoji marker", () => {
    const testCase = fixture.positive_cases.find(({ case_id }) => case_id === "emoji-prefixed-headerless-comment-list");
    if (!testCase) throw new Error("missing emoji-prefixed source fixture");
    const { checked } = verify(testCase, { quantityState: "explicit", amount: "500", unit: "g" });

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      originalName: "통삼겹살",
      amount: "500",
      unit: "g",
      quantityState: "explicit",
    });
    expect(checked.issues).toEqual([]);
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });

  it("keeps a qualitative ingredient row from becoming the next row's scope context", () => {
    const sourceText = "[SOURCE: author_comment]\nㅡ맛있는카레 레시피ㅡ\n식용유 약간\n돼지고기 앞다리살 400g\n소금 2꼬집\n양파 2개(500g)";
    const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true });
    const pork = ledger.find((entry: { text?: string }) => entry.text === "돼지고기 앞다리살 400g");
    if (!pork) throw new Error("missing pork source row");

    expect(pork.scopeContext).not.toBe("식용유 약간");
    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "맛있는 카레",
        ingredients: [{
          name: "돼지고기 앞다리살",
          sourceName: "돼지고기 앞다리살",
          amount: "400",
          unit: "g",
          quantityState: "explicit",
          optional: false,
          evidence: [{ id: pork.id, quote: pork.text }],
        }],
        steps: ["카레를 만든다."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: "400",
      unit: "g",
      quantityState: "explicit",
    });
    expect(checked.issues).toEqual([]);
  });

  it("keeps amount-first primary and reference spans without producing a duplicate ingredient", () => {
    const testCase = fixture.positive_cases.find(({ case_id }) => case_id === "amount-first-english-primary-reference");
    if (!testCase) throw new Error("missing amount-first source fixture");
    const { checked, ledger } = verify(testCase);
    const bindings = ledger.flatMap((entry: { sourceQuantityBindings?: Array<Record<string, unknown>> }) =>
      entry.sourceQuantityBindings ?? []).filter((binding: Record<string, unknown>) => binding.sourceName === "Olive Oil");

    expect(bindings).toEqual([expect.objectContaining({
      amount: "2",
      unit: "Tablespoons",
      normalizedCoordinates: {
        name: { start: 21, end: 30 },
        quantity: { start: 0, end: 13 },
      },
      references: [expect.objectContaining({
        amount: "30",
        unit: "ml",
        normalizedCoordinates: { start: 16, end: 20 },
      })],
    })]);
    expect(checked.json.recipes[0].ingredients).toHaveLength(1);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      originalName: "Olive Oil",
      amount: "2",
      unit: "Tablespoons",
      quantityState: "explicit",
    });
  });

  it("recovers rejected estimates from independent exact description owners and preserves reference measures", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: [
        "[SOURCE: description]",
        "RECIPE",
        "2 Tablespoons | 30ml Olive Oil",
        "1 Tablespoon | 15ml Balsamic Vinegar",
        "[SOURCE: transcript(en)]",
        "[00:01.000] The first is Olive Oil, add a few tablespoons, don't worry about measuring it.",
        "[00:02.000] As well as oil add about a tablespoon of Balsamic Vinegar.",
      ].join("\n"),
      sourceAnchored: true,
    });
    const owner = (name: string) => ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === name));
    const caption = (name: string) => ledger.find((entry: { source_method?: string; text?: string }) =>
      entry.source_method === "caption" && entry.text?.includes(name));
    const oliveOwner = owner("Olive Oil");
    const balsamicOwner = owner("Balsamic Vinegar");
    const oliveCaption = caption("Olive Oil");
    const balsamicCaption = caption("Balsamic Vinegar");
    if (!oliveOwner || !balsamicOwner || !oliveCaption || !balsamicCaption) throw new Error("missing estimate evidence");

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "One Pot Pasta",
        ingredients: [
          {
            name: "올리브 오일", sourceName: "Olive Oil", amount: "a few", unit: "tablespoons",
            quantityState: "estimated", optional: false,
            evidence: [{ id: oliveOwner.id, quote: oliveOwner.text }, { id: oliveCaption.id, quote: oliveCaption.text }],
          },
          {
            name: "발사믹 식초", sourceName: "Balsamic Vinegar", amount: "about a", unit: "tablespoon",
            quantityState: "estimated", optional: false,
            evidence: [{ id: balsamicOwner.id, quote: balsamicOwner.text }, { id: balsamicCaption.id, quote: balsamicCaption.text }],
          },
        ],
        steps: ["Cook."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients).toEqual([
      expect.objectContaining({ name: "올리브 오일", originalName: "Olive Oil", amount: "2", unit: "Tablespoons",
        quantityState: "explicit", amountBasis: "source-bound-stated" }),
      expect.objectContaining({ name: "발사믹 식초", originalName: "Balsamic Vinegar", amount: "1", unit: "Tablespoon",
        quantityState: "explicit", amountBasis: "source-bound-stated" }),
    ]);
    expect(checked.issues).toEqual([]);
    expect(checked.corrections).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered", ingredientIndex: 0,
        owner: expect.objectContaining({ references: [expect.objectContaining({ amount: "30", unit: "ml" })] }) }),
      expect.objectContaining({ code: "source-bound-quantity-recovered", ingredientIndex: 1,
        owner: expect.objectContaining({ references: [expect.objectContaining({ amount: "15", unit: "ml" })] }) }),
    ]));
  });

  it.each([
    ["plain action", "[00:01.000] Next I'm slicing half of a yellow onion and adding it to the pan."],
    ["cooking heat", "[00:01.000] Slice half of a yellow onion and cook it over medium heat."],
    ["broiler location", "[00:01.000] Place half of a yellow onion under the broiler."],
    ["reference above", "[00:01.000] Slice half of a yellow onion as shown above."],
    ["reference below", "[00:01.000] Slice half of a yellow onion in the bowl below."],
  ])("infers one-half count for safe %s context", (_label, transcript) => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: [
        "[SOURCE: description]",
        "RECIPE",
        "1/2 Onion",
        "[SOURCE: transcript(en)]",
        transcript,
      ].join("\n"),
      sourceAnchored: true,
    });
    const owner = ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "Onion"));
    const caption = ledger.find((entry: { source_method?: string }) => entry.source_method === "caption");
    if (!owner || !caption) throw new Error("missing inferred count evidence");

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "Onion count",
        ingredients: [{
          name: "양파", sourceName: "Onion", amount: "1/2", unit: null,
          quantityState: "explicit", optional: false,
          evidence: [{ id: owner.id, quote: owner.text }, { id: caption.id, quote: caption.text }],
        }],
        steps: ["Slice."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      name: "양파",
      originalName: "Onion",
      amount: "1/2",
      unit: "개",
      quantityState: "explicit",
      amountBasis: "source-bound-stated",
      evidenceRefs: [expect.objectContaining({ source_method: "description" }),
        expect.objectContaining({ source_method: "caption" })],
    });
    expect(checked.issues).toEqual([]);
    expect(checked.corrections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "source-bound-quantity-recovered",
        owner: expect.objectContaining({ unitInference: expect.objectContaining({ version: "count-half-article-caption-v1" }) }),
      }),
    ]));
  });

  it.each([
    ["no independent caption", "1/2 Onion", null],
    ["unitless mass", "1/2 Flour", "[00:01.000] Use half of a cup of flour."],
    ["different ingredient", "1/2 Onion", "[00:01.000] Slice half of a yellow lemon."],
    ["compound green onion", "1/2 Onion", "[00:01.000] Slice half of a green onion."],
    ["conditional caption", "1/2 Onion", "[00:01.000] If you have half of a yellow onion, add it."],
    ["negative do-not caption", "1/2 Onion", "[00:01.000] Do not use half of a yellow onion."],
    ["negative contraction caption", "1/2 Onion", "[00:01.000] Don't use half of a yellow onion."],
    ["negative unicode contraction caption", "1/2 Onion", "[00:01.000] You can’t use half of a yellow onion."],
    ["negative cannot caption", "1/2 Onion", "[00:01.000] You cannot use half of a yellow onion."],
    ["negative never caption", "1/2 Onion", "[00:01.000] Never use half of a yellow onion."],
    ["negative without caption", "1/2 Onion", "[00:01.000] Cook without half of a yellow onion."],
    ["alternative instead caption", "1/2 Onion", "[00:01.000] Use half of a yellow onion instead of a whole one."],
    ["greater-than range caption", "1/2 Onion", "[00:01.000] Use more than half of a yellow onion."],
    ["less-than range caption", "1/2 Onion", "[00:01.000] Use less than half of a yellow onion."],
    ["over range caption", "1/2 Onion", "[00:01.000] Use over half of a yellow onion."],
    ["under range caption", "1/2 Onion", "[00:01.000] Use under half of a yellow onion."],
    ["over-one-half range caption", "1/2 Onion", "[00:01.000] Use over one half of a yellow onion."],
    ["under-one-half range caption", "1/2 Onion", "[00:01.000] Use under one half of a yellow onion."],
    ["over-a-half range caption", "1/2 Onion", "[00:01.000] Use over a half of a yellow onion."],
    ["under-a-half range caption", "1/2 Onion", "[00:01.000] Use under a half of a yellow onion."],
    ["rather-than alternative caption", "1/2 Onion", "[00:01.000] Use half of a yellow onion rather than a whole one."],
    ["unless conditional caption", "1/2 Onion", "[00:01.000] Use half of a yellow onion unless you dislike onions."],
    ["about caption", "1/2 Onion", "[00:01.000] Use about half of a yellow onion."],
    ["approximately caption", "1/2 Onion", "[00:01.000] Use approximately half of a yellow onion."],
    ["roughly caption", "1/2 Onion", "[00:01.000] Use roughly half of a yellow onion."],
    ["around caption", "1/2 Onion", "[00:01.000] Use around half of a yellow onion."],
    ["alternative row", "1/2 Onion or Leek", "[00:01.000] Slice half of a yellow onion."],
    ["unitless weight", "250 Flour", "[00:01.000] Use 250 grams of flour."],
  ])("does not infer a count for %s", (_label, description, transcript) => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: ["[SOURCE: description]", "RECIPE", description,
        ...(transcript ? ["[SOURCE: transcript(en)]", transcript] : [])].join("\n"),
      sourceAnchored: true,
    });
    expect(ledger.some((entry: { sourceQuantityBindings?: Array<{ unitInference?: unknown }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.unitInference))).toBe(false);
  });

  it("does not let two inferred-count rows consume one caption confirmation", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: [
        "[SOURCE: description]",
        "RECIPE",
        "1/2 Onion",
        "1/2 Yellow Onion",
        "[SOURCE: transcript(en)]",
        "[00:01.000] Slice half of a yellow onion.",
      ].join("\n"),
      sourceAnchored: true,
    });
    const caption = ledger.find((entry: { source_method?: string }) => entry.source_method === "caption");
    const owner = (name: string) => ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === name));
    const onionOwner = owner("Onion");
    const yellowOnionOwner = owner("Yellow Onion");
    if (!caption || !onionOwner || !yellowOnionOwner) throw new Error("missing shared count evidence");

    const ingredient = (name: string, sourceOwner: { id: string; text: string }) => ({
      name,
      sourceName: name,
      amount: "1/2",
      unit: null,
      quantityState: "explicit",
      optional: false,
      evidence: [{ id: sourceOwner.id, quote: sourceOwner.text }, { id: caption.id, quote: caption.text }],
    });
    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "Ambiguous onion count",
        ingredients: [ingredient("Onion", onionOwner), ingredient("Yellow Onion", yellowOnionOwner)],
        steps: ["Slice."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients).toEqual([
      expect.objectContaining({ amount: null, unit: null, quantityState: "unknown" }),
      expect.objectContaining({ amount: null, unit: null, quantityState: "unknown" }),
    ]);
    expect(checked.corrections.filter((correction: { reason?: string }) =>
      correction.reason === "owner-claimed-by-multiple-rows")).toHaveLength(2);
  });

  it("keeps an accepted source-qualified estimate instead of replacing it with an exact source-bound value", () => {
    const sourceText = "[SOURCE: description]\nRECIPE\nabout 2 Tablespoons Olive Oil";
    const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true });
    const owner = ledger.find((entry: { text?: string }) => entry.text === "about 2 Tablespoons Olive Oil");
    if (!owner) throw new Error("missing qualified estimate owner");
    const checked = validateSourceAnchoredResult({
      recipes: [{ title: "Qualified estimate", ingredients: [{
        name: "Olive Oil", sourceName: "Olive Oil", amount: "2", unit: "Tablespoons",
        quantityState: "estimated", optional: false, evidence: [{ id: owner.id, quote: owner.text }],
      }], steps: ["Cook."], }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: "2", unit: "Tablespoons", quantityState: "estimated", amountBasis: "source-approximate",
    });
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });

  it("keeps a rejected estimate unrecovered when exact source owners conflict", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: [
        "[SOURCE: description]",
        "RECIPE",
        "2 Tablespoons Olive Oil",
        "1 Cup Water",
        "[SOURCE: author_comment]",
        "Ingredients:",
        "3 Tablespoons Olive Oil",
        "1 Cup Water",
        "[SOURCE: transcript(en)]",
        "[00:01.000] Add a few tablespoons of Olive Oil.",
      ].join("\n"),
      sourceAnchored: true,
    });
    const owners = ledger.filter((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "Olive Oil"));
    if (owners.length !== 2) throw new Error("missing conflicting estimate evidence");

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "Conflicting oil",
        ingredients: [{
          name: "올리브 오일",
          sourceName: "Olive Oil",
          amount: "a few",
          unit: "tablespoons",
          quantityState: "estimated",
          optional: false,
          evidence: owners.map((entry: { id: string; text: string }) => ({ id: entry.id, quote: entry.text })),
        }],
        steps: ["Cook."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      quantityState: "conflicting",
    });
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
  });

  it("keeps a rejected estimate unrecovered when a caption states a conflicting exact amount", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: [
        "[SOURCE: description]",
        "RECIPE",
        "2 Tablespoons Olive Oil",
        "1 Cup Water",
        "[SOURCE: transcript(en)]",
        "[00:01.000] Add 3 tablespoons of Olive Oil.",
      ].join("\n"),
      sourceAnchored: true,
    });
    const owner = ledger.find((entry: { sourceQuantityBindings?: Array<{ sourceName?: string }> }) =>
      entry.sourceQuantityBindings?.some((binding) => binding.sourceName === "Olive Oil"));
    const caption = ledger.find((entry: { source_method?: string }) => entry.source_method === "caption");
    if (!owner || !caption) throw new Error("missing contradictory caption evidence");

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "Contradictory oil caption",
        ingredients: [{
          name: "올리브 오일",
          sourceName: "Olive Oil",
          amount: "a few",
          unit: "tablespoons",
          quantityState: "estimated",
          optional: false,
          evidence: [{ id: owner.id, quote: owner.text }, { id: caption.id, quote: caption.text }],
        }],
        steps: ["Cook."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
    });
    expect(checked.corrections).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-recovered" }),
    ]));
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

  it("keeps an unmarked adjacent comment quantity reviewable instead of treating it as a reference conflict", () => {
    const ledger = buildSinglePassEvidenceLedger({
      sourceText: "[SOURCE: description]\nRECIPE\n2 Tablespoons | 30ml Olive Oil\n1 Cup Water\nInstructions\n[SOURCE: author_comment]\n2 Tablespoons 45ml Olive Oil\n1 Cup Water",
      sourceAnchored: true,
    });
    const oliveEntries = ledger.filter((entry: { text?: string }) => entry.text?.includes("Olive Oil"));
    const oliveBindings = oliveEntries.flatMap((entry: { sourceQuantityBindings?: Array<Record<string, unknown>> }) =>
      entry.sourceQuantityBindings ?? []);

    expect(oliveBindings).toEqual([expect.objectContaining({
      amount: "2",
      unit: "Tablespoons",
      references: [expect.objectContaining({ amount: "30", unit: "ml" })],
      sourceMethod: "description",
    })]);

    const checked = validateSourceAnchoredResult({
      recipes: [{
        title: "Olive Oil reference",
        ingredients: [{
          name: "Olive Oil",
          sourceName: "Olive Oil",
          amount: null,
          unit: null,
          quantityState: "unknown",
          optional: false,
          evidence: oliveEntries.map((entry: { id: string; text: string }) => ({ id: entry.id, quote: entry.text })),
        }],
        steps: ["Mix."],
      }],
    }, ledger);

    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({
      amount: null,
      unit: null,
      quantityState: "unknown",
    });
    expect(checked.corrections).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source-bound-quantity-review-required", reason: "source-related-unbound-mention" }),
    ]));
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
