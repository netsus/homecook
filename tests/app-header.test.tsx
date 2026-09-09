// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppHeader } from "@/components/layout/app-header";

describe("AppHeader service name", () => {
  afterEach(cleanup);

  it("uses the same official horizontal logo as desktop navigation", () => {
    render(<AppHeader currentTab="planner" />);

    const brand = screen.getByRole("link", { name: "무먹, 무엇을 먹든" });
    expect(brand.textContent).toBe("");

    const logo = brand.querySelector("img");
    expect(logo).not.toBeNull();
    expect(decodeURIComponent(logo?.getAttribute("src") ?? "")).toContain(
      "/brand/mumeok-logo-horizontal.png",
    );
    expect(logo?.getAttribute("srcset")).toContain("256w");
    expect(logo?.getAttribute("sizes")).toBe("(min-width: 1024px) 174px, 138px");
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
  });
});
