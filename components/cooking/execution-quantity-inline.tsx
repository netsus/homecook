"use client";

import React, { useRef, useState } from "react";
import { parseQuantityInput } from "@/lib/quantity-input";
import type { CookingModeIngredient } from "@/types/cooking";
import styles from "./cook-mode-layout.module.css";

export type ExecutionQuantityChange = { row_index: number; amount: number | null; unit: string | null };

export { executionQuantityText } from "@/lib/cooking/execution-quantity-presentation";
import { executionQuantityText } from "@/lib/cooking/execution-quantity-presentation";

export function ExecutionQuantityInline({ ingredient, index, onClose, onSave }: {
  ingredient: CookingModeIngredient;
  index: number;
  onClose: (reason?: "blur") => void;
  onSave: (changes: ExecutionQuantityChange[]) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() => executionQuantityText(ingredient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const name = ingredient.standard_name;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = parseQuantityInput(amount);
    if (!parsed || parsed.amount > 1000000) {
      setError("0보다 큰 양이나 분수(예: 1/3)를 입력해 주세요.");
      input.current?.focus();
      return;
    }
    if (parsed.amount === ingredient.amount) { onClose(); return; }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave([{ row_index: index, amount: parsed.amount, unit: ingredient.unit }]);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "반영하지 못했어요. Enter로 다시 시도해 주세요.");
      input.current?.focus();
    } finally { pending.current = false; setSaving(false); }
  }

  return <form aria-label={`${name} 수량 수정`} aria-busy={saving} className={`${styles.quantityEditor} cook-whole-ingredient-amount`} onSubmit={event => void save(event)} onKeyDown={event => {
    if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
    if (event.key === "Escape" && !pending.current) { event.stopPropagation(); onClose(); }
  }}>
    <input aria-label={`${name} 양`} aria-describedby={`quantity-unit-${index} quantity-hint-${index}${error ? ` quantity-error-${index}` : ""}`} aria-invalid={Boolean(error)} autoFocus className={styles.quantityInput} enterKeyHint="done" inputMode="text" readOnly={saving} ref={input} type="text" value={amount}
      style={{ width: `${Math.max(3, Math.min(amount.length + 1, 12))}ch` }}
      onBlur={() => { if (!pending.current) onClose("blur"); }} onFocus={event => event.currentTarget.select()}
      onChange={event => { setAmount(event.target.value); setError(null); }} />
    <span id={`quantity-unit-${index}`}>{ingredient.unit}</span>
    <span className="sr-only" id={`quantity-hint-${index}`}>{saving ? "반영 중" : "Enter로 반영, Escape 또는 입력창 밖을 눌러 취소"}</span>
    {error ? <span className={styles.quantityError} id={`quantity-error-${index}`} role="alert">{error}</span> : null}
  </form>;
}
