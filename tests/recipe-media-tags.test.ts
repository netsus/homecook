import { describe, expect, it } from "vitest";

import {
  generateRecipeTags,
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

    expect(tags).toEqual(["김치찌개", "김치", "소금", "볶기", "끓이기"]);
  });

  it("caps generated tags at six values", () => {
    const tags = generateRecipeTags({
      title: "집밥 반찬",
      ingredientNames: ["두부", "대파", "마늘", "고추장", "참기름", "깨", "간장"],
      stepTexts: [],
      cookingMethodLabels: ["무치기", "굽기"],
      providerTags: ["밑반찬"],
    });

    expect(tags).toHaveLength(6);
    expect(tags).toEqual(["집밥 반찬", "두부", "대파", "마늘", "고추장", "참기름"]);
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
