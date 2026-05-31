"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  AppBottomSheet,
  AppCenterDialog,
  AppModalFooterActions,
  AppStepper,
} from "@/components/shared/app-overlay";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import { fetchLeftovers } from "@/lib/api/leftovers";
import type { LeftoverListItemData } from "@/types/leftover";

type LeftoverPickerPresentation = "sheet" | "screen" | "web";

export interface LeftoverPickerProps {
  selectedLeftover: LeftoverListItemData | null;
  isCreating: boolean;
  onLeftoverSelect: (leftover: LeftoverListItemData) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onBack?: () => void;
  onClose: () => void;
  presentation?: LeftoverPickerPresentation;
  slotLabel?: string;
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
    <article className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_2px_10px_var(--shadow-color-soft)]">
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
        className="flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] px-1 text-[13px] font-semibold text-[var(--text-inverse)]"
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

function LeftoverPickerBody({
  errorMessage,
  items,
  loadState,
  onRetry,
  onSelect,
  presentation,
}: {
  errorMessage: string | null;
  items: LeftoverListItemData[];
  loadState: LoadState;
  onRetry: () => void;
  onSelect: (leftover: LeftoverListItemData) => void;
  presentation: LeftoverPickerPresentation;
}) {
  if (loadState === "loading") {
    return (
      <div
        className={
          presentation === "web"
            ? "web-picker-leftover-state"
            : "py-8 text-center text-sm text-[var(--muted)]"
        }
        aria-busy="true"
      >
        남은 요리를 불러오는 중...
      </div>
    );
  }

  if (loadState === "empty") {
    return (
      <div
        className={
          presentation === "web"
            ? "web-picker-leftover-state"
            : "py-8 text-center"
        }
      >
        <p className="text-base font-semibold text-[var(--foreground)]">
          남은 요리가 없어요
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          요리를 완료하면 남은 요리로 추가할 수 있어요.
        </p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div
        className={
          presentation === "web"
            ? "web-menu-add-error"
            : "rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
        }
        role="alert"
      >
        <p>{errorMessage}</p>
        <button
          className={
            presentation === "web"
              ? "web-button web-button-secondary web-button-sm mt-3"
              : "mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--surface)] px-3 py-2 font-semibold"
          }
          onClick={onRetry}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className={presentation === "web" ? "web-picker-leftover-list" : "space-y-3"}>
      {items.map((item) => (
        <LeftoverCard
          key={item.id}
          leftover={item}
          onSelect={onSelect}
        />
      ))}
    </div>
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
      description={`${leftover.recipe_title} 남은 요리`}
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
  onBack,
  onClose,
  presentation = "sheet",
  slotLabel,
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
        error instanceof Error ? error.message : "남은 요리를 불러오지 못했어요.",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void loadLeftovers();
  }, [loadLeftovers]);

  const content = (
    <LeftoverPickerBody
      errorMessage={errorMessage}
      items={items}
      loadState={loadState}
      onRetry={loadLeftovers}
      onSelect={onLeftoverSelect}
      presentation={presentation}
    />
  );

  const servingsModal = selectedLeftover ? (
    <ServingsModal
      isCreating={isCreating}
      leftover={selectedLeftover}
      onCancel={onServingsCancel}
      onConfirm={onServingsConfirm}
    />
  ) : null;

  if (presentation === "screen") {
    return (
      <div
        className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]"
        data-testid="leftover-picker-screen"
      >
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton
            ariaLabel="식사 추가 방식으로 돌아가기"
            onClick={onBack ?? onClose}
            testId="leftover-picker-back"
          />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            남은 요리에서 추가
          </h1>
          <AppBackButtonSpacer />
        </div>

        <section className="px-4 py-4">
          <p className="mb-3 text-[12px] font-medium leading-[1.5] text-[var(--text-2)]">
            플래너에 다시 올릴 남은 요리를 골라주세요
            {slotLabel ? ` · ${slotLabel}` : ""}
          </p>
          {content}
        </section>
        {servingsModal}
        <Wave1MobileBottomTab ariaLabel="남은 요리 추가 하단 탭" currentTab="planner" />
      </div>
    );
  }

  if (presentation === "web") {
    return (
      <section
        aria-label="남은 요리에서 추가"
        className="web-picker-section"
        data-testid="leftover-picker-web"
      >
        <p className="web-picker-subtle">
          플래너에 다시 올릴 남은 요리를 골라주세요
          {slotLabel ? ` · ${slotLabel}` : ""}
        </p>
        {content}
        {servingsModal}
      </section>
    );
  }

  return (
    <>
      <AppBottomSheet
        ariaLabelledBy="leftover-picker-title"
        bodyClassName="pb-5"
        description="플래너에 다시 올릴 남은 요리를 골라주세요"
        leadingAction={
          onBack ? (
            <AppBackButton onClick={onBack} testId="leftover-picker-back" />
          ) : undefined
        }
        onClose={onClose}
        panelClassName="max-w-md"
        title="남은 요리에서 추가"
      >
        {content}
      </AppBottomSheet>

      {servingsModal}
    </>
  );
}
