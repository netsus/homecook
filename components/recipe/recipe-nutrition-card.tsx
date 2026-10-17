import React from "react";
import { SMALL_ENERGY_DISPLAY_NOTICE } from "@/lib/nutrition/energy-display";
import type { ReactNode } from "react";

import type { RecipeNutrition } from "@/types/recipe";
import { NutritionFactsTable } from "@/components/shared/nutrition-facts-table";

import {
  buildRecipeNutritionDisplay,
  hasCompleteEnergyAndMacros,
  type RecipeNutrientDisplayItem,
} from "@/lib/nutrition/recipe-nutrition-display";

interface RecipeNutritionCardProps {
  isRefreshing?: boolean;
  nutrition: RecipeNutrition;
  onRetry: () => void;
  selectedServings: number;
  variant?: "app" | "web";
}

export function RecipeNutritionCard({
  isRefreshing = false,
  nutrition,
  onRetry,
  selectedServings,
  variant = "app",
}: RecipeNutritionCardProps) {
  if (isRefreshing) {
    return <RecipeNutritionLoadingCard variant={variant} />;
  }

  if (nutrition.availability_reason === "temporarily_unavailable") {
    return (
      <NutritionStateCard
        action={
          <button
            aria-label="영양 정보 다시 시도"
            className="mt-4 min-h-11 rounded-[var(--radius-control)] border border-[var(--brand-primary-border)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--brand-primary-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        }
        description="레시피와 재료는 그대로 볼 수 있어요. 영양 정보만 다시 불러올게요."
        title="영양 정보를 잠시 불러오지 못했어요"
        testId={`recipe-nutrition-state-${variant}`}
        variant={variant}
      />
    );
  }

  if (nutrition.availability_reason === "missing") {
    return (
      <NutritionStateCard
        description="정확히 연결된 재료 정보가 준비되면 이곳에 표시할게요."
        title="영양 정보를 준비하고 있어요"
        testId={`recipe-nutrition-state-${variant}`}
        variant={variant}
      />
    );
  }

  const display = buildRecipeNutritionDisplay(nutrition, selectedServings);
  const hasIncompleteNutrition = !hasCompleteEnergyAndMacros(nutrition.values);
  return (
    <section
      aria-label="레시피 영양성분"
      className={cardClassName(variant)}
      data-testid={`recipe-nutrition-card-${variant}`}
    >
      {!display.hasValidBaseServings ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-2.5 text-[12px] leading-5 text-[var(--text-2)]">
          기준 인분 정보가 올바르지 않아 계산값을 표시하지 않았어요.
        </p>
      ) : null}

      <NutritionFactsTable
        rows={display.nutrients.map(item => ({ code: item.code, label: item.label, totalText: item.selectedTotalText, perServingText: item.perServingText, status: nutrition.values[item.code]?.status }))}
        totalLabel={`선택 ${selectedServings}인분`}
        perServingLabel="기본 1인분"
      />

      {display.aiEstimateText ? (
        <p className="mt-2 text-[12px] font-semibold text-[var(--brand-primary-text)]">{display.aiEstimateText}{hasIncompleteNutrition ? " · 일부 영양정보가 빠진 추정값" : ""}</p>
      ) : null}

      <details className="group mt-2 text-[12px] text-[var(--text-2)]">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
          <span>영양성분 더 보기</span>
          <span
            aria-hidden="true"
            className="ml-auto text-[16px] transition-transform group-open:rotate-180"
            data-testid="optional-nutrition-disclosure-icon"
          >
            ⌄
          </span>
        </summary>
        <p className="leading-5">{SMALL_ENERGY_DISPLAY_NOTICE}</p>
        {display.representativeNutritionText ? <p className="leading-5">{display.representativeNutritionText}</p> : null}
        {nutrition.warnings.some(warning => warning === "PIECE_WEIGHT_CONVERSION_USED" || warning === "REPRESENTATIVE_VOLUME_CONVERSION_USED") ? (
          <p className="leading-5">개수·부피로 입력한 재료는 승인된 대표 중량으로 환산했어요. 실제 무게와 다를 수 있어요.</p>
        ) : null}
        {nutrition.warnings.includes("UNIT_MEASUREMENT_ESTIMATE_USED") ? (
          <p className="leading-5">검토된 평균 측정값을 사용해 환산했어요. 실제 무게·부피와 다를 수 있어요.</p>
        ) : null}
        {hasIncompleteNutrition ? (
          <p className="leading-5">
            {display.aiEstimateText
              ? "일부 영양정보를 계산하지 못했어요."
              : "일부 영양 정보가 빠져 있어요. 확인된 값만 표시했어요."}
          </p>
        ) : null}
        {display.optionalNutrients.length > 0 ? (
          <NutritionTable
            label="추가 영양성분"
            nutrients={display.optionalNutrients}
            selectedServings={selectedServings}
          />
        ) : null}
      </details>

    </section>
  );
}

function NutritionTable({
  label,
  nutrients,
  selectedServings,
}: {
  label: string;
  nutrients: RecipeNutrientDisplayItem[];
  selectedServings: number;
}) {
  return (
    <div className="mt-4 min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)]">
      <table
        aria-label={label}
        className="w-full table-fixed border-collapse text-left text-[12px]"
      >
        <thead className="bg-[var(--surface-fill)] text-[var(--text-2)]">
          <tr>
            <th className="w-[28%] px-2.5 py-2 font-semibold" scope="col">
              영양성분
            </th>
            <th className="w-[30%] px-1.5 py-2 text-right font-semibold" scope="col">
              1인분
            </th>
            <th className="w-[42%] px-2.5 py-2 text-right font-semibold" scope="col">
              선택 {selectedServings}인분 전체
            </th>
          </tr>
        </thead>
        <tbody>
          {nutrients.map((nutrient) => (
            <tr
              className="border-t border-[var(--line)] text-[var(--foreground)]"
              key={nutrient.code}
            >
              <th className="px-2.5 py-2.5 font-semibold" scope="row">
                {nutrient.label}
              </th>
              <td className="break-keep px-1.5 py-2.5 text-right font-medium">
                {nutrient.perServingText}
              </td>
              <td className="break-keep px-2.5 py-2.5 text-right font-medium">
                {nutrient.selectedTotalText}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecipeNutritionLoadingCard({ variant }: { variant: "app" | "web" }) {
  return (
    <section
      aria-label="영양 정보 불러오는 중"
      aria-busy="true"
      className={cardClassName(variant)}
      data-testid="recipe-nutrition-loading-skeleton"
    >
      <div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-subtle)]" />
      <div className="mt-2 h-6 w-48 max-w-full animate-pulse rounded bg-[var(--surface-subtle)]" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" />
        <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" />
        <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" />
      </div>
    </section>
  );
}

function NutritionStateCard({
  action,
  description,
  title,
  testId,
  variant,
}: {
  action?: ReactNode;
  description: string;
  title: string;
  testId: string;
  variant: "app" | "web";
}) {
  return (
    <section className={cardClassName(variant)} data-testid={testId}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--brand-primary-text)]">
        예상 영양
      </p>
      <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
        {title}
      </h2>
      <p className="mt-2 text-[13px] leading-5 text-[var(--text-2)]">
        {description}
      </p>
      {action}
    </section>
  );
}

function cardClassName(variant: "app" | "web") {
  return [
    "min-w-0 rounded-[var(--radius-card)] bg-[var(--ui-sky-50)] p-4 sm:p-5",
    variant === "app" ? "mb-5" : "",
  ].join(" ");
}
