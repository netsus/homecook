import { describe, expect, it } from "vitest";

import { summarize } from "../scripts/youtube-real-app-route-smoke.mjs";

describe("YouTube real app-route smoke script", () => {
  it("counts comment extraction methods as author-comment usage in the summary", () => {
    const baseResult = {
      cleanup: { recipeDeleted: false, sessionDeleted: false },
      extract: { ok: true, body: { success: true } },
      register: null,
      reviewReached: true,
      validate: { ok: true, body: { success: true } },
    };

    const summary = summarize([
      { ...baseResult, methods: ["comment"] },
      { ...baseResult, methods: ["author_comment"] },
      { ...baseResult, methods: ["description"] },
    ]);

    expect(summary.authorCommentUsed).toBe(2);
  });
});
