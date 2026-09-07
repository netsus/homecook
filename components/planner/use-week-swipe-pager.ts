"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

const SETTLE_MS = 180;

function pageOffset(rail: HTMLElement, index: number) {
  const page = rail.children.item(index) as HTMLElement | null;
  if (!page) return rail.clientWidth * index;
  // jsdom has no layout and reports every offsetLeft as zero.
  return index > 0 && page.offsetLeft === 0
    ? rail.clientWidth * index
    : page.offsetLeft;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function useWeekSwipePager(startDate: string, onShiftWeek: (days: number) => void | Promise<void>) {
  const railRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactingRef = useRef(false);
  const committingRef = useRef(false);
  const onShiftRef = useRef(onShiftWeek);
  onShiftRef.current = onShiftWeek;
  const weeks = useMemo(() => [-7, 0, 7].map((offset) =>
    Array.from({ length: 7 }, (_, index) => addDays(startDate, offset + index))), [startDate]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const recenter = useCallback(() => {
    clearTimer();
    const rail = railRef.current;
    if (rail && rail.children.length > 1) rail.scrollLeft = pageOffset(rail, 1);
    committingRef.current = false;
  }, [clearTimer]);

  useLayoutEffect(recenter, [recenter, startDate]);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(recenter);
    observer?.observe(rail);
    window.addEventListener("resize", recenter);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", recenter);
      clearTimer();
    };
  }, [clearTimer, recenter]);

  function settle() {
    clearTimer();
    if (interactingRef.current || committingRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const rail = railRef.current;
      if (!rail || rail.clientWidth <= 0 || interactingRef.current || committingRef.current) return;
      const pages = [...rail.children] as HTMLElement[];
      const page = pages.reduce((closest, _item, index) => (
        Math.abs(pageOffset(rail, index) - rail.scrollLeft)
          < Math.abs(pageOffset(rail, closest) - rail.scrollLeft)
          ? index
          : closest
      ), 0);
      if (page === 1) return;
      committingRef.current = true;
      // Reset the physical page before loading. The reset's scroll event is not another gesture.
      rail.scrollLeft = pageOffset(rail, 1);
      const result = onShiftRef.current(page > 1 ? 7 : -7);
      if (result && typeof result.then === "function") {
        // A rejected load may leave the range unchanged. It must not lock out the next gesture.
        void result.then(recenter, recenter);
      }
    }, SETTLE_MS);
  }

  function beginInteraction() {
    interactingRef.current = true;
    clearTimer();
  }
  function endInteraction() {
    interactingRef.current = false;
    settle();
  }

  return { railRef, weeks, handlers: {
    onScroll: settle,
    onPointerDown: beginInteraction, onPointerUp: endInteraction,
    onPointerCancel: endInteraction, onPointerLeave: endInteraction,
    onTouchStart: beginInteraction, onTouchEnd: endInteraction, onTouchCancel: endInteraction,
  } };
}
