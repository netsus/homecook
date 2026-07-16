"use client";

import React from "react";

import {
  formatProductExpectedEnergy,
  formatProductQuantity,
} from "@/lib/planner/product-planner-entry-presentation";
import type { MealProductPlannerEntryData } from "@/types/product-planner-entry";

export function ProductPlannerEntryCard({
  entry,
  isPending,
  onDelete,
  onEditQuantity,
  variant = "app",
}: {
  entry: MealProductPlannerEntryData;
  isPending: boolean;
  onDelete: () => void;
  onEditQuantity: () => void;
  variant?: "app" | "web";
}) {
  const expectedEnergy = formatProductExpectedEnergy(
    entry.nutrition.values.energy_kcal,
  );

  return (
    <article
      aria-label={`${entry.product_name} 완제품 계획`}
      className={[
        "relative min-w-0 rounded-[var(--radius-card)] border border-[var(--brand-primary-border)] bg-[var(--surface)] p-4 shadow-[0_1px_3px_var(--shadow-color-subtle)]",
        variant === "web" ? "web-product-planner-entry" : "",
        isPending ? "opacity-60" : "",
      ].join(" ")}
      data-testid={`product-planner-entry-${entry.id}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-[var(--brand-primary-soft)] px-2 py-1 text-[11px] font-extrabold text-[var(--brand-primary-text)]">
            완제품
          </span>
          <h2 className="mt-1 truncate text-[16px] font-extrabold text-[var(--foreground)]">
            {entry.product_name}
          </h2>
          {entry.product_brand ? (
            <p className="truncate text-[12px] text-[var(--text-3)]">
              {entry.product_brand}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap gap-x-1 text-[13px] font-semibold text-[var(--text-2)]">
            <span>{formatProductQuantity(entry.quantity)} ·</span>
            <span>{expectedEnergy}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 text-[13px] font-bold text-[var(--foreground)] disabled:opacity-50"
          disabled={isPending}
          onClick={onEditQuantity}
          type="button"
        >
          수량 변경
        </button>
        <button
          aria-label={`${entry.product_name} 완제품 계획 삭제`}
          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 text-[13px] font-bold text-[var(--danger-strong)] disabled:opacity-50"
          disabled={isPending}
          onClick={onDelete}
          type="button"
        >
          삭제
        </button>
      </div>
    </article>
  );
}
