"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  createFoodProduct,
  isFoodProductApiError,
  updateFoodProduct,
} from "@/lib/api/food-product";
import type { FoodProductDraftContext } from "@/lib/planner/product-planner-return-context";
import {
  FOOD_PRODUCT_BASIS_UNITS,
  FOOD_PRODUCT_MANUAL_BASIS_UNITS,
  type FoodProductBasisUnit,
  type FoodProductCreateInput,
  type FoodProductData,
  type FoodProductNutrientCode,
  type FoodProductPatchInput,
} from "@/types/food-product";

const NUTRIENT_FIELDS: Array<{
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

type FieldKey =
  | "name"
  | "basisAmount"
  | "energy"
  | Exclude<FoodProductNutrientCode, "energy_kcal">;

interface FormDraft {
  name: string;
  brand: string;
  basisAmount: string;
  basisUnit: FoodProductBasisUnit;
  labelBasisText: string;
  energy: string;
  nutrients: Partial<Record<Exclude<FoodProductNutrientCode, "energy_kcal">, string>>;
}

function parseOptionalAmount(value: string) {
  if (value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function formatInitialNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function getInitialDraft(
  initialDraft?: FoodProductDraftContext | null,
  product?: FoodProductData | null,
): FormDraft {
  if (product) {
    const productDraft = {
      name: product.name,
      brand: product.brand ?? "",
      basisAmount: String(product.nutrition.basis.amount),
      basisUnit: product.nutrition.basis.unit,
      labelBasisText: product.nutrition.label_basis_text ?? "",
      energy: formatInitialNumber(
        product.nutrition.values.energy_kcal?.amount ??
          product.nutrition.values.energy_kcal?.known_amount,
      ),
      nutrients: Object.fromEntries(
        NUTRIENT_FIELDS.map(({ code }) => [
          code,
          formatInitialNumber(
            product.nutrition.values[code]?.amount ?? product.nutrition.values[code]?.known_amount,
          ),
        ]),
      ) as FormDraft["nutrients"],
    } satisfies FormDraft;

    if (!initialDraft) {
      return productDraft;
    }

    return {
      ...productDraft,
      name: initialDraft.name,
      brand: initialDraft.brand,
      basisAmount: initialDraft.basisAmount,
      basisUnit: initialDraft.basisUnit,
      labelBasisText: initialDraft.labelBasisText,
      energy: initialDraft.energy,
      nutrients: {
        ...productDraft.nutrients,
        ...initialDraft.nutrients,
      },
    };
  }

  return {
    name: initialDraft?.name ?? "",
    brand: initialDraft?.brand ?? "",
    basisAmount: initialDraft?.basisAmount ?? "100",
    basisUnit: initialDraft?.basisUnit ?? "g",
    labelBasisText: initialDraft?.labelBasisText ?? "",
    energy: initialDraft?.energy ?? "",
    nutrients: initialDraft?.nutrients ?? {},
  };
}

function isLegacyEditableProduct(product: FoodProductData | null | undefined) {
  return Boolean(product?.editable && product.visibility === "private");
}

function isManualBasisUnit(unit: FoodProductBasisUnit): unit is "g" | "ml" {
  return unit === "g" || unit === "ml";
}

export function FoodProductCreateForm({
  initialDraft,
  product = null,
  onCancel,
  onCreated,
  onDirtyChange,
  onUnauthorized,
  onUpdated,
}: {
  initialDraft?: FoodProductDraftContext | null;
  product?: FoodProductData | null;
  onCancel: () => void;
  onCreated?: (product: FoodProductData) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onUnauthorized?: (draft: FoodProductDraftContext) => void;
  onUpdated?: (product: FoodProductData) => void;
}) {
  const mode = product ? "edit" : "create";
  const baseDraft = useMemo(
    () => getInitialDraft(initialDraft, product),
    [initialDraft, product],
  );
  const [name, setName] = useState(baseDraft.name);
  const [brand, setBrand] = useState(baseDraft.brand);
  const [basisAmount, setBasisAmount] = useState(baseDraft.basisAmount);
  const [basisUnit, setBasisUnit] = useState<FoodProductBasisUnit>(baseDraft.basisUnit);
  const [labelBasisText, setLabelBasisText] = useState(baseDraft.labelBasisText);
  const [energy, setEnergy] = useState(baseDraft.energy);
  const [nutrients, setNutrients] = useState<FormDraft["nutrients"]>(baseDraft.nutrients);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const basisRef = useRef<HTMLInputElement>(null);
  const energyRef = useRef<HTMLInputElement>(null);
  const nutrientRefs = useRef<
    Partial<Record<Exclude<FoodProductNutrientCode, "energy_kcal">, HTMLInputElement>>
  >({});

  const draft = useMemo<FoodProductDraftContext>(() => ({
    name,
    brand,
    basisAmount,
    basisUnit,
    labelBasisText,
    energy,
    nutrients,
  }), [basisAmount, basisUnit, brand, energy, labelBasisText, name, nutrients]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseDraft),
    [baseDraft, draft],
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const allowedUnits = useMemo(
    () =>
      mode === "edit" && isLegacyEditableProduct(product)
        ? FOOD_PRODUCT_BASIS_UNITS
        : FOOD_PRODUCT_MANUAL_BASIS_UNITS,
    [mode, product],
  );
  const lockLegacyNutrition = mode === "edit" && isLegacyEditableProduct(product);

  useEffect(() => {
    if (!allowedUnits.some((unit) => unit === basisUnit)) {
      setBasisUnit(allowedUnits[0] ?? "g");
    }
  }, [allowedUnits, basisUnit]);

  function clearFieldError(field: FieldKey) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  function failField(
    field: FieldKey,
    message: string,
    control: HTMLInputElement | null | undefined,
  ) {
    setFieldErrors((current) => ({ ...current, [field]: message }));
    setFormError(null);
    control?.focus();
  }

  function buildNutritionValues() {
    const values: FoodProductCreateInput["nutrition"]["values"] = {
      energy_kcal: Number(energy),
    };
    for (const { code } of NUTRIENT_FIELDS) {
      const parsed = parseOptionalAmount(nutrients[code] ?? "");
      if (parsed === undefined) {
        failField(
          code,
          "비워 두거나 0 이상의 숫자로 입력해 주세요.",
          nutrientRefs.current[code],
        );
        return null;
      }
      if (parsed !== null) values[code] = parsed;
    }
    return values;
  }

  function hasNutritionChanged() {
    return (
      basisAmount !== baseDraft.basisAmount ||
      basisUnit !== baseDraft.basisUnit ||
      labelBasisText !== baseDraft.labelBasisText ||
      energy !== baseDraft.energy ||
      JSON.stringify(nutrients) !== JSON.stringify(baseDraft.nutrients)
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      failField("name", "제품명을 입력해 주세요.", nameRef.current);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "edit" && product && lockLegacyNutrition) {
        const patch: FoodProductPatchInput = {};
        if (name.trim() !== baseDraft.name.trim()) patch.name = name.trim();
        if ((brand.trim() || null) !== (product.brand ?? null)) patch.brand = brand.trim() || null;

        if (Object.keys(patch).length === 0) {
          onCancel();
          return;
        }

        const updated = await updateFoodProduct(product.id, patch);
        onUpdated?.(updated);
        return;
      }

      const parsedBasisAmount = Number(basisAmount);
      const parsedEnergy = Number(energy);
      if (!Number.isFinite(parsedBasisAmount) || parsedBasisAmount <= 0) {
        failField("basisAmount", "영양 계산 기준량은 0보다 커야 해요.", basisRef.current);
        return;
      }
      if (!isManualBasisUnit(basisUnit)) {
        setFormError("이 제품은 허용된 기준 단위만 사용할 수 있어요.");
        return;
      }
      if (energy.trim() === "" || !Number.isFinite(parsedEnergy) || parsedEnergy < 0) {
        failField("energy", "열량은 0 이상의 숫자로 입력해 주세요.", energyRef.current);
        return;
      }

      const values = buildNutritionValues();
      if (!values) return;

      if (mode === "edit" && product) {
        const patch: FoodProductPatchInput = {};
        if (name.trim() !== baseDraft.name.trim()) patch.name = name.trim();
        if ((brand.trim() || null) !== (product.brand ?? null)) patch.brand = brand.trim() || null;
        if (hasNutritionChanged()) {
          patch.nutrition = {
            basis: { amount: parsedBasisAmount, unit: basisUnit },
            label_basis_text: labelBasisText.trim() || null,
            values,
          };
        }

        if (Object.keys(patch).length === 0) {
          onCancel();
          return;
        }

        const updated = await updateFoodProduct(product.id, patch);
        onUpdated?.(updated);
        return;
      }

      const created = await createFoodProduct({
        name: name.trim(),
        brand: brand.trim() || null,
        nutrition: {
          basis: { amount: parsedBasisAmount, unit: basisUnit },
          label_basis_text: labelBasisText.trim() || null,
          values,
        },
      });
      onCreated?.(created);
    } catch (caught) {
      if (isFoodProductApiError(caught) && caught.status === 401 && onUnauthorized) {
        onUnauthorized(draft);
        return;
      }
      setFormError(
        isFoodProductApiError(caught)
          ? caught.message
          : mode === "edit"
            ? "완제품을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."
            : "완제품을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName =
    "min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal outline-none focus:border-[var(--brand-primary)] aria-[invalid=true]:border-[var(--danger)]";
  const publicNotice =
    mode === "create" || product?.visibility === "public";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      data-testid="food-product-create-form"
      noValidate
      onSubmit={handleSubmit}
    >
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 pb-5"
        data-testid="food-product-create-scroll-body"
      >
        <div className="rounded-[var(--radius-card)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] p-4">
          <p className="text-sm font-extrabold text-[var(--foreground)]">
            {publicNotice
              ? "사용자 등록 공동 제품"
              : "비공개 보관 제품"}
          </p>
          {publicNotice ? (
            <>
              <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
                다른 로그인 사용자도 검색하고 식단에 추가할 수 있어요.
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
                등록자만 수정·삭제할 수 있고, 다른 사용자는 읽기와 추가만 가능해요.
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
              비공개 보관 제품은 나에게만 보이고, 공개 공동 목록으로 자동 전환되지 않아요.
            </p>
          )}
          {mode === "edit" ? (
            <p className="mt-2 text-xs leading-5 text-[var(--text-2)]">
              {lockLegacyNutrition
                ? "이 수정은 기존 비공개 보관 제품의 이름과 브랜드만 바꿔요. 영양 정보 버전은 그대로 유지돼요."
                : "이 변경은 새 영양 정보 버전으로 저장되며 기존 식단의 영양 정보는 바뀌지 않아요."}
            </p>
          ) : null}
          {lockLegacyNutrition ? (
            <p className="mt-2 text-xs leading-5 text-[var(--text-2)]">
              기존 비공개 보관 제품은 이름과 브랜드만 수정할 수 있어요. 1회/1팩 영양 기준은 여기서 바꾸지 않아요.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold text-[var(--foreground)]">
            제품명 <span className="sr-only">필수</span>
            <input
              aria-describedby={fieldErrors.name ? "food-product-name-error" : undefined}
              aria-invalid={Boolean(fieldErrors.name)}
              autoComplete="off"
              className={inputClassName}
              disabled={isSubmitting}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                clearFieldError("name");
              }}
              placeholder="예: 플레인 요거트"
              ref={nameRef}
              value={name}
            />
            {fieldErrors.name ? (
              <span
                className="text-xs font-semibold text-[var(--danger)]"
                id="food-product-name-error"
              >
                {fieldErrors.name}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-[var(--foreground)]">
            업체/브랜드 <span className="font-normal text-[var(--text-3)]">선택</span>
            <input
              autoComplete="off"
              className={inputClassName}
              disabled={isSubmitting}
              maxLength={120}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="예: 무먹 식품"
              value={brand}
            />
          </label>
        </div>

        <fieldset className="rounded-[var(--radius-card)] border border-[var(--line)] p-4">
          <legend className="px-1 text-sm font-extrabold text-[var(--foreground)]">
            영양 계산 기준량
          </legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(112px,0.7fr)]">
            <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
              기준량
              <input
                aria-describedby={fieldErrors.basisAmount ? "food-product-basis-error" : undefined}
                aria-invalid={Boolean(fieldErrors.basisAmount)}
                className={inputClassName}
                disabled={isSubmitting || lockLegacyNutrition}
                inputMode="decimal"
                min="0.01"
                onChange={(event) => {
                  setBasisAmount(event.target.value);
                  clearFieldError("basisAmount");
                }}
                ref={basisRef}
                step="any"
                type="number"
                value={basisAmount}
              />
              {fieldErrors.basisAmount ? (
                <span
                  className="text-xs font-semibold text-[var(--danger)]"
                  id="food-product-basis-error"
                >
                  {fieldErrors.basisAmount}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
              단위
              <select
                className={inputClassName}
                disabled={isSubmitting || lockLegacyNutrition}
                onChange={(event) => setBasisUnit(event.target.value as FoodProductBasisUnit)}
                value={basisUnit}
              >
                {allowedUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
            원 라벨 기준량 <span className="font-normal text-[var(--text-3)]">선택</span>
            <input
              className={inputClassName}
              disabled={isSubmitting || lockLegacyNutrition}
              maxLength={120}
              onChange={(event) => setLabelBasisText(event.target.value)}
              placeholder="예: 1회(40g), 1병(190mL)"
              value={labelBasisText}
            />
          </label>
        </fieldset>

        <fieldset className="rounded-[var(--radius-card)] border border-[var(--line)] p-4">
          <legend className="px-1 text-sm font-extrabold text-[var(--foreground)]">
            영양성분
          </legend>
          <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
            열량 (kcal) <span className="sr-only">필수</span>
            <input
              aria-describedby={fieldErrors.energy ? "food-product-energy-error" : undefined}
              aria-invalid={Boolean(fieldErrors.energy)}
              className={inputClassName}
              disabled={isSubmitting || lockLegacyNutrition}
              inputMode="decimal"
              min="0"
              onChange={(event) => {
                setEnergy(event.target.value);
                clearFieldError("energy");
              }}
              placeholder="0도 실제 값이면 입력 가능"
              ref={energyRef}
              step="any"
              type="number"
              value={energy}
            />
            {fieldErrors.energy ? (
              <span
                className="text-xs font-semibold text-[var(--danger)]"
                id="food-product-energy-error"
              >
                {fieldErrors.energy}
              </span>
            ) : null}
          </label>

          <p className="mt-3 text-xs leading-5 text-[var(--text-3)]">
            입력하지 않은 영양성분은 0이 아니라 정보 없음으로 표시돼요.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {NUTRIENT_FIELDS.map(({ code, label, unit }) => (
              <label className="grid gap-1.5 text-xs font-bold text-[var(--text-2)]" key={code}>
                {label} ({unit}) <span className="font-normal text-[var(--text-3)]">선택</span>
                <input
                  aria-describedby={fieldErrors[code] ? `food-product-${code}-error` : undefined}
                  aria-invalid={Boolean(fieldErrors[code])}
                  className={inputClassName}
                  disabled={isSubmitting || lockLegacyNutrition}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => {
                    setNutrients((current) => ({ ...current, [code]: event.target.value }));
                    clearFieldError(code);
                  }}
                  placeholder="모르면 비워 두기"
                  ref={(node) => {
                    if (node) nutrientRefs.current[code] = node;
                  }}
                  step="any"
                  type="number"
                  value={nutrients[code] ?? ""}
                />
                {fieldErrors[code] ? (
                  <span
                    className="text-xs font-semibold text-[var(--danger)]"
                    id={`food-product-${code}-error`}
                  >
                    {fieldErrors[code]}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        {formError ? (
          <p
            className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--danger)]"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
      </div>

      <div
        className="sticky bottom-0 grid shrink-0 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-3"
        data-testid="food-product-create-actions"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <button
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--foreground)] disabled:opacity-50"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          목록으로
        </button>
        <button
          className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-[var(--foreground)] disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? mode === "edit"
              ? "저장 중…"
              : "등록 중…"
            : mode === "edit"
              ? "변경 내용 저장"
              : "등록하고 선택"}
        </button>
      </div>
    </form>
  );
}
