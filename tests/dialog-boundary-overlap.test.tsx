// @vitest-environment jsdom
import React, { useRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
function Dialog({ active, id }: { active: boolean; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBoundary({ active, dialogRef: ref, onClose: vi.fn() });
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
  it("skips controls inside hidden ancestors for initial focus and the focus trap", () => {
    const view = render(<Dialog active id="single" />);
    expect(document.activeElement).toBe(view.getByTestId("single-first"));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(view.getByTestId("single-last"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(view.getByTestId("single-first"));
  });
});
