import { describe, expect, it } from "vitest";

import { buildCustomSample, selectSamples, summarize } from "../scripts/youtube-real-app-route-smoke.mjs";

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

  it("builds custom smoke samples from explicit YouTube URLs", () => {
    expect(
      buildCustomSample("https://youtu.be/lTCplQtiGw8?si=abc", 2),
    ).toMatchObject({
      bucket: "custom",
      id: "custom-2-lTCplQtiGw8",
      url: "https://www.youtube.com/watch?v=lTCplQtiGw8",
      videoId: "lTCplQtiGw8",
    });
  });

  it("uses explicit URL samples instead of the default corpus", () => {
    const samples = selectSamples({
      limit: 7,
      urls: [
        "https://www.youtube.com/watch?v=lTCplQtiGw8",
        "https://www.youtube.com/shorts/ehIHFCBZp4E",
      ],
    }) as Array<{ videoId: string }>;

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.videoId)).toEqual(["lTCplQtiGw8", "ehIHFCBZp4E"]);
  });
});
