// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WebTopNav } from "@/components/web/web-top-nav";

describe("WebTopNav service name", () => {
  afterEach(cleanup);

  it("keeps the default non-HOME brand on the short service name only", () => {
    render(<WebTopNav activeId="planner" />);

    const brand = screen.getByRole("link", { name: "무먹" });
    expect(brand.textContent).toBe("무먹");
    expect(screen.queryByText("무엇을 먹든")).toBeNull();
  });

  it("renders an optional supporting service name below the primary name", () => {
    render(
      <WebTopNav
        activeId="home"
        brandSupportingLabel="무엇을 먹든"
      />,
    );

    const brand = screen.getByRole("link", {
      name: "무먹, 무엇을 먹든",
    });
    const primary = within(brand).getByText("무먹");
    const supporting = within(brand).getByText("무엇을 먹든");

    expect(primary.className).toContain("web-topnav-brand-primary");
    expect(supporting.className).toContain("web-topnav-brand-supporting");
    expect(
      primary.compareDocumentPosition(supporting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
