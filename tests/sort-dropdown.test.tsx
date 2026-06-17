// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SortDropdown } from "@/components/ui/sort-dropdown";

const options = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "name", label: "이름순" },
];

afterEach(() => {
  cleanup();
});

describe("SortDropdown", () => {
  it("renders trigger with selected option label", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    expect(screen.getByText("최신순")).toBeTruthy();
  });

  it("trigger meets 44px minimum touch target", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger.className).toContain("min-h-[var(--control-height-md)]");
  });

  it("opens dropdown on trigger click", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    const trigger = screen.getByRole("button", { expanded: false });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("calls onChange when an option is selected", () => {
    const onChange = vi.fn();
    render(<SortDropdown onChange={onChange} options={options} value="latest" />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByText("인기순"));

    expect(onChange).toHaveBeenCalledWith("popular");
  });

  it("closes dropdown after selection", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.click(screen.getByText("인기순"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes dropdown on Escape key", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("listbox").parentElement!, {
      key: "Escape",
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows checkmark on selected option", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="popular" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    const selectedOption = screen.getByRole("option", { selected: true });
    expect(selectedOption.querySelector("svg")).toBeTruthy();

    const unselectedOptions = screen.getAllByRole("option", { selected: false });
    unselectedOptions.forEach((opt) => {
      expect(opt.querySelector("svg")).toBeNull();
    });
  });

  it("dropdown options meet 44px minimum touch target", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    screen.getAllByRole("option").forEach((option) => {
      expect(option.className).toContain("min-h-[var(--control-height-md)]");
    });
  });

  it("right-aligns the options list to the trigger container", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("listbox").className).toContain("right-0");
  });

  it("uses the accessible Wave1 mint focus ring for keyboard navigation", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    screen.getAllByRole("option").forEach((option) => {
      expect(option.className).toContain("focus:ring-[var(--wave1-mint-contrast)]");
    });
  });

  it("disables trigger when disabled", () => {
    render(
      <SortDropdown disabled onChange={() => {}} options={options} value="latest" />,
    );
    const trigger = screen.getByRole("button");
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it("sets aria-expanded correctly", () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);
    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("supports arrow-key navigation between options", async () => {
    render(<SortDropdown onChange={() => {}} options={options} value="latest" />);

    fireEvent.keyDown(screen.getByRole("button", { expanded: false }), {
      key: "ArrowDown",
    });

    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain("최신순");
    });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain("인기순");
    });

    fireEvent.keyDown(document.activeElement!, { key: "End" });

    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain("이름순");
    });
  });

  it("closes dropdown on outside click", () => {
    render(
      <div>
        <SortDropdown onChange={() => {}} options={options} value="latest" />
        <div data-testid="outside">Outside</div>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
