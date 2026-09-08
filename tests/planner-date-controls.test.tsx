// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlannerDateControls } from "@/components/planner/planner-date-controls";
afterEach(cleanup);
it("uses the bright official brand accent for the today action", () => {
  render(<PlannerDateControls date="2026-09-01" today="2026-09-06" onDateSelect={vi.fn()} />);
  expect(screen.getByRole("button", { name: "오늘" }).className)
    .toContain("bg-[var(--brand-accent)]");
  expect(screen.getByRole("button", { name: "오늘" }).className)
    .toContain("text-[var(--text-inverse)]");
});
it("selects a previous month day immediately and closes without a native input or confirmation", async () => {
  const onDateSelect=vi.fn();
  render(<PlannerDateControls date="2026-09-06" today="2026-09-06" onDateSelect={onDateSelect} />);
  fireEvent.click(screen.getByRole("button",{name:"달력에서 날짜 선택"}));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(document.querySelector('input')).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"이전 달"}));
  fireEvent.click(screen.getByRole("button",{name:"2026년 8월 1일"}));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(()=>expect(onDateSelect).toHaveBeenCalledWith("2026-08-01"));
  expect(onDateSelect).toHaveBeenCalledTimes(1);
  expect(document.body.style.overflow).not.toBe("hidden");
});
it("supports month/year jumps and cancelling without changing the date", async () => {
  const onDateSelect=vi.fn();
  render(<PlannerDateControls date="2026-09-06" today="2026-09-06" onDateSelect={onDateSelect} />);
  const trigger=screen.getByRole("button",{name:"달력에서 날짜 선택"});trigger.focus();fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button",{name:"월 선택"}));
  fireEvent.click(screen.getByRole("button",{name:"연도 선택"}));
  fireEvent.click(screen.getByRole("button",{name:"2024년"}));
  fireEvent.click(screen.getByRole("button",{name:"2월"}));
  expect(screen.getByRole("button",{name:"2024년 2월 29일"})).toBeTruthy();
  fireEvent.keyDown(document,{key:"Escape"});
  await waitFor(()=>expect(document.activeElement).toBe(trigger));
  expect(onDateSelect).not.toHaveBeenCalled();
});
it("moves focus across month boundaries with keyboard and selects with one click", async () => {
  const onDateSelect=vi.fn();
  render(<PlannerDateControls date="2026-09-01" today="2026-09-06" onDateSelect={onDateSelect} />);
  fireEvent.click(screen.getByRole("button",{name:"달력에서 날짜 선택"}));
  const day=screen.getByRole("button",{name:"2026년 9월 1일"});day.focus();fireEvent.keyDown(day,{key:"ArrowLeft"});
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole("button",{name:"2026년 8월 31일"})));
  fireEvent.click(document.activeElement!);
  await waitFor(()=>expect(onDateSelect).toHaveBeenCalledWith("2026-08-31"));
});
