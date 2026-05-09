// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(btn.className).toContain("bg-[var(--brand)]");
  });

  it("renders secondary variant with border", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("border");
    expect(btn.className).toContain("text-[var(--brand)]");
  });

  it("renders neutral variant", () => {
    render(<Button variant="neutral">Neutral</Button>);
    const btn = screen.getByRole("button", { name: "Neutral" });
    expect(btn.className).toContain("bg-[var(--surface-fill)]");
  });

  it("renders destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("text-[var(--surface)]");
  });

  it("sm size meets 44px minimum touch target", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button", { name: "Small" });
    expect(btn.className).toContain("min-h-[44px]");
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
    expect(btn.className).toContain("bg-[var(--surface-subtle)]");
  });

  it("renders filter chip in active state with dark bg", () => {
    render(<Chip active label="Korean" variant="filter" />);
    const btn = screen.getByRole("button", { name: "Korean" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toContain("bg-[var(--foreground)]");
    expect(btn.className).toContain("font-bold");
  });

  it("renders selection chip in active state with brand bg", () => {
    render(<Chip active label="Popular" variant="selection" />);
    const btn = screen.getByRole("button", { name: "Popular" });
    expect(btn.className).toContain("bg-[var(--brand)]");
  });

  it("applies 44px minimum touch target", () => {
    render(<Chip label="Touch" />);
    const btn = screen.getByRole("button", { name: "Touch" });
    expect(btn.className).toContain("min-h-[44px]");
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
    expect(el.className).toContain("shadow-[var(--shadow-2)]");
  });

  it("adds cursor-pointer and hover effects when interactive", () => {
    render(<Card interactive>Click me</Card>);
    const el = screen.getByText("Click me");
    expect(el.className).toContain("cursor-pointer");
    expect(el.className).toContain("hover:shadow-[var(--shadow-3)]");
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
    expect(el.className).toContain("bg-[var(--brand-soft)]");
  });

  it("renders olive variant", () => {
    render(<Badge variant="olive">Active</Badge>);
    const el = screen.getByText("Active");
    expect(el.className).toContain("text-[var(--olive)]");
  });

  it("renders muted variant", () => {
    render(<Badge variant="muted">Info</Badge>);
    const el = screen.getByText("Info");
    expect(el.className).toContain("bg-[var(--surface-fill)]");
  });

  it("uses pill shape radius", () => {
    render(<Badge>Pill</Badge>);
    const el = screen.getByText("Pill");
    expect(el.className).toContain("rounded-[var(--radius-full)]");
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
