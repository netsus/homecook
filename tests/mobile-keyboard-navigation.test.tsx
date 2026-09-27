// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomTabs } from "@/components/layout/bottom-tabs";

let viewport: EventTarget & { height: number; scale: number };

function update(action: () => void) {
  act(() => { action(); vi.runOnlyPendingTimers(); });
}

function showKeyboard() {
  viewport.height = 470;
  viewport.dispatchEvent(new Event("resize"));
}

function fixture() {
  return render(<><input aria-label="검색" /><textarea aria-label="메모" /><BottomTabs currentTab="home" /></>);
}

beforeEach(() => {
  vi.useFakeTimers();
  viewport = Object.assign(new EventTarget(), { height: 800, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("innerWidth", 375);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => window.setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mobile keyboard navigation", () => {
  it("hides tabs while typing and scrolling, then restores them when the keyboard closes without blur", () => {
    fixture();
    update(() => screen.getByRole("textbox", { name: "검색" }).focus());
    expect(screen.getByRole("navigation")).toBeTruthy();
    update(showKeyboard);
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => viewport.dispatchEvent(new Event("scroll")));
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => { viewport.height = 800; viewport.dispatchEvent(new Event("resize")); });
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "검색" }));
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("keeps tabs hidden while focus changes or the keyboard is still closing", () => {
    fixture();
    update(() => { screen.getByRole("textbox", { name: "검색" }).focus(); showKeyboard(); });
    update(() => screen.getByRole("textbox", { name: "메모" }).focus());
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => screen.getByRole("textbox", { name: "메모" }).blur());
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => { viewport.height = 800; viewport.dispatchEvent(new Event("resize")); });
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("does not mistake pinch zoom or browser toolbars for a keyboard", () => {
    fixture();
    update(() => {
      screen.getByRole("textbox", { name: "검색" }).focus();
      viewport.height = 400; viewport.scale = 2;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeTruthy();
    update(() => { viewport.height = 710; viewport.scale = 1; viewport.dispatchEvent(new Event("resize")); });
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("handles browsers which also shrink the layout viewport", () => {
    fixture();
    update(() => {
      screen.getByRole("textbox", { name: "검색" }).focus();
      vi.stubGlobal("innerHeight", 470);
      showKeyboard();
    });
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => { vi.stubGlobal("innerHeight", 800); viewport.height = 800; viewport.dispatchEvent(new Event("resize")); });
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("ignores controls that do not request a typing keyboard", () => {
    render(<><input type="checkbox" aria-label="선택" /><input readOnly aria-label="읽기 전용" /><BottomTabs currentTab="home" /></>);
    for (const element of [screen.getByRole("checkbox"), screen.getByRole("textbox")]) {
      update(() => { element.focus(); showKeyboard(); });
      expect(screen.getByRole("navigation")).toBeTruthy();
    }
  });

  it("does not hide tabs for desktop mouse input", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    fixture();
    update(() => { screen.getByRole("textbox", { name: "검색" }).focus(); showKeyboard(); });
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("resets the height baseline on rotation", () => {
    fixture();
    update(() => screen.getByRole("textbox", { name: "검색" }).focus());
    update(() => {
      vi.stubGlobal("innerWidth", 812); vi.stubGlobal("innerHeight", 375);
      viewport.height = 375; window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("falls back to input focus if VisualViewport is unavailable and removes listeners on unmount", () => {
    vi.stubGlobal("visualViewport", null);
    const view = fixture();
    update(() => screen.getByRole("textbox", { name: "메모" }).focus());
    expect(screen.queryByRole("navigation")).toBeNull();
    update(() => screen.getByRole("textbox", { name: "메모" }).blur());
    expect(screen.getByRole("navigation")).toBeTruthy();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
