// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

function DialogHarness({
  closeOnEscape = true,
  onClose,
}: {
  closeOnEscape?: boolean;
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  useDialogBoundary({
    closeOnEscape,
    dialogRef,
    initialFocusRef: cancelRef,
    onClose,
  });

  return (
    <div>
      <button type="button">배경 버튼</button>
      <div aria-labelledby="dialog-title" role="alertdialog" ref={dialogRef} tabIndex={-1}>
        <h2 id="dialog-title">테스트 다이얼로그</h2>
        <button ref={cancelRef} type="button">취소</button>
        <button type="button">확인</button>
      </div>
    </div>
  );
}

afterEach(cleanup);

describe("useDialogBoundary", () => {
  it("does not close on Escape while a Korean composition is active", () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses after locking the background without scrolling the page", () => {
    const calls: Array<{ options?: FocusOptions; overflow: string }> = [];
    const original = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      calls.push({ options, overflow: document.body.style.overflow });
      original.call(this, options);
    });
    render(<DialogHarness onClose={vi.fn()} />);
    expect(calls[0]).toEqual({ options: { preventScroll: true }, overflow: "hidden" });
    spy.mockRestore();
  });
  it("closes on Escape by default", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<DialogHarness onClose={onClose} />);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when closeOnEscape is false", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<DialogHarness closeOnEscape={false} onClose={onClose} />);
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "테스트 다이얼로그" })).toBeTruthy();
  });

  it("blocks Escape from reaching external keydown listeners when closeOnEscape is false", async () => {
    const onClose = vi.fn();
    const externalDocumentListener = vi.fn();
    const externalWindowListener = vi.fn();
    render(<DialogHarness closeOnEscape={false} onClose={onClose} />);

    const cancelButton = screen.getByRole("button", { name: "취소" });

    document.addEventListener("keydown", externalDocumentListener, true);
    window.addEventListener("keydown", externalWindowListener);
    try {
      fireEvent.keyDown(cancelButton, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
      expect(externalDocumentListener).not.toHaveBeenCalled();
      expect(externalWindowListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", externalDocumentListener, true);
      window.removeEventListener("keydown", externalWindowListener);
    }
  });
});
