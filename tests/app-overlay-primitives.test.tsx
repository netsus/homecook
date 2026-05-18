// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppBottomSheet,
  AppCenterDialog,
  AppConfirmDialog,
  AppModalFooterActions,
  AppPickerSheet,
  AppStepper,
} from "@/components/shared/app-overlay";

describe("app overlay primitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a bottom sheet with one shared mobile overlay anatomy", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <AppBottomSheet
        ariaLabelledBy="test-bottom-sheet-title"
        description="공용 설명"
        onClose={handleClose}
        title="공용 바텀시트"
      >
        <p>본문</p>
      </AppBottomSheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "공용 바텀시트" });

    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(within(dialog).getByText("공용 설명")).toBeTruthy();
    expect(dialog.querySelector("[data-app-overlay-handle]")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders center dialogs and footer actions from the same overlay family", async () => {
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <AppCenterDialog
        ariaLabelledBy="test-center-dialog-title"
        onClose={handleCancel}
        title="확인"
      >
        <p>진행할까요?</p>
        <AppModalFooterActions
          confirmLabel="진행"
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      </AppCenterDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "확인" });

    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("center-dialog");
    expect(dialog.querySelector("[data-app-modal-footer]")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "진행" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps stepper controls the same fixed touch size", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AppStepper
        label="인분"
        min={1}
        onChange={handleChange}
        unit="인분"
        value={2}
      />,
    );

    const minus = screen.getByRole("button", { name: "인분 줄이기" });
    const plus = screen.getByRole("button", { name: "인분 늘리기" });

    expect(minus.getAttribute("data-app-stepper-control")).toBe("decrement");
    expect(plus.getAttribute("data-app-stepper-control")).toBe("increment");
    expect(minus.className).toContain("h-11");
    expect(minus.className).toContain("w-11");
    expect(plus.className).toContain("h-11");
    expect(plus.className).toContain("w-11");

    await user.click(minus);
    await user.click(plus);

    expect(handleChange).toHaveBeenNthCalledWith(1, 1);
    expect(handleChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("keeps plan-named picker and confirm shells as shared aliases", () => {
    render(
      <>
        <AppPickerSheet
          ariaLabelledBy="picker-title"
          onClose={vi.fn()}
          title="피커"
        >
          <p>목록</p>
        </AppPickerSheet>
        <AppConfirmDialog
          ariaLabelledBy="confirm-title"
          onClose={vi.fn()}
          title="확인"
        >
          <p>확인 내용</p>
        </AppConfirmDialog>
      </>,
    );

    expect(
      screen
        .getByRole("dialog", { name: "피커" })
        .getAttribute("data-app-overlay-shell"),
    ).toBe("bottom-sheet");
    expect(
      screen
        .getByRole("dialog", { name: "확인" })
        .getAttribute("data-app-overlay-shell"),
    ).toBe("center-dialog");
  });
});
