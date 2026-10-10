// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipeNutritionCard } from "@/components/recipe/recipe-nutrition-card";
import type { RecipeNutrition, RecipeNutritionSource } from "@/types/recipe";

const message = "일부 재료는 승인된 대표 영양값으로 계산했어요. 실제 제품·종류에 따라 달라질 수 있어요.";
const source: RecipeNutritionSource = { provider: "HOMECOOK_USER_STANDARD", dataset: "Homecook 제품 라벨 기반 서비스 대표 예시 20261010", source_version: "20261010-v1", data_basis_date: "2026-08-28", license: "공식 기수입 식품 영양 자료의 사실값; 서비스 대표 선택은 사용자 승인 기준", source_url: "https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do" };
const nutrition: RecipeNutrition = { basis: { amount: 1, unit: "serving" }, base_servings: 1, values: { energy_kcal: { amount: 4, known_amount: 4, status: "complete", display_mode: "total" } }, scalable_values: { energy_kcal: 4 }, fixed_values: { energy_kcal: 0 }, calculation_status: "complete", calculation_quality: "direct", availability_reason: null, warnings: [], sources: [source] };
afterEach(cleanup);

describe("recipe representative nutrition attribution", () => {
  it.each([source.dataset, "Homecook 제품 라벨 기반 서비스 대표 예시 20261010 · 정체성 보완", "Homecook 대표재료 영양 프로필", "Homecook 사용자 승인 영양 프로필"])("explains the identified nutrition dataset %s inside the existing details", dataset => {
    render(<RecipeNutritionCard nutrition={{ ...nutrition, sources: [{ ...source, dataset }] }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.getByText(message).closest("details")).toBeTruthy();
    expect(screen.getByText("5 kcal 미만")).toBeTruthy();
    expect(screen.queryByText("AI 추정값 포함")).toBeNull();
    expect(screen.queryByText(/승인된 대표 중량/)).toBeNull();
  });
  it.each([
    { provider: "HOMECOOK_USER_STANDARD", dataset: "사용자 승인 AI 추정 중량: 월계수잎·깻잎·통후추", warnings: ["PIECE_WEIGHT_CONVERSION_USED"] },
    { provider: "HOMECOOK_USER_STANDARD", dataset: "Homecook 기본 개당 중량", warnings: ["PIECE_WEIGHT_CONVERSION_USED"] },
    { provider: "HOMECOOK_USER_STANDARD", dataset: "Homecook 사용자 승인 부피·무게", warnings: ["REPRESENTATIVE_VOLUME_CONVERSION_USED"] },
    { provider: "HOMECOOK_USER_STANDARD", dataset: "Unidentified future dataset", warnings: [] },
    { provider: "MFDS", dataset: source.dataset, warnings: [] },
    { provider: "AI_ESTIMATE", dataset: "AI nutrient estimates", warnings: ["AI_NUTRITION_ESTIMATE_USED"] },
  ])("does not infer representative nutrition from $provider/$dataset", ({ provider, dataset, warnings }) => {
    render(<RecipeNutritionCard nutrition={{ ...nutrition, sources: [{ ...source, provider, dataset }], warnings }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.queryByText(message)).toBeNull();
    if (warnings.includes("PIECE_WEIGHT_CONVERSION_USED") || warnings.includes("REPRESENTATIVE_VOLUME_CONVERSION_USED")) expect(screen.getByText(/승인된 대표 중량/)).toBeTruthy();
    if (warnings.includes("AI_NUTRITION_ESTIMATE_USED")) expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
  });
  it("keeps representative nutrition, weight and AI notices independent in a mixed recipe", () => {
    render(<RecipeNutritionCard nutrition={{ ...nutrition, warnings: ["AI_NUTRITION_ESTIMATE_USED", "PIECE_WEIGHT_CONVERSION_USED"] }} selectedServings={1} onRetry={vi.fn()} />);
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByText(/승인된 대표 중량/)).toBeTruthy();
    expect(screen.getByText("AI 추정값 포함")).toBeTruthy();
  });
});
