import { describe, expect, it } from "vitest";

import {
  filterSafeDisplayItems,
  getSafeDisplayText,
  isSafeDisplayText,
  normalizeDisplayText,
} from "@/lib/display-safety";

describe("display safety", () => {
  it("normalizes ordinary user-facing text", () => {
    expect(normalizeDisplayText("  김치   찌개  ")).toBe("김치 찌개");
    expect(isSafeDisplayText("김치찌개")).toBe(true);
    expect(isSafeDisplayText("주말 파티")).toBe(true);
  });

  it("blocks known invalid production fixture text from public display", () => {
    expect(isSafeDisplayText("토블론")).toBe(false);
    expect(isSafeDisplayText("ㄴㅇㄹㅇ")).toBe(false);
    expect(isSafeDisplayText("ㅏ;ㅣ;")).toBe(false);
    expect(getSafeDisplayText("ㅏ;ㅣ;", "이름 정리 필요")).toBe("이름 정리 필요");
  });

  it("filters unsafe named items without changing safe items", () => {
    const items = [
      { title: "김치찌개" },
      { title: "ㅏ;ㅣ;" },
      { title: "두부조림" },
    ];

    expect(filterSafeDisplayItems(items, (item) => item.title)).toEqual([
      { title: "김치찌개" },
      { title: "두부조림" },
    ]);
  });
});
