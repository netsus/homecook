// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppHeader } from "@/components/layout/app-header";

describe("AppHeader service name", () => {
  afterEach(cleanup);

  it("keeps non-HOME shared headers on the short service name only", () => {
    render(<AppHeader currentTab="planner" />);

    const brand = screen.getByRole("link", { name: "무먹 홈" });
    expect(brand.textContent).toBe("무먹");
    expect(screen.queryByText("무엇을 먹든")).toBeNull();
  });
});
