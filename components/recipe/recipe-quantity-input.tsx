"use client";

import React from "react";

import { DecimalInput } from "@/components/shared/decimal-input";
import { recipeRawQuantityLabel, recipeQuantityText } from "@/lib/recipe-quantity-input";
import { formatProductUnit } from "@/lib/planner/product-planner-entry-presentation";
import type { RecipeQuantityInputDraft } from "@/types/recipe";

interface RecipeQuantityInputProps {
  label: string;
  amount: number | null;
  unit: string | null;
  quantityInput?: RecipeQuantityInputDraft | null;
  units: string[];
  enabled: boolean;
  unitDisabled?: boolean;
  toTaste?: boolean;
  onTextChange: (text: string) => void;
  onAmountChange: (amount: number | null) => void;
  onUnitChange: (unit: string) => void;
  onRequestContext?: () => void;
  contextLoading?: boolean;
  contextChanged?: boolean;
}

export function RecipeQuantityInput({ label, amount, unit, quantityInput, units, enabled,
  unitDisabled = false, toTaste = false, onTextChange, onAmountChange, onUnitChange, onRequestContext, contextLoading = false, contextChanged = false }: RecipeQuantityInputProps) {
  const row = { amount, unit, quantity_input: quantityInput };
  const originalInAnotherUnit = quantityInput && quantityInput.raw_unit !== unit;
  const className = "h-11 min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2 text-base text-[var(--foreground)] outline-none focus:border-[var(--brand)]";
  return <div className="min-w-0 space-y-1.5">
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
      {enabled || quantityInput ? <input aria-label={`${label} 수량`} className={className}
        disabled={!enabled && Boolean(quantityInput)} inputMode="decimal" placeholder={toTaste ? "약간" : "사용량"}
        onChange={event => onTextChange(event.target.value)} type="text" value={recipeQuantityText(row)} />
        : <DecimalInput aria-label={`${label} 수량`} className={className} inputMode="decimal"
          placeholder={toTaste ? "약간" : "사용량"} onValueChange={onAmountChange} value={amount} />}
      <select aria-label={`${label} 단위`} className={`${className} px-1`} disabled={unitDisabled || (!enabled && Boolean(quantityInput))}
        onChange={event => onUnitChange(event.target.value)} value={unit ?? ""}>
        <option disabled value="">{toTaste ? "약간" : "단위"}</option>
        {units.map(value => <option key={value} value={value}>{value === "g" || value === "ml" || value === "serving" || value === "package"
          ? formatProductUnit(value) : value}</option>)}
      </select>
    </div>
    {enabled && !toTaste ? <div aria-label={`${label} 분수 선택`} className="flex flex-wrap gap-1">
      {["1/2", "1/3", "1/4", "3/4"].map(value => <button aria-label={`${label} ${value}`} className="min-h-11 min-w-11 rounded-lg border border-[var(--line)] px-1 text-sm"
        key={value} onClick={() => onTextChange(value)} type="button">{value}</button>)}
    </div> : null}
    {originalInAnotherUnit ? <p className="text-xs text-[var(--text-2)]">원입력 {recipeRawQuantityLabel(quantityInput)}</p> : null}
    {onRequestContext && !toTaste ? <button aria-label={`${label} 수량 정보 다시 확인`} className="min-h-11 rounded-lg border border-[var(--line)] px-2 text-xs"
      disabled={contextLoading} onClick={onRequestContext} type="button">{contextLoading ? "수량 정보 확인 중…" : "수량 정보 재확인"}</button> : null}
    {contextChanged ? <p role="status" className="text-xs text-[var(--text-2)]">단위 근거가 바뀌었어요. 원입력을 유지했으니 수량을 직접 다시 입력한 뒤 저장해 주세요.</p> : null}
    {!enabled && quantityInput ? <p className="text-xs text-[var(--text-2)]">수량 입력을 다시 확인해야 해요. 원입력과 분량은 유지돼요.</p> : null}
  </div>;
}
