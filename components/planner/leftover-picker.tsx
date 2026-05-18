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

function formatCookedAt(dateStr: string) {
  const date = new Date(dateStr);

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function LeftoverCard({
  leftover,
  onSelect,
}: {
  leftover: LeftoverListItemData;
  onSelect: (leftover: LeftoverListItemData) => void;
}) {
  return (
    <article className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-3">
        {leftover.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-14 w-14 shrink-0 rounded-[12px] object-cover"
            height={56}
            src={leftover.recipe_thumbnail_url}
            unoptimized
            width={56}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-fill)]">
            <span className="text-xl" aria-hidden="true">
              🍲
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-[var(--foreground)]">
            {leftover.recipe_title}
          </h3>
          <p className="text-sm text-[var(--muted)]">
            {formatCookedAt(leftover.cooked_at)} 요리
          </p>
        </div>
      </div>
      <button
        className="mt-3 h-11 w-full rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(leftover)}
        type="button"
      >
        선택
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
        title="남은요리 선택"
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
            className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            <p>{errorMessage}</p>
            <button
              className="mt-3 rounded-[10px] border border-red-300 bg-white px-3 py-2 font-semibold"
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
