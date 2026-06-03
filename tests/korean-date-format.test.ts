import { describe, expect, it } from "vitest";

import {
  formatKoreaCompactDate,
  formatKoreaDate,
  formatKoreaWeekday,
} from "@/lib/korean-date";

describe("Korean date formatting", () => {
  it("formats timestamps using the Korea calendar date", () => {
    expect(
      formatKoreaDate("2026-04-20T16:30:00.000Z", {
        month: "long",
        day: "numeric",
      }),
    ).toBe("4월 21일");
    expect(formatKoreaCompactDate("2026-04-20T16:30:00.000Z")).toBe("4/21");
  });

  it("keeps date-only planner keys on their Korea date", () => {
    expect(
      formatKoreaDate("2026-04-20", {
        month: "long",
        day: "numeric",
      }),
    ).toBe("4월 20일");
    expect(formatKoreaWeekday("2026-04-20", "short")).toBe("월");
  });
});
