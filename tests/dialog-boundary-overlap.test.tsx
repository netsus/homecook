// @vitest-environment jsdom
import React, { useRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
function Dialog({ active, id, priority = 0, onClose = vi.fn() }: { active: boolean; id: string; priority?: number; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBoundary({ active, dialogRef: ref, onClose, priority });
  return <div role="dialog" ref={ref} data-testid={id}><div hidden><button>hidden child</button></div><button data-testid={`${id}-first`}>First</button><div style={{ display: "none" }}><button>hidden css child</button></div><button data-testid={`${id}-last`}>Last</button></div>;
}
afterEach(() => { cleanup(); document.body.style.overflow = ""; });
describe("dialog boundary overlap", () => {
  it("keeps scrolling locked until the last active boundary releases in either order", () => {
    document.body.style.overflow = "auto";
    const view = render(<><Dialog active id="parent" /><Dialog active id="child" /></>);
    expect(document.body.style.overflow).toBe("hidden");
    view.rerender(<><Dialog active={false} id="parent" /><Dialog active id="child" /></>);
    expect(document.body.style.overflow).toBe("hidden");
    view.rerender(<><Dialog active={false} id="parent" /><Dialog active={false} id="child" /></>);
    expect(document.body.style.overflow).toBe("auto");
    view.rerender(<><Dialog active id="parent" /><Dialog active id="child" /></>);
    view.rerender(<><Dialog active id="parent" /><Dialog active={false} id="child" /></>);
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
  it("keeps the confirmation interactive when a lower detail boundary reactivates later", () => {
    const confirmClose = vi.fn();
    const detailClose = vi.fn();
    const view = render(<><Dialog active={false} id="confirmation" priority={120} onClose={confirmClose} /><Dialog active id="detail" onClose={detailClose} /></>);
    view.rerender(<><Dialog active id="confirmation" priority={120} onClose={confirmClose} /><Dialog active={false} id="detail" onClose={detailClose} /></>);
    view.rerender(<><Dialog active id="confirmation" priority={120} onClose={confirmClose} /><Dialog active id="detail" onClose={detailClose} /></>);
    expect(view.getByTestId("confirmation").inert).not.toBe(true);
    expect(view.getByTestId("confirmation").getAttribute("aria-hidden")).toBeNull();
    expect(view.getByTestId("detail").inert).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirmClose).toHaveBeenCalledOnce();
    expect(detailClose).not.toHaveBeenCalled();
    view.rerender(<><Dialog active={false} id="confirmation" priority={120} onClose={confirmClose} /><Dialog active id="detail" onClose={detailClose} /></>);
    expect(view.getByTestId("detail").inert).not.toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(detailClose).toHaveBeenCalledOnce();
  });
  it("does not restore stale inert state when the lower dialog closes before the upper one", () => {
    const view = render(<><Dialog active id="lower" /><Dialog active id="upper" /></>);
    view.rerender(<><Dialog active={false} id="lower" /><Dialog active id="upper" /></>);
    expect(view.getByTestId("upper").inert).not.toBe(true);
    view.rerender(<><Dialog active={false} id="lower" /><Dialog active={false} id="upper" /></>);
    expect(view.getByTestId("upper").inert).not.toBe(true);
    expect(view.getByTestId("lower").inert).not.toBe(true);
    expect(view.getByTestId("lower").getAttribute("aria-hidden")).toBeNull();
  });
  it("restores pre-existing background isolation after all dialogs close", () => {
    const background = document.createElement("div");
    background.inert = true;
    background.setAttribute("aria-hidden", "true");
    document.body.append(background);
    const view = render(<><Dialog active id="lower" /><Dialog active id="upper" /></>);
    view.unmount();
    expect(background.inert).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");
    background.remove();
  });
  it("keeps a nested child on top even when the parent registers afterward", () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    function Parent() {
      const ref = useRef<HTMLDivElement>(null);
      useDialogBoundary({ dialogRef: ref, onClose: parentClose });
      return <div role="dialog" ref={ref}><button>Parent</button><Dialog active id="nested" onClose={childClose} /></div>;
    }
    const view = render(<Parent />);
    expect(view.getByTestId("nested").inert).not.toBe(true);
    expect(document.activeElement).toBe(view.getByTestId("nested-first"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });
  it("skips controls inside hidden ancestors for initial focus and the focus trap", () => {
    const view = render(<Dialog active id="single" />);
    expect(document.activeElement).toBe(view.getByTestId("single-first"));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(view.getByTestId("single-last"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(view.getByTestId("single-first"));
  });
});
