import { describe, expect, it } from "vitest";

import {
  addReviewedRecipeTag,
  buildReviewedRecipeTagsPayload,
  normalizeRecipeTagInput,
} from "@/lib/recipe-tag-input";

describe("recipe tag input helpers", () => {
  it("normalizes leading hash, whitespace, and Korean normalized keys", () => {
    expect(normalizeRecipeTagInput("  # 한식  ")).toEqual({
      key: "한식",
      label: "한식",
      reason: null,
    });
    expect(normalizeRecipeTagInput("원 팬 요리")).toEqual({
      key: "원팬요리",
      label: "원 팬 요리",
      reason: null,
    });
  });

  it("blocks empty, duplicate, overlong, and promotion-like tags before submit", () => {
    expect(addReviewedRecipeTag(["한식"], " 한 식 ")).toEqual({
      error: "이미 추가한 태그예요.",
      tags: ["한식"],
    });
    expect(addReviewedRecipeTag([], "   ")).toEqual({
      error: "태그를 입력해 주세요.",
      tags: [],
    });
    expect(addReviewedRecipeTag([], "열두글자를넘는매우긴태그들")).toEqual({
      error: "태그는 12자까지 입력할 수 있어요.",
      tags: [],
    });
    expect(addReviewedRecipeTag([], "https://example.com")).toEqual({
      error: "태그에는 링크나 홍보 문구를 넣을 수 없어요.",
      tags: [],
    });
  });

  it("omits reviewed tags unless the user changed the editor", () => {
    expect(buildReviewedRecipeTagsPayload({
      isDirty: false,
      tags: ["유튜브레시피", "디저트"],
    })).toBeUndefined();
    expect(buildReviewedRecipeTagsPayload({
      isDirty: true,
      tags: ["유튜브레시피", "디저트"],
    })).toEqual(["유튜브레시피", "디저트"]);
    expect(buildReviewedRecipeTagsPayload({
      isDirty: true,
      tags: [],
    })).toEqual([]);
  });
});
