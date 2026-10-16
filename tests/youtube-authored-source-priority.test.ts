import { describe, expect, it } from "vitest";
import { buildSinglePassEvidenceLedger } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs";
import { validateSourceAnchoredResult } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";
import { extractRecipeFromSources } from "@/lib/server/youtube-i031-runtime/bundle/lib/server/recipe-extraction-lab/extract.mjs";
import { sanitizeIngredientEvidence } from "@/lib/server/youtube-i031-runtime/bundle/lib/server/recipe-extraction-lab/quantity-evidence.mjs";
import { selectVideoAuthorComments } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/snapshot-video.mjs";

type Submitted = { name: string; amount: string | null; unit: string | null; state?: string; method?: string };
function verify(sourceText: string, submitted: Submitted[], title = "양파 요리") {
  const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true });
  const raw = { recipes: [{ title, steps: ["재료를 조리한다."], ingredients: submitted.map((row) => {
    const entry = ledger.find((value: { text: string; source_method: string }) =>
      value.text.includes(row.name) && /\d|한|두|세|반|약간/u.test(value.text)
      && value.source_method === (row.method ?? "description"));
    if (!entry) throw new Error(`missing submitted source: ${row.name}`);
    return { name: row.name, sourceName: row.name, amount: row.amount, unit: row.unit,
      quantityState: row.state ?? "explicit", optional: false, evidence: [{ id: entry.id, quote: entry.text }] };
  }) }] };
  return { ledger, raw, checked: validateSourceAnchoredResult(raw, ledger) };
}

describe("authored source quantity priority", () => {
  it("uses the closed description amount instead of a model restatement", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml", [
      { name: "양파", amount: "2", unit: "개" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개", amountRawText: "1개" });
    expect(checked.corrections).toEqual(expect.arrayContaining([expect.objectContaining({ code: "authored-source-quantity-prioritized" })]));
  });

  it("prefers the matching description over a matching caption and preserves the original literal", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n[SOURCE: transcript(ko)]\n[00:01.000] 양파 1개", [
      { name: "양파", amount: "1", unit: "개", method: "caption" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개", amountBasis: "stated",
      evidenceRefs: expect.arrayContaining([expect.objectContaining({ source_method: "description", snippet: "양파 1개" })]) });
  });

  it("resolves a model-paraphrased quote back to its independently bound source owner", () => {
    const { raw, ledger } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml", [
      { name: "양파", amount: "2", unit: "개" },
    ]);
    raw.recipes[0].ingredients[0].evidence[0].quote = "양파 두 개를 준비합니다";
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개",
      evidenceRefs: [expect.objectContaining({ snippet: "양파 1개" })] });
  });

  it("does not repair an invalid model evidence schema into an accepted response", () => {
    const { raw, ledger } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml", [
      { name: "양파", amount: "1", unit: "개" },
    ]);
    const row = raw.recipes[0].ingredients[0];
    row.evidence.push(row.evidence[0], row.evidence[0]);
    expect(() => validateSourceAnchoredResult(raw, ledger)).toThrow("SOURCE_ANCHORED_SCHEMA");
  });

  it("does not hide multiple recipes by prioritizing only the first recipe", () => {
    const { raw, ledger } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml", [
      { name: "양파", amount: "1", unit: "개" },
    ]);
    raw.recipes.push(structuredClone(raw.recipes[0]));
    expect(() => validateSourceAnchoredResult(raw, ledger)).toThrow("SOURCE_ANCHORED_SCHEMA");
  });

  it("uses a verified-author source list when description lacks that ingredient", () => {
    const { checked } = verify("[SOURCE: description]\n요리 소개\n[SOURCE: author_comment]\n[재료]\n양파 1개\n물 70ml", [
      { name: "양파", amount: "2", unit: "개", method: "comment" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개",
      evidenceRefs: [expect.objectContaining({ source_method: "comment" })] });
  });

  it("restores a missing closed list row only inside a group with two recipe anchors", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n당근 2개\n물 70ml", [
      { name: "양파", amount: "1", unit: "개" }, { name: "당근", amount: "2", unit: "개" },
    ]);
    expect(checked.json.recipes[0].ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "물", amount: "70", unit: "ml", amountRawText: "70ml" }),
    ]));
    expect(checked.statistics).toMatchObject({ authoredSourceAddedRowCount: 1, modelNumericCount: 2 });
  });

  it("leaves caption-only completion and a previously valid quantity intact", () => {
    const { checked } = verify("[SOURCE: transcript(ko)]\n[00:01.000] 늑간살 1kg", [
      { name: "늑간살", amount: "1", unit: "kg", method: "caption" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "kg", amountBasis: "spoken" });
  });

  it("does not duplicate a qualified source noun already represented by the model", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n당근 2개\n대파 큰거 반대 80g", [
      { name: "양파", amount: "1", unit: "개" }, { name: "당근", amount: "2", unit: "개" },
      { name: "대파", amount: "80", unit: "g" },
    ]);
    expect(checked.json.recipes[0].ingredients).toHaveLength(3);
    expect(checked.json.recipes[0].ingredients[2]).toMatchObject({ name: "대파", originalName: "대파 큰거", amount: "80", unit: "g" });
  });

  it("preserves the authored reference weight over a conflicting caption", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n당근 2개\n대파 큰거 반대 80g\n[SOURCE: transcript(ko)]\n[00:01.000] 대파 90g", [
      { name: "대파", amount: "80", unit: "g" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "80", unit: "g", quantityState: "explicit" });
  });

  it("preserves a lower-priority comment conflict as an alternative", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n설탕 5스푼 50g\n[SOURCE: author_comment]\n[재료]\n설탕 60g", [
      { name: "설탕", amount: "5", unit: "스푼" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "5", unit: "스푼", quantityState: "explicit",
      quantitySelection: { alternatives: [expect.objectContaining({ amount: "60", unit: "g",
        evidenceRef: expect.objectContaining({ snippet: "설탕 60g" }) })] } });
  });

  it.each(["다른 요리", "광고"])("does not use a caption under an unrelated heading as a conflict: %s", (heading) => {
    const { checked } = verify(`[SOURCE: description]\n[재료]\n설탕 5스푼 50g\n[SOURCE: transcript(ko)]\n[${heading}]\n[00:01.000] 설탕 60g`, [
      { name: "설탕", amount: "5", unit: "스푼" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "5", unit: "스푼", quantityState: "explicit" });
    expect(checked.corrections.some((correction: { code: string }) => correction.code === "authored-source-conflict-preserved")).toBe(false);
  });

  it("does not borrow the previous ingredient's caption amount as a conflict", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n고추장 2스푼 60g\n[SOURCE: transcript(ko)]\n[00:13.280] 14g 간마늘 한 스푼 20g 고추장", [
      { name: "고추장", amount: "2", unit: "스푼" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "2", unit: "스푼", quantityState: "explicit" });
  });

  it.each(["[SOURCE: author_comment]\n[재료]\n양파 2개", "[SOURCE: transcript(ko)]\n[00:01.000] 양파 2개"])("chooses description and records a lower-priority conflict: %s", (other) => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n" + other, [
      { name: "양파", amount: "1", unit: "개" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개", quantityState: "explicit",
      quantitySelection: { alternatives: [expect.objectContaining({ amount: "2", unit: "개",
        evidenceRef: expect.objectContaining({ snippet: expect.stringContaining("양파 2개") }) })] } });
  });

  it.each(["순두부 ______ 1개", "물 _________ 70ml", "간장 ________ 2T"])("preserves underscore-list owner and amount: %s", (text) => {
    const name = text.split(" ")[0]; const amount = name === "물" ? "70" : name === "간장" ? "2" : "1";
    const unit = name === "물" ? "ml" : name === "간장" ? "T" : "개";
    const { checked, ledger } = verify(`[SOURCE: description]\n[재료]\n${text}`, [{ name, amount, unit }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount, unit });
    expect(ledger.some((entry: { sourceQuantityBindings?: Array<{ sourceName: string }> }) => entry.sourceQuantityBindings?.some((binding) => binding.sourceName === name))).toBe(true);
  });

  it("preserves a spoon amount with a separately stated mass without inventing a conversion", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n설탕 5스푼 50g", [{ name: "설탕", amount: "5", unit: "스푼" }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "5", unit: "스푼", quantityState: "explicit" });
    expect(checked.json.recipes[0].ingredients[0].evidenceRefs[0].snippet).toBe("설탕 5스푼 50g");
  });

  it.each(["설탕 5스푼 중 반만 사용", "설탕 5스푼 + 50g", "설탕 5스푼 50g 중 반만 사용"])("keeps partial-use/addition guards: %s", (text) => {
    const { checked } = verify(`[SOURCE: description]\n[재료]\n${text}`, [{ name: "설탕", amount: "5", unit: "스푼" }]);
    expect(checked.json.recipes[0].ingredients[0].amount).toBeNull();
  });

  it("does not insert another recipe, advertising, viewer comments or conversation numbers", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n당근 2개\n[다른 요리]\n고기 500g\n간장 3T\n[광고]\n할인 500원\n쿠폰 2개\n[SOURCE: viewer_comment]\n소금 100g", [
      { name: "양파", amount: "1", unit: "개" }, { name: "당근", amount: "2", unit: "개" },
    ]);
    expect(checked.json.recipes[0].ingredients.map((row: { name: string }) => row.name)).toEqual(["양파", "당근"]);
  });

  it("never turns a vague oil amount or an omitted quantity into a numeric default", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n오일 약간\n물 70ml", [{ name: "오일", amount: null, unit: null, state: "unknown" }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "unknown" });
  });

  it("chooses the description even when the model cites the disagreeing author comment", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n[SOURCE: author_comment]\n[재료]\n양파 2개", [
      { name: "양파", amount: "2", unit: "개", method: "comment" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개" });
  });

  it("keeps nonconvertible lower-source units without inventing a mass conversion", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n설탕 2스푼\n[SOURCE: author_comment]\n[재료]\n설탕 50g", [{ name: "설탕", amount: "50", unit: "g", method: "comment" }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "2", unit: "스푼",
      quantitySelection: { alternatives: [expect.objectContaining({ amount: "50", unit: "g" })] } });
  });

  it.each(["양파 2개", "양파 500g"])("retains unresolved same-source contradictions: %s", (second) => {
    const { checked } = verify(`[SOURCE: description]\n[재료]\n양파 1개\n${second}`, [{ name: "양파", amount: "1", unit: "개" }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "conflicting" });
  });

  it.each(["description", "author_comment"])("does not merge separately cited sauce and marinade quantities in %s", (method) => {
    const sourceText = `[SOURCE: ${method}]\n[소스]\n미림 30ml\n[양념]\n미림 3스푼`;
    const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true });
    const owners = ledger.filter((entry: { text: string }) => entry.text.startsWith("미림"));
    const raw = { recipes: [{ title: "소갈비찜", steps: ["조리한다."], ingredients: owners.map((entry: { id: string; text: string }, index: number) => ({
      name: "미림", sourceName: "미림", amount: index ? "3" : "30", unit: index ? "스푼" : "ml", quantityState: "explicit", optional: false,
      evidence: [{ id: entry.id, quote: entry.text }],
    })) }] };
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(checked.json.recipes[0].ingredients.map((row: { amount: string; unit: string }) => [row.amount, row.unit])).toEqual([["30", "ml"], ["3", "스푼"]]);
  });

  it.each(["creator", "viewer", null])("requires verified author identity and an exact correction target: %s", (authorChannelId) => {
    const comment = "정정: 설명란 양파 1개 → 양파 2개";
    const sourceText = `[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n[SOURCE: author_comment]\n${comment}`;
    const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true,
      sourceAuthorComments: { videoChannelId: "creator", comments: [{ text: comment, authorChannelId }] } });
    const owner = ledger.find((entry: { text: string }) => entry.text === "양파 1개");
    const raw = { recipes: [{ title: "양파 요리", steps: ["조리한다."], ingredients: [{ name: "양파", sourceName: "양파", amount: "1", unit: "개",
      quantityState: "explicit", optional: false, evidence: [{ id: owner.id, quote: owner.text }] }] }] };
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: authorChannelId === "creator" ? "2" : "1", unit: "개" });
    if (authorChannelId === "creator") expect(checked.json.recipes[0].ingredients[0].quantitySelection.correctionTargetEvidenceId).toBe(owner.id);
  });

  it("retains verified author identity across a separator inside the comment body", () => {
    const comment = "공지\n---\n정정: 설명란 양파 1개 → 양파 2개";
    const ledger = buildSinglePassEvidenceLedger({ sourceAnchored: true,
      sourceText: `[SOURCE: description]\n[재료]\n양파 1개\n[SOURCE: author_comment]\n${comment}`,
      sourceAuthorComments: { videoChannelId: "creator", comments: [{ text: comment, authorChannelId: "creator" }] } });
    const owner = ledger.find((entry: { text: string }) => entry.text === "양파 1개");
    const checked = validateSourceAnchoredResult({ recipes: [{ title: "양파 요리", steps: [], ingredients: [{ name: "양파", sourceName: "양파", amount: "1", unit: "개",
      quantityState: "explicit", optional: false, evidence: [{ id: owner.id, quote: owner.text }] }] }] }, ledger);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "2", unit: "개" });
  });

  it.each(["정정: 설명란 양파 9개 → 양파 2개", "정정: 양파 2개", "양파 2개"])("does not treat an unmatched or merely newer comment as a correction: %s", (comment) => {
    const sourceText = `[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n[SOURCE: author_comment]\n${comment}`;
    const ledger = buildSinglePassEvidenceLedger({ sourceText, sourceAnchored: true,
      sourceAuthorComments: { videoChannelId: "creator", comments: [{ text: comment, authorChannelId: "creator", publishedAt: "2099-01-01" }] } });
    const owner = ledger.find((entry: { text: string }) => entry.text === "양파 1개");
    const checked = validateSourceAnchoredResult({ recipes: [{ title: "양파 요리", steps: [], ingredients: [{ name: "양파", sourceName: "양파", amount: "1", unit: "개",
      quantityState: "explicit", optional: false, evidence: [{ id: owner.id, quote: owner.text }] }] }] }, ledger);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개" });
  });

  it.each(["unknown", "conflicting"])("chooses a bound description over a caption when the model returned %s/null", (state) => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n[SOURCE: transcript(ko)]\n[00:01.000] 양파 2개", [{ name: "양파", amount: null, unit: null, state }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "1", unit: "개", quantityState: "explicit" });
  });

  it("retains an unconvertible caption quantity as literal alternative evidence", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n설탕 2스푼\n[SOURCE: transcript(ko)]\n[00:01.000] 설탕 50g", [{ name: "설탕", amount: "2", unit: "스푼" }]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "2", unit: "스푼",
      quantitySelection: { alternatives: [expect.objectContaining({ amount: "50", unit: "g" })] } });
  });

  it("applies an explicitly targeted correction only to its named sauce role", () => {
    const comment = "정정: 설명란 [소스] 미림 30ml → 미림 20ml";
    const ledger = buildSinglePassEvidenceLedger({ sourceAnchored: true,
      sourceText: `[SOURCE: description]\n[소스]\n미림 30ml\n[양념]\n미림 3스푼\n[SOURCE: author_comment]\n${comment}`,
      sourceAuthorComments: { videoChannelId: "creator", comments: [{ text: comment, authorChannelId: "creator" }] } });
    const owner = ledger.find((entry: { text: string }) => entry.text === "미림 30ml");
    const checked = validateSourceAnchoredResult({ recipes: [{ title: "갈비찜", steps: [], ingredients: [{ name: "미림", sourceName: "미림", amount: "30", unit: "ml",
      quantityState: "explicit", optional: false, evidence: [{ id: owner.id, quote: owner.text }] }] }] }, ledger);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: "20", unit: "ml", groupLabel: "소스" });
  });

  it("preserves selected and alternative evidence through recipe normalization and worker sanitization", async () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n[SOURCE: transcript(ko)]\n[00:01.000] 양파 2개", [{ name: "양파", amount: "2", unit: "개", method: "caption" }]);
    const result = await extractRecipeFromSources({ video: { title: "양파 요리" } }, { recipeMode: "single", useVisual: false,
      llm: { generate: async () => ({ json: checked.json, meta: { quantityEvidenceVersion: "source-anchored-quotes-v3-source-first-quantity" } }) } });
    const ingredient = result.recipes[0].ingredients[0];
    expect(ingredient.quantitySelection).toEqual(checked.json.recipes[0].ingredients[0].quantitySelection);
    expect(sanitizeIngredientEvidence(ingredient).quantitySelection).toEqual(ingredient.quantitySelection);
    expect(() => sanitizeIngredientEvidence({ ...ingredient, quantitySelection: { ...ingredient.quantitySelection, selectedEvidenceId: "not-in-ledger" } })).toThrow("selection reference");
  });

  it("selects only comments with a verified matching video-author channel ID", () => {
    const item = (author: string | null, text: string) => ({ snippet: { topLevelComment: { snippet: { authorChannelId: { value: author }, textOriginal: text } } } });
    const items = [item("video-author", "물 70ml"), item("viewer", "물 900ml"), item(null, "물 500ml")];
    expect(selectVideoAuthorComments(items, "video-author")).toEqual([expect.objectContaining({ text: "물 70ml", authorChannelId: "video-author" })]);
    expect(selectVideoAuthorComments(items, null)).toEqual([]);
  });
});
