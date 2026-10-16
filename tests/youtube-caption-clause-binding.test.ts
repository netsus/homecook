import { describe, expect, it } from "vitest";
import { buildSinglePassEvidenceLedger } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs";
import { validateSourceAnchoredResult } from "@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";

function verify(text: string, quote: string, name: string, amount: string, unit: string, optional = false) {
  const ledger = buildSinglePassEvidenceLedger({ sourceText: `[SOURCE: transcript(ko)]\n${text}`,
    ocrEvents: [{ text: name, startSec: 2 }], sourceAnchored: true });
  const entry = ledger.find((value: { text: string }) => value.text.includes(quote));
  const ocr = ledger.find((value: { kind: string }) => value.kind === "ocr");
  if (!entry || !ocr) throw new Error("missing fixture evidence");
  const raw = { recipes: [{ title: "재료 요리", steps: ["조리한다."], ingredients: [{ name, sourceName: name,
    amount, unit, optional, quantityState: "explicit", evidence: [{ id: entry.id, quote }, { id: ocr.id, quote: name }] }] }] };
  return validateSourceAnchoredResult(raw, ledger);
}

describe("closed caption quantity clauses", () => {
  it.each([
    ["[00:01.000] 흑설탕 두 숟가락 물엿 세 숟가락", "물엿 세 숟가락", "물엿", "세", "숟가락", "3"],
    ["[00:01.000] 물을 넣어가면서 끓여 줘 감자 두 개", "감자 두 개", "감자", "두", "개", "2"],
    ["[00:01.000] 와 당근 하나를 잘라서 넣어 줘 바니", "당근 하나를 잘라서 넣어 줘", "당근", "하나", "개", "1"],
    ["[00:01.000] 진간장과 맛술을 반 컵씩 넣어 줘", "진간장과 맛술을 반 컵씩 넣어 줘", "맛술", "반", "컵", "1/2"],
    ["[00:01.000] 진간장과 맛술을 반 컵씩 넣어 줘", "진간장과 맛술을 반 컵씩 넣어 줘", "진간장", "반", "컵", "1/2"],
    ["[00:01.000] 소금 두 꼬집 설탕 세 스푼", "설탕 세 스푼", "설탕", "세", "스푼", "3"],
  ])("binds a closed local clause without merging OCR roles: %s", (text, quote, name, amount, unit, expected) => {
    const checked = verify(text, quote, name, amount, unit);
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({ amount: expected, unit, quantityState: "explicit", amountBasis: "spoken" });
    expect(checked.json.recipes[0].ingredients[0].evidenceRefs).toEqual(expect.arrayContaining([expect.objectContaining({ snippet: quote })]));
  });

  it("retains a stated optional ingredient quantity only when the model also marks it optional", () => {
    const text = "[00:01.000] 후추를 뿌려 줘 이건 선택\n[00:03.000] 사항인데 춘장을 한 숟가락 넣으면";
    expect(verify(text, "춘장을 한 숟가락 넣으면", "춘장", "한", "숟가락", true).json.recipes[0].ingredients[0])
      .toMatchObject({ amount: "1", unit: "숟가락", optional: true, quantityState: "explicit" });
    expect(verify(text, "춘장을 한 숟가락 넣으면", "춘장", "한", "숟가락", true).json.recipes[0].ingredients[0].evidenceRefs)
      .toEqual(expect.arrayContaining([expect.objectContaining({ snippet: expect.stringContaining("이건 선택") })]));
    expect(verify(text, "춘장을 한 숟가락 넣으면", "춘장", "한", "숟가락").json.recipes[0].ingredients[0].amount).toBeNull();
  });

  it.each(["광고", "다른 요리"])("does not newly bind a caption under an unrelated heading: %s", (heading) => {
    expect(verify(`[${heading}]\n[00:01.000] 와 당근 하나를 잘라서 넣어 줘`, "당근 하나를 잘라서 넣어 줘", "당근", "하나", "개")
      .json.recipes[0].ingredients[0].amount).toBeNull();
  });

  it.each([
    ["흑설탕 두 숟가락 물엿", "물엿", "3", "숟가락"],
    ["설탕 세 스푼 물엿 두 스푼", "물엿", "3", "스푼"],
    ["진간장과 맛술을 합쳐 반 컵 넣어 줘", "맛술", "반", "컵"],
    ["진간장과 맛술을 반 컵 넣어 줘", "맛술", "반", "컵"],
    ["감자 두 개 중 반만 사용", "감자", "두", "개"],
    ["감자 두 개를 넣지 마세요", "감자", "두", "개"],
    ["감자 두 개가 있으면 넣어 줘", "감자", "두", "개"],
    ["당근 하나를 잘라서 넣어 줘 조금", "당근", "하나", "개"],
    ["당근 하나를 잘라서 반만 넣어 줘", "당근", "하나", "개"],
    ["당근 하나를 잘라서 넣어 줘 2개는 남겨", "당근", "하나", "개"],
    ["쿠폰 2개 당근 하나를 잘라서 넣어 줘", "당근", "하나", "개"],
    ["사항인데 춘장을 한 숟가락 넣으면", "춘장", "한", "숟가락"],
  ])("does not borrow quantities or bypass safety: %s", (text, name, amount, unit) => {
    const checked = verify(`[00:01.000] ${text}`, text, name, amount, unit);
    expect(checked.json.recipes[0].ingredients[0].amount).toBeNull();
  });
});
