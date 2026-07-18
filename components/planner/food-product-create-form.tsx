"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { createFoodProduct, isFoodProductApiError } from "@/lib/api/food-product";
import type { FoodProductDraftContext } from "@/lib/planner/product-planner-return-context";
import {
  FOOD_PRODUCT_BASIS_UNITS,
  type FoodProductBasisUnit,
  type FoodProductCreateInput,
  type FoodProductData,
  type FoodProductNutrientCode,
} from "@/types/food-product";

const OPTIONAL_NUTRIENTS: Array<{
  code: Exclude<FoodProductNutrientCode, "energy_kcal">;
  label: string;
  unit: string;
}> = [
  { code: "carbohydrate_g", label: "탄수화물", unit: "g" },
  { code: "protein_g", label: "단백질", unit: "g" },
  { code: "fat_g", label: "지방", unit: "g" },
  { code: "sodium_mg", label: "나트륨", unit: "mg" },
  { code: "sugars_g", label: "당류", unit: "g" },
  { code: "saturated_fat_g", label: "포화지방", unit: "g" },
  { code: "fiber_g", label: "식이섬유", unit: "g" },
];

const UNIT_LABELS: Record<FoodProductBasisUnit, string> = {
  serving: "1회",
  package: "1팩",
  g: "g",
  ml: "mL",
};

type FieldKey = "name" | "basisAmount" | "energy" | Exclude<FoodProductNutrientCode, "energy_kcal">;

function parseOptionalAmount(value: string) {
  if (value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export function FoodProductCreateForm({
  initialDraft,
  onCancel,
  onCreated,
  onDirtyChange,
  onUnauthorized,
}: {
  initialDraft?: FoodProductDraftContext | null;
  onCancel: () => void;
  onCreated: (product: FoodProductData) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onUnauthorized?: (draft: FoodProductDraftContext) => void;
}) {
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [brand, setBrand] = useState(initialDraft?.brand ?? "");
  const [basisAmount, setBasisAmount] = useState(initialDraft?.basisAmount ?? "1");
  const [basisUnit, setBasisUnit] = useState<FoodProductBasisUnit>(initialDraft?.basisUnit ?? "serving");
  const [energy, setEnergy] = useState(initialDraft?.energy ?? "");
  const [nutrients, setNutrients] = useState<
    Partial<Record<Exclude<FoodProductNutrientCode, "energy_kcal">, string>>
  >(initialDraft?.nutrients ?? {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const basisRef = useRef<HTMLInputElement>(null);
  const energyRef = useRef<HTMLInputElement>(null);
  const nutrientRefs = useRef<Partial<Record<Exclude<FoodProductNutrientCode, "energy_kcal">, HTMLInputElement>>>({});

  const draft = useMemo<FoodProductDraftContext>(() => ({
    name,
    brand,
    basisAmount,
    basisUnit,
    energy,
    nutrients,
  }), [basisAmount, basisUnit, brand, energy, name, nutrients]);
  const isDirty = Boolean(
    name || brand || energy || basisAmount !== "1" || basisUnit !== "serving" ||
    Object.values(nutrients).some((value) => Boolean(value)),
  );

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  function clearFieldError(field: FieldKey) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  function failField(field: FieldKey, message: string, control: HTMLInputElement | null | undefined) {
    setFieldErrors((current) => ({ ...current, [field]: message }));
    setFormError(null);
    control?.focus();
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedBasisAmount = Number(basisAmount);
    const parsedEnergy = Number(energy);

    if (!name.trim()) {
      failField("name", "완제품 이름을 입력해 주세요.", nameRef.current);
      return;
    }
    if (!Number.isFinite(parsedBasisAmount) || parsedBasisAmount <= 0) {
      failField("basisAmount", "영양정보 기준량은 0보다 커야 해요.", basisRef.current);
      return;
    }
    if (basisUnit !== "g" && basisUnit !== "ml") {
      setFormError("사용자 등록 완제품의 기준 단위는 g 또는 mL만 사용할 수 있어요.");
      return;
    }
    if (energy.trim() === "" || !Number.isFinite(parsedEnergy) || parsedEnergy < 0) {
      failField("energy", "열량은 0 이상의 숫자로 입력해 주세요.", energyRef.current);
      return;
    }

    const values: FoodProductCreateInput["nutrition"]["values"] = { energy_kcal: parsedEnergy };
    for (const { code } of OPTIONAL_NUTRIENTS) {
      const parsed = parseOptionalAmount(nutrients[code] ?? "");
      if (parsed === undefined) {
        failField(code, "비워 두거나 0 이상의 숫자로 입력해 주세요.", nutrientRefs.current[code]);
        return;
      }
      if (parsed !== null) values[code] = parsed;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);
    try {
      const product = await createFoodProduct({
        name: name.trim(),
        brand: brand.trim() || null,
        nutrition: {
          basis: { amount: parsedBasisAmount, unit: basisUnit },
          values,
        },
      });
      onCreated(product);
    } catch (caught) {
      if (isFoodProductApiError(caught) && caught.status === 401 && onUnauthorized) {
        onUnauthorized(draft);
        return;
      }
      setFormError(
        isFoodProductApiError(caught)
          ? caught.message
          : "완제품을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName = "min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal outline-none focus:border-[var(--brand-primary)] aria-[invalid=true]:border-[var(--danger)]";

  return (
    <form className="flex min-h-0 flex-1 flex-col" data-testid="food-product-create-form" noValidate onSubmit={handleSubmit}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 pb-5" data-testid="food-product-create-scroll-body">
        <div className="rounded-[var(--radius-card)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] p-4">
          <p className="text-sm font-extrabold text-[var(--foreground)]">내 완제품 등록</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
            등록한 제품은 나만 볼 수 있고 나만 수정할 수 있어요. 포장지의 값을 그대로 입력하며 빈 영양성분은 0으로 바꾸지 않아요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-[var(--foreground)]">
            완제품 이름 <span className="sr-only">필수</span>
            <input
              aria-describedby={fieldErrors.name ? "food-product-name-error" : undefined}
              aria-invalid={Boolean(fieldErrors.name)}
              autoComplete="off"
              className={inputClassName}
              disabled={isSubmitting}
              maxLength={120}
              onChange={(event) => { setName(event.target.value); clearFieldError("name"); }}
              placeholder="예: 플레인 요거트"
              ref={nameRef}
              value={name}
            />
            {fieldErrors.name ? <span className="text-xs font-semibold text-[var(--danger)]" id="food-product-name-error">{fieldErrors.name}</span> : null}
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-[var(--foreground)]">
            브랜드 <span className="font-normal text-[var(--text-3)]">선택</span>
            <input autoComplete="off" className={inputClassName} disabled={isSubmitting} maxLength={120} onChange={(event) => setBrand(event.target.value)} placeholder="예: 무먹 식품" value={brand} />
          </label>
        </div>

        <fieldset className="rounded-[var(--radius-card)] border border-[var(--line)] p-4">
          <legend className="px-1 text-sm font-extrabold text-[var(--foreground)]">영양정보 기준</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,0.7fr)] gap-3">
            <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
              기준량
              <input
                aria-describedby={fieldErrors.basisAmount ? "food-product-basis-error" : undefined}
                aria-invalid={Boolean(fieldErrors.basisAmount)}
                className={inputClassName}
                disabled={isSubmitting}
                inputMode="decimal"
                min="0.01"
                onChange={(event) => { setBasisAmount(event.target.value); clearFieldError("basisAmount"); }}
                ref={basisRef}
                step="any"
                type="number"
                value={basisAmount}
              />
              {fieldErrors.basisAmount ? <span className="text-xs font-semibold text-[var(--danger)]" id="food-product-basis-error">{fieldErrors.basisAmount}</span> : null}
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
              단위
              <select className={inputClassName} disabled={isSubmitting} onChange={(event) => setBasisUnit(event.target.value as FoodProductBasisUnit)} value={basisUnit}>
                {FOOD_PRODUCT_BASIS_UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-[var(--radius-card)] border border-[var(--line)] p-4">
          <legend className="px-1 text-sm font-extrabold text-[var(--foreground)]">영양성분</legend>
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
            열량 (kcal) <span className="sr-only">필수</span>
            <input
              aria-describedby={fieldErrors.energy ? "food-product-energy-error" : undefined}
              aria-invalid={Boolean(fieldErrors.energy)}
              className={inputClassName}
              disabled={isSubmitting}
              inputMode="decimal"
              min="0"
              onChange={(event) => { setEnergy(event.target.value); clearFieldError("energy"); }}
              placeholder="0도 실제 값이면 입력 가능"
              ref={energyRef}
              step="any"
              type="number"
              value={energy}
            />
            {fieldErrors.energy ? <span className="text-xs font-semibold text-[var(--danger)]" id="food-product-energy-error">{fieldErrors.energy}</span> : null}
          </label>

          <details className="mt-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-fill)] p-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-[var(--foreground)]">추가 영양성분 입력 (선택)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OPTIONAL_NUTRIENTS.map(({ code, label, unit }) => (
                <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]" key={code}>
                  {label} ({unit}) <span className="font-normal text-[var(--text-3)]">선택</span>
                  <input
                    aria-describedby={fieldErrors[code] ? `food-product-${code}-error` : undefined}
                    aria-invalid={Boolean(fieldErrors[code])}
                    className={inputClassName}
                    disabled={isSubmitting}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => { setNutrients((current) => ({ ...current, [code]: event.target.value })); clearFieldError(code); }}
                    placeholder="모르면 비워 두기"
                    ref={(node) => { if (node) nutrientRefs.current[code] = node; }}
                    step="any"
                    type="number"
                    value={nutrients[code] ?? ""}
                  />
                  {fieldErrors[code] ? <span className="text-xs font-semibold text-[var(--danger)]" id={`food-product-${code}-error`}>{fieldErrors[code]}</span> : null}
                </label>
              ))}
            </div>
          </details>
        </fieldset>

        {formError ? <p className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--danger)]" role="alert">{formError}</p> : null}
      </div>

      <div className="sticky bottom-0 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-3" data-testid="food-product-create-actions">
        <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--foreground)] disabled:opacity-50" disabled={isSubmitting} onClick={onCancel} type="button">목록으로</button>
        <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-[var(--foreground)] disabled:opacity-50" disabled={isSubmitting} type="submit">{isSubmitting ? "등록 중…" : "등록하고 선택"}</button>
      </div>
    </form>
  );
}
