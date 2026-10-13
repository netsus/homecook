// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionConfirmation } from "@/components/shared/action-confirmation";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { showActionConfirmation, useActionConfirmationStore } from "@/stores/ui-store";

let frames: Map<number, FrameRequestCallback>;
let previousPath: string;

function flushFrames() {
  act(() => {
    while (frames.size) {
      const pending = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of pending) callback(0);
    }
  });
}

function DestinationDialog() {
  const ref = React.useRef<HTMLDivElement>(null);
  useDialogBoundary({ dialogRef: ref, priority: 150, onClose: vi.fn() });
  return <div ref={ref} role="dialog" aria-label="도착 페이지 작업"><button>새 작업 닫기</button></div>;
}

beforeEach(() => {
  previousPath = window.location.pathname;
  frames = new Map();
  let frameId = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  useActionConfirmationStore.getState().dismiss();
});

afterEach(() => {
  cleanup();
  useActionConfirmationStore.getState().dismiss();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", previousPath);
});

describe("action confirmation caller focus", () => {
  it("clears an optional caller ref when a message-only confirmation replaces it and when dismissed", () => {
    const ref = { current: document.createElement("button") };
    showActionConfirmation("플래너에 추가했어요", ref);
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBe(ref);
    showActionConfirmation("레시피를 저장했어요");
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
    useActionConfirmationStore.getState().dismiss();
    expect(useActionConfirmationStore.getState().message).toBeNull();
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
  });

  it.each([true, false])("does not return to an older caller after a message-only replacement (flushWhileOpen=%s)", (flushWhileOpen) => {
    render(<><button>옛 플래너 버튼</button><ActionConfirmation /></>);
    const opener = screen.getByRole("button", { name: "옛 플래너 버튼" });
    act(() => showActionConfirmation("플래너에 추가했어요", { current: opener }));
    act(() => showActionConfirmation("레시피를 저장했어요"));
    if (flushWhileOpen) flushFrames();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    flushFrames();
    expect(document.activeElement).not.toBe(opener);
    expect(document.body.style.overflow).toBe("");
    expect(opener.inert).not.toBe(true);
    expect(opener.closest("[aria-hidden='true']")).toBeNull();
  });

  it("does not restore a connected old caller after the destination pathname changes", () => {
    window.history.replaceState({}, "", "/recipe/focus-test");
    render(<><button>옛 플래너 버튼</button><ActionConfirmation /></>);
    const opener = screen.getByRole("button", { name: "옛 플래너 버튼" });
    act(() => showActionConfirmation("플래너에 추가했어요", { current: opener }));
    flushFrames();
    window.history.replaceState({}, "", "/planner");
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    flushFrames();
    expect(document.activeElement).not.toBe(opener);
    expect(document.body.style.overflow).toBe("");
    expect(opener.inert).not.toBe(true);
    expect(opener.closest("[aria-hidden='true']")).toBeNull();
  });

  it("restores only the newest caller when the same success message replaces another", () => {
    render(<><button>첫 플래너 버튼</button><button>다음 플래너 버튼</button><ActionConfirmation /></>);
    const first = screen.getByRole("button", { name: "첫 플래너 버튼" });
    const next = screen.getByRole("button", { name: "다음 플래너 버튼" });
    const firstFocus = vi.spyOn(first, "focus");
    act(() => showActionConfirmation("플래너에 추가했어요", { current: first }));
    act(() => showActionConfirmation("플래너에 추가했어요", { current: next }));
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    flushFrames();
    expect(document.activeElement).toBe(next);
    expect(firstFocus).not.toHaveBeenCalled();
  });

  it("does not restore a disconnected caller onto the destination page", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    render(<><button>새 페이지 작업</button><ActionConfirmation /></>);
    act(() => showActionConfirmation("플래너에 추가했어요", { current: opener }));
    flushFrames();
    opener.remove();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    const destination = screen.getByRole("button", { name: "새 페이지 작업" });
    destination.focus();
    flushFrames();
    expect(document.activeElement).toBe(destination);
  });

  it("keeps a destination dialog's initial focus and isolation when an older return guard rejects", () => {
    window.history.replaceState({}, "", "/recipe/focus-test");
    const view = render(<><button>옛 플래너 버튼</button><ActionConfirmation /></>);
    const opener = screen.getByRole("button", { name: "옛 플래너 버튼" });
    act(() => showActionConfirmation("플래너에 추가했어요", { current: opener }));
    window.history.replaceState({}, "", "/planner");
    act(() => useActionConfirmationStore.getState().dismiss());
    view.rerender(<><button>옛 플래너 버튼</button><ActionConfirmation /><DestinationDialog /></>);
    const destination = screen.getByRole("button", { name: "새 작업 닫기" });
    flushFrames();
    expect(document.activeElement).toBe(destination);
    expect(document.body.style.overflow).toBe("hidden");
    expect(destination.closest("[inert], [aria-hidden='true']")).toBeNull();
    view.rerender(<><button>옛 플래너 버튼</button><ActionConfirmation /></>);
    flushFrames();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "옛 플래너 버튼" }).inert).not.toBe(true);
  });
});
