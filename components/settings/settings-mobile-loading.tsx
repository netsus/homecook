"use client";

import React from "react";

import { Skeleton } from "@/components/ui/skeleton";

export const SETTINGS_MOBILE_MAIN_CLASS =
  "space-y-3 px-4 pb-[calc(28px+env(safe-area-inset-bottom))] pt-4";

export const SETTINGS_MOBILE_SECTION_CLASS =
  "rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4";

export function SettingsMobileColumnLoadingContent() {
  return (
    <>
      <div className="grid grid-cols-1 gap-2" data-testid="columns-loading">
        {[0, 1, 2].map((index) => (
          <div
            className="settings-column-row grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-2"
            data-testid="settings-mobile-column-loading-row"
            key={index}
          >
            <Skeleton className="h-10 w-8 rounded-[var(--radius-control)]" />
            <Skeleton className="h-10 min-w-0 rounded-[var(--radius-control)]" />
            <div className="flex shrink-0 items-start gap-1">
              <div className="grid gap-1">
                <Skeleton className="h-[18px] w-7 rounded-[var(--radius-control)]" />
                <Skeleton className="h-[18px] w-7 rounded-[var(--radius-control)]" />
              </div>
              <Skeleton className="h-9 w-9 rounded-[var(--radius-control)]" />
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_104px]"
        data-testid="settings-mobile-column-add-loading"
      >
        <Skeleton className="h-10 min-w-0 rounded-[var(--radius-control)]" />
        <Skeleton className="h-10 rounded-[var(--radius-control)]" />
      </div>
      <Skeleton
        className="mt-2 h-9 w-full max-w-[320px] min-[430px]:h-4"
        data-testid="settings-mobile-column-help-loading"
      />
    </>
  );
}

export function SettingsMobileToggleLoadingRow() {
  return (
    <div className="flex min-h-[57px] items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-[20px] w-36" />
        <Skeleton className="mt-1 h-4 w-full max-w-[260px]" />
      </div>
      <Skeleton className="h-7 w-11 rounded-full" />
    </div>
  );
}

export function SettingsMobileAccountLoadingCard() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex min-h-[60px] w-full items-center gap-3 border-b border-[var(--surface-subtle)] px-4 text-left">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <Skeleton className="h-[19px] w-28" />
          <Skeleton className="mt-1 h-4 w-20" />
        </span>
      </div>
      <div className="flex min-h-[59px] w-full items-center justify-between px-4">
        <span className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-[19px] w-20" />
        </span>
        <Skeleton className="h-[18px] w-3" />
      </div>
    </div>
  );
}

export function SettingsMobileDangerLoadingContent() {
  return (
    <div>
      <Skeleton className="h-[19px] w-20" />
      <Skeleton className="mt-2 h-4 w-full max-w-[300px]" />
      <Skeleton className="mt-1 h-4 w-56 max-w-full" />
      <Skeleton className="mt-3 h-10 w-28 rounded-[var(--radius-control)]" />
    </div>
  );
}
