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
  const warningMessages = buildWarningMessages(nutrition.warnings);

  return (
    <section
      aria-labelledby={`recipe-nutrition-title-${variant}`}
      className={cardClassName(variant)}
      data-testid={`recipe-nutrition-card-${variant}`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--brand-primary-text)]">
            예상값
          </p>
          <h2
            className="mt-1 text-[18px] font-extrabold tracking-[-0.02em] text-[var(--foreground)]"
            id={`recipe-nutrition-title-${variant}`}
          >
            1인분 기준 예상 영양
          </h2>
        </div>
        {display.qualityText ? (
          <span className="max-w-full rounded-[var(--radius-full)] bg-[var(--brand-primary-soft)] px-2.5 py-1 text-[11px] font-bold leading-4 text-[var(--brand-primary-text)]">
            {display.qualityText}
          </span>
        ) : null}
      </div>

      {!display.hasValidBaseServings ? (
        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-2.5 text-[12px] leading-5 text-[var(--text-2)]">
          기준 인분 정보가 올바르지 않아 계산값을 표시하지 않았어요.
        </p>
      ) : null}

      <NutritionTable
        label="예상 영양성분"
        nutrients={display.nutrients}
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

      <div className="mt-3 space-y-1 text-[12px] leading-5 text-[var(--text-2)]">
        {nutrition.calculation_status === "partial" ? (
          <p>일부 값은 확인된 재료만 합친 최소값이에요.</p>
        ) : null}
        {nutrition.calculation_status === "unavailable" ? (
          <p>정확히 계산할 수 있는 재료 정보가 아직 부족해요.</p>
        ) : null}
        {nutrition.calculation_quality === "estimated" ||
        nutrition.calculation_quality === "mixed" ? (
          <p>재료 투입량과 일반 계량값을 기준으로 계산한 예상치예요.</p>
        ) : null}
        {display.reflectedText ? <p>{display.reflectedText}</p> : null}
        <p>재료 양은 손질 후 실제 요리에 넣는 먹을 수 있는 부분 기준이에요.</p>
        <p>조리 과정에서 달라지는 영양 손실은 반영하지 않았어요.</p>
      </div>

      {warningMessages.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-2.5 text-[12px] leading-5 text-[var(--text-2)]">
          {warningMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      {nutrition.sources.length > 0 ? (
        <details className="mt-2 text-[12px] text-[var(--text-2)]">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
            계산 출처와 기준 보기
          </summary>
          <ul className="space-y-2 pb-1">
            {nutrition.sources.map((source) => {
              const sourceKey = [
                source.provider,
                source.dataset,
                source.source_version,
                source.data_basis_date ?? "",
                source.license,
                source.source_url,
              ].join("|");
              const safeUrl = getSafePublicUrl(source.source_url);

              return (
                <li className="leading-5" key={sourceKey}>
                  <span className="font-semibold text-[var(--foreground)]">
                    {source.provider} · {source.dataset}
                  </span>
                  <span> ({source.source_version})</span>
                  {source.data_basis_date ? (
                    <span> · 기준일 {source.data_basis_date}</span>
                  ) : null}
                  <span> · {source.license}</span>
                  {safeUrl ? (
                    <a
                      className="ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                      href={safeUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      원문
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
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

function getSafePublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const WARNING_COPY: Record<string, string> = {
  NUTRITION_PROFILE_MISSING:
    "영양 정보가 연결되지 않은 재료가 있어 일부 값이 빠질 수 있어요.",
  NUTRIENT_VALUE_MISSING:
    "연결된 재료에 일부 영양성분 값이 없어 해당 값은 최소치일 수 있어요.",
  UNIT_CONVERSION_MISSING:
    "재료 단위를 무게로 정확히 바꾸지 못해 일부 값이 빠질 수 있어요.",
  TO_TASTE_EXCLUDED:
    "‘약간’, ‘적당량’처럼 양이 정해지지 않은 재료는 계산에서 제외했어요.",
  REPRESENTATIVE_VOLUME_CONVERSION_USED:
    "부피 단위는 승인된 계량값으로 무게를 환산해 계산했어요.",
  PIECE_WEIGHT_CONVERSION_USED:
    "개수 단위는 승인된 재료 무게 기준으로 바꿔 계산했어요.",
};

const UNKNOWN_WARNING_COPY =
  "일부 영양값에는 추가 확인이 필요한 계산 조건이 있어요.";

function buildWarningMessages(warnings: string[]) {
  return [...new Set(warnings.map((warning) => (
    WARNING_COPY[warning] ?? UNKNOWN_WARNING_COPY
  )))];
}
