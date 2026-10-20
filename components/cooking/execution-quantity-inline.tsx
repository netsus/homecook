"use client";

import React, { useRef, useState } from "react";
import { parseQuantityInput } from "@/lib/quantity-input";
import type { CookingModeIngredient } from "@/types/cooking";

export type ExecutionQuantityChange = { row_index: number; amount: number | null; unit: string | null };

export { executionQuantityText } from "@/lib/cooking/execution-quantity-presentation";
import { executionQuantityText } from "@/lib/cooking/execution-quantity-presentation";

export function ExecutionQuantityInline({ ingredient, index, onClose, onSave }: {
  ingredient: CookingModeIngredient;
  index: number;
  onClose: () => void;
  onSave: (changes: ExecutionQuantityChange[]) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() => executionQuantityText(ingredient));
  const [unit, setUnit] = useState(ingredient.unit ?? "g");
  const [unknown, setUnknown] = useState(ingredient.amount === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const name = ingredient.standard_name;
  const units = [...new Set([ingredient.unit ?? "g", "g", "kg", "ml", "L"])];

  function changeUnit(next: string) {
    const factors: Record<string, { kind: string; factor: number }> = {
      g: { kind: "mass", factor: 1 }, kg: { kind: "mass", factor: 1000 },
      ml: { kind: "volume", factor: 1 }, mL: { kind: "volume", factor: 1 }, L: { kind: "volume", factor: 1000 },
    };
    const before = factors[unit], after = factors[next], parsed = parseQuantityInput(amount);
    setAmount(before && after && before.kind === after.kind && parsed
      ? String(parsed.amount * before.factor / after.factor) : "");
    setUnit(next);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = unknown ? null : parseQuantityInput(amount);
    if (!unknown && (!parsed || parsed.amount > 1000000)) {
      setError("0보다 큰 양이나 분수(예: 1/3)를 입력해 주세요.");
      input.current?.focus();
      return;
    }
    const nextAmount = parsed?.amount ?? null;
    const nextUnit = unknown ? ingredient.unit : unit;
    if (nextAmount === ingredient.amount && nextUnit === ingredient.unit) { onClose(); return; }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave([{ row_index: index, amount: nextAmount, unit: nextUnit }]);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally { pending.current = false; setSaving(false); }
  }

  return <form aria-label={`${name} 수량 수정`} className="col-span-full mt-2 min-w-0 space-y-2 text-sm" onSubmit={event => void save(event)} onKeyDown={event => {
    if (event.key === "Escape" && !pending.current) { event.stopPropagation(); onClose(); }
  }}>
    <fieldset disabled={saving} className="min-w-0 space-y-2">
      <div className="flex gap-2">
        <input aria-label={`${name} 양`} aria-describedby={error ? `quantity-error-${index}` : undefined} aria-invalid={Boolean(error)} autoFocus className="min-h-11 min-w-0 w-full rounded-lg border border-current bg-transparent p-2" disabled={unknown} inputMode="text" ref={input} type="text" value={amount} onChange={event => setAmount(event.target.value)} />
        <select aria-label={`${name} 단위`} className="min-h-11 max-w-24 rounded-lg border border-current bg-[#17232f] p-2 text-white" disabled={unknown} value={unit} onChange={event => changeUnit(event.target.value)}>{units.map(value => <option key={value}>{value}</option>)}</select>
      </div>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />양 미확인</label>
      <p>이번 요리의 영양과 예상무게에 반영해요.</p>
      {error ? <p id={`quantity-error-${index}`} role="alert">{error}</p> : null}
      <div className="flex gap-2"><button className="min-h-11 flex-1 rounded-lg bg-[var(--brand-primary)] px-3 text-white" type="submit">{saving ? "저장 중…" : "저장"}</button><button className="min-h-11 rounded-lg border border-current px-3" type="button" onClick={onClose}>취소</button></div>
    </fieldset>
  </form>;
}
