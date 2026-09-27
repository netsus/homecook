import { describe, expect, it } from "vitest";
import { suggestCookingMethod } from "@/lib/cooking-method-suggestion";
import { CANONICAL_COOKING_METHODS } from "@/lib/cooking-method-taxonomy";

describe("manual step cooking method suggestions", () => {
  it.each([
    ["양파를 잘게 썰어요", "slice"], ["마늘을 다져 주세요", "mince"],
    ["물을 넣고 끓여요", "boil"], ["감자를 삶아요", "parboil"],
    ["양파를 볶아요", "stir_fry"], ["재료를 고루 섞어요", "mix"],
    ["나물을 버무려 주세요", "toss"], ["반죽을 오븐에 구워요", "oven_bake"],
    ["고기를 에어프라이어에 구워요", "air_fryer"], ["전자레인지에서 익혀요", "microwave"],
  ])("suggests one explicit action for %s", (instruction, code) => {
    expect(suggestCookingMethod(instruction, CANONICAL_COOKING_METHODS)?.code).toBe(code);
  });

  it.each([
    "", "재료 준비", "볶음밥에 다진 마늘", "오븐이 필요해요", "노릇하게",
    "볶지 마세요", "안 볶아요", "안볶아요", "끓이지 않아요",
    "볶으면 안돼요", "볶아요라고 쓰면 안 됩니다",
    "썰거나 볶아요", "썰어요. 그다음 볶아요", "오븐 또는 팬에 구워요",
  ])("does not guess for ambiguous or negative text %s", (instruction) => {
    expect(suggestCookingMethod(instruction, CANONICAL_COOKING_METHODS)).toBeNull();
  });

  it("never invents a method absent from the current API list", () => {
    expect(suggestCookingMethod("양파를 볶아요", [{ code: "prep", id: "prep" }])).toBeNull();
  });
});
