import { describe, expect, it } from "vitest";

import { cleanYoutubeTitle } from "@/lib/youtube-title";

describe("YouTube title cleaner", () => {
  it("removes YouTube/channel noise while keeping the recipe name", () => {
    expect(
      cleanYoutubeTitle("[ENG] 초간단 계란 볶음밥 #shorts | 집밥채널 - YouTube", {
        channelTitle: "집밥채널",
      }),
    ).toBe("초간단 계란 볶음밥");
  });

  it("decodes common HTML entities and falls back for empty titles", () => {
    expect(cleanYoutubeTitle("토마토 &amp; 달걀 볶음")).toBe("토마토 & 달걀 볶음");
    expect(cleanYoutubeTitle("  #shorts  ", { fallback: "제목 없음" })).toBe(
      "제목 없음",
    );
  });
});
