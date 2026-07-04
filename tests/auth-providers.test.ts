import { describe, expect, it } from "vitest";

import { parseEnabledAuthProviders } from "@/lib/auth/providers";

describe("auth providers", () => {
  it("uses all production social providers when env is missing", () => {
    expect(parseEnabledAuthProviders()).toEqual(["kakao", "naver", "google"]);
  });

  it("filters, normalizes, and preserves allowed providers", () => {
    expect(parseEnabledAuthProviders("NAVER, google, unknown, kakao")).toEqual([
      "naver",
      "google",
      "kakao",
    ]);
  });

  it("uses all production social providers when parsed list is empty", () => {
    expect(parseEnabledAuthProviders("unknown")).toEqual(["kakao", "naver", "google"]);
  });
});
