// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { WebDialog, WebModal } from "@/components/web";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ModalHarness({ autoFocus = false, closeDisabled = false }: { autoFocus?: boolean; closeDisabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>모달 열기</button>
      <a href="/terms">배경 이용약관</a>
      {open ? (
        <WebModal closeDisabled={closeDisabled} data-testid="backdrop" onBackdropClick={() => setOpen(false)}>
          <WebDialog aria-labelledby="dialog-title">
            <h2 id="dialog-title">플래너에 추가</h2>
            <button disabled={closeDisabled} onClick={() => setOpen(false)}>닫기</button>
            <input aria-label="인분" autoFocus={autoFocus} />
            <button>추가</button>
          </WebDialog>
        </WebModal>
      ) : null}
    </>
  );
}

describe("WebDialog boundary", () => {
  it("contains Tab in the modal, isolates the background, and restores the invoker after Escape", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const invoker = screen.getByRole("button", { name: "모달 열기" });
    await user.click(invoker);
    const close = screen.getByRole("button", { name: "닫기" });
    const confirm = screen.getByRole("button", { name: "추가" });

    expect(document.activeElement).toBe(close);
    expect(invoker.inert).toBe(true);
    expect(document.querySelector("a")?.getAttribute("aria-hidden")).toBe("true");
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(invoker.inert).not.toBe(true);
    expect(document.querySelector("a")?.getAttribute("aria-hidden")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(invoker));
  });

  it("honors changed saving protection for Escape and backdrop clicks without releasing focus", async () => {
    const user = userEvent.setup();
    const view = render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "모달 열기" }));
    view.rerender(<ModalHarness closeDisabled />);

    await user.keyboard("{Escape}");
    fireEvent.click(screen.getByTestId("backdrop"));
    expect(screen.getByRole("dialog", { name: "플래너에 추가" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(<ModalHarness />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("preserves input autofocus and restores the invoker that was focused before mounting", async () => {
    const user = userEvent.setup();
    render(<ModalHarness autoFocus />);
    const invoker = screen.getByRole("button", { name: "모달 열기" });
    await user.click(invoker);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "인분" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(invoker));
  });

  it("keeps autofocus in a replacement dialog when the old return-focus frame runs", () => {
    const frames: Array<FrameRequestCallback | null> = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = null;
    });
    const content = (replacement: boolean) => (
      <WebModal key={replacement ? "replacement" : "original"} onBackdropClick={vi.fn()}>
        <WebDialog aria-labelledby="replacement-title">
          <h2 id="replacement-title">레시피북 이름 변경</h2>
          <button>닫기</button>
          {replacement ? <input aria-label="레시피북 이름" autoFocus /> : null}
        </WebDialog>
      </WebModal>
    );
    const view = render(content(false));
    view.rerender(content(true));
    const input = screen.getByRole("textbox", { name: "레시피북 이름" });
    expect(document.activeElement).toBe(input);
    act(() => {
      for (const callback of frames) callback?.(0);
    });
    expect(document.activeElement).toBe(input);
  });

  it("focuses the dialog itself when no enabled control is available", () => {
    render(
      <WebModal onBackdropClick={vi.fn()}>
        <WebDialog aria-labelledby="loading-title">
          <h2 id="loading-title">불러오는 중</h2>
          <button disabled>저장 중</button>
        </WebDialog>
      </WebModal>,
    );
    const dialog = screen.getByRole("dialog", { name: "불러오는 중" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(dialog);
  });

  it("wraps backward from the dialog fallback after loading reveals its controls", () => {
    const content = (loading: boolean) => (
      <WebModal onBackdropClick={vi.fn()}>
        <WebDialog aria-labelledby="loading-title">
          <h2 id="loading-title">불러오는 중</h2>
          {loading ? null : <><button>취소</button><button>확인</button></>}
        </WebDialog>
      </WebModal>
    );
    const view = render(content(true));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    view.rerender(content(false));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "확인" }));
  });

  it("closes only the nested dialog and restores focus inside its parent", async () => {
    const user = userEvent.setup();
    const parentClose = vi.fn();
    function NestedHarness() {
      const [nestedOpen, setNestedOpen] = React.useState(false);
      return (
        <WebModal onBackdropClick={parentClose}>
          <WebDialog aria-labelledby="parent-title">
            <h2 id="parent-title">레시피 저장</h2>
            <button>취소</button>
            <button onClick={() => setNestedOpen(true)}>완료 확인 열기</button>
            {nestedOpen ? (
              <WebModal onBackdropClick={() => setNestedOpen(false)}>
                <WebDialog aria-labelledby="child-title">
                  <h2 id="child-title">완료 확인</h2>
                  <button>확인</button>
                </WebDialog>
              </WebModal>
            ) : null}
          </WebDialog>
        </WebModal>
      );
    }
    render(<NestedHarness />);
    const childInvoker = screen.getByRole("button", { name: "완료 확인 열기" });
    await user.click(childInvoker);
    const nested = screen.getByRole("dialog", { name: "완료 확인" });
    expect(document.activeElement).toBe(within(nested).getByRole("button", { name: "확인" }));
    await user.keyboard("{Escape}");
    expect(parentClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "완료 확인" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "레시피 저장" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.activeElement).toBe(childInvoker));
    await user.keyboard("{Escape}");
    expect(parentClose).toHaveBeenCalledOnce();
  });

  it("preserves an explicitly managed boundary and its forwarded ref", () => {
    const onClose = vi.fn();
    const automaticClose = vi.fn();
    function ExplicitHarness() {
      const dialogRef = React.useRef<HTMLDivElement>(null);
      const initialFocusRef = React.useRef<HTMLButtonElement>(null);
      useDialogBoundary({ closeOnEscape: false, dialogRef, initialFocusRef, onClose });
      return (
        <WebModal onBackdropClick={automaticClose}>
          <WebDialog aria-labelledby="explicit-title" manageFocus={false} ref={dialogRef}>
            <h2 id="explicit-title">직접 관리</h2>
            <button>첫 버튼</button>
            <button ref={initialFocusRef}>지정 포커스</button>
          </WebDialog>
        </WebModal>
      );
    }
    render(<ExplicitHarness />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "지정 포커스" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(automaticClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "첫 버튼" }));
  });
});
