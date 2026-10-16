import { describe, expect, it } from "vitest";

import { formatRegisteredCompany } from "@/lib/registered-company-name";

describe("registered company display", () => {
  it.each([
    "샘표식품주식회사",
    "샘표식품(주)",
    "샘표식품(주)영동공장",
    "샘표식품(주) 이천공장",
    "샘표식품㈜",
    "샘표식품(주)이천공장",
  ])("uses only reviewed Sempio aliases and preserves %s", (brand) => {
    expect(formatRegisteredCompany(brand)).toEqual({ displayName: "샘표", originalName: brand });
  });

  it.each([
    ["주식회사샤니", "샤니"],
    ["(주)우농", "우농"],
    ["양포식품(주)", "양포식품"],
    ["롯데웰푸드㈜", "롯데웰푸드"],
    ["씨제이제일제당(주) 진천 BLOSSOM CAMPUS 3동", "씨제이제일제당 진천 BLOSSOM CAMPUS 3동"],
    ["주식회사 내담에프앤비(NAEDAM F&B)", "내담에프앤비(NAEDAM F&B)"],
    ["샘표식품(주)새공장", "샘표식품 새공장"],
    ["농업회사법인 자연식품", "농업회사법인 자연식품"],
    ["A COMPANY LTD (IMPORTS)", "A COMPANY LTD (IMPORTS)"],
    ["우리회사 산업 식품 공장 지점", "우리회사 산업 식품 공장 지점"],
    ["  샘표식품（주）  이천공장  ", "샘표"],
    ["내담  F&B", "내담 F&B"],
  ])("limits cleanup to legal notation in %s", (brand, displayName) => {
    expect(formatRegisteredCompany(brand)).toEqual({ displayName, originalName: brand });
  });

  it.each([null, "", " \t ", "-", "???", "없음", "미상", "N/A", "(주)", "주식회사", "(주)-", "㈜???", "(주) 없음", "주식회사 N/A", "((주))"])(
    "uses a neutral label for missing or meaningless %s",
    (brand) => expect(formatRegisteredCompany(brand)).toEqual({ displayName: "제품", originalName: null }),
  );

  it("preserves long unreviewed names without slicing graphemes or guessing an alias", () => {
    const brand = "한글과English혼합회사명".repeat(20) + "👩🏽‍🍳";
    expect(formatRegisteredCompany(brand)).toEqual({ displayName: brand, originalName: brand });
  });
});
