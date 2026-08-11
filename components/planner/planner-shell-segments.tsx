"use client";

import React, { useRef } from "react";

import type { PlannerShellSegment } from "@/lib/planner/planner-shell-navigation";

const SEGMENTS: Array<{ id: PlannerShellSegment; label: string }> = [
  { id: "plan", label: "요리 계획" },
  { id: "log", label: "식사 기록" },
];

interface PlannerSegmentTabsProps {
  activeSegment: PlannerShellSegment;
  onSelect: (segment: PlannerShellSegment) => void;
}

export function PlannerSegmentTabs({
  activeSegment,
  onSelect,
}: PlannerSegmentTabsProps) {
  const tabRefs = useRef<Record<PlannerShellSegment, HTMLButtonElement | null>>({
    log: null,
    plan: null,
  });

  function selectAndFocus(segment: PlannerShellSegment) {
    onSelect(segment);
    tabRefs.current[segment]?.focus();
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    segment: PlannerShellSegment,
  ) {
    const currentIndex = SEGMENTS.findIndex((item) => item.id === segment);
    let targetIndex: number | null = null;

    if (event.key === "ArrowLeft") {
      targetIndex = (currentIndex - 1 + SEGMENTS.length) % SEGMENTS.length;
    } else if (event.key === "ArrowRight") {
      targetIndex = (currentIndex + 1) % SEGMENTS.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = SEGMENTS.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    selectAndFocus(SEGMENTS[targetIndex].id);
  }

  return (
    <div
      aria-label="플래너 보기"
      className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-1"
      role="tablist"
    >
      {SEGMENTS.map((segment) => {
        const isActive = segment.id === activeSegment;

        return (
          <button
            aria-controls={`planner-${segment.id}-panel`}
            aria-selected={isActive}
            className={[
              "min-h-11 rounded-[calc(var(--radius-control)-4px)] px-4 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2",
              isActive
                ? "bg-[var(--surface)] text-[var(--brand)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-2)]",
            ].join(" ")}
            id={`planner-${segment.id}-tab`}
            key={segment.id}
            onClick={() => onSelect(segment.id)}
            onKeyDown={(event) => handleKeyDown(event, segment.id)}
            ref={(node) => {
              tabRefs.current[segment.id] = node;
            }}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

export function MealLogUnavailableState() {
  return (
    <section
      aria-labelledby="planner-log-tab"
      className="mx-auto flex min-h-[320px] max-w-xl flex-col items-center justify-center px-5 py-14 text-center"
      id="planner-log-panel"
      role="tabpanel"
      tabIndex={0}
    >
      <div
        aria-hidden="true"
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-2xl"
      >
        ◷
      </div>
      <h1
        className="text-xl font-extrabold text-[var(--foreground)]"
        id="planner-log-placeholder-title"
      >
        식사 기록은 준비 중이에요
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">
        현재는 요리 계획만 사용할 수 있어요.
      </p>
    </section>
  );
}
