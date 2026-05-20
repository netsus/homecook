"use client";

import Link from "next/link";
import React from "react";

import { AppBottomSheet } from "@/components/shared/app-overlay";

export type MealAddPickerMode =
  | "search"
  | "recipebook"
  | "pantry"
  | "leftover"
  | "youtube";
export type MealAddRouteMode = "youtube" | "manual";

interface MealAddOptionsSheetProps {
  title: string;
  onClose: () => void;
  onPickerSelect: (mode: MealAddPickerMode) => void;
  routeHrefFor: (mode: MealAddRouteMode) => string;
  testId?: string;
}

const PICKER_OPTIONS: Array<{
  id: MealAddPickerMode;
  icon: string;
  label: string;
}> = [
  { id: "recipebook", icon: "📖", label: "레시피북에서 추가" },
  { id: "pantry", icon: "🧊", label: "팬트리 기반 추천" },
  { id: "leftover", icon: "🍱", label: "남은요리에서 추가" },
];

const OPTION_TILE_CLASS =
  "flex min-h-[58px] items-center gap-2.5 rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white px-3 text-left text-[13px] font-semibold leading-[1.25] text-[#212529]";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function OptionButton({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={OPTION_TILE_CLASS}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <span className="text-[20px]" aria-hidden="true">
        {icon}
      </span>
      <span className="leading-[1.25]">{label}</span>
    </button>
  );
}

export function MealAddOptionsSheet({
  title,
  onClose,
  onPickerSelect,
  routeHrefFor,
  testId,
}: MealAddOptionsSheetProps) {
  return (
    <AppBottomSheet
      ariaLabelledBy="meal-add-options-title"
      bodyClassName="pb-6"
      onClose={onClose}
      panelClassName="max-w-[480px]"
      testId={testId}
      title={title}
    >
      <button
        className="mb-4 flex min-h-[var(--control-height-md)] w-full items-center gap-2 rounded-[var(--radius-control)] bg-[#F8F9FA] px-3 text-left text-[14px] text-[#495057]"
        data-testid="meal-add-option-search"
        onClick={() => onPickerSelect("search")}
        type="button"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center text-[#495057]"
          aria-hidden="true"
        >
          <SearchIcon className="h-6 w-6" />
        </span>
        <span>레시피 검색</span>
      </button>

      <div className="grid grid-cols-2 gap-2.5">
        {PICKER_OPTIONS.map((option) => (
          <OptionButton
            icon={option.icon}
            key={option.id}
            label={option.label}
            onClick={() => onPickerSelect(option.id)}
            testId={`meal-add-option-${option.id}`}
          />
        ))}

        <button
          className={OPTION_TILE_CLASS}
          data-testid="meal-add-option-youtube"
          onClick={() => onPickerSelect("youtube")}
          type="button"
        >
          <span className="text-[20px]" aria-hidden="true">
            🎬
          </span>
          <span className="leading-[1.25]">유튜브에서 가져오기</span>
        </button>

        <Link
          className={OPTION_TILE_CLASS}
          data-testid="meal-add-option-manual"
          href={routeHrefFor("manual")}
          onClick={onClose}
        >
          <span className="text-[20px]" aria-hidden="true">
            ✏️
          </span>
          <span className="leading-[1.25]">직접 등록</span>
        </Link>
      </div>
    </AppBottomSheet>
  );
}
