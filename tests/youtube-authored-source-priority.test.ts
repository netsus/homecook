import { describe, expect, it } from "vitest";
import { buildSinglePassEvidenceLedger } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs";
import { validateSourceAnchoredResult } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";
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

  it("does not hide a caption conflict with the reference weight of a size-qualified source", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n당근 2개\n대파 큰거 반대 80g\n[SOURCE: transcript(ko)]\n[00:01.000] 대파 90g", [
      { name: "대파", amount: "80", unit: "g" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "conflicting" });
  });

  it("records a comment conflict with a separately stated reference weight", () => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n설탕 5스푼 50g\n[SOURCE: author_comment]\n[재료]\n설탕 60g", [
      { name: "설탕", amount: "5", unit: "스푼" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "conflicting" });
    expect(checked.json.recipes[0].ingredients[0].evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ snippet: "설탕 5스푼 50g" }), expect.objectContaining({ snippet: "설탕 60g" }),
    ]));
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

  it.each(["[SOURCE: author_comment]\n[재료]\n양파 2개", "[SOURCE: transcript(ko)]\n[00:01.000] 양파 2개"])("records an actual source conflict: %s", (other) => {
    const { checked } = verify("[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n" + other, [
      { name: "양파", amount: "1", unit: "개" },
    ]);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: null, unit: null, quantityState: "conflicting" });
    expect(checked.json.recipes[0].ingredients[0].evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ snippet: "양파 1개" }), expect.objectContaining({ snippet: expect.stringContaining("양파 2개") }),
    ]));
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

  it("selects only comments with a verified matching video-author channel ID", () => {
    const item = (author: string | null, text: string) => ({ snippet: { topLevelComment: { snippet: { authorChannelId: { value: author }, textOriginal: text } } } });
    const items = [item("video-author", "물 70ml"), item("viewer", "물 900ml"), item(null, "물 500ml")];
    expect(selectVideoAuthorComments(items, "video-author")).toEqual([expect.objectContaining({ text: "물 70ml", authorChannelId: "video-author" })]);
    expect(selectVideoAuthorComments(items, null)).toEqual([]);
  });
});
