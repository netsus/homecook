"use client";

import React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { WebSkeleton } from "@/components/web";

interface CookModeLoadingBoardProps {
  description: string;
  title: string;
}

interface WebCookModeLoadingBoardProps extends CookModeLoadingBoardProps {
  testId: string;
}

interface MobileCookModeLoadingBoardProps extends CookModeLoadingBoardProps {
  loadingTestId: string;
  screenTestId: string;
}

function WebStepSkeleton({ index }: { index: number }) {
  return (
    <div
      className="cook-whole-step cook-whole-step-skeleton"
      data-testid={`cook-mode-step-skeleton-${index + 1}`}
    >
      <div className="cook-whole-step-marker">
        <div className="cook-whole-method-tags">
          <WebSkeleton className="cook-whole-method-tag" height={23} width={52} />
          {index % 2 === 0 ? (
            <WebSkeleton className="cook-whole-method-tag" height={23} width={64} />
          ) : null}
        </div>
      </div>
      <div className="cook-whole-step-main">
        <WebSkeleton className="cook-whole-step-number" height={38} width={38} />
        <div className="cook-whole-step-copy">
          <WebSkeleton height={20} width={index % 2 === 0 ? "92%" : "78%"} />
          <WebSkeleton
            className="mt-2"
            height={16}
            width={index % 2 === 0 ? "64%" : "88%"}
          />
        </div>
      </div>
    </div>
  );
}

function MobileStepSkeleton({ index }: { index: number }) {
  return (
    <div
      className="cook-whole-step cook-whole-step-skeleton"
      data-testid={`cook-mode-step-skeleton-${index + 1}`}
    >
      <div className="cook-whole-step-marker">
        <div className="cook-whole-method-tags">
          <Skeleton
            className="cook-whole-loading-skeleton cook-whole-method-tag"
            height={22}
            rounded="full"
            width={48}
          />
          {index % 2 === 0 ? (
            <Skeleton
              className="cook-whole-loading-skeleton cook-whole-method-tag"
              height={22}
              rounded="full"
              width={56}
            />
          ) : null}
        </div>
      </div>
      <div className="cook-whole-step-main">
        <Skeleton
          className="cook-whole-loading-skeleton cook-whole-step-number"
          height={34}
          rounded="md"
          width={34}
        />
        <div className="cook-whole-step-copy">
          <Skeleton
            className="cook-whole-loading-skeleton"
            height={18}
            rounded="sm"
            width={index % 2 === 0 ? "88%" : "72%"}
          />
          <Skeleton
            className="cook-whole-loading-skeleton mt-2"
            height={14}
            rounded="sm"
            width={index % 2 === 0 ? "58%" : "84%"}
          />
        </div>
      </div>
    </div>
  );
}

export function WebCookModeLoadingBoard({
  description,
  testId,
  title,
}: WebCookModeLoadingBoardProps) {
  return (
    <div
      aria-busy="true"
      className="web-cook-whole-board web-cook-whole-loading-board"
      data-testid={testId}
    >
      <header className="web-cook-whole-top">
        <div className="web-cook-whole-title">
          <WebSkeleton height={22} width="min(58%, 420px)" />
          <WebSkeleton className="mt-2" height={14} width={220} />
        </div>

        <div className="web-cook-whole-actions">
          <WebSkeleton height={38} width={82} />
          <WebSkeleton height={38} width={104} />
        </div>
      </header>

      <div className="cook-whole-board cook-whole-board-desktop web-cook-whole-grid">
        <section className="cook-whole-panel cook-whole-ingredient-panel">
          <WebSkeleton height={18} width={86} />
          <div className="cook-whole-ingredients mt-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <WebSkeleton height={50} key={`ingredient-${index}`} />
            ))}
          </div>
        </section>

        <section className="cook-whole-panel cook-whole-step-panel">
          <WebSkeleton height={18} width={118} />
          <div className="cook-whole-steps mt-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <WebStepSkeleton index={index} key={`step-${index}`} />
            ))}
          </div>
        </section>
      </div>

      <span className="visually-hidden">
        {title}. {description}
      </span>
    </div>
  );
}

export function MobileCookModeLoadingBoard({
  description,
  loadingTestId,
  screenTestId,
  title,
}: MobileCookModeLoadingBoardProps) {
  return (
    <div
      aria-busy="true"
      className="cook-mobile-whole-screen relative h-dvh min-h-dvh overflow-hidden"
      data-cook-theme="dark"
      data-testid={screenTestId}
    >
      <div className="relative flex h-dvh min-h-0 flex-col pb-[92px]">
        <header className="px-4 pb-2 pt-[calc(10px+env(safe-area-inset-top))]">
          <div className="cook-mobile-whole-header-row flex min-h-12 items-center gap-3">
            <Skeleton
              className="cook-whole-loading-skeleton shrink-0"
              height={40}
              rounded="md"
              width={40}
            />
            <div className="min-w-0 flex-1">
              <Skeleton
                className="cook-whole-loading-skeleton"
                height={20}
                rounded="sm"
                width="62%"
              />
              <Skeleton
                className="cook-whole-loading-skeleton mt-2"
                height={14}
                rounded="sm"
                width="44%"
              />
            </div>
          </div>
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-5"
          data-testid={loadingTestId}
        >
          <div className="cook-whole-board cook-whole-board-mobile cook-whole-loading-board-mobile">
            <section className="cook-whole-panel cook-whole-ingredient-panel">
              <Skeleton
                className="cook-whole-loading-skeleton"
                height={18}
                rounded="sm"
                width={86}
              />
              <div className="cook-whole-ingredients mt-3">
                {[96, 118, 88, 132, 104, 84].map((width, index) => (
                  <Skeleton
                    className="cook-whole-loading-skeleton"
                    height={36}
                    key={`ingredient-${index}`}
                    rounded="full"
                    width={width}
                  />
                ))}
              </div>
            </section>

            <section className="cook-whole-panel cook-whole-step-panel">
              <Skeleton
                className="cook-whole-loading-skeleton"
                height={18}
                rounded="sm"
                width={118}
              />
              <div className="cook-whole-steps mt-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <MobileStepSkeleton index={index} key={`step-${index}`} />
                ))}
              </div>
            </section>
          </div>

          <span className="sr-only">
            {title}. {description}
          </span>
        </main>
      </div>

      <div className="cook-mobile-whole-bottom-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-2.5">
          <Skeleton
            className="cook-whole-loading-skeleton"
            height={56}
            rounded="lg"
          />
          <Skeleton
            className="cook-whole-loading-skeleton"
            height={56}
            rounded="lg"
          />
        </div>
      </div>
    </div>
  );
}
