// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecimalInput } from "@/components/shared/decimal-input";

afterEach(cleanup);
function Editor({ changed, initial = 0 }: { changed: (value: number | null) => void; initial?: number }) {
  const [value, setValue] = useState<number | null>(initial);
  return <DecimalInput aria-label="수량" min="0" step="any" className="existing-quantity-style" value={value}
    onValueChange={(next) => { changed(next); setValue(next); }} />;
}

describe("decimal editing", () => {
  it("lets a user replace zero with 12.5 without restoring zero or dropping the decimal point", async () => {
    const changed = vi.fn(); const user = userEvent.setup();
    render(<Editor changed={changed} />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "수량" });
    await user.clear(input);
    expect(input.value).toBe("");
    expect(changed).toHaveBeenLastCalledWith(null);
    await user.type(input, "12.");
    expect(input.value).toBe("12.");
    await user.type(input, "5");
    expect(input.value).toBe("12.5");
    expect(changed).toHaveBeenLastCalledWith(12.5);
    expect(input.min).toBe("0");
    expect(input.className).toBe("existing-quantity-style");
    expect(input.inputMode).toBe("decimal");
  });

  it("keeps an explicitly entered zero and leaves an incomplete decimal empty in the numeric draft", async () => {
    const changed = vi.fn(); const user = userEvent.setup();
    render(<Editor changed={changed} initial={2} />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "수량" });
    await user.clear(input); await user.type(input, ".");
    expect(input.value).toBe("."); expect(changed).toHaveBeenLastCalledWith(null);
    await user.clear(input); await user.type(input, "0.0");
    expect(input.value).toBe("0.0"); expect(changed).toHaveBeenLastCalledWith(0);
    await user.tab(); expect(input.value).toBe("0");
  });

  it("reflects an external unit conversion and preserves a pending disabled input", async () => {
    const changed = vi.fn(); const user = userEvent.setup();
    const view = render(<DecimalInput aria-label="수량" value={1} onValueChange={changed} />);
    view.rerender(<DecimalInput aria-label="수량" value={1000} onValueChange={changed} disabled />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "수량" });
    expect(input.value).toBe("1000");
    await user.type(input, "2");
    expect(input.value).toBe("1000"); expect(changed).not.toHaveBeenCalled();
  });
});
