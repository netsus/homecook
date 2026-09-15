import React from "react";
import type { ReactNode } from "react";

import type { RecipeNutrition } from "@/types/recipe";

import {
  buildRecipeNutritionDisplay,
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
            className="mt-4 min-h-11 rounded-[var(--radius-control)] border border-[var(--brand-primary-border)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-bold text-[var(--brand-primary-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
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

      <NutritionGraph
        coreNutrients={display.nutrients}
        nutrition={nutrition}
        selectedServings={selectedServings}
      />

      {display.optionalNutrients.length > 0 ? (
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
          <NutritionTable
            label="추가 영양성분"
            nutrients={display.optionalNutrients}
            selectedServings={selectedServings}
          />
        </details>
      ) : null}

    </section>
  );
}

function NutritionGraph({
  coreNutrients,
  nutrition,
  selectedServings,
}: {
  coreNutrients: RecipeNutrientDisplayItem[];
  nutrition: RecipeNutrition;
  selectedServings: number;
}) {
  const baseServings = nutrition.base_servings;
  const coreByCode = new Map(coreNutrients.map((item) => [item.code, item]));
  const energyDisplay = coreByCode.get("energy_kcal");
  const energy = selectedNutritionAmount(nutrition, "energy_kcal", selectedServings, baseServings);
  const macros = [
    { code: "carbohydrate_g", label: "탄수화물", short: "탄", factor: 4, color: "var(--nutrition-carbohydrate)" },
    { code: "protein_g", label: "단백질", short: "단", factor: 4, color: "var(--nutrition-protein)" },
    { code: "fat_g", label: "지방", short: "지", factor: 9, color: "var(--nutrition-fat)" },
  ] as const;
  const macroValues = macros.map((macro) => ({
    ...macro,
    amount: selectedNutritionAmount(nutrition, macro.code, selectedServings, baseServings),
  }));
  const macroEnergy = macroValues.every((macro) => macro.amount !== null)
    ? macroValues.reduce((sum, macro) => sum + macro.amount! * macro.factor, 0)
    : 0;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 rounded-[var(--radius-full)] bg-[var(--brand-primary-soft)] px-2 py-1 text-[11px] font-extrabold leading-none text-[var(--brand-primary-text)]">
            {selectedServings}인분
          </span>
          <strong className="min-w-0 truncate text-[22px] font-extrabold leading-none tabular-nums text-[var(--brand-primary-text)]">
            {energyDisplay?.selectedTotalText ?? (energy === null ? "정보 준비 중" : `${formatNutritionNumber(energy, "kcal")} kcal`)}
          </strong>
        </div>
        {energyDisplay ? (
          <span className="shrink-0 text-right text-[12px] font-bold text-[var(--text-2)]">
            1인분 {energyDisplay.perServingText}
          </span>
        ) : null}
      </div>
      <div aria-label="탄수화물 단백질 지방 비율" className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-[var(--surface-fill)]" role="img">
        {macroEnergy > 0 ? macroValues.map((macro) => (
          <span
            aria-hidden="true"
            className="block h-full"
            key={macro.code}
            style={{ backgroundColor: macro.color, width: `${(macro.amount! * macro.factor / macroEnergy) * 100}%` }}
          />
        )) : null}
      </div>
      <dl className="mt-2 flex flex-wrap items-center justify-start gap-x-3 gap-y-1 text-[12px]">
        {macroValues.map((macro) => (
          <div className="inline-flex items-center gap-1.5" key={macro.code}>
            <dt className="flex items-center gap-1 font-bold text-[var(--text-2)]">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: macro.color }} />
              {macro.short}
            </dt>
            <dd className="font-extrabold tabular-nums text-[var(--foreground)]">
              {coreByCode.get(macro.code)?.selectedTotalText ?? (macro.amount === null ? "정보 준비 중" : `${formatNutritionNumber(macro.amount, "g")} g`)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function selectedNutritionAmount(
  nutrition: RecipeNutrition,
  code: string,
  selectedServings: number,
  baseServings: number | undefined,
) {
  const value = nutrition.values[code];
  const scalableValue = nutrition.scalable_values?.[code];
  const fixedValue = nutrition.fixed_values?.[code];
  if (
    !baseServings ||
    baseServings <= 0 ||
    selectedServings <= 0 ||
    (value?.status !== "complete" && value?.status !== "partial") ||
    typeof scalableValue !== "number" ||
    typeof fixedValue !== "number"
  ) {
    return null;
  }
  const amount = scalableValue * selectedServings / baseServings + fixedValue;
  return Number.isFinite(amount) ? amount : null;
}

function formatNutritionNumber(amount: number, unit: "kcal" | "g" | "mg") {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: unit === "g" ? 1 : 0,
  }).format(amount);
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
              <td className="break-keep px-2.5 py-2.5 text-right font-bold">
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
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--brand-primary-text)]">
        예상 영양
      </p>
      <h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
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
    "min-w-0 rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]",
    variant === "web" ? "web-recipe-nutrition-card" : "mb-5",
  ].join(" ");
}
