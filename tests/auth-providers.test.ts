import { describe, expect, it } from "vitest";

import { parseEnabledAuthProviders } from "@/lib/auth/providers";

describe("auth providers", () => {
  it("falls back to google when env is missing", () => {
    expect(parseEnabledAuthProviders()).toEqual(["google"]);
  });

  it("filters, normalizes, and preserves allowed providers", () => {
    expect(parseEnabledAuthProviders("NAVER, google, unknown, kakao")).toEqual([
      "naver",
      "google",
      "kakao",
    ]);
  });

  it("falls back to google when parsed list is empty", () => {
    expect(parseEnabledAuthProviders("unknown")).toEqual(["google"]);
  });
});
