"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import {
  AppBottomSheet,
  AppCenterDialog,
  AppModalFooterActions,
  AppStepper,
} from "@/components/shared/app-overlay";
import { fetchLeftovers } from "@/lib/api/leftovers";
import type { LeftoverListItemData } from "@/types/leftover";

export interface LeftoverPickerProps {
  selectedLeftover: LeftoverListItemData | null;
  isCreating: boolean;
  onLeftoverSelect: (leftover: LeftoverListItemData) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "empty" | "error";

function formatCompactDate(dateStr: string) {
  const date = new Date(dateStr);
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${m}/${d}`;
}

function formatLeftoverMeta(leftover: LeftoverListItemData) {
  const datePart = formatCompactDate(leftover.cooked_at);
  const mealLabel = leftover.source_meal_label?.trim() || "끼니 미상";
  const servings =
    leftover.source_planned_servings ?? leftover.cooking_servings;
  const servingsPart =
    typeof servings === "number" && servings > 0 ? `${servings}인분` : "인분 미상";

  return `${datePart} ${mealLabel} ${servingsPart}`;
}

function LeftoverCard({
  leftover,
  onSelect,
}: {
  leftover: LeftoverListItemData;
  onSelect: (leftover: LeftoverListItemData) => void;
}) {
  return (
    <article className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      {leftover.recipe_thumbnail_url ? (
        <Image
          alt=""
          className="h-12 w-12 shrink-0 rounded-[var(--radius-card)] object-cover"
          height={48}
          src={leftover.recipe_thumbnail_url}
          unoptimized
          width={48}
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--surface-fill)]">
          <span className="text-lg" aria-hidden="true">
            🍲
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-bold text-[var(--foreground)]">
          {leftover.recipe_title}
        </h3>
        <p className="text-[12px] text-[var(--muted)]">
          {formatLeftoverMeta(leftover)}
        </p>
      </div>
      <button
        className="flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] px-1 text-[13px] font-semibold text-white"
        onClick={() => onSelect(leftover)}
        type="button"
      >
        <span className="flex h-8 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-3 hover:bg-[var(--brand-deep)]">
          추가
        </span>
      </button>
    </article>
  );
}

function ServingsModal({
  leftover,
  isCreating,
  onConfirm,
  onCancel,
}: {
  leftover: LeftoverListItemData;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
}) {
  const [servings, setServings] = useState(1);

  const handleConfirm = useCallback(() => {
    if (servings < 1) return;
    onConfirm(servings);
  }, [onConfirm, servings]);

  return (
    <AppCenterDialog
      ariaLabelledBy="leftover-servings-title"
      closeDisabled={isCreating}
      description={`${leftover.recipe_title} 남은요리`}
      footer={
        <AppModalFooterActions
          cancelDisabled={isCreating}
          confirmDisabled={isCreating || servings < 1}
          confirmLabel={isCreating ? "추가 중..." : "추가"}
          onCancel={onCancel}
          onConfirm={handleConfirm}
        />
      }
      onClose={onCancel}
      title="계획 인분 입력"
    >
      <AppStepper
        disabled={isCreating}
        label="계획 인분"
        min={1}
        onChange={setServings}
        unit="인분"
        value={servings}
      />
    </AppCenterDialog>
  );
}

export function LeftoverPicker({
  selectedLeftover,
  isCreating,
  onLeftoverSelect,
  onServingsConfirm,
  onServingsCancel,
  onClose,
}: LeftoverPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<LeftoverListItemData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLeftovers = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    try {
      const data = await fetchLeftovers("leftover");
      setItems(data.items);
      setLoadState(data.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      setItems([]);
      setErrorMessage(
        error instanceof Error ? error.message : "남은요리를 불러오지 못했어요.",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadLeftovers();
  }, [loadLeftovers]);

  return (
    <>
      <AppBottomSheet
        ariaLabelledBy="leftover-picker-title"
        bodyClassName="pb-5"
        description="플래너에 다시 올릴 남은요리를 골라주세요"
        onClose={onClose}
        panelClassName="max-w-md"
        title="남은 요리에서 추가"
      >
        {loadState === "loading" ? (
          <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
            남은요리를 불러오는 중...
          </div>
        ) : null}

        {loadState === "empty" ? (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              남은요리가 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              요리를 완료하면 남은요리로 추가할 수 있어요.
            </p>
          </div>
        ) : null}

        {loadState === "error" ? (
          <div
            className="rounded-[var(--radius-card)] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            <p>{errorMessage}</p>
            <button
              className="mt-3 rounded-[var(--radius-control)] border border-red-300 bg-white px-3 py-2 font-semibold"
              onClick={loadLeftovers}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {loadState === "ready" ? (
          <div className="space-y-3">
            {items.map((item) => (
              <LeftoverCard
                key={item.id}
                leftover={item}
                onSelect={onLeftoverSelect}
              />
            ))}
          </div>
        ) : null}
      </AppBottomSheet>

      {selectedLeftover ? (
        <ServingsModal
          isCreating={isCreating}
          leftover={selectedLeftover}
          onCancel={onServingsCancel}
          onConfirm={onServingsConfirm}
        />
      ) : null}
    </>
  );
}
