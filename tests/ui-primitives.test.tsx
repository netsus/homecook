// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModalFooterActions } from "@/components/shared/modal-footer-actions";
import { ModalHeader } from "@/components/shared/modal-header";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { OptionRow } from "@/components/shared/option-row";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("renders primary variant by default", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain("bg-[var(--wave1-mint-contrast)]");
  });

  it("renders secondary variant with border", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("border");
    expect(btn.className).toContain("text-[var(--wave1-mint-contrast)]");
  });

  it("renders neutral variant", () => {
    render(<Button variant="neutral">Neutral</Button>);
    const btn = screen.getByRole("button", { name: "Neutral" });
    expect(btn.className).toContain("bg-[var(--wave1-surface-fill)]");
  });

  it("renders destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("text-[var(--wave1-surface)]");
    expect(btn.className).toContain("bg-[var(--wave1-red-contrast)]");
    expect(btn.className).toContain("hover:bg-[var(--wave1-red-contrast-deep)]");
  });

  it("sm size meets 44px minimum touch target", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button", { name: "Small" });
    expect(btn.className).toContain("min-h-[var(--control-height-sm)]");
  });

  it("shows loading spinner and hides content", () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });

  it("disables button when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.className).toContain("cursor-not-allowed");
  });

  it("applies fullWidth class", () => {
    render(<Button fullWidth>Full</Button>);
    const btn = screen.getByRole("button", { name: "Full" });
    expect(btn.className).toContain("w-full");
  });
});

describe("Chip", () => {
  it("renders filter chip in inactive state", () => {
    render(<Chip label="Korean" />);
    const btn = screen.getByRole("button", { name: "Korean" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toContain("bg-[var(--wave1-surface-subtle)]");
  });

  it("renders filter chip in active state with dark bg", () => {
    render(<Chip active label="Korean" variant="filter" />);
    const btn = screen.getByRole("button", { name: "Korean" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("bg-[var(--wave1-ink)]");
    expect(btn.className).toContain("font-bold");
  });

  it("renders selection chip in active state with Wave1 mint bg", () => {
    render(<Chip active label="Popular" variant="selection" />);
    const btn = screen.getByRole("button", { name: "Popular" });
    expect(btn.className).toContain("bg-[var(--wave1-mint-contrast)]");
  });

  it("applies 44px minimum touch target", () => {
    render(<Chip label="Touch" />);
    const btn = screen.getByRole("button", { name: "Touch" });
    expect(btn.className).toContain("min-h-[var(--chip-height-lg)]");
  });

  it("renders disabled state", () => {
    render(<Chip disabled label="Off" />);
    const btn = screen.getByRole("button", { name: "Off" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.className).toContain("cursor-not-allowed");
  });
});

describe("Card", () => {
  it("renders with default styling", () => {
    render(<Card>Content</Card>);
    const el = screen.getByText("Content");
    expect(el.className).toContain("rounded-[var(--radius-lg)]");
    expect(el.className).toContain("bg-[var(--wave1-surface)]");
    expect(el.className).toContain("shadow-[var(--wave1-shadow-deep)]");
  });

  it("adds cursor-pointer and hover effects when interactive", () => {
    render(<Card interactive>Click me</Card>);
    const el = screen.getByText("Click me");
    expect(el.className).toContain("cursor-pointer");
    expect(el.className).toContain("hover:shadow-[var(--wave1-shadow-crisp)]");
  });

  it("adds pulse animation when loading", () => {
    render(<Card loading>Loading</Card>);
    const el = screen.getByText("Loading");
    expect(el.className).toContain("animate-pulse");
  });

  it("renders as article tag", () => {
    render(<Card as="article">Article</Card>);
    const el = screen.getByText("Article");
    expect(el.tagName.toLowerCase()).toBe("article");
  });
});

describe("Badge", () => {
  it("renders brand variant by default", () => {
    render(<Badge>New</Badge>);
    const el = screen.getByText("New");
    expect(el.className).toContain("bg-[var(--wave1-mint-soft)]");
  });

  it("renders olive variant with Wave1 success accent", () => {
    render(<Badge variant="olive">Active</Badge>);
    const el = screen.getByText("Active");
    expect(el.className).toContain("text-[var(--wave1-teal-contrast)]");
  });

  it("renders muted variant", () => {
    render(<Badge variant="muted">Info</Badge>);
    const el = screen.getByText("Info");
    expect(el.className).toContain("bg-[var(--wave1-surface-fill)]");
  });

  it("uses the shared badge radius", () => {
    render(<Badge>Pill</Badge>);
    const el = screen.getByText("Pill");
    expect(el.className).toContain("rounded-[var(--radius-badge)]");
  });
});

describe("Modal shared primitives", () => {
  it("renders ModalHeader with fixed prototype text and close treatment", () => {
    const onClose = vi.fn();
    render(
      <ModalHeader
        description="Helper copy"
        onClose={onClose}
        title="플래너에 추가"
      />,
    );

    const heading = screen.getByRole("heading", { name: "플래너에 추가" });
    expect(heading.className).toContain("text-[var(--wave1-ink)]");
    expect(heading.className).not.toContain("tracking-[");

    const closeButton = screen.getByRole("button", { name: "닫기" });
    expect(closeButton.className).toContain("text-[var(--wave1-text-2)]");
    expect(closeButton.querySelector("span")?.className).toContain(
      "bg-[var(--wave1-surface-fill)]",
    );
  });

  it("renders ModalFooterActions with mint primary and neutral cancel hierarchy", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ModalFooterActions
        confirmLabel="추가"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "추가" });

    expect(cancel.className).toContain("border-[var(--wave1-border)]");
    expect(cancel.className).toContain("text-[var(--wave1-text-2)]");
    expect(confirm.className).toContain("bg-[var(--wave1-mint-contrast)]");

    fireEvent.click(cancel);
    fireEvent.click(confirm);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("SelectionChipRail", () => {
  it("renders selected pill chips with Wave1 mint state", () => {
    const onSelect = vi.fn();

    render(
      <SelectionChipRail
        chips={[
          { label: "전체", value: "all" },
          { label: "채소", value: "veg" },
        ]}
        onSelect={onSelect}
        selectedValue="veg"
      />,
    );

    const selected = screen.getByRole("button", { name: "채소" });
    expect(selected.className).toContain("border-[var(--wave1-mint)]");
    expect(selected.className).toContain("bg-[var(--wave1-mint-soft)]");
    expect(selected.className).toContain("text-[var(--wave1-mint-contrast)]");
  });
});

describe("OptionRow", () => {
  it("renders selected rows with Wave1 surface and mint checkmark", () => {
    render(<OptionRow isSelected label="최신순" onClick={() => {}} />);

    const row = screen.getByRole("option", { name: "최신순", selected: true });
    expect(row.className).toContain("border-[var(--wave1-border)]");
    expect(row.className).toContain("bg-[var(--wave1-surface)]");
    expect(row.className).toContain("text-[var(--wave1-ink)]");
    expect(row.querySelector("svg")?.getAttribute("class")).toContain(
      "text-[var(--wave1-mint-contrast)]",
    );
  });
});

describe("NumericStepperCompact", () => {
  it("uses Wave1 controls and emits bounded value changes", () => {
    const onChange = vi.fn();

    render(
      <NumericStepperCompact
        min={1}
        onChange={onChange}
        unit="인분"
        value={2}
      />,
    );

    const decrease = screen.getByRole("button", { name: "인분 줄이기" });
    const increase = screen.getByRole("button", { name: "인분 늘리기" });

    expect(decrease.querySelector("span")?.className).toContain(
      "border-[var(--wave1-border)]",
    );
    expect(increase.querySelector("span")?.className).toContain(
      "bg-[var(--wave1-ink)]",
    );

    fireEvent.click(decrease);
    fireEvent.click(increase);
    expect(onChange).toHaveBeenNthCalledWith(1, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 3);
  });
});

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState description="Try adding something" title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByText("Try adding something")).toBeTruthy();
  });

  it("renders default icon when no custom icon", () => {
    render(<EmptyState title="Empty" />);
    const svg = document.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders action button when action is provided", () => {
    const onClick = vi.fn();
    render(<EmptyState action={{ label: "Add item", onClick }} title="Empty" />);
    const btn = screen.getByRole("button", { name: "Add item" });
    expect(btn).toBeTruthy();
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("ErrorState", () => {
  it("renders default error title", () => {
    render(<ErrorState />);
    expect(screen.getByText("문제가 발생했어요")).toBeTruthy();
  });

  it("renders custom title and message", () => {
    render(<ErrorState message="Server error" title="Oops" />);
    expect(screen.getByText("Oops")).toBeTruthy();
    expect(screen.getByText("Server error")).toBeTruthy();
  });

  it("renders retry button and calls callback", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: "다시 시도" });
    btn.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders custom retry label", () => {
    render(<ErrorState onRetry={() => {}} retryLabel="Reload" />);
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("renders with pulse animation", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("animate-pulse");
  });

  it("applies width and height as style", () => {
    const { container } = render(<Skeleton height={40} width={200} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("40px");
  });

  it("applies rounded variant", () => {
    const { container } = render(<Skeleton rounded="full" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain("rounded-[var(--radius-full)]");
  });
});
