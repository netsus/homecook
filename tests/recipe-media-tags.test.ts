import { describe, expect, it } from "vitest";

import {
  extractHashTagsFromText,
  generateRecipeTags,
  RECIPE_TAG_MAX_LENGTH,
  parseRecipeImagePublicUrl,
} from "@/lib/server/recipe-media";

describe("recipe media and tag helpers", () => {
  it("generates normalized deterministic recipe tags with generic provider tags filtered", () => {
    const tags = generateRecipeTags({
      title: "김치찌개",
      ingredientNames: ["김치", "소금", "김치"],
      stepTexts: ["김치를 볶고 끓여요."],
      cookingMethodLabels: ["볶기", "끓이기"],
      providerTags: ["#김치찌개", "레시피", "vlog", "김치"],
    });

    expect(tags).toEqual(["김치찌개", "김치", "소금"]);
  });

  it("caps generated tags at three values", () => {
    const tags = generateRecipeTags({
      title: "집밥 반찬",
      ingredientNames: ["두부", "대파", "마늘", "고추장", "참기름", "깨", "간장"],
      stepTexts: [],
      cookingMethodLabels: ["무치기", "굽기"],
      providerTags: ["밑반찬"],
    });

    expect(tags).toHaveLength(3);
    expect(tags).toEqual(["밑반찬", "집밥 반찬", "두부"]);
  });

  it("prioritizes Korean provider tags before title and low-signal ingredient fallback", () => {
    const tags = generateRecipeTags({
      title: "오븐도 젤라틴도 없이 만드는 부드러운 딸기 우유 푸딩 디저트예요",
      ingredientNames: ["생딸기", "우유", "설탕", "소금", "옥수수전분", "무염버터", "레몬즙"],
      stepTexts: ["딸기와 우유를 갈고 냉장실에서 굳혀요."],
      cookingMethodLabels: ["끓이기"],
      providerTags: [
        "#StrawberryPudding",
        "#딸기푸딩",
        "#BakingASMR",
        "#NoBakeDessert",
        "#노오븐디저트",
        "#딸기디저트",
        "#MilkPudding",
        "#CookingTree",
      ],
    });

    expect(tags).toEqual(["딸기푸딩", "노오븐디저트", "딸기디저트"]);
    expect(tags).not.toContain("딸기 우유 푸딩");
    expect(tags).not.toContain("소금");
  });

  it("falls back to the title when fewer than three Korean provider tags exist", () => {
    const tags = generateRecipeTags({
      title: "오븐도 젤라틴도 없이 만드는 부드러운 딸기 우유 푸딩 디저트예요",
      ingredientNames: ["생딸기", "우유", "설탕"],
      stepTexts: [],
      cookingMethodLabels: [],
      providerTags: ["#StrawberryPudding", "#딸기푸딩", "#BakingASMR"],
    });

    expect(tags).toEqual(["딸기푸딩", "딸기 우유 푸딩", "생딸기"]);
  });

  it("drops overlong provider, title, and ingredient tag candidates", () => {
    const tags = generateRecipeTags({
      title: "정말 긴 유튜브 영상 제목이 그대로 태그에 들어가면 안 되는 김치찌개",
      ingredientNames: ["돼지고기 앞다리살을 아주 길게 쓴 재료", "김치", "소금"],
      stepTexts: [],
      cookingMethodLabels: ["끓이기"],
      providerTags: ["#이것은너무긴유튜브해시태그입니다", "#집밥김치찌개"],
    });

    expect(tags).toEqual(["집밥김치찌개", "김치찌개", "김치"]);
    expect(tags.every((tag) => tag.length <= RECIPE_TAG_MAX_LENGTH)).toBe(true);
  });

  it("extracts hash tags from description text for provider tag candidates", () => {
    expect(extractHashTagsFromText(
      "#StrawberryPudding #딸기푸딩\n#NoBakeDessert #노오븐디저트 #BakingASMR",
    )).toEqual(["StrawberryPudding", "딸기푸딩", "NoBakeDessert", "노오븐디저트", "BakingASMR"]);
  });

  it("returns an empty tag list when no useful inputs exist", () => {
    expect(generateRecipeTags({
      title: "",
      ingredientNames: [],
      stepTexts: [],
      cookingMethodLabels: [],
      providerTags: ["레시피", "vlog", "#"],
    })).toEqual([]);
  });

  it("parses only current-user public recipe image URLs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440101";
    const publicUrl = `https://project.supabase.co/storage/v1/object/public/recipe-images/user-1/${uuid}.webp`;

    expect(parseRecipeImagePublicUrl({
      thumbnailUrl: publicUrl,
      userId: "user-1",
      supabaseUrl: "https://project.supabase.co",
    })).toEqual({
      objectPath: `user-1/${uuid}.webp`,
      storagePath: `recipe-images/user-1/${uuid}.webp`,
    });
  });

  it("rejects external, signed, cross-user, and query-bearing recipe image URLs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440101";
    const cases = [
      `https://evil.example/storage/v1/object/public/recipe-images/user-1/${uuid}.webp`,
      `https://project.supabase.co/storage/v1/object/sign/recipe-images/user-1/${uuid}.webp`,
      `https://project.supabase.co/storage/v1/object/public/recipe-images/user-2/${uuid}.webp`,
      `https://project.supabase.co/storage/v1/object/public/recipe-images/user-1/${uuid}.webp?token=abc`,
    ];

    for (const thumbnailUrl of cases) {
      expect(parseRecipeImagePublicUrl({
        thumbnailUrl,
        userId: "user-1",
        supabaseUrl: "https://project.supabase.co",
      })).toBeNull();
    }
  });
});
