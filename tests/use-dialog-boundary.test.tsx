// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

function BoundaryHarness({
  closeOnEscape = true,
  onClose,
}: {
  closeOnEscape?: boolean;
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  useDialogBoundary({
    closeOnEscape,
    dialogRef,
    onClose,
  });

  return (
    <div
      aria-label="dialog boundary harness"
      aria-modal="true"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <button type="button">확인</button>
    </div>
  );
}

describe("useDialogBoundary", () => {
  afterEach(() => {
    cleanup();
  });

  it("closes on Escape by default", () => {
    const onClose = vi.fn();
    render(<BoundaryHarness onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when closeOnEscape is false", () => {
    const onClose = vi.fn();
    render(<BoundaryHarness closeOnEscape={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "dialog boundary harness" })).toBeTruthy();
  });
});
