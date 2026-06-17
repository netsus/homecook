import { describe, expect, it } from "vitest";

import {
  P0_RECIPE_TAG_SEEDS,
  P1_RECIPE_TAG_CANDIDATES,
  buildSuggestedRecipeTags,
  normalizeRecipeTagKey,
} from "@/lib/server/recipe-tags";

const OFFICIAL_P0_TAG_LABELS = [
  "자취요리",
  "초보가능",
  "밀프렙",
  "도시락반찬",
  "냉털요리",
  "아이반찬",
  "술안주",
  "캠핑요리",
  "10분컷",
  "30분이내",
  "간단요리",
  "원팬요리",
  "에어프라이어",
  "전자레인지",
  "불없이",
  "노오븐",
  "고단백",
  "다이어트",
  "저당",
  "저탄수",
  "채식한끼",
  "발효한끼",
  "한식",
  "국물요리",
  "밑반찬",
  "디저트",
  "K디저트",
  "면요리",
  "분식",
  "샐러드",
  "한그릇요리",
  "해장요리",
  "매콤",
  "바삭",
  "밥도둑",
  "유튜브레시피",
];

describe("36d recipe semantic tag rules", () => {
  it("keeps the official P0 semantic/source taxonomy fixed and Korean-keyed", () => {
    expect(P0_RECIPE_TAG_SEEDS.map((tag) => tag.label)).toEqual(OFFICIAL_P0_TAG_LABELS);
    expect(P0_RECIPE_TAG_SEEDS).toHaveLength(36);
    expect(P0_RECIPE_TAG_SEEDS.filter((tag) => tag.kind === "semantic")).toHaveLength(35);
    expect(P0_RECIPE_TAG_SEEDS.filter((tag) => tag.kind === "source")).toHaveLength(1);
    expect(P0_RECIPE_TAG_SEEDS.every((tag) => tag.normalized_key === normalizeRecipeTagKey(tag.label))).toBe(true);
    expect(P0_RECIPE_TAG_SEEDS.every((tag) => tag.theme_eligible)).toBe(true);
  });

  it("infers situation, tool, time, and course tags from combined recipe signals", () => {
    const suggested = buildSuggestedRecipeTags({
      sourceType: "youtube",
      title: "자취생 10분 전자레인지 참치 계란 한그릇밥",
      baseServings: 1,
      totalTimeMinutes: 10,
      ingredientNames: ["밥", "계란", "참치", "김가루"],
      stepTexts: ["그릇에 모두 넣고 전자레인지로 5분 돌린 뒤 비벼요."],
      cookingMethodLabels: ["전자레인지"],
      providerTags: ["요리", "레시피"],
    });

    expect(suggested.map((tag) => tag.label)).toEqual([
      "유튜브레시피",
      "자취요리",
      "10분컷",
      "전자레인지",
      "한그릇요리",
      "초보가능",
    ]);
    expect(suggested.every((tag) => tag.is_system && tag.review_status === "approved")).toBe(true);
  });

  it("requires explicit evidence for sensitive diet tags and ignores provider-only claims", () => {
    const generic = buildSuggestedRecipeTags({
      sourceType: "youtube",
      title: "유명 셰프의 화제 레시피",
      ingredientNames: ["밀가루", "설탕", "버터"],
      stepTexts: ["반죽해서 굽습니다."],
      cookingMethodLabels: ["굽기"],
      providerTags: ["유명셰프요리", "SNS화제", "검증된레시피", "다이어트", "저당"],
    }).map((tag) => tag.label);

    expect(generic).not.toEqual(expect.arrayContaining([...P1_RECIPE_TAG_CANDIDATES]));
    expect(generic).not.toContain("다이어트");
    expect(generic).not.toContain("저당");

    const explicit = buildSuggestedRecipeTags({
      sourceType: "manual",
      title: "저당 다이어트 닭가슴살 샐러드",
      ingredientNames: ["닭가슴살", "상추", "오이", "무설탕 요거트"],
      stepTexts: ["설탕 없이 드레싱을 만들고 샐러드로 담아요."],
      cookingMethodLabels: ["무치기"],
    }).map((tag) => tag.label);

    expect(explicit).toEqual(expect.arrayContaining(["고단백", "다이어트", "저당", "샐러드"]));
  });

  it("does not infer child or vegetarian tags from weak evidence", () => {
    const suggested = buildSuggestedRecipeTags({
      sourceType: "manual",
      title: "매콤 제육 두부볶음",
      ingredientNames: ["돼지고기", "두부", "고추장"],
      stepTexts: ["청양고추와 고추장을 넣고 매콤하게 볶아요."],
      cookingMethodLabels: ["볶기"],
    }).map((tag) => tag.label);

    expect(suggested).toContain("매콤");
    expect(suggested).not.toContain("아이반찬");
    expect(suggested).not.toContain("채식한끼");
  });
});
