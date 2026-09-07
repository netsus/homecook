import React from "react";

import type { MealLogNutritionEvidence } from "@/types/meal-log";

const format = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);

/** Visualize the server's nutrient totals; never estimate missing nutrition. */
export function MealLogNutritionChart({ nutrition }: { nutrition: MealLogNutritionEvidence }) {
  const macros = [
    { label: "탄수화물", value: nutrition.carbohydrate_g, factor: 4, color: "#F4D35E" },
    { label: "단백질", value: nutrition.protein_g, factor: 4, color: "#8b5fc4" },
    { label: "지방", value: nutrition.fat_g, factor: 9, color: "#F78154" },
  ];
  const available = nutrition.calculation_status !== "unavailable"
    && macros.every((macro) => macro.value !== null);
  const energy = available ? macros.reduce((sum, macro) => sum + macro.value! * macro.factor, 0) : 0;
  const calorieLabel = nutrition.calories_kcal === null ? "정보 준비 중" : `${format(nutrition.calories_kcal)} kcal`;
  let offset = 0;

  return (
    <div>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="w-28 shrink-0 text-center sm:w-32">
          {available && energy > 0 ? (
            <svg aria-label={`${nutrition.calculation_status === "partial" ? "확인된 영양 기준 · " : ""}${macros.map((macro) => `${macro.label} ${format(macro.value!)}g`).join(" · ")} · 탄단지 열량 비율 · 총 칼로리 ${calorieLabel}`} className="h-28 w-28 sm:h-32 sm:w-32" role="img" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="49" fill="none" stroke="#f1f5f9" strokeWidth="10" />
              {macros.map((macro) => {
                const share = macro.value! * macro.factor / energy * 100;
                const start = offset;
                offset += share;
                return <circle key={macro.label} cx="60" cy="60" fill="none" pathLength="100" r="49" stroke={macro.color} strokeDasharray={`${Math.max(0, share - 1)} ${100 - Math.max(0, share - 1)}`} strokeDashoffset={-start} strokeWidth="10" transform="rotate(-90 60 60)" />;
              })}
              <text x="60" y="51" textAnchor="middle" fontSize="9" fill="#64748b">{nutrition.calculation_status === "partial" ? "확인된 열량" : "총 섭취 열량"}</text>
              <text x="60" y="70" textAnchor="middle" fontSize="13" fontWeight="800" fill="#00A1FF">{calorieLabel}</text>
            </svg>
          ) : <div className="flex min-h-28 flex-col justify-center rounded-full bg-sky-50 px-2"><span className="text-[11px] text-slate-500">총 섭취 열량</span><p className="mt-1 text-base font-extrabold text-[var(--brand-accent)]">{calorieLabel}</p></div>}
        </div>
        <dl className="min-w-0 flex-1 space-y-3 text-xs sm:text-sm lg:grid lg:grid-cols-3 lg:divide-x lg:divide-slate-100 lg:space-y-0">
          {macros.map((macro) => <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 lg:flex-col lg:justify-center lg:gap-2 lg:px-2" key={macro.label}><dt className="flex items-center gap-2 text-slate-600"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: macro.color }} />{macro.label}</dt><dd className="font-extrabold tabular-nums text-[var(--brand-accent)] lg:text-2xl">{macro.value === null ? <span className="text-xs font-medium">정보 준비 중</span> : `${format(macro.value)}g`}</dd></div>)}
        </dl>
      </div>
      {available && energy > 0 ? <p className="mt-2 text-[11px] text-slate-500">그래프는 탄수화물·단백질·지방의 열량 비율이에요.</p> : <p className="mt-3 text-xs text-slate-500">{available ? "먹은 음식이 기록되면 탄단지 비율을 보여드릴게요." : "영양 정보가 준비되면 그래프를 보여드릴게요."}</p>}
      {nutrition.calculation_status === "partial" ? <p className="mt-2 text-xs text-slate-600">최소 · 확인된 영양 정보만 표시해요. 실제 섭취량은 더 많을 수 있어요.</p> : null}
    </div>
  );
}
